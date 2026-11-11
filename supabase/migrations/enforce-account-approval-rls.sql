-- ─── Enforce account approval at the database ──────────────────────────────
-- SECURITY FIX (BASAgents audit 2026-08-29, Platform Engineer P1-5;
-- ACTIVE-BUGS: AUTH-APPROVAL-NOT-ENFORCED).
--
-- THE HOLE
-- Account approval (add-account-approval.sql) was enforced only by a client
-- redirect in app-shell.tsx (`router.replace('/pending-approval')`). No RLS
-- policy anywhere referenced `profiles.approved`. A freshly self-registered,
-- UNAPPROVED account holding a valid JWT could, straight against PostgREST:
--   - read the whole knowledge base (kb_categories / kb_articles / kb_replies
--     are `to authenticated using (true)`), and post to it;
--   - send and read direct messages;
--   - read/post global-project messages for any project it is a member of;
--   - call search_users() to enumerate every approved user's display name;
--   - join ANY global project by access code via join_global_project().
--
-- THE FIX
-- 1. is_approved(): SECURITY DEFINER helper (same shape as is_admin()) so the
--    check doesn't recurse through profiles' own RLS. Admins count as approved.
-- 2. One RESTRICTIVE policy per table. Postgres ANDs restrictive policies with
--    the existing permissive ones, so every current rule keeps working exactly
--    as before for approved users and no existing policy is rewritten (which
--    also means this can't clobber a prod policy that drifted from the repo).
-- 3. search_users() and join_global_project() refuse unapproved callers.
--    Both are SECURITY DEFINER, so RLS alone wouldn't cover them.
--
-- NOT AFFECTED: the sync engine (none of these tables are synced), the
-- service role (bypasses RLS: webhook, admin API), and profiles itself (an
-- unapproved user must still read their own row to see the pending screen).
--
-- Safe to run multiple times (idempotent). Tables that don't exist on a
-- deployment are skipped rather than raising 42P01.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Helper.
create or replace function public.is_approved()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select approved or role = 'admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- 2. Restrictive policies. `(select ...)` makes Postgres evaluate the helper
--    once per statement instead of once per row.
do $$
declare
  t text;
begin
  foreach t in array array[
    'kb_categories',
    'kb_articles',
    'kb_replies',
    'direct_messages',
    'global_messages',
    'global_message_reads'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "Approved accounts only" on public.%I', t);
      execute format(
        'create policy "Approved accounts only" on public.%I '
        'as restrictive for all '
        'using ((select public.is_approved())) '
        'with check ((select public.is_approved()))',
        t
      );
    end if;
  end loop;
end $$;

-- 3a. search_users(): same body as add-search-users-rpc.sql plus the gate.
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
     and public.is_approved()
     and id <> auth.uid()
     and length(trim(query)) >= 2
     and display_name ilike '%' || trim(query) || '%'
   order by display_name
   limit 20;
$$;

revoke all on function search_users(text) from public;
grant execute on function search_users(text) to authenticated;

-- 3b. join_global_project(): same body as global-projects-schema.sql plus the
--     gate. `set search_path = public` is restated because CREATE OR REPLACE
--     resets function config, which would undo the pin from
--     pin-security-definer-search-path.sql.
create or replace function join_global_project(code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_project_name text;
  v_user_id uuid := auth.uid();
begin
  -- Unapproved accounts can't join anything (AUTH-APPROVAL-NOT-ENFORCED).
  if not public.is_approved() then
    return json_build_object('error', 'Your account is awaiting approval');
  end if;

  -- Normalize code to uppercase
  code := upper(trim(code));

  -- Find the project
  select id, name into v_project_id, v_project_name
  from global_projects
  where access_code = code
    and deleted_at is null
    and status = 'active';

  if v_project_id is null then
    return json_build_object('error', 'Invalid or expired access code');
  end if;

  -- Check if already a member
  if exists (
    select 1 from global_project_members
    where global_project_id = v_project_id
      and user_id = v_user_id
  ) then
    return json_build_object('error', 'You are already a member of this project');
  end if;

  -- Insert membership
  insert into global_project_members (id, global_project_id, user_id, role)
  values (gen_random_uuid(), v_project_id, v_user_id, 'member');

  return json_build_object(
    'project_id', v_project_id,
    'project_name', v_project_name,
    'role', 'member'
  );
end;
$$;

-- Record this migration in the ledger (see docs/MIGRATIONS.md). Guarded so it's
-- a true no-op if the ledger table doesn't exist yet — apply order doesn't matter.
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    insert into schema_migrations (id) values ('enforce-account-approval-rls.sql')
      on conflict (id) do nothing;
  end if;
end $$;
notify pgrst, 'reload schema';
