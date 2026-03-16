-- ─── Project Notepad Entries ─────────────────────────────────────────────────
-- Per-project notepad notes (independent from the floating sticky notepad).
-- Supports optional linking back to a floating notepad tab for sync.

create table if not exists project_notepad_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null default '',
  content text not null default '',
  linked_tab_id text,
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table project_notepad_entries enable row level security;
create policy "Users can manage their own notepad entries"
  on project_notepad_entries for all using (auth.uid() = user_id);

create trigger project_notepad_entries_updated_at
  before update on project_notepad_entries
  for each row execute function set_updated_at();

create index if not exists idx_notepad_entries_project on project_notepad_entries(project_id);
create index if not exists idx_notepad_entries_user on project_notepad_entries(user_id);
