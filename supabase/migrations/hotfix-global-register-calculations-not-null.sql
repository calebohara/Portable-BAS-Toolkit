-- ─── Hotfix — global_register_calculations.global_project_id NOT NULL ──────
-- The original add-global-register-calculations.sql created this column as
-- nullable to mirror the local `register_calculations.project_id` semantics.
-- That was wrong on the global side: the RLS predicate
-- `is_global_project_member(global_project_id)` returns false when its arg is
-- null, so any row inserted with a null project would be permanently invisible
-- to every user — including the row's creator. Forbidding the null at the
-- column level is safer than allowing orphan-but-inaccessible rows.
--
-- Safe to run because the table is new (Step 1 of the SyncAgents parity plan)
-- and has no production data yet. If you somehow have rows with a null
-- global_project_id when this runs, the ALTER will fail and you'll need to
-- decide whether to delete or reassign them first.
-- ──────────────────────────────────────────────────────────────────────────────

alter table global_register_calculations
  alter column global_project_id set not null;

notify pgrst, 'reload schema';
