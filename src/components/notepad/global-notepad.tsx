'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  StickyNote, X, Minus, Plus, Trash2, Copy,
  RotateCcw, FolderKanban, Link2, Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotepadStore, type NotepadTab } from '@/store/notepad-store';
import { useProjects } from '@/hooks/use-projects';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';

// ─── Constants ──────────────────────────────────────────────
const EDGE_PADDING = 8;
const DRAG_THRESHOLD = 6;
const SNAP_DISTANCE = 40;
const FAB_SIZE = 48;
const MINIMIZED_WIDTH = 130;
const MINIMIZED_HEIGHT = 40;
const PANEL_WIDTH = 380;
const PANEL_HEIGHT = 440;
const PANEL_GAP = 12; // gap between launcher and panel
const MIN_PANEL_WIDTH = 260;
const MIN_PANEL_HEIGHT = 280;
const MAX_PANEL_WIDTH = 900;
const MAX_PANEL_HEIGHT = 900;

// ─── Viewport clamping ─────────────────────────────────────
function clampPosition(x: number, y: number, w: number, h: number) {
  const maxX = window.innerWidth - w - EDGE_PADDING;
  const maxY = window.innerHeight - h - EDGE_PADDING;
  return {
    x: Math.max(EDGE_PADDING, Math.min(maxX, x)),
    y: Math.max(EDGE_PADDING, Math.min(maxY, y)),
  };
}

function defaultPosition(w: number, h: number) {
  return {
    x: window.innerWidth - w - 20,
    y: window.innerHeight - h - 20,
  };
}

function snapToEdge(x: number, w: number): number {
  if (x < SNAP_DISTANCE + EDGE_PADDING) return EDGE_PADDING;
  const rightEdge = window.innerWidth - w - EDGE_PADDING;
  if (x > rightEdge - SNAP_DISTANCE) return rightEdge;
  return x;
}

/** Calculate panel position anchored to the launcher */
function computePanelPos(launcherX: number, launcherY: number, panelW: number, panelH: number): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let px: number, py: number;

  // Horizontal: prefer placing panel to the left of launcher if launcher is on right half
  if (launcherX + FAB_SIZE / 2 > vw / 2) {
    px = launcherX - panelW - PANEL_GAP;
  } else {
    px = launcherX + FAB_SIZE + PANEL_GAP;
  }

  // Vertical: align top of panel with launcher, adjust if overflows
  py = launcherY;

  // Clamp to viewport
  px = Math.max(EDGE_PADDING, Math.min(vw - panelW - EDGE_PADDING, px));
  py = Math.max(EDGE_PADDING, Math.min(vh - panelH - EDGE_PADDING, py));

  return { x: px, y: py };
}

// ─── Draggable Launcher Hook ────────────────────────────────
function useDraggableLauncher(elWidth: number, elHeight: number) {
  const launcherPos = useNotepadStore(s => s.launcherPos);
  const hydrated = useNotepadStore(s => s._hydrated);
  const setLauncherPos = useNotepadStore(s => s.setLauncherPos);

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const wasDragRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const offsetRef = useRef({ x: 0, y: 0 });

  // Initialize position only AFTER hydration to prevent jump
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    if (launcherPos) {
      setPos(clampPosition(launcherPos.x, launcherPos.y, elWidth, elHeight));
    } else {
      setPos(defaultPosition(elWidth, elHeight));
    }
  }, [hydrated, launcherPos, elWidth, elHeight]);

  // Recalculate on resize
  useEffect(() => {
    const handleResize = () => {
      setPos(prev => prev ? clampPosition(prev.x, prev.y, elWidth, elHeight) : prev);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [elWidth, elHeight]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 || !pos) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startPosRef.current = { x: e.clientX, y: e.clientY };
    offsetRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    wasDragRef.current = false;
    setIsDragging(false);
  }, [pos]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!startPosRef.current.x && !startPosRef.current.y) return;
    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
      wasDragRef.current = true;
      setIsDragging(true);
      const newX = e.clientX - offsetRef.current.x;
      const newY = e.clientY - offsetRef.current.y;
      setPos(clampPosition(newX, newY, elWidth, elHeight));
    }
  }, [elWidth, elHeight]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (wasDragRef.current && pos) {
      const snappedX = snapToEdge(pos.x, elWidth);
      const finalPos = clampPosition(snappedX, pos.y, elWidth, elHeight);
      setPos(finalPos);
      setLauncherPos(finalPos);
    }
    setIsDragging(false);
    startPosRef.current = { x: 0, y: 0 };
  }, [pos, elWidth, elHeight, setLauncherPos]);

  const wasDrag = useCallback(() => wasDragRef.current, []);

  return { pos, isDragging, wasDrag, handlePointerDown, handlePointerMove, handlePointerUp };
}

// ─── FAB (Floating Action Button) ────────────────────────────
function NotepadFab({ onClick }: { onClick: () => void }) {
  const { pos, isDragging, wasDrag, handlePointerDown, handlePointerMove, handlePointerUp } =
    useDraggableLauncher(FAB_SIZE, FAB_SIZE);

  const handleClick = useCallback(() => {
    if (!wasDrag()) onClick();
  }, [onClick, wasDrag]);

  // Don't render until position is known (prevents top-left flash)
  if (!pos) return null;

  return (
    <button
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      className={cn(
        'fixed z-40 flex h-12 w-12 items-center justify-center',
        'rounded-full bg-primary text-primary-foreground shadow-lg',
        'transition-shadow',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isDragging
          ? 'cursor-grabbing scale-110 shadow-2xl'
          : 'cursor-grab hover:shadow-xl active:scale-95',
      )}
      style={{
        left: pos.x,
        top: pos.y,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        transition: isDragging
          ? 'box-shadow 0.15s, transform 0.15s'
          : 'box-shadow 0.2s, transform 0.2s, left 0.2s ease-out, top 0.2s ease-out',
      }}
      aria-label="Open Sticky Notepad"
      data-tour="notepad-fab"
    >
      <StickyNote className="h-5 w-5 pointer-events-none" />
    </button>
  );
}

// ─── Minimized Dock ──────────────────────────────────────────
function NotepadMinimized({ onClick }: { onClick: () => void }) {
  const tabs = useNotepadStore(s => s.tabs);
  const { pos, isDragging, wasDrag, handlePointerDown, handlePointerMove, handlePointerUp } =
    useDraggableLauncher(MINIMIZED_WIDTH, MINIMIZED_HEIGHT);

  const handleClick = useCallback(() => {
    if (!wasDrag()) onClick();
  }, [onClick, wasDrag]);

  if (!pos) return null;

  return (
    <button
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      className={cn(
        'fixed z-40 flex items-center gap-2',
        'rounded-full bg-primary text-primary-foreground px-4 py-2.5 shadow-lg',
        'transition-shadow',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isDragging
          ? 'cursor-grabbing scale-105 shadow-2xl'
          : 'cursor-grab hover:shadow-xl active:scale-95',
      )}
      style={{
        left: pos.x,
        top: pos.y,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        transition: isDragging
          ? 'box-shadow 0.15s, transform 0.15s'
          : 'box-shadow 0.2s, transform 0.2s, left 0.2s ease-out, top 0.2s ease-out',
      }}
      aria-label="Restore Notepad"
    >
      <StickyNote className="h-4 w-4 pointer-events-none" />
      <span className="text-xs font-medium pointer-events-none">Notepad</span>
      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-foreground/20 px-1 text-[10px] font-bold pointer-events-none">
        {tabs.length}
      </span>
    </button>
  );
}

// ─── Delete Confirmation ─────────────────────────────────────
function DeleteConfirm({ tabName, onConfirm, onCancel }: {
  tabName: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/90 backdrop-blur-sm rounded-b-xl">
      <div className="text-center space-y-3 px-6">
        <p className="text-sm font-medium">Delete &quot;{tabName}&quot;?</p>
        <p className="text-xs text-muted-foreground">This note&apos;s content will be lost.</p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>Delete</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Bar ─────────────────────────────────────────────────
function TabBar() {
  const tabs = useNotepadStore(s => s.tabs);
  const activeTabId = useNotepadStore(s => s.activeTabId);
  const setActiveTab = useNotepadStore(s => s.setActiveTab);
  const addTab = useNotepadStore(s => s.addTab);
  const removeTab = useNotepadStore(s => s.removeTab);
  const renameTab = useNotepadStore(s => s.renameTab);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const startRename = useCallback((tab: NotepadTab) => {
    setEditingId(tab.id);
    setEditValue(tab.name);
    setTimeout(() => inputRef.current?.select(), 0);
  }, []);

  const commitRename = useCallback(() => {
    if (editingId && editValue.trim()) renameTab(editingId, editValue.trim());
    setEditingId(null);
  }, [editingId, editValue, renameTab]);

  const handleTabClose = useCallback((e: React.MouseEvent, tab: NotepadTab) => {
    e.stopPropagation();
    if (tab.content.trim().length > 0) {
      setDeleteId(tab.id);
    } else {
      removeTab(tab.id);
    }
  }, [removeTab]);

  const tabToDelete = deleteId ? tabs.find(t => t.id === deleteId) : null;

  return (
    <>
      <div className="flex items-center border-b border-border bg-muted/30">
        <div className="flex flex-1 overflow-x-auto scrollbar-none">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={cn(
                'group flex items-center gap-0.5 shrink-0 border-r border-border px-2 py-1.5 text-xs font-medium cursor-pointer transition-colors',
                'hover:bg-muted/50',
                tab.id === activeTabId
                  ? 'bg-background text-foreground border-b-2 border-b-primary -mb-px'
                  : 'text-muted-foreground',
              )}
              onClick={() => setActiveTab(tab.id)}
              onDoubleClick={() => startRename(tab)}
            >
              {editingId === tab.id ? (
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="w-20 bg-transparent border-b border-primary text-xs outline-none"
                  autoFocus
                />
              ) : (
                <span className="truncate max-w-20">
                  {tab.projectId && <Link2 className="inline h-2.5 w-2.5 mr-0.5 opacity-50" />}
                  {tab.name}
                </span>
              )}
              {/* Rename button — always visible on active tab, hover on others */}
              <button
                onClick={(e) => { e.stopPropagation(); startRename(tab); }}
                className={cn(
                  'p-0.5 rounded hover:bg-muted hover:text-foreground transition-all',
                  tab.id === activeTabId
                    ? 'text-muted-foreground/70'
                    : 'opacity-0 group-hover:opacity-100 text-muted-foreground/50',
                )}
                aria-label={`Rename ${tab.name}`}
                title="Rename"
              >
                <Pencil className="h-2.5 w-2.5" />
              </button>
              {/* Delete button — always visible on active tab, hover on others */}
              {tabs.length > 1 && (
                <button
                  onClick={(e) => handleTabClose(e, tab)}
                  className={cn(
                    'p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-all',
                    tab.id === activeTabId
                      ? 'text-muted-foreground/70'
                      : 'opacity-0 group-hover:opacity-100 text-muted-foreground/50',
                  )}
                  aria-label={`Close ${tab.name}`}
                  title="Delete"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={addTab}
          className="shrink-0 p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="New tab"
          title="New note tab"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {tabToDelete && (
        <DeleteConfirm
          tabName={tabToDelete.name}
          onConfirm={() => { removeTab(tabToDelete.id); setDeleteId(null); }}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </>
  );
}

// ─── Note Editor ─────────────────────────────────────────────
function NoteEditor() {
  const tabs = useNotepadStore(s => s.tabs);
  const activeTabId = useNotepadStore(s => s.activeTabId);
  const updateTabContent = useNotepadStore(s => s.updateTabContent);
  const activeTab = tabs.find(t => t.id === activeTabId);
  if (!activeTab) return null;

  return (
    <textarea
      value={activeTab.content}
      onChange={e => updateTabContent(activeTab.id, e.target.value)}
      placeholder="Start typing... IP addresses, device notes, commands, reminders..."
      className={cn(
        'flex-1 w-full resize-none bg-transparent p-3 text-sm leading-relaxed',
        'placeholder:text-muted-foreground/50 focus:outline-none',
        'font-mono',
      )}
      spellCheck={false}
      aria-label={`Note content for ${activeTab.name}`}
    />
  );
}

// ─── Attach to Project Dialog ───────────────────────────────
function AttachDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const tabs = useNotepadStore(s => s.tabs);
  const activeTabId = useNotepadStore(s => s.activeTabId);
  const setTabProject = useNotepadStore(s => s.setTabProject);
  const activeTab = tabs.find(t => t.id === activeTabId);
  const { projects } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState(activeTab?.projectId || '');

  useEffect(() => {
    if (open) setSelectedProjectId(activeTab?.projectId || '');
  }, [open, activeTab?.projectId]);

  const handleAttach = () => {
    if (!activeTab || !selectedProjectId) return;
    const project = projects.find(p => p.id === selectedProjectId);
    setTabProject(activeTab.id, selectedProjectId, project?.name);
    onOpenChange(false);
  };

  const handleDetach = () => {
    if (!activeTab) return;
    setTabProject(activeTab.id, undefined, undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Link Note to Project</DialogTitle>
          <DialogDescription>
            Associate this note tab with a project for quick reference.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="px-5 py-3">
          <Select value={selectedProjectId} onValueChange={(v) => setSelectedProjectId(v || '')}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a project..." />
            </SelectTrigger>
            <SelectContent>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeTab?.projectId && (
            <button onClick={handleDetach} className="mt-2 text-xs text-muted-foreground hover:text-destructive transition-colors">
              Remove project link
            </button>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleAttach} disabled={!selectedProjectId}>
            <Link2 className="h-3.5 w-3.5 mr-1.5" />
            Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Floating Panel ──────────────────────────────────────────
function NotepadPanel() {
  const minimizePanel = useNotepadStore(s => s.minimizePanel);
  const closePanel = useNotepadStore(s => s.closePanel);
  const resetLauncherPos = useNotepadStore(s => s.resetLauncherPos);
  const duplicateTab = useNotepadStore(s => s.duplicateTab);
  const tabs = useNotepadStore(s => s.tabs);
  const activeTabId = useNotepadStore(s => s.activeTabId);
  const launcherPos = useNotepadStore(s => s.launcherPos);
  const storedSize = useNotepadStore(s => s.panelSize);
  const setPanelSize = useNotepadStore(s => s.setPanelSize);
  const activeTab = tabs.find(t => t.id === activeTabId);

  const [attachOpen, setAttachOpen] = useState(false);

  // Resize state
  const [size, setSize] = useState({ w: storedSize?.w ?? PANEL_WIDTH, h: storedSize?.h ?? PANEL_HEIGHT });
  const sizeRef = useRef(size);
  useEffect(() => { sizeRef.current = size; }, [size]);

  const resizeRef = useRef<{
    edge: 'right' | 'bottom' | 'corner';
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, edge: 'right' | 'bottom' | 'corner') => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      edge,
      startX: e.clientX,
      startY: e.clientY,
      startW: sizeRef.current.w,
      startH: sizeRef.current.h,
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const dx = e.clientX - r.startX;
      const dy = e.clientY - r.startY;
      let newW = r.startW;
      let newH = r.startH;
      if (r.edge === 'right' || r.edge === 'corner') {
        newW = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, r.startW + dx));
      }
      if (r.edge === 'bottom' || r.edge === 'corner') {
        newH = Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, r.startH + dy));
      }
      setSize({ w: newW, h: newH });
    };
    const handleMouseUp = () => {
      if (resizeRef.current) {
        resizeRef.current = null;
        setPanelSize(sizeRef.current);
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setPanelSize]);

  // Drag state for panel
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Compute initial position anchored to launcher
  const anchoredPos = useMemo(() => {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    if (launcherPos) return computePanelPos(launcherPos.x, launcherPos.y, size.w, size.h);
    return {
      x: window.innerWidth - size.w - 20,
      y: window.innerHeight - size.h - 20,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launcherPos]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea, [data-slot]')) return;
    e.preventDefault();
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const x = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.current.x));
      const y = Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dragOffset.current.y));
      setDragPos({ x, y });
    };
    const handleUp = () => setDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging]);

  // Touch drag
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea, [data-slot]')) return;
    const panel = panelRef.current;
    if (!panel) return;
    const touch = e.touches[0];
    const rect = panel.getBoundingClientRect();
    dragOffset.current = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const x = Math.max(0, Math.min(window.innerWidth - 100, touch.clientX - dragOffset.current.x));
      const y = Math.max(0, Math.min(window.innerHeight - 60, touch.clientY - dragOffset.current.y));
      setDragPos({ x, y });
    };
    const handleTouchEnd = () => setDragging(false);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [dragging]);

  const charCount = activeTab?.content.length || 0;
  const finalPos = dragPos || anchoredPos;
  const isResizing = !!resizeRef.current;

  return (
    <>
      <div
        ref={panelRef}
        className={cn(
          'fixed z-50 flex flex-col',
          'rounded-xl border border-border bg-background shadow-2xl',
          // Mobile: full-width bottom sheet
          'max-sm:!left-2 max-sm:!right-2 max-sm:!bottom-2 max-sm:!top-auto max-sm:w-[calc(100%-1rem)] max-sm:h-[60vh]',
          (dragging || isResizing) && 'select-none',
          dragging && 'cursor-grabbing',
        )}
        style={{
          width: size.w,
          height: size.h,
          left: finalPos.x,
          top: finalPos.y,
        }}
      >
        {/* Header — draggable */}
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2 border-b border-border rounded-t-xl',
            'bg-muted/40 cursor-grab select-none shrink-0',
            dragging && 'cursor-grabbing',
          )}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          <StickyNote className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold flex-1 truncate">
            Notepad
            {activeTab?.projectName && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                — {activeTab.projectName}
              </span>
            )}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setAttachOpen(true)}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Link to project"
              title="Link to project"
            >
              <FolderKanban className="h-3 w-3" />
            </button>
            <button
              onClick={() => activeTab && duplicateTab(activeTab.id)}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Duplicate tab"
              title="Duplicate tab"
            >
              <Copy className="h-3 w-3" />
            </button>
            <button
              onClick={resetLauncherPos}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Reset launcher position"
              title="Reset icon position"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
            <button
              onClick={minimizePanel}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Minimize notepad"
              title="Minimize"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={closePanel}
              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Close notepad"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="relative shrink-0">
          <TabBar />
        </div>

        {/* Editor */}
        <NoteEditor />

        {/* Footer status bar */}
        <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground bg-muted/20 rounded-b-xl">
          <span>{charCount.toLocaleString()} chars</span>
          <span>{tabs.length} {tabs.length === 1 ? 'tab' : 'tabs'}</span>
        </div>

        {/* Resize handles — hidden on mobile bottom sheet */}
        {/* Right edge */}
        <div
          onMouseDown={(e) => handleResizeMouseDown(e, 'right')}
          className="max-sm:hidden absolute top-3 bottom-3 right-0 w-1.5 cursor-ew-resize z-10 rounded-r-xl"
        />
        {/* Bottom edge */}
        <div
          onMouseDown={(e) => handleResizeMouseDown(e, 'bottom')}
          className="max-sm:hidden absolute bottom-0 left-3 right-3 h-1.5 cursor-ns-resize z-10 rounded-b-xl"
        />
        {/* Bottom-right corner grip */}
        <div
          onMouseDown={(e) => handleResizeMouseDown(e, 'corner')}
          className="max-sm:hidden absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-20 flex items-end justify-end p-0.5"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" className="text-muted-foreground/40">
            <path d="M1 7L7 1M4 7L7 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      <AttachDialog open={attachOpen} onOpenChange={setAttachOpen} />
    </>
  );
}

// ─── Global Notepad (Root Component) ─────────────────────────
export function GlobalNotepad() {
  const panelState = useNotepadStore(s => s.panelState);
  const openPanel = useNotepadStore(s => s.openPanel);

  if (panelState === 'open') return <NotepadPanel />;
  if (panelState === 'minimized') return <NotepadMinimized onClick={openPanel} />;
  return <NotepadFab onClick={openPanel} />;
}
