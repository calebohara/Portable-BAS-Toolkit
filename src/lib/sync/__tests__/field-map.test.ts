import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SyncEntityType } from '@/types';
import {
  toSupabaseRow,
  fromSupabaseRow,
  validateSyncable,
  isDeletedRow,
  entityTypeToTable,
  SYNC_ORDER,
  REQUIRES_PROJECT_ID,
  _resetDroppedColumnWarnings,
  orderPushBatch,
  pushOrderIndex,
} from '../field-map';

const USER_ID = '00000000-1111-2222-3333-444444444444';
const PROJECT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ENTITY_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';

describe('field-map — toSupabaseRow', () => {
  it('injects user_id on every row', () => {
    const row = toSupabaseRow('projects', { id: ENTITY_ID, name: 'Test' }, USER_ID);
    expect(row.user_id).toBe(USER_ID);
  });

  it('converts camelCase to snake_case via explicit override', () => {
    const row = toSupabaseRow(
      'projects',
      { id: ENTITY_ID, customerName: 'Acme', siteAddress: '123 Main St', isPinned: true },
      USER_ID,
    );
    expect(row.customer_name).toBe('Acme');
    expect(row.site_address).toBe('123 Main St');
    expect(row.is_pinned).toBe(true);
  });

  it('falls back to auto snake_case when no override defined (for a REAL column)', () => {
    // bug_reports.user_name is a real schema column reached purely via
    // auto-snake (no FIELD_OVERRIDES entry), so it survives the allowlist gate.
    const row = toSupabaseRow(
      'bugReports',
      { id: ENTITY_ID, title: 'x', userName: 'Alice' },
      USER_ID,
    );
    expect(row.user_name).toBe('Alice');
  });

  it('strips globally local-only fields (isOfflineCached)', () => {
    const row = toSupabaseRow(
      'files',
      { id: ENTITY_ID, projectId: PROJECT_ID, fileName: 'x.pdf', isOfflineCached: true },
      USER_ID,
    );
    expect(row).not.toHaveProperty('is_offline_cached');
    expect(row).not.toHaveProperty('isOfflineCached');
  });

  it('strips entity-specific skip fields (activityLog.user)', () => {
    const row = toSupabaseRow(
      'activityLog',
      { id: ENTITY_ID, projectId: PROJECT_ID, user: 'Alice', action: 'create' },
      USER_ID,
    );
    expect(row).not.toHaveProperty('user');
    expect(row.action).toBe('create');
  });

  it('skips undefined values (does not emit null)', () => {
    const row = toSupabaseRow(
      'projects',
      { id: ENTITY_ID, name: 'Test', siteAddress: undefined },
      USER_ID,
    );
    expect(row).not.toHaveProperty('site_address');
  });

  it('preserves explicit null values', () => {
    const row = toSupabaseRow(
      'projects',
      { id: ENTITY_ID, name: 'Test', siteAddress: null },
      USER_ID,
    );
    expect(row.site_address).toBeNull();
  });

  it('converts empty-string UUID FK to null (project_id)', () => {
    const row = toSupabaseRow(
      'files',
      { id: ENTITY_ID, projectId: '', fileName: 'x.pdf' },
      USER_ID,
    );
    expect(row.project_id).toBeNull();
  });

  it('converts non-UUID project_id to null (demo-data guard)', () => {
    const row = toSupabaseRow(
      'files',
      { id: ENTITY_ID, projectId: 'proj-ahu-upgrade', fileName: 'x.pdf' },
      USER_ID,
    );
    expect(row.project_id).toBeNull();
  });

  it('preserves valid UUID project_id', () => {
    const row = toSupabaseRow(
      'files',
      { id: ENTITY_ID, projectId: PROJECT_ID, fileName: 'x.pdf' },
      USER_ID,
    );
    expect(row.project_id).toBe(PROJECT_ID);
  });

  it('converts non-UUID file_id to null (notes.fileId)', () => {
    const row = toSupabaseRow(
      'notes',
      { id: ENTITY_ID, projectId: PROJECT_ID, fileId: 'not-a-uuid', content: 'x' },
      USER_ID,
    );
    expect(row.file_id).toBeNull();
  });
});

describe('field-map — fromSupabaseRow', () => {
  it('reverses explicit overrides (snake_case → camelCase)', () => {
    const entity = fromSupabaseRow('projects', {
      id: ENTITY_ID,
      customer_name: 'Acme',
      site_address: '123 Main St',
      is_pinned: true,
    });
    expect(entity.customerName).toBe('Acme');
    expect(entity.siteAddress).toBe('123 Main St');
    expect(entity.isPinned).toBe(true);
  });

  it('falls back to auto camelCase when no reverse override', () => {
    const entity = fromSupabaseRow('projects', {
      id: ENTITY_ID,
      random_field_name: 'value',
    });
    expect(entity.randomFieldName).toBe('value');
  });

  it('strips Supabase-only fields (user_id, deleted_at) but keeps sync_version', () => {
    const entity = fromSupabaseRow('projects', {
      id: ENTITY_ID,
      user_id: USER_ID,
      sync_version: 3,
      deleted_at: null,
      name: 'Test',
    });
    expect(entity).not.toHaveProperty('userId');
    expect(entity).not.toHaveProperty('deletedAt');
    // sync_version now round-trips IN (→ syncVersion) as a conflict tiebreaker;
    // it is stripped again on PUSH via LOCAL_ONLY_FIELDS.
    expect(entity.syncVersion).toBe(3);
    expect(entity.name).toBe('Test');
  });

  it('activityLog: maps user_id → user (display fallback)', () => {
    const entity = fromSupabaseRow('activityLog', {
      id: ENTITY_ID,
      project_id: PROJECT_ID,
      user_id: USER_ID,
      action: 'create',
    });
    expect(entity.user).toBe(USER_ID);
  });

  it('activityLog: falls back to "User" when user_id missing', () => {
    const entity = fromSupabaseRow('activityLog', {
      id: ENTITY_ID,
      project_id: PROJECT_ID,
      action: 'create',
    });
    expect(entity.user).toBe('User');
  });
});

describe('field-map — roundtrip (local → Supabase → local)', () => {
  const fixtures: Array<{ entityType: SyncEntityType; local: Record<string, unknown> }> = [
    {
      entityType: 'projects',
      local: {
        id: ENTITY_ID, name: 'Project A', customerName: 'Acme',
        siteAddress: '123 Main', isPinned: true, createdAt: '2026-01-01', updatedAt: '2026-01-02',
      },
    },
    {
      entityType: 'files',
      local: {
        id: ENTITY_ID, projectId: PROJECT_ID, fileName: 'a.pdf', fileType: 'pdf',
        mimeType: 'application/pdf', isPinned: false, isFavorite: true,
      },
    },
    {
      entityType: 'devices',
      local: {
        id: ENTITY_ID, projectId: PROJECT_ID, deviceName: 'VAV-1',
        controllerType: 'BACnet', macAddress: 'aa:bb:cc:dd:ee:ff', instanceNumber: 42,
        ipAddress: '10.0.0.1',
      },
    },
    {
      entityType: 'dailyReports',
      local: {
        id: ENTITY_ID, projectId: PROJECT_ID, reportNumber: 'DR-001',
        technicianName: 'Alice', startTime: '08:00', endTime: '17:00',
        hoursOnSite: 9, workCompleted: 'x', safetyNotes: 'y',
      },
    },
    {
      entityType: 'pidTuningSessions',
      local: {
        id: ENTITY_ID, projectId: PROJECT_ID, loopName: 'AHU-1 SAT',
        loopType: 'temp', controlledVariable: 'SAT', outputType: 'analog',
        actuatorStrokeTime: 60, controlMode: 'auto',
        currentValues: { kp: 1, ki: 0.1, kd: 0 },
        recommendedValues: { kp: 2, ki: 0.2, kd: 0 },
      },
    },
    {
      entityType: 'reviews',
      local: {
        id: ENTITY_ID, displayName: 'Alice', appVersion: '4.9.0',
        deviceClass: 'desktop', rating: 5, comment: 'great',
      },
    },
  ];

  for (const { entityType, local } of fixtures) {
    it(`${entityType} roundtrips without loss`, () => {
      const row = toSupabaseRow(entityType, local, USER_ID);
      const restored = fromSupabaseRow(entityType, row);
      for (const [key, value] of Object.entries(local)) {
        expect(restored[key]).toEqual(value);
      }
    });
  }
});

describe('field-map — validateSyncable', () => {
  it('rejects missing id', () => {
    expect(validateSyncable('projects', { name: 'x' })).toMatch(/invalid id/);
  });

  it('rejects non-UUID id', () => {
    expect(validateSyncable('projects', { id: 'abc123' })).toMatch(/invalid id/);
  });

  it('accepts UUID id for projects (no projectId required)', () => {
    expect(validateSyncable('projects', { id: ENTITY_ID })).toBeNull();
  });

  it('rejects missing projectId for notes', () => {
    expect(validateSyncable('notes', { id: ENTITY_ID })).toMatch(/invalid projectId/);
  });

  it('rejects non-UUID projectId for notes', () => {
    expect(validateSyncable('notes', { id: ENTITY_ID, projectId: 'proj-ahu-upgrade' }))
      .toMatch(/invalid projectId/);
  });

  it('accepts UUID projectId for notes', () => {
    expect(validateSyncable('notes', { id: ENTITY_ID, projectId: PROJECT_ID })).toBeNull();
  });

  it('files does not require projectId (nullable in schema)', () => {
    expect(validateSyncable('files', { id: ENTITY_ID })).toBeNull();
  });
});

describe('field-map — isDeletedRow', () => {
  it('returns false when deleted_at is null', () => {
    expect(isDeletedRow({ id: ENTITY_ID, deleted_at: null })).toBe(false);
  });

  it('returns false when deleted_at is absent', () => {
    expect(isDeletedRow({ id: ENTITY_ID })).toBe(false);
  });

  it('returns true when deleted_at is an ISO string', () => {
    expect(isDeletedRow({ id: ENTITY_ID, deleted_at: '2026-04-22T10:00:00Z' })).toBe(true);
  });
});

describe('field-map — structural invariants', () => {
  it('entityTypeToTable covers every SYNC_ORDER entry', () => {
    for (const entityType of SYNC_ORDER) {
      expect(entityTypeToTable[entityType]).toBeDefined();
    }
  });

  it('REQUIRES_PROJECT_ID entries all exist in SYNC_ORDER', () => {
    for (const entityType of REQUIRES_PROJECT_ID) {
      expect(SYNC_ORDER).toContain(entityType);
    }
  });

  it('projects is first in SYNC_ORDER (FK parent)', () => {
    expect(SYNC_ORDER[0]).toBe('projects');
  });

  it('files appears before notes (notes.file_id FK)', () => {
    const filesIdx = SYNC_ORDER.indexOf('files');
    const notesIdx = SYNC_ORDER.indexOf('notes');
    expect(filesIdx).toBeLessThan(notesIdx);
  });
});

// ─── Schema-driven column allowlist (Finding #10, Phase 3a) ──────────────────
describe('field-map — schema column allowlist (Phase 3a default-deny gate)', () => {
  const USER = '00000000-1111-2222-3333-444444444444';
  const PID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const GPID = 'cccccccc-dddd-eeee-ffff-000000000000';
  const ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';

  afterEach(() => {
    vi.restoreAllMocks();
    _resetDroppedColumnWarnings();
  });

  it('drops an unknown/garbage key that is not a real Supabase column', () => {
    const row = toSupabaseRow(
      'projects',
      { id: ID, name: 'Test', totallyMadeUpField: 'x', anotherGhost: 42 },
      USER,
    );
    expect(row).not.toHaveProperty('totally_made_up_field');
    expect(row).not.toHaveProperty('another_ghost');
    // …but real columns on the same row survive.
    expect(row.name).toBe('Test');
    expect(row.id).toBe(ID);
  });

  it('drops a future pull-stamp leak (e.g. a stray join-only field) by default', () => {
    // globalProjects join-only interface fields (memberCount/role/isPinned/
    // isOfflineAvailable) are NOT columns on global_projects — they must never
    // reach the table. The allowlist drops them with no hand-maintained entry.
    const row = toSupabaseRow(
      'globalProjects',
      { id: ID, name: 'Shared', memberCount: 3, role: 'admin', isPinned: true, isOfflineAvailable: false },
      USER,
    );
    expect(row).not.toHaveProperty('member_count');
    expect(row).not.toHaveProperty('role');
    expect(row).not.toHaveProperty('is_pinned');
    expect(row).not.toHaveProperty('is_offline_available');
    expect(row.name).toBe('Shared');
  });

  it('warns (dev) once per (entity, column) when dropping an unknown key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    toSupabaseRow('projects', { id: ID, ghostColumn: 'a' }, USER);
    toSupabaseRow('projects', { id: ID, ghostColumn: 'b' }, USER); // same sig → no 2nd warn
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('ghost_column');
  });

  it('preserves every legitimate column for a representative local entity (files)', () => {
    const row = toSupabaseRow(
      'files',
      {
        id: ID, projectId: PID, title: 'Plans', fileName: 'p.pdf', fileType: 'pdf',
        mimeType: 'application/pdf', category: 'drawings', panelSystem: 'BACnet',
        revisionNumber: '2', revisionDate: '2026-01-01', uploadedBy: 'Alice',
        notes: 'n', tags: ['a'], status: 'active', isPinned: true, isFavorite: false,
        currentVersionId: ID, versions: [], size: 1234,
        createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
      },
      USER,
    );
    for (const col of [
      'project_id', 'title', 'file_name', 'file_type', 'mime_type', 'category',
      'panel_system', 'revision_number', 'revision_date', 'uploaded_by', 'notes',
      'tags', 'status', 'is_pinned', 'is_favorite', 'current_version_id', 'versions',
      'size', 'created_at', 'updated_at', 'id', 'user_id',
    ]) {
      expect(row, `expected column ${col} to survive`).toHaveProperty(col);
    }
  });

  it('preserves override targets even when they would not auto-snake (projects)', () => {
    const row = toSupabaseRow(
      'projects',
      { id: ID, customerName: 'Acme', siteAddress: '1 St', buildingArea: '10k', projectNumber: '44OP-1' },
      USER,
    );
    expect(row.customer_name).toBe('Acme');
    expect(row.site_address).toBe('1 St');
    expect(row.building_area).toBe('10k');
    expect(row.project_number).toBe('44OP-1');
  });

  it('preserves the global child stamp + payload columns (globalDevices)', () => {
    const row = toSupabaseRow(
      'globalDevices',
      {
        id: ID, globalProjectId: GPID, deviceName: 'AHU-1', controllerType: 'PXC',
        macAddress: 'aa:bb', instanceNumber: '1', ipAddress: '10.0.0.1',
        system: 'HVAC', panel: 'P1', area: 'Roof', floor: '3', notes: 'x',
        status: 'online', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
      },
      USER,
    );
    expect(row.global_project_id).toBe(GPID);
    expect(row.created_by).toBe(USER);
    expect(row.updated_by).toBe(USER);
    expect(row.device_name).toBe('AHU-1');
    expect(row.ip_address).toBe('10.0.0.1');
    expect(row.system).toBe('HVAC');
  });

  it('keeps the local-only / skip fields stripped (belt-and-suspenders intact)', () => {
    const row = toSupabaseRow(
      'files',
      { id: ID, projectId: PID, fileName: 'p.pdf', isOfflineCached: true, deletedAt: null, syncVersion: 5, fts: 'x' },
      USER,
    );
    // LOCAL_ONLY_FIELDS still strips these before the allowlist even sees them.
    expect(row).not.toHaveProperty('is_offline_cached');
    expect(row).not.toHaveProperty('deleted_at');
    expect(row).not.toHaveProperty('sync_version');
    expect(row).not.toHaveProperty('fts');
  });

  it('every SyncEntityType has an allowlist entry (no entity fails open silently)', () => {
    // Proven indirectly: pushing a garbage key on every entity drops it (would
    // pass through if the entity had no allowlist set).
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const entityType of SYNC_ORDER) {
      _resetDroppedColumnWarnings();
      const row = toSupabaseRow(
        entityType,
        { id: ID, globalProjectId: GPID, projectId: PID, zzGarbageKey: 'nope' },
        USER,
      );
      expect(row, `${entityType} should drop zz_garbage_key`).not.toHaveProperty('zz_garbage_key');
    }
    warn.mockRestore();
  });
});

// ─── FK-ordered push queue (Phase 3c) ────────────────────────────────────────
describe('field-map — FK-ordered push batch (Phase 3c)', () => {
  type Item = { entityType: SyncEntityType; action: 'create' | 'update' | 'delete'; id: string };
  const mk = (entityType: SyncEntityType, action: Item['action'], id: string): Item =>
    ({ entityType, action, id });

  it('orders a project + its device parent-first on create (project before device)', () => {
    const batch: Item[] = [
      mk('devices', 'create', 'd1'),
      mk('projects', 'create', 'p1'),
    ];
    const ordered = orderPushBatch(batch);
    expect(ordered.map((i) => i.id)).toEqual(['p1', 'd1']);
  });

  it('orders a global project + its global device parent-first on create', () => {
    const batch: Item[] = [
      mk('globalDevices', 'create', 'gd1'),
      mk('globalProjects', 'create', 'gp1'),
    ];
    const ordered = orderPushBatch(batch);
    expect(ordered.map((i) => i.id)).toEqual(['gp1', 'gd1']);
  });

  it('reverses ordering for a delete batch (child device deleted before parent project)', () => {
    const batch: Item[] = [
      mk('projects', 'delete', 'p1'),
      mk('devices', 'delete', 'd1'),
    ];
    const ordered = orderPushBatch(batch);
    expect(ordered.map((i) => i.id)).toEqual(['d1', 'p1']);
  });

  it('treats updates the same as creates (parent-first)', () => {
    const batch: Item[] = [
      mk('notes', 'update', 'n1'),
      mk('projects', 'update', 'p1'),
    ];
    const ordered = orderPushBatch(batch);
    expect(ordered.map((i) => i.id)).toEqual(['p1', 'n1']);
  });

  it('runs creates/updates before deletes within a mixed batch', () => {
    const batch: Item[] = [
      mk('projects', 'delete', 'pDel'),
      mk('devices', 'delete', 'dDel'),
      mk('devices', 'create', 'dNew'),
      mk('projects', 'create', 'pNew'),
    ];
    const ordered = orderPushBatch(batch);
    // Creates parent-first, then deletes child-first.
    expect(ordered.map((i) => i.id)).toEqual(['pNew', 'dNew', 'dDel', 'pDel']);
  });

  it('is stable for items with the same entityType + action (preserves enqueue order)', () => {
    const batch: Item[] = [
      mk('devices', 'create', 'd1'),
      mk('devices', 'create', 'd2'),
      mk('devices', 'create', 'd3'),
    ];
    const ordered = orderPushBatch(batch);
    expect(ordered.map((i) => i.id)).toEqual(['d1', 'd2', 'd3']);
  });

  it('does not mutate the input array', () => {
    const batch: Item[] = [mk('devices', 'create', 'd1'), mk('projects', 'create', 'p1')];
    const snapshot = batch.map((i) => i.id);
    orderPushBatch(batch);
    expect(batch.map((i) => i.id)).toEqual(snapshot);
  });

  it('pushOrderIndex: create index is ascending, delete index is the mirror', () => {
    const projCreate = pushOrderIndex('projects', 'create');
    const devCreate = pushOrderIndex('devices', 'create');
    expect(projCreate).toBeLessThan(devCreate); // parent-first on create
    const projDelete = pushOrderIndex('projects', 'delete');
    const devDelete = pushOrderIndex('devices', 'delete');
    expect(devDelete).toBeLessThan(projDelete); // child-first on delete
  });
});
