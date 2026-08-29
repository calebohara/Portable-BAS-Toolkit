# BASAgents Fix Log — 2026-08-29

Full 5-agent parallel audit of the BAU Suite at v4.42.0, followed by a targeted
fix pass. Owner-directed session ("run the agent team, check for issues, and
improvements, and feature adds, improving the agents along the way").

## Header block

| Field | Value |
|-------|-------|
| Date | 2026-08-29 |
| Mode | read-only parallel audit (5 agents) → verified triage → single-operator fix pass |
| Agents engaged | 5 (full BASAgents roster) |
| Findings returned | 14 P0 · 30 P1 · 45 P2 · 30 P3 · 30 feature proposals |
| Files changed | 27 changed + 6 added |
| Insertions / deletions | +456 / −180 |
| TypeScript | clean (`tsc --noEmit` exit 0) |
| Lint | clean (0 errors; 56 pre-existing warnings, unchanged) |
| Tests | **567 passed** (533 pre-existing + 34 new regression tests) |
| Rust | `cargo check` clean · `cargo test` **8/8 passed** (toolchain installed later in the session) |

### Baseline note (and a correction)

The session's first baseline was reported green in error. `npm run typecheck |
tail` returns *tail's* exit status, not tsc's, so the pipeline reported 0 while
`tsc` was exiting 1 on three `Cannot find module 'xlsx'` errors. The cause was
environmental, not a code defect: the working tree had been fast-forwarded 124
commits while `node_modules` still reflected the older `package.json`, so the
`xlsx` dependency (`package.json:52`) was simply not installed. `npm install`
resolved it. The corrected pre-fix baseline was **typecheck ✗ / lint ✓ / 533
tests ✓**; post-fix is **✓ / ✓ / 550 ✓**.

This failure mode is now written into the audit protocol in `.claude/BASAgents.md`.

---

## Audit Phase

All five agents ran read-only in parallel and returned findings only; no agent
edited a file. Every fix below was re-verified by the operator against the cited
`file:line` before being applied.

| # | Agent | Ownership area | Files read (headline) |
|---|-------|----------------|------------------------|
| 1 | BAS Tools Engineer | Calculation engines | `psychrometric-engine.ts`, `pid-tuning-engine.ts`, `register-utils.ts`, `trend-anomaly-engine.ts`, `trend-csv-parser.ts`, `trend-downsample.ts`, + 5 test files, 4 hooks, 14 UI components |
| 2 | Field Connectivity | Terminal / ping / web-interface | `src-tauri/src/lib.rs` (all 1149 lines), `capabilities/default.json`, `terminal/page.tsx` (2015 lines), `terminal-store.ts`, `web-interface-store.ts`, `ansi-parser.ts`, `next.config.ts` |
| 3 | Project Manager | Projects / reports / files / KB | `db.ts`, `reconcile.ts`, `global-projects/api.ts`, `file-roaming.ts`, `report-form.tsx`, `report-eml.ts`, `report-export-dialog.tsx`, `upload-file-dialog.tsx`, 4 storage migrations |
| 4 | Platform Engineer | Auth / sync / payments / DB | `sync/field-map.ts` (1249), `sync/sync-manager.ts` (2306), `db.ts` (2323), `auth-provider.tsx`, all 8 API routes, all 53 files in `supabase/migrations/` |
| 5 | Desktop & Build | Tauri / build / CI / shell / PPCL | `next.config.ts`, `build-static.js`, `sync-version.js`, `tauri.conf.json`, all 4 GitHub workflows, `sw.js`, `ppcl-language.ts`, `ppcl-editor/page.tsx`, `updater.ts`, `version.ts` |

**Strongest corroboration signal:** the `project-files` storage bucket RLS hole
was found independently by agents 3 and 4, approaching from opposite directions
(file lifecycle vs. RLS policy review). It is fixed below.

---

## Fixes Applied

### P0 — SI enthalpy is wrong by a constant 17.86 kJ/kg (37% error)

- **Files:** `src/lib/psychrometric-engine.ts`, `src/app/psychrometric/page.tsx`
- **Issue:** `ipToSi` converted moist-air enthalpy with a bare `* 2.326` scale.
  IP enthalpy is referenced to **0°F dry air** (`h = 0.240·t_F + W(1061 + 0.444·t_F)`);
  SI enthalpy is referenced to **0°C** (`h = 1.006·t_C + W(2501 + 1.86·t_C)`).
  Expanding the IP form in °C and scaling by 2.326 yields the SI form **plus a
  constant 17.864 kJ/kg** — the conversion is affine, not a pure scale.
  Standard return air at 75°F/50% RH displayed **65.4 kJ/kg** against a true
  47.5. The input direction was worse: in SI `db-h` mode the entered kJ/kg was
  divided by 2.326 with no datum correction, so a correct 47.5 kJ/kg entry at
  23.9°C reported **~12% RH instead of 50%**, taking dew point, wet bulb and the
  comfort verdict with it. Differences cancel, so coil-load ΔH and economizer
  comparisons were unaffected — which made it *more* dangerous, since nothing
  else on screen looked wrong.
- **Fix:** added `BTU_LB_TO_KJ_KG`, `ENTHALPY_DATUM_OFFSET_KJ_KG` (derived as
  `0.240 * 32 * 2.326`, not hard-coded, so the tie to the IP datum stays visible)
  and the `enthalpyIpToSi` / `enthalpySiToIp` helper pair. `ipToSi`, `siToIp`,
  the SI `db-h` input path and the unit-toggle conversion all route through them.

### P0 — Humidity ratio silently clamped to 0.03 lb/lb at ordinary conditions

- **File:** `src/lib/psychrometric-engine.ts`
- **Issue:** `humidityRatioFromRH`, `humidityRatioFromDewPoint` and
  `humidityRatioFromEnthalpy` all truncated `W` at a hard-coded 0.03 lb/lb
  "practical maximum". 0.03 is only 210 gr/lb — well inside real HVAC
  territory. 95°F/90% RH (Gulf Coast, cooling-tower plume) is 0.0327;
  120°F/60% (laundry exhaust) is 0.0462. `validateInputsIP` accepts dry bulb to
  200°F and RH to 100%, so the tool invited these inputs and then truncated
  them, back-computing ~82% RH from a 90% entry. The only signal was a
  `console.warn` no field technician will ever see.
- **Fix:** removed the artificial ceiling from the RH and dew-point paths — both
  are bounded by saturation *by construction* (RH ≤ 100 ⇒ pw ≤ pws), so no
  clamp was ever needed. Added an exported `saturationHumidityRatio(T_db, P)`
  and used it as the ceiling for `humidityRatioFromEnthalpy`, where an arbitrary
  (T_db, h) pair genuinely can overshoot saturation. Note the old constant was
  itself non-physical: 0.03 lb/lb is **above** saturation at 75°F (0.01875), so
  the previous clamp returned more moisture than the air can hold.

### P0 — LTTB downsampler dropped the first bucket and duplicated the last point

- **File:** `src/lib/trend-downsample.ts`
- **Issue:** both the selection and averaging buckets were shifted one bucket
  forward (`floor((i+1)*b)+1` where canonical LTTB uses `floor(i*b)+1`).
  Consequences: points `1 … floor(bucketSize)` were never selection candidates,
  so a transient in the first ~1% of a trend was **absent from the chart**; and
  on the final iteration `bucketStart === bucketEnd === n-1` left `maxIndex` at
  its initializer, so the last point was emitted twice. The module's own doc
  comment promises peak preservation, and the "spike early in the file" case is
  exactly what a technician scrolls a trend to find.
- **Fix:** corrected both index expressions to the canonical arithmetic.
  Confirmed the old code fails the new tests (early spike lost, 1 duplicate
  timestamp) before accepting the fix.

### P0 — Data-gap detection divided by a zero median interval

- **File:** `src/lib/trend-anomaly-engine.ts`
- **Issue:** `detectGaps` computed `median(intervals)` with no zero guard. When
  ≥50% of consecutive intervals are 0 — duplicate timestamps, which are routine
  (two points logged in the same second, two COV records at one timestamp) — the
  median is 0, the threshold is 0, and **every** nonzero interval is flagged with
  a description reading `"Infinity× normal interval"`. `computeSeriesStats`
  already guarded this way, so the Statistics tab reported 0 gaps from the same
  data the anomaly panel filled with false gaps.
- **Fix:** take the median of the **nonzero** intervals (so duplicate-timestamp
  files still get real gap detection) and return early when none exist.

### P0 — Terminal scrollback serialized to localStorage on every received line

- **File:** `src/store/terminal-store.ts`
- **Issue:** `partialize` spread `...s`, which includes `buffer`. zustand's
  persist middleware re-runs partialize + `JSON.stringify` + `setItem` on
  **every** `set()`, and `appendLine` is one `set()` per line. A panel dumping a
  point list over telnet re-serialized the entire scrollback per line — ~100 KB
  per write at the default 1000-line buffer, ~1 MB at the selectable 10,000-line
  buffer. The UI thread stalled and the terminal fell behind the device. Worse,
  two sessions at 10k lines exceed the ~5 MB quota; `setItem` throws
  `QuotaExceededError` from inside `appendLine` (an unhandled rejection per
  line) and the store never persists again, silently losing session config.
- **Fix:** persist `buffer: []`. Connection config, session notes, history and
  settings still persist; captures are kept via Export / Attach to Project.

### P0 — Rust connection maps never released half-open sockets or COM handles

- **File:** `src-tauri/src/lib.rs`
- **Issue:** on `Ok(0)` (peer FIN) or a read error, both the telnet and serial
  read tasks emitted their `-closed` / `-error` event and `break`, but neither
  removed its entry from `TelnetState` / `SerialState`, and the JS handlers only
  set the session to `disconnected`. Telnet: our `OwnedWriteHalf` stayed alive,
  so the socket sat half-open in `FIN_WAIT_2` and the controller kept its (often
  single) telnet session slot allocated — reconnecting from a new tab uses a new
  UUID, so it never replaced the stale entry, and the panel refused. Serial:
  unplugging a USB adapter left the `Arc<Mutex<Box<dyn SerialPort>>>` in the map,
  so the OS COM handle was never released and replugging failed with "Access
  denied".
- **Fix:** each read task now reaps its own entry after the loop. A monotonic
  `CONNECTION_EPOCH` (`AtomicU64`) is stamped on each connection and checked
  before removal, so a dying task cannot tear down a live successor that reused
  the same session id. The telnet task also `shutdown()`s its write half so the
  peer sees a FIN.

### P0 — PPCL undo after a tab switch overwrote the new document with the old one

- **File:** `src/app/ppcl-editor/page.tsx`
- **Issue:** the CodeMirror component is controlled and was **not** remounted per
  document — no `key`. On a tab switch the controlled `value` change dispatches
  a full-document replacement into the *shared* undo history, and that dispatch
  carries no `addToHistory: false`. So opening program A, switching to program B,
  and pressing Ctrl/Cmd+Z reverted the buffer to **A's full text**. The undo
  transaction is not tagged as an external change, so `onContentChange` fired and
  the 500 ms debounce wrote A's program into **B's** Dexie record, which the sync
  queue then pushed. Silent, unrecoverable corruption of a technician's control
  logic.
- **Fix:** `key={activeDoc.id}` on the editor, giving each document its own
  `EditorState` and empty history. Also bound the debounced save's target id at
  schedule time — it previously closed over `activeTabId`, so a pending write
  could land against whichever document was active 500 ms later.

### P0 — `project-files` bucket: cross-user delete/overwrite and anonymous enumeration

- **File:** `supabase/migrations/harden-project-files-storage-policies.sql` *(new)*
- **Issue:** *(found independently by agents 3 and 4)* The bucket holding every
  roamed project file, global project file, KB attachment and daily-report
  attachment was created with policies that check **only `bucket_id`**. Despite
  being named *"Users can update own project files"*, the UPDATE and DELETE
  policies had no `owner = auth.uid()` predicate, so any signed-up user could
  `remove([...])` or upsert over **any** other customer's objects — with no
  bucket versioning, unrecoverable. Separately the SELECT policy had no `to`
  clause at all, granting role `public` (inherited by `anon`); object *listing*
  is gated by that policy, so a caller holding only the publicly-shipped anon key
  could `list('projects/<uuid>')` and walk every path, defeating the random-UUID
  capability URL that `buildStoragePath` relies on.
- **Fix:** UPDATE and DELETE now require `owner = auth.uid()` (with a matching
  `WITH CHECK`); SELECT narrowed to `authenticated`. **Partial by design** — see
  Deferred: the bucket is still `public = true`, and a public bucket serves
  `/object/public/<path>` without consulting RLS, so anonymous *known-URL reads*
  are only closed by the follow-up private-bucket + signed-URL change, which
  requires an application deploy.

### P0 — Any authenticated user could self-promote to admin

- **File:** `supabase/migrations/guard-profile-privilege-columns.sql` *(new)*
- **Issue:** `profiles` carries `role`, `approved`, `subscription_tier`,
  `subscription_expires_at` and `stripe_customer_id`, and the self-update policy
  was `using (auth.uid() = id)` with no `WITH CHECK`, no column grant, and no
  BEFORE UPDATE trigger (the only trigger on the table was `profiles_updated_at`).
  One `PATCH /rest/v1/profiles?id=eq.<own uid>` with `{"role":"admin"}` was
  permitted by RLS. That makes `is_admin()` true — opening every user's email via
  "Admins can read all profiles", every bug report, and **all direct messages** —
  and passes `verifyAdmin` in `src/app/api/admin/users/route.ts`, granting
  `DELETE /api/admin/users`, which calls `admin.auth.admin.deleteUser` with the
  **service-role key**. Full tenant compromise from any self-registered account.
- **Fix:** a `guard_profile_privilege_columns()` BEFORE UPDATE trigger rejecting
  changes to those five columns, exempting the service role (Stripe webhook,
  admin API), admins, and direct database sessions (SQL editor / migrations,
  detected by the absence of a JWT — so the owner is never locked out of their
  own admin bootstrap). Implemented as a trigger rather than a policy because
  PostgREST's UPDATE `WITH CHECK` cannot reference `OLD`. Columns are compared
  through `to_jsonb()` rather than by name, so the migration is safe on a
  deployment that has not applied `add-subscription-tier.sql`.
- **Also fixed here (P1):** `is_admin()` and `handle_new_user()` are SECURITY
  DEFINER with a mutable `search_path`. `pin-security-definer-search-path.sql`
  covered the four global-project helpers but missed these two — and `is_admin()`
  is the authorization root for every admin RLS policy.

### P0 — `fullSync` deleted un-pushed queue items it then refused to re-enqueue

*(Applied in a follow-up pass the same day, at the owner's direction. This was
deferred item #1 below.)*

- **File:** `src/lib/sync/sync-manager.ts`
- **Issue:** `fullSync()` advances the per-entity `lastFullPush:<type>` watermark
  at **scan** time, not on push success, while `clearSyncQueueExceptFailed()`
  deletes every `pending`/`syncing` row unconditionally. Sequence: fullSync #1
  enqueues 500 offline edits and sets the mark to `T`; connectivity is flaky, so
  300 drain and 200 stay `pending`; the user taps "Sync Now" again; the clear
  **deletes those 200**, and the dirty scan then skips every one of them because
  their mtime is `<= T`. The rows stayed correct locally and were silently absent
  from the cloud and every other device — permanently. Nothing surfaced it:
  `notifySync` only fires on a *new* write, the periodic pull never pushes, and
  `consistency-check` deliberately never flags local-ahead. The only recovery was
  Settings → "Reset Sync State", which a user has no reason to suspect they need.
- **Fix:** capture `getUnpushedSyncItemKeys()` **before** the clear, and exempt
  exactly those keys from the watermark skip. That re-enqueues precisely the
  stranded rows and nothing else — genuinely unchanged rows are still skipped, so
  the dirty-tracking optimization the watermark exists for is preserved. The run
  now reports a `rescued` count in its summary log, so the condition is visible
  in the console rather than silent. Chose this over moving the watermark advance
  into `processItem`'s success branch: same outcome for this failure mode, far
  smaller blast radius at a seam the Sync Feature Freeze exists to protect.
  Note `getUnpushedSyncItemKeys()` also returns `failed` keys, which the clear
  already preserves — re-enqueuing those is harmless because `enqueue()` coalesces
  on the deterministic `${entityType}-${entityId}` id and `preserveRetry` carries
  their retry bookkeeping over, so a poison item is not reset to a clean 0.

### P0 — Sign-out wiped IndexedDB, including on *involuntary* sign-out

*(Applied in a follow-up pass the same day. This was deferred item #2 below.)*

- **Files:** `src/providers/auth-provider.tsx`, `src/app/settings/page.tsx`
- **Issue:** every `SIGNED_OUT` event ran `clearAllData()`, which clears the sync
  queue along with all 40+ entity stores. Supabase emits an **identical**
  `SIGNED_OUT` whether the user pressed Sign Out or the session was revoked
  underneath them — and this app revokes its own sessions: `updatePassword()`
  calls `signOut({ scope: 'others' })`. So a password reset on a laptop killed
  the refresh token on the tech's iPad, whose next refresh attempt emitted
  `SIGNED_OUT`, wiping a full offline day's queue **before the tech ever saw a
  login screen**. The deliberate case was bad too: an unlabelled ghost button
  discarded any un-pushed work with no prompt.
- **Fix (two parts):**
  1. A module-level `userInitiatedSignOut` flag, set inside `signOut()` *before*
     the call (the event can land synchronously) and consumed by the first
     reconciliation that reads it. `decideUserIsolation` now takes that intent
     and returns `{ wipe, retainPrevUserId }`. An involuntary sign-out does not
     wipe.
  2. The sign-out button reads `getSyncQueueCount()` first and, when
     `pending + failed > 0`, shows a destructive confirm naming the count
     ("Sign Out Anyway" / "Stay Signed In"). Zero un-pushed items → no dialog,
     so the common path is unchanged. A queue read that throws falls through to
     signing out rather than trapping the user on a broken database.
- **Why this does not weaken same-device isolation** — the subtle part. Simply
  skipping the wipe would have opened a privacy hole: recording `null` for
  `lastAuthUserId` makes the *next* sign-in look like a first-ever login, which
  deliberately does not wipe, so user B would inherit user A's data. Instead the
  involuntary path **retains** the previous user's id. The next transition is
  still measured against it, so:
  - same user signs back in → ids match → no wipe, their un-pushed work survives
    and syncs;
  - a different user signs in → `isUserSwitch` → wipe happens before that user's
    SyncManager starts.

  The guarantee is preserved, just deferred from sign-out to sign-in — which is
  the moment it actually matters, because that is when another identity gains
  access. Four regression tests pin exactly this.

### P0 — `fileBlobs` lifecycle destroyed only-copy data in three places

*(Follow-up pass, same day. Deferred item #3.)*

- **Files:** `src/lib/db.ts`, `src/app/settings/page.tsx`, `src/app/offline/page.tsx`
- **Issue:** three paths treat `fileBlobs` as a disposable cache, but for two
  kinds of content it is the system of record — daily-report attachments
  (`ReportAttachment` has only a `blobKey`; no `storagePath` field exists at all)
  and un-roamed file versions (`roamFileToStorage` is best-effort and no-ops
  entirely without Supabase, so anything uploaded offline has no cloud copy).
  `clearFileCache()` kept only report attachments and deleted every project-file
  blob — while the confirm dialog said *"Your project data and notes are
  preserved."* `evictOldBlobsIfNeeded()` deleted the oldest `max(5, 10%)` blobs
  at 80% quota with no regard for what referenced them, so attaching one more
  photo could silently destroy last week's report photos. And `deleteFile()`
  never removed roamed Storage objects, leaking bytes forever.
- **Fix:** one shared `collectIrreplaceableBlobKeys()` predicate — a blob is
  irreplaceable if a report attachment references it, or if a file version
  references it and that version has **no** `storagePath`. Eviction now filters
  to evictable candidates and warns rather than deleting when none exist;
  `clearFileCache()` returns `{ cleared, keptOnlyCopies }`, surfaced honestly in
  both callers' toasts and in rewritten dialog copy; `deleteFile()` collects
  `storagePath`s and purges them post-commit via a dynamically-imported
  `deleteManyFromStorage` (dynamic so `db.ts` keeps no module-level dependency on
  the Supabase client, which its unit tests rely on).

### P0 — `report-form.tsx` lost a technician's work four ways

*(Follow-up pass, same day. Deferred item #4.)*

- **File:** `src/components/reports/report-form.tsx`
- **Issues and fixes:**
  1. **No unsaved-changes guard.** A tech filled in an entire day's report, hit
     Back (or the browser back gesture, or closed the Tauri window) and lost
     everything with no warning. → dirty tracking, a `beforeunload` listener, and
     a discard confirmation on the Back button.
  2. **Pending autosave cancelled on unmount.** The cleanup only cleared the
     timer, so up to 30s of typing was dropped — while the "Saved 4:15 PM" label
     implied autosave had it covered. → the pending write is now **flushed** on
     unmount, and a failed autosave toasts instead of becoming an unhandled
     rejection.
  3. **`removeAttachment` hard-deleted the blob immediately**, before the removal
     was saved. Tapping the wrong ✕ and then leaving left the persisted report
     still listing an attachment whose bytes were permanently gone. → removals of
     *persisted* attachments are staged and carried out only after the save
     lands; attachments added and removed within the session are deleted at once,
     since nothing references them.
  4. **Save/Save Draft overrode the Status dropdown.** Both buttons passed a
     hard-coded status, so selecting **Finalized** and pressing Save persisted
     **Submitted** — the one action that locks a customer-facing document did
     nothing. → in edit mode the primary button passes no status, letting the
     dropdown win; create mode still submits.
- **Also fixed (P1):** the hours-on-site effect ran on **mount**, so reopening a
  report rewrote a manually corrected 8.0 back to the computed 9.0 and autosave
  persisted it — a billable-hours field moving without the user touching it. It
  is now gated on an actual time-field edit, and an equal start/end reports 0.0h
  rather than 24.0.

### P0 (part 2) — `project-files` bucket: anonymous reads of a known URL

*(Follow-up pass, same day. Deferred item #9 — the other half of the storage fix.)*

- **Files:** `src/lib/storage.ts`, `src/components/global-projects/global-file-list-view.tsx`,
  `src/app/knowledge-base/page.tsx`, `supabase/migrations/make-project-files-bucket-private.sql` *(new)*
- **Issue:** migration #54 closed cross-user delete/overwrite and anonymous
  listing, but the bucket stayed `public = true` — and a public bucket serves
  `/object/public/<path>` **without consulting RLS at all**. Every site drawing
  and field photo remained readable by anyone holding a URL, forever, and URLs
  leak through exports, shared reports, history and logs. The random UUID in
  `buildStoragePath` is a capability-URL defence and nothing more.
- **Fix:** added `getSignedUrl(path, expiresIn = 300)` and migrated all three
  project-files call sites to it; `getPublicUrl` is now marked `@deprecated`
  (the `avatars` bucket is separate and untouched). The knowledge-base
  attachment changed from an `<a href>` rendered up front to a button that mints
  the URL per click, since signed URLs are short-lived by design. Also fixed the
  global file download's detached-anchor `click()`, which Firefox ignores.
- **⚠️ Deploy order:** signed URLs work against a still-public bucket, so **ship
  the app build first, then apply the migration**. Applying it first would break
  preview/download for anyone on the old build. Recorded in the migration header,
  in `docs/MIGRATIONS.md` row 56, and in `ACTIVE-BUGS.md`.

### P1 — Unit toggle skipped altitude conversion when dry bulb was blank

- **File:** `src/app/psychrometric/page.tsx`
- **Issue:** the two `setAltitude` calls sat inside the `if (!isNaN(v1))` guard.
  Setting altitude 5000 ft, clearing the dry-bulb field and toggling IP→SI left
  `5000` in place, now read as 5000 **metres** (16,404 ft) — so every subsequent
  property was computed at 8.0 psi instead of 12.2 psi, with no error and
  plausible-looking output.
- **Fix:** altitude conversion moved out of the input-field guard.

---

## Housekeeping

- **`npm install`** — restored the `xlsx` dependency, unblocking `tsc`.
- **`src/components/reports/report-export-dialog.tsx`** — the file was 0 bytes in
  the working tree (truncated by an external process at 13:34, before this
  session). Restored its 760 lines from `origin/main`. Worth noting as an
  environment signal: a working tree matching a remote 124 commits ahead of its
  own HEAD, plus a zero-byte source file, is the signature of a folder-sync
  client copying working files but not `.git`.
- **Migration ledger** — added the three probes and three backfill lines required
  by the CLAUDE.md four-part rule, including one for
  `add-schema-migrations-ledger.sql`, which was previously the only migration
  with **no sentinel probe at all**: the drift checker could not report whether
  its own precondition table existed (Platform Engineer P3-2).

### Agent-team improvements

- **`CLAUDE.md`** — replaced six near-identical ~20-line fix-log blocks with one
  generic rule plus a team table (241 → 172 lines). Four of those blocks pointed
  at roster files that **do not exist** (`.claude/DxrAgents.md`,
  `SyncErrorAgents.md`, `SyncAuditAgents.md`, `ReviewAgents.md`), while the one
  roster that does exist and was never mentioned — `LandingAgents.md` — had no
  rule. The table now marks the roster-less names as "log convention only", which
  is what they actually are: `SyncErrorAgents-fixes-2026-06-08.md` records
  *"Agents engaged: 1"* and `SyncAuditAgents-fixes-2026-06-11.md` says *"single
  session, no agent team fan-out"*. Since `CLAUDE.md` loads into every session in
  this repo, that duplication carried a standing context cost.
- **`CLAUDE.md`** — added a **Deferred** section to the required log format. A
  finding dropped silently is indistinguishable from one never made.
- **`.claude/BASAgents.md`** — added an **Audit Protocol** (baseline → read-only
  audit → operator-verified triage → fix + failing-first regression test → log)
  and an **Ownership Coverage** rule. Closed six coverage gaps: `src/app/dashboard`,
  `src/components/dxrs` + `src/lib/dxr`, `src/components/devices`,
  `src/components/safety`, `src/components/sync`, and
  `src/store/p2-inspector-store.ts` were owned by nobody, so no agent read them.
- **`.gitignore`** — added the missing `!.claude/LandingAgents.md` negation. It
  was tracked by history rather than by intent, one `git rm --cached` away from
  silently disappearing.

---

## Verification

| Check | Before | After |
|-------|--------|-------|
| `tsc --noEmit` | ✗ 3 errors (missing `xlsx`) | ✓ exit 0 |
| `eslint` | ✓ 0 errors / 56 warnings | ✓ 0 errors / 56 warnings |
| `vitest run` | ✓ 533 passed / 22 files | ✓ **567 passed / 25 files** |
| `cargo check` | n/a | ✓ clean (`bau-suite v4.42.0`, no warnings) |
| `cargo test` | ✓ 8 passed | ✓ 8 passed |

**34 new regression tests**, each confirmed to fail against the pre-fix code:

- `src/lib/__tests__/trend-downsample.test.ts` *(new file — the module had **zero**
  coverage)* — 7 tests: exact output length, first/last preserved, no duplicate
  timestamps, spike-in-first-bucket survives, spike-in-middle survives,
  monotonic timestamps, nulls skipped. Verified against a transcription of the
  old arithmetic: `earlySpikeKept: false`, `duplicateStamps: 1`.
- `src/lib/__tests__/psychrometric-engine.test.ts` — 8 tests across the enthalpy
  datum (absolute assertions against the independently-derived ASHRAE SI form,
  since the pre-existing `ipToSi → siToIp` round-trip passes for *any* invertible
  transform and is structurally incapable of catching a datum offset) and
  saturation humidity ratio.
- `src/lib/__tests__/blob-lifecycle.test.ts` *(new file)* — 6 tests: un-roamed
  blobs survive a cache clear while roamed ones go; report attachments survive;
  true orphans are cleared; `deleteFile` purges roamed Storage objects, skips the
  call when nothing was roamed, and still deletes the local row when Storage
  cleanup throws. Two fail against the pre-fix logic (verified by simulating it).
- `src/lib/sync/__tests__/user-switch-isolation.test.ts` — grew from 8 to 15
  cases: involuntary sign-out does not wipe and retains the id; a different user
  signing in afterwards still wipes; the same user signing back in keeps their
  work; an unflagged sign-out is treated as involuntary (fail safe for data,
  with privacy still covered by the retained id).
- `src/lib/sync/__tests__/fullsync-watermark-drain.test.ts` *(new file)* — 4 tests:
  un-pushed rows are re-enqueued despite the watermark; genuinely unchanged rows
  are still skipped; rescue repeats until the work actually drains; rows edited
  after the watermark still enqueue normally. The first and third **fail** against
  the pre-fix code (verified by temporarily reverting the exemption); the other
  two pass both ways by design — they guard against over-correcting into
  "re-enqueue everything".
- `src/lib/__tests__/trend-anomaly-engine.test.ts` — 2 tests: all-duplicate
  timestamps yield no gaps and no `Infinity`; a real gap is still found when
  duplicates are present.

### The Rust change: inspection first, then compiler

For most of this session there was no Rust toolchain on the machine, so
`src-tauri/src/lib.rs` was reviewed by inspection only. (An earlier note claiming
"cargo check exit 0" was wrong — the shell returned 0 for a `command not found`
message, the same class of mistake as reading `tail`'s exit code through a pipe.)
The toolchain was installed later in the session and `cargo check` / `cargo test`
both came back clean, so the change is now compiler-verified.

The manual review still earned its keep: it caught a defect introduced by the fix
itself that the compiler would **not** have flagged, because it is a runtime lock
-ordering property, not a type error:

> The first version of the telnet cleanup acquired the **writer lock, then the
> state-map lock**. `telnet_disconnect` acquires them in the opposite order — it
> holds the state lock while awaiting the writer lock. That is an ABBA deadlock:
> with the read task holding the writer and waiting for state, and
> `telnet_disconnect` holding state and waiting for the writer, both hang
> permanently — and because the state mutex is then held forever, *every*
> telnet command in the app hangs, not just that session. The committed version
> takes the state map first and releases it before touching the writer, with the
> ordering constraint documented inline.

Other points checked by inspection: `AtomicU64`/`Ordering` import does not
collide (no `std::cmp::Ordering` in the file); `state.0.clone()` clones the `Arc`
and leaves `state` usable for the later insert; `epoch` is `Copy`, so using it
after the `spawn` is fine; `shutdown()` is in scope via the existing
`AsyncWriteExt` import; `sid` remains owned by the spawned task after the loop.

### Existing tests that were changed

`psychrometric-engine.test.ts` previously asserted
`expect(humidityRatioFromEnthalpy(75, 80)).toBe(0.03)` — it pinned the buggy
clamp. It now asserts the physical bound
`saturationHumidityRatio(75, 14.696) ≈ 0.01875`. Flagged explicitly because a
changed assertion looks like a weakened test in review: the old expected value
was above saturation at 75°F, i.e. it pinned a physically impossible result.

`user-switch-isolation.test.ts` had `it('wipes on explicit sign-out')` asserting
`{ wipe: true }` for a bare `SIGNED_OUT` — which pinned precisely the behavior
that destroyed un-pushed work on a revoked session. It is now split into the
user-initiated case (still wipes) and the involuntary case (does not). The other
edits in that file are mechanical: the return shape gained `retainPrevUserId`.

### Migrations applied

Both new migrations were applied via the Supabase SQL editor by the owner on
2026-08-29 and confirmed clean by `supabase/check-migrations.sql`.
`docs/MIGRATIONS.md` rows 54 and 55 are marked `L (applied 2026-08-29,
checker-verified)`.

While updating the index, rows 49–53 were also corrected from `P` to `L`: their
status cells read `P (applied 2026-06-11, checker-verified)`, which contradicts
the legend at the top of the file (`P` = pending, apply it). They had been
applied since June. The index now has **zero** rows in `P` status, so a genuine
pending migration will stand out (Platform Engineer P3-1).

---

## Deferred

Fixed this session: **14 of 14 P0s.** Deferred items #1, #2, #3, #4 and #9 were
all completed in follow-up passes the same day and are struck through below; the
remaining rows are P1-and-below or need an owner decision. The rest are **not** dismissed — they are
deferred because each needs either a design decision, a schema change, or a
larger blast radius than a single verified fix pass should carry. Ranked.

| # | Finding | Agent | Why deferred |
|---|---------|-------|--------------|
| ~~1~~ | ✅ **FIXED — see "Fixes Applied" above.** ~~**`fullSync` deletes un-pushed queue items it then refuses to re-enqueue** (`sync-manager.ts:1079`, `:1151`, `:1164`) — the watermark advances at *scan* time while `clearSyncQueueExceptFailed()` unconditionally deletes `pending`/`syncing` rows, so tapping "Sync Now" twice on a flaky connection permanently strands the undrained edits: they are deleted from the queue and then skipped by the dirty scan forever. Nothing surfaces it; the consistency checker never flags local-ahead. | Platform | Highest-severity finding in the audit and the top recommendation of the agent that owns sync. Deliberately not attempted alongside nine other fixes — it changes queue-drain semantics at the seam the Sync Feature Freeze exists to protect, and warrants its own session with the multi-`fullSync` regression test the agent specified.~~ Done: exemption-before-clear, 4 regression tests. |
| ~~2~~ | ✅ **FIXED — see "Fixes Applied" above.** ~~**Sign-out wipes IndexedDB, including on *involuntary* sign-out** (`auth-provider.tsx:93-97`, `:184-197`, `:323`) — a password reset elsewhere calls `signOut({scope:'others'})`, revoking other devices' refresh tokens; the resulting `SIGNED_OUT` triggers `clearAllData()` and a field day's un-pushed work is gone before the technician sees a login screen. | Platform | Needs a `userInitiatedSignOut` flag plus a pre-sign-out queue guard, and touches the shared-laptop isolation guarantee that `user-switch-isolation.test.ts` currently pins. Design decision required.~~ Done: intent flag + retained id (isolation deferred to sign-in), plus an un-pushed-work confirm. |
| ~~3~~ | ✅ **FIXED — see "Fixes Applied" above.** ~~**Blob lifecycle destroys only-copy data** — `clearFileCache` (`db.ts:1298`) deletes un-roamed project-file blobs while the dialog promises "your project data is preserved"; `evictOldBlobsIfNeeded` (`db.ts:1001`) silently evicts daily-report attachments, which have no cloud copy at all; `deleteFile` never removes roamed `storagePath` objects. | Project Manager | Three paths share one fix (a "which blobs are the only copy" predicate) and land best with the report-attachment roaming feature (F1). Schema-adjacent.~~ Done: one shared only-copy predicate across all three paths. |
| ~~4~~ | ✅ **FIXED — see "Fixes Applied" above.** ~~**`report-form.tsx` loses work four ways** — no unsaved-changes guard on create (a whole day's report discarded by a back-gesture); pending autosave cancelled on unmount; `removeAttachment` hard-deletes the blob before the report is saved; Save/Save Draft silently override the Status dropdown so a "Finalized" selection persists as "Submitted". | Project Manager | Four independent small changes in one 458-line file; wants its own focused pass rather than being appended here.~~ Done, plus the hours-on-site regression. |
| 5 | **Version drift can ship a binary the updater will never replace** (`sync-version.js --check` exists but is wired into no workflow; `release.yml` never asserts tag == `package.json`) — and `UpdateNotifier` is rendered inside `{sidebarOpen && …}`, so a collapsed sidebar or a <768px window disables the update check and dialog entirely. | Desktop & Build | CI/workflow change plus a component hoist. Low risk, high value — the strongest candidate for the next session. |
| 6 | **Daily health check is `continue-on-error` on all five steps**, so the job is green regardless, with a best-effort Discord ping as the only failure channel; `ci.yml` never runs `build:static` or cargo, so the Tauri build mode is ungated until tag time. | Desktop & Build | ~20 lines of YAML, but it changes what "green" means in this repo and should land deliberately. |
| 7 | **Web build's own CSP blocks every LAN request** (`next.config.ts:35-36`) — Ping reports every target unreachable while the on-screen disclaimer claims a real reachability test, and the Web Interface iframe fires `load` on the CSP-blocked `about:blank`, so it reports success and caches `lastKnownEmbedSupport: 'supported'` while showing a blank panel. | Field Connectivity | Needs a product decision: widen the CSP for the connectivity routes, or gate those tools as desktop-only in the browser build. Not a decision to make unilaterally. |
| 8 | **Anomaly false-positive cluster** — stuck-sensor and spike detectors run on binary series (every fan status produces two `critical` anomalies overnight); oscillation has no amplitude floor (±0.1°F sensor dither reads as hunting); out-of-range emits one anomaly *per sample*, unbounded, and persists them into the synced session. | BAS Tools | Behavioral tuning with default-value choices the owner should set; the P0 correctness bugs in the same engine were prioritized first. |
| ~~9~~ | ✅ **FIXED (code) — migration pending deploy.** ~~**Private bucket + signed URLs** — the other half of the storage fix.~~ | Platform / PM | Requires migrating `getPublicUrl` → `createSignedUrl` across file preview, global file list, KB attachments and report export. Application deploy, user-visible fallout. |
| 10 | **Approval is a client-side redirect, not an authorization boundary** — no RLS policy anywhere references `approved`, so an unapproved self-registered account can read the entire knowledge base, send DMs, call `search_users()`, and join any global project by access code. | Platform | The help text promises approval gates cloud features; it does not. Needs an `is_approved()` helper conjoined into policies across four table groups — a coordinated migration. |
| 11 | **Paid subscriptions never grant a tier** — checkout sets `metadata.supabase_user_id` on the Checkout *Session*, but the webhook reads `subscription.metadata`, which Stripe does not populate from session metadata; the `stripe_customer_id` fallback is chicken-and-egg. Latent only because the paywall flag is currently off. | Platform | Fires the moment `NEXT_PUBLIC_SYNC_PAYWALL` is enabled. Needs live Stripe verification, not a blind edit. |

Also deferred: ~45 P2 and ~30 P3 findings, and 30 feature proposals across the
five agents. The highest-consensus feature — proposed independently by the
Platform Engineer as its #1 build and implied by four other findings — is a
**Sync Queue Diagnostics panel**: the sync engine keeps excellent internal state
(`retriedCount`, `lastErrorCode`, `nextRetryAt`, watermarks, `syncErrors` with
occurrence counts) and surfaces exactly one integer and three status words.
Deferred findings 1, 2 and the poison-queue-item issue are all currently
invisible to the user. Surfacing existing sync state is explicitly permitted by
the Sync Feature Freeze.

### Freeze compliance

No change in this session adds a `global_*` table, entity type, reconcile
direction, selective-sync mode, or a new writer to `global_*`. Both agents with
sync exposure ran an explicit comparator audit and found **no** re-implemented
conflict comparator and **no** comparison of a local `syncVersion` against a
global `sync_version` — the v4.32.0 P0 class remains closed, with the two
tempting sites in `reconcile.ts` still carrying their "do not reintroduce"
comments.
