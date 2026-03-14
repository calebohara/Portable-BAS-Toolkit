-- ─── Migration: Add global_messages table for cross-project message board ────
-- Safe to run multiple times (uses IF NOT EXISTS / DO blocks).
-- ─────────────────────────────────────────────────────────────────────────────

-- Create the global_messages table
create table if not exists global_messages (
  id uuid primary key default gen_random_uuid(),
  global_project_id uuid references global_projects(id) on delete set null,
  subject text not null,
  body text not null default '',
  created_by uuid not null references auth.users(id) on delete cascade,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Index for filtering by project
create index if not exists idx_global_messages_project on global_messages(global_project_id);
-- Index for ordering by date
create index if not exists idx_global_messages_created on global_messages(created_at desc);

-- Enable RLS
alter table global_messages enable row level security;

-- Any authenticated user who is a member of ANY global project can read messages
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Global project members can read messages' and tablename = 'global_messages'
  ) then
    create policy "Global project members can read messages"
      on global_messages for select
      using (
        auth.uid() in (
          select user_id from global_project_members
        )
      );
  end if;
end $$;

-- Any authenticated user who is a member of ANY global project can post messages
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Global project members can post messages' and tablename = 'global_messages'
  ) then
    create policy "Global project members can post messages"
      on global_messages for insert
      with check (
        auth.uid() = created_by
        and auth.uid() in (
          select user_id from global_project_members
        )
      );
  end if;
end $$;

-- Authors can soft-delete their own messages
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Authors can delete their own messages' and tablename = 'global_messages'
  ) then
    create policy "Authors can delete their own messages"
      on global_messages for update
      using (auth.uid() = created_by)
      with check (auth.uid() = created_by);
  end if;
end $$;
