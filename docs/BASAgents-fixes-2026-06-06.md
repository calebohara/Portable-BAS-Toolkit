# BASAgents Fixes — 2026-06-06

**Source findings doc:** [docs/ReviewAgents-findings-2026-05-20.md](./ReviewAgents-findings-2026-05-20.md) and its per-slice files.
**Predecessor logs:** P0 batches in [docs/BASAgents-fixes-2026-06-03.md](./BASAgents-fixes-2026-06-03.md) + [docs/BASAgents-fixes-2026-06-03-2.md](./BASAgents-fixes-2026-06-03-2.md).
**Scope:** the **P1 (visible-bug) findings** across all five review slices. The P0s were all closed in the 2026-06-03 batches.

## Header block

| Field | Value |
|-------|-------|
| Date | 2026-06-06 |
| Agents | 5 BASAgents in parallel (Platform, BAS Tools, Project Manager, Field Connectivity, Desktop & Build) |
| Findings remediated | ~38 P1 items across all slices + 1 new migration + 1 stale-test housekeeping fix |
| Files changed | 53 modified + 3 new (`accepted-file-types.ts`, `snapshot-registry.ts`, `enforce-storage-bucket-size-limits.sql`) |
| Insertions / deletions | ~+945 / −268 |
| TypeScript | Clean (only pre-existing `xlsx`/DXR module errors remain) |
| Tests | JS **351/351**, Rust **6/6** |
| Lint | No new eslint problems introduced (pre-existing `set-state-in-effect`/unused-import warnings unchanged) |

## Audit Phase

Findings from the 2026-05-20 ReviewAgents read-only audit. This session dispatched the 5 fix-team agents, partitioned by per-slice ownership; two cross-file items were re-routed to avoid parallel edits to one file:
- All `src-tauri/src/lib.rs` edits → **Field Connectivity** (so the telnet-timeout P1 and the Shell `#__next` P1 don't collide).
- `globalProjectPreferences` IDB mirror (Platform-flagged, but in `global-projects/api.ts`) → **Project Manager**.
- Connectivity's `is_private_network` and reqwest-redirect P1s were already fixed in the P0 security batch — verified still in place, not redone.

| Agent | Slice doc | Files |
|-------|-----------|-------|
| Platform Engineer | platform.md | api/subscribe/portal, settings, sync-manager, sync-provider, db.ts, use-online-users, supabase migration |
| BAS Tools Engineer | tools.md | psychrometric, trend-viewer, register-tool, their engines + tests |
| Project Manager | projects.md | projects/global-projects/reports/files/inbox/notes/kb hooks + components, global-projects/api.ts |
| Field Connectivity | connectivity.md | terminal, ping pages, lib.rs, tauri-bridge.ts |
| Desktop & Build | shell.md | ui/dialog, ppcl-editor, notepad, error-boundary, next.config, updater |

---

## Fixes Applied — P1

### Platform & Sync
- **Manage-Subscription always 403** (`api/subscribe/portal/route.ts`, `settings/page.tsx`): route now looks up `stripe_customer_id` server-side from the authenticated profile and no longer trusts a client-sent body; settings now sends the auth bearer token.
- **Stale realtime membership filter** (`sync-manager.ts`, `sync-provider.tsx`): added a `force` param to `subscribeToGlobalRealtime`; membership-change handler force-refreshes the project-id cache before re-subscribing so a just-joined project gets live updates immediately.
- **Cleanup ref overwritten without calling** (`sync-provider.tsx`): `handleMembershipChanged` now invokes the previous cleanup (and nulls the ref) before re-subscribing.
- **Unstable `pullSync` pagination** (`sync-manager.ts`): added explicit `.order('id'|'timestamp')` before `.range()` so page boundaries are deterministic (no skipped/duplicated rows under concurrent inserts).
- **No DB-version check on import** (`db.ts` `importSnapshot`): reads `_dbVersion[0]` and throws a clear error on a stale-schema backup (with an `allowStaleSchema` escape hatch).
- **Presence channel recreated on profile change** (`use-online-users.ts`): split into a stable channel effect + a `track()`-on-change effect, eliminating duplicate presence entries.
- **Token-expired treated as permanent failure** (`sync-manager.ts`): 401/JWT-expired now triggers a one-shot `auth.refreshSession()` + requeue without incrementing the retry count.
- **File-size limit only client-side** → new migration `supabase/migrations/enforce-storage-bucket-size-limits.sql` force-sets `file_size_limit` on `project-files` (50 MB) and `avatars` (5 MB). Migration tracking rule followed: guarded self-recording footer + probe in `check-migrations.sql` + line in `backfill-schema-migrations.sql` + row 45 in `docs/MIGRATIONS.md`.

### BAS Tools
- **Coil-load Heating/Cooling label inverted** (`ahu-processes-panel.tsx`): mode now derived from entering vs. leaving dry-bulb; added cooling+heating unit tests pinning the sign convention.
- **Multi-file CSV drop dropped all but the first** (`csv-upload-panel.tsx`): now parses every dropped file (preview first, auto-load the rest on confirm).
- **Binary `runtimeHours` never accumulated** (`trend-anomaly-engine.ts`): fixed the prior-sample tracking + added an `isBinary` guard; the pinned broken test was rewritten to assert correct accumulation.
- **Trend Save dialog hardcoded `projectId:''`** (`session-dialogs.tsx`, `trend-viewer/page.tsx`): added a project Select; sessions now attach to projects (activity log + per-project Trends list populate).
- **Register SaveDialog stored empty inputs/result** (`save-dialog.tsx` + new `snapshot-registry.ts`): wired QuickConverter/FloatDecoder/ScalingCalculator to register live snapshots; SaveDialog refuses empty saves for not-yet-wired modules (no blank bookmarks). *Deferred:* wiring the remaining 4 modules (same hook).
- **CSV timestamp locale/UTC mixing** (`trend-csv-parser.ts`, `csv-preview-dialog.tsx`): added a UTC/Local timezone option + preview note; ISO-with-offset honored as written.
- **Enthalpy humidity-ratio had no upper clamp** (`psychrometric-engine.ts`): added the `>0.03` clamp + warn (matches RH/dew-point paths) + test.
- **`extractBitfield` returned 0 at length===32** (`register-utils.ts`): `length>=32 ? 0xffffffff : (1<<length)-1` + `>>>0`; test added.
- **`parseTimestamp` silent catch-all** (`trend-csv-parser.ts`): dropped the ambiguous `new Date()` fallback; unmatched rows return null and surface as separate "missing" vs "ambiguous" preview warnings.

### Projects & Knowledge
- **Project updates logged no activity** (`use-projects.ts`): added a change-summary diff and `db.addActivity({ action: 'Project updated' })` on both update paths (covers inline contact edits).
- **`removeProject` left orphan recent-id** (`use-projects.ts` + call sites): moved `removeRecentProject` into the hook (single source); detail page now routes deletes through the hook.
- **Double error toast on global edit** (`global-projects/[...]/client-page.tsx`): standardized error ownership to the parent wrappers for Project/Device/IP/Report dialogs.
- **Global notes couldn't attach to a file** (`client-page.tsx`, `field-notes-view.tsx`): added an optional "Attach to file" selector (global + local) plumbing `fileId`.
- **Message delete didn't cascade replies** (`global-projects/api.ts`): `deleteGlobalMessage` now soft-deletes replies too, so refresh matches the optimistic state.
- **Recent-shares floor not per-user** (`use-recent-shares.ts`): keyed by `user.id`.
- **Inbox purge: click-twice hard delete** (`inbox-panel.tsx`, `use-inbox.ts`): replaced with a `ConfirmDialog`; purge now soft-deletes via `deleted_by_recipient`/`deleted_by_sender`.
- **Report "Link to Global" duplicated rows** (`report-form.tsx`, `api.ts`): `addGlobalReport` takes the local report id and upserts (idempotent).
- **Global upload skipped extension/category checks** (new `accepted-file-types.ts`, `global-file-list-view.tsx`, `upload-file-dialog.tsx`): extracted shared `ACCEPTED_TYPES` + `validateFileForCategory`, applied on both sides.
- **Realtime channel name reuse race** (`use-global-projects.ts`): per-instance `crypto.randomUUID()` suffix so two pages on the same (table,filter) don't tear down each other's channel.
- **KB markdown XSS-stack hardening** (`knowledge-base/page.tsx`): removed `class` from DOMPurify `ALLOWED_ATTR`, force `rel="noopener noreferrer"` on `target=_blank`. *Deferred:* full `react-markdown` swap.
- **`globalProjectPreferences` upsert not mirrored to IDB** (`global-projects/api.ts`): `bulkPutSilent` after upsert so local reads aren't stale until realtime fires.

### Field Connectivity
- **Native telnet/serial leak on navigate-away** (`terminal/page.tsx`): unmount cleanup now disconnects connected/connecting sessions (via refs to avoid stale snapshots); also fixed a latent wrong-transport bug in `handleDisconnect`.
- **`tryFetch` didn't clearTimeout on error** (`ping/page.tsx`): `try/finally` clears the abort timer on both paths.
- **Reconnect/connect re-entry race** (`terminal/page.tsx`): `connectingRef` guard + immediate `'connecting'` state lock.
- **Flush timer fired after disconnect/clear** (`terminal/page.tsx`): `resetLineBuffer` cancels pending timers on clear/remove; timer callback bails if the session is gone.
- **`telnet_connect` ignored `timeoutMs`** (`lib.rs`, `tauri-bridge.ts`): Rust command now takes `timeoutMs: Option<u64>` and uses it; bridge default aligned to 15000.
- **SPA fallback checked non-existent `#__next`** (`lib.rs`): replaced with `main#main-content` (the real App Router marker), so the fallback redirect no longer fires on every dynamic-route nav.
- *Verified still in place from the P0 batch:* `is_private_network` IP-literal parsing + reqwest `Policy::none()`.

### Desktop, UI & Build
- **Tailwind v4 `[Nvh]` arbitrary classes** (`dialog.tsx`, `ppcl-preview-dialog.tsx`, `error-boundary.tsx`): converted to inline `style` (the dialog inner-wrapper is the safe spot per the base-ui quirk). The responsive `max-sm:h-[60vh]` in `global-notepad.tsx` became a real `@media` utility in `globals.css` (inline styles can't carry media queries).
- **Nested interactive elements in PPCL tab close** (`ppcl-tab-bar.tsx`): outer is now `div role="tab"` + a real inner `<button>`; keyboard/middle-click/stopPropagation behavior preserved.
- **`next.config.ts` `font-src` excluded `data:`**: added `data:`.
- **Updater manifest race / stale cache** (`updater.ts`, `update-notifier.tsx`): `downloadAndInstall` no longer re-fetches; throws `StaleUpdateError` on null/expired (15 min TTL) cache; notifier re-prompts on stale.

---

## Housekeeping

- **Stale test fixed:** `reconcile.test.ts` asserted "exactly 14 reconciled entity pairs" but the constant has had 15 for some time (the findings doc confirms 15). Updated the assertion 14→15 so the suite is green. This was a long-standing pre-existing red test, not a regression from this batch.
- `.claude/settings.local.json` — auto-appended read-only verification command allowlist entries from the agents. Harmless; retained.

## Verification

- **TypeScript:** `npx tsc --noEmit` — clean for all changed files (only pre-existing `xlsx`/DXR module errors remain).
- **JS tests:** `npx vitest run` — **351 passed / 351** (includes new psychrometric coil-mode, runtimeHours, enthalpy-clamp, and bitfield-32 tests; the previously-red reconcile count test now passes).
- **Rust:** `cargo test --lib` — **6 passed**; `cargo check` clean (one pre-existing unrelated `unused import` warning).
- **Lint:** no new eslint problems; pre-existing `react-hooks/set-state-in-effect` and unused-import warnings unchanged.

### Deferred (carried forward)
- Register snapshot wiring for the remaining 4 modules (register/byte-order/bitmask/modbus) — SaveDialog already refuses empty saves for them.
- KB full `react-markdown` migration (only the safe DOMPurify hardening was done this round).
- All **P2 / P3** findings remain open — next batches.
