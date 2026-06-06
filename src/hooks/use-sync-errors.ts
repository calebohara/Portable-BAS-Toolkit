'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SyncError } from '@/types';
import {
  getAllSyncErrors,
  clearSyncErrors,
  deleteSyncError,
  deleteSyncItem,
  bulkDeleteSilent,
  isBasToolkitStoreName,
} from '@/lib/db';

export interface UseSyncErrorsResult {
  errors: SyncError[];
  loading: boolean;
  refresh: () => Promise<void>;
  clearAll: () => Promise<void>;
  /**
   * Delete the captured SyncError record AND the underlying syncQueue item
   * (if any). After this, the SyncManager won't retry the failing entity
   * again — the local IndexedDB row is preserved.
   */
  removeOne: (error: SyncError) => Promise<void>;
  /**
   * Same as removeOne plus deletes the underlying IndexedDB entity row,
   * so this entity is fully forgotten locally. Use for stale orphans the
   * server will never accept (e.g. an RLS rejection after membership was
   * revoked). No-op for pull-side errors (entityId === '*') since they
   * don't correspond to a specific row.
   */
  forgetRow: (error: SyncError) => Promise<void>;
}

const PULL_SENTINEL = '*';

function syncQueueIdFor(error: SyncError): string {
  // Mirrors SyncManager.enqueue: deterministic queue key per (entityType, entityId).
  return `${error.entityType}-${error.entityId}`;
}

async function deleteUnderlyingQueueItem(error: SyncError): Promise<void> {
  if (error.entityId === PULL_SENTINEL) return;
  try {
    await deleteSyncItem(syncQueueIdFor(error));
  } catch (e) {
    console.warn('Failed to delete underlying sync queue item:', e);
  }
}

async function deleteUnderlyingEntityRow(error: SyncError): Promise<void> {
  if (error.entityId === PULL_SENTINEL) return;
  // SyncEntityType values overlap IndexedDB store names today, but a future
  // pull-only entity could diverge — guard at runtime instead of double-casting
  // so a divergent entityType becomes a no-op rather than a bad-store crash.
  const storeName = error.entityType;
  if (!isBasToolkitStoreName(storeName)) {
    console.warn(`No IndexedDB store for entityType "${storeName}" — skipping local row delete.`);
    return;
  }
  try {
    await bulkDeleteSilent(storeName, [error.entityId]);
  } catch (e) {
    console.warn(`Failed to delete entity row ${storeName}/${error.entityId}:`, e);
  }
}

export function useSyncErrors(): UseSyncErrorsResult {
  const [errors, setErrors] = useState<SyncError[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = await getAllSyncErrors();
      setErrors(all);
    } catch (e) {
      console.error('Failed to load sync errors:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    const handler = () => { refresh(); };
    window.addEventListener('bau-suite:sync-error-added', handler);
    return () => {
      window.removeEventListener('bau-suite:sync-error-added', handler);
    };
  }, [refresh]);

  const clearAll = useCallback(async () => {
    try {
      await clearSyncErrors();
      await refresh();
    } catch (e) {
      console.error('Failed to clear sync errors:', e);
      throw e;
    }
  }, [refresh]);

  const removeOne = useCallback(async (error: SyncError) => {
    try {
      await deleteSyncError(error.id);
      await deleteUnderlyingQueueItem(error);
      await refresh();
    } catch (e) {
      console.error('Failed to delete sync error:', e);
      throw e;
    }
  }, [refresh]);

  const forgetRow = useCallback(async (error: SyncError) => {
    try {
      await deleteSyncError(error.id);
      await deleteUnderlyingQueueItem(error);
      await deleteUnderlyingEntityRow(error);
      await refresh();
    } catch (e) {
      console.error('Failed to forget sync error row:', e);
      throw e;
    }
  }, [refresh]);

  return { errors, loading, refresh, clearAll, removeOne, forgetRow };
}
