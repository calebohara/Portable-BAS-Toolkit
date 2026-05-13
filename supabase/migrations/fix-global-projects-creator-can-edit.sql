-- ─── global_projects: creators can always edit their own project ─────────────
-- Symptom: a global project's CREATOR was getting 42501 RLS rejected when
-- pushing edits to global_projects. The UPDATE/DELETE policies require
-- `is_global_project_admin(id)` (i.e. a membership row with role='admin'),
-- which depends on the `auto_add_global_project_creator` trigger having fired
-- correctly when the project was created. If the trigger didn't fire (e.g. the
-- project pre-dates the trigger, or was inserted via a code path that bypassed
-- it) the creator can no longer edit their own project.
--
-- Fix: make the policy robust to a missing admin membership row by ORing in
-- `auth.uid() = created_by`. The SELECT policy already does this — bringing
-- UPDATE/DELETE in line.
--
-- Backfill: idempotently insert the admin membership for any project whose
-- creator is missing one, so existing data heals retroactively.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Update policies

drop policy if exists "Admins can update global projects" on global_projects;
create policy "Admins or creator can update global projects"
  on global_projects for update
  using (is_global_project_admin(id) or auth.uid() = created_by);

drop policy if exists "Admins can delete global projects" on global_projects;
create policy "Admins or creator can delete global projects"
  on global_projects for delete
  using (is_global_project_admin(id) or auth.uid() = created_by);

-- 2. Backfill missing admin memberships for creators
--    (idempotent — only inserts where no membership row already exists)

insert into global_project_members (id, global_project_id, user_id, role)
select
  gen_random_uuid(),
  gp.id,
  gp.created_by,
  'admin'
from global_projects gp
where not exists (
  select 1 from global_project_members gpm
  where gpm.global_project_id = gp.id
    and gpm.user_id = gp.created_by
);
