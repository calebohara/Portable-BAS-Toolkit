import type { SyncEntityType } from '@/types';

// UUID v4 regex — Supabase uuid columns reject non-UUID strings
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  pidTuningSessions: 'pid_tuning_sessions',
  ppclDocuments: 'ppcl_documents',
  psychSessions: 'psych_sessions',
  bugReports: 'bug_reports',
};

// Fields to strip from local entities before pushing to Supabase.
// These only exist locally and have no corresponding Supabase column.
const LOCAL_ONLY_FIELDS = new Set([
  'isOfflineCached', // files — local-only blob cache indicator
]);

// Snake_case column names that are uuid foreign-key references in Supabase.
// Empty strings must be converted to null (Postgres rejects '' for uuid columns).
const UUID_FK_COLUMNS = new Set([
  'project_id',
  'file_id',
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

// snake_case → camelCase conversion (inverse of toSnakeCase)
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
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
  pidTuningSessions: {
    projectId: 'project_id',
    loopName: 'loop_name',
    loopType: 'loop_type',
    controlledVariable: 'controlled_variable',
    outputType: 'output_type',
    actuatorStrokeTime: 'actuator_stroke_time',
    controlMode: 'control_mode',
    currentValues: 'current_values',
    recommendedValues: 'recommended_values',
    responseData: 'response_data',
    fieldNotes: 'field_notes',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  ppclDocuments: {
    projectId: 'project_id',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  bugReports: {
    stepsToReproduce: 'steps_to_reproduce',
    appVersion: 'app_version',
    deviceClass: 'device_class',
    desktopOS: 'desktop_os',
    currentPage: 'current_page',
    syncStatus: 'sync_status',
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
    // Skip undefined values entirely (don't send to Supabase)
    if (value === undefined) continue;

    // Use explicit override, or auto-convert to snake_case
    const snakeKey = overrides[key] ?? toSnakeCase(key);

    // Sanitize uuid FK columns: convert empty strings and non-UUID values to null
    // (Postgres rejects '' and non-UUID strings like "proj-ahu-upgrade" for uuid columns)
    if (UUID_FK_COLUMNS.has(snakeKey)) {
      if (typeof value !== 'string' || value === '' || !UUID_RE.test(value)) {
        row[snakeKey] = null;
        continue;
      }
    }

    row[snakeKey] = value;
  }

  return row;
}

// Entity types where project_id is NOT NULL in Supabase.
// Items without a valid UUID project_id CANNOT be synced to these tables.
// Derived from supabase/schema.sql — keep in sync with the schema.
export const REQUIRES_PROJECT_ID: Set<SyncEntityType> = new Set([
  'notes',         // field_notes.project_id NOT NULL
  'devices',       // devices.project_id NOT NULL
  'ipPlan',        // ip_plan.project_id NOT NULL
  'dailyReports',  // daily_reports.project_id NOT NULL
  'activityLog',   // activity_log.project_id NOT NULL
  'networkDiagrams', // network_diagrams.project_id NOT NULL
  'pidTuningSessions', // pid_tuning_sessions.project_id NOT NULL
]);
// These tables have project_id nullable: files, commandSnippets,
// pingSessions, terminalLogs, connectionProfiles, registerCalculations

/**
 * Pre-flight check: can this local entity be synced to Supabase?
 * Returns null if syncable, or an error reason string if not.
 */
export function validateSyncable(
  entityType: SyncEntityType,
  localEntity: Record<string, unknown>,
): string | null {
  const id = localEntity.id as string | undefined;
  if (!id || !UUID_RE.test(id)) {
    return `invalid id: ${id ?? 'missing'}`;
  }
  // All entity types with a projectId field must have a valid UUID projectId.
  // This prevents orphaned demo data (non-UUID projectIds like "proj-ahu-upgrade")
  // from being pushed to Supabase where they'd become NULL project_id rows.
  if (REQUIRES_PROJECT_ID.has(entityType)) {
    const projectId = localEntity.projectId as string | undefined;
    if (!projectId || !UUID_RE.test(projectId)) {
      return `invalid projectId: ${projectId ?? 'missing'} (${entityType})`;
    }
  }
  return null; // syncable
}

// ── Pull sync helpers ──────────────────────────────────────────────

// Build reverse lookup: { snake_key → camelKey } per entity type
const REVERSE_OVERRIDES: Partial<Record<SyncEntityType, Record<string, string>>> = {};
for (const [entityType, overrides] of Object.entries(FIELD_OVERRIDES)) {
  const reversed: Record<string, string> = {};
  for (const [camel, snake] of Object.entries(overrides)) {
    reversed[snake] = camel;
  }
  REVERSE_OVERRIDES[entityType as SyncEntityType] = reversed;
}

// Supabase-only columns that don't exist in local IndexedDB entities
const SUPABASE_ONLY_FIELDS = new Set(['user_id', 'sync_version', 'deleted_at']);

/**
 * Converts a Supabase row (snake_case) back to a local IndexedDB entity (camelCase).
 * Inverse of toSupabaseRow(). Used by pull sync.
 */
export function fromSupabaseRow(
  entityType: SyncEntityType,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const reverseMap = REVERSE_OVERRIDES[entityType] ?? {};
  const entity: Record<string, unknown> = {};

  for (const [snakeKey, value] of Object.entries(row)) {
    if (SUPABASE_ONLY_FIELDS.has(snakeKey)) continue;
    const camelKey = reverseMap[snakeKey] ?? toCamelCase(snakeKey);
    entity[camelKey] = value;
  }

  if (entityType === 'activityLog') {
    entity.user = (row.user_id as string) ?? 'User';
  }

  return entity;
}

/** Check if a Supabase row has been soft-deleted */
export function isDeletedRow(row: Record<string, unknown>): boolean {
  return row.deleted_at != null;
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
  'pidTuningSessions',
  'ppclDocuments',
  'bugReports',
];
