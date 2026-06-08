'use client';

import { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './auth-provider';
import { useAppStore } from '@/store/app-store';
import { getSupabaseClient } from '@/lib/supabase/client';
import { SyncManager } from '@/lib/sync/sync-manager';
import { registerSyncManager, unregisterSyncManager, emitPullComplete } from '@/lib/sync/sync-bridge';
import { hasSyncAccess, isInGracePeriod } from '@/lib/paywall';
import { GLOBAL_MEMBERSHIP_CHANGED_EVENT } from '@/hooks/use-global-projects';
import { runConsistencyCheck, type ConsistencyReport } from '@/lib/sync/consistency-check';
import { startAutoMirror } from '@/lib/global-projects/auto-mirror';
import { toast } from 'sonner';

interface SyncContextValue {
  triggerFullSync: () => Promise<{ enqueued: number; errors: string[] } | null>;
  triggerPullSync: () => Promise<{ pulled: number; deleted: number; errors: string[] } | null>;
  getConflicts: () => Promise<import('@/types').SyncConflict[]>;
  resolveConflict: (id: string, resolution: 'local' | 'remote' | 'delete') => Promise<void>;
  checkConsistency: () => Promise<ConsistencyReport>;
  triggerFullPull: () => Promise<{ pulled: number; deleted: number; errors: string[] } | null>;
}

const SyncContext = createContext<SyncContextValue>({
  triggerFullSync: async () => null,
  triggerPullSync: async () => null,
  getConflicts: async () => [],
  resolveConflict: async () => {},
  checkConsistency: () => runConsistencyCheck(),
  triggerFullPull: async () => null,
});

export function useSyncContext() {
  return useContext(SyncContext);
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { mode, user, profile: authProfile } = useAuth();
  const managerRef = useRef<SyncManager | null>(null);
  const autoPullFiredRef = useRef(false);
  const autoConsistencyFiredRef = useRef(false);
  const realtimeCleanupRef = useRef<(() => void) | null>(null);
  const setSyncStatus = useAppStore((s) => s.setSyncStatus);
  const setPendingSyncCount = useAppStore((s) => s.setPendingSyncCount);
  const setLastSyncedAt = useAppStore((s) => s.setLastSyncedAt);
  const setLastPulledAt = useAppStore((s) => s.setLastPulledAt);
  const setSyncConflictCount = useAppStore((s) => s.setSyncConflictCount);

  // Stabilise identity: only re-run when the user ID actually changes
  const userId = user?.id ?? null;

  const checkConsistency = useCallback(async () => {
    const report = await runConsistencyCheck();
    useAppStore.getState().setLastConsistencyCheckAt(report.checkedAt);
    useAppStore.getState().setConsistencyBehindCount(report.behindEntities);
    return report;
  }, []);

  const triggerFullPull = useCallback(async () => {
    if (!managerRef.current) return null;
    // Full pull = non-incremental pull that RESPECTS remote soft-deletes
    // (unlike restoreFromCloud, which undeletes). Used to bring a device that
    // is behind the cloud back up to date.
    const result = await managerRef.current.pullSync(null);
    if (result.errors.length === 0) {
      useAppStore.getState().setLastPulledAt(result.newPulledAt);
    }
    emitPullComplete();
    return { pulled: result.pulled, deleted: result.deleted, errors: result.errors };
  }, []);

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
      autoConsistencyFiredRef.current = false;
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

    // ── Convergence backstop: shared incremental pull (P1-2 / P1-3) ──────────
    // Pull cloud changes since the last cursor, advance the cursor, and notify
    // hooks. Guarded so it no-ops when offline or before the first-login full
    // pull has set a cursor, and serialized so overlapping triggers (periodic
    // timer + realtime-reconnect backfill) don't run concurrently.
    let incrementalPullInFlight = false;
    const runIncrementalPull = (reason: string) => {
      if (!navigator.onLine || incrementalPullInFlight) return;
      const storedPulledAt = useAppStore.getState().lastPulledAt;
      if (!storedPulledAt) return; // first-login full pull owns the cursor
      incrementalPullInFlight = true;
      manager.pullSync(storedPulledAt).then((result) => {
        if (result.errors.length === 0) {
          useAppStore.getState().setLastPulledAt(result.newPulledAt);
        }
        if (result.pulled > 0 || result.deleted > 0) {
          console.info(`[sync] Incremental pull (${reason}): ${result.pulled} pulled, ${result.deleted} removed`);
        }
        emitPullComplete();
      }).catch((err) => {
        console.warn(`[sync] Incremental pull (${reason}) failed:`, err);
      }).finally(() => {
        incrementalPullInFlight = false;
      });
    };

    // P1-3: when a realtime channel re-subscribes after a websocket drop, catch
    // up on events missed during the gap (a missed DELETE is a resurrection
    // vector). The manager debounces coincident channel reconnects.
    manager.setRealtimeBackfillCallback(() => runIncrementalPull('realtime-reconnect'));

    managerRef.current = manager;
    registerSyncManager(manager);
    manager.start();
    setSyncStatus('idle');

    // Automatic global→local mirror: reflect global-project changes down into any
    // LOCAL project linked via syncedGlobalId. Driven off pull-complete (which
    // also fires on realtime apply), debounced + idempotent + tombstone-delete-
    // aware. Torn down in the cleanup below.
    const stopAutoMirror = startAutoMirror();

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
    // 30s membership cache doesn't keep us subscribed to stale project ids.
    // Idempotent — safe to fire on every event.
    //   - Invoke the prior cleanup first so we never overwrite a live channel
    //     ref without tearing it down (defense-in-depth; the manager also tears
    //     down internally).
    //   - Pass force=true so the membership ids are re-fetched fresh, otherwise
    //     a just-joined project's id wouldn't be in the realtime filter until
    //     the cache TTL expires (race on invite-accept).
    const handleMembershipChanged = () => {
      realtimeCleanupRef.current?.();
      realtimeCleanupRef.current = null;
      manager.subscribeToGlobalRealtime(true).then((cleanup) => {
        realtimeCleanupRef.current = cleanup;
      }).catch((err) => {
        console.warn('[sync] Failed to re-subscribe to global realtime:', err);
      });
    };
    window.addEventListener(GLOBAL_MEMBERSHIP_CHANGED_EVENT, handleMembershipChanged);

    // Report initial conflict count
    manager.getConflictCount().then((count) => setSyncConflictCount(count));

    // On reconnect: re-pend transient `failed` items, pull remote changes,
    // then flush the push queue.
    const handleOnline = () => {
      // Phase 1b auto-recovery: a write that failed only because the network was
      // down / the server 5xx'd / the JWT expired should self-heal now that
      // we're back online — without the user hitting "Retry". Permanent failures
      // (RLS / FK / missing-column) stay parked. Fire before pull+flush so the
      // re-pended items are picked up by the processQueue below.
      manager.autoRecoverFailedItems().catch(() => { /* logged inside */ });

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

    // Periodic auto-recovery sweep (Phase 1b): re-pend transient `failed` items
    // every few minutes even without an `online` event — covers a server that
    // recovered from a 5xx blip while the connection never dropped. Permanent
    // failures stay parked. Cleared on unmount alongside the listeners below.
    const autoRecoverIntervalId = setInterval(() => {
      manager.autoRecoverFailedItems().catch(() => { /* logged inside */ });
    }, 3 * 60_000);

    // Periodic incremental pull (P1-2): the 5s manager interval only PUSHES, and
    // realtime covers global_* tables only — so an idle-but-online device (and
    // every local user-owned table on a second device) never converges between
    // the `online` event and a manual refresh. A lightweight incremental pull on
    // a 90s cadence gives both local and global tables a guaranteed convergence
    // backstop independent of realtime delivery. Cheap: it just advances the
    // cursor and pulls the delta.
    const periodicPullIntervalId = setInterval(() => {
      runIncrementalPull('periodic');
    }, 90_000);

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
    } else if (storedLastPulledAt && !autoConsistencyFiredRef.current) {
      // Existing device (already hydrated): run a one-shot, read-only
      // consistency check against the cloud. New devices are skipped because
      // the first-login auto-pull above already brings them fully up to date.
      autoConsistencyFiredRef.current = true;
      checkConsistency().then((report) => {
        if (report.behindEntities > 0) {
          toast.warning('Your local data is behind the cloud', {
            description: `${report.behindEntities} item type(s) are out of date on this device.`,
            duration: 12000,
            action: {
              label: 'Update',
              onClick: () => {
                triggerFullPull().then((result) => {
                  if (!result) return;
                  if (result.errors.length > 0) {
                    toast.error('Update failed', {
                      description: 'Some items could not be pulled from the cloud.',
                    });
                  } else {
                    toast.success('Local data updated from cloud', {
                      description: `${result.pulled} item(s) pulled, ${result.deleted} removed.`,
                    });
                  }
                }).catch((err) => {
                  console.warn('[sync] Consistency update pull failed:', err);
                  toast.error('Update failed', {
                    description: 'Could not pull from the cloud. Please try again.',
                  });
                });
              },
            },
          });
        }
      }).catch((err) => {
        console.warn('[sync] Auto consistency check failed:', err);
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener(GLOBAL_MEMBERSHIP_CHANGED_EVENT, handleMembershipChanged);
      clearInterval(autoRecoverIntervalId);
      clearInterval(periodicPullIntervalId);
      stopAutoMirror();
      // Tear down realtime explicitly first; `manager.stop()` also calls
      // `unsubscribeFromGlobalRealtime` for belt-and-suspenders.
      realtimeCleanupRef.current?.();
      realtimeCleanupRef.current = null;
      manager.unsubscribeFromGlobalRealtime();
      manager.stop();
      unregisterSyncManager();
      managerRef.current = null;
      // Re-arm the one-shot auto-pull / consistency guards so a user SWITCH
      // (userId changes without first dropping to unauthenticated) re-fires the
      // clean first-login hydration for the NEW user. Without this, the refs
      // would stay `true` from the previous user and the new user's cursor-reset
      // (lastPulledAt → null) would be ignored. (Finding #2, Phase 1c.)
      autoPullFiredRef.current = false;
      autoConsistencyFiredRef.current = false;
    };
  }, [mode, userId, authProfile?.subscriptionTier, authProfile?.subscriptionExpiresAt, setSyncStatus, setPendingSyncCount, setLastSyncedAt, setLastPulledAt, setSyncConflictCount, checkConsistency, triggerFullPull]);

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
    <SyncContext.Provider value={{ triggerFullSync, triggerPullSync, getConflicts, resolveConflict, checkConsistency, triggerFullPull }}>
      {children}
    </SyncContext.Provider>
  );
}
