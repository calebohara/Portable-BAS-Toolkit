import type { SupabaseClient } from '@supabase/supabase-js';
import type { SyncEntityType, SyncQueueItem, SyncConflict } from '@/types';
import {
  addSyncItem, getPendingSyncItems, updateSyncItem, deleteSyncItem,
  getSyncQueueCount, getAllFromStore, clearSyncQueue,
  bulkPutSilent, bulkDeleteSilent,
  addSyncConflict, getSyncConflictCount, deleteSyncConflict, getAllSyncConflicts,
} from '@/lib/db';
import { entityTypeToTable, toSupabaseRow, validateSyncable, SYNC_ORDER, fromSupabaseRow, isDeletedRow, REQUIRES_PROJECT_ID } from './field-map';
import type { SyncManagerInterface } from './sync-bridge';

const MAX_RETRIES = 5;
const PROCESS_INTERVAL_MS = 5000;
const BATCH_SIZE = 20;
const LOG_PREFIX = '[sync]';

type StatusCallback = (status: 'idle' | 'syncing' | 'error', pendingCount: number) => void;
type ConflictCallback = (count: number) => void;

export class SyncManager implements SyncManagerInterface {
  private client: SupabaseClient;
  private userId: string;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private onStatusChange: StatusCallback | null = null;
  private onConflictCountChange: ConflictCallback | null = null;
  // Entity types whose Supabase tables don't exist — skip sync for these
  // to prevent retry storms that freeze the UI
  private brokenEntityTypes = new Set<string>();

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
    if (this.processing) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    this.processing = true;
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
    } finally {
      this.processing = false;
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

      if (item.action === 'delete') {
        // Use soft delete for tables that have deleted_at, hard delete for activity_log
        if (item.entityType === 'activityLog') {
          const { error } = await this.client
            .from(table)
            .delete()
            .eq('id', item.entityId)
            .eq('user_id', this.userId);
          if (error) throw error;
        } else {
          const { error } = await this.client
            .from(table)
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', item.entityId)
            .eq('user_id', this.userId);
          if (error) throw error;
        }
      } else {
        // create or update → upsert with conflict detection
        const row = toSupabaseRow(
          item.entityType,
          item.payload as Record<string, unknown>,
          this.userId,
        );

        // Conflict detection: for updates, check if remote is newer
        if (item.action === 'update') {
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

        const { error } = await this.client
          .from(table)
          .upsert(row, { onConflict: 'id' });

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

    for (const entityType of SYNC_ORDER) {
      // Skip entity types whose tables are missing from Supabase
      if (this.brokenEntityTypes.has(entityType)) continue;

      try {
        const table = entityTypeToTable[entityType];
        const isActivityLog = entityType === 'activityLog';

        // Fetch all pages
        let allRows: Record<string, unknown>[] = [];
        let offset = 0;

        while (true) {
          let query = this.client
            .from(table)
            .select('*')
            .eq('user_id', this.userId);

          // Incremental: only fetch rows updated since last pull
          if (lastPulledAt && entityType !== 'terminalLogs') {
            const timestampCol =
              entityType === 'activityLog' ? 'timestamp' :
              'updated_at';
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

        // Separate live rows from soft-deleted and orphaned rows
        const toUpsert: Record<string, unknown>[] = [];
        const toDeleteIds: string[] = [];
        let orphanCount = 0;

        for (const row of allRows) {
          if (!isActivityLog && isDeletedRow(row)) {
            toDeleteIds.push(row.id as string);
          } else if (entityType !== 'projects' && REQUIRES_PROJECT_ID.has(entityType) && !row.project_id) {
            // Orphaned row: requires project_id but has none — skip it (old demo data / orphaned child)
            orphanCount++;
          } else {
            toUpsert.push(fromSupabaseRow(entityType, row));
          }
        }

        if (orphanCount > 0) {
          console.info(`${LOG_PREFIX} ${entityType}: skipped ${orphanCount} orphaned row(s) with null project_id`);
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
            await deleteSyncItem(`${storeName}-${id}`).catch(() => {});
          }
        }
      } catch {
        // Store may not exist or be empty — ignore
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
    const row = toSupabaseRow(conflict.entityType, conflict.localData, this.userId);

    const { error } = await this.client.from(table).upsert(row, { onConflict: 'id' });
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

    // Soft-delete in Supabase (or hard-delete for activityLog)
    if (conflict.entityType === 'activityLog') {
      await this.client
        .from(table)
        .delete()
        .eq('id', conflict.entityId)
        .eq('user_id', this.userId);
    } else {
      await this.client
        .from(table)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', conflict.entityId)
        .eq('user_id', this.userId);
    }

    // Delete from local IndexedDB silently
    await bulkDeleteSilent(conflict.entityType, [conflict.entityId]);

    await deleteSyncConflict(conflictId);
    await this.reportConflictCount();
    console.info(`${LOG_PREFIX} Conflict resolved (delete both): ${conflictId}`);
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
