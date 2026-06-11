-- ─────────────────────────────────────────────────────────────────────────────
-- MIG-1 (SyncAudit 2026-06-08 s3): server-own activity_log.timestamp
-- ─────────────────────────────────────────────────────────────────────────────
-- The LOCAL activity_log has the exact slow-clock cursor-skip the global fix
-- (add-global-activity-log-server-timestamp.sql) already patched: the
-- incremental pull filters .gte('timestamp', lastPulledAt), but the row's
-- `timestamp` is the AUTHORING device's clock while the cursor derives from a
-- different clock. A device whose clock lags writes a row whose `timestamp` is
-- earlier than another device's already-advanced cursor — and that device's
-- incremental pull skips the row forever (healed only by a manual full pull).
--
-- Fix: force `timestamp = now()` on insert via a BEFORE INSERT trigger so the
-- column lives in ONE clock domain (the server's). Identical pattern to the
-- global trigger. Idempotent and safe to re-run; the column already defaults
-- to now() — the trigger additionally overrides any client-supplied value.

create or replace function force_activity_timestamp()
returns trigger
language plpgsql
as $$
begin
  new."timestamp" := now();
  return new;
end;
$$;

drop trigger if exists activity_log_server_timestamp on activity_log;
create trigger activity_log_server_timestamp
  before insert on activity_log
  for each row execute function force_activity_timestamp();

-- Record this migration in the ledger (see docs/MIGRATIONS.md). Guarded so it's
-- a true no-op if the ledger table doesn't exist yet — apply order doesn't matter.
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    insert into schema_migrations (id) values ('add-activity-log-server-timestamp.sql')
      on conflict (id) do nothing;
  end if;
end $$;
notify pgrst, 'reload schema';
