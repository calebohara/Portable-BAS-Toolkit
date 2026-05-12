-- ─── Global Connection Profiles ─────────────────────────────────────────────
-- Team-shared mirror of the local `connection_profiles` table.
--
-- Locally a connection profile is per-user ("my serial profiles") and
-- `project_id` is NULLABLE with `on delete set null`. On the global side a
-- connection profile only makes sense *within* a global project (no
-- cross-project user library), so:
--
--   - `global_project_id` is NOT NULL (divergence from local; required for
--     the membership RLS predicate to evaluate to a boolean).
--   - The FK uses `on delete cascade` (divergence from local's `set null`):
--     if a global project is deleted, the profiles lose their meaning and
--     should not survive as orphans. Flagged in the report so the Hooks/UI
--     agent can revisit if they disagree.
--
-- See `.claude/SyncAgents.md` §"Risks": there's an open question whether
-- connection_profiles should be shared at all on the global side, or stay
-- per-user with `created_by = auth.uid()` filtering. This migration creates
-- the table; the UI agent decides whether to expose it.
--
-- Column rules applied:
--   - Drop local `user_id`
--   - Replace local `project_id` → `global_project_id` (NOT NULL + cascade)
--   - Add `created_by` (NOT NULL) and `updated_by`
--   - Keep all other content columns identical
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists global_connection_profiles (
  id uuid primary key default gen_random_uuid(),
  global_project_id uuid not null references global_projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
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
  notes text not null default '',
  is_favorite boolean not null default false,
  tags text[] not null default '{}',
  last_connected_at timestamptz,
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table global_connection_profiles enable row level security;

create policy "Members can view global connection profiles"
  on global_connection_profiles for select
  using (is_global_project_member(global_project_id));

create policy "Members can create global connection profiles"
  on global_connection_profiles for insert
  with check (is_global_project_member(global_project_id) and created_by = auth.uid());

create policy "Creator or admin can update global connection profiles"
  on global_connection_profiles for update
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create policy "Creator or admin can delete global connection profiles"
  on global_connection_profiles for delete
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create trigger global_connection_profiles_updated_at
  before update on global_connection_profiles
  for each row execute function set_updated_at();

create index if not exists idx_global_connection_profiles_project on global_connection_profiles(global_project_id);
create index if not exists idx_global_connection_profiles_creator on global_connection_profiles(created_by);

-- Reload PostgREST schema cache so the new table is queryable immediately.
notify pgrst, 'reload schema';
