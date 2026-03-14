import { getSupabaseClient } from '@/lib/supabase/client';
import type {
  GlobalProject,
  GlobalProjectMember,
  GlobalFieldNote,
  GlobalDevice,
  GlobalIpPlanEntry,
  GlobalDailyReport,
  GlobalProjectFile,
  GlobalActivityLogEntry,
  GlobalNetworkDiagram,
} from '@/types/global-projects';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert a snake_case key to camelCase */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** Recursively convert all snake_case keys in an object/array to camelCase */
function camelCaseKeys<T>(obj: unknown): T {
  if (Array.isArray(obj)) {
    return obj.map((item) => camelCaseKeys<T>(item)) as unknown as T;
  }
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    const converted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      converted[toCamelCase(key)] = value;
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
  let code = '';
  for (let i = 0; i < 3; i++) code += chars[Math.floor(Math.random() * chars.length)];
  code += '-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function createGlobalProject(
  data: Pick<GlobalProject, 'name' | 'jobSiteName'> & Partial<Pick<GlobalProject, 'siteAddress' | 'buildingArea' | 'projectNumber' | 'description' | 'tags'>>
): Promise<ApiResult<GlobalProject>> {
  try {
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
  data: Partial<Pick<GlobalProject, 'name' | 'jobSiteName' | 'siteAddress' | 'buildingArea' | 'projectNumber' | 'description' | 'tags' | 'status'>>
): Promise<ApiResult<GlobalProject>> {
  try {
    const supabase = getClient();

    // Build snake_case update payload
    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.jobSiteName !== undefined) update.job_site_name = data.jobSiteName;
    if (data.siteAddress !== undefined) update.site_address = data.siteAddress;
    if (data.buildingArea !== undefined) update.building_area = data.buildingArea;
    if (data.projectNumber !== undefined) update.project_number = data.projectNumber;
    if (data.description !== undefined) update.description = data.description;
    if (data.tags !== undefined) update.tags = data.tags;
    if (data.status !== undefined) update.status = data.status;

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

    const { error } = await supabase
      .from('global_projects')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return fail(error.message);
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

export async function fetchGlobalNotes(projectId: string): Promise<ApiResult<GlobalFieldNote[]>> {
  try {
    const supabase = getClient();

    const { data, error } = await supabase
      .from('global_field_notes')
      .select('*')
      .eq('global_project_id', projectId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalFieldNote[]>(data || []));
  } catch (err) {
    return fail((err as Error).message);
  }
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

export async function updateGlobalNote(
  id: string,
  data: Partial<Pick<GlobalFieldNote, 'content' | 'category' | 'isPinned' | 'tags' | 'fileId'>>
): Promise<ApiResult<GlobalFieldNote>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();

    const update: Record<string, unknown> = { updated_by: userId };
    if (data.content !== undefined) update.content = data.content;
    if (data.category !== undefined) update.category = data.category;
    if (data.isPinned !== undefined) update.is_pinned = data.isPinned;
    if (data.tags !== undefined) update.tags = data.tags;
    if (data.fileId !== undefined) update.file_id = data.fileId;

    const { data: note, error } = await supabase
      .from('global_field_notes')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalFieldNote>(note));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function deleteGlobalNote(id: string): Promise<ApiResult<void>> {
  try {
    const supabase = getClient();

    const { error } = await supabase
      .from('global_field_notes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return fail(error.message);
    return ok(undefined);
  } catch (err) {
    return fail((err as Error).message);
  }
}

// ─── Devices ────────────────────────────────────────────────────────────────

export async function fetchGlobalDevices(projectId: string): Promise<ApiResult<GlobalDevice[]>> {
  try {
    const supabase = getClient();

    const { data, error } = await supabase
      .from('global_devices')
      .select('*')
      .eq('global_project_id', projectId)
      .is('deleted_at', null)
      .order('device_name', { ascending: true });

    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalDevice[]>(data || []));
  } catch (err) {
    return fail((err as Error).message);
  }
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

export async function updateGlobalDevice(
  id: string,
  data: Partial<Pick<GlobalDevice, 'deviceName' | 'description' | 'system' | 'panel' | 'controllerType' | 'macAddress' | 'instanceNumber' | 'ipAddress' | 'floor' | 'area' | 'status' | 'notes'>>
): Promise<ApiResult<GlobalDevice>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();

    const update: Record<string, unknown> = { updated_by: userId };
    if (data.deviceName !== undefined) update.device_name = data.deviceName;
    if (data.description !== undefined) update.description = data.description;
    if (data.system !== undefined) update.system = data.system;
    if (data.panel !== undefined) update.panel = data.panel;
    if (data.controllerType !== undefined) update.controller_type = data.controllerType;
    if (data.macAddress !== undefined) update.mac_address = data.macAddress;
    if (data.instanceNumber !== undefined) update.instance_number = data.instanceNumber;
    if (data.ipAddress !== undefined) update.ip_address = data.ipAddress;
    if (data.floor !== undefined) update.floor = data.floor;
    if (data.area !== undefined) update.area = data.area;
    if (data.status !== undefined) update.status = data.status;
    if (data.notes !== undefined) update.notes = data.notes;

    const { data: device, error } = await supabase
      .from('global_devices')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalDevice>(device));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function deleteGlobalDevice(id: string): Promise<ApiResult<void>> {
  try {
    const supabase = getClient();

    const { error } = await supabase
      .from('global_devices')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return fail(error.message);
    return ok(undefined);
  } catch (err) {
    return fail((err as Error).message);
  }
}

// ─── IP Plan ────────────────────────────────────────────────────────────────

export async function fetchGlobalIpPlan(projectId: string): Promise<ApiResult<GlobalIpPlanEntry[]>> {
  try {
    const supabase = getClient();

    const { data, error } = await supabase
      .from('global_ip_plan')
      .select('*')
      .eq('global_project_id', projectId)
      .is('deleted_at', null)
      .order('ip_address', { ascending: true });

    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalIpPlanEntry[]>(data || []));
  } catch (err) {
    return fail((err as Error).message);
  }
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

export async function updateGlobalIpEntry(
  id: string,
  data: Partial<Pick<GlobalIpPlanEntry, 'ipAddress' | 'hostname' | 'panel' | 'vlan' | 'subnet' | 'deviceRole' | 'macAddress' | 'notes' | 'status'>>
): Promise<ApiResult<GlobalIpPlanEntry>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();

    const update: Record<string, unknown> = { updated_by: userId };
    if (data.ipAddress !== undefined) update.ip_address = data.ipAddress;
    if (data.hostname !== undefined) update.hostname = data.hostname;
    if (data.panel !== undefined) update.panel = data.panel;
    if (data.vlan !== undefined) update.vlan = data.vlan;
    if (data.subnet !== undefined) update.subnet = data.subnet;
    if (data.deviceRole !== undefined) update.device_role = data.deviceRole;
    if (data.macAddress !== undefined) update.mac_address = data.macAddress;
    if (data.notes !== undefined) update.notes = data.notes;
    if (data.status !== undefined) update.status = data.status;

    const { data: entry, error } = await supabase
      .from('global_ip_plan')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalIpPlanEntry>(entry));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function deleteGlobalIpEntry(id: string): Promise<ApiResult<void>> {
  try {
    const supabase = getClient();

    const { error } = await supabase
      .from('global_ip_plan')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return fail(error.message);
    return ok(undefined);
  } catch (err) {
    return fail((err as Error).message);
  }
}

// ─── Daily Reports ──────────────────────────────────────────────────────────

export async function fetchGlobalReports(projectId: string): Promise<ApiResult<GlobalDailyReport[]>> {
  try {
    const supabase = getClient();

    const { data, error } = await supabase
      .from('global_daily_reports')
      .select('*')
      .eq('global_project_id', projectId)
      .is('deleted_at', null)
      .order('date', { ascending: false });

    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalDailyReport[]>(data || []));
  } catch (err) {
    return fail((err as Error).message);
  }
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

export async function updateGlobalReport(
  id: string,
  data: Partial<Omit<GlobalDailyReport, 'id' | 'globalProjectId' | 'createdBy' | 'createdAt' | 'updatedAt' | 'deletedAt'>>
): Promise<ApiResult<GlobalDailyReport>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();

    const update: Record<string, unknown> = { updated_by: userId };
    if (data.date !== undefined) update.date = data.date;
    if (data.reportNumber !== undefined) update.report_number = data.reportNumber;
    if (data.technicianName !== undefined) update.technician_name = data.technicianName;
    if (data.status !== undefined) update.status = data.status;
    if (data.startTime !== undefined) update.start_time = data.startTime;
    if (data.endTime !== undefined) update.end_time = data.endTime;
    if (data.hoursOnSite !== undefined) update.hours_on_site = data.hoursOnSite;
    if (data.location !== undefined) update.location = data.location;
    if (data.weather !== undefined) update.weather = data.weather;
    if (data.workCompleted !== undefined) update.work_completed = data.workCompleted;
    if (data.issuesEncountered !== undefined) update.issues_encountered = data.issuesEncountered;
    if (data.workPlannedNext !== undefined) update.work_planned_next = data.workPlannedNext;
    if (data.coordinationNotes !== undefined) update.coordination_notes = data.coordinationNotes;
    if (data.equipmentWorkedOn !== undefined) update.equipment_worked_on = data.equipmentWorkedOn;
    if (data.deviceIpChanges !== undefined) update.device_ip_changes = data.deviceIpChanges;
    if (data.safetyNotes !== undefined) update.safety_notes = data.safetyNotes;
    if (data.generalNotes !== undefined) update.general_notes = data.generalNotes;
    if (data.attachments !== undefined) update.attachments = data.attachments;

    const { data: report, error } = await supabase
      .from('global_daily_reports')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalDailyReport>(report));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function deleteGlobalReport(id: string): Promise<ApiResult<void>> {
  try {
    const supabase = getClient();

    const { error } = await supabase
      .from('global_daily_reports')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return fail(error.message);
    return ok(undefined);
  } catch (err) {
    return fail((err as Error).message);
  }
}

// ─── Project Files ───────────────────────────────────────────────────────────

export async function fetchGlobalFiles(projectId: string): Promise<ApiResult<GlobalProjectFile[]>> {
  try {
    const supabase = getClient();

    const { data, error } = await supabase
      .from('global_project_files')
      .select('*')
      .eq('global_project_id', projectId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalProjectFile[]>(data || []));
  } catch (err) {
    return fail((err as Error).message);
  }
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

export async function updateGlobalFile(
  id: string,
  data: Partial<Pick<GlobalProjectFile, 'title' | 'category' | 'panelSystem' | 'revisionNumber' | 'revisionDate' | 'notes' | 'tags' | 'status' | 'isPinned'>>
): Promise<ApiResult<GlobalProjectFile>> {
  try {
    const supabase = getClient();
    const userId = await getCurrentUserId();

    const update: Record<string, unknown> = { updated_by: userId };
    if (data.title !== undefined) update.title = data.title;
    if (data.category !== undefined) update.category = data.category;
    if (data.panelSystem !== undefined) update.panel_system = data.panelSystem;
    if (data.revisionNumber !== undefined) update.revision_number = data.revisionNumber;
    if (data.revisionDate !== undefined) update.revision_date = data.revisionDate;
    if (data.notes !== undefined) update.notes = data.notes;
    if (data.tags !== undefined) update.tags = data.tags;
    if (data.status !== undefined) update.status = data.status;
    if (data.isPinned !== undefined) update.is_pinned = data.isPinned;

    const { data: file, error } = await supabase
      .from('global_project_files')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) return fail(error.message);
    return ok(camelCaseKeys<GlobalProjectFile>(file));
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function deleteGlobalFile(id: string): Promise<ApiResult<void>> {
  try {
    const supabase = getClient();

    const { error } = await supabase
      .from('global_project_files')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return fail(error.message);
    return ok(undefined);
  } catch (err) {
    return fail((err as Error).message);
  }
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
