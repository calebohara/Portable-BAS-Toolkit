# BASAgents Fix Log — 2026-11-11

Follow-up fix pass on the P1s left open by the 2026-08-29 BASAgents audit
(`docs/BASAgents-fixes-2026-08-29.md`, tracked in `docs/ACTIVE-BUGS.md`).
Owner-directed ("start on the open P1 bugs") after a status check-in. No new
audit was run; each original finding was re-verified against the current code
before it was fixed.

## Header block

| Field | Value |
|-------|-------|
| Date | 2026-11-11 |
| Mode | solo fix pass on existing findings (no audit fan-out) |
| Agents engaged | 1 (single operator, working under the BASAgents label) |
| Originating findings | BASAgents 2026-08-29: Desktop & Build P0-2 / P1-1 / P1-2 / P1-3, Platform P1-5 / P1-6 |
| Files changed | 18 modified + 4 added |
| Insertions / deletions | +966 / −179 (includes this log) |
| TypeScript | clean (`tsc --noEmit` exit 0) |
| Lint | clean (0 errors; 56 pre-existing warnings, unchanged) |
| Tests | **583 passed** (567 pre-existing + 16 new) |
| Static build | `npm run build:static` exit 0 |
| README check | `npm run check:readme` exit 0 (changelog `v4.43.1` matches `package.json`) |
| Version sync | `sync-version.js --check` exit 0 at 4.43.1 |
| Migration #57 | applied twice (idempotency) to a PGlite schema stub, then **24/24** behavioral checks pass |
| Rust | not run locally (no Rust source changed; the daily cron runs `cargo check`/`test`) |

### Baseline

`npm run health` on 2026-11-10 at v4.43.0: exit 0 (checked directly, not through
a pipe). Typecheck clean, lint 0 errors / 56 warnings, 567 tests in 25 files.
The daily health check had passed every day since v4.43.0, though that result
was meaningless on its own until the CI-ALWAYS-GREEN fix below.

---

## Audit Phase

No audit agents were spawned. The findings come from the 2026-08-29 audit; this
pass re-read every cited location before changing it.

| # | Agent | Ownership area | Files read |
|---|-------|----------------|------------|
| 1 | Operator (solo) | CI / release, desktop updater UI, payments, auth & RLS | `.github/workflows/{daily-health-check,ci,release}.yml`, `scripts/sync-version.js`, `src/components/layout/{sidebar,update-notifier}.tsx`, `src/app/api/subscribe/{checkout,checkout-redirect}/route.ts`, `src/app/api/donate/{webhook,checkout}/route.ts`, `src/lib/{stripe-config,paywall}.ts`, `src/providers/sync-provider.tsx`, `node_modules/stripe/types/{Subscriptions,SubscriptionItems,Checkout/Sessions}.d.ts`, `supabase/migrations/{add-account-approval,add-search-users-rpc,add-knowledge-base,add-direct-messages,hotfix-dm-delete-policies,add-global-messages,add-global-message-replies-reads,add-full-text-search,guard-profile-privilege-columns,pin-security-definer-search-path}.sql`, `supabase/global-projects-schema.sql`, `supabase/global-projects-reset.sql`, `src/lib/global-projects/api.ts` |

---

## Fixes Applied

### P1 — CI-ALWAYS-GREEN: the daily health check could never fail

- **Files:** `.github/workflows/daily-health-check.yml`, `.github/workflows/ci.yml`
- **Issue:** Every check step was `continue-on-error: true` so the registry
  and Discord steps always ran, but nothing turned the captured outcomes back
  into a job result, so the run was green whatever happened. The only failure
  signal was a Discord ping that does nothing when `DISCORD_WEBHOOK_URL` is
  unset. Separately, `ci.yml` ran neither `build:static` nor cargo, so a push
  that broke the Tauri static export went unnoticed until a tag was cut.
- **Fix:** Added a final `if: always()` step, "Fail if any check failed", that
  reads the five step outcomes and exits 1 if any is not `success`. A `skipped`
  outcome counts as a failure, because it means an earlier hard failure
  (e.g. `npm ci`) stopped the run. The registry update and Discord digest still
  run first. `ci.yml` gained a parallel `static-build` job running
  `npm run build:static`, so the fast typecheck/lint/test gate stays fast.
  Cargo stays on the daily cron, since it needs the Linux WebKit/GTK system
  packages.

### P1 — BUILD-VERSION-DRIFT: releases unguarded, update check disabled when collapsed

- **Files:** `.github/workflows/ci.yml`, `.github/workflows/release.yml`,
  `src/components/layout/sidebar.tsx`, `src/components/layout/update-notifier.tsx`
- **Issue:** `sync-version.js --check` was wired into no workflow, and
  `release.yml` never compared the tag to `package.json`. If
  `tauri.conf.json` drifted, tauri-action would publish a `latest.json` equal
  to the version clients already run, leaving them "up to date" forever while
  the sidebar showed the newer number. On top of that, `<UpdateNotifier />`
  (which owns the silent startup check) was rendered inside
  `{sidebarOpen && …}`, so a collapsed sidebar meant no update check at all.
- **Fix:** `ci.yml` runs `node scripts/sync-version.js --check` on every push.
  `release.yml` has a new "Assert tag matches package version" step (tag pushes
  only) that runs the same check and fails if `GITHUB_REF_NAME` ≠
  `v<package.json version>`. `UpdateNotifier` is now always mounted, at the
  same tree position so toggling the sidebar doesn't remount it and re-check.
  It takes a `collapsed` prop that renders an icon-only button with
  `aria-label`/`title`; the wrapper is `empty:hidden`, so the browser build,
  where the notifier renders nothing, gets no stray gap in the collapsed footer.

### P1 — STRIPE-TIER-NEVER-GRANTED: a first-time subscriber was charged and stayed on free

- **Files:** `src/app/api/subscribe/checkout/route.ts`,
  `src/app/api/subscribe/checkout-redirect/route.ts`,
  `src/app/api/donate/webhook/route.ts`, `src/lib/stripe-subscription.ts` (new),
  `src/lib/__tests__/stripe-subscription.test.ts` (new)
- **Issue:** Both checkout routes put `supabase_user_id` on the Checkout
  **Session** metadata only. Stripe does not copy session metadata onto the
  Subscription, and the webhook's `customer.subscription.*` handler read
  `subscription.metadata`, so the id was always missing. The fallback looks
  users up by `stripe_customer_id`, but only this webhook ever writes that
  column, so it can't match a first-time subscriber. `checkout.session.completed`,
  the one event that did carry the id, was only logged. This is latent while the
  paywall flag is off.
- **Fix:** Both routes now stamp the same metadata on the Session and on
  `subscription_data.metadata`, and set `client_reference_id`. The webhook now
  grants from `checkout.session.completed` (subscription mode) as well as from
  `customer.subscription.created/updated`. Stripe doesn't order events, so
  whichever arrives first grants and the other repeats the same write with no
  further effect. User resolution is: subscription metadata, then the
  session's id, then the `stripe_customer_id` link.
- **Verified against:** the SDK's pinned API version, `2026-02-25.clover`
  (`node_modules/stripe/cjs/apiVersion.js`). The webhook re-fetches the
  subscription through the SDK before acting, so the endpoint's own configured
  API version doesn't change the shape it reads.

### P2 — Found and fixed in the same webhook while working on the P1

These became live once the grant path started working, so they were fixed
with it rather than deferred.

- **`subscription_expires_at` was always null.** API 2025-03-31 ("basil")
  moved `current_period_end` from the Subscription to its items, and the code
  read the top-level field. As a result Settings never showed a "Renews …"
  date and `isInGracePeriod()` never applied a grace period after a downgrade.
  `periodEndIso()` now reads the item and falls back to the legacy field.
- **Grants ignored subscription status.** Every created/updated event with a
  known price granted the tier, so `unpaid` / `incomplete_expired` kept Pro.
  `resolveEntitlement()` now grants on `active` / `trialing` / `past_due`,
  revokes on `canceled` / `unpaid` / `incomplete_expired` / `paused`, and
  waits on `incomplete`.
- **Cancelling a monthly donation downgraded a subscriber.** Monthly donations
  are Stripe subscriptions (`donate/checkout` uses `mode: 'subscription'`).
  `customer.subscription.deleted` reset the customer's profile to free without
  checking the price, so a subscriber who also gave monthly lost their plan
  when they cancelled the donation. It now only revokes for a BAU Suite plan
  price.
- **Profile-write failures were swallowed.** The webhook returned 200 even when
  the PATCH failed, so Stripe never retried and the grant was lost. A failed
  write or lookup now returns 500, and Stripe retries for up to 3 days. A PATCH
  that matches no row (deleted account) is logged and not retried.
- **Unvalidated user id in a PostgREST filter.** The id comes from an
  unauthenticated request body or query string and was interpolated into
  `profiles?id=eq.<id>`. `asSupabaseUserId()` now accepts UUIDs only, at both
  checkout routes and in the webhook, so a crafted value can no longer append
  `&…` filters.
- **Out-of-order events.** created/updated events now re-fetch the
  subscription so they act on Stripe's current state, not a stale payload.

### P1 — AUTH-APPROVAL-NOT-ENFORCED: approval was a client redirect only

- **Files:** `supabase/migrations/enforce-account-approval-rls.sql` (new, #57),
  `supabase/check-migrations.sql`, `supabase/backfill-schema-migrations.sql`,
  `docs/MIGRATIONS.md`
- **Issue:** The only approval gate was `router.replace('/pending-approval')`
  in `app-shell.tsx`, and no RLS policy referenced `profiles.approved`. An
  unapproved account with a valid JWT could, calling PostgREST directly, read
  and post to the knowledge base (`to authenticated using (true)`), send and
  read DMs, read/post global messages, enumerate approved users through
  `search_users()`, and join any global project by access code through
  `join_global_project()`.
- **Fix:** Added an `is_approved()` SECURITY DEFINER helper (admins count as
  approved), plus one **RESTRICTIVE** `"Approved accounts only"` policy on each
  of `kb_categories`, `kb_articles`, `kb_replies`, `direct_messages`,
  `global_messages` and `global_message_reads`. Postgres ANDs restrictive
  policies with the existing permissive ones, so no existing policy is
  rewritten and a prod policy that drifted from the repo can't be overwritten.
  `search_users()` and `join_global_project()` are SECURITY DEFINER, so RLS
  doesn't cover them; they are re-created from their repo bodies with the gate
  added. `join_global_project` restates `set search_path = public`, because
  CREATE OR REPLACE resets function config and would otherwise undo #53's pin.
  Missing tables are skipped, and the migration is idempotent. All four
  migration-tracking updates required by CLAUDE.md are done: ledger footer,
  drift probe, backfill line and index row.
- **Freeze check:** No `global_*` table, entity type, sync mode or writer was
  added. The policies on `global_messages` / `global_message_reads` harden
  existing access paths, and neither table is touched by the sync engine
  (checked `src/lib/sync/`).
- **Status:** written and tested; **not yet applied to prod** (owner action).

---

## Housekeeping

- `docs/ACTIVE-BUGS.md`: moved CI-ALWAYS-GREEN, BUILD-VERSION-DRIFT and
  STRIPE-TIER-NEVER-GRANTED to "Recently resolved", and set
  AUTH-APPROVAL-NOT-ENFORCED to **awaiting migration**. Four rows still said
  "unreleased (BASAgents 2026-08-29)" although those fixes shipped in v4.43.0
  (`efd1ac1` → tag `v4.43.0`); they now say `v4.43.0`.
- Version 4.43.0 → **4.43.1** (patch) in `package.json`, `package-lock.json`,
  `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` and `src-tauri/tauri.conf.json`.
- `README.md`: added the v4.43.1 "What's New" entry.

---

## Verification

| Check | Command | Result |
|-------|---------|--------|
| TypeScript | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | exit 0 — 0 errors, 56 warnings (same count as baseline) |
| Unit tests | `npm run test:run` | exit 0 — 26 files, 583 tests |
| Static export | `npm run build:static` | exit 0 |
| README sync | `npm run check:readme` | exit 0 |
| Version sync | `node scripts/sync-version.js --check` | exit 0 at 4.43.1 |
| Migration #57 | PGlite (`@electric-sql/pglite` 0.3) stub of `profiles`, kb, DM, global-message and global-project tables with their repo policies; migration applied twice | 24/24: approved user unchanged (KB, DMs, global messages, search, join); unapproved user gets empty reads, RLS-rejected writes, empty search and a refused join, but can still read their own profile; admin with `approved=false` passes; anon gets empty results, not errors; `search_path` pinned on all three functions; ledger row written; drift-probe sentinel matches |

**Not verified in this session:**

- **The new CI steps** run for the first time on this push. The gate-step shell
  logic was reasoned through, not executed in Actions.
- **The collapsed-sidebar update button** wasn't checked visually. It renders
  only in the Tauri desktop build, and the browser preview needs a production
  sign-in.
- **Stripe end-to-end:** no test-mode keys were available. Run one subscription
  checkout in Stripe test mode before turning the paywall on.
- **Migration #57 against the real database:** tested on a stub only. Run
  `check-migrations.sql` after applying.

---

## Deferred

| Item | Reason |
|------|--------|
| STORAGE-BUCKET-STILL-PUBLIC (apply #56) | Owner action. The prerequisite app build (signed URLs) shipped in v4.43.0 on 2026-08-29, so `make-project-files-bucket-private.sql` is safe to apply now. |
| Apply #57 `enforce-account-approval-rls.sql` | Owner action (migrations are applied by hand in the SQL Editor). Order-independent. |
| WEB-CSP-BLOCKS-LAN | Needs a product decision. Note for whoever picks it up: an `https://` page's `fetch` to an `http://` LAN address is blocked as mixed content (and by private-network-access rules) whatever the CSP says, so widening `connect-src` alone won't make Ping work in the web build. Gating these tools to desktop-only, with honest messaging in the browser, looks like the realistic option. |
| TREND-ANOMALY-FALSE-POSITIVES (P2) | Needs default thresholds chosen (binary-series detection, oscillation amplitude floor, out-of-range rollup). |
| Two stale `bug_reports` rows (`rls-rejected on globalDevices` / `on globalActivityLog`) | Both fixed 2026-06-11 (SYNC-GDEV-42501 / SYNC-GACT-42501) but still `open` in Supabase, so they appear in every daily digest. The Supabase connector in this session points at a different project than the app, so they weren't closed here. |
| Weekly README review routine | Last committed 2026-09-07, so roughly nine weekly runs are missing. Check whether the `weekly-readme-review` routine is still enabled. |
| Desktop checkout has no 30-day trial | `checkout-redirect` never set `trial_period_days`, but web monthly checkout does. A pricing inconsistency, not a defect; left unchanged. |
| Checkout trusts a client-supplied user id | Anyone can start a checkout for any account id. That buys someone else a plan (no escalation), and the id is now UUID-validated. Deriving it from the caller's session would be cleaner. |
| 56 lint warnings | Pre-existing, mostly unused variables. Out of scope. |
