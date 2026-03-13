'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { SyncStatus } from '@/types';

export type ThemeMode = 'system' | 'light' | 'dark';

interface AppState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  isOnline: boolean;
  setOnline: (online: boolean) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  recentProjectIds: string[];
  addRecentProject: (id: string) => void;
  removeRecentProject: (id: string) => void;
  recentSearches: string[];
  addRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
  // Sync
  syncStatus: SyncStatus;
  setSyncStatus: (status: SyncStatus) => void;
  pendingSyncCount: number;
  setPendingSyncCount: (count: number) => void;
  lastSyncedAt: string | null;
  setLastSyncedAt: (ts: string | null) => void;
  lastPulledAt: string | null;
  setLastPulledAt: (ts: string | null) => void;
  // Onboarding
  hasCompletedTour: boolean;
  tourActive: boolean;
  tourStep: number;
  startTour: () => void;
  endTour: () => void;
  nextTourStep: () => void;
  prevTourStep: () => void;
  setTourStep: (step: number) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      isOnline: true,
      setOnline: (online) => set({ isOnline: online }),
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
      recentProjectIds: [],
      addRecentProject: (id) => {
        const current = get().recentProjectIds.filter((pid) => pid !== id);
        set({ recentProjectIds: [id, ...current].slice(0, 10) });
      },
      removeRecentProject: (id) => {
        set({ recentProjectIds: get().recentProjectIds.filter((pid) => pid !== id) });
      },
      recentSearches: [],
      addRecentSearch: (query) => {
        const trimmed = query.trim();
        if (!trimmed) return;
        const current = get().recentSearches.filter((s) => s !== trimmed);
        set({ recentSearches: [trimmed, ...current].slice(0, 10) });
      },
      clearRecentSearches: () => set({ recentSearches: [] }),
      // Sync
      syncStatus: 'disabled' as SyncStatus,
      setSyncStatus: (status) => set({ syncStatus: status }),
      pendingSyncCount: 0,
      setPendingSyncCount: (count) => set({ pendingSyncCount: count }),
      lastSyncedAt: null,
      setLastSyncedAt: (ts) => set({ lastSyncedAt: ts }),
      lastPulledAt: null,
      setLastPulledAt: (ts) => set({ lastPulledAt: ts }),
      // Onboarding
      hasCompletedTour: false,
      tourActive: false,
      tourStep: 0,
      startTour: () => set({ tourActive: true, tourStep: 0, sidebarOpen: false }),
      endTour: () => set({ tourActive: false, tourStep: 0, hasCompletedTour: true }),
      nextTourStep: () => set((s) => ({ tourStep: s.tourStep + 1 })),
      prevTourStep: () => set((s) => ({ tourStep: Math.max(0, s.tourStep - 1) })),
      setTourStep: (step) => set({ tourStep: step }),
    }),
    {
      name: 'bau-suite-app',
      partialize: (state) => ({
        theme: state.theme,
        sidebarOpen: state.sidebarOpen,
        recentProjectIds: state.recentProjectIds,
        recentSearches: state.recentSearches,
        hasCompletedTour: state.hasCompletedTour,
        lastSyncedAt: state.lastSyncedAt,
        lastPulledAt: state.lastPulledAt,
      }),
    }
  )
);
