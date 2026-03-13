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
  syncManager.enqueue(action, entityType, entityId, payload).catch((e) => {
    console.warn('[sync] Failed to enqueue:', entityType, entityId, e);
  });
}

// ── Pull sync event ──────────────────────────────────────────────

const PULL_COMPLETE_EVENT = 'bau-suite:pull-complete';

/** Emit after pull sync writes data to IndexedDB, so React hooks re-read. */
export function emitPullComplete(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PULL_COMPLETE_EVENT));
  }
}

/** Subscribe to pull-complete events. Returns an unsubscribe function. */
export function onPullComplete(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(PULL_COMPLETE_EVENT, cb);
  return () => window.removeEventListener(PULL_COMPLETE_EVENT, cb);
}
