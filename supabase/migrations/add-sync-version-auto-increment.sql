-- ─── Sync Version: Server-Side Auto-Increment ───────────────────────────────
-- Server-authoritative monotonic increment of `sync_version` on every UPDATE,
-- for every synced table that carries the column.
--
-- WHY: ReviewAgents-findings-2026-05-20.md P0 #7 ("No tie-break for equal
-- updated_at; sync_version column unused"). The JS side already round-trips
-- sync_version ↔ syncVersion and uses it as a secondary conflict tiebreaker
-- when two writes share an equal-ms updated_at (see src/lib/sync/sync-manager.ts
-- ~305 and src/lib/sync/field-map.ts). That tiebreak is only reliable if the
-- column actually advances monotonically per row — which is what this migration
-- finally provides. Until now sync_version sat frozen at its `default 1`.
--
-- CLIENT INTERACTION — why the trigger can own the column outright:
--   The client STRIPS sync_version on push. field-map.ts lists `syncVersion`
--   in LOCAL_ONLY_FIELDS (and again in globalActivityLog's SKIP_FIELDS), so
--   toSupabaseRow() never emits a sync_version key on insert OR update. The
--   row sent by an UPDATE therefore leaves sync_version unmentioned, the
--   BEFORE UPDATE trigger below sets NEW.sync_version = OLD.sync_version + 1,
--   and there is no client-supplied value to fight. The DB is the sole writer.
--   (On pull the column round-trips back IN so the client can compare it.)
--
-- PATTERN: mirrors the shared set_updated_at() / *_updated_at trigger pattern
--   in schema.sql (line 16) — one reusable plpgsql function attached to each
--   table via a BEFORE UPDATE row-level trigger.
--
-- EXCLUDED (intentionally — no sync_version column):
--   - global_activity_log        append-only log, never updated
--   - global_project_preferences composite PK (user_id, global_project_id),
--                                per-user state, no sync_version column
--   - activity_log               does have sync_version, but is effectively
--                                append-only; included anyway for safety so any
--                                stray update still advances the version.
--
-- Idempotent: `create or replace function` + `drop trigger if exists` /
-- `create trigger`. The whole attach loop is guarded by an information_schema
-- column check so it is a no-op against any environment where a given table or
-- the sync_version column is absent (re-runnable, partial-schema-safe).
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Reusable trigger function: bump sync_version by 1 on every UPDATE.
--    Server-authoritative: ignores whatever (if anything) the client sent.
create or replace function bump_sync_version()
returns trigger as $$
begin
  new.sync_version = old.sync_version + 1;
  return new;
end;
$$ language plpgsql;

-- 2. Attach a BEFORE UPDATE trigger to every table that carries sync_version.
--    Done in a DO block that verifies the column exists first, so the migration
--    is safe to run against environments at differing migration levels.
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
    -- Only attach where the table actually exists AND has a sync_version column.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = t
        and column_name = 'sync_version'
    ) then
      execute format('drop trigger if exists %I on public.%I', t || '_bump_sync_version', t);
      execute format(
        'create trigger %I before update on public.%I '
        || 'for each row execute function bump_sync_version()',
        t || '_bump_sync_version', t
      );
    end if;
  end loop;
end
$$;

-- ─── Deferred enhancement (NOT applied here) ─────────────────────────────────
-- Optimistic-concurrency guard (`... where sync_version = $expected`) was
-- considered per the finding's option A. It is DEFERRED: there is no existing
-- RPC/update surface that takes an expected version to extend, and the current
-- push path uses PostgREST upserts (sync-manager.ts) rather than a SECURITY
-- DEFINER RPC. Adding a rejecting WHERE clause would require either a new RPC
-- or threading the expected version through the PostgREST update — out of scope
-- for this pass. The JS-side equal-ms tiebreak already raises a conflict for the
-- user to resolve; this migration makes that tiebreak's input reliable. A future
-- pass can layer the WHERE-guard on top once a dedicated update RPC exists.
-- ──────────────────────────────────────────────────────────────────────────────

-- Reload PostgREST schema cache so the new function/trigger are picked up.
notify pgrst, 'reload schema';
