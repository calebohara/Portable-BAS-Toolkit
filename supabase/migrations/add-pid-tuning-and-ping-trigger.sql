-- ─── PID Tuning Sessions ──────────────────────────────────────────────────
-- Adds pid_tuning_sessions table for BAS field technician PID loop tuning.
-- Tracks setup, diagnosis, recommendations, and field notes per control loop.
--
-- Also adds the missing set_updated_at trigger on ping_sessions.
--
-- Run this once in Supabase SQL Editor.
-- ──────────────────────────────────────────────────────────────────────────

-- 1. PID Tuning Sessions table
create table if not exists pid_tuning_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  loop_name text not null default '',
  equipment text not null default '',
  loop_type text not null default 'generic',
  controlled_variable text not null default '',
  output_type text not null default 'valve',
  actuator_stroke_time real,
  action text not null default 'direct',
  control_mode text not null default 'pi',
  current_values jsonb not null default '{}',
  recommended_values jsonb not null default '{}',
  symptoms text[] not null default '{}',
  response_data jsonb not null default '{}',
  field_notes text not null default '',
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table pid_tuning_sessions enable row level security;

create policy "Users can manage their own PID tuning sessions"
  on pid_tuning_sessions for all using (auth.uid() = user_id);

create trigger pid_tuning_sessions_updated_at
  before update on pid_tuning_sessions
  for each row execute function set_updated_at();

create index if not exists idx_pid_tuning_project on pid_tuning_sessions(project_id);

-- 2. Missing trigger on ping_sessions (S3-5 fix)
-- The table and updated_at column already exist, but the trigger was never created.
-- Without it, incremental pull sync via updated_at >= lastPulledAt misses updates.
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'ping_sessions_updated_at'
  ) then
    create trigger ping_sessions_updated_at
      before update on ping_sessions
      for each row execute function set_updated_at();
  end if;
end
$$;

-- Reload PostgREST schema cache so the new table is immediately available
notify pgrst, 'reload schema';
