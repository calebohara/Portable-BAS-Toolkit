import type { SupabaseClient, RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { SyncEntityType, SyncQueueItem, SyncConflict, SyncError } from '@/types';
import {
  addSyncItem, addSyncItemPreservingRetry,
  getPendingSyncItems, getUnpushedSyncItemKeys, hasUnpushedSyncItem,
  updateSyncItem, deleteSyncItem,
  getSyncQueueCount, getAllFromStore, clearSyncQueueExceptFailed,
  bulkPutSilent, bulkDeleteSilent,
  addSyncConflict, getSyncConflictCount, deleteSyncConflict, getAllSyncConflicts,
  addSyncError, recoverTransientFailedItems,
  getSyncMeta, setSyncMeta,
  cascadeDeleteProject, cascadeDeleteGlobalProject,
  resetSyncingItemsToPending,
} from '@/lib/db';
import {
  entityTypeToTable, toSupabaseRow, validateSyncable, SYNC_ORDER,
  fromSupabaseRow, isDeletedRow, REQUIRES_PROJECT_ID,
  isGlobalEntity, GLOBAL_ENTITY_TYPES, GLOBAL_AUDITED_ENTITY_TYPES,
  REQUIRES_GLOBAL_PROJECT_ID, supportsSubtractivePull,
} from './field-map';
import { emitPullComplete, type SyncManagerInterface } from './sync-bridge';
import { formatPostgrestError, sanitizeForLog, isTransientSyncError } from './sync-error-utils';

const MAX_RETRIES = 5;
const PROCESS_INTERVAL_MS = 5000;
const BATCH_SIZE = 20;
const LOG_PREFIX = '[sync]';
const MEMBERSHIP_CACHE_TTL_MS = 30_000;

// ─── Exponential backoff (Phase 1b) ──────────────────────────
// A transiently-failing item is gated by nextRetryAt = now + BACKOFF_BASE_MS *
// 2^retriedCount, capped at BACKOFF_MAX_MS. So instead of 5 retries in ~25s
// (one per 5s tick), attempts spread out: ~5s, ~10s, ~20s, ~40s, … (cap).
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000; // 5 minutes

/** Compute the next-retry gate for an item that just failed its Nth attempt. */
function computeNextRetryAt(retriedCount: number, now = Date.now()): string {
  const delay = Math.min(BACKOFF_BASE_MS * 2 ** retriedCount, BACKOFF_MAX_MS);
  return new Date(now + delay).toISOString();
}

// fullSync dirty-tracking high-water-mark key (Phase 1b). One syncMeta row per
// entity type records the newest row-mtime pushed in the last full sync; the
// next full sync only enqueues rows strictly newer than this.
function lastFullPushKey(entityType: string): string {
  return `lastFullPush:${entityType}`;
}

// Extract a row's modification timestamp for dirty comparison. Mirrors the
// conflict-detection precedence (updatedAt → completedAt → createdAt) and adds
// `timestamp` for append-only logs which carry no updatedAt.
function rowMtime(row: Record<string, unknown>): string | undefined {
  return (row.updatedAt ?? row.completedAt ?? row.createdAt ?? row.timestamp) as
    | string
    | undefined;
}

type StatusCallback = (status: 'idle' | 'syncing' | 'error', pendingCount: number) => void;
type ConflictCallback = (count: number) => void;

// Module-level cache of global_project_members → user_id rows.
// Keeps the pull loop from firing the same membership query 19 times in a row.
// Keyed by userId so multiple users in one runtime (tests) don't cross-pollute.
const membershipCache = new Map<string, { ids: string[]; fetchedAt: number }>();

/**
 * Fetches the set of global_project_ids the current user is a member of.
 * Cached per-user with a short TTL — call repeatedly within a pull cycle without
 * incurring redundant queries.
 */
async function fetchMyGlobalProjectIds(
  supabase: SupabaseClient,
  userId: string,
  force = false,
): Promise<string[]> {
  if (!force) {
    const cached = membershipCache.get(userId);
    if (cached && Date.now() - cached.fetchedAt < MEMBERSHIP_CACHE_TTL_MS) {
      return cached.ids;
    }
  }
  try {
    const { data, error } = await supabase
      .from('global_project_members')
      .select('global_project_id')
      .eq('user_id', userId);
    if (error) {
      // Don't poison the cache on error — just return empty for this call
      return [];
    }
    const ids = (data ?? [])
      .map((r) => (r as { global_project_id?: string }).global_project_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    membershipCache.set(userId, { ids, fetchedAt: Date.now() });
    return ids;
  } catch {
    return [];
  }
}

export class SyncManager implements SyncManagerInterface {
  private client: SupabaseClient;
  private userId: string;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private processingPromise: Promise<void> | null = null;
  private onStatusChange: StatusCallback | null = null;
  private onConflictCountChange: ConflictCallback | null = null;
  // Entity types whose Supabase tables don't exist — skip sync for these
  // to prevent retry storms that freeze the UI
  private brokenEntityTypes = new Set<string>();
  // Active realtime channels for global_* tables. Populated by
  // subscribeToGlobalRealtime() and torn down by stop().
  private globalRealtimeChannels: RealtimeChannel[] = [];
  // Queue item ids for which we've already attempted a session refresh after a
  // token-expired error this session. Prevents an infinite refresh→retry loop
  // if the refresh itself doesn't fix the 401.
  private authRefreshedItemIds = new Set<string>();

  constructor(client: SupabaseClient, userId: string) {
    this.client = client;
    this.userId = userId;
  }

  setStatusCallback(cb: StatusCallback): void {
    this.onStatusChange = cb;
  }

  setConflictCallback(cb: ConflictCallback): void {
    this.onConflictCountChange = cb;
  }

  /**
   * Cross-user push guard (Finding #3, Phase 1c).
   *
   * Returns the foreign author's user-id if a global push item's row was
   * authored by SOMEONE ELSE (so this device can neither create nor update it),
   * or null when the row is the current user's own (or authorship can't be
   * determined → fail open and let the push proceed).
   *
   * Why this matters: every global audited child table's UPDATE RLS policy
   * requires `created_by = auth.uid()` (or project-admin). A plain upsert of a
   * pulled foreign-authored row takes the `ON CONFLICT DO UPDATE` branch and is
   * rejected with 42501 — forever. globalProjects (created_by) and
   * globalActivityLog (user_id, the actor) are the same class of problem.
   *
   * Admin handling: we deliberately do NOT try to detect project-admin offline.
   * A genuine admin edit still succeeds when made through the live `api.ts`
   * write path (which goes straight to Supabase under the admin's session). The
   * ONLY thing this guard suppresses is the *sync-queue re-push* of a row this
   * device merely pulled and doesn't author — which is always futile and never
   * something an admin needs the queue to do. So the safe default is: drop any
   * foreign-authored global row from the push queue.
   */
  private foreignGlobalAuthor(item: SyncQueueItem): string | undefined {
    if (item.action === 'delete') return undefined;
    const payload = (item.payload ?? {}) as Record<string, unknown>;

    // Keyed explicitly on the entity type (not isGlobalEntity) so the check is
    // robust regardless of how isGlobalEntity is configured.
    if (item.entityType === 'globalActivityLog') {
      // Append-only audit log keyed on the actor's user_id.
      const rowUserId = (payload.userId ?? payload.user_id) as string | undefined;
      return rowUserId && rowUserId !== this.userId ? rowUserId : undefined;
    }

    // globalProjects (created_by) + every global audited child table
    // (created_by) gate UPDATE on `created_by = auth.uid()`.
    if (item.entityType === 'globalProjects' || GLOBAL_AUDITED_ENTITY_TYPES.has(item.entityType)) {
      const createdBy = (payload.createdBy ?? payload.created_by) as string | undefined;
      return createdBy && createdBy !== this.userId ? createdBy : undefined;
    }

    // globalProjectPreferences is per-user (composite PK includes user_id) —
    // a device only ever holds its own rows; nothing foreign to guard.
    // Local (non-global) entities: nothing to guard.
    return undefined;
  }

  private async reportConflictCount(): Promise<void> {
    try {
      const count = await getSyncConflictCount();
      this.onConflictCountChange?.(count);
    } catch {
      // Ignore
    }
  }

  /**
   * Capture a push/pull failure into the syncErrors store with per-signature
   * dedup (Phase 1b, Finding #6).
   *
   * The id is the deterministic signature `${entityType}-${entityId}-${code}` so
   * a recurring failure UPSERTS one row (occurrences++) instead of inserting a
   * fresh random-id row on every retry (which churned the 100-row cap and
   * evicted distinct errors). The `bau-suite:sync-error-added` window event is
   * fired ONLY when addSyncError reports a NEW signature (first occurrence), so
   * the inspector doesn't re-render on every duplicate.
   *
   * Callers gate WHEN this runs (first occurrence and/or terminal failure) — it
   * is no longer invoked on every transient retry.
   */
  private async captureSyncError(
    err: unknown,
    opts: {
      entityType: SyncEntityType;
      entityId: string;
      action: SyncError['action'];
      payload?: unknown;
      retryCount: number;
    },
  ): Promise<void> {
    try {
      const { code, message, hint, details } = formatPostgrestError(err);
      const signatureCode = code ?? 'none';
      const syncError: SyncError = {
        // Deterministic signature key (Phase 1b dedup).
        id: `${opts.entityType}-${opts.entityId}-${signatureCode}`,
        entityType: opts.entityType,
        entityId: opts.entityId,
        action: opts.action,
        table: entityTypeToTable[opts.entityType] ?? opts.entityType,
        errorCode: code,
        errorMessage: message,
        hint,
        details,
        payload: opts.payload
          ? (sanitizeForLog(opts.payload) as Record<string, unknown>)
          : null,
        retryCount: opts.retryCount,
        userId: this.userId,
        appVersion: (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_APP_VERSION) || 'unknown',
        createdAt: new Date().toISOString(),
      };
      const isNewSignature = await addSyncError(syncError);
      // Only emit on a NEW signature — avoids inspector re-render storms when the
      // same failure recurs.
      if (isNewSignature && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bau-suite:sync-error-added', { detail: syncError }));
      }
    } catch (captureErr) {
      console.warn(`${LOG_PREFIX} Failed to capture sync error to syncErrors store:`, captureErr);
    }
  }

  start(): void {
    if (this.intervalId) return;
    console.info(`${LOG_PREFIX} Manager started (user=${this.userId.substring(0, 8)}…)`);
    this.intervalId = setInterval(() => this.processQueue(), PROCESS_INTERVAL_MS);
    // Recovery sweep: reclaim any items stranded in 'syncing' by a prior crash /
    // reload before the first process run, so they aren't silently lost.
    // Fire-and-forget; the immediate first run is chained after it completes.
    resetSyncingItemsToPending()
      .then((reset) => {
        if (reset > 0) {
          console.info(`${LOG_PREFIX} Recovery: reset ${reset} stuck 'syncing' item(s) to 'pending'`);
        }
      })
      .catch((e) => console.warn(`${LOG_PREFIX} Recovery sweep failed:`, e))
      .finally(() => {
        // Don't kick off the first run if the manager was stopped while the
        // sweep was in flight.
        if (this.intervalId) this.processQueue();
      });
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.info(`${LOG_PREFIX} Manager stopped`);
    }
    this.unsubscribeFromGlobalRealtime();
  }

  /**
   * Enqueue a single entity for sync.
   * Uses `${entityType}-${entityId}` as the queue key so repeated enqueues
   * for the same entity just overwrite (dedup) instead of stacking.
   */
  async enqueue(
    action: 'create' | 'update' | 'delete',
    entityType: SyncEntityType,
    entityId: string,
    payload: unknown,
    options?: { preserveRetry?: boolean },
  ): Promise<void> {
    // Pre-flight: entity ID must be a valid UUID (non-UUID = demo/seed data
    // that never existed in Supabase, so there's nothing to create/update/delete)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entityId)) {
      return;
    }
    // For create/update: also validate required FKs (e.g. project_id NOT NULL)
    if (action !== 'delete') {
      const reason = validateSyncable(entityType, (payload ?? {}) as Record<string, unknown>);
      if (reason) {
        return;
      }
    }

    const item: SyncQueueItem = {
      // Deterministic ID: same entity always overwrites its previous queue entry
      id: `${entityType}-${entityId}`,
      action,
      entityType,
      entityId,
      payload,
      userId: this.userId,
      status: 'pending',
      createdAt: new Date().toISOString(),
      retriedCount: 0,
    };
    // Phase 1b (Finding #5): fullSync re-enqueues changed rows with
    // preserveRetry so a poison item parked at `failed` keeps its retry
    // bookkeeping instead of being reset to a clean pending/0 every full sync
    // (the "stuck at 3" loop). A normal user edit (no options) enqueues fresh.
    if (options?.preserveRetry) {
      await addSyncItemPreservingRetry(item);
    } else {
      await addSyncItem(item);
    }
    this.reportStatus();
  }

  /**
   * Auto-recover `failed` items whose last error is TRANSIENT (Phase 1b).
   *
   * `failed` items are otherwise only retried via the manual "Retry" button or a
   * fullSync recreating them. On reconnect (and periodically) we re-pend the
   * ones that failed for a transient reason (network down, server 5xx, JWT
   * expiry) — leaving PERMANENT failures (RLS 42501, FK 23503, missing-column
   * 42703 / PGRST204) parked, since retrying those can never succeed. Uses the
   * persisted `lastErrorCode` / `lastError` on each item via the sync-error
   * classifier. Returns the count re-pended.
   */
  async autoRecoverFailedItems(): Promise<number> {
    try {
      const recovered = await recoverTransientFailedItems(isTransientSyncError);
      if (recovered > 0) {
        console.info(`${LOG_PREFIX} Auto-recovery: re-pended ${recovered} transient failed item(s)`);
        this.reportStatus();
      }
      return recovered;
    } catch (e) {
      console.warn(`${LOG_PREFIX} Auto-recovery sweep failed:`, e);
      return 0;
    }
  }

  async processQueue(): Promise<void> {
    if (this.processingPromise) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    this.processingPromise = this._processQueueInner();
    try {
      await this.processingPromise;
    } finally {
      this.processingPromise = null;
    }
  }

  private async _processQueueInner(): Promise<void> {
    try {
      const items = await getPendingSyncItems(BATCH_SIZE);
      if (items.length === 0) {
        this.reportStatus();
        return;
      }

      console.info(`${LOG_PREFIX} Processing ${items.length} queued item(s)…`);
      this.onStatusChange?.('syncing', items.length);

      // Sort: projects first to satisfy FK constraints
      items.sort((a, b) => {
        const orderA = SYNC_ORDER.indexOf(a.entityType);
        const orderB = SYNC_ORDER.indexOf(b.entityType);
        return orderA - orderB;
      });

      let successCount = 0;
      let failCount = 0;

      for (const item of items) {
        const ok = await this.processItem(item);
        if (ok) successCount++;
        else failCount++;
      }

      if (successCount > 0 || failCount > 0) {
        console.info(`${LOG_PREFIX} Batch complete: ${successCount} synced, ${failCount} failed`);
      }

      this.reportStatus();
    } catch (err) {
      console.error(`${LOG_PREFIX} Queue processing error:`, err);
      this.onStatusChange?.('error', 0);
    }
  }

  private async processItem(item: SyncQueueItem): Promise<boolean> {
    // Skip entity types whose Supabase tables are missing (prevents retry storm / UI freeze)
    if (this.brokenEntityTypes.has(item.entityType)) {
      console.warn(`${LOG_PREFIX} Skipping ${item.entityType}/${item.entityId} — table does not exist in Supabase`);
      await deleteSyncItem(item.id);
      return true;
    }

    // Pre-flight validation: catch anything that slipped past enqueue
    if (item.action !== 'delete') {
      const reason = validateSyncable(item.entityType, (item.payload ?? {}) as Record<string, unknown>);
      if (reason) {
        console.warn(`${LOG_PREFIX} Removing unsyncable item ${item.entityType}/${item.entityId}: ${reason}`);
        await deleteSyncItem(item.id);
        return true; // not a failure — just not syncable
      }
    }

    // Mark as syncing
    await updateSyncItem({ ...item, status: 'syncing' });

    try {
      const table = entityTypeToTable[item.entityType];
      const isGlobal = isGlobalEntity(item.entityType);

      // ── Cross-user push guard for ALL global entities (Finding #3, 1c) ──
      // Generalized from the original globalActivityLog-only guard. Every global
      // audited child table + globalProjects gates its UPDATE/INSERT RLS policy
      // on the row's author (`created_by = auth.uid()`, or `user_id = auth.uid()`
      // for the append-only activity log). The timeline / shared-project pulls
      // bring EVERY member's rows into IndexedDB; if a foreign-authored pulled
      // row gets enqueued for push, the upsert's ON CONFLICT DO UPDATE branch is
      // rejected with 42501 — forever. We can never push another member's row,
      // and don't need to: it already lives in the cloud. Drop as a no-op.
      // (Admin: not detected offline — see foreignGlobalAuthor() docs. A real
      // admin edit succeeds via the live api.ts path; only the queue re-push of
      // a foreign row is the problem this suppresses.)
      const foreignAuthor = this.foreignGlobalAuthor(item);
      if (foreignAuthor) {
        console.info(
          `${LOG_PREFIX} Skipping ${item.entityType}/${item.entityId} push — ` +
          `authored by another user (${foreignAuthor.substring(0, 8)}…), already in cloud`,
        );
        await deleteSyncItem(item.id);
        this.authRefreshedItemIds.delete(item.id);
        return true; // not a failure — futile + RLS-forbidden, drop silently
      }

      if (item.action === 'delete') {
        // Hard delete for append-only logs (no deleted_at column).
        // Soft delete (deleted_at = now()) for everything else.
        // Global membership-RLS tables: don't scope by user_id — RLS handles auth.
        const isAppendOnly = item.entityType === 'activityLog' || item.entityType === 'globalActivityLog';
        if (isAppendOnly) {
          let query = this.client.from(table).delete().eq('id', item.entityId);
          if (!isGlobal) {
            query = query.eq('user_id', this.userId);
          }
          const { error } = await query;
          if (error) throw error;
        } else if (item.entityType === 'globalProjectPreferences') {
          // Composite PK (user_id, global_project_id). This table has NO
          // `deleted_at` column (add-global-project-preferences.sql), so a
          // soft-delete UPDATE would fail 42703/PGRST204 and retry forever
          // (Finding #7, Phase 2). Issue a HARD delete by the composite key.
          // RLS ("Users can manage their own global project preferences" —
          // for all USING auth.uid() = user_id) allows deleting your own row.
          const payload = (item.payload ?? {}) as Record<string, unknown>;
          const gpid = payload.globalProjectId as string | undefined;
          if (!gpid) {
            // Can't identify which preferences row to delete — drop the queue entry
            console.warn(`${LOG_PREFIX} Skipping globalProjectPreferences delete with no globalProjectId`);
            await deleteSyncItem(item.id);
            return true;
          }
          const { error } = await this.client
            .from(table)
            .delete()
            .eq('user_id', this.userId)
            .eq('global_project_id', gpid);
          if (error) throw error;
        } else {
          let query = this.client.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', item.entityId);
          if (!isGlobal) {
            query = query.eq('user_id', this.userId);
          }
          const { error } = await query;
          if (error) throw error;
        }
      } else {
        // create or update → upsert with conflict detection
        const row = toSupabaseRow(
          item.entityType,
          item.payload as Record<string, unknown>,
          this.userId,
          { isUpdate: item.action === 'update' },
        );

        // Conflict detection: for updates, check if remote is newer.
        // globalActivityLog is append-only (no updates) and globalProjectPreferences
        // doesn't have a stable `id` column to look up — skip conflict detection
        // for both.
        const supportsConflictCheck =
          item.action === 'update'
          && item.entityType !== 'globalActivityLog'
          && item.entityType !== 'globalProjectPreferences';

        if (supportsConflictCheck) {
          const localPayload = item.payload as Record<string, unknown>;
          const localUpdatedAt = (localPayload.updatedAt ?? localPayload.completedAt ?? localPayload.createdAt) as string | undefined;

          if (localUpdatedAt) {
            // Fetch remote row's updated_at
            const { data: remoteRow, error: fetchError } = await this.client
              .from(table)
              .select('*')
              .eq('id', item.entityId)
              .maybeSingle();

            if (!fetchError && remoteRow) {
              const remoteUpdatedAt = (remoteRow.updated_at ?? remoteRow.completed_at ?? remoteRow.created_at) as string | undefined;
              // ── Conflict comparator (Finding #9, Phase 2) ──────────────────
              // sync_version is now the PRIMARY comparator, not just an equal-ms
              // tiebreaker. The server trigger advances sync_version monotonically
              // on every UPDATE (add-sync-version-auto-increment.sql), so it is
              // immune to client clock skew — unlike updated_at, which the slower
              // / spoofed clock could otherwise use to silently drop the other
              // device's write.
              //   • Both versions known → conflict whenever remoteVersion >
              //     localVersion, REGARDLESS of timestamps. (A higher remote
              //     version means the cloud has a strictly newer revision this
              //     device hasn't seen.) Equal versions fall through to the
              //     timestamp comparison below.
              //   • Versions absent/equal → fall back to updated_at: conflict
              //     when remote is strictly newer, or equal-ms (skew window) —
              //     advisory only.
              const remoteVersion = typeof remoteRow.sync_version === 'number'
                ? remoteRow.sync_version : undefined;
              const localVersion = typeof localPayload.syncVersion === 'number'
                ? localPayload.syncVersion : undefined;
              const bothVersionsKnown = remoteVersion !== undefined && localVersion !== undefined;
              const remoteTime = remoteUpdatedAt ? new Date(remoteUpdatedAt).getTime() : NaN;
              const localTime = new Date(localUpdatedAt).getTime();
              const remoteIsNewer = remoteTime > localTime;
              const equalTimestamp = remoteTime === localTime;

              // Primary: version-based decision when both versions are present.
              const versionConflict = bothVersionsKnown && remoteVersion > localVersion;
              // Fallback: timestamp-based, only consulted when versions are
              // absent or equal (so a higher local version can still win even on
              // an older-or-equal timestamp).
              const timestampConflict = !bothVersionsKnown || remoteVersion === localVersion
                ? Boolean(remoteUpdatedAt) && (remoteIsNewer || equalTimestamp)
                : false;

              if (versionConflict || timestampConflict) {
                // Conflict: remote is a newer revision (by version, or by
                // timestamp when versions are unavailable/equal) — store
                // conflict, remove from queue
                console.warn(
                  `${LOG_PREFIX} Conflict detected for ${item.entityType}/${item.entityId}: ` +
                  `local=${localUpdatedAt}, remote=${remoteUpdatedAt}`,
                );
                const conflict: SyncConflict = {
                  id: `${item.entityType}-${item.entityId}`,
                  entityType: item.entityType,
                  entityId: item.entityId,
                  localData: localPayload,
                  remoteData: fromSupabaseRow(item.entityType, remoteRow),
                  localUpdatedAt,
                  // remoteUpdatedAt is required (string). When a conflict is
                  // raised purely on sync_version and the remote row has no
                  // usable timestamp, fall back to the local one for display.
                  remoteUpdatedAt: remoteUpdatedAt ?? localUpdatedAt,
                  detectedAt: new Date().toISOString(),
                };
                await addSyncConflict(conflict);
                await deleteSyncItem(item.id);
                await this.reportConflictCount();
                return true; // Not a failure — conflict stored for resolution
              }
            }
            // If remote doesn't exist or no updated_at, proceed with upsert (no conflict)
          }
        }

        // globalProjectPreferences uses the composite PK as the conflict target
        // (it has no synthetic `id` column). Everything else conflicts on `id`.
        const onConflict = item.entityType === 'globalProjectPreferences'
          ? 'user_id,global_project_id'
          : 'id';

        // globalActivityLog is an append-only audit log: rows are never updated
        // after insert. A plain upsert compiles to INSERT … ON CONFLICT (id) DO
        // UPDATE, and on a re-push / retry of an already-synced row Postgres
        // takes the UPDATE branch. The UPDATE RLS policy only allows the row's
        // original author or a project admin, so re-pushing another member's
        // activity row (pulled into IndexedDB, then re-queued) is rejected with
        // 42501 → "[sync] rls-rejected on globalActivityLog". Make the push
        // insert-only via ON CONFLICT DO NOTHING (ignoreDuplicates) so re-pushes
        // are idempotent and never trip the UPDATE policy.
        const ignoreDuplicates = item.entityType === 'globalActivityLog';

        const { error } = await this.client
          .from(table)
          .upsert(row, { onConflict, ignoreDuplicates });

        if (error) throw error;
      }

      // Success — remove from queue and clear any auth-refresh marker
      await deleteSyncItem(item.id);
      this.authRefreshedItemIds.delete(item.id);
      return true;
    } catch (err: unknown) {
      // Supabase PostgREST errors are plain objects with { message, code, details, hint }
      const errorMsg = err instanceof Error
        ? err.message
        : (err && typeof err === 'object' && 'message' in err)
          ? String((err as { message: string }).message)
          : JSON.stringify(err);

      // ── syncErrors capture moved to TERMINAL / first-occurrence only ──────
      // (Phase 1b, Finding #6). The old code captured on EVERY retry before the
      // terminal check, writing a fresh random-id row every 5s and churning the
      // 100-row cap. Capture now fires:
      //   • at each non-retryable DROP branch below (these are terminal), and
      //   • once on the first transient failure + again at terminal `failed`,
      // all via this.captureSyncError() which dedups by signature.
      const captureCtx = {
        entityType: item.entityType,
        entityId: item.entityId,
        action: item.action,
        payload: item.payload,
      };

      // Detect "relation does not exist" — table missing from Supabase.
      // Mark this entity type as broken to prevent retry storms that freeze the UI.
      const errorCode = (err && typeof err === 'object' && 'code' in err)
        ? String((err as { code: string }).code) : '';
      if (errorCode === '42P01' || errorMsg.includes('relation') && errorMsg.includes('does not exist')) {
        console.error(
          `${LOG_PREFIX} Table missing for "${item.entityType}" — disabling sync for this entity type this session`,
        );
        await this.captureSyncError(err, { ...captureCtx, retryCount: item.retriedCount });
        this.brokenEntityTypes.add(item.entityType);
        await deleteSyncItem(item.id);
        return true; // Don't retry — table doesn't exist
      }

      // ── 42501 RLS rejection on a global update — non-retryable drop ───────
      // Backstop for Finding #3 (Phase 1c): any foreign-authored global row
      // that slipped past the foreignGlobalAuthor() pre-check (e.g. a row with a
      // missing/empty createdBy that still fails the WITH CHECK server-side)
      // would otherwise retry 5× and spam the syncErrors store. The RLS policy
      // is deterministic — retrying can never make a forbidden write succeed —
      // so park/drop it immediately instead. Scoped to global entities so a
      // genuine transient permission blip on a local table still gets retries.
      if (errorCode === '42501' && isGlobalEntity(item.entityType) && item.action !== 'delete') {
        console.warn(
          `${LOG_PREFIX} RLS-rejected (42501) on ${item.entityType}/${item.entityId} — ` +
          `dropping as non-retryable (cannot push a row you don't own)`,
        );
        await this.captureSyncError(err, { ...captureCtx, retryCount: item.retriedCount });
        await deleteSyncItem(item.id);
        this.authRefreshedItemIds.delete(item.id);
        return true; // Don't retry — RLS forbids it deterministically
      }

      // ── Token-expired (401 / JWT expired) — refresh and retry once ─────────
      // Supabase JS captures the access token at request issue time; on a long
      // push the token can expire mid-batch (1h default), returning a 401 with
      // "JWT expired". This is a *transient* auth failure, not a data problem —
      // treat it specially: refresh the session and requeue the item WITHOUT
      // incrementing retriedCount, so a token blip doesn't permanently fail
      // legitimate items. Guarded by authRefreshedItemIds so we refresh at most
      // once per item per session and fall through to the normal retry path if
      // the refresh doesn't resolve it.
      const httpStatus = (err && typeof err === 'object' && 'status' in err)
        ? Number((err as { status: unknown }).status) : NaN;
      const isTokenExpired =
        (httpStatus === 401 || errorCode === 'PGRST301' || errorCode === '401')
        || /jwt expired|token (?:is )?expired|invalid (?:jwt|token)/i.test(errorMsg);
      if (isTokenExpired && !this.authRefreshedItemIds.has(item.id)) {
        this.authRefreshedItemIds.add(item.id);
        console.warn(
          `${LOG_PREFIX} Auth token expired while syncing ${item.entityType}/${item.entityId} — refreshing session and retrying`,
        );
        try {
          await this.client.auth.refreshSession();
        } catch (refreshErr) {
          console.warn(`${LOG_PREFIX} Session refresh failed:`, refreshErr);
        }
        // Requeue without incrementing the retry count.
        await updateSyncItem({
          ...item,
          status: 'pending',
          lastError: errorMsg,
        });
        return false;
      }
      // ── End token-expired handling ────────────────────────────────────────

      const newRetryCount = item.retriedCount + 1;

      console.warn(
        `${LOG_PREFIX} Failed to sync ${item.entityType}/${item.entityId} (attempt ${newRetryCount}/${MAX_RETRIES}):`,
        errorMsg,
      );

      const isTerminal = newRetryCount >= MAX_RETRIES;

      // ── syncErrors capture (Phase 1b, Finding #6) ─────────────────────────
      // Capture on the FIRST occurrence (so a distinct error surfaces promptly)
      // and again at TERMINAL `failed` (so the retryCount is recorded correctly).
      // Transient middle retries are NOT captured — the signature dedup would
      // only bump occurrences, but skipping them avoids needless writes/churn.
      if (item.retriedCount === 0 || isTerminal) {
        await this.captureSyncError(err, { ...captureCtx, retryCount: newRetryCount });
      }

      if (isTerminal) {
        await updateSyncItem({
          ...item,
          status: 'failed',
          retriedCount: newRetryCount,
          lastError: errorMsg,
          lastErrorCode: errorCode || undefined,
          // Terminal — clear any backoff gate (the auto-recovery sweep owns it now).
          nextRetryAt: undefined,
        });
        console.error(
          `${LOG_PREFIX} Permanently failed: ${item.entityType}/${item.entityId} — ${errorMsg}`,
        );
      } else {
        // ── Exponential backoff (Phase 1b) ────────────────────────────────
        // Gate the next attempt instead of letting it fire on the very next 5s
        // tick. nextRetryAt = now + base * 2^retriedCount (capped); the eligible
        // filter in getPendingSyncItems skips the item until then.
        const nextRetryAt = computeNextRetryAt(item.retriedCount);
        await updateSyncItem({
          ...item,
          status: 'pending',
          retriedCount: newRetryCount,
          lastError: errorMsg,
          lastErrorCode: errorCode || undefined,
          nextRetryAt,
        });
      }
      return false;
    }
  }

  /**
   * Full sync: wipe the queue, re-scan all IndexedDB stores, enqueue everything
   * that passes validation. Returns the exact count of items that will be synced.
   */
  async fullSync(): Promise<{ enqueued: number; errors: string[] }> {
    console.info(`${LOG_PREFIX} Full sync started — clearing queue and reading all stores…`);

    // Step 0: Purge orphaned demo data from Supabase (null project_id rows, soft-deleted projects)
    await this.purgeOrphans();

    // Step 1: Clear the queue to prevent duplicates — but KEEP `failed` items
    // (Phase 1b, Finding #5). Wiping them would reset their retriedCount to 0 on
    // re-enqueue, so a deterministically-doomed write never stays terminal and
    // re-enters the 5-retry loop forever. addSyncItemPreservingRetry below
    // carries over the retry bookkeeping of any surviving failed row.
    const cleared = await clearSyncQueueExceptFailed();
    if (cleared > 0) {
      console.info(`${LOG_PREFIX} Cleared ${cleared} stale queue item(s) (kept failed items)`);
    }

    let totalEnqueued = 0;
    let totalSkipped = 0;
    const errors: string[] = [];

    for (const entityType of SYNC_ORDER) {
      try {
        const items = await getAllFromStore(entityType) as Record<string, unknown>[];
        let storeEnqueued = 0;
        let storeSkipped = 0;

        // ── Dirty-tracking high-water mark (Phase 1b, Finding #5) ──────────
        // Only enqueue rows MODIFIED since the last full push. We compare each
        // row's mtime (updatedAt → completedAt → createdAt → timestamp) to the
        // per-entity high-water mark persisted in syncMeta. A full sync of an
        // unchanged dataset therefore enqueues ~0 rows — instead of re-pushing
        // every row (with a conflict-SELECT each) on every full sync.
        //
        // Caveat: rows with NO usable mtime can't be dirty-tracked — they are
        // enqueued conservatively (always) so we never silently drop a write.
        // The watermark is advanced to the newest mtime SEEN this scan (across
        // all syncable rows, including ones skipped as unchanged or foreign), so
        // the next full sync's "newer than" comparison stays correct.
        const prevMark = await getSyncMeta(lastFullPushKey(entityType));
        const prevMarkTime = prevMark ? new Date(prevMark).getTime() : -Infinity;
        let maxMtime: string | undefined = prevMark ?? undefined;
        let maxMtimeTime = prevMarkTime;

        for (const item of items) {
          // validateSyncable checks ID format, projectId FK, etc.
          const reason = validateSyncable(entityType, item);
          if (reason) {
            storeSkipped++;
            continue;
          }

          const mtime = rowMtime(item);
          const mtimeMs = mtime ? new Date(mtime).getTime() : NaN;
          // Track the newest mtime among syncable rows for the next watermark.
          if (!Number.isNaN(mtimeMs) && mtimeMs > maxMtimeTime) {
            maxMtimeTime = mtimeMs;
            maxMtime = mtime;
          }

          // Cross-user authorship skip (Finding #3, Phase 1c). Global stores
          // hold rows authored by OTHER members (the timeline / shared-project
          // pulls mirror everyone's rows into IndexedDB). Re-pushing a foreign
          // row is futile (already in cloud) and RLS-rejected (42501 on the
          // ON CONFLICT DO UPDATE / INSERT WITH CHECK) — skip it. Own-authored
          // rows still re-enqueue as before. Reuses the same author check as the
          // push-path guard so the two never diverge. (`item` here is a raw
          // store row, not a SyncQueueItem; wrap it so foreignGlobalAuthor can
          // read its payload.)
          if (isGlobalEntity(entityType)) {
            const foreign = this.foreignGlobalAuthor({
              action: 'update',
              entityType,
              payload: item,
            } as SyncQueueItem);
            if (foreign) {
              storeSkipped++;
              continue;
            }
          }

          // Dirty check: skip rows NOT newer than the last full-push mark.
          // Rows with a usable mtime that is <= the mark are unchanged → skip.
          // Rows with no usable mtime (NaN) fall through and are enqueued.
          if (!Number.isNaN(mtimeMs) && mtimeMs <= prevMarkTime) {
            storeSkipped++;
            continue;
          }

          // preserveRetry: carry over the retriedCount/status of any surviving
          // `failed` queue row so a poison item isn't reset to a clean 0.
          await this.enqueue('update', entityType, item.id as string, item, { preserveRetry: true });
          storeEnqueued++;
        }

        // Advance the high-water mark so the next full sync skips everything not
        // modified after this point. Only persist when it actually moved forward.
        if (maxMtime && maxMtimeTime > prevMarkTime) {
          await setSyncMeta(lastFullPushKey(entityType), maxMtime);
        }

        totalEnqueued += storeEnqueued;
        totalSkipped += storeSkipped;

        if (storeEnqueued > 0) {
          console.info(`${LOG_PREFIX} ${entityType}: ${storeEnqueued} enqueued, ${storeSkipped} skipped`);
        } else if (items.length > 0) {
          console.info(`${LOG_PREFIX} ${entityType}: all ${items.length} skipped (unchanged/invalid/foreign)`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`${LOG_PREFIX} Failed to read store "${entityType}":`, msg);
        errors.push(`${entityType}: ${msg}`);
      }
    }

    console.info(`${LOG_PREFIX} Full sync: ${totalEnqueued} enqueued, ${totalSkipped} skipped`);

    // Kick off processing immediately (don't await — runs in background)
    if (totalEnqueued > 0) {
      this.processQueue();
    } else {
      this.reportStatus();
    }

    return { enqueued: totalEnqueued, errors };
  }

  /**
   * Full restore: undelete all soft-deleted rows in Supabase, then do a
   * complete (non-incremental) pull. Used by the "Restore from Cloud" button.
   */
  async restoreFromCloud(): Promise<{
    pulled: number;
    deleted: number;
    errors: string[];
    newPulledAt: string;
  }> {
    console.info(`${LOG_PREFIX} Restore from cloud — reversing soft-deletes…`);

    // Undelete all user's soft-deleted rows across all tables. Exclude:
    //   - activityLog: append-only, no deleted_at column
    //   - globalActivityLog: append-only, no deleted_at column (42703 on UPDATE)
    //   - globalProjectPreferences: composite-PK table, no deleted_at column (42703 on UPDATE)
    const tablesWithDeletedAt = SYNC_ORDER.filter(
      (t) => t !== 'activityLog' && t !== 'globalActivityLog' && t !== 'globalProjectPreferences',
    );
    for (const entityType of tablesWithDeletedAt) {
      try {
        const table = entityTypeToTable[entityType];
        // Finding #8 (Phase 2): global membership-RLS tables key on `created_by`,
        // NOT `user_id`. Adding `.eq('user_id', …)` against them raises 42703
        // (column does not exist) and "Restore from Cloud" silently never
        // un-deletes shared data. RLS already scopes the UPDATE to the user's
        // memberships server-side, so for global tables we drop the user_id
        // filter entirely. Local user-owned tables keep it (ownership scope).
        const isGlobal = isGlobalEntity(entityType);
        let undeleteQuery = this.client
          .from(table)
          .update({ deleted_at: null });
        if (!isGlobal) {
          undeleteQuery = undeleteQuery.eq('user_id', this.userId);
        }
        const { data, error } = await undeleteQuery
          .not('deleted_at', 'is', null)
          .select('id');

        if (error) {
          console.warn(`${LOG_PREFIX} Undelete failed for ${entityType}:`, error.message);
          continue;
        }
        const count = data?.length ?? 0;
        if (count > 0) {
          console.info(`${LOG_PREFIX} Undeleted ${count} ${entityType} row(s)`);
        }
      } catch (err) {
        console.warn(`${LOG_PREFIX} Undelete error for ${entityType}:`, err);
      }
    }

    // Now do a full (non-incremental) pull
    return this.pullSync(null);
  }

  /**
   * Pull sync: download data from Supabase into IndexedDB.
   * Uses silent writes to avoid re-pushing pulled data.
   * Supports incremental pulls via lastPulledAt timestamp.
   */
  async pullSync(lastPulledAt: string | null): Promise<{
    pulled: number;
    deleted: number;
    errors: string[];
    newPulledAt: string;
  }> {
    console.info(`${LOG_PREFIX} Pull sync started (since=${lastPulledAt ?? 'never'})…`);

    // Capture timestamp BEFORE querying so rows modified during pull aren't missed
    const newPulledAt = new Date().toISOString();
    const PAGE_SIZE = 1000;

    let totalPulled = 0;
    let totalDeleted = 0;
    const errors: string[] = [];

    // Pre-fetch the user's global project membership once per pull cycle.
    // Used by the global-entity branch below.
    const memberProjectIds = await fetchMyGlobalProjectIds(this.client, this.userId);

    // Pre-fetch the set of `${entityType}-${entityId}` keys for every UN-PUSHED
    // sync-queue item (status pending/syncing/failed) once per pull cycle. Used
    // for TWO ingress guards:
    //   1. Subtractive full-pull reconciliation must NEVER reap a local row that
    //      still has un-pushed work queued — otherwise "Update from cloud" on a
    //      device with offline-created/edited rows would destroy them (absent
    //      from the cloud live set only because they haven't synced YET).
    //   2. Dirty-row overwrite guard (Finding #4, Phase 1c): an incoming remote
    //      row must NOT clobber a local row that has a pending local edit. This
    //      applies on EVERY pull (incremental too), so we now always read the
    //      keys — previously they were only read for full pulls.
    // unpushedKeys === null means the read failed; both guards then fail SAFE
    // (no subtractive delete, no overwrite of any locally-dirty row this cycle).
    const unpushedKeys = await getUnpushedSyncItemKeys().catch((e) => {
      console.warn(`${LOG_PREFIX} Could not load pending sync queue; skipping subtractive deletes + dirty-guard this pull:`, e);
      return null;
    });

    for (const entityType of SYNC_ORDER) {
      // Skip entity types whose tables are missing from Supabase
      if (this.brokenEntityTypes.has(entityType)) continue;

      try {
        const table = entityTypeToTable[entityType];
        const isGlobal = isGlobalEntity(entityType);
        const isAppendOnlyLog = entityType === 'activityLog' || entityType === 'globalActivityLog';
        // Tables without a `deleted_at` column. Skip the soft-delete filter
        // entirely for these — applying it raises 42703 column-not-found.
        const lacksDeletedAt = isAppendOnlyLog || entityType === 'globalProjectPreferences';

        // Skip global child pulls when the user has no memberships — RLS would
        // return nothing anyway and we save a round trip per table.
        if (isGlobal && REQUIRES_GLOBAL_PROJECT_ID.has(entityType) && memberProjectIds.length === 0) {
          continue;
        }
        if (isGlobal && entityType === 'globalProjects' && memberProjectIds.length === 0) {
          continue;
        }

        // Fetch all pages
        let allRows: Record<string, unknown>[] = [];
        let offset = 0;

        while (true) {
          // Build the per-entity-type base query. Local: filter on user_id
          // (ownership). Global: filter on global_project_id IN (memberships),
          // except for globalProjects (filter on id IN memberships) and
          // globalProjectPreferences (filter on user_id — per-user, not membership).
          let query;
          if (isGlobal) {
            if (entityType === 'globalProjects') {
              query = this.client.from(table).select('*').in('id', memberProjectIds);
            } else if (entityType === 'globalProjectPreferences') {
              query = this.client.from(table).select('*').eq('user_id', this.userId);
            } else {
              // Global child: filter by membership
              query = this.client.from(table).select('*').in('global_project_id', memberProjectIds);
            }
          } else {
            query = this.client.from(table).select('*').eq('user_id', this.userId);
          }

          // deleted_at filtering — tombstone-aware (Finding #1, Phase 1a):
          //   • First full hydration (lastPulledAt == null): KEEP the
          //     `deleted_at IS NULL` filter. There's no local state to
          //     reconcile against and pulling tombstones would be pointless
          //     (subtractive reconciliation handles stale local rows after).
          //   • Incremental pull (lastPulledAt set) on a table WITH a
          //     deleted_at column: DROP the filter so tombstoned rows
          //     (deleted_at != null, updated_at >= lastPulledAt) reach this
          //     device and get routed to a LOCAL delete below. This is the only
          //     path that propagates a soft-delete to other devices.
          //   • Tables without a deleted_at column (append-only logs +
          //     globalProjectPreferences): never apply the filter (42703).
          const skipDeletedFilter = lacksDeletedAt || (lastPulledAt != null);
          if (!skipDeletedFilter) {
            query = query.is('deleted_at', null);
          }

          // Incremental: only fetch rows updated since last pull
          if (lastPulledAt) {
            const timestampCol = isAppendOnlyLog ? 'timestamp' : 'updated_at';
            query = query.gte(timestampCol, lastPulledAt);
          }

          // Explicit, stable ordering so .range() page boundaries are
          // deterministic. Without it Postgres may return rows in arbitrary
          // order across pages, causing rows to be duplicated or skipped if a
          // concurrent insert happens mid-pull (broken audit trail for logs).
          query = query.order(isAppendOnlyLog ? 'timestamp' : 'id', { ascending: true });

          const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;

          allRows = allRows.concat(data as Record<string, unknown>[]);
          if (data.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
        }

        // Subtractive reconciliation (Finding #1, Phase 1a) only runs on a FULL
        // pull. On a full pull with zero cloud rows we still need to fall
        // through so any stale local rows get removed — so only short-circuit
        // here when this is an incremental pull (nothing to reconcile).
        const isFullPull = lastPulledAt == null;
        if (allRows.length === 0 && !isFullPull) continue;

        // Track the cloud's LIVE id set for subtractive reconciliation. On a
        // full pull `allRows` already excludes tombstones (deleted_at IS NULL
        // filter), so every id collected here is a live cloud row.
        const liveCloudIds = new Set<string>();

        // Separate live rows from soft-deleted and orphaned rows.
        // Tombstone-aware pull (Finding #1, Phase 1a): on an incremental pull we
        // deliberately fetch tombstoned rows (deleted_at != null) so a remote
        // soft-delete can be applied as a LOCAL delete here. The isDeletedRow()
        // branch is the active delete-propagation path, not a belt-and-braces
        // guard. (On the first full pull we still filter deleted_at IS NULL, so
        // no tombstones reach this branch then — that's fine.)
        const toUpsert: Record<string, unknown>[] = [];
        const toDeleteIds: string[] = [];
        let orphanCount = 0;
        let dirtySkipCount = 0;

        for (const row of allRows) {
          if (!isAppendOnlyLog && isDeletedRow(row)) {
            // Soft-deleted: schedule for local removal.
            // For parent entities (projects / globalProjects) use the cascade
            // helper so all children are cleaned up in IndexedDB too — otherwise
            // child rows linger and keep pushing against RLS forever.
            if (entityType === 'projects') {
              const pid = row.id as string | undefined;
              if (pid) {
                await cascadeDeleteProject(pid).catch((e) =>
                  console.warn(`${LOG_PREFIX} pullSync cascade (projects/${pid}) failed:`, e),
                );
                totalDeleted++;
              }
            } else if (entityType === 'globalProjects') {
              const gpid = row.id as string | undefined;
              if (gpid) {
                await cascadeDeleteGlobalProject(gpid).catch((e) =>
                  console.warn(`${LOG_PREFIX} pullSync cascade (globalProjects/${gpid}) failed:`, e),
                );
                totalDeleted++;
              }
            } else if (entityType === 'globalProjectPreferences') {
              const uid = row.user_id as string | undefined;
              const gpid = row.global_project_id as string | undefined;
              if (uid && gpid) toDeleteIds.push(`${uid}|${gpid}`);
            } else {
              toDeleteIds.push(row.id as string);
            }
          } else if (!isGlobal && entityType !== 'projects' && REQUIRES_PROJECT_ID.has(entityType) && !row.project_id) {
            // Orphaned local row: requires project_id but has none.
            // It IS a live cloud row, so record its id to keep subtractive
            // reconciliation from deleting a local copy it can't see.
            if (typeof row.id === 'string') liveCloudIds.add(row.id);
            orphanCount++;
          } else if (isGlobal && REQUIRES_GLOBAL_PROJECT_ID.has(entityType) && !row.global_project_id) {
            // Orphaned global child: requires global_project_id but has none.
            if (typeof row.id === 'string') liveCloudIds.add(row.id);
            orphanCount++;
          } else {
            // ── Dirty-row overwrite guard (Finding #4, Phase 1c) ──────────
            // A live remote row must NOT clobber a local row the user edited
            // offline but hasn't pushed yet. If this (entityType, id) has an
            // un-pushed sync-queue item, SKIP the overwrite — the local edit is
            // newer-or-equal intent and will push (and conflict-resolve) on the
            // push path. We still record the id as a live cloud row so the
            // subtractive reconciler doesn't reap the local copy.
            //   • Append-only logs (globalActivityLog) have no user edits — never
            //     dirty; the lookup is harmless but skipped for clarity.
            //   • globalProjectPreferences keys on a composite prefKey, not a
            //     plain id, so it's excluded from the queue-key dirty check
            //     (its queue items key on the row id, which differs) — it is
            //     per-user state with no offline-edit-clobber concern here.
            //   • unpushedKeys === null (queue read failed) → fail safe: don't
            //     overwrite anything this cycle.
            const rowId = typeof row.id === 'string' ? row.id : undefined;
            const isDirtyGuarded =
              !isAppendOnlyLog && entityType !== 'globalProjectPreferences' && rowId !== undefined;
            if (
              isDirtyGuarded
              && (unpushedKeys === null || unpushedKeys.has(`${entityType}-${rowId}`))
            ) {
              // Keep the local edit; still a live cloud row for reconciliation.
              if (rowId) liveCloudIds.add(rowId);
              dirtySkipCount++;
              continue;
            }

            const entity = fromSupabaseRow(entityType, row);
            // Wave 1 TS interfaces expose `deletedAt: string | null` on every
            // global entity, but fromSupabaseRow strips `deleted_at` from every
            // row. Rows reaching this else-branch are live (isDeletedRow() was
            // false above), so stamping deletedAt = null is correct. Note this
            // null is now stripped on PUSH (LOCAL_ONLY_FIELDS) so it can never
            // resurrect a cloud tombstone.
            // Exception: globalActivityLog is append-only — the TS interface
            // doesn't declare `deletedAt` and the table has no such column.
            // Stamping it would poison the IndexedDB row and break upserts.
            if (isGlobal && entityType !== 'globalActivityLog') {
              entity.deletedAt = null;
            }
            // globalProjectPreferences: synthesize the Dexie primary key.
            // The Supabase row has user_id + global_project_id but no `id`.
            if (entityType === 'globalProjectPreferences') {
              const uid = entity.userId as string | undefined;
              const gpid = entity.globalProjectId as string | undefined;
              if (uid && gpid) {
                entity.prefKey = `${uid}|${gpid}`;
              }
            } else if (typeof row.id === 'string') {
              // Record the live cloud id for subtractive reconciliation.
              liveCloudIds.add(row.id);
            }
            toUpsert.push(entity);
          }
        }

        if (orphanCount > 0) {
          const fkLabel = isGlobal ? 'global_project_id' : 'project_id';
          console.info(`${LOG_PREFIX} ${entityType}: skipped ${orphanCount} orphaned row(s) with null ${fkLabel}`);
        }
        if (dirtySkipCount > 0) {
          console.info(
            `${LOG_PREFIX} ${entityType}: kept ${dirtySkipCount} locally-edited row(s) ` +
            `with un-pushed changes (skipped remote overwrite)`,
          );
        }

        // Write to IndexedDB silently (no sync bridge trigger)
        if (toUpsert.length > 0) {
          await bulkPutSilent(entityType, toUpsert);
          totalPulled += toUpsert.length;
        }
        if (toDeleteIds.length > 0) {
          await bulkDeleteSilent(entityType, toDeleteIds);
          totalDeleted += toDeleteIds.length;
        }

        if (toUpsert.length > 0 || toDeleteIds.length > 0) {
          console.info(
            `${LOG_PREFIX} ${entityType}: ${toUpsert.length} pulled, ${toDeleteIds.length} deleted`,
          );
        }

        // ── Subtractive reconciliation (Finding #1, Phase 1a) ──────────────
        // After a FULL pull, remove any local row whose id is absent from the
        // cloud's live set. This is what lets "Update from cloud" / restore
        // actually REMOVE a stale/resurrected row instead of only adding.
        //
        // Safety: only run for a full pull (lastPulledAt == null), where the
        // query returned the COMPLETE live set scoped to this user / their
        // memberships — incremental pulls return a delta, so subtracting there
        // would wrongly delete rows that simply weren't updated this cycle.
        // Also restricted to entities whose pull is provably complete
        // (supportsSubtractivePull): append-only logs and the composite-PK
        // preferences table are excluded.
        // unpushedKeys === null means the pending-queue read failed earlier this
        // cycle; fail safe by skipping ALL subtractive deletes (better to keep a
        // stale row than risk reaping un-pushed user work).
        if (isFullPull && unpushedKeys !== null && supportsSubtractivePull(entityType)) {
          try {
            const localRows = await getAllFromStore(entityType) as Record<string, unknown>[];
            const staleIds = localRows
              .map((r) => r.id as string | undefined)
              // Guard 1: absent from the cloud's live set (stale/resurrected).
              // Guard 2: NO un-pushed sync-queue item. A row with a pending
              // create/update item is offline work not yet in the cloud — it is
              // absent from liveCloudIds only because it hasn't synced, so it
              // MUST be protected. We key on "has a pending queue item", NOT on
              // "exists locally": an already-pushed-then-remotely-deleted row has
              // no pending item and is correctly reaped.
              .filter((id): id is string =>
                typeof id === 'string'
                && !liveCloudIds.has(id)
                && !unpushedKeys.has(`${entityType}-${id}`),
              );

            if (staleIds.length > 0) {
              if (entityType === 'projects') {
                // Cascade so children are removed too (otherwise they linger
                // and keep pushing against RLS forever).
                for (const pid of staleIds) {
                  await cascadeDeleteProject(pid).catch((e) =>
                    console.warn(`${LOG_PREFIX} subtractive cascade (projects/${pid}) failed:`, e),
                  );
                }
              } else if (entityType === 'globalProjects') {
                for (const gpid of staleIds) {
                  await cascadeDeleteGlobalProject(gpid).catch((e) =>
                    console.warn(`${LOG_PREFIX} subtractive cascade (globalProjects/${gpid}) failed:`, e),
                  );
                }
              } else {
                await bulkDeleteSilent(entityType, staleIds);
              }
              totalDeleted += staleIds.length;
              console.info(
                `${LOG_PREFIX} ${entityType}: subtractively removed ${staleIds.length} stale local row(s) absent from cloud`,
              );
            }
          } catch (subErr) {
            console.warn(`${LOG_PREFIX} Subtractive reconcile skipped for ${entityType}:`, subErr);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message
          : (err && typeof err === 'object' && 'message' in err)
            ? String((err as { message: string }).message)
            : String(err);

        // ── Capture pull error into syncErrors store (signature-deduped) ──
        // entityId '*' means the signature collapses per (entityType, code), so
        // a recurring per-table pull failure upserts one row (occurrences++)
        // rather than inserting a new random-id row every pull (Finding #6).
        await this.captureSyncError(err, {
          entityType,
          entityId: '*',
          action: 'pull',
          payload: undefined,
          retryCount: 0,
        });

        // Detect missing table — disable this entity type for the session
        const errCode = (err && typeof err === 'object' && 'code' in err)
          ? String((err as { code: string }).code) : '';
        if (errCode === '42P01' || (msg.includes('relation') && msg.includes('does not exist'))) {
          console.error(`${LOG_PREFIX} Table missing for "${entityType}" — disabling sync this session`);
          this.brokenEntityTypes.add(entityType);
        }
        console.warn(`${LOG_PREFIX} Pull failed for "${entityType}":`, msg);
        errors.push(`${entityType}: ${msg}`);
      }
    }

    console.info(
      `${LOG_PREFIX} Pull sync complete: ${totalPulled} pulled, ${totalDeleted} deleted`,
    );

    return { pulled: totalPulled, deleted: totalDeleted, errors, newPulledAt };
  }

  /**
   * Delete orphaned rows from Supabase — rows with null project_id (old demo data)
   * and all children of soft-deleted projects (to avoid FK violations).
   * Also cleans up orphaned records from local IndexedDB.
   */
  async purgeOrphans(): Promise<number> {
    let totalDeleted = 0;

    // ── Step 1: Find soft-deleted projects, delete their children first, then the projects ──
    try {
      const { data: deadProjects, error: fetchErr } = await this.client
        .from(entityTypeToTable.projects)
        .select('id')
        .eq('user_id', this.userId)
        .not('deleted_at', 'is', null);

      if (fetchErr) {
        console.warn(`${LOG_PREFIX} Failed to fetch soft-deleted projects:`, fetchErr.message);
      } else if (deadProjects && deadProjects.length > 0) {
        const deadIds = deadProjects.map((p) => p.id as string);
        console.info(`${LOG_PREFIX} Found ${deadIds.length} soft-deleted project(s) — purging children first…`);

        // Delete all child records referencing these projects (order: children before parents).
        // Only local entity types that actually carry a `project_id` column — derived from
        // REQUIRES_PROJECT_ID to match Step 1b. Filtering anything else (e.g. global_* tables
        // keyed on global_project_id, or commandSnippets/bugReports which have no project_id)
        // would 42703-error against the missing column and spam the syncErrors log.
        const childTables = SYNC_ORDER.filter((t) => REQUIRES_PROJECT_ID.has(t));
        for (const entityType of childTables) {
          try {
            const table = entityTypeToTable[entityType];
            const { data, error } = await this.client
              .from(table)
              .delete()
              .eq('user_id', this.userId)
              .in('project_id', deadIds)
              .select('id');

            if (error) {
              console.warn(`${LOG_PREFIX} Child purge failed for ${entityType}:`, error.message);
              continue;
            }
            const count = data?.length ?? 0;
            if (count > 0) {
              totalDeleted += count;
              console.info(`${LOG_PREFIX} Purged ${count} ${entityType} row(s) from deleted projects`);
            }
          } catch (err) {
            console.warn(`${LOG_PREFIX} Child purge error for ${entityType}:`, err);
          }
        }

        // Now safe to delete the projects themselves
        const { data, error } = await this.client
          .from(entityTypeToTable.projects)
          .delete()
          .eq('user_id', this.userId)
          .in('id', deadIds)
          .select('id');

        if (!error && data && data.length > 0) {
          totalDeleted += data.length;
          console.info(`${LOG_PREFIX} Purged ${data.length} soft-deleted project(s)`);
        }
      }
    } catch (err) {
      console.warn(`${LOG_PREFIX} Soft-deleted project purge error:`, err);
    }

    // ── Step 1b: Delete orphaned child rows with NULL project_id (old demo data) ──
    try {
      const childTables = SYNC_ORDER.filter((t) => REQUIRES_PROJECT_ID.has(t));
      for (const entityType of childTables) {
        try {
          const table = entityTypeToTable[entityType];
          const { data, error } = await this.client
            .from(table)
            .delete()
            .eq('user_id', this.userId)
            .is('project_id', null)
            .select('id');

          if (error) {
            console.warn(`${LOG_PREFIX} NULL project_id purge failed for ${entityType}:`, error.message);
            continue;
          }
          const count = data?.length ?? 0;
          if (count > 0) {
            totalDeleted += count;
            console.info(`${LOG_PREFIX} Purged ${count} ${entityType} row(s) with NULL project_id`);
          }
        } catch (err2) {
          console.warn(`${LOG_PREFIX} NULL project_id purge error for ${entityType}:`, err2);
        }
      }
    } catch (err) {
      console.warn(`${LOG_PREFIX} NULL project_id purge error:`, err);
    }

    // ── Step 2: Clean up local IndexedDB orphans ──
    await this.purgeLocalOrphans();

    if (totalDeleted > 0) {
      console.info(`${LOG_PREFIX} Orphan purge complete: ${totalDeleted} total row(s) removed from Supabase`);
    }

    return totalDeleted;
  }

  /**
   * Remove orphaned records from local IndexedDB — entities with no projectId
   * or whose projectId references a project that no longer exists locally.
   * Also clears matching items from the sync queue to prevent FK push errors.
   */
  private async purgeLocalOrphans(): Promise<void> {
    // Build set of valid local project IDs
    const projects = await getAllFromStore('projects') as Record<string, unknown>[];
    const validProjectIds = new Set(projects.map((p) => p.id as string));

    // Only clean stores where project_id is required (NOT NULL in Supabase).
    // Stores with nullable project_id (files, connectionProfiles, pingSessions,
    // terminalLogs, registerCalculations) can legitimately have no project.
    const storesToClean: SyncEntityType[] = [...REQUIRES_PROJECT_ID];

    let totalRemoved = 0;
    for (const storeName of storesToClean) {
      try {
        const items = await getAllFromStore(storeName) as Record<string, unknown>[];
        const orphanIds = items
          .filter((item) => !item.projectId || !validProjectIds.has(item.projectId as string))
          .map((item) => item.id as string);

        if (orphanIds.length > 0) {
          await bulkDeleteSilent(storeName, orphanIds);
          totalRemoved += orphanIds.length;
          console.info(`${LOG_PREFIX} Removed ${orphanIds.length} local orphaned ${storeName} record(s)`);

          // Also remove these from the sync queue so they don't try to push
          for (const id of orphanIds) {
            await deleteSyncItem(`${storeName}-${id}`).catch((e) => {
              console.warn(`${LOG_PREFIX} Failed to remove orphan sync item ${storeName}-${id}:`, e);
            });
          }
        }
      } catch (e) {
        // Store may not exist or be empty — non-critical
        console.warn(`${LOG_PREFIX} Local orphan scan skipped for ${storeName}:`, e);
      }
    }

    if (totalRemoved > 0) {
      console.info(`${LOG_PREFIX} Local orphan cleanup: removed ${totalRemoved} total record(s)`);
    }
  }

  // ─── Conflict Resolution ──────────────────────────────────────────────────

  async getConflicts(): Promise<SyncConflict[]> {
    return getAllSyncConflicts();
  }

  async getConflictCount(): Promise<number> {
    return getSyncConflictCount();
  }

  /**
   * Resolve a conflict by keeping the local version — force-push to cloud.
   */
  async resolveKeepLocal(conflictId: string): Promise<void> {
    const conflicts = await getAllSyncConflicts();
    const conflict = conflicts.find((c) => c.id === conflictId);
    if (!conflict) return;

    const table = entityTypeToTable[conflict.entityType];
    // Force-push of an existing row is semantically an update — keep created_by
    // intact and only stamp updated_by.
    const row = toSupabaseRow(conflict.entityType, conflict.localData, this.userId, { isUpdate: true });

    const onConflict = conflict.entityType === 'globalProjectPreferences'
      ? 'user_id,global_project_id'
      : 'id';
    const { error } = await this.client.from(table).upsert(row, { onConflict });
    if (error) {
      console.error(`${LOG_PREFIX} Failed to force-push local for ${conflictId}:`, error.message);
      throw error;
    }

    await deleteSyncConflict(conflictId);
    await this.reportConflictCount();
    console.info(`${LOG_PREFIX} Conflict resolved (keep local): ${conflictId}`);
  }

  /**
   * Resolve a conflict by keeping the remote version — overwrite local IndexedDB.
   */
  async resolveKeepRemote(conflictId: string): Promise<void> {
    const conflicts = await getAllSyncConflicts();
    const conflict = conflicts.find((c) => c.id === conflictId);
    if (!conflict) return;

    // Write remote data to local IndexedDB silently (no re-push)
    await bulkPutSilent(conflict.entityType, [conflict.remoteData]);

    await deleteSyncConflict(conflictId);
    await this.reportConflictCount();
    console.info(`${LOG_PREFIX} Conflict resolved (keep remote): ${conflictId}`);
  }

  /**
   * Resolve a conflict by deleting from BOTH local IndexedDB and Supabase (soft-delete).
   */
  async resolveDeleteBoth(conflictId: string): Promise<void> {
    const conflicts = await getAllSyncConflicts();
    const conflict = conflicts.find((c) => c.id === conflictId);
    if (!conflict) return;

    const table = entityTypeToTable[conflict.entityType];
    const isGlobal = isGlobalEntity(conflict.entityType);

    // Soft-delete in Supabase (hard-delete for append-only activity log tables).
    // Global membership-RLS tables: skip the user_id filter (RLS enforces it).
    const isAppendOnly = conflict.entityType === 'activityLog' || conflict.entityType === 'globalActivityLog';
    if (isAppendOnly) {
      let q = this.client.from(table).delete().eq('id', conflict.entityId);
      if (!isGlobal) q = q.eq('user_id', this.userId);
      await q;
    } else if (conflict.entityType === 'globalProjectPreferences') {
      // No deleted_at column — hard delete by composite key (Finding #7, Phase 2).
      const gpid = (conflict.localData as Record<string, unknown>).globalProjectId as string | undefined;
      if (gpid) {
        await this.client
          .from(table)
          .delete()
          .eq('user_id', this.userId)
          .eq('global_project_id', gpid);
      }
    } else {
      let q = this.client.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', conflict.entityId);
      if (!isGlobal) q = q.eq('user_id', this.userId);
      await q;
    }

    // Delete from local IndexedDB silently
    await bulkDeleteSilent(conflict.entityType, [conflict.entityId]);

    await deleteSyncConflict(conflictId);
    await this.reportConflictCount();
    console.info(`${LOG_PREFIX} Conflict resolved (delete both): ${conflictId}`);
  }

  // ─── Realtime: global_* tables ────────────────────────────────────────────

  /**
   * Subscribe to Postgres realtime changes on every `global_*` table the user
   * is a member of (or, for global_projects + global_project_preferences,
   * filter by the user's identity). On every change we mirror the row into
   * IndexedDB silently and emit `onPullComplete()` so the UI hooks refresh.
   *
   * Consolidates all 19 global entity types into TWO channels (one for the
   * "project-level" tables, one for child tables) to stay well under the
   * default Supabase Realtime per-connection channel cap and to amortise
   * heartbeats.
   *
   * Idempotent: calling twice tears down the previous subscriptions first.
   * Returns a cleanup function that unsubscribes everything.
   *
   * Pass `force=true` to bypass the membership cache — required when a
   * membership has *just* changed (e.g. invite accepted) so the new project's
   * id is included in the realtime `id=in.(…)` / `global_project_id=in.(…)`
   * filters immediately, rather than after the 30s cache TTL expires.
   */
  async subscribeToGlobalRealtime(force = false): Promise<() => void> {
    // Tear down any prior subscriptions before re-subscribing.
    this.unsubscribeFromGlobalRealtime();

    const memberProjectIds = await fetchMyGlobalProjectIds(this.client, this.userId, force);
    // If the user belongs to no global projects, the IN filters would be
    // empty (Postgres rejects `IN ()`). Subscribe only to the per-user
    // preferences table in that case; the child-tables channel is skipped.
    const hasMemberships = memberProjectIds.length > 0;
    const idList = memberProjectIds.join(',');

    // Channel 1 — project-level tables (global_projects + preferences).
    const projectChannel = this.client.channel(`bau-sync-global-projects-${this.userId}`);

    if (hasMemberships) {
      projectChannel.on(
        'postgres_changes' as never,
        {
          event: '*',
          schema: 'public',
          table: 'global_projects',
          filter: `id=in.(${idList})`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          this.handleRealtimeChange('globalProjects', payload).catch((e) =>
            console.warn(`${LOG_PREFIX} realtime apply failed (globalProjects):`, e),
          );
        },
      );
    }

    projectChannel.on(
      'postgres_changes' as never,
      {
        event: '*',
        schema: 'public',
        table: 'global_project_preferences',
        filter: `user_id=eq.${this.userId}`,
      },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        this.handleRealtimeChange('globalProjectPreferences', payload).catch((e) =>
          console.warn(`${LOG_PREFIX} realtime apply failed (globalProjectPreferences):`, e),
        );
      },
    );

    projectChannel.subscribe();
    this.globalRealtimeChannels.push(projectChannel);

    // Channel 2 — global child tables. Skip if user has no memberships.
    if (hasMemberships) {
      const childChannel = this.client.channel(`bau-sync-global-children-${this.userId}`);
      // Subscribe to every global child entity type that filters by
      // global_project_id (i.e. everything in REQUIRES_GLOBAL_PROJECT_ID
      // except globalActivityLog handles the same filter).
      for (const entityType of GLOBAL_ENTITY_TYPES) {
        if (entityType === 'globalProjects' || entityType === 'globalProjectPreferences') continue;
        const tableName = entityTypeToTable[entityType];
        childChannel.on(
          'postgres_changes' as never,
          {
            event: '*',
            schema: 'public',
            table: tableName,
            filter: `global_project_id=in.(${idList})`,
          },
          (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            this.handleRealtimeChange(entityType, payload).catch((e) =>
              console.warn(`${LOG_PREFIX} realtime apply failed (${entityType}):`, e),
            );
          },
        );
      }
      childChannel.subscribe();
      this.globalRealtimeChannels.push(childChannel);
    }

    console.info(
      `${LOG_PREFIX} Global realtime: subscribed across ${this.globalRealtimeChannels.length} channel(s) for ${memberProjectIds.length} project membership(s)`,
    );

    return () => this.unsubscribeFromGlobalRealtime();
  }

  /** Tear down all active global realtime channels. */
  unsubscribeFromGlobalRealtime(): void {
    if (this.globalRealtimeChannels.length === 0) return;
    for (const channel of this.globalRealtimeChannels) {
      try {
        this.client.removeChannel(channel);
      } catch (e) {
        console.warn(`${LOG_PREFIX} Failed to remove realtime channel:`, e);
      }
    }
    this.globalRealtimeChannels = [];
  }

  /**
   * Apply a single realtime change event to the IndexedDB mirror.
   * INSERT/UPDATE → bulkPutSilent. DELETE → bulkDeleteSilent.
   * After every change we fire onPullComplete so hooks re-read.
   */
  private async handleRealtimeChange(
    entityType: SyncEntityType,
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ): Promise<void> {
    const event = payload.eventType;

    if (event === 'DELETE') {
      // Realtime DELETE payload.old contains the deleted row's PK columns.
      const oldRow = (payload.old ?? {}) as Record<string, unknown>;
      if (entityType === 'globalProjects') {
        // Parent deleted — cascade to all IndexedDB child stores so orphans
        // don't keep pushing against RLS.
        const id = oldRow.id as string | undefined;
        if (id) {
          await cascadeDeleteGlobalProject(id).catch((e) =>
            console.warn(`${LOG_PREFIX} realtime cascade (globalProjects/${id}) failed:`, e),
          );
        }
      } else if (entityType === 'globalProjectPreferences') {
        const uid = oldRow.user_id as string | undefined;
        const gpid = oldRow.global_project_id as string | undefined;
        if (uid && gpid) {
          await bulkDeleteSilent('globalProjectPreferences', [`${uid}|${gpid}`]);
        }
      } else {
        const id = oldRow.id as string | undefined;
        if (id) await bulkDeleteSilent(entityType, [id]);
      }
      emitPullComplete();
      return;
    }

    // INSERT or UPDATE — payload.new is the post-change row.
    const newRow = (payload.new ?? {}) as Record<string, unknown>;
    if (!newRow || Object.keys(newRow).length === 0) return;

    // Soft-deleted rows reach the realtime stream as UPDATE events. Mirror the
    // pullSync behaviour: treat them as local deletes.
    if (isDeletedRow(newRow)) {
      if (entityType === 'globalProjects') {
        // Parent soft-deleted — cascade to all IndexedDB child stores.
        const id = newRow.id as string | undefined;
        if (id) {
          await cascadeDeleteGlobalProject(id).catch((e) =>
            console.warn(`${LOG_PREFIX} realtime soft-delete cascade (globalProjects/${id}) failed:`, e),
          );
        }
      } else if (entityType === 'globalProjectPreferences') {
        const uid = newRow.user_id as string | undefined;
        const gpid = newRow.global_project_id as string | undefined;
        if (uid && gpid) {
          await bulkDeleteSilent('globalProjectPreferences', [`${uid}|${gpid}`]);
        }
      } else {
        const id = newRow.id as string | undefined;
        if (id) await bulkDeleteSilent(entityType, [id]);
      }
      emitPullComplete();
      return;
    }

    // ── Dirty-row overwrite guard (Finding #4, Phase 1c) ──────────────────
    // Mirror the pull loop: a realtime INSERT/UPDATE must not clobber a local
    // row the user edited offline but hasn't pushed yet. If this (entityType,
    // id) has an un-pushed queue item, skip the overwrite and keep the local
    // edit (it will push + conflict-resolve on the push path).
    //   • Append-only logs have no user edits — never dirty.
    //   • globalProjectPreferences keys on a composite prefKey, not a plain id;
    //     its queue items key on the row id, so the lookup wouldn't match — and
    //     it's per-user state with no offline-edit-clobber concern. Skip the
    //     check for it.
    const rtId = newRow.id as string | undefined;
    const dirtyGuarded =
      entityType !== 'globalActivityLog'
      && entityType !== 'globalProjectPreferences'
      && typeof rtId === 'string';
    if (dirtyGuarded && rtId) {
      const dirty = await hasUnpushedSyncItem(entityType, rtId).catch(() => false);
      if (dirty) {
        console.info(
          `${LOG_PREFIX} realtime: kept locally-edited ${entityType}/${rtId} ` +
          `(un-pushed changes pending) — skipped remote overwrite`,
        );
        return;
      }
    }

    const entity = fromSupabaseRow(entityType, newRow);
    // Same deletedAt asymmetry fix the pull loop applies — skip for
    // globalActivityLog (no deleted_at column on the append-only table).
    if (entityType !== 'globalActivityLog') {
      entity.deletedAt = null;
    }
    if (entityType === 'globalProjectPreferences') {
      const uid = entity.userId as string | undefined;
      const gpid = entity.globalProjectId as string | undefined;
      if (uid && gpid) entity.prefKey = `${uid}|${gpid}`;
    }
    await bulkPutSilent(entityType, [entity]);
    emitPullComplete();
  }

  private async reportStatus(): Promise<void> {
    try {
      const counts = await getSyncQueueCount();
      const total = counts.pending + counts.failed;
      this.onStatusChange?.(
        counts.failed > 0 ? 'error' : total > 0 ? 'syncing' : 'idle',
        total,
      );
    } catch {
      // Ignore errors in status reporting
    }
  }
}
