-- ─── Global Terminal Session Logs ───────────────────────────────────────────
-- Shared terminal session captures for a global (multi-user) project.
-- Mirrors the local `terminal_session_logs` table — see supabase/schema.sql.
-- Membership-based RLS via is_global_project_member / is_global_project_admin
-- (defined in supabase/global-projects-schema.sql).
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists global_terminal_session_logs (
  id uuid primary key default gen_random_uuid(),
  global_project_id uuid not null references global_projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  session_label text not null default '',
  connection_mode text not null default 'tcp',
  host text not null default '',
  port int not null default 23,
  serial_port text not null default '',
  baud_rate int not null default 9600,
  line_count int not null default 0,
  log_content text not null default '',
  started_at timestamptz,
  ended_at timestamptz,
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table global_terminal_session_logs enable row level security;

drop policy if exists "Members can view global terminal session logs" on global_terminal_session_logs;
create policy "Members can view global terminal session logs"
  on global_terminal_session_logs for select
  using (is_global_project_member(global_project_id));

drop policy if exists "Members can create global terminal session logs" on global_terminal_session_logs;
create policy "Members can create global terminal session logs"
  on global_terminal_session_logs for insert
  with check (is_global_project_member(global_project_id) and created_by = auth.uid());

drop policy if exists "Creator or admin can update global terminal session logs" on global_terminal_session_logs;
create policy "Creator or admin can update global terminal session logs"
  on global_terminal_session_logs for update
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

drop policy if exists "Creator or admin can delete global terminal session logs" on global_terminal_session_logs;
create policy "Creator or admin can delete global terminal session logs"
  on global_terminal_session_logs for delete
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create trigger global_terminal_session_logs_updated_at
  before update on global_terminal_session_logs
  for each row execute function set_updated_at();

create index if not exists idx_global_terminal_session_logs_project on global_terminal_session_logs(global_project_id);
create index if not exists idx_global_terminal_session_logs_creator on global_terminal_session_logs(created_by);
