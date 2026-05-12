-- ─── Local Projects → Global Link ───────────────────────────────────────────
-- Adds a stable pointer from a local project to the global project it was
-- shared to (or pulled from).
--
-- WHY: Today the share-to-global flow in migrate.ts generates a fresh UUID on
-- every call. There is no way to tell "this local project already has a global
-- twin" — so a second share creates a duplicate global project, and a pull
-- from global creates a duplicate local project. End result: the two stores
-- drift apart immediately.
--
-- With `synced_global_id` populated:
--   - share-to-global checks the column; if set, it UPDATES the existing
--     global project instead of inserting a new one.
--   - save-to-local does the reverse — it can match by id and update in place.
--   - The reconcile rewrite (replacing migrate.ts) uses this column to drive
--     idempotent ID-preserving sync in both directions.
--
-- ON DELETE SET NULL: if the global project is deleted, the local copy is
-- preserved and just loses its link (rather than being cascade-deleted).
--
-- Partial index: the column is nullable and most rows will be null, so a
-- partial index over the non-null subset keeps it cheap.
-- ──────────────────────────────────────────────────────────────────────────────

alter table projects
  add column if not exists synced_global_id uuid
    references global_projects(id) on delete set null;

create index if not exists idx_projects_synced_global
  on projects(synced_global_id)
  where synced_global_id is not null;

-- Reload PostgREST schema cache so the new column is queryable immediately.
notify pgrst, 'reload schema';
