'use client';

import { useState, useEffect, useCallback } from 'react';
import type { TrendSession } from '@/types';
import * as db from '@/lib/db';
import { onPullComplete } from '@/lib/sync/sync-bridge';
import { v4 as uuid } from 'uuid';
import { toast } from 'sonner';

export function useTrendSessions(projectId?: string) {
  const [sessions, setSessions] = useState<TrendSession[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = projectId
        ? await db.getProjectTrendSessions(projectId)
        : await db.getAllTrendSessions();
      setSessions(all);
    } catch (e) {
      console.error('Failed to load trend sessions:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => onPullComplete(refresh), [refresh]);

  const addSession = useCallback(async (data: Omit<TrendSession, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const now = new Date().toISOString();
      const session: TrendSession = {
        ...data,
        id: uuid(),
        createdAt: now,
        updatedAt: now,
      };
      await db.saveTrendSession(session);
      if (data.projectId) {
        await db.addActivity({
          id: uuid(),
          projectId: data.projectId,
          action: 'Trend session saved',
          details: `"${data.name}" — ${data.series.length} series, ${data.data.length} points`,
          timestamp: now,
          user: 'User',
        });
      }
      await refresh();
      return session;
    } catch (err) {
      console.error('Failed to add trend session:', err);
      toast.error('Failed to save trend session');
      throw err;
    }
  }, [refresh]);

  const updateSession = useCallback(async (session: TrendSession) => {
    try {
      const updated = { ...session, updatedAt: new Date().toISOString() };
      await db.saveTrendSession(updated);
      await refresh();
    } catch (err) {
      console.error('Failed to update trend session:', err);
      toast.error('Failed to update session');
      throw err;
    }
  }, [refresh]);

  const removeSession = useCallback(async (id: string) => {
    try {
      await db.deleteTrendSession(id);
      await refresh();
    } catch (err) {
      console.error('Failed to remove trend session:', err);
      toast.error('Failed to remove session');
      throw err;
    }
  }, [refresh]);

  return { sessions, loading, refresh, addSession, updateSession, removeSession };
}
