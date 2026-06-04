-- ─── Schema Migrations Ledger ───────────────────────────────────────────────
-- A record of which migration files have been applied to this database.
-- Until now there was no such record — the live schema was the only source of
-- truth, forcing object-by-object archaeology to tell what was pending.
--
-- WORKFLOW (manual SQL-Editor, no Supabase CLI):
--   1. Apply this file first to create the ledger.
--   2. Run supabase/backfill-schema-migrations.sql once — it records every
--      already-applied legacy migration (derived from live object existence).
--   3. Every NEW migration ends with a self-recording insert (see template at
--      the bottom of this file / docs/MIGRATIONS.md), so applying it records it.
--   4. supabase/check-migrations.sql audits ledger vs. reality at any time.
--
-- Safe / idempotent: create-if-not-exists; re-running is a no-op.
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists schema_migrations (
  id          text primary key,            -- the migration filename, e.g. 'add-dxrs.sql'
  applied_at  timestamptz not null default now(),
  checksum    text                          -- optional: sha of the file at apply time
);

comment on table schema_migrations is
  'Ledger of applied supabase/migrations/*.sql files. Populated by each migration''s '
  'self-recording insert and by supabase/backfill-schema-migrations.sql. Audited by '
  'supabase/check-migrations.sql. See docs/MIGRATIONS.md.';

-- Internal ops table: enable RLS with no policies so it is invisible to the
-- anon/authenticated app roles. The SQL Editor (service role) bypasses RLS, so
-- migrations and the backfill can still write to it.
alter table schema_migrations enable row level security;

-- This migration records itself.
insert into schema_migrations (id) values ('add-schema-migrations-ledger.sql')
  on conflict (id) do nothing;

notify pgrst, 'reload schema';

-- ─── TEMPLATE for every future migration (paste at the END of the file) ──────
-- Guarded so the migration still applies cleanly even if the ledger table does
-- not exist yet (apply order is then irrelevant; the backfill catches it later).
-- do $$
-- begin
--   if to_regclass('public.schema_migrations') is not null then
--     insert into schema_migrations (id) values ('<this-filename>.sql')
--       on conflict (id) do nothing;
--   end if;
-- end $$;
-- notify pgrst, 'reload schema';
