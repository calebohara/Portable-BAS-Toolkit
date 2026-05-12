-- ─── Sync Column Parity — Global Child Tables ───────────────────────────────
-- Adds sync_version to every global_* child table that lacks it, so they can
-- ride the same offline-first SyncManager pipeline as their local counterparts.
-- deleted_at is already present on each of these tables in global-projects-schema.sql.
--
-- global_activity_log is intentionally skipped — it's append-only, so sync_version
-- adds no value (no in-place edits to version).
--
-- Run this once in Supabase Dashboard → SQL Editor.
-- ──────────────────────────────────────────────────────────────────────────────

alter table global_field_notes      add column if not exists sync_version int not null default 1;
alter table global_devices          add column if not exists sync_version int not null default 1;
alter table global_ip_plan          add column if not exists sync_version int not null default 1;
alter table global_daily_reports    add column if not exists sync_version int not null default 1;
alter table global_project_files    add column if not exists sync_version int not null default 1;
alter table global_network_diagrams add column if not exists sync_version int not null default 1;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
