import type { Project, FieldNote, DeviceEntry, IpPlanEntry, DailyReport } from '@/types';
import type {
  GlobalProject,
  GlobalProjectStatus,
  GlobalFieldNote,
  GlobalDevice,
  GlobalIpPlanEntry,
  GlobalDailyReport,
} from '@/types/global-projects';
import {
  createGlobalProject,
  addGlobalNote,
  addGlobalDevice,
  addGlobalIpEntry,
  addGlobalReport,
  logGlobalActivity,
} from './api';
import { saveProject, saveNote, saveDevice, saveIpEntry, saveDailyReport, addActivity } from '@/lib/db';
import { v4 as uuid } from 'uuid';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MigrationInput {
  project: Project;
  notes: FieldNote[];
  devices: DeviceEntry[];
  ipEntries: IpPlanEntry[];
  reports: DailyReport[];
}

export interface MigrationResult {
  globalProjectId: string;
  accessCode: string;
  migrated: {
    notes: number;
    devices: number;
    ipEntries: number;
    reports: number;
  };
  failed: {
    notes: number;
    devices: number;
    ipEntries: number;
    reports: number;
  };
}

export interface ImportInput {
  project: GlobalProject;
  notes: GlobalFieldNote[];
  devices: GlobalDevice[];
  ipEntries: GlobalIpPlanEntry[];
  reports: GlobalDailyReport[];
}

export interface ImportResult {
  localProjectId: string;
  migrated: {
    notes: number;
    devices: number;
    ipEntries: number;
    reports: number;
  };
  failed: {
    notes: number;
    devices: number;
    ipEntries: number;
    reports: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_GLOBAL_STATUSES: GlobalProjectStatus[] = ['active', 'on-hold', 'completed', 'archived'];

/** Extract data from an ApiResult or throw on error */
function unwrap<T>(result: { data: T; error: null } | { data: null; error: string }): T {
  if (result.error !== null) {
    throw new Error(result.error);
  }
  return result.data;
}

// ─── Migration ───────────────────────────────────────────────────────────────

export async function migrateLocalToGlobal(
  input: MigrationInput,
  onProgress?: (step: string, current: number, total: number) => void,
): Promise<MigrationResult> {
  const { project, notes, devices, ipEntries, reports } = input;

  const totalSteps = 1 + notes.length + devices.length + ipEntries.length + reports.length + 1; // +1 create, +1 activity log
  let currentStep = 0;

  const progress = (step: string) => {
    currentStep++;
    onProgress?.(step, currentStep, totalSteps);
  };

  // ── 1. Create the global project ────────────────────────────────────────

  const descriptionParts: string[] = [];
  if (project.technicianNotes) descriptionParts.push(project.technicianNotes);
  if (project.panelRosterSummary) descriptionParts.push(project.panelRosterSummary);

  const status: GlobalProjectStatus = VALID_GLOBAL_STATUSES.includes(project.status as GlobalProjectStatus)
    ? (project.status as GlobalProjectStatus)
    : 'active';

  progress('Creating global project');

  const created = unwrap(
    await createGlobalProject({
      name: project.name,
      jobSiteName: project.customerName || project.name,
      siteAddress: project.siteAddress,
      buildingArea: project.buildingArea,
      projectNumber: project.projectNumber,
      description: descriptionParts.join('\n\n'),
      tags: project.tags,
    }),
  );

  // Update status separately if not active (createGlobalProject doesn't accept status)
  // Status will be set via a separate update if needed — for now we proceed with active default.

  const globalProjectId = created.id;
  const accessCode = created.accessCode;

  const migrated = { notes: 0, devices: 0, ipEntries: 0, reports: 0 };
  const failed = { notes: 0, devices: 0, ipEntries: 0, reports: 0 };

  // ── 2. Migrate field notes ──────────────────────────────────────────────

  for (const note of notes) {
    progress(`Migrating note ${migrated.notes + failed.notes + 1}/${notes.length}`);
    try {
      const result = await addGlobalNote(globalProjectId, {
        content: note.content,
        category: note.category,
        isPinned: note.isPinned,
        tags: note.tags,
        fileId: note.fileId ?? null,
      });
      if (result.error) throw new Error(result.error);
      migrated.notes++;
    } catch {
      failed.notes++;
    }
  }

  // ── 3. Migrate devices ─────────────────────────────────────────────────

  for (const device of devices) {
    progress(`Migrating device ${migrated.devices + failed.devices + 1}/${devices.length}`);
    try {
      const result = await addGlobalDevice(globalProjectId, {
        deviceName: device.deviceName,
        description: device.description,
        system: device.system,
        panel: device.panel,
        controllerType: device.controllerType,
        macAddress: device.macAddress ?? null,
        instanceNumber: device.instanceNumber ?? null,
        ipAddress: device.ipAddress ?? null,
        floor: device.floor,
        area: device.area,
        status: device.status,
        notes: device.notes,
      });
      if (result.error) throw new Error(result.error);
      migrated.devices++;
    } catch {
      failed.devices++;
    }
  }

  // ── 4. Migrate IP plan entries ──────────────────────────────────────────

  for (const entry of ipEntries) {
    progress(`Migrating IP entry ${migrated.ipEntries + failed.ipEntries + 1}/${ipEntries.length}`);
    try {
      const result = await addGlobalIpEntry(globalProjectId, {
        ipAddress: entry.ipAddress,
        hostname: entry.hostname,
        panel: entry.panel,
        vlan: entry.vlan,
        subnet: entry.subnet,
        deviceRole: entry.deviceRole,
        macAddress: entry.macAddress ?? null,
        notes: entry.notes,
        status: entry.status,
      });
      if (result.error) throw new Error(result.error);
      migrated.ipEntries++;
    } catch {
      failed.ipEntries++;
    }
  }

  // ── 5. Migrate daily reports ────────────────────────────────────────────

  for (const report of reports) {
    progress(`Migrating report ${migrated.reports + failed.reports + 1}/${reports.length}`);
    try {
      const result = await addGlobalReport(globalProjectId, {
        date: report.date,
        reportNumber: report.reportNumber,
        technicianName: report.technicianName,
        status: report.status,
        startTime: report.startTime,
        endTime: report.endTime,
        hoursOnSite: report.hoursOnSite,
        location: report.location,
        weather: report.weather,
        workCompleted: report.workCompleted,
        issuesEncountered: report.issuesEncountered,
        workPlannedNext: report.workPlannedNext,
        coordinationNotes: report.coordinationNotes,
        equipmentWorkedOn: report.equipmentWorkedOn,
        deviceIpChanges: report.deviceIpChanges,
        safetyNotes: report.safetyNotes,
        generalNotes: report.generalNotes,
        attachments: [], // Blob refs cannot migrate
      });
      if (result.error) throw new Error(result.error);
      migrated.reports++;
    } catch {
      failed.reports++;
    }
  }

  // ── 6. Log migration activity ───────────────────────────────────────────

  progress('Logging migration activity');

  await logGlobalActivity(
    globalProjectId,
    'migrated project from local',
    `Migrated ${migrated.notes} notes, ${migrated.devices} devices, ${migrated.ipEntries} IP entries, ${migrated.reports} reports`,
  );

  // ── 7. Return result ───────────────────────────────────────────────────

  return {
    globalProjectId,
    accessCode,
    migrated,
    failed,
  };
}

// ─── Import: Global → Local ─────────────────────────────────────────────────

const VALID_LOCAL_STATUSES: Project['status'][] = ['active', 'on-hold', 'completed', 'archived'];

export async function migrateGlobalToLocal(
  input: ImportInput,
  onProgress?: (step: string, current: number, total: number) => void,
): Promise<ImportResult> {
  const { project, notes, devices, ipEntries, reports } = input;

  const totalSteps = 1 + notes.length + devices.length + ipEntries.length + reports.length + 1;
  let currentStep = 0;

  const progress = (step: string) => {
    currentStep++;
    onProgress?.(step, currentStep, totalSteps);
  };

  // ── 1. Create the local project ──────────────────────────────────────

  progress('Creating local project');

  const now = new Date().toISOString();
  const localProjectId = uuid();

  const status: Project['status'] = VALID_LOCAL_STATUSES.includes(project.status as Project['status'])
    ? (project.status as Project['status'])
    : 'active';

  const localProject: Project = {
    id: localProjectId,
    name: project.name,
    customerName: project.jobSiteName || project.name,
    siteAddress: project.siteAddress || '',
    buildingArea: project.buildingArea || '',
    projectNumber: project.projectNumber || '',
    technicianNotes: project.description || '',
    tags: project.tags || [],
    status,
    contacts: [],
    isPinned: false,
    isOfflineAvailable: false,
    createdAt: now,
    updatedAt: now,
  };

  await saveProject(localProject);

  const migrated = { notes: 0, devices: 0, ipEntries: 0, reports: 0 };
  const failed = { notes: 0, devices: 0, ipEntries: 0, reports: 0 };

  // ── 2. Import field notes ────────────────────────────────────────────

  for (const note of notes) {
    progress(`Importing note ${migrated.notes + failed.notes + 1}/${notes.length}`);
    try {
      const localNote: FieldNote = {
        id: uuid(),
        projectId: localProjectId,
        fileId: note.fileId ?? undefined,
        content: note.content,
        category: note.category,
        author: 'User',
        isPinned: note.isPinned,
        tags: note.tags || [],
        createdAt: note.createdAt || now,
        updatedAt: note.updatedAt || now,
      };
      await saveNote(localNote);
      migrated.notes++;
    } catch {
      failed.notes++;
    }
  }

  // ── 3. Import devices ───────────────────────────────────────────────

  for (const device of devices) {
    progress(`Importing device ${migrated.devices + failed.devices + 1}/${devices.length}`);
    try {
      const localDevice: DeviceEntry = {
        id: uuid(),
        projectId: localProjectId,
        deviceName: device.deviceName,
        description: device.description || '',
        system: device.system || '',
        panel: device.panel || '',
        controllerType: device.controllerType || '',
        macAddress: device.macAddress ?? undefined,
        instanceNumber: device.instanceNumber ?? undefined,
        ipAddress: device.ipAddress ?? undefined,
        floor: device.floor || '',
        area: device.area || '',
        status: device.status || 'Not Commissioned',
        notes: device.notes || '',
        createdAt: device.createdAt || now,
        updatedAt: device.updatedAt || now,
      };
      await saveDevice(localDevice);
      migrated.devices++;
    } catch {
      failed.devices++;
    }
  }

  // ── 4. Import IP plan entries ────────────────────────────────────────

  for (const entry of ipEntries) {
    progress(`Importing IP entry ${migrated.ipEntries + failed.ipEntries + 1}/${ipEntries.length}`);
    try {
      const localEntry: IpPlanEntry = {
        id: uuid(),
        projectId: localProjectId,
        ipAddress: entry.ipAddress || '',
        hostname: entry.hostname || '',
        panel: entry.panel || '',
        vlan: entry.vlan || '',
        subnet: entry.subnet || '',
        deviceRole: entry.deviceRole || '',
        macAddress: entry.macAddress ?? undefined,
        notes: entry.notes || '',
        status: entry.status || 'active',
        createdAt: entry.createdAt || now,
        updatedAt: entry.updatedAt || now,
      };
      await saveIpEntry(localEntry);
      migrated.ipEntries++;
    } catch {
      failed.ipEntries++;
    }
  }

  // ── 5. Import daily reports ──────────────────────────────────────────

  for (const report of reports) {
    progress(`Importing report ${migrated.reports + failed.reports + 1}/${reports.length}`);
    try {
      const localReport: DailyReport = {
        id: uuid(),
        projectId: localProjectId,
        date: report.date,
        reportNumber: report.reportNumber,
        technicianName: report.technicianName || '',
        status: report.status || 'draft',
        startTime: report.startTime || '',
        endTime: report.endTime || '',
        hoursOnSite: report.hoursOnSite || '',
        location: report.location || '',
        weather: report.weather || '',
        workCompleted: report.workCompleted || '',
        issuesEncountered: report.issuesEncountered || '',
        workPlannedNext: report.workPlannedNext || '',
        coordinationNotes: report.coordinationNotes || '',
        equipmentWorkedOn: report.equipmentWorkedOn || '',
        deviceIpChanges: report.deviceIpChanges || '',
        safetyNotes: report.safetyNotes || '',
        generalNotes: report.generalNotes || '',
        attachments: [],
        createdAt: report.createdAt || now,
        updatedAt: report.updatedAt || now,
      };
      await saveDailyReport(localReport);
      migrated.reports++;
    } catch {
      failed.reports++;
    }
  }

  // ── 6. Log activity ──────────────────────────────────────────────────

  progress('Logging import activity');

  await addActivity({
    id: uuid(),
    projectId: localProjectId,
    action: 'Imported from Global Project',
    details: `Imported from "${project.name}" — ${migrated.notes} notes, ${migrated.devices} devices, ${migrated.ipEntries} IP entries, ${migrated.reports} reports`,
    timestamp: now,
    user: 'User',
  });

  // Also log to the global project activity
  try {
    await logGlobalActivity(
      project.id,
      'saved project to local',
      `Saved ${migrated.notes} notes, ${migrated.devices} devices, ${migrated.ipEntries} IP entries, ${migrated.reports} reports to local projects`,
    );
  } catch {
    // Don't fail import if global activity logging fails
  }

  return {
    localProjectId,
    migrated,
    failed,
  };
}
