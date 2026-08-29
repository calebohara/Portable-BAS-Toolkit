import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression coverage for the fullSync drain P0 (BASAgents audit 2026-08-29).
 *
 * fullSync() advances the per-entity `lastFullPush:<type>` watermark at SCAN
 * time, not on push success, while `clearSyncQueueExceptFailed()` deletes every
 * pending/syncing row unconditionally. So a second fullSync over a partially
 * drained queue used to DELETE the undrained items and then SKIP the very same
 * rows as "unchanged" — stranding those edits in local-only limbo forever, with
 * no user-visible signal (notifySync only fires on a new write, the periodic
 * pull never pushes, and consistency-check deliberately never flags local-ahead).
 *
 * The fix captures the un-pushed queue keys BEFORE the clear and exempts exactly
 * those rows from the watermark skip.
 */

// ── In-memory sync queue shared by the db mock ───────────────────────────────
type QueueRow = { entityType: string; entityId: string; status: string };
const queue = new Map<string, QueueRow>();
const syncMeta = new Map<string, string>();
const stores = new Map<string, Record<string, unknown>[]>();

vi.mock('@/lib/db', () => ({
  // Both take a whole SyncQueueItem whose `id` is the deterministic
  // `${entityType}-${entityId}` — mirror that keying exactly.
  addSyncItem: vi.fn(async (item: QueueRow & { id: string }) => {
    queue.set(item.id, { entityType: item.entityType, entityId: item.entityId, status: 'pending' });
  }),
  addSyncItemPreservingRetry: vi.fn(async (item: QueueRow & { id: string }) => {
    queue.set(item.id, { entityType: item.entityType, entityId: item.entityId, status: 'pending' });
  }),
  getUnpushedSyncItemKeys: vi.fn(async () => {
    const keys = new Set<string>();
    for (const [k, v] of queue) {
      if (v.status !== 'completed') keys.add(k);
    }
    return keys;
  }),
  clearSyncQueueExceptFailed: vi.fn(async () => {
    let removed = 0;
    for (const [k, v] of [...queue]) {
      if (v.status !== 'failed') { queue.delete(k); removed++; }
    }
    return removed;
  }),
  getAllFromStore: vi.fn(async (type: string) => stores.get(type) ?? []),
  getSyncMeta: vi.fn(async (k: string) => syncMeta.get(k) ?? null),
  setSyncMeta: vi.fn(async (k: string, v: string) => { syncMeta.set(k, v); }),
  getSyncQueueCount: vi.fn().mockResolvedValue({ pending: 0, failed: 0 }),
  getPendingSyncItems: vi.fn().mockResolvedValue([]),
  resetSyncingItemsToPending: vi.fn().mockResolvedValue(0),
  updateSyncItem: vi.fn().mockResolvedValue(undefined),
  deleteSyncItem: vi.fn().mockResolvedValue(undefined),
  deleteSyncItemIfToken: vi.fn().mockResolvedValue(true),
  updateSyncItemIfToken: vi.fn().mockResolvedValue(true),
  hasUnpushedSyncItem: vi.fn().mockResolvedValue(false),
  getRowFromStore: vi.fn().mockResolvedValue(undefined),
  bulkPutSilent: vi.fn().mockResolvedValue(0),
  bulkDeleteSilent: vi.fn().mockResolvedValue(0),
  addSyncConflict: vi.fn().mockResolvedValue(undefined),
  getSyncConflictCount: vi.fn().mockResolvedValue(0),
  deleteSyncConflict: vi.fn().mockResolvedValue(undefined),
  getAllSyncConflicts: vi.fn().mockResolvedValue([]),
  addSyncError: vi.fn().mockResolvedValue(undefined),
  recoverTransientFailedItems: vi.fn().mockResolvedValue(0),
  cascadeDeleteProject: vi.fn().mockResolvedValue(undefined),
  cascadeDeleteGlobalProject: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../field-map', () => ({
  entityTypeToTable: { notes: 'notes' },
  toSupabaseRow: vi.fn((_t: string, p: Record<string, unknown>) => p),
  fromSupabaseRow: vi.fn((_t: string, r: Record<string, unknown>) => r),
  validateSyncable: vi.fn(() => null),
  isDeletedRow: vi.fn(() => false),
  SYNC_ORDER: ['notes'],
  REQUIRES_PROJECT_ID: new Set<string>(),
  isGlobalEntity: vi.fn(() => false),
  GLOBAL_ENTITY_TYPES: new Set<string>(),
  GLOBAL_AUDITED_ENTITY_TYPES: new Set<string>(),
  REQUIRES_GLOBAL_PROJECT_ID: new Set<string>(),
  supportsSubtractivePull: vi.fn(() => true),
  pushRowMatchesRemote: vi.fn(() => false),
  orderPushBatch: vi.fn(<T,>(items: T[]) => items),
}));

import { SyncManager } from '../sync-manager';

Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true }, writable: true, configurable: true,
});

// Chainable Supabase stub — purgeOrphans() runs before the scan and must not throw.
function makeSupabase() {
  const result = Promise.resolve({ data: [], error: null });
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'not', 'is', 'in', 'delete', 'update', 'upsert', 'insert', 'order', 'gte', 'lt', 'limit']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (...args: unknown[]) => (result as unknown as { then: (...a: unknown[]) => unknown }).then(...args);
  return { from: vi.fn(() => chain), channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })) };
}

const T0 = '2026-08-01T00:00:00.000Z';

describe('fullSync watermark vs. a partially drained queue', () => {
  let manager: SyncManager;

  beforeEach(() => {
    queue.clear();
    syncMeta.clear();
    stores.clear();
    // 10 offline edits, all with the same mtime.
    stores.set('notes', Array.from({ length: 10 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      projectId: 'p1',
      updatedAt: T0,
    })));
    manager = new SyncManager(makeSupabase() as never, 'user-1');
  });

  it('re-enqueues un-pushed rows the watermark would otherwise strand', async () => {
    const first = await manager.fullSync();
    expect(first.enqueued).toBe(10);
    expect(queue.size).toBe(10);
    // The watermark advanced at scan time, even though nothing has pushed yet.
    expect(syncMeta.get('lastFullPush:notes')).toBe(T0);

    // Drain only 6 — connectivity drops, 4 stay pending.
    [...queue.keys()].slice(0, 6).forEach(k => queue.delete(k));
    expect(queue.size).toBe(4);

    // User taps "Sync Now" again.
    const second = await manager.fullSync();

    // Before the fix this was 0: the clear deleted the 4 pending rows and the
    // dirty scan skipped all 10 because their mtime was <= the watermark.
    expect(second.enqueued).toBe(4);
    expect(queue.size).toBe(4);
  });

  it('still skips genuinely unchanged rows when the queue is fully drained', async () => {
    const first = await manager.fullSync();
    expect(first.enqueued).toBe(10);

    // Everything pushed successfully.
    queue.clear();

    const second = await manager.fullSync();
    expect(second.enqueued).toBe(0);
    expect(queue.size).toBe(0);
  });

  it('rescues repeatedly until the work actually drains', async () => {
    await manager.fullSync();
    [...queue.keys()].slice(0, 8).forEach(k => queue.delete(k));
    expect(queue.size).toBe(2);

    const second = await manager.fullSync();
    expect(second.enqueued).toBe(2);

    // Still not drained — a third attempt must not give up on them.
    const third = await manager.fullSync();
    expect(third.enqueued).toBe(2);
  });

  it('enqueues rows edited after the watermark as normal', async () => {
    await manager.fullSync();
    queue.clear();

    const notes = stores.get('notes')!;
    notes[0].updatedAt = '2026-08-02T00:00:00.000Z';

    const second = await manager.fullSync();
    expect(second.enqueued).toBe(1);
  });
});
