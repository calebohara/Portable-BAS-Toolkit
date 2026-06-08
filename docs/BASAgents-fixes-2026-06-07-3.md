# BASAgents Fixes — 2026-06-07 (session 3)

**Trigger:** User request — new Daily Reports have no name field, so they display as "Report #1". Users should be able to name a report.

## Header block

| Field | Value |
|-------|-------|
| Date | 2026-06-07 (3rd session) |
| Agent | Project Manager (Daily Reports + reconcile + types) |
| Scope | Add an optional `name`/title to Daily Reports (UI + sync + migration) |
| Files changed | 13 modified, 1 new migration |
| Insertions / deletions | ~+45 / −17 (+ migration) |
| TypeScript / Lint | clean (pre-existing unrelated warnings only) |
| Tests | **378 passed** |

## Audit Phase

Daily Reports had no name field — identified only by an auto-incrementing `reportNumber` rendered as "Report #N" across the list, detail page, global view, and exports. Daily Reports is a **synced entity** (`daily_reports` ↔ `global_daily_reports`), so a new field needs the type, form, all display sites, the global reconcile mappers, the export defaults, **and** a Supabase column on both tables.

## Fixes Applied

### Name field added (optional, backward-compatible)
- **Types:** `name?: string` added to `DailyReport` (`src/types/index.ts`) and `GlobalDailyReport` (`src/types/global-projects.ts`). Optional so existing rows (no name) keep working.
- **Form** (`src/components/reports/report-form.tsx`): new optional **"Report Name"** text input at the top of the header grid (placeholder "e.g. VAV Commissioning — Floor 3 (optional)"), seeded from `initial?.name`, included in both the autosave and submit payloads (trimmed; omitted when blank), and threaded through `maybeLinkToGlobalProject` so a linked global report carries the title.
- **Display** (fallback `report.name?.trim() || \`Report #N\``, with `#N` kept as secondary context): reports list (`app/reports/page.tsx`), report detail TopBar + `<h1>` + delete-confirm (`app/reports/[...slug]/client-page.tsx`), global report list row + delete confirm (`app/global-projects/[...slug]/client-page.tsx`), and the edit-mode form title. Blank-name reports are unchanged.
- **Export defaults** (precedence: user-entered export title → report name → `#N`): `report-eml.ts` (subject + title) and `report-export-dialog.tsx` (Teams heading, Outlook subject, PDF heading, title-input placeholder).

### Sync wiring
- **Reconcile** (`src/lib/global-projects/reconcile.ts`): `name` added to `mapLocalReportToRow` (push, `?? null`) and `mapGlobalReportToLocal` (pull, `?? undefined`).
- **`addGlobalReport`** (`src/lib/global-projects/api.ts`): added `name: data.name ?? null` to the field-by-field row builder used by the form's direct global-link path (it would otherwise drop the name).
- **field-map:** no change needed — `name` is not in `LOCAL_ONLY_FIELDS`/`SKIP_FIELDS`, so the local `daily_reports` push auto-converts `name` → `name`.

### Migration (`supabase/migrations/add-daily-report-name.sql`)
- `alter table daily_reports add column if not exists name text;` and the same on `global_daily_reports`. Guarded self-recording footer + `notify pgrst`. Tracking: probe added to `supabase/check-migrations.sql` (sentinel `daily_reports.name`), backfill line, and index row in `docs/MIGRATIONS.md` (status **P — pending**).

## Verification
- `npx tsc --noEmit` — clean. `npx eslint` on changed files — 0 errors (pre-existing unused-import warnings only). `npx vitest run` — **378 passed** (report-eml default-subject test still passes; its fixture report has no name).

## Follow-up for the owner
- **Apply `add-daily-report-name.sql`** in the Supabase SQL Editor. Until then, naming works locally but the `name` won't sync to the cloud (and a push of a named report would otherwise hit a missing-column error — the column must exist first). After applying, it self-records in the ledger.
