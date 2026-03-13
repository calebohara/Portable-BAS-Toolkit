import type { SupabaseClient } from '@supabase/supabase-js';
import type { SyncEntityType, SyncQueueItem } from '@/types';
import {
  addSyncItem, getPendingSyncItems, updateSyncItem, deleteSyncItem,
  getSyncQueueCount, getAllFromStore,
} from '@/lib/db';
import { entityTypeToTable, toSupabaseRow, SYNC_ORDER } from './field-map';
import type { SyncManagerInterface } from './sync-bridge';

const MAX_RETRIES = 5;
const PROCESS_INTERVAL_MS = 5000;
const BATCH_SIZE = 20;
const LOG_PREFIX = '[sync]';

// UUID v4 regex — Supabase uuid columns reject non-UUID strings
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  async enqueue(
    action: 'create' | 'update' | 'delete',
    entityType: SyncEntityType,
    entityId: string,
    payload: unknown,
  ): Promise<void> {
    const item: SyncQueueItem = {
      id: `${entityType}-${entityId}-${Date.now()}`,
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

  async fullSync(): Promise<{ enqueued: number; errors: string[] }> {
    console.info(`${LOG_PREFIX} Full sync started — reading all stores…`);
    let totalEnqueued = 0;
    const errors: string[] = [];

    for (const entityType of SYNC_ORDER) {
      try {
        const prevTotal = totalEnqueued;
        const items = await getAllFromStore(entityType) as Record<string, unknown>[];
        for (const item of items) {
          const id = item.id as string | undefined;
          if (!id) {
            console.warn(`${LOG_PREFIX} Skipping ${entityType} item with missing id`);
            continue;
          }
          // Skip demo/seed data with non-UUID IDs (Supabase uuid columns reject them)
          if (!UUID_RE.test(id)) {
            continue;
          }
          // Skip items whose projectId is a non-UUID demo reference
          // (tables like ip_plan, activity_log have NOT NULL project_id FK)
          const projectId = item.projectId as string | undefined;
          if (projectId && !UUID_RE.test(projectId)) {
            continue;
          }
          await this.enqueue('update', entityType, id, item);
          totalEnqueued++;
        }
        const storeEnqueued = totalEnqueued - prevTotal;
        if (storeEnqueued > 0) {
          console.info(`${LOG_PREFIX} Enqueued ${storeEnqueued} ${entityType} item(s) (${items.length - storeEnqueued} skipped)`);
        } else if (items.length > 0) {
          console.info(`${LOG_PREFIX} Skipped all ${items.length} ${entityType} item(s) (demo data)`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`${LOG_PREFIX} Failed to read store "${entityType}":`, msg);
        errors.push(`${entityType}: ${msg}`);
      }
    }

    console.info(`${LOG_PREFIX} Full sync: ${totalEnqueued} total items enqueued`);
    // Kick off processing immediately (don't await — runs in background)
    this.processQueue();
    return { enqueued: totalEnqueued, errors };
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
