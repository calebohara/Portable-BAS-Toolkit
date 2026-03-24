-- ─── activity_log: add missing created_at column ────────────────────────────
-- S4-6 / S9-7: activity_log already received deleted_at, sync_version,
-- updated_at, and an updated_at trigger in add-sync-columns-activity-terminal.sql.
-- This migration adds the missing created_at column for full sync schema parity.

alter table activity_log
  add column if not exists created_at timestamptz not null default now();
