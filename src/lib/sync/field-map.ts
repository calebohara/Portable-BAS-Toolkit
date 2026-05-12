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
  reviews: 'user_reviews',
  trendSessions: 'trend_sessions',
  dxrs: 'dxrs',
  // ── Global mirrors ──
  globalProjects: 'global_projects',
  globalNotes: 'global_field_notes',
  globalDevices: 'global_devices',
  globalIpPlan: 'global_ip_plan',
  globalDailyReports: 'global_daily_reports',
  globalActivityLog: 'global_activity_log',
  globalNetworkDiagrams: 'global_network_diagrams',
  globalProjectFiles: 'global_project_files',
  globalPpclDocuments: 'global_ppcl_documents',
  globalTerminalLogs: 'global_terminal_session_logs',
  globalPidTuningSessions: 'global_pid_tuning_sessions',
  globalPsychSessions: 'global_psych_sessions',
  globalRegisterCalculations: 'global_register_calculations',
  globalPingSessions: 'global_ping_sessions',
  globalTrendSessions: 'global_trend_sessions',
  globalConnectionProfiles: 'global_connection_profiles',
  globalFieldPanels: 'global_field_panels',
  globalNotepadEntries: 'global_project_notepad_entries',
  globalProjectPreferences: 'global_project_preferences',
  globalDxrs: 'global_dxrs',
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
  'global_project_id',
  'synced_global_id',
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

// Entity types whose Supabase tables use membership-based RLS (global_*) instead of
// user-ownership RLS. They store global_project_id + created_by/updated_by rather than user_id.
export const GLOBAL_ENTITY_TYPES: Set<SyncEntityType> = new Set([
  'globalProjects', 'globalNotes', 'globalDevices', 'globalIpPlan',
  'globalDailyReports', 'globalActivityLog', 'globalNetworkDiagrams',
  'globalProjectFiles', 'globalPpclDocuments', 'globalTerminalLogs',
  'globalPidTuningSessions', 'globalPsychSessions', 'globalRegisterCalculations',
  'globalPingSessions', 'globalTrendSessions', 'globalConnectionProfiles',
  'globalFieldPanels', 'globalNotepadEntries', 'globalProjectPreferences',
  'globalDxrs',
]);

export function isGlobalEntity(entityType: SyncEntityType): boolean {
  return GLOBAL_ENTITY_TYPES.has(entityType);
}

// Global entity types whose Supabase table has both `created_by` and `updated_by`
// audit columns. The 16 standard global child tables fall in this set.
// Exceptions handled separately:
//   - globalProjects: has created_by only (no updated_by column)
//   - globalActivityLog: append-only log, uses user_id (no created_by/updated_by)
//   - globalProjectPreferences: composite PK on (user_id, global_project_id), no created_by/updated_by
const GLOBAL_AUDITED_ENTITY_TYPES: Set<SyncEntityType> = new Set([
  'globalNotes', 'globalDevices', 'globalIpPlan', 'globalDailyReports',
  'globalNetworkDiagrams', 'globalProjectFiles', 'globalPpclDocuments',
  'globalTerminalLogs', 'globalPidTuningSessions', 'globalPsychSessions',
  'globalRegisterCalculations', 'globalPingSessions', 'globalTrendSessions',
  'globalConnectionProfiles', 'globalFieldPanels', 'globalNotepadEntries',
  'globalDxrs',
]);

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
  psychSessions: {
    projectId: 'project_id',
    unitSystem: 'unit_system',
    inputMode: 'input_mode',
    inputValues: 'input_values',
    comfortResult: 'comfort_result',
    ahuMixedAir: 'ahu_mixed_air',
    ahuCoilLoad: 'ahu_coil_load',
    syncVersion: 'sync_version',
    deletedAt: 'deleted_at',
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
  reviews: {
    displayName: 'display_name',
    appVersion: 'app_version',
    deviceClass: 'device_class',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  trendSessions: {
    projectId: 'project_id',
    sourceSystem: 'source_system',
    anomalyConfig: 'anomaly_config',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  dxrs: {
    projectId: 'project_id',
    deviceInstanceNumber: 'device_instance_number',
    equipmentId: 'equipment_id',
    serialNumber: 'serial_number',
    applicationTemplate: 'application_template',
    applicationNumber: 'application_number',
    autoAddressing: 'auto_addressing',
    macAddress: 'mac_address',
    maxManagerAddress: 'max_manager_address',
    baudRate: 'baud_rate',
    roomHierarchy: 'room_hierarchy',
    roomName: 'room_name',
    roomDescription: 'room_description',
    segmentHierarchy: 'segment_hierarchy',
    segmentName: 'segment_name',
    segmentDescription: 'segment_description',
    msTpNwId: 'ms_tp_nw_id',
    importedFromFileId: 'imported_from_file_id',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },

  // ── Global mirrors ──
  // Global tables use global_project_id + created_by/updated_by (membership RLS).
  // The toSupabaseRow helper stamps created_by/updated_by — don't include them as
  // payload fields here, but DO map them so pull (fromSupabaseRow → REVERSE_OVERRIDES)
  // round-trips snake → camel correctly.
  globalProjects: {
    jobSiteName: 'job_site_name',
    siteAddress: 'site_address',
    buildingArea: 'building_area',
    projectNumber: 'project_number',
    customerName: 'customer_name',
    technicianNotes: 'technician_notes',
    panelRosterSummary: 'panel_roster_summary',
    networkSummary: 'network_summary',
    accessCode: 'access_code',
    createdBy: 'created_by',
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  globalNotes: {
    globalProjectId: 'global_project_id',
    fileId: 'file_id',
    isPinned: 'is_pinned',
    createdBy: 'created_by',
    updatedBy: 'updated_by',
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  globalDevices: {
    globalProjectId: 'global_project_id',
    deviceName: 'device_name',
    controllerType: 'controller_type',
    macAddress: 'mac_address',
    instanceNumber: 'instance_number',
    ipAddress: 'ip_address',
    createdBy: 'created_by',
    updatedBy: 'updated_by',
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  globalIpPlan: {
    globalProjectId: 'global_project_id',
    ipAddress: 'ip_address',
    deviceRole: 'device_role',
    macAddress: 'mac_address',
    createdBy: 'created_by',
    updatedBy: 'updated_by',
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  globalDailyReports: {
    globalProjectId: 'global_project_id',
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
    createdBy: 'created_by',
    updatedBy: 'updated_by',
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  globalActivityLog: {
    // Append-only log. Uses user_id (the actor) not created_by/updated_by.
    globalProjectId: 'global_project_id',
    fileId: 'file_id',
  },
  globalNetworkDiagrams: {
    globalProjectId: 'global_project_id',
    createdBy: 'created_by',
    updatedBy: 'updated_by',
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  globalProjectFiles: {
    globalProjectId: 'global_project_id',
    fileName: 'file_name',
    fileType: 'file_type',
    mimeType: 'mime_type',
    panelSystem: 'panel_system',
    revisionNumber: 'revision_number',
    revisionDate: 'revision_date',
    isPinned: 'is_pinned',
    storagePath: 'storage_path',
    createdBy: 'created_by',
    updatedBy: 'updated_by',
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  globalPpclDocuments: {
    globalProjectId: 'global_project_id',
    createdBy: 'created_by',
    updatedBy: 'updated_by',
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  globalTerminalLogs: {
    globalProjectId: 'global_project_id',
    sessionLabel: 'session_label',
    connectionMode: 'connection_mode',
    serialPort: 'serial_port',
    baudRate: 'baud_rate',
    lineCount: 'line_count',
    logContent: 'log_content',
    startedAt: 'started_at',
    endedAt: 'ended_at',
    createdBy: 'created_by',
    updatedBy: 'updated_by',
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  globalPidTuningSessions: {
    globalProjectId: 'global_project_id',
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
    createdBy: 'created_by',
    updatedBy: 'updated_by',
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  globalPsychSessions: {
    globalProjectId: 'global_project_id',
    unitSystem: 'unit_system',
    inputMode: 'input_mode',
    inputValues: 'input_values',
    comfortResult: 'comfort_result',
    ahuMixedAir: 'ahu_mixed_air',
    ahuCoilLoad: 'ahu_coil_load',
    createdBy: 'created_by',
    updatedBy: 'updated_by',
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  globalRegisterCalculations: {
    globalProjectId: 'global_project_id',
    createdBy: 'created_by',
    updatedBy: 'updated_by',
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  globalPingSessions: {
    globalProjectId: 'global_project_id',
    intervalMs: 'interval_ms',
    completedAt: 'completed_at',
    createdBy: 'created_by',
    updatedBy: 'updated_by',
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  globalTrendSessions: {
    globalProjectId: 'global_project_id',
    sourceSystem: 'source_system',
    anomalyConfig: 'anomaly_config',
    createdBy: 'created_by',
    updatedBy: 'updated_by',
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  globalConnectionProfiles: {
    globalProjectId: 'global_project_id',
    connectionType: 'connection_type',
    serialPort: 'serial_port',
    baudRate: 'baud_rate',
    dataBits: 'data_bits',
    stopBits: 'stop_bits',
    flowControl: 'flow_control',
    localEcho: 'local_echo',
    lineEnding: 'line_ending',
    isFavorite: 'is_favorite',
    lastConnectedAt: 'last_connected_at',
    createdBy: 'created_by',
    updatedBy: 'updated_by',
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  globalFieldPanels: {
    globalProjectId: 'global_project_id',
    controllerFamily: 'controller_family',
    ipAddress: 'ip_address',
    subnetMask: 'subnet_mask',
    bacnetInstance: 'bacnet_instance',
    macAddress: 'mac_address',
    networkType: 'network_type',
    firmwareVersion: 'firmware_version',
    applicationVersion: 'application_version',
    panelStatus: 'panel_status',
    webUiUrl: 'web_ui_url',
    secureWebUiUrl: 'secure_web_ui_url',
    lastSeenAt: 'last_seen_at',
    lastBackupAt: 'last_backup_at',
    lastCommissionedAt: 'last_commissioned_at',
    assignedTechnician: 'assigned_technician',
    linkedFiles: 'linked_files',
    relatedTools: 'related_tools',
    createdBy: 'created_by',
    updatedBy: 'updated_by',
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  globalNotepadEntries: {
    globalProjectId: 'global_project_id',
    linkedTabId: 'linked_tab_id',
    createdBy: 'created_by',
    updatedBy: 'updated_by',
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  globalProjectPreferences: {
    // Composite PK (user_id, global_project_id). No created_by/updated_by.
    userId: 'user_id',
    globalProjectId: 'global_project_id',
    isPinned: 'is_pinned',
    isOfflineAvailable: 'is_offline_available',
    lastViewedTab: 'last_viewed_tab',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  globalDxrs: {
    globalProjectId: 'global_project_id',
    deviceInstanceNumber: 'device_instance_number',
    equipmentId: 'equipment_id',
    serialNumber: 'serial_number',
    applicationTemplate: 'application_template',
    applicationNumber: 'application_number',
    autoAddressing: 'auto_addressing',
    macAddress: 'mac_address',
    maxManagerAddress: 'max_manager_address',
    baudRate: 'baud_rate',
    roomHierarchy: 'room_hierarchy',
    roomName: 'room_name',
    roomDescription: 'room_description',
    segmentHierarchy: 'segment_hierarchy',
    segmentName: 'segment_name',
    segmentDescription: 'segment_description',
    msTpNwId: 'ms_tp_nw_id',
    importedFromFileId: 'imported_from_file_id',
    createdBy: 'created_by',
    updatedBy: 'updated_by',
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
};

/**
 * Converts a local IndexedDB entity to a Supabase-compatible row.
 * Adds user_id (local) or created_by/updated_by (global membership-RLS entities),
 * converts camelCase fields to snake_case, and strips local-only fields.
 *
 * The optional `options.isUpdate` flag controls created_by stamping for
 * globally-audited entities: on update we leave created_by alone (it's
 * immutable after insert) and only stamp updated_by.
 */
export function toSupabaseRow(
  entityType: SyncEntityType,
  localEntity: Record<string, unknown>,
  userId: string,
  options?: { isUpdate?: boolean },
): Record<string, unknown> {
  const overrides = FIELD_OVERRIDES[entityType] ?? {};
  const skipFields = SKIP_FIELDS[entityType];
  const isGlobal = isGlobalEntity(entityType);
  const row: Record<string, unknown> = {};

  if (isGlobal) {
    if (entityType === 'globalProjects') {
      // global_projects has created_by only (no updated_by column).
      if (!options?.isUpdate) row.created_by = userId;
    } else if (entityType === 'globalActivityLog') {
      // global_activity_log is append-only and uses user_id (the actor).
      row.user_id = userId;
    } else if (entityType === 'globalProjectPreferences') {
      // Composite PK (user_id, global_project_id) — stamp user_id here.
      row.user_id = userId;
    } else if (GLOBAL_AUDITED_ENTITY_TYPES.has(entityType)) {
      // Standard global child tables: created_by on insert, updated_by always.
      if (!options?.isUpdate) row.created_by = userId;
      row.updated_by = userId;
    }
  } else {
    row.user_id = userId;
  }

  for (const [key, value] of Object.entries(localEntity)) {
    // Strip globally local-only fields
    if (LOCAL_ONLY_FIELDS.has(key)) continue;
    // Strip entity-specific fields that don't exist in Supabase
    if (skipFields?.has(key)) continue;
    // Skip undefined values entirely (don't send to Supabase)
    if (value === undefined) continue;

    // For globally-audited entities, don't let the payload override the
    // created_by / updated_by stamps we just set above. (For globalActivityLog
    // and globalProjectPreferences the payload's `userId` is fine because
    // the override maps it to `user_id` — same column we stamped.)
    if (isGlobal && GLOBAL_AUDITED_ENTITY_TYPES.has(entityType) && (key === 'createdBy' || key === 'updatedBy')) {
      continue;
    }
    if (entityType === 'globalProjects' && key === 'createdBy') {
      continue;
    }

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
  'psychSessions',     // psych_sessions.project_id NOT NULL
  'dxrs',          // dxrs.project_id NOT NULL
]);
// These tables have project_id nullable: files, commandSnippets,
// pingSessions, terminalLogs, connectionProfiles, registerCalculations

// Global entity types where global_project_id is NOT NULL in Supabase.
// All global child tables enforce this — the membership RLS predicate
// `is_global_project_member(global_project_id)` cannot evaluate against NULL.
// Exceptions: `globalProjects` is the parent (no parent FK) and
// `globalProjectPreferences` has its own composite PK that already includes
// global_project_id (validated structurally).
export const REQUIRES_GLOBAL_PROJECT_ID: Set<SyncEntityType> = new Set([
  'globalNotes', 'globalDevices', 'globalIpPlan', 'globalDailyReports',
  'globalActivityLog', 'globalNetworkDiagrams', 'globalProjectFiles',
  'globalPpclDocuments', 'globalTerminalLogs', 'globalPidTuningSessions',
  'globalPsychSessions', 'globalRegisterCalculations', 'globalPingSessions',
  'globalTrendSessions', 'globalConnectionProfiles', 'globalFieldPanels',
  'globalNotepadEntries', 'globalDxrs',
]);

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
  // Global entities: enforce the parallel invariant for global_project_id.
  if (REQUIRES_GLOBAL_PROJECT_ID.has(entityType)) {
    const gpid = localEntity.globalProjectId as string | undefined;
    if (!gpid || !UUID_RE.test(gpid)) {
      return `invalid globalProjectId: ${gpid ?? 'missing'} (${entityType})`;
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

// Global entities whose TS interface keeps the `userId` field (i.e. user_id is
// semantic payload, not a stripped-on-pull ownership column). For these,
// `user_id` is reverse-mapped to `userId` and surfaced on the local entity.
const KEEPS_USER_ID: Set<SyncEntityType> = new Set([
  'globalActivityLog',         // GlobalActivityLogEntry.userId (the actor)
  'globalProjectPreferences',  // GlobalProjectPreferences.userId (composite PK)
]);

// Per-entity null → '' coercion for nullable SQL timestamp/text columns whose
// local TS type is a required `string`. Wave 1 flagged these; this keeps
// fromSupabaseRow's output assignable to the local interface without TS errors.
const NULL_TO_EMPTY_STRING: Partial<Record<SyncEntityType, Set<string>>> = {
  globalTerminalLogs: new Set(['startedAt', 'endedAt']),
  globalConnectionProfiles: new Set(['lastConnectedAt']),
};

/**
 * Converts a Supabase row (snake_case) back to a local IndexedDB entity (camelCase).
 * Inverse of toSupabaseRow(). Used by pull sync.
 */
export function fromSupabaseRow(
  entityType: SyncEntityType,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const reverseMap = REVERSE_OVERRIDES[entityType] ?? {};
  const keepsUserId = KEEPS_USER_ID.has(entityType);
  const entity: Record<string, unknown> = {};

  for (const [snakeKey, value] of Object.entries(row)) {
    // For local entities and most global ones, user_id is a Supabase-only RLS
    // column. For globalActivityLog / globalProjectPreferences it's semantic
    // payload that the TS interface exposes as `userId`.
    if (snakeKey === 'user_id' && !keepsUserId) continue;
    if (snakeKey === 'sync_version' || snakeKey === 'deleted_at') continue;
    const camelKey = reverseMap[snakeKey] ?? toCamelCase(snakeKey);
    entity[camelKey] = value;
  }

  if (entityType === 'activityLog') {
    entity.user = (row.user_id as string) ?? 'User';
  }

  // Coerce nullable SQL columns to '' for entities whose TS type requires string.
  const coercions = NULL_TO_EMPTY_STRING[entityType];
  if (coercions) {
    for (const field of coercions) {
      if (entity[field] === null) entity[field] = '';
    }
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
  'psychSessions',
  'bugReports',
  'reviews',
  'trendSessions',
  'dxrs',
  // ── Global mirrors — parents before children ──
  // globalProjects must come before any global child (FK constraint).
  // globalProjectPreferences references auth.users + global_projects and is
  // per-user state — push it last so the parent row exists by then.
  'globalProjects',
  'globalNotes',
  'globalDevices',
  'globalIpPlan',
  'globalDailyReports',
  'globalActivityLog',
  'globalNetworkDiagrams',
  'globalProjectFiles',
  'globalPpclDocuments',
  'globalTerminalLogs',
  'globalPidTuningSessions',
  'globalPsychSessions',
  'globalRegisterCalculations',
  'globalPingSessions',
  'globalTrendSessions',
  'globalConnectionProfiles',
  'globalFieldPanels',
  'globalNotepadEntries',
  'globalProjectPreferences',
  'globalDxrs',
];
