-- ─── activity_log: add missing created_at column ────────────────────────────
-- S4-6 / S9-7: activity_log already received deleted_at, sync_version,
-- updated_at, and an updated_at trigger in add-sync-columns-activity-terminal.sql.
-- This migration adds the missing created_at column for full sync schema parity.

alter table activity_log
  add column if not exists created_at timestamptz not null default now();

-- Record this migration in the ledger (see docs/MIGRATIONS.md). Guarded so it's
-- a true no-op if the ledger table doesn't exist yet — apply order doesn't matter;
-- the backfill will pick this up later if the ledger is created afterward.
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    insert into schema_migrations (id) values ('add-activity-log-created-at.sql')
      on conflict (id) do nothing;
  end if;
end $$;

notify pgrst, 'reload schema';
