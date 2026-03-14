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
-- Create the avatars bucket via Supabase Dashboard → Storage → New Bucket:
--   Name: avatars
--   Public: Yes (so avatar URLs work without auth headers)
--   File size limit: 2MB
--   Allowed MIME types: image/jpeg, image/png, image/webp, image/gif
--
-- Then add these storage policies in the SQL Editor:
--
-- Allow authenticated users to upload their own avatar:
-- create policy "Users can upload their own avatar"
--   on storage.objects for insert
--   with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
--
-- Allow authenticated users to update their own avatar:
-- create policy "Users can update their own avatar"
--   on storage.objects for update
--   using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
--
-- Allow public read access to all avatars:
-- create policy "Anyone can view avatars"
--   on storage.objects for select
--   using (bucket_id = 'avatars');
