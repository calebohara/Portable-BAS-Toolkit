# SyncAuditAgents Fix Log — 2026-06-08 (session 2)

Remediation of the **P2 + P3** findings from
[`docs/SyncAuditAgents-findings-2026-06-08-2.md`](./SyncAuditAgents-findings-2026-06-08-2.md).
(The P0 + four P1 were fixed earlier — see
[`docs/SyncAuditAgents-fixes-2026-06-08.md`](./SyncAuditAgents-fixes-2026-06-08.md).)

## Header

- **Date:** 2026-06-08 (session 2)
- **Originating findings:** `SyncAuditAgents-findings-2026-06-08-2.md` (5 P2, 3 P3)
- **Files changed:** 7 source/test + 2 new migrations + 3 migration-tracking files
- **Version:** v4.35.1 → v4.36.0
- **Tests:** 497 passing (+4 new regression tests)

## Audit Phase

Findings produced by the prior read-only audit. Files touched during remediation:

| Fix | Files |
|-----|-------|
| P2-4 realtime concurrency | `src/lib/sync/sync-manager.ts` |
| P3-3 conflict gate | `src/lib/sync/sync-manager.ts`, `src/lib/sync/field-map.ts` |
| P2-1/P3-1/P3-2 membership cleanup | `src/lib/sync/sync-manager.ts`, `src/hooks/use-global-projects.ts` |
| P2-5 join hydration | `src/providers/sync-provider.tsx` |
| P2-3 log timestamp | `supabase/migrations/add-global-activity-log-server-timestamp.sql` |
| P2-2 sole-admin guard | `supabase/migrations/add-last-admin-guard.sql` |

## Fixes Applied

### P2 (5)

- **P2-4 — Duplicate realtime channels.** `subscribeToGlobalRealtime` awaits a
  membership fetch before building fixed-topic channels; two interleaving calls
  (mount + membership-changed) stacked duplicate bindings → events applied twice +
  leaked refs. **Fix:** a monotonic generation token captured before the await; a
  call that's been superseded aborts before building any channels (channel
  building is synchronous, so passing the gate is atomic). Regression test added.

- **P2-1 — Membership cache not tombstone-aware (a removed member's stale local
  mirror).** Membership removal produces no tombstone, so a removed member kept a
  full local mirror until the next FULL pull. **Fix:** `reconcileMembershipRevocations()`
  runs each pull cycle — diffs the live membership set against the locally-mirrored
  global projects and SILENTLY cascade-deletes any the user no longer belongs to.
  **Fails closed:** if the membership fetch errors it reaps nothing (a transient
  blip must never wipe local data); a *successful* empty result does reap. Tests
  for both the reap and the fail-closed path.

- **P2-5 — Joining a project never hydrated existing child rows (offline gap).**
  Join only created the membership row; the incremental pull (`updated_at >=
  lastPulledAt`) and realtime (future-only) never pulled the project's pre-existing
  rows, so a tech who joined on Wi-Fi had nothing offline. **Fix:**
  `handleMembershipChanged` now triggers a one-shot tombstone-respecting full pull
  to hydrate the offline mirror.

- **P2-3 — Slow-clock device's activity-log rows skipped (DB migration).** The
  append-only log incremental pull filters a CLIENT-stamped `timestamp`; a lagging
  author's row could sort before the receiver's advanced cursor and be skipped
  forever. **Fix:** `add-global-activity-log-server-timestamp.sql` — a BEFORE
  INSERT trigger forces `timestamp = now()` (server clock), so the column lives in
  one clock domain. *(Apply manually via the Supabase SQL Editor.)*

- **P2-2 — Sole admin can orphan a project (DB migration).** The last admin could
  leave/be removed while members remain, making the project permanently
  un-administrable. **Fix:** `add-last-admin-guard.sql` — a BEFORE DELETE/UPDATE
  trigger on `global_project_members` rejects removing/demoting the last admin
  while other members remain (a sole-member admin may still leave). Guarded so a
  parent-project cascade delete is not mistaken for a standalone removal. The
  client surfaces the trigger's error message via the existing leave/remove toast.
  *(Apply manually via the Supabase SQL Editor.)*

### P3 (3)

- **P3-1 — `leaveGlobalProject` left the local mirror behind.** **Fix:** the
  `leave` hook now SILENTLY cascade-deletes the local mirror (no outbound delete
  pushes — the user can't delete the shared project), mirroring `remove`.

- **P3-2 — A removed member's device never cleaned up.** Covered by the same
  per-pull `reconcileMembershipRevocations()` as P2-1 (a removed member's next
  pull diffs memberships and drops the stale local copy).

- **P3-3 — Conflict content-equality gate ignored undefined-cleared fields.**
  `pushRowMatchesRemote` iterated only payload keys, so a field the user cleared
  (dropped by `toSupabaseRow`) was never compared against the remote's value — the
  clear was silently reverted by adopting the cloud row. **Fix:** iterate the
  entity's full client-owned column allowlist (new `entityOwnedColumns()` export),
  treating an absent payload column as empty, so a clear vs a non-empty remote
  value registers as a real divergence. Regression test added.

## Housekeeping / Migration tracking

Both new migrations were registered per the Supabase migration rule:
self-recording footer, a probe in `supabase/check-migrations.sql` (#49, #50), a
backfill line in `supabase/backfill-schema-migrations.sql`, and rows in
`docs/MIGRATIONS.md` (#50, #51). No client code depends on the migrations being
applied to keep working — they are server-side hardening.

## Verification

- `npx vitest run` → **497 passed** (incl. new tests: P2-4 single-channel-set,
  P2-1 reap + fail-closed, P3-3 cleared-field divergence).
- `npx tsc --noEmit` → clean. `eslint` (touched files) → clean.

## Action required (manual)

Apply these two SQL files in the **Supabase SQL Editor** (they are no-ops until
applied; nothing breaks in the meantime):
1. `supabase/migrations/add-global-activity-log-server-timestamp.sql`
2. `supabase/migrations/add-last-admin-guard.sql`

Then run `supabase/check-migrations.sql` to confirm #49/#50 show `applied = true`.

## Deferred

- **P2-2 UI affordance** — the DB guard is the enforcement; the client surfaces the
  error via toast. Proactively hiding/disabling "Leave" for a sole admin (needs
  client-side admin/member counts) is optional polish, not done this pass.
- **Local deletions upward** on share (noted in the share dialog) — still no
  tombstone-push path.
