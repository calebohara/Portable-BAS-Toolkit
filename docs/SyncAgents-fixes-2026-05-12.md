# SyncAgents — Parity Implementation Log (2026-05-12)

**Date:** 2026-05-12
**Team:** SyncAgents (4 roles: Schema Architect, Type & Sync Bridge Engineer, Hooks & API Engineer, Global UI Parity Engineer)
**Agents dispatched:** 14 across 4 steps (4 schema + 5 sync + 2 hooks/api + 2 ui + 1 wave-1-types continuation)
**Files changed:** 21 tracked + 28 new (44 untracked entries including 14 new migrations + verify script + new tests + reconcile.ts + global mode banner)
**Diff:** +4356 / -805
**Final gate:** `tsc --noEmit` clean in Sync scope · `npm run test:run` 333/333 passing

---

## Goal

Bring Global Projects to feature + data parity with local Projects, and route them through the existing offline-first `SyncManager` so they behave like first-class synced entities. Direction chosen by stakeholder: **Parity** (keep two models, fill the gaps), rather than Unify (single table with visibility flag) or Hybrid.

Plan: `docs/SyncAgents-plan-2026-05-12.md`. Team roster: `.claude/SyncAgents.md`.

---

## Audit Phase

| Agent role | Ownership area | Files read |
|---|---|---|
| Schema Architect (×4 parallel) | Postgres migrations + RLS for global_* tables | `supabase/schema.sql`, `supabase/global-projects-schema.sql`, `supabase/migrations/*` |
| Type & Sync Bridge Engineer (×5 across 4 waves) | TS types + field-map + sync-manager + reconcile + tests | `src/types/*`, `src/lib/sync/*`, `src/lib/global-projects/*`, `src/lib/db.ts` |
| Hooks & API Engineer (×2 parallel) | api.ts CRUD + use-global-projects hooks + sync-provider wiring | `src/lib/global-projects/api.ts`, `src/hooks/use-global-projects.ts`, `src/providers/sync-provider.tsx` |
| Global UI Parity Engineer (×2 parallel) | Global project page UI + standalone tool page filters | `src/app/global-projects/[...slug]/client-page.tsx`, `src/app/projects/[...slug]/client-page.tsx`, `src/app/{pid-tuning,ping,trend-viewer,psychrometric,register-tool}/page.tsx` |

---

## Fixes Applied

### P0 — Data model alignment

**`supabase/migrations/add-global-project-parity-fields.sql`** *(Schema Architect A)*

- *Issue:* `global_projects` was missing the data fields that the local `projects` table carries, so sharing a local project to global lost `customerName`, `technicianNotes`, `panelRosterSummary`, `networkSummary`, `contacts`, and had no `sync_version` for offline-sync conflict tracking.
- *Fix:* Idempotent `alter table` adding the 5 content columns plus `sync_version int not null default 1`.

**`supabase/migrations/add-global-project-preferences.sql`** *(Schema Architect A)*

- *Issue:* Per-user preferences like `isPinned` / `isOfflineAvailable` couldn't live on `global_projects` (which is shared across members), so they had nowhere to be stored.
- *Fix:* New table with composite PK `(user_id, global_project_id)`, RLS scoped to `auth.uid() = user_id`, two indexes, `set_updated_at()` trigger.

**`supabase/migrations/add-local-projects-global-link.sql`** *(Schema Architect A)*

- *Issue:* Sharing a local project repeatedly created a fresh global twin every time — no identity link between the two sides.
- *Fix:* `projects.synced_global_id uuid references global_projects(id) on delete set null` plus partial index. Enables idempotent reconcile.

**`supabase/migrations/add-sync-columns-global-children.sql`** *(Schema Architect B)*

- *Issue:* Existing global child tables (notes, devices, ip_plan, daily_reports, project_files, network_diagrams) lacked `sync_version` — couldn't be queue-synced through SyncManager.
- *Fix:* `alter table ... add column if not exists sync_version int not null default 1` on all 6.

**10 × `supabase/migrations/add-global-*.sql`** *(Schema Architect C + D)*

- *Issue:* Local toolkit has 10 child-entity types (PPCL, terminal logs, PID, psych, register, ping, trend, connection profiles, field panels, notepad) that had no global twin — all data created in those tools was per-user and couldn't be shared.
- *Fix:* 10 new tables, each: mirrors local column shape but with `global_project_id NOT NULL` (deliberate divergence from local nullability — RLS predicate `is_global_project_member(null)` returns false, so a nullable column would create permanently invisible rows), `created_by` + `updated_by` audit columns, 4 RLS policies (member view / member create / creator-or-admin update / creator-or-admin delete), 2 indexes, `updated_at` trigger.

**`supabase/migrations/hotfix-global-register-calculations-not-null.sql`** *(orchestrator hotfix)*

- *Issue:* Schema Architect C agent kept `global_register_calculations.global_project_id` nullable to mirror local `register_calculations.project_id` semantics, missing that Schema D's NOT-NULL invariant applies to *all* global child tables (RLS would otherwise orphan rows).
- *Fix:* One-line `alter column ... set not null` migration + corrected the original `add-global-register-calculations.sql` so fresh DB bootstraps are right.

### P0 — Type + sync engine wiring

**`src/types/index.ts` + `src/types/global-projects.ts`** *(Type & Sync Bridge Engineer, Wave 1)*

- *Issue:* `SyncEntityType` union had no values for global entities — SyncManager could not push or pull any `global_*` table. `GlobalProject` interface was missing all parity fields. No TS interfaces existed for the 10 new global child types.
- *Fix:* +19 `SyncEntityType` values (`globalProjects` through `globalProjectPreferences`), `Project.syncedGlobalId?: string`, 5 new fields on `GlobalProject` + 2 optional per-user join-fields, 11 new global child interfaces (one per entity family). Preserved typed sub-shapes (`PidTuningValues`, `PsychState`, `DiagramNode[]`) — did not propagate `unknown[]` tech debt.

**`src/lib/sync/field-map.ts`** *(Type & Sync Bridge Engineer, Wave 2)*

- *Issue:* The push/pull mapping layer knew nothing about global entities. `Record<SyncEntityType, string>` at line 7 went from 19 → 38 required keys — would fail to compile.
- *Fix:* +416 / -1 lines (389 → 802):
  - `entityTypeToTable` extended to all 38 entities.
  - New `GLOBAL_ENTITY_TYPES` set + `isGlobalEntity()` helper for downstream consumers.
  - Three-class handling in `toSupabaseRow`: most globals get `created_by`/`updated_by` audit; `globalActivityLog` (append-only) and `globalProjectPreferences` (composite PK) keep `user_id`; `globalProjects` has `created_by` only (no `updated_by` column).
  - `toSupabaseRow(entityType, entity, userId, options?: { isUpdate?: boolean })` — `isUpdate` flag controls whether `created_by` is stamped (insert) or skipped (update).
  - `NULL_TO_EMPTY_STRING` coercion on pull for `globalTerminalLogs.{startedAt,endedAt}` and `globalConnectionProfiles.lastConnectedAt` — DB columns are nullable but TS types are required `string`.
  - `REQUIRES_GLOBAL_PROJECT_ID` set (17 entries) feeds `validateSyncable` so the queue rejects rows without a parent before they hit Postgres.
  - `SYNC_ORDER` extended with 19 global types in dependency order (`globalProjects` before children, `globalProjectPreferences` last).
  - `UUID_FK_COLUMNS` extended with `global_project_id` and `synced_global_id` for sanitization.

**`src/lib/sync/sync-manager.ts` + `src/lib/db.ts`** *(Type & Sync Bridge Engineer, Wave 3a)*

- *Issue:* SyncManager pulled only `user_id = auth.uid()` rows — wouldn't see any global entity (which is membership-scoped). No Dexie stores existed for the global mirrors. Existing realtime was per-hook (one channel per `useRealtimeRefresh` call), wouldn't scale to 17+ global tables.
- *Fix:*
  - **sync-manager.ts** (+~270/-30): branched pull filter — `globalProjects` filters `id in (memberProjectIds)`, `globalProjectPreferences` filters `user_id = userId`, all other globals filter `global_project_id in (memberProjectIds)`. Skips pull entirely when memberships empty. Membership cache helper with 30s TTL keyed by userId. Push path uses the new `{ isUpdate }` flag. `globalProjectPreferences` upsert uses `onConflict: 'user_id,global_project_id'`. Post-process patches `deletedAt: null` on global rows so TS interfaces stay consistent. New public methods `subscribeToGlobalRealtime(): Promise<() => void>` and `unsubscribeFromGlobalRealtime(): void` — opens **two consolidated channels** (one for `global_projects` + preferences, one for all 17 global children) instead of 19 separate ones.
  - **db.ts** (+~120): Dexie bumped 18 → **19**. 19 new object stores (one per global entity). `globalProjectPreferences` uses a synthetic `prefKey` string `"${userId}|${globalProjectId}"` as PK because Dexie compound keys don't round-trip cleanly through the IDB layer's typings. `BasToolkitStoreName` extended → fixed 7 pre-existing `TS2345` errors as a side-effect. `clearAllData` includes the new stores.

**`src/lib/global-projects/reconcile.ts` (NEW) + deleted `migrate.ts`** *(Type & Sync Bridge Engineer, Wave 3b)*

- *Issue:* The old `migrate.ts` was fire-and-forget, regenerated UUIDs on every call (no identity), folded `technicianNotes + panelRosterSummary` into a single `description` column (lossy round-trip), only covered 4 entity types (notes/devices/ip/reports), dropped `FieldNote.author` and replaced with hardcoded `'User'`, never re-uploaded changed files.
- *Fix:* 1429-line idempotent, ID-stable reconcile:
  - Two functions: `reconcileLocalToGlobal(localProjectId)` and `reconcileGlobalToLocal(globalProjectId)`.
  - `Project.syncedGlobalId` resolves identity — second call on the same project updates in place rather than duplicating.
  - 14 entity-type pairs covered (notes / devices / ipPlan / dailyReports / activityLog / networkDiagrams / files / ppcl / terminal / pid / psych / register / ping / trend / connection). Field panels and notepad **excluded** because no local TS interface exists yet (flagged for follow-up).
  - `customerName ↔ customer_name`, `technicianNotes ↔ technician_notes`, `panelRosterSummary ↔ panel_roster_summary`, `networkSummary ↔ network_summary`, `contacts ↔ contacts` — each gets its own column. No more concatenation.
  - Activity log: appends one new `'reconciled'` entry on the destination instead of duplicating every row.
  - Files: upload changed blobs to Supabase Storage on push, download on pull, preserve metadata when no blob exists. Skip re-upload if destination's `updated_at` matches.
  - `share-to-global-dialog.tsx` and `save-to-local-dialog.tsx` rewritten with new prop shapes — accept only `project`/`globalProjectId`, query counts on render, advertise every reconciled entity type in the "Will be migrated" list.

### P1 — Hook + provider integration

**`src/lib/global-projects/api.ts`** *(Hooks & API Engineer, Step 3a)*

- *Issue:* No CRUD existed for the 10 new global child tables or for `global_project_preferences`.
- *Fix:* +~920 lines, 43 new exports. 4 functions × 10 standard entity families (`fetch`/`add`/`update`/`delete`) using the existing `fetchProjectEntities` / `updateEntity` / `softDelete` helpers. Composite-PK preferences get `fetchGlobalProjectPreferences` (returns single row or null), `upsertGlobalProjectPreferences` (Supabase `.upsert` with `onConflict: 'user_id,global_project_id'`), and **hard-delete** `deleteGlobalProjectPreferences` (no `deleted_at` on that table).

**`src/hooks/use-global-projects.ts` + `src/providers/sync-provider.tsx`** *(Hooks & API Engineer, Step 3b)*

- *Issue:* No React hooks for the new entities. `SyncManager.subscribeToGlobalRealtime()` was opt-in and never invoked anywhere. Membership cache had no invalidation path.
- *Fix:*
  - 11 new hooks following the existing `useGlobalProjectNotes` pattern (state + `refresh` + `useRealtimeRefresh` + 3 CRUD callbacks per entity).
  - `useGlobalProjectPreferences(projectId)` returns `{ preferences, isPinned, isOfflineAvailable, lastViewedTab, update, reset }` with safe defaults.
  - `useGlobalProject(id)` augmented non-breakingly: merges `isPinned` / `isOfflineAvailable` from preferences onto the returned project via `useMemo`.
  - SyncProvider invokes `manager.subscribeToGlobalRealtime()` after `manager.start()`, stores cleanup in `realtimeCleanupRef`, tears down on unmount + on logout.
  - Custom DOM event `bau-suite:global-membership-changed` dispatched after `createProject` / `joinProject` / `leave` / `remove` — SyncProvider listens and re-fires `subscribeToGlobalRealtime()` to refresh the 30s membership cache. (Couldn't use `getSyncManager()` because that helper doesn't exist in `sync-bridge.ts`; DOM-event pattern matches existing `emitPullComplete` / `onPullComplete` convention.)

### P1 — Tests

**`src/lib/sync/__tests__/field-map.test.ts` + `sync-manager.test.ts` + new `src/lib/global-projects/__tests__/reconcile.test.ts`** *(Type & Sync Bridge Engineer, Wave 4 + continuation)*

- *Issue:* No test coverage for the new global-entity behavior. Pre-existing `TS7023` error on `createMockSupabase` (self-referencing return type). 2 pre-existing sync-manager tests broke when Wave 3a added new field-map imports.
- *Fix:*
  - Added named `MockSupabaseClient` interface, annotated `createMockSupabase()` explicitly → `TS7023` resolved.
  - Updated `vi.mock('../field-map')` factory to include the 3 new exports (`isGlobalEntity`, `GLOBAL_ENTITY_TYPES`, `REQUIRES_GLOBAL_PROJECT_ID`) — fixed both failing tests; root cause was mock mismatch, no production bug.
  - field-map tests extended for `isGlobalEntity`, 3-class `toSupabaseRow`, `fromSupabaseRow` null-coercion regressions, `validateSyncable` for the global parent-id requirement, `SYNC_ORDER` ordering invariants.
  - sync-manager tests extended for membership-based pull filter, consolidated 2-channel realtime subscribe + teardown, `deletedAt: null` post-process.
  - 9-section reconcile.test.ts covering: 14-pair invariant, idempotency, ID stability both directions, `syncedGlobalId` writeback + stale recovery, lossless project field round-trip, activity-log-as-append, files-without-blob metadata preservation.
  - Test count: 322 → 333 passing (+11 net: +9 reconcile tests, +2 previously-failing tests fixed).

### P2 — UI parity

**`src/app/global-projects/[...slug]/client-page.tsx`** *(Global UI Parity Engineer, Step 4a)*

- *Issue:* Global project page had 8 tabs vs local's 12, no Overview-tab editors for the new parity fields, no per-user pin/offline toggle.
- *Fix:* +807 / -31 in a single file:
  - 3 new tabs (`ppcl-programs`, `terminal-logs`, `network-diagrams`) inserted between `documents` and `activity`. Tab counts wired into the sidebar badges.
  - **PPCL tab**: forked inline `GlobalPpclTab` (Preview / Delete / Create-empty). Reused local `PpclPreviewDialog` by shimming `GlobalPpclDocument` → `PpclDocument` shape. "Open in Editor" disabled with a toast — the PPCL editor route is local-only and would need its own `?global=1` mode (deferred).
  - **Terminal Logs tab**: forked inline `GlobalTerminalLogsTab` (expand / Download `.txt` / Delete).
  - **Network Diagrams tab**: placeholder `EmptyState` — no `fetchGlobalNetworkDiagrams` / `useGlobalProjectNetworkDiagrams` exists yet (flagged below).
  - Overview tab: inline edit-in-place rows for `customerName`, `technicianNotes`, `panelRosterSummary`, `networkSummary`. Contacts editor with Add / Edit / Delete — reused `contact-dialog.tsx` unchanged.
  - Extended `EditProjectDialog` modal with the same fields for bulk edit.
  - Two header toggles (Pin/PinOff, Download/CloudOff) wired to `useGlobalProjectPreferences(id).update`.

**5 standalone tool pages** *(Global UI Parity Engineer, Step 4b)*

- *Issue:* Tools accessed from a global project URL still wrote data to local IndexedDB rather than the matching `global_*` table.
- *Fix:* PID Tuning, Ping, and Trend Viewer pages now read `?globalProjectId=` and swap from local to global hooks at the page level (data flows to the right table). Psychrometric and Register Tool got the banner only because their data hooks live in child components (`SessionsPanel`, `CalculationHistory`, `SaveDialog`) outside the agent's edit scope — flagged for follow-up. New shared `src/components/global-projects/global-mode-banner.tsx` provides a consistent breadcrumb back to the global project.

### P3 — Verification tooling

**`supabase/verify-step1-parity.sql`** *(orchestrator)*

- 169-row assertion script: every column / table / RLS policy / index / trigger from Step 1 migrations. Read-only (uses a `create temp table on commit drop`). Three result panels (all checks · summary · failures-only) so a single SQL Editor paste tells you green or what to fix. Caught the `register_calculations.global_project_id NOT NULL` divergence that prompted the hotfix migration.

---

## Housekeeping

- Updated `.claude/SyncAgents.md` with the team roster (4 agent roles, color/voice/traits, file-ownership maps, conflict-resolution rules).
- Authored `docs/SyncAgents-plan-2026-05-12.md` as the canonical implementation spec (9 sections, ~570 lines) that every agent read before starting their wave.
- Installed dependencies (`npm install --no-audit --no-fund`) — no `node_modules` existed at the start of the session. `package-lock.json` was modified as a side effect.
- Two `vi.mock` factories in `sync-manager.test.ts` updated to track the new field-map exports (would have silently broken further down the line otherwise).
- `.claude/settings.local.json` was touched during the session (permissions registered). Not a parity change.

---

## Verification

| Check | Command | Result |
|---|---|---|
| Step-1 migration parity | Paste `supabase/verify-step1-parity.sql` into SQL Editor | 169/169 (after `register_calculations` hotfix applied) |
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit` | **0 errors** in `src/lib/sync`, `src/lib/global-projects`, `src/types`, `src/hooks`, `src/providers`, `src/app/global-projects`, `src/app/{pid-tuning,ping,trend-viewer,psychrometric,register-tool}`, `src/components/global-projects`. Pre-existing Next.js-noise errors in unrelated areas (Tauri / network-diagram / terminal pages) are out of scope. |
| Unit tests | `npm run test:run` | **333/333 passing** across 8 test files (~500ms) |
| ESLint | `npx eslint` on touched files | 0 new errors. 1 pre-existing `react-hooks/set-state-in-effect` warning on `ping/page.tsx:322` (untouched) |

---

## Known Follow-Ups (not in scope for this session)

1. **`globalNetworkDiagrams` CRUD + hook missing.** Table + type exist, but `api.ts` has no `fetch/add/update/deleteGlobalNetworkDiagram`, and no hook. Step 4a left the global page tab as a placeholder `EmptyState`. Adding these (4 API functions + 1 hook) lights up the tab.
2. **Psychrometric + Register Tool data-path swap incomplete.** Banner shows when `?globalProjectId=` is present, but the underlying `usePsychSessions` / `useRegisterCalculations` hooks live in child components (`SessionsPanel`, `CalculationHistory`, `SaveDialog`). To finish: pass `globalProjectId` down as a prop, or context-ify the hooks.
3. **Field panels and notepad have no local Supabase table or `SyncEntityType` entry.** Wave 3b excluded them from reconcile because the local side never had types or sync wiring. To extend parity: add `FieldPanel` / `ProjectNotepadEntry` interfaces to `src/types/index.ts`, add `'fieldPanels'` / `'notepadEntries'` to `SyncEntityType`, add the local Supabase tables + a migration, then extend `RECONCILED_ENTITY_PAIRS` in `reconcile.ts`. Alternatively, accept them as global-only.
4. **Legacy `global_projects.description` blobs.** Existing global projects created by the old `migrate.ts` have `description` set to `technicianNotes + panelRosterSummary` concat. A one-time data-fix script could split them — or just leave it; new reconciles will write both columns cleanly.
5. **`useRealtimeRefresh` empty-filter wart.** When the consumer passes `undefined` for a filter, it still opens an unfiltered channel. Step 4b flagged it; adding an early-return on `!projectId` inside the helper would tighten this.
6. **`getSyncManager()` not exported from `sync-bridge.ts`.** Step 3b used a DOM event to reach the SyncManager from `use-global-projects.ts` rather than touch the bridge file (out of scope). A future cleanup could export `getSyncManager()` so the DOM event becomes optional.
7. **File version blob storage.** `reconcile.ts` uploads only the current version's blob — old `ProjectFile.versions[]` entries with `blobKey` references won't resolve on the other side. Per the plan, multi-version blob round-trip is a Step-4+ refinement.
8. **PPCL editor route** is local-only — global PPCL docs can be previewed but not edited inline. A `?global=1` mode for `/ppcl-editor` would close this gap.
9. **`isOfflineAvailable` is just a flag today** — actual offline cache implementation (pre-pulling files / pinning Dexie data per project) is explicitly deferred per the original plan.
