# SyncAuditAgents Fixes — 2026-06-11

Remediation of the **deferred strategic finding (CFM-1/ARCH-1, the two-writer
trap)** plus the four open data-stranding P2s and the consistency-check global
gap from [`SyncAuditAgents-findings-2026-06-08-3.md`](./SyncAuditAgents-findings-2026-06-08-3.md).
Owner-directed session ("Work on 1 through 5" from the durability review).

## Header block

| Field | Value |
|-------|-------|
| Date | 2026-06-11 |
| Mode | design + targeted remediation (single session, no agent team fan-out) |
| Originating findings | SyncAuditAgents s3 (2026-06-08-3): CFM-1/ARCH-1, CFM-2, ENG-1, ENG-3, ENG-4, cross-cutting consistency-check gap |
| Files changed | 13 |
| Insertions / deletions | ~+727 / −73 |
| TypeScript / Lint | clean |
| Tests | **528 passed** (518 pre-existing + 10 new regression tests) |
| Build | `build:static` clean |

## Audit Phase

No new audit this session — all targets came from the s3 findings doc. Deep
re-read of the four implicated modules before design:

| Area | Files read |
|------|-----------|
| Queue writer + comparator | `sync-manager.ts` (processItem conflict path :734–838, fullSync watermark :1047–1151, pull/realtime tombstone ingress, conflict resolution) |
| Reconcile writer | `reconcile.ts` (upsertGlobalRow :259, push gate :1578–1604, auto-mirror pull gate :1695–1744, tombstone mirror) |
| Shared mapping | `field-map.ts` (allowlists, entityOwnedColumns) |
| Safety net | `consistency-check.ts` (entity scope) |

**Design note (why the prior P0 cannot recur):** the v4.32.0 P0 came from
comparing the LOCAL table's `syncVersion` against the GLOBAL table's
`sync_version` — two unrelated counters. This session's divergence gate
compares the GLOBAL counter against **the same GLOBAL counter as last pulled
into the device's global-store mirror** (`getAllFromStore(pair.global)` →
`syncVersion`). Same counter, valid comparison. Rows with no mirrored base
(first share, legacy links) fall through to the existing timestamp-only
behavior — no regression, no false conflicts. The existing P0 regression test
("PUSHES a newer-timestamp local note even when the global row has a higher
(unrelated) sync_version") still passes unchanged.

## Fixes Applied

### P1 — CFM-1/ARCH-1: Share-to-Global blind overwrite → shared conflict authority

- **`src/lib/sync/field-map.ts`** — `pushRowMatchesRemote` + `CONFLICT_IGNORED_COLUMNS`
  + `columnValuesEqual` MOVED here from sync-manager and exported. field-map is
  now the **single conflict authority** both global writers import; a comment at
  the old site forbids re-implementing a comparator in the manager.
- **`src/lib/global-projects/reconcile.ts`** — `reconcilePairLocalToGlobal` now:
  1. Reads the device's **last-pulled GLOBAL `sync_version` per row** from the
     global IndexedDB mirror (the base).
  2. When the timestamp gate says "push" over an existing row AND the cloud's
     version advanced past the base (a peer edited since our last pull): fetches
     the full remote row, applies `pushRowMatchesRemote`; identical content →
     silent skip; diverged content → **`addSyncConflict`** with the same
     deterministic id the queue path uses (`${entityType}-${entityId}`) and the
     push is withheld. If the remote fetch fails with divergence evidence in
     hand, the push is withheld and counted `failed` (never blind-push over a
     known peer edit).
  3. Base unknown / versions missing → status quo (timestamp-only).
- **`src/lib/db.ts`** — `addSyncConflict` now dispatches
  `bau-suite:sync-conflict-added` so conflicts raised outside the manager reach
  the UI badge immediately.
- **`src/providers/sync-provider.tsx`** — listens for that event and refreshes
  the conflict count.
- **`src/components/global-projects/share-to-global-dialog.tsx`** — share
  summary shows "Conflicts to resolve: N" plus an explanatory notice when the
  divergence gate fired.
- **Counts** — `EntityReconcileCounts.conflicts?` added.

### P2 — CFM-2: auto-mirror live-upsert lacked a dirty-guard

- **`src/lib/global-projects/reconcile.ts`** — `reconcilePairGlobalToLocal`
  (AUTO path only, `skipUnchanged`) now reads `getUnpushedSyncItemKeys()` once
  per pair and skips any row with a pending local push — a skewed-clock peer
  edit can no longer overwrite an un-shared local edit. Queue-read failure →
  fail safe (mirror writes nothing that round). Manual Save-to-Local keeps its
  force-overwrite semantics.

### P2 — ENG-1: remote tombstone ingress lacked the dirty-guard the upsert path has

- **`src/lib/sync/sync-manager.ts`** — pull loop: the per-row tombstone branch
  now defers (does not delete) when the row has an un-pushed queue item, exactly
  like the live-row dirty-guard. Self-healing: the pending push bumps the cloud
  row's `updated_at`, so the tombstone is re-fetched on the next incremental
  pull once the queue item is gone. Realtime hard-DELETE and soft-delete-as-
  UPDATE branches get the same guard via `hasUnpushedSyncItem` (failure counts
  as dirty). Project-level cascades are intentionally NOT guarded (deliberate
  destructive parent actions; matching the finding's scope).

### P2 — ENG-3: local `syncVersion` never bumped after push (spurious self-conflicts)

- **`src/lib/sync/sync-manager.ts`** — after a successful create/update upsert,
  a separate keyed `select('sync_version')` reads the server's post-write
  version and `adoptServerSyncVersion` stamps it onto the local store row.
  CAS-guarded on the row's mtime so a mid-flight edit is never touched;
  entirely non-fatal (any failure leaves the old pull-catches-up behavior).
  Excluded: `globalActivityLog` (append-only), `globalProjectPreferences`
  (composite PK). A deliberate **separate** select (not a chained `.select()`)
  keeps the upsert contract unchanged; the tiny upsert→select race degrades to
  the timestamp comparator, never to silent loss.
- **`src/lib/db.ts`** — new `getRowFromStore(storeName, id)` keyed getter.

### P2 — ENG-4: fullSync watermark strands a "removed-in-inspector" edit

- **`src/lib/sync/sync-manager.ts`** — new exported
  `rollbackFullSyncWatermarkForRow(entityType, entityId)`: rolls
  `lastFullPush:{entityType}` back to 1ms below the row's mtime (only when the
  watermark is ahead).
- **`src/hooks/use-sync-errors.ts`** — `removeOne` (inspector "remove": drops
  the error + queue item, keeps the row) now calls the rollback so a later
  "Sync Now" re-enqueues the preserved edit instead of stranding it forever.
  `forgetRow` (row deleted) intentionally does not.

### P2 — Cross-cutting: consistency-check excluded all `global_*` tables

- **`src/lib/sync/consistency-check.ts`** — 18 global entity types added
  (`globalProjects` + 17 children), table names sourced from the canonical
  `entityTypeToTable` so the list can't drift. Excluded with reasons:
  `globalActivityLog` (append-only churn), `globalProjectPreferences`
  (composite-PK per-user state). Local mirror vs membership-RLS-scoped remote
  is a well-defined parity (the pull hydrates every member-visible row).
  A mirror retaining rows from LEFT projects shows as 'ahead' (informational)
  — deliberately surfacing the open GLOBAL-1 revoke-retention gap.

## Housekeeping

- **Sync feature freeze documented in `CLAUDE.md`** — no new sync modes / global
  entity types / global writer paths until the remaining s3 findings are closed;
  conflict logic must stay in field-map.
- **Entity-surface evaluation (owner item 5):** all 18 global child tables were
  reviewed against the reconcile pair registry and pull/realtime/consistency
  wiring. **Recommendation: no removals.** Every type either has a local twin
  in `RECONCILED_ENTITY_PAIRS` (15) or is deliberately global-only
  (`globalFieldPanels`, `globalNotepadEntries`, `globalMessages` infra). The
  real complexity cost is not the entity count but the ~600-line duplicated
  mapper layer (ARCH-2) — that, not table removal, is the right future
  consolidation target. The CLAUDE.md freeze prevents unreviewed growth in the
  meantime.

## Verification

- `npx tsc --noEmit` — clean.
- `npx eslint` over all changed files — clean.
- `npx vitest run` — **528 passed / 0 failed** (21 files). New regression tests:
  - CFM-1 ×3 (conflict surfaced on divergence; silent skip on identical
    content; informed overwrite when base == remote) — `reconcile.test.ts`
  - CFM-2 ×1 (pending local edit survives a newer global row; applies after
    flush) — `auto-mirror.test.ts`
  - ENG-1 ×1 (tombstone deferred for a dirty row) — `delete-propagation.test.ts`
  - ENG-3 ×2 (version adopted on match; mid-flight edit untouched) +
    ENG-4 ×3 (rollback when ahead; no-op when behind / row gone) —
    `sync-manager.test.ts`
- `npm run build:static` — clean (sw.js cache stamped).
- The existing v4.32.0 P0 regression tests (cross-counter compare forbidden)
  pass unchanged.

## Still open after this session (from s3)

DEL-2 (double cascade churn), DEL-3/GLOBAL-2 (Storage blob leak), GLOBAL-1
(revoked-member local retention — now at least VISIBLE via the consistency
check), RT-2 (inbox realtime topic), MIG-1/MIG-2 (cursor clock-skew — needs a
migration round), SEC-2 (search_path pinning — needs a migration round),
TEST-2 (conflict-resolution test depth), ARCH-2 (duplicated mappers).
