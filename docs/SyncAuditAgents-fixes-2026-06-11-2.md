# SyncAuditAgents Fixes — 2026-06-11 (session 2)

Closes the **remaining open findings** from
[`SyncAuditAgents-findings-2026-06-08-3.md`](./SyncAuditAgents-findings-2026-06-08-3.md)
after session 1 ([`…-fixes-2026-06-11.md`](./SyncAuditAgents-fixes-2026-06-11.md))
resolved CFM-1/ARCH-1 + the data-stranding P2 cluster. Owner-directed
("Work on the rest now").

## Header block

| Field | Value |
|-------|-------|
| Date | 2026-06-11 (session 2) |
| Mode | targeted remediation (no agent team fan-out) |
| Findings closed | DEL-2, DEL-3/GLOBAL-2, GLOBAL-1, RT-2, MIG-1, MIG-2, SEC-2, TEST-2 |
| Findings decided | ARCH-2 (deferred with rationale — see Housekeeping) |
| Files changed | 12 (incl. 2 new migrations) |
| TypeScript / Lint | clean (1 pre-existing unrelated warning at use-global-projects.ts:1499) |
| Tests | **532 passed** (528 + 4 new TEST-2 resolution-flow tests) |
| Build | `build:static` clean |

## Audit Phase

No new audit — targets from the s3 findings doc. Sites read before fixing:
`use-global-projects.ts` (remove/leave), `api.ts` (deleteGlobalFile +
deleteGlobalProject storage-cleanup precedent), `sync-manager.ts`
(reconcileMembershipRevocations, pullSync cursor), `use-inbox.ts` (realtime
channel), `global-projects-schema.sql` (the 4 SECURITY DEFINER helpers),
`add-global-activity-log-server-timestamp.sql` (MIG-1 pattern precedent).

## Fixes Applied

### P2 — DEL-2: global delete ran a NON-silent local cascade
- **`src/hooks/use-global-projects.ts`** — `remove()` now passes
  `{ silent: true }` to `cascadeDeleteGlobalProject` (same as `leave()`).
  The server-side RPC already tombstoned every child; the non-silent local
  cascade re-enqueued an outbound delete per child, hitting already-tombstoned
  rows and 42501s on foreign-authored ones — pure queue + Sync Error churn.

### P2 — DEL-3/GLOBAL-2: single global-file delete leaked the Storage blob
- **`src/lib/global-projects/api.ts`** — `deleteGlobalFile` collects the row's
  `storage_path` before the soft-delete and best-effort removes the blob after
  it succeeds (`deleteManyFromStorage`, the project-level-delete precedent).
  A Storage failure never fails or resurrects the row delete. Scope note: the
  "re-share" half of the original finding is a non-leak under current reconcile
  behavior (an existing `storage_path` is passed through, not re-uploaded);
  the quota leak was the per-file delete, now closed.

### P2 — GLOBAL-1: revoked member kept the linked LOCAL project bound forever
- **`src/lib/sync/sync-manager.ts`** — `reconcileMembershipRevocations` now
  collects the revoked global ids and **UNLINKS** (never deletes) any local
  project whose `syncedGlobalId` points at one: `syncedGlobalId: null`
  (null, not undefined — `toSupabaseRow` drops undefined, which would leave the
  stale link in the cloud column), `updatedAt` bumped, written via
  `bulkPutSilent` + a real enqueued update so the unlink propagates to the
  personal cloud and other devices converge. The local project remains intact
  as the user's personal copy; the auto-mirror stops attempting RLS-denied
  pulls against a project they can no longer access.

### P2 — RT-2: static `inbox-realtime` topic
- **`src/hooks/use-inbox.ts`** — per-instance channel topic
  (`inbox-realtime-${userId}-${suffix}`). supabase-js dedups channels by topic
  and `removeChannel` leaves asynchronously, so a second concurrent mount
  (inbox page + top-bar unread badge) silenced the first subscription.

### P2 — MIG-2: pull cursor was the DEVICE clock
- **`src/lib/sync/sync-manager.ts`** — `pullSync` now tracks the **max server
  timestamp actually seen** across all pulled rows and uses it as
  `newPulledAt` (same clock domain as the rows' `updated_at` — immune to device
  skew; `gte` makes the boundary row re-fetch idempotently). Fallbacks: zero
  rows on an incremental pull → cursor unchanged (no advance = nothing
  skippable); zero rows on first hydration → device clock (no server signal
  yet; documented residual that heals as soon as anything round-trips).

### P2 — MIG-1: local `activity_log` slow-clock cursor skip (migration, pending apply)
- **`supabase/migrations/add-activity-log-server-timestamp.sql`** —
  `force_activity_timestamp()` BEFORE INSERT trigger, identical pattern to the
  already-written global twin (#50). Ledger footer included.

### P2 — SEC-2: 4 SECURITY DEFINER helpers without pinned search_path (migration, pending apply)
- **`supabase/migrations/pin-security-definer-search-path.sql`** — pins
  `search_path = public` on `is_global_project_member(uuid)`,
  `is_global_project_admin(uuid)`, `join_global_project(text)`,
  `auto_add_global_project_creator()` (guarded per function; idempotent).
- **Migration bookkeeping (both):** probe blocks #51/#52 added to
  `supabase/check-migrations.sql`, backfill lines added, rows #52/#53 added to
  `docs/MIGRATIONS.md`. **Both migrations are PENDING manual apply in the
  Supabase SQL Editor** (no CLI, per project rule).

### P3 — TEST-2: conflict tests asserted only call-counts
- **`src/lib/sync/__tests__/phase2-conflict-correctness.test.ts`** — new
  "TEST-2" suite (4 tests): the conflict's `localData` preserves the loser
  payload verbatim (and `remoteData` is the camel-mapped cloud row);
  `resolveKeepLocal` force-pushes with update semantics (snake-cased, no
  `created_by` stamp, `onConflict: 'id'`); `resolveKeepRemote` writes the cloud
  row silently and never re-pushes; `resolveDeleteBoth` soft-deletes keyed on
  `id` only (no `user_id` filter on a membership-RLS table) and removes the
  local row. All three resolve paths were previously untested.

## Housekeeping

- **ARCH-2 decision: DEFERRED, deliberately.** The ~600-line duplicated mapper
  layer (reconcile's per-entity mappers vs field-map's toSupabaseRow/
  fromSupabaseRow) is a quality refactor, not a bug. Consolidating it
  immediately after shipping CFM-1 — whose divergence gate sits directly on the
  current reconcile mapper behavior — would stack regression risk on an
  unsoaked release. The sync feature freeze stops the duplication from growing.
  Revisit as its own designed session after v4.40/v4.41 have soaked and the
  two-device verification pass (SYNC-VERIFICATION.md) has been run.

## Verification

- `npx tsc --noEmit` — clean.
- `npx eslint` over changed files — clean (1 pre-existing unrelated warning).
- `npx vitest run` — **532 passed / 0 failed** (21 files).
- `npm run build:static` — clean.
- Migrations are syntax-reviewed and pattern-matched to applied precedents but
  **not yet applied to prod** — apply #52 and #53 from `docs/MIGRATIONS.md` in
  the SQL Editor, then run `supabase/check-migrations.sql` to confirm.

## Status of the s3 findings after this session

| Finding | Status |
|---------|--------|
| CFM-1/ARCH-1 | ✅ fixed (s1, v4.40.0) |
| CFM-2, ENG-1, ENG-3, ENG-4 | ✅ fixed (s1, v4.40.0) |
| Consistency-check global gap | ✅ fixed (s1, v4.40.0) |
| DEL-2, DEL-3, GLOBAL-1, RT-2, MIG-2 | ✅ fixed (s2, v4.41.0) |
| MIG-1, SEC-2 | ✅ written — **pending manual SQL apply** |
| TEST-2 | ✅ fixed (s2) |
| ARCH-2 | ⏸ deferred by design (see Housekeeping) |
| P3s (ENG-5, CFM-3/4, DEL-5/6, GAP-5/8, etc.) | open — cosmetic/latent, not in scope |
