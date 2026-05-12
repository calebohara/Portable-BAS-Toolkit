# ShareAgents — Implementation Log (2026-05-12)

**Date:** 2026-05-12
**Team:** ShareAgents (3 agents: Backend Engineer, Frontend/UX Engineer, Project Manager)
**Agents dispatched:** 3 across 2 waves (Backend + Frontend in parallel, then PM)
**Files:** 6 new + 4 modified
**Final gate:** `tsc --noEmit` 0 errors · `npm run test:run` 333/333 passing

---

## Goal

Three connected features in one round:

1. **Admin avatar badge** for pending account approvals — admins were unaware new users needed approval until they manually navigated to Settings → Admin.
2. **Share with User** — direct project sharing with named users instead of access-code-only Global sharing.
3. **Recipient notifications** — recipients get a DM (reuses existing Mail-icon badge) plus a once-per-session toast on next sign-in.

Stakeholder-chosen direction: auto-globalize + add member (reuses everything SyncAgents built); DM + toast for recipient signal.

Plan: `docs/ShareAgents-plan-2026-05-12.md`. Roster: `.claude/ShareAgents.md`.

---

## Audit Phase

| Agent role | Ownership area | Files read |
|---|---|---|
| Backend Engineer | DB RPC + API additions | `supabase/global-projects-schema.sql`, `add-account-approval.sql`, `src/lib/global-projects/api.ts` |
| Frontend / UX Engineer | TopBar badge + toast hooks | `src/components/layout/top-bar.tsx`, `src/hooks/use-inbox.ts`, `src/providers/auth-provider.tsx`, `src/providers/sync-provider.tsx` |
| Project Manager | Dialog + project page wiring | `share-to-global-dialog.tsx` (reference), `reconcile.ts`, `src/hooks/use-inbox.ts`, `src/app/projects/[...slug]/client-page.tsx` |

Pre-implementation recon answered three questions that shaped the plan:

- The existing top bar already has a DM unread badge on the Mail icon via `useInbox()`. So we don't need to *add* DM notifications — just an analogous admin-pending-approval badge on the avatar.
- Pending approvals already exist (`add-account-approval.sql`) but admins discover them only via Settings → Admin Tab. No real-time signal.
- DM table (`direct_messages`) already exists with full unread tracking. Reusing it for "shared with you" notifications cost zero new infrastructure.

---

## Fixes Applied

### P0 — Backend (RPC + API)

**`supabase/migrations/add-search-users-rpc.sql`** *(Backend Engineer)*

- *Issue:* The `profiles` RLS only lets co-members of a Global Project read each other's profiles. The Share-with-User dialog needs to search across all approved users — that's exactly what RLS forbids.
- *Fix:* New `SECURITY DEFINER` function `search_users(query text)` that bypasses the co-member-only SELECT policy with built-in safeguards: min query length 2, max 20 results, excludes caller, excludes unapproved users, returns only `id` + `display_name` + `avatar_url` + `created_at` (no email leakage). `revoke from public`, `grant execute to authenticated`.

**`src/lib/global-projects/api.ts`** *(Backend Engineer)*

- *Issue:* No CRUD layer existed for any of the new feature paths.
- *Fix:* New section `// ─── User Search & Direct Sharing ───` appended at EOF with four functions + two interfaces:
  - `searchUsersForSharing(query)` → calls the RPC; returns 0 rows below min length to save a round-trip.
  - `shareProjectWithUsers(globalProjectId, userIds[])` → upserts `global_project_members` rows with `role: 'member'`, `invited_by: caller`, `ignoreDuplicates: true`. Returns `{ added, alreadyMember }`.
  - `fetchPendingApprovalsCount()` → admin-only count via `head: true` against `profiles where approved = false`. RLS already restricts to admins; the hook adds defense-in-depth.
  - `fetchRecentSharesForCurrentUser(sinceIso)` → joins `global_project_members` to `global_projects!inner(name)` for rows where `user_id = me`, `joined_at > sinceIso`, and `invited_by IS NOT NULL` — the last predicate is the key discriminator that excludes the auto-add-creator membership row (its `invited_by` is null per the schema trigger), so the toast only fires when *someone else* shared with you.
- Embed-cast handles both single-object and array shapes from the join, defensive against the Supabase typing variance.

### P1 — Frontend (Badge + Toast Hooks)

**`src/hooks/use-pending-approvals.ts`** (new) *(Frontend Engineer)*

- *Issue:* Avatar badge needs a count, and admins should see it update in real time when new users sign up.
- *Fix:* Hook returns `{ count, loading, isAdmin }`. Admin-only via `profile.role === 'admin'`. Realtime subscribes to `profiles` for inserts/updates and refreshes the count. Non-admin path returns 0 with no API call.

**`src/hooks/use-recent-shares.ts`** (new) *(Frontend Engineer)*

- *Issue:* Toast needs to fire only for shares received since the user last acknowledged them.
- *Fix:* Returns `{ shares, count, clearSeen, refresh }`. Uses `localStorage('bau-suite:shares-last-seen')` as the floor timestamp; SSR-safe via `typeof localStorage !== 'undefined'` guards. `clearSeen()` stamps now() and zeros the list.

**`src/components/layout/top-bar.tsx`** *(Frontend Engineer)*

- *Issue:* No badge on user avatar.
- *Fix:* Wrapped the existing avatar in `<div className="relative">` and added a small absolute-positioned badge with `bg-destructive`/`text-destructive-foreground` (red — "needs attention" not "FYI"), mirroring the size + position pattern of the Mail badge but in a different color so the two badges are visually distinct. Capped at "9+". Only renders when `isAdmin && pendingCount > 0`. The existing Mail badge was untouched.

**`src/components/layout/recent-shares-toast.tsx`** (new) + **`src/app/layout.tsx`** (one-line mount) *(Frontend Engineer)*

- *Issue:* Toast needs a mount point that only fires once per session, only when authenticated.
- *Fix:* Tiny `null`-returning component with a `useRef`-guarded `useEffect` that fires `toast.info("N new projects shared with you", { action: { label: 'View', ... } })`. Mounted inside `AuthProvider`/`SyncProvider` from `layout.tsx` so `useAuth()` resolves. Guarded by `mode === 'authenticated'` so local-only users don't see it. Picked this over polluting `sync-provider.tsx` (already 200+ lines) — kept the diff minimal.

### P1 — Frontend (Project Page UX)

**`src/components/global-projects/share-with-user-dialog.tsx`** (new) *(Project Manager)*

- *Issue:* No way to pick a specific user to share with.
- *Fix:* Three-state dialog (`preview` → `sharing` → `success`) matching the pattern of `ShareToGlobalDialog`:
  - **Preview:** Search input (250ms debounce via vanilla `setTimeout` + cleanup, no lodash dep) with an autocomplete dropdown showing up to 20 results. Click adds the user as a chip. Backspace on empty input removes the last chip. Already-picked users are filtered out of the dropdown via dependency on `pickedUsers` in the search effect. Empty states: "No users found" (query ≥ 2) vs "Type to search" (query < 2).
  - **Sharing:** Step-wise progress messages: "Sharing project to Global..." → "Adding selected users..." → "Sending notifications...". Spinner pattern from `ShareToGlobalDialog`.
  - **Success:** "Project shared with N user(s)" or "...with N (M already had access)". Shows "X / Y notifications sent" with an amber `AlertTriangle` panel if any DM failed. "View Global Project" navigates via `navigateToGlobalProject`.
- Submit flow: auto-globalize via `reconcileLocalToGlobal()` if `!project.syncedGlobalId` → `shareProjectWithUsers(globalProjectId, userIds)` → DM each recipient via `useInbox().sendMessage(...)`. DM failures are non-fatal (logged + counted in summary).

**`src/app/projects/[...slug]/client-page.tsx`** *(Project Manager)*

- *Issue:* No entry point to the new dialog.
- *Fix:* Added a "Share with User" button to the action row in `OverviewSection`, placed between "Share to Global" and "Delete" for natural grouping. Plumbed a new `onShareWithUser` prop through `OverviewSection` matching the existing `onShare`/`onShareToGlobal` pattern. Added the `showShareWithUser` state at the page level and mounted the dialog alongside the other modals. New `UserPlus` icon from `lucide-react`. Mobile label "User" + icon (avoids ambiguity with three adjacent buttons on small screens).

### Cross-cutting notes

- **`ApiResult<T>` narrowing gotcha** — surfaced by Wave 1B during typecheck, relayed to Wave 2 mid-run. TypeScript only narrows the discriminated union on `=== null` checks, not on `if (!result.error)`. Both 1B and 2 used the explicit-null pattern (`if (result.error !== null) throw ...`) to keep consumers strict-mode safe.
- **DM-send is hook-only.** The inbox exposes `sendMessage` via `useInbox()` rather than as a free function. PM mounted the hook inside the dialog (only constructed when the dialog opens, so no idle cost) and called it directly. **Follow-up:** extract a non-hook `sendDirectMessage(args)` helper to `src/lib/inbox/api.ts` so consumers don't have to mount a hook purely for one-shot sending.

---

## Housekeeping

- Added `.gitignore` allowlist entries for `ShareAgents.md`, `ShareAgents-fixes-*.md`, `ShareAgents-plan-*.md` so the team's working docs ship with the work (matches BASAgents / DesignAgents / SyncAgents pattern).
- Authored `.claude/ShareAgents.md` (team roster) and `docs/ShareAgents-plan-2026-05-12.md` (implementation plan) at session start so all three agents read the same spec before touching code.
- `.claude/settings.local.json` was touched during the session (permission grants) but is excluded from commits per established convention.

---

## Verification

| Check | Command | Result |
|---|---|---|
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit` | **0 errors** in `src/lib`, `src/hooks`, `src/components`, `src/providers`, `src/app`, `src/types` |
| Unit tests | `npm run test:run` | **333/333 passing** across 8 test files (~500ms) |

Manual smoke (recommended before relying on the badge in prod):
- Sign in as admin → confirm the red badge appears on the avatar when there is at least one pending profile in the DB. Approve them → badge clears in real time via the profiles subscription.
- Share a project with a teammate's account → confirm a DM arrives in their inbox AND on their next sign-in they see the "N new project(s) shared with you" toast with a working "View" link.
- Click "Share with User" a second time and pick the same teammate → confirm the success screen shows "0 newly added, 1 already had access" — no duplicate membership row, but a fresh DM does get sent (intentional, treated as honest re-notification per plan section 8).

---

## Known Follow-Ups

1. **Search-throttle hardening.** `search_users` is currently unbounded server-side. A motivated user could enumerate the profile table by querying every two-letter prefix. Mitigated by min length + result cap + no-email return, but a proper rate-limit (Supabase Edge Function with IP throttle) would close the gap. Out of scope for this round; noted in plan §8.
2. **Display-name-only search.** Users without a `display_name` are unfindable — they can't be picked from the autocomplete. Onboarding doesn't currently require a display name. Either tighten onboarding to require one, or expand search to also match by email/first+last name. Stakeholder pass needed because email-search has privacy implications.
3. **Extract `sendDirectMessage` to a non-hook helper.** Currently the dialog mounts `useInbox()` solely to call `sendMessage`. A free function in `src/lib/inbox/api.ts` (or wherever DMs live) would clean this up and remove the implicit hook dependency on a one-shot operation.
4. **DM dedup.** Current behavior: every picked user gets a DM, even those who were already members. Treated as honest re-notification. If the team prefers "only DM newly-added users", filter `pickedUsers` against the `alreadyMember` set before the DM loop.
5. **Badge overflow cap inconsistency.** Mail badge caps at "9+", admin badge caps at "9+" to match. If pending-approval queues realistically grow >10, bumping the admin badge to "99+" is a one-line change.
6. **No PII shown in autocomplete.** Multiple users with the same display name are visually indistinguishable in the dropdown. Adding a subtle email hint (e.g., last 4 chars of email domain) would help disambiguate without leaking the full address. UX call.
