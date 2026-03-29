-- Migration: Add psych_sessions table for psychrometric calculation sessions
-- Synced via the offline-first sync engine (IndexedDB <-> Supabase).

create table if not exists psych_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  label text not null default '',
  unit_system text not null default 'IP',
  altitude real not null default 0,
  input_mode text not null default 'dbwb',
  input_values jsonb not null default '{}',
  results jsonb not null default '{}',
  comfort_result jsonb not null default '{}',
  ahu_mixed_air jsonb,
  ahu_coil_load jsonb,
  notes text not null default '',
  tags text[] not null default '{}',
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table psych_sessions enable row level security;
create policy "Users can manage their own psych sessions"
  on psych_sessions for all using (auth.uid() = user_id);

create trigger psych_sessions_updated_at
  before update on psych_sessions
  for each row execute function set_updated_at();

create index if not exists idx_psych_sessions_user on psych_sessions(user_id);
create index if not exists idx_psych_sessions_project on psych_sessions(project_id);
