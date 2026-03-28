'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PsychSession } from '@/types';
import * as db from '@/lib/db';
import { onPullComplete } from '@/lib/sync/sync-bridge';
import { v4 as uuid } from 'uuid';
import { toast } from 'sonner';

export function usePsychSessions(projectId?: string) {
  const [sessions, setSessions] = useState<PsychSession[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = projectId
        ? await db.getProjectPsychSessions(projectId)
        : await db.getAllPsychSessions();
      setSessions(all);
    } catch (e) {
      console.error('Failed to load psychrometric sessions:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => onPullComplete(refresh), [refresh]);

  const addSession = useCallback(async (data: Omit<PsychSession, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const now = new Date().toISOString();
      const session: PsychSession = {
        ...data,
        id: uuid(),
        createdAt: now,
        updatedAt: now,
      };
      await db.savePsychSession(session);
      if (data.projectId) {
        await db.addActivity({
          id: uuid(),
          projectId: data.projectId,
          action: 'Psychrometric session saved',
          details: `"${data.label}" — ${data.inputMode}`,
          timestamp: now,
          user: 'User',
        });
      }
      await refresh();
      return session;
    } catch (err) {
      console.error('Failed to add psychrometric session:', err);
      toast.error('Failed to save session');
      throw err;
    }
  }, [refresh]);

  const updateSession = useCallback(async (session: PsychSession) => {
    try {
      const updated = { ...session, updatedAt: new Date().toISOString() };
      await db.savePsychSession(updated);
      await refresh();
    } catch (err) {
      console.error('Failed to update psychrometric session:', err);
      toast.error('Failed to update session');
      throw err;
    }
  }, [refresh]);

  const removeSession = useCallback(async (id: string) => {
    try {
      await db.deletePsychSession(id);
      await refresh();
    } catch (err) {
      console.error('Failed to remove psychrometric session:', err);
      toast.error('Failed to remove session');
      throw err;
    }
  }, [refresh]);

  return { sessions, loading, refresh, addSession, updateSession, removeSession };
}
