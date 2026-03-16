'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PidTuningSession } from '@/types';
import * as db from '@/lib/db';
import { onPullComplete } from '@/lib/sync/sync-bridge';
import { v4 as uuid } from 'uuid';
import { toast } from 'sonner';

export function usePidTuningSessions(projectId?: string) {
  const [sessions, setSessions] = useState<PidTuningSession[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = projectId
        ? await db.getProjectPidTuningSessions(projectId)
        : await db.getAllPidTuningSessions();
      setSessions(all);
    } catch (e) {
      console.error('Failed to load PID tuning sessions:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => onPullComplete(refresh), [refresh]);

  const addSession = useCallback(async (data: Omit<PidTuningSession, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const now = new Date().toISOString();
      const session: PidTuningSession = {
        ...data,
        id: uuid(),
        createdAt: now,
        updatedAt: now,
      };
      await db.savePidTuningSession(session);
      if (data.projectId) {
        await db.addActivity({
          id: uuid(),
          projectId: data.projectId,
          action: 'PID tuning session created',
          details: `Loop "${data.loopName}" on ${data.equipment}`,
          timestamp: now,
          user: 'User',
        });
      }
      await refresh();
      return session;
    } catch (err) {
      console.error('Failed to add session:', err);
      toast.error('Failed to add session');
    }
  }, [refresh]);

  const updateSession = useCallback(async (session: PidTuningSession) => {
    try {
      const updated = { ...session, updatedAt: new Date().toISOString() };
      await db.savePidTuningSession(updated);
      await refresh();
    } catch (err) {
      console.error('Failed to update session:', err);
      toast.error('Failed to update session');
    }
  }, [refresh]);

  const removeSession = useCallback(async (id: string) => {
    try {
      await db.deletePidTuningSession(id);
      await refresh();
    } catch (err) {
      console.error('Failed to remove session:', err);
      toast.error('Failed to remove session');
    }
  }, [refresh]);

  return { sessions, loading, refresh, addSession, updateSession, removeSession };
}
