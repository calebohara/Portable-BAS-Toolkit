-- ─── Backfill the Schema Migrations Ledger (run ONCE) ───────────────────────
-- Records every LEGACY migration that is already live, derived from actual
-- object existence (the same sentinels as supabase/check-migrations.sql). A row
-- is inserted ONLY where the migration's sentinel object exists, so this can
-- never falsely claim a migration was applied.
--
-- Prereq: apply supabase/migrations/add-schema-migrations-ledger.sql first.
-- Idempotent: on conflict do nothing. Re-running only fills gaps.
-- After this, the ledger is the source of truth; new migrations self-record.
-- ──────────────────────────────────────────────────────────────────────────────

insert into schema_migrations (id)
select migration from (
  select 'add-account-approval.sql' as migration where exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='approved')
  union all select 'add-activity-log-created-at.sql' where exists(select 1 from information_schema.columns where table_schema='public' and table_name='activity_log' and column_name='created_at')
  union all select 'add-bug-report-user-name.sql' where exists(select 1 from information_schema.columns where table_schema='public' and table_name='bug_reports' and column_name='user_name')
  union all select 'add-bug-reports.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='bug_reports')
  union all select 'add-direct-messages.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='direct_messages')
  union all select 'add-dxrs.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='dxrs')
  union all select 'add-field-panels.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='field_panels')
  union all select 'add-full-text-search.sql' where exists(select 1 from information_schema.columns where table_schema='public' and table_name='global_projects' and column_name='fts')
  union all select 'add-global-connection-profiles.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_connection_profiles')
  union all select 'add-global-dxrs.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_dxrs')
  union all select 'add-global-field-panels.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_field_panels')
  union all select 'add-global-message-replies-reads.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_message_reads')
  union all select 'add-global-messages.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_messages')
  union all select 'add-global-pid-tuning-sessions.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_pid_tuning_sessions')
  union all select 'add-global-ping-sessions.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_ping_sessions')
  union all select 'add-global-ppcl-documents.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_ppcl_documents')
  union all select 'add-global-project-notepad-entries.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_project_notepad_entries')
  union all select 'add-global-project-parity-fields.sql' where exists(select 1 from information_schema.columns where table_schema='public' and table_name='global_projects' and column_name='customer_name')
  union all select 'add-global-project-preferences.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_project_preferences')
  union all select 'add-global-psych-sessions.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_psych_sessions')
  union all select 'add-global-register-calculations.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_register_calculations')
  union all select 'add-global-terminal-session-logs.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_terminal_session_logs')
  union all select 'add-global-trend-sessions.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='global_trend_sessions')
  union all select 'add-knowledge-base.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='kb_articles')
  union all select 'add-local-projects-global-link.sql' where exists(select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='synced_global_id')
  union all select 'add-notepad-documents.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='notepad_documents')
  union all select 'add-pid-tuning-and-ping-trigger.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='pid_tuning_sessions')
  union all select 'add-ppcl-documents.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='ppcl_documents')
  union all select 'add-profile-name-avatar.sql' where exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='avatar_url')
  union all select 'add-project-files-storage.sql' where exists(select 1 from storage.buckets where id='project-files')
  union all select 'add-project-notepad-entries.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='project_notepad_entries')
  union all select 'add-psych-sessions.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='psych_sessions')
  union all select 'add-search-users-rpc.sql' where exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='search_users')
  union all select 'add-subscription-tier.sql' where exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='subscription_tier')
  union all select 'add-sync-columns-activity-terminal.sql' where exists(select 1 from information_schema.columns where table_schema='public' and table_name='activity_log' and column_name='sync_version')
  union all select 'add-sync-columns-global-children.sql' where exists(select 1 from information_schema.columns where table_schema='public' and table_name='global_field_notes' and column_name='sync_version')
  union all select 'add-sync-version-auto-increment.sql' where exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='bump_sync_version')
  union all select 'add-trend-sessions.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='trend_sessions')
  union all select 'add-user-reviews.sql' where exists(select 1 from information_schema.tables where table_schema='public' and table_name='user_reviews')
  union all select 'fix-global-projects-creator-can-edit.sql' where exists(select 1 from pg_policies where schemaname='public' and tablename='global_projects' and policyname='Admins or creator can update global projects')
  union all select 'hotfix-delete-and-admin.sql' where exists(select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='Admins can update all profiles')
  union all select 'hotfix-dm-delete-policies.sql' where exists(select 1 from pg_policies where schemaname='public' and tablename='direct_messages' and policyname='Senders can delete sent messages')
  union all select 'hotfix-global-register-calculations-not-null.sql' where exists(select 1 from information_schema.columns where table_schema='public' and table_name='global_register_calculations' and column_name='global_project_id' and is_nullable='NO')
  union all select 'enforce-storage-bucket-size-limits.sql' where exists(select 1 from storage.buckets where id='project-files' and file_size_limit=52428800)
  union all select 'add-bug-report-discord-notify.sql' where exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='notify_discord_on_bug_report')
  union all select 'add-daily-report-name.sql' where exists(select 1 from information_schema.columns where table_schema='public' and table_name='daily_reports' and column_name='name')
  union all select 'add-sync-version-insert-defaults.sql' where exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='init_sync_version')
  union all select 'add-cascade-soft-delete-rpcs.sql' where exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cascade_soft_delete_global_project')
) applied
on conflict (id) do nothing;

-- Show the resulting ledger.
select id, applied_at from schema_migrations order by id;
