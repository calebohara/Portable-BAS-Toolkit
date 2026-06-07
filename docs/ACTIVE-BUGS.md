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
**Last run:** 2026-06-07 13:43 UTC · [run log](https://github.com/calebohara/Portable-BAS-Toolkit/actions/runs/27094146084)

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
_No open user-reported bugs as of 2026-06-07 13:43 UTC. 🎉_
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
| _none yet_ | | | |
