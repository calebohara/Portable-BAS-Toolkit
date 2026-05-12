-- ─── Global Trend Sessions ──────────────────────────────────────────────────
-- Team-shared mirror of the local `TrendSession` IndexedDB store.
--
-- NOTE: there is no local Supabase table for `trend_sessions` yet (the local
-- side stores trend sessions only in IndexedDB — see `field-map.ts` entry
-- `trendSessions → 'trend_sessions'` which references a not-yet-created
-- table). The column shape below is derived from `TrendSession` in
-- `src/types/index.ts`:
--
--   { id, projectId, name, description, sourceSystem, series, data,
--     anomalies, anomalyConfig, stats, createdAt, updatedAt }
--
-- For the global twin we apply the standard rules:
--   - Drop `user_id` (not present locally either — see above)
--   - Replace `projectId` → `global_project_id` (NOT NULL; locally NOT NULL)
--   - Add `created_by` (NOT NULL) and `updated_by`
--   - Carry `deleted_at` + `sync_version` for the SyncManager pipeline
--
-- Large JSON columns (data, anomalies, stats, series) are stored as `jsonb`
-- exactly like `psych_sessions.results` / `daily_reports.attachments`.
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists global_trend_sessions (
  id uuid primary key default gen_random_uuid(),
  global_project_id uuid not null references global_projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  name text not null default '',
  description text not null default '',
  source_system text not null default 'generic',
  series jsonb not null default '[]',
  data jsonb not null default '[]',
  anomalies jsonb not null default '[]',
  anomaly_config jsonb not null default '{}',
  stats jsonb not null default '[]',
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table global_trend_sessions enable row level security;

create policy "Members can view global trend sessions"
  on global_trend_sessions for select
  using (is_global_project_member(global_project_id));

create policy "Members can create global trend sessions"
  on global_trend_sessions for insert
  with check (is_global_project_member(global_project_id) and created_by = auth.uid());

create policy "Creator or admin can update global trend sessions"
  on global_trend_sessions for update
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create policy "Creator or admin can delete global trend sessions"
  on global_trend_sessions for delete
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create trigger global_trend_sessions_updated_at
  before update on global_trend_sessions
  for each row execute function set_updated_at();

create index if not exists idx_global_trend_sessions_project on global_trend_sessions(global_project_id);
create index if not exists idx_global_trend_sessions_creator on global_trend_sessions(created_by);

-- Reload PostgREST schema cache so the new table is queryable immediately.
notify pgrst, 'reload schema';
