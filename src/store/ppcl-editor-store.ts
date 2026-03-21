'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PpclEditorState {
  openTabIds: string[];
  activeTabId: string | null;

  wordWrap: boolean;
  showLineNumbers: boolean;
  fontSize: number;
  lineStep: number; // PPCL line number auto-increment step (1–10)

  showFilePanel: boolean;
  isFullscreen: boolean;

  openTab: (id: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string | null) => void;
  setWordWrap: (v: boolean) => void;
  setShowLineNumbers: (v: boolean) => void;
  setFontSize: (v: number) => void;
  setLineStep: (v: number) => void;
  setShowFilePanel: (v: boolean) => void;
  setFullscreen: (v: boolean) => void;
}

export const usePpclEditorStore = create<PpclEditorState>()(
  persist(
    (set, get) => ({
      openTabIds: [],
      activeTabId: null,

      wordWrap: false,
      showLineNumbers: true,
      fontSize: 14,
      lineStep: 10,

      showFilePanel: true,
      isFullscreen: false,

      openTab: (id) => {
        const { openTabIds } = get();
        if (!openTabIds.includes(id)) {
          set({ openTabIds: [...openTabIds, id], activeTabId: id });
        } else {
          set({ activeTabId: id });
        }
      },

      closeTab: (id) => {
        const { openTabIds, activeTabId } = get();
        const idx = openTabIds.indexOf(id);
        if (idx === -1) return;
        const newTabs = openTabIds.filter(t => t !== id);
        let newActive = activeTabId;
        if (activeTabId === id) {
          newActive = newTabs.length === 0 ? null : newTabs[Math.min(idx, newTabs.length - 1)];
        }
        set({ openTabIds: newTabs, activeTabId: newActive });
      },

      setActiveTab: (id) => set({ activeTabId: id }),
      setWordWrap: (v) => set({ wordWrap: v }),
      setShowLineNumbers: (v) => set({ showLineNumbers: v }),
      setFontSize: (v) => set({ fontSize: Math.max(10, Math.min(24, v)) }),
      setLineStep: (v) => set({ lineStep: Math.max(1, Math.min(10, v)) }),
      setShowFilePanel: (v) => set({ showFilePanel: v }),
      setFullscreen: (v) => set({ isFullscreen: v }),
    }),
    {
      name: 'bau-suite-ppcl-editor',
      partialize: (state) => ({
        openTabIds: state.openTabIds,
        activeTabId: state.activeTabId,
        wordWrap: state.wordWrap,
        showLineNumbers: state.showLineNumbers,
        fontSize: state.fontSize,
        lineStep: state.lineStep,
        showFilePanel: state.showFilePanel,
      }),
    }
  )
);
