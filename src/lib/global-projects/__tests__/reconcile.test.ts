import { describe, it, expect, vi, beforeEach } from 'vitest';
import { v4 as uuid } from 'uuid';

// ─── Module mocks ───────────────────────────────────────────────────────────
// vi.mock() is hoisted above imports, so factory bodies can't close over
// regular `const` bindings — those would be in the TDZ when the factory runs.
// vi.hoisted() exists to thread mutable handles through that hoist.

const dbMocks = vi.hoisted(() => ({
  // Project I/O
  getProject: vi.fn(),
  saveProject: vi.fn(),
  getAllProjects: vi.fn(),
  // Child loaders (one per pair)
  getProjectNotes: vi.fn(),
  getProjectDevices: vi.fn(),
  getProjectIpPlan: vi.fn(),
  getProjectDailyReports: vi.fn(),
  getProjectDiagrams: vi.fn(),
  getProjectFiles: vi.fn(),
  getProjectPpclDocuments: vi.fn(),
  getProjectTerminalLogs: vi.fn(),
  getProjectPidTuningSessions: vi.fn(),
  getProjectPsychSessions: vi.fn(),
  getProjectRegisterCalculations: vi.fn(),
  getProjectPingSessions: vi.fn(),
  getProjectTrendSessions: vi.fn(),
  getProjectConnectionProfiles: vi.fn(),
  // Child savers
  saveNote: vi.fn(),
  saveDevice: vi.fn(),
  saveIpEntry: vi.fn(),
  saveDailyReport: vi.fn(),
  saveDiagram: vi.fn(),
  saveFile: vi.fn(),
  savePpclDocument: vi.fn(),
  saveTerminalLog: vi.fn(),
  savePidTuningSession: vi.fn(),
  savePsychSession: vi.fn(),
  saveRegisterCalculation: vi.fn(),
  savePingSession: vi.fn(),
  saveTrendSession: vi.fn(),
  saveConnectionProfile: vi.fn(),
  // Activity log + blob helpers
  addActivity: vi.fn(),
  getFileBlob: vi.fn(),
  saveFileBlob: vi.fn(),
}));

vi.mock('@/lib/db', () => dbMocks);

const storageMocks = vi.hoisted(() => ({
  buildStoragePath: vi.fn(
    (gpid: string, fileName: string, kind: string) => `${kind}/${gpid}/${fileName}`,
  ),
  uploadBlobToStorage: vi.fn(),
  downloadFromStorage: vi.fn(),
}));

vi.mock('@/lib/storage', () => storageMocks);

const apiMocks = vi.hoisted(() => ({
  logGlobalActivity: vi.fn(),
}));

vi.mock('@/lib/global-projects/api', () => apiMocks);

// ─── Supabase mock harness ───────────────────────────────────────────────────
// A scratch object the tests rewrite per-scenario. The shape mirrors a
// `.from(table).select|insert|upsert|update().eq|is|maybeSingle|single()` chain.

type Row = Record<string, unknown>;

interface SupabaseStub {
  /** Records every `.upsert(row, opts)` call, keyed by table name. */
  upserts: Array<{ table: string; row: Row; opts?: { onConflict?: string } }>;
  /** Per-table `select('id, access_code').eq('id', X).is('deleted_at', null).maybeSingle()` return value. */
  projectLookupResult: Row | null;
  /** Rows for `select('id, updated_at, storage_path').eq('global_project_id', X)`. */
  existingChildRowsByTable: Record<string, Row[]>;
  /** Rows for `select('*').eq('global_project_id', X).is('deleted_at', null)`. */
  childRowsByTable: Record<string, Row[]>;
  /** Result for `select('*').eq('id', X).is('deleted_at', null).single()` against global_projects. */
  globalProjectSingleResult: Row | null;
}

const supabaseState = vi.hoisted(() => {
  const stub: { current: SupabaseStub | null } = { current: null };
  return stub;
});

function makeSupabaseStub(): SupabaseStub {
  return {
    upserts: [],
    projectLookupResult: null,
    existingChildRowsByTable: {},
    childRowsByTable: {},
    globalProjectSingleResult: null,
  };
}

function makeFromQuery(table: string) {
  let _selectedFields = '*';
  let _terminalRows: Row[] | null = null;
  let _maybeSingle: Row | null = null;
  let _single: Row | null = null;

  const query: Record<string, unknown> = {};

  const setRowsByContext = () => {
    const s = supabaseState.current;
    if (!s) return;
    if (table === 'global_projects') {
      if (_selectedFields.startsWith('id') && /access_code/.test(_selectedFields)) {
        _maybeSingle = s.projectLookupResult;
      } else {
        _single = s.globalProjectSingleResult;
      }
    } else if (_selectedFields === 'id, updated_at, storage_path') {
      _terminalRows = s.existingChildRowsByTable[table] ?? [];
    } else {
      _terminalRows = s.childRowsByTable[table] ?? [];
    }
  };

  query.select = vi.fn((fields: string = '*') => {
    _selectedFields = fields;
    return query;
  });
  query.eq = vi.fn(() => query);
  query.is = vi.fn(() => query);
  query.in = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => {
    setRowsByContext();
    return { data: _maybeSingle, error: null };
  });
  query.single = vi.fn(async () => {
    setRowsByContext();
    return { data: _single, error: null };
  });
  // Terminal-await shape:
  //   const { data, error } = await supabase.from(t).select(...).eq(...).is(...);
  query.then = (resolve: (v: { data: Row[]; error: null }) => unknown) => {
    setRowsByContext();
    return resolve({ data: _terminalRows ?? [], error: null });
  };
  query.upsert = vi.fn(async (row: Row, opts?: { onConflict?: string }) => {
    supabaseState.current?.upserts.push({ table, row, opts });
    return { error: null };
  });

  return query;
}

const supabaseMock = vi.hoisted(() => {
  // Construct via factory at hoist time; mock functions are real vi.fn here.
  return {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
    rpc: vi.fn(),
  };
});

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => supabaseMock,
}));

// Provide a minimal crypto.getRandomValues for the access-code fallback path
// (Node test env doesn't always expose globalThis.crypto).
if (typeof (globalThis as { crypto?: Crypto }).crypto?.getRandomValues !== 'function') {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      getRandomValues<T extends ArrayBufferView>(arr: T): T {
        const view = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
        for (let i = 0; i < view.length; i++) view[i] = Math.floor(Math.random() * 256);
        return arr;
      },
    },
    configurable: true,
  });
}

// ─── SUT import (after all mocks are in place) ─────────────────────────────

import {
  RECONCILED_ENTITY_PAIRS,
  reconcileLocalToGlobal,
  reconcileGlobalToLocal,
} from '../reconcile';
import type { Project, FieldNote, ProjectFile } from '@/types';
import type { GlobalProject } from '@/types/global-projects';

// ─── Shared fixture builders ────────────────────────────────────────────────

const USER_ID = 'user-uuid-1111-1111-1111-111111111111';

function makeLocalProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'local-uuid-1',
    name: 'Test Project',
    customerName: '',
    siteAddress: '',
    buildingArea: '',
    projectNumber: '',
    technicianNotes: '',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    tags: [],
    status: 'active',
    contacts: [],
    isPinned: false,
    isOfflineAvailable: false,
    ...overrides,
  };
}

function makeGlobalProject(overrides: Partial<GlobalProject> = {}): GlobalProject {
  return {
    id: 'global-uuid-1',
    createdBy: USER_ID,
    name: 'Test Project',
    jobSiteName: 'Test Project',
    siteAddress: '',
    buildingArea: '',
    projectNumber: '',
    description: '',
    customerName: '',
    technicianNotes: '',
    panelRosterSummary: null,
    networkSummary: null,
    contacts: [],
    accessCode: 'ABC-1234',
    tags: [],
    status: 'active',
    deletedAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── Test suite ─────────────────────────────────────────────────────────────

describe('reconcile.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseState.current = makeSupabaseStub();

    // Re-arm defaults (clearAllMocks wipes implementations set with mockResolvedValue too,
    // depending on vitest version; explicit re-arming keeps tests reproducible).
    dbMocks.saveProject.mockResolvedValue(undefined);
    dbMocks.getAllProjects.mockResolvedValue([]);
    dbMocks.addActivity.mockResolvedValue(undefined);
    dbMocks.getFileBlob.mockResolvedValue(null);
    dbMocks.saveFileBlob.mockResolvedValue(undefined);
    for (const fn of [
      dbMocks.getProjectNotes, dbMocks.getProjectDevices, dbMocks.getProjectIpPlan,
      dbMocks.getProjectDailyReports, dbMocks.getProjectDiagrams, dbMocks.getProjectFiles,
      dbMocks.getProjectPpclDocuments, dbMocks.getProjectTerminalLogs,
      dbMocks.getProjectPidTuningSessions, dbMocks.getProjectPsychSessions,
      dbMocks.getProjectRegisterCalculations, dbMocks.getProjectPingSessions,
      dbMocks.getProjectTrendSessions, dbMocks.getProjectConnectionProfiles,
    ]) {
      fn.mockResolvedValue([]);
    }
    for (const fn of [
      dbMocks.saveNote, dbMocks.saveDevice, dbMocks.saveIpEntry, dbMocks.saveDailyReport,
      dbMocks.saveDiagram, dbMocks.saveFile, dbMocks.savePpclDocument, dbMocks.saveTerminalLog,
      dbMocks.savePidTuningSession, dbMocks.savePsychSession, dbMocks.saveRegisterCalculation,
      dbMocks.savePingSession, dbMocks.saveTrendSession, dbMocks.saveConnectionProfile,
    ]) {
      fn.mockResolvedValue(undefined);
    }

    storageMocks.buildStoragePath.mockImplementation(
      (gpid: string, fileName: string, kind: string) => `${kind}/${gpid}/${fileName}`,
    );
    storageMocks.uploadBlobToStorage.mockResolvedValue(undefined);
    storageMocks.downloadFromStorage.mockResolvedValue(new Blob(['stub']));

    apiMocks.logGlobalActivity.mockResolvedValue({ ok: true, data: {} });

    supabaseMock.from.mockImplementation((table: string) => makeFromQuery(table));
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
    });
    supabaseMock.rpc.mockResolvedValue({ data: 'ABC-1234', error: null });
  });

  // ─── (a) Entity pair count is locked ──────────────────────────────────────

  it('exports exactly 14 reconciled entity pairs', () => {
    expect(RECONCILED_ENTITY_PAIRS.length).toBe(14);
    // Sanity: every pair has a key, a local store name, and a global store name.
    for (const pair of RECONCILED_ENTITY_PAIRS) {
      expect(typeof pair.key).toBe('string');
      expect(typeof pair.local).toBe('string');
      expect(typeof pair.global).toBe('string');
    }
  });

  // ─── (b) Idempotency — second reconcile does not re-insert the project ──

  it('does not re-create the global project row on a second reconcile', async () => {
    // First reconcile: no syncedGlobalId → create.
    dbMocks.getProject.mockResolvedValueOnce(makeLocalProject({ syncedGlobalId: undefined }));
    const first = await reconcileLocalToGlobal('local-uuid-1');

    // After write-back, the local project should record the global id.
    const savedRow = dbMocks.saveProject.mock.calls[0]?.[0] as Project | undefined;
    expect(savedRow?.syncedGlobalId).toBe(first.globalProjectId);

    // Second reconcile: local project already linked.
    // Supabase lookup must report an existing row so we go down the update path.
    supabaseState.current!.projectLookupResult = {
      id: first.globalProjectId,
      access_code: first.accessCode ?? 'ABC-1234',
    };
    dbMocks.getProject.mockResolvedValueOnce(
      makeLocalProject({ syncedGlobalId: first.globalProjectId }),
    );

    const projectUpsertsBefore = supabaseState.current!.upserts.filter(
      (u) => u.table === 'global_projects',
    ).length;

    const second = await reconcileLocalToGlobal('local-uuid-1');

    const projectUpsertsAfter = supabaseState.current!.upserts.filter(
      (u) => u.table === 'global_projects',
    ).length;

    // The second pass should produce exactly one upsert (an in-place update,
    // not a fresh insert with a new id).
    expect(projectUpsertsAfter - projectUpsertsBefore).toBe(1);
    expect(second.globalProjectId).toBe(first.globalProjectId);
    expect(second.isNewProject).toBe(false);
  });

  // ─── (c) Local→Global preserves entity UUIDs ──────────────────────────────

  it('preserves note UUIDs when pushing local → global', async () => {
    dbMocks.getProject.mockResolvedValue(makeLocalProject());
    const note: FieldNote = {
      id: 'note-uuid-1',
      projectId: 'local-uuid-1',
      content: 'hello',
      category: 'general',
      author: 'tech',
      isPinned: false,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      tags: [],
    };
    dbMocks.getProjectNotes.mockResolvedValue([note]);

    await reconcileLocalToGlobal('local-uuid-1');

    const noteUpsert = supabaseState.current!.upserts.find(
      (u) => u.table === 'global_field_notes',
    );
    expect(noteUpsert).toBeDefined();
    expect((noteUpsert!.row as { id: string }).id).toBe('note-uuid-1');
  });

  // ─── (d) Global→Local preserves entity UUIDs ──────────────────────────────

  it('preserves note UUIDs when pulling global → local', async () => {
    const gp = makeGlobalProject({ id: 'global-uuid-1' });
    supabaseState.current!.globalProjectSingleResult = {
      id: gp.id,
      created_by: gp.createdBy,
      name: gp.name,
      job_site_name: gp.jobSiteName,
      site_address: gp.siteAddress,
      building_area: gp.buildingArea,
      project_number: gp.projectNumber,
      description: gp.description,
      customer_name: gp.customerName,
      technician_notes: gp.technicianNotes,
      panel_roster_summary: gp.panelRosterSummary,
      network_summary: gp.networkSummary,
      contacts: gp.contacts,
      access_code: gp.accessCode,
      tags: gp.tags,
      status: gp.status,
      deleted_at: gp.deletedAt,
      created_at: gp.createdAt,
      updated_at: gp.updatedAt,
    };
    dbMocks.getAllProjects.mockResolvedValue([]);
    dbMocks.getProject.mockResolvedValue(null);

    supabaseState.current!.childRowsByTable['global_field_notes'] = [
      {
        id: 'note-uuid-1',
        global_project_id: gp.id,
        created_by: USER_ID,
        updated_by: USER_ID,
        file_id: null,
        content: 'hi',
        category: 'general',
        is_pinned: false,
        tags: [],
        deleted_at: null,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
      },
    ];

    await reconcileGlobalToLocal('global-uuid-1');

    expect(dbMocks.saveNote).toHaveBeenCalled();
    const savedNote = dbMocks.saveNote.mock.calls[0][0] as FieldNote;
    expect(savedNote.id).toBe('note-uuid-1');
  });

  // ─── (e) syncedGlobalId is written back after a fresh share ──────────────

  it('writes syncedGlobalId back to the local project after creating a new global', async () => {
    dbMocks.getProject.mockResolvedValue(makeLocalProject({ syncedGlobalId: undefined }));
    supabaseMock.rpc.mockResolvedValue({ data: 'ABC-1234', error: null });

    const result = await reconcileLocalToGlobal('local-uuid-1');

    expect(result.isNewProject).toBe(true);
    expect(result.accessCode).toBe('ABC-1234');

    // Reconcile reuses the local UUID for the new global project, so
    // syncedGlobalId should equal result.globalProjectId === local id.
    const savedRow = dbMocks.saveProject.mock.calls[0]?.[0] as Project | undefined;
    expect(savedRow?.syncedGlobalId).toBe(result.globalProjectId);
    expect(result.globalProjectId).toBe('local-uuid-1');
  });

  // ─── (f) Stale syncedGlobalId is recovered ────────────────────────────────

  it('creates a fresh global and rewrites syncedGlobalId when the linked global is gone', async () => {
    dbMocks.getProject.mockResolvedValue(
      makeLocalProject({ syncedGlobalId: 'gone-uuid' }),
    );
    // projectLookupResult stays null — the linked global was deleted server-side.
    supabaseState.current!.projectLookupResult = null;

    const result = await reconcileLocalToGlobal('local-uuid-1');

    expect(result.isNewProject).toBe(true);
    expect(result.globalProjectId).not.toBe('gone-uuid');

    // The local project should be saved back with the *new* synced id.
    const savedRow = dbMocks.saveProject.mock.calls[0]?.[0] as Project | undefined;
    expect(savedRow?.syncedGlobalId).toBe(result.globalProjectId);
    expect(savedRow?.syncedGlobalId).not.toBe('gone-uuid');
  });

  // ─── (g) Lossless field mapping for GlobalProject ────────────────────────

  it('round-trips all parity fields on GlobalProject without loss', async () => {
    const localBefore = makeLocalProject({
      id: 'local-uuid-1',
      syncedGlobalId: undefined,
      customerName: 'ACME',
      technicianNotes: 'foo',
      panelRosterSummary: 'roster',
      networkSummary: 'net',
      contacts: [{ name: 'Bob', role: 'GC' }],
    });
    dbMocks.getProject.mockResolvedValue(localBefore);

    // Step 1: local → global
    await reconcileLocalToGlobal('local-uuid-1');

    const projectUpsert = supabaseState.current!.upserts.find(
      (u) => u.table === 'global_projects',
    );
    expect(projectUpsert).toBeDefined();
    const pushed = projectUpsert!.row as Row;
    expect(pushed.customer_name).toBe('ACME');
    expect(pushed.technician_notes).toBe('foo');
    expect(pushed.panel_roster_summary).toBe('roster');
    expect(pushed.network_summary).toBe('net');
    expect(pushed.contacts).toEqual([{ name: 'Bob', role: 'GC' }]);

    // Step 2: pretend the same row came back from Supabase and round-trip via
    // reconcileGlobalToLocal.
    supabaseState.current!.globalProjectSingleResult = pushed;
    dbMocks.getAllProjects.mockResolvedValue([]);
    dbMocks.getProject.mockResolvedValue(null);

    await reconcileGlobalToLocal(pushed.id as string);

    const savedLocal = dbMocks.saveProject.mock.calls.at(-1)?.[0] as Project | undefined;
    expect(savedLocal).toBeDefined();
    expect(savedLocal!.customerName).toBe('ACME');
    expect(savedLocal!.technicianNotes).toBe('foo');
    expect(savedLocal!.panelRosterSummary).toBe('roster');
    expect(savedLocal!.networkSummary).toBe('net');
    expect(savedLocal!.contacts).toEqual([{ name: 'Bob', role: 'GC' }]);
  });

  // ─── (h) Activity log is appended once, not duplicated ───────────────────

  it('appends exactly one "reconciled" global activity entry, not one per local activity row', async () => {
    dbMocks.getProject.mockResolvedValue(makeLocalProject());

    await reconcileLocalToGlobal('local-uuid-1');

    expect(apiMocks.logGlobalActivity).toHaveBeenCalledTimes(1);
    const [, action] = apiMocks.logGlobalActivity.mock.calls[0];
    expect(String(action)).toMatch(/reconciled/);
  });

  // ─── (i) Files with no blob round-trip metadata ──────────────────────────

  it('preserves file metadata with storage_path: null when the local blob is missing', async () => {
    dbMocks.getProject.mockResolvedValue(makeLocalProject());
    const file: ProjectFile = {
      id: 'file-uuid-1',
      projectId: 'local-uuid-1',
      title: 'wiring',
      fileName: 'wiring.pdf',
      fileType: 'pdf',
      mimeType: 'application/pdf',
      category: 'wiring-diagrams',
      revisionNumber: 'A',
      revisionDate: '2025-01-01',
      uploadedBy: 'tech',
      notes: '',
      tags: [],
      status: 'current',
      isPinned: false,
      isFavorite: false,
      isOfflineCached: false,
      currentVersionId: 'ver-uuid-1',
      versions: [
        {
          id: 'ver-uuid-1',
          fileId: 'file-uuid-1',
          versionNumber: 1,
          uploadedAt: '2025-01-01T00:00:00.000Z',
          uploadedBy: 'tech',
          notes: '',
          size: 0,
          status: 'current',
          blobKey: 'missing-key',
        },
      ],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      size: 0,
    };
    dbMocks.getProjectFiles.mockResolvedValue([file]);
    dbMocks.getFileBlob.mockResolvedValue(null);

    await reconcileLocalToGlobal('local-uuid-1');

    const fileUpsert = supabaseState.current!.upserts.find(
      (u) => u.table === 'global_project_files',
    );
    expect(fileUpsert).toBeDefined();
    const row = fileUpsert!.row as Row;
    expect(row.storage_path).toBeNull();
    // Metadata still preserved.
    expect(row.file_name).toBe('wiring.pdf');
    expect(row.mime_type).toBe('application/pdf');
    expect(row.title).toBe('wiring');
    expect(row.id).toBe('file-uuid-1');
  });
});

// Keep the uuid import live; future fixtures may want real UUIDs.
void uuid;
