import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the db module before importing SyncManager
vi.mock('@/lib/db', () => ({
  addSyncItem: vi.fn().mockResolvedValue(undefined),
  getPendingSyncItems: vi.fn().mockResolvedValue([]),
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
}));

// Mock field-map
vi.mock('../field-map', () => ({
  entityTypeToTable: {
    projects: 'projects',
    files: 'files',
    notes: 'notes',
    devices: 'devices',
    ipPlan: 'ip_plan',
    activityLog: 'activity_log',
    dailyReports: 'daily_reports',
    networkDiagrams: 'network_diagrams',
    commandSnippets: 'command_snippets',
    pingSessions: 'ping_sessions',
    terminalLogs: 'terminal_logs',
    connectionProfiles: 'connection_profiles',
    registerCalculations: 'register_calculations',
    pidTuningSessions: 'pid_tuning_sessions',
    ppclDocuments: 'ppcl_documents',
    bugReports: 'bug_reports',
    globalActivityLog: 'global_activity_log',
  },
  toSupabaseRow: vi.fn((_type: string, payload: Record<string, unknown>, userId: string) => ({
    ...payload,
    user_id: userId,
  })),
  fromSupabaseRow: vi.fn((_type: string, row: Record<string, unknown>) => row),
  validateSyncable: vi.fn(() => null),
  isDeletedRow: vi.fn(() => false),
  SYNC_ORDER: ['projects', 'files', 'notes', 'devices'],
  REQUIRES_PROJECT_ID: new Set(['notes', 'devices']),
  // Wave 3a added these — the sync-manager imports them at module load time
  // so the mock must expose them or the entire module fails to import.
  isGlobalEntity: vi.fn((t: string) => t.startsWith('global')),
  GLOBAL_ENTITY_TYPES: new Set<string>(['globalActivityLog']),
  // Phase 1c: the cross-user push guard reads these at runtime — the mock must
  // expose them (Set.has on undefined would throw for every queued item).
  GLOBAL_AUDITED_ENTITY_TYPES: new Set<string>([
    'globalNotes', 'globalDevices', 'globalIpPlan', 'globalDailyReports',
    'globalNetworkDiagrams', 'globalProjectFiles', 'globalPpclDocuments',
    'globalTerminalLogs', 'globalPidTuningSessions', 'globalPsychSessions',
    'globalRegisterCalculations', 'globalPingSessions', 'globalTrendSessions',
    'globalConnectionProfiles', 'globalFieldPanels', 'globalNotepadEntries',
    'globalDxrs',
  ]),
  supportsSubtractivePull: vi.fn(() => true),
  REQUIRES_GLOBAL_PROJECT_ID: new Set<string>(),
}));

import { SyncManager } from '../sync-manager';
import { addSyncItem, getPendingSyncItems, deleteSyncItem, updateSyncItem } from '@/lib/db';
import type { SyncQueueItem } from '@/types';

// Mock navigator.onLine so processQueue doesn't bail out
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true },
  writable: true,
  configurable: true,
});

// Minimal mock SupabaseClient
interface MockFrom {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

interface MockSupabaseClient {
  from: ReturnType<typeof vi.fn>;
  _mock: MockFrom;
}

function createMockSupabase(): MockSupabaseClient {
  const mockFrom: MockFrom = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
        not: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
        in: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  };

  return {
    from: vi.fn(() => mockFrom),
    _mock: mockFrom,
  };
}

const TEST_USER_ID = '00000000-1111-2222-3333-444444444444';

describe('SyncManager', () => {
  let manager: SyncManager;
  let supabase: MockSupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    supabase = createMockSupabase();
    manager = new SyncManager(supabase as never, TEST_USER_ID);
  });

  afterEach(() => {
    manager.stop();
    vi.useRealTimers();
  });

  // ─── Enqueue ────────────────────────────────────────────────

  describe('enqueue', () => {
    it('adds item to sync queue with deterministic ID', async () => {
      await manager.enqueue('create', 'projects', '11111111-2222-3333-4444-555555555555', { id: '11111111-2222-3333-4444-555555555555' });
      expect(addSyncItem).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'projects-11111111-2222-3333-4444-555555555555',
          action: 'create',
          entityType: 'projects',
          status: 'pending',
        }),
      );
    });

    it('rejects non-UUID entity IDs', async () => {
      await manager.enqueue('create', 'projects', 'not-a-uuid', { id: 'not-a-uuid' });
      expect(addSyncItem).not.toHaveBeenCalled();
    });

    it('rejects entity IDs that are demo/seed data', async () => {
      await manager.enqueue('create', 'projects', 'abc123', { id: 'abc123' });
      expect(addSyncItem).not.toHaveBeenCalled();
    });
  });

  // ─── processQueue ──────────────────────────────────────────

  describe('processQueue', () => {
    it('skips processing when already processing', async () => {
      const slowItems: SyncQueueItem[] = [{
        id: 'projects-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        action: 'create',
        entityType: 'projects',
        entityId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        payload: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
        userId: TEST_USER_ID,
        status: 'pending',
        createdAt: new Date().toISOString(),
        retriedCount: 0,
      }];

      // Make getPendingSyncItems return items on first call, then simulate slow processing
      let callCount = 0;
      vi.mocked(getPendingSyncItems).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // Simulate slow processing
          await new Promise(resolve => setTimeout(resolve, 100));
          return slowItems;
        }
        return [];
      });

      // Start first processQueue
      const p1 = manager.processQueue();
      // Start second processQueue immediately — should be skipped
      const p2 = manager.processQueue();

      // Advance timers to complete the slow processing
      await vi.advanceTimersByTimeAsync(200);
      await p1;
      await p2;

      // getPendingSyncItems should only be called once — second call was skipped
      expect(callCount).toBe(1);
    });

    it('processes items in SYNC_ORDER (projects first)', async () => {
      const items: SyncQueueItem[] = [
        {
          id: 'notes-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          action: 'create', entityType: 'notes',
          entityId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          payload: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
          userId: TEST_USER_ID, status: 'pending',
          createdAt: new Date().toISOString(), retriedCount: 0,
        },
        {
          id: 'projects-bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
          action: 'create', entityType: 'projects',
          entityId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
          payload: { id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff' },
          userId: TEST_USER_ID, status: 'pending',
          createdAt: new Date().toISOString(), retriedCount: 0,
        },
      ];

      vi.mocked(getPendingSyncItems).mockResolvedValueOnce(items);

      await manager.processQueue();

      // updateSyncItem is called with 'syncing' status — first call should be the projects item
      const updateCalls = vi.mocked(updateSyncItem).mock.calls;
      expect(updateCalls[0][0]).toMatchObject({ entityType: 'projects' });
    });

    it('retries failed items up to MAX_RETRIES', async () => {
      const item: SyncQueueItem = {
        id: 'projects-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        action: 'create', entityType: 'projects',
        entityId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        payload: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
        userId: TEST_USER_ID, status: 'pending',
        createdAt: new Date().toISOString(), retriedCount: 3,
      };

      vi.mocked(getPendingSyncItems).mockResolvedValueOnce([item]);
      // Force upsert to throw
      (supabase as { _mock: { upsert: ReturnType<typeof vi.fn> } })._mock.upsert.mockResolvedValueOnce({
        error: { message: 'network error', code: '500' },
      });

      await manager.processQueue();

      // Should update with incremented retry count (3 -> 4), still pending
      expect(updateSyncItem).toHaveBeenCalledWith(
        expect.objectContaining({ retriedCount: 4, status: 'pending' }),
      );
    });

    it('marks item as failed after MAX_RETRIES', async () => {
      const item: SyncQueueItem = {
        id: 'projects-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        action: 'create', entityType: 'projects',
        entityId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        payload: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
        userId: TEST_USER_ID, status: 'pending',
        createdAt: new Date().toISOString(), retriedCount: 4, // one away from MAX_RETRIES (5)
      };

      vi.mocked(getPendingSyncItems).mockResolvedValueOnce([item]);
      (supabase as { _mock: { upsert: ReturnType<typeof vi.fn> } })._mock.upsert.mockResolvedValueOnce({
        error: { message: 'still failing', code: '500' },
      });

      await manager.processQueue();

      expect(updateSyncItem).toHaveBeenCalledWith(
        expect.objectContaining({ retriedCount: 5, status: 'failed' }),
      );
    });

    it('deletes item on success', async () => {
      const item: SyncQueueItem = {
        id: 'projects-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        action: 'create', entityType: 'projects',
        entityId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        payload: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
        userId: TEST_USER_ID, status: 'pending',
        createdAt: new Date().toISOString(), retriedCount: 0,
      };

      vi.mocked(getPendingSyncItems).mockResolvedValueOnce([item]);

      await manager.processQueue();

      expect(deleteSyncItem).toHaveBeenCalledWith(item.id);
    });
  });

  // ─── globalActivityLog ownership guard ─────────────────────
  // Reopened bug (v4.25.0): recurring 42501 rls-rejected on global_activity_log
  // push. The timeline pulls every member's activity into IndexedDB; a pulled
  // row authored by another user was getting enqueued and re-pushed, but the
  // INSERT RLS policy (user_id = auth.uid()) rejects it forever. The fix drops
  // foreign-authored globalActivityLog push items as a successful no-op.
  describe('globalActivityLog ownership guard', () => {
    const FOREIGN_USER_ID = '7c5ca76d-fee2-40ea-b70b-5723fb0a6c15';
    const GAL_ID = '9f312a49-1111-2222-3333-444444444444';

    it('drops a globalActivityLog push item authored by another user (no upsert, no retry)', async () => {
      const item: SyncQueueItem = {
        id: `globalActivityLog-${GAL_ID}`,
        action: 'update', entityType: 'globalActivityLog',
        entityId: GAL_ID,
        payload: {
          id: GAL_ID,
          globalProjectId: '861ac1ed-aaaa-bbbb-cccc-dddddddddddd',
          userId: FOREIGN_USER_ID, // ← authored by ANOTHER user
          action: 'joined the project',
          timestamp: '2026-03-19T00:00:00.000Z',
        },
        userId: TEST_USER_ID, status: 'pending',
        createdAt: new Date().toISOString(), retriedCount: 3, // already stuck retrying
      };

      vi.mocked(getPendingSyncItems).mockResolvedValueOnce([item]);

      await manager.processQueue();

      // Dropped as a successful no-op: removed from queue …
      expect(deleteSyncItem).toHaveBeenCalledWith(item.id);
      // … never upserted (would trip the RLS WITH CHECK) …
      expect((supabase as { _mock: { upsert: ReturnType<typeof vi.fn> } })._mock.upsert)
        .not.toHaveBeenCalled();
      // … and never re-queued with a bumped retry count.
      expect(updateSyncItem).not.toHaveBeenCalledWith(
        expect.objectContaining({ retriedCount: 4 }),
      );
    });

    it('still pushes the user\'s OWN globalActivityLog row', async () => {
      const ownId = 'aaaaaaaa-1111-2222-3333-555555555555';
      const item: SyncQueueItem = {
        id: `globalActivityLog-${ownId}`,
        action: 'update', entityType: 'globalActivityLog',
        entityId: ownId,
        payload: {
          id: ownId,
          globalProjectId: '861ac1ed-aaaa-bbbb-cccc-dddddddddddd',
          userId: TEST_USER_ID, // ← authored by THIS device
          action: 'added a note',
          timestamp: '2026-03-19T00:00:00.000Z',
        },
        userId: TEST_USER_ID, status: 'pending',
        createdAt: new Date().toISOString(), retriedCount: 0,
      };

      vi.mocked(getPendingSyncItems).mockResolvedValueOnce([item]);

      await manager.processQueue();

      // Own row pushes insert-only (ignoreDuplicates) and is removed on success.
      const upsert = (supabase as { _mock: { upsert: ReturnType<typeof vi.fn> } })._mock.upsert;
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(upsert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ ignoreDuplicates: true }),
      );
      expect(deleteSyncItem).toHaveBeenCalledWith(item.id);
    });
  });

  // ─── Race condition demonstration ──────────────────────────

  describe('race condition', () => {
    it('boolean processing flag prevents concurrent execution', async () => {
      let processCount = 0;
      vi.mocked(getPendingSyncItems).mockImplementation(async () => {
        processCount++;
        // Simulate async work
        await new Promise(resolve => setTimeout(resolve, 50));
        return [];
      });

      // Fire two processQueue calls simultaneously
      const p1 = manager.processQueue();
      const p2 = manager.processQueue();

      await vi.advanceTimersByTimeAsync(100);
      await Promise.all([p1, p2]);

      // With the boolean flag, the second call should be skipped
      expect(processCount).toBe(1);
    });
  });

  // ─── Start/Stop ────────────────────────────────────────────

  describe('start/stop', () => {
    it('starts periodic processing', async () => {
      vi.mocked(getPendingSyncItems).mockResolvedValue([]);

      manager.start();

      // The first process run is chained after the recovery sweep (a microtask),
      // so flush pending timers/microtasks before asserting the immediate run.
      await vi.advanceTimersByTimeAsync(0);
      expect(getPendingSyncItems).toHaveBeenCalledTimes(1);

      // Advance past one interval
      await vi.advanceTimersByTimeAsync(5000);
      expect(getPendingSyncItems).toHaveBeenCalledTimes(2);
    });

    it('stop clears the interval', async () => {
      vi.mocked(getPendingSyncItems).mockResolvedValue([]);

      manager.start();
      // Let the recovery-sweep-chained first run complete before stopping.
      await vi.advanceTimersByTimeAsync(0);
      manager.stop();

      const callsBefore = vi.mocked(getPendingSyncItems).mock.calls.length;
      await vi.advanceTimersByTimeAsync(15000);
      expect(vi.mocked(getPendingSyncItems).mock.calls.length).toBe(callsBefore);
    });

    it('start is idempotent', () => {
      manager.start();
      manager.start(); // Should not create duplicate intervals
      manager.stop();
    });
  });

  // ─── Status callbacks ─────────────────────────────────────

  describe('status callbacks', () => {
    it('reports idle when queue is empty', async () => {
      const statusCb = vi.fn();
      manager.setStatusCallback(statusCb);

      vi.mocked(getPendingSyncItems).mockResolvedValueOnce([]);

      await manager.processQueue();

      expect(statusCb).toHaveBeenCalledWith('idle', 0);
    });

    it('reports syncing when items are being processed', async () => {
      const statusCb = vi.fn();
      manager.setStatusCallback(statusCb);

      const items: SyncQueueItem[] = [{
        id: 'projects-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        action: 'create', entityType: 'projects',
        entityId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        payload: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
        userId: TEST_USER_ID, status: 'pending',
        createdAt: new Date().toISOString(), retriedCount: 0,
      }];

      vi.mocked(getPendingSyncItems).mockResolvedValueOnce(items);

      await manager.processQueue();

      expect(statusCb).toHaveBeenCalledWith('syncing', 1);
    });
  });

  // ─── Broken entity types ──────────────────────────────────

  describe('broken entity types', () => {
    it('skips items for tables that do not exist', async () => {
      const item: SyncQueueItem = {
        id: 'projects-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        action: 'create', entityType: 'projects',
        entityId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        payload: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
        userId: TEST_USER_ID, status: 'pending',
        createdAt: new Date().toISOString(), retriedCount: 0,
      };

      // First attempt: simulate table not found error
      vi.mocked(getPendingSyncItems).mockResolvedValueOnce([item]);
      (supabase as { _mock: { upsert: ReturnType<typeof vi.fn> } })._mock.upsert.mockResolvedValueOnce({
        error: { message: 'relation "projects" does not exist', code: '42P01' },
      });

      await manager.processQueue();

      // Second attempt with same entity type: should be skipped immediately
      const item2 = { ...item, id: 'projects-bbbbbbbb-cccc-dddd-eeee-ffffffffffff', entityId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff' };
      vi.mocked(getPendingSyncItems).mockResolvedValueOnce([item2]);

      await manager.processQueue();

      // Should delete the item without trying to upsert
      expect(deleteSyncItem).toHaveBeenCalledWith(item2.id);
    });
  });
});
