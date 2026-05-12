-- ─── Global Register Calculations ───────────────────────────────────────────
-- Shared register / point calculations for a global (multi-user) project.
-- Mirrors the local `register_calculations` table — see supabase/schema.sql.
-- NOTE: Locally `project_id` is nullable (calculations can exist without a
-- project). On the global side `global_project_id` is NOT NULL because the
-- membership RLS predicate `is_global_project_member(null)` returns false,
-- so any row with a null project would be permanently invisible — better to
-- forbid the row at insert time than orphan it silently.
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists global_register_calculations (
  id uuid primary key default gen_random_uuid(),
  global_project_id uuid not null references global_projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
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

alter table global_register_calculations enable row level security;

drop policy if exists "Members can view global register calculations" on global_register_calculations;
create policy "Members can view global register calculations"
  on global_register_calculations for select
  using (is_global_project_member(global_project_id));

drop policy if exists "Members can create global register calculations" on global_register_calculations;
create policy "Members can create global register calculations"
  on global_register_calculations for insert
  with check (is_global_project_member(global_project_id) and created_by = auth.uid());

drop policy if exists "Creator or admin can update global register calculations" on global_register_calculations;
create policy "Creator or admin can update global register calculations"
  on global_register_calculations for update
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

drop policy if exists "Creator or admin can delete global register calculations" on global_register_calculations;
create policy "Creator or admin can delete global register calculations"
  on global_register_calculations for delete
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create trigger global_register_calculations_updated_at
  before update on global_register_calculations
  for each row execute function set_updated_at();

create index if not exists idx_global_register_calculations_project on global_register_calculations(global_project_id);
create index if not exists idx_global_register_calculations_creator on global_register_calculations(created_by);
