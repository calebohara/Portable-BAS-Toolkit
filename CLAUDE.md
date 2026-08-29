# BAU Suite — Claude Code Project Rules

## Sync Feature Freeze (2026-06-11)

**No new sync modes and no new global entity types** until the remaining
multi-user audit debt is closed. The 2026-06-08 audits established that sync
bugs cluster at the seams between writer paths and per-entity special cases —
every added sync surface multiplies both.

- ❌ Do NOT add: new `global_*` tables/entity types, new reconcile directions,
  new selective-sync modes, or any new code path that writes to `global_*`
  tables outside the two existing writers (sync-manager queue + reconcile).
- ✅ OK: bug fixes, hardening of existing paths, tests, UI surfacing of
  existing sync state (status badges, conflict UI).
- Conflict logic lives in ONE place: `pushRowMatchesRemote` + comparator
  helpers in `src/lib/sync/field-map.ts`. Both global writers (queue push and
  reconcile Share-to-Global) import it. Never re-implement a comparator, and
  never compare a LOCAL table's `syncVersion` against a GLOBAL table's
  `sync_version` (independent counters — caused the v4.32.0 P0).
- Lift this freeze only when the open SyncAuditAgents findings (s3) are
  resolved or explicitly waived by the owner.

## Agent Team Documentation Rule

Every agent team writes ONE dated log per session under `docs/`. Never overwrite
an existing log — create a new file each time. For a second session on the same
day, append a numeric suffix (`-2`, `-3`).

| Team | Roster | Log file | Mode |
|------|--------|----------|------|
| BASAgents | `.claude/BASAgents.md` | `docs/BASAgents-fixes-YYYY-MM-DD.md` | audit + fix |
| DesignAgents | `.claude/DesignAgents.md` | `docs/DesignAgents-fixes-YYYY-MM-DD.md` | audit + fix |
| LandingAgents | `.claude/LandingAgents.md` | `docs/LandingAgents-fixes-YYYY-MM-DD.md` | audit + fix |
| ShareAgents | `.claude/ShareAgents.md` | `docs/ShareAgents-fixes-YYYY-MM-DD.md` | audit + fix |
| SyncAgents | `.claude/SyncAgents.md` | `docs/SyncAgents-fixes-YYYY-MM-DD.md` | audit + fix |
| DxrAgents | _log convention only_ | `docs/DxrAgents-fixes-YYYY-MM-DD.md` | audit + fix |
| SyncErrorAgents | _log convention only_ | `docs/SyncErrorAgents-fixes-YYYY-MM-DD.md` | audit + fix |
| SyncAuditAgents | _log convention only_ | `docs/SyncAuditAgents-findings-*.md` + `-fixes-*.md` | audit + fix |
| ReviewAgents | _log convention only_ | `docs/ReviewAgents-findings-YYYY-MM-DD.md` | **read-only** |

"_log convention only_" means there is no roster file in `.claude/` — that name is
a label for a single-session effort, not a standing team. (`SyncErrorAgents`'
own log records "Agents engaged: 1"; `SyncAuditAgents-fixes-2026-06-11.md` says
"single session, no agent team fan-out".) Do not invent a roster to match the
name; either work solo under the label or promote it to a real roster file and
move its row up.

### Required sections in every fix log

1. **Header block** — date, agent count, files changed, insertions/deletions,
   and the verification status (typecheck / lint / tests / build).
2. **Audit Phase** — table of agents, ownership areas, and files read.
3. **Fixes Applied** — grouped by priority (P0 / P1 / P2 / P3), each with:
   - File path
   - Issue description (what was wrong and why it mattered)
   - Fix description (what changed and how)
4. **Housekeeping** — cleanup done outside the fix scope.
5. **Verification** — test results, lint output, TypeScript compile status.
6. **Deferred** — findings deliberately NOT fixed this session, with the reason.
   A finding that is dropped silently is indistinguishable from one that was
   never found.

### Read-only teams

ReviewAgents never edits code; its session produces a findings doc instead of a
fix log. In addition to the sections above (minus "Fixes Applied"), a findings
doc carries, per finding: location (`file:line`), owning agent, current
behavior, why it is a defect, suggested fix (described, not applied), and the
handoff target. When another team later applies those fixes, that team writes
its own fix log referencing the originating findings doc.

### Rules for running any team

- **Audit read-only first, then fix.** Spawn the audit agents with an explicit
  "do not edit any file" instruction and collect findings; apply fixes in a
  second pass. Parallel agents editing at once conflict on shared files
  (`src/types/index.ts`, `src/lib/utils.ts`), and a findings-then-fixes split is
  what the log format above already assumes.
- **Establish a green baseline before auditing.** Run `npm run health` first and
  record the result, so a failure found later is attributable. Check exit codes
  directly — `npm run typecheck | tail` reports *tail's* exit status, not tsc's.
- **Verify a finding before acting on it.** Agent reports are input, not truth.
  Read the cited `file:line` yourself; a confident, wrong finding costs more than
  a missed one.
- **A test that pins buggy behavior must be updated, not worked around** — and
  the change must be called out in the log, because it looks like a weakened
  test in review.
- **Respect the Sync Feature Freeze above.** Any proposal that adds a `global_*`
  table, entity type, reconcile direction, selective-sync mode, or a new writer
  to `global_*` is out of scope; mark it BLOCKED BY FREEZE rather than routing
  around it.

---

## Supabase Migration Tracking Rule

Migrations are applied **manually via the Supabase SQL Editor** — there is no
Supabase CLI, no `db push`, no timestamped filenames. Applied migrations are
recorded in the `schema_migrations` ledger table. **Whenever you add a new
migration under `supabase/migrations/`, you MUST also:**

1. **End the migration file** with the self-recording footer (guarded with
   `to_regclass` so it's a no-op — not a `42P01` error — if the ledger doesn't
   exist yet, keeping apply-order irrelevant):
   ```sql
   do $$
   begin
     if to_regclass('public.schema_migrations') is not null then
       insert into schema_migrations (id) values ('<this-filename>.sql')
         on conflict (id) do nothing;
     end if;
   end $$;
   notify pgrst, 'reload schema';
   ```
2. **Add a probe block** for it to `supabase/check-migrations.sql` (one
   `union all select … exists(…)` line with a unique sentinel object).
3. **Add a backfill line** to `supabase/backfill-schema-migrations.sql`.
4. **Add a row** to the Migration index table in `docs/MIGRATIONS.md`.

Never silently add a migration without these four updates — the ledger and the
drift checker are the only defense against "is this applied to prod?" guesswork.

### Reference

- Runbook + migration index: `docs/MIGRATIONS.md`
- Ledger table: `supabase/migrations/add-schema-migrations-ledger.sql`
- Drift checker (read-only): `supabase/check-migrations.sql`
- One-time backfill: `supabase/backfill-schema-migrations.sql`

---

## Active Bugs Registry & Daily Health Check

`docs/ACTIVE-BUGS.md` is the **single source of truth for active bugs**. It has two
machine-managed blocks (between `<!-- ...:START/END -->` markers) and two manual
sections:

- **🤖 Daily health check** + **📥 User-reported bugs** — regenerated by the
  `.github/workflows/daily-health-check.yml` cron (runs `tsc`/`eslint`/`vitest`/
  `build:static`/`cargo`, then pulls open Supabase `bug_reports`). Do NOT hand-edit
  inside the markers — `scripts/update-active-bugs.mjs` overwrites them.
- **✋ Manually tracked** + **✅ Recently resolved** — edit these by hand. When you
  fix a bug, move its row to "Recently resolved" with the version/commit.

Run the same checks locally with `npm run health` (typecheck + lint + tests).
The Supabase pull needs repo secrets `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.

### Discord notifications

- **Real-time** — `supabase/migrations/add-bug-report-discord-notify.sql` adds a
  `bug_reports` INSERT trigger (`notify_discord_on_bug_report`, via `pg_net`) that
  posts to a Discord webhook the moment a user submits a bug. The webhook URL is
  stored in Supabase **Vault** as `discord_bug_webhook` (not in git); no-op until set.
- **Digest + CI failures** — `scripts/notify-discord.mjs` (run by the daily health
  check) pings Discord when a check fails or bugs are open; `ci.yml` pings on a
  failed push gate. Both use the `DISCORD_WEBHOOK_URL` GitHub Actions secret and
  stay silent when all is green.

### README ↔ code sync

The README's tool list and changelog are kept honest by two layers:

- **Deterministic** — `.github/workflows/readme-sync-check.yml` runs
  `scripts/check-readme-sync.mjs` on pushes that touch docs/tool files (+ weekly).
  It asserts every tool in the canonical list (`src/app/landing-content.ts`
  `toolGroups`) is referenced in `README.md`, and warns if the "What's New"
  version lags `package.json`. Run locally with `npm run check:readme`.
- **Semantic** — the weekly `weekly-readme-review` scheduled Claude routine judges
  whether the README *descriptions* are still accurate vs. the real tools, and
  records drift findings.

When you add/rename/remove a tool, update `README.md` (and `landing-content.ts`)
so the deterministic check stays green.
