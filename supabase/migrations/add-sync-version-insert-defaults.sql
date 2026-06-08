-- ─── Sync Version + updated_at: Server-Owned On INSERT ───────────────────────
-- Server-authoritative initialization of `updated_at` and `sync_version` at row
-- birth (INSERT), complementing the BEFORE UPDATE trigger in
-- add-sync-version-auto-increment.sql (which only owns them after the first
-- update).
--
-- WHY (SyncAuditAgents-findings-2026-06-08.md #9 / P1-4): the existing increment
-- trigger is BEFORE UPDATE only, so `updated_at` and `sync_version` were
-- CLIENT-stamped on INSERT. A device with a skewed or spoofed clock could win
-- a conflict on a freshly-created row by sending a future `updated_at`, silently
-- dropping another member's write. With sync_version now the PRIMARY conflict
-- comparator on the client (sync-manager.ts push path + reconcile.ts), the DB
-- must OWN sync_version from the very first row version so the comparison is
-- trustworthy — and we let the DB own updated_at on insert too, so a future
-- timestamp can't ride in on a create.
--
-- CLIENT INTERACTION:
--   The client already STRIPS `sync_version` on push (field-map.ts
--   LOCAL_ONLY_FIELDS), so this trigger never fights a client value for it.
--   The client DOES still send `updated_at` on insert (mapped from updatedAt),
--   but this BEFORE INSERT trigger overwrites it with now() so the server is the
--   sole authority for a row's birth timestamp. `created_at` is left untouched
--   (it carries the real creation instant and is not a conflict comparator).
--
-- PATTERN: mirrors bump_sync_version() — one reusable plpgsql function attached
--   to each table via a BEFORE INSERT row-level trigger, in an information_schema
--   guarded DO loop so it is a no-op against tables/columns that don't exist
--   (re-runnable, partial-schema-safe).
--
-- EXCLUDED (intentionally — no sync_version column):
--   - global_activity_log         append-only log, never updated, no sync_version
--   - global_project_preferences  composite PK, per-user state, no sync_version
--   (activity_log HAS sync_version and is effectively append-only; included so a
--    stray insert is still server-stamped, matching the UPDATE trigger's set.)
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Reusable trigger function: on INSERT, the server owns updated_at + sync_version.
create or replace function init_sync_version()
returns trigger as $$
begin
  new.updated_at = now();
  new.sync_version = 1;
  return new;
end;
$$ language plpgsql;

-- 2. Attach a BEFORE INSERT trigger to every table that carries sync_version.
do $$
declare
  t text;
  synced_tables text[] := array[
    -- ── Local (user-owned) tables ──
    'projects',
    'project_files',
    'field_notes',
    'devices',
    'ip_plan',
    'daily_reports',
    'activity_log',
    'network_diagrams',
    'command_snippets',
    'connection_profiles',
    'register_calculations',
    'ping_sessions',
    'terminal_session_logs',
    'pid_tuning_sessions',
    'project_notepad_entries',
    'notepad_documents',
    'field_panels',
    'bug_reports',
    'ppcl_documents',
    'psych_sessions',
    'user_reviews',
    'dxrs',
    'trend_sessions',
    -- ── Global (membership-RLS) mirrors ──
    'global_projects',
    'global_field_notes',
    'global_devices',
    'global_ip_plan',
    'global_daily_reports',
    'global_project_files',
    'global_network_diagrams',
    'global_connection_profiles',
    'global_dxrs',
    'global_field_panels',
    'global_pid_tuning_sessions',
    'global_ping_sessions',
    'global_ppcl_documents',
    'global_project_notepad_entries',
    'global_psych_sessions',
    'global_register_calculations',
    'global_terminal_session_logs',
    'global_trend_sessions'
  ];
begin
  foreach t in array synced_tables loop
    -- Only attach where the table exists AND has a sync_version column.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = t
        and column_name = 'sync_version'
    ) then
      execute format('drop trigger if exists %I on public.%I', t || '_init_sync_version', t);
      execute format(
        'create trigger %I before insert on public.%I '
        || 'for each row execute function init_sync_version()',
        t || '_init_sync_version', t
      );
    end if;
  end loop;
end
$$;

-- Record this migration in the ledger (see docs/MIGRATIONS.md). Guarded so it's
-- a true no-op if the ledger table doesn't exist yet — apply order doesn't matter.
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    insert into schema_migrations (id) values ('add-sync-version-insert-defaults.sql')
      on conflict (id) do nothing;
  end if;
end $$;

-- Reload PostgREST schema cache so the new function/triggers are picked up.
notify pgrst, 'reload schema';
