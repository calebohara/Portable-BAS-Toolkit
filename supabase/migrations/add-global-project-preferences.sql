-- ─── Global Project Preferences (per-user) ──────────────────────────────────
-- Per-user preferences attached to a global project: pinned state, offline
-- caching opt-in, last-viewed tab, and an open-ended jsonb bag for future
-- per-member settings.
--
-- WHY: Local projects carry `isPinned` and `isOfflineAvailable` on the project
-- row itself, but on a *shared* global project those flags are inherently
-- per-member (one teammate pinning a project shouldn't pin it for everyone).
-- So they live in their own table keyed on (user_id, global_project_id).
--
-- The hooks layer will join this table to global_projects when surfacing the
-- joined `isPinned` / `isOfflineAvailable` fields on the GlobalProject shape.
--
-- RLS: simple — each user manages their own rows. Membership in the global
-- project itself is enforced by FK + the parent global_projects RLS.
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists global_project_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  global_project_id uuid not null references global_projects(id) on delete cascade,
  is_pinned boolean not null default false,
  is_offline_available boolean not null default false,
  last_viewed_tab text,
  preferences jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, global_project_id)
);

alter table global_project_preferences enable row level security;

-- A user can do anything to their own preference rows. Membership check on the
-- parent project is implicit via the global_project_id FK + cascading deletes.
drop policy if exists "Users can manage their own global project preferences"
  on global_project_preferences;
create policy "Users can manage their own global project preferences"
  on global_project_preferences for all using (auth.uid() = user_id);

create trigger global_project_preferences_updated_at
  before update on global_project_preferences
  for each row execute function set_updated_at();

create index if not exists idx_gp_prefs_user
  on global_project_preferences(user_id);
create index if not exists idx_gp_prefs_project
  on global_project_preferences(global_project_id);

-- Reload PostgREST schema cache so the new table is queryable immediately.
notify pgrst, 'reload schema';
