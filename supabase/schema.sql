-- ─── BAU Suite — Supabase Schema Reference ─────────────────────────────────
-- This file documents the planned Supabase schema for future cloud sync.
-- It is NOT applied automatically — use it as a reference when setting up
-- your Supabase project.
--
-- Current state: Auth only (v3.0.0). Data sync is a future milestone.
-- All data remains in IndexedDB. This schema mirrors the IndexedDB structure
-- so that a future sync layer can map 1:1.
-- ──────────────────────────────────────────────────────────────────────────────

-- ─── Enable RLS on all tables ───────────────────────────────────────────────
-- Every table uses Row Level Security so users can only access their own data.

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table projects enable row level security;
create policy "Users can manage their own projects"
  on projects for all using (auth.uid() = user_id);

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table project_files enable row level security;
create policy "Users can manage their own files"
  on project_files for all using (auth.uid() = user_id);

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table field_notes enable row level security;
create policy "Users can manage their own notes"
  on field_notes for all using (auth.uid() = user_id);

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table devices enable row level security;
create policy "Users can manage their own devices"
  on devices for all using (auth.uid() = user_id);

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ip_plan enable row level security;
create policy "Users can manage their own IP entries"
  on ip_plan for all using (auth.uid() = user_id);

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table daily_reports enable row level security;
create policy "Users can manage their own reports"
  on daily_reports for all using (auth.uid() = user_id);

-- ─── Activity Log ───────────────────────────────────────────────────────────
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  action text not null,
  details text not null default '',
  file_id uuid,
  timestamp timestamptz not null default now()
);

alter table activity_log enable row level security;
create policy "Users can manage their own activity"
  on activity_log for all using (auth.uid() = user_id);

-- ─── Network Diagrams ───────────────────────────────────────────────────────
create table if not exists network_diagrams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text not null default '',
  nodes jsonb not null default '[]',
  connections jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table network_diagrams enable row level security;
create policy "Users can manage their own diagrams"
  on network_diagrams for all using (auth.uid() = user_id);

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table register_calculations enable row level security;
create policy "Users can manage their own calculations"
  on register_calculations for all using (auth.uid() = user_id);

-- ─── Indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_projects_user on projects(user_id);
create index if not exists idx_files_project on project_files(project_id);
create index if not exists idx_notes_project on field_notes(project_id);
create index if not exists idx_devices_project on devices(project_id);
create index if not exists idx_ip_plan_project on ip_plan(project_id);
create index if not exists idx_reports_project on daily_reports(project_id);
create index if not exists idx_activity_project on activity_log(project_id);
create index if not exists idx_diagrams_project on network_diagrams(project_id);
create index if not exists idx_calcs_project on register_calculations(project_id);
