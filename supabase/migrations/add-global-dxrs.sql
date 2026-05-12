-- ─── Global DXR Entries ───────────────────────────────────────────────────────
-- Shared DXR (Desigo CC DXR Smart Copy) controller rows for a global (multi-user)
-- project. Mirrors the local `dxrs` IndexedDB store. Identity key is (global_project_id, guid)
-- (partial, where guid is not null) so re-importing the same export updates rows
-- in place rather than duplicating.
--
-- RLS: same policy shape as global_register_calculations (members read;
-- creator or admin write). Do not alter this shape without updating
-- src/lib/sync/field-map.ts → GLOBAL_AUDITED_ENTITY_TYPES.
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists global_dxrs (
  id uuid primary key default gen_random_uuid(),
  global_project_id uuid not null references global_projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),

  -- ── 21 source columns from DXR Smart Copy export ──
  name text,
  location text,
  description text,
  device_instance_number integer,
  equipment_id text,
  serial_number text,
  application_template text,
  application_number integer,
  network integer,
  auto_addressing boolean,
  mac_address integer,
  max_manager_address integer,
  baud_rate integer,
  room_hierarchy text,
  room_name text,
  room_description text,
  segment_hierarchy text,
  segment_name text,
  segment_description text,
  ms_tp_nw_id text,
  guid text,

  -- ── metadata ──
  imported_from_file_id uuid null,

  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique constraint on (global_project_id, guid) where guid is not null.
-- This allows multiple null-guid rows (unguidable rows) while keeping
-- Desigo-identified rows unique per project.
create unique index if not exists idx_global_dxrs_project_guid
  on global_dxrs(global_project_id, guid)
  where guid is not null;

-- Standard lookup indexes
create index if not exists idx_global_dxrs_project
  on global_dxrs(global_project_id);

create index if not exists idx_global_dxrs_project_name
  on global_dxrs(global_project_id, name);

-- ── Row-Level Security ────────────────────────────────────────────────────────

alter table global_dxrs enable row level security;

drop policy if exists "Members can view global dxrs" on global_dxrs;
create policy "Members can view global dxrs"
  on global_dxrs for select
  using (is_global_project_member(global_project_id));

drop policy if exists "Members can create global dxrs" on global_dxrs;
create policy "Members can create global dxrs"
  on global_dxrs for insert
  with check (is_global_project_member(global_project_id) and created_by = auth.uid());

drop policy if exists "Creator or admin can update global dxrs" on global_dxrs;
create policy "Creator or admin can update global dxrs"
  on global_dxrs for update
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

drop policy if exists "Creator or admin can delete global dxrs" on global_dxrs;
create policy "Creator or admin can delete global dxrs"
  on global_dxrs for delete
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

-- ── Updated-at trigger ────────────────────────────────────────────────────────

create trigger global_dxrs_updated_at
  before update on global_dxrs
  for each row execute function set_updated_at();
