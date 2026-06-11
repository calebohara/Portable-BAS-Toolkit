# Supabase Migrations — Tracking & Runbook

This project applies migrations **manually via the Supabase SQL Editor** (no Supabase
CLI / `db push`, no timestamped filenames, no `supabase/config.toml`). To keep that
workflow honest, applied migrations are recorded in a **`schema_migrations` ledger**
table and audited by a **sentinel drift checker**.

## The system at a glance

| Artifact | Purpose |
|----------|---------|
| `schema_migrations` table | The ledger — one row per applied migration file. Source of truth. |
| `supabase/migrations/add-schema-migrations-ledger.sql` | Creates the ledger. Apply this **first**. |
| `supabase/backfill-schema-migrations.sql` | One-time: records every already-live legacy migration, derived from actual object existence. |
| `supabase/check-migrations.sql` | Read-only drift audit: probes a unique sentinel object per migration and reports `applied true/false`. |
| Self-recording insert (in each new migration) | Each new migration records itself on apply, so the ledger never drifts. |

## First-time setup (run once, in order)

1. **Audit current state** — run `supabase/check-migrations.sql` in the SQL Editor. Note any `applied = false` rows.
2. **Create the ledger** — apply `supabase/migrations/add-schema-migrations-ledger.sql`.
3. **Backfill** — run `supabase/backfill-schema-migrations.sql`. It inserts a ledger row for every migration whose object actually exists (so it agrees with step 1).
4. **Apply anything pending** — e.g. `add-sync-version-auto-increment.sql`. Each ends with a self-recording insert, so applying it updates the ledger automatically.
5. **Confirm** — `select id, applied_at from schema_migrations order by id;` should now list every applied migration.

## Applying a NEW migration (every time)

1. Write the migration in `supabase/migrations/<name>.sql`. End the file with the self-recording footer (template below).
2. Add a probe block for it to `supabase/check-migrations.sql` (one `union all select … exists(…)` line) and a backfill line to `supabase/backfill-schema-migrations.sql`.
3. Add a row to the **Migration index** table below.
4. Apply the file in the Supabase SQL Editor. The footer records it in the ledger.
5. (Optional) Re-run `supabase/check-migrations.sql` to confirm `applied = true`.

### New-migration footer template

Guarded with `to_regclass` so the migration applies cleanly **in any order** —
if the ledger table doesn't exist yet, the insert is skipped (not an error) and
the backfill records it later. Do **not** use a bare `insert` — inserting into a
missing table is a hard `42P01` error that, in the SQL Editor's single
transaction, rolls back the whole migration.

```sql
-- Record this migration in the ledger (see docs/MIGRATIONS.md).
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    insert into schema_migrations (id) values ('<this-filename>.sql')
      on conflict (id) do nothing;
  end if;
end $$;
notify pgrst, 'reload schema';
```

## Auditing drift any time

- **Reality vs. files:** run `supabase/check-migrations.sql` — `applied = false` ⇒ likely not applied.
- **Ledger vs. reality** (catches a forgotten ledger insert): after setup, compare the ledger to the sentinel checker. A migration whose sentinel exists but is absent from `schema_migrations` means someone applied it without the footer — re-run the backfill to heal.

> Sentinel caveats: `add-project-files-storage.sql` may read `false` if the `project-files`
> bucket was created via the dashboard UI (storage still works). Policy probes
> (`fix-…`, `hotfix-…`) check an exact policy **name**; a later rename can read `false`
> while the protection is intact. Treat a policy `false` as "investigate," not "missing."

## Migration index

Status legend: **L** = ledger-tracked once setup is run · **P** = pending (apply it) · **NEW** = part of the tracking rollout.

| # | File | Introduces (sentinel) | Status |
|---|------|----------------------|--------|
| 1 | add-account-approval.sql | `profiles.approved` col + `is_admin()` | L |
| 2 | add-activity-log-created-at.sql | `activity_log.created_at` col | L (was the drift gap; applied 2026-06-03) |
| 3 | add-bug-report-user-name.sql | `bug_reports.user_name` col | L |
| 4 | add-bug-reports.sql | `bug_reports` table | L |
| 5 | add-direct-messages.sql | `direct_messages` table | L |
| 6 | add-dxrs.sql | `dxrs` table | L |
| 7 | add-field-panels.sql | `field_panels` table | L |
| 8 | add-full-text-search.sql | `global_projects.fts` col + `search_global()` | L |
| 9 | add-global-connection-profiles.sql | `global_connection_profiles` table | L |
| 10 | add-global-dxrs.sql | `global_dxrs` table | L |
| 11 | add-global-field-panels.sql | `global_field_panels` table | L |
| 12 | add-global-message-replies-reads.sql | `global_message_reads` table | L |
| 13 | add-global-messages.sql | `global_messages` table | L |
| 14 | add-global-pid-tuning-sessions.sql | `global_pid_tuning_sessions` table | L |
| 15 | add-global-ping-sessions.sql | `global_ping_sessions` table | L |
| 16 | add-global-ppcl-documents.sql | `global_ppcl_documents` table | L |
| 17 | add-global-project-notepad-entries.sql | `global_project_notepad_entries` table | L |
| 18 | add-global-project-parity-fields.sql | `global_projects.customer_name` col | L |
| 19 | add-global-project-preferences.sql | `global_project_preferences` table | L |
| 20 | add-global-psych-sessions.sql | `global_psych_sessions` table | L |
| 21 | add-global-register-calculations.sql | `global_register_calculations` table | L |
| 22 | add-global-terminal-session-logs.sql | `global_terminal_session_logs` table | L |
| 23 | add-global-trend-sessions.sql | `global_trend_sessions` table | L |
| 24 | add-knowledge-base.sql | `kb_articles` table | L |
| 25 | add-local-projects-global-link.sql | `projects.synced_global_id` col | L |
| 26 | add-notepad-documents.sql | `notepad_documents` table | L |
| 27 | add-pid-tuning-and-ping-trigger.sql | `pid_tuning_sessions` table | L |
| 28 | add-ppcl-documents.sql | `ppcl_documents` table | L |
| 29 | add-profile-name-avatar.sql | `profiles.avatar_url` col | L |
| 30 | add-project-files-storage.sql | `project-files` storage bucket | L |
| 31 | add-project-notepad-entries.sql | `project_notepad_entries` table | L |
| 32 | add-psych-sessions.sql | `psych_sessions` table | L |
| 33 | add-search-users-rpc.sql | `search_users()` function | L |
| 34 | add-subscription-tier.sql | `profiles.subscription_tier` col | L |
| 35 | add-sync-columns-activity-terminal.sql | `activity_log.sync_version` col | L |
| 36 | add-sync-columns-global-children.sql | `global_field_notes.sync_version` col | L |
| 37 | add-trend-sessions.sql | `trend_sessions` table | L |
| 38 | add-user-reviews.sql | `user_reviews` table | L |
| 39 | fix-global-projects-creator-can-edit.sql | RLS policy on `global_projects` | L |
| 40 | hotfix-delete-and-admin.sql | RLS policies on `profiles` | L |
| 41 | hotfix-dm-delete-policies.sql | RLS delete policies on `direct_messages` | L |
| 42 | hotfix-global-register-calculations-not-null.sql | `global_register_calculations.global_project_id` NOT NULL | L |
| 43 | add-sync-version-auto-increment.sql | `bump_sync_version()` trigger fn | L (applied 2026-06-03) |
| 44 | add-schema-migrations-ledger.sql | `schema_migrations` table | L (applied 2026-06-03) |
| 45 | enforce-storage-bucket-size-limits.sql | `project-files` bucket `file_size_limit = 50MB` | L |
| 46 | add-bug-report-discord-notify.sql | `notify_discord_on_bug_report()` trigger fn | L (applied 2026-06-07; Vault secret set, ping verified) |
| 47 | add-daily-report-name.sql | `daily_reports.name` + `global_daily_reports.name` cols | L (applied 2026-06-07) |
| 48 | add-sync-version-insert-defaults.sql | `init_sync_version()` BEFORE INSERT trigger fn (server-owns `updated_at` + `sync_version` on insert) | L (pending) |
| 49 | add-cascade-soft-delete-rpcs.sql | `cascade_soft_delete_global_project()` + `cascade_soft_delete_project()` SECURITY DEFINER RPCs (atomic parent+child soft-delete cascade) | P (pending) |
| 50 | add-global-activity-log-server-timestamp.sql | `force_global_activity_timestamp()` BEFORE INSERT trigger (server-owns `global_activity_log.timestamp` so slow-clock devices' rows aren't skipped by the incremental cursor) — P2-3 | P (pending) |
| 51 | add-last-admin-guard.sql | `prevent_last_admin_removal()` BEFORE DELETE/UPDATE trigger on `global_project_members` (rejects removing/demoting the last admin while other members remain) — P2-2 | P (pending) |
| 52 | add-activity-log-server-timestamp.sql | `force_activity_timestamp()` BEFORE INSERT trigger (server-owns LOCAL `activity_log.timestamp` — same slow-clock cursor-skip fix as #50, local twin) — MIG-1 | P (pending) |
| 53 | pin-security-definer-search-path.sql | Pins `search_path = public` on the 4 original SECURITY DEFINER helpers (`is_global_project_member`, `is_global_project_admin`, `join_global_project`, `auto_add_global_project_creator`) — SEC-2 | P (pending) |
