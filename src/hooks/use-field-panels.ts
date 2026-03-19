'use client';

import { useState, useEffect, useCallback } from 'react';
import type { FieldPanel } from '@/types';
import { getAllFieldPanels, saveFieldPanel, deleteFieldPanel, getFieldPanel } from '@/lib/db';
import { toast } from 'sonner';

export function useFieldPanels() {
  const [panels, setPanels] = useState<FieldPanel[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getAllFieldPanels();
      setPanels(data);
    } catch (err) {
      console.error('Failed to load field panels:', err);
      toast.error('Failed to load field panels');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const addPanel = useCallback(async (panel: FieldPanel) => {
    try {
      await saveFieldPanel(panel);
      await refresh();
      toast.success('Panel added');
    } catch (err) {
      console.error('Failed to save panel:', err);
      toast.error('Failed to save panel');
    }
  }, [refresh]);

  const updatePanel = useCallback(async (panel: FieldPanel) => {
    try {
      await saveFieldPanel({ ...panel, updatedAt: new Date().toISOString() });
      await refresh();
    } catch (err) {
      console.error('Failed to update panel:', err);
      toast.error('Failed to update panel');
    }
  }, [refresh]);

  const removePanel = useCallback(async (id: string) => {
    try {
      await deleteFieldPanel(id);
      await refresh();
      toast.success('Panel deleted');
    } catch (err) {
      console.error('Failed to delete panel:', err);
      toast.error('Failed to delete panel');
    }
  }, [refresh]);

  return { panels, loading, addPanel, updatePanel, removePanel, refresh };
}

export function useFieldPanel(id: string | null) {
  const [panel, setPanel] = useState<FieldPanel | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!id) { setPanel(null); setLoading(false); return; }
    try {
      const data = await getFieldPanel(id);
      setPanel(data || null);
    } catch (err) {
      console.error('Failed to load panel:', err);
      toast.error('Failed to load panel');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  const update = useCallback(async (updates: Partial<FieldPanel>) => {
    if (!panel) return;
    const updated = { ...panel, ...updates, updatedAt: new Date().toISOString() };
    try {
      await saveFieldPanel(updated);
      setPanel(updated);
    } catch (err) {
      console.error('Failed to update panel:', err);
      toast.error('Failed to update panel');
    }
  }, [panel]);

  return { panel, loading, update, refresh };
}
