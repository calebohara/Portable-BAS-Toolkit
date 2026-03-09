'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface NotepadTab {
  id: string;
  name: string;
  content: string;
  createdAt: string;
}

type PanelState = 'closed' | 'open' | 'minimized';

/** Launcher position — null means default (bottom-right) */
export interface LauncherPosition {
  x: number;
  y: number;
}

interface NotepadState {
  // Panel
  panelState: PanelState;
  openPanel: () => void;
  minimizePanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;

  // Launcher position
  launcherPos: LauncherPosition | null;
  setLauncherPos: (pos: LauncherPosition | null) => void;
  resetLauncherPos: () => void;

  // Tabs
  tabs: NotepadTab[];
  activeTabId: string;
  setActiveTab: (id: string) => void;
  addTab: () => void;
  removeTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;
  updateTabContent: (id: string, content: string) => void;
}

let nextTabNum = 1;

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
          // Derive next number from existing tabs
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
          if (tabs.length <= 1) return; // keep at least one
          const idx = tabs.findIndex(t => t.id === id);
          const newTabs = tabs.filter(t => t.id !== id);
          let newActive = activeTabId;
          if (activeTabId === id) {
            newActive = newTabs[Math.min(idx, newTabs.length - 1)].id;
          }
          set({ tabs: newTabs, activeTabId: newActive });
        },

        renameTab: (id, name) => {
          set({
            tabs: get().tabs.map(t => t.id === id ? { ...t, name } : t),
          });
        },

        updateTabContent: (id, content) => {
          set({
            tabs: get().tabs.map(t => t.id === id ? { ...t, content } : t),
          });
        },
      };
    },
    {
      name: 'bau-suite-notepad',
    }
  )
);
