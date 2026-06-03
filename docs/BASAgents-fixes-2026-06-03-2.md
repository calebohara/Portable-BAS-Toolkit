# BASAgents Fixes — 2026-06-03 (session 2)

**Source findings doc:** [docs/ReviewAgents-findings-2026-05-20.md](./ReviewAgents-findings-2026-05-20.md)
**Predecessor log:** [docs/BASAgents-fixes-2026-06-03.md](./BASAgents-fixes-2026-06-03.md) (top 10 by impact)
**Scope:** the **remaining 5 outstanding P0 work items** — the 3 P0 findings left fully untouched by session 1, plus the 2 sub-items session 1 deliberately deferred.

## Header block

| Field | Value |
|-------|-------|
| Date | 2026-06-03 (2nd session) |
| Agents | 4 (Field Connectivity, Project Manager, Platform Engineer, Desktop & Build) |
| Findings remediated | #3, #11, #12 (untouched) + #1-CSP & #4/#7-server-side (deferred → closed) |
| Files changed | 6 (+1 new migration) |
| Insertions / deletions | ~426 / ~42 |
| TypeScript | Clean for changed files (only pre-existing `xlsx`/DXR module errors remain) |
| Rust | `cargo test --lib` 6/6 pass; `cargo check` clean (1 pre-existing unrelated warning) |
| JS tests | 345 passed; 1 pre-existing failure (`reconcile.test.ts`, see Verification) |

After this session, **all 15 numbered P0 findings are closed** (implemented or formally accepted-risk).

---

## Audit Phase

Same findings doc as session 1. This session dispatched 4 BASAgents fix-team agents, partitioned by file ownership (no two agents touched the same file).

| Agent | Item(s) | Files touched |
|-------|---------|---------------|
| Field Connectivity | #3 Telnet IAC residue buffer | `src-tauri/src/lib.rs` (telnet only) |
| Project Manager | #11 Storage-blob orphan cleanup; #12 FieldNote author UUID | `src/lib/global-projects/api.ts`, `src/lib/storage.ts`, `src/lib/global-projects/reconcile.ts` |
| Platform Engineer | #4/#7 server-side `sync_version` auto-increment | `supabase/migrations/add-sync-version-auto-increment.sql` (new) |
| Desktop & Build | #1 CSP hardening (deferred portion) | `src-tauri/tauri.conf.json` |

---

## Fixes Applied (all P0)

### #3 — Telnet IAC parser drops/corrupts bytes that straddle a read boundary

- **`src-tauri/src/lib.rs` `process_telnet_bytes` + telnet read loop** — *Issue:* no residue buffer across TCP read boundaries; a read ending mid-IAC sequence either emitted a lone `0xFF` literally or silently discarded the partial command, corrupting commissioning logs (project evidence) and drifting negotiated terminal options. *Fix:* threaded a per-session `residue: Vec<u8>` through `process_telnet_bytes(buf, n, &mut residue)`. Added a `telnet_incomplete_tail()` helper that detects a trailing incomplete sequence (bare `IAC`; `IAC WILL/WONT/DO/DONT` awaiting its option byte; `IAC SB …` awaiting `IAC SE`) and carries those bytes into the next read; the parse loop now only runs over a complete-boundary slice. `IAC IAC` is handled as an escaped literal `0xFF` (emits one `0xFF`, does not start a new command), correct across boundaries. *Test:* added a `#[cfg(test)]` module (6 tests) that feeds known sequences (`IAC DO`, `IAC WILL`, an `IAC SB … IAC SE` block with a decoy `0xF0`, escaped `IAC IAC`, a mixed login stream, a bare-trailing-`IAC` carry-over) **one byte per call** and asserts the reassembled output equals the all-at-once result.

### #11 — `cascadeDeleteGlobalProject` orphans every Supabase Storage blob

- **`src/lib/storage.ts`** — *Issue:* no batched delete helper existed; `deleteFromStorage` had zero callers. *Fix:* added `deleteManyFromStorage(paths)` — filters falsy paths and issues a single `.remove([...])` round-trip.
- **`src/lib/global-projects/api.ts` `deleteGlobalProject`** — *Issue:* soft-deleted parent + child rows but never removed blobs from the `project-files` bucket; every file/daily-report attachment leaked forever with live public URLs (privacy + quota). *Fix:* before flipping `deleted_at`, collects every project-scoped storage path (`global_project_files.storage_path`, `global_daily_reports.attachments[].storagePath`) and, after the parent soft-delete, calls `deleteManyFromStorage(...)` best-effort (failures `console.warn` but never block deletion).
- **`src/lib/db.ts`** — *No change needed (verified):* the global IDB cascade operates on Supabase-path-based mirror stores (no local `fileBlobs`); local blobs are already handled by `cascadeDeleteProject`. The session-1 transaction-safe cascade structure is untouched.
- **Scope decision:** Knowledge-Base attachments are org-wide (`kb_articles`/`kb_categories` carry no `globalProjectId`) and are intentionally excluded from a per-project delete (documented in a code comment).

### #12 — `FieldNote.author` permanently rewritten to a UUID on global→local round-trip

- **`src/lib/global-projects/reconcile.ts` `mapGlobalNoteToLocal`** — *Issue:* assigned the Supabase `createdBy` UUID into the free-text display-name field `FieldNote.author`, breaking author filtering (`field-notes-view.tsx:52`) and showing raw UUIDs as names. *Fix (Option A + member-name fallback; no migration):* added `resolveNoteAuthor()` with resolution order — (1) existing local note's `author` (preserves the human name on round-trip), (2) `created_by` resolved against `profiles.display_name` (for notes authored on another device with no local row), (3) `"Unknown"` (never a UUID). Added `buildNoteAuthorContext()` (batched note-id→author map + one `profiles` query for UUID→display-name) threaded only through the `notes` reconcile pair; all other pairs unaffected. Filtering verified to still work (`author` is now always a non-empty display name).
- *Deferral:* a note authored on another device whose author has no `profiles.display_name` resolves to `"Unknown"`. A future `author` column on `global_field_notes` would close that last gap losslessly; not needed to satisfy the finding's bar (no UUID).

### #4 / #7 (server-side) — `sync_version` auto-increment (completes session-1's deferral)

- **`supabase/migrations/add-sync-version-auto-increment.sql` (new)** — *Context:* session 1 shipped the JS-side tiebreak (`field-map.ts` round-trips `sync_version`; `sync-manager.ts` uses it on equal-ms `updated_at`) but deferred the authoritative server-side increment. *Fix:* one reusable `bump_sync_version()` plpgsql function (`NEW.sync_version = OLD.sync_version + 1`, mirroring the shared `set_updated_at()` pattern) attached via a `BEFORE UPDATE` trigger to all **41 tables** that carry a `sync_version` column (23 local + 18 global), through an idempotent `DO $$ … foreach … drop trigger if exists; create trigger …` loop guarded by an `information_schema.columns` existence check, ending with `notify pgrst, 'reload schema'`. *Client interaction (verified):* the client strips `syncVersion` on push (`LOCAL_ONLY_FIELDS`), so the trigger owns the column with no contention; pull keeps it for the JS tiebreak. *Excluded (no column, intentional):* `global_activity_log` (append-only), `global_project_preferences` (per-user composite-PK state).
- *Deferred enhancement:* an optimistic `WHERE sync_version = $expected` rejecting guard — there's no existing version-aware update RPC to extend (push goes through PostgREST upserts), so adding it would mean inventing a new RPC surface, out of scope this pass. The JS equal-ms tiebreak already surfaces a user-resolvable conflict; this migration just makes its input monotonic and reliable.

### #1 (CSP sub-item) — parent CSP hardening (completes session-1's deferral)

- **`src-tauri/tauri.conf.json`** — *Re-assessment against the real `out/` static-export build* found the baseline already hardened (the prior session's writeup was inaccurate): `object-src 'none'`, `frame-ancestors 'none'`, scoped `default-src 'self'`, scoped `connect-src`, `worker-src`, `manifest-src` were all already present. *Fix:* added the one genuine missing directive — **`base-uri 'self'`** — which blocks `<base>`-tag hijacking and has **no fallback to `default-src`** (so it wasn't covered before). Verified safe: zero `<base>` tags in any exported HTML, so nothing legitimate relies on it; it only fires against injection.
- **Formally accepted-risk (documented, no longer a silent gap):**
  - `script-src 'unsafe-inline'` — the static export emits 7 inline `self.__next_f.push(...)` hydration scripts whose content (and thus SHA-256) changes every build; nonces are unavailable in static export → hash-allowlisting is infeasible.
  - `style-src 'unsafe-inline'` — runtime `<style>`/`insertRule` injection (base-ui portals, Sonner, theme) + 20 inline `style=` attributes; CSP hashes don't cover style attributes.
  - `frame-src … http: https:` — the embedded controller workspace has a direct-load path to arbitrary LAN controller URLs (no fixed allowlist possible).
- **Compensating controls bounding the residual risk:** the proxied workspace iframe now runs in an opaque origin (session 1), and `proxy_fetch` validates TLS, blocks redirects, and rejects non-literal-IP hosts (session 1). `object-src 'none'` + `frame-ancestors 'none'` + new `base-uri 'self'` close the plugin-embed, clickjacking, and base-hijack vectors.

---

## Housekeeping

- `.claude/settings.local.json` — auto-appended read-only verification command allowlist entries from the fix-team agents. Harmless; retained.
- New migration `supabase/migrations/add-sync-version-auto-increment.sql` follows the repo's `add-*.sql` + `notify pgrst` convention.

---

## Verification

- **TypeScript:** `npx tsc --noEmit` — clean for all changed files. Only pre-existing `xlsx` module-resolution errors in DXR files remain (out of scope).
- **Rust:** `cargo test --lib` → **6 passed, 0 failed** (the new telnet straddle tests); `cargo check` clean (1 pre-existing unrelated `unused import` warning at `lib.rs:864`).
- **JS tests:** `npx vitest run src/lib` → **345 passed, 1 failed**. The single failure — `reconcile.test.ts > exports exactly 14 reconciled entity pairs` (expects 14, actual 15) — is **PRE-EXISTING at HEAD** (commit `5800633`) and **NOT a regression**: this session's diff does not touch `RECONCILED_ENTITY_PAIRS`, and the findings doc itself states there are 15 pairs. It is a stale test asserting an outdated count. **Out of scope** for this P0 batch; recommend a trivial P3 follow-up to update the expected count to 15.
- **SQL:** validated statically (no local Postgres) — function defined before triggers reference it; `$$`/`begin/end`/`foreach`/`if` balanced; `format('%I', …)` identifier quoting correct; longest generated trigger name 48 chars (< 63-byte limit); all 41 target tables confirmed to exist in schema/migrations.

### Deferred / accepted-risk (carried forward)

- `#12` cross-device note author with no `profiles.display_name` → `"Unknown"` (acceptable; future `global_field_notes.author` column would close it losslessly).
- `#4` optimistic `WHERE sync_version=` concurrency guard — needs a new RPC surface; JS tiebreak + server increment is sufficient this pass.
- `#1` `script-src`/`style-src 'unsafe-inline'` and broad `frame-src` — formally accepted-risk with documented build-level reasons and compensating controls (above).
- Pre-existing stale `reconcile.test.ts` count assertion (14 → should be 15) — P3 follow-up.
