'use client';

import { useState, useEffect, useCallback } from 'react';
import type { NotepadDocument, NotepadLanguage } from '@/types';
import * as db from '@/lib/db';
import { v4 as uuid } from 'uuid';
import { toast } from 'sonner';

export function useNotepadDocuments() {
  const [documents, setDocuments] = useState<NotepadDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = await db.getAllNotepadDocuments();
      setDocuments(all);
    } catch (e) {
      console.error('Failed to load notepad documents:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addDocument = useCallback(async (name: string, language: NotepadLanguage, content = '') => {
    try {
      const now = new Date().toISOString();
      const doc: NotepadDocument = {
        id: uuid(),
        name,
        content,
        language,
        createdAt: now,
        updatedAt: now,
      };
      await db.saveNotepadDocument(doc);
      await refresh();
      return doc;
    } catch (err) {
      console.error('Failed to add notepad document:', err);
      toast.error('Failed to create document');
      throw err;
    }
  }, [refresh]);

  const updateDocument = useCallback(async (id: string, updates: Partial<Pick<NotepadDocument, 'name' | 'content' | 'language'>>) => {
    try {
      const existing = await db.getNotepadDocument(id);
      if (!existing) return;
      await db.saveNotepadDocument({
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
      });
      await refresh();
    } catch (err) {
      console.error('Failed to update notepad document:', err);
      toast.error('Failed to save document');
      throw err;
    }
  }, [refresh]);

  const removeDocument = useCallback(async (id: string) => {
    try {
      await db.deleteNotepadDocument(id);
      await refresh();
    } catch (err) {
      console.error('Failed to remove notepad document:', err);
      toast.error('Failed to delete document');
      throw err;
    }
  }, [refresh]);

  return { documents, loading, refresh, addDocument, updateDocument, removeDocument };
}
