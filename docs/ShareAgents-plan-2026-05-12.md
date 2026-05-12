# ShareAgents — Implementation Plan

**Date:** 2026-05-12
**Team:** ShareAgents (3 agents — see `.claude/ShareAgents.md`)
**Goal:** Three connected features:
1. **Admin badge on user avatar** for pending account approvals.
2. **Share with User** flow: pick users from autocomplete, share the project with them.
3. **Recipient notifications**: DM in inbox + toast on next sign-in.

**Direction (stakeholder-chosen):** "Share with User" auto-globalizes (reconcile if needed) then INSERTs into `global_project_members`. Recipients get a DM and a one-time toast on sign-in.

---

## 1. Architecture summary

```
Sender side                              Recipient side
─────────────                            ──────────────
[Share with User]                        TopBar:
   pick users via autocomplete             ─ Mail badge (existed — DMs)
   ↓                                       ─ NEW: avatar badge (admin-only:
   reconcileLocalToGlobal() if needed         pending-approval count)
   ↓                                      App-shell mount:
   INSERT global_project_members          ─ NEW: toast on first session load
   ↓                                         ─ "N new shared projects"
   addDirectMessage() per recipient       Inbox:
                                          ─ DM "<Sender> shared <Project>"

DB additions
─────────────
- function search_users(query)  ← RPC for user autocomplete
- (no new tables)
- (no schema changes to existing tables)
```

Three concerns, three agents, two waves. Detail follows.

---

## 2. Database — single migration

### `supabase/migrations/add-search-users-rpc.sql`

```sql
-- Caller-safe user search. Returns up to 20 approved profiles whose
-- display_name contains the query. Excludes the caller themselves.
-- SECURITY DEFINER so it can read the profiles table independent of the
-- existing co-member-only SELECT policy.

create or replace function search_users(query text)
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select id, display_name, avatar_url, created_at
    from profiles
   where approved = true
     and id <> auth.uid()
     and length(trim(query)) >= 2
     and display_name ilike '%' || trim(query) || '%'
   order by display_name
   limit 20;
$$;

revoke all on function search_users(text) from public;
grant execute on function search_users(text) to authenticated;
```

**Notes:**
- Returns 0 rows if query is shorter than 2 chars — saves a round-trip.
- Excludes the caller so they can't accidentally share with themselves.
- Doesn't return email — display_name + avatar only. Privacy by default.
- If a user's `display_name` is null/empty they're not findable; that's intentional — non-onboarded users shouldn't appear in pickers.

No other migrations are needed. `global_project_members.invited_by` already exists.

---

## 3. API additions — `src/lib/global-projects/api.ts`

All new functions follow the existing `ApiResult<T>` convention, reuse `getClient`, `getCurrentUserId`, `ok`, `fail`, and `camelCaseKeys`.

```ts
export interface SearchableUser {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export async function searchUsersForSharing(
  query: string,
): Promise<ApiResult<SearchableUser[]>> {
  if (query.trim().length < 2) return ok([]);
  try {
    const { data, error } = await getClient().rpc('search_users', { query });
    if (error) return fail(error.message);
    return ok((data ?? []).map((r) => camelCaseKeys<SearchableUser>(r)));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function shareProjectWithUsers(
  globalProjectId: string,
  userIds: string[],
): Promise<ApiResult<{ added: number; alreadyMember: number }>> {
  if (userIds.length === 0) return ok({ added: 0, alreadyMember: 0 });
  try {
    const supabase = getClient();
    const inviter = await getCurrentUserId();
    const rows = userIds.map((uid) => ({
      global_project_id: globalProjectId,
      user_id: uid,
      role: 'member',
      invited_by: inviter,
    }));
    const { data, error } = await supabase
      .from('global_project_members')
      .upsert(rows, { onConflict: 'global_project_id,user_id', ignoreDuplicates: true })
      .select();
    if (error) return fail(error.message);
    const added = data?.length ?? 0;
    return ok({ added, alreadyMember: userIds.length - added });
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function fetchPendingApprovalsCount(): Promise<ApiResult<number>> {
  try {
    const supabase = getClient();
    const { count, error } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('approved', false);
    if (error) return fail(error.message);
    return ok(count ?? 0);
  } catch (err) {
    return fail((err as Error).message);
  }
}

export interface RecentShare {
  globalProjectId: string;
  projectName: string;
  joinedAt: string;
  invitedBy: string | null;
}

export async function fetchRecentSharesForCurrentUser(
  sinceIso: string,
): Promise<ApiResult<RecentShare[]>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from('global_project_members')
      .select('global_project_id, joined_at, invited_by, global_projects!inner(name)')
      .eq('user_id', userId)
      .gt('joined_at', sinceIso)
      .not('invited_by', 'is', null)
      .order('joined_at', { ascending: false });
    if (error) return fail(error.message);
    const shares = (data ?? []).map((r) => ({
      globalProjectId: r.global_project_id,
      projectName: (r.global_projects as unknown as { name: string }).name,
      joinedAt: r.joined_at,
      invitedBy: r.invited_by,
    }));
    return ok(shares);
  } catch (err) {
    return fail((err as Error).message);
  }
}
```

**Note for Backend agent:** `fetchPendingApprovalsCount` returns 0 for non-admins because the existing RLS on `profiles` already restricts reads. The hook will additionally gate visibility on the user's admin flag — defense in depth.

---

## 4. Hooks + UI — Frontend Engineer

### `src/hooks/use-pending-approvals.ts`

```ts
export function usePendingApprovals() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isAdmin) { setCount(0); setLoading(false); return; }
    try {
      setLoading(true);
      const result = await fetchPendingApprovalsCount();
      if (!result.error) setCount(result.data);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: refresh on profile inserts (new signup) or updates (approval flips)
  useEffect(() => {
    if (!isAdmin) return;
    const client = getSupabaseClient();
    if (!client) return;
    const ch = client.channel('pending-approvals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => refresh())
      .subscribe();
    return () => { client.removeChannel(ch); };
  }, [isAdmin, refresh]);

  return { count, loading, isAdmin };
}
```

### `src/hooks/use-recent-shares.ts`

```ts
const LAST_SEEN_KEY = 'bau-suite:shares-last-seen';

export function useRecentShares() {
  const [shares, setShares] = useState<RecentShare[]>([]);

  const refresh = useCallback(async () => {
    const lastSeen = typeof localStorage !== 'undefined'
      ? (localStorage.getItem(LAST_SEEN_KEY) ?? new Date(0).toISOString())
      : new Date(0).toISOString();
    const result = await fetchRecentSharesForCurrentUser(lastSeen);
    if (!result.error) setShares(result.data);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const clearSeen = useCallback(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    }
    setShares([]);
  }, []);

  return { shares, count: shares.length, clearSeen, refresh };
}
```

### `src/components/layout/top-bar.tsx` — admin avatar badge

Find the user-menu button (around line 140–170 per recon). Wrap the existing avatar with a small absolute-positioned badge:

```tsx
const { count: pendingCount, isAdmin } = usePendingApprovals();

// inside the user-menu trigger button:
<div className="relative">
  <Avatar ... />
  {isAdmin && pendingCount > 0 && (
    <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
      {pendingCount > 99 ? '99+' : pendingCount}
    </span>
  )}
</div>
```

Match the existing Mail-badge style verbatim (look at lines 131–135 of the current `top-bar.tsx` and mirror class names, sizes, offsets).

### Toast on sign-in — `src/providers/sync-provider.tsx` (or app shell)

Add a one-shot effect inside the auth-gated branch (where user is known to be logged in):

```tsx
const { shares, clearSeen } = useRecentShares();
const toastShownRef = useRef(false);

useEffect(() => {
  if (toastShownRef.current) return;
  if (shares.length === 0) return;
  toastShownRef.current = true;
  toast.info(`${shares.length} new ${shares.length === 1 ? 'project' : 'projects'} shared with you`, {
    action: {
      label: 'View',
      onClick: () => { router.push('/global-projects'); clearSeen(); },
    },
    duration: 8000,
  });
}, [shares.length]);
```

(The exact location for this depends on what the agent finds — could be `sync-provider.tsx`, a new tiny `recent-shares-toast.tsx` mounted from layout, or directly in `src/app/layout.tsx`. Frontend agent chooses, keeping it minimally invasive.)

---

## 5. ShareWithUserDialog — Project Manager

### `src/components/global-projects/share-with-user-dialog.tsx`

Three states (matches `ShareToGlobalDialog`): `preview` (pick users) → `sharing` → `success`.

**Preview state UI:**
- Title: "Share with User"
- Description: "Search for a user and share this project with them. They'll be added as a member of the Global Project."
- Search input (autoFocus, 250ms debounce).
- Picked-users chips row (X to remove each).
- Search results dropdown showing avatar + display_name. Click to add.
- Footer: Cancel + Share button (disabled when 0 picked).

**Submit logic:**

```tsx
const handleShare = useCallback(async () => {
  setState('sharing');
  try {
    // 1. Ensure project is global
    let globalProjectId = project.syncedGlobalId;
    if (!globalProjectId) {
      setProgressMessage('Sharing project to Global...');
      const reconcileResult = await reconcileLocalToGlobal(project.id);
      globalProjectId = reconcileResult.globalProjectId;
    }

    // 2. Add members
    setProgressMessage('Adding selected users...');
    const memberResult = unwrap(await shareProjectWithUsers(globalProjectId, pickedUsers.map(u => u.id)));

    // 3. DM each recipient
    setProgressMessage('Sending notifications...');
    for (const user of pickedUsers) {
      try {
        await addDirectMessage({
          recipientId: user.id,
          subject: `${myDisplayName} shared a project with you`,
          body: `${myDisplayName} shared the project "${project.name}" with you. Open Global Projects to view it.`,
        });
      } catch (e) {
        console.warn('[share-with-user] DM failed for', user.id, e);
      }
    }

    setResult({ added: memberResult.added, alreadyMember: memberResult.alreadyMember, globalProjectId });
    setState('success');
  } catch (e) {
    toast.error('Share failed: ' + (e instanceof Error ? e.message : 'Unknown'));
    setState('preview');
  }
}, [pickedUsers, project]);
```

**PM agent must locate** the existing DM-send function in `src/lib/inbox/` or `src/hooks/use-inbox.ts` and use it directly. If it's hook-only and not callable imperatively, expose an `addDirectMessage` from the inbox module that takes `{ recipientId, subject, body }`.

### `src/app/projects/[...slug]/client-page.tsx` — button placement

Around line 424, after the existing `<ShareToGlobalDialog>` button row:

```tsx
<Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowShareWithUser(true)}>
  <UserPlus className="h-4 w-4" />
  <span className="hidden sm:inline">Share with User</span>
</Button>
```

Plus the dialog mount:

```tsx
<ShareWithUserDialog
  open={showShareWithUser}
  onOpenChange={setShowShareWithUser}
  project={project}
/>
```

---

## 6. Wave plan

| Wave | Agent | Files touched | Depends on |
|---|---|---|---|
| 1 | Backend Engineer | `supabase/migrations/add-search-users-rpc.sql` (new), `src/lib/global-projects/api.ts` | — |
| 1 | Frontend Engineer | `src/hooks/use-pending-approvals.ts` (new), `src/hooks/use-recent-shares.ts` (new), `src/components/layout/top-bar.tsx`, app shell or `src/providers/sync-provider.tsx` | — |
| 2 | Project Manager | `src/components/global-projects/share-with-user-dialog.tsx` (new), `src/app/projects/[...slug]/client-page.tsx` (button + mount) | Wave 1 Backend |

Wave 1 fans out in parallel — different files. Wave 2 starts when Backend finishes, since the PM needs the API function names locked.

## 7. Verification gate

Each agent runs at the end:

1. `node node_modules/typescript/bin/tsc --noEmit` → expect 0 errors in scope.
2. `npm run test:run` → expect **333/333** passing still (no new tests in this round — Step-2 tests still cover the reconcile path used by Share with User).

Final orchestrator gate after Wave 2: typecheck + tests + manual smoke:
- Sign in as admin → confirm badge appears when a pending user exists.
- Share a project with a teammate's account → confirm DM lands + toast fires on their next sign-in.
- Re-share the same project with the same user → confirm `alreadyMember` count is correct, no duplicate DMs sent (PM agent must dedupe or accept the duplicate as honest signal).

## 8. Risks + open questions

- **Display-name search only.** Users without a `display_name` are unfindable. The existing onboarding flow may not require one. If "Caleb" can't find "Sam" because Sam never set a display name, that's a discoverability gap — flag for follow-up. Don't try to bolt email-search on without a stakeholder pass.
- **Toast duplication on hot-reload.** The `toastShownRef` guards against multi-fire within a render lifetime, but Next.js dev hot-reload may re-mount the provider and fire twice. Acceptable in dev; not a prod concern.
- **DM send failure non-fatal.** The current spec wraps each DM in try/catch and logs warnings. The user has already been added as a member, so the failure mode is "they were added but didn't get a heads-up." Surface a soft warning in the success state ("N of M notifications sent") if any DM fails.
- **`profile.role === 'admin'`** is the current check for admin. Confirm with the auth provider — if there's a more authoritative source (RPC / claim / RLS test), use it.
- **Search rate-limiting.** `search_users` is unbounded server-side. A motivated user could enumerate the profile table by querying every prefix. Consider adding a rate-limiter (e.g., Supabase Edge Function with IP throttle) in a follow-up. Out of scope for this round but document it.
