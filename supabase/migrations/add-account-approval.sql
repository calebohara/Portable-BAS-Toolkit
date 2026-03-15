-- ─── Account Approval Gate ──────────────────────────────────────────────────
-- Adds an `approved` column to profiles so admins can gate new signups.
-- New users default to approved = false. Existing users are set to approved = true.
--
-- Run this in Supabase SQL Editor. One-time migration — results persist permanently.
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Add approved column (defaults to false for new signups)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;

-- 2. Approve ALL existing users (so nobody gets locked out)
UPDATE profiles SET approved = true WHERE approved = false;

-- 3. Update the auto-create trigger to include approved = false explicitly
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, approved)
  VALUES (new.id, COALESCE(new.email, ''), false)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Helper function to check admin role WITHOUT triggering RLS recursion.
--    SECURITY DEFINER runs as the function owner (bypasses RLS).
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 5. Drop old recursive policies if they exist
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;

-- 6. Allow admins to read ALL profiles (uses non-recursive helper)
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  USING (is_admin());

-- 7. Allow admins to update any profile (to approve/reject users)
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (is_admin());

-- 8. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
