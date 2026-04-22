import { describe, it, expect } from 'vitest';
import type { SyncEntityType } from '@/types';
import {
  toSupabaseRow,
  fromSupabaseRow,
  validateSyncable,
  isDeletedRow,
  entityTypeToTable,
  SYNC_ORDER,
  REQUIRES_PROJECT_ID,
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

  it('falls back to auto snake_case when no override defined', () => {
    const row = toSupabaseRow(
      'projects',
      { id: ENTITY_ID, randomFieldName: 'value' },
      USER_ID,
    );
    expect(row.random_field_name).toBe('value');
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

  it('strips Supabase-only fields (user_id, sync_version, deleted_at)', () => {
    const entity = fromSupabaseRow('projects', {
      id: ENTITY_ID,
      user_id: USER_ID,
      sync_version: 3,
      deleted_at: null,
      name: 'Test',
    });
    expect(entity).not.toHaveProperty('userId');
    expect(entity).not.toHaveProperty('syncVersion');
    expect(entity).not.toHaveProperty('deletedAt');
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
