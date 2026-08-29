-- ─── Make the project-files bucket private ──────────────────────────────────
-- SECURITY FIX, part 2 of 2 (BASAgents audit 2026-08-29).
--
-- Part 1 (harden-project-files-storage-policies.sql) closed cross-user
-- delete/overwrite and anonymous LISTING. It could not close anonymous READS,
-- because for a bucket with `public = true` Supabase Storage serves
--   /storage/v1/object/public/project-files/<path>
-- WITHOUT consulting RLS at all. So every site drawing, panel backup and field
-- photo stayed readable by anyone holding a URL — including files the user had
-- "deleted" in the app, whose objects lived on until the delete-path fix landed.
--
-- buildStoragePath() embeds a random UUID, which is a capability-URL defence and
-- nothing more: URLs leak through exports, shared reports, browser history and
-- logs, and they never expire.
--
-- ⚠️ DEPLOY ORDER MATTERS — APPLY THIS *AFTER* THE APP IS DEPLOYED ⚠️
--
--   1. Ship the application build that replaces getPublicUrl() with
--      getSignedUrl() (src/lib/storage.ts). Signed URLs work fine against a
--      still-public bucket, so this step is safe on its own and changes nothing
--      user-visible.
--   2. THEN run this migration.
--
-- Applying this first would break global project file preview/download and
-- knowledge-base attachments for anyone on the old build, because their
-- getPublicUrl() links would start returning 400. Rolling back is a one-liner
-- (set public = true) if that happens.
--
-- Call sites migrated to signed URLs in step 1:
--   src/lib/storage.ts                                    (getSignedUrl)
--   src/components/global-projects/global-file-list-view.tsx  (download, preview)
--   src/app/knowledge-base/page.tsx                       (attachment open)
-- The `avatars` bucket is separate and deliberately untouched.
--
-- Safe to run multiple times (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

update storage.buckets
   set public = false
 where id = 'project-files';

-- Record this migration in the ledger (see docs/MIGRATIONS.md). Guarded so it's
-- a true no-op if the ledger table doesn't exist yet — apply order doesn't matter.
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    insert into schema_migrations (id) values ('make-project-files-bucket-private.sql')
      on conflict (id) do nothing;
  end if;
end $$;

notify pgrst, 'reload schema';
