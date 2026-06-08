# SyncAuditAgents Fix Log — 2026-06-08

Remediation of the P0 + four P1 findings from
[`docs/SyncAuditAgents-findings-2026-06-08-2.md`](./SyncAuditAgents-findings-2026-06-08-2.md)
(the read-only session-2 re-audit). P2/P3 findings are deferred to a follow-up.

## Header

- **Date:** 2026-06-08 (session 2 remediation)
- **Originating findings:** `docs/SyncAuditAgents-findings-2026-06-08-2.md` (1 P0, 4 P1 confirmed)
- **Scope this pass:** P0 + all four P1 (data-loss, queue, convergence, realtime)
- **Files changed:** 12 (6 source, 6 test) + `.gitignore` + this log
- **Diff:** +460 / −104 across source & tests
- **Tests:** 480 passing (was 480 → +6 new regression tests, net same count after rewrites)
- **Version:** v4.31.2 → v4.32.0

## Audit Phase

(Findings produced by the prior read-only multi-agent audit — see the findings
doc. Files read during remediation:)

| Area | Files |
|------|-------|
| Reconcile (Save-to-Global) | `src/lib/global-projects/reconcile.ts` |
| Push queue / finalizers / realtime | `src/lib/sync/sync-manager.ts` |
| Queue + cascade primitives | `src/lib/db.ts`, `src/types/index.ts` |
| Pull scheduling / realtime wiring | `src/providers/sync-provider.tsx` |
| Field map (context) | `src/lib/sync/field-map.ts` |

## Fixes Applied

### P0 — Reconcile cross-counter `sync_version` silently drops a member's edit

- **File:** `src/lib/global-projects/reconcile.ts` (`reconcilePairLocalToGlobal`)
- **Issue:** The local→global reconcile compared the LOCAL row's `syncVersion`
  (the `field_notes.sync_version` counter, round-tripped on local pull) against
  the GLOBAL row's `sync_version` (the independent `global_field_notes.sync_version`
  counter). These count different rows in different tables and are never
  reconciled, so once the global counter exceeded the unrelated local one (the
  common case after any global-side edit) a genuinely newer local edit was
  `skipped` — silently, no conflict, no error — on the documented "Share local
  updates to Global" action. Core multi-user data-loss path.
- **Fix:** Removed the cross-counter version guard entirely. Reconcile is the
  explicit "push my local state to the linked global project" action, so the only
  comparable signal is `updated_at`: skip when the global row is at-or-newer
  (don't clobber a newer peer edit), otherwise push. A strong code comment now
  forbids re-introducing the version comparison. Rewrote the two tests that
  codified the buggy skip into correct timestamp-semantics regression tests.

### P1-4 — In-flight enqueue race destroys an edit/delete (delete-resurrection)

- **Files:** `src/lib/sync/sync-manager.ts` (`processItem`), `src/lib/db.ts`,
  `src/types/index.ts`
- **Issue:** The queue is keyed on a deterministic id, so an edit/delete the user
  enqueues *during* an item's in-flight push overwrites that row (status reset to
  `pending`, fresh payload). On success the code unconditionally `deleteSyncItem`'d
  the row using its stale in-memory copy — destroying the newer work. The
  delete-during-create variant was the worst: the queued delete was dropped after
  the create succeeded, so the cloud row stayed live and the next pull
  re-hydrated it → **a delete that doesn't stick**.
- **Fix:** Compare-and-swap. `processItem` stamps a fresh `syncToken` when it flips
  a row to `syncing`; new atomic helpers `deleteSyncItemIfToken` /
  `updateSyncItemIfToken` (single readwrite IndexedDB transaction) only mutate the
  row when the STORED token still matches. A mid-flight enqueue clears the token,
  so the completing push leaves the newer item intact for the next cycle. Applied
  to the success delete and all three failure-path updates (token-expired requeue,
  terminal-failed, backoff-pending). New db-level CAS tests against fake-indexeddb.

### P1-1 — Pulled project tombstone re-enqueues an un-pushable DELETE (perpetual 42501)

- **Files:** `src/lib/db.ts` (cascade helpers), `src/lib/sync/sync-manager.ts`
- **Issue:** `cascadeDeleteProject` / `cascadeDeleteGlobalProject` unconditionally
  fire `notifySync('delete', …)` for the parent and every child. When a device
  APPLIES a project tombstone PULLED/streamed from the cloud, that re-enqueues
  outbound delete pushes — which a non-admin member can never satisfy (the cascade
  RPC is creator/admin-only) → 42501 churn, and the `42501` non-retryable drop was
  scoped to `action !== 'delete'`, so it retried to MAX and re-armed on realtime
  re-delivery.
- **Fix:** Added a `{ silent: true }` option to both cascade helpers that skips the
  trailing `notifySync` re-enqueue loops, and passed it from all six cloud-apply
  call sites (pull tombstone, subtractive reconcile, realtime — both delete and
  soft-delete). User-initiated deletes/leaves in the hooks still call without
  `silent` so deletes propagate. Backstop: broadened the `42501` non-retryable
  drop to include global `delete` actions. New regression tests assert the silent
  cascade on pull and the global-delete 42501 drop.

### P1-2 + P1-3 — Convergence backstop: periodic incremental pull + realtime reconnect backfill

- **Files:** `src/providers/sync-provider.tsx`, `src/lib/sync/sync-manager.ts`
- **Issue (P1-2):** The only pull triggers were first-login, the `online` event,
  and manual actions; the 5s manager interval only PUSHES, and realtime covers
  `global_*` tables only. An idle-but-online device (and every local user-owned
  table on a second device) never converged between an `online` flip and a manual
  refresh.
- **Issue (P1-3):** Both realtime channels called `.subscribe()` with no status
  callback. On a websocket drop where `navigator.onLine` stays true, Supabase
  silently auto-rejoins but `postgres_changes` events for the gap are lost — and a
  missed DELETE is a resurrection vector.
- **Fix:** SyncProvider now runs a guarded, serialized incremental `pullSync` on a
  90s timer (no-op when offline or before the first-login cursor exists). The
  manager passes a status callback to each `.subscribe()` and, via a new
  `setRealtimeBackfillCallback`, triggers a debounced catch-up incremental pull on
  a channel RE-subscribe (reconnect) — but not on the initial subscribe, and not
  on a deliberate teardown/re-subscribe (membership change). New tests cover the
  reconnect-vs-first-subscribe and teardown cases.

## Housekeeping

- `.gitignore`: added `!docs/SyncAuditAgents-fixes-*.md` to the docs whitelist so
  this fix log isn't silently dropped by the `docs/**/*.md` ignore rule.
- Updated sibling sync test mocks (`phase2`, `phase4`, `queue-amplifier-manager`,
  `sync-manager`, `cross-user-and-ingress-guards`) to know the new token-guarded
  finalizers and the `{ silent: true }` cascade signature.

## Verification

- `npx vitest run` → **480 passed** (18 files), incl. new regressions for: P0
  timestamp semantics, P1-4 CAS (delete-resurrection + stale-update), P1-1 silent
  cascade + global-delete 42501 drop, P1-3 reconnect backfill.
- `npx tsc --noEmit` → clean.
- `eslint` (touched files) → clean.

## Deferred (next pass)

P2/P3 from the findings doc: membership-revocation local cleanup (P2-1/P3-1/P3-2),
sole-admin orphaning guard (P2-2), server-stamped activity-log timestamp (P2-3),
duplicate realtime channel guard (P2-4), join-without-hydration (P2-5), and the
`undefined`-clear conflict-gate edge (P3-3).
