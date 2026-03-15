-- ─── HOTFIX: Fix message deletion + admin panel ──────────────────────────────
-- Fixes two issues:
--   1. global_messages SELECT policy blocks soft-deletes (had deleted_at IS NULL)
--   2. Profiles admin policies must use is_admin() to avoid RLS recursion
--
-- Run this in Supabase SQL Editor. Safe to run multiple times.
-- ────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- FIX 1: Remove deleted_at IS NULL from global_messages SELECT policy
-- PostgreSQL checks SELECT policy on UPDATE rows. If the SELECT policy
-- includes "deleted_at IS NULL", soft-deleting (setting deleted_at) makes
-- the row invisible mid-update, causing the UPDATE to silently fail.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Global project members can read messages" ON global_messages;

CREATE POLICY "Global project members can read messages"
  ON global_messages FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM global_project_members
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- FIX 2: Ensure is_admin() helper exists (SECURITY DEFINER bypasses RLS)
-- Without this, admin policies that query profiles trigger infinite recursion.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Ensure every user can read their OWN profile (base policy)
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Ensure every user can update their OWN profile
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Drop old recursive policies and recreate with is_admin()
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;

CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- FIX 3: Set your account as admin (update the email below if different)
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE profiles SET role = 'admin', approved = true
WHERE email = 'caleb.ohara@gmail.com';

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
