'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PpclDocument, PpclFirmwareTarget } from '@/types';
import * as db from '@/lib/db';
import { onPullComplete } from '@/lib/sync/sync-bridge';
import { v4 as uuid } from 'uuid';
import { toast } from 'sonner';

export function usePpclDocuments(projectId?: string) {
  const [documents, setDocuments] = useState<PpclDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = projectId
        ? await db.getProjectPpclDocuments(projectId)
        : await db.getAllPpclDocuments();
      setDocuments(all);
    } catch (e) {
      console.error('Failed to load PPCL documents:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => onPullComplete(refresh), [refresh]);

  const addDocument = useCallback(async (
    name: string,
    content = '',
    firmware: PpclFirmwareTarget = 'pxc-tc',
    docProjectId = projectId ?? '',
  ) => {
    try {
      const now = new Date().toISOString();
      const doc: PpclDocument = {
        id: uuid(),
        name,
        content,
        projectId: docProjectId,
        firmware,
        createdAt: now,
        updatedAt: now,
      };
      await db.savePpclDocument(doc);
      await refresh();
      return doc;
    } catch (err) {
      console.error('Failed to add PPCL document:', err);
      toast.error('Failed to create PPCL document');
      throw err;
    }
  }, [projectId, refresh]);

  const updateDocument = useCallback(async (
    id: string,
    updates: Partial<Pick<PpclDocument, 'name' | 'content' | 'firmware' | 'projectId'>>,
  ) => {
    try {
      const existing = await db.getPpclDocument(id);
      if (!existing) return;
      await db.savePpclDocument({
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
      });
      await refresh();
    } catch (err) {
      console.error('Failed to update PPCL document:', err);
      toast.error('Failed to save PPCL document');
      throw err;
    }
  }, [refresh]);

  const removeDocument = useCallback(async (id: string) => {
    try {
      await db.deletePpclDocument(id);
      await refresh();
    } catch (err) {
      console.error('Failed to remove PPCL document:', err);
      toast.error('Failed to delete PPCL document');
      throw err;
    }
  }, [refresh]);

  return { documents, loading, refresh, addDocument, updateDocument, removeDocument };
}
