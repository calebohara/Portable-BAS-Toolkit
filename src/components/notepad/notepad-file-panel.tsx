'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Search, Plus, FileText, Trash2, Pencil, Download, Upload,
  MoreVertical, Clock, ArrowDownAZ,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NotepadDocument, NotepadLanguage } from '@/types';
import { NOTEPAD_LANGUAGE_LABELS } from '@/types';
import { useNotepadEditorStore } from '@/store/notepad-editor-store';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type SortMode = 'updated' | 'name';

interface NotepadFilePanelProps {
  documents: NotepadDocument[];
  onNewDocument: () => void;
  onDeleteDocument: (id: string) => void;
  onRenameDocument: (id: string, name: string) => void;
  onImportFile: (file: File) => void;
  onExportDocument: (doc: NotepadDocument) => void;
}

export function NotepadFilePanel({
  documents,
  onNewDocument,
  onDeleteDocument,
  onRenameDocument,
  onImportFile,
  onExportDocument,
}: NotepadFilePanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('updated');
  const [contextDocId, setContextDocId] = useState<string | null>(null);
  const [renameDocId, setRenameDocId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openTab = useNotepadEditorStore(s => s.openTab);
  const activeTabId = useNotepadEditorStore(s => s.activeTabId);

  const filtered = documents
    .filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  const handleDocClick = useCallback((doc: NotepadDocument) => {
    openTab(doc.id);
  }, [openTab]);

  const startRename = useCallback((doc: NotepadDocument) => {
    setRenameDocId(doc.id);
    setRenameValue(doc.name);
    setContextDocId(null);
  }, []);

  const commitRename = useCallback(() => {
    if (renameDocId && renameValue.trim()) {
      onRenameDocument(renameDocId, renameValue.trim());
    }
    setRenameDocId(null);
  }, [renameDocId, renameValue, onRenameDocument]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  const deleteDoc = deleteDocId ? documents.find(d => d.id === deleteDocId) : null;

  return (
    <>
      <div
        className="flex flex-col h-full border-r border-border bg-background md:bg-muted/10"
        style={{ width: 'min(280px, 80vw)', minWidth: 220 }}
      >
        {/* Header */}
        <div className="shrink-0 p-2 space-y-2 border-b border-border">
          <div className="flex items-center gap-1">
            <h3 className="text-xs font-semibold text-foreground flex-1">Files</h3>
            <button
              onClick={() => setSortMode(sortMode === 'updated' ? 'name' : 'updated')}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={`Sort by ${sortMode === 'updated' ? 'name' : 'date'}`}
              aria-label={`Sort by ${sortMode === 'updated' ? 'name' : 'date'}`}
            >
              {sortMode === 'updated' ? <Clock className="h-3 w-3" /> : <ArrowDownAZ className="h-3 w-3" />}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Import file"
              aria-label="Import file"
            >
              <Upload className="h-3 w-3" />
            </button>
            <button
              onClick={onNewDocument}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="New document"
              aria-label="New document"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="w-full h-7 pl-7 pr-2 text-xs bg-background border border-border rounded-md outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center">
              <FileText className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-[11px] text-muted-foreground">
                {searchQuery ? 'No matching files' : 'No documents yet'}
              </p>
            </div>
          )}
          {filtered.map(doc => (
            <div
              key={doc.id}
              className={cn(
                'group flex items-center gap-2 px-2 py-1.5 mx-1 rounded-md cursor-pointer transition-colors',
                'hover:bg-muted/60',
                doc.id === activeTabId && 'bg-muted text-foreground',
              )}
              onClick={() => handleDocClick(doc)}
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{doc.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {NOTEPAD_LANGUAGE_LABELS[doc.language]} · {formatDate(doc.updatedAt)}
                </p>
              </div>
              <div className="shrink-0 relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setContextDocId(contextDocId === doc.id ? null : doc.id); }}
                  className="p-0.5 rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-muted-foreground/10 transition-opacity"
                  aria-label="Document options"
                >
                  <MoreVertical className="h-3 w-3" />
                </button>
                {contextDocId === doc.id && (
                  <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-32">
                    <button
                      onClick={(e) => { e.stopPropagation(); startRename(doc); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                    >
                      <Pencil className="h-3 w-3" /> Rename
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onExportDocument(doc); setContextDocId(null); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                    >
                      <Download className="h-3 w-3" /> Download
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteDocId(doc.id); setContextDocId(null); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".txt,.json,.xml,.js,.ts,.py,.css,.html,.htm,.md,.log,.csv,.yaml,.yml,.toml,.ini,.cfg,.conf,.bat,.sh,.ps1"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onImportFile(file);
          e.target.value = '';
        }}
      />

      {/* Rename dialog */}
      <Dialog open={!!renameDocId} onOpenChange={() => setRenameDocId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Document</DialogTitle>
            <DialogDescription>Enter a new name for this document.</DialogDescription>
          </DialogHeader>
          <DialogBody className="px-5 py-3">
            <Input
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); }}
              className="h-8 text-sm"
              autoFocus
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenameDocId(null)}>Cancel</Button>
            <Button size="sm" onClick={commitRename} disabled={!renameValue.trim()}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteDocId} onOpenChange={() => setDeleteDocId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteDoc?.name}&quot;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteDocId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { if (deleteDocId) { onDeleteDocument(deleteDocId); setDeleteDocId(null); } }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
