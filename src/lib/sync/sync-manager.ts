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
    this.intervalId = setInterval(() => this.processQueue(), PROCESS_INTERVAL_MS);
    // Immediate first run
    this.processQueue();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
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

      this.onStatusChange?.('syncing', items.length);

      // Sort: projects first to satisfy FK constraints
      items.sort((a, b) => {
        const orderA = SYNC_ORDER.indexOf(a.entityType);
        const orderB = SYNC_ORDER.indexOf(b.entityType);
        return orderA - orderB;
      });

      for (const item of items) {
        await this.processItem(item);
      }

      this.reportStatus();
    } catch {
      this.onStatusChange?.('error', 0);
    } finally {
      this.processing = false;
    }
  }

  private async processItem(item: SyncQueueItem): Promise<void> {
    // Mark as syncing
    await updateSyncItem({ ...item, status: 'syncing' });

    try {
      const table = entityTypeToTable[item.entityType];

      if (item.action === 'delete') {
        // Use soft delete for tables that have deleted_at, hard delete for activity_log
        if (item.entityType === 'activityLog') {
          await this.client
            .from(table)
            .delete()
            .eq('id', item.entityId)
            .eq('user_id', this.userId);
        } else {
          await this.client
            .from(table)
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', item.entityId)
            .eq('user_id', this.userId);
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
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const newRetryCount = item.retriedCount + 1;

      if (newRetryCount >= MAX_RETRIES) {
        await updateSyncItem({
          ...item,
          status: 'failed',
          retriedCount: newRetryCount,
          lastError: errorMsg,
        });
      } else {
        await updateSyncItem({
          ...item,
          status: 'pending',
          retriedCount: newRetryCount,
          lastError: errorMsg,
        });
      }
    }
  }

  async fullSync(): Promise<void> {
    for (const entityType of SYNC_ORDER) {
      try {
        const items = await getAllFromStore(entityType) as Record<string, unknown>[];
        for (const item of items) {
          await this.enqueue('update', entityType, item.id as string, item);
        }
      } catch {
        // Skip stores that fail to read
      }
    }
    // Kick off processing immediately
    this.processQueue();
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
