# SYNC.md — Offline-First Sync Engine

BAU Suite uses an **offline-first** architecture: all data lives in the browser's IndexedDB and syncs bidirectionally with Supabase (Postgres) when the user is authenticated and online.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Components                         │
│  (save, delete, update)         (read, re-render on pull)       │
└──────────┬──────────────────────────────────┬───────────────────┘
           │ write                            │ read
           ▼                                  │
┌──────────────────────┐                      │
│     IndexedDB        │◄─────────────────────┘
│   (bas-toolkit v10)  │
│                      │
│  ┌────────────────┐  │    notifySync()     ┌───────────────────┐
│  │ Data Stores    │──┼────────────────────►│   Sync Bridge      │
│  │ (16 entities)  │  │   (fire & forget)   │  sync-bridge.ts    │
│  ├────────────────┤  │                     └────────┬──────────┘
│  │ syncQueue      │  │                              │ enqueue()
│  │ syncConflicts  │  │                              ▼
│  │ fileBlobs      │  │                     ┌───────────────────┐
│  └────────────────┘  │                     │   Sync Manager     │
└──────────────────────┘                     │  sync-manager.ts   │
                                             │                   │
           ┌─────────────────────────────────┤  push ▲  ▼ pull   │
           │  bulkPutSilent / bulkDeleteSilent│                   │
           │  (no notifySync — prevents loop) └────────┬──────────┘
           ▼                                           │
┌──────────────────────┐                     ┌─────────▼─────────┐
│     IndexedDB        │                     │     Supabase       │
│  (silent writes)     │                     │   (Postgres)       │
└──────────────────────┘                     │                   │
                                             │  16 tables        │
                                             │  snake_case cols   │
                                             │  user_id scoped    │
                                             │  soft-delete       │
                                             └───────────────────┘
```

**Key principle:** Every local write calls `notifySync()` which enqueues to the sync queue. Pull sync uses `bulkPutSilent()` to write without triggering `notifySync()`, preventing an infinite push-pull loop.

---

## IndexedDB Schema

**Database:** `bas-toolkit`, **Current version:** `11`

### Data Stores (16 synced entity types)

| Store | Key | Indexes | Supabase Table |
|---|---|---|---|
| `projects` | `id` | `by-updated`, `by-status`, `by-pinned` | `projects` |
| `files` | `id` | `by-project`, `by-category`, `by-pinned` | `project_files` |
| `notes` | `id` | `by-project`, `by-file` | `field_notes` |
| `devices` | `id` | `by-project` | `devices` |
| `ipPlan` | `id` | `by-project` | `ip_plan` |
| `dailyReports` | `id` | `by-project`, `by-date` | `daily_reports` |
| `activityLog` | `id` | `by-project`, `by-timestamp` | `activity_log` |
| `networkDiagrams` | `id` | `by-project` | `network_diagrams` |
| `commandSnippets` | `id` | `by-category` | `command_snippets` |
| `pingSessions` | `id` | `by-project` | `ping_sessions` |
| `terminalLogs` | `id` | `by-project` | `terminal_session_logs` |
| `connectionProfiles` | `id` | `by-project`, `by-type` | `connection_profiles` |
| `registerCalculations` | `id` | `by-project`, `by-module` | `register_calculations` |
| `pidTuningSessions` | `id` | `by-project` | `pid_tuning_sessions` |
| `projectNotepadEntries` | `id` | `by-project` | `project_notepad_entries` |
| `bugReports` | `id` | `by-status`, `by-severity` | `bug_reports` |

### Infrastructure Stores (not synced to Supabase)

| Store | Purpose |
|---|---|
| `fileBlobs` | Local blob cache for offline file access |
| `syncQueue` | Outbound sync queue (pending push operations) |
| `syncConflicts` | Detected conflicts awaiting user resolution |

### Version History

| Version | Added |
|---|---|
| 1 | `projects`, `files`, `fileBlobs`, `notes`, `devices`, `ipPlan`, `activityLog` |
| 2 | `dailyReports` |
| 3 | `networkDiagrams`, `commandSnippets`, `pingSessions` |
| 4 | `terminalLogs` |
| 5 | `connectionProfiles` |
| 6 | `registerCalculations` |
| 7 | `syncQueue` |
| 8 | `syncConflicts` |
| 9 | `pidTuningSessions` |
| 10 | `projectNotepadEntries` |
| 11 | `bugReports` |

The `idb` library handles migrations automatically — each `if (oldVersion < N)` block runs only when upgrading from an older version.

> **Blocked upgrades:** If the user has the app open in multiple tabs, IndexedDB may block the upgrade. A `blocked()` callback logs a warning asking the user to close other tabs.

---

## Push Sync (Local → Cloud)

### How writes enter the queue

Every `db.ts` write function (e.g., `saveProject()`, `deleteNote()`) calls `notifySync()` after the IndexedDB write completes:

```typescript
// Example from db.ts
export async function saveProject(project: Project): Promise<void> {
  const db = await getDB();
  await db.put('projects', project);
  notifySync('update', 'projects', project.id, project);  // ← enqueues
}
```

`notifySync()` (in `sync-bridge.ts`) is fire-and-forget — it never blocks the calling code. If no `SyncManager` is registered (user not authenticated, or Supabase not configured), it's a no-op.

### Queue deduplication

Queue items use a **deterministic ID**: `${entityType}-${entityId}`. If the same entity is modified multiple times before the queue processes, the later enqueue overwrites the earlier one — only the latest state gets pushed.

### Pre-flight validation

Before enqueue, two checks run:

1. **UUID format** — Entity IDs must be valid UUID v4. Non-UUID IDs (like demo data `"proj-ahu-upgrade"`) are silently skipped.
2. **Required foreign keys** — For entity types that require `project_id NOT NULL` in Supabase, the `projectId` must also be a valid UUID. This prevents orphaned demo data from being pushed.

**Entities requiring a valid `projectId`:** `notes`, `devices`, `ipPlan`, `dailyReports`, `activityLog`, `networkDiagrams`, `pidTuningSessions`, `projectNotepadEntries`

**Entities with nullable `projectId`:** `files`, `commandSnippets`, `pingSessions`, `terminalLogs`, `connectionProfiles`, `registerCalculations`, `bugReports`

### Queue processing

The `SyncManager` polls the queue every **5 seconds** (`PROCESS_INTERVAL_MS`). Each cycle:

1. Checks `navigator.onLine` — skips if offline
2. Fetches up to **20** pending items (`BATCH_SIZE`)
3. **Sorts by FK dependency order** — projects first, then children. This prevents FK constraint violations when creating a project and its children in the same batch.
4. Processes each item sequentially

**Dependency order (`SYNC_ORDER`):**
```
projects → files → notes → devices → ipPlan → dailyReports →
activityLog → networkDiagrams → commandSnippets → pingSessions →
terminalLogs → connectionProfiles → registerCalculations →
pidTuningSessions → projectNotepadEntries → bugReports
```

### Delete handling

| Entity Type | Delete Strategy | Why |
|---|---|---|
| `activityLog` | **Hard delete** (`DELETE FROM`) | Log entries have no `deleted_at` column |
| All others | **Soft delete** (`UPDATE SET deleted_at = now()`) | Preserves data for conflict resolution and restore |

### Retry and failure

- Each failed item gets up to **5 retries** (`MAX_RETRIES`)
- On failure: status reverts to `pending` with incremented `retriedCount` and `lastError`
- After 5 failures: status set to `failed` permanently (stays in queue for visibility)
- Failed items are excluded from future `getPendingSyncItems()` calls (only `pending` items are fetched)

### Full sync

Triggered manually via Settings → "Sync to Cloud":

1. **Purge orphans** from Supabase (see Orphan Purge below)
2. **Clear the entire queue** to prevent duplicates
3. **Scan all 15 IndexedDB stores** in FK order
4. **Validate and enqueue** each item that passes pre-flight checks
5. **Kick off processing** immediately

Returns `{ enqueued, errors }` so the UI can report results.

---

## Pull Sync (Cloud → Local)

### Incremental pull

Used on reconnect and periodic refresh. Takes a `lastPulledAt` timestamp:

1. **Capture `newPulledAt` BEFORE querying** — ensures rows modified during pull aren't missed on the next pull
2. **Paginate** through each table (1000 rows per page) filtered by `user_id` and `updated_at >= lastPulledAt`
3. **Separate rows** into three categories:
   - **Live rows** → `bulkPutSilent()` into IndexedDB
   - **Soft-deleted rows** (non-null `deleted_at`) → `bulkDeleteSilent()` from IndexedDB
   - **Orphaned rows** (null `project_id` on required-FK tables) → skipped
4. **Emit `bau-suite:pull-complete`** window event so React hooks re-read data

### Full restore ("Restore from Cloud")

Triggered manually via Settings:

1. **Undelete all soft-deleted rows** — sets `deleted_at = null` across all tables for the user
2. **Run a full (non-incremental) pull** — `pullSync(null)` fetches everything
3. Emits pull-complete event

### Silent writes (loop prevention)

`bulkPutSilent()` and `bulkDeleteSilent()` write directly to IndexedDB **without calling `notifySync()`**. This is critical — without it, every pulled row would be re-enqueued for push, creating an infinite sync loop.

```
Normal write path:    saveProject() → db.put() → notifySync() → enqueue
Pull sync path:       pullSync()    → bulkPutSilent() → db.put() → (no notifySync)
```

---

## Conflict Detection & Resolution

### When conflicts are detected

During push sync, when processing an `update` action:

1. Fetch the remote row's `updated_at` timestamp
2. Compare against the local entity's `updatedAt`
3. If **remote is newer** → conflict detected

### What happens on conflict

1. A `SyncConflict` record is created in the `syncConflicts` store with both local and remote data
2. The queue item is removed (not retried — it's a data conflict, not a network error)
3. The conflict count callback fires, updating the Zustand store
4. The user sees a conflict indicator in the UI

### Conflict data structure

```typescript
interface SyncConflict {
  id: string;              // "${entityType}-${entityId}"
  entityType: SyncEntityType;
  entityId: string;
  localData: Record<string, unknown>;
  remoteData: Record<string, unknown>;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  detectedAt: string;
}
```

### Resolution options

| Resolution | What happens |
|---|---|
| **Keep Local** | Force-upsert local data to Supabase, delete conflict record |
| **Keep Remote** | `bulkPutSilent()` remote data to IndexedDB (no re-push), delete conflict record |

Both resolutions remove the conflict from the `syncConflicts` store and update the UI conflict count.

### When conflicts are NOT raised

- **Create actions** — new entities use upsert, so if the row already exists it just overwrites
- **Delete actions** — soft-delete always succeeds (idempotent)
- **No remote row found** — proceeds with upsert (new data, no conflict possible)
- **No `updatedAt` on local data** — skips conflict check, proceeds with upsert

---

## Field Mapping (`field-map.ts`)

### camelCase ↔ snake_case

Local IndexedDB entities use **camelCase** (TypeScript convention). Supabase tables use **snake_case** (Postgres convention). The field mapper handles conversion in both directions.

**Push direction** (`toSupabaseRow()`):
1. Check explicit `FIELD_OVERRIDES` for the entity type
2. Fall back to automatic `camelCase → snake_case` conversion
3. Add `user_id` from the authenticated session
4. Strip `LOCAL_ONLY_FIELDS` (e.g., `isOfflineCached`)
5. Strip entity-specific `SKIP_FIELDS` (e.g., `activityLog.user`)
6. Sanitize UUID FK columns — empty strings and non-UUID values become `null`

**Pull direction** (`fromSupabaseRow()`):
1. Build reverse lookup from `FIELD_OVERRIDES`
2. Strip `SUPABASE_ONLY_FIELDS` (`user_id`, `sync_version`, `deleted_at`)
3. Convert remaining `snake_case → camelCase`
4. Special case: `activityLog` maps `user_id → user` field

### Field override example

```typescript
// Explicit mapping for projects
FIELD_OVERRIDES.projects = {
  customerName: 'customer_name',
  siteAddress: 'site_address',
  isPinned: 'is_pinned',
  // ...
};
```

Overrides exist where the automatic conversion is ambiguous or where the Supabase column name doesn't follow the simple conversion pattern.

### Validation

`validateSyncable()` performs pre-flight checks:
- Entity `id` must be a valid UUID v4
- For entities in `REQUIRES_PROJECT_ID`, `projectId` must also be a valid UUID
- Returns `null` if syncable, or an error reason string if not

---

## Orphan Purge

Orphaned data accumulates from demo/seed data and deleted projects. The purge runs at the start of `fullSync()`.

### Remote purge (Supabase)

**Step 1: Soft-deleted projects and their children**
1. Find all projects with non-null `deleted_at`
2. Delete all child records referencing those project IDs (children first, respecting FK constraints)
3. Hard-delete the projects themselves

**Step 2: Null `project_id` orphans**
1. For each entity type that requires `project_id NOT NULL`
2. Hard-delete any rows where `project_id IS NULL`
3. These are old demo data or orphaned records from schema migrations

### Local purge (IndexedDB)

1. Build a set of all valid local project IDs
2. For each store requiring a `projectId`: find items where `projectId` is missing or references a non-existent project
3. Delete orphaned items via `bulkDeleteSilent()`
4. Also remove matching items from the sync queue to prevent FK push errors

---

## React Integration

### SyncProvider (`sync-provider.tsx`)

Wraps the app and manages the `SyncManager` lifecycle:

```
App mount → SyncProvider
  ├── mode !== 'authenticated'  → sync disabled, no manager
  ├── paywall enabled + free tier (no grace period) → sync disabled
  ├── no Supabase client        → sync disabled
  └── authenticated + client + access granted → create SyncManager
        ├── Register with sync bridge
        ├── Start 5s polling interval
        ├── Report initial conflict count
        ├── Auto-pull on first login (if no lastPulledAt)
        └── Listen for 'online' events
```

**Paywall gate:** When `NEXT_PUBLIC_SYNC_PAYWALL=true`, SyncProvider checks `profile.subscriptionTier` before initializing the SyncManager. Free-tier users get `syncStatus = 'disabled'`. Pro and Team users sync normally. A 7-day grace period allows sync to continue briefly after subscription expiry. When the flag is off (default), all authenticated users sync freely.

**Auto-pull on first login:** If the user has never pulled (new device), SyncProvider automatically purges orphans then does a full pull. This happens once per session (`autoPullFiredRef`).

### Zustand store state

The `useAppStore` Zustand store exposes sync state to all components:

| State | Type | Persisted | Description |
|---|---|---|---|
| `syncStatus` | `'idle' \| 'syncing' \| 'error' \| 'offline' \| 'disabled'` | No | Current sync engine state |
| `pendingSyncCount` | `number` | No | Items waiting in the push queue |
| `lastSyncedAt` | `string \| null` | Yes | Last successful push completion time |
| `lastPulledAt` | `string \| null` | Yes | Last successful pull completion time |
| `syncConflictCount` | `number` | No | Number of unresolved conflicts |

`lastSyncedAt` and `lastPulledAt` are persisted via Zustand's `partialize` middleware so they survive page reloads.

### SyncContext methods

Components access sync operations via `useSyncContext()`:

| Method | What it does |
|---|---|
| `triggerFullSync()` | Enqueue all local data for push to cloud |
| `triggerPullSync()` | Restore from cloud (undelete + full pull) |
| `getConflicts()` | Fetch all unresolved conflicts |
| `resolveConflict(id, 'local' \| 'remote')` | Resolve a specific conflict |

### Pull-complete event

After pull sync writes data to IndexedDB, `emitPullComplete()` dispatches a `bau-suite:pull-complete` window event. React hooks can subscribe via `onPullComplete(callback)` to re-read data and trigger re-renders.

---

## Connectivity Handling

### Offline behavior

- `processQueue()` checks `navigator.onLine` — if offline, it skips processing entirely
- Local writes still happen normally (IndexedDB is always available)
- Writes still enqueue to `syncQueue` — they accumulate while offline
- `SyncProvider` maps offline state: `syncStatus = 'offline'`

### Reconnect (online event)

When the browser fires the `online` event:

1. **Pull first** — fetch remote changes since `lastPulledAt` to detect conflicts before pushing
2. **Then flush** — process the accumulated push queue
3. If pull fails, still attempt to flush the push queue

This order is critical: pulling first means conflicts are detected against the latest remote state, not stale data.

### Status transitions

```
disabled ──► idle ──► syncing ──► idle (success)
               │         │
               │         └──► error (failed items)
               │
               └──► offline ──► (online event) ──► idle
```

---

## Troubleshooting

### Common issues

| Symptom | Cause | Fix |
|---|---|---|
| Data not syncing | Supabase env vars missing | Check `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Sync stuck on "syncing" | Network error or queue stall | Check browser console for `[sync]` prefixed logs |
| Items permanently failed | 5 retries exhausted | Check `lastError` on failed queue items; may need manual fix |
| Duplicate data after sync | Queue not cleared before full sync | Should auto-clear; check for concurrent sync triggers |
| Missing data after restore | Soft-deleted rows not undeleted | "Restore from Cloud" should undelete; check Supabase RLS policies |
| IndexedDB upgrade blocked | App open in multiple tabs | Close other tabs and reload |
| Demo data appearing in cloud | Non-UUID IDs bypassed validation | Run full sync to re-validate all items |

### Debug logging

All sync operations log with the `[sync]` prefix. Filter browser console:

```
[sync] Manager started (user=abc12345…)
[sync] Processing 3 queued item(s)…
[sync] Batch complete: 3 synced, 0 failed
[sync] Pull sync started (since=2024-01-15T10:30:00.000Z)…
[sync] projects: 5 pulled, 1 deleted
[sync] Conflict detected for notes/abc-123: local=…, remote=…
```

### Inspecting sync state

Use browser DevTools → Application → IndexedDB → `bas-toolkit`:
- **`syncQueue`** — pending/failed items with error messages
- **`syncConflicts`** — unresolved conflicts with both local and remote snapshots
- **Zustand store** — `useAppStore.getState()` in console shows `syncStatus`, `pendingSyncCount`, etc.
