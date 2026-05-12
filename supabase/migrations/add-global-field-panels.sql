-- ─── Global Field Panels ────────────────────────────────────────────────────
-- Team-shared mirror of the local `field_panels` table.
--
-- Locally a field panel is per-user inventory ("my BAS controllers") and
-- `project_id` is NULLABLE. On the global side the panel belongs to a global
-- project — `global_project_id` is NOT NULL (divergence from local; required
-- because the membership RLS predicate cannot evaluate against NULL).
--
-- Column rules applied:
--   - Drop local `user_id`
--   - Replace local `project_id` → `global_project_id` (NOT NULL + cascade)
--   - Add `created_by` (NOT NULL) and `updated_by`
--   - Keep all other content columns identical
--
-- Indexes mirror the local schema's `idx_field_panels_*` pair, with the
-- project index pointing at `global_project_id`.
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists global_field_panels (
  id uuid primary key default gen_random_uuid(),
  global_project_id uuid not null references global_projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
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
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table global_field_panels enable row level security;

create policy "Members can view global field panels"
  on global_field_panels for select
  using (is_global_project_member(global_project_id));

create policy "Members can create global field panels"
  on global_field_panels for insert
  with check (is_global_project_member(global_project_id) and created_by = auth.uid());

create policy "Creator or admin can update global field panels"
  on global_field_panels for update
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create policy "Creator or admin can delete global field panels"
  on global_field_panels for delete
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create trigger global_field_panels_updated_at
  before update on global_field_panels
  for each row execute function set_updated_at();

create index if not exists idx_global_field_panels_project on global_field_panels(global_project_id);
create index if not exists idx_global_field_panels_creator on global_field_panels(created_by);

-- Reload PostgREST schema cache so the new table is queryable immediately.
notify pgrst, 'reload schema';
