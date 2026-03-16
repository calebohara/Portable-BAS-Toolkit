'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ProjectNotepadEntry {
  id: string;
  projectId: string;
  name: string;
  content: string;
  /** ID of the floating notepad tab this was synced from (if any) */
  linkedTabId?: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectNotepadState {
  entries: ProjectNotepadEntry[];
  addEntry: (projectId: string, name: string, content: string, linkedTabId?: string) => string;
  updateContent: (id: string, content: string) => void;
  removeEntry: (id: string) => void;
  renameEntry: (id: string, name: string) => void;
  /** Sync content from a floating notepad tab into an existing project entry */
  syncFromTab: (id: string, content: string) => void;
  getEntriesForProject: (projectId: string) => ProjectNotepadEntry[];
}

export const useProjectNotepadStore = create<ProjectNotepadState>()(
  persist(
    (set, get) => ({
      entries: [],

      addEntry: (projectId, name, content, linkedTabId) => {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const entry: ProjectNotepadEntry = {
          id,
          projectId,
          name,
          content,
          linkedTabId,
          createdAt: now,
          updatedAt: now,
        };
        set({ entries: [...get().entries, entry] });
        return id;
      },

      updateContent: (id, content) => {
        set({
          entries: get().entries.map(e =>
            e.id === id ? { ...e, content, updatedAt: new Date().toISOString() } : e
          ),
        });
      },

      removeEntry: (id) => {
        set({ entries: get().entries.filter(e => e.id !== id) });
      },

      renameEntry: (id, name) => {
        set({
          entries: get().entries.map(e =>
            e.id === id ? { ...e, name, updatedAt: new Date().toISOString() } : e
          ),
        });
      },

      syncFromTab: (id, content) => {
        set({
          entries: get().entries.map(e =>
            e.id === id ? { ...e, content, updatedAt: new Date().toISOString() } : e
          ),
        });
      },

      getEntriesForProject: (projectId) => {
        return get().entries.filter(e => e.projectId === projectId);
      },
    }),
    {
      name: 'bau-suite-project-notepad',
      partialize: (state) => ({ entries: state.entries }),
    }
  )
);
