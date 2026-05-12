-- ─── Global Project Notepad Entries ─────────────────────────────────────────
-- Team-shared mirror of the local `project_notepad_entries` table.
--
-- Per-project notepad notes (independent from the floating sticky notepad).
-- Locally `project_id` is NOT NULL — a notepad entry always belongs to a
-- project. On the global side we keep that NOT NULL invariant; the entry
-- belongs to a global project and follows membership RLS.
--
-- Column rules applied:
--   - Drop local `user_id`
--   - Replace local `project_id` → `global_project_id` (NOT NULL + cascade,
--     matches the local NOT NULL nullability)
--   - Add `created_by` (NOT NULL) and `updated_by`
--   - Keep all other content columns identical (`name`, `content`,
--     `linked_tab_id`, `deleted_at`, `sync_version`, timestamps)
--
-- Indexes mirror the local schema's `idx_notepad_entries_project` and
-- `idx_notepad_entries_user`, with the latter swapped for `created_by`.
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists global_project_notepad_entries (
  id uuid primary key default gen_random_uuid(),
  global_project_id uuid not null references global_projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  name text not null default '',
  content text not null default '',
  linked_tab_id text,
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table global_project_notepad_entries enable row level security;

create policy "Members can view global notepad entries"
  on global_project_notepad_entries for select
  using (is_global_project_member(global_project_id));

create policy "Members can create global notepad entries"
  on global_project_notepad_entries for insert
  with check (is_global_project_member(global_project_id) and created_by = auth.uid());

create policy "Creator or admin can update global notepad entries"
  on global_project_notepad_entries for update
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create policy "Creator or admin can delete global notepad entries"
  on global_project_notepad_entries for delete
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create trigger global_project_notepad_entries_updated_at
  before update on global_project_notepad_entries
  for each row execute function set_updated_at();

create index if not exists idx_global_notepad_entries_project on global_project_notepad_entries(global_project_id);
create index if not exists idx_global_notepad_entries_creator on global_project_notepad_entries(created_by);

-- Reload PostgREST schema cache so the new table is queryable immediately.
notify pgrst, 'reload schema';
