-- ─── Migration Drift Check (READ-ONLY) ──────────────────────────────────────
-- Probes one unique "sentinel" object per migration file in supabase/migrations/
-- and reports whether it exists in the live database. 100% read-only — runs no
-- DDL, touches no data. Paste into the Supabase SQL Editor and run.
--
-- applied = true  → the migration's sentinel object exists (migration is live)
-- applied = false → sentinel missing → migration likely NOT applied to this DB
--
-- Sentinel kinds: table / column / function / policy / storage-bucket / not-null.
-- A false is a strong signal, not absolute proof (a later migration could have
-- dropped/renamed the sentinel) — but for this repo each sentinel is the object
-- that migration introduced and nothing else removes.
-- ──────────────────────────────────────────────────────────────────────────────

with probe(seq, migration, probe_desc, applied) as (
  select 1, 'add-account-approval.sql', 'column profiles.approved',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='approved')
  union all select 2, 'add-activity-log-created-at.sql', 'column activity_log.created_at',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='activity_log' and column_name='created_at')
  union all select 3, 'add-bug-report-user-name.sql', 'column bug_reports.user_name',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='bug_reports' and column_name='user_name')
  union all select 4, 'add-bug-reports.sql', 'table bug_reports',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='bug_reports')
  union all select 5, 'add-direct-messages.sql', 'table direct_messages',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='direct_messages')
  union all select 6, 'add-dxrs.sql', 'table dxrs',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='dxrs')
  union all select 7, 'add-field-panels.sql', 'table field_panels',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='field_panels')
  union all select 8, 'add-full-text-search.sql', 'column global_projects.fts',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='global_projects' and column_name='fts')
  union all select 9, 'add-global-connection-profiles.sql', 'table global_connection_profiles',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_connection_profiles')
  union all select 10, 'add-global-dxrs.sql', 'table global_dxrs',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_dxrs')
  union all select 11, 'add-global-field-panels.sql', 'table global_field_panels',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_field_panels')
  union all select 12, 'add-global-message-replies-reads.sql', 'table global_message_reads',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_message_reads')
  union all select 13, 'add-global-messages.sql', 'table global_messages',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_messages')
  union all select 14, 'add-global-pid-tuning-sessions.sql', 'table global_pid_tuning_sessions',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_pid_tuning_sessions')
  union all select 15, 'add-global-ping-sessions.sql', 'table global_ping_sessions',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_ping_sessions')
  union all select 16, 'add-global-ppcl-documents.sql', 'table global_ppcl_documents',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_ppcl_documents')
  union all select 17, 'add-global-project-notepad-entries.sql', 'table global_project_notepad_entries',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_project_notepad_entries')
  union all select 18, 'add-global-project-parity-fields.sql', 'column global_projects.customer_name',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='global_projects' and column_name='customer_name')
  union all select 19, 'add-global-project-preferences.sql', 'table global_project_preferences',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_project_preferences')
  union all select 20, 'add-global-psych-sessions.sql', 'table global_psych_sessions',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_psych_sessions')
  union all select 21, 'add-global-register-calculations.sql', 'table global_register_calculations',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_register_calculations')
  union all select 22, 'add-global-terminal-session-logs.sql', 'table global_terminal_session_logs',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_terminal_session_logs')
  union all select 23, 'add-global-trend-sessions.sql', 'table global_trend_sessions',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_trend_sessions')
  union all select 24, 'add-knowledge-base.sql', 'table kb_articles',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='kb_articles')
  union all select 25, 'add-local-projects-global-link.sql', 'column projects.synced_global_id',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='synced_global_id')
  union all select 26, 'add-notepad-documents.sql', 'table notepad_documents',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='notepad_documents')
  union all select 27, 'add-pid-tuning-and-ping-trigger.sql', 'table pid_tuning_sessions',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='pid_tuning_sessions')
  union all select 28, 'add-ppcl-documents.sql', 'table ppcl_documents',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='ppcl_documents')
  union all select 29, 'add-profile-name-avatar.sql', 'column profiles.avatar_url',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='avatar_url')
  union all select 30, 'add-project-files-storage.sql', 'storage bucket project-files',
    exists(select 1 from storage.buckets where id='project-files')
  union all select 31, 'add-project-notepad-entries.sql', 'table project_notepad_entries',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='project_notepad_entries')
  union all select 32, 'add-psych-sessions.sql', 'table psych_sessions',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='psych_sessions')
  union all select 33, 'add-search-users-rpc.sql', 'function search_users',
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='search_users')
  union all select 34, 'add-subscription-tier.sql', 'column profiles.subscription_tier',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='subscription_tier')
  union all select 35, 'add-sync-columns-activity-terminal.sql', 'column activity_log.sync_version',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='activity_log' and column_name='sync_version')
  union all select 36, 'add-sync-columns-global-children.sql', 'column global_field_notes.sync_version',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='global_field_notes' and column_name='sync_version')
  union all select 37, 'add-sync-version-auto-increment.sql', 'function bump_sync_version',
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='bump_sync_version')
  union all select 38, 'add-trend-sessions.sql', 'table trend_sessions',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='trend_sessions')
  union all select 39, 'add-user-reviews.sql', 'table user_reviews',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='user_reviews')
  union all select 40, 'fix-global-projects-creator-can-edit.sql', 'policy "Admins or creator can update global projects"',
    exists(select 1 from pg_policies where schemaname='public' and tablename='global_projects' and policyname='Admins or creator can update global projects')
  union all select 41, 'hotfix-delete-and-admin.sql', 'policy "Admins can update all profiles" on profiles',
    exists(select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='Admins can update all profiles')
  union all select 42, 'hotfix-dm-delete-policies.sql', 'policy "Senders can delete sent messages" on direct_messages',
    exists(select 1 from pg_policies where schemaname='public' and tablename='direct_messages' and policyname='Senders can delete sent messages')
  union all select 43, 'hotfix-global-register-calculations-not-null.sql', 'global_register_calculations.global_project_id is NOT NULL',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='global_register_calculations' and column_name='global_project_id' and is_nullable='NO')
  union all select 44, 'enforce-storage-bucket-size-limits.sql', 'project-files bucket file_size_limit = 50MB',
    exists(select 1 from storage.buckets where id='project-files' and file_size_limit=52428800)
)
select
  seq            as "#",
  migration      as "migration_file",
  probe_desc     as "sentinel_probed",
  applied        as "applied"
from probe
order by applied asc, seq asc;   -- pending (false) float to the top
