<!-- Master registry of active bugs for BAU Suite. Partly machine-managed — see "How this file works". -->
# Active Bugs — Master Registry

Single source of truth for known / active bugs in BAU Suite: regressions caught by
the daily automated health check, bugs reported by users at runtime (via the in-app
Bug Report dialog → Supabase `bug_reports`), and anything you log by hand.

## How this file works

- **Daily health check** — `.github/workflows/daily-health-check.yml` runs every day
  (and on demand) and regenerates the **🤖 Daily health check** block below from the
  results of `tsc`, `eslint`, `vitest`, `build:static`, and `cargo check`/`test`.
- **User-reported bugs** — the same workflow pulls open rows from the Supabase
  `bug_reports` table and regenerates the **📥 User-reported** block.
- **Manual section** — the **✋ Manually tracked** and **✅ Recently resolved**
  sections are yours. The automation NEVER edits them (they're outside the
  `<!-- ... -->` markers). Move items between them as you triage/fix.

> The two machine-managed blocks live between `START`/`END` HTML comment markers.
> Don't edit inside those — your changes there get overwritten on the next run.

**Severity:** `P0` data-loss/crash/security · `P1` visible bug · `P2` inconsistency · `P3` polish.
**Status:** `open` · `investigating` · `fixed`.

---

## 🤖 Daily health check

<!-- AUTOMATED-CHECKS:START -->
**Last run:** 2026-11-13 13:15 UTC · [run log](https://github.com/calebohara/Portable-BAS-Toolkit/actions/runs/43431130511)

> ✅ All automated checks passed.

| Check | Result |
|-------|--------|
| TypeScript (`tsc --noEmit`) | ✅ pass |
| Lint (`eslint`) | ✅ pass |
| Unit tests (`vitest run`) | ✅ pass |
| Production build (`build:static`) | ✅ pass |
| Rust (`cargo check`/`test`) | ✅ pass |
<!-- AUTOMATED-CHECKS:END -->

---

## 📥 User-reported bugs

Open rows from the Supabase `bug_reports` table (submitted via the in-app Bug Report dialog).

<!-- USER-REPORTS:START -->
**2** open reports as of 2026-11-13 13:15 UTC.

| Opened | Sev | Status | Title | Page | Version | By |
|--------|-----|--------|-------|------|---------|----|
| 2026-06-08 | high | open | [sync] rls-rejected on globalDevices | /global-projects/_/ | 4.31.1 | Caleb O'Hara |
| 2026-06-08 | high | open | [sync] rls-rejected on globalActivityLog | /settings | 4.25.0 | Caleb O'Hara |
<!-- USER-REPORTS:END -->

---

## ✋ Manually tracked bugs

Add anything you discover by hand here. This section is never touched by automation.

| ID | Opened | Severity | Status | Area | Description | Notes |
|----|--------|----------|--------|------|-------------|-------|
| STORAGE-BUCKET-STILL-PUBLIC | 2026-08-29 | P1 | **awaiting migration** | storage | App code now mints short-lived signed URLs (`getSignedUrl`) instead of never-expiring public ones, at all three `project-files` call sites. The bucket itself is still `public = true`, so Storage keeps serving `/object/public/<path>` without consulting RLS until migration #56 is applied. | **Deploy the app build first, THEN apply `make-project-files-bucket-private.sql`** — applying it first breaks preview/download for clients on the old build. Rollback: `set public = true`. |
| AUTH-APPROVAL-NOT-ENFORCED | 2026-08-29 | P1 | **awaiting migration** | auth | Account approval was a client-side `router.replace('/pending-approval')` only — no RLS policy referenced `approved`, so an unapproved self-registered account could read the whole knowledge base, send DMs, call `search_users()`, and join any global project by access code. Fix written as migration #57 `enforce-account-approval-rls.sql`: `is_approved()` helper + one RESTRICTIVE policy per table (existing policies untouched) + gates in `search_users()` / `join_global_project()`. Verified against a PGlite schema stub (24 checks). | **Apply `enforce-account-approval-rls.sql` in the SQL Editor** — order-independent, no app deploy needed first. Then confirm with `check-migrations.sql` (#57). BASAgents 2026-08-29 P1-5 (Platform). |
| WEB-CSP-BLOCKS-LAN | 2026-08-29 | P1 | open | connectivity | The deployed web build's own CSP (`connect-src`/`frame-src`) blocks every LAN request: Ping reports all targets unreachable while the disclaimer claims a real reachability test, and the Web Interface iframe fires `load` on the CSP-blocked `about:blank`, so it reports success and caches `lastKnownEmbedSupport: 'supported'` behind a blank panel. | `next.config.ts:35-36`. Needs a product decision: widen the CSP for connectivity routes, or gate them desktop-only in the browser build. BASAgents 2026-08-29 P1-3 (Field Connectivity). |
| TREND-ANOMALY-FALSE-POSITIVES | 2026-08-29 | P2 | open | trend-viewer | Stuck-sensor and spike detectors run on binary series, so every fan status produces two `critical` anomalies overnight; oscillation has no amplitude floor, so ±0.1°F dither reads as hunting; out-of-range emits one anomaly **per sample**, unbounded, and persists them into the synced session. | `trend-anomaly-engine.ts:140-149`, `:288-293`, `:250-266`. Needs default-value decisions. BASAgents 2026-08-29 P1-1/P1-2/P1-3 (BAS Tools). |

---

## ✅ Recently resolved

Move fixed items here (with the commit/version that fixed them) so there's a paper trail.

| ID | Resolved | Fixed in | Description |
|----|----------|----------|-------------|
| CI-ALWAYS-GREEN | 2026-11-11 | v4.43.1 | Every step in `daily-health-check.yml` was `continue-on-error: true`, so the job was green regardless of outcome and the only failure signal was a Discord ping that no-ops without the secret. Added a final `if: always()` gate step that fails the job when any captured outcome isn't `success` (a `skipped` step counts as a failure). `ci.yml` now also runs `build:static` as a parallel `static-build` job, so a push that breaks the Tauri export goes red on the commit instead of at release time. Cargo stays on the daily cron (needs WebKit/GTK system deps). |
| BUILD-VERSION-DRIFT | 2026-11-11 | v4.43.1 | `sync-version.js --check` ran nowhere and `release.yml` never compared the tag to `package.json`, so a drifted `tauri.conf.json` could publish a `latest.json` equal to the installed version and strand clients "up to date". `ci.yml` now runs `sync-version.js --check` on every push, and `release.yml` refuses to build when the tag ≠ `v<package.json version>` or the Tauri files drift. `UpdateNotifier` moved out of `{sidebarOpen && …}` — it stays mounted (icon-only) when the sidebar is collapsed, so the silent startup update check always runs. |
| STRIPE-TIER-NEVER-GRANTED | 2026-11-11 | v4.43.1 (latent — paywall off) | Checkout put `supabase_user_id` on the Session only; Stripe doesn't copy it to the Subscription the webhook reads, so a first-time subscriber was charged and stayed `free`. Both checkout routes now stamp it on `subscription_data.metadata` + `client_reference_id`, and the webhook grants from `checkout.session.completed` too. Same pass fixed: `current_period_end` read from the item (API 2025-03-31+ moved it; `subscription_expires_at` was always null), status-aware grants (`unpaid`/`incomplete_expired`/`paused` now revoke), cancelling a monthly *donation* no longer resets a subscriber to free, UUID-only user ids (PostgREST filter injection), events re-fetched to survive out-of-order delivery, and a failed profile write now returns 500 so Stripe retries. Logic in `src/lib/stripe-subscription.ts`; tests `src/lib/__tests__/stripe-subscription.test.ts` (16). **Run one end-to-end checkout in Stripe test mode before enabling the paywall.** |
| FILES-BLOB-ONLY-COPY | 2026-08-29 | v4.43.0 | `fileBlobs` was treated as a disposable cache by three paths, but it is the system of record for daily-report attachments (no `storagePath` field exists) and un-roamed file versions (roaming is best-effort). `clearFileCache` destroyed only-copy blobs while the dialog promised data was preserved; `evictOldBlobsIfNeeded` silently dropped report photos at 80% quota; `deleteFile` never removed roamed Storage objects. Fixed with one shared `collectIrreplaceableBlobKeys()` predicate used by all three, an honest clear-cache result (`{cleared, keptOnlyCopies}`) surfaced in the toast and dialog copy, and best-effort Storage cleanup on delete. Regression tests: `src/lib/__tests__/blob-lifecycle.test.ts` (6 cases, 2 fail against pre-fix code). |
| REPORTS-FORM-WORK-LOSS | 2026-08-29 | v4.43.0 | `report-form.tsx` lost work four ways: no unsaved-changes guard (a back-gesture discarded a whole day's report); the pending autosave was cancelled rather than flushed on unmount; `removeAttachment` hard-deleted the blob before the removal was saved, so abandoning the edit destroyed a site photo the report still listed; and Save/Save Draft hard-coded the status, silently discarding a "Finalized" selection. Also fixed: the hours-on-site auto-calc overwrote a manual correction on every mount (a billable field moving on its own), and an equal start/end time reported 24.0h instead of 0.0h. |
| AUTH-SIGNOUT-WIPE | 2026-08-29 | v4.43.0 | Every `SIGNED_OUT` event ran `clearAllData()`, which takes the sync queue with it. Supabase emits the same event for an *involuntary* sign-out, so this app's own `signOut({scope:'others'})` after a password change wiped a field day's un-pushed work on every other device before the tech saw a login screen. Fixed with a `userInitiatedSignOut` intent flag: an involuntary sign-out no longer wipes and **retains** `lastAuthUserId`, so a different user's next sign-in still hits the isolation wipe while the same user signing back in keeps their work. Deliberate sign-out now warns when `pending + failed > 0`. Regression tests: `src/lib/sync/__tests__/user-switch-isolation.test.ts` (15 cases). |
| SYNC-FULLSYNC-WATERMARK | 2026-08-29 | v4.43.0 | `fullSync` deleted still-`pending`/`syncing` queue rows via `clearSyncQueueExceptFailed()` while the `lastFullPush:<entity>` watermark had already been advanced at **scan** time — so the dirty scan then skipped those same rows as "unchanged" and the edits were stranded local-only forever. Tapping "Sync Now" twice on a flaky connection was enough to trigger it, and nothing surfaced it. Fixed by capturing `getUnpushedSyncItemKeys()` **before** the clear and exempting exactly those keys from the watermark skip; the run now logs a `rescued` count. Regression tests: `src/lib/sync/__tests__/fullsync-watermark-drain.test.ts` (4 cases, 2 of which fail against the pre-fix code). |
| SYNC-PREFS-PULL-42703 | 2026-06-12 | v4.41.1 | `[sync] missing-column on globalProjectPreferences` (pull-side, captured 2026-06-12T00:20Z at v4.41.0 — distinct from the push-side SYNC-PREFS-42703 below) — pullSync's deterministic pagination ordered every non-log table by `id`, but `global_project_preferences` has a composite PK (`user_id`, `global_project_id`) and no `id` column → 42703 on every pull cycle, so preferences never roamed between devices. Fixed by ordering that table by `global_project_id` (`user_id` is already pinned by the pull filter). Regression test: `src/lib/sync/__tests__/pull-order-column.test.ts`. |
| SYNC-PREFS-42703 | 2026-06-11 | v4.21.0 + v4.30.0 | `[sync] missing-column on globalProjectPreferences` (3 reports, stamped 4.28.0/4.31.1/4.35.0) — pre-4.21 clients pushed `deleted_at`/`sync_version` to a table without those columns. Fixed by `SKIP_FIELDS` (v4.21.0) and hardened by the push column-allowlist gate (v4.30.0). Prod schema probed 2026-06-11: exactly the 8 expected columns, no drift. Version stamps are report-time (Sync Error Inspector re-reports of old errors), not occurrence-time. |
| SYNC-GDEV-42501 | 2026-06-11 | v4.25.1/v4.27.0 + v4.31.2 | `[sync] rls-rejected on globalDevices` (1 report, stamped 4.31.1) — foreign-authored pulled rows re-pushed by fullSync hit the `created_by = auth.uid()` UPDATE policy. Fixed by the `foreignGlobalAuthor()` drop guard (v4.25.1, generalized v4.27.0) and the coalesced create→update `created_by` stamp (v4.31.2). |
| SYNC-GACT-42501 | 2026-06-11 | v4.25.0/v4.25.1 | `[sync] rls-rejected on globalActivityLog` (1 report, stamped 4.25.0) — generic upsert took the `ON CONFLICT DO UPDATE` branch on the append-only log, tripping the author-only UPDATE policy. Fixed by insert-only push (`ignoreDuplicates`, v4.25.0) plus the foreign-`userId` ownership drop (v4.25.1). |
