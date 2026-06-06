# BASAgents Fixes — 2026-06-06 (session 3)

**Source findings doc:** [docs/ReviewAgents-findings-2026-05-20.md](./ReviewAgents-findings-2026-05-20.md) and per-slice files.
**Predecessor logs:** P0 → [06-03](./BASAgents-fixes-2026-06-03.md) + [06-03-2](./BASAgents-fixes-2026-06-03-2.md); P1 → [06-06](./BASAgents-fixes-2026-06-06.md); P2 → [06-06-2](./BASAgents-fixes-2026-06-06-2.md).
**Scope:** the **P3 (bloat / dead-code / polish) findings** across all five review slices. **This completes the ReviewAgents 2026-05-20 audit (P0→P3).**

## Header block

| Field | Value |
|-------|-------|
| Date | 2026-06-06 (3rd session) |
| Agents | 5 BASAgents in parallel (Platform, BAS Tools, Project Manager, Field Connectivity, Desktop & Build) |
| Findings remediated | ~40 P3 items across all slices (large refactors explicitly deferred) |
| Files changed | 58 modified, 5 deleted, 4 new |
| Insertions / deletions | ~+393 / −2287 (net ~−1900; ~−600 source LOC + ~−800 lockfile + dead code) |
| npm dependencies removed | 11 |
| TypeScript | Clean (only pre-existing `xlsx`/DXR module errors remain) |
| Tests | JS **358/358**, Rust **8/8** |
| Build | `npm run build:static` ✅ (37 routes, SW auto-stamped `v4.18.0`) |

## Audit Phase

Findings from the 2026-05-20 ReviewAgents audit. 5 fix-team agents partitioned by ownership. Skips/re-routes:
- Already done: dead HMI transports/types (deleted in P2), PWA cache auto-stamp (P2) — verified.
- All `lib.rs` P3 items (unused `serde::ser::Error` import, SPA-fallback extraction) → **Field Connectivity** (sole `lib.rs` editor); the `downloadBlob` util also went to Connectivity so Desktop & Build didn't touch `utils.ts`.
- **Deferred** (large/disruptive, not bloat removal): the two generic-hook extractions in Projects (`useProjectStore`/`useGlobalProjectEntity`, ~1000 LOC of restructure), and `tsconfig` `noUncheckedIndexedAccess`/`exactOptionalPropertyTypes`, and the 23-step tour compression (UX). All recommended as dedicated future PRs.

---

## Fixes Applied — P3

### Desktop, UI & Build (largest slice)
- **Removed 11 unused npm dependencies:** `@codemirror/lang-{css,html,javascript,json,markdown,python,xml}`, `@uiw/codemirror-extensions-basic-setup`, `next-themes`, `cmdk`, `@tauri-apps/plugin-notification` (verified the Rust side pulls `tauri-plugin-notification` independently, so the JS binding was safe to drop). `npm install` ran clean; lockfile −802 lines; full build passed.
- **Deleted 4 dead UI primitive files:** `ui/{scroll-area,popover,command,input-group}.tsx` (zero external importers; `command` was the only `cmdk` consumer).
- **Removed dead exports** inside live primitives (avatar/card/select/dropdown-menu/sheet/progress/table/tabs/input/textarea) — kept everything actually imported (incl. internally-used bodies).
- **Unused icon imports** removed (`update-notifier` ExternalLink; `help/page` BookmarkPlus already gone via redesign; `ppcl-file-panel` `Replace` removed by the orchestrator).
- **`next.config.ts`** version fallback now reads `package.json` (`npm_package_version || pkg.version`).
- **`useKeyboardShortcut`** inlined into `top-bar.tsx` and the single-use hook deleted.
- **`routes.ts`** memoizes `isTauri()` (one IPC probe per session instead of two per nav).
- **Hero `lineHeight`** inline styles → `leading-[1.05]`/`leading-[1.1]` classes.
- **Download CTA** standardized to `/api/download?format=msi`.
- **Sidebar collapsed-group state** moved from raw `localStorage` into the `app-store` persist (`collapsedNavGroups`).
- **`scripts/sync-version.js`** added (reads package.json → writes Cargo.toml + tauri.conf.json; `--check` mode; `npm version` hook) — version numbers unchanged.

### Platform & Sync
- **`error-reporting.ts`** now routes messages through `sanitizeForLog` before logging/toasting (real PII-scrub fix).
- **`removeReportBlobs`/`collectReportBlobKeys`** helpers extracted; used by both `deleteDailyReport` and `cascadeDeleteProject` (IDB-tx-safe structure preserved).
- **`MaintenancePage`** now lazy-loaded (`dynamic`, ssr:false) so its ~310 LOC ships as a separate chunk.
- **`SyncOperationDialog`** shared component extracted; `backup-dialog`/`restore-dialog` are now thin config wrappers (~−170 LOC, identical behavior).
- **rate-limit** trusted-proxy assumption + Upstash upgrade path documented.
- **Legacy IDB stores** (`projectNotepadEntries`/`notepadDocuments`/`fieldPanels`): verified unused; **documented as intentionally-retained** (deleting object stores needs a version-bumped migration + risks data on old installs) rather than deleted — the safe call.

### BAS Tools
- **`exportChartAsPng`** revokes the blob URL in `finally` (no leak on error).
- **`getValueRangeWarnings`** non-integer warning dropped (was firing on every float; test updated).
- **PID** long-dead-time integral block guarded by `controlMode !== 'p'` (no misleading P-only explanation); PID page references the stored `proportionalBand` instead of recomputing.
- **`formatProperty`** RH-vs-degreeOfSaturation storage scales documented.
- **OA fraction input** keeps the last valid value instead of snapping to 0 on clear.

### Projects & Knowledge
- **Dead code removed:** unused imports in the global detail page; `escapeHtml` in share-dialog; `member-management` unused `projectId` prop; the `GlobalNetworkDiagramsTab` "coming soon" placeholder + tab; `snakeKeysShallow`/`fetchGlobalChildRows`/`snake` void'd helpers in reconcile.
- **`actionIcons`** map reconciled against actually-emitted action names (dead keys removed, `'Project updated'` kept).
- **`formatFileSize`** consolidated to the canonical `file-icon` helper across KB pages + global file list (Platform's `storage.ts` left untouched per ownership).
- **`useProject`** double-fetch removed (effect now calls the shared `refresh` under its stale guard).
- Stale `dxrs` reconcile comment updated.

### Field Connectivity
- **`lib.rs`:** serial buffer moved into its closure; `parseTtl/parseRtt` no longer allocate a lowercased String per ping (case-insensitive byte search); `icmp_ping` count clamped to `[1,100]`; dead binary/base64 proxy path + custom encoder + unused `serde::ser::Error` import removed; **SPA-fallback JS extracted** to `public/spa-fallback.js` via `include_str!` (preserves the P1 `main#main-content` fix); `check_port` drop-abort documented.
- **`downloadBlob(content, filename, mime)`** helper added to `utils.ts`; all 4 export sites (terminal/ping/web-interface/network-diagram) collapsed onto it.
- **`isValidHost`** now allows bracketed IPv6 (aligns with the P2 Rust IPv6 path).
- **SIEMENS_PRESETS** quick-connect now carries `accessMethod` into the save form.
- camelCase-invoke lint rationale documented in `tauri-bridge.ts`.

---

## Housekeeping

- `.claude/settings.local.json` — auto-appended read-only verification allowlist entries. Harmless; retained.
- New files: `public/spa-fallback.js`, `scripts/sync-version.js`, `src/components/maintenance/maintenance-page-lazy.tsx`, `src/components/settings/sync-operation-dialog.tsx`.
- Deleted: `src/components/ui/{scroll-area,popover,command,input-group}.tsx`, `src/hooks/use-keyboard-shortcut.ts`.

## Verification

- **TypeScript:** `npx tsc --noEmit` — clean for all changed files (only pre-existing `xlsx`/DXR errors remain).
- **JS tests:** `npx vitest run` — **358 passed / 358**.
- **Rust:** `cargo test --lib` — **8 passed**; `cargo check` clean.
- **Production build:** `npm run build:static` — **success**, all 37 routes compiled, SW cache version auto-stamped, API restore step ran. This is the key check given the dependency prune + file deletions.

### Deferred (recommended dedicated PRs)
- `useProjectStore<T>` / `useGlobalProjectEntity<T>` generic-hook extractions (~1000 LOC restructure).
- `tsconfig` `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`.
- 23-step onboarding tour compression (UX).
- Full `tokio::sync::Mutex` serial-port refactor (carried from P2).

---

## ReviewAgents 2026-05-20 audit — COMPLETE

All priority tiers remediated: **P0** (15, two batches) · **P1** (~38) · **P2** (~43) · **P3** (~40). Remaining open items are the explicitly-deferred large refactors above, tracked for future dedicated PRs.
