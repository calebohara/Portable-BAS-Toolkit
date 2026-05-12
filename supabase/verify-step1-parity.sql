-- ─── Step 1 Verification — Global ↔ Local Projects Parity ──────────────────
-- Run this AFTER applying every migration written in Step 1 of the SyncAgents
-- parity plan (docs/SyncAgents-plan-2026-05-12.md). It asserts that every new
-- column, table, RLS policy, index, and trigger that the 14 migration files
-- were supposed to create actually exists in the database.
--
-- HOW TO RUN
--   • Supabase SQL Editor (recommended): paste this whole file → click Run.
--     Two result panels appear — the first is per-check, the second is a
--     summary count.
--   • psql:   psql "$DATABASE_URL" -f supabase/verify-step1-parity.sql
--   • Supabase CLI:   supabase db execute -f supabase/verify-step1-parity.sql
--
-- HOW TO READ THE OUTPUT
--   • Sort by `status` desc — anything with `✗` is a failure.
--   • The summary row at the end shows passed / failed / total.
--   • Re-running is safe; the script is read-only (a `create temp table`
--     auto-drops on commit, no schema is modified).
--
-- COVERAGE — checks correspond one-to-one with the migration files:
--   A.1  add-global-project-parity-fields.sql
--   A.2  add-global-project-preferences.sql
--   A.3  add-local-projects-global-link.sql
--   B    add-sync-columns-global-children.sql
--   C+D  add-global-{ppcl,terminal,pid,psych,register,ping,trend,
--                    connection,field-panels,notepad}.sql  (the 10 new tables)
-- ─────────────────────────────────────────────────────────────────────────────

create temp table step1_checks on commit drop as
with

-- ─── Inputs ────────────────────────────────────────────────────────────────
new_global_child_tables(t) as (
  values
    ('global_ppcl_documents'),
    ('global_terminal_session_logs'),
    ('global_pid_tuning_sessions'),
    ('global_psych_sessions'),
    ('global_register_calculations'),
    ('global_ping_sessions'),
    ('global_trend_sessions'),
    ('global_connection_profiles'),
    ('global_field_panels'),
    ('global_project_notepad_entries')
),

existing_global_tables_needing_sync_version(t) as (
  values
    ('global_field_notes'),
    ('global_devices'),
    ('global_ip_plan'),
    ('global_daily_reports'),
    ('global_project_files'),
    ('global_network_diagrams')
),

parity_columns(col, expected_type) as (
  values
    ('customer_name',        'text'),
    ('technician_notes',     'text'),
    ('panel_roster_summary', 'text'),
    ('network_summary',      'text'),
    ('contacts',             'jsonb'),
    ('sync_version',         'integer')
),

required_child_columns(col) as (
  values
    ('id'),
    ('global_project_id'),
    ('created_by'),
    ('updated_by'),
    ('deleted_at'),
    ('sync_version'),
    ('created_at'),
    ('updated_at')
),

-- ─── A.1: parity fields on global_projects ─────────────────────────────────
a1 as (
  select
    'A.1' as section,
    'column global_projects.' || p.col as check_name,
    case when c.data_type = p.expected_type then '✓' else '✗' end as status,
    'expected ' || p.expected_type || ', got ' || coalesce(c.data_type::text, '(missing)') as details
  from parity_columns p
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name   = 'global_projects'
   and c.column_name  = p.col
),

-- ─── A.2: global_project_preferences table ─────────────────────────────────
a2_table_exists as (
  select 'A.2', 'table global_project_preferences exists',
    case when exists (
      select 1 from information_schema.tables
       where table_schema='public' and table_name='global_project_preferences'
    ) then '✓' else '✗' end,
    ''::text
),
a2_columns as (
  select 'A.2',
    'column global_project_preferences.' || col,
    case when exists (
      select 1 from information_schema.columns
       where table_schema='public' and table_name='global_project_preferences'
         and column_name = col
    ) then '✓' else '✗' end,
    ''::text
  from (values
    ('user_id'),
    ('global_project_id'),
    ('is_pinned'),
    ('is_offline_available'),
    ('last_viewed_tab'),
    ('preferences'),
    ('created_at'),
    ('updated_at')
  ) as cols(col)
),
a2_composite_pk as (
  select 'A.2', 'global_project_preferences PK is (user_id, global_project_id)',
    case when (
      select string_agg(a.attname, ',' order by array_position(con.conkey, a.attnum))
        from pg_constraint con
        join pg_class cl on cl.oid = con.conrelid
        join pg_namespace ns on ns.oid = cl.relnamespace
        join pg_attribute a on a.attrelid = cl.oid and a.attnum = any(con.conkey)
       where ns.nspname='public' and cl.relname='global_project_preferences' and con.contype='p'
       group by con.oid
    ) = 'user_id,global_project_id' then '✓' else '✗' end,
    coalesce((
      select 'got: ' || string_agg(a.attname, ',' order by array_position(con.conkey, a.attnum))
        from pg_constraint con
        join pg_class cl on cl.oid = con.conrelid
        join pg_namespace ns on ns.oid = cl.relnamespace
        join pg_attribute a on a.attrelid = cl.oid and a.attnum = any(con.conkey)
       where ns.nspname='public' and cl.relname='global_project_preferences' and con.contype='p'
       group by con.oid
    ), '(no PK)')
),
a2_rls as (
  select 'A.2', 'global_project_preferences RLS enabled',
    case when (
      select c.relrowsecurity from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname='public' and c.relname='global_project_preferences'
    ) then '✓' else '✗' end,
    ''::text
),
a2_policy_count as (
  select 'A.2', 'global_project_preferences has ≥1 RLS policy',
    case when (
      select count(*) from pg_policies
       where schemaname='public' and tablename='global_project_preferences'
    ) >= 1 then '✓' else '✗' end,
    'got ' || (select count(*) from pg_policies
                where schemaname='public' and tablename='global_project_preferences')::text || ' policies'
),
a2_trigger as (
  select 'A.2', 'global_project_preferences_updated_at trigger exists',
    case when exists (
      select 1 from information_schema.triggers
       where event_object_schema='public'
         and event_object_table='global_project_preferences'
         and trigger_name = 'global_project_preferences_updated_at'
    ) then '✓' else '✗' end,
    ''::text
),
a2_indexes as (
  select 'A.2', 'global_project_preferences has user + project indexes',
    case when (
      select count(*) from pg_indexes
       where schemaname='public' and tablename='global_project_preferences'
         and indexname in ('idx_gp_prefs_user','idx_gp_prefs_project')
    ) = 2 then '✓' else '✗' end,
    'got ' || (select string_agg(indexname, ', ' order by indexname)
                 from pg_indexes
                where schemaname='public' and tablename='global_project_preferences'
                  and indexname like 'idx_gp_%')
),

-- ─── A.3: projects.synced_global_id + its index ────────────────────────────
a3_column as (
  select 'A.3', 'column projects.synced_global_id',
    case when exists (
      select 1 from information_schema.columns
       where table_schema='public' and table_name='projects' and column_name='synced_global_id'
    ) then '✓' else '✗' end,
    ''::text
),
a3_fk as (
  select 'A.3', 'projects.synced_global_id FK → global_projects(id)',
    case when exists (
      select 1
        from pg_constraint con
        join pg_class cl  on cl.oid = con.conrelid
        join pg_class ref on ref.oid = con.confrelid
        join pg_namespace ns on ns.oid = cl.relnamespace
        join pg_attribute a on a.attrelid = cl.oid and a.attnum = any(con.conkey)
       where ns.nspname='public' and cl.relname='projects'
         and con.contype='f' and a.attname='synced_global_id'
         and ref.relname='global_projects'
    ) then '✓' else '✗' end,
    ''::text
),
a3_index as (
  select 'A.3', 'partial index idx_projects_synced_global',
    case when exists (
      select 1 from pg_indexes
       where schemaname='public' and tablename='projects'
         and indexname='idx_projects_synced_global'
    ) then '✓' else '✗' end,
    ''::text
),

-- ─── B: sync_version added to 6 existing global child tables ───────────────
b_sync_version as (
  select 'B',
    'sync_version on ' || e.t,
    case when exists (
      select 1 from information_schema.columns
       where table_schema='public' and table_name=e.t and column_name='sync_version'
    ) then '✓' else '✗' end,
    ''::text
  from existing_global_tables_needing_sync_version e
),

-- ─── C+D: 10 new global child tables exist ─────────────────────────────────
cd_tables_exist as (
  select 'C/D',
    'table ' || t.t || ' exists',
    case when exists (
      select 1 from information_schema.tables
       where table_schema='public' and table_name=t.t
    ) then '✓' else '✗' end,
    ''::text
  from new_global_child_tables t
),

-- ─── C+D: each new table has the 8 required audit/parent columns ──────────
cd_required_columns as (
  select 'C/D',
    t.t || '.' || c.col,
    case when exists (
      select 1 from information_schema.columns
       where table_schema='public' and table_name=t.t and column_name=c.col
    ) then '✓' else '✗' end,
    ''::text
  from new_global_child_tables t
  cross join required_child_columns c
),

-- ─── C+D: global_project_id is NOT NULL on every new table ─────────────────
-- (Deliberate divergence from local schema — Schema D flagged in the report.)
cd_gpid_not_null as (
  select 'C/D',
    t.t || '.global_project_id NOT NULL',
    case when (
      select c.is_nullable
        from information_schema.columns c
       where c.table_schema='public' and c.table_name=t.t and c.column_name='global_project_id'
    ) = 'NO' then '✓' else '✗' end,
    coalesce((
      select 'is_nullable=' || c.is_nullable
        from information_schema.columns c
       where c.table_schema='public' and c.table_name=t.t and c.column_name='global_project_id'
    ), '(column missing)')
  from new_global_child_tables t
),

-- ─── C+D: RLS enabled on every new table ───────────────────────────────────
cd_rls as (
  select 'C/D',
    t.t || ' RLS enabled',
    case when (
      select c.relrowsecurity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname='public' and c.relname=t.t
    ) then '✓' else '✗' end,
    ''::text
  from new_global_child_tables t
),

-- ─── C+D: each new table has exactly 4 RLS policies ────────────────────────
cd_policy_count as (
  select 'C/D',
    t.t || ' has 4 RLS policies',
    case when (
      select count(*) from pg_policies
       where schemaname='public' and tablename=t.t
    ) = 4 then '✓' else '✗' end,
    'got ' || (select count(*) from pg_policies
                where schemaname='public' and tablename=t.t)::text || ' policies'
  from new_global_child_tables t
),

-- ─── C+D: each new table has at least the 2 standard indexes ───────────────
cd_index_count as (
  select 'C/D',
    t.t || ' has ≥2 idx_global_* indexes',
    case when (
      select count(*) from pg_indexes
       where schemaname='public' and tablename=t.t
         and indexname like 'idx_global_%'
    ) >= 2 then '✓' else '✗' end,
    'got ' || (select count(*) from pg_indexes
                where schemaname='public' and tablename=t.t
                  and indexname like 'idx_global_%')::text || ' indexes'
  from new_global_child_tables t
),

-- ─── C+D: each new table has the updated_at trigger ────────────────────────
cd_trigger as (
  select 'C/D',
    t.t || '_updated_at trigger',
    case when exists (
      select 1 from information_schema.triggers
       where event_object_schema='public'
         and event_object_table=t.t
         and trigger_name = t.t || '_updated_at'
    ) then '✓' else '✗' end,
    ''::text
  from new_global_child_tables t
),

-- ─── Roll-up of every check  ───────────────────────────────────────────────
all_checks(section, check_name, status, details) as (
  select * from a1                  union all
  select * from a2_table_exists     union all
  select * from a2_columns          union all
  select * from a2_composite_pk     union all
  select * from a2_rls              union all
  select * from a2_policy_count     union all
  select * from a2_trigger          union all
  select * from a2_indexes          union all
  select * from a3_column           union all
  select * from a3_fk               union all
  select * from a3_index            union all
  select * from b_sync_version      union all
  select * from cd_tables_exist     union all
  select * from cd_required_columns union all
  select * from cd_gpid_not_null    union all
  select * from cd_rls              union all
  select * from cd_policy_count     union all
  select * from cd_index_count      union all
  select * from cd_trigger
)
select * from all_checks;

-- ─── Result panel 1: every check, failures first ───────────────────────────
select section,
       status,
       check_name,
       details
  from step1_checks
 order by case status when '✗' then 0 else 1 end,
          section,
          check_name;

-- ─── Result panel 2: summary ───────────────────────────────────────────────
select
  count(*)                            as total_checks,
  count(*) filter (where status='✓')  as passed,
  count(*) filter (where status='✗')  as failed,
  case
    when count(*) filter (where status='✗') = 0 then '✓ All Step 1 migrations verified'
    else '✗ ' || count(*) filter (where status='✗')::text || ' check(s) failed — see failures panel'
  end                                  as result
from step1_checks;

-- ─── Result panel 3: failures only (the one you actually want to read) ─────
-- If this panel returns 0 rows, every check passed.
-- If it returns N rows, those are exactly the N checks that need fixing.
select section,
       check_name,
       details
  from step1_checks
 where status = '✗'
 order by section, check_name;
