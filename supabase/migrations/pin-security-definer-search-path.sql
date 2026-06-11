-- ─────────────────────────────────────────────────────────────────────────────
-- SEC-2 (SyncAudit 2026-06-08 s3): pin search_path on SECURITY DEFINER functions
-- ─────────────────────────────────────────────────────────────────────────────
-- The four original SECURITY DEFINER helpers from global-projects-schema.sql
-- were created WITHOUT a pinned search_path. A definer function inherits the
-- CALLER's search_path, so a crafted search_path could shadow the tables/
-- functions these helpers reference and execute attacker SQL with the
-- function owner's privileges. Every NEWER definer function in this project
-- already pins `set search_path = public` — this brings the original four up
-- to the same standard (standard Supabase lint 0011_function_search_path_mutable).
--
-- Idempotent: ALTER FUNCTION ... SET is a no-op-safe re-run. Guarded per
-- function so a missing function (un-migrated dev DB) doesn't abort the batch.

do $$
begin
  if to_regprocedure('public.is_global_project_member(uuid)') is not null then
    alter function public.is_global_project_member(uuid) set search_path = public;
  end if;
  if to_regprocedure('public.is_global_project_admin(uuid)') is not null then
    alter function public.is_global_project_admin(uuid) set search_path = public;
  end if;
  if to_regprocedure('public.join_global_project(text)') is not null then
    alter function public.join_global_project(text) set search_path = public;
  end if;
  if to_regprocedure('public.auto_add_global_project_creator()') is not null then
    alter function public.auto_add_global_project_creator() set search_path = public;
  end if;
end $$;

-- Record this migration in the ledger (see docs/MIGRATIONS.md). Guarded so it's
-- a true no-op if the ledger table doesn't exist yet — apply order doesn't matter.
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    insert into schema_migrations (id) values ('pin-security-definer-search-path.sql')
      on conflict (id) do nothing;
  end if;
end $$;
notify pgrst, 'reload schema';
