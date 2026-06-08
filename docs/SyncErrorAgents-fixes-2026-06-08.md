# SyncErrorAgents Fix Log — 2026-06-08

## Header

- **Date:** 2026-06-08
- **Trigger:** User-reported live sync errors (screenshot): three `42501` RLS
  rejections on `global_devices` / `global_field_notes` INSERT, one `42703`
  "column `global_project_preferences.id` does not exist".
- **Agents engaged:** 1 (single-session diagnosis — RLS/payload focus)
- **Files changed:** 3 (1 source, 1 test, 1 `.gitignore`) + this log
- **Insertions/deletions:** +53 source/test (see `git show`)
- **Version:** v4.31.1 → v4.31.2

## Audit Phase

| Area | Files read |
|------|------------|
| Push payload mapping | `src/lib/sync/field-map.ts` (`toSupabaseRow`, `ENTITY_COLUMN_ALLOWLIST`, `FIELD_OVERRIDES`, `GLOBAL_AUDITED_ENTITY_TYPES`) |
| Push/upsert + error classification | `src/lib/sync/sync-manager.ts` (`foreignGlobalAuthor`, create/update upsert block, 42501/42703 handling, `captureSyncError`) |
| Queue enqueue/coalesce | `src/lib/sync/sync-manager.ts` `enqueue()`, `src/lib/db.ts` `addSyncItem` / `addSyncItemPreservingRetry` |
| RLS / schema | `supabase/global-projects-schema.sql` (`global_devices` policies, `is_global_project_member`), `supabase/migrations/add-global-project-preferences.sql` (composite PK, no `id`) |
| Preferences live path | `src/lib/global-projects/api.ts` (`upsert/fetch/deleteGlobalProjectPreferences`) |

## Fixes Applied

### P1 — `42501` RLS INSERT rejection on global child rows (root-cause fix)

- **File:** `src/lib/sync/sync-manager.ts` (create/update upsert branch)
- **Issue:** The sync queue is keyed on a deterministic id
  `${entityType}-${entityId}`, so a `create` the user edits *before it syncs* is
  overwritten by an `update` for the same entity. When that `update` is pushed and
  the cloud row never landed (offline create, or a prior create that failed), the
  Supabase `upsert` resolves to an **INSERT**. But `toSupabaseRow(…, {isUpdate:true})`
  intentionally omits `created_by` (treating it as immutable on update), and the
  payload's own `createdBy` is stripped for audited global entities. The result:
  an INSERT with `created_by = NULL`, which fails the table's
  `WITH CHECK (is_global_project_member(global_project_id) AND created_by = auth.uid())`
  → **42501**, permanently blocking a legitimate member's first sync of any global
  child row (devices, field notes, etc.).
- **Fix:** After building the push row, when `action === 'update'` and the entity
  is `globalProjects` or in `GLOBAL_AUDITED_ENTITY_TYPES`, explicitly stamp
  `row.created_by = this.userId`. This is provably safe: `foreignGlobalAuthor()`
  earlier in the push path already guarantees the row is the current user's own,
  so `created_by = me` satisfies the INSERT check and is a no-op on a genuine
  UPDATE (the stored value already equals `auth.uid()`). Regression test added in
  `cross-user-and-ingress-guards.test.ts` asserting the pushed row carries
  `created_by`.

### P3 — Documentation/tracking (no code change)

- **`42703` `global_project_preferences.id does not exist`:** Diagnosed as a
  **stale captured error**, not a current-code bug. All live paths for this
  composite-PK table (`(user_id, global_project_id)`, no `id` column) already use
  the composite conflict target / filters: sync-manager push (`onConflict:
  'user_id,global_project_id'`, conflict-detection skipped), conflict resolution,
  and `api.ts` upsert/fetch/delete. The captured `42703` row predates the Phase 2
  composite-PK fix (v4.29.0) and persists in the `syncErrors` store (signature
  dedup, 100-row cap). **No code change**; it will not recur on current code and
  can be cleared via Settings → Cloud & Sync → reset/clear sync errors, or
  dismissed individually in the sync-error inspector.
- **Genuinely-orphaned `42501`s** (a row whose `global_project_id` the user is no
  longer a member of — deleted project / revoked membership) are *correctly*
  dropped as non-retryable by the existing backstop (`sync-manager.ts` 42501
  branch) and surface one captured error each. Expected behavior; the fix above
  does not — and should not — make an unpushable row pushable.

## Housekeeping

- `.gitignore`: added `!docs/SyncErrorAgents-fixes-*.md` to the docs whitelist so
  this (and future) SyncErrorAgents fix logs are not silently dropped by the
  `docs/**/*.md` ignore rule.

## Verification

- `npx vitest run src/lib/sync/ src/lib/global-projects/` → **156 passed** (incl.
  the new `created_by`-stamp regression test).
- `npx tsc --noEmit` → clean.
- Lint: no new violations in touched files.
