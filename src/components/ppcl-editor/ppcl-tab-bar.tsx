'use client';

import { X, Plus, PanelLeft } from 'lucide-react';
import { usePpclEditorStore } from '@/store/ppcl-editor-store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { PpclDocument } from '@/types';

interface PpclTabBarProps {
  documents: PpclDocument[];
  onNewDocument: () => void;
  onCloseTab: (id: string) => void;
  onToggleFilePanel: () => void;
  dirtyIds: Set<string>;
}

export function PpclTabBar({ documents, onNewDocument, onCloseTab, onToggleFilePanel, dirtyIds }: PpclTabBarProps) {
  const openTabIds = usePpclEditorStore(s => s.openTabIds);
  const activeTabId = usePpclEditorStore(s => s.activeTabId);
  const setActiveTab = usePpclEditorStore(s => s.setActiveTab);

  const openDocs = openTabIds
    .map(id => documents.find(d => d.id === id))
    .filter(Boolean) as PpclDocument[];

  return (
    <div className="flex items-center border-b border-border bg-muted/30 shrink-0 min-h-[36px]">
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleFilePanel}
        className="h-9 w-9 p-0 shrink-0 text-muted-foreground hover:text-foreground"
        title="Toggle file panel"
        aria-label="Toggle file panel"
      >
        <PanelLeft className="h-4 w-4" />
      </Button>

      <div className="flex-1 flex items-center overflow-x-auto scrollbar-none">
        {openDocs.map(doc => (
          <button
            key={doc.id}
            onClick={() => setActiveTab(doc.id)}
            onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); onCloseTab(doc.id); } }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap border-r border-border transition-colors',
              activeTabId === doc.id
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            {dirtyIds.has(doc.id) && <span className="text-primary" title="Unsaved changes">●</span>}
            {doc.name}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onCloseTab(doc.id); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onCloseTab(doc.id); } }}
              className="ml-1 p-0.5 rounded hover:bg-muted-foreground/20"
              title="Close tab"
              aria-label={`Close ${doc.name}`}
            >
              <X className="h-3 w-3" />
            </span>
          </button>
        ))}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onNewDocument}
        className="h-9 w-9 p-0 shrink-0 text-muted-foreground hover:text-foreground"
        title="New PPCL program (Ctrl+N)"
        aria-label="New PPCL program"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
