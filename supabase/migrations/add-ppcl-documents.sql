-- ─── PPCL Documents ──────────────────────────────────────────────────────────
-- Stores PPCL program files per user, optionally linked to a project.
-- Synced via the offline-first sync engine (IndexedDB ↔ Supabase).

create table if not exists ppcl_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  content text not null default '',
  project_id uuid references projects(id) on delete set null,
  firmware text not null default 'pxc-tc',
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ppcl_documents enable row level security;

create policy "Users can manage their own PPCL documents"
  on ppcl_documents for all using (auth.uid() = user_id);

create trigger ppcl_documents_updated_at
  before update on ppcl_documents
  for each row execute function set_updated_at();

create index if not exists idx_ppcl_documents_user on ppcl_documents(user_id);
create index if not exists idx_ppcl_documents_project on ppcl_documents(project_id);
