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

// Fields to strip from local entities before pushing to Supabase.
// These only exist locally and have no corresponding Supabase column.
const LOCAL_ONLY_FIELDS = new Set([
  'isOfflineCached', // files — local-only blob cache indicator
]);

// Per-entity fields to SKIP (field exists locally but NOT in the Supabase schema).
// Unlike LOCAL_ONLY_FIELDS which applies globally, these are entity-specific.
const SKIP_FIELDS: Partial<Record<SyncEntityType, Set<string>>> = {
  activityLog: new Set(['user']), // local `user` field — Supabase uses `user_id` instead
};

// camelCase → snake_case conversion
function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

// Per-entity field overrides (where auto snake_case doesn't match the schema,
// or where we need explicit mapping for clarity)
const FIELD_OVERRIDES: Partial<Record<SyncEntityType, Record<string, string>>> = {
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
  files: {
    projectId: 'project_id',
    fileName: 'file_name',
    fileType: 'file_type',
    mimeType: 'mime_type',
    panelSystem: 'panel_system',
    revisionNumber: 'revision_number',
    revisionDate: 'revision_date',
    uploadedBy: 'uploaded_by',
    isPinned: 'is_pinned',
    isFavorite: 'is_favorite',
    currentVersionId: 'current_version_id',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  notes: {
    projectId: 'project_id',
    fileId: 'file_id',
    isPinned: 'is_pinned',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  devices: {
    projectId: 'project_id',
    deviceName: 'device_name',
    controllerType: 'controller_type',
    macAddress: 'mac_address',
    instanceNumber: 'instance_number',
    ipAddress: 'ip_address',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  ipPlan: {
    projectId: 'project_id',
    ipAddress: 'ip_address',
    deviceRole: 'device_role',
    macAddress: 'mac_address',
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
  activityLog: {
    projectId: 'project_id',
    fileId: 'file_id',
  },
  networkDiagrams: {
    projectId: 'project_id',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
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
  registerCalculations: {
    projectId: 'project_id',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
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
  const skipFields = SKIP_FIELDS[entityType];
  const row: Record<string, unknown> = { user_id: userId };

  for (const [key, value] of Object.entries(localEntity)) {
    // Strip globally local-only fields
    if (LOCAL_ONLY_FIELDS.has(key)) continue;
    // Strip entity-specific fields that don't exist in Supabase
    if (skipFields?.has(key)) continue;

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
