# SyncAuditAgents Findings — 2026-06-08

**Mode:** Read-only audit (no code modified)
**Trigger:** Owner concern — recurring sync errors, demo projects resurrecting, and a cross-user GUID write. "Sync needs to be 100% operational and the most important part of this tool."
**Auditors:** 5 (deletes/resurrection · ownership/isolation · queue reliability · conflicts/data-loss · schema/RLS/field-map alignment)
**Verdict:** The sync engine has **multiple P0 correctness defects**, not isolated bugs. The reported symptoms are explained. Honest bottom line: it is **not** currently trustworthy as a system of record without the fixes below.

---

## Executive summary

| # | Finding | Sev | Explains |
|---|---------|-----|----------|
| 1 | **Deletes don't propagate → rows resurrect** | P0 | "Demo projects reappear" |
| 2 | **Same-device user switch doesn't clear/scoped IndexedDB** | P0 | Cross-user data, demo persistence |
| 3 | **Cross-user push affects ALL ~18 global entities** (not just activity log) | P0 | The GUID write; recurring 42501 |
| 4 | **Pull/realtime overwrite un-pushed local edits** (`bulkPutSilent`, no dirty guard) | P0 | Silent data loss |
| 5 | **`fullSync` re-enqueues every row + resets retry counter** | P0 | "Errors out of hand"; "stuck at 3" |
| 6 | **`addSyncError` has no signature dedup** | P0 | Error flood; real errors evicted |
| 7 | **`globalProjectPreferences` DELETE soft-updates a table with no `deleted_at`** | P1 | Guaranteed repeating 42703 |
| 8 | **`restoreFromCloud` filters global tables by `user_id` they don't have** | P1 | "Restore from Cloud" silently no-ops |
| 9 | **Conflict logic ignores `sync_version` except in one branch; reconcile/creates are blind LWW** | P1 | Clock-skew data loss |
| 10 | **field-map is deny-list only (no schema allowlist)** | P1 | Root cause of perpetual missing-column whack-a-mole |
| 11 | No retry backoff; failed items never auto-recover | P2 | Hammering, stranded writes |

---

## P0 findings

### 1. Deletes don't propagate — rows resurrect (THE demo-project cause)
- **Where:** `sync-manager.ts` `pullSync` (~732 `is('deleted_at', null)`), `fullSync` (~583 blind `enqueue('update')`), realtime only for `global_*` (not local tables).
- **Mechanism:** Cloud deletes are *soft* (`deleted_at = now()`); local deletes are *hard*. But every pull filters `deleted_at IS NULL`, so a tombstone is **invisible to other devices' pulls**. A device still holding the live row re-pushes it as an `update`, which **resets `deleted_at` to null → resurrects the row** cloud-wide. Full pulls are additive-only (never delete locally). There is **no "deletes win" rule anywhere.**
- **Demo verdict:** demo-seed code was fully removed (commit `c8ffa23`) — it cannot re-seed. The reappearing projects are **old demo rows resurrecting through this loop** (pre-removal accounts still have them in the cloud; `purgeOrphans` only catches NULL-project_id orphans + currently-tombstoned rows, both undone by the re-push).
- **Fix direction:** make pull tombstone-aware (fetch `updated_at >= lastPulledAt` *including* tombstones, route `deleted_at != null` → `bulkDeleteSilent`/cascade); stop `fullSync` re-pushing rows the cloud has tombstoned; add subtractive reconciliation to full pull; extend delete propagation to local tables; consider hard-delete-on-origin so there's no soft-delete window. One-time targeted purge of legacy demo rows (`44OP-001847`, `44OP-002103`, "AHU-1/2 Controls Upgrade", "Clinical Lab Renovation BAS").

### 2. Same-device user switch — IndexedDB not cleared or user-scoped
- **Where:** `auth-provider.tsx` `signOut` (state only, no `clearAllData`), `sync-provider.tsx` first-login gate (~180 keys on persisted `lastPulledAt`), `db.ts` `clearAllData` (only called on account delete), `app-store.ts` (`lastPulledAt` persisted across logout).
- **Mechanism (shared field laptop — common here):** User A signs out, B signs in. (a) B immediately sees A's data (IndexedDB is origin-global, not per-user). (b) A's persisted `lastPulledAt` suppresses B's clean first-login pull. (c) A's still-pending `syncQueue` items get pushed under **B's** identity (local tables stamp `user_id = B`) → A's content becomes B's or leaks. This is a real cross-user integrity breach.
- **Fix direction:** on `SIGNED_OUT` (or a different user's `SIGNED_IN`), `clearAllData()` + clear `syncQueue` + reset `lastPulledAt`/sync cursors; persist last-auth user id and force a clean full pull when it changes.

### 3. Cross-user push affects ALL global entities (the GUID write, generalized)
- **Where:** `sync-manager.ts` push path; the `globalActivityLog` guard added recently covers only that one entity. RLS UPDATE policies on every global child table require `created_by = auth.uid()` (or admin).
- **Mechanism:** A non-admin member editing another member's row — or `fullSync` re-pushing a pulled foreign-authored row — takes the `ON CONFLICT DO UPDATE` branch, fails the `created_by = auth.uid()` policy → **42501, retries forever**. Affects all 17 `GLOBAL_AUDITED_ENTITY_TYPES` + `globalProjects`.
- **Fix direction:** generalize the `globalActivityLog` ownership guard to all global audited entities (skip/no-op pushing rows you didn't author and can't admin); extend the `fullSync` authorship skip to all of them; treat 42501-on-global-update as non-retryable drop. (UI should also not offer edit on rows the member can't edit.)

### 4. Pull/realtime clobber un-pushed local edits (silent data loss)
- **Where:** `sync-manager.ts:835` (pull) & `:1346` (realtime) → `bulkPutSilent` (unconditional `put`); conflict detection exists only in the push path.
- **Mechanism:** A queued-but-not-yet-pushed local edit is overwritten in place by an incoming (older) remote row. No dirty-guard anywhere on ingress.
- **Fix direction:** before `bulkPutSilent`, check pending queue for the same `(entityType,id)`; skip or route to the conflict path instead of clobbering.

### 5. `fullSync` re-enqueues everything + resets retry counter (the amplifier)
- **Where:** `sync-manager.ts:540-612`.
- **Mechanism:** `fullSync` enqueues **every** local row as `update` (no dirty-tracking), each via a fresh `enqueue` with `retriedCount: 0` — so poison items parked at `failed` are recreated as `pending` and never stay terminal (your "stuck at 3"). Plus a conflict-`SELECT` per row. This is the single biggest driver of "errors out of hand."
- **Fix direction:** enqueue only dirty rows (`updatedAt > lastPushedAt`); preserve `retriedCount` when re-enqueuing an already-failed entity; skip own `globalActivityLog` re-push.

### 6. `addSyncError` has no per-signature dedup
- **Where:** `db.ts` (`id: crypto.randomUUID()` per error, 100-row cap); capture in `sync-manager.ts` push & pull catch blocks (fires on **every** retry, before the terminal check).
- **Mechanism:** One recurring failure writes a new row every cycle, churning the 100-cap and evicting genuinely distinct errors. (Good news: `reportSyncErrorAsBug` is **manual-only** — no automatic Discord/bug_reports flood. The spam is the syncErrors store + console.)
- **Fix direction:** dedup by `(entityType,entityId,errorCode)` with an occurrence counter; only capture at terminal failure.

## P1 findings

- **7. `globalProjectPreferences` delete → 42703.** The delete branch issues `update deleted_at` against a table with no `deleted_at` column; will fail+retry forever the moment a user unpins/removes a shared-project preference offline. Fix: hard-`delete()` by composite key.
- **8. `restoreFromCloud` filters `global_*` tables by `user_id`** (they have `created_by`, not `user_id`) → 42703 per table; "Restore from Cloud" never restores shared data. Fix: drop the `user_id` filter for membership-RLS tables.
- **9. Conflict resolution gaps.** `sync_version` (now trigger-maintained) is consulted **only** in the equal-millisecond branch of the *push* path — not pull, realtime, reconcile, or when timestamps merely differ. Reconcile + `create` actions are blind last-write-wins (no conflict surfaced). `updated_at` is client-stamped on INSERT (triggers are BEFORE UPDATE only) → skew/spoof decides the winner. Fix: make `sync_version` the primary comparator everywhere; server-own `updated_at`; route reconcile/creates through conflict detection.
- **10. field-map is deny-list only (systemic root cause).** `toSupabaseRow` pushes any key on the local object, defended only by hand-maintained `LOCAL_ONLY_FIELDS`/`SKIP_FIELDS`. Every new pull-stamp or interface field is a fresh missing-column risk. Fix (durable): a per-entity **column allowlist** so unknown keys are dropped by default — this ends the whack-a-mole.

## P2 findings
- No exponential backoff (5 retries in ~25s flat). Failed items never auto-recover (manual "Retry" only). Cross-batch FK ordering (children can push before parents). Reconcile/cascade non-atomic on the server (partial-write orphans). `globalProjects` member-update 42501 (same class as #3). `globalProjects` join-only interface fields (`memberCount`/`role`/`isPinned`/`isOfflineAvailable`) are a missing-column landmine if ever persisted — pre-emptively add to `SKIP_FIELDS`.

---

## Recommended remediation (phased)

**Phase 1 — Stop data loss & corruption (P0):**
1. Delete propagation + resurrection fix (#1) + one-time legacy-demo purge.
2. Same-device user isolation: clear on sign-out/user-change (#2).
3. Generalize cross-user ownership guard to all global entities (#3).
4. Pull/realtime dirty-guard so ingress can't clobber pending edits (#4).
5. `fullSync` dirty-tracking + preserve retry counter (#5); `addSyncError` dedup + capture-at-terminal (#6).

**Phase 2 — Latent failures (P1):** preferences hard-delete (#7); restore-from-cloud filter (#8); conflict logic on `sync_version` everywhere + server-owned `updated_at` (#9).

**Phase 3 — Durable hardening (P1/P2):** schema-driven field-map allowlist (#10); backoff + failed-item auto-recovery; FK-ordered queue; atomic server cascade RPC.

**Phase 4 — Verification:** targeted vitest coverage for delete-propagation, user-switch isolation, cross-user push rejection, pull-vs-pending-edit, and conflict tie-break; plus a multi-device manual test script.

> "100%" isn't literally achievable for distributed sync, but the realistic target is: **no known correctness bugs, deletes that stick, strict per-user isolation, an idempotent self-healing queue, and tests + the existing monitoring to keep it that way.** That's Phases 1–4.
