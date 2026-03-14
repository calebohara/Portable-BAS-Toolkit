-- ─── Migration: Add first_name, last_name, avatar_url to profiles ───────────
-- Run this on existing Supabase instances that already have the profiles table.
-- Safe to run multiple times (uses IF NOT EXISTS logic via DO blocks).
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'profiles' and column_name = 'first_name'
  ) then
    alter table profiles add column first_name text not null default '';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'profiles' and column_name = 'last_name'
  ) then
    alter table profiles add column last_name text not null default '';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'profiles' and column_name = 'avatar_url'
  ) then
    alter table profiles add column avatar_url text;
  end if;
end $$;

-- ─── Supabase Storage: Avatars bucket ───────────────────────────────────────
-- Create the public avatars bucket (idempotent — skips if already exists)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880, -- 5MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Storage policies (idempotent via DO blocks)

-- Allow authenticated users to upload their own avatar
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Users can upload their own avatar' and tablename = 'objects'
  ) then
    create policy "Users can upload their own avatar"
      on storage.objects for insert
      with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;
end $$;

-- Allow authenticated users to update/overwrite their own avatar
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Users can update their own avatar' and tablename = 'objects'
  ) then
    create policy "Users can update their own avatar"
      on storage.objects for update
      using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;
end $$;

-- Allow public read access to all avatars
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Anyone can view avatars' and tablename = 'objects'
  ) then
    create policy "Anyone can view avatars"
      on storage.objects for select
      using (bucket_id = 'avatars');
  end if;
end $$;
