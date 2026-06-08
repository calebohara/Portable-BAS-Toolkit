// ─── Automatic global→local mirror orchestrator ─────────────────────────────
//
// Drives the downward (global → local) reflection for LINKED projects. When a
// teammate adds / edits / deletes data in a global project, any device that has
// a LOCAL project linked to it (Project.syncedGlobalId) automatically receives
// those changes into its local copy. A device with no linked local mirrors
// nothing — the "only if the global project lives in the project" gate.
//
// TRIGGER: `onPullComplete` already fires on every pull (first-login, 90s
// incremental, online reconnect, manual) AND on every realtime apply
// (handleRealtimeChange emits it), so a single listener covers all arrival
// paths — no changes to the hot pull path. We debounce a burst into one pass and
// then mirror every linked local via the idempotent, tombstone-delete-aware
// `reconcileGlobalToLocalAuto`.
//
// SAFETY (see the design review):
//   • Idempotent live-upsert → unchanged rows enqueue ZERO local pushes.
//   • Tombstone-only deletes → local-only rows are never wiped.
//   • Writes go only to LOCAL stores → can never push up to global or loop
//     (local→global is the manual Share action only).
//   • Deferred while a manual reconcile (Share / Save-to-Local) runs.
//   • Self-suppresses re-entrancy; re-arms if a trigger arrives mid-flush.

import { getAllProjects } from '@/lib/db';
import { onPullComplete } from '@/lib/sync/sync-bridge';
import { reconcileGlobalToLocalAuto, isManualReconcileInFlight } from './reconcile';

// Debounce window for collapsing a burst of pull/realtime events into one pass.
const DEBOUNCE_MS = 1500;
// Hard ceiling so a steady drip of events can't starve the flush forever
// (trailing-edge max-wait). Matches the realtime backfill cadence intent.
const MAX_WAIT_MS = 8000;

/**
 * Start the auto-mirror orchestrator. Returns a teardown function that
 * unsubscribes and cancels any pending flush. Safe to call once from
 * SyncProvider; the teardown must run on unmount / sign-out.
 */
export function startAutoMirror(): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  let flushInFlight = false;
  let rearm = false; // a trigger arrived while a flush was running
  let stopped = false;

  const clearTimers = () => {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    if (maxWaitTimer) { clearTimeout(maxWaitTimer); maxWaitTimer = null; }
  };

  const flush = async () => {
    clearTimers();
    if (stopped) return;
    // Don't race a user-initiated Share / Save-to-Local writing the same rows.
    if (isManualReconcileInFlight()) { schedule(); return; }
    if (flushInFlight) { rearm = true; return; }
    flushInFlight = true;
    try {
      // Enumerate the device's linked local projects fresh each pass (links can
      // change). Only projects with a truthy syncedGlobalId are mirrored — the
      // per-device gate.
      const projects = await getAllProjects();
      const links = projects.filter((p) => p.syncedGlobalId);
      for (const local of links) {
        if (stopped) break;
        try {
          await reconcileGlobalToLocalAuto(local.syncedGlobalId as string, local.id);
        } catch (e) {
          console.warn(`[auto-mirror] reconcile failed for ${local.id} → ${local.syncedGlobalId}:`, e);
        }
      }
    } catch (e) {
      console.warn('[auto-mirror] flush failed:', e);
    } finally {
      flushInFlight = false;
      if (rearm && !stopped) { rearm = false; schedule(); }
    }
  };

  const schedule = () => {
    if (stopped) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { void flush(); }, DEBOUNCE_MS);
    // Arm the max-wait ceiling only if not already armed, so a steady drip still
    // flushes within MAX_WAIT_MS.
    if (!maxWaitTimer) {
      maxWaitTimer = setTimeout(() => { void flush(); }, MAX_WAIT_MS);
    }
  };

  const unsubscribe = onPullComplete(() => schedule());

  return () => {
    stopped = true;
    clearTimers();
    unsubscribe();
  };
}
