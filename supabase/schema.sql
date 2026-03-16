-- ─── BAU Suite — Supabase Schema ────────────────────────────────────────────
-- Run this SQL in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- to set up the database schema for BAU Suite.
--
-- Current state: Auth + Profiles (v3.2.0). Data sync is a future milestone.
-- All project data remains in IndexedDB. This schema mirrors the IndexedDB
-- structure so that a future sync layer can map 1:1.
--
-- Prerequisites:
--   - Email auth enabled in Supabase Dashboard → Authentication → Providers
--   - Site URL configured in Authentication → URL Configuration
-- ──────────────────────────────────────────────────────────────────────────────

-- ─── Utility: updated_at trigger function ───────────────────────────────────
-- Automatically sets updated_at = now() on any row update.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ─── Profiles ───────────────────────────────────────────────────────────────
-- One profile per authenticated user. Auto-created on first sign-in via app
-- code (upsert). Also bootstrapped via the trigger below on auth.users insert.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  first_name text not null default '',
  last_name text not null default '',
  display_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can read their own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can update their own profile"
  on profiles for update using (auth.uid() = id);
create policy "Users can insert their own profile"
  on profiles for insert with check (auth.uid() = id);

create trigger profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Auto-create profile when a new user signs up
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Drop existing trigger if it exists, then create
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─── Projects ───────────────────────────────────────────────────────────────
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  customer_name text not null default '',
  site_address text not null default '',
  building_area text not null default '',
  project_number text not null default '',
  technician_notes text not null default '',
  tags text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'on-hold', 'completed', 'archived')),
  contacts jsonb not null default '[]',
  panel_roster_summary text,
  network_summary text,
  is_pinned boolean not null default false,
  is_offline_available boolean not null default false,
  -- Sync readiness fields (not used yet — reserved for future sync layer)
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table projects enable row level security;
create policy "Users can manage their own projects"
  on projects for all using (auth.uid() = user_id);

create trigger projects_updated_at
  before update on projects
  for each row execute function set_updated_at();

-- ─── Project Files ──────────────────────────────────────────────────────────
create table if not exists project_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  file_name text not null,
  file_type text not null,
  mime_type text not null,
  category text not null default 'other',
  panel_system text,
  revision_number text not null default '',
  revision_date text not null default '',
  uploaded_by text not null default '',
  notes text not null default '',
  tags text[] not null default '{}',
  status text not null default 'current',
  is_pinned boolean not null default false,
  is_favorite boolean not null default false,
  size bigint not null default 0,
  current_version_id text not null default '',
  versions jsonb not null default '[]',
  -- Future: storage_path for Supabase Storage bucket reference
  storage_path text,
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table project_files enable row level security;
create policy "Users can manage their own files"
  on project_files for all using (auth.uid() = user_id);

create trigger project_files_updated_at
  before update on project_files
  for each row execute function set_updated_at();

-- ─── Field Notes ────────────────────────────────────────────────────────────
create table if not exists field_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  file_id uuid,
  content text not null default '',
  category text not null default 'general',
  author text not null default '',
  is_pinned boolean not null default false,
  tags text[] not null default '{}',
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table field_notes enable row level security;
create policy "Users can manage their own notes"
  on field_notes for all using (auth.uid() = user_id);

create trigger field_notes_updated_at
  before update on field_notes
  for each row execute function set_updated_at();

-- ─── Devices ────────────────────────────────────────────────────────────────
create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  device_name text not null,
  description text not null default '',
  system text not null default '',
  panel text not null default '',
  controller_type text not null default '',
  mac_address text,
  instance_number text,
  ip_address text,
  floor text not null default '',
  area text not null default '',
  status text not null default 'Not Commissioned',
  notes text not null default '',
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table devices enable row level security;
create policy "Users can manage their own devices"
  on devices for all using (auth.uid() = user_id);

create trigger devices_updated_at
  before update on devices
  for each row execute function set_updated_at();

-- ─── IP Plan ────────────────────────────────────────────────────────────────
create table if not exists ip_plan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  ip_address text not null,
  hostname text not null default '',
  panel text not null default '',
  vlan text not null default '',
  subnet text not null default '',
  device_role text not null default '',
  mac_address text,
  notes text not null default '',
  status text not null default 'active' check (status in ('active', 'reserved', 'available', 'conflict')),
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ip_plan enable row level security;
create policy "Users can manage their own IP entries"
  on ip_plan for all using (auth.uid() = user_id);

create trigger ip_plan_updated_at
  before update on ip_plan
  for each row execute function set_updated_at();

-- ─── Daily Reports ──────────────────────────────────────────────────────────
create table if not exists daily_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  date date not null,
  report_number int not null default 1,
  technician_name text not null default '',
  status text not null default 'draft' check (status in ('draft', 'submitted', 'finalized')),
  start_time text not null default '',
  end_time text not null default '',
  hours_on_site text not null default '',
  location text not null default '',
  weather text not null default '',
  work_completed text not null default '',
  issues_encountered text not null default '',
  work_planned_next text not null default '',
  coordination_notes text not null default '',
  equipment_worked_on text not null default '',
  device_ip_changes text not null default '',
  safety_notes text not null default '',
  general_notes text not null default '',
  attachments jsonb not null default '[]',
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table daily_reports enable row level security;
create policy "Users can manage their own reports"
  on daily_reports for all using (auth.uid() = user_id);

create trigger daily_reports_updated_at
  before update on daily_reports
  for each row execute function set_updated_at();

-- ─── Activity Log ───────────────────────────────────────────────────────────
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  action text not null,
  details text not null default '',
  file_id uuid,
  timestamp timestamptz not null default now(),
  deleted_at timestamptz,
  sync_version int not null default 1,
  updated_at timestamptz not null default now()
);

alter table activity_log enable row level security;
create policy "Users can manage their own activity"
  on activity_log for all using (auth.uid() = user_id);

create trigger activity_log_updated_at
  before update on activity_log
  for each row execute function set_updated_at();

-- ─── Network Diagrams ───────────────────────────────────────────────────────
create table if not exists network_diagrams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text not null default '',
  nodes jsonb not null default '[]',
  connections jsonb not null default '[]',
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table network_diagrams enable row level security;
create policy "Users can manage their own diagrams"
  on network_diagrams for all using (auth.uid() = user_id);

create trigger network_diagrams_updated_at
  before update on network_diagrams
  for each row execute function set_updated_at();

-- ─── Command Snippets ───────────────────────────────────────────────────────
create table if not exists command_snippets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  command text not null,
  label text not null,
  description text not null default '',
  category text not null default 'general',
  tags text[] not null default '{}',
  is_favorite boolean not null default false,
  usage_count int not null default 0,
  last_used_at timestamptz,
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table command_snippets enable row level security;
create policy "Users can manage their own snippets"
  on command_snippets for all using (auth.uid() = user_id);

create trigger command_snippets_updated_at
  before update on command_snippets
  for each row execute function set_updated_at();

-- ─── Connection Profiles ────────────────────────────────────────────────────
create table if not exists connection_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  connection_type text not null default 'tcp',
  serial_port text not null default '',
  baud_rate int not null default 9600,
  data_bits int not null default 8,
  parity text not null default 'none',
  stop_bits text not null default '1',
  flow_control text not null default 'none',
  host text not null default '',
  port int not null default 23,
  local_echo boolean not null default false,
  line_ending text not null default '\r\n',
  logging boolean not null default true,
  project_id uuid references projects(id) on delete set null,
  notes text not null default '',
  is_favorite boolean not null default false,
  tags text[] not null default '{}',
  last_connected_at timestamptz,
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table connection_profiles enable row level security;
create policy "Users can manage their own profiles"
  on connection_profiles for all using (auth.uid() = user_id);

create trigger connection_profiles_updated_at
  before update on connection_profiles
  for each row execute function set_updated_at();

-- ─── Register Calculations ──────────────────────────────────────────────────
create table if not exists register_calculations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  label text not null,
  module text not null,
  category text not null default 'general',
  inputs jsonb not null default '{}',
  result jsonb not null default '{}',
  notes text not null default '',
  tags text[] not null default '{}',
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table register_calculations enable row level security;
create policy "Users can manage their own calculations"
  on register_calculations for all using (auth.uid() = user_id);

create trigger register_calculations_updated_at
  before update on register_calculations
  for each row execute function set_updated_at();

-- ─── Ping Sessions ──────────────────────────────────────────────────────────
create table if not exists ping_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  targets jsonb not null default '[]',
  results jsonb not null default '{}',
  mode text not null default 'single',
  interval_ms int not null default 1000,
  completed_at timestamptz,
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ping_sessions enable row level security;
create policy "Users can manage their own ping sessions"
  on ping_sessions for all using (auth.uid() = user_id);

create trigger ping_sessions_updated_at
  before update on ping_sessions
  for each row execute function set_updated_at();

-- ─── Terminal Session Logs ──────────────────────────────────────────────────
create table if not exists terminal_session_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  session_label text not null default '',
  connection_mode text not null default 'tcp',
  host text not null default '',
  port int not null default 23,
  serial_port text not null default '',
  baud_rate int not null default 9600,
  line_count int not null default 0,
  log_content text not null default '',
  started_at timestamptz,
  ended_at timestamptz,
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table terminal_session_logs enable row level security;
create policy "Users can manage their own terminal logs"
  on terminal_session_logs for all using (auth.uid() = user_id);

create trigger terminal_session_logs_updated_at
  before update on terminal_session_logs
  for each row execute function set_updated_at();

-- ─── PID Tuning Sessions ──────────────────────────────────────────────────
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

-- ─── Project Notepad Entries ─────────────────────────────────────────────────
-- Per-project notepad notes (independent from the floating sticky notepad).
create table if not exists project_notepad_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null default '',
  content text not null default '',
  linked_tab_id text,
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table project_notepad_entries enable row level security;
create policy "Users can manage their own notepad entries"
  on project_notepad_entries for all using (auth.uid() = user_id);

create trigger project_notepad_entries_updated_at
  before update on project_notepad_entries
  for each row execute function set_updated_at();

-- ─── User Settings ──────────────────────────────────────────────────────────
-- Per-user app preferences that may sync across devices in the future.
-- Currently stored in Zustand/localStorage; this table is for future sync.
create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  sidebar_collapsed boolean not null default false,
  preferences jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;
create policy "Users can manage their own settings"
  on user_settings for all using (auth.uid() = user_id);

create trigger user_settings_updated_at
  before update on user_settings
  for each row execute function set_updated_at();

-- ─── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_projects_user on projects(user_id);
create index if not exists idx_projects_status on projects(user_id, status);
create index if not exists idx_files_project on project_files(project_id);
create index if not exists idx_files_user on project_files(user_id);
create index if not exists idx_notes_project on field_notes(project_id);
create index if not exists idx_devices_project on devices(project_id);
create index if not exists idx_ip_plan_project on ip_plan(project_id);
create index if not exists idx_reports_project on daily_reports(project_id);
create index if not exists idx_reports_date on daily_reports(user_id, date);
create index if not exists idx_activity_project on activity_log(project_id);
create index if not exists idx_activity_timestamp on activity_log(project_id, timestamp);
create index if not exists idx_diagrams_project on network_diagrams(project_id);
create index if not exists idx_snippets_user on command_snippets(user_id);
create index if not exists idx_conn_profiles_user on connection_profiles(user_id);
create index if not exists idx_calcs_project on register_calculations(project_id);
create index if not exists idx_ping_project on ping_sessions(project_id);
create index if not exists idx_terminal_project on terminal_session_logs(project_id);
create index if not exists idx_pid_tuning_project on pid_tuning_sessions(project_id);
create index if not exists idx_notepad_entries_project on project_notepad_entries(project_id);
create index if not exists idx_notepad_entries_user on project_notepad_entries(user_id);
