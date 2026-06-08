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
  // ─── Sync metadata keyval (v22) ──
  // Small key/value store for sync-engine bookkeeping. Currently holds the
  // per-entity-type "last full push" high-water mark used by fullSync
  // dirty-tracking (Phase 1b) so an unchanged dataset enqueues ~0 rows.
  syncMeta: {
    key: string;
    value: { key: string; value: string };
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
  | 'syncErrors'
  // ── Sync metadata keyval (v22) ──
  | 'syncMeta';

/**
 * Runtime mirror of the `BasToolkitStoreName` union. Used to guard runtime
 * values (e.g. a `SyncEntityType` coming off a persisted SyncError) before
 * treating them as IndexedDB store names — the union and `SyncEntityType`
 * happen to overlap today, but a future pull-only entity could diverge.
 * The `satisfies` assertion keeps this in lockstep with the type: drop a
 * member and TS fails to compile.
 */
export const BAS_TOOLKIT_STORE_NAMES = new Set<BasToolkitStoreName>([
  'projects', 'files', 'fileBlobs', 'notes', 'devices', 'ipPlan',
  'activityLog', 'dailyReports', 'networkDiagrams', 'commandSnippets',
  'pingSessions', 'terminalLogs', 'connectionProfiles', 'registerCalculations',
  'pidTuningSessions', 'ppclDocuments', 'psychSessions', 'trendSessions', 'bugReports', 'reviews', 'syncQueue', 'syncConflicts',
  'globalProjects', 'globalNotes', 'globalDevices', 'globalIpPlan',
  'globalDailyReports', 'globalActivityLog', 'globalNetworkDiagrams',
  'globalProjectFiles', 'globalPpclDocuments', 'globalTerminalLogs',
  'globalPidTuningSessions', 'globalPsychSessions', 'globalRegisterCalculations',
  'globalPingSessions', 'globalTrendSessions', 'globalConnectionProfiles',
  'globalFieldPanels', 'globalNotepadEntries', 'globalProjectPreferences',
  'dxrs', 'globalDxrs',
  'syncErrors',
  'syncMeta',
] satisfies BasToolkitStoreName[]);

/** Runtime guard: is `value` a known IndexedDB store name? */
export function isBasToolkitStoreName(value: string): value is BasToolkitStoreName {
  return BAS_TOOLKIT_STORE_NAMES.has(value as BasToolkitStoreName);
}

/** Current schema version — bump this and add a new `if (oldVersion < N)` block when changing the schema. */
export const DB_VERSION = 22;

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
          // LEGACY/ORPHANED STORE — `projectNotepadEntries` is no longer read or
          // written by any repository. It is intentionally still created here (and
          // NOT removed) because: (1) deleting an object store requires a new DB
          // version bump and an explicit `db.deleteObjectStore(...)` in that
          // upgrade block, which would run against every existing install; and
          // (2) some old installs may still hold rows here, so dropping it risks
          // silent data loss. It is deliberately absent from `BasToolkitStoreName`
          // and `clearAllData()`. Leave it untouched unless a dedicated cleanup
          // migration is planned. See ReviewAgents-findings-2026-05-20 P3-1.
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
          // LEGACY/ORPHANED STORE — `notepadDocuments` is unused (see the P3-1
          // note on `projectNotepadEntries` above). Intentionally still created
          // and intentionally NOT in `BasToolkitStoreName`/`clearAllData()`.
          // Removing it needs a dedicated version-bumped cleanup migration.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const notepadDocStore = (db as any).createObjectStore('notepadDocuments', { keyPath: 'id' });
          notepadDocStore.createIndex('by-updated', 'updatedAt');
          notepadDocStore.createIndex('by-language', 'language');
        }

        if (oldVersion < 14) {
          // LEGACY/ORPHANED STORE — `fieldPanels` is unused (see the P3-1 note on
          // `projectNotepadEntries` above). v13 and v14 were identical; the create
          // is consolidated into a single guard. Intentionally still created and
          // intentionally NOT in `BasToolkitStoreName`/`clearAllData()`. Removing
          // it needs a dedicated version-bumped cleanup migration.
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

        if (oldVersion < 22) {
          // ─── Sync metadata keyval ──────────────────────────────────────────
          // Holds the per-entity-type "last full push" high-water mark used by
          // fullSync dirty-tracking (Phase 1b). Plain keyPath keyval store.
          db.createObjectStore('syncMeta', { keyPath: 'key' });
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

/** Stores whose children are cascade-deleted when a local project is removed. */
const PROJECT_CHILD_STORES: readonly SyncEntityType[] = [
  'files', 'notes', 'devices', 'ipPlan', 'activityLog',
  'dailyReports', 'networkDiagrams', 'pingSessions',
  'terminalLogs', 'connectionProfiles', 'registerCalculations',
  'pidTuningSessions', 'ppclDocuments', 'psychSessions', 'trendSessions', 'dxrs',
];

/** Stores whose children are cascade-deleted when a global project is removed. */
const GLOBAL_PROJECT_CHILD_STORES: readonly SyncEntityType[] = [
  'globalNotes', 'globalDevices', 'globalIpPlan', 'globalDailyReports',
  'globalNetworkDiagrams', 'globalProjectFiles', 'globalPpclDocuments',
  'globalTerminalLogs', 'globalPidTuningSessions', 'globalPsychSessions',
  'globalRegisterCalculations', 'globalPingSessions', 'globalTrendSessions',
  'globalConnectionProfiles', 'globalFieldPanels', 'globalNotepadEntries',
  'globalActivityLog', 'globalDxrs',
];

// ─── Cascade Delete Helpers ──────────────────────────────────
// These helpers delete a project row and every child record across all child
// stores, then clean up any lingering syncQueue items and syncErrors so the
// Sync Error Inspector doesn't show ghost entries after a delete.

/**
 * Cascade-delete a local project and all its children from IndexedDB.
 * Also cleans up `syncQueue` items and `syncErrors` records for the deleted
 * entities so the Sync Inspector shows no ghost errors after deletion.
 *
 * Re-exported as `deleteProject` for backward compatibility — all call sites
 * should migrate to `cascadeDeleteProject` for clarity.
 */
/**
 * Clean up `syncQueue` items and `syncErrors` records for a batch of deleted
 * entities. Shared by `cascadeDeleteProject` and `cascadeDeleteGlobalProject`.
 *
 * These stores live outside the cascade write transaction, so this runs
 * post-commit. The IndexedDB entity rows are already gone by the time this is
 * called — failures here are non-fatal (at worst the Inspector shows stale rows
 * the user can clear manually), so callers should wrap this in try/catch.
 */
async function cleanupSyncArtifacts(
  pairs: Array<{ entityType: SyncEntityType; entityId: string }>,
): Promise<void> {
  if (pairs.length === 0) return;
  const db = await getDB();
  for (const { entityType, entityId } of pairs) {
    // syncQueue uses deterministic key `${entityType}-${entityId}`
    await deleteSyncItem(`${entityType}-${entityId}`).catch(() => { /* no-op if absent */ });
    // syncErrors: delete by scanning the by-entity-type index for matching entityId
    const errorsByType = await db.getAllFromIndex('syncErrors', 'by-entity-type', entityType);
    for (const err of errorsByType) {
      if (err.entityId === entityId) {
        await db.delete('syncErrors', err.id);
      }
    }
  }
}

export async function cascadeDeleteProject(id: string): Promise<void> {
  const db = await getDB();

  // Track deleted IDs per store — used for sync notifications and cleanup below
  const deleted = new Map<SyncEntityType, string[]>();

  // ── Step 1: READ phase — gather all child IDs + blob keys up front ─────────
  // Each getAll() awaits, so they must NOT share the write transaction (an idb
  // transaction auto-closes once the microtask queue drains between awaits).
  // Read everything first, then do a single synchronous write transaction.
  const childIdsByStore = new Map<SyncEntityType, string[]>();
  for (const store of PROJECT_CHILD_STORES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = await (db as any).getAllFromIndex(store, 'by-project', id);
    childIdsByStore.set(
      store,
      (items as Array<{ id: string }>).map((it) => it.id),
    );
  }

  // Blob keys referenced by this project's files + daily-report attachments.
  const blobKeys: string[] = [];
  const files = await db.getAllFromIndex('files', 'by-project', id);
  for (const file of files) {
    for (const version of file.versions) {
      if (version.blobKey) blobKeys.push(version.blobKey);
    }
  }
  const reports = await db.getAllFromIndex('dailyReports', 'by-project', id);
  for (const report of reports) {
    blobKeys.push(...collectReportBlobKeys(report));
  }

  // ── Step 2: WRITE phase — one transaction, all deletes enqueued synchronously
  // No awaits between requests; only `tx.done` is awaited at the end. This keeps
  // the parent + every child deletion atomic so a partial cascade can't orphan
  // rows. Mirrors the synchronous-enqueue pattern used by bulkDeleteSilent.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx = (db as any).transaction(['projects', 'fileBlobs', ...PROJECT_CHILD_STORES], 'readwrite');
  try {
    for (const key of blobKeys) {
      void tx.objectStore('fileBlobs').delete(key);
    }
    for (const store of PROJECT_CHILD_STORES) {
      const ids = childIdsByStore.get(store) ?? [];
      for (const childId of ids) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        void (tx as any).objectStore(store).delete(childId);
      }
      deleted.set(store, ids);
    }
    void tx.objectStore('projects').delete(id);
    await tx.done;
  } catch (e) {
    try { tx.abort(); } catch { /* already settled */ }
    throw e;
  }

  // ── Post-commit: clean up syncQueue and syncErrors for deleted entities ──
  // Handled outside the cascade transaction (separate stores). Failures are
  // non-fatal — the IndexedDB data is already gone.
  try {
    const allChildIds: Array<{ entityType: SyncEntityType; entityId: string }> = [];
    for (const [store, ids] of deleted) {
      for (const childId of ids) {
        allChildIds.push({ entityType: store, entityId: childId });
      }
    }
    // Also include the project itself
    allChildIds.push({ entityType: 'projects', entityId: id });

    await cleanupSyncArtifacts(allChildIds);
  } catch (cleanupErr) {
    console.warn('[db] cascadeDeleteProject: syncQueue/syncErrors cleanup failed (non-fatal):', cleanupErr);
  }

  // Notify sync bridge about cascade-deleted children
  for (const [store, ids] of deleted) {
    for (const childId of ids) notifySync('delete', store, childId, null);
  }
  notifySync('delete', 'projects', id, null);
}

/**
 * Cascade-delete a global project and all its children from IndexedDB.
 * Handles the append-only `globalActivityLog` store (no `deletedAt`) and the
 * composite-PK `globalProjectPreferences` store (keyed by `prefKey`, indexed
 * by `globalProjectId`).
 * Also cleans up `syncQueue` items and `syncErrors` records for deleted
 * entities so the Inspector shows no ghost errors after deletion.
 */
export async function cascadeDeleteGlobalProject(globalProjectId: string): Promise<void> {
  const db = await getDB();

  // Collect all child entity IDs across every child store so we can clean up
  // syncQueue and syncErrors after the cascade transaction commits.
  const deleted = new Map<SyncEntityType, string[]>();

  // ── Step 1: Cascade-delete standard global child stores ──────────────────
  // Each store uses `by-project` index on `globalProjectId`.
  // READ phase first: gather every child ID outside the write transaction so an
  // idb tx can't auto-close mid-cascade (it does once awaits drain the microtask
  // queue). Then enqueue every delete synchronously in one write transaction.
  const childIdsByStore = new Map<SyncEntityType, string[]>();
  for (const store of GLOBAL_PROJECT_CHILD_STORES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = await (db as any).getAllFromIndex(store, 'by-project', globalProjectId);
    childIdsByStore.set(
      store,
      (items as Array<{ id: string }>).map((it) => it.id),
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const childTx = (db as any).transaction(
    ['globalProjects', ...GLOBAL_PROJECT_CHILD_STORES],
    'readwrite',
  );
  try {
    for (const store of GLOBAL_PROJECT_CHILD_STORES) {
      const ids = childIdsByStore.get(store) ?? [];
      for (const childId of ids) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        void (childTx as any).objectStore(store).delete(childId);
      }
      deleted.set(store, ids);
    }
    void childTx.objectStore('globalProjects').delete(globalProjectId);
    await childTx.done;
  } catch (e) {
    try { childTx.abort(); } catch { /* already settled */ }
    throw e;
  }

  // ── Step 2: globalProjectPreferences (composite PK = prefKey = `uid|gpid`) ─
  // The `by-project` index is on `globalProjectId`, so we can look up all
  // preferences for this project regardless of which user they belong to.
  try {
    const prefDb = await getDB();
    const prefs = await prefDb.getAllFromIndex('globalProjectPreferences', 'by-project', globalProjectId);
    if (prefs.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prefTx = (prefDb as any).transaction('globalProjectPreferences', 'readwrite');
      const prefIds: string[] = [];
      for (const pref of prefs) {
        await prefTx.store.delete(pref.prefKey);
        prefIds.push(pref.prefKey);
      }
      await prefTx.done;
      // globalProjectPreferences doesn't have a simple entityId for syncQueue;
      // the queue key uses `globalProjectPreferences-${prefKey}` — handled below.
      deleted.set('globalProjectPreferences', prefIds);
    }
  } catch (prefErr) {
    console.warn('[db] cascadeDeleteGlobalProject: globalProjectPreferences cleanup failed (non-fatal):', prefErr);
  }

  // ── Step 3: Clean up syncQueue and syncErrors ────────────────────────────
  try {
    const allChildIds: Array<{ entityType: SyncEntityType; entityId: string }> = [];
    for (const [store, ids] of deleted) {
      for (const childId of ids) {
        allChildIds.push({ entityType: store, entityId: childId });
      }
    }
    // Include the global project itself
    allChildIds.push({ entityType: 'globalProjects', entityId: globalProjectId });

    await cleanupSyncArtifacts(allChildIds);
  } catch (cleanupErr) {
    console.warn('[db] cascadeDeleteGlobalProject: syncQueue/syncErrors cleanup failed (non-fatal):', cleanupErr);
  }

  // ── Step 4: Notify sync bridge ───────────────────────────────────────────
  for (const [store, ids] of deleted) {
    for (const childId of ids) notifySync('delete', store, childId, null);
  }
  notifySync('delete', 'globalProjects', globalProjectId, null);
}

export async function deleteProject(id: string): Promise<void> {
  return cascadeDeleteProject(id);
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
 * Set the baudRate field on every DXR row for a project in a single
 * readwrite transaction. Preserves all other fields, id, and createdAt.
 * After commit, enqueues a sync notification for each updated row.
 * Returns the number of rows updated.
 */
export async function bulkSetDxrBaudRate(
  projectId: string,
  baudRate: number,
): Promise<number> {
  const db = await getDB();
  const rows = await db.getAllFromIndex('dxrs', 'by-project', projectId);
  if (rows.length === 0) return 0;

  const now = new Date().toISOString();
  const tx = db.transaction('dxrs', 'readwrite');
  const written: DxrEntry[] = [];

  for (const row of rows) {
    const updated: DxrEntry = { ...row, baudRate, updatedAt: now };
    await tx.store.put(updated);
    written.push(updated);
  }

  await tx.done;

  for (const row of written) {
    notifySync('update', 'dxrs', row.id, row);
  }

  return written.length;
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

/**
 * Collect the `fileBlobs` keys referenced by a daily report's attachments.
 * Returning keys (rather than deleting here) keeps callers in control of the
 * transaction shape: `deleteDailyReport` deletes them one-by-one, while
 * `cascadeDeleteProject` accumulates them for a single batched write tx.
 * Shared so the attachment-blob cleanup logic lives in exactly one place.
 */
function collectReportBlobKeys(report: DailyReport | undefined | null): string[] {
  if (!report) return [];
  const keys: string[] = [];
  for (const att of (report.attachments ?? [])) {
    if (att.blobKey) keys.push(att.blobKey);
  }
  return keys;
}

/**
 * Delete every attachment blob owned by a daily report from `fileBlobs`.
 * Safe to call outside a shared transaction (each delete is its own request).
 */
async function removeReportBlobs(report: DailyReport | undefined | null): Promise<void> {
  const keys = collectReportBlobKeys(report);
  if (keys.length === 0) return;
  const db = await getDB();
  for (const key of keys) {
    await db.delete('fileBlobs', key);
  }
}

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
  await removeReportBlobs(report);
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
export const deleteBugReport  = bugReportRepo.delete;

/**
 * Save a bug report and emit `bau-suite:bug-report-added` so the admin
 * notification badge in the top bar can refresh. Listeners filter on
 * `createdAt > lastSeen` so re-saves of existing reports (e.g. status
 * changes by admins) don't re-trigger the badge.
 */
export async function saveBugReport(report: BugReport): Promise<void> {
  await bugReportRepo.save(report);
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('bau-suite:bug-report-added', { detail: report }));
    } catch {
      // ignore if dispatch fails (e.g. test envs without window.CustomEvent)
    }
  }
}

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

// ─── Sync metadata keyval (Phase 1b) ────────────────────────
/**
 * Read a sync-metadata value by key (e.g. a per-entity "last full push"
 * high-water mark). Returns `null` if unset.
 */
export async function getSyncMeta(key: string): Promise<string | null> {
  const db = await getDB();
  const row = await db.get('syncMeta', key);
  return row?.value ?? null;
}

/** Write a sync-metadata value by key. */
export async function setSyncMeta(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.put('syncMeta', { key, value });
}

/**
 * Drop ALL sync-metadata (Phase 1b). Used by the "Reset Sync State" recovery
 * action so the next full sync re-enqueues every row — otherwise the fullSync
 * dirty-tracking high-water marks would suppress the re-push the user is trying
 * to force. Returns the count removed.
 */
export async function clearSyncMeta(): Promise<number> {
  const db = await getDB();
  const tx = db.transaction('syncMeta', 'readwrite');
  const count = await tx.store.count();
  await tx.store.clear();
  await tx.done;
  return count;
}

// ─── Sync Queue ─────────────────────────────────────────────
export async function addSyncItem(item: SyncQueueItem): Promise<void> {
  const db = await getDB();
  await db.put('syncQueue', item);
}

/**
 * Enqueue an item but PRESERVE the retry bookkeeping of any existing queue row
 * for the same `(entityType, entityId)` id (Phase 1b, Finding #5).
 *
 * `fullSync` re-scans every store and re-enqueues changed rows. The naive path
 * (a fresh `addSyncItem` with `retriedCount: 0`) RESETS a poison item parked at
 * `failed` back to a clean `pending` 0 — so it never stays terminal and
 * re-enters the 5-retry/5-error loop forever ("stuck at 3"). This variant reads
 * the existing row first and carries over its `retriedCount` / `status` /
 * `lastError*` / `nextRetryAt`, only refreshing the payload + action. A row with
 * no prior queue entry is inserted as-is (fresh `retriedCount: 0`).
 */
export async function addSyncItemPreservingRetry(item: SyncQueueItem): Promise<void> {
  const db = await getDB();
  const existing = await db.get('syncQueue', item.id);
  if (existing) {
    await db.put('syncQueue', {
      ...item,
      // Carry over poison-item bookkeeping so fullSync can't reset it to 0.
      status: existing.status,
      retriedCount: existing.retriedCount,
      lastError: existing.lastError,
      lastErrorCode: existing.lastErrorCode,
      nextRetryAt: existing.nextRetryAt,
      createdAt: existing.createdAt,
    });
    return;
  }
  await db.put('syncQueue', item);
}

/**
 * Pending items eligible for processing NOW.
 *
 * Phase 1b: an item carrying a future `nextRetryAt` (set by exponential backoff
 * after a transient failure) is SKIPPED until that time passes — so a failing
 * item no longer retries on the very next 5s tick. Items with no `nextRetryAt`
 * (the common case) are always eligible.
 */
export async function getPendingSyncItems(limit = 20): Promise<SyncQueueItem[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('syncQueue', 'by-status', 'pending');
  const now = Date.now();
  const eligible = all.filter(
    (item) => !item.nextRetryAt || new Date(item.nextRetryAt).getTime() <= now,
  );
  return eligible.slice(0, limit);
}

/**
 * Return the `${entityType}-${entityId}` keys of every UN-PUSHED sync-queue
 * item, unbounded (unlike `getPendingSyncItems`, which is batch-limited).
 *
 * "Un-pushed" = any status that is not `completed`: `pending`, `syncing`, and
 * `failed`. A row in any of these states represents local work that has not yet
 * landed in the cloud, so the subtractive full-pull reconciliation must NOT
 * reap it (see sync-manager.pullSync). We key on `entityType` + `entityId`
 * (the syncQueue uses the deterministic `${entityType}-${entityId}` id, but we
 * read the fields directly rather than parse the id, since `entityId` itself
 * may legally contain hyphens).
 */
export async function getUnpushedSyncItemKeys(): Promise<Set<string>> {
  const db = await getDB();
  const keys = new Set<string>();
  for (const status of ['pending', 'syncing', 'failed'] as const) {
    const items = await db.getAllFromIndex('syncQueue', 'by-status', status);
    for (const item of items) {
      keys.add(`${item.entityType}-${item.entityId}`);
    }
  }
  return keys;
}

/**
 * Does the given `(entityType, entityId)` have an UN-PUSHED sync-queue item?
 *
 * "Un-pushed" = any status that is not `completed`: `pending`, `syncing`, or
 * `failed` — local work that has not yet landed in the cloud. Ingress paths
 * (pullSync / realtime) use this as a per-row dirty-guard so an incoming (often
 * older) remote row can't silently clobber a local edit the user made offline
 * and hasn't pushed yet (Finding #4, Phase 1c). The syncQueue id is the
 * deterministic `${entityType}-${entityId}`, so a single keyed lookup suffices.
 */
export async function hasUnpushedSyncItem(
  entityType: SyncEntityType,
  entityId: string,
): Promise<boolean> {
  const db = await getDB();
  const item = await db.get('syncQueue', `${entityType}-${entityId}`);
  return !!item && item.status !== 'completed';
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

/**
 * Recovery sweep: flip every item stuck in `'syncing'` back to `'pending'`.
 *
 * A row is marked `'syncing'` immediately before its network call. If the
 * process dies (tab closed, crash, reload) between that flip and the response,
 * the row is stranded — `getPendingSyncItems` only returns `'pending'` rows, so
 * the stuck item would never be retried (silent data loss). Call this once at
 * sync-manager start-up to reclaim any such orphans. Returns the count reset.
 */
export async function resetSyncingItemsToPending(): Promise<number> {
  const db = await getDB();
  const stuck = await db.getAllFromIndex('syncQueue', 'by-status', 'syncing');
  if (stuck.length === 0) return 0;
  const tx = db.transaction('syncQueue', 'readwrite');
  for (const item of stuck) {
    void tx.store.put({ ...item, status: 'pending' });
  }
  await tx.done;
  return stuck.length;
}

export async function resetFailedSyncItems(): Promise<number> {
  const db = await getDB();
  const failed = await db.getAllFromIndex('syncQueue', 'by-status', 'failed');
  const tx = db.transaction('syncQueue', 'readwrite');
  for (const item of failed) {
    await tx.store.put({
      ...item,
      status: 'pending',
      retriedCount: 0,
      lastError: undefined,
      lastErrorCode: undefined,
      nextRetryAt: undefined,
    });
  }
  await tx.done;
  return failed.length;
}

/**
 * Auto-recovery sweep (Phase 1b): re-pend `failed` items whose last error is
 * TRANSIENT, leaving permanent failures parked.
 *
 * Called on reconnect (and periodically) so a write that failed only because
 * the network was down / the server 5xx'd / the JWT expired self-heals once
 * conditions improve — without the user manually hitting "Retry". A permanent
 * failure (RLS 42501, FK 23503, missing-column 42703 / PGRST204) can never
 * succeed on retry, so it stays `failed`.
 *
 * The caller supplies `isTransient` (wired to the sync-error classifier) so the
 * db layer stays free of sync-semantics. Retry bookkeeping is RESET on the
 * re-pended item (fresh `retriedCount: 0`, cleared `nextRetryAt`) so it gets a
 * clean run of attempts. Returns the count re-pended.
 */
export async function recoverTransientFailedItems(
  isTransient: (errorCode: string | undefined, lastError: string | undefined) => boolean,
): Promise<number> {
  const db = await getDB();
  const failed = await db.getAllFromIndex('syncQueue', 'by-status', 'failed');
  const toRecover = failed.filter((item) => isTransient(item.lastErrorCode, item.lastError));
  if (toRecover.length === 0) return 0;
  const tx = db.transaction('syncQueue', 'readwrite');
  for (const item of toRecover) {
    await tx.store.put({
      ...item,
      status: 'pending',
      retriedCount: 0,
      nextRetryAt: undefined,
    });
  }
  await tx.done;
  return toRecover.length;
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

/**
 * Clear every sync-queue item EXCEPT those parked at `failed` (Phase 1b).
 *
 * fullSync clears the queue before re-scanning stores, but blindly wiping
 * `failed` poison items resets their `retriedCount` to 0 on the re-enqueue — so
 * a deterministically-doomed write never stays terminal and re-enters the
 * 5-retry/5-error loop forever ("stuck at 3"). Keeping `failed` rows lets
 * `addSyncItemPreservingRetry` carry over their retry bookkeeping. Returns the
 * count removed (pending/syncing/completed only).
 */
export async function clearSyncQueueExceptFailed(): Promise<number> {
  const db = await getDB();
  const tx = db.transaction('syncQueue', 'readwrite');
  let removed = 0;
  let cursor = await tx.store.openCursor();
  while (cursor) {
    if (cursor.value.status !== 'failed') {
      await cursor.delete();
      removed++;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return removed;
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
  const result = new Map<string, { files: number; notes: number; devices: number }>();
  if (projectIds.length === 0) return result;

  // Fan out ALL count requests on one read-only transaction without awaiting
  // between them. Awaiting per-project (the previous behaviour) let the tx
  // auto-close after the first project, raising InvalidStateError on the 2nd+.
  const tx = db.transaction(['files', 'notes', 'devices'], 'readonly');
  const filesIdx = tx.objectStore('files').index('by-project');
  const notesIdx = tx.objectStore('notes').index('by-project');
  const devicesIdx = tx.objectStore('devices').index('by-project');

  const counts = await Promise.all(
    projectIds.flatMap((id) => [
      filesIdx.count(id),
      notesIdx.count(id),
      devicesIdx.count(id),
    ]),
  );

  projectIds.forEach((id, i) => {
    result.set(id, {
      files: counts[i * 3],
      notes: counts[i * 3 + 1],
      devices: counts[i * 3 + 2],
    });
  });
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
    // Sync metadata keyval (v22) — clear the fullSync dirty-tracking
    // high-water marks too, so a different user signing in on the same device
    // gets a clean full push (their unchanged-since marks must not carry over).
    'syncMeta',
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
 *
 * Refuses to import a snapshot whose `_dbVersion` is older than the current
 * `DB_VERSION` — a stale-schema backup can be missing keys/indices the current
 * code expects, which surfaces later as cryptic IndexedDB errors during sync.
 * Pass `{ allowStaleSchema: true }` to import anyway (caller accepts the risk).
 */
export async function importSnapshot(
  snapshot: Record<string, unknown[]>,
  options?: { allowStaleSchema?: boolean },
): Promise<number> {
  // Version guard: `_dbVersion` is written as a single-element array by
  // exportAllData. A missing value (older/hand-built snapshot) is treated as
  // unknown and allowed through.
  const snapshotVersion = Array.isArray(snapshot._dbVersion)
    ? Number(snapshot._dbVersion[0])
    : undefined;
  if (
    !options?.allowStaleSchema
    && snapshotVersion !== undefined
    && Number.isFinite(snapshotVersion)
    && snapshotVersion < DB_VERSION
  ) {
    throw new Error(
      `This backup was created with an older database version (v${snapshotVersion}) ` +
      `than the current app (v${DB_VERSION}). Importing it could corrupt local data. ` +
      `Update the backup or re-export from a current device before importing.`,
    );
  }

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
 * Persist a SyncError with per-signature DEDUP (Phase 1b, Finding #6) and
 * enforce the 100-row rotation cap.
 *
 * The caller MUST set `error.id` to a deterministic signature
 * (`${entityType}-${entityId}-${errorCode}`). If a row with that signature
 * already exists, this UPSERTS it — bumping `occurrences`, refreshing
 * `lastSeenAt` / `createdAt` / message / payload, and preserving `firstSeenAt` —
 * instead of inserting a fresh random-id row every retry (which churned the
 * 100-row cap and evicted genuinely distinct errors). A brand-new signature is
 * inserted with `occurrences: 1`.
 *
 * Returns `true` when this was a NEW signature (first occurrence) and `false`
 * when it merely incremented an existing one. The capture point uses this to
 * fire the `bau-suite:sync-error-added` window event ONLY on a new signature,
 * avoiding inspector re-render storms on a recurring failure.
 *
 * The whole upsert + count + overflow-delete runs in ONE readwrite transaction
 * so the cap can't race.
 */
export async function addSyncError(error: SyncError): Promise<boolean> {
  const db = await getDB();
  const tx = db.transaction('syncErrors', 'readwrite');

  const existing = await tx.store.get(error.id);
  const isNew = !existing;
  const nowIso = error.createdAt ?? new Date().toISOString();

  if (existing) {
    await tx.store.put({
      ...error,
      occurrences: (existing.occurrences ?? 1) + 1,
      firstSeenAt: existing.firstSeenAt ?? existing.createdAt ?? nowIso,
      lastSeenAt: nowIso,
      // Keep createdAt anchored to the FIRST sighting so the cap's
      // oldest-first eviction reflects genuine age, not last-recurrence churn.
      createdAt: existing.createdAt ?? nowIso,
    });
  } else {
    await tx.store.put({
      ...error,
      occurrences: 1,
      firstSeenAt: nowIso,
      lastSeenAt: nowIso,
    });
  }

  const total = await tx.store.count();
  if (total > SYNC_ERROR_CAP) {
    const overflow = total - SYNC_ERROR_CAP;
    // Cursor on by-created-at (ascending = oldest first) — delete the oldest
    // `overflow` rows so we settle back at the cap.
    let cursor = await tx.store.index('by-created-at').openCursor(null, 'next');
    let deleted = 0;
    while (cursor && deleted < overflow) {
      await cursor.delete();
      deleted++;
      cursor = await cursor.continue();
    }
  }
  await tx.done;
  return isNew;
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
