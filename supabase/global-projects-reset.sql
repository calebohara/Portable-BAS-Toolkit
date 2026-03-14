-- ─── BAU Suite — Global Projects RESET ──────────────────────────────────────
-- Drops ALL global project objects, then recreates from scratch.
-- Safe to run multiple times. Run this in the Supabase SQL Editor.
-- ──────────────────────────────────────────────────────────────────────────────

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  DROP EVERYTHING (reverse dependency order)                              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Drop triggers first (they depend on tables + functions)
drop trigger if exists global_projects_updated_at on global_projects;
drop trigger if exists global_projects_auto_add_creator on global_projects;
drop trigger if exists global_field_notes_updated_at on global_field_notes;
drop trigger if exists global_devices_updated_at on global_devices;
drop trigger if exists global_ip_plan_updated_at on global_ip_plan;
drop trigger if exists global_daily_reports_updated_at on global_daily_reports;
drop trigger if exists global_project_files_updated_at on global_project_files;
drop trigger if exists global_network_diagrams_updated_at on global_network_diagrams;

-- Drop all tables (CASCADE removes policies, indexes, and FK references)
drop table if exists global_network_diagrams cascade;
drop table if exists global_activity_log cascade;
drop table if exists global_project_files cascade;
drop table if exists global_daily_reports cascade;
drop table if exists global_ip_plan cascade;
drop table if exists global_devices cascade;
drop table if exists global_field_notes cascade;
drop table if exists global_project_members cascade;
drop table if exists global_projects cascade;

-- Drop profiles RLS extension policy (added by global-projects)
drop policy if exists "Project co-members can read profiles" on profiles;

-- Drop functions
drop function if exists is_global_project_member(uuid);
drop function if exists is_global_project_admin(uuid);
drop function if exists generate_global_access_code();
drop function if exists join_global_project(text);
drop function if exists auto_add_global_project_creator();

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 1: CREATE ALL TABLES (no dependencies on functions yet)           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Global Projects
create table if not exists global_projects (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id),
  name text not null,
  job_site_name text not null,
  site_address text not null default '',
  building_area text not null default '',
  project_number text not null default '',
  description text not null default '',
  access_code text not null unique,
  tags text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'on-hold', 'completed', 'archived')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Global Project Members
create table if not exists global_project_members (
  id uuid primary key default gen_random_uuid(),
  global_project_id uuid not null references global_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  invited_by uuid references auth.users(id),
  unique (global_project_id, user_id)
);

-- Global Field Notes
create table if not exists global_field_notes (
  id uuid primary key default gen_random_uuid(),
  global_project_id uuid not null references global_projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  file_id uuid,
  content text not null default '',
  category text not null default 'general',
  is_pinned boolean not null default false,
  tags text[] not null default '{}',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Global Devices
create table if not exists global_devices (
  id uuid primary key default gen_random_uuid(),
  global_project_id uuid not null references global_projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Global IP Plan
create table if not exists global_ip_plan (
  id uuid primary key default gen_random_uuid(),
  global_project_id uuid not null references global_projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Global Daily Reports
create table if not exists global_daily_reports (
  id uuid primary key default gen_random_uuid(),
  global_project_id uuid not null references global_projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Global Project Files
create table if not exists global_project_files (
  id uuid primary key default gen_random_uuid(),
  global_project_id uuid not null references global_projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  title text not null,
  file_name text not null,
  file_type text not null,
  mime_type text not null,
  category text not null default 'other',
  panel_system text,
  revision_number text not null default '',
  revision_date text not null default '',
  notes text not null default '',
  tags text[] not null default '{}',
  status text not null default 'current',
  is_pinned boolean not null default false,
  size bigint not null default 0,
  storage_path text,
  versions jsonb not null default '[]',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Global Activity Log
create table if not exists global_activity_log (
  id uuid primary key default gen_random_uuid(),
  global_project_id uuid not null references global_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  action text not null,
  details text not null default '',
  file_id uuid,
  timestamp timestamptz not null default now()
);

-- Global Network Diagrams
create table if not exists global_network_diagrams (
  id uuid primary key default gen_random_uuid(),
  global_project_id uuid not null references global_projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  name text not null,
  description text not null default '',
  nodes jsonb not null default '[]',
  connections jsonb not null default '[]',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 2: CREATE HELPER FUNCTIONS (tables exist now)                     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Check if current user is a member of a global project
create or replace function is_global_project_member(project_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from global_project_members
    where global_project_id = project_id
      and user_id = auth.uid()
  );
$$;

-- Check if current user is an admin of a global project
create or replace function is_global_project_admin(project_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from global_project_members
    where global_project_id = project_id
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;

-- Generate a unique access code in XXX-XXXX format (no ambiguous chars)
create or replace function generate_global_access_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..3 loop
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
    code := code || '-';
    for i in 1..4 loop
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;

    -- Ensure uniqueness
    if not exists (select 1 from global_projects where access_code = code) then
      return code;
    end if;
  end loop;
end;
$$;

-- Join a global project by access code
create or replace function join_global_project(code text)
returns json
language plpgsql
security definer
as $$
declare
  v_project_id uuid;
  v_project_name text;
  v_user_id uuid := auth.uid();
begin
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

-- Auto-add creator as admin when a global project is created
create or replace function auto_add_global_project_creator()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into global_project_members (id, global_project_id, user_id, role)
  values (gen_random_uuid(), new.id, new.created_by, 'admin');
  return new;
end;
$$;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 3: ENABLE RLS + CREATE POLICIES (functions exist now)             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Global Projects RLS
alter table global_projects enable row level security;

create policy "Members or creator can view global projects"
  on global_projects for select
  using (is_global_project_member(id) or auth.uid() = created_by);

create policy "Authenticated users can create global projects"
  on global_projects for insert
  with check (auth.uid() = created_by);

create policy "Admins can update global projects"
  on global_projects for update
  using (is_global_project_admin(id));

create policy "Admins can delete global projects"
  on global_projects for delete
  using (is_global_project_admin(id));

-- Global Project Members RLS
alter table global_project_members enable row level security;

create policy "Members can view project members"
  on global_project_members for select
  using (is_global_project_member(global_project_id));

create policy "Admins can add members"
  on global_project_members for insert
  with check (is_global_project_admin(global_project_id));

create policy "Admins or self can remove members"
  on global_project_members for delete
  using (is_global_project_admin(global_project_id) or user_id = auth.uid());

create policy "Admins can update member roles"
  on global_project_members for update
  using (is_global_project_admin(global_project_id));

-- Global Field Notes RLS
alter table global_field_notes enable row level security;

create policy "Members can view global notes"
  on global_field_notes for select
  using (is_global_project_member(global_project_id));

create policy "Members can create global notes"
  on global_field_notes for insert
  with check (is_global_project_member(global_project_id) and created_by = auth.uid());

create policy "Creator or admin can update global notes"
  on global_field_notes for update
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create policy "Creator or admin can delete global notes"
  on global_field_notes for delete
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

-- Global Devices RLS
alter table global_devices enable row level security;

create policy "Members can view global devices"
  on global_devices for select
  using (is_global_project_member(global_project_id));

create policy "Members can create global devices"
  on global_devices for insert
  with check (is_global_project_member(global_project_id) and created_by = auth.uid());

create policy "Creator or admin can update global devices"
  on global_devices for update
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create policy "Creator or admin can delete global devices"
  on global_devices for delete
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

-- Global IP Plan RLS
alter table global_ip_plan enable row level security;

create policy "Members can view global IP plan"
  on global_ip_plan for select
  using (is_global_project_member(global_project_id));

create policy "Members can create global IP entries"
  on global_ip_plan for insert
  with check (is_global_project_member(global_project_id) and created_by = auth.uid());

create policy "Creator or admin can update global IP entries"
  on global_ip_plan for update
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create policy "Creator or admin can delete global IP entries"
  on global_ip_plan for delete
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

-- Global Daily Reports RLS
alter table global_daily_reports enable row level security;

create policy "Members can view global daily reports"
  on global_daily_reports for select
  using (is_global_project_member(global_project_id));

create policy "Members can create global daily reports"
  on global_daily_reports for insert
  with check (is_global_project_member(global_project_id) and created_by = auth.uid());

create policy "Creator or admin can update global daily reports"
  on global_daily_reports for update
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create policy "Creator or admin can delete global daily reports"
  on global_daily_reports for delete
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

-- Global Project Files RLS
alter table global_project_files enable row level security;

create policy "Members can view global project files"
  on global_project_files for select
  using (is_global_project_member(global_project_id));

create policy "Members can create global project files"
  on global_project_files for insert
  with check (is_global_project_member(global_project_id) and created_by = auth.uid());

create policy "Creator or admin can update global project files"
  on global_project_files for update
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create policy "Creator or admin can delete global project files"
  on global_project_files for delete
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

-- Global Activity Log RLS
alter table global_activity_log enable row level security;

create policy "Members can view global activity"
  on global_activity_log for select
  using (is_global_project_member(global_project_id));

create policy "Members can log global activity"
  on global_activity_log for insert
  with check (is_global_project_member(global_project_id) and user_id = auth.uid());

create policy "Creator or admin can update global activity"
  on global_activity_log for update
  using (user_id = auth.uid() or is_global_project_admin(global_project_id));

create policy "Creator or admin can delete global activity"
  on global_activity_log for delete
  using (user_id = auth.uid() or is_global_project_admin(global_project_id));

-- Global Network Diagrams RLS
alter table global_network_diagrams enable row level security;

create policy "Members can view global network diagrams"
  on global_network_diagrams for select
  using (is_global_project_member(global_project_id));

create policy "Members can create global network diagrams"
  on global_network_diagrams for insert
  with check (is_global_project_member(global_project_id) and created_by = auth.uid());

create policy "Creator or admin can update global network diagrams"
  on global_network_diagrams for update
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create policy "Creator or admin can delete global network diagrams"
  on global_network_diagrams for delete
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

-- ─── Profiles RLS Extension ─────────────────────────────────────────────────
-- Allow project co-members to read each other's basic profile info
-- (the base schema only allows auth.uid() = id, blocking the member list display)
create policy "Project co-members can read profiles"
  on profiles for select
  using (
    auth.uid() = id   -- always allow reading own profile
    or id in (
      select gpm.user_id
      from global_project_members gpm
      where gpm.global_project_id in (
        select gpm2.global_project_id
        from global_project_members gpm2
        where gpm2.user_id = auth.uid()
      )
    )
  );

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  STEP 4: TRIGGERS                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create trigger global_projects_updated_at
  before update on global_projects
  for each row execute function set_updated_at();

create trigger global_projects_auto_add_creator
  after insert on global_projects
  for each row execute function auto_add_global_project_creator();

create trigger global_field_notes_updated_at
  before update on global_field_notes
  for each row execute function set_updated_at();

create trigger global_devices_updated_at
  before update on global_devices
  for each row execute function set_updated_at();

create trigger global_ip_plan_updated_at
  before update on global_ip_plan
  for each row execute function set_updated_at();

create trigger global_daily_reports_updated_at
  before update on global_daily_reports
  for each row execute function set_updated_at();

create trigger global_project_files_updated_at
  before update on global_project_files
  for each row execute function set_updated_at();

create trigger global_network_diagrams_updated_at
  before update on global_network_diagrams
  for each row execute function set_updated_at();

-- ─── Indexes ────────────────────────────────────────────────────────────────

-- Global Projects
create index if not exists idx_global_projects_created_by on global_projects(created_by);
create index if not exists idx_global_projects_access_code on global_projects(access_code);
create index if not exists idx_global_projects_status on global_projects(status);

-- Global Project Members
create index if not exists idx_global_members_project on global_project_members(global_project_id);
create index if not exists idx_global_members_user on global_project_members(user_id);

-- Global Field Notes
create index if not exists idx_global_notes_project on global_field_notes(global_project_id);
create index if not exists idx_global_notes_created_by on global_field_notes(created_by);
create index if not exists idx_global_notes_category on global_field_notes(global_project_id, category);

-- Global Devices
create index if not exists idx_global_devices_project on global_devices(global_project_id);
create index if not exists idx_global_devices_created_by on global_devices(created_by);

-- Global IP Plan
create index if not exists idx_global_ip_plan_project on global_ip_plan(global_project_id);
create index if not exists idx_global_ip_plan_created_by on global_ip_plan(created_by);
create index if not exists idx_global_ip_plan_status on global_ip_plan(global_project_id, status);

-- Global Daily Reports
create index if not exists idx_global_reports_project on global_daily_reports(global_project_id);
create index if not exists idx_global_reports_created_by on global_daily_reports(created_by);
create index if not exists idx_global_reports_date on global_daily_reports(global_project_id, date);

-- Global Project Files
create index if not exists idx_global_files_project on global_project_files(global_project_id);
create index if not exists idx_global_files_created_by on global_project_files(created_by);
create index if not exists idx_global_files_category on global_project_files(global_project_id, category);

-- Global Activity Log
create index if not exists idx_global_activity_project on global_activity_log(global_project_id);
create index if not exists idx_global_activity_user on global_activity_log(user_id);
create index if not exists idx_global_activity_timestamp on global_activity_log(global_project_id, timestamp);

-- Global Network Diagrams
create index if not exists idx_global_diagrams_project on global_network_diagrams(global_project_id);
create index if not exists idx_global_diagrams_created_by on global_network_diagrams(created_by);

-- ✅ Done! All global project tables, functions, policies, triggers, and indexes created.
