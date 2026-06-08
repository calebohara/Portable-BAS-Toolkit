# Sync Verification — Multi-Device Manual Test Plan

**Audience:** an operator validating the BAU Suite sync contract on real devices
before a release.
**Scope:** the full sync hardening contract (Phases 1a–3, v4.30.0). This is the
human-runnable companion to the automated `src/lib/sync/__tests__/` suite.
**Origin:** [SyncAuditAgents-findings-2026-06-08.md](./SyncAuditAgents-findings-2026-06-08.md)
Phase 4. Fixes: [BASAgents-fixes-2026-06-08.md](./BASAgents-fixes-2026-06-08.md).

> Distributed sync can't be "100%", but the target is concrete: **deletes that
> stick, strict per-user isolation, no silent data loss, a self-healing queue.**
> Each section below proves one of those guarantees.

---

## 0. Pre-flight checklist (do this FIRST)

### 0.1 Apply the two pending migrations

There is **no Supabase CLI** in this project — migrations are applied **by hand in
the Supabase SQL Editor**. Two migrations are required for the full contract and
are currently **PENDING**:

| # | File | What it guarantees | Symptom if NOT applied |
|---|------|--------------------|------------------------|
| 1 | `supabase/migrations/add-sync-version-insert-defaults.sql` | Server-owned `updated_at` + `sync_version = 1` on INSERT (a client can't decide a conflict winner with a skewed/spoofed timestamp) | Conflict tie-break still works client-side, but a skewed INSERT clock can pick the wrong winner |
| 2 | `supabase/migrations/add-cascade-soft-delete-rpcs.sql` | Atomic parent+child cascade soft-delete in one transaction (`cascade_soft_delete_project`, `cascade_soft_delete_global_project`) | Delete cascade falls back to a non-atomic single statement — a mid-cascade crash can orphan children (resurrection risk) |

**To apply each one:** open the Supabase project → SQL Editor → paste the file's
contents → Run. Order does not matter (each self-records into the
`schema_migrations` ledger via a guarded footer).

### 0.2 Confirm they're applied

Run `supabase/check-migrations.sql` in the SQL Editor (read-only). It prints one
row per migration with an `applied` boolean derived from a probe of a real object
each migration creates. Confirm these two rows are `true`:

- probe **#47** → `add-sync-version-insert-defaults.sql`
- probe **#48** → `add-cascade-soft-delete-rpcs.sql`

If a probe is `false`, the migration isn't live yet — apply it and re-check.
(Until applied, the app still runs: it falls back to the prior, non-atomic /
client-stamped behavior — so an un-migrated DB is a *degraded* test, not a broken
one. For a true verification run, apply both first.)

### 0.3 Device setup

Pick a multi-device arrangement:

- **A + B** = two laptops, OR two separate **browser profiles** (NOT two tabs —
  they share IndexedDB), OR one laptop + the desktop app, OR a laptop + the PWA on
  a phone.
- Both signed in to the **same account** for the propagation tests, EXCEPT the
  user-switch test (§4), which uses **two different accounts on one device**.
- Confirm both are on **v4.30.0+** (Settings → About / version footer). The delete
  fixes only propagate between devices that are both on a tombstone-aware build.

### 0.4 Where to watch (keep these open)

- **Sync Error Inspector** (Settings → Sync, or the sync-status chip → "View
  errors"). One row per distinct failure signature with an occurrence counter — a
  healthy run shows none, or only an expected, single, non-growing row.
- **Reset Sync State card** (Settings → Sync) — has "Update from cloud" and the
  reset controls used below.
- The **sync-status chip** (idle / syncing / N pending / N failed).

---

## 1. Basic propagation — A creates → B pulls

1. On **A**, create a new project (e.g. "Verify Site 01", project number
   `44OP-009001`). Add one device under it ("AHU-1") and one field note.
2. Wait for **A**'s sync chip to return to **idle** (push complete).
3. On **B**, trigger a pull: tap **"Update from cloud"** (or just wait one sync
   interval, ~5s).
4. **Expected:** "Verify Site 01" appears on **B**, with the AHU-1 device and the
   note. Project number and all fields match A exactly.

✅ Pass: B sees A's new project + children with no missing fields.

---

## 2. Delete sticks — anti-resurrection (the demo-project bug)

This is the headline guarantee. A delete on one device must disappear everywhere
**and stay gone** even after the other device re-syncs.

1. Both A and B are showing "Verify Site 01" from §1.
2. On **A**, delete a child first: delete the **AHU-1 device**.
3. On **A**, wait for idle, then on **B** tap **"Update from cloud"**.
   **Expected:** AHU-1 is gone on **B**.
4. On **A**, delete the **whole project** "Verify Site 01".
5. On **A**, wait for idle. On **B**, tap **"Update from cloud"**.
   **Expected:** the project disappears on **B**, with no orphaned device/note
   rows left behind.
6. **The resurrection check:** on **B**, now tap **"Update from cloud"** a SECOND
   time (and, for good measure, edit any *other* unrelated project on B to force a
   push cycle).
   **Expected:** "Verify Site 01" does **NOT** come back. It stays deleted on both
   devices permanently.
7. Cross-check in Supabase (optional): the `projects` row for that id has
   `deleted_at` set (not null), and no later push reset it to null.

✅ Pass: the deleted project never reappears on either device across repeated
syncs. ❌ Fail (the old bug): it reappears on B after a re-sync — meaning a stale
live copy re-pushed `deleted_at: null` and un-deleted the cloud tombstone.

---

## 3. Concurrent offline edit — sync_version winner, no silent loss

Proves conflict tie-break is by `sync_version` (not wall-clock), and that the
loser is preserved as a conflict, never silently dropped.

1. Both A and B show the same shared row — use a **global/shared project** (share
   "Verify Site 02" so both are members) and pick one device record, "VAV-2".
2. Put **A offline** (airplane mode / DevTools "Offline"). Keep **B online**.
3. On **A** (offline): change VAV-2's notes to **"edited on A"**.
4. On **B** (online): change the SAME VAV-2's notes to **"edited on B"**, let B
   sync to idle. (B's edit is now the higher `sync_version` in the cloud.)
5. Bring **A back online**. Let A's queue flush.
6. **Expected:**
   - The **higher-`sync_version`** edit wins the row (here B's, since it committed
     to the cloud and bumped the version first). A's push detects
     `remoteVersion > localVersion` and does **not** blindly overwrite.
   - A's losing edit is **not silently destroyed** — it surfaces in the **Sync
     Error / Conflict** surface (a conflict was raised, the queue item resolved,
     no infinite retry).
7. Reverse the roles (B offline, A online) and repeat to confirm symmetry.

✅ Pass: the version winner is deterministic and consistent on both devices, and
the losing edit is recorded as a conflict (not vanished). ❌ Fail: one edit
silently disappears with no conflict logged, or the two devices end up showing
different winners.

> Note: with migration #1 applied, even a device with a **wrong clock** can't win
> by spoofing a future `updated_at` — the server owns the version.

---

## 4. Shared field laptop — user switch isolation

The shared-laptop breach: signing out A and into B on the **same device** must
wipe A's data and must never push A's queued work under B's identity.

1. On **one device**, sign in as **User A**. Create a project "A-only Site" with a
   device. **Important:** before A's queue fully flushes, simulate a pending item
   — e.g. go offline, edit "A-only Site", so A has an **un-pushed** queue item.
2. **Sign out** A (still offline or just after). Then **sign in as User B** (a
   different account) on the same device.
3. **Expected immediately after B signs in:**
   - **B sees ONLY B's own data.** "A-only Site" and every other A row are gone
     from the local view (IndexedDB was wiped + cursors reset on the genuine user
     change).
   - **None of A's queued items push under B.** Watch the Sync Error Inspector and
     Supabase: there is **no** row authored by B that actually contains A's
     content, and no `user_id = B` stamp on A's leftover work. The queue was
     cleared as part of the wipe.
4. **Negative control (must NOT wipe):** sign B out and back in as **the same User
   B** (token refresh / re-login). **Expected:** B's data is **retained** — a
   same-user re-auth does not wipe. Likewise a first-ever login on a fresh device
   does not wipe a legitimately-hydrated local store.

✅ Pass: a genuine A→B switch wipes + isolates; a same-user re-auth does not. ❌
Fail: B sees A's data, or A's pending edits show up in the cloud under B.

---

## 5. Non-admin edits a foreign global row — no 42501 retry storm

A member editing **another member's** global row must be dropped as a no-op, not
retried forever against the `created_by = auth.uid()` RLS policy.

1. Share a global project with two members, **M1** and **M2**. Have **M1** create
   a device "Foreign-Owned-Dev" (so M1 is its `created_by`).
2. On **M2**'s device, let the shared project pull so "Foreign-Owned-Dev" lands in
   M2's IndexedDB. Then make M2 attempt an **edit** to that foreign-owned row (or
   force a full re-push from M2, e.g. via the reset card).
3. **Expected:**
   - M2's push of the foreign-authored row is **dropped as a successful no-op** —
     removed from M2's queue, **never upserted**.
   - The **Sync Error Inspector shows no growing 42501 row** for it. There is no
     retry storm, no stuck "failed (5)" item churning.
4. Cross-check: the cloud row still has M1's original `created_by` and content —
   M2 didn't corrupt it.

✅ Pass: M2's futile push silently drops; no 42501 churn; M1's row intact. ❌ Fail:
a 42501 error row keeps incrementing its occurrence counter, or the item retries
endlessly.

> Admins are unaffected: a genuine admin edit still succeeds via the live write
> path (it goes straight to Supabase under the admin's session) — only the futile
> sync-queue **re-push** of a merely-pulled foreign row is suppressed.

---

## 6. Offline-create survives "Update from cloud" (no premature reap)

The subtractive full-pull must never reap a row that exists only because it was
created offline and hasn't synced yet.

1. On **A**, go **offline**.
2. Create a new project "Offline-Born Site" while offline. It is now in A's
   IndexedDB **and** A's sync queue, but **not** in the cloud.
3. **Still offline (or immediately on reconnect, before the queue flushes)**, tap
   **"Update from cloud"** on A.
4. **Expected:** "Offline-Born Site" is **NOT** deleted. The subtractive reap sees
   it's absent from the cloud's live set but skips it because it has an un-pushed
   queue item (un-pushed work is protected).
5. Let A reconnect and flush. **Expected:** "Offline-Born Site" pushes to the
   cloud normally and now appears on **B** after B pulls.

✅ Pass: the offline-created row survives the pull and later syncs intact. ❌ Fail:
"Offline-Born Site" vanishes from A when "Update from cloud" runs (un-pushed work
destroyed).

---

## 7. Delete a project with children — no orphans, no resurrection

Proves the cascade is complete (atomic when migration #2 is applied) — no child
lingers to push against RLS or feed a resurrection.

1. On **A**, create "Cascade Site" with **multiple** children: 2 devices, 1 note,
   1 daily report, 1 file. Let it sync; confirm it lands on **B**.
2. On **A**, **delete the whole "Cascade Site" project** (parent delete).
3. Let A sync to idle. On **B**, **"Update from cloud"**.
4. **Expected on B:** the project AND all its children (both devices, the note,
   the report, the file) are gone — **zero orphaned children**.
5. **Resurrection check:** on **B**, "Update from cloud" again, then force a push
   cycle on B. **Expected:** nothing from "Cascade Site" comes back — no parent,
   no orphaned child re-creating itself.
6. Cross-check in Supabase: the parent and every child row carry `deleted_at`
   (with migration #2, all stamped in one transaction); no child has
   `deleted_at IS NULL` left dangling.

✅ Pass: parent + every child deleted, no orphans, no resurrection. ❌ Fail: a
child row survives (orphan) and/or re-appears on a later sync.

---

## What to watch throughout

- **Sync Error Inspector** — the authoritative per-signature error view. Healthy:
  empty, or a single non-growing expected row. Unhealthy: a row whose
  **occurrence counter climbs** every cycle (a stuck retry — investigate the
  `errorCode`: `42501` = RLS/ownership, `23503` = FK ordering, `42703`/`PGRST204`
  = missing column, `23505` = duplicate).
- **syncErrors store / sync-status chip** — "N failed" that never clears means
  poison items. Transient failures (network/5xx/JWT) auto-recover on reconnect or
  the 3-minute sweep; permanent ones stay parked (by design) until you fix the
  cause.
- **Discord notifications** — the daily health check + the `bug_reports` INSERT
  trigger post to Discord (when configured). A flurry of sync-related bug reports
  after a release is a signal to re-run this plan.
- **`docs/ACTIVE-BUGS.md`** — the single source of truth for open bugs. Check the
  "🤖 Daily health check" and "📥 User-reported bugs" blocks for any sync
  regressions; log new findings under "✋ Manually tracked".

---

## Quick reference — map to automated coverage

Every scenario here has an automated counterpart that pins the same invariant in
CI (`npx vitest run`):

| Manual § | Guarantee | Automated test file |
|----------|-----------|---------------------|
| §1 | Basic propagation (pull applies remote rows) | `cross-user-and-ingress-guards.test.ts` (pull ingress) |
| §2, §7 | Delete sticks / anti-resurrection / parent cascade | `delete-propagation.test.ts`, `phase4-verification.test.ts` |
| §3 | `sync_version` conflict tie-break | `phase2-conflict-correctness.test.ts`, `reconcile.test.ts` |
| §4 | User-switch isolation | `user-switch-isolation.test.ts` |
| §5 | Cross-user push rejection (whole audited set) | `cross-user-and-ingress-guards.test.ts`, `phase4-verification.test.ts` |
| §6 | Offline-create survives full pull | `delete-propagation.test.ts` |
| §0/#2 | Cascade RPC preferred + graceful fallback | `sync-manager.test.ts`, `phase4-verification.test.ts` |
