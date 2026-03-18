-- ─── Subscription Tier Tracking ──────────────────────────────────────────────
-- Add subscription status to profiles for the cloud sync paywall.
-- Default 'free' ensures all existing users remain unaffected.
-- No new RLS policies needed — existing "users manage own profile" covers these columns.

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'free',
ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz,
ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- Index for webhook lookups by stripe_customer_id
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON profiles(stripe_customer_id)
WHERE stripe_customer_id IS NOT NULL;
