# SyncAuditAgents Findings — 2026-06-08 (session 3)

Independent, **critical** re-audit of the sync subsystem at **v4.36.0**, prompted by
"Is my syncing system in good shape? Be critical." This is a fresh read of the
*current* code — not a re-run of the prior audit trail
([`SyncAuditAgents-findings-2026-06-08-2.md`](./SyncAuditAgents-findings-2026-06-08-2.md)).
Every finding below was **adversarially verified against the source** before being
recorded; 13 raw findings were refuted/downgraded on that pass and are listed at the end.

Fixes applied from this doc: [`SyncAuditAgents-fixes-2026-06-08-3.md`](./SyncAuditAgents-fixes-2026-06-08-3.md).

## Header

- **Date:** 2026-06-08 (session 3)
- **Mode:** read-only audit → selective remediation (see fix log)
- **Method:** 9-dimension fan-out (engine, conflict, isolation, deletes, global,
  realtime, migrations, tests, architecture), each finding independently
  refutation-tested; plus a completeness-critic pass (GAP 1–8) and a 4-gap
  verification pass.
- **Surface reviewed:** ~11.3k LOC core sync
  (`sync-manager.ts` 2113, `reconcile.ts` 1994, `api.ts` 2277, `db.ts` 2259,
  `field-map.ts` 1177, `sync-provider.tsx`, `consistency-check.ts`,
  `auto-mirror.ts`) + 51 migrations + the `__tests__` suites.
- **Raw findings:** 46 confirmed-after-verify: 33; refuted/downgraded: 13. Plus 8
  completeness gaps (1 confirmed by hand = GAP-1; 4 verified = GAP-4/5/7/8).

## Executive Summary

| Priority | Count | Top theme |
|----------|-------|-----------|
| **P0** | 0 (GAP-1 fixed in v4.38.0) | Regular file *content* now roams via Storage (was metadata-only) |
| **P1** | 5 | Multi-user seams: blind global overwrite, FK-ordering strand, cross-user push, realtime re-subscribe, two-writer divergence |
| **P2** | 15 | Clock-skew cursors, blob leaks, revoke retention, realtime teardown, db-terminate, conflict-test gaps |
| **P3** | 17 | Cosmetics, dead branches, god-files, over-engineering, Tauri online events |

**Verdict (overall C):** The **single-user core is genuinely sound** — version-primary
conflict tie-break with a content-equality gate that preserves the loser, airtight
field-map allowlist (zero drift across 40 entities), CAS sync tokens, atomic local
cascade delete, disciplined migration tracking. **The fragility is multi-user and
structural**: a second reconcile path writes the same `global_*` tables with an
`updated_at`-only blind upsert (CFM-1/ARCH-1), and five P1s cluster at the
shared-field-laptop seams the prior audits under-covered. **Not "sync is done."**

---

## P0 / pending product decision

### GAP-1 — Regular (non-global) file uploads sync metadata but never upload the blob
- **Location:** [`upload-file-dialog.tsx:176`](../src/components/files/upload-file-dialog.tsx) (`saveFileBlob` + `saveFile`, no Storage upload); consumers [`file-preview-dialog.tsx:73`](../src/components/files/file-preview-dialog.tsx), [`file-list-view.tsx:193`](../src/components/files/file-list-view.tsx) (`getFileBlob` only).
- **Owner:** completeness-critic; **hand-verified.**
- **Current behavior:** A regular upload mints a local `blobKey` UUID, stores bytes in
  IndexedDB, and saves a `ProjectFile` whose row (including `versions[].blobKey` and an
  empty `storage_path`) syncs to Supabase. `uploadProjectFile`/`uploadBlobToStorage` are
  called **only** by the global-project and knowledge-base paths — never the regular one.
  Consumers read blobs **only** from local IndexedDB; there is no `downloadFromStorage`
  fallback on the regular path.
- **Why:** On a second device, a fresh device, or after a user-switch wipe, every synced
  regular file is a **dead link** ("No file data available"). The metadata roams; the
  document/photo does not. This is **normal-use** breakage for a multi-device user, unlike
  the edge-case P1s below.
- **Decision (2026-06-08):** **Files should roam.** → implement Storage upload-on-save +
  download-on-read for regular files (mirror the global path), populate `storage_path`,
  and plan a backfill for already-uploaded metadata-only files.
- **Status:** ✅ **FIXED** (session 3, v4.38.0) — centralized roaming in
  `src/lib/file-roaming.ts`: upload-on-save (forward), download-on-read (second device),
  and lazy backfill-on-access for pre-roaming files. `storagePath` added to `FileVersion`
  (rides the synced `versions` JSON — no migration; existing `project-files` bucket policies
  already permit it). 8 unit tests. Cross-device behavior still wants a real two-device check
  (see SYNC-VERIFICATION).

---

## P1 findings

### CFM-1 / ARCH-1 — "Share to Global" resolves conflicts by wall-clock only and blind-overwrites the loser
- **Location:** [`reconcile.ts:1599`](../src/lib/global-projects/reconcile.ts) (skip gate) + `:259` (`upsertGlobalRow` blind upsert).
- **Owner:** conflict / architecture.
- **Current behavior:** The local→global push gates on `updated_at` wall-clock only
  (sync_version is fetched but the comment at `:1578` forbids using it), then blind-upserts
  every content column. `addSyncConflict` is **never referenced in reconcile.ts**.
- **Why:** A skewed/fast field-laptop clock (or an admin re-sharing a stale row) makes A's
  row overwrite teammate B's concurrent cloud edit, **silently, with no conflict surfaced on
  any device**. The in-code comment claiming the push-path detector will catch it is
  **false** — reconcile bypasses the queue/detector entirely. The two-writer divergence is
  the strategic root cause (a prior unification attempt was reverted after a P0).
- **Suggested fix:** Give the global tables a **single conflict authority** — route reconcile
  writes through the same queue + `toSupabaseRow` + version comparator, OR make reconcile the
  exclusive global writer and have `fullSync`/`processItem` skip `GLOBAL_ENTITY_TYPES`.
- **Handoff:** BASAgents — **DEFERRED** (architectural; too risky for a fix pass). Highest-
  value strategic work.

### ENG-2 — `23503` (FK violation) classified PERMANENT strands legitimate children
- **Location:** [`sync-error-utils.ts:195`](../src/lib/sync/sync-error-utils.ts) (`PERMANENT_ERROR_CODES`) + [`db.ts:1610`](../src/lib/db.ts) (`getPendingSyncItems` sliced lexicographically before parent-first ordering).
- **Owner:** engine.
- **Current behavior:** `getPendingSyncItems` slices the first 20 pending rows in
  index/lexicographic key order (`devices-…` < `projects-…`), **before** `orderPushBatch`
  runs (which only reorders within the already-sliced batch). On a first sync of any
  project with >20 children, a child fills batch 1 while its parent waits in batch 2 → child
  push hits `23503` → parked **permanently**, though a retry seconds later would succeed.
- **Why:** Breaks the convergence guarantee for legitimate writes; recoverable only by a
  manual "Reset failed sync items" the user has no reason to click.
- **Status:** ✅ **FIXED** (session 3) — order the whole eligible set parent-first before
  slicing. Regression test added.

### SEC-1 — Swallowed `clearAllData()` failure lets the previous user's queue push under the new user
- **Location:** [`auth-provider.tsx:184`](../src/providers/auth-provider.tsx) (wipe failure → `console.warn`, propagates anyway) + [`sync-manager.ts:565`](../src/lib/sync/sync-manager.ts) (`processItem` never checked `item.userId`).
- **Owner:** isolation.
- **Current behavior:** On user switch, a partial `clearAllData()` failure was swallowed,
  `setUser(B)` propagated, and `processItem` never compared `item.userId` to `this.userId`;
  `toSupabaseRow` then stamps the surviving rows with B's id → A's content lands in the cloud
  authored as B. The shared-field-laptop breach the isolation logic exists to prevent.
- **Status:** ✅ **FIXED** (session 3) — `processItem` drops any item whose `userId` ≠ the
  active user (load-bearing); `clearAllData` now clears `syncQueue`/`syncConflicts` first and
  clears each store independently, rethrowing on partial failure. Regression tests added.

### RT-1 — Membership re-subscribe reuses a still-`leaving` realtime channel → global realtime goes silent
- **Location:** [`sync-manager.ts:1880`](../src/lib/sync/sync-manager.ts) (`subscribeToGlobalRealtime`, fixed per-user topic).
- **Owner:** realtime.
- **Current behavior:** supabase-js dedups channels by topic and `removeChannel` leaves
  asynchronously; a re-subscribe after a membership change (the most common multi-user
  action, fired from 4 sites) reuses the dying channel whose `.subscribe()` no-ops → **no
  live global subscription** until the 90s pull catches up. The correct per-instance topic
  suffix is already used in `useRealtimeRefresh` — just not here.
- **Status:** ✅ **FIXED** (session 3) — per-generation topic suffix (`-g${gen}`).

### ARCH-1 — Two independent writers over the same `global_*` tables with divergent conflict logic
- See CFM-1. Strategic root cause; **DEFERRED**.

---

## P2 findings (selected)

| ID | Location | Issue | Status |
|----|----------|-------|--------|
| **GAP-4** | `sync-manager.ts` `handleRealtimeChange` | A torn-down manager's in-flight realtime event re-seeds the *previous* user's rows into the wiped store (cross-user leak; auto-mirror half is self-guarded). | ✅ **FIXED** — `stopped` flag checked before silent writes. |
| **GAP-7** | [`db.ts:343`](../src/lib/db.ts) `getDB` | No `terminated()` handler → a browser-terminated connection leaves a dead `dbPromise`; all sync throws until reload. (Quota half refuted.) | ✅ **FIXED** — `terminated()` nulls `dbPromise`. |
| **SEC-3** | [`app-store.ts:154`](../src/store/app-store.ts) partialize | `recentSearches` (verbatim typed text) + `recentProjectIds` survive the user-switch wipe → leak to next user. | ✅ **FIXED** — cleared in the wipe branch. |
| **CFM-2** | `reconcile.ts:1715` | Auto-mirror global→local live-upsert has no dirty-guard; overwrites an unshared local edit under clock skew. | Open — add `hasUnpushedSyncItem` guard. |
| **ENG-1** | `sync-manager.ts:1332/2037` | Remote tombstone ingress lacks the dirty-guard the upsert path has → can silently remove a locally-edited-but-unpushed row (recoverable via push-path conflict). | Open. |
| **ENG-3** | `sync-manager.ts:745` | Local `syncVersion` never bumped after push → back-to-back self-edits raise a spurious conflict within the 90s window. | Open. |
| **ENG-4** | `sync-manager.ts:1094` | `fullSync` watermark advances on scan, not on push success → a "Delete"-in-inspector stranded edit never re-enqueues. | Open. |
| **DEL-2** | `use-global-projects.ts:301` | Global delete runs the cascade twice (non-silent) → 42501 churn + sync-error noise. | Open — pass `{silent:true}` like `leave()`. |
| **DEL-3 / GLOBAL-2** | `api.ts:882` | Single global file delete / re-share leaks the Storage blob (public URL stays live, unbounded quota). | Open. |
| **GLOBAL-1** | `sync-manager.ts:1573` | Revoked member keeps the linked **local** project + personal-cloud copy forever (only the global mirror is reaped). | Open. |
| **RT-2** | [`use-inbox.ts:289`](../src/hooks/use-inbox.ts) | Static `inbox-realtime` topic → a second concurrent mount kills the top-bar unread-badge subscription. | Open — per-instance suffix. |
| **MIG-1** | (migration) | Local `activity_log` has the same slow-clock cursor-skip the global fix patched; needs a BEFORE INSERT server-timestamp trigger. | Open. |
| **MIG-2** | `sync-manager.ts:1197` | Pull cursor is the device's client clock, not max server timestamp → a fast clock skips remote edits/tombstones in the skew window (full pull heals). | Open. |
| **SEC-2** | `global-projects-schema.sql:46` | 4 `SECURITY DEFINER` auth functions lack a pinned `search_path` (every newer one is pinned). | Open — hardening migration. |
| **TEST-2** | `phase2-conflict-correctness.test.ts` | Conflict tests assert only `addSyncConflict` call-count, never the loser's `localData`; `resolveKeepLocal/Remote/DeleteBoth` untested. | Open. |

---

## P3 findings (terse)

Cosmetic / latent / cleanup, all confirmed but low-risk:
ENG-5 (pull cursor pins on one erroring table), CFM-3 (realtime overwrites an open
conflict's row — recoverable), CFM-4 (terminalLogs compares createdAt vs updated_at),
SEC-4 (double isolation reconcile on cold start), DEL-5 (dead globalProjectPreferences
tombstone branch), DEL-6 (`restoreFromCloud` resurrects other admins' deletions),
GLOBAL-4 (non-admin "Review & Share" nudges a guaranteed-42501 edit), MIG-4/MIG-5
(server-stamped birth `updated_at`; `sync_version` not read back after push),
TEST-1/TEST-5/TEST-6 (coverage gaps — partially closed this session), ARCH-2 (duplicated
mappers), ARCH-4 (`membershipCache` never cleared on sign-out), ARCH-5 (god-files /
~430-line `processItem`).

- **GAP-5** (realtime `in.()` filter capped at 100 → live-push latency for >100-project
  users; pull path uncapped so data still converges). Open — shard the filter / warn.
- **GAP-8** (Tauri desktop has no native connectivity listener → reconnect recovery is
  timer-cadence; WebView2 still surfaces `navigator.onLine`, so degraded not dead). Open.

---

## Cross-cutting (architecture)

The two-writer design (generic engine + global reconcile over the same rows) with
duplicated mappers (ARCH-2, ~600 lines) and incompatible tie-break rules (ARCH-1) is the
substrate that keeps generating the dated hotfixes in this area. `consistency-check.ts`
**excludes all `global_*` tables**, so the one read-only safety net opts out of exactly the
known-lossy path. The durable fix is **one writer / one tie-break authority** for the global
tables. **DEFERRED** — strategic, needs design, out of scope for a fix pass.

## Gap-verification results (this session)

| Gap | Verdict | Severity |
|-----|---------|----------|
| GAP-4 wipe race | REAL (realtime half; auto-mirror half self-guarded) | P2 → **fixed** |
| GAP-5 realtime filter >100 | REAL but pull path uncapped (latency only) | P3 |
| GAP-7 dead `dbPromise` on terminate | REAL (quota half refuted) | P2 → **fixed** |
| GAP-8 Tauri online events | REAL but WebView2 has `navigator.onLine` | P3 |

## Out of scope / deferred (with reasons)

- **CFM-1 / ARCH-1 / ARCH-2** — architectural unification of the two global writers. Highest
  value, but a design change, not a fix; doing it carelessly previously caused a P0.
- **GAP-1 file roaming** — green-lit ("files should roam") but a real subsystem (Storage
  upload + download + backfill); scheduled as its own focused build.
- **MIG-1 / SEC-2** — require new Supabase migrations (manual apply); batch with the next
  migration round.
- **Refuted/downgraded (13):** CFM-5 (nullable tri-state is intentional), DEL-1
  (manager-unregistered delete — only live behind the off-by-default `NEXT_PUBLIC_SYNC_PAYWALL`),
  DEL-4 (push-path conflict gate neutralizes it), GLOBAL-2/GLOBAL-3, RT-3/RT-4/RT-5,
  MIG-3 (4 pending migrations — nothing breaks until applied), TEST-3/TEST-4, ARCH-3, ARCH-6.
  Listed so they are not re-reported next round.

## Reference

- Agent team definition: `.claude/SyncAuditAgents.md`
- Manual verification plan: [`SYNC-VERIFICATION.md`](./SYNC-VERIFICATION.md)
- Prior sessions: [`-2 findings`](./SyncAuditAgents-findings-2026-06-08-2.md),
  [`-2 fixes`](./SyncAuditAgents-fixes-2026-06-08-2.md)
