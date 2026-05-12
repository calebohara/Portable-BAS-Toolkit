-- ─── Global PID Tuning Sessions ─────────────────────────────────────────────
-- Shared PID loop-tuning sessions for a global (multi-user) project.
-- Mirrors the local `pid_tuning_sessions` table — see supabase/schema.sql.
-- Membership-based RLS via is_global_project_member / is_global_project_admin
-- (defined in supabase/global-projects-schema.sql).
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists global_pid_tuning_sessions (
  id uuid primary key default gen_random_uuid(),
  global_project_id uuid not null references global_projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
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

alter table global_pid_tuning_sessions enable row level security;

drop policy if exists "Members can view global PID tuning sessions" on global_pid_tuning_sessions;
create policy "Members can view global PID tuning sessions"
  on global_pid_tuning_sessions for select
  using (is_global_project_member(global_project_id));

drop policy if exists "Members can create global PID tuning sessions" on global_pid_tuning_sessions;
create policy "Members can create global PID tuning sessions"
  on global_pid_tuning_sessions for insert
  with check (is_global_project_member(global_project_id) and created_by = auth.uid());

drop policy if exists "Creator or admin can update global PID tuning sessions" on global_pid_tuning_sessions;
create policy "Creator or admin can update global PID tuning sessions"
  on global_pid_tuning_sessions for update
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

drop policy if exists "Creator or admin can delete global PID tuning sessions" on global_pid_tuning_sessions;
create policy "Creator or admin can delete global PID tuning sessions"
  on global_pid_tuning_sessions for delete
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create trigger global_pid_tuning_sessions_updated_at
  before update on global_pid_tuning_sessions
  for each row execute function set_updated_at();

create index if not exists idx_global_pid_tuning_sessions_project on global_pid_tuning_sessions(global_project_id);
create index if not exists idx_global_pid_tuning_sessions_creator on global_pid_tuning_sessions(created_by);
