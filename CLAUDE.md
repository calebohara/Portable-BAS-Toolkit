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

## BASAgents Fix Documentation Rule

**Whenever BASAgents run an audit and fixes are applied, create a new dated log file:**

```
docs/BASAgents-fixes-YYYY-MM-DD.md
```

Use the current date at the time of the fix session. Create a new file each time — never overwrite an existing log. If multiple sessions occur on the same day, append a suffix: `BASAgents-fixes-2026-05-09-2.md`.

### Required sections in every fix log

1. **Header block** — date, agent count, files changed, insertions/deletions
2. **Audit Phase** — table of agents, ownership areas, and files read
3. **Fixes Applied** — grouped by priority (P0 / P1 / P2 / P3), each with:
   - File path
   - Issue description (what was wrong and why it mattered)
   - Fix description (what changed and how)
4. **Housekeeping** — any cleanup tasks done outside the fix scope
5. **Verification** — test results, lint output, TypeScript compile status

### Reference

- Agent team definition: `.claude/BASAgents.md`
- Fix log archive: `docs/BASAgents-fixes-*.md`

---

## DesignAgents Fix Documentation Rule

**Whenever DesignAgents run an audit and fixes are applied, create a new dated log file:**

```
docs/DesignAgents-fixes-YYYY-MM-DD.md
```

Use the current date at the time of the fix session. Create a new file each time — never overwrite an existing log. If multiple sessions occur on the same day, append a suffix: `DesignAgents-fixes-2026-05-09-2.md`.

Same required sections as BASAgents fix logs: header block, audit phase, fixes by priority, housekeeping, verification.

### Reference

- Agent team definition: `.claude/DesignAgents.md`
- Fix log archive: `docs/DesignAgents-fixes-*.md`

---

## DxrAgents Fix Documentation Rule

**Whenever DxrAgents run an audit and fixes are applied, create a new dated log file:**

```
docs/DxrAgents-fixes-YYYY-MM-DD.md
```

Use the current date at the time of the fix session. Create a new file each time — never overwrite an existing log. If multiple sessions occur on the same day, append a suffix: `DxrAgents-fixes-2026-05-09-2.md`.

Same required sections as BASAgents fix logs: header block, audit phase, fixes by priority, housekeeping, verification.

### Reference

- Agent team definition: `.claude/DxrAgents.md`
- Fix log archive: `docs/DxrAgents-fixes-*.md`

---

## SyncErrorAgents Fix Documentation Rule

**Whenever SyncErrorAgents run an audit and fixes are applied, create a new dated log file:**

```
docs/SyncErrorAgents-fixes-YYYY-MM-DD.md
```

Use the current date at the time of the fix session. Create a new file each time — never overwrite an existing log. If multiple sessions occur on the same day, append a suffix: `SyncErrorAgents-fixes-2026-05-09-2.md`.

Same required sections as BASAgents fix logs: header block, audit phase, fixes by priority, housekeeping, verification.

### Reference

- Agent team definition: `.claude/SyncErrorAgents.md`
- Fix log archive: `docs/SyncErrorAgents-fixes-*.md`

---

## SyncAuditAgents Fix Documentation Rule

**Whenever SyncAuditAgents run an audit and fixes are applied, create a new dated log file:**

```
docs/SyncAuditAgents-fixes-YYYY-MM-DD.md
```

Use the current date at the time of the fix session. Create a new file each time — never overwrite an existing log. If multiple sessions occur on the same day, append a suffix: `SyncAuditAgents-fixes-2026-05-09-2.md`.

Same required sections as BASAgents fix logs: header block, audit phase, fixes by priority, housekeeping, verification.

### Reference

- Agent team definition: `.claude/SyncAuditAgents.md`
- Findings doc: `docs/SyncAuditAgents-findings-*.md`
- Fix log archive: `docs/SyncAuditAgents-fixes-*.md`

---

## ReviewAgents Findings Documentation Rule

**ReviewAgents is read-only.** It never edits code. Each audit session produces one dated findings doc:

```
docs/ReviewAgents-findings-YYYY-MM-DD.md
```

Use the current date at the time of the audit. Create a new file each time — never overwrite an existing findings doc. If multiple sessions occur on the same day, append a suffix: `ReviewAgents-findings-2026-05-20-2.md`.

### Required sections in every findings doc

1. **Header block** — date, agent count (6), files reviewed, LOC reviewed, mode (read-only)
2. **Executive Summary** — table of P0/P1/P2/P3 counts and the top theme per priority
3. **Findings grouped by priority** (P0 → P1 → P2 → P3), each with:
   - Location (`file:line`)
   - Owner agent (which of the 6 found it)
   - Current behavior
   - Why it's a bug / inconsistency / bloat
   - Suggested fix (described, not applied)
   - Handoff target (which fix-team agent should own remediation)
4. **Cross-cutting findings** — items spanning multiple agents' slices, owned by the Cross-Cutting Pattern Auditor
5. **Out of scope / deferred** — explicit list of items not recommended for fixing this round, with reasons

### No fix log from ReviewAgents itself

When fixes are subsequently applied by a different team (typically BASAgents), that team writes its own fix log under its own rule above (e.g., `docs/BASAgents-fixes-YYYY-MM-DD.md`). The fix log should reference the originating findings doc.

### Reference

- Agent team definition: `.claude/ReviewAgents.md`
- Findings doc archive: `docs/ReviewAgents-findings-*.md`

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
