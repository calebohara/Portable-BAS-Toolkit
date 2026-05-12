-- ─── Migration: Add search_users RPC for user-picker autocomplete ───────────
-- Caller-safe user search. Returns up to 20 approved profiles whose
-- display_name contains the query. Excludes the caller themselves.
-- SECURITY DEFINER so it can read the profiles table independent of the
-- existing co-member-only SELECT policy. Requires query length >= 2 to
-- save a round-trip and discourage table enumeration.
-- Safe to run multiple times (uses CREATE OR REPLACE).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function search_users(query text)
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select id, display_name, avatar_url, created_at
    from profiles
   where approved = true
     and id <> auth.uid()
     and length(trim(query)) >= 2
     and display_name ilike '%' || trim(query) || '%'
   order by display_name
   limit 20;
$$;

revoke all on function search_users(text) from public;
grant execute on function search_users(text) to authenticated;
