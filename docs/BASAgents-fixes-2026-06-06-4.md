# BASAgents Fixes — 2026-06-06 (session 4)

**Trigger:** First run of the new Daily Health Check (`.github/workflows/daily-health-check.yml`) surfaced two things in `docs/ACTIVE-BUGS.md`: (1) the **lint** check failing on a pre-existing repo-wide react-hooks backlog, and (2) **4 open user-reported sync bugs** pulled from Supabase `bug_reports`. The owner asked to clear the lint backlog AND triage the user bugs.

## Header block

| Field | Value |
|-------|-------|
| Date | 2026-06-06 (4th session) |
| Agents | 5 BASAgents in parallel (Desktop & Build, Platform, BAS Tools, Field Connectivity, Project Manager) |
| Work | Cleared the lint error backlog (→ 0 errors) + fixed the 2 user-reported sync bugs |
| Files changed | 27 |
| Insertions / deletions | ~+172 / −54 |
| Lint | `npm run lint`: **0 errors** (59 warnings remain — `<img>` LCP advisories etc.; eslint exits 0) |
| TypeScript / Tests | tsc clean; **358/358** vitest |

## Audit Phase

The Daily Health Check flagged lint ❌ and listed 4 open `bug_reports` rows. Investigation found two root causes worth fixing beyond the lint itself:
- eslint was scanning `src-tauri/target/**` build artifacts (config gap), inflating the count.
- The real source lint errors (~30 across ~23 files) were React-Compiler/react-hooks rules.
- The 2 user bug types ("missing-column on globalProjectPreferences", "unknown on trendSessions") were **real client-side sync-mapping bugs still present after v4.9.1**, not stale.

## Fixes Applied

### Lint backlog → 0 errors

- **`eslint.config.mjs`** — added `src-tauri/target/**` (+`dist/**`) to global ignores so generated `tauri-codegen-assets/*.js` are no longer linted.
- **~23 source files** across all owners fixed for React-Compiler/react-hooks rules (`set-state-in-effect`, `purity`/impure-during-render, `refs`-during-render, `preserve-manual-memoization`, `rules-of-hooks`, unused-disable). Fix philosophy: real refactors preferred (lazy `useState` initializers for impure calls; "adjust-state-during-render" / prev-prop patterns instead of resync effects; drop redundant manual memos), with **scoped, justified `eslint-disable-next-line`** only for genuinely-correct intentional patterns (SSR mount guards, latest-ref pattern in the CodeMirror editor, one-shot external-system syncs). Notable: renamed the misnamed helper `useCalcAs` → `applyCalcAs` in `ahu-processes-panel.tsx` (it's not a hook; the `use*` name tripped rules-of-hooks).

### User-reported sync bugs (both REAL — fixed in client mapping, no migration)

- **Bug A — "[sync] missing-column on globalProjectPreferences" (high):** the pull paths stamp `deletedAt: null` onto every global entity, and `globalProjectPreferences` had no `SKIP_FIELDS` entry — so a pulled-then-edited prefs row pushed `deleted_at`, a column that table doesn't have (→ PGRST204/42703 → "missing-column"). **Fix:** added `globalProjectPreferences: new Set(['deletedAt','syncVersion'])` to `SKIP_FIELDS` in `src/lib/sync/field-map.ts` (mirrors the `globalActivityLog` precedent). The table is correct; no migration.
- **Bug B — "[sync] unknown on trendSessions" (medium):** `trend_sessions.project_id` is NOT NULL, but `trendSessions` was missing from `REQUIRES_PROJECT_ID`, so a session with an empty `projectId` got coerced to `null` and hit a 23502 NOT-NULL violation — uncategorized → "unknown". **Fix:** added `'trendSessions'` to `REQUIRES_PROJECT_ID` in `field-map.ts` so empty-projectId sessions are skipped pre-flight with a clear reason (matches `pidTuningSessions`/`psychSessions`/`dxrs`). The P1 batch had stopped *new* bad rows from being created; this also guards pre-existing queued rows. No migration.

## Housekeeping / notes

- `.claude/settings.local.json` — auto-appended verification allowlist entries. Retained.
- Pre-existing dead constant `SUPABASE_ONLY_FIELDS` in `field-map.ts` and ~59 lint **warnings** (mostly `<img>` LCP) left as-is (warnings don't fail the check); a future polish pass could clear them.

## Verification

- `npm run lint` — **0 errors** (eslint exits 0). `npx tsc --noEmit` — clean. `npx vitest run` — **358/358** (incl. field-map + sync-manager suites).
- Daily Health Check re-run confirmed lint flips to ✅ and the Supabase user-bug pull works.

## Follow-up for the owner

The 4 `bug_reports` rows are now fixed in code but still show in the registry until they're marked resolved in Supabase. Run once in the SQL Editor:
```sql
update public.bug_reports set status = 'resolved', updated_at = now()
where status != 'resolved'
  and (title ilike '%globalProjectPreferences%' or title ilike '%trendSessions%');
```
The next Daily Health Check run will then show them cleared.
