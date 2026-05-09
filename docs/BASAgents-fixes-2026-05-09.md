# BASAgents Fix Log — 2026-05-09

**Team:** BASAgents (5 agents)
**Session type:** Full codebase audit → parallel fix deployment
**Files changed:** 13
**Insertions / Deletions:** 281 / 57

---

## Audit Phase

All 5 BASAgents performed a parallel deep-read of their ownership areas before any fixes were applied.

| Agent | Ownership Area | Files Read |
|---|---|---|
| BAS Tools Engineer | PID, psychrometric, register tool, trend viewer engines | 38 |
| Field Connectivity | Terminal, ping, web interface, network diagram, Tauri Rust | 26 |
| Project Manager | Projects, global projects, reports, docs, KB, search | 50+ |
| Platform Engineer | Auth, sync, Supabase, API routes, payments, settings | 28 |
| Desktop & Build | Tauri, build system, UI shell, PPCL editor, CI/CD | 35+ |

---

## Fixes Applied

### P0 — Critical

#### Build script restoration guaranteed
**File:** `scripts/build-static.js`
**Issue:** API route restoration (`src/app/api → _api_excluded → src/app/api`) occurred after the catch block. An uncaught exception escaping the catch would leave API routes permanently excluded from the source tree.
**Fix:** Moved restore block into `finally` clause — now always runs regardless of how the build fails.

#### Terminal listener leak on connect/disconnect
**File:** `src/app/terminal/page.tsx`
**Issue:** `cleanupListenersMapRef` was populated only after all three `await on*Listener()` calls and the connect call succeeded. A failure mid-sequence left any already-attached Tauri event listeners orphaned, accumulating with each retry.
**Fix:** Progressive `unsubscribers[]` array with inner try/catch. Any listeners attached before a failure are immediately torn down. Cleanup map entry is only registered on full success.

#### Approval enforcement
**File:** `src/components/layout/app-shell.tsx`
**Verdict:** Already correctly implemented at lines 44–48. The audit flag was a false positive — `profile.approved === false` redirects to `/pending-approval` and the spinner holds until `profile` loads. No change needed.

---

### P1 — High Priority

#### Stripe Billing Portal route — Bearer token auth
**File:** `src/app/api/subscribe/portal/route.ts`
**Issue:** No authentication check. Any caller possessing a valid Stripe customer ID could generate a Billing Portal session for that customer.
**Fix:** Added full auth chain modeled on `account/delete/route.ts`: extract `Authorization: Bearer` header → `getUser()` via Supabase anon client → fetch profile row → compare `profiles.stripe_customer_id` to the body-supplied ID → 401/403 on mismatch.

#### Telnet connect — no timeout
**File:** `src/lib/tauri-bridge.ts`
**Issue:** `nativeTelnetConnect()` had no timeout parameter. Unreachable hosts caused the UI to display "Connecting…" for 30–60 s (OS TCP timeout).
**Fix:** Added optional `timeoutMs` parameter (default `10000`) threaded through to the Rust `telnet_connect` invoke. All existing 3-arg callers are unaffected.

#### PID tuning calculators — input validation
**File:** `src/lib/pid-tuning-engine.ts`
**Issue:** `calculateZNUltimate`, `calculateZNStep`, and `calculateCohenCoon` silently produced `NaN`/`Infinity` when inputs were zero or negative (division by zero).
**Fix:** Guard at the top of each function returning `[]` on non-positive inputs. The UI already handles empty result arrays by rendering nothing, so no UI changes needed.

#### Psychrometric bisection — out-of-range inputs
**File:** `src/lib/psychrometric-engine.ts`
**Issue:** `dewPointFromW` bisection assumed `pw ≤ pws(200°F)`. Out-of-range humidity ratios broke the bracket assumption and returned a bogus midpoint (~60°F). `wetBulbFromW` similarly failed when `W ≥ Ws_db`.
**Fix:**
- `dewPointFromW`: caps `pw` at `pws(200°F)` and returns `200` immediately on saturation.
- `wetBulbFromW`: short-circuits to `T_db_F` when `W ≥ Ws_db` (physically saturated air).
- Both 0.03 lb/lb clamp sites in `humidityRatioFromRH` and `humidityRatioFromDewPoint` now emit `console.warn` with the clamped value.
- All 102 existing tests pass with no changes to the test suite.

---

### P2 — Medium Priority

#### CI/CD — macOS build added to matrix
**File:** `.github/workflows/release.yml`
**Issue:** Release workflow was Windows-only (`windows-latest`). macOS users received no native desktop build.
**Fix:** Converted single job to `strategy.matrix` with two entries: `windows-latest` (empty args) and `macos-latest` (`--target aarch64-apple-darwin`). Added conditional `rustup target add aarch64-apple-darwin` step that runs only on macOS. Updated release notes table to include macOS row.

#### Tauri CSP — missing Stripe domains
**File:** `src-tauri/tauri.conf.json`
**Issue:** Tauri CSP lacked `https://api.stripe.com` in `connect-src` and Stripe checkout domains in `frame-src`. Stripe payment flows silently failed on desktop.
**Fix:** Added `https://api.stripe.com` to `connect-src`. Added `https://*.stripe.com https://checkout.stripe.com` to `frame-src`.

#### PPCL editor — duplicate line number detection
**File:** `src/app/ppcl-editor/page.tsx`
**Issue:** PPCL programs with duplicate line numbers (e.g. two `100 ...` lines) compiled silently — no user feedback on a common authoring error.
**Fix:** Added `findDuplicatePpclLineNumbers()` helper at module scope. Called on every Cmd+S save; fires `toast.warning('Duplicate line numbers: N, N, ...')` after a successful save without blocking it. Wired to explicit save only (not debounced auto-save) to avoid keystroke spam.

---

### P3 — Low Priority

#### Global project delete — cascade soft-delete
**File:** `src/lib/global-projects/api.ts`
**Issue:** Soft-deleting a global project (`deleted_at = now()`) did not cascade to child records in `global_field_notes`, `global_devices`, `global_ip_plan`, `global_daily_reports`, `global_project_files`. Child rows were orphaned with `deleted_at = null`.
**Fix:** After the parent project soft-delete, iterate all five child tables and set `deleted_at = now()` for any row matching `global_project_id`. Child failures log via `console.warn` but do not fail the operation (parent is already deleted).

#### IndexedDB blob cache — LRU eviction
**File:** `src/lib/db.ts`
**Issue:** `saveFileBlob` wrote new blobs without checking storage quota. Over time, the cache could exhaust available storage without warning.
**Fix:** Added `evictOldBlobsIfNeeded()` helper called at the start of each `saveFileBlob`. Uses `navigator.storage.estimate()` to detect >80% quota usage; evicts the oldest `max(5, 10% of blobs)` entries sorted by `cachedAt`. No-op on browsers lacking the Storage API. Note: `fileBlobs` has no `by-cached-at` index — eviction uses in-memory sort. A future DB version bump could add the index for O(1) eviction.

#### ANSI parser — 256-color and true-color support
**File:** `src/lib/hmi/ansi-parser.ts`
**Issue:** `applySgrParam` handled only basic 16-color codes (30–37, 90–97, 40–47). BAS controllers emitting `ESC[38;5;Nm` (256-color) or `ESC[38;2;R;G;Bm` (true-color) sequences were silently stripped.
**Fix:** Added `color256ToCss()` helper covering all three 256-color palette regions (standard 0–15, 6×6×6 cube 16–231, grayscale 232–255). Refactored SGR param processing from `for...of` to index-based loop; detects `38`/`48` and consumes the appropriate follow-on params (3 for 256-color, 5 for true-color).

---

## Housekeeping

- Deleted `.next/types/routes.d 2.ts` — stale iCloud/Dropbox conflict copy polluting `tsc` output.

---

## Verification

| Check | Result |
|---|---|
| `vitest run` (psychrometric + PID) | 102 / 102 pass |
| `tsc --noEmit` (modified files) | 0 errors |
| `npm run lint` (modified files) | 0 new errors |
