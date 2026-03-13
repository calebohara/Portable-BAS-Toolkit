'use client';

import { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './auth-provider';
import { useAppStore } from '@/store/app-store';
import { getSupabaseClient } from '@/lib/supabase/client';
import { SyncManager } from '@/lib/sync/sync-manager';
import { registerSyncManager, unregisterSyncManager, emitPullComplete } from '@/lib/sync/sync-bridge';

interface SyncContextValue {
  triggerFullSync: () => Promise<{ enqueued: number; errors: string[] } | null>;
  triggerPullSync: () => Promise<{ pulled: number; deleted: number; errors: string[] } | null>;
}

const SyncContext = createContext<SyncContextValue>({
  triggerFullSync: async () => null,
  triggerPullSync: async () => null,
});

export function useSyncContext() {
  return useContext(SyncContext);
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { mode, user } = useAuth();
  const managerRef = useRef<SyncManager | null>(null);
  const autoPullFiredRef = useRef(false);
  const setSyncStatus = useAppStore((s) => s.setSyncStatus);
  const setPendingSyncCount = useAppStore((s) => s.setPendingSyncCount);
  const setLastSyncedAt = useAppStore((s) => s.setLastSyncedAt);
  const setLastPulledAt = useAppStore((s) => s.setLastPulledAt);

  // Stabilise identity: only re-run when the user ID actually changes
  const userId = user?.id ?? null;

  useEffect(() => {
    if (mode !== 'authenticated' || !userId) {
      // Not authenticated — tear down and disable
      if (managerRef.current) {
        managerRef.current.stop();
        unregisterSyncManager();
        managerRef.current = null;
      }
      autoPullFiredRef.current = false;
      setSyncStatus('disabled');
      setPendingSyncCount(0);
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setSyncStatus('disabled');
      return;
    }

    // Create and start manager
    const manager = new SyncManager(client, userId);
    manager.setStatusCallback((status, pendingCount) => {
      if (status === 'idle' && pendingCount === 0) {
        setLastSyncedAt(new Date().toISOString());
      }
      setSyncStatus(
        !navigator.onLine ? 'offline' :
        status === 'error' ? 'error' :
        status === 'syncing' ? 'syncing' : 'idle'
      );
      setPendingSyncCount(pendingCount);
    });

    managerRef.current = manager;
    registerSyncManager(manager);
    manager.start();
    setSyncStatus('idle');

    // Flush queue on reconnect
    const handleOnline = () => manager.processQueue();
    window.addEventListener('online', handleOnline);

    // Auto-pull on first login (new device scenario) — only once per session
    const storedLastPulledAt = useAppStore.getState().lastPulledAt;
    if (!storedLastPulledAt && !autoPullFiredRef.current) {
      autoPullFiredRef.current = true;
      console.info('[sync] First login — auto-pulling all data from cloud…');
      manager.pullSync(null).then((result) => {
        if (result.errors.length === 0) {
          useAppStore.getState().setLastPulledAt(result.newPulledAt);
        }
        emitPullComplete();
        console.info(`[sync] Auto-pull complete: ${result.pulled} pulled, ${result.deleted} deleted`);
      }).catch((err) => {
        console.error('[sync] Auto-pull failed:', err);
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      manager.stop();
      unregisterSyncManager();
      managerRef.current = null;
    };
  }, [mode, userId, setSyncStatus, setPendingSyncCount, setLastSyncedAt, setLastPulledAt]);

  const triggerFullSync = useCallback(async () => {
    if (managerRef.current) {
      return managerRef.current.fullSync();
    }
    return null;
  }, []);

  const triggerPullSync = useCallback(async () => {
    if (!managerRef.current) return null;
    const lastPulledAt = useAppStore.getState().lastPulledAt;
    const result = await managerRef.current.pullSync(lastPulledAt);
    if (result.errors.length === 0) {
      useAppStore.getState().setLastPulledAt(result.newPulledAt);
    }
    emitPullComplete();
    return result;
  }, []);

  return (
    <SyncContext.Provider value={{ triggerFullSync, triggerPullSync }}>
      {children}
    </SyncContext.Provider>
  );
}
