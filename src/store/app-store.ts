'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
      // Onboarding
      hasCompletedTour: false,
      tourActive: false,
      tourStep: 0,
      startTour: () => set({ tourActive: true, tourStep: 0 }),
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
      }),
    }
  )
);
