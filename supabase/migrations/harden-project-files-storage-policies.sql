-- ─── Harden the project-files storage policies ──────────────────────────────
-- SECURITY FIX (BASAgents audit 2026-08-29 — found independently by both the
-- Platform Engineer (P0-2) and the Project Manager (P0-1) agents).
--
-- THE HOLE
-- add-project-files-storage.sql created the bucket holding every roamed project
-- file, global project file, KB attachment and daily-report attachment with:
--
--   create policy "Public read access for project files"
--     on storage.objects for select
--     using (bucket_id = 'project-files');            -- no `to` clause at all
--
--   create policy "Users can update own project files"
--     on storage.objects for update
--     to authenticated using (bucket_id = 'project-files');   -- no owner check
--
--   create policy "Users can delete project files"
--     on storage.objects for delete
--     to authenticated using (bucket_id = 'project-files');   -- no owner check
--
-- Two independent breaks:
--
-- (a) CROSS-USER DESTRUCTION. Despite the name "Users can update own project
--     files", the UPDATE and DELETE predicates check only bucket_id. Any
--     signed-up user could remove([...]) or upsert over ANY other customer's
--     objects. There is no versioning on the bucket, so a delete is
--     unrecoverable except from whichever device still holds the local
--     fileBlobs copy.
--
-- (b) ANONYMOUS ENUMERATION. The SELECT policy has no `to` clause, so it grants
--     role `public`, which `anon` inherits. Object LISTING is gated by exactly
--     this policy, so a caller holding only the publicly-shipped
--     NEXT_PUBLIC_SUPABASE_ANON_KEY could list('projects/<uuid>') and walk every
--     path. buildStoragePath() embeds a random UUID as a capability-URL defence;
--     listing defeats it entirely.
--
-- WHAT THIS MIGRATION FIXES
--   * UPDATE and DELETE now require `owner = auth.uid()` — closes (a) outright.
--   * SELECT is narrowed to `authenticated` — closes the anonymous LIST in (b).
--
-- WHAT THIS MIGRATION DOES **NOT** FIX — READ THIS
-- The bucket is still `public = true`. For a public bucket, Storage serves
-- /object/public/<path> WITHOUT consulting RLS at all, so narrowing the SELECT
-- policy stops anonymous *enumeration* but NOT anonymous *reads of a known URL*.
-- Fully closing (b) requires flipping the bucket to private and moving every
-- read call site from getPublicUrl() to createSignedUrl():
--     src/lib/storage.ts:108-117              (the helper itself)
--     src/components/global-projects/global-file-list-view.tsx:105-120
--     src/app/knowledge-base/page.tsx:370
--   plus the report export path.
-- That is an application change with user-visible fallout (previews, .eml
-- export, offline blob cache), so it is deliberately NOT bundled here. Track it
-- as the follow-up; this migration is the half that is safe to apply today with
-- no code deploy.
--
-- Safe to run multiple times (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

-- Read: authenticated only (stops anonymous listing/enumeration).
drop policy if exists "Public read access for project files" on storage.objects;
drop policy if exists "Authenticated read access for project files" on storage.objects;
create policy "Authenticated read access for project files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'project-files');

-- Update: only the uploader. storage.objects.owner is stamped on insert.
drop policy if exists "Users can update own project files" on storage.objects;
create policy "Users can update own project files"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'project-files' and owner = auth.uid())
  with check (bucket_id = 'project-files' and owner = auth.uid());

-- Delete: only the uploader.
drop policy if exists "Users can delete project files" on storage.objects;
drop policy if exists "Users can delete own project files" on storage.objects;
create policy "Users can delete own project files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'project-files' and owner = auth.uid());

-- Record this migration in the ledger (see docs/MIGRATIONS.md). Guarded so it's
-- a true no-op if the ledger table doesn't exist yet — apply order doesn't matter.
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    insert into schema_migrations (id) values ('harden-project-files-storage-policies.sql')
      on conflict (id) do nothing;
  end if;
end $$;

notify pgrst, 'reload schema';
