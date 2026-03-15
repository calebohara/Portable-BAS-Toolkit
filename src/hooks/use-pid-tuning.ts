'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PidTuningSession } from '@/types';
import * as db from '@/lib/db';
import { v4 as uuid } from 'uuid';

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

  const addSession = useCallback(async (data: Omit<PidTuningSession, 'id' | 'createdAt' | 'updatedAt'>) => {
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
  }, [refresh]);

  const updateSession = useCallback(async (session: PidTuningSession) => {
    session.updatedAt = new Date().toISOString();
    await db.savePidTuningSession(session);
    await refresh();
  }, [refresh]);

  const removeSession = useCallback(async (id: string) => {
    await db.deletePidTuningSession(id);
    await refresh();
  }, [refresh]);

  return { sessions, loading, refresh, addSession, updateSession, removeSession };
}
