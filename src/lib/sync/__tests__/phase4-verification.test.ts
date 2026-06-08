import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Phase 4 — verification gap-fillers.
//
// The five guarantee areas the audit named (delete-propagation, user-switch
// isolation, cross-user push rejection, pull-vs-pending dirty-guard, conflict
// tie-break) plus the Phase 3 invariants (allowlist, FK ordering, cascade RPC)
// are each covered by an existing test file. This file ONLY adds tests that
// close a gap those files left open:
//
//   • Delete propagation: a pulled PARENT tombstone (projects / globalProjects)
//     must route through the CASCADE helper (not bulkDeleteSilent) so children
//     are reaped too — the existing delete tests use a leaf table (devices).
//   • Cross-user push rejection: the existing tests prove globalDevices +
//     globalProjects. The audit guarantee is "ANY GLOBAL_AUDITED_ENTITY_TYPES
//     member". This parametrizes the WHOLE set so the generalization can't
//     regress for one entity.
//   • Cascade RPC fallback: the existing test proves the PGRST202 fallback. The
//     other "not deployed" signals (42883 + the message-based detection) are
//     also part of the contract and were unpinned.
//
// Uses the REAL field-map (only @/lib/db is mocked) so the cross-user guard and
// table mapping exercise genuine production logic.

vi.mock('@/lib/db', () => ({
  addSyncItem: vi.fn().mockResolvedValue(undefined),
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
  clearSyncQueue: vi.fn().mockResolvedValue(0),
  bulkPutSilent: vi.fn().mockResolvedValue(0),
  bulkDeleteSilent: vi.fn().mockResolvedValue(0),
  addSyncConflict: vi.fn().mockResolvedValue(undefined),
  getSyncConflictCount: vi.fn().mockResolvedValue(0),
  deleteSyncConflict: vi.fn().mockResolvedValue(undefined),
  getAllSyncConflicts: vi.fn().mockResolvedValue([]),
  addSyncError: vi.fn().mockResolvedValue(true),
  cascadeDeleteProject: vi.fn().mockResolvedValue(undefined),
  cascadeDeleteGlobalProject: vi.fn().mockResolvedValue(undefined),
}));

import { SyncManager } from '../sync-manager';
import {
  entityTypeToTable,
  GLOBAL_AUDITED_ENTITY_TYPES,
  REQUIRES_GLOBAL_PROJECT_ID,
} from '../field-map';
import * as db from '@/lib/db';
import type { SyncEntityType, SyncQueueItem } from '@/types';

const dbMocks = {
  getPendingSyncItems: vi.mocked(db.getPendingSyncItems),
  updateSyncItem: vi.mocked(db.updateSyncItem),
  deleteSyncItem: vi.mocked(db.deleteSyncItem),
  deleteSyncItemIfToken: vi.mocked(db.deleteSyncItemIfToken),
  bulkDeleteSilent: vi.mocked(db.bulkDeleteSilent),
  cascadeDeleteProject: vi.mocked(db.cascadeDeleteProject),
  cascadeDeleteGlobalProject: vi.mocked(db.cascadeDeleteGlobalProject),
};

Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true },
  writable: true,
  configurable: true,
});

const TEST_USER_ID = '00000000-1111-2222-3333-444444444444';
const FOREIGN_USER_ID = '7c5ca76d-fee2-40ea-b70b-5723fb0a6c15';
const GPID = '861ac1ed-aaaa-bbbb-cccc-dddddddddddd';

// ── Pull-query mock (mirrors the delete-propagation harness) ────────────────
// pullSync builds: from(table).select('*').{eq|in}().[is()].[gte()].order().range()
function makePullClient(rowsByTable: Record<string, Record<string, unknown>[]>) {
  function from(table: string) {
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    chain.select = passthrough;
    chain.eq = passthrough;
    chain.in = passthrough;
    chain.is = passthrough;
    chain.gte = passthrough;
    chain.order = passthrough;
    chain.range = (offset: number) =>
      Promise.resolve({ data: offset === 0 ? (rowsByTable[table] ?? []) : [], error: null });
    // global_project_members membership query → awaited directly.
    chain.then = (resolve: (v: unknown) => void) =>
      resolve({ data: rowsByTable[table] ?? [], error: null });
    return chain;
  }
  return { from: vi.fn(from) } as never;
}

// ─── Gap 1: PARENT tombstone pull cascades to children ──────────────────────
// The existing delete-propagation tests assert a leaf (devices) tombstone →
// bulkDeleteSilent. They never prove that a pulled PARENT tombstone routes
// through the cascade helper. Without that, a remote project delete would leave
// orphaned local children that keep pushing against RLS forever (the exact
// resurrection-feeding class Phase 1a set out to kill).
describe('Delete propagation — parent tombstone pull cascades (Phase 1a gap)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('incremental pull of a tombstoned PROJECT routes to cascadeDeleteProject (not a flat delete)', async () => {
    const DELETED_PROJECT_ID = 'aaaaaaaa-1111-2222-3333-444444444444';
    const client = makePullClient({
      [entityTypeToTable.projects]: [
        { id: DELETED_PROJECT_ID, deleted_at: '2026-06-08T00:00:00.000Z' },
      ],
    });

    const manager = new SyncManager(client, TEST_USER_ID);
    await manager.pullSync('2026-06-01T00:00:00.000Z'); // incremental → tombstones flow

    // Cascade helper used (children cleaned up too), silently — applying a
    // cloud tombstone must NOT re-enqueue an outbound delete (P1-1).
    expect(dbMocks.cascadeDeleteProject).toHaveBeenCalledWith(DELETED_PROJECT_ID, { silent: true });
    // … and NOT a flat single-store delete on the projects store.
    const flatProjectDeletes = dbMocks.bulkDeleteSilent.mock.calls.filter((c) => c[0] === 'projects');
    expect(flatProjectDeletes).toHaveLength(0);
  });

  it('incremental pull of a tombstoned GLOBAL PROJECT routes to cascadeDeleteGlobalProject', async () => {
    const DELETED_GPID = 'bbbbbbbb-1111-2222-3333-444444444444';
    const client = makePullClient({
      // membership query returns this gpid so the global pull is not skipped.
      global_project_members: [{ global_project_id: DELETED_GPID }],
      [entityTypeToTable.globalProjects]: [
        { id: DELETED_GPID, deleted_at: '2026-06-08T00:00:00.000Z' },
      ],
    });

    // Use a DISTINCT user id: fetchMyGlobalProjectIds caches memberships per-user
    // at module scope, and the PROJECT test above ran pullSync under TEST_USER_ID
    // against a client with no memberships (caching [] for the TTL window). A
    // fresh id guarantees this test's membership query actually runs.
    const FRESH_USER_ID = '99999999-aaaa-bbbb-cccc-dddddddddddd';
    const manager = new SyncManager(client, FRESH_USER_ID);
    await manager.pullSync('2026-06-01T00:00:00.000Z');

    expect(dbMocks.cascadeDeleteGlobalProject).toHaveBeenCalledWith(DELETED_GPID, { silent: true });
    const flatGpDeletes = dbMocks.bulkDeleteSilent.mock.calls.filter((c) => c[0] === 'globalProjects');
    expect(flatGpDeletes).toHaveLength(0);
  });
});

// ─── Gap 2: cross-user push guard across the WHOLE audited set ───────────────
// Existing tests prove globalDevices + globalProjects + globalActivityLog. The
// audit guarantee is "ANY GLOBAL_AUDITED_ENTITY_TYPES member". Parametrize the
// full set so a future entity added to the set without the guard wiring can't
// silently regress into a 42501 retry storm.
describe('Cross-user push rejection — every GLOBAL_AUDITED_ENTITY_TYPES member (Phase 1c gap)', () => {
  function createMockSupabase() {
    const mockFrom = {
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

  let manager: SyncManager;
  let supabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = createMockSupabase();
    manager = new SyncManager(supabase as never, TEST_USER_ID);
  });
  afterEach(() => manager.stop());

  // Every audited entity in this build requires a global_project_id (so the
  // payload also passes validateSyncable). Sanity-check that assumption holds so
  // the parametrized payloads below are valid for the whole set.
  it('sanity: every audited entity requires a global_project_id', () => {
    for (const entityType of GLOBAL_AUDITED_ENTITY_TYPES) {
      expect(REQUIRES_GLOBAL_PROJECT_ID.has(entityType)).toBe(true);
    }
  });

  for (const entityType of GLOBAL_AUDITED_ENTITY_TYPES) {
    it(`drops a foreign-authored ${entityType} update as a no-op (no upsert, no retry)`, async () => {
      const id = 'cccc1111-2222-3333-4444-555555555555';
      const item: SyncQueueItem = {
        id: `${entityType}-${id}`,
        action: 'update',
        entityType,
        entityId: id,
        payload: {
          id,
          globalProjectId: GPID,
          createdBy: FOREIGN_USER_ID, // ← authored by ANOTHER member
          updatedBy: FOREIGN_USER_ID,
          updatedAt: '2026-03-19T00:00:00.000Z',
        },
        userId: TEST_USER_ID,
        status: 'pending',
        createdAt: new Date().toISOString(),
        retriedCount: 3, // already stuck retrying
      };

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
  }

  it('still upserts an OWN-authored audited row (guard is scoped to foreign authors)', async () => {
    const entityType: SyncEntityType = 'globalNotes';
    const id = 'dddd1111-2222-3333-4444-555555555555';
    const item: SyncQueueItem = {
      id: `${entityType}-${id}`,
      action: 'update',
      entityType,
      entityId: id,
      payload: {
        id, globalProjectId: GPID, content: 'mine',
        createdBy: TEST_USER_ID, updatedBy: TEST_USER_ID, updatedAt: '2026-03-19T00:00:00.000Z',
      },
      userId: TEST_USER_ID,
      status: 'pending',
      createdAt: new Date().toISOString(),
      retriedCount: 0,
    };

    dbMocks.getPendingSyncItems.mockResolvedValueOnce([item]);
    await manager.processQueue();

    expect(supabase._mock.upsert).toHaveBeenCalledTimes(1);
    expect(dbMocks.deleteSyncItemIfToken).toHaveBeenCalledWith(item.id, expect.any(String));
  });
});

// ─── Gap 3: cascade RPC "not deployed" fallback signals ─────────────────────
// The existing sync-manager test proves the PGRST202 fallback + the real-error
// no-fallback. The other "not deployed" signals (42883, and the message-based
// "could not find the function" detection) are also part of the contract and
// were unpinned — a regression there would turn an un-migrated DB into a hard
// failure instead of a graceful single-statement fallback.
describe('Cascade RPC — all "not deployed" fallback signals (Phase 3b gap)', () => {
  const PID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  function createMockSupabase() {
    const updateChain = {
      eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    };
    const mockFrom = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnValue(updateChain),
    };
    return {
      from: vi.fn(() => mockFrom),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      _mock: mockFrom,
      _update: mockFrom.update,
    };
  }

  function mkDelete(): SyncQueueItem {
    return {
      id: `projects-${PID}`,
      action: 'delete',
      entityType: 'projects',
      entityId: PID,
      payload: { id: PID },
      userId: TEST_USER_ID,
      status: 'pending',
      createdAt: new Date().toISOString(),
      retriedCount: 0,
    };
  }

  let supabase: ReturnType<typeof createMockSupabase>;
  let manager: SyncManager;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = createMockSupabase();
    manager = new SyncManager(supabase as never, TEST_USER_ID);
  });
  afterEach(() => manager.stop());

  it('falls back to single-statement soft-delete on a 42883 (function does not exist)', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { code: '42883', message: 'function does not exist' } });
    dbMocks.getPendingSyncItems.mockResolvedValueOnce([mkDelete()]);

    await manager.processQueue();

    expect(supabase.rpc).toHaveBeenCalledWith('cascade_soft_delete_project', { p_project_id: PID });
    // Legacy parent-only soft-delete update ran as the fallback.
    expect(supabase._update).toHaveBeenCalledWith({ deleted_at: expect.any(String) });
    expect(dbMocks.deleteSyncItemIfToken).toHaveBeenCalledWith(`projects-${PID}`, expect.any(String));
  });

  it('falls back on a message-only "Could not find the function" error (no code)', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Could not find the function public.cascade_soft_delete_project' },
    });
    dbMocks.getPendingSyncItems.mockResolvedValueOnce([mkDelete()]);

    await manager.processQueue();

    expect(supabase._update).toHaveBeenCalledWith({ deleted_at: expect.any(String) });
    expect(dbMocks.deleteSyncItemIfToken).toHaveBeenCalledWith(`projects-${PID}`, expect.any(String));
  });
});
