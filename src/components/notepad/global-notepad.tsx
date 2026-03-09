'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  StickyNote, X, Minus, Plus, Trash2, Check, RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotepadStore, type NotepadTab, type LauncherPosition } from '@/store/notepad-store';
import { Button } from '@/components/ui/button';

// ─── Constants ──────────────────────────────────────────────
const EDGE_PADDING = 8;           // min distance from viewport edge
const DRAG_THRESHOLD = 6;         // px movement to distinguish drag from click
const SNAP_DISTANCE = 40;         // px from edge to trigger snap
const FAB_SIZE = 48;              // px — matches h-12 w-12
const MINIMIZED_WIDTH = 130;      // approximate width of minimized pill
const MINIMIZED_HEIGHT = 40;      // approximate height of minimized pill

// ─── Viewport clamping ─────────────────────────────────────
function clampPosition(
  x: number, y: number,
  elWidth: number, elHeight: number,
): { x: number; y: number } {
  const maxX = window.innerWidth - elWidth - EDGE_PADDING;
  const maxY = window.innerHeight - elHeight - EDGE_PADDING;
  return {
    x: Math.max(EDGE_PADDING, Math.min(maxX, x)),
    y: Math.max(EDGE_PADDING, Math.min(maxY, y)),
  };
}

/** Default position: bottom-right corner */
function defaultPosition(elWidth: number, elHeight: number): { x: number; y: number } {
  return {
    x: window.innerWidth - elWidth - 20,
    y: window.innerHeight - elHeight - 20,
  };
}

/** Snap to nearest left/right edge if within SNAP_DISTANCE */
function snapToEdge(x: number, elWidth: number): number {
  if (x < SNAP_DISTANCE + EDGE_PADDING) return EDGE_PADDING;
  const rightEdge = window.innerWidth - elWidth - EDGE_PADDING;
  if (x > rightEdge - SNAP_DISTANCE) return rightEdge;
  return x;
}

// ─── Draggable Launcher Hook ────────────────────────────────
function useDraggableLauncher(elWidth: number, elHeight: number) {
  const launcherPos = useNotepadStore(s => s.launcherPos);
  const setLauncherPos = useNotepadStore(s => s.setLauncherPos);

  // Current rendered position (local state for smooth dragging)
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    if (launcherPos) return clampPosition(launcherPos.x, launcherPos.y, elWidth, elHeight);
    return defaultPosition(elWidth, elHeight);
  });

  const [isDragging, setIsDragging] = useState(false);
  const wasDragRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const offsetRef = useRef({ x: 0, y: 0 });

  // Sync from store on mount / when store changes (e.g. reset)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (launcherPos) {
      setPos(clampPosition(launcherPos.x, launcherPos.y, elWidth, elHeight));
    } else {
      setPos(defaultPosition(elWidth, elHeight));
    }
  }, [launcherPos, elWidth, elHeight]);

  // Recalculate on resize to keep in bounds
  useEffect(() => {
    const handleResize = () => {
      setPos(prev => clampPosition(prev.x, prev.y, elWidth, elHeight));
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [elWidth, elHeight]);

  // ── Pointer events (unified mouse + touch) ──
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only primary button
    if (e.button !== 0) return;
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
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > DRAG_THRESHOLD) {
      wasDragRef.current = true;
      setIsDragging(true);
      const newX = e.clientX - offsetRef.current.x;
      const newY = e.clientY - offsetRef.current.y;
      const clamped = clampPosition(newX, newY, elWidth, elHeight);
      setPos(clamped);
    }
  }, [elWidth, elHeight]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    if (wasDragRef.current) {
      // Snap to edge and persist
      const snappedX = snapToEdge(pos.x, elWidth);
      const finalPos = clampPosition(snappedX, pos.y, elWidth, elHeight);
      setPos(finalPos);
      setLauncherPos(finalPos);
    }

    setIsDragging(false);
    startPosRef.current = { x: 0, y: 0 };
  }, [pos, elWidth, elHeight, setLauncherPos]);

  const wasDrag = useCallback(() => wasDragRef.current, []);

  return {
    pos,
    isDragging,
    wasDrag,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}

// ─── FAB (Floating Action Button) ────────────────────────────
function NotepadFab({ onClick }: { onClick: () => void }) {
  const {
    pos, isDragging, wasDrag,
    handlePointerDown, handlePointerMove, handlePointerUp,
  } = useDraggableLauncher(FAB_SIZE, FAB_SIZE);

  const handleClick = useCallback(() => {
    if (!wasDrag()) onClick();
  }, [onClick, wasDrag]);

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
        transition: isDragging ? 'box-shadow 0.15s, transform 0.15s' : 'box-shadow 0.2s, transform 0.2s, left 0.2s ease-out, top 0.2s ease-out',
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
  const {
    pos, isDragging, wasDrag,
    handlePointerDown, handlePointerMove, handlePointerUp,
  } = useDraggableLauncher(MINIMIZED_WIDTH, MINIMIZED_HEIGHT);

  const handleClick = useCallback(() => {
    if (!wasDrag()) onClick();
  }, [onClick, wasDrag]);

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
        transition: isDragging ? 'box-shadow 0.15s, transform 0.15s' : 'box-shadow 0.2s, transform 0.2s, left 0.2s ease-out, top 0.2s ease-out',
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
  const scrollRef = useRef<HTMLDivElement>(null);

  const startRename = useCallback((tab: NotepadTab) => {
    setEditingId(tab.id);
    setEditValue(tab.name);
    setTimeout(() => inputRef.current?.select(), 0);
  }, []);

  const commitRename = useCallback(() => {
    if (editingId && editValue.trim()) {
      renameTab(editingId, editValue.trim());
    }
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
        <div ref={scrollRef} className="flex flex-1 overflow-x-auto scrollbar-none">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={cn(
                'group flex items-center gap-1 shrink-0 border-r border-border px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-colors',
                'hover:bg-muted/50',
                tab.id === activeTabId
                  ? 'bg-background text-foreground border-b-2 border-b-primary -mb-px'
                  : 'text-muted-foreground',
              )}
              onClick={() => setActiveTab(tab.id)}
              onDoubleClick={() => startRename(tab)}
              title="Double-click to rename"
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
                <span className="truncate max-w-24">{tab.name}</span>
              )}
              {tabs.length > 1 && (
                <button
                  onClick={(e) => handleTabClose(e, tab)}
                  className="ml-0.5 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity p-0.5 rounded"
                  aria-label={`Close ${tab.name}`}
                >
                  <X className="h-3 w-3" />
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

      {/* Delete confirmation overlay */}
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

// ─── Floating Panel ──────────────────────────────────────────
function NotepadPanel() {
  const minimizePanel = useNotepadStore(s => s.minimizePanel);
  const closePanel = useNotepadStore(s => s.closePanel);
  const resetLauncherPos = useNotepadStore(s => s.resetLauncherPos);
  const tabs = useNotepadStore(s => s.tabs);
  const activeTabId = useNotepadStore(s => s.activeTabId);
  const activeTab = tabs.find(t => t.id === activeTabId);

  // Drag state for panel
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea')) return;
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
      setPos({ x, y });
    };
    const handleUp = () => setDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging]);

  // Touch drag support
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea')) return;
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
      setPos({ x, y });
    };
    const handleTouchEnd = () => setDragging(false);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [dragging]);

  // Character count
  const charCount = activeTab?.content.length || 0;

  // Position styles
  const positionStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : {};

  return (
    <div
      ref={panelRef}
      className={cn(
        'fixed z-50 flex flex-col',
        'rounded-xl border border-border bg-background shadow-2xl',
        'w-[360px] h-[420px]',
        // Mobile: full-width bottom sheet
        'max-sm:w-[calc(100%-1rem)] max-sm:left-2 max-sm:right-2 max-sm:bottom-2 max-sm:h-[60vh]',
        // Default desktop position (bottom-right) when not dragged
        !pos && 'sm:bottom-5 sm:right-5',
        dragging && 'cursor-grabbing select-none',
      )}
      style={positionStyle}
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
        <span className="text-sm font-semibold flex-1 truncate">Notepad</span>
        <div className="flex items-center gap-0.5">
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

      {/* Status bar */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1 border-t border-border text-[10px] text-muted-foreground">
        <span>{charCount.toLocaleString()} chars</span>
        <span>{tabs.length} {tabs.length === 1 ? 'tab' : 'tabs'}</span>
      </div>
    </div>
  );
}

// ─── Global Notepad (Root Component) ─────────────────────────
export function GlobalNotepad() {
  const panelState = useNotepadStore(s => s.panelState);
  const openPanel = useNotepadStore(s => s.openPanel);

  if (panelState === 'open') {
    return <NotepadPanel />;
  }

  if (panelState === 'minimized') {
    return <NotepadMinimized onClick={openPanel} />;
  }

  return <NotepadFab onClick={openPanel} />;
}
