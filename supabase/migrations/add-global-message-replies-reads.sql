-- ─── Migration: Add reply threading + read tracking to global_messages ──────
-- Safe to run multiple times (uses IF NOT EXISTS / DO blocks).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add parent_id column for reply threading (single-depth only)
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'global_messages' and column_name = 'parent_id'
  ) then
    alter table global_messages
      add column parent_id uuid references global_messages(id) on delete cascade;
  end if;
end $$;

-- Index for fetching replies by parent
create index if not exists idx_global_messages_parent on global_messages(parent_id);

-- 2. Create read-tracking table (last_read_at per user)
create table if not exists global_message_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id)
);

-- Enable RLS
alter table global_message_reads enable row level security;

-- Users can read their own read-tracking row
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Users can read own message reads' and tablename = 'global_message_reads'
  ) then
    create policy "Users can read own message reads"
      on global_message_reads for select
      using (auth.uid() = user_id);
  end if;
end $$;

-- Users can insert their own read-tracking row
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Users can insert own message reads' and tablename = 'global_message_reads'
  ) then
    create policy "Users can insert own message reads"
      on global_message_reads for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

-- Users can update their own read-tracking row
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Users can update own message reads' and tablename = 'global_message_reads'
  ) then
    create policy "Users can update own message reads"
      on global_message_reads for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
