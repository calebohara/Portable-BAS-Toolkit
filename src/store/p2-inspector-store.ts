'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { P2Point, P2Trend, P2Meta } from '@/lib/p2-parser';

// Point/trend data extracted from an imported `.p2` panel file. This is a
// local-only *view aid* for the PPCL Editor — the reconstructed programs persist
// as normal synced PpclDocuments, while the panel's point database and trend
// list (which only exist in the original binary, not in the .pcl text) are kept
// here in localStorage keyed by the editor documents they were imported with.
//
// Deliberately NOT stored on PpclDocument / in IndexedDB: it never needs to sync,
// and keeping it out of the document model avoids touching the sync field-map.

export interface P2ImportData {
  fileName: string;
  meta: P2Meta;
  points: P2Point[];
  trends: P2Trend[];
}

interface P2InspectorState {
  /** importId → extracted panel data. */
  imports: Record<string, P2ImportData>;
  /** PpclDocument id → importId. Many program docs share one import. */
  docToImport: Record<string, string>;
  /** Whether the inspector side panel is shown. */
  showInspector: boolean;

  /** Register a freshly-imported panel and link the program docs created from it. */
  addImport: (importId: string, data: P2ImportData, docIds: string[]) => void;
  /** Drop a document's link; garbage-collect the import when nothing references it. */
  removeDoc: (docId: string) => void;
  setShowInspector: (v: boolean) => void;
}

export const useP2InspectorStore = create<P2InspectorState>()(
  persist(
    (set, get) => ({
      imports: {},
      docToImport: {},
      showInspector: false,

      addImport: (importId, data, docIds) => {
        const { imports, docToImport } = get();
        const nextDocMap = { ...docToImport };
        for (const id of docIds) nextDocMap[id] = importId;
        set({
          imports: { ...imports, [importId]: data },
          docToImport: nextDocMap,
          showInspector: true,
        });
      },

      removeDoc: (docId) => {
        const { imports, docToImport } = get();
        const importId = docToImport[docId];
        if (!importId) return;
        const nextDocMap = { ...docToImport };
        delete nextDocMap[docId];
        // If no remaining doc references this import, free its data.
        const stillUsed = Object.values(nextDocMap).includes(importId);
        const nextImports = { ...imports };
        if (!stillUsed) delete nextImports[importId];
        set({ docToImport: nextDocMap, imports: nextImports });
      },

      setShowInspector: (v) => set({ showInspector: v }),
    }),
    {
      name: 'bau-suite-p2-inspector',
      version: 1,
      partialize: (s) => ({
        imports: s.imports,
        docToImport: s.docToImport,
        showInspector: s.showInspector,
      }),
    },
  ),
);

/** Resolve the imported panel data for a given editor document, if any. */
export function useP2DataForDoc(docId: string | null | undefined): P2ImportData | undefined {
  const importId = useP2InspectorStore((s) => (docId ? s.docToImport[docId] : undefined));
  return useP2InspectorStore((s) => (importId ? s.imports[importId] : undefined));
}
