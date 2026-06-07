-- ─── Real-time Discord ping on new bug_reports ──────────────────────────────
-- Fires the moment a user submits a bug (INSERT into bug_reports) and posts a
-- message to a Discord webhook via pg_net. Fire-and-forget: it never blocks or
-- fails the insert, and it's a no-op until you store the webhook URL (below).
--
-- ── SETUP (run ONCE, separately, with YOUR Discord webhook URL) ──
--   In Discord: Server Settings → Integrations → Webhooks → New Webhook → Copy URL.
--   Then in the Supabase SQL Editor run (keeps the URL encrypted in Vault, NOT in git):
--
--     select vault.create_secret(
--       'https://discord.com/api/webhooks/XXXX/YYYY',  -- your webhook URL
--       'discord_bug_webhook',
--       'Discord webhook for new bug_reports notifications'
--     );
--
--   (To rotate later: select vault.update_secret(id, 'https://...new...') )
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_net;

create or replace function public.notify_discord_on_bug_report()
returns trigger
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  hook text;
begin
  -- Webhook URL lives in Vault; if it isn't set yet, do nothing (no error).
  select decrypted_secret into hook
    from vault.decrypted_secrets
   where name = 'discord_bug_webhook'
   limit 1;

  if hook is null or hook = '' then
    return new;
  end if;

  perform net.http_post(
    url := hook,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'username', 'BAU Suite Bugs',
      'content', format(
        '🐞 **New bug report** [%s] — %s' || chr(10) || '_status: %s · page: %s · v%s · by %s_',
        coalesce(nullif(new.severity, ''), '?'),
        coalesce(nullif(new.title, ''), left(coalesce(new.description, ''), 100), '(no title)'),
        coalesce(nullif(new.status, ''), 'open'),
        coalesce(nullif(new.current_page, ''), '?'),
        coalesce(nullif(new.app_version, ''), '?'),
        coalesce(nullif(new.user_name, ''), 'someone')
      )
    )
  );

  return new;
exception when others then
  -- Never let a notification problem block a bug submission.
  return new;
end $$;

drop trigger if exists trg_notify_discord_bug on public.bug_reports;
create trigger trg_notify_discord_bug
  after insert on public.bug_reports
  for each row execute function public.notify_discord_on_bug_report();

-- Record this migration in the ledger (see docs/MIGRATIONS.md).
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    insert into schema_migrations (id) values ('add-bug-report-discord-notify.sql')
      on conflict (id) do nothing;
  end if;
end $$;
notify pgrst, 'reload schema';
