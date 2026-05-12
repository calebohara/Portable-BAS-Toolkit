# SyncAgents — Global ↔ Local Projects Parity Plan

**Date:** 2026-05-12
**Team:** SyncAgents (4 agents — see `.claude/SyncAgents.md`)
**Goal:** Bring Global Projects to feature + data parity with local Projects, and route them through the existing offline-first `SyncManager` so they behave like first-class synced entities.
**Direction chosen by stakeholder:** Parity (keep two models, fill the gaps). The alternative options (Unify into one table, or Hybrid with shared schema + split UI) were considered and rejected for this round.

---

## 1. Audit summary — where the two stores diverge today

### 1.1 Project-level field diff

| Local `Project` field | Global `GlobalProject` field | Status |
|---|---|---|
| `id` | `id` | OK |
| `name` | `name` | OK |
| `customerName` | `jobSiteName` | **MISMATCH** — different names, different semantics. `migrate.ts` line 178 sets `jobSiteName = customerName \|\| name`. Reverse mapping at line 351 sets `customerName = jobSiteName`. Lossy if the user actually distinguishes them. |
| `siteAddress` | `siteAddress` | OK |
| `buildingArea` | `buildingArea` | OK |
| `projectNumber` | `projectNumber` | OK |
| `technicianNotes` | `description` | **NAMED DIFFERENTLY + LOSSY** — `migrate.ts` line 164–167 *concatenates* `technicianNotes + panelRosterSummary` into `description`. On reverse import, the whole blob lands back in `technicianNotes` and `panelRosterSummary` is gone. |
| `tags` | `tags` | OK |
| `status` | `status` | OK |
| `createdAt` / `updatedAt` | `createdAt` / `updatedAt` | OK |
| `contacts` (Contact[]) | — | **MISSING from global** |
| `panelRosterSummary` | folded into `description` | **MISSING from global** |
| `networkSummary` | — | **MISSING from global** |
| `isPinned` | — | **MISSING from global** (would be per-user) |
| `isOfflineAvailable` | — | **MISSING from global** (would be per-user) |
| — | `accessCode` | global-only, intentional |
| — | `createdBy` | global-only, intentional |
| — | `memberCount`, `role` | global-only joins, intentional |

### 1.2 Child-entity coverage

| Child entity | Local table | Global table | UI on global page? |
|---|---|---|---|
| Notes | `field_notes` | `global_field_notes` | ✅ |
| Files | `project_files` | `global_project_files` | ✅ |
| Devices | `devices` | `global_devices` | ✅ |
| IP Plan | `ip_plan` | `global_ip_plan` | ✅ |
| Daily Reports | `daily_reports` | `global_daily_reports` | ✅ |
| Activity Log | `activity_log` | `global_activity_log` | ✅ |
| Network Diagrams | `network_diagrams` | `global_network_diagrams` | **❌ table exists, no UI tab** |
| PPCL Documents | `ppcl_documents` | — | **❌ missing** |
| Terminal Logs | `terminal_session_logs` | — | **❌ missing** |
| PID Tuning | `pid_tuning_sessions` | — | **❌ missing** |
| Psych Sessions | `psych_sessions` | — | **❌ missing** |
| Register Calcs | `register_calculations` | — | **❌ missing** |
| Ping Sessions | `ping_sessions` | — | **❌ missing** |
| Trend Sessions | `trend_sessions` | — | **❌ missing** |
| Connection Profiles | `connection_profiles` | — | **❌ missing** |
| Field Panels | `field_panels` | — | **❌ missing** |
| Notepad Entries | `project_notepad_entries` | — | **❌ missing** |
| Messages | — | `global_messages` (+ reads, replies) | global-only, intentional |
| Members | — | `global_project_members` | global-only, intentional |

### 1.3 Sync-engine alignment

The local side uses an offline-first pipeline in `src/lib/sync/sync-manager.ts`:

1. **Push** — mutations write to IndexedDB → enqueue in `sync_queue` → `SyncManager` drains queue to Supabase using `toSupabaseRow` from `field-map.ts`.
2. **Pull** — periodic + on-demand pull from Supabase → `fromSupabaseRow` → write to IndexedDB → `onPullComplete` notifies hooks via `sync-bridge.ts`.
3. **Soft delete** — every local table has `deleted_at` + `sync_version`.

Global Projects do **none** of this. `lib/global-projects/api.ts` is a direct-Supabase wrapper called from `useGlobalProject*` hooks that subscribe to Postgres Realtime. Consequences today:

- Edits made offline on a Global Project are lost (no queue).
- No IndexedDB cache → opening a Global Project with no network shows nothing.
- `field-map.ts` has zero entries for `global_*` tables — the `SyncEntityType` union doesn't even include them.
- `migrate.ts` is one-shot copy with new UUIDs each call → you can't "re-sync" a global project back into your local project after a teammate updates it; you'd get a second, duplicate local project.

### 1.4 Things that get silently dropped on round-trip

Tracing the lossy path through `src/lib/global-projects/migrate.ts`:

| Source field | Lost when… | Why |
|---|---|---|
| `Project.contacts` | local → global | no destination |
| `Project.networkSummary` | local → global | no destination |
| `Project.isPinned`, `isOfflineAvailable` | local → global | no per-user destination |
| `Project.panelRosterSummary` | global → local round-trip | folded into `description`, can't be unfolded |
| `FieldNote.author` | global → local | replaced with hard-coded `'User'` (line 381) |
| `DeviceEntry.{status, createdAt}` | global → local | only partially mapped (`status` falls back to `'Not Commissioned'`) |
| `ProjectFile.*` (entire entity) | both directions | `migrate.ts` doesn't touch files at all |
| `PpclDocument`, `TerminalSessionLog`, sessions, panels | both directions | no global table to migrate to |
| All IDs | always | new UUIDs are generated on every migration → no identity, no idempotent re-sync |

---

## 2. Target architecture (Parity option)

```
                          ┌─────────────────────────┐
                          │   IndexedDB (Dexie)     │
                          │   ─ projects            │
                          │   ─ globalProjects      │ ← NEW Dexie stores
                          │   ─ field_notes etc.    │
                          │   ─ global_* mirrors    │ ← NEW Dexie stores
                          │   ─ sync_queue          │
                          └────────────┬────────────┘
                                       │
                       ┌───────────────┴───────────────┐
                       │       SyncManager             │
                       │   push  ─►  Supabase (REST)   │
                       │   pull  ◄─  Supabase (REST)   │
                       │   realtime ◄─ Supabase (WS)   │ ← global tables
                       └───────────────┬───────────────┘
                                       │
                                       ▼
                  ┌────────────────────────────────────┐
                  │              Postgres              │
                  │  ┌──────────────┐  ┌─────────────┐ │
                  │  │ projects     │  │ global_*    │ │
                  │  │ field_notes  │  │ (full set)  │ │
                  │  │ ... (15+)    │  │             │ │
                  │  └──────────────┘  └─────────────┘ │
                  └────────────────────────────────────┘
```

Key principles:

1. **Two tables per entity** — `field_notes` (private, user_id) and `global_field_notes` (shared, global_project_id + RLS). No table merging. This preserves the existing RLS model (per-user vs membership) and avoids touching the existing local-projects code path.
2. **One sync engine** — `SyncManager` learns about global tables via new `SyncEntityType` values (`globalNotes`, `globalDevices`, …) so push/pull/queue/soft-delete logic is reused, not forked.
3. **Stable IDs across migration** — `migrate.ts` becomes a reconcile keyed by UUID. Sharing a local project to global keeps the same `id` on the global side, so the local row gains a `synced_global_id` pointer and future updates round-trip without duplication.
4. **Per-user preferences split out** — `isPinned`, `isOfflineAvailable`, last-viewed-tab, etc. move to a new `global_project_preferences (user_id, global_project_id, …)` table because they're per-member, not per-project.
5. **Realtime for both** — for global tables, `SyncManager` subscribes to `postgres_changes` on each `global_*` table and writes incoming rows directly to the IndexedDB mirror (same path as a pull).

---

## 3. Database changes — migrations

All migrations go in `supabase/migrations/` following the existing naming. Order matters.

### 3.1 `add-global-project-parity-fields.sql`

```sql
-- Extend global_projects with the fields that exist on local projects.
alter table global_projects
  add column if not exists customer_name text not null default '',
  add column if not exists technician_notes text not null default '',
  add column if not exists panel_roster_summary text,
  add column if not exists network_summary text,
  add column if not exists contacts jsonb not null default '[]',
  add column if not exists sync_version int not null default 1;

-- Existing global_projects.description stays — it's not the same as technician_notes.
-- migrate.ts will be updated to map description ↔ description (new field), technicianNotes ↔ technician_notes.
```

### 3.2 `add-global-project-preferences.sql`

```sql
-- Per-user preferences on a global project (pinned, offline-cached, …).
create table if not exists global_project_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  global_project_id uuid not null references global_projects(id) on delete cascade,
  is_pinned boolean not null default false,
  is_offline_available boolean not null default false,
  last_viewed_tab text,
  preferences jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, global_project_id)
);

alter table global_project_preferences enable row level security;
create policy "Users can manage their own global project preferences"
  on global_project_preferences for all using (auth.uid() = user_id);

create trigger global_project_preferences_updated_at
  before update on global_project_preferences
  for each row execute function set_updated_at();

create index if not exists idx_gp_prefs_user on global_project_preferences(user_id);
create index if not exists idx_gp_prefs_project on global_project_preferences(global_project_id);
```

### 3.3 `add-sync-columns-global-children.sql`

```sql
-- Add sync_version to every global_* child table that's missing it
-- (deleted_at is already present everywhere).
alter table global_field_notes      add column if not exists sync_version int not null default 1;
alter table global_devices          add column if not exists sync_version int not null default 1;
alter table global_ip_plan          add column if not exists sync_version int not null default 1;
alter table global_daily_reports    add column if not exists sync_version int not null default 1;
alter table global_project_files    add column if not exists sync_version int not null default 1;
alter table global_network_diagrams add column if not exists sync_version int not null default 1;

-- global_activity_log is append-only — no sync_version needed.
```

### 3.4 `add-global-child-tables.sql`

One migration per new entity family (or one big file — author's call). Pattern for each (using PPCL as the worked example):

```sql
create table if not exists global_ppcl_documents (
  id uuid primary key default gen_random_uuid(),
  global_project_id uuid not null references global_projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  name text not null default '',
  content text not null default '',
  firmware text not null default 'pxc-tc',
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table global_ppcl_documents enable row level security;
create policy "Members can view global PPCL"   on global_ppcl_documents for select using (is_global_project_member(global_project_id));
create policy "Members can create global PPCL" on global_ppcl_documents for insert with check (is_global_project_member(global_project_id) and created_by = auth.uid());
create policy "Creator or admin can update"    on global_ppcl_documents for update using (created_by = auth.uid() or is_global_project_admin(global_project_id));
create policy "Creator or admin can delete"    on global_ppcl_documents for delete using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create trigger global_ppcl_documents_updated_at before update on global_ppcl_documents for each row execute function set_updated_at();

create index if not exists idx_global_ppcl_project on global_ppcl_documents(global_project_id);
create index if not exists idx_global_ppcl_creator on global_ppcl_documents(created_by);
```

Repeat for: `global_terminal_session_logs`, `global_pid_tuning_sessions`, `global_psych_sessions`, `global_register_calculations`, `global_ping_sessions`, `global_trend_sessions`, `global_connection_profiles`, `global_field_panels`, `global_project_notepad_entries`.

Each table's column set is the local table's columns minus `user_id`, plus `global_project_id`, `created_by`, `updated_by`. Storage-backed fields (file blobs, report attachments) use `storage_path` exactly like the existing `global_project_files`.

### 3.5 `add-local-projects-global-link.sql`

```sql
-- Allow a local project to remember which global project it was synced from / to.
alter table projects
  add column if not exists synced_global_id uuid references global_projects(id) on delete set null;

create index if not exists idx_projects_synced_global on projects(synced_global_id) where synced_global_id is not null;
```

This enables idempotent migrate/reconcile: if a local project has `synced_global_id`, share-to-global skips the create step and updates the existing global project instead.

---

## 4. TypeScript changes

### 4.1 `src/types/index.ts`

Extend `SyncEntityType`:

```ts
export type SyncEntityType =
  | 'projects' | 'files' | 'notes' | 'devices' | 'ipPlan'
  | 'dailyReports' | 'activityLog' | 'networkDiagrams'
  | 'commandSnippets' | 'pingSessions' | 'terminalLogs'
  | 'connectionProfiles' | 'registerCalculations' | 'pidTuningSessions'
  | 'ppclDocuments' | 'bugReports' | 'psychSessions' | 'reviews'
  | 'trendSessions'
  // ── NEW: Global mirrors ──
  | 'globalProjects' | 'globalNotes' | 'globalDevices' | 'globalIpPlan'
  | 'globalDailyReports' | 'globalActivityLog' | 'globalNetworkDiagrams'
  | 'globalProjectFiles' | 'globalPpclDocuments' | 'globalTerminalLogs'
  | 'globalPidTuningSessions' | 'globalPsychSessions' | 'globalRegisterCalculations'
  | 'globalPingSessions' | 'globalTrendSessions' | 'globalConnectionProfiles'
  | 'globalFieldPanels' | 'globalNotepadEntries' | 'globalProjectPreferences';
```

Add a `syncedGlobalId?: string` field to `Project`.

### 4.2 `src/types/global-projects.ts`

Extend `GlobalProject`:

```ts
export interface GlobalProject {
  id: string;
  createdBy: string;
  name: string;
  jobSiteName: string;
  customerName: string;            // NEW — parity with local
  siteAddress: string;
  buildingArea: string;
  projectNumber: string;
  description: string;
  technicianNotes: string;         // NEW — parity with local
  panelRosterSummary: string | null; // NEW
  networkSummary: string | null;    // NEW
  contacts: Contact[];              // NEW (reuse Contact from @/types)
  accessCode: string;
  tags: string[];
  status: GlobalProjectStatus;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
  role?: GlobalProjectRole;
  // Per-user preferences (joined from global_project_preferences)
  isPinned?: boolean;
  isOfflineAvailable?: boolean;
}
```

Add new interfaces mirroring the new tables: `GlobalPpclDocument`, `GlobalTerminalSessionLog`, `GlobalPidTuningSession`, `GlobalPsychSession`, `GlobalRegisterCalculation`, `GlobalPingSession`, `GlobalTrendSession`, `GlobalConnectionProfile`, `GlobalFieldPanel`, `GlobalNotepadEntry`, `GlobalProjectPreferences`.

Pattern for each: copy the local interface, replace `projectId` with `globalProjectId`, drop the local `user`-style fields, add `createdBy` and `updatedBy: string | null`, add `deletedAt: string | null`.

### 4.3 `src/lib/sync/field-map.ts`

Add `entityTypeToTable` entries for every new `SyncEntityType`:

```ts
export const entityTypeToTable: Record<SyncEntityType, string> = {
  // … existing entries …
  globalProjects: 'global_projects',
  globalNotes: 'global_field_notes',
  globalDevices: 'global_devices',
  globalIpPlan: 'global_ip_plan',
  globalDailyReports: 'global_daily_reports',
  globalActivityLog: 'global_activity_log',
  globalNetworkDiagrams: 'global_network_diagrams',
  globalProjectFiles: 'global_project_files',
  globalPpclDocuments: 'global_ppcl_documents',
  globalTerminalLogs: 'global_terminal_session_logs',
  globalPidTuningSessions: 'global_pid_tuning_sessions',
  globalPsychSessions: 'global_psych_sessions',
  globalRegisterCalculations: 'global_register_calculations',
  globalPingSessions: 'global_ping_sessions',
  globalTrendSessions: 'global_trend_sessions',
  globalConnectionProfiles: 'global_connection_profiles',
  globalFieldPanels: 'global_field_panels',
  globalNotepadEntries: 'global_project_notepad_entries',
  globalProjectPreferences: 'global_project_preferences',
};
```

Add `globalProjectId` to `UUID_FK_COLUMNS`. Add a `GLOBAL_ENTITY_TYPES` set to flag global entities in `toSupabaseRow` so:

- `user_id` is **not** injected (membership-based RLS, not ownership).
- `created_by` is injected on create (instead of `user_id`).
- `updated_by` is injected on update.

Extend `FIELD_OVERRIDES` for each new global type with the same camelCase → snake_case mappings as their local counterparts, plus `globalProjectId: 'global_project_id'` and `createdBy: 'created_by'` / `updatedBy: 'updated_by'`.

Extend `REQUIRES_PROJECT_ID` (rename to `REQUIRES_PARENT_ID` or add a parallel set) to flag global entities that need `global_project_id`.

Extend `SYNC_ORDER` to push global entities after local ones (avoids FK violations during initial pull):

```ts
export const SYNC_ORDER: SyncEntityType[] = [
  'projects', 'files', 'notes', /* … */ 'trendSessions',
  // ── Global must come after local because some preferences reference local projects ──
  'globalProjects',
  'globalNotes', 'globalDevices', 'globalIpPlan', 'globalDailyReports',
  'globalActivityLog', 'globalNetworkDiagrams', 'globalProjectFiles',
  'globalPpclDocuments', 'globalTerminalLogs', 'globalPidTuningSessions',
  'globalPsychSessions', 'globalRegisterCalculations', 'globalPingSessions',
  'globalTrendSessions', 'globalConnectionProfiles', 'globalFieldPanels',
  'globalNotepadEntries', 'globalProjectPreferences',
];
```

### 4.4 `src/lib/sync/sync-manager.ts`

Two changes:

1. **Pull filter** — for global entities, filter on membership not ownership:

   ```ts
   if (isGlobalEntity(entityType)) {
     // Pull rows for global projects this user is a member of.
     const memberProjectIds = await fetchMyGlobalProjectIds();
     query = supabase.from(table).select('*').in('global_project_id', memberProjectIds);
   } else {
     query = supabase.from(table).select('*').eq('user_id', userId);
   }
   ```

2. **Realtime hook** — subscribe to `postgres_changes` on each `global_*` table the user is a member of. On change, write to IndexedDB and fire `onPullComplete` (same path the periodic pull uses, so all hooks refresh).

### 4.5 `src/lib/global-projects/migrate.ts` → rewrite as `reconcile.ts`

Replace the two one-shot functions with two idempotent reconcilers keyed by stable IDs:

```ts
// Push a local project + all children to global, preserving IDs.
export async function reconcileLocalToGlobal(localProjectId: string): Promise<ReconcileResult>;

// Pull a global project + all children to local, preserving IDs and updating in place.
export async function reconcileGlobalToLocal(globalProjectId: string): Promise<ReconcileResult>;
```

Both functions:

- Look up `projects.synced_global_id` (or `global_projects.id`) to decide insert-vs-update.
- Iterate every child entity type listed in `SYNC_ORDER`, not just notes/devices/ip/reports.
- Map fields losslessly: `customerName ↔ customer_name`, `technicianNotes ↔ technician_notes`, `panelRosterSummary ↔ panel_roster_summary`, `networkSummary ↔ network_summary`, `contacts ↔ contacts`. `description` is now its own dedicated field, no longer a concat target.
- Preserve `createdAt`. Stamp `updatedAt = now()`.
- On global → local, set `Project.syncedGlobalId = globalProject.id`.
- Files: upload local blobs to Supabase Storage on first push, then on subsequent pushes only re-upload changed files (compare `updatedAt`).
- Activity log: append a new "Reconciled" entry instead of duplicating the existing rows.

---

## 5. Hook + API changes (`use-global-projects.ts`, `lib/global-projects/api.ts`)

For each new child entity type, add the four-function CRUD pattern + a hook. Worked example for PPCL — repeat for the other 9 entity families:

```ts
// lib/global-projects/api.ts
export async function fetchGlobalPpcl(projectId: string): Promise<ApiResult<GlobalPpclDocument[]>> {
  return fetchProjectEntities<GlobalPpclDocument>('global_ppcl_documents', projectId, 'updated_at', false);
}

export async function addGlobalPpcl(
  projectId: string,
  data: Pick<GlobalPpclDocument, 'name' | 'content' | 'firmware'>,
): Promise<ApiResult<GlobalPpclDocument>> {
  return insertEntity<GlobalPpclDocument>('global_ppcl_documents', projectId, data);
}

export async function updateGlobalPpcl(id: string, data: Partial<GlobalPpclDocument>) {
  return updateEntity<GlobalPpclDocument>('global_ppcl_documents', id, data);
}

export async function deleteGlobalPpcl(id: string) {
  return softDelete('global_ppcl_documents', id);
}
```

```ts
// hooks/use-global-projects.ts
export function useGlobalProjectPpcl(projectId: string) {
  const [documents, setDocuments] = useState<GlobalPpclDocument[]>([]);
  const refresh = useCallback(async () => {
    const result = await fetchGlobalPpcl(projectId);
    if (!result.error) setDocuments(result.data);
  }, [projectId]);
  useEffect(() => { refresh(); }, [refresh]);
  useRealtimeRefresh('global_ppcl_documents', refresh, `global_project_id=eq.${projectId}`);
  return { documents, refresh,
    addDocument: (data) => addGlobalPpcl(projectId, data).then(refresh),
    updateDocument: (id, data) => updateGlobalPpcl(id, data).then(refresh),
    removeDocument: (id) => deleteGlobalPpcl(id).then(refresh),
  };
}
```

Update `useGlobalProject` to expose the new fields (`customerName`, `technicianNotes`, `panelRosterSummary`, `networkSummary`, `contacts`, `isPinned`, `isOfflineAvailable`). The last two come from a join on `global_project_preferences` filtered by the current user — wrap that as `useGlobalProjectPreferences(projectId)` for ergonomics.

---

## 6. UI changes (`src/app/global-projects/[...slug]/client-page.tsx`)

### 6.1 Tabs

Add to the `tabs` array (in the existing display order from the local sections list):

```ts
const tabs = [
  { id: 'overview',         label: 'Overview',      icon: LayoutGrid },
  { id: 'notes',            label: 'Notes',         icon: StickyNote },
  { id: 'devices',          label: 'Devices',       icon: Server },
  { id: 'ip-plan',          label: 'IP Plan',       icon: Network },
  { id: 'documents',        label: 'Documents',     icon: FolderOpen },
  { id: 'reports',          label: 'Reports',       icon: FileText },
  { id: 'ppcl-programs',    label: 'PPCL',          icon: FileCode },     // NEW
  { id: 'terminal-logs',    label: 'Terminal Logs', icon: Terminal },     // NEW
  { id: 'network-diagrams', label: 'Diagrams',      icon: GitBranch },    // NEW (table exists today, just no UI)
  { id: 'activity',         label: 'Activity',      icon: History },
  { id: 'members',          label: 'Members',       icon: Users },
] as const;
```

The sessions-style tools (PID, psych, register, ping, trends, field panels, notepad) are *not* normally accessed from the per-project page on the local side either — they live in their own routes and filter by `projectId`. So for parity, do the same on the global side: those tools get a `globalProjectId` filter mode rather than a tab.

### 6.2 Overview-tab inline editors

Add edit-in-place rows for the new project-level fields, mirroring the local Edit Project Dialog (`src/components/projects/edit-project-dialog.tsx`):

- Customer Name (text)
- Technician Notes (textarea)
- Panel Roster Summary (textarea)
- Network Summary (textarea)
- Contacts (Contact[] editor — reuse `src/components/projects/contact-dialog.tsx`)
- Pinned / Offline-cached toggles (per-user, write to `global_project_preferences`)

### 6.3 Reuse vs fork strategy

For each new tab, the agent should first try refactoring the existing local component (`src/components/devices/...`, `src/components/notes/...`, etc.) to accept a `source: { kind: 'local', projectId } | { kind: 'global', globalProjectId }` prop, then mount it from both pages. Where the props/handlers diverge too much, fork into a `global-*` sibling. Default to refactor — duplication is the failure mode.

---

## 7. Implementation order (ordered task list for the team)

Agent ownership in brackets. Tasks in the same step can run in parallel; later steps depend on earlier steps.

### Step 1 — Schema foundation  *(Schema Architect)*

1. `supabase/migrations/add-global-project-parity-fields.sql` — extend `global_projects`.
2. `supabase/migrations/add-global-project-preferences.sql` — new per-user table.
3. `supabase/migrations/add-sync-columns-global-children.sql` — `sync_version` on existing children.
4. `supabase/migrations/add-local-projects-global-link.sql` — `projects.synced_global_id`.
5. `supabase/migrations/add-global-child-tables.sql` — 10 new child tables with RLS + indexes.
6. Apply migrations to a Supabase preview branch and run `select * from information_schema.columns where table_name like 'global_%'` to verify column counts match the local mirrors.

### Step 2 — Types + sync wiring  *(Type & Sync Bridge Engineer, blocked by Step 1)*

7. Extend `SyncEntityType` and `GlobalProject` and add new global child interfaces in `src/types/`.
8. Extend `entityTypeToTable`, `FIELD_OVERRIDES`, `SYNC_ORDER`, `REQUIRES_PROJECT_ID` in `src/lib/sync/field-map.ts`. Add `GLOBAL_ENTITY_TYPES` set + `isGlobalEntity()` helper.
9. Teach `SyncManager` (`src/lib/sync/sync-manager.ts`) the membership-based pull filter and the `global_*` realtime subscriptions.
10. Replace `src/lib/global-projects/migrate.ts` with `reconcile.ts` (idempotent, ID-preserving, all-entity-types).
11. Unit tests in `src/lib/sync/__tests__/`: round-trip for each new entity type, idempotent reconcile.

### Step 3 — API + hooks  *(Hooks & API Engineer, blocked by Step 2)*

12. Add CRUD functions for all 10 new entity types in `src/lib/global-projects/api.ts`.
13. Add hooks (`useGlobalProjectPpcl`, `useGlobalProjectTerminalLogs`, …) in `src/hooks/use-global-projects.ts`.
14. Add `useGlobalProjectPreferences(projectId)` hook backed by `global_project_preferences`.
15. Update `share-to-global-dialog.tsx` and `save-to-local-dialog.tsx` to call `reconcile*` instead of `migrate*`, and to advertise every entity type in the "Will be migrated" list.

### Step 4 — UI parity  *(Global UI Parity Engineer, blocked by Step 3)*

16. Extend the `tabs` array in `src/app/global-projects/[...slug]/client-page.tsx` to add PPCL, terminal logs, network diagrams.
17. Add Overview-tab inline editors for the new project-level fields. Wire to `useGlobalProject().update`.
18. Build (or refactor-and-reuse) the per-tab components for the new tabs, parameterising on `globalProjectId`.
19. Add the per-user pin / offline toggles to the global project header, persisted via `useGlobalProjectPreferences`.
20. Update the PID / psych / register / ping / trend / field-panels / notepad pages to accept a `globalProjectId` query param so they filter the global child tables when the user came from a Global Project.

### Step 5 — Verification  *(All agents, sequenced)*

21. Manually test: create local project → share to global → edit both sides → reconcile both ways. Verify zero data loss.
22. Manually test offline: open Global Project with airplane mode on → edit → re-enable network → verify queue flushes.
23. Run `bun run typecheck` and `bun run test` from `package.json`.
24. Write the fix log: `docs/SyncAgents-fixes-2026-05-12.md` per the rule in `CLAUDE.md`.

---

## 8. Risks + open questions

- **Realtime subscription scale** — `useRealtimeRefresh` creates one channel per `(table, filter)` pair. With 10 new global tables × N global projects, a heavy user could open 100+ subscriptions. Consider consolidating into one channel per project that watches all child tables (Supabase supports multi-table subscriptions per channel).
- **File attachments on reports** — already handled via Storage in `migrateAttachmentsToStorage`. The reconcile rewrite must keep that path and also handle `global_project_files` blobs the same way.
- **`description` vs `technicianNotes`** — both will exist on `global_projects` after the migration. Need a one-time data fix to split any existing rows whose `description` is actually the legacy `technicianNotes + panelRosterSummary` concat. A short migration script that detects `description LIKE '%\n\n%'` and asks the user to confirm before splitting is the safest path.
- **`SyncEntityType` length** — adds ~19 new types. Worth a brief naming review before merging to keep the union readable.
- **Permissions on shared field panels / connection profiles** — these are user-personal on the local side ("my serial profiles"). When shared, they become team-wide. Confirm that's the desired UX before exposing as global tabs; may want to keep them user-personal even on the global page and filter by `created_by = auth.uid()`.

---

## 9. What "done" looks like

1. A user can take any local Project, click **Share to Global**, and every field + every child entity round-trips to a Global Project with zero data loss.
2. From the Global Project, the same user (or a teammate) can edit any of those fields, and **Save to My Projects** updates the existing local copy in place (no duplicate project created).
3. Going offline mid-edit on a Global Project queues the mutation locally and flushes on reconnect — same UX as local projects today.
4. The Global Project page exposes every tab the local Project page exposes (except those that are intentionally user-personal, like My Connection Profiles).
5. `bun run typecheck` and `bun run test` are green. A fresh Supabase project initialised from `schema.sql` + `global-projects-schema.sql` + all new migrations boots cleanly.
