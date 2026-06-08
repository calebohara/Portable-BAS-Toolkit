-- ─────────────────────────────────────────────────────────────────────────────
-- P2-3: server-own global_activity_log.timestamp
-- ─────────────────────────────────────────────────────────────────────────────
-- The append-only global_activity_log incremental pull filters
--   .gte('timestamp', lastPulledAt)
-- where BOTH the cursor and the row's `timestamp` are CLIENT clocks — but from
-- DIFFERENT devices. If authoring device A's clock lags receiver B's, A writes a
-- row whose `timestamp` is earlier than B's already-advanced cursor, and B's next
-- incremental pull skips it FOREVER (healed only by a manual full pull /
-- first-login). The audit trail then diverges across devices.
--
-- Fix: force `timestamp = now()` on insert via a BEFORE INSERT trigger, so the
-- column lives in ONE clock domain (the server's). The incremental cursor (also
-- server-derived once rows round-trip) then compares apples to apples.
--
-- Idempotent and safe to re-run. The column already defaults to now(); this also
-- overrides any client-supplied value, which the default alone does not.

create or replace function force_global_activity_timestamp()
returns trigger
language plpgsql
as $$
begin
  new."timestamp" := now();
  return new;
end;
$$;

drop trigger if exists global_activity_log_server_timestamp on global_activity_log;
create trigger global_activity_log_server_timestamp
  before insert on global_activity_log
  for each row execute function force_global_activity_timestamp();

-- Record this migration in the ledger (see docs/MIGRATIONS.md). Guarded so it's
-- a true no-op if the ledger table doesn't exist yet — apply order doesn't matter.
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    insert into schema_migrations (id) values ('add-global-activity-log-server-timestamp.sql')
      on conflict (id) do nothing;
  end if;
end $$;

-- Reload PostgREST schema cache so the new function/trigger is picked up.
notify pgrst, 'reload schema';
