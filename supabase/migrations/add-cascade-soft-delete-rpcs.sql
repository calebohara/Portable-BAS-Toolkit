-- ─── Atomic Cascade Soft-Delete RPCs (Phase 3b) ─────────────────────────────
-- SyncAuditAgents-findings-2026-06-08.md — P2 "Reconcile/cascade non-atomic on
-- the server (partial-write orphans)".
--
-- PROBLEM: deleting a (global) project + its children was done as MANY separate
-- client-issued UPDATE statements (api.ts deleteGlobalProject, and the sync
-- queue's local-project soft-delete which only stamped the parent). A crash /
-- network drop mid-cascade leaves the parent tombstoned but some children still
-- live (deleted_at IS NULL) → orphaned rows that keep pushing against RLS and
-- can resurrect the parent on the next additive pull.
--
-- FIX: two SECURITY DEFINER functions that perform the parent soft-delete + the
-- full child cascade in ONE transaction (a plpgsql function body is atomic — it
-- either commits every UPDATE or rolls back all of them). The client calls these
-- via supabase.rpc() and FALLS BACK to the old per-statement path if the RPC
-- doesn't exist yet (so devices on an un-migrated DB keep working).
--
-- RLS: SECURITY DEFINER bypasses row-level security, so each function ENFORCES
-- the SAME authorization the table policies would, explicitly in its body:
--   • global: caller must be a project admin OR the project's creator
--     (mirrors "Admins or creator can delete global projects", added in
--      fix-global-projects-creator-can-edit.sql). Uses is_global_project_admin().
--   • local: caller must OWN the project (projects.user_id = auth.uid()), mirroring
--     the user-ownership RLS on the personal tables.
-- An unauthorized caller raises insufficient_privilege (mapped to 42501) and the
-- transaction makes NO writes.
--
-- PATTERN: information_schema-guarded dynamic UPDATEs so the cascade is a no-op
-- against any child table/column that doesn't exist on this database
-- (partial-schema-safe + re-runnable). Mirrors the guarded DO-loops used by
-- add-sync-version-insert-defaults.sql.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. GLOBAL project cascade soft-delete.
create or replace function cascade_soft_delete_global_project(p_global_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_creator uuid;
  v_now timestamptz := now();
  t text;
  child_tables text[] := array[
    'global_field_notes',
    'global_devices',
    'global_ip_plan',
    'global_daily_reports',
    'global_project_files',
    'global_network_diagrams',
    'global_ppcl_documents',
    'global_terminal_session_logs',
    'global_pid_tuning_sessions',
    'global_psych_sessions',
    'global_register_calculations',
    'global_ping_sessions',
    'global_trend_sessions',
    'global_connection_profiles',
    'global_field_panels',
    'global_project_notepad_entries',
    'global_dxrs'
  ];
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Authorization: must be the creator or a project admin (mirrors the
  -- "Admins or creator can delete global projects" RLS policy). The project
  -- must exist.
  select created_by into v_creator
  from global_projects
  where id = p_global_project_id;

  if v_creator is null then
    raise exception 'global project % not found', p_global_project_id using errcode = 'P0002';
  end if;

  if not (v_creator = v_uid or is_global_project_admin(p_global_project_id)) then
    raise exception 'not authorized to delete global project %', p_global_project_id
      using errcode = '42501';
  end if;

  -- Cascade: soft-delete every child row that is still live, then the parent.
  -- All within this function's single transaction → atomic.
  foreach t in array child_tables loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'deleted_at'
    ) then
      execute format(
        'update public.%I set deleted_at = $1 '
        || 'where global_project_id = $2 and deleted_at is null',
        t
      ) using v_now, p_global_project_id;
    end if;
  end loop;

  -- Parent last.
  update global_projects
    set deleted_at = v_now
    where id = p_global_project_id and deleted_at is null;
end;
$$;

revoke all on function cascade_soft_delete_global_project(uuid) from public;
grant execute on function cascade_soft_delete_global_project(uuid) to authenticated;

-- 2. LOCAL (user-owned) project cascade soft-delete.
create or replace function cascade_soft_delete_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_now timestamptz := now();
  t text;
  child_tables text[] := array[
    'project_files',
    'field_notes',
    'devices',
    'ip_plan',
    'daily_reports',
    'activity_log',
    'network_diagrams',
    'pid_tuning_sessions',
    'psych_sessions',
    'ppcl_documents',
    'register_calculations',
    'ping_sessions',
    'terminal_session_logs',
    'connection_profiles',
    'trend_sessions',
    'dxrs'
  ];
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Authorization: the caller must own the project (user-ownership RLS).
  select user_id into v_owner from projects where id = p_project_id;

  if v_owner is null then
    raise exception 'project % not found', p_project_id using errcode = 'P0002';
  end if;

  if v_owner <> v_uid then
    raise exception 'not authorized to delete project %', p_project_id using errcode = '42501';
  end if;

  -- Cascade: soft-delete children scoped to BOTH the project and the owner,
  -- then the parent. Atomic within this function body.
  foreach t in array child_tables loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'deleted_at'
    ) and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'project_id'
    ) then
      execute format(
        'update public.%I set deleted_at = $1 '
        || 'where project_id = $2 and user_id = $3 and deleted_at is null',
        t
      ) using v_now, p_project_id, v_uid;
    end if;
  end loop;

  update projects
    set deleted_at = v_now
    where id = p_project_id and user_id = v_uid and deleted_at is null;
end;
$$;

revoke all on function cascade_soft_delete_project(uuid) from public;
grant execute on function cascade_soft_delete_project(uuid) to authenticated;

-- Record this migration in the ledger (see docs/MIGRATIONS.md). Guarded so it's
-- a true no-op if the ledger table doesn't exist yet — apply order doesn't matter.
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    insert into schema_migrations (id) values ('add-cascade-soft-delete-rpcs.sql')
      on conflict (id) do nothing;
  end if;
end $$;

-- Reload PostgREST schema cache so the new RPCs are callable via supabase.rpc().
notify pgrst, 'reload schema';
