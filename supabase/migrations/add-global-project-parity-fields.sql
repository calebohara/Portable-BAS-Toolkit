-- ─── Global Projects: Parity Fields ─────────────────────────────────────────
-- Extends global_projects with the fields that exist on local projects so the
-- two surfaces can round-trip losslessly.
--
-- WHY: Today migrate.ts has to fold technician_notes + panel_roster_summary
-- into description, and silently drops contacts, network_summary, isPinned,
-- isOfflineAvailable. After this migration, global_projects can hold the same
-- shape as local projects (minus the per-user fields, which live in their own
-- preferences table — see add-global-project-preferences.sql).
--
-- NOTES:
--   - global_projects.description stays as-is; technician_notes is its own
--     dedicated field going forward.
--   - panel_roster_summary and network_summary are nullable to match the
--     local Project shape (string | null).
--   - contacts uses jsonb (not a child table) — matches how local projects
--     store Contact[] embedded on the project row.
--   - sync_version brings global_projects in line with every other synced
--     table so the SyncManager can use the same conflict-detection path.
--
-- Idempotent: uses `add column if not exists` so re-running is safe.
-- ──────────────────────────────────────────────────────────────────────────────

alter table global_projects
  add column if not exists customer_name text not null default '',
  add column if not exists technician_notes text not null default '',
  add column if not exists panel_roster_summary text,
  add column if not exists network_summary text,
  add column if not exists contacts jsonb not null default '[]',
  add column if not exists sync_version int not null default 1;

-- Reload PostgREST schema cache so the new columns are queryable immediately.
notify pgrst, 'reload schema';
