'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NotepadEditorState {
  // Tab management
  openTabIds: string[];
  activeTabId: string | null;

  // Editor preferences
  wordWrap: boolean;
  showLineNumbers: boolean;
  fontSize: number;
  showWhitespace: boolean;
  indentSize: number;

  // UI state
  showFilePanel: boolean;
  isFullscreen: boolean;

  // Actions
  openTab: (id: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string | null) => void;
  setWordWrap: (v: boolean) => void;
  setShowLineNumbers: (v: boolean) => void;
  setFontSize: (v: number) => void;
  setShowWhitespace: (v: boolean) => void;
  setIndentSize: (v: number) => void;
  setShowFilePanel: (v: boolean) => void;
  setFullscreen: (v: boolean) => void;
}

export const useNotepadEditorStore = create<NotepadEditorState>()(
  persist(
    (set, get) => ({
      openTabIds: [],
      activeTabId: null,

      wordWrap: true,
      showLineNumbers: true,
      fontSize: 14,
      showWhitespace: false,
      indentSize: 2,

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
          if (newTabs.length === 0) {
            newActive = null;
          } else {
            newActive = newTabs[Math.min(idx, newTabs.length - 1)];
          }
        }
        set({ openTabIds: newTabs, activeTabId: newActive });
      },

      setActiveTab: (id) => set({ activeTabId: id }),
      setWordWrap: (v) => set({ wordWrap: v }),
      setShowLineNumbers: (v) => set({ showLineNumbers: v }),
      setFontSize: (v) => set({ fontSize: Math.max(10, Math.min(24, v)) }),
      setShowWhitespace: (v) => set({ showWhitespace: v }),
      setIndentSize: (v) => set({ indentSize: v }),
      setShowFilePanel: (v) => set({ showFilePanel: v }),
      setFullscreen: (v) => set({ isFullscreen: v }),
    }),
    {
      name: 'bau-suite-notepad-editor',
      partialize: (state) => ({
        openTabIds: state.openTabIds,
        activeTabId: state.activeTabId,
        wordWrap: state.wordWrap,
        showLineNumbers: state.showLineNumbers,
        fontSize: state.fontSize,
        showWhitespace: state.showWhitespace,
        indentSize: state.indentSize,
        showFilePanel: state.showFilePanel,
      }),
    }
  )
);
