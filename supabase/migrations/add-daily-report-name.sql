-- Add an optional user-given title/name to daily reports (local + global mirror).
-- Reports fall back to "Report #N" in the UI when this is blank. Backward-compat:
-- existing rows simply have NULL name. Idempotent — safe to re-run.

alter table daily_reports add column if not exists name text;
alter table global_daily_reports add column if not exists name text;

-- Self-recording footer (guarded so it's a no-op before the ledger exists).
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    insert into schema_migrations (id) values ('add-daily-report-name.sql')
      on conflict (id) do nothing;
  end if;
end $$;
notify pgrst, 'reload schema';
