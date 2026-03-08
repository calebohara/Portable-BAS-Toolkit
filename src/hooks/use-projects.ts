'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Project, ProjectFile, FieldNote, DeviceEntry, IpPlanEntry, ActivityLogEntry } from '@/types';
import * as db from '@/lib/db';
import { generateDemoData } from '@/lib/demo-data';
import { v4 as uuid } from 'uuid';

let demoSeeded = false;

async function ensureDemoData() {
  if (demoSeeded) return;
  const existing = await db.getAllProjects();
  if (existing.length > 0) {
    demoSeeded = true;
    return;
  }

  const demo = generateDemoData();
  for (const p of demo.projects) await db.saveProject(p);
  for (const f of demo.files) await db.saveFile(f);
  for (const n of demo.notes) await db.saveNote(n);
  for (const d of demo.devices) await db.saveDevice(d);
  for (const ip of demo.ipEntries) await db.saveIpEntry(ip);
  for (const a of demo.activityLog) await db.addActivity(a);
  demoSeeded = true;
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    await ensureDemoData();
    const all = await db.getAllProjects();
    setProjects(all);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const createProject = useCallback(async (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const project: Project = { ...data, id: uuid(), createdAt: now, updatedAt: now };
    await db.saveProject(project);
    await db.addActivity({
      id: uuid(), projectId: project.id, action: 'Project created',
      details: `Project ${project.projectNumber} created`, timestamp: now, user: 'User',
    });
    await refresh();
    return project;
  }, [refresh]);

  const updateProject = useCallback(async (project: Project) => {
    project.updatedAt = new Date().toISOString();
    await db.saveProject(project);
    await refresh();
  }, [refresh]);

  const removeProject = useCallback(async (id: string) => {
    await db.deleteProject(id);
    await refresh();
  }, [refresh]);

  return { projects, loading, refresh, createProject, updateProject, removeProject };
}

export function useProject(id: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    await ensureDemoData();
    const p = await db.getProject(id);
    setProject(p || null);
    setLoading(false);
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  const update = useCallback(async (data: Partial<Project>) => {
    if (!project) return;
    const updated = { ...project, ...data, updatedAt: new Date().toISOString() };
    await db.saveProject(updated);
    setProject(updated);
  }, [project]);

  return { project, loading, refresh, update };
}

export function useProjectFiles(projectId: string, category?: string) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    await ensureDemoData();
    const allFiles = category
      ? await db.getFilesByCategory(projectId, category)
      : await db.getProjectFiles(projectId);
    setFiles(allFiles.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    setLoading(false);
  }, [projectId, category]);

  useEffect(() => { refresh(); }, [refresh]);

  return { files, loading, refresh };
}

export function useProjectNotes(projectId: string) {
  const [notes, setNotes] = useState<FieldNote[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    await ensureDemoData();
    const all = await db.getProjectNotes(projectId);
    setNotes(all);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  const addNote = useCallback(async (data: Omit<FieldNote, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const note: FieldNote = { ...data, id: uuid(), createdAt: now, updatedAt: now };
    await db.saveNote(note);
    await db.addActivity({
      id: uuid(), projectId, action: 'Note added',
      details: `${data.category} note added`, timestamp: now, user: data.author,
    });
    await refresh();
    return note;
  }, [projectId, refresh]);

  const updateNote = useCallback(async (note: FieldNote) => {
    note.updatedAt = new Date().toISOString();
    await db.saveNote(note);
    await refresh();
  }, [refresh]);

  const removeNote = useCallback(async (id: string) => {
    await db.deleteNote(id);
    await refresh();
  }, [refresh]);

  return { notes, loading, refresh, addNote, updateNote, removeNote };
}

export function useProjectDevices(projectId: string) {
  const [devices, setDevices] = useState<DeviceEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    await ensureDemoData();
    const all = await db.getProjectDevices(projectId);
    setDevices(all);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  const addDevice = useCallback(async (data: Omit<DeviceEntry, 'id'>) => {
    const device: DeviceEntry = { ...data, id: uuid() };
    await db.saveDevice(device);
    await db.addActivity({
      id: uuid(), projectId, action: 'Device added',
      details: `Device "${data.deviceName}" added`, timestamp: new Date().toISOString(), user: 'User',
    });
    await refresh();
    return device;
  }, [projectId, refresh]);

  const updateDevice = useCallback(async (device: DeviceEntry) => {
    await db.saveDevice(device);
    await refresh();
  }, [refresh]);

  const removeDevice = useCallback(async (id: string) => {
    await db.deleteDevice(id);
    await refresh();
  }, [refresh]);

  return { devices, loading, refresh, addDevice, updateDevice, removeDevice };
}

export function useProjectIpPlan(projectId: string) {
  const [entries, setEntries] = useState<IpPlanEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    await ensureDemoData();
    const all = await db.getProjectIpPlan(projectId);
    setEntries(all);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  const addIpEntry = useCallback(async (data: Omit<IpPlanEntry, 'id'>) => {
    const entry: IpPlanEntry = { ...data, id: uuid() };
    await db.saveIpEntry(entry);
    await db.addActivity({
      id: uuid(), projectId, action: 'IP entry added',
      details: `IP ${data.ipAddress} added`, timestamp: new Date().toISOString(), user: 'User',
    });
    await refresh();
    return entry;
  }, [projectId, refresh]);

  const updateIpEntry = useCallback(async (entry: IpPlanEntry) => {
    await db.saveIpEntry(entry);
    await refresh();
  }, [refresh]);

  const removeIpEntry = useCallback(async (id: string) => {
    await db.deleteIpEntry(id);
    await refresh();
  }, [refresh]);

  return { entries, loading, refresh, addIpEntry, updateIpEntry, removeIpEntry };
}

export function useProjectActivity(projectId: string) {
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    await ensureDemoData();
    const all = await db.getProjectActivity(projectId);
    setActivity(all);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { activity, loading, refresh };
}
