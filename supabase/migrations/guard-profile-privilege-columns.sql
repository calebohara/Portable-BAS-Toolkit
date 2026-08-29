-- ─── Guard privileged columns on public.profiles ────────────────────────────
-- SECURITY FIX (BASAgents audit 2026-08-29, Platform Engineer P0-3).
--
-- THE HOLE
-- `profiles` carries every authorization-bearing column in the product:
--   role                     (add-account-approval.sql / hotfix-delete-and-admin.sql)
--   approved                 (add-account-approval.sql)
--   subscription_tier        (add-subscription-tier.sql)
--   subscription_expires_at  (add-subscription-tier.sql)
--   stripe_customer_id       (add-subscription-tier.sql)
--
-- ...and the self-update policy is only:
--     create policy "Users can update own profile"
--       on profiles for update using (auth.uid() = id);
--
-- No WITH CHECK, no column-level grant, and (before this migration) no BEFORE
-- UPDATE trigger -- the sole trigger on the table was profiles_updated_at.
-- So any authenticated user could issue:
--
--     PATCH /rest/v1/profiles?id=eq.<their own uid>
--     {"role":"admin","approved":true,"subscription_tier":"team"}
--
-- and RLS would permit it. Consequences, in order of severity:
--   1. is_admin() then returns true, opening "Admins can read all profiles"
--      (every user's email), "Admins can view all bug reports", and
--      "Admins can read all messages" (every user's direct messages).
--   2. verifyAdmin in src/app/api/admin/users/route.ts checks exactly
--      profiles.role = 'admin', so the attacker gains DELETE /api/admin/users,
--      which calls admin.auth.admin.deleteUser with the SERVICE ROLE key.
--   3. Setting stripe_customer_id to a victim's value hijacks the webhook
--      fallback lookup in src/app/api/donate/webhook/route.ts.
--   4. Full paywall bypass via src/lib/paywall.ts.
--
-- THE FIX
-- A BEFORE UPDATE trigger that rejects any change to those columns unless the
-- caller is the service role, an admin, or a direct database session.
--
-- WHY A TRIGGER RATHER THAN A POLICY
-- PostgREST UPDATE ... WITH CHECK cannot reference OLD, so a policy cannot
-- express "this column must not change". A trigger can.
--
-- Columns are compared through to_jsonb(), not by name, so this migration is a
-- no-op-safe if a deployment has not yet applied add-subscription-tier.sql or
-- add-account-approval.sql -- a missing column is simply skipped rather than
-- raising undefined_column at runtime.
--
-- Safe to run multiple times (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Pin search_path on the two SECURITY DEFINER functions that this trigger
--    (and every admin RLS policy) depends on. pin-security-definer-search-path.sql
--    covered the four global-project helpers but missed these two, so is_admin()
--    -- the authorization root for every admin policy -- still resolved
--    public.profiles through the CALLER's search_path.
--    (Platform Engineer P1-8.)
do $$
begin
  if to_regprocedure('public.is_admin()') is not null then
    execute 'alter function public.is_admin() set search_path = public';
  end if;
  if to_regprocedure('public.handle_new_user()') is not null then
    execute 'alter function public.handle_new_user() set search_path = public';
  end if;
end $$;

-- 2. The guard itself.
create or replace function public.guard_profile_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  guarded_columns text[] := array[
    'role',
    'approved',
    'subscription_tier',
    'subscription_expires_at',
    'stripe_customer_id'
  ];
  col text;
  old_json jsonb := to_jsonb(old);
  new_json jsonb := to_jsonb(new);
begin
  -- Direct database sessions (SQL editor, migrations, superuser) carry no JWT.
  -- Never block those, or this migration would lock the owner out of their own
  -- admin bootstrap.
  if current_setting('request.jwt.claims', true) is null then
    return new;
  end if;

  -- The Stripe webhook and the admin API act with the service role key and are
  -- the legitimate writers of subscription_tier / approved / role.
  if coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) = 'service_role' then
    return new;
  end if;

  -- Admins manage other users through the approval panel.
  if public.is_admin() then
    return new;
  end if;

  foreach col in array guarded_columns loop
    if (old_json ? col) and (new_json -> col) is distinct from (old_json -> col) then
      raise exception
        'profiles.% cannot be modified by the account holder', col
        using errcode = '42501',
              hint = 'role, approved, subscription_tier, subscription_expires_at and stripe_customer_id are set by an administrator or by the billing webhook.';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists profiles_guard_privilege_columns on public.profiles;
create trigger profiles_guard_privilege_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privilege_columns();

-- Record this migration in the ledger (see docs/MIGRATIONS.md). Guarded so it's
-- a true no-op if the ledger table doesn't exist yet — apply order doesn't matter.
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    insert into schema_migrations (id) values ('guard-profile-privilege-columns.sql')
      on conflict (id) do nothing;
  end if;
end $$;

notify pgrst, 'reload schema';
