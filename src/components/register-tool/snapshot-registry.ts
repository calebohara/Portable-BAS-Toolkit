'use client';

import { useEffect } from 'react';

/**
 * Snapshot captured for a saved calculation. Both records are arbitrary
 * key/value bags rendered by the CalculationHistory panel.
 */
export interface CalcSnapshot {
  inputs: Record<string, unknown>;
  result: Record<string, unknown>;
}

/**
 * The register-tool modules are all mounted at once (hidden via CSS to preserve
 * form state across tab switches), so the Save dialog can't read state through
 * props without heavy prop-drilling. Instead, each module registers its current
 * snapshot here keyed by its module name; the Save dialog reads the active
 * module's snapshot at save time.
 */
const registry = new Map<string, CalcSnapshot>();

/** Read the current snapshot for a module, or empty records if none registered. */
export function getModuleSnapshot(module: string): CalcSnapshot {
  return registry.get(module) ?? { inputs: {}, result: {} };
}

/** True when the module currently has a non-empty result to save. */
export function hasModuleSnapshot(module: string): boolean {
  const snap = registry.get(module);
  return !!snap && Object.keys(snap.result).length > 0;
}

/**
 * Register a module's live snapshot. Pass the latest snapshot on every render;
 * the registry keeps the most recent. Cleans up its entry on unmount.
 */
export function useRegisterSnapshot(module: string, snapshot: CalcSnapshot): void {
  useEffect(() => {
    registry.set(module, snapshot);
    return () => {
      if (registry.get(module) === snapshot) registry.delete(module);
    };
  }, [module, snapshot]);
}
