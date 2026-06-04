# ReviewAgents Findings — Platform & Sync — 2026-05-20

**Agent:** Platform & Sync Reviewer
**Files reviewed:** ~45
**LOC reviewed:** ~9,500 (db.ts 1804, sync-manager.ts 1226, field-map.ts 869, reconcile.ts 1510, api.ts 2143, plus providers, hooks, API routes, components, migrations)

## Summary
| Priority | Count |
|----------|-------|
| P0 | 6 |
| P1 | 9 |
| P2 | 8 |
| P3 | 7 |

---

## P0 — Data loss / crash / security

### P0-1: IndexedDB transaction auto-closes mid-loop in `getAllProjectEntityCounts`

- **Location:** `src/lib/db.ts:1524-1539`
- **Current behavior:** Opens a single read-only transaction over `['files','notes','devices']`, then iterates `projectIds` and awaits `Promise.all([...count(id)])` inside the loop. After the first iteration's await resolves, control returns to the event loop, which auto-commits/closes the IDB transaction. On the second iteration `tx.objectStore('files')` raises `InvalidStateError: The transaction has finished`.
- **Why it's a bug:** Any dashboard view that requests counts for more than one project will throw on the 2nd iteration. Result: empty / NaN counts on the project list / dashboard for the second-and-later projects, or the entire call rejects and React logs an error. The dashboard hook (`use-projects.ts:867`) is the primary caller, so this hits every multi-project user.
- **Suggested fix:** Do not hold a single transaction across multiple awaits. Either (a) open a fresh transaction per project inside the loop, or (b) call `tx.objectStore(...).index(...).count(id)` for ALL `projectIds` first in a single microtask, then `await Promise.all` once. The `idb` package allows the second pattern as long as no awaits sit between the calls. Drop the per-project loop and fan out all 3*N count requests in one Promise.all.

---

### P0-2: Cascade-delete transactions span awaits that auto-commit before all child rows are removed

- **Location:** `src/lib/db.ts:661-741` (`cascadeDeleteProject`) and `src/lib/db.ts:751-840` (`cascadeDeleteGlobalProject`)
- **Current behavior:** Both helpers open a single `readwrite` transaction over `['projects', ...PROJECT_CHILD_STORES]` (17 stores), then run a long sequence of `await` calls — `await tx.objectStore('files').index('by-project').getAll(id)`, then a nested loop with `await tx.objectStore('fileBlobs').delete(...)` for every blob, then `await tx.objectStore('dailyReports').index('by-project').getAll(...)`, then another await loop, then a `for...of` over 16 child stores doing `await getAll(...)` then a nested `for` with `await delete(...)`. Each await yields to the event loop.
- **Why it's a bug:** IndexedDB closes a transaction the moment its request queue is empty AND the macrotask boundary is crossed. With this many sequential awaits inside the transaction, the tx will close partway through, raising `TransactionInactiveError` and leaving the cascade half-finished. The catch wraps with `tx.abort()` (which is also a no-op once the tx finished) and re-throws. Result: the project row gets deleted on `tx.objectStore('projects').delete(id)` before children are cleared, OR the call throws halfway and the user sees a partial delete — orphan rows that keep pushing against Supabase RLS forever and ghosts in the Sync Error Inspector. This is the exact failure the recent `ae86767` commit said it was fixing for the pull-side cascade, but the local cascade path is still vulnerable.
- **Suggested fix:** Pattern correctly: gather ALL child IDs first using separate read-only transactions or sequential operations OUTSIDE a tx; then open ONE `readwrite` transaction and synchronously enqueue all `tx.objectStore(...).delete(id)` calls without awaiting between them; finally `await tx.done` once. The `idb` library guarantees in-transaction batching as long as no `await` sits between the requests. Alternatively, open a fresh transaction per child store and accept that the cascade is no longer atomic — at least each store is internally consistent.

---

### P0-3: Sync queue items stuck in `'syncing'` status are never retried after a crash/refresh

- **Location:** `src/lib/sync/sync-manager.ts:230` (sets `status: 'syncing'`) + `src/lib/db.ts:1417-1421` (`getPendingSyncItems` filters by index `by-status` on `'pending'`)
- **Current behavior:** `processItem` updates the queue row to `status: 'syncing'` before the network call. If the browser/Tauri process is killed (refresh, crash, user closes tab) while `await this.client.from(table).upsert(...)` is in flight, the row stays at `'syncing'` forever. `getPendingSyncItems` only loads `'pending'` rows, so the stuck rows are silently abandoned. They're invisible in the failed-count UI and never retried.
- **Why it's a bug:** Data loss class — user makes an edit, sync starts, tab dies (very common on mobile or during commute), edit is never pushed to cloud. The user sees "0 pending" in Settings and trusts that everything synced.
- **Suggested fix:** On `SyncManager.start()`, sweep the queue once: convert every row with `status === 'syncing'` back to `'pending'` with retriedCount unchanged (or +1 if you want to throttle). Alternative: change `getPendingSyncItems` to also pick up `'syncing'` rows whose `createdAt` is older than some threshold (e.g. 1 minute). Either approach guarantees crashed sync attempts get re-tried.

---

### P0-4: Conflict detection has no tie-break for equal `updated_at` timestamps; `sync_version` column unused

- **Location:** `src/lib/sync/sync-manager.ts:305` (`new Date(remoteUpdatedAt) > new Date(localUpdatedAt)`) and `src/lib/sync/field-map.ts:797` (`sync_version` stripped on pull, never used in conflict logic)
- **Current behavior:** Conflict check uses strict `>`. If two edits happen in the same millisecond (common — `new Date().toISOString()` has ms granularity; back-to-back saves on a fast device or after restoring an older row are interchangeable), the local upsert silently overwrites the remote row with no conflict raised. The Supabase schema carries a `sync_version int default 1` column on most tables (see supabase/schema.sql) but `field-map.ts` explicitly strips it on push AND on pull, so the version counter is never read, written, or compared. Every conflict path is timestamp-only with sub-second drift between client clocks.
- **Why it's a bug:** Client clock skew between two devices can be tens of seconds. If Device A's clock is 30 s ahead, Device A's stale write will always "win" against Device B's newer write. Result: silent data loss for the user on the slower clock. The unused `sync_version` column was clearly intended as the tiebreaker but is wired up neither in push nor in pull.
- **Suggested fix:** Two options:
  1. Use `sync_version` as the canonical conflict key: on update, push includes `sync_version: localVersion`; Supabase increments it on success via a trigger; if remote `sync_version > local sync_version`, raise a conflict and refuse the write (a server-side `WHERE sync_version = $localVersion` clause would make this atomic).
  2. If keeping timestamps, change `>` to `>=` so equal-millisecond rows force a conflict review, and refuse pushes from clients whose `Date.now()` differs from the Supabase `now()` by more than a threshold (request `select now()` once per session and warn).

---

### P0-5: `data-cleanup-dialog` hard-deletes from Supabase bypassing the SyncManager, ignores 7 child tables

- **Location:** `src/components/settings/data-cleanup-dialog.tsx:19-24, 86-104`
- **Current behavior:** When the user "cleans up" a project, the dialog hard-deletes from Supabase by iterating `SUPABASE_PROJECT_CHILD_TABLES`, which lists ONLY 12 tables. The full set of project-child tables in Supabase is 16 (incl. `pid_tuning_sessions`, `ppcl_documents`, `psych_sessions`, `trend_sessions`, `dxrs`) — all of which have NOT NULL `project_id` FKs. The dialog also runs delete-before-await per table without checking for errors that aren't `console.warn`-able. Because the parent `projects` row is hard-deleted next, any orphaned children block with FK violations OR get cascade-orphaned in IndexedDB.
- **Why it's a bug:** The four-to-seven missing tables (PID, PPCL, Psych, Trend, DXR rows tied to the deleted project) will FK-violate on the parent delete, OR if the schema's FK is set to ON DELETE CASCADE the rows silently disappear from Supabase but linger in IndexedDB as orphans that keep failing RLS for "your" user. Either way the user thinks they cleaned up but rows persist somewhere.
- **Suggested fix:** Remove the hand-rolled table list. Either (a) call a new server-side RPC that takes the project ID and lets Postgres handle CASCADE atomically, or (b) reuse `SYNC_ORDER` filtered by `REQUIRES_PROJECT_ID` and the additional optional-FK tables to build the table list at runtime so it can never drift from `field-map.ts`. Better yet, route the operation through SyncManager's soft-delete path so it goes through the same `deleted_at` pipeline as every other delete.

---

### P0-6: `reset-password` page leaves the recovery session unrevoked + recovery token check is implicit

- **Location:** `src/app/reset-password/page.tsx:60-83` + `src/providers/auth-provider.tsx:121-128` (`detectSessionInUrl: true`)
- **Current behavior:** The page assumes that if `mode === 'authenticated'` then the user came from a recovery link. There's no check for Supabase's `PASSWORD_RECOVERY` auth event — any signed-in user landing on `/reset-password` directly can change their password without re-entering their current password. The Supabase recovery flow stamps a short-lived "recovery" session that allows `updateUser({ password })` without re-auth, but a normally-signed-in user can also call it. After a successful reset, the page navigates to `/dashboard` without calling `signOut()` on other sessions — so a compromised long-lived token continues to work.
- **Why it's a bug:** Security/UX hazard. A malicious actor with momentary access to a logged-in browser can silently reset the password while the legitimate user is away — without needing the old password. Supabase best practice is to listen for the `PASSWORD_RECOVERY` event and only allow `updatePassword` while inside that ephemeral session, then explicitly invalidate other sessions.
- **Suggested fix:** In `auth-provider.tsx`'s `onAuthStateChange`, capture a `recoverySession` flag when event === `'PASSWORD_RECOVERY'` and expose it through context. In `reset-password/page.tsx`, only show the form when `recoverySession === true`; otherwise show a "Sign in to change your password" prompt that points at the regular Settings → Change Password flow (which is gated by the normal session). After successful password update, call `client.auth.signOut({ scope: 'others' })` so any other sessions are revoked.

---

## P1 — Visible bugs

### P1-1: "Manage Subscription" button sends empty `stripeCustomerId`, request always 403s

- **Location:** `src/app/settings/page.tsx:380-394` + `src/app/api/subscribe/portal/route.ts:79-85`
- **Current behavior:** Settings page calls `fetch('/api/subscribe/portal', { body: JSON.stringify({ stripeCustomerId: '' }) })`. The portal route checks `if (!stripeCustomerId) return 400` first, so it never even reaches the profile lookup. The button always errors.
- **Suggested fix:** Either (a) read `stripe_customer_id` from the profile (it's already updated by webhook into `profiles`) and pass it, OR (b) refactor the portal route to look up `stripe_customer_id` server-side from the authenticated user's profile and drop the body parameter entirely. Option (b) is safer — never trust customer ID from the client.

---

### P1-2: Realtime channel filter `id=in.(${idList})` breaks when user has zero memberships

- **Location:** `src/lib/sync/sync-manager.ts:1045-1086`
- **Current behavior:** `subscribeToGlobalRealtime` already skips the child channel when `hasMemberships === false`, but `idList = ''` is still computed and concatenated into the filter expression for `global_projects` if a membership is gained later WITHOUT calling `subscribeToGlobalRealtime` again. The membership-change event (`GLOBAL_MEMBERSHIP_CHANGED_EVENT`) does re-subscribe, but there's no guarantee the membership cache is fresh — the new project's id may not be in `memberProjectIds` yet.
- **Why it's a bug:** Race: user accepts an invite → membership row inserted → realtime fires → 30 s membership cache still serves the old ids → child realtime channel doesn't include the new project → user gets no live updates on the project they just joined until they refresh.
- **Suggested fix:** When handling the membership-change event, call `fetchMyGlobalProjectIds(supabase, userId, force=true)` before re-subscribing, OR add a `force` parameter to `subscribeToGlobalRealtime` that bypasses the cache.

---

### P1-3: `subscribeToGlobalRealtime` cleanup ref overwrites the previous cleanup without calling it

- **Location:** `src/providers/sync-provider.tsx:101-117`
- **Current behavior:** When membership changes, `handleMembershipChanged` calls `manager.subscribeToGlobalRealtime().then((cleanup) => { realtimeCleanupRef.current = cleanup })`. The new cleanup overwrites the old without invoking the old cleanup first. `subscribeToGlobalRealtime` itself does tear down prior channels via `this.unsubscribeFromGlobalRealtime()` first, so it works in practice — but the React ref pattern is fragile. If a future commit removes the internal teardown the channels leak silently.
- **Suggested fix:** Either call `realtimeCleanupRef.current?.()` before re-subscribing inside `handleMembershipChanged`, OR drop the cleanup ref entirely and rely on `manager.unsubscribeFromGlobalRealtime()` being called from the manager's `stop()`. The cleanup ref is duplicating responsibility with the manager's own teardown.

---

### P1-4: `globalProjectPreferences` writes via `api.ts` upsert never update local IndexedDB cache until realtime fires

- **Location:** `src/lib/global-projects/api.ts:1538-1568` (`upsertGlobalProjectPreferences`)
- **Current behavior:** The function writes directly to Supabase via `.upsert(...)` and returns the new row, but does NOT mirror it into IndexedDB. The local cache only updates when Postgres realtime fires the change back to the same client (~100-500 ms latency). Any UI that reads from IDB right after the upsert returns sees stale data.
- **Why it's a bug:** Users toggling "Pin to dashboard" on a global project briefly see the pin not stick on slow connections — they may toggle again, ending up in the wrong state.
- **Suggested fix:** After successful upsert, call `bulkPutSilent('globalProjectPreferences', [{ ...result, prefKey: \`${result.userId}|${result.globalProjectId}\` }])`. Same pattern as the realtime handler at sync-manager.ts:1199-1210.

---

### P1-5: `pullSync` ranged pagination breaks on append-only logs

- **Location:** `src/lib/sync/sync-manager.ts:589-628`
- **Current behavior:** The pagination uses `.range(offset, offset + PAGE_SIZE - 1)` with `PAGE_SIZE = 1000`. For non-log entities the query is sorted by the server's default (typically id), but for `activityLog` / `globalActivityLog` the query uses `.gte('timestamp', lastPulledAt)` with no explicit `.order()`. Without an explicit order Postgres can return rows in arbitrary order across pages; in particular, the same row can appear twice or be skipped between page boundaries if any concurrent insert happens during the pull.
- **Why it's a bug:** Missing activity log entries → broken audit trail, especially under high-write conditions (e.g. team using global project during sync).
- **Suggested fix:** Always add `.order('id', { ascending: true })` (or `.order('timestamp', ...)` for append-only logs) to the paginated query so the page boundaries are stable.

---

### P1-6: `exportAllData` snapshot strips `_dbVersion` and `_exportedAt` metadata before iteration

- **Location:** `src/lib/db.ts:1687`
- **Current behavior:** `_dbVersion: [DB_VERSION], _exportedAt: [new Date().toISOString()]` are assigned to the snapshot but they're wrapped in single-element arrays. `importSnapshot` line 1702 then does `if (storeName.startsWith('_') || !Array.isArray(items) || items.length === 0) continue;` — so these metadata rows are skipped during import. Good. But there's no version check on import either: a v15 snapshot can be imported into a v21 DB silently, and v21 expects keys/indices that v15 didn't have.
- **Why it's a bug:** User restores an older backup → schema mismatch → cryptic IDB errors when sync tries to read a missing column.
- **Suggested fix:** Read `_dbVersion[0]` before importing; if it's lower than `DB_VERSION`, surface a clear migration warning and either run the upgrade path on the imported data first or refuse the import.

---

### P1-7: `useOnlineUsers` presence channel can leak if user's profile fetch is slow

- **Location:** `src/hooks/use-online-users.ts:47-82`
- **Current behavior:** The effect dependency list includes `profile?.displayName`, `profile?.firstName`, `profile?.lastName`, `profile?.avatarUrl`. Every change to any of these tears down the channel and creates a new one. If the user's profile mutates during avatar upload, the presence channel is torn down and recreated; the old `track()` may still be in-flight against a now-disposed channel. Supabase will accept the dangling track call and may keep the user listed as online twice.
- **Why it's a bug:** Duplicate presence entries persist until the next sync event. Minor but visible (online avatar count is wrong).
- **Suggested fix:** Use a stable channel and `track()` again on profile changes instead of recreating the channel. Move the `track` call out of the effect or use a separate `useEffect` keyed on profile fields that calls `ch.track(...)` on an existing channel.

---

### P1-8: Token refresh during a long sync push leaves the queue item permanently failed instead of retrying

- **Location:** `src/lib/sync/sync-manager.ts:211-426`
- **Current behavior:** Supabase JS auto-refreshes tokens, but the `.upsert(...)` call captures the token at issue time. If the access token expires mid-call (1h default), the request returns `401 / JWT expired`. `processItem`'s catch logs the error, increments retry, captures into `syncErrors`. After 5 retries the item is marked permanently `failed`. A token-expired error is functionally retryable but the code treats it like any other failure.
- **Why it's a bug:** A sync queue with many items can hit token expiry mid-batch on slow networks. Items beyond the first few error out permanently and stop syncing despite being legitimate.
- **Suggested fix:** Special-case 401 / JWT expired errors: do NOT increment `retriedCount` (or cap it lower), explicitly `await this.client.auth.refreshSession()`, then retry the item once before falling into the normal retry path.

---

### P1-9: `MAX_PHOTO_SIZE` / `MAX_FILE_SIZE` only enforced client-side; Supabase Storage upload accepts anything

- **Location:** `src/lib/storage.ts:8-9, 33-41` (client-side check) + Supabase Storage bucket policy
- **Current behavior:** `validateFileSize` runs before `uploadProjectFile`/`uploadBlobToStorage`. A user with dev tools open can paste arbitrary `File` objects bypassing the check. Supabase Storage by default accepts any size up to the bucket's configured cap.
- **Why it's a bug:** Storage abuse / quota burn from determined users.
- **Suggested fix:** Set bucket-level `file_size_limit` on the `project-files` / `avatars` buckets in Supabase Storage settings to match (or slightly exceed) the client limit.

---

## P2 — Inconsistencies

### P2-1: `cascadeDeleteProject` and `cascadeDeleteGlobalProject` use different patterns for tx + cleanup

- **Location:** `src/lib/db.ts:661-741` vs `src/lib/db.ts:751-840`
- **Notes:** Local cascade does children + project in one tx; global cascade does children in one tx, then preferences in a separate tx. Cleanup of syncQueue / syncErrors is duplicated across both. Should be extracted into a single helper.
- **Suggested fix:** Pull cleanup into `cleanupSyncArtifacts(entityTypeIdPairs[])` and call once per cascade variant.

---

### P2-2: `notifySync` triggers from db.ts after `db.put` but `bulkUpsert*` calls in db.ts use different patterns

- **Location:** `src/lib/db.ts:944-947` (`saveDevices` — notifies after `tx.done`), vs `bulkUpsertProjectDxrs` at 981-1042 (also notifies after), vs `clearProjectDxrs` at 1082-1098 (notifies after). All consistent. BUT `bulkSetDxrBaudRate` at 1050-1075 emits notifySync **inside the same loop** even though all writes are batched in one tx — fine in this case but inconsistent with the pattern elsewhere.
- **Suggested fix:** Cosmetic — minor; standardize the pattern: collect writes in a tx, then emit notifySync events in a follow-up loop after `await tx.done`.

---

### P2-3: `addSyncError` cap enforcement scans index AFTER insert — cap can race

- **Location:** `src/lib/db.ts:1746-1766`
- **Current behavior:** `await db.put('syncErrors', error)` is followed by `await db.count(...)`, then a separate transaction to delete overflow. If two errors fire in quick succession, both can see count = 101 and both try to delete 1, racing to delete the same oldest row.
- **Suggested fix:** Do the put + count + delete in ONE readwrite transaction so it's atomic.

---

### P2-4: `clearAllSyncConflicts` is exported but never called

- **Location:** `src/lib/db.ts:1492-1497`
- **Suggested fix:** Either wire it into Settings (next to "Reset Sync State" — useful for users with sticky conflicts) or delete it.

---

### P2-5: Mixed FK column-name assumptions in `purgeOrphans`

- **Location:** `src/lib/sync/sync-manager.ts:795-866`
- **Current behavior:** Step 1's child-table loop filters `SYNC_ORDER` by `t !== 'projects' && t !== 'commandSnippets' && t !== 'bugReports'`. This includes global child tables (which use `global_project_id`, not `project_id`). The query `.in('project_id', deadIds)` against a `global_*` table will 42703-error (column does not exist) for every global child. Steps 1b filters by `REQUIRES_PROJECT_ID` which is correctly local-only. Step 1 is broader and will spam the syncErrors log with PostgREST 42703s on every full-sync.
- **Suggested fix:** Change line 798 to `const childTables = SYNC_ORDER.filter((t) => REQUIRES_PROJECT_ID.has(t));` to match step 1b. Global-project orphan cleanup belongs on a separate, parallel code path keyed on `global_project_id` if needed at all (typically not — the membership RLS already gates it).

---

### P2-6: `syncedGlobalId` not in `FIELD_OVERRIDES` for `projects`, but mentioned as UUID FK

- **Location:** `src/lib/sync/field-map.ts:67` (added `synced_global_id` to `UUID_FK_COLUMNS`) but `FIELD_OVERRIDES.projects` (lines 126-138) does NOT include `syncedGlobalId: 'synced_global_id'`
- **Current behavior:** `toSnakeCase('syncedGlobalId')` yields `synced_global_id` so the column name matches by accident. Works today, but if anyone renames the field this breaks silently.
- **Suggested fix:** Add the explicit override for documentation + safety.

---

### P2-7: `entityTypeToTable.commandSnippets` syncs to `command_snippets`, but `purgeOrphans` excludes it

- **Location:** `src/lib/sync/sync-manager.ts:798`
- **Notes:** `commandSnippets` has no `project_id` (it's global per-user). Excluding it from child purges is correct, but the exclusion is hand-coded rather than derived from `REQUIRES_PROJECT_ID`. See P2-5 — same fix subsumes this.

---

### P2-8: `useSyncErrors.forgetRow` casts `error.entityType as SyncEntityType as BasToolkitStoreName`

- **Location:** `src/hooks/use-sync-errors.ts:51-60`
- **Notes:** The double-cast `as SyncEntityType as BasToolkitStoreName` works because the unions happen to be identical, but TS won't catch it if they ever diverge (e.g. a new pull-only entity added to `SyncEntityType` that has no IDB store). Use a type guard or runtime check against `BasToolkitStoreName` enum.

---

## P3 — Bloat / dead code / polish

### P3-1: Legacy IDB stores `projectNotepadEntries`, `notepadDocuments`, `fieldPanels` created on upgrade but never read

- **Location:** `src/lib/db.ts:407-441` (v10, v12, v14 upgrade blocks) — `(db as any).createObjectStore('projectNotepadEntries' / 'notepadDocuments' / 'fieldPanels')`. Not in `BasToolkitStoreName` union, not in `clearAllData()`, not in any repository.
- **Suggested fix:** Either (a) delete the stores in a new v22 upgrade block, or (b) remove the create calls and let the migration leave the orphan stores alone (users with old DBs still pay the storage cost but new users get a clean DB). At minimum, document why they're created if intentional.

---

### P3-2: `getRateLimitKey` trusts `x-forwarded-for` without parsing chain

- **Location:** `src/lib/rate-limit.ts:98-104`
- **Notes:** Takes the first comma-separated value of `x-forwarded-for`. An attacker can spoof the header to bypass per-IP limits. On Vercel this is mitigated because Vercel rewrites the header, but on a self-hosted deploy behind a non-trusted proxy it's a footgun.
- **Suggested fix:** Add a note that the route must run behind a trusted proxy, or read from `request.ip` if running on a platform that provides it.

---

### P3-3: `rate-limit` in-memory store is per-instance — comment acknowledges but doesn't suggest the fix

- **Location:** `src/lib/rate-limit.ts:6-10`
- **Notes:** On Vercel serverless, every cold start gets fresh state. Adversarial bursts trivially bypass the limit by hitting many edges in parallel.
- **Suggested fix:** Already documented in the file. Either accept the risk (low-cost endpoints) or upgrade to Upstash Redis. Worth tracking in a TODO.

---

### P3-4: `error-reporting.ts` does NOT scrub sensitive data — comment claims it does, body doesn't

- **Location:** `src/lib/error-reporting.ts:1-43` (claimed in agent prompt's PII watch list)
- **Notes:** `reportError` just calls `console.error` and `toast.error` with the raw error message. No scrubbing of tokens, emails, passwords. Compare to `sync-error-utils.ts:sanitizeForLog` which does scrub. `reportError` should route through that helper before logging.
- **Suggested fix:** Sanitize the message via `sanitizeForLog` before console.error and before passing to `toast.error.description`. Especially relevant since errors are also dispatched into `addSyncError` payload which IS persisted to IDB and rendered in the Sync Error Inspector.

---

### P3-5: `dailyReports`'s `attachments` cleanup duplicated across `cascadeDeleteProject` and `deleteDailyReport`

- **Location:** `src/lib/db.ts:677-682` and `src/lib/db.ts:1137-1147`
- **Suggested fix:** Extract a `removeReportBlobs(report)` helper.

---

### P3-6: `MaintenancePage` is 310 LOC of decorative SVG / atmospheric backgrounds

- **Location:** `src/components/maintenance/maintenance-page.tsx`
- **Notes:** Bulk of the file is a single-screen full-page splash with elaborate motion design. If maintenance mode is rarely toggled (`isMaintenanceMode()` reads an env var), this is dead weight in every shipped bundle.
- **Suggested fix:** Lazy-load the page via `dynamic(() => import(...))` so it only fetches when `NEXT_PUBLIC_MAINTENANCE_MODE === 'true'`.

---

### P3-7: `BACKUP_DIALOG` / `RESTORE_DIALOG` mostly identical structure (phase machine, error display)

- **Location:** `src/components/settings/backup-dialog.tsx` (165 LOC) + `src/components/settings/restore-dialog.tsx` (166 LOC)
- **Suggested fix:** Extract `SyncOperationDialog<TResult>({ title, action, renderSuccess })` shared component. Saves ~200 LOC.

---

## Handoffs (issues found outside your slice)

- **Handoff to: Global Projects / Reconcile slice** — `reconcile.ts:1112` upserts global_projects directly with `onConflict: 'id'` bypassing SyncManager's queue. If reconcile fails after this but before children push, the parent exists in Supabase but children don't and there's no queue retry. Audit whether reconcile should enqueue everything or accept that it's its own pipeline.

- **Handoff to: Global Projects / API slice** — `api.ts:312-372` `deleteGlobalProject` cascade-soft-deletes 17 child tables sequentially via 17 round-trips with no transactional guarantees. If 1 fails midway the project is half-deleted in Supabase. Suggest moving this to a single Postgres RPC.

- **Handoff to: Auth / Admin slice** — `account/delete/route.ts:76-95` lists hand-rolled `syncedTables` and `globalTables` that drift from `entityTypeToTable`. If you add an entity type to `SyncEntityType`, you must remember to add to this delete route too — silent leak otherwise. Derive the lists from `entityTypeToTable`.

- **Handoff to: Admin slice** — `admin-approval-panel.tsx:42-66`. In Tauri mode it queries `profiles` directly via the anon-key client, relying on RLS. The RLS policy `is_admin()` uses `SECURITY DEFINER` (good) — but the listed table includes `email` which is PII. Any user who manages to flip their own `role` column to `'admin'` (via a compromised admin) gains the ability to read every user's email. Worth surfacing as a defense-in-depth concern: consider redacting email on the client and rendering only `display_name` unless absolutely needed.

- **Handoff to: Tauri slice** — `subscribe/checkout-redirect/route.ts:42` takes `userId` from a URL query param with no signature/HMAC. An attacker who learns another user's Supabase user ID can upgrade THEIR subscription via the desktop-mode flow (the webhook will write the tier to the supplied user_id). The desktop browser-open flow needs the user to be authenticated through their own browser — verify Supabase user identity from the cookie on the redirect route rather than trusting the query string.
