import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Project, ProjectFile, FileVersion, FieldNote,
  DeviceEntry, IpPlanEntry, ActivityLogEntry, DailyReport,
} from '@/types';

interface BasToolkitDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: {
      'by-updated': string;
      'by-status': string;
      'by-pinned': number;
    };
  };
  files: {
    key: string;
    value: ProjectFile;
    indexes: {
      'by-project': string;
      'by-category': [string, string];
      'by-pinned': number;
    };
  };
  fileBlobs: {
    key: string;
    value: { id: string; blob: Blob; cachedAt: string };
  };
  notes: {
    key: string;
    value: FieldNote;
    indexes: {
      'by-project': string;
      'by-file': string;
    };
  };
  devices: {
    key: string;
    value: DeviceEntry;
    indexes: { 'by-project': string };
  };
  ipPlan: {
    key: string;
    value: IpPlanEntry;
    indexes: { 'by-project': string };
  };
  activityLog: {
    key: string;
    value: ActivityLogEntry;
    indexes: {
      'by-project': string;
      'by-timestamp': string;
    };
  };
  dailyReports: {
    key: string;
    value: DailyReport;
    indexes: {
      'by-project': string;
      'by-date': string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<BasToolkitDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<BasToolkitDB>('bas-toolkit', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          // Projects
          const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
          projectStore.createIndex('by-updated', 'updatedAt');
          projectStore.createIndex('by-status', 'status');
          projectStore.createIndex('by-pinned', 'isPinned');

          // Files
          const fileStore = db.createObjectStore('files', { keyPath: 'id' });
          fileStore.createIndex('by-project', 'projectId');
          fileStore.createIndex('by-category', ['projectId', 'category']);
          fileStore.createIndex('by-pinned', 'isPinned');

          // File blobs for offline caching
          db.createObjectStore('fileBlobs', { keyPath: 'id' });

          // Notes
          const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
          noteStore.createIndex('by-project', 'projectId');
          noteStore.createIndex('by-file', 'fileId');

          // Devices
          const deviceStore = db.createObjectStore('devices', { keyPath: 'id' });
          deviceStore.createIndex('by-project', 'projectId');

          // IP Plan
          const ipStore = db.createObjectStore('ipPlan', { keyPath: 'id' });
          ipStore.createIndex('by-project', 'projectId');

          // Activity Log
          const logStore = db.createObjectStore('activityLog', { keyPath: 'id' });
          logStore.createIndex('by-project', 'projectId');
          logStore.createIndex('by-timestamp', 'timestamp');
        }

        if (oldVersion < 2) {
          // Daily Reports
          const reportStore = db.createObjectStore('dailyReports', { keyPath: 'id' });
          reportStore.createIndex('by-project', 'projectId');
          reportStore.createIndex('by-date', 'date');
        }
      },
    });
  }
  return dbPromise;
}

// Projects
export async function getAllProjects(): Promise<Project[]> {
  const db = await getDB();
  const projects = await db.getAll('projects');
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await getDB();
  return db.get('projects', id);
}

export async function saveProject(project: Project): Promise<void> {
  const db = await getDB();
  await db.put('projects', project);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['projects', 'files', 'fileBlobs', 'notes', 'devices', 'ipPlan', 'activityLog', 'dailyReports'], 'readwrite');

  // Delete associated data
  const files = await tx.objectStore('files').index('by-project').getAll(id);
  for (const file of files) {
    for (const version of file.versions) {
      if (version.blobKey) {
        await tx.objectStore('fileBlobs').delete(version.blobKey);
      }
    }
    await tx.objectStore('files').delete(file.id);
  }

  const notes = await tx.objectStore('notes').index('by-project').getAll(id);
  for (const note of notes) await tx.objectStore('notes').delete(note.id);

  const devices = await tx.objectStore('devices').index('by-project').getAll(id);
  for (const dev of devices) await tx.objectStore('devices').delete(dev.id);

  const ips = await tx.objectStore('ipPlan').index('by-project').getAll(id);
  for (const ip of ips) await tx.objectStore('ipPlan').delete(ip.id);

  const logs = await tx.objectStore('activityLog').index('by-project').getAll(id);
  for (const log of logs) await tx.objectStore('activityLog').delete(log.id);

  const reports = await tx.objectStore('dailyReports').index('by-project').getAll(id);
  for (const report of reports) {
    for (const att of report.attachments) {
      if (att.blobKey) await tx.objectStore('fileBlobs').delete(att.blobKey);
    }
    await tx.objectStore('dailyReports').delete(report.id);
  }

  await tx.objectStore('projects').delete(id);
  await tx.done;
}

// Files
export async function getAllFiles(): Promise<ProjectFile[]> {
  const db = await getDB();
  const files = await db.getAll('files');
  return files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getUnassignedFiles(): Promise<ProjectFile[]> {
  const db = await getDB();
  const files = await db.getAllFromIndex('files', 'by-project', '');
  return files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProjectFiles(projectId: string): Promise<ProjectFile[]> {
  const db = await getDB();
  return db.getAllFromIndex('files', 'by-project', projectId);
}

export async function getFilesByCategory(projectId: string, category: string): Promise<ProjectFile[]> {
  const db = await getDB();
  return db.getAllFromIndex('files', 'by-category', [projectId, category]);
}

export async function getFile(id: string): Promise<ProjectFile | undefined> {
  const db = await getDB();
  return db.get('files', id);
}

export async function saveFile(file: ProjectFile): Promise<void> {
  const db = await getDB();
  await db.put('files', file);
}

export async function deleteFile(id: string): Promise<void> {
  const db = await getDB();
  const file = await db.get('files', id);
  if (file) {
    for (const version of file.versions) {
      if (version.blobKey) await db.delete('fileBlobs', version.blobKey);
    }
  }
  await db.delete('files', id);
}

// File Blobs
export async function saveFileBlob(id: string, blob: Blob): Promise<void> {
  const db = await getDB();
  await db.put('fileBlobs', { id, blob, cachedAt: new Date().toISOString() });
}

export async function getFileBlob(id: string): Promise<Blob | undefined> {
  const db = await getDB();
  const entry = await db.get('fileBlobs', id);
  return entry?.blob;
}

export async function deleteFileBlob(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('fileBlobs', id);
}

// Notes
export async function getProjectNotes(projectId: string): Promise<FieldNote[]> {
  const db = await getDB();
  const notes = await db.getAllFromIndex('notes', 'by-project', projectId);
  return notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getFileNotes(fileId: string): Promise<FieldNote[]> {
  const db = await getDB();
  return db.getAllFromIndex('notes', 'by-file', fileId);
}

export async function saveNote(note: FieldNote): Promise<void> {
  const db = await getDB();
  await db.put('notes', note);
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('notes', id);
}

// Devices
export async function getProjectDevices(projectId: string): Promise<DeviceEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('devices', 'by-project', projectId);
}

export async function saveDevice(device: DeviceEntry): Promise<void> {
  const db = await getDB();
  await db.put('devices', device);
}

export async function deleteDevice(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('devices', id);
}

export async function saveDevices(devices: DeviceEntry[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('devices', 'readwrite');
  for (const device of devices) {
    await tx.store.put(device);
  }
  await tx.done;
}

// IP Plan
export async function getProjectIpPlan(projectId: string): Promise<IpPlanEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('ipPlan', 'by-project', projectId);
}

export async function saveIpEntry(entry: IpPlanEntry): Promise<void> {
  const db = await getDB();
  await db.put('ipPlan', entry);
}

export async function deleteIpEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('ipPlan', id);
}

export async function saveIpEntries(entries: IpPlanEntry[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('ipPlan', 'readwrite');
  for (const entry of entries) {
    await tx.store.put(entry);
  }
  await tx.done;
}

// Activity Log
export async function getProjectActivity(projectId: string): Promise<ActivityLogEntry[]> {
  const db = await getDB();
  const logs = await db.getAllFromIndex('activityLog', 'by-project', projectId);
  return logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function addActivity(entry: ActivityLogEntry): Promise<void> {
  const db = await getDB();
  await db.put('activityLog', entry);
}

// Daily Reports
export async function getAllDailyReports(): Promise<DailyReport[]> {
  const db = await getDB();
  const reports = await db.getAll('dailyReports');
  return reports.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export async function getProjectDailyReports(projectId: string): Promise<DailyReport[]> {
  const db = await getDB();
  const reports = await db.getAllFromIndex('dailyReports', 'by-project', projectId);
  return reports.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export async function getDailyReport(id: string): Promise<DailyReport | undefined> {
  const db = await getDB();
  return db.get('dailyReports', id);
}

export async function saveDailyReport(report: DailyReport): Promise<void> {
  const db = await getDB();
  await db.put('dailyReports', report);
}

export async function deleteDailyReport(id: string): Promise<void> {
  const db = await getDB();
  const report = await db.get('dailyReports', id);
  if (report) {
    // Delete attachment blobs
    for (const att of report.attachments) {
      if (att.blobKey) await db.delete('fileBlobs', att.blobKey);
    }
  }
  await db.delete('dailyReports', id);
}

export async function getNextReportNumber(projectId: string): Promise<number> {
  const reports = await getProjectDailyReports(projectId);
  if (reports.length === 0) return 1;
  return Math.max(...reports.map(r => r.reportNumber)) + 1;
}

// Storage info
export async function getStorageEstimate(): Promise<{ used: number; quota: number }> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return { used: estimate.usage || 0, quota: estimate.quota || 0 };
  }
  return { used: 0, quota: 0 };
}

// Clear all cached file blobs
export async function clearFileCache(): Promise<number> {
  const db = await getDB();
  const tx = db.transaction('fileBlobs', 'readwrite');
  const count = await tx.store.count();
  await tx.store.clear();
  await tx.done;
  return count;
}

// Search across everything in a project
export async function searchProject(projectId: string, query: string): Promise<{
  files: ProjectFile[];
  notes: FieldNote[];
  devices: DeviceEntry[];
  ipEntries: IpPlanEntry[];
}> {
  const q = query.toLowerCase();
  const [files, notes, devices, ipEntries] = await Promise.all([
    getProjectFiles(projectId),
    getProjectNotes(projectId),
    getProjectDevices(projectId),
    getProjectIpPlan(projectId),
  ]);

  return {
    files: files.filter(f =>
      f.title.toLowerCase().includes(q) ||
      f.fileName.toLowerCase().includes(q) ||
      f.notes.toLowerCase().includes(q) ||
      f.tags.some(t => t.toLowerCase().includes(q)) ||
      (f.panelSystem || '').toLowerCase().includes(q)
    ),
    notes: notes.filter(n =>
      n.content.toLowerCase().includes(q) ||
      n.tags.some(t => t.toLowerCase().includes(q))
    ),
    devices: devices.filter(d =>
      d.deviceName.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      d.panel.toLowerCase().includes(q) ||
      d.system.toLowerCase().includes(q) ||
      (d.ipAddress || '').toLowerCase().includes(q) ||
      d.floor.toLowerCase().includes(q) ||
      d.area.toLowerCase().includes(q) ||
      d.notes.toLowerCase().includes(q)
    ),
    ipEntries: ipEntries.filter(e =>
      e.ipAddress.toLowerCase().includes(q) ||
      e.hostname.toLowerCase().includes(q) ||
      e.panel.toLowerCase().includes(q) ||
      e.vlan.toLowerCase().includes(q) ||
      e.subnet.toLowerCase().includes(q) ||
      e.deviceRole.toLowerCase().includes(q) ||
      e.notes.toLowerCase().includes(q)
    ),
  };
}

// Global search across all projects
export async function searchGlobal(query: string): Promise<{
  projects: Project[];
  files: ProjectFile[];
  notes: FieldNote[];
  devices: DeviceEntry[];
  ipEntries: IpPlanEntry[];
  dailyReports: DailyReport[];
}> {
  const q = query.toLowerCase();
  const db = await getDB();

  const [projects, files, notes, devices, ipEntries, dailyReports] = await Promise.all([
    db.getAll('projects'),
    db.getAll('files'),
    db.getAll('notes'),
    db.getAll('devices'),
    db.getAll('ipPlan'),
    db.getAll('dailyReports'),
  ]);

  return {
    projects: projects.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.customerName.toLowerCase().includes(q) ||
      p.projectNumber.toLowerCase().includes(q) ||
      p.siteAddress.toLowerCase().includes(q) ||
      p.buildingArea.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q))
    ),
    files: files.filter(f =>
      f.title.toLowerCase().includes(q) ||
      f.fileName.toLowerCase().includes(q) ||
      f.notes.toLowerCase().includes(q) ||
      f.tags.some(t => t.toLowerCase().includes(q)) ||
      (f.panelSystem || '').toLowerCase().includes(q)
    ),
    notes: notes.filter(n =>
      n.content.toLowerCase().includes(q) ||
      n.tags.some(t => t.toLowerCase().includes(q))
    ),
    devices: devices.filter(d =>
      d.deviceName.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      d.panel.toLowerCase().includes(q) ||
      (d.ipAddress || '').toLowerCase().includes(q)
    ),
    ipEntries: ipEntries.filter(e =>
      e.ipAddress.toLowerCase().includes(q) ||
      e.hostname.toLowerCase().includes(q) ||
      e.panel.toLowerCase().includes(q) ||
      e.deviceRole.toLowerCase().includes(q)
    ),
    dailyReports: dailyReports.filter(r =>
      r.technicianName.toLowerCase().includes(q) ||
      r.workCompleted.toLowerCase().includes(q) ||
      r.issuesEncountered.toLowerCase().includes(q) ||
      r.workPlannedNext.toLowerCase().includes(q) ||
      r.equipmentWorkedOn.toLowerCase().includes(q) ||
      r.generalNotes.toLowerCase().includes(q) ||
      r.location.toLowerCase().includes(q) ||
      r.date.includes(q)
    ),
  };
}
