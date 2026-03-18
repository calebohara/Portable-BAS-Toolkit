'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { TopBar } from '@/components/layout/top-bar';
import { NotepadTabBar } from '@/components/notepad/notepad-tab-bar';
import { NotepadFilePanel } from '@/components/notepad/notepad-file-panel';
import { NotepadStatusBar } from '@/components/notepad/notepad-status-bar';
import type { CursorPosition } from '@/components/notepad/notepad-editor';
import { useNotepadDocuments } from '@/hooks/use-notepad-documents';
import { useNotepadEditorStore } from '@/store/notepad-editor-store';
import { useAppStore } from '@/store/app-store';
import type { NotepadDocument, NotepadLanguage } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Maximize2, Minimize2, Search, Download, Upload, FileCode2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// Dynamic import CodeMirror to avoid SSR issues
const NotepadEditorComponent = dynamic(
  () => import('@/components/notepad/notepad-editor').then(m => ({ default: m.NotepadEditorComponent })),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading editor...</div> }
);

// Language detection from file extension
function detectLanguage(filename: string): NotepadLanguage {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'json': return 'json';
    case 'xml': case 'svg': case 'xsd': case 'xsl': return 'xml';
    case 'js': case 'jsx': case 'ts': case 'tsx': case 'mjs': case 'cjs': return 'javascript';
    case 'py': case 'pyw': return 'python';
    case 'css': case 'scss': case 'less': return 'css';
    case 'html': case 'htm': return 'html';
    case 'md': case 'markdown': return 'markdown';
    default: return 'plaintext';
  }
}

function getFileExtension(lang: NotepadLanguage): string {
  switch (lang) {
    case 'json': return '.json';
    case 'xml': return '.xml';
    case 'javascript': return '.js';
    case 'python': return '.py';
    case 'css': return '.css';
    case 'html': return '.html';
    case 'markdown': return '.md';
    default: return '.txt';
  }
}

export default function NotepadPage() {
  const { documents, loading, addDocument, updateDocument, removeDocument } = useNotepadDocuments();
  const openTabIds = useNotepadEditorStore(s => s.openTabIds);
  const activeTabId = useNotepadEditorStore(s => s.activeTabId);
  const openTab = useNotepadEditorStore(s => s.openTab);
  const closeTab = useNotepadEditorStore(s => s.closeTab);
  const showFilePanel = useNotepadEditorStore(s => s.showFilePanel);
  const setShowFilePanel = useNotepadEditorStore(s => s.setShowFilePanel);
  const isFullscreen = useNotepadEditorStore(s => s.isFullscreen);
  const setFullscreen = useNotepadEditorStore(s => s.setFullscreen);

  const [cursor, setCursor] = useState<CursorPosition>({ line: 1, col: 1, selectionLength: 0 });
  // Local content buffer for debounced saving
  const [localContent, setLocalContent] = useState<string>('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());

  const activeDoc = useMemo(
    () => documents.find(d => d.id === activeTabId),
    [documents, activeTabId]
  );

  // Sync local content when active doc changes
  useEffect(() => {
    if (activeDoc) {
      setLocalContent(activeDoc.content);
    }
  }, [activeDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate word count
  const wordCount = useMemo(() => {
    if (!localContent) return 0;
    return localContent.trim().split(/\s+/).filter(Boolean).length;
  }, [localContent]);

  // Debounced save
  const handleContentChange = useCallback((newContent: string) => {
    setLocalContent(newContent);
    if (!activeTabId) return;

    setDirtyIds(prev => new Set(prev).add(activeTabId));

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      updateDocument(activeTabId, { content: newContent }).then(() => {
        setDirtyIds(prev => {
          const next = new Set(prev);
          next.delete(activeTabId);
          return next;
        });
      });
    }, 500);
  }, [activeTabId, updateDocument]);

  // Immediate save (Ctrl+S)
  const handleSave = useCallback(() => {
    if (!activeTabId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    updateDocument(activeTabId, { content: localContent }).then(() => {
      setDirtyIds(prev => {
        const next = new Set(prev);
        next.delete(activeTabId);
        return next;
      });
      toast.success('Saved');
    });
  }, [activeTabId, localContent, updateDocument]);

  // Create new document
  const handleNewDocument = useCallback(async () => {
    const doc = await addDocument('Untitled', 'plaintext');
    if (doc) openTab(doc.id);
  }, [addDocument, openTab]);

  // Close tab
  const handleCloseTab = useCallback((id: string) => {
    closeTab(id);
  }, [closeTab]);

  // Delete document
  const handleDeleteDocument = useCallback(async (id: string) => {
    closeTab(id);
    await removeDocument(id);
    toast.success('Document deleted');
  }, [closeTab, removeDocument]);

  // Rename
  const handleRenameDocument = useCallback(async (id: string, name: string) => {
    await updateDocument(id, { name });
  }, [updateDocument]);

  // Language change
  const handleLanguageChange = useCallback(async (lang: NotepadLanguage) => {
    if (!activeTabId) return;
    await updateDocument(activeTabId, { language: lang });
  }, [activeTabId, updateDocument]);

  // Import file
  const handleImportFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const lang = detectLanguage(file.name);
      const doc = await addDocument(file.name, lang, text);
      if (doc) openTab(doc.id);
      toast.success(`Imported "${file.name}"`);
    } catch {
      toast.error('Failed to import file');
    }
  }, [addDocument, openTab]);

  // Export / download
  const handleExportDocument = useCallback((doc: NotepadDocument) => {
    const name = doc.name.includes('.') ? doc.name : doc.name + getFileExtension(doc.language);
    const blob = new Blob([doc.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded "${name}"`);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'n') {
        e.preventDefault();
        handleNewDocument();
      }
      if (mod && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) handleCloseTab(activeTabId);
      }
      if (e.key === 'Escape' && isFullscreen) {
        setFullscreen(false);
      }
      if (e.key === 'F11') {
        e.preventDefault();
        setFullscreen(!isFullscreen);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTabId, isFullscreen, handleNewDocument, handleCloseTab, setFullscreen]);

  // Drop zone for file import
  const [dragOver, setDragOver] = useState(false);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleImportFile(file);
  }, [handleImportFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  // Open find panel
  const handleOpenFind = useCallback(() => {
    const fn = (window as unknown as Record<string, unknown>).__notepadEditorOpenFind as (() => void) | undefined;
    if (fn) fn();
  }, []);

  if (loading) {
    return (
      <>
        <TopBar title="Notepad" />
        <div className="flex-1 flex items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </>
    );
  }

  // Fullscreen wrapper
  const editorContent = (
    <div
      className={cn(
        'flex flex-col',
        isFullscreen ? 'fixed inset-0 z-50 bg-background' : 'flex-1',
      )}
      style={!isFullscreen ? { height: 'calc(100vh - 3.5rem)' } : undefined}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Fullscreen header */}
      {isFullscreen && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30 shrink-0">
          <FileCode2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold flex-1">Notepad</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFullscreen(false)}
            className="h-7 gap-1.5 text-xs"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            Exit Fullscreen
          </Button>
        </div>
      )}

      {/* Tab bar */}
      <NotepadTabBar
        documents={documents}
        onNewDocument={handleNewDocument}
        onCloseTab={handleCloseTab}
        onToggleFilePanel={() => setShowFilePanel(!showFilePanel)}
        dirtyIds={dirtyIds}
      />

      {/* Main area: file panel + editor */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary rounded-lg">
            <div className="text-center">
              <Upload className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="text-sm font-medium text-primary">Drop file to import</p>
            </div>
          </div>
        )}

        {/* File panel — hidden on mobile by default, overlay on mobile */}
        {showFilePanel && (
          <>
            {/* Mobile backdrop */}
            <div
              className="fixed inset-0 bg-black/40 z-30 md:hidden"
              onClick={() => setShowFilePanel(false)}
            />
            <div className={cn(
              'shrink-0 z-30',
              'max-md:fixed max-md:left-0 max-md:top-0 max-md:bottom-0',
            )}>
              <NotepadFilePanel
                documents={documents}
                onNewDocument={handleNewDocument}
                onDeleteDocument={handleDeleteDocument}
                onRenameDocument={handleRenameDocument}
                onImportFile={handleImportFile}
                onExportDocument={handleExportDocument}
              />
            </div>
          </>
        )}

        {/* Editor area */}
        <div className="flex-1 flex flex-col min-w-0">
          {activeDoc ? (
            <div className="flex-1 min-h-0 overflow-hidden">
              <NotepadEditorComponent
                content={localContent}
                language={activeDoc.language}
                onContentChange={handleContentChange}
                onCursorChange={setCursor}
                onSave={handleSave}
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4">
              <FileCode2 className="h-12 w-12 text-muted-foreground/30" />
              <div className="text-center">
                <p className="text-sm font-medium">No document open</p>
                <p className="text-xs mt-1">
                  {documents.length > 0
                    ? 'Select a document from the file panel, or create a new one.'
                    : 'Create your first document to get started.'}
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleNewDocument}
                className="gap-1.5"
              >
                <FileCode2 className="h-3.5 w-3.5" />
                New Document
              </Button>
            </div>
          )}

          {/* Status bar */}
          {activeDoc && (
            <NotepadStatusBar
              cursor={cursor}
              charCount={localContent.length}
              wordCount={wordCount}
              language={activeDoc.language}
              onLanguageChange={handleLanguageChange}
            />
          )}
        </div>
      </div>
    </div>
  );

  if (isFullscreen) {
    return editorContent;
  }

  return (
    <>
      <TopBar title="Notepad">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenFind}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            title="Find & Replace (Ctrl+F)"
            disabled={!activeDoc}
          >
            <Search className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFullscreen(true)}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hidden sm:flex"
            title="Fullscreen (F11)"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </TopBar>
      {editorContent}
    </>
  );
}
