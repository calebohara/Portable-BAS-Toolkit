'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  GlobalProject,
  GlobalProjectMember,
  GlobalFieldNote,
  GlobalDevice,
  GlobalIpPlanEntry,
  GlobalDailyReport,
  GlobalProjectFile,
  GlobalActivityLogEntry,
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
} from '@/lib/global-projects/api';

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
  }, [id]);

  const leave = useCallback(async () => {
    if (!id) return;
    unwrap(await leaveGlobalProject(id));
  }, [id]);

  return { project, loading, update, remove, leave };
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
