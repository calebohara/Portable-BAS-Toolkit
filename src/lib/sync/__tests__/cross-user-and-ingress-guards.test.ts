import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Phase 1c tests:
//   • Fix B (Finding #3) — cross-user push guard for ALL global audited
//     entities (generalized from the globalActivityLog-only guard).
//   • Fix C (Finding #4) — pull/realtime ingress dirty-guard so an incoming
//     remote row can't clobber a local row with an un-pushed local edit.
//
// These mock `@/lib/db` but use the REAL field-map so the cross-user guard
// exercises the genuine GLOBAL_AUDITED_ENTITY_TYPES set + toSupabaseRow.

vi.mock('@/lib/db', () => ({
  addSyncItem: vi.fn().mockResolvedValue(undefined),
  getPendingSyncItems: vi.fn().mockResolvedValue([]),
  getUnpushedSyncItemKeys: vi.fn().mockResolvedValue(new Set<string>()),
  hasUnpushedSyncItem: vi.fn().mockResolvedValue(false),
  resetSyncingItemsToPending: vi.fn().mockResolvedValue(0),
  updateSyncItem: vi.fn().mockResolvedValue(undefined),
  deleteSyncItem: vi.fn().mockResolvedValue(undefined),
  getSyncQueueCount: vi.fn().mockResolvedValue({ pending: 0, failed: 0 }),
  getAllFromStore: vi.fn().mockResolvedValue([]),
  clearSyncQueue: vi.fn().mockResolvedValue(0),
  bulkPutSilent: vi.fn().mockResolvedValue(0),
  bulkDeleteSilent: vi.fn().mockResolvedValue(0),
  addSyncConflict: vi.fn().mockResolvedValue(undefined),
  getSyncConflictCount: vi.fn().mockResolvedValue(0),
  deleteSyncConflict: vi.fn().mockResolvedValue(undefined),
  getAllSyncConflicts: vi.fn().mockResolvedValue([]),
  addSyncError: vi.fn().mockResolvedValue(undefined),
  cascadeDeleteProject: vi.fn().mockResolvedValue(undefined),
  cascadeDeleteGlobalProject: vi.fn().mockResolvedValue(undefined),
}));

import { SyncManager } from '../sync-manager';
import * as db from '@/lib/db';
import type { SyncQueueItem } from '@/types';

// Typed handles to the mocked db functions used by the assertions below.
const dbMocks = {
  getPendingSyncItems: vi.mocked(db.getPendingSyncItems),
  getUnpushedSyncItemKeys: vi.mocked(db.getUnpushedSyncItemKeys),
  hasUnpushedSyncItem: vi.mocked(db.hasUnpushedSyncItem),
  updateSyncItem: vi.mocked(db.updateSyncItem),
  deleteSyncItem: vi.mocked(db.deleteSyncItem),
  bulkPutSilent: vi.mocked(db.bulkPutSilent),
  bulkDeleteSilent: vi.mocked(db.bulkDeleteSilent),
};

Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true },
  writable: true,
  configurable: true,
});

interface MockFrom {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

function createMockSupabase(): { from: ReturnType<typeof vi.fn>; _mock: MockFrom } {
  const mockFrom: MockFrom = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };
  return { from: vi.fn(() => mockFrom), _mock: mockFrom };
}

const TEST_USER_ID = '00000000-1111-2222-3333-444444444444';
const FOREIGN_USER_ID = '7c5ca76d-fee2-40ea-b70b-5723fb0a6c15';
const GPID = '861ac1ed-aaaa-bbbb-cccc-dddddddddddd';

function makeItem(over: Partial<SyncQueueItem>): SyncQueueItem {
  return {
    id: 'x',
    action: 'update',
    entityType: 'globalDevices',
    entityId: '11111111-2222-3333-4444-555555555555',
    payload: {},
    userId: TEST_USER_ID,
    status: 'pending',
    createdAt: new Date().toISOString(),
    retriedCount: 0,
    ...over,
  };
}

describe('cross-user push guard (Finding #3, generalized)', () => {
  let manager: SyncManager;
  let supabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = createMockSupabase();
    manager = new SyncManager(supabase as never, TEST_USER_ID);
  });

  afterEach(() => manager.stop());

  it('drops a foreign-authored globalDevices update as a no-op (no upsert, no retry)', async () => {
    const id = 'aaaa1111-2222-3333-4444-555555555555';
    const item = makeItem({
      id: `globalDevices-${id}`,
      entityType: 'globalDevices',
      entityId: id,
      payload: {
        id,
        globalProjectId: GPID,
        deviceName: 'AHU-1',
        createdBy: FOREIGN_USER_ID, // ← authored by ANOTHER member
        updatedBy: FOREIGN_USER_ID,
        updatedAt: '2026-03-19T00:00:00.000Z',
      },
      retriedCount: 3, // already stuck retrying
    });

    dbMocks.getPendingSyncItems.mockResolvedValueOnce([item]);
    await manager.processQueue();

    // Dropped as a successful no-op …
    expect(dbMocks.deleteSyncItem).toHaveBeenCalledWith(item.id);
    // … never upserted (would trip created_by = auth.uid() RLS) …
    expect(supabase._mock.upsert).not.toHaveBeenCalled();
    // … and never re-queued with a bumped retry count.
    expect(dbMocks.updateSyncItem).not.toHaveBeenCalledWith(
      expect.objectContaining({ retriedCount: 4 }),
    );
  });

  it('still upserts an own-authored globalDevices update', async () => {
    const id = 'bbbb1111-2222-3333-4444-555555555555';
    const item = makeItem({
      id: `globalDevices-${id}`,
      entityType: 'globalDevices',
      entityId: id,
      payload: {
        id,
        globalProjectId: GPID,
        deviceName: 'AHU-2',
        createdBy: TEST_USER_ID, // ← authored by THIS device
        updatedBy: TEST_USER_ID,
        updatedAt: '2026-03-19T00:00:00.000Z',
      },
    });

    dbMocks.getPendingSyncItems.mockResolvedValueOnce([item]);
    await manager.processQueue();

    expect(supabase._mock.upsert).toHaveBeenCalledTimes(1);
    expect(dbMocks.deleteSyncItem).toHaveBeenCalledWith(item.id);
  });

  it('also covers globalProjects (created_by) — drops a foreign-authored project', async () => {
    const id = 'cccc1111-2222-3333-4444-555555555555';
    const item = makeItem({
      id: `globalProjects-${id}`,
      entityType: 'globalProjects',
      entityId: id,
      payload: {
        id,
        jobSiteName: 'Foreign Site',
        createdBy: FOREIGN_USER_ID,
        updatedAt: '2026-03-19T00:00:00.000Z',
      },
    });

    dbMocks.getPendingSyncItems.mockResolvedValueOnce([item]);
    await manager.processQueue();

    expect(dbMocks.deleteSyncItem).toHaveBeenCalledWith(item.id);
    expect(supabase._mock.upsert).not.toHaveBeenCalled();
  });

  it('treats a slipped-through 42501 on a global update as a non-retryable drop', async () => {
    const id = 'dddd1111-2222-3333-4444-555555555555';
    // No createdBy on payload → passes the author pre-check, but the server
    // rejects with 42501. Backstop must drop, not retry.
    const item = makeItem({
      id: `globalDevices-${id}`,
      entityType: 'globalDevices',
      entityId: id,
      payload: { id, globalProjectId: GPID, deviceName: 'X', updatedAt: '2026-03-19T00:00:00.000Z' },
      retriedCount: 0,
    });

    dbMocks.getPendingSyncItems.mockResolvedValueOnce([item]);
    supabase._mock.upsert.mockResolvedValueOnce({ error: { message: 'rls', code: '42501' } });

    await manager.processQueue();

    expect(dbMocks.deleteSyncItem).toHaveBeenCalledWith(item.id);
    // Not re-queued for retry.
    expect(dbMocks.updateSyncItem).not.toHaveBeenCalledWith(
      expect.objectContaining({ retriedCount: 1 }),
    );
  });
});

describe('realtime ingress dirty-guard (Finding #4)', () => {
  let manager: SyncManager;
  let supabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = createMockSupabase();
    manager = new SyncManager(supabase as never, TEST_USER_ID);
  });

  afterEach(() => manager.stop());

  function realtimePayload(row: Record<string, unknown>) {
    return { eventType: 'UPDATE', new: row, old: {} } as never;
  }

  it('does NOT overwrite a local row that has an un-pushed queue item', async () => {
    const id = 'eeee1111-2222-3333-4444-555555555555';
    dbMocks.hasUnpushedSyncItem.mockResolvedValueOnce(true); // local edit pending

    // Access the private handler via a typed cast.
    await (manager as unknown as {
      handleRealtimeChange: (t: string, p: unknown) => Promise<void>;
    }).handleRealtimeChange('globalDevices', realtimePayload({
      id,
      global_project_id: GPID,
      device_name: 'Remote stale name',
      updated_at: '2026-01-01T00:00:00.000Z',
    }));

    expect(dbMocks.hasUnpushedSyncItem).toHaveBeenCalledWith('globalDevices', id);
    // The local (dirty) row is preserved — no silent overwrite.
    expect(dbMocks.bulkPutSilent).not.toHaveBeenCalled();
  });

  it('DOES overwrite a local row with no pending queue item', async () => {
    const id = 'ffff1111-2222-3333-4444-555555555555';
    dbMocks.hasUnpushedSyncItem.mockResolvedValueOnce(false); // clean

    await (manager as unknown as {
      handleRealtimeChange: (t: string, p: unknown) => Promise<void>;
    }).handleRealtimeChange('globalDevices', realtimePayload({
      id,
      global_project_id: GPID,
      device_name: 'Fresh remote name',
      updated_at: '2026-06-01T00:00:00.000Z',
    }));

    expect(dbMocks.bulkPutSilent).toHaveBeenCalledTimes(1);
  });

  it('still applies a realtime DELETE even when there is local work (deletes are not skipped)', async () => {
    const id = '11112222-3333-4444-5555-666677778888';
    const payload = { eventType: 'DELETE', new: {}, old: { id } } as never;

    await (manager as unknown as {
      handleRealtimeChange: (t: string, p: unknown) => Promise<void>;
    }).handleRealtimeChange('globalDevices', payload);

    expect(dbMocks.bulkDeleteSilent).toHaveBeenCalledWith('globalDevices', [id]);
  });
});

describe('pull ingress dirty-guard (Finding #4)', () => {
  // Drives pullSync against a single local entity (devices) with one remote
  // row. A query chain mock that resolves `.range()` to the supplied rows and
  // returns empty for every other table keeps the loop bounded.
  function createPullSupabase(rowsByTable: Record<string, Record<string, unknown>[]>) {
    const from = vi.fn((table: string) => {
      const rows = rowsByTable[table] ?? [];
      let served = false;
      const chain: Record<string, unknown> = {};
      const passthrough = () => chain;
      for (const m of ['select', 'eq', 'in', 'is', 'gte', 'order', 'not']) {
        chain[m] = vi.fn(passthrough);
      }
      chain.range = vi.fn(async () => {
        // Serve the rows on the first page, empty thereafter (ends paging).
        if (served) return { data: [], error: null };
        served = true;
        return { data: rows, error: null };
      });
      return chain;
    });
    return { from };
  }

  beforeEach(() => vi.clearAllMocks());

  it('does NOT overwrite a pulled remote row that has an un-pushed local edit', async () => {
    const id = 'aaaabbbb-1111-2222-3333-444455556666';
    const supabase = createPullSupabase({
      devices: [{
        id,
        user_id: TEST_USER_ID,
        device_name: 'Stale remote name',
        project_id: '99998888-7777-6666-5555-444433332222',
        updated_at: '2026-01-01T00:00:00.000Z',
        deleted_at: null,
      }],
    });
    // The pulled id is locally dirty (pending un-pushed edit).
    dbMocks.getUnpushedSyncItemKeys.mockResolvedValueOnce(new Set([`devices-${id}`]));

    const manager = new SyncManager(supabase as never, TEST_USER_ID);
    await manager.pullSync(null);

    // The dirty row must NOT be written into IndexedDB (local edit preserved).
    const putCalls = dbMocks.bulkPutSilent.mock.calls.filter((c) => c[0] === 'devices');
    expect(putCalls).toHaveLength(0);
  });

  it('DOES overwrite a pulled remote row with no pending local edit', async () => {
    const id = 'ccccdddd-1111-2222-3333-444455556666';
    const supabase = createPullSupabase({
      devices: [{
        id,
        user_id: TEST_USER_ID,
        device_name: 'Fresh remote name',
        project_id: '99998888-7777-6666-5555-444433332222',
        updated_at: '2026-06-01T00:00:00.000Z',
        deleted_at: null,
      }],
    });
    dbMocks.getUnpushedSyncItemKeys.mockResolvedValueOnce(new Set<string>()); // clean

    const manager = new SyncManager(supabase as never, TEST_USER_ID);
    await manager.pullSync(null);

    const putCalls = dbMocks.bulkPutSilent.mock.calls.filter((c) => c[0] === 'devices');
    expect(putCalls).toHaveLength(1);
    expect((putCalls[0][1] as Record<string, unknown>[])[0]).toMatchObject({ id });
  });
});
