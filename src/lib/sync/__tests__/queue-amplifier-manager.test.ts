import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Phase 1b — SyncManager-level "queue amplifier" fixes:
//   • Fix A (Finding #5) — fullSync dirty-tracking (enqueue only changed rows)
//     + preserve retriedCount on a previously-failed row.
//   • Fix B (Finding #6) — processItem captures a syncError only at first
//     occurrence / terminal, NOT on every transient retry.
//   • Fix C — a just-failed item gets an exponential-backoff nextRetryAt.
//
// db is mocked; an in-memory syncMeta map backs the dirty-tracking high-water
// marks so the two-pass "nothing changed → ~0 enqueued" assertion is real.

const metaStore = new Map<string, string>();
const queueStore = new Map<string, unknown>();

vi.mock('@/lib/db', () => ({
  addSyncItem: vi.fn(async (item: { id: string }) => { queueStore.set(item.id, item); }),
  addSyncItemPreservingRetry: vi.fn(async (item: { id: string; retriedCount: number; status: string }) => {
    const existing = queueStore.get(item.id) as { retriedCount: number; status: string } | undefined;
    if (existing) {
      queueStore.set(item.id, { ...item, status: existing.status, retriedCount: existing.retriedCount });
    } else {
      queueStore.set(item.id, item);
    }
  }),
  getPendingSyncItems: vi.fn().mockResolvedValue([]),
  getUnpushedSyncItemKeys: vi.fn().mockResolvedValue(new Set<string>()),
  hasUnpushedSyncItem: vi.fn().mockResolvedValue(false),
  resetSyncingItemsToPending: vi.fn().mockResolvedValue(0),
  updateSyncItem: vi.fn().mockResolvedValue(undefined),
  deleteSyncItem: vi.fn().mockResolvedValue(undefined),
  deleteSyncItemIfToken: vi.fn().mockResolvedValue(true),
  updateSyncItemIfToken: vi.fn().mockResolvedValue(true),
  getSyncQueueCount: vi.fn().mockResolvedValue({ pending: 0, failed: 0 }),
  getAllFromStore: vi.fn().mockResolvedValue([]),
  clearSyncQueueExceptFailed: vi.fn().mockResolvedValue(0),
  bulkPutSilent: vi.fn().mockResolvedValue(0),
  bulkDeleteSilent: vi.fn().mockResolvedValue(0),
  addSyncConflict: vi.fn().mockResolvedValue(undefined),
  getSyncConflictCount: vi.fn().mockResolvedValue(0),
  deleteSyncConflict: vi.fn().mockResolvedValue(undefined),
  getAllSyncConflicts: vi.fn().mockResolvedValue([]),
  addSyncError: vi.fn().mockResolvedValue(true),
  recoverTransientFailedItems: vi.fn().mockResolvedValue(0),
  getSyncMeta: vi.fn(async (key: string) => metaStore.get(key) ?? null),
  setSyncMeta: vi.fn(async (key: string, value: string) => { metaStore.set(key, value); }),
  cascadeDeleteProject: vi.fn().mockResolvedValue(undefined),
  cascadeDeleteGlobalProject: vi.fn().mockResolvedValue(undefined),
}));

import { SyncManager } from '../sync-manager';
import * as db from '@/lib/db';
import type { SyncQueueItem } from '@/types';

const dbMocks = {
  addSyncItem: vi.mocked(db.addSyncItem),
  addSyncItemPreservingRetry: vi.mocked(db.addSyncItemPreservingRetry),
  getPendingSyncItems: vi.mocked(db.getPendingSyncItems),
  getAllFromStore: vi.mocked(db.getAllFromStore),
  updateSyncItem: vi.mocked(db.updateSyncItem),
  updateSyncItemIfToken: vi.mocked(db.updateSyncItemIfToken),
  deleteSyncItem: vi.mocked(db.deleteSyncItem),
  addSyncError: vi.mocked(db.addSyncError),
};

Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true },
  writable: true,
  configurable: true,
});

const TEST_USER_ID = '00000000-1111-2222-3333-444444444444';

function createMockSupabase() {
  const mockFrom = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    select2: vi.fn(),
  };
  // purgeOrphans calls .select().eq().not('deleted_at', ...) etc which resolve
  // to { data, error }. Make the terminal awaited calls resolve empty.
  mockFrom.not.mockResolvedValue({ data: [], error: null });
  return { from: vi.fn(() => mockFrom), _mock: mockFrom };
}

function makeItem(over: Partial<SyncQueueItem>): SyncQueueItem {
  return {
    id: 'x',
    action: 'update',
    entityType: 'devices',
    entityId: '11111111-2222-3333-4444-555555555555',
    payload: {},
    userId: TEST_USER_ID,
    status: 'pending',
    createdAt: new Date().toISOString(),
    retriedCount: 0,
    ...over,
  };
}

describe('fullSync dirty-tracking (Finding #5)', () => {
  let manager: SyncManager;

  beforeEach(() => {
    vi.clearAllMocks();
    metaStore.clear();
    queueStore.clear();
    // Re-point getSyncMeta/setSyncMeta at the (cleared) maps after clearAllMocks.
    vi.mocked(db.getSyncMeta).mockImplementation(async (key: string) => metaStore.get(key) ?? null);
    vi.mocked(db.setSyncMeta).mockImplementation(async (key: string, value: string) => { metaStore.set(key, value); });
    vi.mocked(db.clearSyncQueueExceptFailed).mockResolvedValue(0);
    const supabase = createMockSupabase();
    manager = new SyncManager(supabase as never, TEST_USER_ID);
  });

  afterEach(() => manager.stop());

  it('enqueues ~0 items on a SECOND full sync when nothing changed', async () => {
    const row = {
      id: 'aaaa1111-2222-3333-4444-555555555555',
      projectId: 'bbbb1111-2222-3333-4444-555555555555',
      name: 'AHU-1',
      updatedAt: '2026-03-01T00:00:00.000Z',
    };
    // Both passes see the SAME unchanged dataset for the `devices` store only.
    dbMocks.getAllFromStore.mockImplementation(async (type: string) =>
      type === 'devices' ? [row] : [],
    );

    const first = await manager.fullSync();
    expect(first.enqueued).toBe(1); // first push: row is newer than (empty) mark

    const second = await manager.fullSync();
    expect(second.enqueued).toBe(0); // unchanged → dirty-tracking skips it
  });

  it('enqueues only the changed row when one row is dirty', async () => {
    const stale = {
      id: 'aaaa1111-2222-3333-4444-555555555555',
      projectId: 'bbbb1111-2222-3333-4444-555555555555',
      name: 'AHU-1',
      updatedAt: '2026-03-01T00:00:00.000Z',
    };
    const fresh = {
      id: 'cccc1111-2222-3333-4444-555555555555',
      projectId: 'bbbb1111-2222-3333-4444-555555555555',
      name: 'AHU-2',
      updatedAt: '2026-03-01T00:00:00.000Z',
    };

    dbMocks.getAllFromStore.mockImplementation(async (type: string) =>
      type === 'devices' ? [stale, fresh] : [],
    );

    // First full sync pushes both, watermark → 2026-03-01.
    const first = await manager.fullSync();
    expect(first.enqueued).toBe(2);

    // Bump ONLY `fresh`'s updatedAt past the watermark; stale is unchanged.
    fresh.updatedAt = '2026-04-01T00:00:00.000Z';
    // Forget the first sync's enqueue calls so we assert on the SECOND only.
    dbMocks.addSyncItemPreservingRetry.mockClear();

    const second = await manager.fullSync();
    expect(second.enqueued).toBe(1);
    // The single enqueued item is the dirty (fresh) row.
    const enqueuedIds = dbMocks.addSyncItemPreservingRetry.mock.calls
      .map((c) => (c[0] as SyncQueueItem).entityId);
    expect(enqueuedIds).toContain(fresh.id);
    expect(enqueuedIds).not.toContain(stale.id);
  });

  it('a previously-failed item retains its retriedCount across a fullSync (not reset to 0)', async () => {
    const row = {
      id: 'dddd1111-2222-3333-4444-555555555555',
      projectId: 'bbbb1111-2222-3333-4444-555555555555',
      name: 'AHU-3',
      updatedAt: '2026-05-01T00:00:00.000Z',
    };
    dbMocks.getAllFromStore.mockImplementation(async (type: string) =>
      type === 'devices' ? [row] : [],
    );

    // Pre-seed a poison `failed` queue row for this entity (survives the
    // except-failed clear). The preserving-enqueue mock carries it over.
    queueStore.set(`devices-${row.id}`, {
      id: `devices-${row.id}`,
      entityType: 'devices',
      entityId: row.id,
      status: 'failed',
      retriedCount: 5,
    });

    await manager.fullSync();

    const written = queueStore.get(`devices-${row.id}`) as { status: string; retriedCount: number };
    expect(written.status).toBe('failed');     // NOT reset to pending
    expect(written.retriedCount).toBe(5);       // NOT reset to 0
  });
});

describe('processItem — capture at terminal only + backoff (Findings #6 + Fix C)', () => {
  let manager: SyncManager;
  let supabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    metaStore.clear();
    queueStore.clear();
    supabase = createMockSupabase();
    manager = new SyncManager(supabase as never, TEST_USER_ID);
  });

  afterEach(() => manager.stop());

  it('captures ONE error on the first failure, sets a backoff nextRetryAt, and does NOT capture on the next transient retry', async () => {
    // A local devices update that fails with a transient-ish generic error.
    const id = 'eeee1111-2222-3333-4444-555555555555';
    supabase._mock.upsert.mockResolvedValue({ error: { message: 'temporary glitch' } });

    // First attempt (retriedCount 0).
    dbMocks.getPendingSyncItems.mockResolvedValueOnce([
      makeItem({
        id: `devices-${id}`, entityId: id, retriedCount: 0,
        payload: { id, projectId: 'bbbb1111-2222-3333-4444-555555555555', name: 'x', updatedAt: '2026-03-19T00:00:00.000Z' },
      }),
    ]);
    await manager.processQueue();

    // Captured exactly once on the first occurrence.
    expect(dbMocks.addSyncError).toHaveBeenCalledTimes(1);
    // Re-queued as pending with a future nextRetryAt (exponential backoff).
    // The failure update goes through the token-guarded finalizer (P1-4).
    const firstUpdate = dbMocks.updateSyncItemIfToken.mock.calls
      .map((c) => c[0] as SyncQueueItem)
      .find((i) => i.status === 'pending' && i.retriedCount === 1);
    expect(firstUpdate).toBeDefined();
    expect(firstUpdate?.nextRetryAt).toBeDefined();
    expect(new Date(firstUpdate!.nextRetryAt as string).getTime()).toBeGreaterThan(Date.now());

    // Second attempt (a transient MIDDLE retry, retriedCount 1 → 2) must NOT
    // write another error row.
    dbMocks.addSyncError.mockClear();
    dbMocks.getPendingSyncItems.mockResolvedValueOnce([
      makeItem({
        id: `devices-${id}`, entityId: id, retriedCount: 1,
        payload: { id, projectId: 'bbbb1111-2222-3333-4444-555555555555', name: 'x', updatedAt: '2026-03-19T00:00:00.000Z' },
      }),
    ]);
    await manager.processQueue();
    expect(dbMocks.addSyncError).not.toHaveBeenCalled();
  });

  it('captures at TERMINAL failure (retriedCount reaches MAX_RETRIES)', async () => {
    const id = 'ffff1111-2222-3333-4444-555555555555';
    supabase._mock.upsert.mockResolvedValue({ error: { message: 'temporary glitch' } });

    // retriedCount 4 → 5 (terminal at MAX_RETRIES=5).
    dbMocks.getPendingSyncItems.mockResolvedValueOnce([
      makeItem({
        id: `devices-${id}`, entityId: id, retriedCount: 4,
        payload: { id, projectId: 'bbbb1111-2222-3333-4444-555555555555', name: 'x', updatedAt: '2026-03-19T00:00:00.000Z' },
      }),
    ]);
    await manager.processQueue();

    expect(dbMocks.addSyncError).toHaveBeenCalledTimes(1);
    const terminal = dbMocks.updateSyncItemIfToken.mock.calls
      .map((c) => c[0] as SyncQueueItem)
      .find((i) => i.status === 'failed');
    expect(terminal).toBeDefined();
    expect(terminal?.retriedCount).toBe(5);
  });
});
