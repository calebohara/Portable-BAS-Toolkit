'use client';

import { useCallback, useState, useRef } from 'react';
import { X, Plus, PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NotepadDocument } from '@/types';
import { useNotepadEditorStore } from '@/store/notepad-editor-store';

interface NotepadTabBarProps {
  documents: NotepadDocument[];
  onNewDocument: () => void;
  onCloseTab: (id: string) => void;
  onToggleFilePanel: () => void;
  /** Map of document IDs that have unsaved changes */
  dirtyIds?: Set<string>;
}

export function NotepadTabBar({
  documents,
  onNewDocument,
  onCloseTab,
  onToggleFilePanel,
  dirtyIds,
}: NotepadTabBarProps) {
  const openTabIds = useNotepadEditorStore(s => s.openTabIds);
  const activeTabId = useNotepadEditorStore(s => s.activeTabId);
  const setActiveTab = useNotepadEditorStore(s => s.setActiveTab);
  const showFilePanel = useNotepadEditorStore(s => s.showFilePanel);

  const scrollRef = useRef<HTMLDivElement>(null);

  const openDocs = openTabIds
    .map(id => documents.find(d => d.id === id))
    .filter(Boolean) as NotepadDocument[];

  const handleMiddleClick = useCallback((e: React.MouseEvent, id: string) => {
    if (e.button === 1) {
      e.preventDefault();
      onCloseTab(id);
    }
  }, [onCloseTab]);

  return (
    <div className="flex items-center border-b border-border bg-muted/20 shrink-0">
      {/* File panel toggle */}
      <button
        onClick={onToggleFilePanel}
        className={cn(
          'shrink-0 p-2 transition-colors border-r border-border',
          showFilePanel
            ? 'text-primary bg-primary/5'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
        )}
        title={showFilePanel ? 'Hide file panel' : 'Show file panel'}
        aria-label="Toggle file panel"
      >
        <PanelLeft className="h-3.5 w-3.5" />
      </button>

      {/* Tab strip */}
      <div ref={scrollRef} className="flex flex-1 overflow-x-auto scrollbar-none">
        {openDocs.map(doc => {
          const isActive = doc.id === activeTabId;
          const isDirty = dirtyIds?.has(doc.id);
          return (
            <div
              key={doc.id}
              className={cn(
                'group flex items-center gap-1 shrink-0 border-r border-border px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors',
                'hover:bg-muted/50',
                isActive
                  ? 'bg-background text-foreground border-b-2 border-b-primary -mb-px'
                  : 'text-muted-foreground',
              )}
              onClick={() => setActiveTab(doc.id)}
              onMouseDown={e => handleMiddleClick(e, doc.id)}
              title={doc.name}
            >
              <span className="truncate max-w-32">
                {isDirty && <span className="text-primary mr-0.5">●</span>}
                {doc.name}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onCloseTab(doc.id); }}
                className="ml-0.5 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity p-0.5 rounded"
                aria-label={`Close ${doc.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* New document */}
      <button
        onClick={onNewDocument}
        className="shrink-0 p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        aria-label="New document"
        title="New document (Ctrl+N)"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
