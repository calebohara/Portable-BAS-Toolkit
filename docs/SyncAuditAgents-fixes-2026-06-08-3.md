# SyncAuditAgents Fix Log — 2026-06-08 (session 3)

Selective remediation of the **small, well-verified, low-regression** findings from
[`SyncAuditAgents-findings-2026-06-08-3.md`](./SyncAuditAgents-findings-2026-06-08-3.md).
The architectural P1 (CFM-1/ARCH-1) and the GAP-1 file-roaming subsystem are **deliberately
deferred** (see findings doc → Out of scope).

## Header

- **Date:** 2026-06-08 (session 3)
- **Originating findings:** `SyncAuditAgents-findings-2026-06-08-3.md`
- **Scope applied:** 2 P1 (+ 1 P1 with a deferred architectural sibling), 2 P2, 1 P2 leak
- **Files changed:** 4 source + 2 test
- **Version:** v4.36.0 → v4.37.0
- **Tests:** 501 passing (+4 new regression tests); `tsc --noEmit` clean; `eslint` clean

## Audit Phase

| Finding | Severity | Files |
|---------|----------|-------|
| ENG-2 FK-safe ordering | P1 | `src/lib/db.ts` |
| SEC-1 cross-user push guard + resilient wipe | P1 | `src/lib/sync/sync-manager.ts`, `src/lib/db.ts` |
| RT-1 realtime topic suffix | P1 | `src/lib/sync/sync-manager.ts` |
| GAP-4 stopped-manager write guard | P2 | `src/lib/sync/sync-manager.ts` |
| GAP-7 db terminated() recovery | P2 | `src/lib/db.ts` |
| SEC-3 clear per-user UI residue on wipe | P2 | `src/providers/auth-provider.tsx` |
| Regression tests | — | `src/lib/__tests__/db.test.ts`, `src/lib/sync/__tests__/sync-manager.test.ts` |

## Fixes Applied

### P1

- **ENG-2 — `23503` strands legitimate children.** `getPendingSyncItems` sliced the pending
  set in lexicographic key order (`devices-…` < `projects-…`) *before* `orderPushBatch` ran,
  so a child could fill batch 1 while its parent waited in batch 2 → `23503` → parked
  permanently. **Fix:** apply `orderPushBatch(eligible)` (parent-first for upserts,
  child-first for deletes) to the **whole eligible set before slicing**, guaranteeing a
  parent is never deferred behind its own child across a batch boundary. `db.ts` now imports
  `orderPushBatch` from `field-map.ts` (cycle-free — field-map has only a type-only import).
  *Regression test:* a child whose key sorts first is returned **after** its parent.

- **SEC-1 — Previous user's queue pushes under the new user.** Two layers:
  1. **Load-bearing:** `processItem` now drops any item whose `item.userId !== this.userId`
     (every item is stamped at enqueue) as a successful no-op — neutralizing any leftover
     foreign-user item regardless of wipe success, *before* `toSupabaseRow` can re-stamp it.
  2. **Defense-in-depth:** `clearAllData` clears `syncQueue` + `syncConflicts` **first** and
     clears **each store independently** (per-store try/catch), rethrowing an aggregate error
     on partial failure — so one failing store (e.g. `fileBlobs` under quota pressure) can no
     longer abort the loop and leave the prior user's data + queue intact.
  *Regression tests:* a foreign-`userId` item is dropped (no upsert) while the active user's
  item still pushes; `clearAllData` empties `syncQueue`.

- **RT-1 — Realtime goes silent after a membership change.** `subscribeToGlobalRealtime`
  used fixed per-user channel topics; supabase-js dedups by topic and `removeChannel` leaves
  asynchronously, so an immediate re-subscribe reused the dying channel (whose `.subscribe()`
  no-ops). **Fix:** append the subscribe generation to the topic
  (`bau-sync-global-{projects,children}-${userId}-g${gen}`), guaranteeing a fresh,
  non-colliding topic each generation — the same pattern `useRealtimeRefresh` already uses.

### P2

- **GAP-4 — Torn-down manager re-seeds the previous user's rows.** `handleRealtimeChange`
  writes directly from the network payload via `bulkPutSilent`/`bulkDeleteSilent` with no
  abort check, and its channel teardown runs *after* the user-switch wipe — so an in-flight
  event for user A could land A's `global_*` rows in B's freshly-wiped store. **Fix:** a
  `private stopped` flag set at the top of `stop()`, checked at method entry **and** re-checked
  immediately before the terminal `bulkPutSilent` (the method awaits in between). The
  auto-mirror half of the gap was refuted (it re-reads the wiped store → no-op).

- **GAP-7 — Dead `dbPromise` after a browser-terminated connection.** `getDB`'s `openDB`
  had no `terminated()` hook, so an abnormal close (memory pressure / cross-tab
  versionchange) left the cached resolved promise pointing at a dead handle and every
  subsequent op threw `InvalidStateError` until a manual reload. **Fix:** a `terminated()`
  callback that nulls `dbPromise` so the next `getDB()` transparently reopens. (The
  swallowed-quota half was refuted — `evictOldBlobsIfNeeded` + error-gated cursor advance
  already cover it.)

- **SEC-3 — Recent searches/projects leak across users.** The persisted Zustand store
  (localStorage) survives the IndexedDB wipe, so `recentSearches` (verbatim free text the
  prior tech typed) and `recentProjectIds` showed up for the next user on a shared laptop.
  **Fix:** clear both in `reconcileUserIsolation`'s wipe branch (device-level prefs — theme,
  sidebar, tour — are kept).

## Housekeeping

- `db.ts` gained one import (`orderPushBatch`). No new dependencies.
- No migrations added this session (MIG-1 / SEC-2 batched for the next migration round).
- New docs auto-whitelisted by the existing `.gitignore` `!docs/SyncAuditAgents-*` rules.

## Verification

- `npx tsc --noEmit` → clean.
- `npx vitest run` → **501 passed** (+4 new: SEC-1 drop + push, `clearAllData` queue-clear,
  ENG-2 parent-first ordering).
- `npx eslint` (touched files) → clean.

## Deferred (tracked in the findings doc)

- **CFM-1 / ARCH-1** — unify the two global writers onto one conflict authority (the
  strategic data-loss root cause). Architectural; not a fix-pass change.
- **GAP-1** — regular file roaming (Storage upload + download + backfill). Green-lit; its own
  focused build.
- **CFM-2, ENG-1/3/4, DEL-2/3, GLOBAL-1, RT-2, MIG-1/2, SEC-2, TEST-2** — open P2s for a
  follow-up pass; several are small (DEL-2 `{silent:true}`, RT-2 topic suffix).
