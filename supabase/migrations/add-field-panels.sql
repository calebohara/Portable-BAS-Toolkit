-- ─── Field Panels ──────────────────────────────────────────────────────────
-- BAS controller/panel inventory with web UI links, status tracking, and notes.
-- project_id is nullable (panels can exist without a project assignment).

create table if not exists field_panels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  site text not null default '',
  building text not null default '',
  floor text not null default '',
  system text not null default '',
  equipment text not null default '',
  controller_family text not null default '',
  model text not null default '',
  ip_address text not null default '',
  subnet_mask text not null default '',
  gateway text not null default '',
  bacnet_instance int,
  mac_address text not null default '',
  network_type text not null default 'IP',
  firmware_version text not null default '',
  application_version text not null default '',
  panel_status text not null default 'unknown',
  web_ui_url text not null default '',
  secure_web_ui_url text not null default '',
  last_seen_at timestamptz,
  last_backup_at timestamptz,
  last_commissioned_at timestamptz,
  assigned_technician text not null default '',
  tags text[] not null default '{}',
  notes jsonb not null default '[]',
  activities jsonb not null default '[]',
  linked_files jsonb not null default '[]',
  related_tools jsonb not null default '[]',
  project_id uuid references projects(id) on delete set null,
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table field_panels enable row level security;
create policy "Users can manage their own field panels"
  on field_panels for all using (auth.uid() = user_id);

create trigger field_panels_updated_at
  before update on field_panels
  for each row execute function set_updated_at();

create index if not exists idx_field_panels_user on field_panels(user_id);
create index if not exists idx_field_panels_project on field_panels(project_id);

-- ─── Notepad Documents: add missing sync_version ────────────────────────────
alter table notepad_documents
  add column if not exists sync_version int not null default 1;
