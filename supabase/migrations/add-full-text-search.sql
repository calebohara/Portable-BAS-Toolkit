-- ─── Full-Text Search Infrastructure ────────────────────────────────────────
-- Adds tsvector columns, GIN indexes, auto-update triggers, and a unified
-- search_global() RPC function for server-side full-text search.
-- Safe to run multiple times (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. tsvector columns + GIN indexes + triggers
-- ═══════════════════════════════════════════════════════════════════════════

-- ── global_projects ─────────────────────────────────────────────────────
alter table global_projects add column if not exists fts tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(job_site_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(project_number, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(site_address, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(building_area, '')), 'C')
  ) stored;

create index if not exists idx_global_projects_fts on global_projects using gin (fts);

-- ── global_field_notes ──────────────────────────────────────────────────
alter table global_field_notes add column if not exists fts tsvector
  generated always as (
    to_tsvector('english', coalesce(content, ''))
  ) stored;

create index if not exists idx_global_field_notes_fts on global_field_notes using gin (fts);

-- ── global_devices ──────────────────────────────────────────────────────
alter table global_devices add column if not exists fts tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(device_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(panel, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(system, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(ip_address, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(notes, '')), 'C')
  ) stored;

create index if not exists idx_global_devices_fts on global_devices using gin (fts);

-- ── global_ip_plan ──────────────────────────────────────────────────────
alter table global_ip_plan add column if not exists fts tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(ip_address, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(hostname, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(panel, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(device_role, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(vlan, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(subnet, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(notes, '')), 'C')
  ) stored;

create index if not exists idx_global_ip_plan_fts on global_ip_plan using gin (fts);

-- ── global_daily_reports ────────────────────────────────────────────────
alter table global_daily_reports add column if not exists fts tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(technician_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(work_completed, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(issues_encountered, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(work_planned_next, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(equipment_worked_on, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(general_notes, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(location, '')), 'C')
  ) stored;

create index if not exists idx_global_daily_reports_fts on global_daily_reports using gin (fts);

-- ── global_project_files ────────────────────────────────────────────────
alter table global_project_files add column if not exists fts tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(file_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(category, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(notes, '')), 'C')
  ) stored;

create index if not exists idx_global_project_files_fts on global_project_files using gin (fts);

-- ── global_messages ─────────────────────────────────────────────────────
alter table global_messages add column if not exists fts tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(subject, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) stored;

create index if not exists idx_global_messages_fts on global_messages using gin (fts);


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Unified search_global() RPC function
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function search_global(search_query text, result_limit int default 20)
returns table (
  source_table text,
  id uuid,
  project_id uuid,
  project_name text,
  title text,
  snippet text,
  rank real,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  tsquery_val tsquery;
  calling_user_id uuid;
begin
  -- Get the authenticated user's ID
  calling_user_id := auth.uid();

  -- If not authenticated, return nothing
  if calling_user_id is null then
    return;
  end if;

  -- Convert search input to tsquery (prefix matching for partial words)
  tsquery_val := plainto_tsquery('english', search_query);

  -- If the query is empty, return nothing
  if tsquery_val::text = '' then
    return;
  end if;

  return query
  with user_projects as (
    -- Pre-compute the set of project IDs this user is a member of
    select gpm.global_project_id
    from global_project_members gpm
    where gpm.user_id = calling_user_id
  )

  -- ── Projects ──────────────────────────────────────────────────────────
  select
    'projects'::text as source_table,
    gp.id,
    gp.id as project_id,
    gp.name as project_name,
    gp.name as title,
    left(coalesce(gp.description, gp.job_site_name, ''), 200) as snippet,
    ts_rank(gp.fts, tsquery_val) as rank,
    gp.created_at
  from global_projects gp
  where gp.deleted_at is null
    and gp.fts @@ tsquery_val
    and gp.id in (select global_project_id from user_projects)

  union all

  -- ── Field Notes ───────────────────────────────────────────────────────
  select
    'notes'::text,
    fn.id,
    fn.global_project_id as project_id,
    gp.name as project_name,
    fn.category::text as title,
    left(fn.content, 200) as snippet,
    ts_rank(fn.fts, tsquery_val),
    fn.created_at
  from global_field_notes fn
  join global_projects gp on gp.id = fn.global_project_id
  where fn.deleted_at is null
    and fn.fts @@ tsquery_val
    and fn.global_project_id in (select global_project_id from user_projects)

  union all

  -- ── Devices ───────────────────────────────────────────────────────────
  select
    'devices'::text,
    d.id,
    d.global_project_id as project_id,
    gp.name as project_name,
    d.device_name as title,
    left(coalesce(d.description, '') || ' — ' || coalesce(d.ip_address, '') || ' — ' || coalesce(d.panel, ''), 200) as snippet,
    ts_rank(d.fts, tsquery_val),
    d.created_at
  from global_devices d
  join global_projects gp on gp.id = d.global_project_id
  where d.deleted_at is null
    and d.fts @@ tsquery_val
    and d.global_project_id in (select global_project_id from user_projects)

  union all

  -- ── IP Plan ───────────────────────────────────────────────────────────
  select
    'ip_plan'::text,
    ip.id,
    ip.global_project_id as project_id,
    gp.name as project_name,
    (ip.ip_address || ' — ' || ip.hostname) as title,
    left(coalesce(ip.device_role, '') || ' — VLAN ' || coalesce(ip.vlan, '') || ' — ' || coalesce(ip.subnet, ''), 200) as snippet,
    ts_rank(ip.fts, tsquery_val),
    ip.created_at
  from global_ip_plan ip
  join global_projects gp on gp.id = ip.global_project_id
  where ip.deleted_at is null
    and ip.fts @@ tsquery_val
    and ip.global_project_id in (select global_project_id from user_projects)

  union all

  -- ── Daily Reports ─────────────────────────────────────────────────────
  select
    'reports'::text,
    dr.id,
    dr.global_project_id as project_id,
    gp.name as project_name,
    ('Report #' || dr.report_number || ' — ' || dr.date::text) as title,
    left(coalesce(dr.work_completed, dr.issues_encountered, dr.general_notes, ''), 200) as snippet,
    ts_rank(dr.fts, tsquery_val),
    dr.created_at
  from global_daily_reports dr
  join global_projects gp on gp.id = dr.global_project_id
  where dr.deleted_at is null
    and dr.fts @@ tsquery_val
    and dr.global_project_id in (select global_project_id from user_projects)

  union all

  -- ── Project Files ─────────────────────────────────────────────────────
  select
    'files'::text,
    pf.id,
    pf.global_project_id as project_id,
    gp.name as project_name,
    pf.title,
    left(coalesce(pf.file_name, '') || ' — ' || coalesce(pf.category, '') || ' — ' || coalesce(pf.notes, ''), 200) as snippet,
    ts_rank(pf.fts, tsquery_val),
    pf.created_at
  from global_project_files pf
  join global_projects gp on gp.id = pf.global_project_id
  where pf.deleted_at is null
    and pf.fts @@ tsquery_val
    and pf.global_project_id in (select global_project_id from user_projects)

  union all

  -- ── Messages ──────────────────────────────────────────────────────────
  -- Messages: visible if user is a member of the project, OR if it's a
  -- general message (null project_id) and user is a member of any project
  select
    'messages'::text,
    m.id,
    m.global_project_id as project_id,
    coalesce(gp.name, 'General') as project_name,
    m.subject as title,
    left(m.body, 200) as snippet,
    ts_rank(m.fts, tsquery_val),
    m.created_at
  from global_messages m
  left join global_projects gp on gp.id = m.global_project_id
  where m.deleted_at is null
    and m.fts @@ tsquery_val
    and (
      -- Project-scoped message: user must be a member of that project
      m.global_project_id in (select global_project_id from user_projects)
      -- General message (no project): user must be a member of at least one project
      or (m.global_project_id is null and exists (select 1 from user_projects))
    )

  order by rank desc
  limit result_limit;
end;
$$;

-- Grant execute to authenticated users
grant execute on function search_global(text, int) to authenticated;
