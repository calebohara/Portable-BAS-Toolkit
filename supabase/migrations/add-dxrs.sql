-- ─── Local DXR Entries (per-user) ─────────────────────────────────────────────
-- Per-user mirror of the local IndexedDB `dxrs` store. Follows the same shape
-- as `public.devices` / `public.ip_plan` in schema.sql: RLS scoped by auth.uid()
-- so each authenticated user only sees their own rows.
--
-- This is the user's personal cloud copy of their local DXR data. The
-- multi-user "shared" copy lives in `global_dxrs` (created by
-- add-global-dxrs.sql) and is populated by the share-to-global reconcile flow.
--
-- Column shape mirrors src/lib/sync/field-map.ts → FIELD_OVERRIDES.dxrs.
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists dxrs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,

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

-- Unique constraint on (project_id, guid) where guid is not null.
-- Matches the local IndexedDB invariant: re-importing the same DXR Smart Copy
-- export updates rows in place rather than duplicating.
create unique index if not exists idx_dxrs_project_guid
  on dxrs(project_id, guid)
  where guid is not null;

-- Standard lookup indexes
create index if not exists idx_dxrs_project
  on dxrs(project_id);

create index if not exists idx_dxrs_user_project
  on dxrs(user_id, project_id);

-- ── Row-Level Security ────────────────────────────────────────────────────────

alter table dxrs enable row level security;

drop policy if exists "Users can manage their own dxrs" on dxrs;
create policy "Users can manage their own dxrs"
  on dxrs for all using (auth.uid() = user_id);

-- ── Updated-at trigger (set_updated_at() defined in schema.sql) ───────────────

drop trigger if exists dxrs_updated_at on dxrs;
create trigger dxrs_updated_at
  before update on dxrs
  for each row execute function set_updated_at();
