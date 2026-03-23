'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { TopBar } from '@/components/layout/top-bar';
import { PpclTabBar } from '@/components/ppcl-editor/ppcl-tab-bar';
import { PpclFilePanel } from '@/components/ppcl-editor/ppcl-file-panel';
import { PpclStatusBar } from '@/components/ppcl-editor/ppcl-status-bar';
import type { CursorPosition } from '@/components/ppcl-editor/ppcl-editor';
import { usePpclDocuments } from '@/hooks/use-ppcl-documents';
import { usePpclEditorStore } from '@/store/ppcl-editor-store';
import { useProjects } from '@/hooks/use-projects';
import { cn, sanitizeFilename } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Maximize2, Minimize2, Download, Upload, FileCode,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog';

const PpclEditorComponent = dynamic(
  () => import('@/components/ppcl-editor/ppcl-editor').then(m => ({ default: m.PpclEditorComponent })),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading editor...</div> }
);

export default function PpclEditorPage() {
  const { documents, loading, addDocument, updateDocument, removeDocument } = usePpclDocuments();
  const openTabIds = usePpclEditorStore(s => s.openTabIds);
  const activeTabId = usePpclEditorStore(s => s.activeTabId);
  const openTab = usePpclEditorStore(s => s.openTab);
  const closeTab = usePpclEditorStore(s => s.closeTab);
  const showFilePanel = usePpclEditorStore(s => s.showFilePanel);
  const setShowFilePanel = usePpclEditorStore(s => s.setShowFilePanel);
  const isFullscreen = usePpclEditorStore(s => s.isFullscreen);
  const setFullscreen = usePpclEditorStore(s => s.setFullscreen);

  const searchParams = useSearchParams();

  // Mobile detection
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobileViewport(mq.matches);
    if (mq.matches) setShowFilePanel(false);
    const handler = (e: MediaQueryListEvent) => setIsMobileViewport(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open document from ?docId= query param
  const initialDocHandled = useRef(false);
  useEffect(() => {
    if (initialDocHandled.current || loading) return;
    const docId = searchParams.get('docId');
    if (docId && documents.some(d => d.id === docId)) {
      openTab(docId);
      initialDocHandled.current = true;
    }
  }, [searchParams, documents, loading, openTab]);

  const [cursor, setCursor] = useState<CursorPosition>({ line: 1, selectionLength: 0 });
  const editorViewRef = useRef<import('@codemirror/view').EditorView | null>(null);
  const [localContent, setLocalContent] = useState<string>('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());

  const activeDoc = useMemo(
    () => documents.find(d => d.id === activeTabId),
    [documents, activeTabId]
  );

  // Sync local content when active doc changes
  useEffect(() => {
    if (activeDoc) setLocalContent(activeDoc.content);
  }, [activeDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const lineCount = useMemo(() => {
    if (!localContent) return 0;
    return localContent.split('\n').length;
  }, [localContent]);

  // Debounced save
  const handleContentChange = useCallback((newContent: string) => {
    setLocalContent(newContent);
    if (!activeTabId) return;
    setDirtyIds(prev => new Set(prev).add(activeTabId));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      updateDocument(activeTabId, { content: newContent }).then(() => {
        setDirtyIds(prev => { const next = new Set(prev); next.delete(activeTabId); return next; });
      });
    }, 500);
  }, [activeTabId, updateDocument]);

  // Immediate save (Ctrl+S)
  const handleSave = useCallback(() => {
    if (!activeTabId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    updateDocument(activeTabId, { content: localContent }).then(() => {
      setDirtyIds(prev => { const next = new Set(prev); next.delete(activeTabId); return next; });
      toast.success('Saved');
    });
  }, [activeTabId, localContent, updateDocument]);

  const { projects } = useProjects();

  // New Program dialog state
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [newProjectId, setNewProjectId] = useState('');

  const handleOpenNewDialog = useCallback(() => {
    setNewName('');
    setNewProjectId('');
    setShowNewDialog(true);
  }, []);

  const handleCreateDocument = useCallback(async () => {
    const name = newName.trim() || 'Untitled';
    const fileName = name.endsWith('.pcl') ? name : name + '.pcl';
    const doc = await addDocument(fileName, '100 ', 'pxc-tc', newProjectId || '');
    if (doc) openTab(doc.id);
    setShowNewDialog(false);
    toast.success(`Created "${fileName}"`);
  }, [newName, newProjectId, addDocument, openTab]);

  const handleFindReplace = useCallback(() => {
    const view = editorViewRef.current;
    if (view) {
      import('@codemirror/search').then(({ openSearchPanel }) => {
        openSearchPanel(view);
      });
    }
  }, []);

  const handleCloseTab = useCallback((id: string) => { closeTab(id); }, [closeTab]);

  const handleDeleteDocument = useCallback(async (id: string) => {
    closeTab(id);
    await removeDocument(id);
    toast.success('Program deleted');
  }, [closeTab, removeDocument]);

  const handleRenameDocument = useCallback(async (id: string, name: string) => {
    await updateDocument(id, { name });
    toast.success(`Renamed to "${name}"`);
  }, [updateDocument]);

  const handleUpdateProject = useCallback(async (id: string, projectId: string) => {
    await updateDocument(id, { projectId });
    const projectName = projects.find(p => p.id === projectId)?.name;
    toast.success(projectName ? `Assigned to "${projectName}"` : 'Removed from project');
  }, [updateDocument, projects]);

  // Import .pcl file
  const handleImportFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const name = file.name.endsWith('.pcl') ? file.name : file.name + '.pcl';
      const doc = await addDocument(name, text);
      if (doc) openTab(doc.id);
      toast.success(`Imported "${file.name}"`);
    } catch {
      toast.error('Failed to import file');
    }
  }, [addDocument, openTab]);

  // Export / download as .pcl
  const handleExportDocument = useCallback(() => {
    if (!activeDoc) return;
    const name = activeDoc.name.endsWith('.pcl') ? activeDoc.name : activeDoc.name + '.pcl';
    const blob = new Blob([localContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilename(name);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success(`Downloaded "${name}"`);
  }, [activeDoc, localContent]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'n') { e.preventDefault(); handleOpenNewDialog(); }
      if (mod && e.key === 'w') { e.preventDefault(); if (activeTabId) handleCloseTab(activeTabId); }
      if (e.key === 'Escape' && isFullscreen) setFullscreen(false);
      if (e.key === 'F11') { e.preventDefault(); setFullscreen(!isFullscreen); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTabId, isFullscreen, handleOpenNewDialog, handleCloseTab, setFullscreen]);

  // Drag and drop
  const [dragOver, setDragOver] = useState(false);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleImportFile(file);
  }, [handleImportFile]);

  if (loading) {
    return (
      <>
        <TopBar title="PPCL Editor" />
        <div className="flex-1 flex items-center justify-center" role="status" aria-live="polite">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-label="Loading" />
        </div>
      </>
    );
  }

  const editorContent = (
    <div
      className={cn(
        'flex flex-col',
        isFullscreen ? 'fixed inset-0 z-50 bg-background' : 'flex-1',
      )}
      style={!isFullscreen ? { height: 'calc(100vh - 3.5rem)' } : undefined}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
    >
      {isFullscreen && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30 shrink-0">
          <FileCode className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold flex-1">PPCL Editor</span>
          <Button variant="ghost" size="sm" onClick={() => setFullscreen(false)} className="h-7 gap-1.5 text-xs">
            <Minimize2 className="h-3.5 w-3.5" /> Exit Fullscreen
          </Button>
        </div>
      )}

      <PpclTabBar
        documents={documents}
        onNewDocument={handleOpenNewDialog}
        onCloseTab={handleCloseTab}
        onToggleFilePanel={() => setShowFilePanel(!showFilePanel)}
        dirtyIds={dirtyIds}
      />

      <div className="flex flex-1 min-h-0 relative">
        {dragOver && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary rounded-lg">
            <div className="text-center">
              <Upload className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="text-sm font-medium text-primary">Drop .pcl file to import</p>
            </div>
          </div>
        )}

        {showFilePanel && isMobileViewport && (
          <div className="fixed inset-0 bg-black/40 z-30" onClick={() => setShowFilePanel(false)} aria-hidden="true" />
        )}

        {showFilePanel && (
          <div className="shrink-0 z-30 max-md:fixed max-md:left-0 max-md:top-0 max-md:bottom-0">
            <PpclFilePanel
              documents={documents}
              projects={projects}
              onNewDocument={handleOpenNewDialog}
              onDeleteDocument={handleDeleteDocument}
              onRenameDocument={handleRenameDocument}
              onImportFile={handleImportFile}
              onUpdateProject={handleUpdateProject}
              onFindReplace={handleFindReplace}
            />
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          {activeDoc ? (
            <div className="flex-1 min-h-0 overflow-hidden">
              <PpclEditorComponent
                content={localContent}
                onContentChange={handleContentChange}
                onCursorChange={setCursor}
                onSave={handleSave}
                onEditorView={(view) => { editorViewRef.current = view; }}
                charLimit={activeDoc.firmware === 'ptec' ? 80 : 198}
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4">
              <FileCode className="h-12 w-12 text-muted-foreground/30" />
              <div className="text-center">
                <p className="text-sm font-medium">No PPCL program open</p>
                <p className="text-xs mt-1">
                  {documents.length > 0
                    ? 'Select a program from the file panel, or create a new one.'
                    : 'Create your first PPCL program or upload a .pcl file.'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleOpenNewDialog} className="gap-1.5">
                  <FileCode className="h-3.5 w-3.5" /> New Program
                </Button>
              </div>
            </div>
          )}

          {activeDoc && (
            <PpclStatusBar
              cursor={cursor}
              charCount={localContent.length}
              lineCount={lineCount}
              firmware={activeDoc.firmware}
              isDirty={dirtyIds.has(activeDoc.id)}
            />
          )}
        </div>
      </div>
    </div>
  );

  if (isFullscreen) return editorContent;

  return (
    <>
      <TopBar title="PPCL Editor">
        <div className="flex items-center gap-1">
          {activeDoc && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExportDocument}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              title="Download .pcl"
              aria-label="Download .pcl file"
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFullscreen(true)}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hidden sm:flex"
            title="Fullscreen (F11)"
            aria-label="Fullscreen"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </TopBar>
      {editorContent}

      {/* New Program Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5 text-primary" />
              New PPCL Program
            </DialogTitle>
            <DialogDescription>
              Create a new PPCL program file. You can optionally assign it to a project.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="px-6 py-5 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="ppcl-name" className="text-sm font-medium">Program Name</Label>
              <Input
                id="ppcl-name"
                placeholder="e.g. AHU-1 Supply Fan.pcl"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateDocument(); }}
                className="h-10"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">.pcl extension will be added automatically if not included.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ppcl-project" className="text-sm font-medium">Project</Label>
              <Select value={newProjectId} onValueChange={v => v && setNewProjectId(v === '_none' ? '' : v)}>
                <SelectTrigger id="ppcl-project" className="h-10">
                  <SelectValue placeholder="None — standalone program" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None — standalone program</SelectItem>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{p.projectNumber ? ` (${p.projectNumber})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Assigned programs appear in the project&apos;s PPCL tab.</p>
            </div>
          </DialogBody>
          <DialogFooter className="px-6 py-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateDocument} className="gap-1.5">
              <FileCode className="h-4 w-4" />
              Create Program
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
