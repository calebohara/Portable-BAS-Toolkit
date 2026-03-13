'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Project, ProjectFile, FieldNote, DeviceEntry, IpPlanEntry, ActivityLogEntry, DailyReport, NetworkDiagram, CommandSnippet, PingSession, TerminalSessionLog, ConnectionProfile } from '@/types';
import * as db from '@/lib/db';
import { onPullComplete } from '@/lib/sync/sync-bridge';
import { v4 as uuid } from 'uuid';

/** Auto-refresh hook data when pull sync writes new data to IndexedDB */
function usePullRefresh(refresh: () => void) {
  useEffect(() => onPullComplete(refresh), [refresh]);
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = await db.getAllProjects();
      setProjects(all);
    } catch (e) {
      console.error('Failed to load projects:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePullRefresh(refresh);

  const createProject = useCallback(async (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const project: Project = { ...data, id: uuid(), createdAt: now, updatedAt: now };
    try {
      await db.saveProject(project);
      await db.addActivity({
        id: uuid(), projectId: project.id, action: 'Project created',
        details: `Project ${project.projectNumber} created`, timestamp: now, user: 'User',
      });
    } catch (e) {
      console.error('Failed to create project:', e);
      throw e;
    }
    await refresh();
    return project;
  }, [refresh]);

  const updateProject = useCallback(async (project: Project) => {
    project.updatedAt = new Date().toISOString();
    try {
      await db.saveProject(project);
    } catch (e) {
      console.error('Failed to update project:', e);
      throw e;
    }
    await refresh();
  }, [refresh]);

  const removeProject = useCallback(async (id: string) => {
    try {
      await db.deleteProject(id);
    } catch (e) {
      console.error('Failed to delete project:', e);
      throw e;
    }
    await refresh();
  }, [refresh]);

  return { projects, loading, refresh, createProject, updateProject, removeProject };
}

export function useProject(id: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const p = await db.getProject(id);
      setProject(p || null);
    } catch (e) {
      console.error('Failed to load project:', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Guard against stale async results when id changes rapidly
  useEffect(() => {
    let stale = false;
    (async () => {
      try {
          const p = await db.getProject(id);
        if (!stale) {
          setProject(p || null);
          setLoading(false);
        }
      } catch (e) {
        if (!stale) {
          console.error('Failed to load project:', e);
          setLoading(false);
        }
      }
    })();
    return () => { stale = true; };
  }, [id]);
  usePullRefresh(refresh);

  const update = useCallback(async (data: Partial<Project>) => {
    if (!project) return;
    const updated = { ...project, ...data, updatedAt: new Date().toISOString() };
    try {
      await db.saveProject(updated);
    } catch (e) {
      console.error('Failed to update project:', e);
      throw e;
    }
    setProject(updated);
  }, [project]);

  return { project, loading, refresh, update };
}

export function useProjectFiles(projectId: string, category?: string) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const allFiles = category
        ? await db.getFilesByCategory(projectId, category)
        : await db.getProjectFiles(projectId);
      setFiles(allFiles.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    } catch (e) {
      console.error('Failed to load files:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId, category]);

  // Guard against stale async results when projectId changes rapidly
  useEffect(() => {
    let stale = false;
    (async () => {
      try {
          const allFiles = category
          ? await db.getFilesByCategory(projectId, category)
          : await db.getProjectFiles(projectId);
        if (!stale) {
          setFiles(allFiles.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
          setLoading(false);
        }
      } catch (e) {
        if (!stale) {
          console.error('Failed to load files:', e);
          setLoading(false);
        }
      }
    })();
    return () => { stale = true; };
  }, [projectId, category]);
  usePullRefresh(refresh);

  return { files, loading, refresh };
}

export function useProjectNotes(projectId: string) {
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = await db.getProjectNotes(projectId);
      setNotes(all);
    } catch (e) {
      console.error('Failed to load notes:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    let stale = false;
    (async () => {
      try {
          const all = await db.getProjectNotes(projectId);
        if (!stale) { setNotes(all); setLoading(false); }
      } catch (e) {
        if (!stale) { console.error('Failed to load notes:', e); setLoading(false); }
      }
    })();
    return () => { stale = true; };
  }, [projectId]);
  usePullRefresh(refresh);

  const addNote = useCallback(async (data: Omit<FieldNote, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const note: FieldNote = { ...data, id: uuid(), createdAt: now, updatedAt: now };
    try {
      await db.saveNote(note);
      await db.addActivity({
        id: uuid(), projectId, action: 'Note added',
        details: `${data.category} note added`, timestamp: now, user: data.author,
      });
    } catch (e) {
      console.error('Failed to add note:', e);
      throw e;
    }
    await refresh();
    return note;
  }, [projectId, refresh]);

  const updateNote = useCallback(async (note: FieldNote) => {
    note.updatedAt = new Date().toISOString();
    try {
      await db.saveNote(note);
      await db.addActivity({
        id: uuid(), projectId, action: 'Note updated',
        details: `${note.category} note updated`, timestamp: note.updatedAt, user: note.author,
      });
    } catch (e) {
      console.error('Failed to update note:', e);
      throw e;
    }
    await refresh();
  }, [projectId, refresh]);

  const removeNote = useCallback(async (id: string) => {
    try {
      await db.deleteNote(id);
    } catch (e) {
      console.error('Failed to delete note:', e);
      throw e;
    }
    await refresh();
  }, [refresh]);

  return { notes, loading, refresh, addNote, updateNote, removeNote };
}

export function useProjectDevices(projectId: string) {
  const [devices, setDevices] = useState<DeviceEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = await db.getProjectDevices(projectId);
      setDevices(all);
    } catch (e) {
      console.error('Failed to load devices:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    let stale = false;
    (async () => {
      try {
          const all = await db.getProjectDevices(projectId);
        if (!stale) { setDevices(all); setLoading(false); }
      } catch (e) {
        if (!stale) { console.error('Failed to load devices:', e); setLoading(false); }
      }
    })();
    return () => { stale = true; };
  }, [projectId]);
  usePullRefresh(refresh);

  const addDevice = useCallback(async (data: Omit<DeviceEntry, 'id'>) => {
    const device: DeviceEntry = { ...data, id: uuid() };
    try {
      await db.saveDevice(device);
      await db.addActivity({
        id: uuid(), projectId, action: 'Device added',
        details: `Device "${data.deviceName}" added`, timestamp: new Date().toISOString(), user: 'User',
      });
    } catch (e) {
      console.error('Failed to add device:', e);
      throw e;
    }
    await refresh();
    return device;
  }, [projectId, refresh]);

  const updateDevice = useCallback(async (device: DeviceEntry) => {
    const now = new Date().toISOString();
    const updated = { ...device, updatedAt: now };
    try {
      await db.saveDevice(updated);
      await db.addActivity({
        id: uuid(), projectId, action: 'Device updated',
        details: `Device "${device.deviceName}" updated`, timestamp: now, user: 'User',
      });
    } catch (e) {
      console.error('Failed to update device:', e);
      throw e;
    }
    await refresh();
  }, [projectId, refresh]);

  const removeDevice = useCallback(async (id: string) => {
    try {
      await db.deleteDevice(id);
    } catch (e) {
      console.error('Failed to delete device:', e);
      throw e;
    }
    await refresh();
  }, [refresh]);

  return { devices, loading, refresh, addDevice, updateDevice, removeDevice };
}

export function useProjectIpPlan(projectId: string) {
  const [entries, setEntries] = useState<IpPlanEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = await db.getProjectIpPlan(projectId);
      setEntries(all);
    } catch (e) {
      console.error('Failed to load IP plan:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    let stale = false;
    (async () => {
      try {
          const all = await db.getProjectIpPlan(projectId);
        if (!stale) { setEntries(all); setLoading(false); }
      } catch (e) {
        if (!stale) { console.error('Failed to load IP plan:', e); setLoading(false); }
      }
    })();
    return () => { stale = true; };
  }, [projectId]);
  usePullRefresh(refresh);

  const addIpEntry = useCallback(async (data: Omit<IpPlanEntry, 'id'>) => {
    const entry: IpPlanEntry = { ...data, id: uuid() };
    try {
      await db.saveIpEntry(entry);
      await db.addActivity({
        id: uuid(), projectId, action: 'IP entry added',
        details: `IP ${data.ipAddress} added`, timestamp: new Date().toISOString(), user: 'User',
      });
    } catch (e) {
      console.error('Failed to add IP entry:', e);
      throw e;
    }
    await refresh();
    return entry;
  }, [projectId, refresh]);

  const updateIpEntry = useCallback(async (entry: IpPlanEntry) => {
    const now = new Date().toISOString();
    const updated = { ...entry, updatedAt: now };
    try {
      await db.saveIpEntry(updated);
      await db.addActivity({
        id: uuid(), projectId, action: 'IP entry updated',
        details: `IP ${entry.ipAddress} updated`, timestamp: now, user: 'User',
      });
    } catch (e) {
      console.error('Failed to update IP entry:', e);
      throw e;
    }
    await refresh();
  }, [projectId, refresh]);

  const removeIpEntry = useCallback(async (id: string) => {
    try {
      await db.deleteIpEntry(id);
    } catch (e) {
      console.error('Failed to delete IP entry:', e);
      throw e;
    }
    await refresh();
  }, [refresh]);

  return { entries, loading, refresh, addIpEntry, updateIpEntry, removeIpEntry };
}

export function useProjectActivity(projectId: string) {
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = await db.getProjectActivity(projectId);
      setActivity(all);
    } catch (e) {
      console.error('Failed to load activity:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    let stale = false;
    (async () => {
      try {
          const all = await db.getProjectActivity(projectId);
        if (!stale) { setActivity(all); setLoading(false); }
      } catch (e) {
        if (!stale) { console.error('Failed to load activity:', e); setLoading(false); }
      }
    })();
    return () => { stale = true; };
  }, [projectId]);
  usePullRefresh(refresh);

  return { activity, loading, refresh };
}

// ─── Daily Reports ───────────────────────────────────────────
export function useDailyReports(projectId?: string) {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = projectId
        ? await db.getProjectDailyReports(projectId)
        : await db.getAllDailyReports();
      setReports(all);
    } catch (e) {
      console.error('Failed to load daily reports:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  usePullRefresh(refresh);

  const createReport = useCallback(async (data: Omit<DailyReport, 'id' | 'createdAt' | 'updatedAt' | 'reportNumber'>) => {
    const now = new Date().toISOString();
    const reportNumber = await db.getNextReportNumber(data.projectId);
    const report: DailyReport = { ...data, id: uuid(), reportNumber, createdAt: now, updatedAt: now };
    try {
      await db.saveDailyReport(report);
      await db.addActivity({
        id: uuid(), projectId: data.projectId, action: 'Daily report created',
        details: `Daily Report #${reportNumber} for ${data.date}`, timestamp: now, user: data.technicianName || 'User',
      });
    } catch (e) {
      console.error('Failed to create daily report:', e);
      throw e;
    }
    await refresh();
    return report;
  }, [refresh]);

  const updateReport = useCallback(async (report: DailyReport) => {
    report.updatedAt = new Date().toISOString();
    try {
      await db.saveDailyReport(report);
      if (report.projectId) {
        await db.addActivity({
          id: uuid(), projectId: report.projectId, action: 'Daily report updated',
          details: `Daily Report #${report.reportNumber} updated`, timestamp: report.updatedAt, user: report.technicianName || 'User',
        });
      }
    } catch (e) {
      console.error('Failed to update daily report:', e);
      throw e;
    }
    await refresh();
  }, [refresh]);

  const removeReport = useCallback(async (id: string) => {
    try {
      await db.deleteDailyReport(id);
    } catch (e) {
      console.error('Failed to delete daily report:', e);
      throw e;
    }
    await refresh();
  }, [refresh]);

  return { reports, loading, refresh, createReport, updateReport, removeReport };
}

export function useDailyReport(id: string) {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await db.getDailyReport(id);
      setReport(r || null);
    } catch (e) {
      console.error('Failed to load daily report:', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);
  usePullRefresh(refresh);

  const update = useCallback(async (data: Partial<DailyReport>) => {
    if (!report) return;
    const updated = { ...report, ...data, updatedAt: new Date().toISOString() };
    try {
      await db.saveDailyReport(updated);
    } catch (e) {
      console.error('Failed to update daily report:', e);
      throw e;
    }
    setReport(updated);
  }, [report]);

  return { report, loading, refresh, update };
}

// ─── Network Diagrams ───────────────────────────────────────
export function useNetworkDiagrams(projectId?: string) {
  const [diagrams, setDiagrams] = useState<NetworkDiagram[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = projectId
        ? await db.getProjectDiagrams(projectId)
        : await db.getAllDiagrams();
      setDiagrams(all);
    } catch (e) {
      console.error('Failed to load diagrams:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  usePullRefresh(refresh);

  const createDiagram = useCallback(async (data: Omit<NetworkDiagram, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const diagram: NetworkDiagram = { ...data, id: uuid(), createdAt: now, updatedAt: now };
    try {
      await db.saveDiagram(diagram);
      if (data.projectId) {
        await db.addActivity({
          id: uuid(), projectId: data.projectId, action: 'Diagram created',
          details: `Network diagram "${data.name}" created`, timestamp: now, user: 'User',
        });
      }
    } catch (e) {
      console.error('Failed to create diagram:', e);
      throw e;
    }
    await refresh();
    return diagram;
  }, [refresh]);

  const updateDiagram = useCallback(async (diagram: NetworkDiagram) => {
    diagram.updatedAt = new Date().toISOString();
    try {
      await db.saveDiagram(diagram);
    } catch (e) {
      console.error('Failed to update diagram:', e);
      throw e;
    }
    await refresh();
  }, [refresh]);

  const removeDiagram = useCallback(async (id: string) => {
    try {
      await db.deleteDiagram(id);
    } catch (e) {
      console.error('Failed to delete diagram:', e);
      throw e;
    }
    await refresh();
  }, [refresh]);

  return { diagrams, loading, refresh, createDiagram, updateDiagram, removeDiagram };
}

// ─── Command Snippets ───────────────────────────────────────
export function useCommandSnippets() {
  const [snippets, setSnippets] = useState<CommandSnippet[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = await db.getAllSnippets();
      setSnippets(all);
    } catch (e) {
      console.error('Failed to load snippets:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePullRefresh(refresh);

  const addSnippet = useCallback(async (data: Omit<CommandSnippet, 'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'lastUsedAt'>) => {
    const now = new Date().toISOString();
    const snippet: CommandSnippet = { ...data, id: uuid(), usageCount: 0, lastUsedAt: '', createdAt: now, updatedAt: now };
    try {
      await db.saveSnippet(snippet);
    } catch (e) {
      console.error('Failed to add snippet:', e);
      throw e;
    }
    await refresh();
    return snippet;
  }, [refresh]);

  const updateSnippet = useCallback(async (snippet: CommandSnippet) => {
    snippet.updatedAt = new Date().toISOString();
    try {
      await db.saveSnippet(snippet);
    } catch (e) {
      console.error('Failed to update snippet:', e);
      throw e;
    }
    await refresh();
  }, [refresh]);

  const removeSnippet = useCallback(async (id: string) => {
    try {
      await db.deleteSnippet(id);
    } catch (e) {
      console.error('Failed to delete snippet:', e);
      throw e;
    }
    await refresh();
  }, [refresh]);

  const recordUsage = useCallback(async (id: string) => {
    const all = await db.getAllSnippets();
    const snippet = all.find(s => s.id === id);
    if (snippet) {
      snippet.usageCount += 1;
      snippet.lastUsedAt = new Date().toISOString();
      try {
        await db.saveSnippet(snippet);
      } catch (e) {
        console.error('Failed to record snippet usage:', e);
        throw e;
      }
      await refresh();
    }
  }, [refresh]);

  return { snippets, loading, refresh, addSnippet, updateSnippet, removeSnippet, recordUsage };
}

// ─── Ping Sessions ──────────────────────────────────────────
export function usePingSessions(projectId?: string) {
  const [sessions, setSessions] = useState<PingSession[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = projectId
        ? await db.getProjectPingSessions(projectId)
        : await db.getAllPingSessions();
      setSessions(all);
    } catch (e) {
      console.error('Failed to load ping sessions:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  usePullRefresh(refresh);

  const saveSession = useCallback(async (session: PingSession) => {
    try {
      await db.savePingSession(session);
    } catch (e) {
      console.error('Failed to save ping session:', e);
      throw e;
    }
    await refresh();
  }, [refresh]);

  const removeSession = useCallback(async (id: string) => {
    try {
      await db.deletePingSession(id);
    } catch (e) {
      console.error('Failed to delete ping session:', e);
      throw e;
    }
    await refresh();
  }, [refresh]);

  return { sessions, loading, refresh, saveSession, removeSession };
}

// ─── Terminal Session Logs ───────────────────────────────────
export function useTerminalLogs(projectId: string) {
  const [logs, setLogs] = useState<TerminalSessionLog[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = await db.getProjectTerminalLogs(projectId);
      setLogs(all);
    } catch (e) {
      console.error('Failed to load terminal logs:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    let stale = false;
    (async () => {
      try {
        const all = await db.getProjectTerminalLogs(projectId);
        if (!stale) { setLogs(all); setLoading(false); }
      } catch (e) {
        if (!stale) { console.error('Failed to load terminal logs:', e); setLoading(false); }
      }
    })();
    return () => { stale = true; };
  }, [projectId]);
  usePullRefresh(refresh);

  const addLog = useCallback(async (data: Omit<TerminalSessionLog, 'id' | 'createdAt'>) => {
    const now = new Date().toISOString();
    const log: TerminalSessionLog = { ...data, id: uuid(), createdAt: now };
    try {
      await db.saveTerminalLog(log);
      await db.addActivity({
        id: uuid(), projectId, action: 'Terminal log attached',
        details: `${data.connectionMode === 'serial' ? 'Serial' : 'Telnet'} session "${data.sessionLabel}" log attached (${data.lineCount} lines)`,
        timestamp: now, user: 'User',
      });
    } catch (e) {
      console.error('Failed to save terminal log:', e);
      throw e;
    }
    await refresh();
    return log;
  }, [projectId, refresh]);

  const removeLog = useCallback(async (id: string) => {
    try {
      await db.deleteTerminalLog(id);
    } catch (e) {
      console.error('Failed to delete terminal log:', e);
      throw e;
    }
    await refresh();
  }, [refresh]);

  return { logs, loading, refresh, addLog, removeLog };
}

// ─── Connection Profiles ────────────────────────────────────
export function useConnectionProfiles(projectId?: string) {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = projectId
        ? await db.getProjectConnectionProfiles(projectId)
        : await db.getAllConnectionProfiles();
      setProfiles(all);
    } catch (e) {
      console.error('Failed to load profiles:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  usePullRefresh(refresh);

  const addProfile = useCallback(async (data: Omit<ConnectionProfile, 'id' | 'createdAt' | 'updatedAt' | 'lastConnectedAt'>) => {
    const now = new Date().toISOString();
    const profile: ConnectionProfile = { ...data, id: uuid(), lastConnectedAt: '', createdAt: now, updatedAt: now };
    try {
      await db.saveConnectionProfile(profile);
    } catch (e) {
      console.error('Failed to add profile:', e);
      throw e;
    }
    await refresh();
    return profile;
  }, [refresh]);

  const updateProfile = useCallback(async (profile: ConnectionProfile) => {
    const updated = { ...profile, updatedAt: new Date().toISOString() };
    try {
      await db.saveConnectionProfile(updated);
    } catch (e) {
      console.error('Failed to update profile:', e);
      throw e;
    }
    await refresh();
  }, [refresh]);

  const removeProfile = useCallback(async (id: string) => {
    try {
      await db.deleteConnectionProfile(id);
    } catch (e) {
      console.error('Failed to delete profile:', e);
      throw e;
    }
    await refresh();
  }, [refresh]);

  const touchProfile = useCallback(async (id: string) => {
    const all = await db.getAllConnectionProfiles();
    const p = all.find(x => x.id === id);
    if (p) {
      p.lastConnectedAt = new Date().toISOString();
      p.updatedAt = new Date().toISOString();
      await db.saveConnectionProfile(p);
      await refresh();
    }
  }, [refresh]);

  return { profiles, loading, refresh, addProfile, updateProfile, removeProfile, touchProfile };
}
