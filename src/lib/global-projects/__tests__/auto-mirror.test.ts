import { describe, it, expect, vi, beforeEach } from 'vitest';

// Tests the automatic global→local mirror ENGINE (reconcileGlobalToLocalAuto):
//   • idempotency — a second pass over unchanged rows enqueues zero local writes
//   • global tombstone → local delete (delete propagation)
//   • a local-only row (never shared up) survives a mirror pass (no data loss)
//   • per-device gate — an unlinked / mismatched local project mirrors nothing
//   • dirty-guard — a tombstone whose local row has a pending push is deferred
//
// Uses a STATEFUL in-memory `@/lib/db` mock so writes persist and the second
// pass reads them back (the read-after-write idempotency depends on this), plus
// a configurable Supabase chain mock for the global reads.

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  project: null as Row | null,
  devices: [] as Array<Row & { id: string; projectId: string; updatedAt?: string }>,
  meta: new Map<string, string>(),
  pending: new Set<string>(), // `${entityType}-${id}` with an un-pushed local item
}));

const dbMocks = vi.hoisted(() => {
  const empty = () => vi.fn(async () => []);
  return {
    getProject: vi.fn(async (id: string) => (state.project && state.project.id === id ? state.project : null)),
    getAllProjects: vi.fn(async () => (state.project ? [state.project] : [])),
    getSyncMeta: vi.fn(async (k: string) => state.meta.get(k) ?? null),
    setSyncMeta: vi.fn(async (k: string, v: string) => { state.meta.set(k, v); }),
    hasUnpushedSyncItem: vi.fn(async (et: string, id: string) => state.pending.has(`${et}-${id}`)),
    // CFM-2: the auto-mirror live-upsert dirty-guard reads the whole un-pushed
    // key set once per pair — back it with the same stateful `pending` set so
    // the guard is genuinely exercised.
    getUnpushedSyncItemKeys: vi.fn(async () => new Set(state.pending)),
    addSyncConflict: vi.fn(),
    addActivity: vi.fn(),
    // devices — stateful (the pair under test)
    getProjectDevices: vi.fn(async (pid: string) => state.devices.filter((d) => d.projectId === pid)),
    saveDevice: vi.fn(async (d: Row & { id: string; projectId: string }) => {
      const i = state.devices.findIndex((x) => x.id === d.id);
      if (i >= 0) state.devices[i] = d as never; else state.devices.push(d as never);
    }),
    deleteDevice: vi.fn(async (id: string) => { state.devices = state.devices.filter((d) => d.id !== id); }),
    // the other 14 pairs — empty readers + no-op writers/deleters (never hit when their tables are empty)
    getProjectNotes: empty(), getProjectIpPlan: empty(), getProjectDailyReports: empty(),
    getProjectDiagrams: empty(), getProjectFiles: empty(), getProjectPpclDocuments: empty(),
    getProjectTerminalLogs: empty(), getProjectPidTuningSessions: empty(), getProjectPsychSessions: empty(),
    getProjectRegisterCalculations: empty(), getProjectPingSessions: empty(), getProjectTrendSessions: empty(),
    getProjectConnectionProfiles: empty(), getProjectDxrs: empty(),
    saveNote: vi.fn(), saveIpEntry: vi.fn(), saveDailyReport: vi.fn(), saveDiagram: vi.fn(),
    saveFile: vi.fn(), savePpclDocument: vi.fn(), saveTerminalLog: vi.fn(), savePidTuningSession: vi.fn(),
    savePsychSession: vi.fn(), saveRegisterCalculation: vi.fn(), savePingSession: vi.fn(),
    saveTrendSession: vi.fn(), saveConnectionProfile: vi.fn(), addProjectDxr: vi.fn(),
    deleteNote: vi.fn(), deleteIpEntry: vi.fn(), deleteDailyReport: vi.fn(), deleteDiagram: vi.fn(),
    deleteFile: vi.fn(), deletePpclDocument: vi.fn(), deleteTerminalLog: vi.fn(), deletePidTuningSession: vi.fn(),
    deletePsychSession: vi.fn(), deleteRegisterCalculation: vi.fn(), deletePingSession: vi.fn(),
    deleteTrendSession: vi.fn(), deleteConnectionProfile: vi.fn(), deleteProjectDxr: vi.fn(),
    getFileBlob: vi.fn(), saveFileBlob: vi.fn(), deleteFileBlob: vi.fn(),
  };
});
vi.mock('@/lib/db', () => dbMocks);

vi.mock('@/lib/storage', () => ({
  buildStoragePath: vi.fn(), uploadBlobToStorage: vi.fn(), downloadFromStorage: vi.fn(),
}));
vi.mock('@/lib/global-projects/api', () => ({ logGlobalActivity: vi.fn() }));

const supa = vi.hoisted(() => ({ live: {} as Record<string, Row[]>, tomb: {} as Record<string, Row[]> }));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => ({
    from(table: string) {
      let mode: 'live' | 'tomb' = 'live';
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        is: () => b,                       // .is('deleted_at', null) → live query
        not: () => { mode = 'tomb'; return b; }, // .not('deleted_at','is',null) → tombstones
        gte: () => b,
        then: (res: (v: { data: Row[]; error: null }) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve({ data: (mode === 'tomb' ? supa.tomb[table] : supa.live[table]) ?? [], error: null }).then(res, rej),
      };
      return b;
    },
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  }),
}));

import { reconcileGlobalToLocalAuto } from '../reconcile';

const GID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DEV = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function globalDevice(over: Partial<Row> = {}): Row {
  return {
    id: DEV, global_project_id: GID, device_name: 'AHU-1', status: 'active',
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-06-01T00:00:00.000Z',
    created_by: 'u2', ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.project = { id: LID, syncedGlobalId: GID, name: 'Linked', updatedAt: '2026-01-01T00:00:00.000Z' };
  state.devices = [];
  state.meta = new Map();
  state.pending = new Set();
  supa.live = {};
  supa.tomb = {};
});

describe('reconcileGlobalToLocalAuto — automatic global→local mirror', () => {
  it('is idempotent: a second pass over unchanged rows enqueues ZERO local writes', async () => {
    supa.live['global_devices'] = [globalDevice()];

    const r1 = await reconcileGlobalToLocalAuto(GID, LID);
    expect(r1.pulled).toBe(1);
    expect(dbMocks.saveDevice).toHaveBeenCalledTimes(1);
    expect(state.devices.map((d) => d.id)).toEqual([DEV]);

    dbMocks.saveDevice.mockClear();
    const r2 = await reconcileGlobalToLocalAuto(GID, LID);
    // Unchanged global row (same updated_at) → skipped, no save, no push.
    expect(r2.pulled).toBe(0);
    expect(r2.skipped).toBeGreaterThanOrEqual(1);
    expect(dbMocks.saveDevice).not.toHaveBeenCalled();
  });

  it('re-saves only when the global row is genuinely newer (global wins)', async () => {
    supa.live['global_devices'] = [globalDevice()];
    await reconcileGlobalToLocalAuto(GID, LID);
    dbMocks.saveDevice.mockClear();

    // Global edited later → must overwrite local.
    supa.live['global_devices'] = [globalDevice({ device_name: 'AHU-1-RENAMED', updated_at: '2026-07-01T00:00:00.000Z' })];
    const r = await reconcileGlobalToLocalAuto(GID, LID);
    expect(r.pulled).toBe(1);
    expect(dbMocks.saveDevice).toHaveBeenCalledTimes(1);
    expect(state.devices[0].deviceName).toBe('AHU-1-RENAMED');
  });

  it('CFM-2 dirty-guard: a newer global row must NOT overwrite a local row with a pending (un-pushed) edit', async () => {
    // Mirror the device down, then the user edits it locally — the edit is
    // still in the push queue (pending). A peer's global edit arrives that
    // looks newer by wall-clock (possibly skew). The auto mirror must keep the
    // local edit; it will push and conflict-resolve through the push path.
    supa.live['global_devices'] = [globalDevice()];
    await reconcileGlobalToLocalAuto(GID, LID);
    dbMocks.saveDevice.mockClear();

    state.devices[0].deviceName = 'MY-UNSHARED-EDIT';
    state.pending.add(`devices-${DEV}`); // un-pushed local queue item

    supa.live['global_devices'] = [globalDevice({ device_name: 'PEER-EDIT', updated_at: '2026-07-01T00:00:00.000Z' })];
    const r = await reconcileGlobalToLocalAuto(GID, LID);

    expect(dbMocks.saveDevice).not.toHaveBeenCalled();
    expect(state.devices[0].deviceName).toBe('MY-UNSHARED-EDIT');
    expect(r.pulled).toBe(0);

    // Once the local edit has flushed (no pending item), the global row applies.
    state.pending.delete(`devices-${DEV}`);
    const r2 = await reconcileGlobalToLocalAuto(GID, LID);
    expect(r2.pulled).toBe(1);
    expect(state.devices[0].deviceName).toBe('PEER-EDIT');
  });

  it('propagates a GLOBAL tombstone down to a local delete + advances the cursor', async () => {
    // First mirror the device down.
    supa.live['global_devices'] = [globalDevice()];
    await reconcileGlobalToLocalAuto(GID, LID);
    expect(state.devices).toHaveLength(1);

    // Now the device is deleted globally: gone from live, present as a tombstone.
    supa.live['global_devices'] = [];
    supa.tomb['global_devices'] = [{ id: DEV, updated_at: '2026-07-01T00:00:00.000Z' }];
    dbMocks.deleteDevice.mockClear();

    const r = await reconcileGlobalToLocalAuto(GID, LID);
    expect(dbMocks.deleteDevice).toHaveBeenCalledWith(DEV);
    expect(state.devices).toHaveLength(0);
    expect(r.deleted).toBe(1);
    // Cursor advanced to the tombstone's updated_at.
    expect(state.meta.get(`mirror:tomb:${GID}:devices`)).toBe('2026-07-01T00:00:00.000Z');
  });

  it('NEVER deletes a local-only row (no global live row, no global tombstone)', async () => {
    // A device the user added directly to their linked LOCAL project, never shared up.
    const LOCAL_ONLY = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    state.devices = [{ id: LOCAL_ONLY, projectId: LID, deviceName: 'local-only', updatedAt: '2026-05-01T00:00:00.000Z' }];
    // Unrelated global change present; the local-only id appears in neither live nor tombstones.
    supa.live['global_devices'] = [globalDevice()];
    supa.tomb['global_devices'] = [{ id: DEV, updated_at: '2026-07-01T00:00:00.000Z' }];

    await reconcileGlobalToLocalAuto(GID, LID);
    expect(dbMocks.deleteDevice).not.toHaveBeenCalledWith(LOCAL_ONLY);
    expect(state.devices.some((d) => d.id === LOCAL_ONLY)).toBe(true);
  });

  it('per-device gate: mirrors NOTHING when the local project is not linked to this global', async () => {
    state.project = { id: LID, syncedGlobalId: 'some-other-global-id', name: 'Unlinked' };
    supa.live['global_devices'] = [globalDevice()];
    supa.tomb['global_devices'] = [{ id: DEV, updated_at: '2026-07-01T00:00:00.000Z' }];

    const r = await reconcileGlobalToLocalAuto(GID, LID);
    expect(r).toEqual({ pulled: 0, deleted: 0, skipped: 0, failed: 0 });
    expect(dbMocks.saveDevice).not.toHaveBeenCalled();
    expect(dbMocks.deleteDevice).not.toHaveBeenCalled();
  });

  it('dirty-guard: defers a tombstone delete while the local row has a pending push (cursor not advanced)', async () => {
    supa.live['global_devices'] = [globalDevice()];
    await reconcileGlobalToLocalAuto(GID, LID);

    supa.live['global_devices'] = [];
    supa.tomb['global_devices'] = [{ id: DEV, updated_at: '2026-07-01T00:00:00.000Z' }];
    state.pending.add(`devices-${DEV}`); // the local row's own push hasn't landed yet
    dbMocks.deleteDevice.mockClear();

    await reconcileGlobalToLocalAuto(GID, LID);
    // Deferred — not deleted, and the cursor must NOT advance past it.
    expect(dbMocks.deleteDevice).not.toHaveBeenCalled();
    expect(state.devices).toHaveLength(1);
    expect(state.meta.get(`mirror:tomb:${GID}:devices`)).toBeUndefined();
  });
});
