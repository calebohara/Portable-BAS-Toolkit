# ReviewAgents Findings — 2026-05-20

**Mode:** Read-only audit (no code was modified)
**Date:** 2026-05-20
**Agents:** 6 (5 area reviewers + 1 cross-cutting pattern auditor)
**Files reviewed:** ~265 TS/TSX + Rust + SQL + configs + workflows
**LOC reviewed:** ~70,000+

This is the index / consolidated view. Detailed per-slice findings are in:

- [docs/ReviewAgents-findings-2026-05-20-tools.md](./ReviewAgents-findings-2026-05-20-tools.md) — BAS Tools (28 findings)
- [docs/ReviewAgents-findings-2026-05-20-connectivity.md](./ReviewAgents-findings-2026-05-20-connectivity.md) — Field Connectivity (29 findings)
- [docs/ReviewAgents-findings-2026-05-20-projects.md](./ReviewAgents-findings-2026-05-20-projects.md) — Projects & Knowledge (37 findings)
- [docs/ReviewAgents-findings-2026-05-20-platform.md](./ReviewAgents-findings-2026-05-20-platform.md) — Platform & Sync (30 findings)
- [docs/ReviewAgents-findings-2026-05-20-shell.md](./ReviewAgents-findings-2026-05-20-shell.md) — Desktop, UI & Build (32 findings)
- [docs/ReviewAgents-findings-2026-05-20-cross-cutting.md](./ReviewAgents-findings-2026-05-20-cross-cutting.md) — Cross-cutting clusters + pattern drift + agent-config hygiene

---

## Executive Summary

| Priority | Raw count | After cross-cutting de-dup | Top theme |
|----------|-----------|----------------------------|-----------|
| P0 | 17 | 15 | Data-loss-class IDB transaction bugs in cascade/count paths; sync queue stuck-state; silent data loss in global-project edit/cleanup; LAN-to-host security chain via `proxy_fetch`+iframe srcDoc |
| P1 | 43 | ~38 | Realtime subscription leaks/races; tool inputs accepting NaN; storage blobs orphaned on delete; Tailwind v4 arbitrary-value pitfalls in dialogs |
| P2 | 43 | ~36 | Hook-shape drift between `useGlobalProject*` hooks; camelCase/snake_case mapping inconsistencies; `SyncEntityType` gaps in `field-map.ts`; Project↔GlobalProject type drift |
| P3 | 53 | ~46 | Dead UI exports (4+ unused shadcn primitives); 10–11 unused npm dependencies; unwired scripts (`scripts/post-static-build.sh`, `scripts/generate-icons.mjs`); stale TODOs |

**Bottom line:** The codebase ships and works, but there are **15 P0 issues that range from "silent data loss for any user on a slower clock" to "any rogue BAS controller on the field LAN can fully compromise the desktop app."** The Platform/Sync slice is the highest concentration (6 P0s) — exactly where the user-stated reliability requirement matters most.

---

## Top 10 issues by impact

1. **Cluster 1 — `proxy_fetch` + iframe srcDoc security chain (P0).** Three contributing P0s collapse into one root cause: a rogue/MITM'd BAS controller can execute arbitrary code in the BAU Suite desktop app's origin, with full read/write to IndexedDB, Supabase tokens, and the `__TAURI_INTERNALS__` invoke channel. Mitigations must ship together. (Connectivity ×2, Shell ×1.)
2. **Cluster 2 — Cascade-delete table-list drift + IDB transaction unsafety (P0).** `cascadeDeleteProject`, `cascadeDeleteGlobalProject`, and the `data-cleanup-dialog` hand-rolled table list all disagree about which child tables exist. Plus the cascades hold one IDB transaction across many awaits, so the transaction auto-closes mid-cascade and leaves orphan rows + storage blobs forever.
3. **Sync queue items stuck in `'syncing'` after a crash (P0).** Row flips to `'syncing'` before the network call; if the tab dies, `getPendingSyncItems` never picks it up again. Silent data loss class, user sees "0 pending."
4. **No tie-break for equal `updated_at`; `sync_version` column unused (P0).** Strict `>` comparison + ms-level timestamps + ~30s client-clock skew = the slower-clock device loses writes silently. Schema carries a `sync_version` column explicitly for this; `field-map.ts` strips it on both push and pull.
5. **`updateGlobalProject` silently drops 5 fields (P0).** `customerName`, `technicianNotes`, `panelRosterSummary`, `networkSummary`, `contacts` are not in the function's allowlisted columns. The EditProjectDialog passes them, gets a success toast, the Supabase row never changes.
6. **Import-project dialog handles 4 of 15 entity types (P0).** Sharing a project package built by a teammate silently discards files, reports, DXRs, PPCL, terminal logs, diagrams, etc. on import. No warning.
7. **`reset-password` page lets any signed-in user reset the password (P0).** No check for the Supabase `PASSWORD_RECOVERY` event. Combined with `detectSessionInUrl: true` and no cross-session revoke after reset, this is a long-lived-token escalation hazard.
8. **Locale-aware CSV parsing silently corrupts EU-format trend data (P0).** `parseFloat("1,5") === 1`. Every cell from a Desigo/Bosch/ABB EU-locale export silently loses the decimal portion. Anomalies, stats, and PDF exports all wrong.
9. **Anomaly threshold inputs accept NaN/null and silently break detection (P0).** Six threshold fields typed as `number` accept empty/garbage → `NaN * 60_000 = NaN` → detector returns "0 anomalies" silently. A field engineer chasing a hunting loop will believe nothing is wrong.
10. **CI builds and publishes macOS DMG installers (P0).** Despite the documented Windows-only release policy, `.github/workflows/release.yml` matrices `macos-latest` and the release notes promise a `.dmg`. Doubles CI minutes; risks unsupported artifact in users' hands.

---

## All P0 findings (inlined)

P0 = data loss / crash / security. **15 distinct items after cross-cutting de-dup.** Listed in the suggested order of remediation (security chain first, then data-loss, then misc).

### Security chain — fix together

#### 1. `proxy_fetch` + iframe `srcDoc` LAN-to-host compromise *(Cluster 1)*
- **Locations:**
  - `src/components/web-interface/embedded-workspace.tsx:239-245` — srcDoc iframe with `allow-same-origin allow-scripts`
  - `src-tauri/src/lib.rs:703-714` — `is_private_network` string-prefix gate (bypassable by `10.attacker.example`, `127.evil.tld`, etc.)
  - `src-tauri/src/lib.rs:716-775` — `proxy_fetch` with `danger_accept_invalid_certs(true)` and default 10-redirect follow
  - `tauri.conf.json:26` — wildcard `frame-src 'self' blob: http: https:`
- **Owner agents:** Field Connectivity (×2 P0) + Shell (×1 P0); collapsed by Cross-Cutting Pattern Auditor.
- **Root cause:** A controller-supplied HTML body is rendered into a sandbox that inherits the host origin (`srcDoc` + `allow-same-origin` + `allow-scripts`), and the Rust proxy that fetches it has TLS validation off and a hostname-rather-than-IP private-network gate. The combination is a complete SSRF + RCE primitive triggerable by any rogue or MITM'd device on the field LAN.
- **Coordinated fix:**
  1. Drop `allow-same-origin` from the srcDoc iframe (or load via `blob:` URL so the iframe gets an opaque origin).
  2. Rewrite `is_private_network` to parse into an `IpAddr` and only accept literal private IPv4/IPv6 addresses; reject hostnames outright.
  3. Set `redirect::Policy::none()` (or `limited(0)`) on the reqwest client.
  4. Re-enable cert validation by default; add a per-host "trust this self-signed cert" pin flow when the user explicitly opts in.
  5. Tighten the parent CSP `script-src` to remove `'unsafe-inline'` as soon as feasible.
- **Handoff to:** Field Connectivity + Desktop & Build (must coordinate).

#### 2. `reset-password` accepts any logged-in user
- **Location:** `src/app/reset-password/page.tsx:60-83`, `src/providers/auth-provider.tsx:121-128`
- **Owner agent:** Platform & Sync Reviewer.
- **Why it's a bug:** No check for the `PASSWORD_RECOVERY` Supabase auth event; `detectSessionInUrl: true` means any signed-in session can hit the form. After reset, no `signOut({ scope: 'others' })` to revoke other sessions. A bad actor with momentary access to a logged-in browser can silently change the password without knowing the old one.
- **Suggested fix:** Listen for `PASSWORD_RECOVERY` in `onAuthStateChange`, gate the form behind a `recoverySession === true` flag, and call `signOut({ scope: 'others' })` after successful update.
- **Handoff to:** Platform Engineer.

#### 3. Telnet IAC parser drops/corrupts bytes that straddle a read boundary
- **Location:** `src-tauri/src/lib.rs:194-265` (`process_telnet_bytes`) called from `336-369`.
- **Owner agent:** Field Connectivity Reviewer.
- **Why it's a bug:** No residue buffer across TCP read boundaries. A read ending mid-IAC pushes `0xFF` literally OR silently discards the partial sequence — corrupting commissioning logs (data-integrity, since logs are attached to projects as evidence) and drifting the negotiated terminal options from the server's view.
- **Suggested fix:** Stash incomplete IAC bytes (bare `IAC`, `IAC WILL/WONT/DO/DONT` awaiting option byte, `IAC SB ...` awaiting `IAC SE`) in a per-session residue `Vec<u8>`; prepend on next read. Add regression test feeding bytes one at a time.
- **Handoff to:** Field Connectivity.

### Data loss class — fix next

#### 4. IDB cross-`await` in `getAllProjectEntityCounts`
- **Location:** `src/lib/db.ts:1524-1539`
- **Owner agent:** Platform & Sync Reviewer.
- **Why it's a bug:** Holds one read-only transaction across `await Promise.all` inside a `for` loop. After the first iteration's await, the transaction auto-closes; the second iteration throws `InvalidStateError`. Dashboard counts will be wrong for the 2nd+ project on every multi-project user.
- **Suggested fix:** Fan out all `3*N` count requests in a single Promise.all without any awaits between them, or open a fresh transaction per project.
- **Handoff to:** Platform Engineer.

#### 5. IDB cross-`await` in cascade-delete paths *(part of Cluster 2)*
- **Location:** `src/lib/db.ts:661-741` (`cascadeDeleteProject`), `src/lib/db.ts:751-840` (`cascadeDeleteGlobalProject`)
- **Owner agent:** Platform & Sync Reviewer.
- **Why it's a bug:** One `readwrite` transaction over 17 stores, with many sequential awaits inside. The tx auto-closes partway through; the parent `projects` row gets deleted first, then the cascade throws halfway and leaves orphan rows + storage blobs. The pull-side cascade was fixed in commit `ae86767`; the local-side cascade is still vulnerable.
- **Suggested fix:** Gather child IDs in separate read transactions, then in one final `readwrite` transaction synchronously enqueue all deletes without awaiting between requests, awaiting only `tx.done` at the end.
- **Handoff to:** Platform Engineer.

#### 6. Sync queue items stuck in `'syncing'` are never retried
- **Location:** `src/lib/sync/sync-manager.ts:230` + `src/lib/db.ts:1417-1421`
- **Owner agent:** Platform & Sync Reviewer.
- **Why it's a bug:** Row flips to `status: 'syncing'` before the network call. If the process dies mid-call, `getPendingSyncItems` never picks it up (it filters by `'pending'`). User sees "0 pending" in Settings and trusts everything synced — silent data loss.
- **Suggested fix:** On `SyncManager.start()`, sweep every `'syncing'` row back to `'pending'`. Alternatively, pick up `'syncing'` rows older than ~1 minute.
- **Handoff to:** Platform Engineer.

#### 7. No tie-break for equal `updated_at`; `sync_version` column unused
- **Location:** `src/lib/sync/sync-manager.ts:305`, `src/lib/sync/field-map.ts:797`
- **Owner agent:** Platform & Sync Reviewer.
- **Why it's a bug:** Strict `>` comparison + ms-granular timestamps + arbitrary client-clock skew = the slower-clock device silently loses writes. Schema has `sync_version int default 1` columns explicitly intended as the tiebreaker; `field-map.ts` strips them on both push and pull.
- **Suggested fix (option A):** Use `sync_version` as the canonical conflict key with a server-side `WHERE sync_version = $local` clause; trigger increments on success.
- **Suggested fix (option B):** Change `>` to `>=` so equal-ms rows raise a conflict, and refuse pushes from clients whose clock differs from `select now()` by more than a threshold.
- **Handoff to:** Platform Engineer + Schema (RPC + trigger work).

#### 8. `data-cleanup-dialog` hard-deletes bypassing the queue and misses 4–7 child tables *(part of Cluster 2)*
- **Location:** `src/components/settings/data-cleanup-dialog.tsx:19-24, 86-104`
- **Owner agent:** Platform & Sync Reviewer.
- **Why it's a bug:** Hand-rolled `SUPABASE_PROJECT_CHILD_TABLES` lists 12 tables; the actual schema has 16+. PID, PPCL, Psych, Trend, DXR rows either FK-violate the parent delete or orphan silently after cascade.
- **Suggested fix:** Either (a) call a new server-side RPC that does the cascade in one transaction, or (b) derive the table list at runtime from `SYNC_ORDER` filtered by `REQUIRES_PROJECT_ID` so it can never drift from `field-map.ts`. Best: route through SyncManager's soft-delete path.
- **Handoff to:** Platform Engineer.

#### 9. `updateGlobalProject` silently drops 5 user-editable fields
- **Location:** `src/lib/global-projects/api.ts:280-310`
- **Owner agent:** Projects & Knowledge Reviewer.
- **Why it's a bug:** `data: Partial<Pick<...>>` only allows 8 columns. Edits to `customerName`, `technicianNotes`, `panelRosterSummary`, `networkSummary`, `contacts` from EditProjectDialog and inline-edit cards (`client-page.tsx:469, 774, 846`) get a "Project updated" toast — Supabase row never changes.
- **Suggested fix:** Rewrite on top of the generic `updateEntity` helper (`api.ts:99`) which already does camelCase→snake_case auto-conversion; widen the type. Add an end-to-end test that round-trips a full project update.
- **Handoff to:** Project Manager (Hooks & API).

#### 10. Import-project dialog silently drops 11+ entity types
- **Location:** `src/components/share/import-project-dialog.tsx:11,135-200`
- **Owner agent:** Projects & Knowledge Reviewer.
- **Why it's a bug:** Dialog only knows about `project + notes + devices + ipPlan`. `RECONCILED_ENTITY_PAIRS` in `reconcile.ts:126-142` covers 15 entity types. Files, reports, diagrams, PPCL, DXRs, terminal logs, connection profiles, sessions all silently discarded on import; preview shows "0 files (metadata only)" without warning the user.
- **Suggested fix:** Reuse the reconcile mapper layer as the canonical import path — extract per-entity mappers into a shared module. Alternatively, fail-fast if the package contains data not in the import dialog's whitelist.
- **Handoff to:** Project Manager.

#### 11. `cascadeDeleteGlobalProject` orphans every Supabase Storage blob
- **Location:** `src/lib/db.ts:751-840` + `src/lib/global-projects/api.ts:312-372` + `src/lib/storage.ts:138-147` (`deleteFromStorage` exported but zero callers)
- **Owner agent:** Projects & Knowledge Reviewer.
- **Why it's a bug:** Soft-deletes the row, never calls `deleteFromStorage(storagePath)`. Every uploaded file, daily-report attachment, and KB attachment leaks into the `project-files` bucket forever — with valid public URLs. Privacy + quota leak.
- **Suggested fix:** Before flipping `deleted_at`, batch-collect every `storage_path` (files + `attachments[].storagePath` in daily reports + KB) and best-effort `remove([...paths])` via the Supabase storage API.
- **Handoff to:** Project Manager.

#### 12. `FieldNote.author` permanently rewritten to a UUID on global→local round-trip
- **Location:** `src/lib/global-projects/reconcile.ts:653-668` (`mapGlobalNoteToLocal`)
- **Owner agent:** Projects & Knowledge Reviewer.
- **Why it's a bug:** Global rows store `createdBy` as a Supabase UUID. On the way back, the local `FieldNote.author` (free-text display name) gets the UUID string. Author filtering (`field-notes-view.tsx:51`) silently breaks; UI shows raw UUIDs as author names.
- **Suggested fix:** Either add an `author` column to `global_field_notes`, or on global→local convert prefer the existing `localNote.author` if a row already exists.
- **Handoff to:** Project Manager + Schema.

#### 13. Locale-aware CSV parsing corrupts EU-format trend data
- **Location:** `src/lib/trend-csv-parser.ts:298`
- **Owner agent:** BAS Tools Reviewer.
- **Why it's a bug:** `parseFloat("1,5") === 1`. EU exports (Desigo, Bosch, ABB) silently lose decimal portions; anomalies, stats, exports all wrong.
- **Suggested fix:** Sample columns for `\d+,\d+` pattern; swap separators before `parseFloat`. Surface a "Detected EU decimals" warning. Tie to the existing `timestampFormat: 'eu-locale'` selector.
- **Handoff to:** BAS Tools Engineer.

#### 14. Anomaly threshold inputs accept NaN/null and silently break detection
- **Location:** `src/components/trend-viewer/anomaly-config-sheet.tsx:18-21`
- **Owner agent:** BAS Tools Reviewer.
- **Why it's a bug:** Six threshold fields typed as `number` accept empty/garbage → `NaN * 60_000 = NaN` → detector returns "0 anomalies" with no warning. A field engineer chasing a hunting loop will believe nothing is wrong.
- **Suggested fix:** Branch `update()` by key — nullable keys accept null, the rest clamp to a sensible minimum and reject NaN. Add input-level visual error state.
- **Handoff to:** BAS Tools Engineer.

### Process / build

#### 15. CI builds and publishes macOS DMG installers despite Windows-only policy
- **Location:** `.github/workflows/release.yml:13-21,33-36,66`, `src-tauri/tauri.conf.json:48-51`, `src-tauri/entitlements.plist`
- **Owner agent:** Desktop, UI & Build Reviewer.
- **Why it's a bug:** CLAUDE.md memory explicitly states "Desktop releases are Windows-only, never macOS." Workflow matrices `macos-latest` and the release notes promise a `.dmg`. Doubles CI minutes; ships unsupported artifact.
- **Suggested fix:** Drop the `macos-latest` matrix entry, the conditional `Add macOS aarch64 target` step, and the macOS line of the release notes table. Either delete `entitlements.plist` + the `macOS` block from `tauri.conf.json`, or leave them dormant with a comment.
- **Handoff to:** Desktop & Build.

---

## Cross-cutting clusters (full text in [cross-cutting findings file](./ReviewAgents-findings-2026-05-20-cross-cutting.md))

| # | Cluster | Contributors | Priority |
|---|---------|--------------|----------|
| 1 | `proxy_fetch` + iframe srcDoc security chain | Connectivity P0×2, Shell P0×1 | **P0** — inlined above as item #1 |
| 2 | `data-cleanup-dialog` + cascade-delete table-list drift | Platform P0×2, Projects P0×1 | **P0** — inlined above as items #5, #8, #11 |
| 3 | Direct-Supabase writes bypassing the SyncManager queue | Platform + Connectivity + Projects | **P1** — entire `global-projects/api.ts` pipeline writes outside the queue; either fold it in or document the rule |
| 4 | Local↔Global type drift (many fields, two type definitions) | Projects P0 + Projects P2 + SyncAgents-plan doc | **P1** — already causing #9 (silent field drop); architectural root cause of future bugs |
| 5 | Tauri ↔ TS argument-name drift | Connectivity P2, Shell P1 | **P2** — e.g. `nativeTelnetConnect` sends `timeoutMs` which Rust ignores |
| 6 | Saved-session dialogs not properly attached to projects | Tools P1 ×N | **P1** — sessions saved outside the project context lose discoverability |
| 7 | Realtime channel name reuse / cleanup races | Platform P1 + Projects P1 | **P1** — stale presence, missed live updates after invite; two-line fix per call site |
| 8 | Unused/dead transports + dead exports + unwired scripts | Shell P3 + Connectivity P2 + Projects P3 + Platform P3 | **P3** — ~500 LOC of dead UI exports, 10–11 unused npm deps, 2 unwired scripts |

### Notable pattern-drift findings (Section B in cross-cutting file)

- **`SyncEntityType` ↔ `field-map.ts` coverage table** has documented gaps — see Section B table.
- **`Project` vs `GlobalProject` type drift** — full side-by-side field table in Section B; root cause of P0 item #9.
- **Hook shape drift** — `useGlobalProject*` hooks return inconsistent shapes (some return `{data, setData}`, others `{data, actions}`, some just `data`).
- **camelCase ↔ snake_case mapping** — bespoke per-call code in many places instead of going through `field-map.ts`.

### Agent-config and docs hygiene (Section C in cross-cutting file)

- **`CLAUDE.md` references three missing team files:** `.claude/DxrAgents.md`, `.claude/SyncErrorAgents.md`, `.claude/SyncAuditAgents.md`. Process documented in CLAUDE.md cannot be followed for those teams. (P3)
- **Unused npm dependencies (10–11 confirmed):** `@codemirror/lang-{cpp,css,html,javascript,json,markdown,python,xml}`, `@uiw/codemirror-extensions-basic-setup`, `cmdk` (only imported by dead `command.tsx`), `next-themes` (replaced by custom ThemeProvider), `@tauri-apps/plugin-notification` (no frontend invocations — verify Rust side). Net savings ~50MB+ of `node_modules`. (P3)
- **Doc rot:** several `docs/*-plan-*.md` files describe work that has shipped; consider archiving.

---

## P1 / P2 / P3 — see per-slice files

The master doc keeps only P0s inline to stay scannable. For P1/P2/P3 details, open the per-slice files linked at the top of this doc.

**P1 themes worth knowing:**
- Realtime subscription leaks/races (Platform + Projects)
- Terminal sessions leak Rust-side connections on page unmount (Connectivity)
- Settings "Manage Subscription" button always 403s — sends empty `stripeCustomerId` (Platform)
- 401 token-expired errors treated as permanent failures (Platform)
- Tailwind v4 `[Nvh]` arbitrary values in `src/components/ui/dialog.tsx:61` and 3 other dialogs — silently drops max-height if they don't compile (Shell)
- Coil-load Heating/Cooling label inverted in psychrometric panel (Tools)
- `binary runtimeHours` broken and the test pins the broken behavior (Tools — fix is blocked by the test)

**P2 themes worth knowing:**
- Hook return-shape drift between `useGlobalProject*` siblings
- `ROUTES` constant in `src/lib/routes.ts` is dead code AND drifts from the sidebar (missing `TREND_VIEWER`)
- Two parallel `ErrorBoundary` classes with overlapping responsibility
- HMI transport classes drifted from the store enum (two unused classes)

**P3 themes worth knowing:**
- `src/components/ui/{command,popover,scroll-area,input-group}.tsx` — zero importers, ~500 LOC
- `scripts/post-static-build.sh` not wired to any npm lifecycle
- `scripts/generate-icons.mjs` has no npm script entry
- PWA `CACHE_VERSION = 'bau-suite-v6'` hand-maintained while app version is `4.9.1` — automate from `package.json`
- `lib.rs:837` SPA-fallback JS checks for non-existent `#__next` element → triggers on every dynamic-route navigation

---

## Out of scope / deferred

ReviewAgents did not assess:

- **Test coverage gaps in absolute terms.** Some findings (e.g. the `binary runtimeHours` test that pins broken behavior) name specific tests that should change, but no agent ran the suite or measured coverage.
- **Performance profiling.** No agent measured actual render counts, bundle size, or query latency. Findings about memoization, list virtualization, etc. are based on code patterns, not profiling data.
- **Accessibility audit.** ARIA labels, keyboard navigation, screen-reader behavior, color contrast — not in scope of this round.
- **Supabase migration ordering against the live database.** Migrations were read for shape, not replayed against a staging DB.
- **End-user UI flows.** No agent opened the app in a browser; everything is static analysis.

---

## Next steps

1. **You review this doc** and pick which findings to remediate (and at what priority).
2. **Dispatch a fix team** — typically BASAgents — to apply the approved fixes. Per CLAUDE.md, that team will create `docs/BASAgents-fixes-2026-05-DD.md` and reference this findings doc as the source.
3. **Suggested order of remediation:**
   - **First commit:** Cluster 1 fixes (security chain) — must ship together to be effective.
   - **Second commit:** P0 items #4–#8 (IDB transactions + sync queue + sync_version + cascade table drift) — all in `db.ts` / `sync-manager.ts` / `field-map.ts`, single coherent diff.
   - **Third commit:** P0 items #9–#12 (global-project edit/import/cascade/author) — single concern area, can be one PR.
   - **Fourth commit:** Tools P0s (#13, #14) — small, isolated, easy wins.
   - **Fifth commit:** CI macOS removal (#15) — single workflow file.
   - **Then:** the P1 batch, then P2 consistency sweep, then P3 bloat removal (the dead-code + unused-deps removal is one large but very safe commit).
4. **Consider creating the missing agent files** referenced by CLAUDE.md (`DxrAgents.md`, `SyncErrorAgents.md`, `SyncAuditAgents.md`) or removing those rules from CLAUDE.md if those teams aren't real.
