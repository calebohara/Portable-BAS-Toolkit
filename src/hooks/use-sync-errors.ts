'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SyncError } from '@/types';
import {
  getAllSyncErrors,
  clearSyncErrors,
  deleteSyncError,
} from '@/lib/db';

export interface UseSyncErrorsResult {
  errors: SyncError[];
  loading: boolean;
  refresh: () => Promise<void>;
  clearAll: () => Promise<void>;
  removeOne: (id: string) => Promise<void>;
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

  const removeOne = useCallback(async (id: string) => {
    try {
      await deleteSyncError(id);
      await refresh();
    } catch (e) {
      console.error('Failed to delete sync error:', e);
      throw e;
    }
  }, [refresh]);

  return { errors, loading, refresh, clearAll, removeOne };
}
