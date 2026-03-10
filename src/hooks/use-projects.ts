'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Project, ProjectFile, FieldNote, DeviceEntry, IpPlanEntry, ActivityLogEntry, DailyReport, NetworkDiagram, CommandSnippet, PingSession } from '@/types';
import * as db from '@/lib/db';
import { generateDemoData } from '@/lib/demo-data';
import { v4 as uuid } from 'uuid';

let demoSeedPromise: Promise<void> | null = null;

function ensureDemoData(): Promise<void> {
  if (!demoSeedPromise) {
    demoSeedPromise = (async () => {
      const existing = await db.getAllProjects();
      if (existing.length > 0) return;

      const demo = generateDemoData();
      for (const p of demo.projects) await db.saveProject(p);
      for (const f of demo.files) await db.saveFile(f);
      for (const n of demo.notes) await db.saveNote(n);
      for (const d of demo.devices) await db.saveDevice(d);
      for (const ip of demo.ipEntries) await db.saveIpEntry(ip);
      for (const a of demo.activityLog) await db.addActivity(a);
    })();
  }
  return demoSeedPromise;
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      await ensureDemoData();
      const all = await db.getAllProjects();
      setProjects(all);
    } catch (e) {
      console.error('Failed to load projects:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

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
      await ensureDemoData();
      const p = await db.getProject(id);
      setProject(p || null);
    } catch (e) {
      console.error('Failed to load project:', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  const update = useCallback(async (data: Partial<Project>) => {
    if (!project) return;
    const updated = { ...project, ...data, updatedAt: new Date().toISOString() };
    try {
      await db.saveProject(updated);
      setProject(updated);
    } catch (e) {
      console.error('Failed to update project:', e);
      await refresh();
    }
  }, [project, refresh]);

  return { project, loading, refresh, update };
}

export function useProjectFiles(projectId: string, category?: string) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      await ensureDemoData();
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

  useEffect(() => { refresh(); }, [refresh]);

  return { files, loading, refresh };
}

export function useProjectNotes(projectId: string) {
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      await ensureDemoData();
      const all = await db.getProjectNotes(projectId);
      setNotes(all);
    } catch (e) {
      console.error('Failed to load notes:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

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
    } catch (e) {
      console.error('Failed to update note:', e);
      throw e;
    }
    await refresh();
  }, [refresh]);

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
      await ensureDemoData();
      const all = await db.getProjectDevices(projectId);
      setDevices(all);
    } catch (e) {
      console.error('Failed to load devices:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

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
    try {
      await db.saveDevice(device);
    } catch (e) {
      console.error('Failed to update device:', e);
      throw e;
    }
    await refresh();
  }, [refresh]);

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
      await ensureDemoData();
      const all = await db.getProjectIpPlan(projectId);
      setEntries(all);
    } catch (e) {
      console.error('Failed to load IP plan:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

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
    try {
      await db.saveIpEntry(entry);
    } catch (e) {
      console.error('Failed to update IP entry:', e);
      throw e;
    }
    await refresh();
  }, [refresh]);

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
      await ensureDemoData();
      const all = await db.getProjectActivity(projectId);
      setActivity(all);
    } catch (e) {
      console.error('Failed to load activity:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { activity, loading, refresh };
}

// ─── Daily Reports ───────────────────────────────────────────
export function useDailyReports(projectId?: string) {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      await ensureDemoData();
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
      await ensureDemoData();
      const r = await db.getDailyReport(id);
      setReport(r || null);
    } catch (e) {
      console.error('Failed to load daily report:', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  const update = useCallback(async (data: Partial<DailyReport>) => {
    if (!report) return;
    const updated = { ...report, ...data, updatedAt: new Date().toISOString() };
    try {
      await db.saveDailyReport(updated);
      setReport(updated);
    } catch (e) {
      console.error('Failed to update daily report:', e);
      await refresh();
    }
  }, [report, refresh]);

  return { report, loading, refresh, update };
}

// ─── Network Diagrams ───────────────────────────────────────
export function useNetworkDiagrams(projectId?: string) {
  const [diagrams, setDiagrams] = useState<NetworkDiagram[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    await ensureDemoData();
    const all = projectId
      ? await db.getProjectDiagrams(projectId)
      : await db.getAllDiagrams();
    setDiagrams(all);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

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
    const all = await db.getAllSnippets();
    setSnippets(all);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

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
    const all = projectId
      ? await db.getProjectPingSessions(projectId)
      : await db.getAllPingSessions();
    setSessions(all);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

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
