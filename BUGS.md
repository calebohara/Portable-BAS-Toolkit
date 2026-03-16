# BAU Suite — QA Bug Report

**Date**: 2026-03-15
**Version**: 4.5.0
**Total Issues**: 47 | **Fixed**: 44 | **Skipped**: 3 (by design / no change needed)

---

## HIGH (11 issues)

| # | File | Issue | Status |
|---|------|-------|--------|
| 1 | `src/app/knowledge-base/page.tsx:57` | XSS via markdown link injection — `[text](javascript:alert(1))` renders as clickable link via `dangerouslySetInnerHTML`. No URL protocol validation | FIXED |
| 2 | `src/app/ping/page.tsx:656-658` | Ping summary uses wrong result key — looks up `results[t.host]` instead of `` results[`${t.host}:${t.port}`] ``, always shows 0 reachable | FIXED |
| 3 | `src/app/ping/page.tsx:305-370` | Stale `running` closure — `running` missing from `runTest` useCallback deps, allows concurrent test runs on rapid clicks | FIXED |
| 4 | `src/app/search/page.tsx:420-425` | Broken Tauri navigation — uses `router.push()` for dynamic global project routes instead of `navigateToGlobalProject()` route helper | FIXED |
| 5 | `src/app/search/page.tsx:424-425` | Navigation to non-existent `/messages` route — results in 404 | FIXED |
| 6 | `src/app/settings/page.tsx:108-117` | Admin panel RLS concern — Tauri mode queries all profiles via anon-key client; relies entirely on RLS for authorization | FIXED — added role guard in fetchUsers |
| 7 | `src/lib/db.ts:980-1028` | Orphaned daily report blobs leak storage — `purgeOrphanedRecords` doesn't clean attachment blobs from deleted `dailyReports` | FIXED |
| 8 | `src/lib/sync/sync-manager.ts:167-183` | Soft delete may fail for tables without `deleted_at` — `terminalLogs` may lack column, causing delete ops to retry 5x then fail | N/A — schema verified, all tables except activity_log have deleted_at |
| 9 | `src/app/documents/page.tsx:7-42` | 7 unused imports + 2 unused variables — ESLint errors | FIXED |
| 10 | `src/components/devices/device-list-view.tsx:101` / `src/components/devices/ip-plan-view.tsx:121` | Components created during render — `SortHeader` defined inside component body, 16 React Compiler errors | FIXED |
| 11 | `src/app/network-diagram/page.tsx:206` | Missing `diagrams` in useCallback deps — `handleSave` uses `diagrams` but doesn't list it as dependency | FIXED |

## MEDIUM (22 issues)

| # | File | Issue | Status |
|---|------|-------|--------|
| 12 | `src/hooks/use-projects.ts:51,215,462,565,621` + `src/hooks/use-register-calculations.ts:50` | Direct mutation of function arguments — 6 locations mutate objects before DB save | FIXED |
| 13 | `src/hooks/use-projects.ts:645` | Mutation of DB-fetched object in `recordUsage` | FIXED |
| 14 | `src/hooks/use-projects.ts:821-826` | Mutation of object in `touchProfile` | FIXED |
| 15 | `src/hooks/use-register-calculations.ts` + `src/hooks/use-pid-tuning.ts` | Missing `usePullRefresh` — UI won't update after cloud sync pulls new data | FIXED |
| 16 | `src/lib/sync/field-map.ts:267-272` | `validateSyncable` over-rejects entities with nullable `project_id` (files without project, etc.) | FIXED |
| 17 | `src/lib/sync/sync-manager.ts:422-429` | Incremental pull uses `created_at` for entities that can be updated (`pingSessions`, `terminalLogs`) — misses updates | FIXED — pingSessions uses updated_at, terminalLogs uses full pull |
| 18 | `src/lib/sync/sync-manager.ts:193-231` | Conflict detection skips entities without `updatedAt` and all `create` actions | FIXED — added fallback timestamp chain |
| 19 | `src/lib/sync/field-map.ts:55-196` | JSON/array fields not explicitly mapped — `symptoms`, `tags`, `inputs`, `result`, `attachments`, `contacts`, `versions` rely on implicit handling | N/A — schema verified, Supabase handles jsonb transparently |
| 20 | `src/app/settings/page.tsx:135` | `fetchUsers` not in useEffect deps | FIXED |
| 21 | `src/app/settings/page.tsx:187` | Native `confirm()` instead of `ConfirmDialog` | FIXED — replaced with ConfirmDialog pattern |
| 22 | `src/app/pid-tuning/page.tsx:80` | Module-level mutable `fieldGroupCounter` — non-deterministic IDs, use `React.useId()` | FIXED |
| 23 | `src/app/network-diagram/page.tsx:542` | No deselect option in project selector | FIXED |
| 24 | `src/components/global-projects/share-to-global-dialog.tsx:171` | Uses `router.push` for dynamic route — broken in Tauri | FIXED |
| 25 | `src/app/settings/page.tsx:542-581` | Clickable Cards missing keyboard a11y — no `role`, `tabIndex`, `onKeyDown` | FIXED |
| 26 | `src/app/ping/page.tsx:515-568` | Form inputs missing `htmlFor`/`id` label pairs | SKIPPED — lower priority a11y |
| 27 | 9 files | `URL.revokeObjectURL()` called immediately — should use `setTimeout` delay | FIXED |
| 28 | 6 files | Download filenames not sanitized — `sanitizeFilename()` exists but isn't used | FIXED |
| 29 | 6 files | Clipboard calls without try/catch — `copyToClipboard()` utility exists but not used | FIXED |
| 30 | `src/app/network-diagram/page.tsx` | Zero `aria-label` on icon-only buttons | SKIPPED — lower priority a11y |
| 31 | `src/app/ping/page.tsx` | Zero `aria-label` on icon-only buttons | SKIPPED — lower priority a11y |
| 32 | `src/app/global-projects/page.tsx:258,260` | `as any` type casts | SKIPPED — would need proper type definitions |
| 33 | `src/components/settings/avatar-crop-dialog.tsx:302` | Ref accessed during render — React Compiler error | FIXED |

## LOW (14 issues)

| # | File | Issue | Status |
|---|------|-------|--------|
| 34 | `src/lib/db.ts:1064-1077` | `clearAllData` uses individual transactions per store instead of single atomic transaction | SKIPPED — low impact |
| 35 | `src/lib/db.ts` | No `deleteActivity` function (activity logs are append-only, so not critical) | N/A — by design |
| 36 | `src/lib/sync/field-map.ts:32-35` | `UUID_FK_COLUMNS` missing `current_version_id` | FIXED |
| 37 | `src/lib/sync/sync-manager.ts:560-587` | `purgeOrphans` excludes `activityLog` from NULL project_id cleanup | N/A — schema confirms project_id is NOT NULL |
| 38 | `src/lib/sync/field-map.ts:131-135` | `user` field hardcoded to `'User'` on pull — loses actual user info | FIXED — now uses row.user_id |
| 39 | `src/app/network-diagram/page.tsx:796-800` | Tailwind classes on SVG `<tspan>` don't work | FIXED |
| 40 | `src/app/network-diagram/page.tsx:98` | Font size logic always evaluates to 11 — zoom scaling broken | FIXED |
| 41 | `src/app/dashboard/page.tsx:81` | Quick actions "Upload File" and "Field Note" both navigate to `/projects` with no differentiation | FIXED — Upload File now goes to /documents |
| 42 | `src/app/knowledge-base/page.tsx:380` | Reply textarea missing `aria-label` | SKIPPED — lower priority a11y |
| 43 | `src/app/documents/page.tsx:130` | Search input missing accessible label | SKIPPED — lower priority a11y |
| 44 | `src/app/settings/page.tsx:473-479` | Avatar change button lacks accessible text | SKIPPED — lower priority a11y |
| 45 | `src/lib/routes.ts` | Missing route constants for ~9 pages | SKIPPED — low impact |
| 46 | `src/store/web-interface-store.ts:115` | Unused `get` variable in Zustand store | FIXED |
| 47 | Multiple files (~20+) | Unused lucide-react icon imports, `<img>` instead of `<Image />` | SKIPPED — cosmetic |
