-- ─── Migration: Add direct_messages table for user inbox ─────────────────────
-- Safe to run multiple times (uses IF NOT EXISTS / DO blocks).
-- ─────────────────────────────────────────────────────────────────────────────

-- Create the direct_messages table
create table if not exists direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  subject text not null default '',
  body text not null default '',
  read_at timestamptz,
  deleted_by_sender boolean not null default false,
  deleted_by_recipient boolean not null default false,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_dm_recipient on direct_messages(recipient_id, created_at desc);
create index if not exists idx_dm_sender on direct_messages(sender_id, created_at desc);
create index if not exists idx_dm_unread on direct_messages(recipient_id) where read_at is null;

-- Enable RLS
alter table direct_messages enable row level security;

-- Recipients can read their own messages
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Recipients can read their messages' and tablename = 'direct_messages'
  ) then
    create policy "Recipients can read their messages"
      on direct_messages for select
      using (auth.uid() = recipient_id and deleted_by_recipient = false);
  end if;
end $$;

-- Senders can read messages they sent
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Senders can read sent messages' and tablename = 'direct_messages'
  ) then
    create policy "Senders can read sent messages"
      on direct_messages for select
      using (auth.uid() = sender_id and deleted_by_sender = false);
  end if;
end $$;

-- Authenticated users can send messages
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Users can send messages' and tablename = 'direct_messages'
  ) then
    create policy "Users can send messages"
      on direct_messages for insert
      with check (auth.uid() = sender_id);
  end if;
end $$;

-- Recipients can mark messages as read or soft-delete
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Recipients can update their messages' and tablename = 'direct_messages'
  ) then
    create policy "Recipients can update their messages"
      on direct_messages for update
      using (auth.uid() = recipient_id)
      with check (auth.uid() = recipient_id);
  end if;
end $$;

-- Senders can soft-delete their sent messages
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Senders can update sent messages' and tablename = 'direct_messages'
  ) then
    create policy "Senders can update sent messages"
      on direct_messages for update
      using (auth.uid() = sender_id)
      with check (auth.uid() = sender_id);
  end if;
end $$;

-- Admins can read all messages (using existing is_admin function)
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Admins can read all messages' and tablename = 'direct_messages'
  ) then
    create policy "Admins can read all messages"
      on direct_messages for select
      using (is_admin());
  end if;
end $$;

-- Enable realtime for direct_messages
alter publication supabase_realtime add table direct_messages;
