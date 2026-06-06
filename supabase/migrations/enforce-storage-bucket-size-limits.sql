-- ─── Storage: enforce bucket-level file_size_limit ──────────────────────────
-- The client (src/lib/storage.ts) enforces MAX_PHOTO_SIZE (5MB) and
-- MAX_FILE_SIZE (50MB) before upload, but a determined user with dev tools can
-- bypass that check. Supabase Storage only rejects oversized uploads if the
-- bucket itself carries a file_size_limit. The buckets were originally created
-- WITH a limit, but `on conflict (id) do nothing` means any bucket that was
-- created earlier (e.g. manually in the dashboard) without a limit never got
-- one. This migration force-sets the limit on the existing buckets so the
-- server enforces the same cap as the client.
--
-- Limits (bytes):
--   project-files : 52428800  (50MB — holds documents + field photos)
--   avatars       :  5242880  (5MB  — profile images only)
--
-- Idempotent — safe to run multiple times. No-op if a bucket doesn't exist.
-- ─────────────────────────────────────────────────────────────────────────────

update storage.buckets
set file_size_limit = 52428800 -- 50MB
where id = 'project-files';

update storage.buckets
set file_size_limit = 5242880 -- 5MB
where id = 'avatars';

-- ── Self-record into the migration ledger (guarded — no-op if ledger absent) ──
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    insert into schema_migrations (id) values ('enforce-storage-bucket-size-limits.sql')
      on conflict (id) do nothing;
  end if;
end $$;
notify pgrst, 'reload schema';
