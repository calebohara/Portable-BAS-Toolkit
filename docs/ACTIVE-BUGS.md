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
**Last run:** 2026-07-19 13:38 UTC · [run log](https://github.com/calebohara/Portable-BAS-Toolkit/actions/runs/29689088655)

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
**2** open reports as of 2026-07-19 13:38 UTC.

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
| _none yet_ | | | | | | |

---

## ✅ Recently resolved

Move fixed items here (with the commit/version that fixed them) so there's a paper trail.

| ID | Resolved | Fixed in | Description |
|----|----------|----------|-------------|
| SYNC-PREFS-PULL-42703 | 2026-06-12 | v4.41.1 | `[sync] missing-column on globalProjectPreferences` (pull-side, captured 2026-06-12T00:20Z at v4.41.0 — distinct from the push-side SYNC-PREFS-42703 below) — pullSync's deterministic pagination ordered every non-log table by `id`, but `global_project_preferences` has a composite PK (`user_id`, `global_project_id`) and no `id` column → 42703 on every pull cycle, so preferences never roamed between devices. Fixed by ordering that table by `global_project_id` (`user_id` is already pinned by the pull filter). Regression test: `src/lib/sync/__tests__/pull-order-column.test.ts`. |
| SYNC-PREFS-42703 | 2026-06-11 | v4.21.0 + v4.30.0 | `[sync] missing-column on globalProjectPreferences` (3 reports, stamped 4.28.0/4.31.1/4.35.0) — pre-4.21 clients pushed `deleted_at`/`sync_version` to a table without those columns. Fixed by `SKIP_FIELDS` (v4.21.0) and hardened by the push column-allowlist gate (v4.30.0). Prod schema probed 2026-06-11: exactly the 8 expected columns, no drift. Version stamps are report-time (Sync Error Inspector re-reports of old errors), not occurrence-time. |
| SYNC-GDEV-42501 | 2026-06-11 | v4.25.1/v4.27.0 + v4.31.2 | `[sync] rls-rejected on globalDevices` (1 report, stamped 4.31.1) — foreign-authored pulled rows re-pushed by fullSync hit the `created_by = auth.uid()` UPDATE policy. Fixed by the `foreignGlobalAuthor()` drop guard (v4.25.1, generalized v4.27.0) and the coalesced create→update `created_by` stamp (v4.31.2). |
| SYNC-GACT-42501 | 2026-06-11 | v4.25.0/v4.25.1 | `[sync] rls-rejected on globalActivityLog` (1 report, stamped 4.25.0) — generic upsert took the `ON CONFLICT DO UPDATE` branch on the append-only log, tripping the author-only UPDATE policy. Fixed by insert-only push (`ignoreDuplicates`, v4.25.0) plus the foreign-`userId` ownership drop (v4.25.1). |
