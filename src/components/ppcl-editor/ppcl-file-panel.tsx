'use client';

import { useState, useRef } from 'react';
import { Search, Plus, Upload, Trash2, FileCode, Pencil, Check, X, Replace } from 'lucide-react';
import { usePpclEditorStore } from '@/store/ppcl-editor-store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PpclDocument } from '@/types';
import { format } from 'date-fns';

interface PpclFilePanelProps {
  documents: PpclDocument[];
  onNewDocument: () => void;
  onDeleteDocument: (id: string) => Promise<void>;
  onRenameDocument: (id: string, name: string) => Promise<void>;
  onImportFile: (file: File) => Promise<void>;
  onFindReplace: () => void;
}

export function PpclFilePanel({ documents, onNewDocument, onDeleteDocument, onRenameDocument, onImportFile, onFindReplace }: PpclFilePanelProps) {
  const openTab = usePpclEditorStore(s => s.openTab);
  const activeTabId = usePpclEditorStore(s => s.activeTabId);
  const [filter, setFilter] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const filtered = documents.filter(d =>
    d.name.toLowerCase().includes(filter.toLowerCase())
  );

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await onImportFile(file);
      e.target.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(null);
    await onDeleteDocument(id);
  };

  const startRename = (doc: PpclDocument) => {
    setRenamingId(doc.id);
    setRenameValue(doc.name);
    setTimeout(() => renameInputRef.current?.select(), 50);
  };

  const confirmRename = async () => {
    if (renamingId && renameValue.trim()) {
      const name = renameValue.trim().endsWith('.pcl') ? renameValue.trim() : renameValue.trim() + '.pcl';
      await onRenameDocument(renamingId, name);
    }
    setRenamingId(null);
  };

  const cancelRename = () => {
    setRenamingId(null);
  };

  return (
    <div className="w-56 h-full border-r border-border bg-muted/20 flex flex-col">
      {/* Header */}
      <div className="p-2 border-b border-border space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter programs..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="h-7 pl-7 text-xs"
          />
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="flex-1 h-7 text-xs gap-1" onClick={onNewDocument}>
            <Plus className="h-3 w-3" /> New
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-7 text-xs gap-1"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3 w-3" /> Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pcl,.txt"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>
        <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1.5" onClick={onFindReplace}>
          <Search className="h-3 w-3" /> Find & Replace
        </Button>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {documents.length === 0 ? 'No PPCL programs yet.' : 'No matches.'}
          </div>
        ) : (
          filtered.map(doc => (
            <div
              key={doc.id}
              className={cn(
                'group flex items-start gap-2 px-2 py-2 cursor-pointer border-b border-border/50 transition-colors',
                activeTabId === doc.id ? 'bg-primary/10' : 'hover:bg-muted/50'
              )}
              onClick={() => { if (renamingId !== doc.id) openTab(doc.id); }}
            >
              <FileCode className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                {renamingId === doc.id ? (
                  <div className="flex items-center gap-1">
                    <Input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') confirmRename();
                        if (e.key === 'Escape') cancelRename();
                      }}
                      onClick={e => e.stopPropagation()}
                      className="h-5 text-xs px-1"
                      autoFocus
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 shrink-0 text-green-500"
                      onClick={(e) => { e.stopPropagation(); confirmRename(); }}
                      title="Confirm rename"
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 shrink-0 text-muted-foreground"
                      onClick={(e) => { e.stopPropagation(); cancelRename(); }}
                      title="Cancel rename"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="text-xs font-medium truncate">{doc.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(doc.updatedAt), 'MMM d, h:mm a')}
                      <span className="ml-1 uppercase text-[9px]">{doc.firmware}</span>
                    </p>
                  </>
                )}
              </div>
              {renamingId !== doc.id && (
                deletingId === doc.id ? (
                  <div className="flex gap-0.5 shrink-0">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-5 px-1.5 text-[10px]"
                      onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                    >
                      Delete
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1 text-[10px]"
                      onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                      onClick={(e) => { e.stopPropagation(); startRename(doc); }}
                      title="Rename program"
                      aria-label={`Rename ${doc.name}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeletingId(doc.id); }}
                      title="Delete program"
                      aria-label={`Delete ${doc.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
