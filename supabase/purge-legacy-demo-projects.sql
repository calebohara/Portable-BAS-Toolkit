-- ───────────────────────────────────────────────────────────────────────────
-- ONE-TIME maintenance script — purge the 5 legacy demo projects (cloud-wide)
-- ───────────────────────────────────────────────────────────────────────────
-- NOT a migration (no ledger footer / probe). Run ONCE in the Supabase SQL
-- Editor, as the service role, AFTER all devices are on v4.26.0+ so the
-- tombstone propagates and STICKS (Phase 1a delete-propagation + anti-
-- resurrection). On an older client the re-push would un-delete it again.
--
-- These rows were seeded into IndexedDB by the original demo-data file
-- (removed in commit c8ffa23) and synced to the cloud before demo seeding was
-- removed. They resurrect through the old delete-resurrection loop. This
-- SOFT-deletes them (stamps deleted_at = now()) so the tombstone pulls down to
-- every device and the rows disappear locally and stay gone.
--
-- Identified by project_number + name (stable text columns) rather than id,
-- since the demo `id`s ("proj-ahu-upgrade", …) may have been remapped on push.
--
-- Idempotent: re-running only re-stamps an already-tombstoned row's deleted_at
-- (harmless). Children are cascaded dynamically across EVERY public table that
-- has both a `project_id` and a `deleted_at` column, so no table list to
-- maintain.
-- ───────────────────────────────────────────────────────────────────────────

do $$
declare
  demo_numbers text[] := array[
    '44OP-001847',  -- AHU-1/2 Controls Upgrade
    '44OP-002103',  -- Clinical Lab Renovation BAS
    '44OP-000892',  -- Central Plant Panel Migration
    '44OP-003301',  -- VAV Floor 2-5 Retrofit
    '44OP-004455'   -- Exhaust Fan VFD Retrofit
  ];
  demo_names text[] := array[
    'AHU-1/2 Controls Upgrade',
    'Clinical Lab Renovation BAS',
    'Central Plant Panel Migration',
    'VAV Floor 2-5 Retrofit',
    'Exhaust Fan VFD Retrofit'
  ];
  demo_ids uuid[];
  child record;
  n_children bigint;
begin
  -- 1. Collect the cloud ids of the demo projects (by number OR name).
  select coalesce(array_agg(id), '{}') into demo_ids
  from public.projects
  where project_number = any(demo_numbers)
     or name = any(demo_names);

  if array_length(demo_ids, 1) is null then
    raise notice 'No legacy demo projects found — nothing to purge.';
    return;
  end if;

  raise notice 'Purging % demo project(s): %', array_length(demo_ids, 1), demo_ids;

  -- 2. Cascade soft-delete every child row in any public table that has BOTH
  --    a project_id and a deleted_at column.
  for child in
    select c1.table_name
    from information_schema.columns c1
    join information_schema.columns c2
      on c1.table_schema = c2.table_schema
     and c1.table_name   = c2.table_name
    where c1.table_schema = 'public'
      and c1.column_name  = 'project_id'
      and c2.column_name  = 'deleted_at'
      and c1.table_name <> 'projects'
  loop
    execute format(
      'update public.%I set deleted_at = now()
        where project_id = any($1) and deleted_at is null',
      child.table_name
    ) using demo_ids;
    get diagnostics n_children = row_count;
    if n_children > 0 then
      raise notice '  % : soft-deleted % child row(s)', child.table_name, n_children;
    end if;
  end loop;

  -- 3. Soft-delete the project rows themselves.
  update public.projects
     set deleted_at = now()
   where id = any(demo_ids)
     and deleted_at is null;

  raise notice 'Done. Demo projects tombstoned; tombstones will propagate on next pull.';
end $$;

notify pgrst, 'reload schema';
