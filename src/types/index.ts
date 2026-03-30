export type ProjectStatus = 'active' | 'on-hold' | 'completed' | 'archived';
export type FileCategory = 'panel-databases' | 'wiring-diagrams' | 'sequences' | 'ip-plan' | 'device-list' | 'backups' | 'general-documents' | 'other';
export type FileStatus = 'current' | 'previous' | 'archived' | 'field-verified' | 'superseded' | 'backup-snapshot' | 'obsolete';
export type NoteCategory = 'general' | 'issue' | 'fix' | 'punch-item' | 'startup-note' | 'network-change' | 'customer-request';

export interface Contact {
  name: string;
  role: string; // GC, controls contractor, TAB, mechanical, customer, etc.
  phone?: string;
  email?: string;
  company?: string;
}

export interface Project {
  id: string;
  name: string;
  customerName: string;
  siteAddress: string;
  buildingArea: string;
  projectNumber: string;
  technicianNotes: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  status: ProjectStatus;
  contacts: Contact[];
  panelRosterSummary?: string;
  networkSummary?: string;
  isPinned: boolean;
  isOfflineAvailable: boolean;
}

export interface FileVersion {
  id: string;
  fileId: string;
  versionNumber: number;
  uploadedAt: string;
  uploadedBy: string;
  notes: string;
  size: number;
  status: FileStatus;
  blobKey?: string; // key in IndexedDB blob store
}

export interface ProjectFile {
  id: string;
  projectId: string; // empty string '' for unassigned uploads
  title: string;
  fileName: string;
  fileType: string; // extension
  mimeType: string;
  category: FileCategory;
  panelSystem?: string;
  revisionNumber: string;
  revisionDate: string;
  uploadedBy: string;
  notes: string;
  tags: string[];
  status: FileStatus;
  isPinned: boolean;
  isFavorite: boolean;
  isOfflineCached: boolean;
  currentVersionId: string;
  versions: FileVersion[];
  createdAt: string;
  updatedAt: string;
  size: number;
}

export interface FieldNote {
  id: string;
  projectId: string;
  fileId?: string; // optional: note attached to a file
  content: string;
  category: NoteCategory;
  author: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}


// ─── PPCL Documents ─────────────────────────────────────────
export type PpclFirmwareTarget = 'pxc-tc' | 'ptec';

export interface PpclDocument {
  id: string;
  name: string;
  content: string;
  projectId: string; // '' for unassigned
  firmware: PpclFirmwareTarget;
  createdAt: string;
  updatedAt: string;
}

export type BugReportSeverity = 'low' | 'medium' | 'high' | 'critical';
export type BugReportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface BugReport {
  id: string;
  title: string;
  description: string;
  stepsToReproduce?: string;
  severity: BugReportSeverity;
  status: BugReportStatus;
  appVersion: string;
  deviceClass: string;
  desktopOS: string;
  currentPage: string;
  syncStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserReview {
  id: string;
  rating: number;
  comment: string;
  displayName: string;
  appVersion: string;
  deviceClass: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceEntry {
  id: string;
  projectId: string;
  deviceName: string;
  description: string;
  system: string;
  panel: string;
  controllerType: string;
  macAddress?: string;
  instanceNumber?: string;
  ipAddress?: string;
  floor: string;
  area: string;
  status: 'Online' | 'Offline' | 'Issue' | 'Not Commissioned';
  notes: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface IpPlanEntry {
  id: string;
  projectId: string;
  ipAddress: string;
  hostname: string;
  panel: string;
  vlan: string;
  subnet: string;
  deviceRole: string;
  macAddress?: string;
  notes: string;
  status: 'active' | 'reserved' | 'available' | 'conflict';
  createdAt?: string;
  updatedAt?: string;
}

export interface ActivityLogEntry {
  id: string;
  projectId: string;
  action: string;
  details: string;
  timestamp: string;
  user: string;
  fileId?: string;
}

// ─── Daily Reports ───────────────────────────────────────────
export type ReportStatus = 'draft' | 'submitted' | 'finalized';

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  finalized: 'Finalized',
};

export interface ReportAttachment {
  id: string;
  fileName: string;
  fileType: string;
  mimeType: string;
  size: number;
  blobKey: string; // key in fileBlobs store
}

export interface DailyReport {
  id: string;
  projectId: string;
  date: string; // YYYY-MM-DD
  reportNumber: number;
  technicianName: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;

  // Time
  startTime: string;
  endTime: string;
  hoursOnSite: string;

  // Location
  location: string;
  weather: string;

  // Content sections
  workCompleted: string;
  issuesEncountered: string;
  workPlannedNext: string;
  coordinationNotes: string;
  equipmentWorkedOn: string;
  deviceIpChanges: string;
  safetyNotes: string;
  generalNotes: string;

  // Attachments
  attachments: ReportAttachment[];
}

// ─── Sync Types ─────────────────────────────────────────────
export type SyncEntityType =
  | 'projects' | 'files' | 'notes' | 'devices' | 'ipPlan'
  | 'dailyReports' | 'activityLog' | 'networkDiagrams'
  | 'commandSnippets' | 'pingSessions' | 'terminalLogs'
  | 'connectionProfiles' | 'registerCalculations' | 'pidTuningSessions'
  | 'ppclDocuments' | 'bugReports' | 'psychSessions' | 'reviews'
  | 'trendSessions';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline' | 'disabled';

export interface SyncQueueItem {
  id: string;
  action: 'create' | 'update' | 'delete';
  entityType: SyncEntityType;
  entityId: string;
  payload: unknown;
  userId: string;
  status: 'pending' | 'syncing' | 'failed' | 'completed';
  createdAt: string;
  retriedCount: number;
  lastError?: string;
}

export interface SyncConflict {
  id: string; // `${entityType}-${entityId}`
  entityType: SyncEntityType;
  entityId: string;
  localData: Record<string, unknown>;
  remoteData: Record<string, unknown>;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  detectedAt: string;
}

export const FILE_CATEGORY_LABELS: Record<FileCategory, string> = {
  'panel-databases': 'Panel Databases',
  'wiring-diagrams': 'Wiring Diagrams',
  'sequences': 'Sequences',
  'ip-plan': 'IP Plan',
  'device-list': 'Device List',
  'backups': 'Backups',
  'general-documents': 'General Documents',
  'other': 'Other',
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  'on-hold': 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
};

export const FILE_STATUS_LABELS: Record<FileStatus, string> = {
  current: 'Current',
  previous: 'Previous',
  archived: 'Archived',
  'field-verified': 'Field Verified',
  superseded: 'Superseded',
  'backup-snapshot': 'Backup Snapshot',
  obsolete: 'Obsolete',
};

export const NOTE_CATEGORY_LABELS: Record<NoteCategory, string> = {
  general: 'General',
  issue: 'Issue',
  fix: 'Fix',
  'punch-item': 'Punch Item',
  'startup-note': 'Startup Note',
  'network-change': 'Network Change',
  'customer-request': 'Customer Request',
};

// ─── Network Diagrams ───────────────────────────────────────
export type DiagramNodeType =
  | 'controller' | 'router' | 'switch' | 'server'
  | 'sensor' | 'actuator' | 'panel' | 'workstation'
  | 'gateway' | 'cloud' | 'generic';

export const DIAGRAM_NODE_LABELS: Record<DiagramNodeType, string> = {
  controller: 'Controller',
  router: 'Router',
  switch: 'Switch',
  server: 'Server',
  sensor: 'Sensor',
  actuator: 'Actuator',
  panel: 'Panel',
  workstation: 'Workstation',
  gateway: 'Gateway',
  cloud: 'Cloud',
  generic: 'Generic',
};

export interface DiagramNode {
  id: string;
  type: DiagramNodeType;
  label: string;
  x: number;
  y: number;
  ip?: string;
  mac?: string;
  notes?: string;
  color?: string;
}

export type ConnectionStyle = 'solid' | 'dashed' | 'dotted';

export interface DiagramConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label?: string;
  style: ConnectionStyle;
  color?: string;
}

export interface NetworkDiagram {
  id: string;
  projectId: string;
  name: string;
  description: string;
  nodes: DiagramNode[];
  connections: DiagramConnection[];
  createdAt: string;
  updatedAt: string;
}

// ─── Command Snippets ───────────────────────────────────────
export type SnippetCategory =
  | 'bacnet' | 'lonworks' | 'modbus' | 'niagara'
  | 'tridium' | 'siemens' | 'johnson' | 'honeywell'
  | 'general' | 'diagnostic' | 'network' | 'other';

export const SNIPPET_CATEGORY_LABELS: Record<SnippetCategory, string> = {
  bacnet: 'BACnet',
  lonworks: 'LonWorks',
  modbus: 'Modbus',
  niagara: 'Niagara',
  tridium: 'Tridium',
  siemens: 'Siemens',
  johnson: 'Johnson Controls',
  honeywell: 'Honeywell',
  general: 'General',
  diagnostic: 'Diagnostic',
  network: 'Network',
  other: 'Other',
};

export interface CommandSnippet {
  id: string;
  command: string;
  label: string;
  description: string;
  category: SnippetCategory;
  tags: string[];
  isFavorite: boolean;
  usageCount: number;
  lastUsedAt: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Connection Profiles ────────────────────────────────────
export type FlowControl = 'none' | 'hardware' | 'software';

export interface ConnectionProfile {
  id: string;
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
  projectId: string;
  notes: string;
  isFavorite: boolean;
  tags: string[];
  // Metadata
  lastConnectedAt: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Terminal Session Logs ───────────────────────────────────
export interface TerminalSessionLog {
  id: string;
  projectId: string;
  sessionLabel: string;
  connectionMode: 'serial' | 'tcp';
  host: string;
  port: number;
  serialPort: string;
  baudRate: number;
  lineCount: number;
  logContent: string; // full exported text
  startedAt: string;
  endedAt: string;
  createdAt: string;
}

// ─── Register Tool / Protocol Converter ─────────────────────
export type ByteOrder = 'big-endian' | 'little-endian' | 'mid-big' | 'mid-little';
export type RegisterDataType = 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32';
export type ModbusNotation = '0-based' | '1-based' | 'modicon';
export type RegisterToolModule =
  | 'quick-convert'
  | 'register-interpret'
  | 'byte-order'
  | 'float-decode'
  | 'bitmask'
  | 'scaling'
  | 'modbus-builder';

export type SavedCalcCategory =
  | 'diagnostics' | 'register-maps' | 'device-notes'
  | 'scaling-references' | 'integration-notes' | 'general';

export const SAVED_CALC_CATEGORY_LABELS: Record<SavedCalcCategory, string> = {
  diagnostics: 'Diagnostics',
  'register-maps': 'Register Maps',
  'device-notes': 'Device Notes',
  'scaling-references': 'Scaling References',
  'integration-notes': 'Integration Notes',
  general: 'General',
};

export interface SavedCalculation {
  id: string;
  projectId: string;
  label: string;
  module: RegisterToolModule;
  category: SavedCalcCategory;
  inputs: Record<string, unknown>;
  result: Record<string, unknown>;
  notes: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── PID Tuning Tool ────────────────────────────────────────
export type PidLoopType =
  | 'sat' | 'dat' | 'static-pressure' | 'room-temp'
  | 'hot-water' | 'chilled-water' | 'humidity' | 'room-pressure'
  | 'vfd-speed' | 'heat-exchanger' | 'generic';

export type PidOutputType = 'valve' | 'damper' | 'vfd' | 'staged' | 'other';
export type PidControlMode = 'p' | 'pi' | 'pid';
export type PidAction = 'direct' | 'reverse';
export type PidGainMode = 'gain' | 'proportional-band';

export const PID_LOOP_TYPE_LABELS: Record<PidLoopType, string> = {
  'sat': 'Supply Air Temp (SAT)',
  'dat': 'Discharge Air Temp (DAT)',
  'static-pressure': 'Static Pressure',
  'room-temp': 'Room Temperature',
  'hot-water': 'Hot Water Valve',
  'chilled-water': 'Chilled Water Valve',
  'humidity': 'Humidity',
  'room-pressure': 'Room Pressure',
  'vfd-speed': 'VFD / Fan Speed',
  'heat-exchanger': 'Heat Exchanger',
  'generic': 'Generic Analog Loop',
};

export const PID_OUTPUT_TYPE_LABELS: Record<PidOutputType, string> = {
  valve: 'Valve',
  damper: 'Damper',
  vfd: 'VFD',
  staged: 'Staged Analog',
  other: 'Other',
};

export const PID_CONTROL_MODE_LABELS: Record<PidControlMode, string> = {
  p: 'P (Proportional Only)',
  pi: 'PI (Proportional + Integral)',
  pid: 'PID (Full PID)',
};

export interface PidTuningValues {
  gainMode: PidGainMode;
  gain: number | null;
  proportionalBand: number | null;
  integralTime: number | null;
  derivativeTime: number | null;
  sampleInterval: number | null;
  outputMin: number | null;
  outputMax: number | null;
  deadband: number | null;
}

export interface PidResponseData {
  setpoint: number | null;
  startingPv: number | null;
  finalPv: number | null;
  overshootPercent: number | null;
  responseTimeSeconds: number | null;
  settleTimeSeconds: number | null;
  oscillationCount: number | null;
  saturated: boolean;
  deadTimeSeconds: number | null;
}

export interface PidTuningSession {
  id: string;
  projectId: string;
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
  createdAt: string;
  updatedAt: string;
}

// ─── Psychrometric Calculator ────────────────────────────────
export type PsychUnitSystem = 'ip' | 'si';

export type PsychInputMode =
  | 'db-wb'      // Dry Bulb + Wet Bulb
  | 'db-rh'      // Dry Bulb + Relative Humidity
  | 'db-dp'      // Dry Bulb + Dew Point
  | 'db-w'       // Dry Bulb + Humidity Ratio
  | 'db-h';      // Dry Bulb + Enthalpy

export const PSYCH_INPUT_MODE_LABELS: Record<PsychInputMode, string> = {
  'db-wb': 'Dry Bulb + Wet Bulb',
  'db-rh': 'Dry Bulb + Relative Humidity',
  'db-dp': 'Dry Bulb + Dew Point',
  'db-w': 'Dry Bulb + Humidity Ratio',
  'db-h': 'Dry Bulb + Enthalpy',
};

export interface PsychState {
  dryBulb: number;
  wetBulb: number;
  dewPoint: number;
  relativeHumidity: number;
  humidityRatio: number;
  enthalpy: number;
  specificVolume: number;
  vaporPressure: number;
  saturationPressure: number;
  degreeOfSaturation: number;
}

export interface PsychComfortResult {
  inComfortZone: boolean;
  reason: string;
}

export interface AhuMixedAirInputs {
  oaDryBulb: number;
  oaHumidityRatio: number;
  oaEnthalpy: number;
  raDryBulb: number;
  raHumidityRatio: number;
  raEnthalpy: number;
  oaFraction: number;
}

export interface AhuMixedAirResult {
  mixedDryBulb: number;
  mixedHumidityRatio: number;
  mixedEnthalpy: number;
  mixedState: PsychState;
}

export interface AhuCoilLoadInputs {
  airflowCfm: number;
  enteringState: PsychState;
  leavingState: PsychState;
}

export interface AhuCoilLoadResult {
  sensibleLoad: number;
  latentLoad: number;
  totalLoad: number;
  sensibleHeatRatio: number;
}

export interface PsychSession {
  id: string;
  projectId: string;
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
  createdAt: string;
  updatedAt: string;
}

// ─── Trend Viewer ──────────────────────────────────────────

export type TrendSourceSystem =
  | 'niagara' | 'desigo' | 'metasys' | 'honeywell-ebi'
  | 'ecostruxure' | 'webctrl' | 'generic';

export const TREND_SOURCE_SYSTEM_LABELS: Record<TrendSourceSystem, string> = {
  niagara: 'Tridium Niagara',
  desigo: 'Siemens Desigo CC',
  metasys: 'Johnson Controls Metasys',
  'honeywell-ebi': 'Honeywell EBI',
  ecostruxure: 'Schneider EcoStruxure',
  webctrl: 'Automated Logic WebCTRL',
  generic: 'Generic CSV',
};

export type TrendAnomalyType =
  | 'stuck-sensor' | 'spike' | 'out-of-range'
  | 'oscillation' | 'short-cycling' | 'gap';

export const TREND_ANOMALY_LABELS: Record<TrendAnomalyType, string> = {
  'stuck-sensor': 'Stuck Sensor',
  spike: 'Spike',
  'out-of-range': 'Out of Range',
  oscillation: 'Oscillation / Hunting',
  'short-cycling': 'Short Cycling',
  gap: 'Data Gap',
};

export interface TrendDataPoint {
  timestamp: number; // Unix ms (normalized)
  values: Record<string, number | null>; // seriesId -> value
}

export interface TrendSeries {
  id: string;
  name: string;
  unit: string;
  color: string;
  visible: boolean;
  yAxisSide: 'left' | 'right';
  valueType: 'numeric' | 'binary' | 'enum';
  sourceFile: string;
}

export interface TrendAnomaly {
  id: string;
  seriesId: string;
  type: TrendAnomalyType;
  startTimestamp: number;
  endTimestamp: number;
  severity: 'info' | 'warning' | 'critical';
  description: string;
  value?: number;
}

export interface TrendSeriesStats {
  seriesId: string;
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  sampleCount: number;
  gapCount: number;
  runtimeHours: number | null;
  firstTimestamp: number;
  lastTimestamp: number;
}

export interface AnomalyConfig {
  stuckThresholdMinutes: number;
  stuckTolerance: number;
  spikeStdDevMultiplier: number;
  spikeRollingWindowSize: number;
  outOfRangeMin: number | null;
  outOfRangeMax: number | null;
  oscillationWindowMinutes: number;
  oscillationMinReversals: number;
  shortCycleWindowMinutes: number;
  shortCycleMinTransitions: number;
  gapThresholdMultiplier: number;
}

export interface TrendSession {
  id: string;
  projectId: string;
  name: string;
  description: string;
  sourceSystem: TrendSourceSystem;
  series: TrendSeries[];
  data: TrendDataPoint[];
  anomalies: TrendAnomaly[];
  anomalyConfig: AnomalyConfig;
  stats: TrendSeriesStats[];
  createdAt: string;
  updatedAt: string;
}

// ─── Ping Results ───────────────────────────────────────────
export type PingStatus = 'reachable' | 'unreachable' | 'pending' | 'error';

export interface PingTarget {
  host: string;
  label?: string;
  port?: number;
}

export interface PingResultEntry {
  timestamp: string;
  status: PingStatus;
  responseTimeMs?: number;
  error?: string;
  /** Which protocol:port combination succeeded (e.g. "https :443") */
  reachableOn?: string;
}

export interface PingSession {
  id: string;
  projectId: string;
  targets: PingTarget[];
  results: Record<string, PingResultEntry[]>; // keyed by host
  mode: 'single' | 'repeated' | 'multi';
  intervalMs: number;
  createdAt: string;
  completedAt?: string;
}
