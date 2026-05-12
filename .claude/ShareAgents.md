# ShareAgents — Share-with-User + Approval / Share Notifications

**Team:** ShareAgents
**Project:** Portable-BAS-Toolkit (BAU Suite)
**Agents:** 3
**Purpose:** Add direct project sharing (pick a user, share the project with them) + two new top-bar notification signals (admin pending-approval badge, recipient new-share toast).
**Fix log rule:** After every audit + fix session, create `docs/ShareAgents-fixes-YYYY-MM-DD.md`. Same section structure as `BASAgents` / `SyncAgents` fix logs.

---

## Why this team exists

The app already has:
- Global Projects with membership + RLS (built by SyncAgents).
- Direct Messages with an unread-count badge on the Mail icon (`useInbox` → `top-bar.tsx`).
- Pending account approvals (`add-account-approval.sql`) — but admins have to actively navigate to Settings → Admin to discover them.

Three gaps to close:

1. **Admins have no signal** when a new user signs up and needs approval.
2. **There's no way to share a project with a specific person** — only with "anyone with the access code" via Share to Global.
3. **Recipients have no signal** when someone shares a project with them — they'd discover it only by manually opening the Global Projects list.

Direction chosen by stakeholder: **Auto-globalize + add member** (the share-with-user flow runs the existing reconcile if needed, then INSERTs into `global_project_members`). Recipient signals: **DM** (reuses existing unread badge) + **toast on sign-in** (single notice per session).

---

## Team Roster

### 1. Backend Engineer

**Role:** Owns the Postgres surface and the API layer that bridges the new dialog to Supabase. Specifically the user-search RPC (so the dialog's autocomplete works without leaking the full profile table) and the share-with-users API.

**Traits:** security · analytical · thorough
**Color:** #9B59B6
**Voice:** Daniel

**File ownership:**

```
supabase/migrations/            (new files only)
src/lib/global-projects/api.ts  (additions only — no edits to existing functions)
```

**Deliverables:**

- `supabase/migrations/add-search-users-rpc.sql` — `create function search_users(query text)` that returns up to 20 rows of `(id, display_name, avatar_url, created_at)` from `profiles` where `approved = true` and `display_name ilike '%' || query || '%'`. Requires `query` length ≥ 2. Security-definer with `set search_path = public`. Excludes the current user from results.
- `src/lib/global-projects/api.ts` additions:
  - `searchUsersForSharing(query: string)` — calls the RPC, returns `ApiResult<SearchableUser[]>`.
  - `shareProjectWithUsers(globalProjectId: string, userIds: string[])` — inserts `global_project_members` rows (role: `'member'`, `invited_by: auth.uid()`), idempotent (`onConflict: 'global_project_id,user_id'`).
  - `fetchPendingApprovalsCount()` — admin-only count via `head: true` on `profiles where approved = false`. Returns 0 if non-admin.
  - `fetchRecentSharesForCurrentUser(sinceIso: string)` — joins `global_project_members` to `global_projects` for rows where `user_id = auth.uid()` AND `joined_at > sinceIso` AND `invited_by IS NOT NULL` (excludes self-created memberships).

### 2. Frontend / UX Engineer

**Role:** Owns the top-bar avatar badge and the new-share toast. Builds the two hooks that feed them.

**Traits:** technical · skeptical · thorough
**Color:** #E74C3C
**Voice:** James

**File ownership:**

```
src/hooks/use-pending-approvals.ts      (new)
src/hooks/use-recent-shares.ts          (new)
src/components/layout/top-bar.tsx       (add admin badge)
src/providers/sync-provider.tsx         (or app shell — toast wiring; keep edits minimal)
```

**Deliverables:**

- `usePendingApprovals()` — returns `{ count, loading }`. Admin-only (use existing `useAuth` profile check). Realtime: subscribe to `profiles` inserts/updates and refresh. Returns 0 for non-admins.
- `useRecentShares()` — returns `{ shares, clearSeen }`. Uses `localStorage('shares-last-seen')` for the floor timestamp. `clearSeen` sets last-seen = now.
- TopBar avatar: small red badge with count, identical visual style to the Mail badge. Visible only when count > 0 AND user is admin.
- Toast on first-mount (per session): `"N new shared projects since your last visit"` with a button "View" that navigates to /global-projects and calls `clearSeen()`.

### 3. Project Manager

**Role:** Owns the `ShareWithUserDialog` and the button wire-up on the local project page. Coordinates the chain: pick users → reconcile if needed → add members → send DMs.

**Traits:** research · analytical · systematic
**Color:** #3498DB
**Voice:** Rachel

**File ownership:**

```
src/components/global-projects/share-with-user-dialog.tsx   (new)
src/app/projects/[...slug]/client-page.tsx                  (add button + dialog mount near line 424)
```

**Deliverables:**

- `ShareWithUserDialog` props: `{ open, onOpenChange, project }`. Three-state UX matching `ShareToGlobalDialog`: preview (pick users) → sharing → success.
- Search input with 250ms debounce, calls `searchUsersForSharing`. Dropdown shows up to 20 matches as cards with avatar + name. Click adds to picked-users chips. Backspace removes last chip.
- Submit:
  1. If `!project.syncedGlobalId`, call `reconcileLocalToGlobal(project.id)` and use the returned `globalProjectId`. Otherwise reuse the existing link.
  2. `shareProjectWithUsers(globalProjectId, pickedUserIds)`.
  3. For each user, post a DM via `addDirectMessage` (use existing helper in `src/lib/inbox` or wherever it lives — Agent 3, locate during recon): subject like `"<Sender> shared project '<Name>' with you"`, body with a deep link.
  4. Success state: show summary + "View Global Project" navigation.
- "Share with User" button placed next to "Share to Global" on `src/app/projects/[...slug]/client-page.tsx:424`. Same `<Button variant="outline" size="sm">` style.

---

## Spawn Order

| Wave | Agent | Blocks |
|---|---|---|
| 1 | Backend Engineer (parallel with Frontend) | Wave 2 |
| 1 | Frontend / UX Engineer (parallel with Backend) | — |
| 2 | Project Manager | — |

Wave 1's two agents touch entirely different files (`supabase/` + `api.ts` vs `hooks/` + `top-bar.tsx`), so they're parallel-safe. Wave 2 depends on the API function names from Wave 1.

## Ownership Rules

1. **`api.ts` additions** — Backend owns. PM consumes via imports; no co-editing.
2. **Migration files** — Backend owns. No other agent commits SQL.
3. **`top-bar.tsx`** — Frontend owns the admin-badge addition; existing Mail badge stays untouched.
4. **`projects/[...slug]/client-page.tsx`** — PM owns the new button + dialog mount; don't refactor surrounding code.
5. **Conflicts** — Backend → Frontend → PM order of precedence.

## Quick Reference

| Agent | Color | Voice | Traits |
|---|---|---|---|
| Backend Engineer | #9B59B6 | Daniel | security · analytical · thorough |
| Frontend / UX Engineer | #E74C3C | James | technical · skeptical · thorough |
| Project Manager | #3498DB | Rachel | research · analytical · systematic |
