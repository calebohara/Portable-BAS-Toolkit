-- ─── Bug Reports ─────────────────────────────────────────────────────────────
-- User-submitted bug reports. No project_id — reports are global per user.
-- Synced via the offline-first sync engine (IndexedDB ↔ Supabase).

create table if not exists bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  description text not null default '',
  steps_to_reproduce text,
  severity text not null default 'medium',
  status text not null default 'open',
  app_version text not null default '',
  device_class text not null default '',
  desktop_os text not null default '',
  current_page text not null default '',
  sync_status text not null default '',
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table bug_reports enable row level security;
create policy "Users can manage their own bug reports"
  on bug_reports for all using (auth.uid() = user_id);

-- Admin read access: allow admins to view all bug reports
create policy "Admins can view all bug reports"
  on bug_reports for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create trigger bug_reports_updated_at
  before update on bug_reports
  for each row execute function set_updated_at();

create index if not exists idx_bug_reports_user on bug_reports(user_id);
create index if not exists idx_bug_reports_status on bug_reports(status);
create index if not exists idx_bug_reports_severity on bug_reports(severity);
