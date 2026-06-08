-- ─────────────────────────────────────────────────────────────────────────────
-- P2-2: prevent orphaning a global project by removing/demoting its last admin
-- ─────────────────────────────────────────────────────────────────────────────
-- The DELETE policy on global_project_members ("Admins or self can remove
-- members") lets the SOLE admin leave or be removed while other members remain.
-- Afterward every admin-gated policy (edit project, add members, update roles,
-- regenerate access code, delete) fails for everyone — the project becomes
-- permanently un-administrable with no in-app recovery path.
--
-- Fix: a BEFORE DELETE OR UPDATE trigger on global_project_members that rejects
-- removing OR demoting the last admin while >=1 OTHER member remains. An admin
-- who is the SOLE member may still leave (no one is stranded). The caller must
-- promote another member to admin first.
--
-- SECURITY DEFINER so the membership count sees ALL rows regardless of the
-- caller's RLS view; search_path pinned to public to prevent function hijacking.

create or replace function prevent_last_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gpid uuid;
  v_uid uuid;
  v_losing_admin boolean;
  remaining_admins int;
  remaining_others int;
begin
  if tg_op = 'DELETE' then
    v_gpid := old.global_project_id;
    v_uid := old.user_id;
    v_losing_admin := (old.role = 'admin');                       -- removed entirely
  else -- UPDATE
    v_gpid := old.global_project_id;
    v_uid := old.user_id;
    v_losing_admin := (old.role = 'admin' and new.role <> 'admin'); -- demoted
  end if;

  -- Only guard STANDALONE member changes on a LIVE project. When the parent
  -- project itself is being deleted, its members rows are removed by FK cascade
  -- (the parent row is already gone by the time this per-row trigger fires) —
  -- that's a legitimate teardown, not a last-admin removal, so let it through.
  if not exists (
    select 1 from global_projects where id = v_gpid and deleted_at is null
  ) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if v_losing_admin then
    select
      count(*) filter (where role = 'admin'),
      count(*)
    into remaining_admins, remaining_others
    from global_project_members
    where global_project_id = v_gpid
      and user_id <> v_uid;

    -- Block only when this leaves ZERO admins AND other members would be stranded.
    if remaining_admins = 0 and remaining_others > 0 then
      raise exception
        'Cannot remove or demote the last admin while other members remain. Promote another member to admin first.'
        using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists global_project_members_last_admin_guard on global_project_members;
create trigger global_project_members_last_admin_guard
  before delete or update on global_project_members
  for each row execute function prevent_last_admin_removal();

-- Record this migration in the ledger (see docs/MIGRATIONS.md). Guarded so it's
-- a true no-op if the ledger table doesn't exist yet — apply order doesn't matter.
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    insert into schema_migrations (id) values ('add-last-admin-guard.sql')
      on conflict (id) do nothing;
  end if;
end $$;

-- Reload PostgREST schema cache so the new function/trigger is picked up.
notify pgrst, 'reload schema';
