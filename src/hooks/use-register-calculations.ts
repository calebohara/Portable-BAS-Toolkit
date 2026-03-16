'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SavedCalculation, RegisterToolModule, SavedCalcCategory } from '@/types';
import * as db from '@/lib/db';
import { onPullComplete } from '@/lib/sync/sync-bridge';
import { v4 as uuid } from 'uuid';
import { toast } from 'sonner';

export function useRegisterCalculations(projectId?: string) {
  const [calculations, setCalculations] = useState<SavedCalculation[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = projectId
        ? await db.getProjectRegisterCalculations(projectId)
        : await db.getAllRegisterCalculations();
      setCalculations(all);
    } catch (e) {
      console.error('Failed to load register calculations:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => onPullComplete(refresh), [refresh]);

  const addCalculation = useCallback(async (data: {
    label: string;
    module: RegisterToolModule;
    category: SavedCalcCategory;
    inputs: Record<string, unknown>;
    result: Record<string, unknown>;
    notes: string;
    tags: string[];
    projectId: string;
  }) => {
    try {
      const now = new Date().toISOString();
      const calc: SavedCalculation = {
        ...data,
        id: uuid(),
        createdAt: now,
        updatedAt: now,
      };
      await db.saveRegisterCalculation(calc);
      await refresh();
      return calc;
    } catch (err) {
      console.error('Failed to add calculation:', err);
      toast.error('Failed to add calculation');
    }
  }, [refresh]);

  const updateCalculation = useCallback(async (calc: SavedCalculation) => {
    try {
      const updated = { ...calc, updatedAt: new Date().toISOString() };
      await db.saveRegisterCalculation(updated);
      await refresh();
    } catch (err) {
      console.error('Failed to update calculation:', err);
      toast.error('Failed to update calculation');
    }
  }, [refresh]);

  const removeCalculation = useCallback(async (id: string) => {
    try {
      await db.deleteRegisterCalculation(id);
      await refresh();
    } catch (err) {
      console.error('Failed to remove calculation:', err);
      toast.error('Failed to remove calculation');
    }
  }, [refresh]);

  return { calculations, loading, refresh, addCalculation, updateCalculation, removeCalculation };
}
