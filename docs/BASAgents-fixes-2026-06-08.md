# BASAgents Fixes — 2026-06-08

**Source:** [docs/SyncAuditAgents-findings-2026-06-08.md](./SyncAuditAgents-findings-2026-06-08.md). Owner approved full phased sync hardening (Phases 1–4). This log covers **Phase 1a — delete correctness / resurrection**.

## Header block

| Field | Value |
|-------|-------|
| Date | 2026-06-08 |
| Agent | Platform Engineer (sync) |
| Scope | Phase 1a: deletes propagate and can't resurrect (audit Finding #1) |
| Files changed | 3 (sync-manager, db, + test) |
| Tests | **387 passed** (7 new delete-propagation tests) |
| TypeScript / Lint | clean |

## Fix — deletes now propagate and stick (audit Finding #1, P0)

**Confirmed mechanism:**
- *Global entities:* pull stamped `deletedAt = null` on every pulled global row; `toSupabaseRow` mapped `deletedAt → deleted_at`, so a `fullSync` re-push of a stale-but-live local copy emitted `deleted_at: null` → `ON CONFLICT DO UPDATE` **un-deleted the cloud tombstone** (resurrection).
- *Local entities:* every incremental pull filtered `deleted_at IS NULL`, so soft-delete tombstones were **invisible** to other devices; full pulls were additive-only. Deletes never stuck → old/demo rows reappeared.

**Changes:**
1. **Tombstone-aware incremental pull** (`sync-manager.ts`): the `deleted_at IS NULL` filter now applies **only on first full hydration** (`lastPulledAt == null`). Incremental pulls fetch tombstoned rows and route `deleted_at != null` rows to a local delete (`bulkDeleteSilent` / project cascade) — activating the previously-dead delete branch. Append-only logs + `globalProjectPreferences` keep their existing handling.
2. **No more resurrection** (`field-map.ts`): added `deletedAt` to `LOCAL_ONLY_FIELDS`, so `toSupabaseRow` **strips `deleted_at` from every create/update push**. `deleted_at` is now owned solely by the delete path (`now()`) and `restoreFromCloud` (`null`), both of which write it directly. A re-push can never null a cloud tombstone again.
3. **Subtractive full pull** (`sync-manager.ts`): after a full `pullSync(null)`, local rows whose id is absent from the cloud's live set are removed (cascade for projects/globalProjects). Gated to full-pull + a `supportsSubtractivePull` allow-set (user-owned + global child tables that pull completely); append-only logs and preferences excluded.
4. **Local-table delete propagation:** local/personal tables (no realtime channel) now get remote deletes via the tombstone-aware pull (#1).

### Critical data-loss guard added (caught in review before shipping)
`triggerFullPull()` (= `pullSync(null)`) is invoked by the user-facing **"Update from cloud"** button — on a device that may hold **un-pushed local work**. Without a guard, the subtractive step (#3) would cascade-delete an offline-created/edited row simply because it isn't in the cloud yet. **Fix:** new `getUnpushedSyncItemKeys()` (`db.ts`) returns all `pending`/`syncing`/`failed` queue keys; the subtractive filter now skips any row with an un-pushed queue item, and if the queue read fails it skips **all** subtractive deletes (fail-safe). So offline creates/edits are never reaped before they sync.

## Verification
- `npx tsc --noEmit` clean; `eslint` clean; `npx vitest run` — **387 passed**, including 7 new tests: incremental pull applies a local delete for a tombstoned row; full pull subtractively removes a stale row (and clears on empty cloud); push strips `deleted_at` (no resurrection); and **un-pushed pending `create`/`update` rows survive a full pull** while truly-stale rows are reaped.

---

## Phase 1c — data-integrity / isolation (audit Findings #2, #3, #4, all P0) — v4.27.0

**Files:** sync-manager, field-map, db, auth-provider, sync-provider, app-store + 2 new test files. **404 tests pass** (17 new).

- **Same-device user isolation (#2):** persist `lastAuthUserId`; on a genuine user *change* (or sign-out) the app now `clearAllData()` + resets sync cursors (`lastPulledAt`/`lastSyncedAt`/`lastConsistencyCheckAt`) **before** the new SyncManager starts — so the new user gets a clean hydration of their own data and the previous user's queued items can never be pushed under the new identity. Carefully does NOT wipe on same-user re-auth/token-refresh, first-ever login, or an offline-only/never-signed-in user (all covered by tests). Pure `decideUserIsolation()` truth-table is unit-tested.
- **Cross-user push guard for ALL global entities (#3):** generalized the `globalActivityLog`-only guard to every `GLOBAL_AUDITED_ENTITY_TYPES` member + `globalProjects` via `foreignGlobalAuthor()` (keys on `createdBy`/`created_by`, or `userId` for the activity log). A push of a row authored by another member (and you're not editing via the admin live-path) is **dropped as a successful no-op** — no retry, no syncError. `fullSync` no longer enqueues foreign-authored global rows, and a `42501` on a global update is now a non-retryable drop backstop. (Admin edits still succeed through the direct `api.ts` write path; only futile sync-queue re-pushes of foreign rows are suppressed.)
- **Ingress dirty-guard (#4):** before `bulkPutSilent` overwrites a local row on pull/realtime, it checks the un-pushed queue (`hasUnpushedSyncItem` / `getUnpushedSyncItemKeys`) and **skips the overwrite if the row has an un-pushed local edit** (keeps the user's offline edit; it resolves on push). Fail-safe: if the queue read fails, no overwrites. Remote deletes still apply (a delete-vs-edit conflict is deferred to Phase 2).

---

## Phase 1b — queue amplifier (audit Findings #5, #6 + backoff/auto-recovery) — v4.28.0

**Files:** sync-manager, db (IndexedDB schema → v22, new `syncMeta` keyval store), types, sync-provider, reset-sync-state-card + 2 new test files. **419 tests pass** (15 new). This stops "errors out of hand" and "stuck at 3."

- **`fullSync` dirty-tracking (#5):** `fullSync` used to re-enqueue *every* row as `update` (and reset each poison item's `retriedCount` to 0, so it never went terminal). Now it keeps a per-entity high-water mark (`lastFullPush:<entity>` in `syncMeta`) and **enqueues only rows newer than the mark** — a full sync of an unchanged dataset enqueues ~0 rows. `clearSyncQueueExceptFailed()` + `addSyncItemPreservingRetry()` carry over an existing item's `status`/`retriedCount` instead of resetting (so poison items reach terminal `failed` and stop). Manual reset / user-switch clear `syncMeta` to force a full re-push.
- **`addSyncError` dedup + capture-at-terminal (#6):** error id is now a deterministic signature `${entityType}-${entityId}-${errorCode}`; `addSyncError` **upserts** (bumps `occurrences`/`lastSeenAt`) instead of inserting a new random-id row every retry — one recurring failure no longer churns the 100-row cap. The catch now captures only on first occurrence / terminal failure / non-retryable drop (not every transient retry), and fires the inspector event only on a new signature.
- **Backoff + auto-recovery:** failed items get `nextRetryAt = now + 5s·2^retriedCount` (cap 5 min), and `getPendingSyncItems` skips not-yet-due items (no more 5 retries in 25s). A reconnect handler + 3-min sweep re-pends **transient** failures (network/5xx/JWT) via `isTransientSyncError`, while **permanent** ones (42501/23503/23505/42703/PGRST204) stay parked.

## Phase 2 — latent P1 failures + conflict correctness (audit Findings #7, #8, #9) — v4.29.0

**Files:** sync-manager, reconcile + new migration `add-sync-version-insert-defaults.sql` + extended/new tests. **428 tests pass** (7 new `phase2-conflict-correctness.test.ts` + extended reconcile harness). This closes the three P1s: the guaranteed repeating `42703`, the silent "Restore from Cloud" no-op, and clock-skew conflict data-loss.

- **`globalProjectPreferences` hard-delete (#7):** the delete path issued a soft `update deleted_at = now()` against a table that has **no `deleted_at` column** → guaranteed `42703`, retried forever, the moment a user unpinned/removed a shared-project preference offline. Now a real `.delete().eq('user_id', …).eq('global_project_id', …)` by composite key (same fix applied in `resolveDeleteBoth`). No tombstone needed — preferences are per-user pin/visibility state, not audited content.
- **`restoreFromCloud` drops `user_id` filter for global tables (#8):** "Restore from Cloud" filtered **every** table by `user_id`, but global tables key on `created_by` (membership-RLS), not `user_id` → `42703` per global table → shared data never restored. The `.eq('user_id', …)` is now gated on `!isGlobalEntity(entityType)`, so global rows restore via their membership RLS while personal tables keep their owner filter.
- **`sync_version` is the primary conflict comparator everywhere (#9):** previously `sync_version` was consulted **only** in the equal-millisecond branch of the push path; differing timestamps were blind last-write-wins, so clock skew/spoof could silently overwrite a newer row. Now:
  - **Push path:** a conflict is raised whenever `remoteVersion > localVersion` **regardless of timestamp** (version check lifted out of the equal-ms branch).
  - **Reconcile** (`reconcile.ts`): `reconcilePairLocalToGlobal` prefetches `sync_version` alongside `id, updated_at`; a remote row with a higher version is skipped (don't clobber newer cloud state), and a higher-version local row is pushed regardless of timestamp.
  - **Server-owned insert defaults** (new migration `add-sync-version-insert-defaults.sql`): a BEFORE INSERT `init_sync_version()` trigger stamps `updated_at = now()` and `sync_version = 1` server-side, so a client can no longer decide a conflict winner with a skewed/spoofed INSERT timestamp. Pairs with the existing `bump_sync_version` BEFORE UPDATE trigger so the server owns the version monotonicity on both paths.

### ⚠️ Manual step required
`supabase/migrations/add-sync-version-insert-defaults.sql` is **PENDING** — it must be applied via the **Supabase SQL Editor** (no CLI in this project). It is marked pending in `docs/MIGRATIONS.md` (row #48) with probe #47 in `check-migrations.sql`. Until applied, INSERTs still client-stamp `updated_at`/`sync_version` (the prior behavior) — the client-side comparator fixes already help, but the server-owned guarantee only lands after the migration runs.

## Phase 3 — durable hardening (audit Finding #10 + P2: atomic cascade, FK ordering) — v4.30.0

**Files:** field-map, sync-manager, global-projects/api + new migration `add-cascade-soft-delete-rpcs.sql` + tests. **448 tests pass** (+20 new: 8 allowlist, 8 FK-ordering, 4 cascade-RPC). This converts the recurring "missing-column" failure class from a *silent push error* into a *visible dev warning*, makes the delete cascade atomic, and stops FK-ordering retry churn.

- **Schema-driven column allowlist (#10, the durable root-cause fix):** `toSupabaseRow` was deny-list-only — it pushed ANY key on the local object, defended only by hand-maintained `LOCAL_ONLY_FIELDS`/`SKIP_FIELDS`, so every new local interface field or pull-stamp was a fresh `42703`/`PGRST204` landmine. Added `ENTITY_COLUMN_ALLOWLIST` (a per-`SyncEntityType` Set of real Supabase columns) as the **final default-deny gate**, applied *after* FIELD_OVERRIDES + UUID-FK handling on the post-override `snakeKey`: any mapped column the schema doesn't have is dropped by default (with a deduped dev-only `console.warn` so drift is visible; silent in prod). Existing deny-lists still run first (belt-and-suspenders). **Fails open** for an unmapped future entity (guards against silently dropping everything). The allowlist was derived authoritatively by parsing every `create table`/`alter table … add column` across `supabase/**.sql`, cross-checked so every `FIELD_OVERRIDES` target and every representative TS-interface field maps to an allowed column (zero gaps). Removed the dead `SUPABASE_ONLY_FIELDS` const (the lingering lint warning). **Maintenance obligation:** when a migration adds a column, regenerate the allowlist (documented in-code) — the trade is a visible dev warning instead of a silent prod failure.
- **Atomic server cascade RPC (P2):** reconcile/cascade deletes ran as multiple client statements — a mid-cascade crash orphaned children (`deleted_at IS NULL`) that kept pushing against RLS and could resurrect the parent on the next additive pull (feeding the Phase 1a resurrection class). New migration `add-cascade-soft-delete-rpcs.sql` adds two `SECURITY DEFINER` functions — `cascade_soft_delete_global_project(uuid)` and `cascade_soft_delete_project(uuid)` — that soft-delete the parent + every child table in **one transaction**, enforcing RLS-equivalent auth in the body (global: `is_global_project_admin(id) OR auth.uid() = created_by`; local: `user_id = auth.uid()`), raising `42501` on an unauthorized caller. The queue's `projects`/`globalProjects` delete path (and `api.ts` `deleteGlobalProject`) now **prefer the RPC** and fall back to the legacy single-statement soft-delete only when it's not deployed (`PGRST202`/`42883`/"could not find function"); a real RPC error surfaces for normal retry/drop. Un-migrated devices keep working.
- **FK-ordered queue (P2):** cross-batch, a child (device under a project; global child under a global project) could push before its parent existed in the cloud → `23503` FK violation + retry churn. Added `SYNC_ORDER` (topological entity-type order) + `orderPushBatch`: creates/updates sort **parent-first** (ascending), deletes **child-first** (reverse), creates/updates run before deletes in a mixed batch; stable, non-mutating. `_processQueueInner` now sorts each push batch through it.

### ⚠️ Manual step required
`supabase/migrations/add-cascade-soft-delete-rpcs.sql` is **PENDING** — apply via the **Supabase SQL Editor** (probe #48 in `check-migrations.sql`, MIGRATIONS.md row #49). Until applied, the cascade falls back to the single-statement soft-delete (the prior, non-atomic behavior) — no regression, just not yet atomic.

## Phase 4 — verification (audit Phase 4) — v4.31.0

**Files:** new `src/lib/sync/__tests__/phase4-verification.test.ts` (23 tests) + new doc `docs/SYNC-VERIFICATION.md` + `.gitignore` whitelist line. **471 tests pass** (+23). Closes the audit's verification phase: every Phase 1–3 guarantee now has both an automated invariant and a human-runnable check.

- **Coverage gap-audit + fill (4a):** mapped all 8 invariant areas to existing tests; the existing suite was already solid on 5 of 8. Closed 3 real gaps: (1) **parent cascade on a pulled tombstone** — all prior delete tests used a *leaf* table (`devices`); added tests proving a pulled tombstoned `projects`/`globalProjects` routes to `cascadeDeleteProject`/`cascadeDeleteGlobalProject` (not a flat delete). (2) **cross-user drop across ALL 17 `GLOBAL_AUDITED_ENTITY_TYPES`** — only `globalActivityLog`/`globalDevices`/`globalProjects` were pinned; parametrized the drop-as-no-op + own-author-still-upserts across the whole audited set. (3) **cascade-RPC fallback signals** — only `PGRST202` was pinned; added `42883` and message-only ("could not find the function") fallback tests.
- **Multi-device manual test script (4b):** new `docs/SYNC-VERIFICATION.md` — a numbered, operator-runnable plan covering basic propagation, delete-sticks/anti-resurrection (the demo-project bug), concurrent-offline-edit `sync_version` winner, shared-laptop user-switch isolation, foreign-global-row no-42501-storm, offline-create-survives-"Update from cloud", and parent-with-children cascade (no orphans). Includes a pre-flight checklist for the two PENDING migrations (how to apply + confirm via `check-migrations.sql` probes #47/#48), a "where to watch" section (Sync Error Inspector, syncErrors store, Discord, `ACTIVE-BUGS.md`), and a table mapping each manual scenario to its automated counterpart. Whitelisted in `.gitignore` per the docs gotcha.
- **No implementation gaps found.** Every expected-pass test passed; the one initial failure was a test-harness membership-cache artifact (fixed by using a distinct user id), not a real bug — the Phase 1a/1c/3 contracts behave exactly as claimed.

## Sync hardening — DONE (Phases 1–4)
All four phases of the [SyncAuditAgents audit](./SyncAuditAgents-findings-2026-06-08.md) are shipped: every P0 (delete propagation/resurrection, user isolation, cross-user push, ingress dirty-guard, queue amplifier, error dedup), every P1 (preferences hard-delete, restore-from-cloud, `sync_version` conflict correctness, schema allowlist), and the P2 hardening (backoff/auto-recovery, atomic cascade RPC, FK ordering) — plus full automated + manual verification.

## Follow-up for the owner — two manual SQL steps remain
1. **Apply the two pending migrations** in the Supabase SQL Editor (no CLI in this project), then confirm with `supabase/check-migrations.sql`:
   - `add-sync-version-insert-defaults.sql` (Phase 2, probe #47) — server-owned `updated_at`/`sync_version` on INSERT.
   - `add-cascade-soft-delete-rpcs.sql` (Phase 3, probe #48) — atomic cascade soft-delete RPCs.
   Until applied, the app runs in a documented degraded-but-working fallback (client-stamped version / non-atomic cascade) — no breakage.
2. **One-time legacy demo-row purge:** SQL provided (soft-delete the 5 demo `44OP-` projects). Apply after devices are on v4.26.0+ so the tombstone propagates and sticks.
