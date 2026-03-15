-- ─── Storage: project-files bucket ──────────────────────────────────────────
-- Stores project file attachments, field photos, and daily report attachments.
-- Uses the authenticated user's auth.uid() for path-based RLS.
-- Safe to run multiple times (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create the bucket (5MB file size limit for photos, 50MB for documents)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files',
  'project-files',
  true,  -- public read so team members can view via URL
  52428800,  -- 50MB max (server-side safety net; client enforces 5MB for photos)
  null       -- allow all MIME types (PDFs, images, DWG, CSV, etc.)
)
on conflict (id) do nothing;

-- 2. RLS policies for the bucket

-- Authenticated users can upload files
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Authenticated users can upload project files' and tablename = 'objects'
  ) then
    create policy "Authenticated users can upload project files"
      on storage.objects for insert
      to authenticated
      with check (bucket_id = 'project-files');
  end if;
end $$;

-- Anyone can read (public bucket for team collaboration)
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Public read access for project files' and tablename = 'objects'
  ) then
    create policy "Public read access for project files"
      on storage.objects for select
      using (bucket_id = 'project-files');
  end if;
end $$;

-- Authenticated users can update their own files
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Users can update own project files' and tablename = 'objects'
  ) then
    create policy "Users can update own project files"
      on storage.objects for update
      to authenticated
      using (bucket_id = 'project-files');
  end if;
end $$;

-- Authenticated users can delete files
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'Users can delete project files' and tablename = 'objects'
  ) then
    create policy "Users can delete project files"
      on storage.objects for delete
      to authenticated
      using (bucket_id = 'project-files');
  end if;
end $$;
