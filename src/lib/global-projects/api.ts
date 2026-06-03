import { deleteManyFromStorage } from '@/lib/storage';
import { getSupabaseClient } from '@/lib/supabase/client';
import type {
  GlobalProject,
  GlobalProjectMember,
  GlobalFieldNote,
  GlobalDevice,
  GlobalIpPlanEntry,
  GlobalDailyReport,
  GlobalReportAttachment,
  GlobalProjectFile,
  GlobalActivityLogEntry,
  GlobalMessage,
  GlobalPpclDocument,
  GlobalTerminalSessionLog,
  GlobalPidTuningSession,
  GlobalPsychSession,
  GlobalRegisterCalculation,
  GlobalPingSession,
  GlobalTrendSession,
  GlobalConnectionProfile,
  GlobalFieldPanel,
  GlobalNotepadEntry,
  GlobalProjectPreferences,
  GlobalDxrEntry,
} from '@/types/global-projects';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert a snake_case key to camelCase */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** Convert a camelCase key to snake_case */
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}

/** Recursively convert all snake_case keys in an object/array to camelCase */
function camelCaseKeys<T>(obj: unknown): T {
  if (Array.isArray(obj)) {
    return obj.map((item) => camelCaseKeys<T>(item)) as unknown as T;
  }
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    const converted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      converted[toCamelCase(key)] = camelCaseKeys(value);
    }
    return converted as T;
  }
  return obj as T;
}

/** Get the authenticated Supabase client or throw */
function getClient() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured');
  return client;
}

/** Get the current user ID or throw */
async function getCurrentUserId(): Promise<string> {
  const { data: { user } } = await getClient().auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

type ApiResult<T> = { data: T; error: null } | { data: null; error: string };

function ok<T>(data: T): ApiResult<T> {
  return { data, error: null };
}

function fail<T>(message: string): ApiResult<T> {
  return { data: null, error: message };
}

// ─── Generic CRUD Helpers ──────────────────────────────────────────────────
// These eliminate per-entity boilerplate for fetch, update, and soft-delete.

/** Fetch all rows for a project from a soft-deletable table. */
async function fetchProjectEntities<T>(
  table: string, projectId: string, orderCol: string, ascending: boolean,
): Promise<ApiResult<T[]>> {
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from(table).select('*')
      .eq('global_project_id', projectId)
      .is('deleted_at', null)
      .order(orderCol, { ascending });
    if (error) return fail(error.message);
    return ok(camelCaseKeys<T[]>(data || []));
  } catch (err) {
    return fail((err as Error).message);
  }
}

/** Update a row, auto-converting camelCase data keys to snake_case columns. */
async function updateEntity<T>(
  table: string, id: string, data: Record<string, unknown>,
): Promise<ApiResult<T>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();
    const update: Record<string, unknown> = { updated_by: userId };
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) update[toSnakeCase(key)] = value;
    }
    const { data: row, error } = await supabase
      .from(table).update(update).eq('id', id).select().single();
    if (error) return fail(error.message);
    return ok(camelCaseKeys<T>(row));
  } catch (err) {
    return fail((err as Error).message);
  }
}

/** Soft-delete a row by setting deleted_at. */
async function softDelete(table: string, id: string): Promise<ApiResult<void>> {
  try {
    const supabase = getClient();
    const { error } = await supabase
      .from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) return fail(error.message);
    return ok(undefined);
  } catch (err) {
    return fail((err as Error).message);
  }
}

// ─── Projects ───────────────────────────────────────────────────────────────

export async function fetchGlobalProjects(): Promise<ApiResult<GlobalProject[]>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();

    // Fetch projects where user is a member, with member count
    const { data: memberships, error: memErr } = await supabase
      .from('global_project_members')
      .select('global_project_id')
      .eq('user_id', userId);

    if (memErr) return fail(memErr.message);
    if (!memberships || memberships.length === 0) return ok([]);

    const projectIds = memberships.map((m) => m.global_project_id);

    const { data: projects, error: projErr } = await supabase
      .from('global_projects')
      .select('*, global_project_members(count)')
      .in('id', projectIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (projErr) return fail(projErr.message);

    const mapped = (projects || []).map((p) => {
      const { global_project_members, ...rest } = p;
      const project = camelCaseKeys<GlobalProject>(rest);
      project.memberCount =
        Array.isArray(global_project_members) && global_project_members.length > 0
          ? (global_project_members[0] as { count: number }).count
          : 0;
      return project;
    });

    return ok(mapped);
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function fetchGlobalProject(id: string): Promise<ApiResult<GlobalProject & { members: GlobalProjectMember[] }>> {
  try {
    const supabase = getClient();

    const { data: project, error: projErr } = await supabase
      .from('global_projects')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (projErr) return fail(projErr.message);

    const { data: members, error: memErr } = await supabase
      .from('global_project_members')
      .select('*')
      .eq('global_project_id', id);

    if (memErr) return fail(memErr.message);

    // Fetch profiles separately (no direct FK from members.user_id → profiles.id)
    const userIds = (members || []).map((m) => m.user_id);
    const profileMap: Record<string, { display_name: string | null; email: string; avatar_url: string | null }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, email, avatar_url')
        .in('id', userIds);
      for (const p of profiles || []) {
        profileMap[p.id] = { display_name: p.display_name, email: p.email, avatar_url: p.avatar_url ?? null };
      }
    }

    const mappedMembers = (members || []).map((m) => {
      const member = camelCaseKeys<GlobalProjectMember>(m);
      const profile = profileMap[m.user_id];
      member.displayName = profile?.display_name ?? null;
      member.email = profile?.email ?? '';
      member.avatarUrl = profile?.avatar_url ?? null;
      return member;
    });

    const mappedProject = camelCaseKeys<GlobalProject>(project);

    return ok({ ...mappedProject, members: mappedMembers });
  } catch (err) {
    return fail((err as Error).message);
  }
}

/** Generate access code client-side: XXX-XXXX with no ambiguous chars */
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

export async function createGlobalProject(
  data: Pick<GlobalProject, 'name' | 'jobSiteName'> & Partial<Pick<GlobalProject, 'siteAddress' | 'buildingArea' | 'projectNumber' | 'description' | 'tags'>>
): Promise<ApiResult<GlobalProject>> {
  try {
    // Input validation
    if (!data.name || data.name.trim().length === 0) return fail('Project name is required');
    if (data.name.length > 200) return fail('Project name must be 200 characters or fewer');
    if (data.description && data.description.length > 2000) return fail('Description must be 2,000 characters or fewer');

    const supabase = getClient();
    const userId = await getCurrentUserId();

    // Try server-side RPC first, fall back to client-side generation
    let accessCode: string;
    const { data: rpcCode, error: codeErr } = await supabase.rpc('generate_global_access_code');
    if (codeErr || !rpcCode) {
      accessCode = generateAccessCode();
    } else {
      accessCode = rpcCode as string;
    }

    const { data: project, error } = await supabase
      .from('global_projects')
      .insert({
        created_by: userId,
        name: data.name,
        job_site_name: data.jobSiteName,
        site_address: data.siteAddress ?? '',
        building_area: data.buildingArea ?? '',
        project_number: data.projectNumber ?? '',
        description: data.description ?? '',
        access_code: accessCode,
        tags: data.tags ?? [],
      })
      .select()
      .single();

    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalProject>(project));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function updateGlobalProject(
  id: string,
  data: Partial<Pick<GlobalProject, 'name' | 'jobSiteName' | 'siteAddress' | 'buildingArea' | 'projectNumber' | 'description' | 'tags' | 'status' | 'customerName' | 'technicianNotes' | 'panelRosterSummary' | 'networkSummary' | 'contacts'>>
): Promise<ApiResult<GlobalProject>> {
  try {
    const supabase = getClient();

    // Build snake_case update payload. NOTE: global_projects has NO `updated_by`
    // column (unlike the child tables driven by `updateEntity`), so we map keys
    // by hand here rather than reusing that helper. `updated_at` is stamped by
    // the `global_projects_updated_at` trigger. Every key below maps to a
    // verified column on global_projects — the five parity fields
    // (customer_name, technician_notes, panel_roster_summary, network_summary,
    // contacts) were added by migration add-global-project-parity-fields.sql.
    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.jobSiteName !== undefined) update.job_site_name = data.jobSiteName;
    if (data.siteAddress !== undefined) update.site_address = data.siteAddress;
    if (data.buildingArea !== undefined) update.building_area = data.buildingArea;
    if (data.projectNumber !== undefined) update.project_number = data.projectNumber;
    if (data.description !== undefined) update.description = data.description;
    if (data.tags !== undefined) update.tags = data.tags;
    if (data.status !== undefined) update.status = data.status;
    if (data.customerName !== undefined) update.customer_name = data.customerName;
    if (data.technicianNotes !== undefined) update.technician_notes = data.technicianNotes;
    if (data.panelRosterSummary !== undefined) update.panel_roster_summary = data.panelRosterSummary;
    if (data.networkSummary !== undefined) update.network_summary = data.networkSummary;
    if (data.contacts !== undefined) update.contacts = data.contacts;

    const { data: project, error } = await supabase
      .from('global_projects')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalProject>(project));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function deleteGlobalProject(id: string): Promise<ApiResult<void>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();

    // ── Collect every Supabase Storage path owned by this project BEFORE we
    // soft-delete the rows, then best-effort remove the blobs from the
    // `project-files` bucket. Without this, every uploaded file, daily-report
    // attachment, etc. leaks into the bucket forever with live public URLs
    // (privacy + storage-quota leak). Storage paths live in two places:
    //   - global_project_files.storage_path (one per file row)
    //   - global_daily_reports.attachments[].storagePath (jsonb array)
    // The Knowledge Base is org-wide (not project-scoped) so its attachments
    // are intentionally NOT touched here.
    const storagePaths: string[] = [];
    try {
      const { data: fileRows } = await supabase
        .from('global_project_files')
        .select('storage_path')
        .eq('global_project_id', id)
        .is('deleted_at', null);
      for (const row of (fileRows ?? []) as Array<{ storage_path: string | null }>) {
        if (row.storage_path) storagePaths.push(row.storage_path);
      }
    } catch (collectErr) {
      console.warn(`Failed to collect file storage paths for project ${id}:`, collectErr);
    }
    try {
      const { data: reportRows } = await supabase
        .from('global_daily_reports')
        .select('attachments')
        .eq('global_project_id', id)
        .is('deleted_at', null);
      for (const row of (reportRows ?? []) as Array<{ attachments: GlobalReportAttachment[] | null }>) {
        for (const att of row.attachments ?? []) {
          if (att?.storagePath) storagePaths.push(att.storagePath);
        }
      }
    } catch (collectErr) {
      console.warn(`Failed to collect report attachment paths for project ${id}:`, collectErr);
    }

    const { error } = await supabase
      .from('global_projects')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('created_by', userId);

    if (error) return fail(error.message);

    // Best-effort blob cleanup — failures must NOT block the project deletion.
    if (storagePaths.length > 0) {
      try {
        await deleteManyFromStorage(storagePaths);
      } catch (storageErr) {
        console.warn(`Failed to delete ${storagePaths.length} storage blob(s) for project ${id}:`, storageErr);
      }
    }

    // Cascade soft-delete all child entities so they don't remain queryable
    // after the parent project is soft-deleted. The parent row is only stamped
    // with deleted_at (not hard-deleted), so Postgres ON DELETE CASCADE never
    // fires — we must mirror the soft-delete explicitly for every child table
    // that carries a deleted_at column.
    //
    // Tables WITHOUT a deleted_at column (global_activity_log,
    // global_project_preferences) are intentionally excluded — they rely on
    // Postgres FK ON DELETE CASCADE for cleanup when the parent is eventually
    // hard-purged, and their RLS gates access by membership/user_id anyway.
    const now = new Date().toISOString();
    const childTables = [
      // Originally cascaded (5)
      'global_field_notes',
      'global_devices',
      'global_ip_plan',
      'global_daily_reports',
      'global_project_files',
      // Previously missing from cascade (12) — Finding #3
      'global_network_diagrams',
      'global_ppcl_documents',
      'global_terminal_session_logs',
      'global_pid_tuning_sessions',
      'global_psych_sessions',
      'global_register_calculations',
      'global_ping_sessions',
      'global_trend_sessions',
      'global_connection_profiles',
      'global_field_panels',
      'global_project_notepad_entries',
      'global_dxrs',
    ];
    for (const table of childTables) {
      const { error: childErr } = await supabase
        .from(table)
        .update({ deleted_at: now })
        .eq('global_project_id', id)
        .is('deleted_at', null);
      if (childErr) {
        console.warn(`Failed to cascade soft-delete ${table} for project ${id}:`, childErr.message);
      }
    }

    return ok(undefined);
  } catch (err) {
    return fail((err as Error).message);
  }
}

// ─── Access & Membership ────────────────────────────────────────────────────

export async function joinGlobalProject(code: string): Promise<ApiResult<{ projectId: string; projectName: string; role: string }>> {
  try {
    const supabase = getClient();

    const { data, error } = await supabase.rpc('join_global_project', { code });
    if (error) return fail(error.message);

    const result = data as { error?: string; project_id?: string; project_name?: string; role?: string };
    if (result.error) return fail(result.error);

    return ok({
      projectId: result.project_id!,
      projectName: result.project_name!,
      role: result.role!,
    });
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function leaveGlobalProject(projectId: string): Promise<ApiResult<void>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();

    const { error } = await supabase
      .from('global_project_members')
      .delete()
      .eq('global_project_id', projectId)
      .eq('user_id', userId);

    if (error) return fail(error.message);
    return ok(undefined);
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function fetchMembers(projectId: string): Promise<ApiResult<GlobalProjectMember[]>> {
  try {
    const supabase = getClient();

    const { data: members, error } = await supabase
      .from('global_project_members')
      .select('*')
      .eq('global_project_id', projectId)
      .order('joined_at', { ascending: true });

    if (error) return fail(error.message);

    // Fetch profiles separately (no direct FK from members.user_id → profiles.id)
    const userIds = (members || []).map((m) => m.user_id);
    const profileMap: Record<string, { display_name: string | null; email: string; avatar_url: string | null }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, email, avatar_url')
        .in('id', userIds);
      for (const p of profiles || []) {
        profileMap[p.id] = { display_name: p.display_name, email: p.email, avatar_url: p.avatar_url ?? null };
      }
    }

    const mapped = (members || []).map((m) => {
      const member = camelCaseKeys<GlobalProjectMember>(m);
      const profile = profileMap[m.user_id];
      member.displayName = profile?.display_name ?? null;
      member.email = profile?.email ?? '';
      member.avatarUrl = profile?.avatar_url ?? null;
      return member;
    });

    return ok(mapped);
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function removeMember(projectId: string, userId: string): Promise<ApiResult<void>> {
  try {
    const supabase = getClient();

    const { error } = await supabase
      .from('global_project_members')
      .delete()
      .eq('global_project_id', projectId)
      .eq('user_id', userId);

    if (error) return fail(error.message);
    return ok(undefined);
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function promoteMember(projectId: string, userId: string): Promise<ApiResult<void>> {
  try {
    const supabase = getClient();

    const { error } = await supabase
      .from('global_project_members')
      .update({ role: 'admin' })
      .eq('global_project_id', projectId)
      .eq('user_id', userId);

    if (error) return fail(error.message);
    return ok(undefined);
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function regenerateAccessCode(projectId: string): Promise<ApiResult<string>> {
  try {
    const supabase = getClient();

    // Try server-side RPC first, fall back to client-side generation
    let newCode: string;
    const { data: rpcCode, error: codeErr } = await supabase.rpc('generate_global_access_code');
    if (codeErr || !rpcCode) {
      newCode = generateAccessCode();
    } else {
      newCode = rpcCode as string;
    }

    const { error } = await supabase
      .from('global_projects')
      .update({ access_code: newCode })
      .eq('id', projectId);

    if (error) return fail(error.message);
    return ok(newCode);
  } catch (err) {
    return fail((err as Error).message);
  }
}

// ─── Field Notes ────────────────────────────────────────────────────────────

export function fetchGlobalNotes(projectId: string): Promise<ApiResult<GlobalFieldNote[]>> {
  return fetchProjectEntities<GlobalFieldNote>('global_field_notes', projectId, 'created_at', false);
}

export async function addGlobalNote(
  projectId: string,
  data: Partial<Omit<GlobalFieldNote, 'id' | 'globalProjectId' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>>
): Promise<ApiResult<GlobalFieldNote>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();

    const { data: note, error } = await supabase
      .from('global_field_notes')
      .insert({
        global_project_id: projectId,
        created_by: userId,
        file_id: data.fileId ?? null,
        content: data.content ?? '',
        category: data.category ?? 'general',
        is_pinned: data.isPinned ?? false,
        tags: data.tags ?? [],
      })
      .select()
      .single();

    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalFieldNote>(note));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export function updateGlobalNote(
  id: string,
  data: Partial<Pick<GlobalFieldNote, 'content' | 'category' | 'isPinned' | 'tags' | 'fileId'>>
): Promise<ApiResult<GlobalFieldNote>> {
  return updateEntity<GlobalFieldNote>('global_field_notes', id, data as Record<string, unknown>);
}

export function deleteGlobalNote(id: string): Promise<ApiResult<void>> {
  return softDelete('global_field_notes', id);
}

// ─── Devices ────────────────────────────────────────────────────────────────

export function fetchGlobalDevices(projectId: string): Promise<ApiResult<GlobalDevice[]>> {
  return fetchProjectEntities<GlobalDevice>('global_devices', projectId, 'device_name', true);
}

export async function addGlobalDevice(
  projectId: string,
  data: Partial<Omit<GlobalDevice, 'id' | 'globalProjectId' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>>
): Promise<ApiResult<GlobalDevice>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();

    const { data: device, error } = await supabase
      .from('global_devices')
      .insert({
        global_project_id: projectId,
        created_by: userId,
        device_name: data.deviceName ?? '',
        description: data.description ?? '',
        system: data.system ?? '',
        panel: data.panel ?? '',
        controller_type: data.controllerType ?? '',
        mac_address: data.macAddress ?? null,
        instance_number: data.instanceNumber ?? null,
        ip_address: data.ipAddress ?? null,
        floor: data.floor ?? '',
        area: data.area ?? '',
        status: data.status ?? 'Not Commissioned',
        notes: data.notes ?? '',
      })
      .select()
      .single();

    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalDevice>(device));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export function updateGlobalDevice(
  id: string,
  data: Partial<Pick<GlobalDevice, 'deviceName' | 'description' | 'system' | 'panel' | 'controllerType' | 'macAddress' | 'instanceNumber' | 'ipAddress' | 'floor' | 'area' | 'status' | 'notes'>>
): Promise<ApiResult<GlobalDevice>> {
  return updateEntity<GlobalDevice>('global_devices', id, data as Record<string, unknown>);
}

export function deleteGlobalDevice(id: string): Promise<ApiResult<void>> {
  return softDelete('global_devices', id);
}

// ─── IP Plan ────────────────────────────────────────────────────────────────

export function fetchGlobalIpPlan(projectId: string): Promise<ApiResult<GlobalIpPlanEntry[]>> {
  return fetchProjectEntities<GlobalIpPlanEntry>('global_ip_plan', projectId, 'ip_address', true);
}

export async function addGlobalIpEntry(
  projectId: string,
  data: Partial<Omit<GlobalIpPlanEntry, 'id' | 'globalProjectId' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>>
): Promise<ApiResult<GlobalIpPlanEntry>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();

    const { data: entry, error } = await supabase
      .from('global_ip_plan')
      .insert({
        global_project_id: projectId,
        created_by: userId,
        ip_address: data.ipAddress ?? '',
        hostname: data.hostname ?? '',
        panel: data.panel ?? '',
        vlan: data.vlan ?? '',
        subnet: data.subnet ?? '',
        device_role: data.deviceRole ?? '',
        mac_address: data.macAddress ?? null,
        notes: data.notes ?? '',
        status: data.status ?? 'active',
      })
      .select()
      .single();

    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalIpPlanEntry>(entry));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export function updateGlobalIpEntry(
  id: string,
  data: Partial<Pick<GlobalIpPlanEntry, 'ipAddress' | 'hostname' | 'panel' | 'vlan' | 'subnet' | 'deviceRole' | 'macAddress' | 'notes' | 'status'>>
): Promise<ApiResult<GlobalIpPlanEntry>> {
  return updateEntity<GlobalIpPlanEntry>('global_ip_plan', id, data as Record<string, unknown>);
}

export function deleteGlobalIpEntry(id: string): Promise<ApiResult<void>> {
  return softDelete('global_ip_plan', id);
}

// ─── Daily Reports ──────────────────────────────────────────────────────────

export function fetchGlobalReports(projectId: string): Promise<ApiResult<GlobalDailyReport[]>> {
  return fetchProjectEntities<GlobalDailyReport>('global_daily_reports', projectId, 'date', false);
}

export async function addGlobalReport(
  projectId: string,
  data: Partial<Omit<GlobalDailyReport, 'id' | 'globalProjectId' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>>
): Promise<ApiResult<GlobalDailyReport>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();

    const { data: report, error } = await supabase
      .from('global_daily_reports')
      .insert({
        global_project_id: projectId,
        created_by: userId,
        date: data.date ?? new Date().toISOString().slice(0, 10),
        report_number: data.reportNumber ?? 1,
        technician_name: data.technicianName ?? '',
        status: data.status ?? 'draft',
        start_time: data.startTime ?? '',
        end_time: data.endTime ?? '',
        hours_on_site: data.hoursOnSite ?? '',
        location: data.location ?? '',
        weather: data.weather ?? '',
        work_completed: data.workCompleted ?? '',
        issues_encountered: data.issuesEncountered ?? '',
        work_planned_next: data.workPlannedNext ?? '',
        coordination_notes: data.coordinationNotes ?? '',
        equipment_worked_on: data.equipmentWorkedOn ?? '',
        device_ip_changes: data.deviceIpChanges ?? '',
        safety_notes: data.safetyNotes ?? '',
        general_notes: data.generalNotes ?? '',
        attachments: data.attachments ?? [],
      })
      .select()
      .single();

    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalDailyReport>(report));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export function updateGlobalReport(
  id: string,
  data: Partial<Omit<GlobalDailyReport, 'id' | 'globalProjectId' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>>
): Promise<ApiResult<GlobalDailyReport>> {
  return updateEntity<GlobalDailyReport>('global_daily_reports', id, data as Record<string, unknown>);
}

export function deleteGlobalReport(id: string): Promise<ApiResult<void>> {
  return softDelete('global_daily_reports', id);
}

// ─── Project Files ───────────────────────────────────────────────────────────

export function fetchGlobalFiles(projectId: string): Promise<ApiResult<GlobalProjectFile[]>> {
  return fetchProjectEntities<GlobalProjectFile>('global_project_files', projectId, 'created_at', false);
}

export async function addGlobalFile(
  projectId: string,
  data: Partial<Omit<GlobalProjectFile, 'id' | 'globalProjectId' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'versions'>>
): Promise<ApiResult<GlobalProjectFile>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();

    const { data: file, error } = await supabase
      .from('global_project_files')
      .insert({
        global_project_id: projectId,
        created_by: userId,
        title: data.title ?? '',
        file_name: data.fileName ?? '',
        file_type: data.fileType ?? '',
        mime_type: data.mimeType ?? '',
        category: data.category ?? 'general',
        panel_system: data.panelSystem ?? null,
        revision_number: data.revisionNumber ?? '',
        revision_date: data.revisionDate ?? '',
        notes: data.notes ?? '',
        tags: data.tags ?? [],
        status: data.status ?? 'active',
        is_pinned: data.isPinned ?? false,
        size: data.size ?? 0,
        storage_path: data.storagePath ?? null,
      })
      .select()
      .single();

    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalProjectFile>(file));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export function updateGlobalFile(
  id: string,
  data: Partial<Pick<GlobalProjectFile, 'title' | 'category' | 'panelSystem' | 'revisionNumber' | 'revisionDate' | 'notes' | 'tags' | 'status' | 'isPinned'>>
): Promise<ApiResult<GlobalProjectFile>> {
  return updateEntity<GlobalProjectFile>('global_project_files', id, data as Record<string, unknown>);
}

export function deleteGlobalFile(id: string): Promise<ApiResult<void>> {
  return softDelete('global_project_files', id);
}

// ─── Activity Log ───────────────────────────────────────────────────────────

export async function fetchGlobalActivity(projectId: string): Promise<ApiResult<GlobalActivityLogEntry[]>> {
  try {
    const supabase = getClient();

    const { data, error } = await supabase
      .from('global_activity_log')
      .select('*')
      .eq('global_project_id', projectId)
      .order('timestamp', { ascending: false })
      .limit(200);

    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalActivityLogEntry[]>(data || []));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function logGlobalActivity(
  projectId: string,
  action: string,
  details: string = '',
  fileId?: string
): Promise<ApiResult<GlobalActivityLogEntry>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();

    const { data: entry, error } = await supabase
      .from('global_activity_log')
      .insert({
        global_project_id: projectId,
        user_id: userId,
        action,
        details,
        file_id: fileId ?? null,
      })
      .select()
      .single();

    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalActivityLogEntry>(entry));
  } catch (err) {
    return fail((err as Error).message);
  }
}

// ─── Messages (Cross-project message board) ──────────────────────────────────

export async function fetchGlobalMessages(): Promise<ApiResult<GlobalMessage[]>> {
  try {
    const supabase = getClient();

    const { data: messages, error } = await supabase
      .from('global_messages')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) return fail(error.message);
    if (!messages || messages.length === 0) return ok([]);

    // Gather unique user IDs and project IDs for profile/project lookups
    const userIds = [...new Set(messages.map((m: Record<string, unknown>) => m.created_by as string))];
    const projectIds = [...new Set(messages.map((m: Record<string, unknown>) => m.global_project_id as string).filter(Boolean))];

    // Fetch profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', userIds);

    const profileMap = new Map<string, { displayName: string | null; avatarUrl: string | null }>();
    for (const p of profiles || []) {
      profileMap.set(p.id, { displayName: p.display_name, avatarUrl: p.avatar_url });
    }

    // Fetch project names
    const projectMap = new Map<string, string>();
    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from('global_projects')
        .select('id, name')
        .in('id', projectIds);
      for (const p of projects || []) {
        projectMap.set(p.id, p.name);
      }
    }

    // Assemble messages with joined data
    const assembled: GlobalMessage[] = messages.map((m: Record<string, unknown>) => {
      const profile = profileMap.get(m.created_by as string);
      return {
        ...camelCaseKeys<GlobalMessage>(m),
        authorName: profile?.displayName ?? null,
        authorAvatarUrl: profile?.avatarUrl ?? null,
        projectName: m.global_project_id ? (projectMap.get(m.global_project_id as string) ?? null) : null,
      };
    });

    return ok(assembled);
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function addGlobalMessage(
  subject: string,
  body: string,
  globalProjectId?: string | null,
  parentId?: string | null,
): Promise<ApiResult<GlobalMessage>> {
  try {
    // Input validation
    if (!subject || subject.trim().length === 0) return fail('Subject is required');
    if (subject.length > 200) return fail('Subject must be 200 characters or fewer');
    if (body.length > 5000) return fail('Message body must be 5,000 characters or fewer');

    const supabase = getClient();
    const userId = await getCurrentUserId();

    const { data: message, error } = await supabase
      .from('global_messages')
      .insert({
        subject,
        body,
        global_project_id: globalProjectId || null,
        parent_id: parentId || null,
        created_by: userId,
      })
      .select()
      .single();

    if (error) return fail(error.message);

    // Fetch author profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', userId)
      .single();

    // Fetch project name if tagged
    let projectName: string | null = null;
    if (globalProjectId) {
      const { data: project } = await supabase
        .from('global_projects')
        .select('name')
        .eq('id', globalProjectId)
        .single();
      projectName = project?.name ?? null;
    }

    return ok({
      ...camelCaseKeys<GlobalMessage>(message),
      authorName: profile?.display_name ?? null,
      authorAvatarUrl: profile?.avatar_url ?? null,
      projectName,
    });
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function deleteGlobalMessage(messageId: string): Promise<ApiResult<null>> {
  try {
    if (!messageId) return fail('Message ID is required');

    const supabase = getClient();
    const userId = await getCurrentUserId();

    // Only soft-delete own messages — verify ownership client-side too (RLS enforces server-side)
    const { error } = await supabase
      .from('global_messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('created_by', userId);

    if (error) return fail(error.message);
    return ok(null);
  } catch (err) {
    return fail((err as Error).message);
  }
}

// ─── Message Read Tracking ──────────────────────────────────────────────────

export async function fetchLastReadAt(): Promise<ApiResult<string | null>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();

    const { data, error } = await supabase
      .from('global_message_reads')
      .select('last_read_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) return fail(error.message);
    return ok(data?.last_read_at ?? null);
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function markMessagesRead(): Promise<ApiResult<null>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();

    const { error } = await supabase
      .from('global_message_reads')
      .upsert(
        { user_id: userId, last_read_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );

    if (error) return fail(error.message);
    return ok(null);
  } catch (err) {
    return fail((err as Error).message);
  }
}

// ─── Global Connection Profiles ─────────────────────────────────────────────

export function fetchGlobalConnectionProfiles(
  projectId: string,
): Promise<ApiResult<GlobalConnectionProfile[]>> {
  return fetchProjectEntities<GlobalConnectionProfile>(
    'global_connection_profiles',
    projectId,
    'updated_at',
    false,
  );
}

export async function addGlobalConnectionProfile(
  projectId: string,
  data: Pick<
    GlobalConnectionProfile,
    | 'name'
    | 'connectionType'
    | 'serialPort'
    | 'baudRate'
    | 'dataBits'
    | 'parity'
    | 'stopBits'
    | 'flowControl'
    | 'host'
    | 'port'
    | 'localEcho'
    | 'lineEnding'
    | 'logging'
    | 'notes'
    | 'isFavorite'
    | 'tags'
    | 'lastConnectedAt'
  >,
): Promise<ApiResult<GlobalConnectionProfile>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();
    const { data: row, error } = await supabase
      .from('global_connection_profiles')
      .insert({
        global_project_id: projectId,
        created_by: userId,
        updated_by: userId,
        name: data.name,
        connection_type: data.connectionType,
        serial_port: data.serialPort,
        baud_rate: data.baudRate,
        data_bits: data.dataBits,
        parity: data.parity,
        stop_bits: data.stopBits,
        flow_control: data.flowControl,
        host: data.host,
        port: data.port,
        local_echo: data.localEcho,
        line_ending: data.lineEnding,
        logging: data.logging,
        notes: data.notes,
        is_favorite: data.isFavorite,
        tags: data.tags,
        last_connected_at: data.lastConnectedAt || null,
      })
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalConnectionProfile>(row));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export function updateGlobalConnectionProfile(
  id: string,
  data: Partial<
    Pick<
      GlobalConnectionProfile,
      | 'name'
      | 'connectionType'
      | 'serialPort'
      | 'baudRate'
      | 'dataBits'
      | 'parity'
      | 'stopBits'
      | 'flowControl'
      | 'host'
      | 'port'
      | 'localEcho'
      | 'lineEnding'
      | 'logging'
      | 'notes'
      | 'isFavorite'
      | 'tags'
      | 'lastConnectedAt'
    >
  >,
): Promise<ApiResult<GlobalConnectionProfile>> {
  return updateEntity<GlobalConnectionProfile>(
    'global_connection_profiles',
    id,
    data as Record<string, unknown>,
  );
}

export function deleteGlobalConnectionProfile(id: string): Promise<ApiResult<void>> {
  return softDelete('global_connection_profiles', id);
}

// ─── Global Field Panels ────────────────────────────────────────────────────

export function fetchGlobalFieldPanels(
  projectId: string,
): Promise<ApiResult<GlobalFieldPanel[]>> {
  return fetchProjectEntities<GlobalFieldPanel>(
    'global_field_panels',
    projectId,
    'updated_at',
    false,
  );
}

export async function addGlobalFieldPanel(
  projectId: string,
  data: Pick<
    GlobalFieldPanel,
    | 'name'
    | 'site'
    | 'building'
    | 'floor'
    | 'system'
    | 'equipment'
    | 'controllerFamily'
    | 'model'
    | 'ipAddress'
    | 'subnetMask'
    | 'gateway'
    | 'bacnetInstance'
    | 'macAddress'
    | 'networkType'
    | 'firmwareVersion'
    | 'applicationVersion'
    | 'panelStatus'
    | 'webUiUrl'
    | 'secureWebUiUrl'
    | 'lastSeenAt'
    | 'lastBackupAt'
    | 'lastCommissionedAt'
    | 'assignedTechnician'
    | 'tags'
    | 'notes'
    | 'activities'
    | 'linkedFiles'
    | 'relatedTools'
  >,
): Promise<ApiResult<GlobalFieldPanel>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();
    const { data: row, error } = await supabase
      .from('global_field_panels')
      .insert({
        global_project_id: projectId,
        created_by: userId,
        updated_by: userId,
        name: data.name,
        site: data.site,
        building: data.building,
        floor: data.floor,
        system: data.system,
        equipment: data.equipment,
        controller_family: data.controllerFamily,
        model: data.model,
        ip_address: data.ipAddress,
        subnet_mask: data.subnetMask,
        gateway: data.gateway,
        bacnet_instance: data.bacnetInstance,
        mac_address: data.macAddress,
        network_type: data.networkType,
        firmware_version: data.firmwareVersion,
        application_version: data.applicationVersion,
        panel_status: data.panelStatus,
        web_ui_url: data.webUiUrl,
        secure_web_ui_url: data.secureWebUiUrl,
        last_seen_at: data.lastSeenAt,
        last_backup_at: data.lastBackupAt,
        last_commissioned_at: data.lastCommissionedAt,
        assigned_technician: data.assignedTechnician,
        tags: data.tags,
        notes: data.notes,
        activities: data.activities,
        linked_files: data.linkedFiles,
        related_tools: data.relatedTools,
      })
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalFieldPanel>(row));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export function updateGlobalFieldPanel(
  id: string,
  data: Partial<
    Pick<
      GlobalFieldPanel,
      | 'name'
      | 'site'
      | 'building'
      | 'floor'
      | 'system'
      | 'equipment'
      | 'controllerFamily'
      | 'model'
      | 'ipAddress'
      | 'subnetMask'
      | 'gateway'
      | 'bacnetInstance'
      | 'macAddress'
      | 'networkType'
      | 'firmwareVersion'
      | 'applicationVersion'
      | 'panelStatus'
      | 'webUiUrl'
      | 'secureWebUiUrl'
      | 'lastSeenAt'
      | 'lastBackupAt'
      | 'lastCommissionedAt'
      | 'assignedTechnician'
      | 'tags'
      | 'notes'
      | 'activities'
      | 'linkedFiles'
      | 'relatedTools'
    >
  >,
): Promise<ApiResult<GlobalFieldPanel>> {
  return updateEntity<GlobalFieldPanel>(
    'global_field_panels',
    id,
    data as Record<string, unknown>,
  );
}

export function deleteGlobalFieldPanel(id: string): Promise<ApiResult<void>> {
  return softDelete('global_field_panels', id);
}

// ─── Global Notepad Entries ─────────────────────────────────────────────────

export function fetchGlobalNotepadEntries(
  projectId: string,
): Promise<ApiResult<GlobalNotepadEntry[]>> {
  return fetchProjectEntities<GlobalNotepadEntry>(
    'global_project_notepad_entries',
    projectId,
    'updated_at',
    false,
  );
}

export async function addGlobalNotepadEntry(
  projectId: string,
  data: Pick<GlobalNotepadEntry, 'name' | 'content' | 'linkedTabId'>,
): Promise<ApiResult<GlobalNotepadEntry>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();
    const { data: row, error } = await supabase
      .from('global_project_notepad_entries')
      .insert({
        global_project_id: projectId,
        created_by: userId,
        updated_by: userId,
        name: data.name,
        content: data.content,
        linked_tab_id: data.linkedTabId,
      })
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalNotepadEntry>(row));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export function updateGlobalNotepadEntry(
  id: string,
  data: Partial<Pick<GlobalNotepadEntry, 'name' | 'content' | 'linkedTabId'>>,
): Promise<ApiResult<GlobalNotepadEntry>> {
  return updateEntity<GlobalNotepadEntry>(
    'global_project_notepad_entries',
    id,
    data as Record<string, unknown>,
  );
}

export function deleteGlobalNotepadEntry(id: string): Promise<ApiResult<void>> {
  return softDelete('global_project_notepad_entries', id);
}

// ─── Global PID Tuning Sessions ─────────────────────────────────────────────

export function fetchGlobalPidTuningSessions(
  projectId: string,
): Promise<ApiResult<GlobalPidTuningSession[]>> {
  return fetchProjectEntities<GlobalPidTuningSession>(
    'global_pid_tuning_sessions',
    projectId,
    'updated_at',
    false,
  );
}

export async function addGlobalPidTuningSession(
  projectId: string,
  data: Pick<
    GlobalPidTuningSession,
    | 'loopName'
    | 'equipment'
    | 'loopType'
    | 'controlledVariable'
    | 'outputType'
    | 'actuatorStrokeTime'
    | 'action'
    | 'controlMode'
    | 'currentValues'
    | 'recommendedValues'
    | 'symptoms'
    | 'responseData'
    | 'fieldNotes'
  >,
): Promise<ApiResult<GlobalPidTuningSession>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();
    const { data: row, error } = await supabase
      .from('global_pid_tuning_sessions')
      .insert({
        global_project_id: projectId,
        created_by: userId,
        updated_by: userId,
        loop_name: data.loopName,
        equipment: data.equipment,
        loop_type: data.loopType,
        controlled_variable: data.controlledVariable,
        output_type: data.outputType,
        actuator_stroke_time: data.actuatorStrokeTime,
        action: data.action,
        control_mode: data.controlMode,
        current_values: data.currentValues,
        recommended_values: data.recommendedValues,
        symptoms: data.symptoms,
        response_data: data.responseData,
        field_notes: data.fieldNotes,
      })
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalPidTuningSession>(row));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export function updateGlobalPidTuningSession(
  id: string,
  data: Partial<
    Pick<
      GlobalPidTuningSession,
      | 'loopName'
      | 'equipment'
      | 'loopType'
      | 'controlledVariable'
      | 'outputType'
      | 'actuatorStrokeTime'
      | 'action'
      | 'controlMode'
      | 'currentValues'
      | 'recommendedValues'
      | 'symptoms'
      | 'responseData'
      | 'fieldNotes'
    >
  >,
): Promise<ApiResult<GlobalPidTuningSession>> {
  return updateEntity<GlobalPidTuningSession>(
    'global_pid_tuning_sessions',
    id,
    data as Record<string, unknown>,
  );
}

export function deleteGlobalPidTuningSession(id: string): Promise<ApiResult<void>> {
  return softDelete('global_pid_tuning_sessions', id);
}

// ─── Global Ping Sessions ───────────────────────────────────────────────────

export function fetchGlobalPingSessions(
  projectId: string,
): Promise<ApiResult<GlobalPingSession[]>> {
  return fetchProjectEntities<GlobalPingSession>(
    'global_ping_sessions',
    projectId,
    'updated_at',
    false,
  );
}

export async function addGlobalPingSession(
  projectId: string,
  data: Pick<
    GlobalPingSession,
    'targets' | 'results' | 'mode' | 'intervalMs' | 'completedAt'
  >,
): Promise<ApiResult<GlobalPingSession>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();
    const { data: row, error } = await supabase
      .from('global_ping_sessions')
      .insert({
        global_project_id: projectId,
        created_by: userId,
        updated_by: userId,
        targets: data.targets,
        results: data.results,
        mode: data.mode,
        interval_ms: data.intervalMs,
        completed_at: data.completedAt ?? null,
      })
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalPingSession>(row));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export function updateGlobalPingSession(
  id: string,
  data: Partial<
    Pick<GlobalPingSession, 'targets' | 'results' | 'mode' | 'intervalMs' | 'completedAt'>
  >,
): Promise<ApiResult<GlobalPingSession>> {
  return updateEntity<GlobalPingSession>(
    'global_ping_sessions',
    id,
    data as Record<string, unknown>,
  );
}

export function deleteGlobalPingSession(id: string): Promise<ApiResult<void>> {
  return softDelete('global_ping_sessions', id);
}

// ─── Global PPCL Documents ─────────────────────────────────────────────────

export function fetchGlobalPpcl(
  projectId: string,
): Promise<ApiResult<GlobalPpclDocument[]>> {
  return fetchProjectEntities<GlobalPpclDocument>(
    'global_ppcl_documents',
    projectId,
    'updated_at',
    false,
  );
}

export async function addGlobalPpcl(
  projectId: string,
  data: Pick<GlobalPpclDocument, 'name' | 'content' | 'firmware'>,
): Promise<ApiResult<GlobalPpclDocument>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();
    const { data: row, error } = await supabase
      .from('global_ppcl_documents')
      .insert({
        global_project_id: projectId,
        created_by: userId,
        updated_by: userId,
        name: data.name,
        content: data.content,
        firmware: data.firmware,
      })
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalPpclDocument>(row));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export function updateGlobalPpcl(
  id: string,
  data: Partial<Pick<GlobalPpclDocument, 'name' | 'content' | 'firmware'>>,
): Promise<ApiResult<GlobalPpclDocument>> {
  return updateEntity<GlobalPpclDocument>(
    'global_ppcl_documents',
    id,
    data as Record<string, unknown>,
  );
}

export function deleteGlobalPpcl(id: string): Promise<ApiResult<void>> {
  return softDelete('global_ppcl_documents', id);
}

// ─── Global Project Preferences (per-user) ─────────────────────────────────

export async function fetchGlobalProjectPreferences(
  projectId: string,
): Promise<ApiResult<GlobalProjectPreferences | null>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from('global_project_preferences')
      .select('*')
      .eq('user_id', userId)
      .eq('global_project_id', projectId)
      .maybeSingle();
    if (error) return fail(error.message);
    return ok(data ? camelCaseKeys<GlobalProjectPreferences>(data) : null);
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function upsertGlobalProjectPreferences(
  projectId: string,
  data: Partial<
    Pick<
      GlobalProjectPreferences,
      'isPinned' | 'isOfflineAvailable' | 'lastViewedTab' | 'preferences'
    >
  >,
): Promise<ApiResult<GlobalProjectPreferences>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();
    const row: Record<string, unknown> = {
      user_id: userId,
      global_project_id: projectId,
    };
    if (data.isPinned !== undefined) row.is_pinned = data.isPinned;
    if (data.isOfflineAvailable !== undefined) row.is_offline_available = data.isOfflineAvailable;
    if (data.lastViewedTab !== undefined) row.last_viewed_tab = data.lastViewedTab;
    if (data.preferences !== undefined) row.preferences = data.preferences;
    const { data: result, error } = await supabase
      .from('global_project_preferences')
      .upsert(row, { onConflict: 'user_id,global_project_id' })
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalProjectPreferences>(result));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function deleteGlobalProjectPreferences(
  projectId: string,
): Promise<ApiResult<void>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();
    const { error } = await supabase
      .from('global_project_preferences')
      .delete()
      .eq('user_id', userId)
      .eq('global_project_id', projectId);
    if (error) return fail(error.message);
    return ok(undefined);
  } catch (err) {
    return fail((err as Error).message);
  }
}

// ─── Global Psych Sessions ─────────────────────────────────────────────────

export function fetchGlobalPsychSessions(
  projectId: string,
): Promise<ApiResult<GlobalPsychSession[]>> {
  return fetchProjectEntities<GlobalPsychSession>(
    'global_psych_sessions',
    projectId,
    'updated_at',
    false,
  );
}

export async function addGlobalPsychSession(
  projectId: string,
  data: Pick<
    GlobalPsychSession,
    | 'label'
    | 'unitSystem'
    | 'altitude'
    | 'inputMode'
    | 'inputValues'
    | 'results'
    | 'comfortResult'
    | 'ahuMixedAir'
    | 'ahuCoilLoad'
    | 'notes'
    | 'tags'
  >,
): Promise<ApiResult<GlobalPsychSession>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();
    const { data: row, error } = await supabase
      .from('global_psych_sessions')
      .insert({
        global_project_id: projectId,
        created_by: userId,
        updated_by: userId,
        label: data.label,
        unit_system: data.unitSystem,
        altitude: data.altitude,
        input_mode: data.inputMode,
        input_values: data.inputValues,
        results: data.results,
        comfort_result: data.comfortResult,
        ahu_mixed_air: data.ahuMixedAir ?? null,
        ahu_coil_load: data.ahuCoilLoad ?? null,
        notes: data.notes,
        tags: data.tags,
      })
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalPsychSession>(row));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export function updateGlobalPsychSession(
  id: string,
  data: Partial<
    Pick<
      GlobalPsychSession,
      | 'label'
      | 'unitSystem'
      | 'altitude'
      | 'inputMode'
      | 'inputValues'
      | 'results'
      | 'comfortResult'
      | 'ahuMixedAir'
      | 'ahuCoilLoad'
      | 'notes'
      | 'tags'
    >
  >,
): Promise<ApiResult<GlobalPsychSession>> {
  return updateEntity<GlobalPsychSession>(
    'global_psych_sessions',
    id,
    data as Record<string, unknown>,
  );
}

export function deleteGlobalPsychSession(id: string): Promise<ApiResult<void>> {
  return softDelete('global_psych_sessions', id);
}

// ─── Global Register Calculations ───────────────────────────────────────────

export function fetchGlobalRegisterCalculations(
  projectId: string,
): Promise<ApiResult<GlobalRegisterCalculation[]>> {
  return fetchProjectEntities<GlobalRegisterCalculation>(
    'global_register_calculations',
    projectId,
    'updated_at',
    false,
  );
}

export async function addGlobalRegisterCalculation(
  projectId: string,
  data: Pick<
    GlobalRegisterCalculation,
    'label' | 'module' | 'category' | 'inputs' | 'result' | 'notes' | 'tags'
  >,
): Promise<ApiResult<GlobalRegisterCalculation>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();
    const { data: row, error } = await supabase
      .from('global_register_calculations')
      .insert({
        global_project_id: projectId,
        created_by: userId,
        updated_by: userId,
        label: data.label,
        module: data.module,
        category: data.category,
        inputs: data.inputs,
        result: data.result,
        notes: data.notes,
        tags: data.tags,
      })
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalRegisterCalculation>(row));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export function updateGlobalRegisterCalculation(
  id: string,
  data: Partial<
    Pick<
      GlobalRegisterCalculation,
      'label' | 'module' | 'category' | 'inputs' | 'result' | 'notes' | 'tags'
    >
  >,
): Promise<ApiResult<GlobalRegisterCalculation>> {
  return updateEntity<GlobalRegisterCalculation>(
    'global_register_calculations',
    id,
    data as Record<string, unknown>,
  );
}

export function deleteGlobalRegisterCalculation(id: string): Promise<ApiResult<void>> {
  return softDelete('global_register_calculations', id);
}

// ─── Global Terminal Session Logs ───────────────────────────────────────────

export function fetchGlobalTerminalLogs(
  projectId: string,
): Promise<ApiResult<GlobalTerminalSessionLog[]>> {
  return fetchProjectEntities<GlobalTerminalSessionLog>(
    'global_terminal_session_logs',
    projectId,
    'started_at',
    false,
  );
}

export async function addGlobalTerminalLog(
  projectId: string,
  data: Pick<
    GlobalTerminalSessionLog,
    | 'sessionLabel'
    | 'connectionMode'
    | 'host'
    | 'port'
    | 'serialPort'
    | 'baudRate'
    | 'lineCount'
    | 'logContent'
    | 'startedAt'
    | 'endedAt'
  >,
): Promise<ApiResult<GlobalTerminalSessionLog>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();
    const { data: row, error } = await supabase
      .from('global_terminal_session_logs')
      .insert({
        global_project_id: projectId,
        created_by: userId,
        updated_by: userId,
        session_label: data.sessionLabel,
        connection_mode: data.connectionMode,
        host: data.host,
        port: data.port,
        serial_port: data.serialPort,
        baud_rate: data.baudRate,
        line_count: data.lineCount,
        log_content: data.logContent,
        started_at: data.startedAt || null,
        ended_at: data.endedAt || null,
      })
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalTerminalSessionLog>(row));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export function updateGlobalTerminalLog(
  id: string,
  data: Partial<
    Pick<
      GlobalTerminalSessionLog,
      | 'sessionLabel'
      | 'connectionMode'
      | 'host'
      | 'port'
      | 'serialPort'
      | 'baudRate'
      | 'lineCount'
      | 'logContent'
      | 'startedAt'
      | 'endedAt'
    >
  >,
): Promise<ApiResult<GlobalTerminalSessionLog>> {
  return updateEntity<GlobalTerminalSessionLog>(
    'global_terminal_session_logs',
    id,
    data as Record<string, unknown>,
  );
}

export function deleteGlobalTerminalLog(id: string): Promise<ApiResult<void>> {
  return softDelete('global_terminal_session_logs', id);
}

// ─── Global Trend Sessions ─────────────────────────────────────────────────

export function fetchGlobalTrendSessions(
  projectId: string,
): Promise<ApiResult<GlobalTrendSession[]>> {
  return fetchProjectEntities<GlobalTrendSession>(
    'global_trend_sessions',
    projectId,
    'updated_at',
    false,
  );
}

export async function addGlobalTrendSession(
  projectId: string,
  data: Pick<
    GlobalTrendSession,
    | 'name'
    | 'description'
    | 'sourceSystem'
    | 'series'
    | 'data'
    | 'anomalies'
    | 'anomalyConfig'
    | 'stats'
  >,
): Promise<ApiResult<GlobalTrendSession>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();
    const { data: row, error } = await supabase
      .from('global_trend_sessions')
      .insert({
        global_project_id: projectId,
        created_by: userId,
        updated_by: userId,
        name: data.name,
        description: data.description,
        source_system: data.sourceSystem,
        series: data.series,
        data: data.data,
        anomalies: data.anomalies,
        anomaly_config: data.anomalyConfig,
        stats: data.stats,
      })
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalTrendSession>(row));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export function updateGlobalTrendSession(
  id: string,
  data: Partial<
    Pick<
      GlobalTrendSession,
      | 'name'
      | 'description'
      | 'sourceSystem'
      | 'series'
      | 'data'
      | 'anomalies'
      | 'anomalyConfig'
      | 'stats'
    >
  >,
): Promise<ApiResult<GlobalTrendSession>> {
  return updateEntity<GlobalTrendSession>(
    'global_trend_sessions',
    id,
    data as Record<string, unknown>,
  );
}

export function deleteGlobalTrendSession(id: string): Promise<ApiResult<void>> {
  return softDelete('global_trend_sessions', id);
}

// ─── User Search & Direct Sharing ───────────────────────────────────────────
// Powers the "Share with User" dialog: autocomplete over approved profiles,
// idempotent bulk-add to a global project, admin pending-approval count, and
// recipient-side "what got shared with me since X" list.

export interface SearchableUser {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export async function searchUsersForSharing(
  query: string,
): Promise<ApiResult<SearchableUser[]>> {
  if (query.trim().length < 2) return ok([]);
  try {
    const { data, error } = await getClient().rpc('search_users', { query });
    if (error) return fail(error.message);
    return ok((data ?? []).map((r: unknown) => camelCaseKeys<SearchableUser>(r)));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function shareProjectWithUsers(
  globalProjectId: string,
  userIds: string[],
): Promise<ApiResult<{ added: number; alreadyMember: number }>> {
  if (userIds.length === 0) return ok({ added: 0, alreadyMember: 0 });
  try {
    const supabase = getClient();
    const inviter = await getCurrentUserId();
    const rows = userIds.map((uid) => ({
      global_project_id: globalProjectId,
      user_id: uid,
      role: 'member',
      invited_by: inviter,
    }));
    // ignoreDuplicates: true → Supabase v2 returns only newly-inserted rows
    // in `data`, so `added` = data.length and the rest were already members.
    const { data, error } = await supabase
      .from('global_project_members')
      .upsert(rows, { onConflict: 'global_project_id,user_id', ignoreDuplicates: true })
      .select();
    if (error) return fail(error.message);
    const added = data?.length ?? 0;
    return ok({ added, alreadyMember: userIds.length - added });
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function fetchPendingApprovalsCount(): Promise<ApiResult<number>> {
  try {
    const supabase = getClient();
    const { count, error } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('approved', false);
    if (error) return fail(error.message);
    return ok(count ?? 0);
  } catch (err) {
    return fail((err as Error).message);
  }
}

export interface RecentShare {
  globalProjectId: string;
  projectName: string;
  joinedAt: string;
  invitedBy: string | null;
}

export async function fetchRecentSharesForCurrentUser(
  sinceIso: string,
): Promise<ApiResult<RecentShare[]>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from('global_project_members')
      .select('global_project_id, joined_at, invited_by, global_projects!inner(name)')
      .eq('user_id', userId)
      .gt('joined_at', sinceIso)
      .not('invited_by', 'is', null)
      .order('joined_at', { ascending: false });
    if (error) return fail(error.message);
    const shares: RecentShare[] = (data ?? []).map((r: unknown) => {
      const row = r as {
        global_project_id: string;
        joined_at: string;
        invited_by: string | null;
        global_projects: { name: string } | { name: string }[];
      };
      // Supabase typings sometimes widen embed to an array; normalize both.
      const projects = Array.isArray(row.global_projects)
        ? row.global_projects[0]
        : row.global_projects;
      return {
        globalProjectId: row.global_project_id,
        projectName: projects?.name ?? '',
        joinedAt: row.joined_at,
        invitedBy: row.invited_by,
      };
    });
    return ok(shares);
  } catch (err) {
    return fail((err as Error).message);
  }
}

// ─── Global DXR Entries ─────────────────────────────────────────────────────

export function fetchGlobalDxrs(
  projectId: string,
): Promise<ApiResult<GlobalDxrEntry[]>> {
  return fetchProjectEntities<GlobalDxrEntry>('global_dxrs', projectId, 'name', true);
}

export async function addGlobalDxr(
  projectId: string,
  data: Omit<GlobalDxrEntry, 'id' | 'globalProjectId' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
): Promise<ApiResult<GlobalDxrEntry>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();

    const { data: row, error } = await supabase
      .from('global_dxrs')
      .insert({
        global_project_id: projectId,
        created_by: userId,
        updated_by: userId,
        name: data.name ?? null,
        location: data.location ?? null,
        description: data.description ?? null,
        device_instance_number: data.deviceInstanceNumber ?? null,
        equipment_id: data.equipmentId ?? null,
        serial_number: data.serialNumber ?? null,
        application_template: data.applicationTemplate ?? null,
        application_number: data.applicationNumber ?? null,
        network: data.network ?? null,
        auto_addressing: data.autoAddressing ?? null,
        mac_address: data.macAddress ?? null,
        max_manager_address: data.maxManagerAddress ?? null,
        baud_rate: data.baudRate ?? null,
        room_hierarchy: data.roomHierarchy ?? null,
        room_name: data.roomName ?? null,
        room_description: data.roomDescription ?? null,
        segment_hierarchy: data.segmentHierarchy ?? null,
        segment_name: data.segmentName ?? null,
        segment_description: data.segmentDescription ?? null,
        ms_tp_nw_id: data.msTpNwId ?? null,
        guid: data.guid ?? null,
        imported_from_file_id: data.importedFromFileId ?? null,
      })
      .select()
      .single();

    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalDxrEntry>(row));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export function updateGlobalDxr(
  id: string,
  data: Partial<Omit<GlobalDxrEntry, 'id' | 'globalProjectId' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>>,
): Promise<ApiResult<GlobalDxrEntry>> {
  return updateEntity<GlobalDxrEntry>('global_dxrs', id, data as Record<string, unknown>);
}

export function deleteGlobalDxr(id: string): Promise<ApiResult<void>> {
  return softDelete('global_dxrs', id);
}

/**
 * Bulk upsert DXR rows into global_dxrs, keyed on (global_project_id, guid).
 * Uses Supabase upsert with onConflict: 'global_project_id,guid' (partial index
 * where guid is not null). Rows without a guid are always inserted.
 */
export async function bulkUpsertGlobalDxrs(
  projectId: string,
  rows: Omit<GlobalDxrEntry, 'id' | 'globalProjectId' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>[],
): Promise<ApiResult<{ upserted: number }>> {
  if (rows.length === 0) return ok({ upserted: 0 });
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();

    const insertRows = rows.map((r) => ({
      global_project_id: projectId,
      created_by: userId,
      updated_by: userId,
      name: r.name ?? null,
      location: r.location ?? null,
      description: r.description ?? null,
      device_instance_number: r.deviceInstanceNumber ?? null,
      equipment_id: r.equipmentId ?? null,
      serial_number: r.serialNumber ?? null,
      application_template: r.applicationTemplate ?? null,
      application_number: r.applicationNumber ?? null,
      network: r.network ?? null,
      auto_addressing: r.autoAddressing ?? null,
      mac_address: r.macAddress ?? null,
      max_manager_address: r.maxManagerAddress ?? null,
      baud_rate: r.baudRate ?? null,
      room_hierarchy: r.roomHierarchy ?? null,
      room_name: r.roomName ?? null,
      room_description: r.roomDescription ?? null,
      segment_hierarchy: r.segmentHierarchy ?? null,
      segment_name: r.segmentName ?? null,
      segment_description: r.segmentDescription ?? null,
      ms_tp_nw_id: r.msTpNwId ?? null,
      guid: r.guid ?? null,
      imported_from_file_id: r.importedFromFileId ?? null,
    }));

    const { data, error } = await supabase
      .from('global_dxrs')
      .upsert(insertRows, { onConflict: 'global_project_id,guid' })
      .select('id');

    if (error) return fail(error.message);
    return ok({ upserted: data?.length ?? 0 });
  } catch (err) {
    return fail((err as Error).message);
  }
}
