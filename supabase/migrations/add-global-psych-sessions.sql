-- ─── Global Psych Sessions ──────────────────────────────────────────────────
-- Shared psychrometric calculation sessions for a global (multi-user) project.
-- Mirrors the local `psych_sessions` table — see supabase/schema.sql.
-- Membership-based RLS via is_global_project_member / is_global_project_admin
-- (defined in supabase/global-projects-schema.sql).
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists global_psych_sessions (
  id uuid primary key default gen_random_uuid(),
  global_project_id uuid not null references global_projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
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

alter table global_psych_sessions enable row level security;

drop policy if exists "Members can view global psych sessions" on global_psych_sessions;
create policy "Members can view global psych sessions"
  on global_psych_sessions for select
  using (is_global_project_member(global_project_id));

drop policy if exists "Members can create global psych sessions" on global_psych_sessions;
create policy "Members can create global psych sessions"
  on global_psych_sessions for insert
  with check (is_global_project_member(global_project_id) and created_by = auth.uid());

drop policy if exists "Creator or admin can update global psych sessions" on global_psych_sessions;
create policy "Creator or admin can update global psych sessions"
  on global_psych_sessions for update
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

drop policy if exists "Creator or admin can delete global psych sessions" on global_psych_sessions;
create policy "Creator or admin can delete global psych sessions"
  on global_psych_sessions for delete
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create trigger global_psych_sessions_updated_at
  before update on global_psych_sessions
  for each row execute function set_updated_at();

create index if not exists idx_global_psych_sessions_project on global_psych_sessions(global_project_id);
create index if not exists idx_global_psych_sessions_creator on global_psych_sessions(created_by);
