import type {
  AhuCoilLoadResult,
  AhuMixedAirResult,
  AnomalyConfig,
  Contact,
  FlowControl,
  NoteCategory,
  PidAction,
  PidControlMode,
  PidLoopType,
  PidOutputType,
  PidResponseData,
  PidTuningValues,
  PingResultEntry,
  PingTarget,
  PpclFirmwareTarget,
  PsychComfortResult,
  PsychInputMode,
  PsychState,
  PsychUnitSystem,
  RegisterToolModule,
  SavedCalcCategory,
  TrendAnomaly,
  TrendDataPoint,
  TrendSeries,
  TrendSeriesStats,
  TrendSourceSystem,
} from '@/types';

// ─── Enums / Unions ─────────────────────────────────────────────────────────

export type GlobalProjectStatus = 'active' | 'on-hold' | 'completed' | 'archived';
export type GlobalProjectRole = 'admin' | 'member';
export type GlobalDeviceStatus = 'Online' | 'Offline' | 'Issue' | 'Not Commissioned';
export type GlobalIpStatus = 'active' | 'reserved' | 'available' | 'conflict';
export type GlobalReportStatus = 'draft' | 'submitted' | 'finalized';

// ─── Core ───────────────────────────────────────────────────────────────────

export interface GlobalProject {
  id: string;
  createdBy: string;
  name: string;
  jobSiteName: string;
  siteAddress: string;
  buildingArea: string;
  projectNumber: string;
  description: string;
  customerName: string;
  technicianNotes: string;
  panelRosterSummary: string | null;
  networkSummary: string | null;
  contacts: Contact[];
  accessCode: string;
  tags: string[];
  status: GlobalProjectStatus;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Populated via join — number of members in this project */
  memberCount?: number;
  /** Populated via join — current user's role in this project */
  role?: GlobalProjectRole;
  /** Per-user preference joined from global_project_preferences */
  isPinned?: boolean;
  /** Per-user preference joined from global_project_preferences */
  isOfflineAvailable?: boolean;
}

export interface CreateGlobalProjectData {
  name: string;
  jobSiteName: string;
  siteAddress?: string;
  buildingArea?: string;
  projectNumber?: string;
  description?: string;
  tags?: string[];
}

export interface GlobalProjectMember {
  id: string;
  globalProjectId: string;
  userId: string;
  role: GlobalProjectRole;
  joinedAt: string;
  invitedBy: string | null;
  /** Joined from profiles table */
  displayName: string | null;
  /** Joined from profiles table */
  email: string;
  /** Joined from profiles table */
  avatarUrl: string | null;
}

// ─── Child Entities ─────────────────────────────────────────────────────────

export interface GlobalFieldNote {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  fileId: string | null;
  content: string;
  category: NoteCategory;
  isPinned: boolean;
  tags: string[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalDevice {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  deviceName: string;
  description: string;
  system: string;
  panel: string;
  controllerType: string;
  macAddress: string | null;
  instanceNumber: string | null;
  ipAddress: string | null;
  floor: string;
  area: string;
  status: GlobalDeviceStatus;
  notes: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalIpPlanEntry {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  ipAddress: string;
  hostname: string;
  panel: string;
  vlan: string;
  subnet: string;
  deviceRole: string;
  macAddress: string | null;
  notes: string;
  status: GlobalIpStatus;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalReportAttachment {
  id: string;
  fileName: string;
  fileType: string;
  mimeType: string;
  size: number;
  /** Path in Supabase Storage (project-files bucket). Null for legacy metadata-only entries. */
  storagePath: string | null;
}

export interface GlobalDailyReport {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  date: string;
  reportNumber: number;
  technicianName: string;
  status: GlobalReportStatus;
  startTime: string;
  endTime: string;
  hoursOnSite: string;
  location: string;
  weather: string;
  workCompleted: string;
  issuesEncountered: string;
  workPlannedNext: string;
  coordinationNotes: string;
  equipmentWorkedOn: string;
  deviceIpChanges: string;
  safetyNotes: string;
  generalNotes: string;
  attachments: GlobalReportAttachment[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalProjectFile {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  title: string;
  fileName: string;
  fileType: string;
  mimeType: string;
  category: string;
  panelSystem: string | null;
  revisionNumber: string;
  revisionDate: string;
  notes: string;
  tags: string[];
  status: string;
  isPinned: boolean;
  size: number;
  storagePath: string | null;
  versions: unknown[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalActivityLogEntry {
  id: string;
  globalProjectId: string;
  userId: string;
  action: string;
  details: string;
  fileId: string | null;
  timestamp: string;
}

export interface GlobalMessage {
  id: string;
  globalProjectId: string | null;
  parentId: string | null;
  subject: string;
  body: string;
  createdBy: string;
  deletedAt: string | null;
  createdAt: string;
  /** Joined from profiles table */
  authorName: string | null;
  /** Joined from profiles table */
  authorAvatarUrl: string | null;
  /** Joined from global_projects table */
  projectName: string | null;
  /** Replies nested under this message (populated client-side) */
  replies?: GlobalMessage[];
  /** Number of replies (populated client-side) */
  replyCount?: number;
}

export interface GlobalNetworkDiagram {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  name: string;
  description: string;
  nodes: unknown[];
  connections: unknown[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Extended Child Entities (Step-2 parity additions) ──────────────────────

export interface GlobalPpclDocument {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  name: string;
  content: string;
  firmware: PpclFirmwareTarget;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalTerminalSessionLog {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  sessionLabel: string;
  connectionMode: 'serial' | 'tcp';
  host: string;
  port: number;
  serialPort: string;
  baudRate: number;
  lineCount: number;
  logContent: string;
  startedAt: string;
  endedAt: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalPidTuningSession {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  loopName: string;
  equipment: string;
  loopType: PidLoopType;
  controlledVariable: string;
  outputType: PidOutputType;
  actuatorStrokeTime: number | null;
  action: PidAction;
  controlMode: PidControlMode;
  currentValues: PidTuningValues;
  recommendedValues: PidTuningValues;
  symptoms: string[];
  responseData: PidResponseData;
  fieldNotes: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalPsychSession {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  label: string;
  unitSystem: PsychUnitSystem;
  altitude: number;
  inputMode: PsychInputMode;
  inputValues: Record<string, number>;
  results: PsychState;
  comfortResult: PsychComfortResult;
  ahuMixedAir?: AhuMixedAirResult;
  ahuCoilLoad?: AhuCoilLoadResult;
  notes: string;
  tags: string[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalRegisterCalculation {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  label: string;
  module: RegisterToolModule;
  category: SavedCalcCategory;
  inputs: Record<string, unknown>;
  result: Record<string, unknown>;
  notes: string;
  tags: string[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalPingSession {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  targets: PingTarget[];
  results: Record<string, PingResultEntry[]>;
  mode: 'single' | 'repeated' | 'multi';
  intervalMs: number;
  completedAt?: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalTrendSession {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  name: string;
  description: string;
  sourceSystem: TrendSourceSystem;
  series: TrendSeries[];
  data: TrendDataPoint[];
  anomalies: TrendAnomaly[];
  anomalyConfig: AnomalyConfig;
  stats: TrendSeriesStats[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalConnectionProfile {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  name: string;
  connectionType: 'serial' | 'tcp';
  // Serial settings
  serialPort: string;
  baudRate: number;
  dataBits: number;
  parity: string;
  stopBits: string;
  flowControl: FlowControl;
  // TCP/Telnet settings
  host: string;
  port: number;
  // Common settings
  localEcho: boolean;
  lineEnding: string;
  logging: boolean;
  // Organization
  notes: string;
  isFavorite: boolean;
  tags: string[];
  // Metadata
  lastConnectedAt: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Derived from `supabase/migrations/add-global-field-panels.sql` — there is
 * no local TS `FieldPanel` interface in `src/types/index.ts`, so this is the
 * canonical shape for the global side. The local IndexedDB store uses the
 * same column set (see `src/lib/db.ts` v14 migration), but it's typed
 * loosely with `any` there.
 */
export interface GlobalFieldPanel {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  name: string;
  site: string;
  building: string;
  floor: string;
  system: string;
  equipment: string;
  controllerFamily: string;
  model: string;
  ipAddress: string;
  subnetMask: string;
  gateway: string;
  bacnetInstance: number | null;
  macAddress: string;
  networkType: string;
  firmwareVersion: string;
  applicationVersion: string;
  panelStatus: string;
  webUiUrl: string;
  secureWebUiUrl: string;
  lastSeenAt: string | null;
  lastBackupAt: string | null;
  lastCommissionedAt: string | null;
  assignedTechnician: string;
  tags: string[];
  notes: unknown[];
  activities: unknown[];
  linkedFiles: unknown[];
  relatedTools: unknown[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Derived from `supabase/migrations/add-global-project-notepad-entries.sql` —
 * there is no local TS `ProjectNotepadEntry` interface in `src/types/index.ts`
 * (the notepad UI store in `src/store/notepad-store.ts` is unrelated; it tracks
 * floating UI tabs, not the per-project notepad table).
 */
export interface GlobalNotepadEntry {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  name: string;
  content: string;
  linkedTabId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── DXR Entries (Global mirror) ────────────────────────────────────────────

export interface GlobalDxrEntry {
  id: string;
  globalProjectId: string;
  createdBy: string;
  updatedBy: string | null;
  // ── 21 source columns ──
  name: string | null;
  location: string | null;
  description: string | null;
  deviceInstanceNumber: number | null;
  equipmentId: string | null;
  serialNumber: string | null;
  applicationTemplate: string | null;
  applicationNumber: number | null;
  network: number | null;
  autoAddressing: boolean | null;
  macAddress: number | null;
  maxManagerAddress: number | null;
  baudRate: number | null;
  roomHierarchy: string | null;
  roomName: string | null;
  roomDescription: string | null;
  segmentHierarchy: string | null;
  segmentName: string | null;
  segmentDescription: string | null;
  msTpNwId: string | null;
  guid: string | null;
  importedFromFileId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Per-user preferences for a global project. Backed by
 * `global_project_preferences (user_id, global_project_id)`. No local
 * counterpart — `Project.isPinned` / `isOfflineAvailable` live directly on
 * the project row on the local side.
 */
export interface GlobalProjectPreferences {
  userId: string;
  globalProjectId: string;
  isPinned: boolean;
  isOfflineAvailable: boolean;
  lastViewedTab: string | null;
  preferences: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
