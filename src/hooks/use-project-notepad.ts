'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ProjectNotepadEntry } from '@/types';
import * as db from '@/lib/db';
import { onPullComplete } from '@/lib/sync/sync-bridge';
import { v4 as uuid } from 'uuid';
import { toast } from 'sonner';

export function useProjectNotepad(projectId: string) {
  const [entries, setEntries] = useState<ProjectNotepadEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = await db.getProjectNotepadEntries(projectId);
      setEntries(all);
    } catch (e) {
      console.error('Failed to load project notepad entries:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => onPullComplete(refresh), [refresh]);

  const addEntry = useCallback(async (name: string, content: string, linkedTabId?: string) => {
    try {
      const now = new Date().toISOString();
      const entry: ProjectNotepadEntry = {
        id: uuid(),
        projectId,
        name,
        content,
        linkedTabId,
        createdAt: now,
        updatedAt: now,
      };
      await db.saveProjectNotepadEntry(entry);
      await refresh();
      return entry;
    } catch (err) {
      console.error('Failed to add notepad entry:', err);
      toast.error('Failed to add notepad entry');
      throw err;
    }
  }, [projectId, refresh]);

  const updateContent = useCallback(async (id: string, content: string) => {
    try {
      const existing = entries.find(e => e.id === id);
      if (!existing) return;
      await db.saveProjectNotepadEntry({
        ...existing,
        content,
        updatedAt: new Date().toISOString(),
      });
      await refresh();
    } catch (err) {
      console.error('Failed to update notepad entry:', err);
      toast.error('Failed to update notepad entry');
      throw err;
    }
  }, [entries, refresh]);

  const removeEntry = useCallback(async (id: string) => {
    try {
      await db.deleteProjectNotepadEntry(id);
      await refresh();
    } catch (err) {
      console.error('Failed to remove notepad entry:', err);
      toast.error('Failed to remove notepad entry');
      throw err;
    }
  }, [refresh]);

  const syncFromTab = useCallback(async (id: string, content: string) => {
    try {
      const existing = entries.find(e => e.id === id);
      if (!existing) return;
      await db.saveProjectNotepadEntry({
        ...existing,
        content,
        updatedAt: new Date().toISOString(),
      });
      await refresh();
    } catch (err) {
      console.error('Failed to sync notepad entry:', err);
      throw err;
    }
  }, [entries, refresh]);

  return { entries, loading, refresh, addEntry, updateContent, removeEntry, syncFromTab };
}
