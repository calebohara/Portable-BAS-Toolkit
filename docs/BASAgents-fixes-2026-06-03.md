# BASAgents Fixes — 2026-06-03

**Source findings doc:** [docs/ReviewAgents-findings-2026-05-20.md](./ReviewAgents-findings-2026-05-20.md) — "Top 10 issues by impact"

## Header block

| Field | Value |
|-------|-------|
| Date | 2026-06-03 |
| Agents | 5 (Field Connectivity, Desktop & Build, Platform Engineer, Project Manager, BAS Tools Engineer) |
| Findings remediated | Top 10 ranked P0 issues |
| Files changed | 19 (+1 new test file) |
| Insertions / deletions | ~594 / ~188 |
| TypeScript | Clean for changed files (only pre-existing `xlsx` module errors remain) |
| Tests | 157 passed (sync, db, trend-anomaly, trend-csv) |

---

## Audit Phase

The audit was performed in the prior ReviewAgents read-only session (`docs/ReviewAgents-findings-2026-05-20.md`). This session dispatched the 5 BASAgents fix-team agents, partitioned by file ownership so no two agents touched the same file.

| Agent | Ownership area | Top-10 items | Key files read |
|-------|----------------|--------------|----------------|
| Field Connectivity | Terminal, network, web interface, Rust proxy | #1 (security chain, FE + Rust) | `embedded-workspace.tsx`, `src-tauri/src/lib.rs`, `tauri-bridge.ts` |
| Desktop & Build | Tauri config, CI/CD, UI shell | #1 (CSP), #10 (macOS CI) | `tauri.conf.json`, `.github/workflows/release.yml`, `entitlements.plist`, `next.config.ts` |
| Platform Engineer | Auth, sync, db layer, settings | #2, #3, #4, #7 | `db.ts`, `sync-manager.ts`, `field-map.ts`, `data-cleanup-dialog.tsx`, `reset-password/page.tsx`, `auth-provider.tsx` |
| Project Manager | Projects, global collab, sharing | #5, #6 | `global-projects/api.ts`, `import-project-dialog.tsx`, `reconcile.ts`, `share-formatters.ts`, supabase migrations |
| BAS Tools Engineer | PID, psychrometric, register, trend | #8, #9 | `trend-csv-parser.ts`, `anomaly-config-sheet.tsx`, `trend-anomaly-engine.ts`, `csv-preview-dialog.tsx` |

---

## Fixes Applied

All items in the findings doc's "Top 10 issues by impact" are P0.

### P0

#### #1 — `proxy_fetch` + iframe `srcDoc` LAN-to-host security chain *(Cluster 1)*

- **`src/components/web-interface/embedded-workspace.tsx`** — *Issue:* the `srcDoc` iframe rendering proxied controller HTML used `sandbox="allow-same-origin ..."`. Because `srcDoc` content inherits the host (app) origin, this let a rogue/MITM'd controller's HTML reach the host's IndexedDB, Supabase tokens, and `__TAURI_INTERNALS__`. *Fix:* dropped `allow-same-origin` from the `proxyHtml` iframe only (kept `allow-scripts allow-forms allow-popups`), giving the rendered body an opaque origin. The separate `src={activeUrl}` cross-origin iframe deliberately keeps `allow-same-origin` (there same-origin grants access to the *controller's* origin, not the host's). Call site now opts into self-signed certs explicitly via `nativeProxyFetch(activeUrl, true)`.
- **`src-tauri/src/lib.rs` `is_private_network` (~703-714)** — *Issue:* string-prefix matching accepted deceptive hostnames like `10.attacker.example`, `127.evil.tld`. *Fix:* rewritten to parse the host into `std::net::IpAddr` and accept only literal private/loopback/link-local IPv4 and loopback/link-local(fe80::/10)/unique-local(fc00::/7) IPv6 literals; strips `[...]` brackets; rejects all DNS hostnames.
- **`src-tauri/src/lib.rs` `proxy_fetch` (~716-775)** — *Issue:* always used `danger_accept_invalid_certs(true)` and the default reqwest redirect policy (up to 10 redirects → SSRF redirect pivot). *Fix:* added `allow_invalid_certs: Option<bool>` param (defaults to `false`); set `redirect::Policy::none()`; cert validation now on by default with explicit per-request opt-in.
- **`src/lib/tauri-bridge.ts`** — threads `allowInvalidCerts` (default `false`) through `invoke('proxy_fetch', …)`.
- **`src-tauri/tauri.conf.json` CSP — assessed & DEFERRED.** Removing `'unsafe-inline'` from `script-src` would break Next.js static-export hydration (inline `self.__next_f.push(...)` bootstrap scripts, no nonce/hash). Narrowing `frame-src` is impossible without breaking the embedded workspace (loads arbitrary controller pages); the only available narrowing was removing Stripe entries already subsumed by the `https:` wildcard (a cosmetic no-op). No provably-safe CSP hardening available this pass.

#### #2 — Cascade-delete table drift + IDB cross-`await` *(Cluster 2)*

- **`src/lib/db.ts` `cascadeDeleteProject` / `cascadeDeleteGlobalProject`** — *Issue:* one `readwrite` transaction held across ~17 sequential awaits; the `idb` tx auto-closes mid-cascade, deleting the parent row then throwing and orphaning child rows + blobs. *Fix:* split into a READ phase (gather all child IDs/blob keys outside any write tx) then a single WRITE tx that enqueues every delete synchronously, awaiting only `tx.done` (mirrors the already-fixed pull-side cascade / `bulkDeleteSilent` pattern).
- **`src/lib/db.ts` `getAllProjectEntityCounts`** — *Issue:* `await Promise.all` inside a `for` loop closed the read-only tx after the first project → `InvalidStateError` for the 2nd+ project. *Fix:* resolve indexes once, fan out all `3*N` count requests in a single `Promise.all` with no intervening awaits, map results back by offset.
- **`src/components/settings/data-cleanup-dialog.tsx`** — *Issue:* hand-rolled `SUPABASE_PROJECT_CHILD_TABLES` listed ~12 tables; schema has 16+, causing FK violations / orphans. *Fix:* derived the child-table list at runtime from the canonical sync registry (`SYNC_ORDER` filtered by global/non-project-child exclusions, mapped via `entityTypeToTable`), documented `field-map.ts` as the canonical source so it can no longer drift.

#### #3 — Sync queue items stuck in `'syncing'` never retried

- **`src/lib/db.ts` + `src/lib/sync/sync-manager.ts`** — *Issue:* a row flips to `status: 'syncing'` before the network call; if the process dies, `getPendingSyncItems` (filters `'pending'`) never picks it up → silent data loss. *Fix:* new `resetSyncingItemsToPending()` db helper sweeps all `'syncing'` rows back to `'pending'`; called as a recovery sweep at the start of `SyncManager.start()` (chained before the first `processQueue()`, guarded against a concurrent `stop()`).

#### #4 — No tie-break for equal `updated_at`; `sync_version` unused

- **`src/lib/sync/field-map.ts`** — *Issue:* `sync_version` (schema `int default 1`, intended tiebreaker) was stripped on both push and pull. *Fix:* stopped stripping it on pull so it round-trips in as `syncVersion`; added `syncVersion` to `LOCAL_ONLY_FIELDS` so it's stripped on push (keeps the DB default / future server increment authoritative, won't break inserts).
- **`src/lib/sync/sync-manager.ts` (~305)** — *Issue:* strict `>` on ms-granular timestamps → slower-clock device silently loses writes. *Fix:* conflict now raised if remote strictly newer **OR** (equal-ms timestamp AND remote `sync_version >= local`); equal-ms with a missing version is treated as a conflict (surfaced, not silently dropped). *Deferred:* server-side `sync_version` auto-increment trigger/RPC needs a coordinated schema migration — `sync_version` is wired through as a JS-side secondary tiebreaker only this pass.

#### #5 — `updateGlobalProject` silently drops 5 user-editable fields

- **`src/lib/global-projects/api.ts`** — *Issue:* the accepted type allowlisted only 8 columns; edits to `customerName`, `technicianNotes`, `panelRosterSummary`, `networkSummary`, `contacts` returned a success toast but never persisted. *Fix:* widened the param type and added the 5 snake_case mappings (`customer_name`, `technician_notes`, `panel_roster_summary`, `network_summary`, `contacts`). Did **not** reuse the generic `updateEntity` helper because it unconditionally sets `updated_by`, a column `global_projects` does not have (verified against schema) — the hand-rolled mapper is correct for this table. All 5 columns confirmed present via `add-global-project-parity-fields.sql`.

#### #6 — Import-project dialog silently drops data

- **`src/components/share/import-project-dialog.tsx`** — *Issue:* the dialog imported only `project + notes + devices + ipPlan` and labeled files "(metadata only)" without warning that data is dropped. *Fix (FAIL-FAST / WARN):* on investigation, the share-package format (`generateSharePackage`) only ever emits a fixed set of sections (not the full 15 reconcile entity types — those travel only via the Supabase sync path), and packaged `files` carry metadata with no blob payload. So a full reconcile-mapper import would import types that can't be present / useless empty file shells. Instead, the preview now computes `droppedSections` and shows a prominent amber "Not included in this import" panel with exact per-type counts (files = "no file contents in package", activity history, and a future-proof catch-all), and points the user to Cloud & Sync for a full transfer. Corrected the misleading "imported successfully with all its data" message.

#### #7 — `reset-password` accepts any logged-in user

- **`src/providers/auth-provider.tsx` + `src/app/reset-password/page.tsx`** — *Issue:* no check for the Supabase `PASSWORD_RECOVERY` event, so any signed-in session could change the password without the old one; no session revoke after reset. *Fix:* added `isPasswordRecovery` state set only on the `PASSWORD_RECOVERY` event (cleared on `SIGNED_OUT`), exposed on context; the reset form is gated behind `isPasswordRecovery` (a normal signed-in session now sees a request-a-link message); `updatePassword` calls `signOut({ scope: 'others' })` after a successful change to revoke other sessions.

#### #8 — Locale-aware CSV parsing corrupts EU-format trend data

- **`src/lib/trend-csv-parser.ts`** — *Issue:* `parseFloat("1,5") === 1`; semicolon-delimited EU exports (Desigo/Bosch/ABB) silently lost decimal portions. *Fix:* added `parseLocaleFloat(raw, decimalSeparator)` (operates only on already-tokenized cells, so an in-cell comma is unambiguously decimal/thousands) and `detectDecimalSeparator(...)` (honors the explicit `eu-locale`/`us-locale`/`iso` selector first, else samples value cells against EU/US regexes accounting for thousands separators). Parser now detects the separator, uses `parseLocaleFloat` in the row loop, pushes a "Detected EU-format decimals" warning, and exposes `detectedDecimalSeparator` on `ParseResult`.
- **`src/components/trend-viewer/csv-preview-dialog.tsx`** — surfaces a `Decimals: EU (comma)` badge when comma decimals are detected.

#### #9 — Anomaly threshold inputs accept NaN/null

- **`src/components/trend-viewer/anomaly-config-sheet.tsx`** — *Issue:* `update()` stored `parseFloat(value)` unconditionally; empty/garbage produced `NaN`/`null` on required fields → `NaN * 60_000 = NaN` → detector silently returned 0 anomalies. *Fix:* verified against `trend-anomaly-engine.ts` that only `outOfRangeMin`/`outOfRangeMax` are nullable; encoded `NULLABLE_KEYS` + a `MIN_VALUES` floor map. `update()` now branches by key — nullable keys accept empty (→`null`) but reject NaN; required keys reject empty/NaN and clamp via `Math.max(min, parsed)`. Added raw-input tracking so an invalid keystroke stays visible with `aria-invalid` error styling + helper text instead of silently snapping back. Extracted a `NumField` sub-component.

#### #10 — CI builds/publishes macOS DMG despite Windows-only policy

- **`.github/workflows/release.yml`** — removed the `macos-latest` matrix entry, the conditional "Add macOS aarch64 target" step, and the macOS row of the release-notes table. Windows build path unaffected; YAML re-validated.
- **`src-tauri/tauri.conf.json`** — deleted the `macOS` bundle block (entitlements / signingIdentity / minimumSystemVersion); Windows bundle config untouched.
- **`src-tauri/entitlements.plist`** — deleted (its only reference was the removed `macOS` block; grep confirmed zero remaining references).

---

## Housekeeping

- `.claude/settings.local.json` — auto-appended read-only command allowlist entries from the fix-team agents (verification commands). Harmless; retained.
- New test file `src/lib/__tests__/trend-csv-parser.test.ts` added (16 cases) covering `parseLocaleFloat`, `detectDecimalSeparator`, and end-to-end EU/US `parseTrendCSV`.

---

## Verification

- **TypeScript:** `npx tsc --noEmit` — clean for all changed files. The only remaining errors are pre-existing `xlsx` module-resolution issues in DXR files (`dxr-export-dialog.tsx`, `dxr/xlsx-parser.ts`), outside this fix scope.
- **Rust:** `cargo check` passes (only a pre-existing unrelated `unused import` warning at `lib.rs:783`).
- **Tests:** `npx vitest run` over sync, db, trend-anomaly, and trend-csv suites — **157 passed**. Updated `field-map.test.ts` (asserts `syncVersion` survives pull) and `sync-manager.test.ts` (mock `resetSyncingItemsToPending` + sweep-microtask flush) accordingly.
- **Lint:** `eslint` clean on all touched files.

### Deferred / out of scope (carried forward)

- CSP hardening in `tauri.conf.json` (#1) — no provably-safe change available; would break static-export hydration or the embedded workspace.
- Server-side `sync_version` auto-increment trigger/RPC (#4) — needs a coordinated schema migration.
- `README.md` still advertises macOS/.dmg availability (#10) — documentation, flagged for the docs owner.
- Full multi-entity share-package import (#6) — not applicable to the current package format; closed via fail-fast warning instead.
