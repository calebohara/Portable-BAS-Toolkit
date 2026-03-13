import type { SupabaseClient } from '@supabase/supabase-js';
import type { SyncEntityType, SyncQueueItem } from '@/types';
import {
  addSyncItem, getPendingSyncItems, updateSyncItem, deleteSyncItem,
  getSyncQueueCount, getAllFromStore, clearSyncQueue,
  bulkPutSilent, bulkDeleteSilent,
} from '@/lib/db';
import { entityTypeToTable, toSupabaseRow, validateSyncable, SYNC_ORDER, fromSupabaseRow, isDeletedRow, REQUIRES_PROJECT_ID } from './field-map';
import type { SyncManagerInterface } from './sync-bridge';

const MAX_RETRIES = 5;
const PROCESS_INTERVAL_MS = 5000;
const BATCH_SIZE = 20;
const LOG_PREFIX = '[sync]';

type StatusCallback = (status: 'idle' | 'syncing' | 'error', pendingCount: number) => void;

export class SyncManager implements SyncManagerInterface {
  private client: SupabaseClient;
  private userId: string;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private processing = false;
  private onStatusChange: StatusCallback | null = null;

  constructor(client: SupabaseClient, userId: string) {
    this.client = client;
    this.userId = userId;
  }

  setStatusCallback(cb: StatusCallback): void {
    this.onStatusChange = cb;
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
        // create or update → upsert
        const row = toSupabaseRow(
          item.entityType,
          item.payload as Record<string, unknown>,
          this.userId,
        );
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
          if (lastPulledAt) {
            if (isActivityLog) {
              // activity_log has no updated_at — use timestamp
              query = query.gte('timestamp', lastPulledAt);
            } else {
              query = query.gte('updated_at', lastPulledAt);
            }
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
          } else if (entityType !== 'projects' && entityType !== 'commandSnippets' && !row.project_id) {
            // Orphaned row: has no project association — skip it (old demo data)
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

    // ── Step 1: Delete rows with null project_id (old demo data) ──
    const nullProjectTables: { entityType: SyncEntityType; table: string }[] = [
      { entityType: 'files', table: entityTypeToTable.files },
      { entityType: 'pingSessions', table: entityTypeToTable.pingSessions },
      { entityType: 'terminalLogs', table: entityTypeToTable.terminalLogs },
      { entityType: 'connectionProfiles', table: entityTypeToTable.connectionProfiles },
      { entityType: 'registerCalculations', table: entityTypeToTable.registerCalculations },
    ];

    for (const { entityType, table } of nullProjectTables) {
      try {
        const { data, error } = await this.client
          .from(table)
          .delete()
          .eq('user_id', this.userId)
          .is('project_id', null)
          .select('id');

        if (error) {
          console.warn(`${LOG_PREFIX} Orphan purge failed for ${entityType}:`, error.message);
          continue;
        }
        const count = data?.length ?? 0;
        if (count > 0) {
          totalDeleted += count;
          console.info(`${LOG_PREFIX} Purged ${count} orphaned ${entityType} row(s) (null project_id)`);
        }
      } catch (err) {
        console.warn(`${LOG_PREFIX} Orphan purge error for ${entityType}:`, err);
      }
    }

    // ── Step 2: Find soft-deleted projects, delete their children first, then the projects ──
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
        const childTables = SYNC_ORDER.filter((t) => t !== 'projects' && t !== 'commandSnippets');
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

    // ── Step 3: Clean up local IndexedDB orphans ──
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

    // Entity types that should always have a valid projectId locally
    const storesToClean: SyncEntityType[] = [
      'files', 'notes', 'devices', 'ipPlan', 'dailyReports',
      'activityLog', 'networkDiagrams', 'pingSessions',
      'terminalLogs', 'connectionProfiles', 'registerCalculations',
    ];

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
