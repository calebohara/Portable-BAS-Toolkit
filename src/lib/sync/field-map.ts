import type { SyncEntityType } from '@/types';

// Maps IndexedDB store names to Supabase table names
export const entityTypeToTable: Record<SyncEntityType, string> = {
  projects: 'projects',
  files: 'project_files',
  notes: 'field_notes',
  devices: 'devices',
  ipPlan: 'ip_plan',
  dailyReports: 'daily_reports',
  activityLog: 'activity_log',
  networkDiagrams: 'network_diagrams',
  commandSnippets: 'command_snippets',
  pingSessions: 'ping_sessions',
  terminalLogs: 'terminal_session_logs',
  connectionProfiles: 'connection_profiles',
  registerCalculations: 'register_calculations',
};

// Fields to strip from local entities before pushing to Supabase
const LOCAL_ONLY_FIELDS = new Set([
  'isOfflineCached',  // files only
  'isOfflineAvailable', // projects — maps to is_offline_available in schema but keep for now
]);

// camelCase → snake_case conversion
function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

// Per-entity field overrides (where auto snake_case doesn't match the schema)
const FIELD_OVERRIDES: Partial<Record<SyncEntityType, Record<string, string>>> = {
  files: {
    panelSystem: 'panel_system',
    revisionNumber: 'revision_number',
    revisionDate: 'revision_date',
    uploadedBy: 'uploaded_by',
    mimeType: 'mime_type',
    fileType: 'file_type',
    fileName: 'file_name',
    isPinned: 'is_pinned',
    isFavorite: 'is_favorite',
    currentVersionId: 'current_version_id',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    projectId: 'project_id',
  },
  projects: {
    customerName: 'customer_name',
    siteAddress: 'site_address',
    buildingArea: 'building_area',
    projectNumber: 'project_number',
    technicianNotes: 'technician_notes',
    panelRosterSummary: 'panel_roster_summary',
    networkSummary: 'network_summary',
    isPinned: 'is_pinned',
    isOfflineAvailable: 'is_offline_available',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  dailyReports: {
    projectId: 'project_id',
    reportNumber: 'report_number',
    technicianName: 'technician_name',
    startTime: 'start_time',
    endTime: 'end_time',
    hoursOnSite: 'hours_on_site',
    workCompleted: 'work_completed',
    issuesEncountered: 'issues_encountered',
    workPlannedNext: 'work_planned_next',
    coordinationNotes: 'coordination_notes',
    equipmentWorkedOn: 'equipment_worked_on',
    deviceIpChanges: 'device_ip_changes',
    safetyNotes: 'safety_notes',
    generalNotes: 'general_notes',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  connectionProfiles: {
    connectionType: 'connection_type',
    serialPort: 'serial_port',
    baudRate: 'baud_rate',
    dataBits: 'data_bits',
    stopBits: 'stop_bits',
    flowControl: 'flow_control',
    localEcho: 'local_echo',
    lineEnding: 'line_ending',
    projectId: 'project_id',
    isFavorite: 'is_favorite',
    lastConnectedAt: 'last_connected_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  terminalLogs: {
    projectId: 'project_id',
    sessionLabel: 'session_label',
    connectionMode: 'connection_mode',
    serialPort: 'serial_port',
    baudRate: 'baud_rate',
    lineCount: 'line_count',
    logContent: 'log_content',
    startedAt: 'started_at',
    endedAt: 'ended_at',
    createdAt: 'created_at',
  },
  commandSnippets: {
    isFavorite: 'is_favorite',
    usageCount: 'usage_count',
    lastUsedAt: 'last_used_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  pingSessions: {
    projectId: 'project_id',
    intervalMs: 'interval_ms',
    createdAt: 'created_at',
    completedAt: 'completed_at',
  },
};

/**
 * Converts a local IndexedDB entity to a Supabase-compatible row.
 * Adds user_id, converts camelCase fields to snake_case, and strips local-only fields.
 */
export function toSupabaseRow(
  entityType: SyncEntityType,
  localEntity: Record<string, unknown>,
  userId: string,
): Record<string, unknown> {
  const overrides = FIELD_OVERRIDES[entityType] ?? {};
  const row: Record<string, unknown> = { user_id: userId };

  for (const [key, value] of Object.entries(localEntity)) {
    if (LOCAL_ONLY_FIELDS.has(key)) continue;

    // Use explicit override, or auto-convert to snake_case
    const snakeKey = overrides[key] ?? toSnakeCase(key);
    row[snakeKey] = value;
  }

  return row;
}

// Dependency order for full sync (projects first due to FK constraints)
export const SYNC_ORDER: SyncEntityType[] = [
  'projects',
  'files',
  'notes',
  'devices',
  'ipPlan',
  'dailyReports',
  'activityLog',
  'networkDiagrams',
  'commandSnippets',
  'pingSessions',
  'terminalLogs',
  'connectionProfiles',
  'registerCalculations',
];
