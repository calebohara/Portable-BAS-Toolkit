import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

// Mock the sync bridge to track notifySync calls
vi.mock('@/lib/sync/sync-bridge', () => ({
  notifySync: vi.fn(),
}));

import {
  getAllProjects,
  getProject,
  saveProject,
  deleteProject,
  getProjectFiles,
  saveFile,
  getProjectNotes,
  saveNote,
  getProjectDevices,
  saveDevice,
  getProjectIpPlan,
  saveIpEntry,
  getProjectActivity,
  addActivity,
  purgeOrphanedRecords,
  getAllFromStore,
  bulkPutSilent,
  bulkDeleteSilent,
  clearAllData,
} from '../db';
import { notifySync } from '@/lib/sync/sync-bridge';
import type { Project, ProjectFile, FieldNote, DeviceEntry, IpPlanEntry, ActivityLogEntry } from '@/types';

// ─── Test data factories ─────────────────────────────────────

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: overrides.id ?? 'proj-001',
    name: 'Test Project',
    status: 'active',
    customer: 'ACME Corp',
    siteAddress: '123 Main St',
    contacts: [],
    tags: [],
    techNotes: '',
    isPinned: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Project;
}

function makeFile(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    id: overrides.id ?? 'file-001',
    projectId: 'proj-001',
    name: 'test-file.pdf',
    category: 'general',
    versions: [],
    isPinned: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as ProjectFile;
}

function makeNote(overrides: Partial<FieldNote> = {}): FieldNote {
  return {
    id: overrides.id ?? 'note-001',
    projectId: 'proj-001',
    category: 'general',
    content: 'Test note content',
    isPinned: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as FieldNote;
}

function makeDevice(overrides: Partial<DeviceEntry> = {}): DeviceEntry {
  return {
    id: overrides.id ?? 'device-001',
    projectId: 'proj-001',
    name: 'AHU-1 Controller',
    controllerType: 'PXC',
    bacnetInstance: 100,
    ipAddress: '192.168.1.10',
    macAddress: '',
    location: 'Mechanical Room',
    floor: '1',
    area: 'MR-1',
    status: 'online',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as DeviceEntry;
}

function makeIpEntry(overrides: Partial<IpPlanEntry> = {}): IpPlanEntry {
  return {
    id: overrides.id ?? 'ip-001',
    projectId: 'proj-001',
    ipAddress: '192.168.1.10',
    hostname: 'AHU-1',
    vlan: '100',
    subnet: '255.255.255.0',
    deviceRole: 'controller',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as IpPlanEntry;
}

function makeActivity(overrides: Partial<ActivityLogEntry> = {}): ActivityLogEntry {
  return {
    id: overrides.id ?? 'log-001',
    projectId: 'proj-001',
    action: 'created',
    entityType: 'project',
    entityId: 'proj-001',
    summary: 'Created project',
    timestamp: new Date().toISOString(),
    ...overrides,
  } as ActivityLogEntry;
}

// ─── Reset IDB between tests ────────────────────────────────

beforeEach(async () => {
  vi.clearAllMocks();
  // Clear all data from the shared db connection
  await clearAllData();
});

// ─── Basic CRUD ─────────────────────────────────────────────

describe('Project CRUD', () => {
  it('saves and retrieves a project', async () => {
    const project = makeProject();
    await saveProject(project);
    const retrieved = await getProject('proj-001');
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe('Test Project');
  });

  it('lists all projects', async () => {
    await saveProject(makeProject({ id: 'p1' }));
    await saveProject(makeProject({ id: 'p2', name: 'Project 2' }));
    const all = await getAllProjects();
    expect(all).toHaveLength(2);
  });

  it('notifies sync on save', async () => {
    await saveProject(makeProject());
    expect(notifySync).toHaveBeenCalledWith('update', 'projects', 'proj-001', expect.any(Object));
  });
});

// ─── Cascade delete ──────────────────────────────────────────

describe('deleteProject (cascade)', () => {
  it('deletes the project and all child records', async () => {
    const project = makeProject();
    await saveProject(project);

    // Create child records
    await saveFile(makeFile({ id: 'f1', projectId: 'proj-001' }));
    await saveFile(makeFile({ id: 'f2', projectId: 'proj-001' }));
    await saveNote(makeNote({ id: 'n1', projectId: 'proj-001' }));
    await saveDevice(makeDevice({ id: 'd1', projectId: 'proj-001' }));
    await saveIpEntry(makeIpEntry({ id: 'ip1', projectId: 'proj-001' }));
    await addActivity(makeActivity({ id: 'log1', projectId: 'proj-001' }));

    vi.mocked(notifySync).mockClear();

    await deleteProject('proj-001');

    // Project should be gone
    expect(await getProject('proj-001')).toBeUndefined();

    // All children should be gone
    expect(await getProjectFiles('proj-001')).toHaveLength(0);
    expect(await getProjectNotes('proj-001')).toHaveLength(0);
    expect(await getProjectDevices('proj-001')).toHaveLength(0);
    expect(await getProjectIpPlan('proj-001')).toHaveLength(0);
    expect(await getProjectActivity('proj-001')).toHaveLength(0);
  });

  it('notifies sync for each deleted child', async () => {
    await saveProject(makeProject());
    await saveFile(makeFile({ id: 'f1', projectId: 'proj-001' }));
    await saveNote(makeNote({ id: 'n1', projectId: 'proj-001' }));

    vi.mocked(notifySync).mockClear();

    await deleteProject('proj-001');

    // Should have notifySync calls for: file, note, project (at minimum)
    const deleteCalls = vi.mocked(notifySync).mock.calls.filter(c => c[0] === 'delete');
    expect(deleteCalls.length).toBeGreaterThanOrEqual(3);

    // Project delete should be the last notification
    const lastCall = deleteCalls[deleteCalls.length - 1];
    expect(lastCall[1]).toBe('projects');
    expect(lastCall[2]).toBe('proj-001');
  });

  it('does not affect records from other projects', async () => {
    await saveProject(makeProject({ id: 'proj-001' }));
    await saveProject(makeProject({ id: 'proj-002', name: 'Other Project' }));
    await saveFile(makeFile({ id: 'f1', projectId: 'proj-001' }));
    await saveFile(makeFile({ id: 'f2', projectId: 'proj-002' }));
    await saveNote(makeNote({ id: 'n1', projectId: 'proj-001' }));
    await saveNote(makeNote({ id: 'n2', projectId: 'proj-002' }));

    await deleteProject('proj-001');

    // proj-002 records should still exist
    expect(await getProject('proj-002')).toBeDefined();
    expect(await getProjectFiles('proj-002')).toHaveLength(1);
    expect(await getProjectNotes('proj-002')).toHaveLength(1);
  });

  it('handles deleting a project with no children', async () => {
    await saveProject(makeProject());

    // Should not throw
    await deleteProject('proj-001');
    expect(await getProject('proj-001')).toBeUndefined();
  });
});

// ─── Orphan purge ───────────────────────────────────────────

describe('purgeOrphanedRecords', () => {
  it('removes records whose projectId references a non-existent project', async () => {
    // Create a project and some records
    await saveProject(makeProject({ id: 'existing-project' }));
    await saveNote(makeNote({ id: 'valid-note', projectId: 'existing-project' }));

    // Create orphaned record with a UUID-format projectId that doesn't match any project
    await saveNote(makeNote({
      id: 'orphan-note',
      projectId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    }));

    const deleted = await purgeOrphanedRecords();
    expect(deleted).toBeGreaterThanOrEqual(1);

    // Valid note should still exist
    const notes = await getProjectNotes('existing-project');
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe('valid-note');
  });

  it('does not purge records with non-UUID projectId', async () => {
    // Records with non-UUID projectId are "unassigned", not orphaned
    await saveProject(makeProject({ id: 'existing-project' }));
    await saveNote(makeNote({ id: 'unassigned-note', projectId: '' }));

    const deleted = await purgeOrphanedRecords();
    // Should not delete the unassigned note (empty projectId is not a UUID)
    expect(deleted).toBe(0);
  });
});

// ─── Bulk operations ────────────────────────────────────────

describe('bulkPutSilent', () => {
  it('writes items without triggering sync', async () => {
    const items = [
      makeProject({ id: 'bp1' }),
      makeProject({ id: 'bp2' }),
    ];

    vi.mocked(notifySync).mockClear();

    const count = await bulkPutSilent('projects', items as unknown as Record<string, unknown>[]);
    expect(count).toBe(2);

    // notifySync should NOT have been called (silent write)
    expect(notifySync).not.toHaveBeenCalled();

    // Data should actually be there
    const all = await getAllProjects();
    expect(all).toHaveLength(2);
  });

  it('handles empty array', async () => {
    const count = await bulkPutSilent('projects', []);
    expect(count).toBe(0);
  });
});

describe('bulkDeleteSilent', () => {
  it('deletes items without triggering sync', async () => {
    await saveProject(makeProject({ id: 'del1' }));
    await saveProject(makeProject({ id: 'del2' }));

    vi.mocked(notifySync).mockClear();

    const count = await bulkDeleteSilent('projects', ['del1']);
    expect(count).toBe(1);

    expect(notifySync).not.toHaveBeenCalled();

    const remaining = await getAllProjects();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('del2');
  });
});

// ─── getAllFromStore ─────────────────────────────────────────

describe('getAllFromStore', () => {
  it('returns all items from a store', async () => {
    await saveProject(makeProject({ id: 's1' }));
    await saveProject(makeProject({ id: 's2' }));

    const items = await getAllFromStore('projects');
    expect(items).toHaveLength(2);
  });
});

// ─── clearAllData ───────────────────────────────────────────

describe('clearAllData', () => {
  it('wipes all stores', async () => {
    await saveProject(makeProject({ id: 'c1' }));
    await saveNote(makeNote({ id: 'cn1', projectId: 'c1' }));
    await saveDevice(makeDevice({ id: 'cd1', projectId: 'c1' }));

    await clearAllData();

    expect(await getAllProjects()).toHaveLength(0);
  });
});
