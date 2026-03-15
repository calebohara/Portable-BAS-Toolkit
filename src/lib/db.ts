import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Project, ProjectFile, FileVersion, FieldNote,
  DeviceEntry, IpPlanEntry, ActivityLogEntry, DailyReport,
  NetworkDiagram, CommandSnippet, PingSession, TerminalSessionLog,
  ConnectionProfile, SavedCalculation, PidTuningSession, SyncQueueItem, SyncConflict,
} from '@/types';
import { notifySync } from '@/lib/sync/sync-bridge';

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
  networkDiagrams: {
    key: string;
    value: NetworkDiagram;
    indexes: { 'by-project': string };
  };
  commandSnippets: {
    key: string;
    value: CommandSnippet;
    indexes: { 'by-category': string };
  };
  pingSessions: {
    key: string;
    value: PingSession;
    indexes: { 'by-project': string };
  };
  terminalLogs: {
    key: string;
    value: TerminalSessionLog;
    indexes: { 'by-project': string };
  };
  connectionProfiles: {
    key: string;
    value: ConnectionProfile;
    indexes: { 'by-project': string; 'by-type': string };
  };
  registerCalculations: {
    key: string;
    value: SavedCalculation;
    indexes: { 'by-project': string; 'by-module': string };
  };
  pidTuningSessions: {
    key: string;
    value: PidTuningSession;
    indexes: { 'by-project': string };
  };
  syncQueue: {
    key: string;
    value: SyncQueueItem;
    indexes: { 'by-status': string; 'by-created': string };
  };
  syncConflicts: {
    key: string;
    value: SyncConflict;
    indexes: { 'by-entity-type': string; 'by-detected': string };
  };
}

let dbPromise: Promise<IDBPDatabase<BasToolkitDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<BasToolkitDB>('bas-toolkit', 9, {
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

        if (oldVersion < 3) {
          // Network Diagrams
          const diagramStore = db.createObjectStore('networkDiagrams', { keyPath: 'id' });
          diagramStore.createIndex('by-project', 'projectId');

          // Command Snippets
          const snippetStore = db.createObjectStore('commandSnippets', { keyPath: 'id' });
          snippetStore.createIndex('by-category', 'category');

          // Ping Sessions
          const pingStore = db.createObjectStore('pingSessions', { keyPath: 'id' });
          pingStore.createIndex('by-project', 'projectId');
        }

        if (oldVersion < 4) {
          // Terminal Session Logs
          const terminalLogStore = db.createObjectStore('terminalLogs', { keyPath: 'id' });
          terminalLogStore.createIndex('by-project', 'projectId');
        }

        if (oldVersion < 5) {
          // Connection Profiles
          const profileStore = db.createObjectStore('connectionProfiles', { keyPath: 'id' });
          profileStore.createIndex('by-project', 'projectId');
          profileStore.createIndex('by-type', 'connectionType');
        }

        if (oldVersion < 6) {
          // Register Tool Saved Calculations
          const calcStore = db.createObjectStore('registerCalculations', { keyPath: 'id' });
          calcStore.createIndex('by-project', 'projectId');
          calcStore.createIndex('by-module', 'module');
        }

        if (oldVersion < 7) {
          // Sync Queue for cloud backup
          const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
          syncStore.createIndex('by-status', 'status');
          syncStore.createIndex('by-created', 'createdAt');
        }

        if (oldVersion < 8) {
          // Sync Conflicts for offline/online conflict resolution
          const conflictStore = db.createObjectStore('syncConflicts', { keyPath: 'id' });
          conflictStore.createIndex('by-entity-type', 'entityType');
          conflictStore.createIndex('by-detected', 'detectedAt');
        }

        if (oldVersion < 9) {
          // PID Tuning Sessions
          const pidStore = db.createObjectStore('pidTuningSessions', { keyPath: 'id' });
          pidStore.createIndex('by-project', 'projectId');
        }
      },
    }).catch((err) => {
      // Reset so next call retries instead of returning cached failure
      dbPromise = null;
      throw new Error(`Database initialization failed: ${err?.message || err}. The app requires IndexedDB support.`);
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
  notifySync('update', 'projects', project.id, project);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['projects', 'files', 'fileBlobs', 'notes', 'devices', 'ipPlan', 'activityLog', 'dailyReports', 'networkDiagrams', 'pingSessions', 'terminalLogs', 'connectionProfiles', 'registerCalculations', 'pidTuningSessions'], 'readwrite');

  try {
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

    const diagrams = await tx.objectStore('networkDiagrams').index('by-project').getAll(id);
    for (const d of diagrams) await tx.objectStore('networkDiagrams').delete(d.id);

    const pings = await tx.objectStore('pingSessions').index('by-project').getAll(id);
    for (const p of pings) await tx.objectStore('pingSessions').delete(p.id);

    const termLogs = await tx.objectStore('terminalLogs').index('by-project').getAll(id);
    for (const tl of termLogs) await tx.objectStore('terminalLogs').delete(tl.id);

    const connProfiles = await tx.objectStore('connectionProfiles').index('by-project').getAll(id);
    for (const cp of connProfiles) await tx.objectStore('connectionProfiles').delete(cp.id);

    const regCalcs = await tx.objectStore('registerCalculations').index('by-project').getAll(id);
    for (const rc of regCalcs) await tx.objectStore('registerCalculations').delete(rc.id);

    const pidSessions = await tx.objectStore('pidTuningSessions').index('by-project').getAll(id);
    for (const ps of pidSessions) await tx.objectStore('pidTuningSessions').delete(ps.id);

    await tx.objectStore('projects').delete(id);
    await tx.done;
    notifySync('delete', 'projects', id, null);
  } catch (e) {
    tx.abort();
    throw e;
  }
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
  notifySync('update', 'files', file.id, file);
}

export async function deleteFile(id: string): Promise<void> {
  const db = await getDB();
  const file = await db.get('files', id);
  if (file) {
    for (const version of file.versions) {
      if (version.blobKey) await db.delete('fileBlobs', version.blobKey);
    }
  }
  // Clean up notes attached to this file
  const fileNotes = await db.getAllFromIndex('notes', 'by-file', id);
  for (const note of fileNotes) {
    await db.delete('notes', note.id);
  }
  await db.delete('files', id);
  notifySync('delete', 'files', id, null);
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
  notifySync('update', 'notes', note.id, note);
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('notes', id);
  notifySync('delete', 'notes', id, null);
}

// Devices
export async function getProjectDevices(projectId: string): Promise<DeviceEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('devices', 'by-project', projectId);
}

export async function saveDevice(device: DeviceEntry): Promise<void> {
  const db = await getDB();
  await db.put('devices', device);
  notifySync('update', 'devices', device.id, device);
}

export async function deleteDevice(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('devices', id);
  notifySync('delete', 'devices', id, null);
}

export async function saveDevices(devices: DeviceEntry[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('devices', 'readwrite');
  for (const device of devices) {
    await tx.store.put(device);
  }
  await tx.done;
  for (const device of devices) notifySync('update', 'devices', device.id, device);
}

// IP Plan
export async function getProjectIpPlan(projectId: string): Promise<IpPlanEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('ipPlan', 'by-project', projectId);
}

export async function saveIpEntry(entry: IpPlanEntry): Promise<void> {
  const db = await getDB();
  await db.put('ipPlan', entry);
  notifySync('update', 'ipPlan', entry.id, entry);
}

export async function deleteIpEntry(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('ipPlan', id);
  notifySync('delete', 'ipPlan', id, null);
}

export async function saveIpEntries(entries: IpPlanEntry[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('ipPlan', 'readwrite');
  for (const entry of entries) {
    await tx.store.put(entry);
  }
  await tx.done;
  for (const entry of entries) notifySync('update', 'ipPlan', entry.id, entry);
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
  notifySync('update', 'activityLog', entry.id, entry);
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
  notifySync('update', 'dailyReports', report.id, report);
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
  notifySync('delete', 'dailyReports', id, null);
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

// Clear cached file blobs (preserves report attachment blobs)
export async function clearFileCache(): Promise<number> {
  const d = await getDB();
  // Collect blob keys used by report attachments so we don't delete them
  const reports = await d.getAll('dailyReports');
  const attachmentKeys = new Set<string>();
  for (const r of reports) {
    for (const att of (r.attachments || [])) {
      if (att.blobKey) attachmentKeys.add(att.blobKey);
    }
  }
  const tx = d.transaction('fileBlobs', 'readwrite');
  let cursor = await tx.store.openCursor();
  let count = 0;
  while (cursor) {
    if (!attachmentKeys.has(cursor.key as string)) {
      await cursor.delete();
      count++;
    }
    cursor = await cursor.continue();
  }
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
      (d.deviceName || '').toLowerCase().includes(q) ||
      (d.description || '').toLowerCase().includes(q) ||
      (d.panel || '').toLowerCase().includes(q) ||
      (d.system || '').toLowerCase().includes(q) ||
      (d.ipAddress || '').toLowerCase().includes(q) ||
      (d.floor || '').toLowerCase().includes(q) ||
      (d.area || '').toLowerCase().includes(q) ||
      (d.notes || '').toLowerCase().includes(q)
    ),
    ipEntries: ipEntries.filter(e =>
      (e.ipAddress || '').toLowerCase().includes(q) ||
      (e.hostname || '').toLowerCase().includes(q) ||
      (e.panel || '').toLowerCase().includes(q) ||
      (e.vlan || '').toLowerCase().includes(q) ||
      (e.subnet || '').toLowerCase().includes(q) ||
      (e.deviceRole || '').toLowerCase().includes(q) ||
      (e.notes || '').toLowerCase().includes(q)
    ),
  };
}

// ─── Network Diagrams ───────────────────────────────────────
export async function getProjectDiagrams(projectId: string): Promise<NetworkDiagram[]> {
  const db = await getDB();
  const diagrams = await db.getAllFromIndex('networkDiagrams', 'by-project', projectId);
  return diagrams.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getAllDiagrams(): Promise<NetworkDiagram[]> {
  const db = await getDB();
  const diagrams = await db.getAll('networkDiagrams');
  return diagrams.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDiagram(id: string): Promise<NetworkDiagram | undefined> {
  const db = await getDB();
  return db.get('networkDiagrams', id);
}

export async function saveDiagram(diagram: NetworkDiagram): Promise<void> {
  const db = await getDB();
  await db.put('networkDiagrams', diagram);
  notifySync('update', 'networkDiagrams', diagram.id, diagram);
}

export async function deleteDiagram(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('networkDiagrams', id);
  notifySync('delete', 'networkDiagrams', id, null);
}

// ─── Command Snippets ───────────────────────────────────────
export async function getAllSnippets(): Promise<CommandSnippet[]> {
  const db = await getDB();
  const snippets = await db.getAll('commandSnippets');
  return snippets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getSnippetsByCategory(category: string): Promise<CommandSnippet[]> {
  const db = await getDB();
  return db.getAllFromIndex('commandSnippets', 'by-category', category);
}

export async function saveSnippet(snippet: CommandSnippet): Promise<void> {
  const db = await getDB();
  await db.put('commandSnippets', snippet);
  notifySync('update', 'commandSnippets', snippet.id, snippet);
}

export async function deleteSnippet(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('commandSnippets', id);
  notifySync('delete', 'commandSnippets', id, null);
}

// ─── Ping Sessions ──────────────────────────────────────────
export async function getProjectPingSessions(projectId: string): Promise<PingSession[]> {
  const db = await getDB();
  const sessions = await db.getAllFromIndex('pingSessions', 'by-project', projectId);
  return sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getAllPingSessions(): Promise<PingSession[]> {
  const db = await getDB();
  const sessions = await db.getAll('pingSessions');
  return sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function savePingSession(session: PingSession): Promise<void> {
  const db = await getDB();
  await db.put('pingSessions', session);
  notifySync('update', 'pingSessions', session.id, session);
}

export async function deletePingSession(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('pingSessions', id);
  notifySync('delete', 'pingSessions', id, null);
}

// ─── Terminal Session Logs ────────────────────────────────────
export async function getProjectTerminalLogs(projectId: string): Promise<TerminalSessionLog[]> {
  const db = await getDB();
  const logs = await db.getAllFromIndex('terminalLogs', 'by-project', projectId);
  return logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveTerminalLog(log: TerminalSessionLog): Promise<void> {
  const db = await getDB();
  await db.put('terminalLogs', log);
  notifySync('update', 'terminalLogs', log.id, log);
}

export async function deleteTerminalLog(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('terminalLogs', id);
  notifySync('delete', 'terminalLogs', id, null);
}

// ─── Connection Profiles ─────────────────────────────────────
export async function getAllConnectionProfiles(): Promise<ConnectionProfile[]> {
  const db = await getDB();
  const profiles = await db.getAll('connectionProfiles');
  return profiles.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProjectConnectionProfiles(projectId: string): Promise<ConnectionProfile[]> {
  const db = await getDB();
  const profiles = await db.getAllFromIndex('connectionProfiles', 'by-project', projectId);
  return profiles.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveConnectionProfile(profile: ConnectionProfile): Promise<void> {
  const db = await getDB();
  await db.put('connectionProfiles', profile);
  notifySync('update', 'connectionProfiles', profile.id, profile);
}

export async function deleteConnectionProfile(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('connectionProfiles', id);
  notifySync('delete', 'connectionProfiles', id, null);
}

// ─── Register Calculations ───────────────────────────────────
export async function getAllRegisterCalculations(): Promise<SavedCalculation[]> {
  const db = await getDB();
  const calcs = await db.getAll('registerCalculations');
  return calcs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProjectRegisterCalculations(projectId: string): Promise<SavedCalculation[]> {
  const db = await getDB();
  const calcs = await db.getAllFromIndex('registerCalculations', 'by-project', projectId);
  return calcs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveRegisterCalculation(calc: SavedCalculation): Promise<void> {
  const db = await getDB();
  await db.put('registerCalculations', calc);
  notifySync('update', 'registerCalculations', calc.id, calc);
}

export async function deleteRegisterCalculation(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('registerCalculations', id);
  notifySync('delete', 'registerCalculations', id, null);
}

// ─── PID Tuning Sessions ─────────────────────────────────────
export async function getAllPidTuningSessions(): Promise<PidTuningSession[]> {
  const db = await getDB();
  const sessions = await db.getAll('pidTuningSessions');
  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProjectPidTuningSessions(projectId: string): Promise<PidTuningSession[]> {
  const db = await getDB();
  const sessions = await db.getAllFromIndex('pidTuningSessions', 'by-project', projectId);
  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getPidTuningSession(id: string): Promise<PidTuningSession | undefined> {
  const db = await getDB();
  return db.get('pidTuningSessions', id);
}

export async function savePidTuningSession(session: PidTuningSession): Promise<void> {
  const db = await getDB();
  await db.put('pidTuningSessions', session);
  notifySync('update', 'pidTuningSessions', session.id, session);
}

export async function deletePidTuningSession(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('pidTuningSessions', id);
  notifySync('delete', 'pidTuningSessions', id, null);
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
      (p.name || '').toLowerCase().includes(q) ||
      (p.customerName || '').toLowerCase().includes(q) ||
      (p.projectNumber || '').toLowerCase().includes(q) ||
      (p.siteAddress || '').toLowerCase().includes(q) ||
      (p.buildingArea || '').toLowerCase().includes(q) ||
      (p.tags || []).some(t => t.toLowerCase().includes(q))
    ),
    files: files.filter(f =>
      (f.title || '').toLowerCase().includes(q) ||
      (f.fileName || '').toLowerCase().includes(q) ||
      (f.notes || '').toLowerCase().includes(q) ||
      (f.tags || []).some(t => t.toLowerCase().includes(q)) ||
      (f.panelSystem || '').toLowerCase().includes(q)
    ),
    notes: notes.filter(n =>
      (n.content || '').toLowerCase().includes(q) ||
      (n.tags || []).some(t => t.toLowerCase().includes(q))
    ),
    devices: devices.filter(d =>
      (d.deviceName || '').toLowerCase().includes(q) ||
      (d.description || '').toLowerCase().includes(q) ||
      (d.panel || '').toLowerCase().includes(q) ||
      (d.ipAddress || '').toLowerCase().includes(q)
    ),
    ipEntries: ipEntries.filter(e =>
      (e.ipAddress || '').toLowerCase().includes(q) ||
      (e.hostname || '').toLowerCase().includes(q) ||
      (e.panel || '').toLowerCase().includes(q) ||
      (e.deviceRole || '').toLowerCase().includes(q)
    ),
    dailyReports: dailyReports.filter(r =>
      (r.technicianName || '').toLowerCase().includes(q) ||
      (r.workCompleted || '').toLowerCase().includes(q) ||
      (r.issuesEncountered || '').toLowerCase().includes(q) ||
      (r.workPlannedNext || '').toLowerCase().includes(q) ||
      (r.equipmentWorkedOn || '').toLowerCase().includes(q) ||
      (r.generalNotes || '').toLowerCase().includes(q) ||
      (r.location || '').toLowerCase().includes(q) ||
      r.date.includes(q)
    ),
  };
}

// ─── Sync Queue ─────────────────────────────────────────────
export async function addSyncItem(item: SyncQueueItem): Promise<void> {
  const db = await getDB();
  await db.put('syncQueue', item);
}

export async function getPendingSyncItems(limit = 20): Promise<SyncQueueItem[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('syncQueue', 'by-status', 'pending');
  return all.slice(0, limit);
}

export async function updateSyncItem(item: SyncQueueItem): Promise<void> {
  const db = await getDB();
  await db.put('syncQueue', item);
}

export async function deleteSyncItem(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('syncQueue', id);
}

export async function getSyncQueueCount(): Promise<{ pending: number; failed: number }> {
  const db = await getDB();
  const pending = await db.countFromIndex('syncQueue', 'by-status', 'pending');
  const failed = await db.countFromIndex('syncQueue', 'by-status', 'failed');
  return { pending, failed };
}

export async function clearCompletedSyncItems(): Promise<void> {
  const db = await getDB();
  const completed = await db.getAllFromIndex('syncQueue', 'by-status', 'completed');
  const tx = db.transaction('syncQueue', 'readwrite');
  for (const item of completed) {
    await tx.store.delete(item.id);
  }
  await tx.done;
}

export async function resetFailedSyncItems(): Promise<number> {
  const db = await getDB();
  const failed = await db.getAllFromIndex('syncQueue', 'by-status', 'failed');
  const tx = db.transaction('syncQueue', 'readwrite');
  for (const item of failed) {
    await tx.store.put({ ...item, status: 'pending', retriedCount: 0, lastError: undefined });
  }
  await tx.done;
  return failed.length;
}

// Clear the entire sync queue (used before fullSync to prevent duplicates)
export async function clearSyncQueue(): Promise<number> {
  const db = await getDB();
  const tx = db.transaction('syncQueue', 'readwrite');
  const count = await tx.store.count();
  await tx.store.clear();
  await tx.done;
  return count;
}

// ─── Sync Conflicts ─────────────────────────────────────────
export async function addSyncConflict(conflict: SyncConflict): Promise<void> {
  const db = await getDB();
  await db.put('syncConflicts', conflict);
}

export async function getAllSyncConflicts(): Promise<SyncConflict[]> {
  const db = await getDB();
  return db.getAllFromIndex('syncConflicts', 'by-detected');
}

export async function getSyncConflictCount(): Promise<number> {
  const db = await getDB();
  return db.count('syncConflicts');
}

export async function deleteSyncConflict(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('syncConflicts', id);
}

export async function clearAllSyncConflicts(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('syncConflicts', 'readwrite');
  await tx.store.clear();
  await tx.done;
}

// Get the first error message from failed sync items (for diagnostics)
export async function getFirstSyncError(): Promise<string | null> {
  const db = await getDB();
  const failed = await db.getAllFromIndex('syncQueue', 'by-status', 'failed');
  if (failed.length === 0) return null;
  // Return the first non-empty lastError
  for (const item of failed) {
    if (item.lastError) return `[${item.entityType}/${item.entityId}] ${item.lastError}`;
  }
  return `${failed.length} failed item(s) with no error details`;
}

/** Get recent activity across ALL projects, ordered by timestamp descending. */
export async function getAllRecentActivity(limit = 15): Promise<ActivityLogEntry[]> {
  const db = await getDB();
  const entries: ActivityLogEntry[] = [];
  let cursor = await db.transaction('activityLog').store.index('by-timestamp').openCursor(null, 'prev');
  while (cursor && entries.length < limit) {
    entries.push(cursor.value);
    cursor = await cursor.continue();
  }
  return entries;
}

/** Get file/note/device counts for multiple projects in a single transaction. */
export async function getAllProjectEntityCounts(
  projectIds: string[]
): Promise<Map<string, { files: number; notes: number; devices: number }>> {
  const db = await getDB();
  const tx = db.transaction(['files', 'notes', 'devices'], 'readonly');
  const result = new Map<string, { files: number; notes: number; devices: number }>();
  for (const id of projectIds) {
    const [files, notes, devices] = await Promise.all([
      tx.objectStore('files').index('by-project').count(id),
      tx.objectStore('notes').index('by-project').count(id),
      tx.objectStore('devices').index('by-project').count(id),
    ]);
    result.set(id, { files, notes, devices });
  }
  return result;
}

/** Get most recent field notes across all projects. */
export async function getRecentNotes(limit = 5): Promise<FieldNote[]> {
  const db = await getDB();
  const allNotes = await db.getAll('notes');
  return allNotes
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/**
 * Delete orphaned child records from IndexedDB — records whose projectId
 * doesn't match any existing project. Returns count of deleted records.
 */
export async function purgeOrphanedRecords(): Promise<number> {
  const db = await getDB();
  const projects = await db.getAll('projects');
  const validIds = new Set(projects.map((p) => p.id));
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const childStores = [
    'files', 'notes', 'devices', 'ipPlan', 'activityLog',
    'dailyReports', 'networkDiagrams', 'pingSessions',
    'terminalLogs', 'connectionProfiles', 'registerCalculations', 'pidTuningSessions',
  ] as const;

  let totalDeleted = 0;

  // Collect orphaned file blob keys so we can clean up fileBlobs store after
  const orphanedBlobKeys: string[] = [];

  for (const storeName of childStores) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = db.transaction(storeName as any, 'readwrite');
    const allItems = await tx.store.getAll();
    for (const item of allItems) {
      const rec = item as Record<string, unknown>;
      const pid = rec.projectId as string | undefined;
      // Delete if projectId is missing, empty, non-UUID, or references a deleted project
      if (!pid || !UUID_RE.test(pid) || !validIds.has(pid)) {
        // If this is a file record, collect its blob keys for cleanup
        if (storeName === 'files') {
          const versions = (rec.versions ?? []) as Array<{ blobKey?: string }>;
          for (const v of versions) {
            if (v.blobKey) orphanedBlobKeys.push(v.blobKey);
          }
        }
        await tx.store.delete(rec.id as string);
        totalDeleted++;
      }
    }
    await tx.done;
  }

  // Clean up fileBlobs for orphaned files
  if (orphanedBlobKeys.length > 0) {
    const blobTx = db.transaction('fileBlobs', 'readwrite');
    for (const key of orphanedBlobKeys) {
      await blobTx.store.delete(key);
    }
    await blobTx.done;
  }

  return totalDeleted;
}

// Get all items from a store (for full sync)
export async function getAllFromStore(storeName: string): Promise<unknown[]> {
  const db = await getDB();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return db.getAll(storeName as any);
}

// ── Pull sync helpers (bypass notifySync to avoid re-pushing pulled data) ──

/**
 * Bulk-write items to any store WITHOUT triggering the sync bridge.
 * Used by pull sync so downloaded data isn't re-pushed to Supabase.
 */
export async function bulkPutSilent(
  storeName: string,
  items: Record<string, unknown>[],
): Promise<number> {
  if (items.length === 0) return 0;
  const db = await getDB();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx = db.transaction(storeName as any, 'readwrite');
  for (const item of items) {
    await tx.store.put(item);
  }
  await tx.done;
  return items.length;
}

/**
 * Clear ALL data from every IndexedDB store.
 * Used for account deletion — wipes the entire local database.
 */
export async function clearAllData(): Promise<void> {
  const db = await getDB();
  const storeNames = [
    'projects', 'files', 'fileBlobs', 'notes', 'devices', 'ipPlan',
    'activityLog', 'dailyReports', 'networkDiagrams', 'commandSnippets',
    'pingSessions', 'terminalLogs', 'connectionProfiles', 'registerCalculations',
    'pidTuningSessions', 'syncQueue',
  ] as const;
  for (const name of storeNames) {
    const tx = db.transaction(name, 'readwrite');
    await tx.store.clear();
    await tx.done;
  }
}

/**
 * Delete items from any store by ID WITHOUT triggering the sync bridge.
 * Used by pull sync to apply soft-deletes from the cloud.
 */
export async function bulkDeleteSilent(
  storeName: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await getDB();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx = db.transaction(storeName as any, 'readwrite');
  for (const id of ids) {
    await tx.store.delete(id);
  }
  await tx.done;
  return ids.length;
}
