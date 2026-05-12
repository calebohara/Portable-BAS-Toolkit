-- ─── Global PPCL Documents ──────────────────────────────────────────────────
-- Shared PPCL program files for a global (multi-user) project.
-- Mirrors the local `ppcl_documents` table — see supabase/schema.sql.
-- Membership-based RLS via is_global_project_member / is_global_project_admin
-- (defined in supabase/global-projects-schema.sql).
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists global_ppcl_documents (
  id uuid primary key default gen_random_uuid(),
  global_project_id uuid not null references global_projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  name text not null default '',
  content text not null default '',
  firmware text not null default 'pxc-tc',
  deleted_at timestamptz,
  sync_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table global_ppcl_documents enable row level security;

drop policy if exists "Members can view global PPCL documents" on global_ppcl_documents;
create policy "Members can view global PPCL documents"
  on global_ppcl_documents for select
  using (is_global_project_member(global_project_id));

drop policy if exists "Members can create global PPCL documents" on global_ppcl_documents;
create policy "Members can create global PPCL documents"
  on global_ppcl_documents for insert
  with check (is_global_project_member(global_project_id) and created_by = auth.uid());

drop policy if exists "Creator or admin can update global PPCL documents" on global_ppcl_documents;
create policy "Creator or admin can update global PPCL documents"
  on global_ppcl_documents for update
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

drop policy if exists "Creator or admin can delete global PPCL documents" on global_ppcl_documents;
create policy "Creator or admin can delete global PPCL documents"
  on global_ppcl_documents for delete
  using (created_by = auth.uid() or is_global_project_admin(global_project_id));

create trigger global_ppcl_documents_updated_at
  before update on global_ppcl_documents
  for each row execute function set_updated_at();

create index if not exists idx_global_ppcl_documents_project on global_ppcl_documents(global_project_id);
create index if not exists idx_global_ppcl_documents_creator on global_ppcl_documents(created_by);
