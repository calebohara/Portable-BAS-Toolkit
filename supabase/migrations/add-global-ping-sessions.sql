-- ─── Global Ping Sessions ───────────────────────────────────────────────────
-- Team-shared mirror of the local `ping_sessions` table.
--
-- Locally a ping session is per-user (`user_id`) and project_id is NULLABLE
-- (you can run ad-hoc pings without a project). On the global side every row
-- belongs to a global project — there is no "user library" of pings shared
-- with a team, so `global_project_id` is NOT NULL here (divergence from
-- local schema, but required because the membership RLS predicate
-- `is_global_project_member(global_project_id)` would fail on NULL rows).
--
-- Column rules applied:
--   - Drop local `user_id`
--   - Replace local `project_id` → `global_project_id` (NOT NULL, see above)
--   - Add `created_by` (NOT NULL) and `updated_by`
--   - Keep all other content columns identical
--   - Preserve `deleted_at`, `sync_version`, `created_at`, `updated_at`
--
-- RLS: member-read, member-create (with `created_by = auth.uid()`),
-- creator-or-admin update/delete — same wording style as `global_field_notes`.
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists global_ping_sessions (
  id uuid primary key default gen_random_uuid(),
  global_project_id uuid not null references global_projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  targets jsonb not null default '[]',
  results jsonb not null default '{}',
  mode text not null default 'single',
  interval_ms int not null default 1000,
  completed_at timestamptz,
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table global_ping_sessions enable row level security;

create policy "Members can view global ping sessions"
  on global_ping_sessions for select
  using (is_global_project_member(global_project_id));

create policy "Members can create global ping sessions"
  on global_ping_sessions for insert
  with check (is_global_project_member(global_project_id) and created_by = auth.uid());

create policy "Creator or admin can update global ping sessions"
  on global_ping_sessions for update
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create policy "Creator or admin can delete global ping sessions"
  on global_ping_sessions for delete
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create trigger global_ping_sessions_updated_at
  before update on global_ping_sessions
  for each row execute function set_updated_at();

create index if not exists idx_global_ping_sessions_project on global_ping_sessions(global_project_id);
create index if not exists idx_global_ping_sessions_creator on global_ping_sessions(created_by);

-- Reload PostgREST schema cache so the new table is queryable immediately.
notify pgrst, 'reload schema';
