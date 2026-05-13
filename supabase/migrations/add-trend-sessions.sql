-- ─── Trend Sessions (per-user) ────────────────────────────────────────────────
-- Per-user mirror of the local IndexedDB `trendSessions` store. The schema.sql
-- file was missing this table, so SyncManager pull was raising PGRST205
-- "Could not find the table 'public.trend_sessions' in the schema cache".
--
-- Columns match the TS `TrendSession` interface in src/types/index.ts.
-- RLS: scoped by auth.uid() — same pattern as devices / pid_tuning_sessions.
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists trend_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null default '',
  description text not null default '',
  source_system text not null default '',
  series jsonb not null default '[]',
  data jsonb not null default '[]',
  anomalies jsonb not null default '[]',
  anomaly_config jsonb not null default '{}',
  stats jsonb not null default '[]',
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_trend_sessions_project
  on trend_sessions(project_id);

create index if not exists idx_trend_sessions_user_project
  on trend_sessions(user_id, project_id);

alter table trend_sessions enable row level security;

drop policy if exists "Users can manage their own trend sessions" on trend_sessions;
create policy "Users can manage their own trend sessions"
  on trend_sessions for all using (auth.uid() = user_id);

drop trigger if exists trend_sessions_updated_at on trend_sessions;
create trigger trend_sessions_updated_at
  before update on trend_sessions
  for each row execute function set_updated_at();
