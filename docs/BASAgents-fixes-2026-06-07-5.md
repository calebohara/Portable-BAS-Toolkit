# BASAgents Fixes — 2026-06-07 (session 5)

**Trigger:** After v4.25.0, the `42501 rls-rejected on global_activity_log` errors kept coming (retrying forever). The prior fix (insert-only `ignoreDuplicates`) was necessary but did not address the true root cause. This is the real fix.

## Header block

| Field | Value |
|-------|-------|
| Date | 2026-06-07 (5th session) |
| Agent | Platform Engineer (sync) |
| Scope | Stop pushing `globalActivityLog` rows the device doesn't own (the real RLS-spam cause) |
| Files changed | 2 (sync-manager + test) |
| Insertions / deletions | ~+111 / 0 |
| TypeScript / Lint | clean |
| Tests | **380 passed** (2 new) |

## Audit Phase

A real error sample (on v4.25.0) showed the failing row authored by **another** user (`userId 7c5ca76d…`, `action "joined the project"`, timestamp 2026-03-19) — i.e. a months-old activity row from a *different* member. The timeline UI pulls **every** member's activity into IndexedDB to display it; those foreign-authored rows were then being re-enqueued for push.

**Root cause (confirmed in `field-map.ts`):** `toSupabaseRow()` stamps `user_id = this.userId` (current device) but the payload's own `userId` field is then mapped over it (`userId → user_id`), so the pushed row carries the **original author's** id. The `global_activity_log` INSERT policy is `with check (is_global_project_member(global_project_id) AND user_id = auth.uid())` → fails because `user_id ≠ auth.uid()`. The v4.25.0 `ON CONFLICT DO NOTHING` doesn't help: Postgres evaluates the INSERT WITH CHECK *before* the conflict clause. → permanent retry/spam. You can't (and shouldn't) push another user's activity row — it already exists in the cloud.

## Fixes Applied

### P1 — Don't push `globalActivityLog` rows you don't own
- **`src/lib/sync/sync-manager.ts`:**
  1. **Push-path ownership guard** (top of `processItem`): for a non-delete `globalActivityLog` item whose row `userId`/`user_id` ≠ `this.userId`, drop it as a successful no-op — `deleteSyncItem(item.id)`, no upsert, no retry bump, no recorded syncError. (Own-authored rows still push insert-only via `ignoreDuplicates`.)
  2. **Enqueue-source fix** (`fullSync()` loop): skip foreign-authored `globalActivityLog` rows so they're never queued in the first place. (The batch-pull and realtime paths already use `bulkPutSilent`, so they were never the source — `fullSync` re-scanning the local store was.)
  3. **Stuck items drain:** the already-queued `retryCount: 3` items hit the guard on the next `processQueue` and are `deleteSyncItem`'d (dropped, not retried) — no separate sweep needed.
- The legitimate own-activity write (`logGlobalActivity` in `api.ts`) writes directly to Supabase (insert-only, `user_id = auth.uid()`), so normal activity logging is unaffected. Pull/display of all members' activity is unchanged — only PUSH of un-owned rows is blocked.
- No schema/RLS change — the RLS policy is correct; the client was wrong.

## Verification
- `npx tsc --noEmit` — clean. `npx eslint` — clean. `npx vitest run` — **380 passed**, incl. 2 new (`globalActivityLog ownership guard`: a foreign-author item is dropped without upsert/retry; an own item still upserts insert-only).

## Follow-up for the owner
- Once you're on this build, the queue self-drains the stuck foreign rows and the 42501 spam stops.
- Any lingering `bug_reports` rows from this spam can be closed; they'll drop off the registry on the next health-check run (the filter already excludes resolved/closed).
