import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pull pagination order-column regression test.
//
// pullSync applies an explicit .order() so .range() page boundaries are
// deterministic. The order column must EXIST on every table:
//   • append-only logs (activity_log / global_activity_log) → `timestamp`
//   • global_project_preferences → `global_project_id` (composite PK
//     user_id + global_project_id; the table has NO `id` column — ordering
//     by `id` raises 42703 "column global_project_preferences.id does not
//     exist" and fails the table's pull on EVERY cycle, so preferences
//     never roam to other devices)
//   • everything else → `id`

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

import { SyncManager } from '../sync-manager';
import { entityTypeToTable } from '../field-map';

Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true },
  writable: true,
  configurable: true,
});

// Unique per-file user id — the module-level membership cache is keyed by
// userId, so reusing an id from another test file would cross-pollute.
const TEST_USER_ID = '00000000-aaaa-bbbb-cccc-555555555555';

// ── Pull-query mock ────────────────────────────────────────────────────────
// pullSync builds: from(table).select('*').{eq|in}().[is()].[gte()].order().range()
// Records the column passed to .order() per table.
function makeOrderCapturingClient() {
  const orderColByTable: Record<string, string> = {};

  function from(table: string) {
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    chain.select = passthrough;
    chain.eq = passthrough;
    chain.in = passthrough;
    chain.is = passthrough;
    chain.gte = passthrough;
    chain.order = (col: string) => {
      orderColByTable[table] = col;
      return chain;
    };
    chain.range = () => Promise.resolve({ data: [], error: null });
    // membership query path: from().select().eq() awaited directly (no range)
    chain.then = (resolve: (v: unknown) => void) =>
      resolve({ data: [], error: null });
    return chain;
  }

  return {
    client: { from: vi.fn(from) } as never,
    orderColByTable,
  };
}

describe('pullSync pagination order column', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('orders each table by a column that exists on it', async () => {
    const { client, orderColByTable } = makeOrderCapturingClient();

    const manager = new SyncManager(client, TEST_USER_ID);
    await manager.pullSync(null);

    // global_project_preferences has no `id` column — ordering by `id` is the
    // 42703 pull failure reported 2026-06-12 (v4.41.0). With user_id pinned by
    // the pull filter, global_project_id alone is unique and stable.
    expect(orderColByTable[entityTypeToTable.globalProjectPreferences])
      .toBe('global_project_id');

    // Append-only logs page by their insertion clock.
    expect(orderColByTable[entityTypeToTable.activityLog]).toBe('timestamp');

    // Plain user-owned tables keep the synthetic-PK ordering.
    expect(orderColByTable[entityTypeToTable.devices]).toBe('id');
  });
});
