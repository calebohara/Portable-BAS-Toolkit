import type { SyncEntityType } from '@/types';

export interface SyncManagerInterface {
  enqueue(action: 'create' | 'update' | 'delete', entityType: SyncEntityType, entityId: string, payload: unknown): Promise<void>;
}

let syncManager: SyncManagerInterface | null = null;

export function registerSyncManager(manager: SyncManagerInterface): void {
  syncManager = manager;
}

export function unregisterSyncManager(): void {
  syncManager = null;
}

/**
 * Fire-and-forget sync notification. Called after every local db write.
 * Does nothing if sync is not active (no manager registered).
 */
export function notifySync(
  action: 'create' | 'update' | 'delete',
  entityType: SyncEntityType,
  entityId: string,
  payload: unknown,
): void {
  if (!syncManager) return;
  // Fire and forget — never block the caller
  syncManager.enqueue(action, entityType, entityId, payload).catch(() => {});
}
