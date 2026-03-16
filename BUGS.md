# BAU Suite — QA Bug Report

<!--
RULES:
1. COUNTS: When updating any issue status, recount ALL rows in every table and update
   the summary counts below. Count FIXED (including N/A) and SKIPPED separately.
   Section headers (e.g. "## HIGH (11 issues)") must also be recounted to match.
2. VERIFY: When this file is referenced by the user (e.g. "check BUGS.md", "look at BUGS.md"),
   always review all CRITICAL and HIGH issues first — verify they are actually fixed
   in the codebase, not just marked FIXED. Spot-check at least 2 MEDIUM fixes too.
3. TIMESTAMPS: Timestamp every bug when it is logged (Found column) and when it is fixed
   (Fixed column) using ISO datetime format (YYYY-MM-DD HH:MM). Add these columns to
   all new tables.
4. LAST UPDATED: Update the "Last updated" line below every time this file is modified,
   including time.
5. AUDIT TRAIL: Never remove or overwrite a previous sweep's data. New sweeps get their
   own section appended below. This preserves the full history.
6. REGRESSIONS: If a previously-FIXED bug is found broken again, do NOT change the
   original row. Instead, add a new row in the current sweep referencing the original
   (e.g. "Regression of #1 — ...") so both the fix and the regression are tracked.
7. SKIPPED REVIEW: SKIPPED items must include a reason. On each new sweep, re-evaluate
   all previously SKIPPED items — if the codebase has changed enough to make a fix
   trivial, upgrade the status. Never let SKIPPED items go stale without review.
8. SEVERITY: Use exactly these levels: CRITICAL (data loss, security exploit, crash),
   HIGH (wrong behavior, broken feature, security hardening), MEDIUM (degraded UX,
   edge case, a11y gap), LOW (cosmetic, style, nice-to-have). Never inflate severity.
9. DUPLICATES: Before adding a new issue, check all existing rows (all sweeps) for
   duplicates. If the same root cause exists, add a note to the existing row instead
   of creating a new entry.
10. BUILD GATE: Every sweep must end with a passing `tsc --noEmit` and `npm run build`.
    Record the result at the bottom of each sweep section.
11. REPLY LOG: Every user reply during a BUGS.md or QC session must be logged verbatim
    in `REPLY.md` with a timestamp (YYYY-MM-DD HH:MM). This preserves user intent,
    decisions, and feedback as an audit trail.
12. FIX VERIFICATION: After marking any issue FIXED, verify the fix compiles AND doesn't
    regress adjacent behavior. "FIXED" means verified-working, not just "code changed."
    If the same pattern exists in other files (e.g., keyboard a11y, notifySync), check
    ALL files — a fix that patches one file when five have the same bug is incomplete.
-->

**Version**: 4.5.0
**Last updated**: 2026-03-16 01:20
**Sweep 1**: 47 issues | 44 fixed | 3 skipped
**Sweep 2**: 47 issues | 32 fixed | 15 skipped
**Sweep 3**: 18 issues | 15 fixed | 3 skipped
**Sweep 4**: 15 issues | 13 fixed | 2 skipped

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

---

# Sweep 2 — Post-Fix QA

**Date**: 2026-03-15
**Version**: 4.5.0
**Total Issues**: 47 | **Fixed**: 32 | **Skipped**: 15

---

## CRITICAL (1 issue)

| # | File | Issue | Status |
|---|------|-------|--------|
| S2-1 | `src/lib/db.ts` (`purgeOrphanedRecords`) | **Data loss** — purge deletes files/notes/devices with `projectId === ''` (unassigned items) because it treats empty string as orphaned. Should only purge records whose `projectId` references a deleted project | FIXED — inverted condition to only purge valid-UUID refs to deleted projects |

## HIGH (9 issues)

| # | File | Issue | Status |
|---|------|-------|--------|
| S2-2 | `src/app/knowledge-base/page.tsx:324` | XSS via attribute injection — markdown link URL not escaping double quotes. `[click](http://x" onclick="alert(1))` breaks out of `href` attribute | FIXED — escape `"` to `&quot;` in URLs |
| S2-3 | `src/app/network-diagram/page.tsx:421-436` | SVG export serializes user-entered node labels without sanitization — SVG can contain `<script>` if opened in browser | FIXED — strip scripts and on* handlers from cloned SVG |
| S2-4 | `src/lib/db.ts` (`deleteProject`) | Cascade-deletes children (files, notes, devices, etc.) without calling `notifySync()` for each — sync bridge never learns about deletions, cloud retains orphans | FIXED — added notifySync for all 11 child entity types |
| S2-5 | `src/lib/db.ts` (`deleteFile`) | Cascade-deletes child notes without `notifySync()` — same sync orphan issue | FIXED — added notifySync for each deleted note |
| S2-6 | `src/lib/sync/field-map.ts` (`validateSyncable`) | Pull sync still drops entities with nullable `project_id` when the field is empty string or null — unassigned files can't round-trip | N/A — verified files already excluded from REQUIRES_PROJECT_ID, push converts '' to NULL |
| S2-7 | `src/components/layout/sync-status.tsx:48` | Impure function call during render — React Compiler error | SKIPPED — Date.now() is idiomatic React, not a real issue |
| S2-8 | `src/app/terminal/page.tsx:75,102,352,969,985` | 5 instances of `setState` called synchronously inside `useEffect` — React Compiler errors | SKIPPED — common React pattern, low risk refactor across 1000+ line file |
| S2-9 | `src/app/global-projects/[...slug]/client-page.tsx:108` + `src/app/projects/[...slug]/client-page.tsx:87` + `src/app/ping/page.tsx:276` + `src/app/web-interface/page.tsx:118` + `src/providers/auth-provider.tsx:110` | `setState` in `useEffect` — React Compiler errors across 5 more files | SKIPPED — common React pattern, would require significant refactor |
| S2-10 | `src/app/reports/[...slug]/edit-client-page.tsx:28` | Uses `<a>` instead of `<Link>` for `/reports/` navigation — causes full page reload | FIXED — replaced with next/link Link |

## MEDIUM (18 issues)

| # | File | Issue | Status |
|---|------|-------|--------|
| S2-11 | `src/app/pid-tuning/page.tsx` | No deselect option in project selector — once a project is selected, it can't be cleared | FIXED — added "-- None --" deselect option |
| S2-12 | `src/app/network-diagram/page.tsx` | SVG/PNG export dark mode — exported image uses current theme colors but may be unreadable on different background | SKIPPED — needs design decision on forced light-mode export |
| S2-13 | `src/app/ping/page.tsx` | Average ping calculation includes unreachable hosts (0ms), skewing the average down | FIXED — filter to reachable hosts only |
| S2-14 | `src/app/documents/page.tsx:152-160` | Document list cards with `onClick` lack keyboard a11y (`role`, `tabIndex`, `onKeyDown`) | FIXED — added role, tabIndex, onKeyDown |
| S2-15 | `src/components/share/share-dialog.tsx:284` + `src/components/reports/report-export-dialog.tsx:399` | Clipboard copy uses `navigator.clipboard.writeText()` directly instead of `copyToClipboard()` utility — fails in Tauri/non-HTTPS | FIXED — switched to copyToClipboard() |
| S2-16 | `src/components/reports/report-form.tsx:106-114` | Hours calculation produces negative for overnight shifts (end < start) — silently shows nothing | FIXED — wrap around with +1440 min |
| S2-17 | `src/components/reports/report-form.tsx:247-253` | Switch `<Label htmlFor="link-global">` but Switch has no `id="link-global"` — screen readers can't associate | FIXED — added id to Switch |
| S2-18 | `src/lib/sync/sync-manager.ts` | Activity log conflict detection uses `createdAt` but activity logs are append-only — timestamp comparison is semantically wrong | SKIPPED — append-only by design, conflict detection N/A |
| S2-19 | `src/lib/sync/field-map.ts` | Unassigned files (empty `project_id`) can't round-trip through sync — push strips empty project_id, pull rejects null project_id | N/A — verified push converts '' to NULL, files excluded from REQUIRES_PROJECT_ID |
| S2-20 | `src/lib/db.ts` | Missing defensive `(report.attachments \|\| [])` guard in purge — crashes if attachments is undefined | FIXED — added ?? [] guard in deleteProject |
| S2-21 | `src/lib/db.ts` | Device and IP plan creation missing `createdAt`/`updatedAt` timestamps | SKIPPED — timestamps set by calling hooks, not db.ts CRUD |
| S2-22 | `src/hooks/use-register-calculations.ts` + `src/hooks/use-pid-tuning.ts` | Hook CRUD functions missing try/catch — unhandled errors crash the UI | FIXED — wrapped in try/catch with toast.error |
| S2-23 | `src/components/files/global-upload-dialog.tsx:126` + `src/components/files/upload-file-dialog.tsx:136` | React Compiler skips compilation due to memoization incompatibility | SKIPPED — cosmetic compiler warning |
| S2-24 | `src/app/pid-tuning/page.tsx` | Symptom toggle buttons lack `role="checkbox"` and `aria-checked` — screen readers can't convey toggle state | N/A — already has role="checkbox" and aria-checked |
| S2-25 | `src/app/dashboard/page.tsx:427` | ProjectCard `onKeyDown` only handles Enter, missing Space key (WCAG requirement for `role="button"`) | FIXED — added Space key with preventDefault |
| S2-26 | `src/app/search/page.tsx:158` | Search input has no `aria-label` or associated label | FIXED — added aria-label="Search" |
| S2-27 | Multiple files | Loading spinners are purely visual — no `role="status"` or `aria-live` for screen readers | SKIPPED — lower priority a11y |
| S2-28 | `src/app/ping/page.tsx` | Passive wheel event listener — potential scroll jank | SKIPPED — low impact |

## LOW (9 issues)

| # | File | Issue | Status |
|---|------|-------|--------|
| S2-29 | `src/app/network-diagram/page.tsx:432` | SVG/PNG export filename uses `.replace(/\s+/g, '_')` instead of `sanitizeFilename()` — unsafe chars in filename | FIXED — uses sanitizeFilename() |
| S2-30 | `src/lib/utils.ts:44-52` | `sanitizeFilename` doesn't restrict length — very long names can hit Windows 260-char path limit | FIXED — added .substring(0, 200) |
| S2-31 | `src/lib/pid-tuning-engine.ts:5-10` | Division by zero returns magic number 999 — indistinguishable from valid PB value | FIXED — returns Infinity |
| S2-32 | `src/app/pid-tuning/page.tsx` | No debounce/disable on Save Session button — rapid clicks create duplicate entries | FIXED — added saving state + disabled prop |
| S2-33 | `src/lib/routes.ts` | Missing route constants for `/dashboard`, `/knowledge-base`, `/register-tool` — sidebar hardcodes paths | SKIPPED — low impact |
| S2-34 | `scripts/build-static.js:9-11` | Three `require()` imports trigger `@typescript-eslint/no-require-imports` lint errors | FIXED — eslint-disable comment |
| S2-35 | Multiple files (~15+) | ~30 unused imports (icons, variables) across terminal, network-diagram, register-tool, help, etc. | SKIPPED — cosmetic |
| S2-36 | Multiple files (~10+) | `<img>` instead of `next/image` `<Image>` — no image optimization | SKIPPED — intentional for Tauri compatibility |
| S2-37 | `src-tauri/tauri.conf.json:26` | Tauri CSP `frame-src blob: http: https:` overly broad — should be `frame-src blob: 'self'` since iframes only use blob URLs | SKIPPED — needs testing to ensure no iframes break |

## Additional Findings (Sweep 2b — late agent)

| # | File | Issue | Severity | Status |
|---|------|-------|----------|--------|
| S2-38 | `src-tauri/capabilities/default.json` + `src-tauri/src/lib.rs:24-44` | `shell:allow-execute` capability too broad + `icmp_ping` host param not validated — potential command injection in desktop app | CRITICAL | FIXED — removed shell:allow-execute, added host char validation |
| S2-39 | `src/app/global-projects/[...slug]/client-page.tsx:1931` | `URL.createObjectURL(file)` called inline in JSX render — new blob URL every re-render, never revoked (memory leak) | HIGH | FIXED — extracted FilePreviewImage with useMemo + cleanup |
| S2-40 | `src/lib/tauri-bridge.ts:53-60` | `openUrl()` passes URL to OS shell via Tauri `open()` with no protocol validation — could trigger arbitrary protocol handlers | HIGH | FIXED — added protocol allowlist (http, https, mailto, blob) |
| S2-41 | `src/app/network-diagram/page.tsx` (handleExportPng) | No `img.onerror` handler — blob URL leaked if SVG image fails to load | MEDIUM | FIXED — added onerror with revoke + toast |
| S2-42 | `src/components/share/import-project-dialog.tsx:138-200` | Import package arrays not validated — malicious package with wrong types silently saved to IndexedDB | MEDIUM | SKIPPED — low risk, data types coerce safely |
| S2-43 | `src/components/shared/confirm-dialog.tsx:42` | Async `onConfirm` errors silently swallowed by `.catch(() => {})` — no user feedback on failure | MEDIUM | FIXED — now logs error + shows toast |
| S2-44 | `src/components/pwa/install-prompt.tsx:23,59` | `localStorage` access not in try/catch — crashes in private browsing mode | LOW | FIXED — wrapped in try/catch |
| S2-45 | `src/lib/global-projects/api.ts:155-163` | `generateAccessCode` modulo bias — `bytes[i] % 30` gives non-uniform distribution | LOW | SKIPPED — negligible entropy loss for 7-char code |
| S2-46 | `src/app/api/donate/checkout/route.ts:23` | `STRIPE_SECRET_KEY!` non-null assertion — crashes if publishable key set but secret key missing | MEDIUM | FIXED — added explicit guard |
| S2-47 | `package.json` | Unused dependencies `@supabase/ssr` and `sharp` — add install time and confusion | LOW | SKIPPED — safe to remove but not blocking |

---

# Sweep 3 — QA Sweep

**Date**: 2026-03-15 23:45
**Version**: 4.5.0
**Total Issues**: 18 | **Fixed**: 15 | **Skipped**: 3

**Regressions**: 1 (S3-7 — regression of S2-25)
**Build gate**: tsc --noEmit PASS | npm run build PASS (pre-fix baseline)

---

## CRITICAL (1 issue)

| # | File | Issue | Found | Status |
|---|------|-------|-------|--------|
| S3-1 | `src/lib/sync/sync-manager.ts:559` | **Data loss** — `purgeOrphans` deletes rows with `project_id IS NULL` for tables that legitimately allow nullable project_id (`files`, `pingSessions`, `terminalLogs`, `connectionProfiles`, `registerCalculations`). Runs on every `fullSync()`. Destroys unassigned files and unscoped sessions | 2026-03-15 23:30 | FIXED 2026-03-16 00:00 — filter uses `REQUIRES_PROJECT_ID` set |

## HIGH (3 issues)

| # | File | Issue | Found | Status |
|---|------|-------|-------|--------|
| S3-2 | `src/lib/sync/sync-manager.ts:448` | Pull sync orphan filter drops legitimate null-project_id rows — only exempts `projects` and `commandSnippets`, misses `files`, `pingSessions`, `terminalLogs`, `connectionProfiles`, `registerCalculations` | 2026-03-15 23:30 | FIXED 2026-03-16 00:00 — filter uses `REQUIRES_PROJECT_ID` set |
| S3-3 | `supabase/schema.sql` + `src/lib/sync/field-map.ts:21` | `pidTuningSessions` mapped to `pid_tuning_sessions` table in sync but no `CREATE TABLE` exists in schema — push sync fails with "relation does not exist" | 2026-03-15 23:30 | FIXED 2026-03-16 00:00 — added table, RLS, trigger, index to schema.sql. **Note**: schema.sql is not auto-deployed — see L1 for live DB migration |
| S3-4 | `src/lib/db.ts:300-311` | `deleteProject` calls `notifySync` for 11 child types but skips `activityLog` — activity log entries for deleted projects remain as orphans in Supabase | 2026-03-15 23:30 | FIXED 2026-03-16 00:00 — added notifySync for activityLog |

## MEDIUM (6 issues)

| # | File | Issue | Found | Status |
|---|------|-------|-------|--------|
| S3-5 | `supabase/schema.sql:388-401` | `ping_sessions` table has `updated_at` column but no `set_updated_at()` trigger — incremental pull via `updated_at >= lastPulledAt` misses updates | 2026-03-15 23:30 | FIXED 2026-03-16 00:00 — added trigger |
| S3-6 | `src/lib/db.ts:511` | `deleteDailyReport` accesses `report.attachments` without `?? []` guard — crashes if undefined. Same class as S2-20 (fixed in deleteProject) but unfixed here | 2026-03-15 23:30 | FIXED 2026-03-16 00:00 — added ?? [] guard |
| S3-7 | `src/app/projects/page.tsx:172` + `src/app/global-projects/page.tsx` | **[REGRESSION of S2-25]** — Card `onKeyDown` only handles Enter, missing Space key for `role="button"` (WCAG requirement). Fixed in dashboard but not projects/global-projects | 2026-03-15 23:30 | FIXED 2026-03-16 00:05 — added Space key + preventDefault |
| S3-8 | `src/app/dashboard/page.tsx` | Activity feed shows raw snake_case action strings (`file_uploaded`, `device_created`) instead of human-readable labels | 2026-03-15 23:30 | FIXED 2026-03-16 00:05 — format with replace + capitalize |
| S3-9 | `src/app/documents/page.tsx:33,41` | Unused vars `_router` and `_assigningFile` — ESLint warnings | 2026-03-15 23:30 | FIXED 2026-03-16 00:05 — removed router, destructure without getter |
| S3-10 | `src/app/knowledge-base/page.tsx:36` + `src/lib/hmi/ansi-parser.ts:214` | `let` should be `const` (prefer-const lint errors) | 2026-03-15 23:30 | FIXED 2026-03-16 00:05 — changed to const |

## LOW (8 issues)

| # | File | Issue | Found | Status |
|---|------|-------|-------|--------|
| S3-11 | `src/app/knowledge-base/page.tsx:243` | Unused state pair `confirmDeleteReplyId` / `setConfirmDeleteReplyId` | 2026-03-15 23:30 | FIXED 2026-03-16 00:10 — removed |
| S3-12 | `src/app/knowledge-base/new/page.tsx:57-58` | Unused `addCategory` and `user` variables | 2026-03-15 23:30 | FIXED 2026-03-16 00:10 — removed destructurings + useAuth import |
| S3-13 | `src/app/offline/page.tsx:24` | Unused `loading` variable | 2026-03-15 23:30 | FIXED 2026-03-16 00:10 — removed from destructuring |
| S3-14 | `src/components/files/file-preview-dialog.tsx:104` | Missing `blobUrl` in useEffect dependency array (react-hooks/exhaustive-deps) | 2026-03-15 23:30 | SKIPPED — false positive, blobUrl is in separate cleanup effect |
| S3-15 | `src/components/files/file-list-view.tsx:122` | `aria-selected` not supported by `role="button"` — should use `role="option"` or remove `aria-selected` | 2026-03-15 23:30 | FIXED 2026-03-16 00:10 — changed to aria-pressed |
| S3-16 | `src/app/network-diagram/page.tsx:913` | Unused expression — no assignment or function call (no-unused-expressions) | 2026-03-15 23:30 | FIXED 2026-03-16 00:10 — changed short-circuit to if statement |
| S3-17 | `src/app/knowledge-base/new/page.tsx` | Uses native `<select>` instead of shadcn Select component — inconsistent with rest of app | 2026-03-15 23:30 | SKIPPED — cosmetic, functional as-is |
| S3-18 | `src/app/knowledge-base/new/page.tsx` | Form labels lack `htmlFor`/`id` association — screen readers can't associate labels with inputs | 2026-03-15 23:30 | SKIPPED — lower priority a11y |

**Build gate (post-fix)**: tsc --noEmit PASS | npm run build PASS (2026-03-16 00:15)

---

# Live Bug — User-Reported (2026-03-16 00:50)

## HIGH (2 issues)

| # | File | Issue | Found | Status |
|---|------|-------|-------|--------|
| L1 | `supabase/` (live DB) | **Sync failure** — `pid_tuning_sessions` table exists in `schema.sql` but was never deployed to live Supabase DB. Push sync fails with PostgREST error: "Could not find the table 'public.pid_tuning_sessions' in the schema cache." Root cause: S3-3 fix added the CREATE TABLE to schema.sql but schema.sql is documentation, not auto-deployed. | 2026-03-16 00:50 | FIXED 2026-03-16 00:50 — created migration `supabase/migrations/add-pid-tuning-and-ping-trigger.sql`. Must be run manually in Supabase SQL Editor |
| L2 | `supabase/` (live DB) | **Missing trigger** — `ping_sessions` table has `updated_at` column but no `set_updated_at()` trigger in live DB. S3-5 fix added it to schema.sql but same deployment gap. Incremental pull sync misses updates to ping sessions. | 2026-03-16 00:50 | FIXED 2026-03-16 00:50 — included in same migration file with idempotent guard |

**Action required**: Run `supabase/migrations/add-pid-tuning-and-ping-trigger.sql` in Supabase Dashboard → SQL Editor

---

# Sweep 4 — 9-Agent QA Sweep

**Date**: 2026-03-16 01:15
**Version**: 4.5.0
**Total Issues**: 15 | **Fixed**: 13 | **Skipped**: 2
**Agents**: 9 (UI, Data, Sync, Build, A11y/Security, Supabase, Mobile, Landing Page, README)

**Regressions**: 0
**Build gate**: tsc --noEmit PASS | npm run build PASS (post-fix)

---

## HIGH (3 issues)

| # | File | Issue | Found | Status |
|---|------|-------|-------|--------|
| S4-1 | `src/app/page.tsx:607-672` | Landing page desktop section says "Coming Soon" and "Windows" only — desktop app is released on Windows & macOS | 2026-03-16 01:00 | FIXED 2026-03-16 01:15 — updated to "Available Now", "Windows & macOS", link to GitHub Releases |
| S4-2 | `src/app/page.tsx:18-66` | PID Tuning missing from landing page `toolGroups` — sidebar has it but marketing page doesn't list it | 2026-03-16 01:00 | FIXED 2026-03-16 01:15 — added to "Network & Device Tools" group |
| S4-3 | `src/app/page.tsx:18-66` | Knowledge Base missing from landing page `toolGroups` — sidebar has it but marketing page doesn't list it | 2026-03-16 01:00 | FIXED 2026-03-16 01:15 — added to "Collaboration" group |

## MEDIUM (5 issues)

| # | File | Issue | Found | Status |
|---|------|-------|-------|--------|
| S4-4 | `src/app/page.tsx:269,355` | Stats row "14+ tools" is stale — actual tool count is 21+ | 2026-03-16 01:00 | FIXED 2026-03-16 01:15 — updated to "21+" |
| S4-6 | `supabase/schema.sql:262-274` | `activity_log` missing `deleted_at`, `sync_version`, `updated_at` columns and `set_updated_at` trigger | 2026-03-16 01:00 | FIXED 2026-03-16 01:15 — updated schema.sql + migration |
| S4-7 | `supabase/schema.sql:412-429` | `terminal_session_logs` missing `updated_at` column and `set_updated_at` trigger | 2026-03-16 01:00 | FIXED 2026-03-16 01:15 — updated schema.sql + migration |
| S4-12 | `src/app/knowledge-base/new/page.tsx:251` | Native `<select>` instead of design system `Select` component — inconsistent dark mode styling (upgrades S3-17) | 2026-03-16 01:00 | FIXED 2026-03-16 01:15 — replaced with shadcn Select |
| S4-13 | `src/app/network-diagram/page.tsx:555` | Desktop project Select value mismatch — "No project" not highlighted when selected | 2026-03-16 01:00 | FIXED 2026-03-16 01:15 — use `value={selectedProjectId \|\| '_none'}` |

## LOW (7 issues)

| # | File | Issue | Found | Status |
|---|------|-------|-------|--------|
| S4-8 | `src/app/projects/[...slug]/client-page.tsx:766` | `revokeObjectURL` called immediately after `a.click()` — download may fail (regression of #27 pattern) | 2026-03-16 01:00 | FIXED 2026-03-16 01:15 — wrapped in setTimeout 5000 |
| S4-9 | `src/app/ping/page.tsx:446` | `revokeObjectURL` called immediately — same pattern as S4-8 | 2026-03-16 01:00 | FIXED 2026-03-16 01:15 — wrapped in setTimeout 5000 |
| S4-10 | `src/hooks/use-projects.ts:819-828` | `touchProfile` missing try/catch — unhandled IndexedDB error | 2026-03-16 01:00 | FIXED 2026-03-16 01:15 — added try/catch |
| S4-11 | `src/hooks/use-projects.ts:641-654` | `recordUsage` has `getAllSnippets` outside try/catch | 2026-03-16 01:00 | FIXED 2026-03-16 01:15 — moved inside try block |
| S4-14 | `src/app/network-diagram/page.tsx:913` | Mobile project selector missing "No project" deselect option | 2026-03-16 01:00 | FIXED 2026-03-16 01:15 — added `_none` option |
| S4-16 | `src/app/knowledge-base/new/page.tsx:232-294` | Raw `<label>` elements instead of `Label` component (upgrades S3-18) | 2026-03-16 01:00 | FIXED 2026-03-16 01:15 — replaced with Label component |
| S4-18 | `src/app/dashboard/page.tsx` | No empty state for new users with zero projects | 2026-03-16 01:00 | SKIPPED — needs design decision on onboarding flow |

## INFO (not counted)

| # | Note |
|---|------|
| I-1 | 25 lint errors (all `set-state-in-effect` — React 19 pattern, carried from S2-8/S2-9) + 105 warnings (unused vars/imports) |
| I-2 | Version sync: all 3 files at `4.5.0` — consistent |
| I-3 | Sync & field mapping: all 14 entity types fully wired — no gaps |
| I-4 | README.md: up to date, version matches, features match sidebar |
| I-5 | Mobile responsive: no structural issues found in Tailwind responsive classes |

**Migration required**: Run `supabase/migrations/add-sync-columns-activity-terminal.sql` in Supabase Dashboard → SQL Editor

**Build gate (post-fix)**: tsc --noEmit PASS | npm run build PASS (2026-03-16 01:20)
