'use client';

import { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './auth-provider';
import { useAppStore } from '@/store/app-store';
import { getSupabaseClient } from '@/lib/supabase/client';
import { SyncManager } from '@/lib/sync/sync-manager';
import { registerSyncManager, unregisterSyncManager, emitPullComplete } from '@/lib/sync/sync-bridge';
import { hasSyncAccess, isInGracePeriod } from '@/lib/paywall';
import { GLOBAL_MEMBERSHIP_CHANGED_EVENT } from '@/hooks/use-global-projects';

interface SyncContextValue {
  triggerFullSync: () => Promise<{ enqueued: number; errors: string[] } | null>;
  triggerPullSync: () => Promise<{ pulled: number; deleted: number; errors: string[] } | null>;
  getConflicts: () => Promise<import('@/types').SyncConflict[]>;
  resolveConflict: (id: string, resolution: 'local' | 'remote' | 'delete') => Promise<void>;
}

const SyncContext = createContext<SyncContextValue>({
  triggerFullSync: async () => null,
  triggerPullSync: async () => null,
  getConflicts: async () => [],
  resolveConflict: async () => {},
});

export function useSyncContext() {
  return useContext(SyncContext);
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { mode, user, profile: authProfile } = useAuth();
  const managerRef = useRef<SyncManager | null>(null);
  const autoPullFiredRef = useRef(false);
  const realtimeCleanupRef = useRef<(() => void) | null>(null);
  const setSyncStatus = useAppStore((s) => s.setSyncStatus);
  const setPendingSyncCount = useAppStore((s) => s.setPendingSyncCount);
  const setLastSyncedAt = useAppStore((s) => s.setLastSyncedAt);
  const setLastPulledAt = useAppStore((s) => s.setLastPulledAt);
  const setSyncConflictCount = useAppStore((s) => s.setSyncConflictCount);

  // Stabilise identity: only re-run when the user ID actually changes
  const userId = user?.id ?? null;

  useEffect(() => {
    if (mode !== 'authenticated' || !userId) {
      // Not authenticated — tear down and disable
      if (managerRef.current) {
        realtimeCleanupRef.current?.();
        realtimeCleanupRef.current = null;
        managerRef.current.stop();
        unregisterSyncManager();
        managerRef.current = null;
      }
      autoPullFiredRef.current = false;
      setSyncStatus('disabled');
      setPendingSyncCount(0);
      return;
    }

    // Paywall gate: when enabled, only Pro/Team users (or grace period) get sync
    if (!hasSyncAccess(authProfile?.subscriptionTier)) {
      if (!isInGracePeriod(authProfile?.subscriptionExpiresAt ?? null)) {
        setSyncStatus('disabled');
        setPendingSyncCount(0);
        return;
      }
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

    manager.setConflictCallback((count) => setSyncConflictCount(count));

    managerRef.current = manager;
    registerSyncManager(manager);
    manager.start();
    setSyncStatus('idle');

    // Subscribe to realtime changes on the user's global_* tables. The
    // returned cleanup function is stored so we can tear down channels on
    // logout/unmount. `subscribeToGlobalRealtime` is idempotent — calling it
    // again (e.g. after a membership change) tears down the prior channel set
    // first.
    manager.subscribeToGlobalRealtime().then((cleanup) => {
      realtimeCleanupRef.current = cleanup;
    }).catch((err) => {
      console.warn('[sync] Failed to subscribe to global realtime:', err);
    });

    // Re-subscribe whenever the user joins or leaves a global project so the
    // 30s membership cache in `api.ts` doesn't keep us subscribed to stale
    // project ids. Idempotent — safe to fire on every event.
    const handleMembershipChanged = () => {
      manager.subscribeToGlobalRealtime().then((cleanup) => {
        realtimeCleanupRef.current = cleanup;
      }).catch((err) => {
        console.warn('[sync] Failed to re-subscribe to global realtime:', err);
      });
    };
    window.addEventListener(GLOBAL_MEMBERSHIP_CHANGED_EVENT, handleMembershipChanged);

    // Report initial conflict count
    manager.getConflictCount().then((count) => setSyncConflictCount(count));

    // On reconnect: pull remote changes first, then flush push queue
    const handleOnline = () => {
      const storedPulledAt = useAppStore.getState().lastPulledAt;
      if (storedPulledAt) {
        console.info('[sync] Back online — pulling remote changes then flushing queue…');
        manager.pullSync(storedPulledAt).then((result) => {
          if (result.errors.length === 0) {
            useAppStore.getState().setLastPulledAt(result.newPulledAt);
          }
          emitPullComplete();
          manager.processQueue();
        }).catch(() => {
          // Pull failed — still try to process queue
          manager.processQueue();
        });
      } else {
        manager.processQueue();
      }
    };
    window.addEventListener('online', handleOnline);

    // Auto-pull on first login (new device scenario) — only once per session
    const storedLastPulledAt = useAppStore.getState().lastPulledAt;
    if (!storedLastPulledAt && !autoPullFiredRef.current) {
      autoPullFiredRef.current = true;
      console.info('[sync] First login — purging orphans then pulling all data from cloud…');
      manager.purgeOrphans().then(() => manager.pullSync(null)).then((result) => {
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
      window.removeEventListener(GLOBAL_MEMBERSHIP_CHANGED_EVENT, handleMembershipChanged);
      // Tear down realtime explicitly first; `manager.stop()` also calls
      // `unsubscribeFromGlobalRealtime` for belt-and-suspenders.
      realtimeCleanupRef.current?.();
      realtimeCleanupRef.current = null;
      manager.unsubscribeFromGlobalRealtime();
      manager.stop();
      unregisterSyncManager();
      managerRef.current = null;
    };
  }, [mode, userId, authProfile?.subscriptionTier, authProfile?.subscriptionExpiresAt, setSyncStatus, setPendingSyncCount, setLastSyncedAt, setLastPulledAt, setSyncConflictCount]);

  const triggerFullSync = useCallback(async () => {
    if (managerRef.current) {
      return managerRef.current.fullSync();
    }
    return null;
  }, []);

  const triggerPullSync = useCallback(async () => {
    if (!managerRef.current) return null;
    // "Restore from Cloud" does a full restore: undeletes soft-deleted rows,
    // then does a complete non-incremental pull to bring everything back.
    const result = await managerRef.current.restoreFromCloud();
    if (result.errors.length === 0) {
      useAppStore.getState().setLastPulledAt(result.newPulledAt);
    }
    emitPullComplete();
    return result;
  }, []);

  const getConflicts = useCallback(async () => {
    if (!managerRef.current) return [];
    return managerRef.current.getConflicts();
  }, []);

  const resolveConflict = useCallback(async (id: string, resolution: 'local' | 'remote' | 'delete') => {
    if (!managerRef.current) return;
    if (resolution === 'local') {
      await managerRef.current.resolveKeepLocal(id);
    } else if (resolution === 'remote') {
      await managerRef.current.resolveKeepRemote(id);
    } else {
      await managerRef.current.resolveDeleteBoth(id);
    }
  }, []);

  return (
    <SyncContext.Provider value={{ triggerFullSync, triggerPullSync, getConflicts, resolveConflict }}>
      {children}
    </SyncContext.Provider>
  );
}
