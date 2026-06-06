# BASAgents Fixes — 2026-06-06 (session 2)

**Source findings doc:** [docs/ReviewAgents-findings-2026-05-20.md](./ReviewAgents-findings-2026-05-20.md) and per-slice files.
**Predecessor logs:** P0 → [2026-06-03](./BASAgents-fixes-2026-06-03.md) + [2026-06-03-2](./BASAgents-fixes-2026-06-03-2.md); P1 → [2026-06-06](./BASAgents-fixes-2026-06-06.md).
**Scope:** the **P2 (inconsistency / consistency) findings** across all five review slices.

## Header block

| Field | Value |
|-------|-------|
| Date | 2026-06-06 (2nd session) |
| Agents | 5 BASAgents in parallel (Platform, BAS Tools, Project Manager, Field Connectivity, Desktop & Build) |
| Findings remediated | ~43 P2 items across all slices |
| Files changed | 40 modified, 4 deleted (`scripts/post-static-build.sh`, `src/lib/hmi/transports/{telnet,serial}-transport.ts`, `src/lib/hmi/types.ts`) |
| Insertions / deletions | ~+774 / −467 (net reduction from dead-code removal) |
| TypeScript | Clean (only pre-existing `xlsx`/DXR module errors remain) |
| Tests | JS **358/358**, Rust **8/8** |
| Lint | No new eslint problems (pre-existing `<img>`/unused warnings unchanged) |

## Audit Phase

Findings from the 2026-05-20 ReviewAgents audit. Dispatched the 5 fix-team agents partitioned by per-slice ownership. Skips/re-routes to avoid rework and parallel file collisions:
- **Connectivity:** skipped the telnet `timeoutMs` P2 (fixed in P1) and the subnegotiation-corruption P2 (fixed in P0) — verified still in place.
- **Projects:** skipped the inbox hard-delete P2 (fixed in P1); the client `MAX_FILE_SIZE` alignment was re-routed to **Platform** (owns `storage.ts`).
- Two agents both append-edited `src/types/index.ts` (Connectivity → `PingTarget.id`; Projects → project-number helper); both edits verified present, no clobber.

---

## Fixes Applied — P2

### Platform & Sync
- **Duplicate cascade cleanup** → extracted `cleanupSyncArtifacts(pairs[])` in `db.ts`, called from both cascades (IDB-tx-safe structure preserved).
- **`addSyncError` cap race** → put + count + overflow-delete now in one readwrite transaction.
- **`clearAllSyncConflicts` dead export** → wired into the Settings "Reset Sync State" card.
- **`purgeOrphans` 42703 spam** → child-table list now `SYNC_ORDER.filter(REQUIRES_PROJECT_ID.has)` (subsumes the hand-coded `commandSnippets` exclusion).
- **`syncedGlobalId` missing override** → added explicit `synced_global_id` to `FIELD_OVERRIDES.projects`.
- **`useSyncErrors.forgetRow` double-cast** → replaced with a runtime `isBasToolkitStoreName` guard (+ a `satisfies`-checked store-name set in db.ts).
- **`MAX_FILE_SIZE`** (re-routed): already 50 MB in `storage.ts`, matching the P1 bucket migration — verified, no change needed.
- `notifySync` pattern P2: `bulkSetDxrBaudRate` already emits after `tx.done` — findings line numbers were stale; no change.

### BAS Tools
- **Bad-cell allow-list** → case-insensitive sentinel regex (`null|nan|n/a|#n/a|bad|none|—|--`) + a "bad-quality cells" warning.
- **CSV export RFC-4180 escaping** → `csvEscape()` applied to headers + cells (+ test).
- **Units-row header detection** → skips a short units row beneath the header (header at i, data at i+2) (+ tests).
- **Silent RH clamp** → added uncapped `relativeHumidityRawFromW`; UI-facing path still clamps, plus a supersaturation warning.
- **Anomalies vs Statistics scope** → both panels now compute over **all series** (visibility is a chart concern).
- **`formatProperty` humidityRatio** → 3 inline sites routed through the shared helper; convention documented.
- **`validateInputs` → `validateInputsIP`** → renamed to make the IP-unit invariant explicit (callers + tests updated).
- **Oscillation critical threshold** → extracted a local; **`detectGaps` median** → shared `median()` helper (fixes even-count high bias).
- **Modbus 0/1-based notation** → ModbusBuilder now shows a "Holding Register assumed" note for non-Modicon notation.

### Projects & Knowledge
- **`reconcile.ts` `updated_at` compare** (functional) → parsed `Date.parse` comparison (global at-or-newer wins; equal skips) instead of exact-string match, so reconciles stop needlessly re-pushing on format/timezone/precision differences while keeping the skip count meaningful.
- **Project-number regex** → extracted `PROJECT_NUMBER_REGEX` / `isValidProjectNumber` / `PROJECT_NUMBER_FORMAT_HINT` into `src/types/index.ts`; both dialogs consume it.
- **Documentation fixes** (clarify intent without risky refactors): local↔global `customerName`/`jobSiteName` mapping (type files), contacts-managed-in-Overview note (local edit dialog), `useGlobalProject.update` throws (hook), status-enum casing rationale (type file), `markRead` timing (message board).
- **Deferred to Platform:** global file delete not clearing `storagePath` (lives in db.ts) — left a `TODO` note.

### Field Connectivity
- **Dead code deleted** → `src/lib/hmi/transports/{telnet,serial}-transport.ts` + `src/lib/hmi/types.ts` (zero importers; drifted enums). `ansi-parser.ts` kept.
- **Serial read loop** → dropped the redundant 10 ms sleep (the 100 ms read timeout already throttles). (Full `tokio::sync::Mutex` refactor deferred.)
- **IPv6 consistency** → added `build_socket_addr_str()` that brackets IPv6 (`[::1]:23`), used by `check_port` and `telnet_connect`, so the whole path is consistently IPv6-capable (prior batch already made `is_private_network` IPv6-aware) (+ 2 tests).
- **Ping result-map key collision** → `PingTarget.id` (`crypto.randomUUID()`) + `targetKey()` keying (legacy-session fallback retained).
- **`telnet_disconnect`** → `.lock().await` instead of `try_lock()` so the FIN/shutdown isn't skipped (helps Niagara session release).
- **`EmbedSupport` cert-issue** → now persists `lastKnownEmbedSupport: 'blocked'` so repeated cert failures are remembered; added a local-only-endpoints comment.

### Desktop, UI & Build
- **Two `ErrorBoundary` classes merged** → single shared class with `section?`/`fallback?`/`onError?`/`mode: 'retry'|'reload'`; layout version is now a thin `mode="retry"` wrapper (both call sites unchanged).
- **Dead `ROUTES` constant deleted** (`lib/routes.ts`); **`FULL_PAGE_ROUTES`/`PUBLIC_ROUTES`** moved into `lib/routes.ts` as typed constants and imported by `app-shell`.
- **Desktop messaging harmonized** → `/desktop` page copy aligned to the homepage "Available Now (Windows)" framing (no macOS claims, per policy).
- **PWA cache version auto-stamped** → `scripts/build-static.js` now rewrites `CACHE_VERSION` in `out/sw.js` from `package.json` version on each build (source stays clean); wired via the existing `beforeBuildCommand`.
- **`scripts/post-static-build.sh` deleted** → confirmed dead (SPA fallback handled at runtime in lib.rs; no `__fallback` references).
- **`scripts/generate-icons.mjs`** → added a discoverable `"icons"` npm script.

---

## Housekeeping

- `.claude/settings.local.json` — auto-appended read-only verification command allowlist entries. Harmless; retained.
- Net **dead-code reduction**: 4 files deleted (~190 LOC) plus the dead `ROUTES` table.

## Verification

- **TypeScript:** `npx tsc --noEmit` — clean for all changed files (only pre-existing `xlsx`/DXR errors remain).
- **JS tests:** `npx vitest run` — **358 passed / 358** (new CSV-escaping, units-row, RH-raw, IPv6, and other tests added).
- **Rust:** `cargo test --lib` — **8 passed** (6 IAC + 2 new IPv6/private-network); `cargo check` clean (one pre-existing unrelated warning).
- **Lint:** no new eslint problems.

### Deferred (carried forward)
- Full `tokio::sync::Mutex` serial-port refactor (the safe sleep removal shipped instead).
- Global file-delete `storagePath` clearing (db.ts; pending soft-delete recovery UX) — Platform.
- All **P3** findings remain — final batch (mostly safe dead-code / unused-dependency removal).
