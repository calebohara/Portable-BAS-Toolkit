import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Phase 2 tests (SyncAuditAgents-findings-2026-06-08.md):
//   • Fix A (Finding #7) — globalProjectPreferences delete issues a HARD
//     `.delete()` by composite key, NOT a soft-delete `.update({deleted_at})`
//     against a table that has no deleted_at column.
//   • Fix B (Finding #8) — restoreFromCloud does NOT add `.eq('user_id', …)`
//     for membership-RLS global tables (they key on created_by, not user_id →
//     would 42703); local tables still get the user_id filter.
//   • Fix C (Finding #9) — sync_version is the PRIMARY conflict comparator: a
//     remote row with a HIGHER sync_version but OLDER updated_at now raises a
//     conflict (previously silently overwritten); equal versions fall back to
//     the timestamp comparison.
//
// These mock `@/lib/db` but use the REAL field-map so entityTypeToTable,
// isGlobalEntity, SYNC_ORDER, toSupabaseRow / fromSupabaseRow are genuine.

vi.mock('@/lib/db', () => ({
  addSyncItem: vi.fn().mockResolvedValue(undefined),
  addSyncItemPreservingRetry: vi.fn().mockResolvedValue(undefined),
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
  getSyncMeta: vi.fn().mockResolvedValue(undefined),
  setSyncMeta: vi.fn().mockResolvedValue(undefined),
  cascadeDeleteProject: vi.fn().mockResolvedValue(undefined),
  cascadeDeleteGlobalProject: vi.fn().mockResolvedValue(undefined),
}));

import { SyncManager } from '../sync-manager';
import * as db from '@/lib/db';
import type { SyncQueueItem } from '@/types';

const dbMocks = {
  getPendingSyncItems: vi.mocked(db.getPendingSyncItems),
  updateSyncItem: vi.mocked(db.updateSyncItem),
  deleteSyncItem: vi.mocked(db.deleteSyncItem),
  deleteSyncItemIfToken: vi.mocked(db.deleteSyncItemIfToken),
  addSyncConflict: vi.mocked(db.addSyncConflict),
  bulkPutSilent: vi.mocked(db.bulkPutSilent),
};

Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true },
  writable: true,
  configurable: true,
});

const TEST_USER_ID = '00000000-1111-2222-3333-444444444444';
const GPID = '861ac1ed-aaaa-bbbb-cccc-dddddddddddd';
const ID = '11111111-2222-3333-4444-555555555555';

// ─── Fix A: globalProjectPreferences delete ────────────────────────────────

describe('Fix A — globalProjectPreferences delete is a HARD delete (Finding #7)', () => {
  interface MockFrom {
    delete: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
  }
  function createMockSupabase(): { from: ReturnType<typeof vi.fn>; _mock: MockFrom } {
    const mockFrom: MockFrom = {
      delete: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      // `.eq()` returns `this` so the chain resolves to the mockFrom (await on a
      // non-thenable → resolves to itself; { error } is therefore undefined).
      eq: vi.fn().mockReturnThis(),
    };
    return { from: vi.fn(() => mockFrom), _mock: mockFrom };
  }

  let manager: SyncManager;
  let supabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = createMockSupabase();
    manager = new SyncManager(supabase as never, TEST_USER_ID);
  });
  afterEach(() => manager.stop());

  it('issues .delete() (not .update deleted_at) keyed on user_id + global_project_id', async () => {
    const item: SyncQueueItem = {
      id: `globalProjectPreferences-${ID}`,
      action: 'delete',
      entityType: 'globalProjectPreferences',
      entityId: ID,
      payload: { globalProjectId: GPID, userId: TEST_USER_ID },
      userId: TEST_USER_ID,
      status: 'pending',
      createdAt: new Date().toISOString(),
      retriedCount: 0,
    };

    dbMocks.getPendingSyncItems.mockResolvedValueOnce([item]);
    await manager.processQueue();

    // HARD delete — NOT a soft-delete UPDATE (the table has no deleted_at column).
    expect(supabase._mock.delete).toHaveBeenCalledTimes(1);
    expect(supabase._mock.update).not.toHaveBeenCalled();
    // Keyed by the composite PK.
    expect(supabase._mock.eq).toHaveBeenCalledWith('user_id', TEST_USER_ID);
    expect(supabase._mock.eq).toHaveBeenCalledWith('global_project_id', GPID);
    // Removed from the queue on success (token-guarded finalizer, P1-4).
    expect(dbMocks.deleteSyncItemIfToken).toHaveBeenCalledWith(item.id, expect.any(String));
  });

  it('drops the queue item when no globalProjectId is available', async () => {
    const item: SyncQueueItem = {
      id: `globalProjectPreferences-${ID}`,
      action: 'delete',
      entityType: 'globalProjectPreferences',
      entityId: ID,
      payload: { userId: TEST_USER_ID }, // ← no globalProjectId
      userId: TEST_USER_ID,
      status: 'pending',
      createdAt: new Date().toISOString(),
      retriedCount: 0,
    };

    dbMocks.getPendingSyncItems.mockResolvedValueOnce([item]);
    await manager.processQueue();

    expect(supabase._mock.delete).not.toHaveBeenCalled();
    expect(supabase._mock.update).not.toHaveBeenCalled();
    expect(dbMocks.deleteSyncItem).toHaveBeenCalledWith(item.id);
  });
});

// ─── Fix B: restoreFromCloud user_id filter ────────────────────────────────

describe('Fix B — restoreFromCloud drops user_id filter for global tables (Finding #8)', () => {
  // Records, per table name, the column args passed to .eq() during the
  // undelete UPDATE so we can assert global tables never get .eq('user_id', …).
  interface UndeleteChain {
    eqCols: string[];
    not: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
  }

  let perTableEqCols: Record<string, string[]>;

  function createMockSupabase() {
    perTableEqCols = {};
    const from = vi.fn((table: string) => {
      // Accumulate eq() columns ACROSS every from(table) call (restoreFromCloud
      // calls from(table) for the undelete UPDATE, then pullSync calls it again
      // for the re-pull) so a later call can't reset what the undelete recorded.
      const eqCols = (perTableEqCols[table] ??= []);
      const chain: UndeleteChain = {
        eqCols,
        eq: vi.fn(),
        not: vi.fn(),
        select: vi.fn(),
      };
      // .update() → chainable object supporting .eq().not().select() and
      // .not().select(). Each .eq() records the column it filtered on.
      chain.eq.mockImplementation((col: string) => {
        chain.eqCols.push(col);
        return chain;
      });
      chain.not.mockReturnValue(chain);
      chain.select.mockResolvedValue({ data: [], error: null });
      const update = vi.fn(() => chain);
      // pullSync (called after undelete) needs a query builder too — give a
      // permissive chainable that resolves empty so the test focuses on undelete.
      const queryChain: Record<string, unknown> = {};
      const passthrough = vi.fn(() => queryChain);
      Object.assign(queryChain, {
        select: passthrough,
        eq: passthrough,
        in: passthrough,
        is: passthrough,
        gte: passthrough,
        order: passthrough,
        not: passthrough,
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
      });
      return {
        update,
        select: passthrough,
        eq: passthrough,
        in: passthrough,
        is: passthrough,
        gte: passthrough,
        order: passthrough,
        not: passthrough,
        range: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });
    return { from };
  }

  let manager: SyncManager;

  beforeEach(() => {
    vi.clearAllMocks();
    const supabase = createMockSupabase();
    manager = new SyncManager(supabase as never, TEST_USER_ID);
  });
  afterEach(() => manager.stop());

  it('does NOT call .eq("user_id", …) on a global table during undelete', async () => {
    await manager.restoreFromCloud();

    // Local user-owned table: keeps the user_id ownership filter.
    expect(perTableEqCols['projects']).toContain('user_id');
    expect(perTableEqCols['field_notes']).toContain('user_id');

    // Global membership-RLS tables: NO user_id filter (would be 42703).
    expect(perTableEqCols['global_field_notes'] ?? []).not.toContain('user_id');
    expect(perTableEqCols['global_devices'] ?? []).not.toContain('user_id');
    expect(perTableEqCols['global_projects'] ?? []).not.toContain('user_id');
  });
});

// ─── Fix C: sync_version primary conflict comparator ───────────────────────

describe('Fix C — sync_version is the primary conflict comparator (Finding #9)', () => {
  interface MockFrom {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  }
  function createMockSupabase(remoteRow: Record<string, unknown> | null) {
    const mockFrom: MockFrom = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: remoteRow, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };
    return { from: vi.fn(() => mockFrom), _mock: mockFrom };
  }

  function makeUpdateItem(payload: Record<string, unknown>): SyncQueueItem {
    return {
      id: `globalDevices-${ID}`,
      action: 'update',
      entityType: 'globalDevices',
      entityId: ID,
      payload: { id: ID, globalProjectId: GPID, createdBy: TEST_USER_ID, updatedBy: TEST_USER_ID, ...payload },
      userId: TEST_USER_ID,
      status: 'pending',
      createdAt: new Date().toISOString(),
      retriedCount: 0,
    };
  }

  beforeEach(() => vi.clearAllMocks());

  it('raises a conflict when remote sync_version is HIGHER but updated_at is OLDER', async () => {
    // Remote is OLDER by timestamp but a strictly HIGHER sync_version — under the
    // old timestamp-only logic the local write would silently overwrite it.
    const remoteRow = {
      id: ID,
      updated_at: '2026-03-01T00:00:00.000Z', // older
      sync_version: 5,                          // higher
    };
    const supabase = createMockSupabase(remoteRow);
    const manager = new SyncManager(supabase as never, TEST_USER_ID);

    const item = makeUpdateItem({
      updatedAt: '2026-03-20T00:00:00.000Z', // newer timestamp
      syncVersion: 3,                          // lower version
    });
    dbMocks.getPendingSyncItems.mockResolvedValueOnce([item]);

    await manager.processQueue();

    // Version-primary: conflict raised, NOT a blind upsert.
    expect(dbMocks.addSyncConflict).toHaveBeenCalledTimes(1);
    expect(supabase._mock.upsert).not.toHaveBeenCalled();
    expect(dbMocks.deleteSyncItem).toHaveBeenCalledWith(item.id);
    manager.stop();
  });

  it('proceeds with upsert (no conflict) when local sync_version is HIGHER, even on older timestamp', async () => {
    const remoteRow = {
      id: ID,
      updated_at: '2026-03-20T00:00:00.000Z', // newer timestamp
      sync_version: 2,                          // lower version
    };
    const supabase = createMockSupabase(remoteRow);
    const manager = new SyncManager(supabase as never, TEST_USER_ID);

    const item = makeUpdateItem({
      updatedAt: '2026-03-01T00:00:00.000Z', // older timestamp
      syncVersion: 7,                          // higher version → local wins
    });
    dbMocks.getPendingSyncItems.mockResolvedValueOnce([item]);

    await manager.processQueue();

    // Local version is authoritative — no conflict, push proceeds.
    expect(dbMocks.addSyncConflict).not.toHaveBeenCalled();
    expect(supabase._mock.upsert).toHaveBeenCalledTimes(1);
    manager.stop();
  });

  it('falls back to timestamp when versions are EQUAL (remote newer → conflict)', async () => {
    const remoteRow = {
      id: ID,
      updated_at: '2026-03-20T00:00:00.000Z', // newer
      sync_version: 4,                          // equal
    };
    const supabase = createMockSupabase(remoteRow);
    const manager = new SyncManager(supabase as never, TEST_USER_ID);

    const item = makeUpdateItem({
      updatedAt: '2026-03-01T00:00:00.000Z', // older
      syncVersion: 4,                          // equal version → timestamp decides
    });
    dbMocks.getPendingSyncItems.mockResolvedValueOnce([item]);

    await manager.processQueue();

    expect(dbMocks.addSyncConflict).toHaveBeenCalledTimes(1);
    expect(supabase._mock.upsert).not.toHaveBeenCalled();
    manager.stop();
  });

  it('falls back to timestamp when versions are EQUAL (remote older → no conflict, push)', async () => {
    const remoteRow = {
      id: ID,
      updated_at: '2026-03-01T00:00:00.000Z', // older
      sync_version: 4,                          // equal
    };
    const supabase = createMockSupabase(remoteRow);
    const manager = new SyncManager(supabase as never, TEST_USER_ID);

    const item = makeUpdateItem({
      updatedAt: '2026-03-20T00:00:00.000Z', // newer
      syncVersion: 4,                          // equal version
    });
    dbMocks.getPendingSyncItems.mockResolvedValueOnce([item]);

    await manager.processQueue();

    expect(dbMocks.addSyncConflict).not.toHaveBeenCalled();
    expect(supabase._mock.upsert).toHaveBeenCalledTimes(1);
    manager.stop();
  });
});

// ─── Hotfix: content-equality gate (the 140-spurious-conflicts flood) ───────
// After Phase 2 made sync_version the primary comparator, a fullSync that
// re-enqueues UNCHANGED rows (no dirty-tracking watermark on a device's first
// run) flagged a conflict for every row whose cloud sync_version had been bumped
// by another device — even though the content was byte-identical. That produced
// a flood of "keep local / keep cloud" prompts for rows that hadn't diverged.
// The gate: if the row we'd push is content-identical to the cloud row (ignoring
// volatile server columns), silently adopt the cloud row — no conflict, no push.

describe('Hotfix — identical content with a higher remote version is NOT a conflict', () => {
  interface MockFrom {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  }
  function createMockSupabase(remoteRow: Record<string, unknown> | null) {
    const mockFrom: MockFrom = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: remoteRow, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };
    return { from: vi.fn(() => mockFrom), _mock: mockFrom };
  }

  beforeEach(() => vi.clearAllMocks());

  it('silently reconciles (adopts cloud) when content matches but remote sync_version is higher', async () => {
    // Cloud row: SAME content (device_name), but a higher version + older
    // timestamp — the classic stale-version-after-another-device-bumped case.
    const remoteRow = {
      id: ID,
      global_project_id: GPID,
      device_name: 'VAV-2',
      updated_at: '2026-03-01T00:00:00.000Z', // older
      sync_version: 9,                          // higher than local
    };
    const supabase = createMockSupabase(remoteRow);
    const manager = new SyncManager(supabase as never, TEST_USER_ID);

    const item: SyncQueueItem = {
      id: `globalDevices-${ID}`,
      action: 'update',
      entityType: 'globalDevices',
      entityId: ID,
      payload: {
        id: ID,
        globalProjectId: GPID,
        deviceName: 'VAV-2',                   // ← identical content
        updatedAt: '2026-03-20T00:00:00.000Z', // newer timestamp
        syncVersion: 3,                          // lower version
      },
      userId: TEST_USER_ID,
      status: 'pending',
      createdAt: new Date().toISOString(),
      retriedCount: 0,
    };
    dbMocks.getPendingSyncItems.mockResolvedValueOnce([item]);

    await manager.processQueue();

    // No conflict prompt, no redundant push — just a silent local reconcile.
    expect(dbMocks.addSyncConflict).not.toHaveBeenCalled();
    expect(supabase._mock.upsert).not.toHaveBeenCalled();
    expect(dbMocks.bulkPutSilent).toHaveBeenCalledTimes(1);
    expect(dbMocks.deleteSyncItem).toHaveBeenCalledWith(item.id);
    manager.stop();
  });

  it('STILL raises a conflict when content genuinely differs and remote version is higher', async () => {
    const remoteRow = {
      id: ID,
      global_project_id: GPID,
      device_name: 'VAV-2-CLOUD-EDIT',          // ← different content
      updated_at: '2026-03-01T00:00:00.000Z',
      sync_version: 9,
    };
    const supabase = createMockSupabase(remoteRow);
    const manager = new SyncManager(supabase as never, TEST_USER_ID);

    const item: SyncQueueItem = {
      id: `globalDevices-${ID}`,
      action: 'update',
      entityType: 'globalDevices',
      entityId: ID,
      payload: {
        id: ID,
        globalProjectId: GPID,
        deviceName: 'VAV-2-LOCAL-EDIT',          // ← genuinely diverged
        updatedAt: '2026-03-20T00:00:00.000Z',
        syncVersion: 3,
      },
      userId: TEST_USER_ID,
      status: 'pending',
      createdAt: new Date().toISOString(),
      retriedCount: 0,
    };
    dbMocks.getPendingSyncItems.mockResolvedValueOnce([item]);

    await manager.processQueue();

    // Real divergence → real conflict (not silently reconciled away).
    expect(dbMocks.addSyncConflict).toHaveBeenCalledTimes(1);
    expect(dbMocks.bulkPutSilent).not.toHaveBeenCalled();
    expect(supabase._mock.upsert).not.toHaveBeenCalled();
    manager.stop();
  });

  it('does NOT adopt the cloud row when the user CLEARED a field the remote still has (P3-3)', async () => {
    // Remote still carries a non-empty mac_address; local cleared it to undefined
    // (so toSupabaseRow drops it from the push payload). Otherwise identical, with
    // a higher remote version. The OLD gate iterated only payload keys → never
    // compared mac_address → "identical" → silently adopted cloud, discarding the
    // clear. The fix compares the FULL client-owned column set, so the clear vs a
    // non-empty remote value is a real divergence → conflict, not silent adopt.
    const remoteRow = {
      id: ID,
      global_project_id: GPID,
      device_name: 'VAV-2',
      mac_address: 'AA:BB:CC:DD:EE:FF',          // ← remote still set
      updated_at: '2026-03-01T00:00:00.000Z',
      sync_version: 9,
    };
    const supabase = createMockSupabase(remoteRow);
    const manager = new SyncManager(supabase as never, TEST_USER_ID);

    const item: SyncQueueItem = {
      id: `globalDevices-${ID}`,
      action: 'update',
      entityType: 'globalDevices',
      entityId: ID,
      payload: {
        id: ID,
        globalProjectId: GPID,
        deviceName: 'VAV-2',
        macAddress: undefined,                   // ← user cleared it (dropped on push)
        updatedAt: '2026-03-20T00:00:00.000Z',
        syncVersion: 3,
      },
      userId: TEST_USER_ID,
      status: 'pending',
      createdAt: new Date().toISOString(),
      retriedCount: 0,
    };
    dbMocks.getPendingSyncItems.mockResolvedValueOnce([item]);

    await manager.processQueue();

    // The clear is a real divergence → conflict raised, cloud row NOT adopted.
    expect(dbMocks.addSyncConflict).toHaveBeenCalledTimes(1);
    expect(dbMocks.bulkPutSilent).not.toHaveBeenCalled();
    manager.stop();
  });
});
