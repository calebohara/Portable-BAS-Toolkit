-- ─── Hotfix: Add DELETE policies for direct_messages ─────────────────────────
-- Allows users to hard-delete their own messages (purge functionality).
-- Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

-- Recipients can delete messages sent to them
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Recipients can delete their messages' and tablename = 'direct_messages'
  ) then
    create policy "Recipients can delete their messages"
      on direct_messages for delete
      using (auth.uid() = recipient_id);
  end if;
end $$;

-- Senders can delete messages they sent
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Senders can delete sent messages' and tablename = 'direct_messages'
  ) then
    create policy "Senders can delete sent messages"
      on direct_messages for delete
      using (auth.uid() = sender_id);
  end if;
end $$;
