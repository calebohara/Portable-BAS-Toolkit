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

## Follow-up
- One-time legacy demo-row purge (the historical demo projects already in some cloud accounts) is a separate cleanup — will provide a targeted SQL once the propagation fix is deployed so a manual delete actually sticks.
- **Remaining phases:** 1b (queue amplifier: fullSync dirty-tracking, error dedup, backoff), 1c (same-device isolation, cross-user push guard for all global entities, pull/realtime dirty-guard), Phase 2 (preferences delete, restore-from-cloud, conflict logic on sync_version), Phase 3 (field-map allowlist, atomic cascades, FK ordering), Phase 4 (verification suite).
