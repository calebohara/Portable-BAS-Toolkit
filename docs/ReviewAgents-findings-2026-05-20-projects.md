# ReviewAgents Findings — Projects & Knowledge — 2026-05-20

**Agent:** Projects & Knowledge Reviewer
**Files reviewed:** ~54 (scope dirs) + hooks/types
**LOC reviewed:** ~22,000

## Summary
| Priority | Count |
|----------|-------|
| P0 | 4 |
| P1 | 13 |
| P2 | 9 |
| P3 | 11 |

## P0 — Data loss / crash / security

### Local→Global share silently drops `tags` on every child entity except files/PPCL/etc — `notes`, `devices`, `ipPlan`, `dailyReports` parity verified, but `FieldNote.author` only round-trips one direction
- **Location:** `src/lib/global-projects/reconcile.ts:261-275`, `src/lib/global-projects/reconcile.ts:653-668`
- **Current behavior:** `mapLocalNoteToRow` writes `tags`/`is_pinned`/`content`/`category`/`file_id` to the global row. On the way back, `mapGlobalNoteToLocal` rebuilds the local `FieldNote` using `n.createdBy` (a Supabase UUID) as the `author` field. The local `Project` UI treats `author` as a free-text display name ("Field Tech", technician initials, etc.); after a round-trip, every note on the project will be re-authored to a UUID string and the original author identity is permanently lost.
- **Why it's a bug:** Field technicians lose attribution on every note when a project is reconciled back from global. The local UI then shows raw UUIDs in the author field (e.g. `"3a8f...-..."`) and any filtering / display logic that compares to a human name (e.g. `n.author.toLowerCase().includes(q)` in `field-notes-view.tsx:51`) silently breaks.
- **Suggested fix:** Add an `author` column to `global_field_notes` (or persist it inside the row's `tags`/preserved jsonb) so the original technician name round-trips. Until then, on global→local convert, prefer the existing `localNote.author` if a row already exists for that ID, and only fall back to `createdBy` when seeding new local notes.

### `cascadeDeleteGlobalProject` never frees Supabase Storage blobs for global files/reports/attachments
- **Location:** `src/lib/db.ts:751-840` (local cascade) + `src/lib/global-projects/api.ts:312-372` (server cascade) + `src/lib/storage.ts:138-147` (`deleteFromStorage`, exported but uncalled)
- **Current behavior:** `deleteGlobalProject` soft-deletes every child row in `global_project_files`, `global_daily_reports`, etc. by setting `deleted_at`, then `cascadeDeleteGlobalProject` clears the local mirror. Neither code path ever calls `deleteFromStorage(storagePath)` for the actual file blobs in the `project-files` bucket. `Grep` for `deleteFromStorage` across the whole repo returns only the definition.
- **Why it's a bug:** Every uploaded file, daily report attachment, and KB attachment leaks into Supabase Storage forever after a project is deleted. Over time this burns quota and leaves sensitive customer/site documents accessible at their public URLs (the bucket serves `getPublicUrl`). Single-file delete in `useGlobalProjectFiles.removeFile` (`use-global-projects.ts:712`) also only soft-deletes the row — no storage cleanup.
- **Suggested fix:** In `deleteGlobalFile` (and the new file-rev / attachment paths), look up `storage_path` before flipping `deleted_at`, then best-effort `await deleteFromStorage(path).catch(...)`. For project-level cascade, fetch all storage paths under `global_project_files.global_project_id = X` plus all `attachments[].storagePath` from `global_daily_reports`, batch-`remove([...paths])` via the Supabase storage API, then soft-delete the rows. Same fix needed for `kb_articles.attachments` on `deleteKbArticle`.

### Import-project dialog and upload-file dialog write directly to IndexedDB via `db.saveProject`/`db.saveDevice`/etc., bypassing the activity log + sync pipeline guarantees the hooks provide
- **Location:** `src/components/share/import-project-dialog.tsx:11,135-200`; `src/components/files/upload-file-dialog.tsx:14,191-201`; `src/app/projects/[...slug]/client-page.tsx:42,133`; `src/components/files/file-list-view.tsx:23` (`deleteFile`, `saveFile` direct)
- **Current behavior:** `import-project-dialog.tsx` imports `saveProject, saveNote, saveDevice, saveIpEntry, addActivity` directly and writes ~5 entity types in a loop. `upload-file-dialog.tsx` does the same with `saveFile/saveFileBlob/addActivity`. The local repo helpers (`projectRepo.save` → `notifySync`) do enqueue sync queue items, so it's not a sync-bypass per se — but they bypass the hook layer's `refresh()` semantics. The `bau-file-uploaded` CustomEvent in `upload-file-dialog.tsx:219` is the duct-tape that makes the project page re-fetch.
- **Why it's a bug:** Whenever someone adds a new entity type to a project that participates in import, they must also remember to update the import dialog (which today only imports `project + notes + devices + ipPlan`, NOT files, NOT daily reports, NOT DXRs, NOT PPCL, NOT terminal logs, NOT diagrams, NOT connection profiles). Compare to `RECONCILED_ENTITY_PAIRS` in `reconcile.ts:126-142` which covers 15 entity types. The result: importing a share package built by another tech silently drops their files, reports, diagrams, PPCL, DXRs, etc. — the import dialog's preview shows "0 files (metadata only)" but does NOT warn the user that everything-except-the-handful-it-knows-about is being discarded.
- **Suggested fix:** Either (a) reuse the reconcile mapper layer from `reconcile.ts` as the canonical import path (extract the per-entity mappers into a shared module and feed them the package JSON), or (b) loudly fail-fast in the import dialog if `pkg.files`, `pkg.reports`, `pkg.dxrs` etc. contain rows that aren't being imported. The current silent-drop behavior is the worst of both worlds.

### `EditProjectDialog` for local projects strips `panelRosterSummary`/`networkSummary` to `undefined`, then `useProject.update` does `{ ...project, ...data }` — but recent commits added `panelRosterSummary: null` semantics on the global side; the type union mismatch is masked by `as` casts in the global edit dialog
- **Location:** `src/components/projects/edit-project-dialog.tsx:90-91`; `src/app/global-projects/[...slug]/client-page.tsx:1067-1068, 774, 846`
- **Current behavior:** On the local side, `Project.panelRosterSummary` is `string | undefined`, and the edit dialog writes `.trim() || undefined`. On the global side, `GlobalProject.panelRosterSummary` is `string | null` (matching the Postgres column). The inline-edit `safeUpdate` calls in `client-page.tsx:774` pass `panelRosterSummary: panelRosterDraft.trim() || null`. But `updateGlobalProject` in `api.ts:280-310` does NOT list `panelRosterSummary`, `networkSummary`, `customerName`, `technicianNotes`, or `contacts` in its allowed `data: Partial<Pick<...>>` parameter. Looking carefully: lines 288-296 only handle `name, jobSiteName, siteAddress, buildingArea, projectNumber, description, tags, status`. The TypeScript `Partial<Pick<...>>` type explicitly excludes everything else — but `client-page.tsx:469` calls `await updateProject(data)` where `data` includes ALL the panel-roster/network-summary/contacts/customerName/technicianNotes fields. These get silently dropped at the API boundary because the `for` loop in `updateGlobalProject` only iterates `data.name`, `data.jobSiteName`, etc. — the spreaded extras are never copied to the `update` object.
- **Why it's a bug:** **Data loss.** When a user opens the EditProjectDialog on a global project and changes the customer name, panel roster, network summary, technician notes, or contacts, the dialog shows "Project updated" via toast and closes — but the Supabase row never sees the change. The inline edits (the per-card `safeUpdate({ panelRosterSummary: ... })` in the overview tab) DO work because they pass through the same broken function but only one field at a time, and that one field is also in the missing-from-allowlist set, so they ALSO silently fail. There is no end-to-end test proving these fields actually persist.
- **Suggested fix:** Expand `updateGlobalProject`'s `data` type to include `customerName`, `technicianNotes`, `panelRosterSummary`, `networkSummary`, `contacts`, and explicitly add them to the `update` object: `if (data.customerName !== undefined) update.customer_name = data.customerName;` etc. Better: rewrite this function on top of the generic `updateEntity` helper (api.ts:99) which already auto-converts camelCase → snake_case for any allowed field, then just widen the type. Verify by writing a test that round-trips a full project update.

## P1 — Visible bugs

### Project-update path never logs an activity entry; "Project updated" activity is dead code
- **Location:** `src/hooks/use-projects.ts:51-60` (`updateProject`), `:111-121` (`useProject.update`)
- **Current behavior:** Both update functions write the row and call `refresh()`. Neither calls `db.addActivity({ action: 'Project updated', ... })`. `activity-timeline.tsx:13-28` defines an icon mapping for actions like `'Status changed'`, `'project_created'`, etc. — but the codebase only emits `'Project created'`, never `'Project updated'`, `'Status changed'`, or similar.
- **Why it's a bug:** Users editing project status, customer name, or contacts see no audit trail. The activity tab in the project detail page is misleading — it only shows file/note/device adds, never the actual most-recent project-level edits.
- **Suggested fix:** In `useProject.update`, after `db.saveProject`, emit an activity entry with a diff-summary like `buildChangeSummary` does for global notes (`use-global-projects.ts:138-156`). Same for inline contact add/edit/delete in the project detail page.

### `useProjects.removeProject` does not clear the project from `useAppStore.recentProjectIds` — orphan ID lingers
- **Location:** `src/hooks/use-projects.ts:62-70`; partially worked around in `src/app/projects/[...slug]/client-page.tsx:134` and `src/app/projects/page.tsx:50`
- **Current behavior:** Each call site that deletes a project remembers to also call `useAppStore.getState().removeRecentProject(id)`. Anywhere else deletion happens (e.g. cascade through sync pull when another device deletes the project), the recent-project pinned chip on the dashboard will reference a missing ID. `dashboard/page.tsx:84-89` partially handles this — `resumeProject` filters out missing IDs — but lower-level uses don't.
- **Suggested fix:** Move the `removeRecentProject` call into `useProjects.removeProject` so a single source of truth handles the cleanup. Even better: subscribe to the `notifySync('delete', 'projects', ...)` event in the app-store and prune on demand.

### Edit dialog in global project detail page calls `onSubmit(data)` then does NOT close on success
- **Location:** `src/app/global-projects/[...slug]/client-page.tsx:1053-1077`
- **Current behavior:** `handleSubmit` calls `onSubmit(data)`, catches errors, sets `setSaving(false)` in a finally. There is no `onOpenChange(false)` after success — the parent's `onSubmit` (line 468) does close it (`setEditingProject(false)`), but only AFTER an `await updateProject(data)` + `toast.success`. The dialog stays open while the request is in flight (correct), then the parent's effect-driven close fires. However, if `updateProject` throws (network blip), the parent's `setEditingProject(false)` never runs — and the inner dialog's `handleSubmit` swallows the error via `toast.error('Failed to update project')` in its own `catch` block too, leading to a double-toast on the SAME failure.
- **Why it's a bug:** Two error toasts overlap; one shows generic text and the parent's `safeUpdate` toast (`client-page.tsx:548`) shows another. Confusing for users; harder to debug.
- **Suggested fix:** Decide who owns errors. Either the inner dialog's `handleSubmit` shouldn't `try/catch` at all (let the parent decide), or the parent's wrapper shouldn't toast on failure (let the dialog show inline error state). The same pattern repeats in the device, IP entry, file, and report inline edit dialogs in this file.

### Global note `addNote` always sends `fileId: null` — losing the file-attached-note relationship
- **Location:** `src/app/global-projects/[...slug]/client-page.tsx:1191-1201`
- **Current behavior:** The `AddNoteDialog` interface only takes `content` and `category`. When the user is viewing a file detail panel and wants to attach a note, there's no UI to set `fileId`, so all global notes added via this dialog are project-level. The local side (`FieldNotesView`) has the same gap — `addNote` is called with no `fileId`.
- **Why it's a bug:** File-attached notes (e.g. "this PDF is rev B, marked-up on site") are a documented feature (the `FieldNote.fileId` type field exists; the `notes by-file` index exists in db.ts; `deleteFile` cascades attached notes). But the UI to create them on Add doesn't exist anywhere in the Projects slice.
- **Suggested fix:** Wire a "Attach to file" dropdown in the AddNote dialog when the current view is a file detail or when the user has selected a file. At minimum, document the gap.

### `useGlobalMessages.removeMessage` removes the message AND all replies optimistically (`m.parentId !== messageId`), but the server-side `deleteGlobalMessage` only soft-deletes the one row — reload restores all the replies
- **Location:** `src/hooks/use-global-projects.ts:1536-1546`; `src/lib/global-projects/api.ts:943-961`
- **Current behavior:** Optimistic update filters `m.parentId !== messageId` so children disappear. Server only soft-deletes the row with `id = messageId` (admin user, RLS-gated). On next `refresh()` / page reload, replies come back.
- **Why it's a bug:** Discrepancy between optimistic state and server truth. User deletes a thread, sees it gone, refreshes, replies reappear orphaned (parent is filtered out of `fetchGlobalMessages` because `deleted_at IS NULL`, so the children show up as missing-parent and `threadMessages` puts them at top level by accident — `threadMessages` in `use-global-projects.ts:1447-1471` only attaches to known top-level parents).
- **Suggested fix:** Either (a) cascade the delete server-side (also soft-delete `parent_id = messageId`), or (b) in `threadMessages`, treat replies whose parent was deleted/missing as top-level so they don't vanish. Pick one and document.

### `Recent shares` floor (`localStorage:bau-suite:shares-last-seen`) is shared across all users on the same browser
- **Location:** `src/hooks/use-recent-shares.ts:6, 22-26, 36`
- **Current behavior:** Single `LAST_SEEN_KEY` constant, no user-id in key. If user A signs out and user B signs in on the same browser/Tauri install, user B inherits user A's "last seen" floor and may miss shares.
- **Why it's a bug:** Multi-tech scenario (one shared field laptop) — common in BAS work — silently swallows incoming shares.
- **Suggested fix:** Key per `user.id`: `bau-suite:shares-last-seen:${userId}` and read inside `refresh()` after pulling auth state. Or store the floor in the user's profile in Postgres.

### `useInbox.purgeInbox` / `purgeSent` perform hard delete without confirmation when the user clicks `Eraser` and clicks again within 3 seconds — fingerprint of accidental data loss
- **Location:** `src/components/inbox/inbox-panel.tsx:382-399`; `src/hooks/use-inbox.ts:223-247`
- **Current behavior:** First click switches the icon to "Clear all?", second click within 3 seconds calls `purgeInbox()` which hard-deletes every row from `direct_messages` where `recipient_id = user.id`. No `deleted_at`. Not recoverable.
- **Why it's a bug:** Anyone who absent-mindedly double-taps the Eraser button (or whose mouse double-clicks) loses their entire inbox forever. The 3-second timeout is short and there's no confirm dialog.
- **Suggested fix:** Replace the click-twice gesture with a real `ConfirmDialog` (the rest of the codebase uses these consistently). Soft-delete by flipping `deleted_by_recipient = true` instead of hard delete — that column already exists in the schema and is used in `fetchInbox`'s filter.

### Report-form's "Link To Global Project" creates an orphaned global report — no `synced` link back to the local
- **Location:** `src/components/reports/report-form.tsx:148-183`
- **Current behavior:** `maybeLinkToGlobalProject` calls `addGlobalReport(globalProjectId, data)` which inserts a fresh row with a Supabase-generated UUID. There's no `synced_global_id` round-trip on the report itself, no idempotency key (no `id: localReport.id` override). Re-saving the local report (e.g. editing it) re-fires `maybeLinkToGlobalProject` and inserts a SECOND duplicate global row.
- **Why it's a bug:** Toggling "Link To Global" on/off mid-edit, or just saving twice, creates duplicate global daily reports. There is no way for the user to clean these up except admin delete.
- **Suggested fix:** Pass the local report's `id` as the `id` field in `addGlobalReport`, and use upsert. Or persist a `syncedGlobalReportId` on the local `DailyReport`. Same idempotency-key concept as `Project.syncedGlobalId` for the parent project.

### Global file upload silently allows any mime type without category-matching extension checks
- **Location:** `src/components/global-projects/global-file-list-view.tsx:394-401`; compare `src/components/files/upload-file-dialog.tsx:32-41,107-110`
- **Current behavior:** Global `GlobalUploadFileDialog` calls `validateFileSize(selected)` only — no extension/category matching. So you can upload a `.exe` into the "panel-databases" (`.p2`) category on the global side, but not on the local side.
- **Why it's a bug:** Type drift between local and global file ingestion. A global teammate uploads a `.zip` into "Panel Databases" → local techs can't open it; the category filter becomes meaningless. Also expands attack surface for hostile-blob uploads (sales-engineer machines downloading random `.html` from the project-files bucket open in browser).
- **Suggested fix:** Reuse the `ACCEPTED_TYPES` map from `upload-file-dialog.tsx:32` in both dialogs (extract to a shared module). Apply extension+category validation everywhere.

### `useGlobalProjectMembers` destructures `projectId` from props but it's a function-call-scoped const, then realtime subscription filter changes when projectId changes — but `refresh` is also a dep of `useRealtimeRefresh` and its identity changes on every render (no useCallback wrapper on `removeMemberFn`, `promoteMemberFn`)
- **Location:** `src/hooks/use-global-projects.ts:312-371`, `:162-187`
- **Current behavior:** `useRealtimeRefresh(table, refresh, filter)` deps include `refresh`. `refresh` is `useCallback`d on `[projectId]` so it's stable, OK. But every consumer of `useGlobalProjectFiles` etc. follows the same pattern — looks fine. However, the channel name is `'rt-' + table` which is shared across ALL `useGlobalProject*` hooks that subscribe to the same table for the same project. When multiple project pages mount/unmount rapidly (e.g. user navigates between two projects), `client.channel('rt-global_field_notes')` returns the SAME channel object — and `removeChannel` in cleanup tears down the channel the OTHER mount is still using. Real-time updates drop silently for the still-mounted page.
- **Why it's a bug:** Memory-leaks-adjacent: subscribers stop receiving updates after navigating between projects.
- **Suggested fix:** Make `channelName` include the project id when a filter is present (the code already does this on line 171: `filter ? 'rt-${table}-${filter}'`). The bug shows up when two different code paths subscribe to the same table with the same filter — Supabase JS reuses the channel and the second unmount kills both. Use `crypto.randomUUID()` suffix per subscription instance.

### Knowledge-Base `renderMarkdown` calls `DOMPurify.sanitize` AFTER inline `<a>` HTML construction with `safeUrl` derived only by anchor-checking `/^(https?:\/\/|\/|mailto:)/i.test(url)` — bypassable
- **Location:** `src/app/knowledge-base/page.tsx:37-70`
- **Current behavior:** The `replace` regex builds an `<a href="${safeUrl}">` string. `safeUrl` is `url.replace(/"/g, '&quot;')` if the URL matches the prefix regex, else `'#'`. The prefix regex allows `https://`, `/`, `mailto:`. DOMPurify then sanitizes with `ALLOWED_TAGS: ['strong', 'em', 'code', 'a', 'br', 'div', 'li']` and `ALLOWED_ATTR: ['href', 'target', 'rel', 'class']`. DOMPurify will catch javascript:-URL attacks. But: the input is escaped with `.replace(/</g, '&lt;')` BEFORE the markdown regex runs. The markdown `link` regex `\[([^\]]+)\]\(([^)]+)\)` can match an injected `[click](https://attacker)` AFTER the user has also written `&lt;script&gt;...&lt;/script&gt;`. DOMPurify strips the script. Safe in practice today because of DOMPurify, but the layered hand-rolled-escape-then-regex-then-sanitize stack is fragile — any DOMPurify version bump or config change could open XSS.
- **Why it's a bug:** Defense-in-depth pattern is inverted. The custom regex generates HTML that DOMPurify then has to clean. A safer flow: parse markdown with a library (or unified/remark/rehype), feed structured AST to React, never touch `dangerouslySetInnerHTML`. Also `class` is in `ALLOWED_ATTR` — Tailwind class injection isn't directly dangerous, but `class="..."` could be abused with arbitrary Tailwind classes to overflow / cover UI.
- **Suggested fix:** Replace the regex markdown with `react-markdown` (already a common dep) or `marked` + DOMPurify with proper hooks. Remove `class` from `ALLOWED_ATTR`. Strip `<a target="_blank">` without `rel="noopener noreferrer"` (DOMPurify ADD_ATTR hook).

### `recently shares` localStorage check at `typeof localStorage !== 'undefined'` runs at render-time → SSR mismatch
- **Location:** `src/hooks/use-recent-shares.ts:22-26`
- **Current behavior:** `refresh` is invoked from `useEffect`, so SSR is OK. However the same pattern repeats in `client-page.tsx:65-67` and `client-page.tsx:94-96` for projects, reading `window.location.search` at render time inside a client component. With Next.js 16 App Router, this is run on first client render — initial state mismatch with the server-rendered version unless the page is `'use client'` only. Each file IS `'use client'`, so it's safe. Worth a comment though.

## P2 — Inconsistencies

### Local `Project` type has `customerName`; global has both `customerName` AND `jobSiteName` — confusing mapping
- **Location:** `src/types/index.ts:14-33` (`Project`), `src/types/global-projects.ts:40-68` (`GlobalProject`)
- **Current behavior:** Local Project has just `customerName`. Global has `customerName`, `jobSiteName`, `description`. `reconcile.ts:1022` maps `localProject.customerName || localProject.name` into `job_site_name`. `buildLocalProjectFromGlobal` (`reconcile.ts:1043-1063`) maps `global.customerName || global.jobSiteName || ''` back to local `customerName`. Round-trip: a global project where `customerName` is empty but `jobSiteName` is set will populate local `customerName` from `jobSiteName`. Reverse: local `customerName` overwrites both global columns on next reconcile.
- **Suggested fix:** Document the intended mapping clearly in the type file, or add `jobSiteName` to the local `Project` interface and surface it in the local EditProjectDialog. Otherwise users on the global side think they have two distinct fields, but it collapses to one when saved to local.

### `Project.contacts` reconciles fine, but local EditProjectDialog can't edit contacts inline (they're managed in the overview separately) — global EditProjectDialog also can't, but global has a separate inline contacts card. Inconsistent UX.
- **Location:** `src/components/projects/edit-project-dialog.tsx`, `src/app/global-projects/[...slug]/client-page.tsx:1020-1158`
- **Suggested fix:** Either add a Contacts editor to both, or document that contacts are managed in the overview tab.

### `useGlobalProject.update` calls `load()` on success — but `update` is also called from inside other hooks via `safeUpdate` (`client-page.tsx:544-551`) which is wrapped — Different error-handling layers
- **Location:** `src/hooks/use-global-projects.ts:281-288`
- **Current behavior:** `update` calls `unwrap(...)` which throws on error, then `await load()`. Errors propagate to the caller. Callers in `client-page.tsx` wrap in try/catch via `safeUpdate`. Other consumers don't.
- **Suggested fix:** Document that `update` may throw; consider standardizing on a return shape `{ error: string | null }`.

### Status enum drift: local has `'active' | 'on-hold' | 'completed' | 'archived'`; global mirrors the same set BUT `GlobalDeviceStatus` mixes capitalization (`'Online'`, `'Offline'`, `'Issue'`, `'Not Commissioned'`)
- **Location:** `src/types/index.ts:146` (`DeviceEntry.status`) and `src/types/global-projects.ts:34, 127`
- **Current behavior:** Local & global both use mixed-case device status. OK, but inconsistent with project status which is kebab-case.
- **Suggested fix:** Document in the type file why; not worth refactoring now.

### `update_at` is locally indexed but global pre-fetch only selects `id, updated_at` — fine for change detection, but `reconcile.ts:1316` compares string equality of `updated_at` to skip — clock-skew sensitive
- **Location:** `src/lib/global-projects/reconcile.ts:1296-1319`
- **Current behavior:** `existing.updated_at === localUpdatedAt` exact string match. If the local row was created/updated with a different clock than the server (Postgres `now()`), the strings will rarely match and reconciles will keep re-pushing. Skip count will be misleadingly low.
- **Suggested fix:** Compare `Date.parse(existing.updated_at) === Date.parse(local.updatedAt)` or, better, `>=` comparison so the local-newer wins. Even better: use a content hash.

### Inbox `purgeInbox` deletes EVERY row recipient_id matches — including conversations the OTHER party also sees. Hard delete affects two users.
- **Location:** `src/hooks/use-inbox.ts:222-234`
- **Current behavior:** The `direct_messages` schema has `deleted_by_sender` and `deleted_by_recipient` columns. `fetchInbox`/`fetchSent` correctly filter them. But `purgeInbox` does `delete().eq('recipient_id', user.id)` — a HARD delete. The sender's "sent" view will also lose the message.
- **Suggested fix:** Replace hard delete with a bulk update setting `deleted_by_recipient = true`. Same for `purgeSent`. RLS should already gate the WHERE clause.

### Local file `MAX_FILE_SIZE` is 100 MB; global file storage path size is 50 MB (or 5 MB for images). When reconcile pushes a 75 MB file to global, the upload silently fails with a storage error and `mapAttachmentsLocalToGlobal` falls back to `storagePath: null`.
- **Location:** `src/components/files/upload-file-dialog.tsx:28`; `src/lib/storage.ts:7-9`; `src/lib/global-projects/reconcile.ts:326-347`
- **Current behavior:** Local accepts up to 100 MB. Global server bucket limit (configured in Supabase) is 50 MB. Any file 50-100 MB shared via reconcile gets metadata-only on global (no blob). User has no idea — only `console.warn` in browser.
- **Suggested fix:** Align the local `MAX_FILE_SIZE` to 50 MB (or whatever Supabase storage limit is), OR surface a toast/banner when the user shares a project and the reconcile reports `mapAttachmentsLocalToGlobal` failures. The current reconcile result counter only counts pair-level fail/skip, not blob-upload fail.

### Global file delete soft-deletes the row but does NOT clear `storagePath` from the row — so even with a recovery flow, the path-to-blob mapping is preserved (good), but `cascadeDeleteGlobalProject` on the local side deletes the file row entirely (`db.ts:778`), so a future "undelete from soft-deleted server row" path would be orphaned locally.
- **Location:** `src/lib/db.ts:761-779`
- **Suggested fix:** Document; defer until soft-delete UX is built.

### `useGlobalMessages.postMessage` doesn't update `unreadCount` after optimistic add — own messages don't count as unread (correct). But `markRead` only fires on board-tab mount, not on tab change.
- **Location:** `src/components/global-projects/message-board.tsx:36-38`
- **Current behavior:** `markRead` is in a useEffect with `[markRead]`. If a user switches AWAY from the board, posts a message via another route, then comes back, `markRead` only fires on remount. Acceptable since `unreadCount` is recomputed on `refresh()`.

### Project number validation `/^44OP-\d{6}$/` is hard-coded in two places.
- **Location:** `src/components/projects/edit-project-dialog.tsx:70`, `src/components/projects/new-project-dialog.tsx:78`
- **Suggested fix:** Extract to a shared constant.

## P3 — Bloat / dead code / polish

### Unused imports in global projects detail page
- **Location:** `src/app/global-projects/[...slug]/client-page.tsx:3` (`useRef` unused), `:14-16` (`validateFileSize, isImageFile, buildStoragePath, uploadProjectFile, getPublicUrl, formatBytes` — none used in this file)
- **Suggested fix:** Remove.

### `escapeHtml` imported but never used in share-dialog
- **Location:** `src/components/share/share-dialog.tsx:18`
- **Suggested fix:** Remove.

### `member-management.tsx` destructures `projectId` from props but never uses it
- **Location:** `src/components/global-projects/member-management.tsx:27`
- **Suggested fix:** Remove from props interface and call sites.

### `GlobalNetworkDiagramsTab` is a hard-coded placeholder; the tab is in the navigation, the API has CRUD on `global_network_diagrams` (per reconcile.ts), but there's no `useGlobalProjectNetworkDiagrams` hook. Dead UI.
- **Location:** `src/app/global-projects/[...slug]/client-page.tsx:2842-2857`
- **Suggested fix:** Either build the hook + UI or remove the tab from `tabs` (line 85). Dangling placeholder is a UX trap.

### `snakeKeysShallow` and `fetchGlobalChildRows` are exported void'd at end of reconcile.ts
- **Location:** `src/lib/global-projects/reconcile.ts:1509-1510`
- **Current behavior:** `void snakeKeysShallow; void fetchGlobalChildRows;` — `void` expressions to suppress "unused" warnings on intentionally-retained helpers.
- **Suggested fix:** Either delete the helpers (no callers in the repo per grep) or wire them in. Keeping `void` no-ops in production code is a smell.

### `actionIcons` map in `activity-timeline.tsx` references action strings that no code ever emits (`'Status changed'`, `'project_created'`, etc.)
- **Location:** `src/components/projects/activity-timeline.tsx:13-28`
- **Suggested fix:** Audit emitted action names across `db.addActivity` and `logGlobalActivity` call sites and reconcile with the icon map. Many keys are dead.

### `formatFileSize` is defined inline in 2 places (`shared/file-icon`, `app/knowledge-base/page.tsx:28-33`) and `formatBytes` in `lib/storage.ts:152-157` does roughly the same thing.
- **Suggested fix:** Pick one, use it.

### `dxrs` is the local key in the reconcile registry but no global field-panels / notepad entries are reconciled (excluded by design per comment, but the comment uses outdated step references).
- **Location:** `src/lib/global-projects/reconcile.ts:107-125`
- **Suggested fix:** Update the comment block or remove the "Step 4+" terminology that no longer matches the repo's current state.

### `useProject` hook has dead `refresh` callback that does the same thing as the dedicated `useEffect` with stale-guard but isn't called from anywhere except `usePullRefresh(refresh)`
- **Location:** `src/hooks/use-projects.ts:79-108`
- **Current behavior:** Lines 79-88 define `refresh`, then lines 91-107 reimplement the same fetch with a `stale` guard. Both run on initial mount because `usePullRefresh` registers `refresh` as a pull-callback. Result: double fetch on mount.
- **Suggested fix:** Drop the standalone `refresh` callback; the stale-guarded effect is sufficient. Or call `refresh()` from the effect and only register `refresh` in `usePullRefresh`.

### `useProjectActivity`, `useProjectNotes`, `useProjectDevices`, `useProjectIpPlan`, `useProjectFiles`, `useTerminalLogs`, `useProjectDxrs` all duplicate the same stale-guard async useEffect + refresh-callback + `usePullRefresh` pattern
- **Location:** `src/hooks/use-projects.ts:144-167, 184-242, 258-315, 332-390, 405-421, 718-762, 920-1002`
- **Suggested fix:** Extract a generic `useProjectStore<T>(projectId, fetcher)` hook to remove ~200 lines of repetitive boilerplate.

### `useGlobalProjectNotes`, `useGlobalProjectDevices`, `useGlobalProjectIpPlan`, `useGlobalProjectReports`, `useGlobalProjectFiles`, `useGlobalProjectPpcl`, `useGlobalProjectTerminalLogs`, `useGlobalProjectPidTuningSessions`, `useGlobalProjectPsychSessions`, etc. — all duplicate the same fetch+state+refresh+realtime pattern
- **Location:** `src/hooks/use-global-projects.ts:373-1175` — ~800 lines
- **Suggested fix:** Extract `useGlobalProjectEntity<T>(projectId, fetch, add, update, remove, table)` to collapse the noise. Will save ~600 lines and make adding new entity types painless.

## Handoffs (issues found outside your slice)

> Handoff to: Sync slice
> `notifySync` in db.ts is the only sync trigger for project edits, but no event is emitted for partial-update-without-saveProject paths. If a future code path bypasses `saveProject` (e.g. a direct `db.put('projects', ...)` somewhere — none today, but the pattern is fragile), sync will silently no-op.

> Handoff to: Sync slice
> The `useRealtimeRefresh` helper in `use-global-projects.ts:162-187` uses `client.channel('rt-' + table + '-' + filter)` as channel name. Two pages subscribing to the same `(table, filter)` pair will share the channel, and the first to unmount tears it down for both. Add per-instance UUID suffix.

> Handoff to: Auth slice
> `useRecentShares` floor in localStorage is not scoped by user id. Multi-user-same-browser scenario silently swallows shares.

> Handoff to: Storage / RLS
> `deleteFromStorage` is exported but never called. Every soft-deleted file / report attachment / KB attachment leaks bucket storage permanently. This is also a privacy issue — public URLs remain valid.

> Handoff to: Database / schema
> `global_project_notepad_entries` and `global_field_panels` exist in the schema and have CRUD API functions, but there's no UI surface for them in the Projects slice — `GlobalNetworkDiagramsTab` is the visible "coming soon" placeholder, but field-panels and notepad-entries are completely hidden.

> Handoff to: Reports slice
> `report-form.tsx` "Link To Global" creates duplicates on re-save because there's no idempotency key. Whoever owns reports should add a `syncedGlobalReportId` round-trip and use upsert.

> Handoff to: Knowledge Base owner
> KB attachments: no UI to upload them visible in `knowledge-base/new/page.tsx` (would need to verify), but the type and API both support them. If there IS upload UI, the leak issue in P0 applies.
