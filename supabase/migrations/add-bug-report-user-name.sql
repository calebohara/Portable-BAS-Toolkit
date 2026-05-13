-- ─── Bug Reports: user_name column ────────────────────────────────────────────
-- The local IndexedDB `BugReport` type gained a `userName` field so the admin
-- panel can show "filed by X (UUID …)". The push side maps userName → user_name
-- but the Supabase column did not exist, raising PGRST204
-- "Could not find the 'user_name' column of 'bug_reports' in the schema cache".
--
-- `user_id` already exists on the table (column for RLS); no migration needed
-- for that mapping.
-- ──────────────────────────────────────────────────────────────────────────────

alter table bug_reports
  add column if not exists user_name text;
