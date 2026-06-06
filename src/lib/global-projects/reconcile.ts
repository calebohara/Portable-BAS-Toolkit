/**
 * reconcile.ts — Idempotent, ID-stable, lossless bridge between local Projects
 * and Global Projects.
 *
 * Replaces the old `migrate.ts` (which did a one-shot copy with fresh UUIDs and
 * silently dropped many fields/entity types).
 *
 * Key invariants:
 *   1. ID-stable — UUIDs are preserved across the bridge in BOTH directions.
 *      A local row's UUID becomes the global row's UUID and vice versa, so a
 *      second reconcile in either direction updates rows in place instead of
 *      duplicating them.
 *   2. Idempotent — every write is an `upsert(row, { onConflict: 'id' })`
 *      (or composite-key conflict for preferences). Re-running on unchanged
 *      data is a no-op against the destination.
 *   3. Project identity via `synced_global_id` — a local project remembers
 *      which global project it was shared to / loaded from. Subsequent
 *      reconciles upsert into that global project rather than creating a new
 *      one with a fresh access code.
 *   4. Lossless field mapping — every parity field on `GlobalProject`
 *      (customerName, technicianNotes, panelRosterSummary, networkSummary,
 *      contacts, jobSiteName, description) round-trips on its own column.
 *   5. Author fields preserved — `FieldNote.author` round-trips through
 *      `created_by` audit on `global_field_notes`.
 *   6. Activity log not duplicated — instead of copying every existing
 *      activity entry, reconcile appends ONE new entry on the destination
 *      describing what changed.
 *   7. Files use Supabase Storage — local blobs are uploaded via
 *      `uploadBlobToStorage`; metadata-only entries (no blob) are still
 *      mirrored with `storagePath: null`.
 *
 * Wave 3b — Type & Sync Bridge Engineer.
 */

import { v4 as uuid } from 'uuid';

import * as db from '@/lib/db';
import { logGlobalActivity } from '@/lib/global-projects/api';
import { buildStoragePath, downloadFromStorage, uploadBlobToStorage } from '@/lib/storage';
import { getSupabaseClient } from '@/lib/supabase/client';

import type {
  DailyReport,
  DeviceEntry,
  DxrEntry,
  FieldNote,
  IpPlanEntry,
  NetworkDiagram,
  PidTuningSession,
  PingSession,
  PpclDocument,
  Project,
  ProjectFile,
  PsychSession,
  ReportAttachment,
  SavedCalculation,
  TerminalSessionLog,
  TrendSession,
  ConnectionProfile,
} from '@/types';
import type {
  GlobalConnectionProfile,
  GlobalDailyReport,
  GlobalDevice,
  GlobalDxrEntry,
  GlobalFieldNote,
  GlobalIpPlanEntry,
  GlobalNetworkDiagram,
  GlobalPidTuningSession,
  GlobalPingSession,
  GlobalPpclDocument,
  GlobalProject,
  GlobalProjectFile,
  GlobalProjectStatus,
  GlobalPsychSession,
  GlobalRegisterCalculation,
  GlobalReportAttachment,
  GlobalTerminalSessionLog,
  GlobalTrendSession,
} from '@/types/global-projects';

// ─── Public types ───────────────────────────────────────────────────────────

export type ProgressFn = (step: string, current: number, total: number) => void;

/** Per-entity-pair counters returned by reconcile. */
export interface EntityReconcileCounts {
  pushed: number;
  pulled: number;
  skipped: number;
  failed: number;
}

export interface ReconcileResult {
  direction: 'local-to-global' | 'global-to-local';
  localProjectId: string;
  globalProjectId: string;
  /** Set only when a NEW global project was created during local→global. */
  accessCode?: string;
  /** True when the destination side did not exist before this reconcile. */
  isNewProject: boolean;
  counts: Record<string, EntityReconcileCounts>;
}

// ─── Entity-pair registry ───────────────────────────────────────────────────

/**
 * The set of entity types that have BOTH a local IndexedDB store and a global
 * Supabase mirror. Drives the loop below.
 *
 * Excluded by design (not in this set):
 *   - bugReports / reviews / commandSnippets — user-personal, no global twin.
 *   - globalMessages — global-only (no local twin).
 *   - globalProjectPreferences — per-user UI state (pin / offline-cache);
 *     handled by the per-user preference toggles, not data mirroring.
 *   - globalFieldPanels — no local TS `FieldPanel` interface exists yet
 *     (the local `fieldPanels` IndexedDB store is typed loosely with `any`
 *     and isn't in the `SyncEntityType` union for the LOCAL side). Flag and
 *     skip rather than invent a half-baked mapping here.
 *   - globalNotepadEntries — same situation; no local TS interface yet.
 *   - globalActivityLog — handled specially (one new reconciled entry,
 *     not row-for-row copy).
 *
 * @internal exported for visibility / test reference.
 */
export const RECONCILED_ENTITY_PAIRS = [
  { key: 'notes',                local: 'notes' as const,                global: 'globalNotes' as const },
  { key: 'devices',              local: 'devices' as const,              global: 'globalDevices' as const },
  { key: 'ipPlan',               local: 'ipPlan' as const,               global: 'globalIpPlan' as const },
  { key: 'dailyReports',         local: 'dailyReports' as const,         global: 'globalDailyReports' as const },
  { key: 'networkDiagrams',      local: 'networkDiagrams' as const,      global: 'globalNetworkDiagrams' as const },
  { key: 'files',                local: 'files' as const,                global: 'globalProjectFiles' as const },
  { key: 'ppclDocuments',        local: 'ppclDocuments' as const,        global: 'globalPpclDocuments' as const },
  { key: 'terminalLogs',         local: 'terminalLogs' as const,         global: 'globalTerminalLogs' as const },
  { key: 'pidTuningSessions',    local: 'pidTuningSessions' as const,    global: 'globalPidTuningSessions' as const },
  { key: 'psychSessions',        local: 'psychSessions' as const,        global: 'globalPsychSessions' as const },
  { key: 'registerCalculations', local: 'registerCalculations' as const, global: 'globalRegisterCalculations' as const },
  { key: 'pingSessions',         local: 'pingSessions' as const,         global: 'globalPingSessions' as const },
  { key: 'trendSessions',        local: 'trendSessions' as const,        global: 'globalTrendSessions' as const },
  { key: 'connectionProfiles',   local: 'connectionProfiles' as const,   global: 'globalConnectionProfiles' as const },
  { key: 'dxrs',                 local: 'dxrs' as const,                 global: 'globalDxrs' as const },
] as const;

export type ReconciledEntityKey = (typeof RECONCILED_ENTITY_PAIRS)[number]['key'];

// ─── Helpers ────────────────────────────────────────────────────────────────

const VALID_GLOBAL_STATUSES: GlobalProjectStatus[] = ['active', 'on-hold', 'completed', 'archived'];
const VALID_LOCAL_STATUSES: Project['status'][] = ['active', 'on-hold', 'completed', 'archived'];

function emptyCounts(): EntityReconcileCounts {
  return { pushed: 0, pulled: 0, skipped: 0, failed: 0 };
}

function client() {
  const c = getSupabaseClient();
  if (!c) throw new Error('Supabase is not configured');
  return c;
}

async function currentUserId(): Promise<string> {
  const { data: { user } } = await client().auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Normalize an incoming status value to the destination enum or fall back. */
function coerceGlobalStatus(s: string | undefined): GlobalProjectStatus {
  return VALID_GLOBAL_STATUSES.includes(s as GlobalProjectStatus)
    ? (s as GlobalProjectStatus)
    : 'active';
}

function coerceLocalStatus(s: string | undefined): Project['status'] {
  return VALID_LOCAL_STATUSES.includes(s as Project['status'])
    ? (s as Project['status'])
    : 'active';
}

/** Access-code generator — mirror of `api.ts`'s private helper. */
function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(7);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < 3; i++) code += chars[bytes[i] % chars.length];
  code += '-';
  for (let i = 3; i < 7; i++) code += chars[bytes[i] % chars.length];
  return code;
}

async function nextAccessCode(): Promise<string> {
  try {
    const { data, error } = await client().rpc('generate_global_access_code');
    if (!error && typeof data === 'string' && data.length > 0) return data;
  } catch {
    // fall through to client-side generation
  }
  return generateAccessCode();
}

/** camelCase helper. */
function camel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => (c as string).toUpperCase());
}

function camelKeysShallow<T>(obj: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[camel(k)] = v;
  return out as T;
}

// ─── Generic upsert helpers ──────────────────────────────────────────────────

async function upsertGlobalRow(
  table: string,
  row: Record<string, unknown>,
): Promise<void> {
  const { error } = await client().from(table).upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`${table} upsert failed: ${error.message}`);
}

// ─── Local → Global field mappers ───────────────────────────────────────────
// Each mapper takes a local entity + globalProjectId + actor userId and
// returns the snake_case row to upsert. ID is preserved.

function mapLocalNoteToRow(n: FieldNote, globalProjectId: string, userId: string, isUpdate: boolean): Record<string, unknown> {
  return {
    id: n.id,
    global_project_id: globalProjectId,
    ...(isUpdate ? {} : { created_by: userId }),
    updated_by: userId,
    file_id: n.fileId && n.fileId.length > 0 ? n.fileId : null,
    content: n.content,
    category: n.category,
    is_pinned: n.isPinned,
    tags: n.tags,
    created_at: n.createdAt,
    updated_at: n.updatedAt,
  };
}

function mapLocalDeviceToRow(d: DeviceEntry, globalProjectId: string, userId: string, isUpdate: boolean): Record<string, unknown> {
  return {
    id: d.id,
    global_project_id: globalProjectId,
    ...(isUpdate ? {} : { created_by: userId }),
    updated_by: userId,
    device_name: d.deviceName,
    description: d.description,
    system: d.system,
    panel: d.panel,
    controller_type: d.controllerType,
    mac_address: d.macAddress ?? null,
    instance_number: d.instanceNumber ?? null,
    ip_address: d.ipAddress ?? null,
    floor: d.floor,
    area: d.area,
    status: d.status,
    notes: d.notes,
    created_at: d.createdAt ?? nowIso(),
    updated_at: d.updatedAt ?? nowIso(),
  };
}

function mapLocalIpEntryToRow(e: IpPlanEntry, globalProjectId: string, userId: string, isUpdate: boolean): Record<string, unknown> {
  return {
    id: e.id,
    global_project_id: globalProjectId,
    ...(isUpdate ? {} : { created_by: userId }),
    updated_by: userId,
    ip_address: e.ipAddress,
    hostname: e.hostname,
    panel: e.panel,
    vlan: e.vlan,
    subnet: e.subnet,
    device_role: e.deviceRole,
    mac_address: e.macAddress ?? null,
    notes: e.notes,
    status: e.status,
    created_at: e.createdAt ?? nowIso(),
    updated_at: e.updatedAt ?? nowIso(),
  };
}

/**
 * Convert local report attachments (with `blobKey` pointing into IndexedDB)
 * into global report attachments (with `storagePath` pointing into Supabase
 * Storage). Uploads each blob; if the blob is missing or upload fails the
 * metadata is still preserved but `storagePath` is null.
 */
async function mapAttachmentsLocalToGlobal(
  globalProjectId: string,
  report: DailyReport,
): Promise<GlobalReportAttachment[]> {
  const out: GlobalReportAttachment[] = [];
  for (const att of report.attachments ?? []) {
    try {
      const blob = await db.getFileBlob(att.blobKey);
      if (!blob) {
        out.push({ id: att.id, fileName: att.fileName, fileType: att.fileType, mimeType: att.mimeType, size: att.size, storagePath: null });
        continue;
      }
      const path = buildStoragePath(globalProjectId, att.fileName, 'reports');
      await uploadBlobToStorage(blob, path, att.mimeType);
      out.push({ id: att.id, fileName: att.fileName, fileType: att.fileType, mimeType: att.mimeType, size: att.size, storagePath: path });
    } catch (e) {
      console.warn('[reconcile] attachment upload failed (best-effort):', e);
      out.push({ id: att.id, fileName: att.fileName, fileType: att.fileType, mimeType: att.mimeType, size: att.size, storagePath: null });
    }
  }
  return out;
}

async function mapLocalReportToRow(
  r: DailyReport,
  globalProjectId: string,
  userId: string,
  isUpdate: boolean,
): Promise<Record<string, unknown>> {
  const attachments = await mapAttachmentsLocalToGlobal(globalProjectId, r);
  return {
    id: r.id,
    global_project_id: globalProjectId,
    ...(isUpdate ? {} : { created_by: userId }),
    updated_by: userId,
    date: r.date,
    report_number: r.reportNumber,
    technician_name: r.technicianName,
    status: r.status,
    start_time: r.startTime,
    end_time: r.endTime,
    hours_on_site: r.hoursOnSite,
    location: r.location,
    weather: r.weather,
    work_completed: r.workCompleted,
    issues_encountered: r.issuesEncountered,
    work_planned_next: r.workPlannedNext,
    coordination_notes: r.coordinationNotes,
    equipment_worked_on: r.equipmentWorkedOn,
    device_ip_changes: r.deviceIpChanges,
    safety_notes: r.safetyNotes,
    general_notes: r.generalNotes,
    attachments,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

function mapLocalDiagramToRow(d: NetworkDiagram, globalProjectId: string, userId: string, isUpdate: boolean): Record<string, unknown> {
  return {
    id: d.id,
    global_project_id: globalProjectId,
    ...(isUpdate ? {} : { created_by: userId }),
    updated_by: userId,
    name: d.name,
    description: d.description,
    nodes: d.nodes,
    connections: d.connections,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

/**
 * Uploads the current-version blob of a local file (if available) and returns
 * the storage path, or `null` if no blob is on hand.
 */
async function uploadFileBlob(file: ProjectFile, globalProjectId: string): Promise<string | null> {
  const current = file.versions.find((v) => v.id === file.currentVersionId) ?? file.versions[0];
  const blobKey = current?.blobKey;
  if (!blobKey) return null;
  try {
    const blob = await db.getFileBlob(blobKey);
    if (!blob) return null;
    const path = buildStoragePath(globalProjectId, file.fileName, 'files');
    await uploadBlobToStorage(blob, path, file.mimeType);
    return path;
  } catch (e) {
    console.warn('[reconcile] file blob upload failed (best-effort):', e);
    return null;
  }
}

// TODO(Platform/db.ts): global file delete soft-deletes the row but does NOT
// clear `storage_path`, while `cascadeDeleteGlobalProject` (`db.ts:761-779`)
// deletes the local file row outright. A future "undelete from a soft-deleted
// server row" flow would therefore be orphaned locally. Deferred to the Platform
// owner of `src/lib/db.ts` until the soft-delete recovery UX is built — this
// reconcile-side mapper intentionally preserves the existing `storage_path`.
async function mapLocalFileToRow(
  f: ProjectFile,
  globalProjectId: string,
  userId: string,
  isUpdate: boolean,
  existingStoragePath: string | null,
): Promise<Record<string, unknown>> {
  // Re-upload the blob only if the destination doesn't have one yet.
  // (We compare metadata only — proper change detection by content hash is
  // a Step-4+ improvement.)
  const storagePath = existingStoragePath ?? (await uploadFileBlob(f, globalProjectId));
  return {
    id: f.id,
    global_project_id: globalProjectId,
    ...(isUpdate ? {} : { created_by: userId }),
    updated_by: userId,
    title: f.title,
    file_name: f.fileName,
    file_type: f.fileType,
    mime_type: f.mimeType,
    category: f.category,
    panel_system: f.panelSystem ?? null,
    revision_number: f.revisionNumber,
    revision_date: f.revisionDate,
    notes: f.notes,
    tags: f.tags,
    status: f.status,
    is_pinned: f.isPinned,
    size: f.size,
    storage_path: storagePath,
    versions: f.versions,
    created_at: f.createdAt,
    updated_at: f.updatedAt,
  };
}

function mapLocalPpclToRow(p: PpclDocument, globalProjectId: string, userId: string, isUpdate: boolean): Record<string, unknown> {
  return {
    id: p.id,
    global_project_id: globalProjectId,
    ...(isUpdate ? {} : { created_by: userId }),
    updated_by: userId,
    name: p.name,
    content: p.content,
    firmware: p.firmware,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

function mapLocalTerminalLogToRow(l: TerminalSessionLog, globalProjectId: string, userId: string, isUpdate: boolean): Record<string, unknown> {
  return {
    id: l.id,
    global_project_id: globalProjectId,
    ...(isUpdate ? {} : { created_by: userId }),
    updated_by: userId,
    session_label: l.sessionLabel,
    connection_mode: l.connectionMode,
    host: l.host,
    port: l.port,
    serial_port: l.serialPort,
    baud_rate: l.baudRate,
    line_count: l.lineCount,
    log_content: l.logContent,
    started_at: l.startedAt,
    ended_at: l.endedAt,
    created_at: l.createdAt,
    updated_at: l.createdAt, // local schema has no updatedAt
  };
}

function mapLocalPidToRow(s: PidTuningSession, globalProjectId: string, userId: string, isUpdate: boolean): Record<string, unknown> {
  return {
    id: s.id,
    global_project_id: globalProjectId,
    ...(isUpdate ? {} : { created_by: userId }),
    updated_by: userId,
    loop_name: s.loopName,
    equipment: s.equipment,
    loop_type: s.loopType,
    controlled_variable: s.controlledVariable,
    output_type: s.outputType,
    actuator_stroke_time: s.actuatorStrokeTime,
    action: s.action,
    control_mode: s.controlMode,
    current_values: s.currentValues,
    recommended_values: s.recommendedValues,
    symptoms: s.symptoms,
    response_data: s.responseData,
    field_notes: s.fieldNotes,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

function mapLocalPsychToRow(s: PsychSession, globalProjectId: string, userId: string, isUpdate: boolean): Record<string, unknown> {
  return {
    id: s.id,
    global_project_id: globalProjectId,
    ...(isUpdate ? {} : { created_by: userId }),
    updated_by: userId,
    label: s.label,
    unit_system: s.unitSystem,
    altitude: s.altitude,
    input_mode: s.inputMode,
    input_values: s.inputValues,
    results: s.results,
    comfort_result: s.comfortResult,
    ahu_mixed_air: s.ahuMixedAir ?? null,
    ahu_coil_load: s.ahuCoilLoad ?? null,
    notes: s.notes,
    tags: s.tags,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

function mapLocalRegisterCalcToRow(c: SavedCalculation, globalProjectId: string, userId: string, isUpdate: boolean): Record<string, unknown> {
  return {
    id: c.id,
    global_project_id: globalProjectId,
    ...(isUpdate ? {} : { created_by: userId }),
    updated_by: userId,
    label: c.label,
    module: c.module,
    category: c.category,
    inputs: c.inputs,
    result: c.result,
    notes: c.notes,
    tags: c.tags,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

function mapLocalPingToRow(p: PingSession, globalProjectId: string, userId: string, isUpdate: boolean): Record<string, unknown> {
  return {
    id: p.id,
    global_project_id: globalProjectId,
    ...(isUpdate ? {} : { created_by: userId }),
    updated_by: userId,
    targets: p.targets,
    results: p.results,
    mode: p.mode,
    interval_ms: p.intervalMs,
    completed_at: p.completedAt ?? null,
    created_at: p.createdAt,
    // PingSession has no updatedAt locally — use createdAt as a stand-in.
    updated_at: p.createdAt,
  };
}

function mapLocalTrendToRow(t: TrendSession, globalProjectId: string, userId: string, isUpdate: boolean): Record<string, unknown> {
  return {
    id: t.id,
    global_project_id: globalProjectId,
    ...(isUpdate ? {} : { created_by: userId }),
    updated_by: userId,
    name: t.name,
    description: t.description,
    source_system: t.sourceSystem,
    series: t.series,
    data: t.data,
    anomalies: t.anomalies,
    anomaly_config: t.anomalyConfig,
    stats: t.stats,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  };
}

function mapLocalDxrToRow(d: DxrEntry, globalProjectId: string, userId: string, isUpdate: boolean): Record<string, unknown> {
  return {
    id: d.id,
    global_project_id: globalProjectId,
    ...(isUpdate ? {} : { created_by: userId }),
    updated_by: userId,
    name: d.name,
    location: d.location,
    description: d.description,
    device_instance_number: d.deviceInstanceNumber,
    equipment_id: d.equipmentId,
    serial_number: d.serialNumber,
    application_template: d.applicationTemplate,
    application_number: d.applicationNumber,
    network: d.network,
    auto_addressing: d.autoAddressing,
    mac_address: d.macAddress,
    max_manager_address: d.maxManagerAddress,
    baud_rate: d.baudRate,
    room_hierarchy: d.roomHierarchy,
    room_name: d.roomName,
    room_description: d.roomDescription,
    segment_hierarchy: d.segmentHierarchy,
    segment_name: d.segmentName,
    segment_description: d.segmentDescription,
    ms_tp_nw_id: d.msTpNwId,
    guid: d.guid,
    imported_from_file_id: d.importedFromFileId ?? null,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

function mapLocalConnProfileToRow(p: ConnectionProfile, globalProjectId: string, userId: string, isUpdate: boolean): Record<string, unknown> {
  return {
    id: p.id,
    global_project_id: globalProjectId,
    ...(isUpdate ? {} : { created_by: userId }),
    updated_by: userId,
    name: p.name,
    connection_type: p.connectionType,
    serial_port: p.serialPort,
    baud_rate: p.baudRate,
    data_bits: p.dataBits,
    parity: p.parity,
    stop_bits: p.stopBits,
    flow_control: p.flowControl,
    host: p.host,
    port: p.port,
    local_echo: p.localEcho,
    line_ending: p.lineEnding,
    logging: p.logging,
    notes: p.notes,
    is_favorite: p.isFavorite,
    tags: p.tags,
    last_connected_at: p.lastConnectedAt,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

// ─── Global → Local field mappers (inverse of the above) ────────────────────

/**
 * Resolve a human display-name `author` for a note coming back from the global
 * side. `FieldNote.author` is a free-text DISPLAY NAME used for UI + filtering
 * (field-notes-view.tsx) — it must NEVER be a raw Supabase UUID.
 *
 * Resolution order (first non-empty wins):
 *   1. The existing local note's `author` (preserves the human name the user
 *      originally typed; the round-trip must not clobber it).
 *   2. A `created_by` UUID → profile display-name lookup (for notes created on
 *      another device that never had a local row here).
 *   3. "Unknown" — a user-friendly fallback, rather than exposing a UUID.
 */
function resolveNoteAuthor(
  n: GlobalFieldNote,
  existingAuthor: string | undefined,
  displayNameByUserId?: Map<string, string>,
): string {
  if (existingAuthor && existingAuthor.trim().length > 0) return existingAuthor;
  const resolved = n.createdBy ? displayNameByUserId?.get(n.createdBy) : undefined;
  if (resolved && resolved.trim().length > 0) return resolved;
  return 'Unknown';
}

function mapGlobalNoteToLocal(
  n: GlobalFieldNote,
  projectId: string,
  existingAuthor?: string,
  displayNameByUserId?: Map<string, string>,
): FieldNote {
  return {
    id: n.id,
    projectId,
    fileId: n.fileId ?? undefined,
    content: n.content,
    category: n.category,
    // DISPLAY NAME — never the raw `created_by` UUID. See resolveNoteAuthor.
    author: resolveNoteAuthor(n, existingAuthor, displayNameByUserId),
    isPinned: n.isPinned,
    tags: n.tags ?? [],
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

function mapGlobalDeviceToLocal(d: GlobalDevice, projectId: string): DeviceEntry {
  return {
    id: d.id,
    projectId,
    deviceName: d.deviceName,
    description: d.description ?? '',
    system: d.system ?? '',
    panel: d.panel ?? '',
    controllerType: d.controllerType ?? '',
    macAddress: d.macAddress ?? undefined,
    instanceNumber: d.instanceNumber ?? undefined,
    ipAddress: d.ipAddress ?? undefined,
    floor: d.floor ?? '',
    area: d.area ?? '',
    status: d.status,
    notes: d.notes ?? '',
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function mapGlobalIpEntryToLocal(e: GlobalIpPlanEntry, projectId: string): IpPlanEntry {
  return {
    id: e.id,
    projectId,
    ipAddress: e.ipAddress ?? '',
    hostname: e.hostname ?? '',
    panel: e.panel ?? '',
    vlan: e.vlan ?? '',
    subnet: e.subnet ?? '',
    deviceRole: e.deviceRole ?? '',
    macAddress: e.macAddress ?? undefined,
    notes: e.notes ?? '',
    status: e.status,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

/** Convert global attachments (storagePath) back to local (blobKey). */
async function mapAttachmentsGlobalToLocal(report: GlobalDailyReport): Promise<ReportAttachment[]> {
  const out: ReportAttachment[] = [];
  for (const att of report.attachments ?? []) {
    try {
      if (!att.storagePath) {
        // Metadata-only — preserve the row with a fresh blob key but no blob.
        out.push({ id: att.id, fileName: att.fileName, fileType: att.fileType, mimeType: att.mimeType, size: att.size, blobKey: uuid() });
        continue;
      }
      const blob = await downloadFromStorage(att.storagePath);
      const blobKey = uuid();
      await db.saveFileBlob(blobKey, blob);
      out.push({ id: att.id, fileName: att.fileName, fileType: att.fileType, mimeType: att.mimeType, size: att.size, blobKey });
    } catch (e) {
      console.warn('[reconcile] attachment download failed (best-effort):', e);
      // Skip silently — don't poison the report with a blobKey we never wrote.
    }
  }
  return out;
}

async function mapGlobalReportToLocal(r: GlobalDailyReport, projectId: string): Promise<DailyReport> {
  return {
    id: r.id,
    projectId,
    date: r.date,
    reportNumber: r.reportNumber,
    technicianName: r.technicianName ?? '',
    status: r.status,
    startTime: r.startTime ?? '',
    endTime: r.endTime ?? '',
    hoursOnSite: r.hoursOnSite ?? '',
    location: r.location ?? '',
    weather: r.weather ?? '',
    workCompleted: r.workCompleted ?? '',
    issuesEncountered: r.issuesEncountered ?? '',
    workPlannedNext: r.workPlannedNext ?? '',
    coordinationNotes: r.coordinationNotes ?? '',
    equipmentWorkedOn: r.equipmentWorkedOn ?? '',
    deviceIpChanges: r.deviceIpChanges ?? '',
    safetyNotes: r.safetyNotes ?? '',
    generalNotes: r.generalNotes ?? '',
    attachments: await mapAttachmentsGlobalToLocal(r),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function mapGlobalDiagramToLocal(d: GlobalNetworkDiagram, projectId: string): NetworkDiagram {
  return {
    id: d.id,
    projectId,
    name: d.name,
    description: d.description ?? '',
    nodes: (d.nodes ?? []) as NetworkDiagram['nodes'],
    connections: (d.connections ?? []) as NetworkDiagram['connections'],
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

async function mapGlobalFileToLocal(f: GlobalProjectFile, projectId: string): Promise<ProjectFile> {
  // Download the current blob if available; preserve metadata otherwise.
  let blobKey: string | undefined;
  if (f.storagePath) {
    try {
      const blob = await downloadFromStorage(f.storagePath);
      blobKey = uuid();
      await db.saveFileBlob(blobKey, blob);
    } catch (e) {
      console.warn('[reconcile] file blob download failed (best-effort):', e);
    }
  }
  // ProjectFile expects a versions array. Synthesize a single "current"
  // version if the global side didn't preserve one.
  const versions = Array.isArray(f.versions) && f.versions.length > 0
    ? (f.versions as ProjectFile['versions'])
    : [
        {
          id: uuid(),
          fileId: f.id,
          versionNumber: 1,
          uploadedAt: f.createdAt,
          uploadedBy: f.createdBy,
          notes: '',
          size: f.size,
          status: 'current' as const,
          blobKey,
        },
      ];
  return {
    id: f.id,
    projectId,
    title: f.title,
    fileName: f.fileName,
    fileType: f.fileType,
    mimeType: f.mimeType,
    category: f.category as ProjectFile['category'],
    panelSystem: f.panelSystem ?? undefined,
    revisionNumber: f.revisionNumber,
    revisionDate: f.revisionDate,
    uploadedBy: f.createdBy,
    notes: f.notes,
    tags: f.tags ?? [],
    status: f.status as ProjectFile['status'],
    isPinned: f.isPinned,
    isFavorite: false,
    isOfflineCached: !!blobKey,
    currentVersionId: versions[0].id,
    versions,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    size: f.size,
  };
}

function mapGlobalPpclToLocal(p: GlobalPpclDocument, projectId: string): PpclDocument {
  return {
    id: p.id,
    name: p.name,
    content: p.content,
    projectId,
    firmware: p.firmware,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function mapGlobalTerminalLogToLocal(l: GlobalTerminalSessionLog, projectId: string): TerminalSessionLog {
  return {
    id: l.id,
    projectId,
    sessionLabel: l.sessionLabel,
    connectionMode: l.connectionMode,
    host: l.host,
    port: l.port,
    serialPort: l.serialPort,
    baudRate: l.baudRate,
    lineCount: l.lineCount,
    logContent: l.logContent,
    startedAt: l.startedAt ?? '',
    endedAt: l.endedAt ?? '',
    createdAt: l.createdAt,
  };
}

function mapGlobalPidToLocal(s: GlobalPidTuningSession, projectId: string): PidTuningSession {
  return {
    id: s.id,
    projectId,
    loopName: s.loopName,
    equipment: s.equipment,
    loopType: s.loopType,
    controlledVariable: s.controlledVariable,
    outputType: s.outputType,
    actuatorStrokeTime: s.actuatorStrokeTime,
    action: s.action,
    controlMode: s.controlMode,
    currentValues: s.currentValues,
    recommendedValues: s.recommendedValues,
    symptoms: s.symptoms ?? [],
    responseData: s.responseData,
    fieldNotes: s.fieldNotes ?? '',
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

function mapGlobalPsychToLocal(s: GlobalPsychSession, projectId: string): PsychSession {
  return {
    id: s.id,
    projectId,
    label: s.label,
    unitSystem: s.unitSystem,
    altitude: s.altitude,
    inputMode: s.inputMode,
    inputValues: s.inputValues,
    results: s.results,
    comfortResult: s.comfortResult,
    ahuMixedAir: s.ahuMixedAir,
    ahuCoilLoad: s.ahuCoilLoad,
    notes: s.notes ?? '',
    tags: s.tags ?? [],
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

function mapGlobalRegisterCalcToLocal(c: GlobalRegisterCalculation, projectId: string): SavedCalculation {
  return {
    id: c.id,
    projectId,
    label: c.label,
    module: c.module,
    category: c.category,
    inputs: c.inputs,
    result: c.result,
    notes: c.notes ?? '',
    tags: c.tags ?? [],
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function mapGlobalPingToLocal(p: GlobalPingSession, projectId: string): PingSession {
  return {
    id: p.id,
    projectId,
    targets: p.targets,
    results: p.results,
    mode: p.mode,
    intervalMs: p.intervalMs,
    createdAt: p.createdAt,
    completedAt: p.completedAt,
  };
}

function mapGlobalTrendToLocal(t: GlobalTrendSession, projectId: string): TrendSession {
  return {
    id: t.id,
    projectId,
    name: t.name,
    description: t.description,
    sourceSystem: t.sourceSystem,
    series: t.series,
    data: t.data,
    anomalies: t.anomalies,
    anomalyConfig: t.anomalyConfig,
    stats: t.stats,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

function mapGlobalDxrToLocal(d: GlobalDxrEntry, projectId: string): DxrEntry {
  return {
    id: d.id,
    projectId,
    name: d.name,
    location: d.location,
    description: d.description,
    deviceInstanceNumber: d.deviceInstanceNumber,
    equipmentId: d.equipmentId,
    serialNumber: d.serialNumber,
    applicationTemplate: d.applicationTemplate,
    applicationNumber: d.applicationNumber,
    network: d.network,
    autoAddressing: d.autoAddressing,
    macAddress: d.macAddress,
    maxManagerAddress: d.maxManagerAddress,
    baudRate: d.baudRate,
    roomHierarchy: d.roomHierarchy,
    roomName: d.roomName,
    roomDescription: d.roomDescription,
    segmentHierarchy: d.segmentHierarchy,
    segmentName: d.segmentName,
    segmentDescription: d.segmentDescription,
    msTpNwId: d.msTpNwId,
    guid: d.guid,
    importedFromFileId: d.importedFromFileId ?? undefined,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function mapGlobalConnProfileToLocal(p: GlobalConnectionProfile, projectId: string): ConnectionProfile {
  return {
    id: p.id,
    name: p.name,
    connectionType: p.connectionType,
    serialPort: p.serialPort,
    baudRate: p.baudRate,
    dataBits: p.dataBits,
    parity: p.parity,
    stopBits: p.stopBits,
    flowControl: p.flowControl,
    host: p.host,
    port: p.port,
    localEcho: p.localEcho,
    lineEnding: p.lineEnding,
    logging: p.logging,
    projectId,
    notes: p.notes,
    isFavorite: p.isFavorite,
    tags: p.tags,
    lastConnectedAt: p.lastConnectedAt ?? '',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ─── Project-row mappers ────────────────────────────────────────────────────

/**
 * Build a row for `global_projects` from a local Project. Used both for
 * insert (new global project) and upsert (existing one). Explicit allowlist
 * — we deliberately skip `isPinned` and `isOfflineAvailable` because those
 * are virtual joins from `global_project_preferences`, not real columns on
 * `global_projects`. Auto snake-case would emit `is_pinned` / `is_offline_available`
 * which don't exist on this table.
 */
function buildGlobalProjectRow(
  localProject: Project,
  ownGlobalId: string,
  userId: string,
  accessCode: string,
  isUpdate: boolean,
): Record<string, unknown> {
  return {
    id: ownGlobalId,
    ...(isUpdate ? {} : { created_by: userId }),
    name: localProject.name,
    job_site_name: localProject.customerName || localProject.name,
    site_address: localProject.siteAddress,
    building_area: localProject.buildingArea,
    project_number: localProject.projectNumber,
    description: '', // Local Project has no dedicated `description` field today.
    customer_name: localProject.customerName,
    technician_notes: localProject.technicianNotes,
    panel_roster_summary: localProject.panelRosterSummary ?? null,
    network_summary: localProject.networkSummary ?? null,
    contacts: localProject.contacts ?? [],
    access_code: accessCode,
    tags: localProject.tags,
    status: coerceGlobalStatus(localProject.status),
    // Defensive: clear any stale soft-delete flag so a re-share of a project
    // whose linked global was previously soft-deleted comes back to life.
    deleted_at: null,
    created_at: localProject.createdAt,
    updated_at: nowIso(),
  };
}

function buildLocalProjectFromGlobal(global: GlobalProject, existingLocalId?: string): Project {
  return {
    id: existingLocalId ?? global.id, // ID-stable: reuse the global UUID when local doesn't exist yet.
    name: global.name,
    customerName: global.customerName || global.jobSiteName || '',
    siteAddress: global.siteAddress ?? '',
    buildingArea: global.buildingArea ?? '',
    projectNumber: global.projectNumber ?? '',
    technicianNotes: global.technicianNotes ?? '',
    panelRosterSummary: global.panelRosterSummary ?? undefined,
    networkSummary: global.networkSummary ?? undefined,
    tags: global.tags ?? [],
    status: coerceLocalStatus(global.status),
    contacts: global.contacts ?? [],
    isPinned: false,
    isOfflineAvailable: false,
    syncedGlobalId: global.id,
    createdAt: global.createdAt,
    updatedAt: global.updatedAt,
  };
}

// ─── Public API: reconcileLocalToGlobal ─────────────────────────────────────

export async function reconcileLocalToGlobal(
  localProjectId: string,
  onProgress?: ProgressFn,
): Promise<ReconcileResult> {
  const supabase = client();
  const userId = await currentUserId();

  // ── 0. Load local project ─────────────────────────────────────────────────
  const localProject = await db.getProject(localProjectId);
  if (!localProject) throw new Error(`Local project ${localProjectId} not found`);

  // ── 1. Decide insert-vs-update of the parent ─────────────────────────────
  let globalProjectId: string;
  let accessCode = '';
  let isNewProject = false;

  if (localProject.syncedGlobalId) {
    // Check whether the linked global project still exists.
    const { data: existing } = await supabase
      .from('global_projects')
      .select('id, access_code')
      .eq('id', localProject.syncedGlobalId)
      .is('deleted_at', null)
      .maybeSingle();
    const existingRow = existing as { id: string; access_code: string } | null;
    if (existingRow) {
      globalProjectId = existingRow.id;
      accessCode = existingRow.access_code;
    } else {
      // Linked global gone (deleted on the server). Fall through to create.
      globalProjectId = localProject.id; // ID-stable: reuse local id if free.
      accessCode = await nextAccessCode();
      isNewProject = true;
    }
  } else {
    globalProjectId = localProject.id;
    accessCode = await nextAccessCode();
    isNewProject = true;
  }

  onProgress?.('Reconciling project metadata', 1, 2 + RECONCILED_ENTITY_PAIRS.length);

  // Upsert the project row.
  const projectRow = buildGlobalProjectRow(localProject, globalProjectId, userId, accessCode, !isNewProject);
  {
    const { error } = await supabase.from('global_projects').upsert(projectRow, { onConflict: 'id' });
    if (error) throw new Error(`global_projects upsert failed: ${error.message}`);
  }

  // On a NEW global project, ensure the creator is a member so RLS lets
  // subsequent child-table writes through. Members table is INSERT-on-create
  // via trigger in production, but we add a fallback in case the trigger
  // isn't installed in older environments.
  if (isNewProject) {
    const { error: memErr } = await supabase
      .from('global_project_members')
      .upsert(
        { global_project_id: globalProjectId, user_id: userId, role: 'admin' },
        { onConflict: 'global_project_id,user_id' },
      );
    if (memErr) {
      // Non-fatal — the create-project trigger may already have inserted the row.
      console.warn('[reconcile] could not ensure creator membership:', memErr.message);
    }
  }

  // Write back the link if it wasn't already set.
  if (localProject.syncedGlobalId !== globalProjectId) {
    await db.saveProject({ ...localProject, syncedGlobalId: globalProjectId, updatedAt: nowIso() });
  }

  // ── 2. Reconcile every child entity pair ─────────────────────────────────
  const counts: Record<string, EntityReconcileCounts> = {};
  let step = 1;

  for (const pair of RECONCILED_ENTITY_PAIRS) {
    step++;
    onProgress?.(`Reconciling ${pair.key}`, step, 2 + RECONCILED_ENTITY_PAIRS.length);
    counts[pair.key] = emptyCounts();
    try {
      await reconcilePairLocalToGlobal(pair, globalProjectId, userId, counts[pair.key]);
    } catch (e) {
      console.warn(`[reconcile] ${pair.key} failed:`, e);
      counts[pair.key].failed++;
    }
  }

  // ── 3. Append a single "reconciled" entry to the global activity log ────
  step++;
  onProgress?.('Logging reconcile activity', step, 2 + RECONCILED_ENTITY_PAIRS.length);
  try {
    const total = Object.values(counts).reduce((sum, c) => sum + c.pushed, 0);
    await logGlobalActivity(
      globalProjectId,
      isNewProject ? 'reconciled (initial share from local)' : 'reconciled from local',
      `Pushed ${total} rows across ${RECONCILED_ENTITY_PAIRS.length} entity types`,
    );
  } catch (e) {
    console.warn('[reconcile] activity log append failed (non-fatal):', e);
  }

  return {
    direction: 'local-to-global',
    localProjectId,
    globalProjectId,
    accessCode: isNewProject ? accessCode : undefined,
    isNewProject,
    counts,
  };
}

/**
 * Pull a global project + all its children into the local IndexedDB. Mirrors
 * reconcileLocalToGlobal: ID-stable, idempotent, appends one activity entry.
 */
export async function reconcileGlobalToLocal(
  globalProjectId: string,
  onProgress?: ProgressFn,
): Promise<ReconcileResult> {
  const supabase = client();
  await currentUserId(); // ensure authenticated

  // ── 0. Load global project ────────────────────────────────────────────────
  const { data: rawGlobal, error: gpErr } = await supabase
    .from('global_projects')
    .select('*')
    .eq('id', globalProjectId)
    .is('deleted_at', null)
    .single();
  if (gpErr) throw new Error(`global_projects fetch failed: ${gpErr.message}`);
  const globalProject = camelKeysShallow<GlobalProject>(rawGlobal);

  // ── 1. Find or create the local project ──────────────────────────────────
  const allLocal = await db.getAllProjects();
  let localExisting = allLocal.find((p) => p.syncedGlobalId === globalProjectId);
  // If no link yet but a local with the same UUID already exists, reuse it.
  if (!localExisting) {
    const sameId = await db.getProject(globalProjectId);
    if (sameId) localExisting = sameId;
  }

  const isNewProject = !localExisting;
  const localProjectId = localExisting?.id ?? globalProject.id;

  const newLocalProject: Project = buildLocalProjectFromGlobal(globalProject, localProjectId);
  // Preserve local-only fields the user has set if the row already exists.
  if (localExisting) {
    newLocalProject.isPinned = localExisting.isPinned;
    newLocalProject.isOfflineAvailable = localExisting.isOfflineAvailable;
  }
  await db.saveProject(newLocalProject);

  onProgress?.('Reconciling project metadata', 1, 2 + RECONCILED_ENTITY_PAIRS.length);

  // ── 2. Reconcile every child entity pair ─────────────────────────────────
  const counts: Record<string, EntityReconcileCounts> = {};
  let step = 1;
  for (const pair of RECONCILED_ENTITY_PAIRS) {
    step++;
    onProgress?.(`Reconciling ${pair.key}`, step, 2 + RECONCILED_ENTITY_PAIRS.length);
    counts[pair.key] = emptyCounts();
    try {
      await reconcilePairGlobalToLocal(pair, globalProjectId, localProjectId, counts[pair.key]);
    } catch (e) {
      console.warn(`[reconcile] ${pair.key} failed:`, e);
      counts[pair.key].failed++;
    }
  }

  // ── 3. Append a single "reconciled" entry to the local activity log ─────
  step++;
  onProgress?.('Logging reconcile activity', step, 2 + RECONCILED_ENTITY_PAIRS.length);
  try {
    const total = Object.values(counts).reduce((sum, c) => sum + c.pulled, 0);
    await db.addActivity({
      id: uuid(),
      projectId: localProjectId,
      action: isNewProject ? 'reconciled (initial save from global)' : 'reconciled from global',
      details: `Pulled ${total} rows from "${globalProject.name}"`,
      timestamp: nowIso(),
      user: 'User',
    });
  } catch (e) {
    console.warn('[reconcile] local activity log append failed (non-fatal):', e);
  }

  // Also log on the global side, best-effort.
  try {
    await logGlobalActivity(
      globalProjectId,
      isNewProject ? 'reconciled (initial save to local)' : 'reconciled to local',
      `Pulled ${Object.values(counts).reduce((s, c) => s + c.pulled, 0)} rows to local`,
    );
  } catch (e) {
    console.warn('[reconcile] global activity log append failed (non-fatal):', e);
  }

  return {
    direction: 'global-to-local',
    localProjectId,
    globalProjectId,
    isNewProject,
    counts,
  };
}

// ─── Per-pair reconcile drivers ─────────────────────────────────────────────

type Pair = (typeof RECONCILED_ENTITY_PAIRS)[number];

async function reconcilePairLocalToGlobal(
  pair: Pair,
  globalProjectId: string,
  userId: string,
  counts: EntityReconcileCounts,
): Promise<void> {
  const supabase = client();
  const localItems = await loadLocalItems(pair.local, pair.key, globalProjectId);
  if (localItems.length === 0) return;

  // Pre-fetch existing global rows for this pair so we can:
  //   - decide insert-vs-update per row (preserves immutable created_by).
  //   - skip rows whose updated_at hasn't advanced since last reconcile.
  //   - know which file rows already have a storage_path (don't re-upload).
  // Only `global_project_files` has a `storage_path` column; requesting it
  // against any other table makes PostgREST return UNDEFINED_COLUMN (42703)
  // and aborts the whole pair before any row is pushed.
  const globalTable = entityTable(pair.global);
  const hasStoragePath = pair.global === 'globalProjectFiles';
  const selectCols = hasStoragePath ? 'id, updated_at, storage_path' : 'id, updated_at';
  const { data: existingRaw, error: exErr } = await supabase
    .from(globalTable)
    .select(selectCols)
    .eq('global_project_id', globalProjectId);
  if (exErr) throw new Error(`${globalTable} pre-fetch failed: ${exErr.message}`);
  const existingMap = new Map<string, { updated_at: string | null; storage_path: string | null }>();
  for (const row of (existingRaw ?? []) as unknown as Array<{ id: string; updated_at: string | null; storage_path?: string | null }>) {
    existingMap.set(row.id, { updated_at: row.updated_at ?? null, storage_path: row.storage_path ?? null });
  }

  for (const item of localItems) {
    try {
      const existing = existingMap.get((item as { id: string }).id);
      const isUpdate = !!existing;
      const localUpdatedAt = (item as { updatedAt?: string; createdAt?: string }).updatedAt
        ?? (item as { createdAt?: string }).createdAt
        ?? null;

      // Idempotent skip: skip when the global row is already at-or-newer than the
      // local row. Compare parsed timestamps rather than raw strings — local rows
      // and Postgres `now()` can serialize the same instant differently (timezone
      // offset, fractional-second precision), so an exact string match would
      // almost never hold and we'd needlessly re-push every row, deflating the
      // skip count. Unparseable timestamps fall through to a push (safe default).
      const existingMs = existing?.updated_at ? Date.parse(existing.updated_at) : NaN;
      const localMs = localUpdatedAt ? Date.parse(localUpdatedAt) : NaN;
      if (existing && !Number.isNaN(existingMs) && !Number.isNaN(localMs) && existingMs >= localMs) {
        counts.skipped++;
        continue;
      }

      const row = await buildLocalToGlobalRow(pair.key, item, globalProjectId, userId, isUpdate, existing?.storage_path ?? null);
      await upsertGlobalRow(globalTable, row);
      counts.pushed++;
    } catch (e) {
      console.warn(`[reconcile] push ${pair.key} row failed:`, e);
      counts.failed++;
    }
  }
}

/**
 * Context used by the notes pull to resolve display-name authors (Finding #12).
 * `existingAuthorById` maps a note id → the display-name `author` already stored
 * locally (so a round-trip never clobbers it). `displayNameByUserId` maps a
 * Supabase `created_by` UUID → that member's profile display name, used only for
 * notes that have no local row yet.
 */
interface NoteAuthorContext {
  existingAuthorById: Map<string, string>;
  displayNameByUserId: Map<string, string>;
}

async function buildNoteAuthorContext(
  localProjectId: string,
  globalRows: Record<string, unknown>[],
): Promise<NoteAuthorContext> {
  const existingAuthorById = new Map<string, string>();
  try {
    const localNotes = await db.getProjectNotes(localProjectId);
    for (const note of localNotes) {
      if (note.author && note.author.trim().length > 0) existingAuthorById.set(note.id, note.author);
    }
  } catch (e) {
    console.warn('[reconcile] could not load local notes for author preservation (non-fatal):', e);
  }

  const displayNameByUserId = new Map<string, string>();
  const userIds = Array.from(
    new Set(
      globalRows
        .map((r) => (r.created_by ?? r.createdBy) as string | undefined)
        .filter((v): v is string => typeof v === 'string' && v.length > 0),
    ),
  );
  if (userIds.length > 0) {
    try {
      const { data: profiles } = await client()
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds);
      for (const p of (profiles ?? []) as Array<{ id: string; display_name: string | null }>) {
        if (p.display_name && p.display_name.trim().length > 0) {
          displayNameByUserId.set(p.id, p.display_name);
        }
      }
    } catch (e) {
      console.warn('[reconcile] could not load profile display names (non-fatal):', e);
    }
  }

  return { existingAuthorById, displayNameByUserId };
}

async function reconcilePairGlobalToLocal(
  pair: Pair,
  globalProjectId: string,
  localProjectId: string,
  counts: EntityReconcileCounts,
): Promise<void> {
  const globalTable = entityTable(pair.global);
  const supabase = client();
  const { data: rows, error } = await supabase
    .from(globalTable)
    .select('*')
    .eq('global_project_id', globalProjectId)
    .is('deleted_at', null);
  if (error) throw new Error(`${globalTable} fetch failed: ${error.message}`);
  if (!rows || rows.length === 0) return;

  // For notes, build a context that lets the mapper resolve a human display-name
  // `author` instead of writing a raw `created_by` UUID (Finding #12):
  //   - existing local notes → preserve the display name the user already typed.
  //   - a created_by UUID → profile display-name lookup → for notes authored on
  //     another device that never had a local row here.
  const noteCtx = pair.key === 'notes'
    ? await buildNoteAuthorContext(localProjectId, rows as Record<string, unknown>[])
    : undefined;

  // We rely on IndexedDB's put-by-id semantics for idempotency; no
  // pre-fetch needed on the local side. Skip-on-unchanged could be added
  // later if write amplification becomes a concern.
  for (const raw of rows as Record<string, unknown>[]) {
    try {
      const camelRow = camelKeysShallow<Record<string, unknown>>(raw);
      const localRow = await convertGlobalToLocal(pair.key, camelRow, localProjectId, noteCtx);
      if (!localRow) {
        counts.skipped++;
        continue;
      }
      await saveLocalItem(pair.local, pair.key, localRow);
      counts.pulled++;
    } catch (e) {
      console.warn(`[reconcile] pull ${pair.key} row failed:`, e);
      counts.failed++;
    }
  }
}

// ─── Routing tables — pair key → loader / saver / mapper ────────────────────

function entityTable(globalKey: Pair['global']): string {
  const lookup: Record<Pair['global'], string> = {
    globalNotes: 'global_field_notes',
    globalDevices: 'global_devices',
    globalIpPlan: 'global_ip_plan',
    globalDailyReports: 'global_daily_reports',
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
    globalDxrs: 'global_dxrs',
  };
  return lookup[globalKey];
}

async function loadLocalItems(
  localKey: Pair['local'],
  pairKey: ReconciledEntityKey,
  projectId: string,
): Promise<unknown[]> {
  void pairKey;
  switch (localKey) {
    case 'notes':                return db.getProjectNotes(projectId);
    case 'devices':              return db.getProjectDevices(projectId);
    case 'ipPlan':               return db.getProjectIpPlan(projectId);
    case 'dailyReports':         return db.getProjectDailyReports(projectId);
    case 'networkDiagrams':      return db.getProjectDiagrams(projectId);
    case 'files':                return db.getProjectFiles(projectId);
    case 'ppclDocuments':        return db.getProjectPpclDocuments(projectId);
    case 'terminalLogs':         return db.getProjectTerminalLogs(projectId);
    case 'pidTuningSessions':    return db.getProjectPidTuningSessions(projectId);
    case 'psychSessions':        return db.getProjectPsychSessions(projectId);
    case 'registerCalculations': return db.getProjectRegisterCalculations(projectId);
    case 'pingSessions':         return db.getProjectPingSessions(projectId);
    case 'trendSessions':        return db.getProjectTrendSessions(projectId);
    case 'connectionProfiles':   return db.getProjectConnectionProfiles(projectId);
    case 'dxrs':                 return db.getProjectDxrs(projectId);
    default: {
      const exhaustive: never = localKey;
      throw new Error(`loadLocalItems: unhandled key ${exhaustive as string}`);
    }
  }
}

async function saveLocalItem(
  localKey: Pair['local'],
  pairKey: ReconciledEntityKey,
  row: unknown,
): Promise<void> {
  void pairKey;
  switch (localKey) {
    case 'notes':                return db.saveNote(row as FieldNote);
    case 'devices':              return db.saveDevice(row as DeviceEntry);
    case 'ipPlan':               return db.saveIpEntry(row as IpPlanEntry);
    case 'dailyReports':         return db.saveDailyReport(row as DailyReport);
    case 'networkDiagrams':      return db.saveDiagram(row as NetworkDiagram);
    case 'files':                return db.saveFile(row as ProjectFile);
    case 'ppclDocuments':        return db.savePpclDocument(row as PpclDocument);
    case 'terminalLogs':         return db.saveTerminalLog(row as TerminalSessionLog);
    case 'pidTuningSessions':    return db.savePidTuningSession(row as PidTuningSession);
    case 'psychSessions':        return db.savePsychSession(row as PsychSession);
    case 'registerCalculations': return db.saveRegisterCalculation(row as SavedCalculation);
    case 'pingSessions':         return db.savePingSession(row as PingSession);
    case 'trendSessions':        return db.saveTrendSession(row as TrendSession);
    case 'connectionProfiles':   return db.saveConnectionProfile(row as ConnectionProfile);
    case 'dxrs':                 return db.addProjectDxr(row as DxrEntry);
    default: {
      const exhaustive: never = localKey;
      throw new Error(`saveLocalItem: unhandled key ${exhaustive as string}`);
    }
  }
}

async function buildLocalToGlobalRow(
  key: ReconciledEntityKey,
  item: unknown,
  globalProjectId: string,
  userId: string,
  isUpdate: boolean,
  existingStoragePath: string | null,
): Promise<Record<string, unknown>> {
  switch (key) {
    case 'notes':                return mapLocalNoteToRow(item as FieldNote, globalProjectId, userId, isUpdate);
    case 'devices':              return mapLocalDeviceToRow(item as DeviceEntry, globalProjectId, userId, isUpdate);
    case 'ipPlan':               return mapLocalIpEntryToRow(item as IpPlanEntry, globalProjectId, userId, isUpdate);
    case 'dailyReports':         return mapLocalReportToRow(item as DailyReport, globalProjectId, userId, isUpdate);
    case 'networkDiagrams':      return mapLocalDiagramToRow(item as NetworkDiagram, globalProjectId, userId, isUpdate);
    case 'files':                return mapLocalFileToRow(item as ProjectFile, globalProjectId, userId, isUpdate, existingStoragePath);
    case 'ppclDocuments':        return mapLocalPpclToRow(item as PpclDocument, globalProjectId, userId, isUpdate);
    case 'terminalLogs':         return mapLocalTerminalLogToRow(item as TerminalSessionLog, globalProjectId, userId, isUpdate);
    case 'pidTuningSessions':    return mapLocalPidToRow(item as PidTuningSession, globalProjectId, userId, isUpdate);
    case 'psychSessions':        return mapLocalPsychToRow(item as PsychSession, globalProjectId, userId, isUpdate);
    case 'registerCalculations': return mapLocalRegisterCalcToRow(item as SavedCalculation, globalProjectId, userId, isUpdate);
    case 'pingSessions':         return mapLocalPingToRow(item as PingSession, globalProjectId, userId, isUpdate);
    case 'trendSessions':        return mapLocalTrendToRow(item as TrendSession, globalProjectId, userId, isUpdate);
    case 'connectionProfiles':   return mapLocalConnProfileToRow(item as ConnectionProfile, globalProjectId, userId, isUpdate);
    case 'dxrs':                 return mapLocalDxrToRow(item as DxrEntry, globalProjectId, userId, isUpdate);
    default: {
      const exhaustive: never = key;
      throw new Error(`buildLocalToGlobalRow: unhandled key ${exhaustive as string}`);
    }
  }
}

async function convertGlobalToLocal(
  key: ReconciledEntityKey,
  global: Record<string, unknown>,
  projectId: string,
  noteCtx?: NoteAuthorContext,
): Promise<unknown | null> {
  switch (key) {
    case 'notes': {
      const note = global as unknown as GlobalFieldNote;
      return mapGlobalNoteToLocal(
        note,
        projectId,
        noteCtx?.existingAuthorById.get(note.id),
        noteCtx?.displayNameByUserId,
      );
    }
    case 'devices':              return mapGlobalDeviceToLocal(global as unknown as GlobalDevice, projectId);
    case 'ipPlan':               return mapGlobalIpEntryToLocal(global as unknown as GlobalIpPlanEntry, projectId);
    case 'dailyReports':         return mapGlobalReportToLocal(global as unknown as GlobalDailyReport, projectId);
    case 'networkDiagrams':      return mapGlobalDiagramToLocal(global as unknown as GlobalNetworkDiagram, projectId);
    case 'files':                return mapGlobalFileToLocal(global as unknown as GlobalProjectFile, projectId);
    case 'ppclDocuments':        return mapGlobalPpclToLocal(global as unknown as GlobalPpclDocument, projectId);
    case 'terminalLogs':         return mapGlobalTerminalLogToLocal(global as unknown as GlobalTerminalSessionLog, projectId);
    case 'pidTuningSessions':    return mapGlobalPidToLocal(global as unknown as GlobalPidTuningSession, projectId);
    case 'psychSessions':        return mapGlobalPsychToLocal(global as unknown as GlobalPsychSession, projectId);
    case 'registerCalculations': return mapGlobalRegisterCalcToLocal(global as unknown as GlobalRegisterCalculation, projectId);
    case 'pingSessions':         return mapGlobalPingToLocal(global as unknown as GlobalPingSession, projectId);
    case 'trendSessions':        return mapGlobalTrendToLocal(global as unknown as GlobalTrendSession, projectId);
    case 'connectionProfiles':   return mapGlobalConnProfileToLocal(global as unknown as GlobalConnectionProfile, projectId);
    case 'dxrs':                 return mapGlobalDxrToLocal(global as unknown as GlobalDxrEntry, projectId);
    default: {
      const exhaustive: never = key;
      throw new Error(`convertGlobalToLocal: unhandled key ${exhaustive as string}`);
    }
  }
}
