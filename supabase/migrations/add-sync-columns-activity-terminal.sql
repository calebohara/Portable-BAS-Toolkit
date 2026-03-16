-- ─── Sync Column Parity Fix ──────────────────────────────────────────────────
-- Adds missing sync columns to activity_log and terminal_session_logs tables
-- so they match the pattern used by all other synced tables.
--
-- Run this once in Supabase Dashboard → SQL Editor.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. activity_log — add deleted_at, sync_version, updated_at + trigger
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activity_log' and column_name = 'deleted_at'
  ) then
    alter table activity_log add column deleted_at timestamptz;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activity_log' and column_name = 'sync_version'
  ) then
    alter table activity_log add column sync_version int not null default 1;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activity_log' and column_name = 'updated_at'
  ) then
    alter table activity_log add column updated_at timestamptz not null default now();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'activity_log_updated_at'
  ) then
    create trigger activity_log_updated_at
      before update on activity_log
      for each row execute function set_updated_at();
  end if;
end
$$;

-- 2. terminal_session_logs — add updated_at + trigger
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'terminal_session_logs' and column_name = 'updated_at'
  ) then
    alter table terminal_session_logs add column updated_at timestamptz not null default now();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'terminal_session_logs_updated_at'
  ) then
    create trigger terminal_session_logs_updated_at
      before update on terminal_session_logs
      for each row execute function set_updated_at();
  end if;
end
$$;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
