import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Project, ProjectFile, FieldNote,
  DeviceEntry, IpPlanEntry, ActivityLogEntry, DailyReport,
  NetworkDiagram, CommandSnippet, PingSession, TerminalSessionLog,
  ConnectionProfile, SavedCalculation, PidTuningSession, PpclDocument, BugReport,
  PsychSession, UserReview, TrendSession,
  SyncQueueItem, SyncConflict, DxrEntry, SyncError,
} from '@/types';
import type {
  GlobalProject, GlobalFieldNote, GlobalDevice, GlobalIpPlanEntry,
  GlobalDailyReport, GlobalActivityLogEntry, GlobalNetworkDiagram,
  GlobalProjectFile, GlobalPpclDocument, GlobalTerminalSessionLog,
  GlobalPidTuningSession, GlobalPsychSession, GlobalRegisterCalculation,
  GlobalPingSession, GlobalTrendSession, GlobalConnectionProfile,
  GlobalFieldPanel, GlobalNotepadEntry, GlobalProjectPreferences,
  GlobalDxrEntry,
} from '@/types/global-projects';
import { notifySync } from '@/lib/sync/sync-bridge';
import type { SyncEntityType } from '@/types';

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
  ppclDocuments: {
    key: string;
    value: PpclDocument;
    indexes: { 'by-updated': string; 'by-project': string };
  };
  psychSessions: {
    key: string;
    value: PsychSession;
    indexes: { 'by-project': string };
  };
  trendSessions: {
    key: string;
    value: TrendSession;
    indexes: { 'by-project': string; 'by-updated': string };
  };
  bugReports: {
    key: string;
    value: BugReport;
    indexes: { 'by-status': string; 'by-severity': string };
  };
  reviews: {
    key: string;
    value: UserReview;
    indexes: { 'by-rating': number };
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
  // ─── Global mirror stores (v19) ──
  // Read-mostly IndexedDB cache of Supabase global_* tables. SyncManager writes
  // here on pull + realtime change events. Indexes mirror the local stores
  // where possible (use globalProjectId in place of projectId).
  globalProjects: {
    key: string;
    value: GlobalProject;
    indexes: { 'by-updated': string; 'by-created': string };
  };
  globalNotes: {
    key: string;
    value: GlobalFieldNote;
    indexes: { 'by-project': string; 'by-updated': string };
  };
  globalDevices: {
    key: string;
    value: GlobalDevice;
    indexes: { 'by-project': string; 'by-updated': string };
  };
  globalIpPlan: {
    key: string;
    value: GlobalIpPlanEntry;
    indexes: { 'by-project': string; 'by-updated': string };
  };
  globalDailyReports: {
    key: string;
    value: GlobalDailyReport;
    indexes: { 'by-project': string; 'by-updated': string };
  };
  globalActivityLog: {
    key: string;
    value: GlobalActivityLogEntry;
    indexes: { 'by-project': string; 'by-timestamp': string };
  };
  globalNetworkDiagrams: {
    key: string;
    value: GlobalNetworkDiagram;
    indexes: { 'by-project': string; 'by-updated': string };
  };
  globalProjectFiles: {
    key: string;
    value: GlobalProjectFile;
    indexes: { 'by-project': string; 'by-updated': string };
  };
  globalPpclDocuments: {
    key: string;
    value: GlobalPpclDocument;
    indexes: { 'by-project': string; 'by-updated': string };
  };
  globalTerminalLogs: {
    key: string;
    value: GlobalTerminalSessionLog;
    indexes: { 'by-project': string; 'by-updated': string };
  };
  globalPidTuningSessions: {
    key: string;
    value: GlobalPidTuningSession;
    indexes: { 'by-project': string; 'by-updated': string };
  };
  globalPsychSessions: {
    key: string;
    value: GlobalPsychSession;
    indexes: { 'by-project': string; 'by-updated': string };
  };
  globalRegisterCalculations: {
    key: string;
    value: GlobalRegisterCalculation;
    indexes: { 'by-project': string; 'by-updated': string };
  };
  globalPingSessions: {
    key: string;
    value: GlobalPingSession;
    indexes: { 'by-project': string; 'by-updated': string };
  };
  globalTrendSessions: {
    key: string;
    value: GlobalTrendSession;
    indexes: { 'by-project': string; 'by-updated': string };
  };
  globalConnectionProfiles: {
    key: string;
    value: GlobalConnectionProfile;
    indexes: { 'by-project': string; 'by-updated': string };
  };
  globalFieldPanels: {
    key: string;
    value: GlobalFieldPanel;
    indexes: { 'by-project': string; 'by-updated': string };
  };
  globalNotepadEntries: {
    key: string;
    value: GlobalNotepadEntry;
    indexes: { 'by-project': string; 'by-updated': string };
  };
  // Composite-PK mirror: TS keyPath is the synthetic `prefKey` field
  // ("${userId}|${globalProjectId}") populated on pull; the Supabase upsert
  // uses onConflict: 'user_id,global_project_id' instead of this synthetic id.
  // See SyncManager.pullSync → preferences branch.
  globalProjectPreferences: {
    key: string;
    value: GlobalProjectPreferences & { prefKey: string };
    indexes: { 'by-project': string; 'by-user': string };
  };
  // ─── DXR stores (v20) ──
  dxrs: {
    key: string;
    value: DxrEntry;
    indexes: {
      'by-project': string;
      'by-project-guid': [string, string];
    };
  };
  globalDxrs: {
    key: string;
    value: GlobalDxrEntry;
    indexes: {
      'by-project': string;
      'by-project-guid': [string, string];
    };
  };
  // ─── Sync Error log (v21) ──
  syncErrors: {
    key: string;
    value: SyncError;
    indexes: {
      'by-created-at': string;
      'by-entity-type': string;
      'by-error-code': string;
    };
  };
}

/** Union of all object-store names in the schema — use instead of bare `string`. */
export type BasToolkitStoreName =
  | 'projects' | 'files' | 'fileBlobs' | 'notes' | 'devices' | 'ipPlan'
  | 'activityLog' | 'dailyReports' | 'networkDiagrams' | 'commandSnippets'
  | 'pingSessions' | 'terminalLogs' | 'connectionProfiles' | 'registerCalculations'
  | 'pidTuningSessions' | 'ppclDocuments' | 'psychSessions' | 'trendSessions' | 'bugReports' | 'reviews' | 'syncQueue' | 'syncConflicts'
  // ── Global mirrors (v19) — same set as GLOBAL_ENTITY_TYPES in field-map.ts ──
  | 'globalProjects' | 'globalNotes' | 'globalDevices' | 'globalIpPlan'
  | 'globalDailyReports' | 'globalActivityLog' | 'globalNetworkDiagrams'
  | 'globalProjectFiles' | 'globalPpclDocuments' | 'globalTerminalLogs'
  | 'globalPidTuningSessions' | 'globalPsychSessions' | 'globalRegisterCalculations'
  | 'globalPingSessions' | 'globalTrendSessions' | 'globalConnectionProfiles'
  | 'globalFieldPanels' | 'globalNotepadEntries' | 'globalProjectPreferences'
  // ── DXR stores (v20) ──
  | 'dxrs' | 'globalDxrs'
  // ── Sync Error log (v21) ──
  | 'syncErrors';

/** Current schema version — bump this and add a new `if (oldVersion < N)` block when changing the schema. */
export const DB_VERSION = 21;

let dbPromise: Promise<IDBPDatabase<BasToolkitDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<BasToolkitDB>('bas-toolkit', DB_VERSION, {
      blocked(currentVersion, blockedVersion) {
        console.warn(`IndexedDB upgrade blocked: v${currentVersion} → v${blockedVersion}. Close other tabs to proceed.`);
      },
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

        if (oldVersion < 10) {
          // Project Notepad Entries (legacy — store kept for migration compat)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const notepadStore = (db as any).createObjectStore('projectNotepadEntries', { keyPath: 'id' });
          notepadStore.createIndex('by-project', 'projectId');
        }

        if (oldVersion < 11) {
          // Bug Reports
          const bugReportStore = db.createObjectStore('bugReports', { keyPath: 'id' });
          bugReportStore.createIndex('by-status', 'status');
          bugReportStore.createIndex('by-severity', 'severity');
        }

        if (oldVersion < 12) {
          // Notepad Documents (legacy — store kept for migration compat)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const notepadDocStore = (db as any).createObjectStore('notepadDocuments', { keyPath: 'id' });
          notepadDocStore.createIndex('by-updated', 'updatedAt');
          notepadDocStore.createIndex('by-language', 'language');
        }

        if (oldVersion < 14) {
          // Field Panels (legacy — store kept for migration compat)
          // v13 and v14 were identical; consolidated into a single guard.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (!(db as any).objectStoreNames.contains('fieldPanels')) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const panelStore = (db as any).createObjectStore('fieldPanels', { keyPath: 'id' });
            panelStore.createIndex('by-updated', 'updatedAt');
            panelStore.createIndex('by-status', 'panelStatus');
            panelStore.createIndex('by-site', 'site');
            panelStore.createIndex('by-project', 'projectId');
          }
        }

        if (oldVersion < 15) {
          // PPCL Documents
          const ppclStore = db.createObjectStore('ppclDocuments', { keyPath: 'id' });
          ppclStore.createIndex('by-updated', 'updatedAt');
          ppclStore.createIndex('by-project', 'projectId');
        }

        if (oldVersion < 16) {
          // Psychrometric Calculator Sessions
          const psychStore = db.createObjectStore('psychSessions', { keyPath: 'id' });
          psychStore.createIndex('by-project', 'projectId');
        }

        if (oldVersion < 17) {
          // User Reviews
          const reviewStore = db.createObjectStore('reviews', { keyPath: 'id' });
          reviewStore.createIndex('by-rating', 'rating');
        }

        if (oldVersion < 18) {
          // Trend Viewer Sessions
          const trendStore = db.createObjectStore('trendSessions', { keyPath: 'id' });
          trendStore.createIndex('by-project', 'projectId');
          trendStore.createIndex('by-updated', 'updatedAt');
        }

        if (oldVersion < 19) {
          // ─── Global mirror stores ──────────────────────────────────────────
          // Read-mostly IndexedDB cache of Supabase global_* tables. SyncManager
          // writes here on pull + realtime change events. Indexes mirror the
          // local stores where possible, using `globalProjectId` in place of
          // `projectId`.

          // globalProjects — top-level, no parent FK
          const gpStore = db.createObjectStore('globalProjects', { keyPath: 'id' });
          gpStore.createIndex('by-updated', 'updatedAt');
          gpStore.createIndex('by-created', 'createdAt');

          // Standard global child stores (PK: id, indexes: globalProjectId, updatedAt)
          const standardChildStores: readonly string[] = [
            'globalNotes', 'globalDevices', 'globalIpPlan', 'globalDailyReports',
            'globalNetworkDiagrams', 'globalProjectFiles', 'globalPpclDocuments',
            'globalTerminalLogs', 'globalPidTuningSessions', 'globalPsychSessions',
            'globalRegisterCalculations', 'globalPingSessions', 'globalTrendSessions',
            'globalConnectionProfiles', 'globalFieldPanels', 'globalNotepadEntries',
          ];
          for (const name of standardChildStores) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const store = (db as any).createObjectStore(name, { keyPath: 'id' });
            store.createIndex('by-project', 'globalProjectId');
            store.createIndex('by-updated', 'updatedAt');
          }

          // globalActivityLog — append-only, indexed by timestamp (no updatedAt column)
          const galStore = db.createObjectStore('globalActivityLog', { keyPath: 'id' });
          galStore.createIndex('by-project', 'globalProjectId');
          galStore.createIndex('by-timestamp', 'timestamp');

          // globalProjectPreferences — composite PK (user_id, global_project_id)
          // in Postgres. Dexie can't model that natively; we synthesize a string
          // primary key `${userId}|${globalProjectId}` written to the
          // `prefKey` field by SyncManager on pull. Realtime upserts compute
          // the same key. The Supabase upsert uses onConflict:
          // 'user_id,global_project_id' (NOT this synthetic id) — see
          // SyncManager.processItem → globalProjectPreferences branch.
          const gprefStore = db.createObjectStore('globalProjectPreferences', { keyPath: 'prefKey' });
          gprefStore.createIndex('by-project', 'globalProjectId');
          gprefStore.createIndex('by-user', 'userId');
        }

        if (oldVersion < 20) {
          // ─── DXR stores ────────────────────────────────────────────────────
          // Local per-project DXR rows imported from Desigo CC "DXR Smart Copy"
          // Excel exports. Unique keyed on (projectId, guid) so re-imports are
          // idempotent.
          const dxrStore = db.createObjectStore('dxrs', { keyPath: 'id' });
          dxrStore.createIndex('by-project', 'projectId');
          dxrStore.createIndex('by-project-guid', ['projectId', 'guid'], { unique: true });

          // globalDxrs — read-mostly mirror of Supabase global_dxrs table.
          const globalDxrStore = db.createObjectStore('globalDxrs', { keyPath: 'id' });
          globalDxrStore.createIndex('by-project', 'globalProjectId');
          globalDxrStore.createIndex('by-project-guid', ['globalProjectId', 'guid'], { unique: true });
        }

        if (oldVersion < 21) {
          // ─── Sync Error log ────────────────────────────────────────────────
          // Captures every push/pull failure from SyncManager for the in-app
          // Sync Error Inspector. Rotated to a max of 100 rows (oldest-first).
          const syncErrorStore = db.createObjectStore('syncErrors', { keyPath: 'id' });
          syncErrorStore.createIndex('by-created-at', 'createdAt');
          syncErrorStore.createIndex('by-entity-type', 'entityType');
          syncErrorStore.createIndex('by-error-code', 'errorCode');
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

// ─── Generic Repository ─────────────────────────────────────
// Eliminates per-entity CRUD boilerplate. Each repository provides getAll,
// getByProject, get, save, and delete — all wired to notifySync.

type AnyRecord = Record<string, unknown>;

function sortDesc<T>(items: T[], field: string): T[] {
  return items.sort((a, b) =>
    String((b as AnyRecord)[field]).localeCompare(String((a as AnyRecord)[field]))
  );
}

interface Repository<T> {
  getAll(): Promise<T[]>;
  getByProject(projectId: string): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  save(item: T): Promise<void>;
  delete(id: string): Promise<void>;
}

function createRepository<T extends { id: string }>(
  storeName: BasToolkitStoreName & SyncEntityType,
  sortField = 'updatedAt',
): Repository<T> {
  return {
    async getAll(): Promise<T[]> {
      const d = await getDB();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return sortDesc(await d.getAll(storeName as any), sortField);
    },
    async getByProject(projectId: string): Promise<T[]> {
      const d = await getDB();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return sortDesc(await (d as any).getAllFromIndex(storeName, 'by-project', projectId), sortField);
    },
    async get(id: string): Promise<T | undefined> {
      const d = await getDB();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return d.get(storeName as any, id);
    },
    async save(item: T): Promise<void> {
      const d = await getDB();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await d.put(storeName as any, item);
      notifySync('update', storeName, item.id, item);
    },
    async delete(id: string): Promise<void> {
      const d = await getDB();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await d.delete(storeName as any, id);
      notifySync('delete', storeName, id, null);
    },
  };
}

// ─── Repository instances ───────────────────────────────────

const projectRepo      = createRepository<Project>('projects');
const diagramRepo      = createRepository<NetworkDiagram>('networkDiagrams');
const connProfileRepo  = createRepository<ConnectionProfile>('connectionProfiles');
const regCalcRepo      = createRepository<SavedCalculation>('registerCalculations');
const pidRepo          = createRepository<PidTuningSession>('pidTuningSessions');
const ppclRepo         = createRepository<PpclDocument>('ppclDocuments');
const psychRepo        = createRepository<PsychSession>('psychSessions');
const trendRepo        = createRepository<TrendSession>('trendSessions');
const snippetRepo      = createRepository<CommandSnippet>('commandSnippets');
const pingRepo         = createRepository<PingSession>('pingSessions', 'createdAt');
const termLogRepo      = createRepository<TerminalSessionLog>('terminalLogs', 'createdAt');
const bugReportRepo    = createRepository<BugReport>('bugReports', 'createdAt');
const reviewRepo       = createRepository<UserReview>('reviews', 'createdAt');
const noteRepo         = createRepository<FieldNote>('notes', 'createdAt');
const deviceRepo       = createRepository<DeviceEntry>('devices');
const ipPlanRepo       = createRepository<IpPlanEntry>('ipPlan');
const activityRepo     = createRepository<ActivityLogEntry>('activityLog', 'timestamp');
const dailyReportRepo  = createRepository<DailyReport>('dailyReports');
const fileRepo         = createRepository<ProjectFile>('files');

// ─── Projects ───────────────────────────────────────────────

export const getAllProjects = projectRepo.getAll;
export const getProject    = projectRepo.get;
export const saveProject   = projectRepo.save;

/** Stores whose children are cascade-deleted when a project is removed. */
const PROJECT_CHILD_STORES: readonly SyncEntityType[] = [
  'files', 'notes', 'devices', 'ipPlan', 'activityLog',
  'dailyReports', 'networkDiagrams', 'pingSessions',
  'terminalLogs', 'connectionProfiles', 'registerCalculations',
  'pidTuningSessions', 'ppclDocuments', 'psychSessions', 'trendSessions', 'dxrs',
];

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx = (db as any).transaction(['projects', 'fileBlobs', ...PROJECT_CHILD_STORES], 'readwrite');

  try {
    // Track deleted IDs per store for sync notifications after commit
    const deleted = new Map<SyncEntityType, string[]>();

    // Handle blob cleanup for files and daily reports
    const files = await tx.objectStore('files').index('by-project').getAll(id);
    for (const file of files) {
      for (const version of file.versions) {
        if (version.blobKey) await tx.objectStore('fileBlobs').delete(version.blobKey);
      }
    }
    const reports = await tx.objectStore('dailyReports').index('by-project').getAll(id);
    for (const report of reports) {
      for (const att of (report.attachments ?? [])) {
        if (att.blobKey) await tx.objectStore('fileBlobs').delete(att.blobKey);
      }
    }

    // Cascade-delete all child stores
    for (const store of PROJECT_CHILD_STORES) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = await (tx as any).objectStore(store).index('by-project').getAll(id);
      const ids: string[] = [];
      for (const item of items) {
        const rec = item as unknown as { id: string };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (tx as any).objectStore(store).delete(rec.id);
        ids.push(rec.id);
      }
      deleted.set(store, ids);
    }

    await tx.objectStore('projects').delete(id);
    await tx.done;

    // Notify sync bridge about cascade-deleted children
    for (const [store, ids] of deleted) {
      for (const childId of ids) notifySync('delete', store, childId, null);
    }
    notifySync('delete', 'projects', id, null);
  } catch (e) {
    tx.abort();
    throw e;
  }
}

// ─── Files ──────────────────────────────────────────────────

export const getAllFiles    = fileRepo.getAll;
export const getFile       = fileRepo.get;
export const saveFile      = fileRepo.save;

export async function getUnassignedFiles(): Promise<ProjectFile[]> {
  const db = await getDB();
  const files = await db.getAllFromIndex('files', 'by-project', '');
  return sortDesc(files, 'updatedAt');
}

export async function getProjectFiles(projectId: string): Promise<ProjectFile[]> {
  const db = await getDB();
  return db.getAllFromIndex('files', 'by-project', projectId);
}

export async function getFilesByCategory(projectId: string, category: string): Promise<ProjectFile[]> {
  const db = await getDB();
  return db.getAllFromIndex('files', 'by-category', [projectId, category]);
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
    notifySync('delete', 'notes', note.id, null);
  }
  await db.delete('files', id);
  notifySync('delete', 'files', id, null);
}

// ─── File Blobs ─────────────────────────────────────────────

/**
 * Evict the oldest cached blobs (by `cachedAt`) when storage is >80% full.
 * Uses the storage estimate API; no-ops on browsers that don't support it.
 * The `fileBlobs` store has no `by-cached-at` index, so we sort in-memory.
 */
async function evictOldBlobsIfNeeded(db: IDBPDatabase<BasToolkitDB>): Promise<void> {
  if (!navigator.storage?.estimate) return;
  const { usage = 0, quota = 1 } = await navigator.storage.estimate();
  if (quota === 0 || usage / quota < 0.8) return;
  const blobs = await db.getAll('fileBlobs');
  if (blobs.length === 0) return;
  // Sort ascending by cachedAt (oldest first)
  blobs.sort((a, b) => a.cachedAt.localeCompare(b.cachedAt));
  const evictCount = Math.max(5, Math.floor(blobs.length * 0.1));
  for (const entry of blobs.slice(0, evictCount)) {
    await db.delete('fileBlobs', entry.id);
  }
}

export async function saveFileBlob(id: string, blob: Blob): Promise<void> {
  const db = await getDB();
  await evictOldBlobsIfNeeded(db);
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

// ─── Notes ──────────────────────────────────────────────────

export const getProjectNotes = noteRepo.getByProject;
export const saveNote        = noteRepo.save;
export const deleteNote      = noteRepo.delete;

export async function getFileNotes(fileId: string): Promise<FieldNote[]> {
  const db = await getDB();
  return db.getAllFromIndex('notes', 'by-file', fileId);
}

// ─── Devices ────────────────────────────────────────────────

export const getProjectDevices = deviceRepo.getByProject;
export const saveDevice        = deviceRepo.save;
export const deleteDevice      = deviceRepo.delete;

export async function saveDevices(devices: DeviceEntry[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('devices', 'readwrite');
  for (const device of devices) await tx.store.put(device);
  await tx.done;
  for (const device of devices) notifySync('update', 'devices', device.id, device);
}

// ─── DXR Entries ────────────────────────────────────────────

export const getProjectDxrs = async (projectId: string): Promise<DxrEntry[]> => {
  const db = await getDB();
  return sortDesc(await db.getAllFromIndex('dxrs', 'by-project', projectId), 'updatedAt');
};

export async function addProjectDxr(dxr: DxrEntry): Promise<void> {
  const db = await getDB();
  await db.put('dxrs', dxr);
  notifySync('update', 'dxrs', dxr.id, dxr);
}

export async function updateProjectDxr(dxr: DxrEntry): Promise<void> {
  const db = await getDB();
  await db.put('dxrs', dxr);
  notifySync('update', 'dxrs', dxr.id, dxr);
}

export async function deleteProjectDxr(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('dxrs', id);
  notifySync('delete', 'dxrs', id, null);
}

/**
 * Bulk upsert DXR rows for a project, keyed on (projectId, guid).
 * - New rows get a generated UUID + createdAt.
 * - Existing rows (matched by guid) preserve id/createdAt and bump updatedAt.
 * - Rows with a null guid are always inserted as new (can't upsert without key).
 * Enqueues sync for every written row via notifySync.
 */
export async function bulkUpsertProjectDxrs(
  projectId: string,
  rows: Omit<DxrEntry, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>[],
): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };

  const { v4: uuidv4 } = await import('uuid');
  const db = await getDB();
  const now = new Date().toISOString();

  // Build a lookup map of existing rows: guid → DxrEntry
  const existing = await db.getAllFromIndex('dxrs', 'by-project', projectId);
  const existingByGuid = new Map<string, DxrEntry>();
  for (const row of existing) {
    if (row.guid) existingByGuid.set(row.guid, row);
  }

  const tx = db.transaction('dxrs', 'readwrite');
  let inserted = 0;
  let updated = 0;
  const written: DxrEntry[] = [];

  for (const row of rows) {
    const existing = row.guid ? existingByGuid.get(row.guid) : undefined;

    if (existing) {
      // Update: preserve id and createdAt, bump updatedAt
      const updated_row: DxrEntry = {
        ...existing,
        ...row,
        id: existing.id,
        projectId,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
      await tx.store.put(updated_row);
      written.push(updated_row);
      updated++;
    } else {
      // Insert: generate id and timestamps
      const new_row: DxrEntry = {
        ...row,
        id: uuidv4(),
        projectId,
        createdAt: now,
        updatedAt: now,
      };
      await tx.store.put(new_row);
      written.push(new_row);
      inserted++;
    }
  }

  await tx.done;

  // Enqueue sync for all written rows
  for (const row of written) {
    notifySync('update', 'dxrs', row.id, row);
  }

  return { inserted, updated };
}

/**
 * Delete every DXR row belonging to a project. Returns the number of rows
 * removed. Each deletion is enqueued for sync so it propagates to the user's
 * per-user `public.dxrs` table and (via reconcile) to Global Projects.
 */
export async function clearProjectDxrs(projectId: string): Promise<number> {
  const db = await getDB();
  const rows = await db.getAllFromIndex('dxrs', 'by-project', projectId);
  if (rows.length === 0) return 0;

  const tx = db.transaction('dxrs', 'readwrite');
  for (const row of rows) {
    await tx.store.delete(row.id);
  }
  await tx.done;

  for (const row of rows) {
    notifySync('delete', 'dxrs', row.id, null);
  }

  return rows.length;
}

// ─── IP Plan ────────────────────────────────────────────────

export const getProjectIpPlan = ipPlanRepo.getByProject;
export const saveIpEntry      = ipPlanRepo.save;
export const deleteIpEntry    = ipPlanRepo.delete;

export async function saveIpEntries(entries: IpPlanEntry[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('ipPlan', 'readwrite');
  for (const entry of entries) await tx.store.put(entry);
  await tx.done;
  for (const entry of entries) notifySync('update', 'ipPlan', entry.id, entry);
}

// ─── Activity Log ───────────────────────────────────────────

export const getProjectActivity = activityRepo.getByProject;
export const addActivity        = activityRepo.save;

// ─── Daily Reports ──────────────────────────────────────────

const dailyReportSort = (items: DailyReport[]) =>
  items.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

export async function getAllDailyReports(): Promise<DailyReport[]> {
  const db = await getDB();
  return dailyReportSort(await db.getAll('dailyReports'));
}

export async function getProjectDailyReports(projectId: string): Promise<DailyReport[]> {
  const db = await getDB();
  return dailyReportSort(await db.getAllFromIndex('dailyReports', 'by-project', projectId));
}

export const getDailyReport  = dailyReportRepo.get;
export const saveDailyReport = dailyReportRepo.save;

export async function deleteDailyReport(id: string): Promise<void> {
  const db = await getDB();
  const report = await db.get('dailyReports', id);
  if (report) {
    for (const att of (report.attachments ?? [])) {
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

// ─── Storage & Cache ────────────────────────────────────────

export async function getStorageEstimate(): Promise<{ used: number; quota: number }> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return { used: estimate.usage || 0, quota: estimate.quota || 0 };
  }
  return { used: 0, quota: 0 };
}

export async function clearFileCache(): Promise<number> {
  const d = await getDB();
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

// ─── Search ─────────────────────────────────────────────────

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

export const getProjectDiagrams = diagramRepo.getByProject;
export const getAllDiagrams     = diagramRepo.getAll;
export const getDiagram         = diagramRepo.get;
export const saveDiagram        = diagramRepo.save;
export const deleteDiagram      = diagramRepo.delete;

// ─── Command Snippets ───────────────────────────────────────

export const getAllSnippets = snippetRepo.getAll;
export const saveSnippet   = snippetRepo.save;
export const deleteSnippet = snippetRepo.delete;

export async function getSnippetsByCategory(category: string): Promise<CommandSnippet[]> {
  const db = await getDB();
  return db.getAllFromIndex('commandSnippets', 'by-category', category);
}

// ─── Ping Sessions ──────────────────────────────────────────

export const getProjectPingSessions = pingRepo.getByProject;
export const getAllPingSessions     = pingRepo.getAll;
export const savePingSession        = pingRepo.save;
export const deletePingSession      = pingRepo.delete;

// ─── Terminal Session Logs ──────────────────────────────────

export const getProjectTerminalLogs = termLogRepo.getByProject;
export const saveTerminalLog        = termLogRepo.save;
export const deleteTerminalLog      = termLogRepo.delete;

// ─── Connection Profiles ────────────────────────────────────

export const getAllConnectionProfiles    = connProfileRepo.getAll;
export const getProjectConnectionProfiles = connProfileRepo.getByProject;
export const saveConnectionProfile       = connProfileRepo.save;
export const deleteConnectionProfile     = connProfileRepo.delete;

// ─── Register Calculations ──────────────────────────────────

export const getAllRegisterCalculations    = regCalcRepo.getAll;
export const getProjectRegisterCalculations = regCalcRepo.getByProject;
export const saveRegisterCalculation       = regCalcRepo.save;
export const deleteRegisterCalculation     = regCalcRepo.delete;

// ─── PID Tuning Sessions ────────────────────────────────────

export const getAllPidTuningSessions    = pidRepo.getAll;
export const getProjectPidTuningSessions = pidRepo.getByProject;
export const getPidTuningSession        = pidRepo.get;
export const savePidTuningSession       = pidRepo.save;
export const deletePidTuningSession     = pidRepo.delete;

// ─── Psychrometric Sessions ─────────────────────────────────

export const getAllPsychSessions    = psychRepo.getAll;
export const getProjectPsychSessions = psychRepo.getByProject;
export const getPsychSession        = psychRepo.get;
export const savePsychSession       = psychRepo.save;
export const deletePsychSession     = psychRepo.delete;

// ─── PPCL Documents ─────────────────────────────────────────

export const getAllPpclDocuments    = ppclRepo.getAll;
export const getProjectPpclDocuments = ppclRepo.getByProject;
export const getPpclDocument        = ppclRepo.get;
export const savePpclDocument       = ppclRepo.save;
export const deletePpclDocument     = ppclRepo.delete;

// ─── Trend Sessions ─────────────────────────────────────────

export const getAllTrendSessions    = trendRepo.getAll;
export const getProjectTrendSessions = trendRepo.getByProject;
export const getTrendSession        = trendRepo.get;
export const saveTrendSession       = trendRepo.save;
export const deleteTrendSession     = trendRepo.delete;

// ─── Bug Reports ────────────────────────────────────────────

export const getAllBugReports = bugReportRepo.getAll;
export const getBugReport     = bugReportRepo.get;
export const saveBugReport    = bugReportRepo.save;
export const deleteBugReport  = bugReportRepo.delete;

// ─── User Reviews ───────────────────────────────────────────

export const getAllReviews = reviewRepo.getAll;
export const saveReview    = reviewRepo.save;
export const deleteReview  = reviewRepo.delete;

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
    'ppclDocuments', 'psychSessions', 'trendSessions', 'dxrs',
  ] as const;

  let totalDeleted = 0;

  // Collect orphaned file blob keys so we can clean up fileBlobs store after
  const orphanedBlobKeys: string[] = [];

  for (const storeName of childStores) {
    const tx = db.transaction(storeName, 'readwrite');
    const allItems = await tx.store.getAll();
    for (const item of allItems) {
      const rec = item as unknown as Record<string, unknown>;
      const pid = rec.projectId as string | undefined;
      // Only purge if projectId is a valid UUID that doesn't match any existing project
      // Records with empty/missing/non-UUID projectId are unassigned, not orphaned
      if (pid && UUID_RE.test(pid) && !validIds.has(pid)) {
        // If this is a file record, collect its blob keys for cleanup
        if (storeName === 'files') {
          const versions = (rec.versions ?? []) as Array<{ blobKey?: string }>;
          for (const v of versions) {
            if (v.blobKey) orphanedBlobKeys.push(v.blobKey);
          }
        }
        if (storeName === 'dailyReports') {
          const attachments = (rec.attachments ?? []) as Array<{ blobKey?: string }>;
          for (const att of attachments) {
            if (att.blobKey) orphanedBlobKeys.push(att.blobKey);
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
export async function getAllFromStore(storeName: BasToolkitStoreName): Promise<unknown[]> {
  const db = await getDB();
  // Dynamic store access requires cast — caller provides the typed store name
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return db.getAll(storeName as any);
}

// ── Pull sync helpers (bypass notifySync to avoid re-pushing pulled data) ──

/**
 * Bulk-write items to any store WITHOUT triggering the sync bridge.
 * Used by pull sync so downloaded data isn't re-pushed to Supabase.
 */
export async function bulkPutSilent(
  storeName: BasToolkitStoreName,
  items: Record<string, unknown>[],
): Promise<number> {
  if (items.length === 0) return 0;
  const db = await getDB();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx = db.transaction(storeName as any, 'readwrite');
  for (const item of items) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tx.store.put(item as any);
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
    'pidTuningSessions', 'ppclDocuments', 'psychSessions', 'trendSessions', 'bugReports', 'reviews', 'syncQueue', 'syncConflicts',
    // Global mirror stores (v19)
    'globalProjects', 'globalNotes', 'globalDevices', 'globalIpPlan',
    'globalDailyReports', 'globalActivityLog', 'globalNetworkDiagrams',
    'globalProjectFiles', 'globalPpclDocuments', 'globalTerminalLogs',
    'globalPidTuningSessions', 'globalPsychSessions', 'globalRegisterCalculations',
    'globalPingSessions', 'globalTrendSessions', 'globalConnectionProfiles',
    'globalFieldPanels', 'globalNotepadEntries', 'globalProjectPreferences',
    // DXR stores (v20)
    'dxrs', 'globalDxrs',
    // Sync Error log (v21)
    'syncErrors',
  ] as const;
  for (const name of storeNames) {
    const tx = db.transaction(name, 'readwrite');
    await tx.store.clear();
    await tx.done;
  }
}

/**
 * Export all data from every store as a JSON-serializable snapshot.
 * Used for pre-migration backup and data portability.
 * Note: fileBlobs are excluded (binary data can't be JSON-serialized).
 */
export async function exportAllData(): Promise<Record<string, unknown[]>> {
  const db = await getDB();
  const exportableStores = [
    'projects', 'files', 'notes', 'devices', 'ipPlan',
    'activityLog', 'dailyReports', 'networkDiagrams', 'commandSnippets',
    'pingSessions', 'terminalLogs', 'connectionProfiles', 'registerCalculations',
    'pidTuningSessions', 'ppclDocuments', 'psychSessions', 'trendSessions',
    'bugReports', 'reviews', 'dxrs',
  ] as const;
  const snapshot: Record<string, unknown[]> = { _dbVersion: [DB_VERSION], _exportedAt: [new Date().toISOString()] };
  for (const name of exportableStores) {
    snapshot[name] = await db.getAll(name);
  }
  return snapshot;
}

/**
 * Import data from a snapshot created by exportAllData.
 * Merges into existing data (put semantics — overwrites by ID).
 */
export async function importSnapshot(snapshot: Record<string, unknown[]>): Promise<number> {
  const db = await getDB();
  let total = 0;
  for (const [storeName, items] of Object.entries(snapshot)) {
    if (storeName.startsWith('_') || !Array.isArray(items) || items.length === 0) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(db as any).objectStoreNames.contains(storeName)) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = db.transaction(storeName as any, 'readwrite');
    for (const item of items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await tx.store.put(item as any);
      total++;
    }
    await tx.done;
  }
  return total;
}

/**
 * Delete items from any store by ID WITHOUT triggering the sync bridge.
 * Used by pull sync to apply soft-deletes from the cloud.
 */
export async function bulkDeleteSilent(
  storeName: BasToolkitStoreName,
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

// ─── Sync Errors ─────────────────────────────────────────────

const SYNC_ERROR_CAP = 100;

/**
 * Persist a SyncError and enforce the 100-row rotation cap.
 * The `id` and `createdAt` fields must be populated by the caller before
 * this function is invoked (capture point owns UUID generation).
 * After insert, deletes oldest rows until count <= 100.
 */
export async function addSyncError(error: SyncError): Promise<void> {
  const db = await getDB();
  await db.put('syncErrors', error);

  // Enforce cap: if we now exceed 100 rows, delete the oldest until we're at 100.
  const total = await db.count('syncErrors');
  if (total > SYNC_ERROR_CAP) {
    const overflow = total - SYNC_ERROR_CAP;
    // Open a cursor on the by-created-at index (ascending = oldest first) and
    // delete the first `overflow` rows.
    const tx = db.transaction('syncErrors', 'readwrite');
    let cursor = await tx.store.index('by-created-at').openCursor(null, 'next');
    let deleted = 0;
    while (cursor && deleted < overflow) {
      await cursor.delete();
      deleted++;
      cursor = await cursor.continue();
    }
    await tx.done;
  }
}

/**
 * Return all sync errors sorted newest-first.
 */
export async function getAllSyncErrors(): Promise<SyncError[]> {
  const db = await getDB();
  // by-created-at index ascending — reverse for newest-first
  const all = await db.getAllFromIndex('syncErrors', 'by-created-at');
  return all.reverse();
}

/**
 * Drop all sync errors. Returns the count deleted.
 */
export async function clearSyncErrors(): Promise<number> {
  const db = await getDB();
  const tx = db.transaction('syncErrors', 'readwrite');
  const count = await tx.store.count();
  await tx.store.clear();
  await tx.done;
  return count;
}

/**
 * Delete a single sync error by id.
 */
export async function deleteSyncError(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('syncErrors', id);
}

/**
 * Return the total number of stored sync errors.
 */
export async function getSyncErrorsCount(): Promise<number> {
  const db = await getDB();
  return db.count('syncErrors');
}
