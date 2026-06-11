import { describe, it, expect, vi, beforeEach } from 'vitest';

// Delete-correctness tests (SyncAuditAgents Finding #1, Phase 1a).
//
// These exercise the real field-map (NOT mocked) so isDeletedRow,
// toSupabaseRow, hasDeletedAtColumn and supportsSubtractivePull behave exactly
// as in production. Only the IndexedDB db layer is mocked — we assert on the
// db calls (bulkDeleteSilent / bulkPutSilent / cascade*) the manager makes and
// on the payload handed to Supabase upsert.

// Mock only the IndexedDB db layer (factory is hoisted — no outer refs).
vi.mock('@/lib/db', () => ({
  addSyncItem: vi.fn().mockResolvedValue(undefined),
  getPendingSyncItems: vi.fn().mockResolvedValue([]),
  getUnpushedSyncItemKeys: vi.fn().mockResolvedValue(new Set<string>()),
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

// Use the REAL field-map. Keep the sync-bridge / error-utils as-is.
import { SyncManager } from '../sync-manager';
import { entityTypeToTable } from '../field-map';
import {
  bulkDeleteSilent, bulkPutSilent, getAllFromStore, getPendingSyncItems,
  getUnpushedSyncItemKeys,
} from '@/lib/db';

const dbMocks = {
  bulkDeleteSilent: vi.mocked(bulkDeleteSilent),
  bulkPutSilent: vi.mocked(bulkPutSilent),
  getAllFromStore: vi.mocked(getAllFromStore),
  getPendingSyncItems: vi.mocked(getPendingSyncItems),
  getUnpushedSyncItemKeys: vi.mocked(getUnpushedSyncItemKeys),
};

Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true },
  writable: true,
  configurable: true,
});

const TEST_USER_ID = '00000000-1111-2222-3333-444444444444';

// ── Pull-query mock ────────────────────────────────────────────────────────
// pullSync builds: from(table).select('*').{eq|in}().[is()].[gte()].order().range()
// We return a chainable thenable where range() resolves with the rows
// registered for that table. captures records every filter the chain applied.
type RowMap = Record<string, Record<string, unknown>[]>;

function makePullClient(rowsByTable: RowMap) {
  const filters: { table: string; isDeletedNull: boolean; gte: boolean }[] = [];

  function from(table: string) {
    const state = { table, isDeletedNull: false, gte: false };
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    chain.select = passthrough;
    chain.eq = passthrough;
    chain.in = passthrough;
    chain.order = passthrough;
    chain.is = (col: string) => {
      if (col === 'deleted_at') state.isDeletedNull = true;
      return chain;
    };
    chain.gte = () => {
      state.gte = true;
      return chain;
    };
    chain.range = (offset: number) => {
      filters.push({ ...state });
      // Single page: return all rows on offset 0, empty after.
      const rows = offset === 0 ? (rowsByTable[table] ?? []) : [];
      return Promise.resolve({ data: rows, error: null });
    };
    // membership query path: .select().eq() then awaited directly (no range)
    // global_project_members is fetched via from().select().eq() — make it
    // thenable so `await` resolves it.
    chain.then = (resolve: (v: unknown) => void) =>
      resolve({ data: rowsByTable[table] ?? [], error: null });
    return chain;
  }

  return {
    client: { from: vi.fn(from) } as never,
    filters,
  };
}

describe('Delete propagation (Finding #1, Phase 1a)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1: incremental pull of a cloud tombstone applies a LOCAL delete ──
  it('incremental pull routes a cloud-tombstoned row to a local delete (not an upsert)', async () => {
    const TOMBSTONED_ID = 'aaaaaaaa-1111-2222-3333-444444444444';
    const LIVE_ID = 'bbbbbbbb-1111-2222-3333-444444444444';

    const { client, filters } = makePullClient({
      // `devices` is a local user-owned table WITH a deleted_at column.
      [entityTypeToTable.devices]: [
        { id: LIVE_ID, project_id: '99999999-1111-2222-3333-444444444444', deleted_at: null },
        { id: TOMBSTONED_ID, project_id: '99999999-1111-2222-3333-444444444444', deleted_at: '2026-06-08T00:00:00.000Z' },
      ],
    });

    const manager = new SyncManager(client, TEST_USER_ID);
    // Incremental pull (lastPulledAt set) → tombstones must come through.
    await manager.pullSync('2026-06-01T00:00:00.000Z');

    // The tombstoned row is removed locally …
    expect(dbMocks.bulkDeleteSilent).toHaveBeenCalledWith('devices', [TOMBSTONED_ID]);
    // … and the live row is upserted (not deleted).
    const putCall = dbMocks.bulkPutSilent.mock.calls.find((c) => c[0] === 'devices');
    expect(putCall).toBeTruthy();
    const putRows = putCall![1] as Record<string, unknown>[];
    expect(putRows.map((r) => r.id)).toEqual([LIVE_ID]);

    // And critically: on an INCREMENTAL pull the deleted_at IS NULL filter was
    // NOT applied to the devices query (otherwise the tombstone is invisible).
    const devFilter = filters.find((f) => f.table === entityTypeToTable.devices);
    expect(devFilter?.isDeletedNull).toBe(false);
    expect(devFilter?.gte).toBe(true);
  });

  // ── ENG-1: tombstone ingress dirty-guard ──────────────────────────────────
  it('defers a cloud tombstone for a row with an un-pushed local edit (dirty-guard)', async () => {
    const TOMBSTONED_DIRTY_ID = 'cccccccc-1111-2222-3333-444444444444';

    const { client } = makePullClient({
      [entityTypeToTable.devices]: [
        { id: TOMBSTONED_DIRTY_ID, project_id: '99999999-1111-2222-3333-444444444444', deleted_at: '2026-06-08T00:00:00.000Z' },
      ],
    });

    // The user edited this device offline — its push is still pending.
    dbMocks.getUnpushedSyncItemKeys.mockResolvedValue(
      new Set([`devices-${TOMBSTONED_DIRTY_ID}`]),
    );

    const manager = new SyncManager(client, TEST_USER_ID);
    await manager.pullSync('2026-06-01T00:00:00.000Z');

    // The tombstone is DEFERRED, not applied — the un-pushed edit survives.
    const deletedDeviceIds = dbMocks.bulkDeleteSilent.mock.calls
      .filter((c) => c[0] === 'devices')
      .flatMap((c) => c[1] as string[]);
    expect(deletedDeviceIds).not.toContain(TOMBSTONED_DIRTY_ID);
  });

  // ── Test 2: full pull subtractively removes a stale local row ────────────
  it('full pull removes a local row absent from the cloud live set (subtractive)', async () => {
    const CLOUD_ID = 'cccccccc-1111-2222-3333-444444444444';
    const STALE_LOCAL_ID = 'dddddddd-1111-2222-3333-444444444444';

    const { client, filters } = makePullClient({
      [entityTypeToTable.devices]: [
        { id: CLOUD_ID, project_id: '99999999-1111-2222-3333-444444444444', deleted_at: null },
      ],
    });

    // Local store holds the cloud row PLUS a stale row the cloud no longer has.
    dbMocks.getAllFromStore.mockImplementation(async (store: string) => {
      if (store === 'devices') {
        return [
          { id: CLOUD_ID, projectId: '99999999-1111-2222-3333-444444444444' },
          { id: STALE_LOCAL_ID, projectId: '99999999-1111-2222-3333-444444444444' },
        ];
      }
      return [];
    });

    const manager = new SyncManager(client, TEST_USER_ID);
    // Full pull (lastPulledAt == null) → subtractive reconciliation runs.
    await manager.pullSync(null);

    // The stale local row (absent from cloud) is removed; the cloud row is kept.
    expect(dbMocks.bulkDeleteSilent).toHaveBeenCalledWith('devices', [STALE_LOCAL_ID]);
    const deletedIds = dbMocks.bulkDeleteSilent.mock.calls
      .filter((c) => c[0] === 'devices')
      .flatMap((c) => c[1] as string[]);
    expect(deletedIds).toContain(STALE_LOCAL_ID);
    expect(deletedIds).not.toContain(CLOUD_ID);

    // On a FULL pull the deleted_at IS NULL filter IS applied (we don't pull
    // tombstones during initial hydration — subtractive delete handles staleness).
    const devFilter = filters.find((f) => f.table === entityTypeToTable.devices);
    expect(devFilter?.isDeletedNull).toBe(true);
  });

  it('full pull subtractively clears local rows when the cloud has none', async () => {
    const STALE_LOCAL_ID = 'eeeeeeee-1111-2222-3333-444444444444';
    const { client } = makePullClient({}); // cloud returns nothing for any table

    dbMocks.getAllFromStore.mockImplementation(async (store: string) => {
      if (store === 'devices') {
        return [{ id: STALE_LOCAL_ID, projectId: '99999999-1111-2222-3333-444444444444' }];
      }
      return [];
    });

    const manager = new SyncManager(client, TEST_USER_ID);
    await manager.pullSync(null);

    expect(dbMocks.bulkDeleteSilent).toHaveBeenCalledWith('devices', [STALE_LOCAL_ID]);
  });

  // ── Test 4: offline-created row (pending `create`) survives a full pull ────
  // A row created offline lives in IndexedDB + the syncQueue but is NOT yet in
  // the cloud, so it's absent from liveCloudIds. The subtractive reap MUST NOT
  // delete it — doing so destroys un-pushed user work.
  it('does NOT subtractively delete a local row with a pending create item', async () => {
    const OFFLINE_CREATED_ID = '11111111-aaaa-bbbb-cccc-222222222222';
    const { client } = makePullClient({}); // cloud has no devices at all

    dbMocks.getAllFromStore.mockImplementation(async (store: string) => {
      if (store === 'devices') {
        return [{ id: OFFLINE_CREATED_ID, projectId: '99999999-1111-2222-3333-444444444444' }];
      }
      return [];
    });
    // This device's syncQueue still holds the un-pushed create for that row.
    dbMocks.getUnpushedSyncItemKeys.mockResolvedValue(
      new Set([`devices-${OFFLINE_CREATED_ID}`]),
    );

    const manager = new SyncManager(client, TEST_USER_ID);
    await manager.pullSync(null);

    // The offline-created row must be preserved — never handed to a delete.
    const deletedDeviceIds = dbMocks.bulkDeleteSilent.mock.calls
      .filter((c) => c[0] === 'devices')
      .flatMap((c) => c[1] as string[]);
    expect(deletedDeviceIds).not.toContain(OFFLINE_CREATED_ID);
  });

  // ── Test 5: offline-edited row (pending `update`) survives a full pull ─────
  // The cloud DOES have the row (it was created before), but the local edit is
  // queued and not yet pushed. Here the row is still in liveCloudIds so it would
  // survive anyway — the meaningful case is an edit to a row the cloud no longer
  // returns in the live set; the pending-update guard must protect it.
  it('does NOT subtractively delete a local row with a pending update item', async () => {
    const OFFLINE_EDITED_ID = '33333333-aaaa-bbbb-cccc-444444444444';
    // Cloud returns nothing for devices (e.g. row not yet visible / lagging),
    // so without the guard the locally-edited row would be reaped.
    const { client } = makePullClient({});

    dbMocks.getAllFromStore.mockImplementation(async (store: string) => {
      if (store === 'devices') {
        return [{ id: OFFLINE_EDITED_ID, projectId: '99999999-1111-2222-3333-444444444444' }];
      }
      return [];
    });
    dbMocks.getUnpushedSyncItemKeys.mockResolvedValue(
      new Set([`devices-${OFFLINE_EDITED_ID}`]),
    );

    const manager = new SyncManager(client, TEST_USER_ID);
    await manager.pullSync(null);

    const deletedDeviceIds = dbMocks.bulkDeleteSilent.mock.calls
      .filter((c) => c[0] === 'devices')
      .flatMap((c) => c[1] as string[]);
    expect(deletedDeviceIds).not.toContain(OFFLINE_EDITED_ID);
  });

  // ── Test 6: a stale row with NO pending item is still reaped (regression) ──
  // Confirms the guard is scoped to pending work, not a blanket "skip subtractive
  // delete". A row absent from cloud AND with no queue item is correctly removed.
  it('still subtractively deletes a stale row that has no pending sync item', async () => {
    const STALE_ID = '55555555-aaaa-bbbb-cccc-666666666666';
    const PENDING_ID = '77777777-aaaa-bbbb-cccc-888888888888';
    const { client } = makePullClient({});

    dbMocks.getAllFromStore.mockImplementation(async (store: string) => {
      if (store === 'devices') {
        return [
          { id: STALE_ID, projectId: '99999999-1111-2222-3333-444444444444' },
          { id: PENDING_ID, projectId: '99999999-1111-2222-3333-444444444444' },
        ];
      }
      return [];
    });
    // Only PENDING_ID has un-pushed work; STALE_ID does not.
    dbMocks.getUnpushedSyncItemKeys.mockResolvedValue(
      new Set([`devices-${PENDING_ID}`]),
    );

    const manager = new SyncManager(client, TEST_USER_ID);
    await manager.pullSync(null);

    const deletedDeviceIds = dbMocks.bulkDeleteSilent.mock.calls
      .filter((c) => c[0] === 'devices')
      .flatMap((c) => c[1] as string[]);
    expect(deletedDeviceIds).toContain(STALE_ID);
    expect(deletedDeviceIds).not.toContain(PENDING_ID);
  });
});

// ── Test 3: push path never resurrects a cloud tombstone ───────────────────
// Re-pushing a stale-but-live local copy of a row the cloud has tombstoned must
// NOT include `deleted_at: null` in the upsert payload (which would un-delete
// the cloud row via ON CONFLICT DO UPDATE).
describe('Push path anti-resurrection (Finding #1, Phase 1a)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makePushClient() {
    const upsertCalls: { table: string; row: Record<string, unknown> }[] = [];
    function from(table: string) {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
      chain.upsert = (row: Record<string, unknown>) => {
        upsertCalls.push({ table, row });
        return Promise.resolve({ error: null });
      };
      chain.update = () => chain;
      chain.delete = () => chain;
      return chain;
    }
    return { client: { from: vi.fn(from) } as never, upsertCalls };
  }

  it('does not send deleted_at: null on a re-push of a globally-mirrored row', async () => {
    const ROW_ID = 'ffffffff-1111-2222-3333-444444444444';
    const GPID = '861ac1ed-aaaa-bbbb-cccc-dddddddddddd';
    const { client, upsertCalls } = makePushClient();

    // A pulled global device carries deletedAt = null (stamped by pull). The
    // cloud copy is tombstoned; this device still holds the live copy and
    // re-pushes it (e.g. via fullSync re-enqueue).
    const item = {
      id: `globalDevices-${ROW_ID}`,
      action: 'update' as const,
      entityType: 'globalDevices' as const,
      entityId: ROW_ID,
      payload: {
        id: ROW_ID,
        globalProjectId: GPID,
        deviceName: 'AHU-1',
        deletedAt: null, // ← the resurrection vector
        updatedAt: '2026-06-08T00:00:00.000Z',
      },
      userId: TEST_USER_ID,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
      retriedCount: 0,
    };

    dbMocks.getPendingSyncItems.mockResolvedValueOnce([item]);

    const manager = new SyncManager(client, TEST_USER_ID);
    await manager.processQueue();

    expect(upsertCalls.length).toBe(1);
    const pushed = upsertCalls[0].row;
    // deleted_at must be absent entirely — not present-and-null.
    expect('deleted_at' in pushed).toBe(false);
    // The real payload columns still went through.
    expect(pushed.device_name).toBe('AHU-1');
    expect(pushed.global_project_id).toBe(GPID);
  });
});
