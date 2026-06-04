# ReviewAgents Findings — Cross-Cutting — 2026-05-20

**Agent:** Cross-Cutting Pattern Auditor
**Intermediate files reviewed:** 5 (tools, connectivity, projects, platform, shell)
**Cross-cutting findings count:** 24

## Summary
| Priority | Count |
|----------|-------|
| P0 | 4 |
| P1 | 6 |
| P2 | 7 |
| P3 | 7 |

---

## Section A — Cross-slice convergence clusters

Findings that multiple area agents touched, consolidated into single root causes. These are NOT N separate bugs — they share one root cause and need one coordinated fix.

### Cluster 1 — `proxy_fetch` + iframe `srcDoc` security chain (Connectivity P0 + Shell P0)
- **Contributors:**
  - `docs/ReviewAgents-findings-2026-05-20-connectivity.md` P0 "Proxy-rendered controller HTML can escape sandbox" — `src/components/web-interface/embedded-workspace.tsx:239-245` + `src-tauri/src/lib.rs:716-775`
  - `docs/ReviewAgents-findings-2026-05-20-connectivity.md` P0 "`is_private_network` is a string prefix match" — `src-tauri/src/lib.rs:703-714`
  - `docs/ReviewAgents-findings-2026-05-20-connectivity.md` P1 "Reqwest proxy follows up to 10 redirects" — `src-tauri/src/lib.rs:730-739`
  - `docs/ReviewAgents-findings-2026-05-20-shell.md` P0 "`proxy_fetch` bypasses TLS validation" — `src-tauri/src/lib.rs:716-775`
  - `docs/ReviewAgents-findings-2026-05-20-shell.md` P3 "`tauri.conf.json` frame-src is `'self' blob: http: https:` — extremely permissive" — `src-tauri/tauri.conf.json:26`
- **Single root cause:** Three independent weaknesses (string-prefix host gate, cert validation disabled, sandbox attribute set with `allow-same-origin`+`allow-scripts`, default 10-redirect policy, permissive `frame-src`) compose into an exploitable SSRF + RCE chain. Each one is partially mitigated only by the others; remove ANY single layer and the entire host app is compromised by a single rogue controller. The frame-src wildcard combined with a TLS-bypassing Tauri command means any embedded HTTP(S) page can request arbitrary local-network URLs through Rust, follow redirects out, and have the response rendered into the parent origin's DOM.
- **Coordinated fix:** Treat this as one security-hardening commit, not as five line-edits:
  1. Parse `host` to `IpAddr` (or `url::Host::Ipv4(_)/Ipv6(_)`); reject hostnames AND `localhost`/`127.0.0.1` unless the user has explicitly opted in.
  2. Set `reqwest::redirect::Policy::none()` (or a custom hop policy that re-runs the IP check on each `Location`).
  3. Drop `allow-same-origin` from the `srcDoc` iframe AND switch from `srcDoc` to a `blob:` URL so the iframe loads from an opaque origin.
  4. Add per-session capability token (`app.manage` state) that the renderer must send with every `invoke('proxy_fetch')` so embedded iframes cannot call the command on their own.
  5. Tighten parent CSP `script-src` to drop `'unsafe-inline'` and tighten `frame-src` to a documented allowlist.
- **Priority:** P0

### Cluster 2 — `data-cleanup-dialog` + cascade-delete table-list drift (Platform P0 + Projects P0)
- **Contributors:**
  - `docs/ReviewAgents-findings-2026-05-20-platform.md` P0-5 "`data-cleanup-dialog` hard-deletes from Supabase bypassing the SyncManager, ignores 7 child tables" — `src/components/settings/data-cleanup-dialog.tsx:19-24, 86-104`
  - `docs/ReviewAgents-findings-2026-05-20-platform.md` P0-2 "Cascade-delete transactions span awaits that auto-commit" — `src/lib/db.ts:661-741` (`cascadeDeleteProject`) + `:751-840` (`cascadeDeleteGlobalProject`)
  - `docs/ReviewAgents-findings-2026-05-20-projects.md` P0 "`cascadeDeleteGlobalProject` never frees Supabase Storage blobs" — `src/lib/db.ts:751-840` + `src/lib/global-projects/api.ts:312-372` + `src/lib/storage.ts:138-147`
  - `docs/ReviewAgents-findings-2026-05-20-platform.md` handoff "`api.ts:312-372` `deleteGlobalProject` cascade-soft-deletes 17 child tables sequentially via 17 round-trips with no transactional guarantees"
- **Single root cause:** There are FOUR independent cascade-delete code paths (local IDB cascade, cleanup dialog Supabase cascade, server-side `deleteGlobalProject` cascade, single-file deletes) each maintaining its own hand-coded list of child tables, none of which is derived from `field-map.ts:SYNC_ORDER`/`REQUIRES_PROJECT_ID`. As entity types get added (psychSessions, trendSessions, dxrs), each list drifts. Plus none of these paths cleans up Supabase Storage blobs (`deleteFromStorage` is exported but uncalled), plus the IDB cascade transactions auto-close mid-loop because they hold a single tx across many awaits.
- **Coordinated fix:**
  1. Move cascade-delete to a single server-side Postgres RPC (`delete_project_cascade(p_id uuid)`, `delete_global_project_cascade(p_id uuid)`) using `ON DELETE CASCADE` FKs. One round-trip, atomic.
  2. The RPC returns the list of storage paths to remove; client then issues one `storage.remove([...])` batch.
  3. Local cascade: rebuild on top of `SYNC_ORDER`/`REQUIRES_PROJECT_ID`, opening a fresh tx per store (no cross-await tx).
  4. `data-cleanup-dialog` calls the RPC instead of hand-rolling table names.
  5. Add a CI/test guard that asserts every entity in `SYNC_ORDER` is reachable from the cascade path.
- **Priority:** P0

### Cluster 3 — Direct-Supabase writes bypassing the SyncManager queue (Platform + Connectivity + Projects)
- **Contributors:**
  - `docs/ReviewAgents-findings-2026-05-20-projects.md` P0 "Import-project / upload-file dialog writes directly to IndexedDB" — bypasses hook layer (the IDB write still ends up in the queue via `notifySync`, but the same UI surfaces that do this drop several entity types)
  - `docs/ReviewAgents-findings-2026-05-20-projects.md` handoff "`reconcile.ts:1112` upserts global_projects directly with `onConflict: 'id'` bypassing SyncManager's queue"
  - `docs/ReviewAgents-findings-2026-05-20-projects.md` P1 + P2 inbox purge — `src/hooks/use-inbox.ts:200-247` direct `.delete()` against Supabase
  - `docs/ReviewAgents-findings-2026-05-20-platform.md` P0-5 `data-cleanup-dialog.tsx:97-101` direct `.delete()` against Supabase project + child tables
- **Single root cause:** The codebase has a clear architectural rule ("all syncable writes go through `SyncManager.enqueue`"), but at least three classes of code violate it: (a) the reconcile pipeline (`global_projects` + `global_project_members` upserts in `reconcile.ts:1086-1131`), (b) the cleanup dialog, and (c) the messaging system (`direct_messages` in `use-inbox.ts`). Each violation has a different rationale ("reconcile is its own pipeline", "cleanup is destructive admin", "DMs aren't in the entity map") but the cumulative effect is: the queue is no longer a complete event log, retry-on-failure is inconsistent, and the offline UX is fractured.
- **Coordinated fix:** Document the rule explicitly in `field-map.ts` (header comment listing the legitimate non-queue write surfaces). For each violation, decide:
  - Reconcile → leave as-is but add an explicit `notifySync('update', 'globalProjects', id)` hook so the local cache is refreshed even when offline-deferred queue is bypassed.
  - Cleanup dialog → switch to server RPC (see Cluster 2).
  - Inbox → either add `directMessages` as a new `SyncEntityType` or document that DMs are intentionally online-only (and gate the UI when offline).
- **Priority:** P1

### Cluster 4 — Local↔Global type drift across many fields (Projects P0 + Projects P2 + SyncAgents-plan doc)
- **Contributors:**
  - `docs/ReviewAgents-findings-2026-05-20-projects.md` P0 "`EditProjectDialog` for global projects strips fields, `updateGlobalProject` allowlist drops them silently" — `src/lib/global-projects/api.ts:280-310`
  - `docs/ReviewAgents-findings-2026-05-20-projects.md` P0 "Local→Global share silently changes `FieldNote.author`" — `src/lib/global-projects/reconcile.ts:653-668`
  - `docs/ReviewAgents-findings-2026-05-20-projects.md` P2 "Local `Project` has `customerName`; global has `customerName` AND `jobSiteName`"
  - `docs/SyncAgents-plan-2026-05-12.md` audit table shipping plan that predates several still-extant mismatches
- **Single root cause:** The `Project` and `GlobalProject` types diverged on a per-PR basis with no test or codegen guaranteeing field-for-field round-trip safety. `reconcile.ts` mappers paper over the mismatches by mapping camelCase↔snake_case heuristically but lose semantic data (e.g., `author` → `created_by` UUID). The `updateGlobalProject` allowlist in `api.ts` is the visible symptom: it silently drops fields that `EditProjectDialog` thinks it can write.
- **Coordinated fix:** Generate the `GlobalProject` TS type and the `field_map.ts` overrides from a single schema source (e.g., a code-gen step driven by `supabase/schema.sql`). At a minimum, replace `updateGlobalProject`'s hand-rolled allowlist with a derived `keys(GlobalProject)` set. Add a round-trip test that creates a `Project`, reconciles to global, reads back, and asserts every field survives.
- **Priority:** P1

### Cluster 5 — Tauri ↔ TS argument drift (Connectivity P2 + Shell P1)
- **Contributors:**
  - `docs/ReviewAgents-findings-2026-05-20-connectivity.md` P2 "TS sends `timeoutMs` to `telnet_connect` but Rust ignores it" — `src/lib/tauri-bridge.ts:101-109` vs `src-tauri/src/lib.rs:267-275`
  - `docs/ReviewAgents-findings-2026-05-20-shell.md` P1 "`nativeTelnetConnect`'s `timeoutMs` parameter is silently dropped"
- **Single root cause:** Tauri's invoke serializer silently ignores extra args, and there's no shared schema between the TS bridge and the Rust commands. Both agents flagged the same line-pair; this is one bug.
- **Coordinated fix:** Either plumb `timeoutMs` through the Rust signature or remove it from the TS bridge. Going forward, generate the bridge from the Rust command definitions (or vice versa) so this cannot drift again.
- **Priority:** P2

### Cluster 6 — Saved-session dialogs not properly attached to projects (Tools P1 multiple sites)
- **Contributors:**
  - `docs/ReviewAgents-findings-2026-05-20-tools.md` P1 "Trend session 'Save' dialog never attaches the session to a project" — `session-dialogs.tsx:30`
  - `docs/ReviewAgents-findings-2026-05-20-tools.md` P1 "Register-tool SaveDialog stores no inputs and no result" — `save-dialog.tsx:36-37`
  - `docs/ReviewAgents-findings-2026-05-20-tools.md` handoff "All four tool hooks hardcode `user: 'User'`"
- **Single root cause:** The "Save Session" pattern was implemented ad-hoc per tool (PID, Psych, Register, Trend) with each tool's dialog hand-rolling its own project picker (or omitting one). The result: Trend has no picker (`projectId: ''`), Register has a picker but never captures inputs/result, the hook activity log entries are all attributed to `'User'`.
- **Coordinated fix:** Extract a shared `<SaveSessionDialog>` that takes `{ defaultProjectId, getSnapshot, onSave }` props; require every tool to pass a `getSnapshot` callback returning `{ inputs, result }`. Wire the auth-provider's `profile.displayName` into the hook so `user` reflects the actual technician.
- **Priority:** P1

### Cluster 7 — Realtime channel name reuse / cleanup races (Platform P1 + Projects P1)
- **Contributors:**
  - `docs/ReviewAgents-findings-2026-05-20-platform.md` P1-3 "`subscribeToGlobalRealtime` cleanup ref overwrites the previous cleanup" — `src/providers/sync-provider.tsx:101-117`
  - `docs/ReviewAgents-findings-2026-05-20-projects.md` P1 "`useGlobalProjectMembers` realtime channel name reuse" — `src/hooks/use-global-projects.ts:162-187` (`useRealtimeRefresh`)
- **Single root cause:** Supabase JS reuses channels by name; the codebase keys channels on `(table, filter)` which can collide between two mounted consumers, and the provider also keeps a ref that overwrites the previous cleanup without invoking it. When users navigate quickly or accept invites, channels are torn down for the wrong subscriber.
- **Coordinated fix:** Append a per-instance `crypto.randomUUID()` to every channel name (in both `useRealtimeRefresh` and `subscribeToGlobalRealtime`). Drop the cleanup ref entirely and rely on `manager.stop()` for teardown.
- **Priority:** P1

### Cluster 8 — Unused/dead transports + dead exports + unwired scripts (Shell P3 + Connectivity P2 + Projects P3 + Platform P3)
- **Contributors:**
  - `docs/ReviewAgents-findings-2026-05-20-connectivity.md` P2 "Two parallel API surfaces for telnet/serial — `TelnetTransport`/`SerialTransport` classes are unused"
  - `docs/ReviewAgents-findings-2026-05-20-shell.md` P3 "Unused dependencies in `package.json`" + "Unused single-purpose UI primitives" (`scroll-area`, `popover`, `command`, `input-group`)
  - `docs/ReviewAgents-findings-2026-05-20-shell.md` P2 "`scripts/post-static-build.sh` is dead" + "`scripts/generate-icons.mjs` is also dead"
  - `docs/ReviewAgents-findings-2026-05-20-projects.md` P3 "`snakeKeysShallow` / `fetchGlobalChildRows` void'd at end of reconcile.ts" + "`escapeHtml` imported but never used"
  - `docs/ReviewAgents-findings-2026-05-20-platform.md` P2-4 "`clearAllSyncConflicts` exported but never called" + P3-1 "Legacy IDB stores never read"
- **Single root cause:** No dead-code policy. Bloat lives at every level: deps, files, exports, scripts, IDB stores. ESLint isn't configured to fail on unused identifiers; no CI step prunes orphan exports.
- **Coordinated fix:** Adopt knip or ts-prune as a CI gate. Configure ESLint `no-unused-vars` and `import/no-unresolved` to `error`. Single bloat-removal commit deletes the dead UI files, the unused npm deps (11 entries), the void'd helpers, the dead scripts, and the unread IDB stores.
- **Priority:** P3 (cumulative impact is meaningful — see Section B "Unused npm dependencies")

---

## Section B — Codebase-wide pattern drift

Issues no single area agent could see.

### B.1 SyncEntityType vs table coverage table

Verified at `src/types/index.ts:262-276` and `src/lib/sync/field-map.ts`. Every entity in `SyncEntityType` is in `entityTypeToTable` and `SYNC_ORDER`. The pull/push paths reference all entities via the `for (entityType of SYNC_ORDER)` loops at `sync-manager.ts:449, 509, 564`. Gaps below are real:

| EntityType | FIELD_OVERRIDES | REQUIRES_PROJECT_ID | SYNC_ORDER | Push | Pull | Notes |
|------------|-----------------|---------------------|------------|------|------|-------|
| projects | yes | n/a (parent) | yes | yes | yes | OK |
| files | yes | no (project_id nullable per comment field-map.ts:698) | yes | yes | yes | OK |
| notes | yes | yes | yes | yes | yes | OK |
| devices | yes | yes | yes | yes | yes | OK |
| ipPlan | yes | yes | yes | yes | yes | OK |
| dailyReports | yes | yes | yes | yes | yes | OK |
| activityLog | yes | yes | yes | yes | yes | OK |
| networkDiagrams | yes | yes | yes | yes | yes | OK |
| commandSnippets | yes | no (per-user, no project_id) | yes | yes | yes | OK |
| pingSessions | yes | no | yes | yes | yes | OK |
| terminalLogs | yes | no | yes | yes | yes | OK |
| connectionProfiles | yes | no | yes | yes | yes | OK |
| registerCalculations | yes | no | yes | yes | yes | OK |
| pidTuningSessions | yes | yes | yes | yes | yes | OK |
| ppclDocuments | yes | no | yes | yes | yes | **DRIFT** — ppcl_documents.project_id may or may not be NOT NULL; the union doesn't list it in `REQUIRES_PROJECT_ID`. Verify schema. |
| bugReports | yes | no (per-user) | yes | yes | yes | OK |
| reviews | yes | no (per-user) | yes | yes | yes | OK |
| psychSessions | yes | yes | yes | yes | yes | OK |
| trendSessions | yes | no | yes | yes | yes | **DRIFT** — psychSessions IS in `REQUIRES_PROJECT_ID` but trendSessions is NOT. Both are tool sessions with project_id; consistency check needed against schema. |
| dxrs | yes | yes | yes | yes | yes | OK |
| globalProjects | yes | n/a (parent) | yes | yes | yes | OK |
| globalNotes | yes | yes | yes | yes | yes | OK |
| globalDevices | yes | yes | yes | yes | yes | OK |
| globalIpPlan | yes | yes | yes | yes | yes | OK |
| globalDailyReports | yes | yes | yes | yes | yes | OK |
| globalActivityLog | yes | yes | yes | yes | yes | OK |
| globalNetworkDiagrams | yes | yes | yes | yes | yes | OK |
| globalProjectFiles | yes | yes | yes | yes | yes | OK |
| globalPpclDocuments | yes | yes | yes | yes | yes | OK |
| globalTerminalLogs | yes | yes | yes | yes | yes | OK |
| globalPidTuningSessions | yes | yes | yes | yes | yes | OK |
| globalPsychSessions | yes | yes | yes | yes | yes | OK |
| globalRegisterCalculations | yes | yes | yes | yes | yes | OK |
| globalPingSessions | yes | yes | yes | yes | yes | OK |
| globalTrendSessions | yes | yes | yes | yes | yes | OK |
| globalConnectionProfiles | yes | yes | yes | yes | yes | OK |
| globalFieldPanels | yes | yes | yes | yes | yes | **NO UI** — exists in sync but no React UI surface (per Projects handoff). |
| globalNotepadEntries | yes | yes | yes | yes | yes | **NO UI** — same as above. |
| globalProjectPreferences | yes | n/a (composite PK) | yes | yes | yes | OK |
| globalDxrs | yes | yes | yes | yes | yes | OK |

**Drift findings:**
- `trendSessions` vs `psychSessions` `REQUIRES_PROJECT_ID` asymmetry — both tool sessions, both visually project-scoped, but only psych is in the required-projectId set. Verify against `supabase/schema.sql` and align.
- `ppclDocuments` is not listed in `REQUIRES_PROJECT_ID` despite the local type having `projectId: string` (not optional) and the global mirror requiring `global_project_id`. Either the schema column is nullable (and that's intentional for unassigned drafts) or this is a missing entry. The comment at field-map.ts:698 explicitly excludes ppclDocuments — verify intent.
- `globalFieldPanels` and `globalNotepadEntries` are fully wired in field-map.ts but have NO frontend UI ("dead UI" per Projects P3 handoff). Either implement or remove from the union.
- **Priority for these:** P2.

### B.2 Direct Supabase writes outside SyncManager

Grep for `.from(...).insert/update/delete/upsert` (excluding `sync-manager.ts` itself):

| Location | Operation | Classification | Note |
|----------|-----------|---------------|------|
| `src/lib/global-projects/reconcile.ts:1112` | `upsert('global_projects')` | (b) bypass — reconcile pipeline | Documented as separate pipeline; needs notifySync hook |
| `src/lib/global-projects/reconcile.ts:1122` | `upsert('global_project_members')` | (a) legitimate — membership is not a sync entity | OK |
| `src/components/settings/data-cleanup-dialog.tsx:97` | `delete()` on 12 child tables | (b) bypass — see Cluster 2 | **P0** |
| `src/components/settings/data-cleanup-dialog.tsx:101` | `delete('projects')` | (b) bypass — see Cluster 2 | **P0** |
| `src/hooks/use-inbox.ts:188` | `update('direct_messages').read_at` | (b) bypass — DMs aren't synced via queue | P2 |
| `src/hooks/use-inbox.ts:205-218` | `delete('direct_messages')` single | (b) bypass | P2 |
| `src/hooks/use-inbox.ts:228-230` | `delete('direct_messages')` purge inbox | (b) bypass — hard delete affects sender too (Projects P2) | **P1** |
| `src/hooks/use-inbox.ts:241-244` | `delete('direct_messages')` purge sent | (b) bypass | P1 |
| `src/hooks/use-inbox.ts:256+` | `insert('direct_messages')` | (b) bypass | P2 |
| `src/lib/global-projects/api.ts:528-2133` | Many `insert/update/delete/upsert` on global_* tables | (b) bypass — entire global API pipeline | Documented as its own pipeline (parallel to reconcile); needs notifySync hooks across the board — same issue as reconcile |
| `src/app/api/account/delete/route.ts:108` | `delete('profiles')` | (a) legitimate — admin server route | OK |

**Pattern:** the `api.ts` global pipeline is its own world (48 `.from()` calls, all bypassing the queue). Same Cluster 3 root cause: the rule "everything goes through the queue" is universally honored for local entities but universally violated for global entities. Either the global pipeline should be folded into the queue, or the rule should be rewritten as "local entities go through the queue; global entities go through `api.ts` and the realtime channel substitutes for the queue."

### B.3 Dialog / toast / error-handling drift

- **Dialogs:** 50 files use `from '@/components/ui/dialog'` — dominant pattern. `<AlertDialog>` does not exist in the codebase (grepped — no matches). `ConfirmDialog` (custom) is consistent across 21 files. **No drift on dialog choice.** But `confirm-dialog.tsx` is reinvented twice: the inbox uses a double-click-eraser-gesture for delete instead of `ConfirmDialog` (Projects P1 finding) — known drift, called out by Projects agent.
- **Toasts:** All toasts use `sonner` via `toast.success/error/info/warning/loading`. Most files import `toast` from `'sonner'`. **No drift on toast library.** Shape drift exists in error-toast content (some pass `description`, some don't) but is minor.
- **Error handling:** `error-reporting.ts:reportError` does NOT sanitize (Platform P3-4). `try/catch` is the dominant pattern; there is no `Result<>` or `unwrap` (the helper called `unwrap` in `use-global-projects.ts` throws on error, not a tagged union). Dual-toast bug (Projects P1) where dialog and parent both `catch` and toast is a real drift symptom. Recommend a single `withErrorBoundary` helper that centralizes the catch→sanitize→toast pipeline.

### B.4 Hook naming and shape drift

All hooks live in `src/hooks/use-*.ts`. Naming inventory:

**Singular vs plural drift:**
- `useProject(id)` (singular, one project) vs `useProjects()` (plural, list) — clear, OK.
- `useDailyReport(id)` vs `useDailyReports(projectId?)` — clear, OK.
- `useGlobalProject(id)` vs `useGlobalProjects()` vs `useGlobalProjectsList()` (the latter is a third, slightly-different hook in the same file; `use-global-projects.ts:1422` — DRIFT, two list hooks).
- `useKbCategories()` + `useKbArticles()` — both plural list hooks, OK.

**Shape drift — what they return:**
- `useProjects()` returns `{ projects, loading, addProject, updateProject, removeProject, refresh }` — data + actions + refresh
- `useProject(id)` returns `{ project, loading, update, refresh }` — single + update
- `useProjectNotes(id)` returns `{ notes, loading, addNote, updateNote, removeNote, refresh }` — same pattern
- `useGlobalProject(id)` returns `{ project, loading, error, update, load }` — adds `error`, renames `refresh`→`load`. **DRIFT.**
- `useGlobalProjectMembers` returns `{ members, loading, removeMember, promoteMember }` — no add/invite (handled elsewhere); no refresh exposed. **DRIFT.**
- `useGlobalProjectsList` returns `{ projects, loading, error, refresh }` — data only, no setters. **DRIFT** vs `useGlobalProjects`.
- `useInbox()` returns `{ messages, sentMessages, unreadCount, ... }` — multi-collection hook. Unique.
- `useOnlineUsers()` returns `{ users }` only — data-only.
- `useKeyboardShortcut(key, cb, meta=true)` — action-only, no return.

**Recommendation:** Document a standard shape `UseEntity<T> = { data: T; loading: boolean; error: string | null; refresh: () => Promise<void>; add/update/remove (when applicable) }`. The global-projects file's hooks should follow it.

### B.5 camelCase ↔ snake_case mapping at Supabase boundary

The canonical mapper is `field-map.ts:toSupabaseRow / fromSupabaseRow`. Bespoke mapping outside this module:
- `src/lib/global-projects/api.ts` — entire file. ~48 `.from()` calls each construct snake_case payloads by hand (e.g., `customer_name`, `panel_roster_summary`). When `updateGlobalProject` was added it duplicated the field list rather than calling `toSupabaseRow('globalProjects', ...)`. **DRIFT — root cause of the Projects P0 silent-update-drop.**
- `src/lib/global-projects/reconcile.ts:217` `snakeKeysShallow` — a third snake_case helper, currently `void`-suppressed. Either delete or replace `api.ts`'s hand-rolling.

**Recommendation:** Convert `api.ts` to call `toSupabaseRow(entityType, payload, userId, { isUpdate })` and `fromSupabaseRow` everywhere. Delete `snakeKeysShallow`.

### B.6 Route ↔ sidebar ↔ breadcrumb ↔ auth-gate drift

- `src/lib/routes.ts:21-41` exports `ROUTES` constant which is **unused** (Shell P2 confirmed) — `rg "ROUTES\." src/` matches only the unrelated `FULL_PAGE_ROUTES`.
- Sidebar (`src/components/layout/sidebar.tsx:22-65`) uses hardcoded `href` strings.
- App router has 31 top-level route folders. ROUTES constant is missing: `desktop`, `donate`, `forgot-password`, `login`, `pending-approval`, `reset-password`, `trend-viewer`, plus the API routes (intentionally so).
- `FULL_PAGE_ROUTES` and `PUBLIC_ROUTES` are hand-maintained in `app-shell.tsx:20-23` — Shell P2 finding.

**DRIFT findings:**
- `/trend-viewer` is in the sidebar (`sidebar.tsx:48`) but not in `ROUTES`.
- `/login`, `/forgot-password`, `/reset-password`, `/pending-approval` are public routes with no sidebar entry; should be in a `PUBLIC_ROUTES` typed constant.
- `/desktop` is both a marketing page AND has a teaser block on `/page.tsx` (Shell P2 finding).
- `/donate` exists as a page and an API route, in `PUBLIC_ROUTES` but not in `ROUTES`.

**Recommendation:** Make `ROUTES` the single source of truth, type sidebar `href` as `keyof typeof ROUTES`, derive `PUBLIC_ROUTES` and `FULL_PAGE_ROUTES` from `ROUTES` via a `meta` field per route.

### B.7 Dead exports (sampled)

Sampled ~60 exports from `src/lib/`, `src/hooks/`, `src/components/`:

| Export | File:Line | Importers | Status |
|--------|-----------|-----------|--------|
| `clearAllSyncConflicts` | `src/lib/db.ts:1492` | 0 (only definition) | **DEAD** (also Platform P2-4) |
| `deleteFromStorage` | `src/lib/storage.ts:138-147` | 0 | **DEAD** (also Projects P0) |
| `snakeKeysShallow` | `src/lib/global-projects/reconcile.ts:217` | 0 (suppressed via `void`) | **DEAD** |
| `fetchGlobalChildRows` | `src/lib/global-projects/reconcile.ts:247` | 0 | **DEAD** |
| `ScrollArea`, `ScrollBar` | `src/components/ui/scroll-area.tsx` | 0 | **DEAD FILE** (Shell P3) |
| `Popover`, `PopoverTrigger`, `PopoverContent` | `src/components/ui/popover.tsx` | 0 | **DEAD FILE** (Shell P3) |
| `Command*` | `src/components/ui/command.tsx` | only by `input-group.tsx` | **DEAD FILE** |
| `InputGroup*` | `src/components/ui/input-group.tsx` | only by dead `command.tsx` | **DEAD FILE** |
| `ROUTES` | `src/lib/routes.ts:21` | 0 | **DEAD** (Shell P2) |
| `TelnetTransport`, `SerialTransport` | `src/lib/hmi/transports/*.ts` | 0 (outside themselves) | **DEAD** (Connectivity P2) |
| `getRecentRegisterCalcs` | `src/lib/db.ts` (sampled) | not found | needs verification |
| `actionIcons` map keys `'Status changed'`, `'project_created'` | `src/components/projects/activity-timeline.tsx:13-28` | 0 emit-sites | **DEAD MAP KEYS** (Projects P3) |
| `AvatarGroup`, `AvatarGroupCount`, `AvatarBadge` | `src/components/ui/avatar.tsx:73-100` | 0 | **DEAD** (Shell P3) |
| `CardAction`, `CardFooter` | `src/components/ui/card.tsx` | 0 | **DEAD** (Shell P3) |
| `SelectGroup`, `SelectLabel`, `SelectSeparator`, `SelectScrollUpButton`, `SelectScrollDownButton` | `src/components/ui/select.tsx` | 0 | **DEAD** (Shell P3) |
| Many `DropdownMenu*` sub-exports | `src/components/ui/dropdown-menu.tsx` | 0 | **DEAD** (Shell P3) |
| `SheetTrigger`, `SheetClose`, `SheetFooter` | `src/components/ui/sheet.tsx` | 0 | **DEAD** (Shell P3) |
| `ProgressTrack`, `ProgressIndicator`, `ProgressValue` | `src/components/ui/progress.tsx` | 0 | **DEAD** (Shell P3) |
| `TableFooter`, `TableCaption` | `src/components/ui/table.tsx` | 0 | **DEAD** (Shell P3) |
| `tabsListVariants`, `inputVariants`, `textareaVariants` CVA factories | various UI primitives | 0 outside file | **DEAD** (Shell P3) |
| `EntityTypeToTable` lookups in legacy `command-snippets` paths | various | varies | needs sweep |

**Overall:** zone of biggest bloat is `src/components/ui/`. A single PR could remove ~500 LOC of dead UI exports plus four dead files. The dead `ROUTES`, `clearAllSyncConflicts`, and `deleteFromStorage` exports are higher-priority because they're misleading (look like a public API but aren't called) or actively masking a P0 (`deleteFromStorage` not being called is itself the storage-leak bug).

### B.8 Project vs GlobalProject type drift (side-by-side)

| Field | `Project` (local) | `GlobalProject` (global) | Drift |
|-------|-------------------|-------------------------|-------|
| `id` | `string` | `string` | OK |
| `name` | `string` | `string` | OK |
| `customerName` | `string` | `string` | OK |
| (none) | — | `jobSiteName: string` | **GLOBAL-ONLY** — reconcile maps `customerName \|\| name` → `job_site_name` (lossy if user wants both, Projects P2) |
| `siteAddress` | `string` | `string` | OK |
| `buildingArea` | `string` | `string` | OK |
| `projectNumber` | `string` | `string` | OK |
| (none) | — | `description: string` | **GLOBAL-ONLY** — reconcile previously folded `technicianNotes + panelRosterSummary` into this; per `SyncAgents-plan-2026-05-12.md` this was supposed to be fixed (and `description` was supposed to become a real field on `Project`) — verify shipping status |
| `technicianNotes` | `string` | `string` | OK (now a first-class column per the SyncAgents plan) |
| `tags` | `string[]` | `string[]` | OK |
| `status` | `ProjectStatus` (`'active'\|'on-hold'\|'completed'\|'archived'`) | `GlobalProjectStatus` (same set) | OK — same unions, separately named |
| `contacts` | `Contact[]` | `Contact[]` | OK at type level; edit UI surfaces differ (Projects P2) |
| `panelRosterSummary` | `string \| undefined` | `string \| null` | **DRIFT** — `undefined` vs `null` (Projects P0 root cause) |
| `networkSummary` | `string \| undefined` | `string \| null` | **DRIFT** — same |
| `syncedGlobalId` | `string \| undefined` | n/a | OK (local-only linkage) |
| `isPinned` | `boolean` (always set) | `boolean \| undefined` (joined from `global_project_preferences`) | **DRIFT** — local stores it on the project row; global stores it per-user in a separate table |
| `isOfflineAvailable` | `boolean` (always set) | `boolean \| undefined` (per-user) | **DRIFT** — same |
| `createdAt`/`updatedAt` | `string` | `string` | OK |
| (none) | — | `createdBy: string` | **GLOBAL-ONLY** — author UUID |
| (none) | — | `accessCode: string` | **GLOBAL-ONLY** — shareable code |
| (none) | — | `deletedAt: string \| null` | **GLOBAL-ONLY** — soft delete |
| (none) | — | `memberCount?`, `role?` | **GLOBAL-ONLY** — joined columns |

**Net drift:** 7 fields exist only on global; 2 fields are typed as `undefined` locally but `null` globally; per-user state (`isPinned`/`isOfflineAvailable`) is stored in two different ways. This is the architectural reason Cluster 4 keeps producing bugs.

---

## Section C — Agent-config and docs hygiene

### C.1 CLAUDE.md references missing files

CLAUDE.md sections require fix-log files for these teams:
- `BASAgents` → `.claude/BASAgents.md` — **EXISTS**
- `DesignAgents` → `.claude/DesignAgents.md` — **EXISTS**
- `DxrAgents` → `.claude/DxrAgents.md` — **MISSING**
- `SyncErrorAgents` → `.claude/SyncErrorAgents.md` — **MISSING**
- `SyncAuditAgents` → `.claude/SyncAuditAgents.md` — **MISSING**

CLAUDE.md also references `docs/SyncAuditAgents-findings-*.md` as an archive path — no such files exist under `docs/`. The repo has recent commit messages "DXRs: Analysis Panel + bulk baud-rate action", "sync: cascade local deletes + close pipeline gaps from full audit", and "Sync Error Inspector: Delete drops the queue item" suggesting these agent teams DID run sessions, but the team-definition files and the fix-log files were never committed. CLAUDE.md is documenting a process that doesn't have its supporting artifacts.

**Recommendation:** Either commit the three missing team-definition files (`.claude/DxrAgents.md`, `.claude/SyncErrorAgents.md`, `.claude/SyncAuditAgents.md`) or remove the rules from CLAUDE.md.

### C.2 Agent ownership drift

Sampled `.claude/BASAgents.md` "BAS Tools Engineer" file-ownership list (lines 22-44):
- `src/app/pid-tuning/` — **EXISTS**
- `src/app/psychrometric/` — **EXISTS**
- `src/app/register-tool/` — **EXISTS**
- `src/app/trend-viewer/` — **EXISTS**
- `src/components/register-tool/` — **EXISTS**
- `src/components/psychrometric/` — **EXISTS**
- `src/components/trend-viewer/` — **EXISTS**
- `src/lib/pid-tuning-engine.ts` — **EXISTS**
- `src/lib/psychrometric-engine.ts` — **EXISTS**
- `src/lib/register-utils.ts` — **EXISTS**
- `src/lib/trend-anomaly-engine.ts` — **EXISTS**
- `src/lib/trend-colors.ts` — **EXISTS**
- `src/hooks/use-pid-tuning.ts` — **EXISTS**
- `src/hooks/use-trend-sessions.ts` — **EXISTS**
- `src/lib/__tests__/*.test.ts` — all 4 exist

BASAgents Tools Engineer ownership is clean. Field Connectivity sampled (lines 62-74):
- `src/app/terminal/`, `src/app/ping/`, `src/app/web-interface/`, `src/app/network-diagram/` — all exist
- `src/components/web-interface/`, `src/components/network-diagram/` — exist
- `src/lib/hmi/` — exists
- `src/store/terminal-store.ts`, `src/store/web-interface-store.ts` — exist
- `src-tauri/src/main.rs` — exists (but the bulk of code is in `lib.rs`, not `main.rs`; ownership doc should be updated to include both)
- `src-tauri/capabilities/` — exists

Minor drift: `src-tauri/src/lib.rs` is not in any ownership list yet contains all the Tauri command implementations (telnet, serial, proxy_fetch, etc.). Should be added to Field Connectivity.

### C.3 Doc rot

`docs/` contains:
- `BASAgents-fixes-2026-05-09.md` + `-2.md` — fix logs, normal archive
- `DesignAgents-fixes-2026-05-09.md` — fix log
- `LandingAgents-audit-2026-05-10.md` + `LandingAgents-fixes-2026-05-10.md` — fix logs
- `PXC7-CONNECTIVITY-FINDINGS.md` — possibly orphan one-off doc; check whether it's still active context or rot
- `ShareAgents-plan-2026-05-12.md` + `ShareAgents-fixes-2026-05-12.md` — plan + fixes pair
- `SyncAgents-plan-2026-05-12.md` + `SyncAgents-fixes-2026-05-12.md` — plan + fixes pair

**Plan status assessment (sample):**
- `ShareAgents-plan-2026-05-12.md` — "Share with User" + DM + admin badge: based on recent commit history mentioning "Share Project With User" flows and the presence of `useInbox`, `useRecentShares`, `useOnlineUsers`, `useNewBugReports`, `usePendingApprovals` hooks, this plan appears SHIPPED. **Mark for archival.**
- `SyncAgents-plan-2026-05-12.md` — Global ↔ Local parity plan: the `field-map.ts` has full coverage for 40+ entity types matching what the plan called for; `GlobalProject` now has `customerName` as a first-class field (not folded). Mostly SHIPPED but the cross-cutting findings here show several open gaps (Cluster 4). **Partially shipped — keep until type-drift cluster closed.**
- `PXC7-CONNECTIVITY-FINDINGS.md` — needs a quick look to decide archival vs. retention; out of scope for this audit to deep-read.

### C.4 Unused npm dependencies

Sweep of `package.json:18-58`:

**Definitely unused (zero non-self imports across `src/`, `scripts/`, `src-tauri/`):**
- `@codemirror/lang-css` — confirmed no `from '@codemirror/lang-css'`
- `@codemirror/lang-html` — no importers
- `@codemirror/lang-javascript` — no importers
- `@codemirror/lang-json` — no importers
- `@codemirror/lang-markdown` — no importers
- `@codemirror/lang-python` — no importers
- `@codemirror/lang-xml` — no importers
- `@uiw/codemirror-extensions-basic-setup` — no importers
- `cmdk` — only imported by dead `command.tsx`
- `next-themes` — no importers; custom `ThemeProvider` is at `src/components/theme/theme-provider.tsx`
- `@tauri-apps/plugin-notification` — Rust side registers it; no frontend `invoke('notification:...')` calls; verify Rust before removing

**Confirmed used:**
- `@codemirror/autocomplete`, `@codemirror/language`, `@codemirror/search`, `@codemirror/state`, `@codemirror/view` — used by `src/lib/ppcl-language.ts` and `src/components/ppcl-editor/ppcl-editor.tsx`
- `@uiw/react-codemirror` — assumed used (verify; the `import` statements above all reference `@codemirror/*` packages but not `@uiw/react-codemirror` — may also be dead, needs deeper grep)

**Sharp** (devDep) — only used by `scripts/generate-icons.mjs` which is **unwired** (Shell P2); could be moved to `optionalDependencies` or removed if icon regen isn't a regular task.

**Net savings: 10-11 dependency entries (~50MB+ of `node_modules`).** Confirmed shipped via Shell agent's findings + my independent sweep.

---

## Top findings ranked by impact

1. **Cluster 1 (proxy_fetch security chain) — P0.** Single rogue controller compromises the host app. Mitigations must ship together.
2. **Cluster 2 (cascade-delete drift + storage leak) — P0.** Cascades silently lose data or leak storage forever. Four code paths, one fix (RPC + derive table list).
3. **Cluster 4 (Project/GlobalProject type drift) — P1.** Already causing silent data drops (Projects P0). Architectural root cause of multiple future bugs.
4. **B.5 + Cluster 3 — P1.** Direct Supabase writes outside the queue; biggest offender is the entire `api.ts` global pipeline. Document the rule or fold it into the queue.
5. **Cluster 7 (realtime channel races) — P1.** Visible to users (stale presence, missed live updates after invite). Two-line fix per call site.
6. **C.1 (CLAUDE.md references missing agent files) — P3.** Process documented in CLAUDE.md cannot be followed because `.claude/DxrAgents.md`, `.claude/SyncErrorAgents.md`, `.claude/SyncAuditAgents.md` don't exist.
7. **B.7 + Cluster 8 (dead code/exports/deps) — P3.** ~500 LOC of UI dead exports, 10-11 unused npm deps, 2 unwired scripts. One bloat-removal commit.
