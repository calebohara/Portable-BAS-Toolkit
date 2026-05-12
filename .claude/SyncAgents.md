# SyncAgents — Global ↔ Local Projects Parity Team

**Team:** SyncAgents
**Project:** Portable-BAS-Toolkit (BAU Suite)
**Agents:** 4
**Purpose:** Bring Global Projects to feature + data parity with local Projects, and wire them into the offline-first SyncManager so they behave like first-class synced entities (not one-shot migrations).
**Direction chosen:** Parity (keep two models, fill the gaps). See `docs/SyncAgents-plan-2026-05-12.md` for the full plan.
**Fix log rule:** After every audit + fix session, create `docs/SyncAgents-fixes-YYYY-MM-DD.md`. Same section structure as `BASAgents` fix logs (Header → Audit → Fixes by priority → Housekeeping → Verification).

---

## Why this team exists

Today the two project surfaces diverge:

- **Local `Project`** (`src/types/index.ts`, `projects` table) carries 18 fields and 14 child entity types (notes, files, devices, ip plan, daily reports, activity, network diagrams, PPCL, terminal logs, PID, psych, register calcs, ping, trends, connection profiles, field panels, notepad entries) — all wired into `SyncManager` (push + pull + soft-delete + sync_version).
- **Global `GlobalProject`** (`src/types/global-projects.ts`, `global_*` tables) carries 15 fields and **only 7** child entity types (notes, files, devices, ip plan, daily reports, activity, network diagrams — the last with no UI). It uses direct Supabase calls with Realtime, **not** the SyncManager queue — so it does not work offline and does not benefit from the sync infrastructure.

The one-shot `migrate.ts` bridge between them is lossy (drops `contacts`, `panelRosterSummary`, `networkSummary`, `isPinned`; folds `technicianNotes` into `description`; regenerates IDs; can't migrate files / PPCL / terminal logs / sessions) and **only fires once** — after that the two stores drift forever.

The team's mandate: close the field gap, close the table gap, close the sync-engine gap.

---

## Team Roster

### 1. Schema Architect

**Role:** Owns the Postgres side. Designs and authors migrations that bring `global_*` tables to the same column set, sync-readiness columns (`sync_version`, `deleted_at`), and child-table coverage as the local schema. Owns RLS for every new table.

**Traits:** security · analytical · thorough
**Color:** #9B59B6
**Voice:** Daniel (`onwK4e9ZLuTAKqWW03F9`)

**File Ownership:**

```
supabase/global-projects-schema.sql
supabase/migrations/                    (new migrations for parity work)
supabase/schema.sql                     (read-only reference — local source of truth)
```

**Primary deliverables:**

- New migration: `add-global-projects-parity-fields.sql` — extends `global_projects` with `customer_name`, `technician_notes`, `panel_roster_summary`, `network_summary`, `contacts jsonb`, `sync_version`, and a per-member `global_project_preferences` table for `is_pinned` / `is_offline_available`.
- New tables: `global_ppcl_documents`, `global_terminal_session_logs`, `global_pid_tuning_sessions`, `global_psych_sessions`, `global_register_calculations`, `global_ping_sessions`, `global_trend_sessions`, `global_connection_profiles`, `global_field_panels`, `global_project_notepad_entries`, `global_project_contacts` (or contacts as jsonb on global_projects — design call).
- RLS policies on each (member-read, member-create with `created_by = auth.uid()`, creator-or-admin update/delete).
- Indexes mirroring the local schema's `idx_*_project` and `idx_*_user` patterns.
- `sync_version` + `deleted_at` columns on every existing `global_*` table that lacks them.

---

### 2. Type & Sync Bridge Engineer

**Role:** Owns the TypeScript layer that maps local entities ↔ global entities and pushes them through the sync queue. Extends `field-map.ts` with `global_*` entries, adds new `SyncEntityType` values, and rewires `SyncManager` so Global Projects can ride the same offline-first pipeline.

**Traits:** technical · analytical · systematic
**Color:** #3498DB
**Voice:** Rachel (`21m00Tcm4TlvDq8ikWAM`)

**File Ownership:**

```
src/types/global-projects.ts
src/types/index.ts                      (SyncEntityType union, may add 'globalProjects', 'globalNotes', etc.)
src/lib/sync/field-map.ts
src/lib/sync/sync-manager.ts
src/lib/sync/sync-bridge.ts
src/lib/sync/__tests__/
src/lib/global-projects/api.ts          (kept for Realtime, but route writes through SyncManager)
src/lib/global-projects/migrate.ts      (rewrite as a continuous reconcile, not one-shot)
```

**Primary deliverables:**

- Update `GlobalProject` interface to mirror new schema (add `customerName`, `technicianNotes`, `panelRosterSummary`, `networkSummary`, `contacts`, `isPinned`, `isOfflineAvailable` — the last two via the per-member preferences join).
- Add `globalProjects`, `globalNotes`, `globalDevices`, `globalIpPlan`, `globalReports`, `globalFiles`, `globalActivity`, `globalDiagrams`, `globalPpcl`, `globalTerminalLogs`, `globalPid`, `globalPsych`, `globalRegister`, `globalPing`, `globalTrends`, `globalConnectionProfiles`, `globalFieldPanels`, `globalNotepad` to `SyncEntityType`.
- Extend `FIELD_OVERRIDES`, `REQUIRES_PROJECT_ID`, and `SYNC_ORDER` in `field-map.ts` for the new types. Add a `globalProjectId` UUID FK handler alongside `projectId`.
- Update `SyncManager` to route global entities to `global_*` tables and respect membership (not `user_id = auth.uid()`) when filtering pulls.
- Rewrite `migrate.ts`'s two functions as **idempotent reconcile** operations keyed by stable IDs (preserve UUIDs across local ↔ global) so a project can be re-synced without duplicating rows or dropping fields.

---

### 3. Hooks & API Engineer

**Role:** Owns the React hook layer (`use-global-projects.ts`) and the Supabase API wrapper (`lib/global-projects/api.ts`). Adds CRUD for every newly-supported entity type, makes the hooks consume the SyncManager pull (so offline + realtime both work), and exposes the new fields to the UI.

**Traits:** research · analytical · systematic
**Color:** #3498DB
**Voice:** Rachel (`21m00Tcm4TlvDq8ikWAM`)

**File Ownership:**

```
src/hooks/use-global-projects.ts
src/lib/global-projects/api.ts
src/lib/global-projects/                (any new helper files)
src/components/global-projects/         (dialogs, member-management, share/save bridges)
```

**Primary deliverables:**

- New API functions: `fetchGlobalPpcl`, `addGlobalPpcl`, `updateGlobalPpcl`, `deleteGlobalPpcl` (and the parallel set for terminal logs, PID, psych, register, ping, trends, connection profiles, field panels, notepad entries).
- New hooks: `useGlobalProjectPpcl`, `useGlobalProjectTerminalLogs`, `useGlobalProjectPid`, etc., each following the existing `useGlobalProjectNotes` pattern (realtime subscription + camelCase mapping + `unwrap` error handling).
- Update `useGlobalProject` + `useGlobalProjects` to surface the new fields (`customerName`, `technicianNotes`, `contacts`, `panelRosterSummary`, `networkSummary`, `isPinned` from preferences).
- Update `share-to-global-dialog.tsx` and `save-to-local-dialog.tsx` to (a) advertise the new migrated entity types in the "Will be migrated" list and (b) call the new continuous-reconcile API rather than the lossy one-shot.

---

### 4. Global UI Parity Engineer

**Role:** Owns the Global Projects page shell and brings its tab layout, child editors, and detail views to feature parity with the local project page. Wires up the missing tabs (PPCL, terminal logs, network diagrams, PID, psych, register, trends, field panels) and adds inline editors for the new project-level fields (contacts, panel roster, network summary).

**Traits:** technical · skeptical · thorough
**Color:** #E74C3C
**Voice:** James (`ZQe5CZNOzWyzPSCn5a3c`)

**File Ownership:**

```
src/app/global-projects/                (route + client-page.tsx)
src/components/global-projects/         (per-tab editors)
src/components/projects/                (read-only reference — local source of truth for tab UX)
src/lib/routes.ts                       (any new global subroutes)
```

**Primary deliverables:**

- Extend the `tabs` array in `src/app/global-projects/[...slug]/client-page.tsx` to match local sections: add `ppcl-programs`, `terminal-logs`, `network-diagrams`, and (optionally, behind a feature flag) `pid`, `psych`, `register`, `trends`, `field-panels`, `connection-profiles`, `notepad`.
- New components mirroring local ones for each tab (or, where possible, refactor local components to accept `mode: 'local' | 'global'` and reuse them).
- Inline editors on the Overview tab for `customerName`, `technicianNotes`, `panelRosterSummary`, `networkSummary`, `contacts[]` — same shape as the local Edit Project dialog.
- Per-user `isPinned` + `isOfflineAvailable` toggle on the global project header, persisted to `global_project_preferences`.

---

## Spawn All Agents (Parallel)

```bash
# Once the plan in docs/SyncAgents-plan-2026-05-12.md is approved, spawn in parallel.
# Each agent should read the plan + their roster section before starting.
```

To launch all 4 agents simultaneously, pass them to the Agent tool in a single message with separate `subagent_type: "general-purpose"` calls. Schema Architect must finish migrations before Type & Sync Bridge can run its tests; Hooks & API depends on types; UI depends on hooks. Use the staged ordering in the plan doc.

## Ownership Rules

1. **Migrations** — Schema Architect leads, no other agent commits SQL.
2. **`SyncEntityType` union + `field-map.ts`** — Type & Sync Bridge owns. Hooks & API agent reads it.
3. **`api.ts` exports + hook signatures** — Hooks & API owns. UI agent must consume them, not bypass.
4. **`global-projects/[...slug]/client-page.tsx`** — UI agent owns the shell; tab body components can be shared with local Projects via refactor (UI agent leads that refactor, with the local components' previous owners CCed).
5. **`migrate.ts`** — Type & Sync Bridge owns the rewrite; UI agent updates the dialogs that call it.
6. **Conflicts** — More specific ownership wins. When two agents need the same file, Schema → Type/Sync → Hooks/API → UI is the precedence order (data flows that direction).

## Quick Reference

| Agent | Color | Voice | Traits |
|-------|-------|-------|--------|
| Schema Architect | #9B59B6 | Daniel | security · analytical · thorough |
| Type & Sync Bridge Engineer | #3498DB | Rachel | technical · analytical · systematic |
| Hooks & API Engineer | #3498DB | Rachel | research · analytical · systematic |
| Global UI Parity Engineer | #E74C3C | James | technical · skeptical · thorough |
