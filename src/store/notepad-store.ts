'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface NotepadTab {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  projectId?: string;
  projectName?: string;
}

type PanelState = 'closed' | 'open' | 'minimized';

export interface LauncherPosition {
  x: number;
  y: number;
}

interface NotepadState {
  _hydrated: boolean;
  _setHydrated: () => void;

  panelState: PanelState;
  openPanel: () => void;
  minimizePanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;

  launcherPos: LauncherPosition | null;
  setLauncherPos: (pos: LauncherPosition | null) => void;
  resetLauncherPos: () => void;

  tabs: NotepadTab[];
  activeTabId: string;
  setActiveTab: (id: string) => void;
  addTab: () => void;
  removeTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;
  updateTabContent: (id: string, content: string) => void;
  duplicateTab: (id: string) => void;
  setTabProject: (id: string, projectId: string | undefined, projectName: string | undefined) => void;
}

function makeTab(num: number): NotepadTab {
  return {
    id: crypto.randomUUID(),
    name: `Note ${num}`,
    content: '',
    createdAt: new Date().toISOString(),
  };
}

export const useNotepadStore = create<NotepadState>()(
  persist(
    (set, get) => {
      const defaultTab = makeTab(1);
      return {
        _hydrated: false,
        _setHydrated: () => set({ _hydrated: true }),

        panelState: 'closed',
        openPanel: () => set({ panelState: 'open' }),
        minimizePanel: () => set({ panelState: 'minimized' }),
        closePanel: () => set({ panelState: 'closed' }),
        togglePanel: () => {
          const s = get().panelState;
          set({ panelState: s === 'open' ? 'minimized' : 'open' });
        },

        launcherPos: null,
        setLauncherPos: (pos) => set({ launcherPos: pos }),
        resetLauncherPos: () => set({ launcherPos: null }),

        tabs: [defaultTab],
        activeTabId: defaultTab.id,
        setActiveTab: (id) => set({ activeTabId: id }),

        addTab: () => {
          const tabs = get().tabs;
          const nums = tabs.map(t => {
            const m = t.name.match(/^Note (\d+)$/);
            return m ? parseInt(m[1]) : 0;
          });
          const next = Math.max(0, ...nums) + 1;
          const tab = makeTab(next);
          set({ tabs: [...tabs, tab], activeTabId: tab.id });
        },

        removeTab: (id) => {
          const { tabs, activeTabId } = get();
          if (tabs.length <= 1) return;
          const idx = tabs.findIndex(t => t.id === id);
          const newTabs = tabs.filter(t => t.id !== id);
          let newActive = activeTabId;
          if (activeTabId === id) {
            newActive = newTabs[Math.min(idx, newTabs.length - 1)].id;
          }
          set({ tabs: newTabs, activeTabId: newActive });
        },

        renameTab: (id, name) => {
          set({ tabs: get().tabs.map(t => t.id === id ? { ...t, name } : t) });
        },

        updateTabContent: (id, content) => {
          set({
            tabs: get().tabs.map(t => t.id === id ? { ...t, content, updatedAt: new Date().toISOString() } : t),
          });
        },

        duplicateTab: (id) => {
          const { tabs } = get();
          const src = tabs.find(t => t.id === id);
          if (!src) return;
          const nums = tabs.map(t => {
            const m = t.name.match(/^Note (\d+)$/);
            return m ? parseInt(m[1]) : 0;
          });
          const next = Math.max(0, ...nums) + 1;
          const dup: NotepadTab = {
            id: crypto.randomUUID(),
            name: `Note ${next}`,
            content: src.content,
            createdAt: new Date().toISOString(),
            projectId: src.projectId,
            projectName: src.projectName,
          };
          set({ tabs: [...tabs, dup], activeTabId: dup.id });
        },

        setTabProject: (id, projectId, projectName) => {
          set({
            tabs: get().tabs.map(t => t.id === id ? { ...t, projectId, projectName } : t),
          });
        },
      };
    },
    {
      name: 'bau-suite-notepad',
      partialize: (state) => ({
        panelState: state.panelState,
        launcherPos: state.launcherPos,
        tabs: state.tabs,
        activeTabId: state.activeTabId,
      }),
      onRehydrateStorage: () => (state) => {
        state?._setHydrated();
      },
    }
  )
);
