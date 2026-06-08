# SyncAuditAgents Findings — 2026-06-08 (Session 2)

## 1. Header Block

| Field | Value |
|---|---|
| **Date** | 2026-06-08 (second session today) |
| **Mode** | Read-only audit (no code edited) |
| **Auditor count** | 8 dimension auditors (delete-tombstone, multiuser-rls, multidevice-convergence, conflict-dataloss, queue-reliability, realtime-races, rls-policy-completeness, cross-cutting synthesis) + 7 regression verifiers (prior findings #1–#11 + v4.31.2) + adversarial refutation pass |
| **Files reviewed** | `src/lib/sync/sync-manager.ts`, `src/lib/sync/field-map.ts`, `src/lib/sync/sync-bridge.ts`, `src/lib/sync/sync-error-utils.ts`, `src/lib/sync/consistency-check.ts`, `src/lib/global-projects/reconcile.ts`, `src/lib/global-projects/api.ts`, `src/lib/db.ts`, `src/providers/sync-provider.tsx`, `src/providers/auth-provider.tsx`, `src/store/app-store.ts`, `src/hooks/use-global-projects.ts`, `src/hooks/use-projects.ts`, `src/components/devices/device-dialog.tsx`, `src/app/global-projects/[...slug]/client-page.tsx`, `supabase/global-projects-schema.sql`, `supabase/global-projects-reset.sql`, `supabase/migrations/add-cascade-soft-delete-rpcs.sql`, `add-full-text-search.sql`, `add-global-project-preferences.sql`, `add-global-messages.sql`, `hotfix-delete-and-admin.sql`, `supabase/check-migrations.sql`, `supabase/backfill-schema-migrations.sql`, `docs/MIGRATIONS.md` |
| **VERDICT** | **Conditionally trustworthy.** The v4.29.0–v4.31.2 remediation is genuinely in place — tombstone-aware pull, anti-resurrection, dirty-guards, version-primary conflict detection, FK ordering, and the cross-user push guards all verified live. **But two NEW P0/P1-class defects break the contract: a P0 cross-table `sync_version` comparison silently drops a member's edit during "Save to Global," and four P1 gaps (RLS-rejected delete re-enqueue loop, no periodic incremental pull, realtime reconnect drops events, in-flight enqueue race resurrects deletes). Do not certify for unsupervised multi-user co-editing until the P0 and P1s land.** |

---

## 2. Executive Summary

| Priority | Confirmed count | Headline theme |
|---|---|---|
| **P0** | 1 | Reconcile compares **two unrelated `sync_version` counters** (local table vs global table) → silently drops a user's edit on "Save to Global" |
| **P1** | 4 | Convergence + queue gaps: RLS-rejected outbound delete re-enqueue churn; **no periodic incremental pull** (idle online device never catches up; local tables have no realtime); realtime `subscribe()` has **no reconnect handler** (drops peer events); in-flight enqueue race **resurrects a delete** |
| **P2** | 5 | Membership-removal stale local mirror; sole-admin orphaning; client-clock activity-log cursor; duplicate realtime channel registration; join-without-hydration offline gap |
| **P3** | 3 | `leave`/`removeMember` skip local cascade cleanup; content-equality gate ignores `undefined`-cleared fields |

**State of sync:** the *prior* eleven findings are remediated and the safeguards hold under adversarial re-verification, but this session surfaced a **fresh P0 data-loss path in the reconcile (Save-to-Global) flow** plus **four P1 convergence/queue defects** that were outside the prior audit's slice. Sync is hardened against resurrection and cross-user push corruption, yet still has a silent-edit-loss path and several "online device never converges" gaps.

---

## 3. Regression / Safeguards-Confirmed Table

Every prior finding re-verified against current code (not trusted from the doc). Evidence is `file:line`.

| Prior finding | Status | Evidence (file:line) |
|---|---|---|
| **#1** pullSync tombstone-aware (incremental fetches `deleted_at != null`, routes to cascade/delete) | ✅ fixed | sync-manager.ts:1199–1202 (drops `deleted_at IS NULL` on incremental); :1250–1277 (route tombstone → cascade/composite/toDeleteIds); :1362–1364 (flush via bulkDeleteSilent); field-map.ts:1010–1012 (isDeletedRow) |
| **#1** full pull subtractive reconciliation (stale/resurrected local rows reaped) | ✅ fixed | sync-manager.ts:1388 (gate `isFullPull && unpushedKeys!==null && supportsSubtractivePull`); :1390–1424 (staleIds + cascade/bulkDeleteSilent); field-map.ts:1054–1058 (excludes logs/prefs) |
| **#1** deletes propagate to LOCAL IndexedDB (not just cloud) | ✅ fixed | sync-manager.ts:1258/1266 → db.ts:748–829 / 839+ (cascade in one IDB txn, cleans queue/errors :819); leaf via :1363; realtime mirror :1840–1898 |
| **#1** `deletedAt` stripped on push (LOCAL_ONLY_FIELDS) — no resurrection | ✅ fixed | field-map.ts:55–74 (`deletedAt` :67), stripped at :825 BEFORE allowlist :854; `deleted_at` reaches cloud only via delete path sync-manager.ts:595,603 |
| **#1** fullSync no longer re-pushes cloud-tombstoned rows | ✅ fixed | sync-manager.ts:917–1018 (re-scans existing local stores via :939; tombstoned rows already reaped by pull); purgeOrphans first :921 |
| Conflict/dirty-guard ordering vs incoming tombstones (delete-wins) | ✅ fixed | sync-manager.ts:1250 (isDeletedRow is FIRST branch, before dirty-guard :1305–1315). *Residual: silently discards a concurrent un-pushed edit — see cross-cutting.* |
| Pull-path parent cascade re-enqueues delete pushes | ⚠️ **partial** | sync-manager.ts:1258,1266 call NON-silent cascade → db.ts:826–828,923–925 fire notifySync('delete') → re-enqueue. **Promoted to confirmed P1 this session (RLS-reject loop).** |
| One-time legacy demo-project purge SQL | ✅ fixed | supabase/purge-legacy-demo-projects.sql (idempotent :18–21; dynamic cascade :59–79; tombstone parents :82–85). *Residual: global mirror not covered; operator-trust only.* |
| **#2** same-device user-switch isolation (shared laptop) | ✅ fixed | auth-provider.tsx:82–98,178–198,206–242; db.ts:1981–2009 (clearAllData incl. queue/conflicts/errors/meta); app-store.ts:108–118,163; sync-provider.tsx:260–266. *Residual: recentProjectIds/recentSearches not reset (app-store.ts:158–159); best-effort wipe console.warn-only (auth-provider.tsx:186–189).* |
| **#3** cross-user push guard (foreignGlobalAuthor) | ✅ fixed | sync-manager.ts:214–237; invoked :540–549 (push) + :985–994 (re-enqueue); GLOBAL_AUDITED_ENTITY_TYPES field-map.ts:141–148 (coverage = 17 audited + 3 exceptions, provably complete) |
| globalProjects member-update 42501 non-retryable drop backstop | ✅ fixed | sync-manager.ts:818–827 (scoped to global + `action!=='delete'`, dedup capture). *Residual: delete action not covered — see P1 #1.* |
| **v4.31.2** created_by stamp on coalesced create→update upserts | ✅ fixed | sync-manager.ts:633–638 (stamp `created_by` post-toSupabaseRow for globalProjects/audited); necessary because field-map.ts:807,816,835–840 omit/strip created_by on isUpdate. Bypasses allowlist correctly. |
| **#4** ingress dirty-guard (pull path) | ✅ fixed | sync-manager.ts:1305–1315 (isDirtyGuarded + unpushedKeys.has); batch read :1138 via db.ts:1621–1631. Fails SAFE (null → treat all dirty). |
| **#4** ingress dirty-guard (realtime path) | ✅ fixed | sync-manager.ts:1915–1928 (hasUnpushedSyncItem early-return before bulkPutSilent :1941); db.ts:1643–1650. *Residual: `.catch(()=>false)` fails UNSAFE — opposite of pull; can clobber a pending edit on a DB read error.* |
| **#4** guard key-shape consistency across both paths | ✅ fixed | db.ts:1627 (`${entityType}-${entityId}`) == :1648; status union closed 4-value types/index.ts:324 → the two guards provably equivalent |
| **#9** sync_version as PRIMARY conflict comparator | ✅ fixed | sync-manager.ts:678–695 (versionConflict evaluated first/independent of timestamps; timestamp gated to `!bothVersionsKnown || equal`). *Residual: undefined syncVersion on coalesced item → falls back to timestamp-only.* |
| **#9 / v4.31.1** content-equality gate (pushRowMatchesRemote) | ✅ fixed | sync-manager.ts:107–116 (skips CONFLICT_IGNORED_COLUMNS :67–75), invoked :707 inside conflict branch → adopt cloud + delete item. *Residual: ignores `undefined`-cleared fields — see P3.* |
| **#5** fullSync dirty-tracking + retry preservation | ✅ fixed | sync-manager.ts:917–1042; :955–1003 high-water-mark; :1007 enqueue preserveRetry; db.ts:1572–1589,1773–1787. *Residual: no-mtime rows re-enqueue every fullSync.* |
| **#6** addSyncError dedup (signature) at first+terminal | ✅ fixed | db.ts:2125–2167 (upsert+isNew); sync-manager.ts:320–344 (signature `${entityType}-${entityId}-${code}`); :877–879 capture gate; 100-row cap :2152–2164 |
| **#11/P2** exponential backoff + nextRetryAt gate | ✅ fixed | sync-manager.ts:34–41 (BASE 5s/MAX 300s), :899–907 set, :889 clear; db.ts:1599–1607 filter future nextRetryAt. *Note: MAX cap dead code at 5 retries (max 40s).* |
| **#11/P2** auto-recovery re-pends only transient failures | ✅ fixed | sync-manager.ts:440–452 → db.ts:1733–1751; classifier sync-error-utils.ts:195–249; wired sync-provider.tsx:166,191–193. *Residual: resets retriedCount=0 each sweep → unknown/'token' errors loop ~once/3min forever.* |
| **#11/P2** FK-safe ordering (orderPushBatch/pushOrderIndex) | ⚠️ **partial** | field-map.ts:1138–1142,1150–1164; called sync-manager.ts:481. *Residual: ordering only WITHIN a 20-row batch; parent/child straddling the boundary → transient 23503 churn on fresh-device first sync. Self-heals via retry.* |
| **#7** globalProjectPreferences hard-delete by composite key | ✅ fixed | sync-manager.ts:563–583 (`.delete().eq(user_id).eq(global_project_id)`, no deleted_at UPDATE); schema add-global-project-preferences.sql:18–28 (no deleted_at, PK composite) |
| **#8** restoreFromCloud must NOT filter global_* by user_id | ✅ fixed | sync-manager.ts:1072–1078 (isGlobal drops `.eq('user_id')`); regression-covered phase2-conflict-correctness.test.ts:145–218 |
| **#10** ENTITY_COLUMN_ALLOWLIST complete default-deny gate | ✅ fixed | field-map.ts:673–754 (table), 801+854–857 (gate). *Residual: hand-maintained vs migrations; new prod column silently dropped (dev-only warn :760–769).* |
| **P2** atomic server cascade RPC (no partial-write orphans) | ✅ fixed | add-cascade-soft-delete-rpcs.sql (both RPCs `security definer`, atomic plpgsql); sync-manager.ts:253–282 tryCascadeDeleteRpc. *Residual: un-migrated DB fallback (:595) tombstones parent only — MIGRATIONS.md:118 shows status 'P (pending)'.* |
| schema_migrations ledger + drift probe for cascade migration | ✅ fixed | self-recording footer; check-migrations.sql:110–111; backfill :61; MIGRATIONS.md:118. *Residual: probe seq #48 vs index #49 (cosmetic); only global RPC probed, not local.* |

**Regression verdict:** all 11 prior findings + v4.31.2 hold. Two are **partial** (pull-path cascade re-enqueue → now a confirmed P1; FK ordering cross-batch churn → self-healing P3-ish) and several carry documented narrow residual risks, but **no prior fix regressed**.

---

## 4. Confirmed Findings (P0 → P3)

### P0

#### P0-1 — Reconcile local→global compares LOCAL-table `sync_version` against GLOBAL-table `sync_version`, silently dropping the user's edit
- **Location:** `src/lib/global-projects/reconcile.ts:1338–1348` (localVersion source :1339–1341; remoteVersion :1338; prefetch :1305–1320; timestamp fallback :1363–1368 — runs AFTER the skip)
- **Area:** Conflict detection / data loss (reconcile / "Save to Global")
- **Current behavior:** `reconcilePairLocalToGlobal` loads each item from the **LOCAL** IndexedDB store (`getProjectNotes/Devices/…`), whose `syncVersion` is the round-tripped **LOCAL** `field_notes.sync_version` counter (`fromSupabaseRow`, field-map.ts:988–991). `remoteVersion` is read from the **GLOBAL** table (`global_field_notes.sync_version`). Line 1343 then does `if (bothVersionsKnown && remoteVersion > localVersion) { counts.skipped++; continue; }` — comparing two **independent monotonic counters on different rows in different tables** (each table has its own `bump_sync_version` trigger, default 1, per add-sync-version-auto-increment.sql). The global→local mappers (reconcile.ts:653–1004) never copy the global `sync_version` onto the local row, so the two numbers are never reconciled. Once the global counter exceeds the unrelated local counter (the common case after any global-side edit), a genuine newer **local** edit is SKIPPED and never pushed — before the timestamp fallback, so even a far-newer local `updated_at` cannot rescue it.
- **Why it matters:** This is the core multi-user data-loss path. A member edits a shared row locally, runs **"Share local updates to the linked Global Project"** (share-to-global-dialog.tsx:300,337–339 — documented as "safe to run multiple times"), and their change vanishes with **no conflict surfaced and no error** — counted only as `skipped`. Verifier narrowed the scope (ongoing per-edit co-editing goes through the live `api.ts` global path, not reconcile; the local row must currently carry a `field_notes`-sourced `syncVersion`), but the data-loss defect on the documented re-share path is real.
- **Suggested fix:** `sync_version` from two different tables is not comparable. Remove the cross-counter version guard from the reconcile path and rely on the timestamp comparison already at 1363–1368, OR persist the global row's `sync_version` onto the local row during global→local reconcile (e.g. as `globalSyncVersion`) and compare THAT. Until then, force `bothVersionsKnown = false` in the reconcile path so no edit is dropped on a meaningless comparison. **Also fix reconcile.test.ts:377–408**, which currently asserts the buggy skip as correct behavior.
- **Owner:** **SyncAuditAgents** (reconcile correctness) with **BASAgents** for the test correction. Highest-priority remediation this cycle.

---

### P1

#### P1-1 — Applying a pulled parent-project tombstone re-enqueues an outbound DELETE a non-admin member can never push (perpetual 42501)
- **Location:** `src/lib/db.ts:825–828` and `:922–925` (cascade helpers unconditionally `notifySync('delete',…)`); invoked from `sync-manager.ts:1258,:1266` (pull) and `:1857,:1886` (realtime); not dropped by `:215` (foreignGlobalAuthor returns undefined for delete) nor `:818` (42501 drop scoped `action!=='delete'`)
- **Area:** Delete propagation / multi-user global editing under RLS
- **Current behavior:** When an admin soft-deletes a global project, every OTHER member's device pulls the parent tombstone and applies it via `cascadeDeleteGlobalProject(gpid)`, which fires `notifySync('delete','globalProjects',gpid,null)` (db.ts:925) plus one per cascaded child (:923) → `enqueue` creates **outbound** delete items on a device that cannot delete the project. On push, the delete branch calls `cascade_soft_delete_global_project`, which raises **42501** for a non-creator/non-admin (add-cascade-soft-delete-rpcs.sql:81–84). Neither guard catches it: foreignGlobalAuthor bails for deletes (:215), the 42501 drop is gated `action!=='delete'` (:818). The item retries to MAX_RETRIES and parks `failed`; on realtime re-delivery `addSyncItem` overwrites the parked row back to retry 0.
- **Why it matters:** A completely normal action — an admin deleting a shared project — leaves every non-admin member with a stuck, RLS-rejected outbound delete that churns the retry/error machinery (the exact "errors out of hand" class this audit targets). Not data loss (the delete converges locally via the silent apply), but permanent queue/syncErrors degradation. *(Verifier corrected the original "retries indefinitely on every pull" claim: incremental pulls advance `lastPulledAt` past the tombstone and full pulls keep the `deleted_at IS NULL` filter, so recurrence requires realtime re-delivery — still P1, not P0.)*
- **Suggested fix:** Add a silent cascade variant (`cascadeDeleteGlobalProjectSilent`/`…ProjectSilent` or `{silent:true}`) that skips the trailing `notifySync` loops (db.ts:825–828,922–925) and call THAT from pull (:1258/:1266) and realtime (:1857/:1886). Belt-and-suspenders: make foreignGlobalAuthor drop unauthorized `delete` actions for globalProjects, and broaden the :818 drop to include `delete` for global entities.
- **Owner:** **SyncErrorAgents** (queue/error churn) + **SyncAuditAgents** (cascade-silent variant).

#### P1-2 — No periodic incremental pull; LOCAL (user-owned) tables have no realtime — an idle online device never catches up
- **Location:** `src/providers/sync-provider.tsx:160–246` (pull only on first-login, `online`, manual); realtime scoped to global_* only at `sync-manager.ts:1741–1816`
- **Area:** Multi-device convergence / pull scheduling
- **Current behavior:** `pullSync` runs only on first login (full, :200), the `online` reconnect event (:171), and explicit user actions. The 5s `SyncManager.start()` interval (sync-manager.ts:353) runs **processQueue (push) only** — never pulls. The 3-min provider interval (:191–193) runs `autoRecoverFailedItems` (push-side only). Realtime covers **only** global_* tables; local user-owned tables have no channel. The consistency check is one-shot-per-session, click-gated, and excludes all global_* tables.
- **Why it matters:** Same-user multi-device: device B stays online for hours; device A edits a LOCAL project; B gets no realtime event and never runs an incremental pull while online — it stays stale until reload or an `online` flip. For GLOBAL tables, B relies entirely on realtime with no scheduled backstop if a message is dropped.
- **Suggested fix:** Add a periodic incremental `pullSync(lastPulledAt)` on a 60–120s timer in SyncProvider/SyncManager (cheap; advances the cursor). Gives both local and global tables a guaranteed convergence backstop independent of realtime delivery and the `online` event.
- **Owner:** **SyncAuditAgents** (pull scheduling).

#### P1-3 — Realtime `subscribe()` registered with no status callback — reconnect gap silently drops Postgres changes
- **Location:** `src/lib/sync/sync-manager.ts:1787, 1814` (`projectChannel.subscribe()` / `childChannel.subscribe()`)
- **Area:** Realtime subscriptions & races
- **Current behavior:** Both global channels call `.subscribe()` with no status callback; no handling of `SUBSCRIBED`/`CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` (grep-confirmed zero hits in sync-manager.ts). On a websocket drop where `navigator.onLine` stays true (server restart, idle timeout, flaky cellular), the client silently auto-rejoins but `postgres_changes` events are NOT buffered across the gap — every peer INSERT/UPDATE/DELETE during the window is lost on this device. The only reconciliation hook is `window 'online'` → pullSync, which fires only on a full browser offline→online transition.
- **Why it matters:** Exactly the multi-device convergence failure class targeted. A field device on cellular silently misses peer edits/deletes on every websocket hiccup and never reconciles until a full offline→online flip, manual "Update from cloud," or restart. **Missed DELETE events are the worst case: a remotely-deleted row stays alive locally and can be re-pushed (resurrection vector).**
- **Suggested fix:** Pass a status callback to each `.subscribe((status)=>…)`. On `SUBSCRIBED` after a prior drop (or `CHANNEL_ERROR`/`TIMED_OUT` → re-subscribe), trigger an incremental `pullSync(lastPulledAt)` to backfill. Track a per-channel `wasEverSubscribed` flag so the first SUBSCRIBED doesn't double-pull with the initial auto-pull.
- **Owner:** **SyncAuditAgents** (realtime health → pull backfill). Closely related to P1-2; one timer/status-callback change could close both.

#### P1-4 — Lost-update / lost-delete race: an enqueue during an in-flight push is destroyed by the post-success `deleteSyncItem`
- **Location:** `src/lib/sync/sync-manager.ts:522` (flip to 'syncing'), `:771` (unconditional `deleteSyncItem` on success); enqueue overwrite `:405–425`; bridge `sync-bridge.ts:31`
- **Area:** Queue reliability & idempotency
- **Current behavior:** `processItem` flips the deterministic-id row (`${entityType}-${entityId}`) to 'syncing' (:522) then awaits the network call (yielding the event loop). Any UI write to the same entity fires `notifySync→enqueue→addSyncItem` (db.ts:1555–1558, unconditional `put`), overwriting that row with a fresh payload + status 'pending'. When the in-flight push resolves, `processItem` **unconditionally** `deleteSyncItem(item.id)` (:771) using its stale in-memory copy — deleting the freshly-queued newer edit/delete. No compare-and-swap, no re-read.
- **Why it matters:** (1) **update-during-push** — the second edit is silently dropped (recoverable only via a later fullSync dirty re-enqueue). (2) **delete-during-push** — create a row, it begins syncing, user immediately deletes it; the queued delete is destroyed after the create succeeds, so the cloud row stays live while the local copy is hard-deleted. The next pull **re-hydrates it → resurrection: a delete that does not stick.** The window is every network round-trip of an actively-edited entity (realistic for fast field edits).
- **Suggested fix:** Make the success path a compare-and-swap: before `deleteSyncItem` (:771), re-read `db.get('syncQueue', item.id)` and only delete if it's still the same item that was pushed (status still 'syncing' AND payload/action/updatedAt match what was sent); otherwise leave it queued. Equivalently, stamp a monotonic token at the 'syncing' flip and only delete when it still matches. Add a regression test under `src/lib/sync/__tests__` enqueuing a delete (and an update) while an item is 'syncing'.
- **Owner:** **SyncAuditAgents** (queue CAS) + **BASAgents** (regression test).

---

### P2

#### P2-1 — Membership cache not tombstone-aware; a removed member's stale local child rows reaped only on a full pull
- **Location:** `sync-manager.ts:131–159` (fetchMyGlobalProjectIds, no parent-tombstone filter, 30s cache :28/:124); incremental child filter :1181,:1207
- **Area:** Delete propagation / membership view correctness
- **Current behavior:** Member-removal (vs project deletion) produces **no tombstone** — RLS simply stops returning the project's rows, which is indistinguishable from "not updated" on an incremental pull. The rows are reaped only by the full-pull subtractive reconciler (gated `isFullPull`), never incrementally. The consistency check excludes global entities and only flags 'behind', never 'ahead', so it won't prompt the needed full pull.
- **Why it matters:** A removed member can retain a full local mirror of a project they no longer access until the next FULL pull. Stale-data / isolation weakening — not corruption (RLS still blocks write-back).
- **Suggested fix:** Treat loss-of-membership as a delete signal: diff previous vs freshly-fetched membership each pull cycle and cascade-delete (locally, silently) any dropped gpid regardless of full-vs-incremental; or scope the membership query to live projects + add a membership-revocation realtime subscription. At minimum document the full-pull requirement.
- **Owner:** **SyncAuditAgents**.

#### P2-2 — Sole admin can leave / be removed, orphaning the project with no administrator
- **Location:** `api.ts:494` (leaveGlobalProject), `:552` (removeMember); RLS `global-projects-schema.sql:179–204`; no admin-count guard anywhere (grep-confirmed)
- **Area:** Multi-user global projects / admin lifecycle / RLS
- **Current behavior:** No client- or DB-side check prevents the last admin from leaving or being removed while members remain. The DELETE policy "Admins or self can remove members" (:198) lets the sole admin self-delete. Afterward every admin-gated policy (update :179, delete :183, add members :194, update roles :202, regenerate access code, promote member) fails for everyone. There is no `demoteMember` path, so demotion-to-orphan isn't a route — but leave/remove is.
- **Why it matters:** The project becomes permanently un-administrable with no in-app recovery path. Members can still edit their own child rows (not data loss), but no one can edit metadata, invite, promote, rotate the access code, or delete it.
- **Suggested fix:** Reject removing/demoting the last admin while other members exist via a SECURITY DEFINER RPC or BEFORE DELETE trigger on `global_project_members` (require promoting another admin first). Surface a clear UI error; at minimum hide/disable Leave for the sole admin of a multi-member project.
- **Owner:** **SyncAuditAgents** (DB guard) + **BASAgents** (UI affordance).

#### P2-3 — Append-only activity-log incremental pull filters a CLIENT-stamped `timestamp` — a slow-clock device's log rows are skipped
- **Location:** `sync-manager.ts:1206` (timestampCol = 'timestamp' for append-only logs); field-map.ts:687,725 (`timestamp` in push allowlist, client-supplied); cursor :1114 (pulling device's clock)
- **Area:** Multi-device convergence / audit-log pull
- **Current behavior:** For activityLog/globalActivityLog the incremental pull does `gte('timestamp', lastPulledAt)` where BOTH the cursor and the filtered `timestamp` are client clocks — but DIFFERENT devices'. If authoring device A's clock lags receiver B's, A writes a row with `timestamp` earlier than B's advanced cursor, and B's next incremental pull skips it forever.
- **Why it matters:** The audit trail diverges across devices. Lower severity — logs are non-critical and excluded from the consistency check — but a real convergence gap for the per-device timeline. Healed only by a manual full pull / first-login.
- **Suggested fix:** Server-own the log `timestamp` (BEFORE INSERT trigger forcing `now()`, like `init_sync_version` does for `updated_at`), or pull append-only logs by a server-owned column. Combined with a server-domain cursor this is fully resolved.
- **Owner:** **SyncAuditAgents** (+ DB migration).

#### P2-4 — Concurrent `subscribeToGlobalRealtime()` calls can register duplicate same-topic channels (events applied twice / channel leak)
- **Location:** `sync-manager.ts:1741–1816` (no in-flight guard; `await fetchMyGlobalProjectIds` between sync teardown and channel push)
- **Area:** Realtime subscriptions & races
- **Current behavior:** The method does a synchronous `unsubscribeFromGlobalRealtime()` then `await fetchMyGlobalProjectIds(force)` (force=true always does a real round-trip), then builds fixed-topic channels. Mount (sync-provider.tsx:129) and `GLOBAL_MEMBERSHIP_CHANGED_EVENT` (:147) can interleave during the await; the second teardown is a no-op (cleanup ref still stale), and Supabase keys channels by topic so the second `.channel(sameTopic).on(...)` stacks a second binding set → `handleRealtimeChange` fires twice per event, and `globalRealtimeChannels` leaks duplicate refs.
- **Why it matters:** Doubled handler invocations double the per-event work and the dirty-guard lookup; duplicate registrations leak. Data impact is neutralized by idempotent bulkPutSilent/bulkDeleteSilent and self-heals on the next clean re-subscribe (binding reset), so it's reliability/UX, not integrity.
- **Suggested fix:** Serialize with an in-flight promise (`this.realtimeSubscribePromise`: await/return if set), or snapshot-and-tear-down synchronously and guard with a monotonic subscribe-generation token so a stale in-flight build tears its own channels down.
- **Owner:** **SyncAuditAgents** (realtime concurrency guard).

#### P2-5 — Joining a global project never hydrates existing child rows into IndexedDB (offline-availability gap)
- **Location:** `use-global-projects.ts:229–238` (joinProject) + `sync-provider.tsx:144–153` (handleMembershipChanged) + `sync-manager.ts:1205–1208` (incremental `updated_at>=lastPulledAt` filter)
- **Area:** Realtime subscriptions & races (membership-change ingress)
- **Current behavior:** Join creates only the membership row (api.ts:474). `notifyMembershipChanged` makes the provider re-subscribe realtime (future events only) and refresh the project list. The newly-joined project's **pre-existing** child rows are never pulled: realtime delivers future changes only, and the next incremental pull filters `updated_at >= lastPulledAt`, excluding older rows forever. They land only via a full pull (first-login) or manual "Update from cloud." Detail UI reads live from Supabase, so online viewing works — but the offline IDB mirror stays empty.
- **Why it matters:** BAU Suite is offline-first. A tech joins on Wi-Fi, drives to a no-signal site, and the project's existing shared data is absent locally. Not data loss; an offline-availability gap.
- **Suggested fix:** In `handleMembershipChanged` (or joinProject's success path) trigger a one-shot hydration for the new membership — `triggerFullPull()` (tombstone-respecting) or a targeted `pullProjectEntities(globalProjectId)` ignoring the incremental cursor, then re-subscribe realtime AFTER hydration completes.
- **Owner:** **SyncAuditAgents**.

---

### P3

#### P3-1 — `leaveGlobalProject` leaves the entire local IndexedDB mirror behind (no cascade cleanup)
- **Location:** `use-global-projects.ts:313–317` (leave) vs `:301–311` (remove, which DOES cascade); helper `db.ts:839` cascadeDeleteGlobalProject
- **Area:** Multi-user global projects / local-mirror hygiene
- **Current behavior:** `remove` calls `cascadeDeleteGlobalProject(id)` after the server delete; `leave` only deletes the membership server-side and fires `notifyMembershipChanged` — it does NOT cascade. After leaving, the globalProjects row + all pulled child rows linger in IDB until a full-pull subtractive reconcile. The list view self-heals (memberships queried first), but the underlying data persists.
- **Why it matters:** Stale shared-project data lingers in the leaver's IDB; on the next fullSync the leaver's own-authored rows re-enqueue and hit 42501. *Verifier downgraded P2→P3:* the 42501 is dropped non-retryable, signature-deduped, and the next full pull reaps the rows — self-limiting cleanup nit, not churn/flood.
- **Suggested fix:** In the `leave` callback, after a successful `leaveGlobalProject`, call `await cascadeDeleteGlobalProject(id)` (same as `remove`), then `notifyMembershipChanged`.
- **Owner:** **BASAgents** (one-line parity fix).

#### P3-2 — A removed member's device keeps the project's local data and never cleans up
- **Location:** `api.ts:552` (removeMember, cloud-only DELETE); realtime refresh `use-global-projects.ts:349`; no local cleanup path
- **Area:** Multi-user global projects / membership removal
- **Current behavior:** On admin removal of member B, B's device gets a `global_project_members` DELETE realtime event that only refetches the member list (:349). B never receives `notifyMembershipChanged` (fires only on B's own create/join/leave), and nothing calls `cascadeDeleteGlobalProject`. B's local globalProjects row + child rows remain until B manually reloads the list. *Verifier downgraded P2→P3* for the same reasons as P3-1 (42501 dropped + deduped; self-heals on full pull). Same class as P2-1 from the membership-cache angle; this entry is the removal-ingress angle.
- **Suggested fix:** Subscribe each device to its OWN `global_project_members` rows (filter `user_id=eq.<me>`) and, on a DELETE of the current user's membership, run `cascadeDeleteGlobalProject(global_project_id)` + drop the project from local state; or reconcile local globalProjects against live membership on every global incremental pull (not gated on full pull).
- **Owner:** **SyncAuditAgents** (membership-revocation ingress). Consolidate the fix with P2-1.

#### P3-3 — Content-equality gate ignores fields cleared to `undefined`, can mask a real divergence and adopt the cloud row
- **Location:** `sync-manager.ts:107–116` (pushRowMatchesRemote iterates only pushRow keys) with toSupabaseRow's undefined-skip `field-map.ts:829`
- **Area:** Conflict detection (push-path content-equality gate)
- **Current behavior:** The payload pushed is the FULL local entity, but `toSupabaseRow` drops any `undefined`-valued field (:829), so a column the user cleared to literal `undefined` (not `''` — empty string is preserved/compared) is absent from pushRow. `pushRowMatchesRemote` never compares it against the remote's non-null value, returns true, and the gate adopts the cloud row via bulkPutSilent (:707–714), discarding the clear. Real trigger: `device-dialog.tsx:93–94` saves `macAddress: form.macAddress.trim() || undefined`.
- **Why it matters:** A member who clears an optional field (MAC/IP) with no other change has that clear silently reverted on the next conflicting sync. Narrow — gate only fires when remote is strictly newer (stale-base, defensible LWW) and only when the clear is the sole change.
- **Suggested fix:** In `pushRowMatchesRemote`, also fail-equality when an entity-owned column (per ENTITY_COLUMN_ALLOWLIST) is present-and-non-empty on remote but absent from pushRow — iterate the union of client-owned columns. Or normalize cleared nullable fields to `null` (not drop) in toSupabaseRow.
- **Owner:** **SyncAuditAgents** (conflict gate).

---

## 5. Cross-Cutting Observations

1. **"Online but idle never converges" is a recurring theme** spanning P1-2, P1-3, P2-1, P2-3, and P2-5. The system has exactly three pull triggers (first-login, `online` flip, manual) and realtime only for global tables. A single periodic incremental `pullSync` + a realtime status-callback backfill would close P1-2, P1-3, materially mitigate P2-1/P2-5, and bound P2-3. **Recommend treating these as one "convergence backstop" workstream.**

2. **Non-silent cascade on the pull/realtime apply path is the root of two issues** (P1-1 RLS-reject loop; the partial pull-path re-enqueue churn from the regression table). The `notifySync` loops in `db.ts:825–828` / `:922–925` are correct for user-initiated local deletes but wrong when applying a tombstone *received from the cloud*. A `{silent:true}` cascade variant is the single clean fix.

3. **Membership-revocation has no local-cleanup ingress at all** (P2-1, P3-1, P3-2). Project *deletion* self-heals via tombstones; member *removal/leave* produces no signal the leaver's device acts on. A membership-diff-on-pull (or self-membership realtime subscription) is the unifying fix across all three.

4. **`sync_version` semantics are correct on the push path but misapplied on the reconcile path** (P0-1). The push-path comparator (sync-manager.ts:678–695) compares the same counter against its last-seen snapshot — sound. The reconcile path (reconcile.ts:1343) compares two unrelated counters — unsound. Same field name, two different meanings; the reconcile path needs to stop trusting it.

5. **Fail-direction asymmetry between the two ingress dirty-guards** — pull fails SAFE (null→treat-all-dirty, sync-manager.ts:1309), realtime fails UNSAFE (`.catch(()=>false)`→apply overwrite, :1920). Minor, but a transient IDB read error during a realtime event can clobber a pending local edit. Worth aligning to fail-safe.

6. **Delete-wins is correct policy but loses a concurrent un-pushed edit silently** (regression-table residual). The incoming-tombstone branch (sync-manager.ts:1250) wins over a queued local edit; that edit later rewrites the row's columns while `deleted_at` stays set — net edit loss with no conflict capture. Consider an explicit conflict-capture rather than silent loss.

---

## 6. Refuted / Already-Safeguarded

The audit was adversarial; these candidates were checked and **dismissed** because an existing safeguard covers them.

| Candidate | Why refuted (safeguard) |
|---|---|
| **buildGlobalProjectRow forces `deleted_at:null`, so any re-share resurrects an admin's tombstone cloud-wide** | RLS. The tombstoned row physically exists (soft-delete only), so `onConflict:'id'` resolves to UPDATE, gated by "Admins can update global projects" (global-projects-schema.sql:179–181). A non-admin's re-share **errors** at reconcile.ts:1118 — cannot resurrect. Only an admin can, which is intended restore semantics. Severity invalid. |
| **Incremental pull cursor is client-clock stamped but filters server-owned `updated_at` — skew silently drops rows (P0)** | Two safeguards. (1) Global multi-user convergence runs on **realtime**, not the cursor (sync-manager.ts:1741–1819), so skew is irrelevant there. (2) For local entities, `runConsistencyCheck` detects both INSERT (count delta) and UPDATE (max-updated delta) variants and prompts a full-pull recovery (consistency-check.ts:185–197) — not silent/permanent. Real residual is a P2 reliability nudge, not P0. |
| **reconcile.test.ts codifies the cross-counter comparison as correct, masking a bug** | *(Distinct from P0-1.)* For this specific test's scenario `fromSupabaseRow` (field-map.ts:988–991) maps the **global** table's `sync_version` into the local row, so it IS the same counter's last-seen snapshot; asserting no-overwrite is correct convergence. The genuine bug is the *reconcile-path* cross-table comparison (P0-1), which is what should be fixed — and that fix includes correcting this test. |
| **updateGlobalProject().single() throws an opaque error for non-admin members** | UI gates all edit affordances behind `isAdmin` (client-page.tsx:173,590–592,595,936) so the 0-row `.single()` path is unreachable; and `safeUpdate` shows a fixed `'Failed to update project'` toast (:544–551), never the raw error. UX-only, fully covered. |
| **global_messages SELECT policy lacks `deleted_at IS NULL`** | Intentional. hotfix-delete-and-admin.sql:10–24 explicitly removed it because Postgres re-evaluates the SELECT/USING policy against UPDATE-targeted rows, making the soft-delete UPDATE no-op. App layer filters via api.ts:944 `.is('deleted_at', null)`. Adding the filter back is a regression. All 17 global child tables follow the same app-layer pattern. |
| **global_messages is a single cross-project board (any member reads/posts all)** | By design (file header). add-global-messages.sql:1 declares a cross-project board; `global_project_id` intentionally nullable :8; RLS gates on membership in any project :29–35,44–51; sole consumer fetchGlobalMessages (api.ts:937–946) reads the whole board for display. INSERT enforces `auth.uid()=created_by`, UPDATE/soft-delete author-only. No leak vs a per-project feature (none exists). |
| **In-flight paginated pull + concurrent realtime apply → stale-overwrite + advanced cursor** | `newPulledAt` is captured at the START of pullSync (sync-manager.ts:1113–1114, before any SELECT) and never reassigned. A realtime V2 that races a pull's stale V1 has `updated_at > newPulledAt`, so the next incremental pull (`>= newPulledAt`, :1205–1207) **re-fetches and converges** on the very next cycle. The transient one-interval stale window is cosmetic; the claimed permanent convergence gap does not hold. |

---

## 7. Bottom Line

**The prior remediation is real and holds.** All eleven prior findings (#1–#11) plus the v4.31.2 `created_by` stamp were re-verified live, not trusted from the doc — anti-resurrection (`deletedAt` stripped ahead of the allowlist), tombstone-aware pull + subtractive reconciliation, both ingress dirty-guards, version-primary conflict detection, the content-equality gate, the cross-user `foreignGlobalAuthor` guard with provably-complete coverage, the 42501 non-retryable backstop, FK-safe batch ordering, the composite-key preferences delete, the unfiltered global restore, the default-deny allowlist, and the atomic cascade RPC are all in place. The adversarial pass refuted seven plausible-looking candidates on existing safeguards.

**But sync is NOT yet certifiable for unsupervised multi-user co-editing.** This session surfaced defects outside the prior audit's slice:

- **1 P0** — `reconcile.ts:1343` compares two unrelated `sync_version` counters and **silently drops a member's local edit** on the documented "Save to Global" re-share. This is the exact multi-user data-loss class the audit exists to prevent. **Fix first.**
- **4 P1** — RLS-rejected outbound delete re-enqueue churn (P1-1); no periodic incremental pull / no local-table realtime (P1-2); realtime `subscribe()` with no reconnect backfill, a resurrection vector on missed DELETEs (P1-3); and an in-flight enqueue race that **resurrects a delete** (P1-4).

**Recommended next actions, in order:**
1. **P0-1** — strip the cross-counter version guard from the reconcile path (or persist `globalSyncVersion`); fix reconcile.test.ts:377–408. (SyncAuditAgents + BASAgents)
2. **P1-4** — compare-and-swap before `deleteSyncItem` (:771) to stop delete-resurrection. (SyncAuditAgents + test)
3. **P1-1** — silent cascade variant on the pull/realtime apply path; broaden the 42501 drop to global deletes. (SyncErrorAgents)
4. **P1-2 + P1-3** as one convergence-backstop workstream — periodic incremental pull + realtime status-callback backfill. (SyncAuditAgents)
5. Then the P2 cluster (membership-revocation cleanup P2-1/P3-1/P3-2 as one fix; sole-admin guard P2-2; server-stamped log timestamp P2-3; realtime concurrency guard P2-4; join hydration P2-5) and the P3 conflict-gate `undefined` edge (P3-3).

Until at least the P0 and the four P1s land, **certify sync as "trustworthy for single-user multi-device with known staleness windows" but NOT for unsupervised concurrent multi-user editing** — the Save-to-Global path can still eat an edit, and a delete can still fail to stick under a narrow race or a websocket drop.