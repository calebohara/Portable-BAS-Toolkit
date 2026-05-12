'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  CreateGlobalProjectData,
} from '@/types/global-projects';
import {
  fetchGlobalProjects,
  fetchGlobalProject,
  createGlobalProject,
  updateGlobalProject,
  deleteGlobalProject,
  joinGlobalProject,
  leaveGlobalProject,
  fetchMembers,
  removeMember,
  promoteMember,
  regenerateAccessCode,
  fetchGlobalNotes,
  addGlobalNote,
  updateGlobalNote,
  deleteGlobalNote,
  fetchGlobalDevices,
  addGlobalDevice,
  updateGlobalDevice,
  deleteGlobalDevice,
  fetchGlobalIpPlan,
  addGlobalIpEntry,
  updateGlobalIpEntry,
  deleteGlobalIpEntry,
  fetchGlobalReports,
  addGlobalReport,
  updateGlobalReport,
  deleteGlobalReport,
  fetchGlobalFiles,
  addGlobalFile,
  updateGlobalFile,
  deleteGlobalFile,
  fetchGlobalActivity,
  logGlobalActivity,
  fetchGlobalMessages,
  addGlobalMessage,
  deleteGlobalMessage,
  fetchLastReadAt,
  markMessagesRead,
  fetchGlobalPpcl,
  addGlobalPpcl,
  updateGlobalPpcl,
  deleteGlobalPpcl,
  fetchGlobalTerminalLogs,
  addGlobalTerminalLog,
  updateGlobalTerminalLog,
  deleteGlobalTerminalLog,
  fetchGlobalPidTuningSessions,
  addGlobalPidTuningSession,
  updateGlobalPidTuningSession,
  deleteGlobalPidTuningSession,
  fetchGlobalPsychSessions,
  addGlobalPsychSession,
  updateGlobalPsychSession,
  deleteGlobalPsychSession,
  fetchGlobalRegisterCalculations,
  addGlobalRegisterCalculation,
  updateGlobalRegisterCalculation,
  deleteGlobalRegisterCalculation,
  fetchGlobalPingSessions,
  addGlobalPingSession,
  updateGlobalPingSession,
  deleteGlobalPingSession,
  fetchGlobalTrendSessions,
  addGlobalTrendSession,
  updateGlobalTrendSession,
  deleteGlobalTrendSession,
  fetchGlobalConnectionProfiles,
  addGlobalConnectionProfile,
  updateGlobalConnectionProfile,
  deleteGlobalConnectionProfile,
  fetchGlobalFieldPanels,
  addGlobalFieldPanel,
  updateGlobalFieldPanel,
  deleteGlobalFieldPanel,
  fetchGlobalNotepadEntries,
  addGlobalNotepadEntry,
  updateGlobalNotepadEntry,
  deleteGlobalNotepadEntry,
  fetchGlobalProjectPreferences,
  upsertGlobalProjectPreferences,
  deleteGlobalProjectPreferences,
} from '@/lib/global-projects/api';

/**
 * Membership-changed event.
 *
 * Dispatched after a successful join / leave / create of a global project so
 * the SyncProvider can re-subscribe `SyncManager.subscribeToGlobalRealtime()`
 * with the fresh membership set. The 30s userId-keyed membership cache in
 * `api.ts` stays stale otherwise. `subscribeToGlobalRealtime` is idempotent
 * (it tears down its previous channels first), so re-firing it is safe.
 */
export const GLOBAL_MEMBERSHIP_CHANGED_EVENT = 'bau-suite:global-membership-changed';

function notifyMembershipChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(GLOBAL_MEMBERSHIP_CHANGED_EVENT));
  }
}

/** Unwrap an ApiResult — throws on error so hooks can catch in try/catch */
function unwrap<T>(result: { data: T; error: null } | { data: null; error: string }): T {
  if (result.error !== null) throw new Error(result.error);
  return result.data;
}

/** Build a human-readable diff of changed fields between old and new objects */
function buildChangeSummary(
  oldObj: Record<string, unknown>,
  newData: Record<string, unknown>,
  labelMap?: Record<string, string>,
): string {
  const changes: string[] = [];
  for (const [key, newVal] of Object.entries(newData)) {
    if (newVal === undefined) continue;
    const oldVal = oldObj[key];
    if (String(oldVal ?? '') !== String(newVal ?? '')) {
      const label = labelMap?.[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
      const from = String(oldVal ?? '').slice(0, 80) || '(empty)';
      const to = String(newVal ?? '').slice(0, 80) || '(empty)';
      changes.push(`${label}: "${from}" → "${to}"`);
    }
  }
  return changes.join('\n');
}

/**
 * Subscribe to realtime changes on a Supabase table.
 * Returns a cleanup function for useEffect.
 */
function useRealtimeRefresh(
  table: string,
  refresh: () => void,
  filter?: string,
) {
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;

    const channelName = filter ? `rt-${table}-${filter}` : `rt-${table}`;
    const subConfig: {
      event: '*';
      schema: 'public';
      table: string;
      filter?: string;
    } = { event: '*', schema: 'public', table };
    if (filter) subConfig.filter = filter;

    const channel = client
      .channel(channelName)
      .on('postgres_changes', subConfig, () => { refresh(); })
      .subscribe();

    return () => { client.removeChannel(channel); };
  }, [table, refresh, filter]);
}

// ─── useGlobalProjects ─────────────────────────────────────
export function useGlobalProjects() {
  const [projects, setProjects] = useState<GlobalProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = unwrap(await fetchGlobalProjects());
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch global projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createProject = useCallback(
    async (data: CreateGlobalProjectData) => {
      const project = unwrap(await createGlobalProject(data));
      try { await logGlobalActivity(project.id, 'created the project', `Project: "${project.name}"`); } catch {}
      notifyMembershipChanged();
      await refresh();
      return project;
    },
    [refresh],
  );

  const joinProject = useCallback(
    async (code: string) => {
      const result = unwrap(await joinGlobalProject(code));
      if (result.projectId) {
        try { await logGlobalActivity(result.projectId, 'joined the project', ''); } catch {}
      }
      notifyMembershipChanged();
      await refresh();
      return result;
    },
    [refresh],
  );

  return { projects, loading, error, refresh, createProject, joinProject };
}

// ─── useGlobalProject ──────────────────────────────────────
export function useGlobalProject(id: string | undefined) {
  const [project, setProject] = useState<(GlobalProject & { members: GlobalProjectMember[] }) | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) {
      setProject(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = unwrap(await fetchGlobalProject(id));
      setProject(data);
    } catch {
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Per-user preferences are stored in `global_project_preferences` and merged
  // onto the returned project so consumers can read `project.isPinned` /
  // `project.isOfflineAvailable` without a separate hook call.
  const { isPinned, isOfflineAvailable } = useGlobalProjectPreferences(id);

  const decoratedProject = useMemo(() => {
    if (!project) return null;
    return { ...project, isPinned, isOfflineAvailable };
  }, [project, isPinned, isOfflineAvailable]);

  const update = useCallback(
    async (data: Partial<GlobalProject>) => {
      if (!id) return;
      unwrap(await updateGlobalProject(id, data));
      await load();
    },
    [id, load],
  );

  const remove = useCallback(async () => {
    if (!id) return;
    unwrap(await deleteGlobalProject(id));
    notifyMembershipChanged();
  }, [id]);

  const leave = useCallback(async () => {
    if (!id) return;
    unwrap(await leaveGlobalProject(id));
    notifyMembershipChanged();
  }, [id]);

  return { project: decoratedProject, loading, update, remove, leave };
}

// ─── useGlobalProjectMembers ───────────────────────────────
export function useGlobalProjectMembers(projectId: string | undefined) {
  const [members, setMembers] = useState<GlobalProjectMember[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setMembers([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = unwrap(await fetchMembers(projectId));
      setMembers(data);
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime: refresh when members change for this project
  useRealtimeRefresh('global_project_members', refresh, projectId ? `global_project_id=eq.${projectId}` : undefined);

  const removeMemberFn = useCallback(
    async (userId: string) => {
      if (!projectId) return;
      unwrap(await removeMember(projectId, userId));
      await refresh();
    },
    [projectId, refresh],
  );

  const promoteMemberFn = useCallback(
    async (userId: string) => {
      if (!projectId) return;
      unwrap(await promoteMember(projectId, userId));
      await refresh();
    },
    [projectId, refresh],
  );

  const regenerateCode = useCallback(async () => {
    if (!projectId) return '';
    const code = unwrap(await regenerateAccessCode(projectId));
    return code;
  }, [projectId]);

  return {
    members,
    loading,
    removeMember: removeMemberFn,
    promoteMember: promoteMemberFn,
    regenerateCode,
  };
}

// ─── useGlobalProjectNotes ─────────────────────────────────
export function useGlobalProjectNotes(projectId: string | undefined) {
  const [notes, setNotes] = useState<GlobalFieldNote[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setNotes([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = unwrap(await fetchGlobalNotes(projectId));
      setNotes(data);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime: refresh when notes change for this project
  useRealtimeRefresh('global_field_notes', refresh, projectId ? `global_project_id=eq.${projectId}` : undefined);

  const addNoteFn = useCallback(
    async (data: Omit<GlobalFieldNote, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'globalProjectId'>) => {
      if (!projectId) return;
      const note = unwrap(await addGlobalNote(projectId, data));
      // Log activity
      try { await logGlobalActivity(projectId, 'added a note', `Category: ${data.category || 'general'}\nContent: "${(data.content || '').slice(0, 100)}"`); } catch {}
      await refresh();
      return note;
    },
    [projectId, refresh],
  );

  const updateNoteFn = useCallback(
    async (id: string, data: Partial<GlobalFieldNote>) => {
      if (!projectId) return;
      // Capture old state for diff
      const oldNote = notes.find((n) => n.id === id);
      unwrap(await updateGlobalNote(id, data));
      // Log activity with diff
      if (oldNote) {
        const diff = buildChangeSummary(oldNote as unknown as Record<string, unknown>, data as Record<string, unknown>);
        if (diff) {
          try { await logGlobalActivity(projectId, 'edited a note', diff); } catch {}
        }
      }
      await refresh();
    },
    [projectId, notes, refresh],
  );

  const removeNote = useCallback(
    async (id: string) => {
      if (!projectId) return;
      const oldNote = notes.find((n) => n.id === id);
      unwrap(await deleteGlobalNote(id));
      try { await logGlobalActivity(projectId, 'deleted a note', oldNote ? `Content: "${oldNote.content.slice(0, 100)}"` : ''); } catch {}
      await refresh();
    },
    [projectId, notes, refresh],
  );

  return { notes, loading, addNote: addNoteFn, updateNote: updateNoteFn, removeNote };
}

// ─── useGlobalProjectDevices ───────────────────────────────
export function useGlobalProjectDevices(projectId: string | undefined) {
  const [devices, setDevices] = useState<GlobalDevice[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setDevices([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = unwrap(await fetchGlobalDevices(projectId));
      setDevices(data);
    } catch {
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime: refresh when devices change for this project
  useRealtimeRefresh('global_devices', refresh, projectId ? `global_project_id=eq.${projectId}` : undefined);

  const addDeviceFn = useCallback(
    async (data: Omit<GlobalDevice, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'globalProjectId'>) => {
      if (!projectId) return;
      const device = unwrap(await addGlobalDevice(projectId, data));
      try { await logGlobalActivity(projectId, 'added a device', `Device: "${data.deviceName || ''}"`); } catch {}
      await refresh();
      return device;
    },
    [projectId, refresh],
  );

  const updateDeviceFn = useCallback(
    async (id: string, data: Partial<GlobalDevice>) => {
      if (!projectId) return;
      const oldDevice = devices.find((d) => d.id === id);
      unwrap(await updateGlobalDevice(id, data));
      if (oldDevice) {
        const diff = buildChangeSummary(oldDevice as unknown as Record<string, unknown>, data as Record<string, unknown>);
        if (diff) {
          try { await logGlobalActivity(projectId, `edited device "${oldDevice.deviceName}"`, diff); } catch {}
        }
      }
      await refresh();
    },
    [projectId, devices, refresh],
  );

  const removeDevice = useCallback(
    async (id: string) => {
      if (!projectId) return;
      const oldDevice = devices.find((d) => d.id === id);
      unwrap(await deleteGlobalDevice(id));
      try { await logGlobalActivity(projectId, 'deleted a device', oldDevice ? `Device: "${oldDevice.deviceName}"` : ''); } catch {}
      await refresh();
    },
    [projectId, devices, refresh],
  );

  return { devices, loading, addDevice: addDeviceFn, updateDevice: updateDeviceFn, removeDevice };
}

// ─── useGlobalProjectIpPlan ────────────────────────────────
export function useGlobalProjectIpPlan(projectId: string | undefined) {
  const [entries, setEntries] = useState<GlobalIpPlanEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = unwrap(await fetchGlobalIpPlan(projectId));
      setEntries(data);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime: refresh when IP plan entries change for this project
  useRealtimeRefresh('global_ip_plan', refresh, projectId ? `global_project_id=eq.${projectId}` : undefined);

  const addEntryFn = useCallback(
    async (data: Omit<GlobalIpPlanEntry, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'globalProjectId'>) => {
      if (!projectId) return;
      const entry = unwrap(await addGlobalIpEntry(projectId, data));
      try { await logGlobalActivity(projectId, 'added an IP entry', `IP: ${data.ipAddress || ''} — Hostname: ${data.hostname || ''}`); } catch {}
      await refresh();
      return entry;
    },
    [projectId, refresh],
  );

  const updateEntryFn = useCallback(
    async (id: string, data: Partial<GlobalIpPlanEntry>) => {
      if (!projectId) return;
      const oldEntry = entries.find((e) => e.id === id);
      unwrap(await updateGlobalIpEntry(id, data));
      if (oldEntry) {
        const diff = buildChangeSummary(oldEntry as unknown as Record<string, unknown>, data as Record<string, unknown>);
        if (diff) {
          try { await logGlobalActivity(projectId, `edited IP entry "${oldEntry.ipAddress}"`, diff); } catch {}
        }
      }
      await refresh();
    },
    [projectId, entries, refresh],
  );

  const removeEntry = useCallback(
    async (id: string) => {
      if (!projectId) return;
      const oldEntry = entries.find((e) => e.id === id);
      unwrap(await deleteGlobalIpEntry(id));
      try { await logGlobalActivity(projectId, 'deleted an IP entry', oldEntry ? `IP: ${oldEntry.ipAddress}` : ''); } catch {}
      await refresh();
    },
    [projectId, entries, refresh],
  );

  return { entries, loading, addEntry: addEntryFn, updateEntry: updateEntryFn, removeEntry };
}

// ─── useGlobalProjectReports ───────────────────────────────
export function useGlobalProjectReports(projectId: string | undefined) {
  const [reports, setReports] = useState<GlobalDailyReport[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setReports([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = unwrap(await fetchGlobalReports(projectId));
      setReports(data);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime: refresh when reports change for this project
  useRealtimeRefresh('global_daily_reports', refresh, projectId ? `global_project_id=eq.${projectId}` : undefined);

  const addReportFn = useCallback(
    async (data: Omit<GlobalDailyReport, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'globalProjectId'>) => {
      if (!projectId) return;
      const report = unwrap(await addGlobalReport(projectId, data));
      try { await logGlobalActivity(projectId, 'added a daily report', `Date: ${data.date || ''}\nTechnician: "${(data.technicianName || '').slice(0, 100)}"`); } catch {}
      await refresh();
      return report;
    },
    [projectId, refresh],
  );

  const updateReportFn = useCallback(
    async (id: string, data: Partial<GlobalDailyReport>) => {
      if (!projectId) return;
      const oldReport = reports.find((r) => r.id === id);
      unwrap(await updateGlobalReport(id, data));
      if (oldReport) {
        const diff = buildChangeSummary(oldReport as unknown as Record<string, unknown>, data as Record<string, unknown>);
        if (diff) {
          try { await logGlobalActivity(projectId, 'edited a daily report', diff); } catch {}
        }
      }
      await refresh();
    },
    [projectId, reports, refresh],
  );

  const removeReport = useCallback(
    async (id: string) => {
      if (!projectId) return;
      const oldReport = reports.find((r) => r.id === id);
      unwrap(await deleteGlobalReport(id));
      try { await logGlobalActivity(projectId, 'removed a daily report', oldReport ? `Date: ${oldReport.date}` : ''); } catch {}
      await refresh();
    },
    [projectId, reports, refresh],
  );

  return { reports, loading, addReport: addReportFn, updateReport: updateReportFn, removeReport };
}

// ─── useGlobalProjectFiles ─────────────────────────────────
export function useGlobalProjectFiles(projectId: string | undefined) {
  const [files, setFiles] = useState<GlobalProjectFile[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setFiles([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = unwrap(await fetchGlobalFiles(projectId));
      setFiles(data);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime: refresh when files change for this project
  useRealtimeRefresh('global_project_files', refresh, projectId ? `global_project_id=eq.${projectId}` : undefined);

  const addFileFn = useCallback(
    async (data: Omit<GlobalProjectFile, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'globalProjectId' | 'versions'>) => {
      if (!projectId) return;
      const file = unwrap(await addGlobalFile(projectId, data));
      try { await logGlobalActivity(projectId, 'uploaded a file', `File: "${data.title || data.fileName || ''}"`); } catch {}
      await refresh();
      return file;
    },
    [projectId, refresh],
  );

  const updateFileFn = useCallback(
    async (id: string, data: Partial<GlobalProjectFile>) => {
      if (!projectId) return;
      const oldFile = files.find((f) => f.id === id);
      unwrap(await updateGlobalFile(id, data));
      if (oldFile) {
        const diff = buildChangeSummary(oldFile as unknown as Record<string, unknown>, data as Record<string, unknown>);
        if (diff) {
          try { await logGlobalActivity(projectId, 'edited a file', diff); } catch {}
        }
      }
      await refresh();
    },
    [projectId, files, refresh],
  );

  const removeFileFn = useCallback(
    async (id: string) => {
      if (!projectId) return;
      const oldFile = files.find((f) => f.id === id);
      unwrap(await deleteGlobalFile(id));
      try { await logGlobalActivity(projectId, 'removed a file', oldFile ? `File: "${oldFile.title || oldFile.fileName}"` : ''); } catch {}
      await refresh();
    },
    [projectId, files, refresh],
  );

  return { files, loading, addFile: addFileFn, updateFile: updateFileFn, removeFile: removeFileFn };
}

// ─── useGlobalProjectActivity ──────────────────────────────
export function useGlobalProjectActivity(projectId: string | undefined) {
  const [activity, setActivity] = useState<GlobalActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setActivity([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = unwrap(await fetchGlobalActivity(projectId));
      setActivity(data);
    } catch {
      setActivity([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime: refresh when activity log changes for this project
  useRealtimeRefresh('global_activity_log', refresh, projectId ? `global_project_id=eq.${projectId}` : undefined);

  const logActivityFn = useCallback(
    async (action: string, details: string) => {
      if (!projectId) return;
      try {
        unwrap(await logGlobalActivity(projectId, action, details));
        await refresh();
      } catch {
        // Activity logging should never break the caller
      }
    },
    [projectId, refresh],
  );

  return { activity, loading, logActivity: logActivityFn };
}

// ─── useGlobalProjectPpcl ──────────────────────────────────
export function useGlobalProjectPpcl(projectId: string | undefined) {
  const [documents, setDocuments] = useState<GlobalPpclDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = unwrap(await fetchGlobalPpcl(projectId));
      setDocuments(data);
      setError(null);
    } catch (err) {
      setDocuments([]);
      setError(err instanceof Error ? err.message : 'Failed to fetch PPCL documents');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  useRealtimeRefresh('global_ppcl_documents', refresh, projectId ? `global_project_id=eq.${projectId}` : undefined);

  const addDocument = useCallback(
    async (data: Parameters<typeof addGlobalPpcl>[1]) => {
      if (!projectId) return;
      const doc = unwrap(await addGlobalPpcl(projectId, data));
      await refresh();
      return doc;
    },
    [projectId, refresh],
  );

  const updateDocument = useCallback(
    async (id: string, data: Parameters<typeof updateGlobalPpcl>[1]) => {
      const doc = unwrap(await updateGlobalPpcl(id, data));
      await refresh();
      return doc;
    },
    [refresh],
  );

  const removeDocument = useCallback(
    async (id: string) => {
      unwrap(await deleteGlobalPpcl(id));
      await refresh();
    },
    [refresh],
  );

  return { documents, loading, error, refresh, addDocument, updateDocument, removeDocument };
}

// ─── useGlobalProjectTerminalLogs ──────────────────────────
export function useGlobalProjectTerminalLogs(projectId: string | undefined) {
  const [logs, setLogs] = useState<GlobalTerminalSessionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setLogs([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = unwrap(await fetchGlobalTerminalLogs(projectId));
      setLogs(data);
      setError(null);
    } catch (err) {
      setLogs([]);
      setError(err instanceof Error ? err.message : 'Failed to fetch terminal logs');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  useRealtimeRefresh('global_terminal_session_logs', refresh, projectId ? `global_project_id=eq.${projectId}` : undefined);

  const addLog = useCallback(
    async (data: Parameters<typeof addGlobalTerminalLog>[1]) => {
      if (!projectId) return;
      const log = unwrap(await addGlobalTerminalLog(projectId, data));
      await refresh();
      return log;
    },
    [projectId, refresh],
  );

  const updateLog = useCallback(
    async (id: string, data: Parameters<typeof updateGlobalTerminalLog>[1]) => {
      const log = unwrap(await updateGlobalTerminalLog(id, data));
      await refresh();
      return log;
    },
    [refresh],
  );

  const removeLog = useCallback(
    async (id: string) => {
      unwrap(await deleteGlobalTerminalLog(id));
      await refresh();
    },
    [refresh],
  );

  return { logs, loading, error, refresh, addLog, updateLog, removeLog };
}

// ─── useGlobalProjectPidTuningSessions ───────────────────────────
export function useGlobalProjectPidTuningSessions(projectId: string | undefined) {
  const [sessions, setSessions] = useState<GlobalPidTuningSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setSessions([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = unwrap(await fetchGlobalPidTuningSessions(projectId));
      setSessions(data);
      setError(null);
    } catch (err) {
      setSessions([]);
      setError(err instanceof Error ? err.message : 'Failed to fetch PID sessions');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  useRealtimeRefresh('global_pid_tuning_sessions', refresh, projectId ? `global_project_id=eq.${projectId}` : undefined);

  const addSession = useCallback(
    async (data: Parameters<typeof addGlobalPidTuningSession>[1]) => {
      if (!projectId) return;
      const session = unwrap(await addGlobalPidTuningSession(projectId, data));
      await refresh();
      return session;
    },
    [projectId, refresh],
  );

  const updateSession = useCallback(
    async (id: string, data: Parameters<typeof updateGlobalPidTuningSession>[1]) => {
      const session = unwrap(await updateGlobalPidTuningSession(id, data));
      await refresh();
      return session;
    },
    [refresh],
  );

  const removeSession = useCallback(
    async (id: string) => {
      unwrap(await deleteGlobalPidTuningSession(id));
      await refresh();
    },
    [refresh],
  );

  return { sessions, loading, error, refresh, addSession, updateSession, removeSession };
}

// ─── useGlobalProjectPsychSessions ─────────────────────────
export function useGlobalProjectPsychSessions(projectId: string | undefined) {
  const [sessions, setSessions] = useState<GlobalPsychSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setSessions([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = unwrap(await fetchGlobalPsychSessions(projectId));
      setSessions(data);
      setError(null);
    } catch (err) {
      setSessions([]);
      setError(err instanceof Error ? err.message : 'Failed to fetch psych sessions');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  useRealtimeRefresh('global_psych_sessions', refresh, projectId ? `global_project_id=eq.${projectId}` : undefined);

  const addSession = useCallback(
    async (data: Parameters<typeof addGlobalPsychSession>[1]) => {
      if (!projectId) return;
      const session = unwrap(await addGlobalPsychSession(projectId, data));
      await refresh();
      return session;
    },
    [projectId, refresh],
  );

  const updateSession = useCallback(
    async (id: string, data: Parameters<typeof updateGlobalPsychSession>[1]) => {
      const session = unwrap(await updateGlobalPsychSession(id, data));
      await refresh();
      return session;
    },
    [refresh],
  );

  const removeSession = useCallback(
    async (id: string) => {
      unwrap(await deleteGlobalPsychSession(id));
      await refresh();
    },
    [refresh],
  );

  return { sessions, loading, error, refresh, addSession, updateSession, removeSession };
}

// ─── useGlobalProjectRegisterCalculations ─────────────────────────
export function useGlobalProjectRegisterCalculations(projectId: string | undefined) {
  const [calculations, setCalculations] = useState<GlobalRegisterCalculation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setCalculations([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = unwrap(await fetchGlobalRegisterCalculations(projectId));
      setCalculations(data);
      setError(null);
    } catch (err) {
      setCalculations([]);
      setError(err instanceof Error ? err.message : 'Failed to fetch register calculations');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  useRealtimeRefresh('global_register_calculations', refresh, projectId ? `global_project_id=eq.${projectId}` : undefined);

  const addCalculation = useCallback(
    async (data: Parameters<typeof addGlobalRegisterCalculation>[1]) => {
      if (!projectId) return;
      const calc = unwrap(await addGlobalRegisterCalculation(projectId, data));
      await refresh();
      return calc;
    },
    [projectId, refresh],
  );

  const updateCalculation = useCallback(
    async (id: string, data: Parameters<typeof updateGlobalRegisterCalculation>[1]) => {
      const calc = unwrap(await updateGlobalRegisterCalculation(id, data));
      await refresh();
      return calc;
    },
    [refresh],
  );

  const removeCalculation = useCallback(
    async (id: string) => {
      unwrap(await deleteGlobalRegisterCalculation(id));
      await refresh();
    },
    [refresh],
  );

  return { calculations, loading, error, refresh, addCalculation, updateCalculation, removeCalculation };
}

// ─── useGlobalProjectPingSessions ──────────────────────────
export function useGlobalProjectPingSessions(projectId: string | undefined) {
  const [sessions, setSessions] = useState<GlobalPingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setSessions([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = unwrap(await fetchGlobalPingSessions(projectId));
      setSessions(data);
      setError(null);
    } catch (err) {
      setSessions([]);
      setError(err instanceof Error ? err.message : 'Failed to fetch ping sessions');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  useRealtimeRefresh('global_ping_sessions', refresh, projectId ? `global_project_id=eq.${projectId}` : undefined);

  const addSession = useCallback(
    async (data: Parameters<typeof addGlobalPingSession>[1]) => {
      if (!projectId) return;
      const session = unwrap(await addGlobalPingSession(projectId, data));
      await refresh();
      return session;
    },
    [projectId, refresh],
  );

  const updateSession = useCallback(
    async (id: string, data: Parameters<typeof updateGlobalPingSession>[1]) => {
      const session = unwrap(await updateGlobalPingSession(id, data));
      await refresh();
      return session;
    },
    [refresh],
  );

  const removeSession = useCallback(
    async (id: string) => {
      unwrap(await deleteGlobalPingSession(id));
      await refresh();
    },
    [refresh],
  );

  return { sessions, loading, error, refresh, addSession, updateSession, removeSession };
}

// ─── useGlobalProjectTrendSessions ─────────────────────────
export function useGlobalProjectTrendSessions(projectId: string | undefined) {
  const [sessions, setSessions] = useState<GlobalTrendSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setSessions([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = unwrap(await fetchGlobalTrendSessions(projectId));
      setSessions(data);
      setError(null);
    } catch (err) {
      setSessions([]);
      setError(err instanceof Error ? err.message : 'Failed to fetch trend sessions');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  useRealtimeRefresh('global_trend_sessions', refresh, projectId ? `global_project_id=eq.${projectId}` : undefined);

  const addSession = useCallback(
    async (data: Parameters<typeof addGlobalTrendSession>[1]) => {
      if (!projectId) return;
      const session = unwrap(await addGlobalTrendSession(projectId, data));
      await refresh();
      return session;
    },
    [projectId, refresh],
  );

  const updateSession = useCallback(
    async (id: string, data: Parameters<typeof updateGlobalTrendSession>[1]) => {
      const session = unwrap(await updateGlobalTrendSession(id, data));
      await refresh();
      return session;
    },
    [refresh],
  );

  const removeSession = useCallback(
    async (id: string) => {
      unwrap(await deleteGlobalTrendSession(id));
      await refresh();
    },
    [refresh],
  );

  return { sessions, loading, error, refresh, addSession, updateSession, removeSession };
}

// ─── useGlobalProjectConnectionProfiles ────────────────────
export function useGlobalProjectConnectionProfiles(projectId: string | undefined) {
  const [profiles, setProfiles] = useState<GlobalConnectionProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setProfiles([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = unwrap(await fetchGlobalConnectionProfiles(projectId));
      setProfiles(data);
      setError(null);
    } catch (err) {
      setProfiles([]);
      setError(err instanceof Error ? err.message : 'Failed to fetch connection profiles');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  useRealtimeRefresh('global_connection_profiles', refresh, projectId ? `global_project_id=eq.${projectId}` : undefined);

  const addProfile = useCallback(
    async (data: Parameters<typeof addGlobalConnectionProfile>[1]) => {
      if (!projectId) return;
      const profile = unwrap(await addGlobalConnectionProfile(projectId, data));
      await refresh();
      return profile;
    },
    [projectId, refresh],
  );

  const updateProfile = useCallback(
    async (id: string, data: Parameters<typeof updateGlobalConnectionProfile>[1]) => {
      const profile = unwrap(await updateGlobalConnectionProfile(id, data));
      await refresh();
      return profile;
    },
    [refresh],
  );

  const removeProfile = useCallback(
    async (id: string) => {
      unwrap(await deleteGlobalConnectionProfile(id));
      await refresh();
    },
    [refresh],
  );

  return { profiles, loading, error, refresh, addProfile, updateProfile, removeProfile };
}

// ─── useGlobalProjectFieldPanels ───────────────────────────
export function useGlobalProjectFieldPanels(projectId: string | undefined) {
  const [panels, setPanels] = useState<GlobalFieldPanel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setPanels([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = unwrap(await fetchGlobalFieldPanels(projectId));
      setPanels(data);
      setError(null);
    } catch (err) {
      setPanels([]);
      setError(err instanceof Error ? err.message : 'Failed to fetch field panels');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  useRealtimeRefresh('global_field_panels', refresh, projectId ? `global_project_id=eq.${projectId}` : undefined);

  const addPanel = useCallback(
    async (data: Parameters<typeof addGlobalFieldPanel>[1]) => {
      if (!projectId) return;
      const panel = unwrap(await addGlobalFieldPanel(projectId, data));
      await refresh();
      return panel;
    },
    [projectId, refresh],
  );

  const updatePanel = useCallback(
    async (id: string, data: Parameters<typeof updateGlobalFieldPanel>[1]) => {
      const panel = unwrap(await updateGlobalFieldPanel(id, data));
      await refresh();
      return panel;
    },
    [refresh],
  );

  const removePanel = useCallback(
    async (id: string) => {
      unwrap(await deleteGlobalFieldPanel(id));
      await refresh();
    },
    [refresh],
  );

  return { panels, loading, error, refresh, addPanel, updatePanel, removePanel };
}

// ─── useGlobalProjectNotepadEntries ────────────────────────
export function useGlobalProjectNotepadEntries(projectId: string | undefined) {
  const [entries, setEntries] = useState<GlobalNotepadEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = unwrap(await fetchGlobalNotepadEntries(projectId));
      setEntries(data);
      setError(null);
    } catch (err) {
      setEntries([]);
      setError(err instanceof Error ? err.message : 'Failed to fetch notepad entries');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  useRealtimeRefresh('global_project_notepad_entries', refresh, projectId ? `global_project_id=eq.${projectId}` : undefined);

  const addEntry = useCallback(
    async (data: Parameters<typeof addGlobalNotepadEntry>[1]) => {
      if (!projectId) return;
      const entry = unwrap(await addGlobalNotepadEntry(projectId, data));
      await refresh();
      return entry;
    },
    [projectId, refresh],
  );

  const updateEntry = useCallback(
    async (id: string, data: Parameters<typeof updateGlobalNotepadEntry>[1]) => {
      const entry = unwrap(await updateGlobalNotepadEntry(id, data));
      await refresh();
      return entry;
    },
    [refresh],
  );

  const removeEntry = useCallback(
    async (id: string) => {
      unwrap(await deleteGlobalNotepadEntry(id));
      await refresh();
    },
    [refresh],
  );

  return { entries, loading, error, refresh, addEntry, updateEntry, removeEntry };
}

// ─── useGlobalProjectPreferences ───────────────────────────
/**
 * Per-user preferences for a global project (pinned, offline-cached, last-viewed-tab).
 *
 * Backed by `global_project_preferences (user_id, global_project_id)`. The
 * Supabase Realtime filter syntax only supports a single equality filter per
 * channel, so we filter on `global_project_id` and rely on RLS to scope rows
 * to the current user.
 */
export function useGlobalProjectPreferences(projectId: string | undefined) {
  const [preferences, setPreferences] = useState<GlobalProjectPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setPreferences(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = unwrap(await fetchGlobalProjectPreferences(projectId));
      setPreferences(data);
    } catch {
      setPreferences(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  useRealtimeRefresh(
    'global_project_preferences',
    refresh,
    projectId ? `global_project_id=eq.${projectId}` : undefined,
  );

  const update = useCallback(
    async (data: Parameters<typeof upsertGlobalProjectPreferences>[1]) => {
      if (!projectId) return;
      const prefs = unwrap(await upsertGlobalProjectPreferences(projectId, data));
      await refresh();
      return prefs;
    },
    [projectId, refresh],
  );

  const reset = useCallback(async () => {
    if (!projectId) return;
    unwrap(await deleteGlobalProjectPreferences(projectId));
    setPreferences(null);
  }, [projectId]);

  // Convenience accessors with safe defaults so callers don't have to null-check.
  const isPinned = preferences?.isPinned ?? false;
  const isOfflineAvailable = preferences?.isOfflineAvailable ?? false;
  const lastViewedTab = preferences?.lastViewedTab ?? null;

  return {
    preferences,
    isPinned,
    isOfflineAvailable,
    lastViewedTab,
    loading,
    refresh,
    update,
    reset,
  };
}

// ─── useGlobalProjectsList ─────────────────────────────────
export function useGlobalProjectsList() {
  const [projects, setProjects] = useState<GlobalProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = unwrap(await fetchGlobalProjects());
        if (!cancelled) setProjects(data);
      } catch {
        if (!cancelled) setProjects([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { projects, loading };
}

// ─── useGlobalMessages ────────────────────────────────────────

/** Organize flat messages into threaded structure (single-depth only) */
function threadMessages(flat: GlobalMessage[]): GlobalMessage[] {
  const topLevel: GlobalMessage[] = [];
  const replyMap = new Map<string, GlobalMessage[]>();

  for (const msg of flat) {
    if (msg.parentId) {
      const existing = replyMap.get(msg.parentId) || [];
      existing.push(msg);
      replyMap.set(msg.parentId, existing);
    } else {
      topLevel.push(msg);
    }
  }

  // Attach replies to parents
  for (const msg of topLevel) {
    const replies = replyMap.get(msg.id) || [];
    // Sort replies oldest first
    replies.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    msg.replies = replies;
    msg.replyCount = replies.length;
  }

  return topLevel;
}

export function useGlobalMessages() {
  const [messages, setMessages] = useState<GlobalMessage[]>([]);
  const [allFlat, setAllFlat] = useState<GlobalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const messagesResult = await fetchGlobalMessages();
      const data = unwrap(messagesResult);

      // Read tracking is non-critical — don't let it break message loading
      let readAt: string | null = null;
      try {
        const readResult = await fetchLastReadAt();
        readAt = unwrap(readResult);
      } catch {
        // global_message_reads table may not exist yet — gracefully degrade
      }

      setAllFlat(data);
      setMessages(threadMessages(data));
      setLastReadAt(readAt);

      // Count unread: messages created after last_read_at (or all if never read)
      if (readAt) {
        const readTime = new Date(readAt).getTime();
        setUnreadCount(data.filter((m) => new Date(m.createdAt).getTime() > readTime).length);
      } else {
        setUnreadCount(data.length);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch messages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime: refresh when any global message is inserted, updated, or deleted
  useRealtimeRefresh('global_messages', refresh);

  const postMessage = useCallback(
    async (subject: string, body: string, globalProjectId?: string | null, parentId?: string | null) => {
      const message = unwrap(await addGlobalMessage(subject, body, globalProjectId, parentId));
      // Optimistic update: add to flat list and re-thread
      setAllFlat((prev) => {
        const next = [message, ...prev];
        setMessages(threadMessages(next));
        return next;
      });
      return message;
    },
    [],
  );

  const removeMessage = useCallback(
    async (messageId: string) => {
      unwrap(await deleteGlobalMessage(messageId));
      setAllFlat((prev) => {
        const next = prev.filter((m) => m.id !== messageId && m.parentId !== messageId);
        setMessages(threadMessages(next));
        return next;
      });
    },
    [],
  );

  const markRead = useCallback(async () => {
    try {
      unwrap(await markMessagesRead());
      setLastReadAt(new Date().toISOString());
      setUnreadCount(0);
    } catch {
      // Non-critical — don't break the UI
    }
  }, []);

  return { messages, loading, error, unreadCount, lastReadAt, refresh, postMessage, removeMessage, markRead };
}
