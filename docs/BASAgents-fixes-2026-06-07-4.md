# BASAgents Fixes — 2026-06-07 (session 4)

**Trigger:** A new sync error pinged Discord (`[sync] rls-rejected on globalActivityLog`). Owner asked to (1) surface it in the registry and (2) investigate it. The registry pull also revealed a recurrence of an earlier error and a filter bug.

## Header block

| Field | Value |
|-------|-------|
| Date | 2026-06-07 (4th session) |
| Agent | Platform Engineer (sync / RLS / supabase / registry scripts) |
| Scope | Diagnose 2 reported sync errors; fix the real one; fix the registry status filter |
| Files changed | 3 |
| Insertions / deletions | ~+15 / −4 |
| TypeScript / Lint | clean |
| Tests | **378 passed** (sync suite 51/51) |

## Audit Phase

Triggered the daily health check to pull open `bug_reports` into `docs/ACTIVE-BUGS.md`. Surfaced two genuinely-open reports — `[sync] rls-rejected on globalActivityLog` (new, high) and `[sync] missing-column on globalProjectPreferences` (recurrence stamped v4.22.0) — plus a filter bug (handled bugs marked `closed` were leaking into the "open" list). Note: `bug_reports.appVersion` is stamped at *report* time (when "Report" is clicked in the Sync Error Inspector), not when the error occurred — so a recent version stamp can describe an old error.

## Fixes Applied

### P1 — `rls-rejected on globalActivityLog` (real bug, fixed)
- **`src/lib/sync/sync-manager.ts`** — The generic push did `.upsert(row, { onConflict: 'id' })` for every create/update item, including `globalActivityLog`. PostgREST upsert = `INSERT … ON CONFLICT DO UPDATE`. `global_activity_log` is an **append-only** audit table; its UPDATE RLS policy only matches the row's original author (or a project admin). When a non-admin re-pushes/retries an activity row that was authored by a *different* member (pulled into IndexedDB then re-queued), the `DO UPDATE` branch evaluates the UPDATE policy, matches no row, and Postgres returns **42501 (rls-rejected)**. Updating an append-only log is also semantically wrong. **Fix:** make the push **insert-only** for `globalActivityLog` by passing `ignoreDuplicates: true` (→ `ON CONFLICT (id) DO NOTHING`), so idempotent re-pushes never hit the UPDATE policy. The RLS policies are correct — **no schema/migration change**. Fully determinable from the upsert ↔ append-only-policy interaction (no live error detail needed).

### Investigation — `missing-column on globalProjectPreferences` (stale, no change)
- Re-enumerated every field the client pushes for `globalProjectPreferences`: the 8 interface fields map to real columns; `prefKey` is stripped by `LOCAL_ONLY_FIELDS`; `deletedAt`/`syncVersion` by `SKIP_FIELDS.globalProjectPreferences` (the v4.21.0 fix). All map. **Verdict: stale pre-fix error reported late** (appVersion is report-time). No code change.

### P2 — Registry showed `closed` bugs as open
- **`scripts/update-active-bugs.mjs`** + **`scripts/notify-discord.mjs`** — `BugReportStatus = 'open' | 'in_progress' | 'resolved' | 'closed'`. The query filtered only `status != resolved`, so `closed` rows leaked into the registry + Discord digest. Changed both to `status=not.in.(resolved,closed)` (keeps `open`/`in_progress`, drops both terminal states).

## Verification
- `npx tsc --noEmit` — clean. `npx eslint` on changed files — clean. `npx vitest run` — **378 passed** (sync suite 51/51). `node --check` on both scripts — OK.

## Follow-up for the owner
- The fixed `globalActivityLog` push deploys with this version; once running, that error won't recur.
- The two genuinely-open reports are both resolved/stale now — close them so the registry clears (in-app, or SQL):
  ```sql
  update public.bug_reports set status='resolved', updated_at=now()
  where status not in ('resolved','closed')
    and (title ilike '%rls-rejected on globalActivityLog%' or title ilike '%missing-column on globalProjectPreferences%');
  ```
  The already-`closed` rows will drop off automatically on the next health-check run thanks to the filter fix.
