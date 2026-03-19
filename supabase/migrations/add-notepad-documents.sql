-- ─── Notepad Documents ──────────────────────────────────────────────────────
-- Full-featured code/text editor documents (independent from project notepad entries).
-- Supports multiple languages: plaintext, json, xml, javascript, python, css, html, markdown.

create table if not exists notepad_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled',
  content text not null default '',
  language text not null default 'plaintext',
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table notepad_documents enable row level security;
create policy "Users can manage their own notepad documents"
  on notepad_documents for all using (auth.uid() = user_id);

create trigger notepad_documents_updated_at
  before update on notepad_documents
  for each row execute function set_updated_at();

create index if not exists idx_notepad_documents_user on notepad_documents(user_id);
create index if not exists idx_notepad_documents_updated on notepad_documents(updated_at);
