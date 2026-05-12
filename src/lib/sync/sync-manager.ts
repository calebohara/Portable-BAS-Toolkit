import type { SupabaseClient, RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { SyncEntityType, SyncQueueItem, SyncConflict } from '@/types';
import {
  addSyncItem, getPendingSyncItems, updateSyncItem, deleteSyncItem,
  getSyncQueueCount, getAllFromStore, clearSyncQueue,
  bulkPutSilent, bulkDeleteSilent,
  addSyncConflict, getSyncConflictCount, deleteSyncConflict, getAllSyncConflicts,
} from '@/lib/db';
import {
  entityTypeToTable, toSupabaseRow, validateSyncable, SYNC_ORDER,
  fromSupabaseRow, isDeletedRow, REQUIRES_PROJECT_ID,
  isGlobalEntity, GLOBAL_ENTITY_TYPES, REQUIRES_GLOBAL_PROJECT_ID,
} from './field-map';
import { emitPullComplete, type SyncManagerInterface } from './sync-bridge';

const MAX_RETRIES = 5;
const PROCESS_INTERVAL_MS = 5000;
const BATCH_SIZE = 20;
const LOG_PREFIX = '[sync]';
const MEMBERSHIP_CACHE_TTL_MS = 30_000;

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

  private async reportConflictCount(): Promise<void> {
    try {
      const count = await getSyncConflictCount();
      this.onConflictCountChange?.(count);
    } catch {
      // Ignore
    }
  }

  start(): void {
    if (this.intervalId) return;
    console.info(`${LOG_PREFIX} Manager started (user=${this.userId.substring(0, 8)}…)`);
    this.intervalId = setInterval(() => this.processQueue(), PROCESS_INTERVAL_MS);
    // Immediate first run
    this.processQueue();
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
    await addSyncItem(item);
    this.reportStatus();
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
          // Composite PK (user_id, global_project_id). Delete row by composite
          // key — `id` doesn't exist on this table. Payload carries the parts.
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
            .update({ deleted_at: new Date().toISOString() })
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
              if (remoteUpdatedAt && new Date(remoteUpdatedAt) > new Date(localUpdatedAt)) {
                // Conflict: remote is newer — store conflict, remove from queue
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
                  remoteUpdatedAt,
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

        const { error } = await this.client
          .from(table)
          .upsert(row, { onConflict });

        if (error) throw error;
      }

      // Success — remove from queue
      await deleteSyncItem(item.id);
      return true;
    } catch (err: unknown) {
      // Supabase PostgREST errors are plain objects with { message, code, details, hint }
      const errorMsg = err instanceof Error
        ? err.message
        : (err && typeof err === 'object' && 'message' in err)
          ? String((err as { message: string }).message)
          : JSON.stringify(err);

      // Detect "relation does not exist" — table missing from Supabase.
      // Mark this entity type as broken to prevent retry storms that freeze the UI.
      const errorCode = (err && typeof err === 'object' && 'code' in err)
        ? String((err as { code: string }).code) : '';
      if (errorCode === '42P01' || errorMsg.includes('relation') && errorMsg.includes('does not exist')) {
        console.error(
          `${LOG_PREFIX} Table missing for "${item.entityType}" — disabling sync for this entity type this session`,
        );
        this.brokenEntityTypes.add(item.entityType);
        await deleteSyncItem(item.id);
        return true; // Don't retry — table doesn't exist
      }

      const newRetryCount = item.retriedCount + 1;

      console.warn(
        `${LOG_PREFIX} Failed to sync ${item.entityType}/${item.entityId} (attempt ${newRetryCount}/${MAX_RETRIES}):`,
        errorMsg,
      );

      if (newRetryCount >= MAX_RETRIES) {
        await updateSyncItem({
          ...item,
          status: 'failed',
          retriedCount: newRetryCount,
          lastError: errorMsg,
        });
        console.error(
          `${LOG_PREFIX} Permanently failed: ${item.entityType}/${item.entityId} — ${errorMsg}`,
        );
      } else {
        await updateSyncItem({
          ...item,
          status: 'pending',
          retriedCount: newRetryCount,
          lastError: errorMsg,
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

    // Step 1: Clear the entire queue to prevent duplicates.
    // This is safe because fullSync re-enqueues everything that needs syncing.
    const cleared = await clearSyncQueue();
    if (cleared > 0) {
      console.info(`${LOG_PREFIX} Cleared ${cleared} stale queue item(s)`);
    }

    let totalEnqueued = 0;
    let totalSkipped = 0;
    const errors: string[] = [];

    for (const entityType of SYNC_ORDER) {
      try {
        const items = await getAllFromStore(entityType) as Record<string, unknown>[];
        let storeEnqueued = 0;
        let storeSkipped = 0;

        for (const item of items) {
          // validateSyncable checks ID format, projectId FK, etc.
          const reason = validateSyncable(entityType, item);
          if (reason) {
            storeSkipped++;
            continue;
          }
          await this.enqueue('update', entityType, item.id as string, item);
          storeEnqueued++;
        }

        totalEnqueued += storeEnqueued;
        totalSkipped += storeSkipped;

        if (storeEnqueued > 0) {
          console.info(`${LOG_PREFIX} ${entityType}: ${storeEnqueued} enqueued, ${storeSkipped} skipped`);
        } else if (items.length > 0) {
          console.info(`${LOG_PREFIX} ${entityType}: all ${items.length} skipped (demo/invalid data)`);
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

    // Undelete all user's soft-deleted rows across all tables (except activityLog which has no deleted_at)
    const tablesWithDeletedAt = SYNC_ORDER.filter((t) => t !== 'activityLog');
    for (const entityType of tablesWithDeletedAt) {
      try {
        const table = entityTypeToTable[entityType];
        const { data, error } = await this.client
          .from(table)
          .update({ deleted_at: null })
          .eq('user_id', this.userId)
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

    for (const entityType of SYNC_ORDER) {
      // Skip entity types whose tables are missing from Supabase
      if (this.brokenEntityTypes.has(entityType)) continue;

      try {
        const table = entityTypeToTable[entityType];
        const isGlobal = isGlobalEntity(entityType);
        const isAppendOnlyLog = entityType === 'activityLog' || entityType === 'globalActivityLog';

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

          // Apply deleted_at filter consistently (skip for append-only logs
          // which don't have a deleted_at column).
          if (!isAppendOnlyLog) {
            query = query.is('deleted_at', null);
          }

          // Incremental: only fetch rows updated since last pull
          if (lastPulledAt) {
            const timestampCol = isAppendOnlyLog ? 'timestamp' : 'updated_at';
            query = query.gte(timestampCol, lastPulledAt);
          }

          const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;

          allRows = allRows.concat(data as Record<string, unknown>[]);
          if (data.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
        }

        if (allRows.length === 0) continue;

        // Separate live rows from soft-deleted and orphaned rows.
        // We already filtered out deleted_at in the query, but a row that was
        // soft-deleted between the membership fetch and the query could
        // theoretically slip through — keep the isDeletedRow() guard as a
        // belt-and-braces check.
        const toUpsert: Record<string, unknown>[] = [];
        const toDeleteIds: string[] = [];
        let orphanCount = 0;

        for (const row of allRows) {
          if (!isAppendOnlyLog && isDeletedRow(row)) {
            // Soft-deleted: schedule for local removal.
            // globalProjectPreferences uses the synthetic prefKey instead of id.
            if (entityType === 'globalProjectPreferences') {
              const uid = row.user_id as string | undefined;
              const gpid = row.global_project_id as string | undefined;
              if (uid && gpid) toDeleteIds.push(`${uid}|${gpid}`);
            } else {
              toDeleteIds.push(row.id as string);
            }
          } else if (!isGlobal && entityType !== 'projects' && REQUIRES_PROJECT_ID.has(entityType) && !row.project_id) {
            // Orphaned local row: requires project_id but has none
            orphanCount++;
          } else if (isGlobal && REQUIRES_GLOBAL_PROJECT_ID.has(entityType) && !row.global_project_id) {
            // Orphaned global child: requires global_project_id but has none
            orphanCount++;
          } else {
            const entity = fromSupabaseRow(entityType, row);
            // Wave 1 TS interfaces expose `deletedAt: string | null` on every
            // global entity, but fromSupabaseRow strips `deleted_at` from every
            // row. Since the query already filters out tombstoned rows, the
            // live rows that reach here always have deletedAt = null.
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
            }
            toUpsert.push(entity);
          }
        }

        if (orphanCount > 0) {
          const fkLabel = isGlobal ? 'global_project_id' : 'project_id';
          console.info(`${LOG_PREFIX} ${entityType}: skipped ${orphanCount} orphaned row(s) with null ${fkLabel}`);
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
      } catch (err) {
        const msg = err instanceof Error ? err.message
          : (err && typeof err === 'object' && 'message' in err)
            ? String((err as { message: string }).message)
            : String(err);
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

        // Delete all child records referencing these projects (order: children before parents)
        const childTables = SYNC_ORDER.filter((t) => t !== 'projects' && t !== 'commandSnippets' && t !== 'bugReports');
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
      const gpid = (conflict.localData as Record<string, unknown>).globalProjectId as string | undefined;
      if (gpid) {
        await this.client
          .from(table)
          .update({ deleted_at: new Date().toISOString() })
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
   */
  async subscribeToGlobalRealtime(): Promise<() => void> {
    // Tear down any prior subscriptions before re-subscribing.
    this.unsubscribeFromGlobalRealtime();

    const memberProjectIds = await fetchMyGlobalProjectIds(this.client, this.userId);
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
      if (entityType === 'globalProjectPreferences') {
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
      if (entityType === 'globalProjectPreferences') {
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
