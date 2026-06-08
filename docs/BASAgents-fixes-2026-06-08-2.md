# BASAgents Fixes — 2026-06-08 (session 2) — Conflict-flood hotfix

**Trigger:** Owner opened the tool on their work PC after the Phase 1–4 sync
hardening shipped and was hit with **140+ "keep local / keep cloud" conflict
dialogs** at once. Regression introduced by Phase 2 (Finding #9). This is the
hotfix. Follows [BASAgents-fixes-2026-06-08.md](./BASAgents-fixes-2026-06-08.md).

## Header block

| Field | Value |
|-------|-------|
| Date | 2026-06-08 (2nd session) |
| Agent | Platform Engineer (sync) |
| Scope | Stop spurious sync conflicts for content-identical rows (v4.31.1) |
| Files changed | 2 (sync-manager + test) |
| Tests | **473 passed** (2 new) |
| TypeScript / Lint | clean |

## Audit Phase — root cause

The flood is the product of **two interacting behaviors**, only one of which is new:

1. **fullSync first-run mass-enqueue (pre-existing).** When the user clicks the
   sync chip ("Back Up Now"), `fullSync` runs. Its Phase 1b dirty-tracking skips
   rows older than a per-entity high-water mark — but on a device's **first**
   full sync after the v22 schema bump there is **no mark yet** (`prevMarkTime =
   -Infinity`), so it enqueues **every** local row as an `update`.
2. **Phase 2 version-primary conflict comparator (the regression).** For each
   `update`, conflict detection now raises a conflict whenever `remoteVersion >
   localVersion` **regardless of timestamp** (Finding #9). The work PC's rows had
   **stale `syncVersion`** numbers — the home PC had bumped the cloud
   `sync_version` on those same rows during all the testing — so **every
   unchanged row** tripped `versionConflict`, even though the content was
   byte-for-byte identical.

Net: ~140 unchanged rows → ~140 spurious "keep local / keep cloud" prompts. Before
Phase 2, a stale-version re-push of an identical row just silently upserted
(idempotent no-op); Phase 2 turned that same case into a hard conflict.

## Fixes Applied

### P0 — Content-equality gate before raising a conflict
- **`src/lib/sync/sync-manager.ts`:** added a content-equality gate inside the
  conflict branch. Before storing a conflict, compare the row the client *would
  push* (`toSupabaseRow` output) against the existing cloud row, **ignoring
  volatile/server-owned columns** (`updated_at`, `updated_by`, `created_at`,
  `created_by`, `sync_version`, `deleted_at`, `fts`). If every client-owned
  column matches (`pushRowMatchesRemote`), it is **not** a real conflict — the
  local copy just has a stale version number. The manager then **silently
  reconciles**: adopts the cloud row locally via `bulkPutSilent` (so `syncVersion`
  catches up), drops the queue item, and returns success — **no prompt, no
  push**. A genuine content divergence still raises the conflict exactly as
  before.
  - Helpers added at module scope: `pushRowMatchesRemote`, `columnValuesEqual`
    (treats `null`/`undefined`/`''` as equivalent "empty"; deep-compares jsonb
    values), and `stableStringify` (sorted-key, order-insensitive).
- **Why this is the right layer:** the comparison is apples-to-apples against the
  exact column set the client owns (post-Phase-3 allowlist), so it can't be
  fooled by server-managed columns, and it converts the one-time first-run
  fullSync sweep from 140 *dialogs* into 140 silent background reconciles. After
  that pass the high-water mark advances and subsequent full syncs skip the
  unchanged rows entirely.

## Verification
- `npx tsc --noEmit` clean; `eslint src/lib/sync` clean; `npx vitest run` —
  **473 passed**, incl. 2 new in `phase2-conflict-correctness.test.ts`:
  (1) identical content + higher remote `sync_version` → **no conflict**, silent
  `bulkPutSilent` reconcile + queue item dropped, no upsert; (2) genuinely
  divergent content + higher remote version → **still raises** the conflict.
- The 4 existing Phase 2 Fix-C tests still pass unchanged (their mock remote rows
  have differing content, so the gate correctly lets the real conflicts through).

## Follow-up for the owner
- **Immediate relief on the work PC (no new build needed):** Settings → **Reset
  Sync State** → *Reset sync state*. It clears all stuck conflicts + the queue and
  re-pulls from the cloud. The conflicts were spurious (identical content), so
  nothing real is lost. Don't click "Back Up Now" again on the old build until the
  hotfix is installed — but even if you do, the hotfix makes it a no-op.
- **Durable:** once on v4.31.1, a first-run full sync reconciles stale versions
  silently — the flood cannot recur.
- (Unchanged from session 1) two migrations still pending manual apply:
  `add-sync-version-insert-defaults.sql`, `add-cascade-soft-delete-rpcs.sql`.
