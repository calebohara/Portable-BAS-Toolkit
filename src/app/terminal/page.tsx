'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
  Terminal as TerminalIcon, Plug, Unplug, RotateCcw, Trash2, Pause, Play,
  Download, Plus, X, Settings2, History, FileText, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2, Loader2, Circle, BookOpen, Paperclip,
  BookmarkPlus, Star, Tag, Search, Copy, PlayCircle,
} from 'lucide-react';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@/components/ui/select';
import { cn, sanitizeFilename } from '@/lib/utils';
import { toast } from 'sonner';
import {
  useTerminalStore,
  BAUD_RATES, BUFFER_SIZES, LINE_ENDINGS,
  type TerminalSession, type ConnectionState, type BaudRate, type BufferSize,
  type TerminalLine, type LineEnding,
} from '@/store/terminal-store';
import { useProjects, useCommandSnippets } from '@/hooks/use-projects';
import { saveFileBlob } from '@/lib/db';
import type { CommandSnippet, SnippetCategory } from '@/types';
import { SNIPPET_CATEGORY_LABELS } from '@/types';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import {
  isTauri,
  nativeCheckPort,
  nativeTelnetConnect,
  nativeTelnetSend,
  nativeTelnetDisconnect,
  onTelnetData,
  onTelnetClosed,
  onTelnetError,
} from '@/lib/tauri-bridge';

// ─── Connection State UI ─────────────────────────────────────
const STATE_CONFIG: Record<ConnectionState, { label: string; color: string; icon: typeof Circle }> = {
  disconnected: { label: 'Disconnected', color: 'text-muted-foreground', icon: Circle },
  connecting: { label: 'Connecting...', color: 'text-yellow-500', icon: Loader2 },
  connected: { label: 'Connected', color: 'text-green-500', icon: CheckCircle2 },
  error: { label: 'Error', color: 'text-red-500', icon: AlertCircle },
};

// ─── Terminal Output ─────────────────────────────────────────
function TerminalView({ session }: { session: TerminalSession }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session.paused) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [session.buffer.length, session.paused]);

  const lineColor = (type: TerminalLine['type']) => {
    switch (type) {
      case 'input': return 'text-green-400';
      case 'output': return 'text-gray-300';
      case 'system': return 'text-blue-400';
      case 'error': return 'text-red-400';
    }
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto bg-[#0d1117] p-3 font-mono text-xs leading-relaxed"
    >
      {session.buffer.length === 0 && (
        <div className="text-gray-600 select-none">
          {session.connectionState === 'disconnected'
            ? '# Terminal ready. Configure connection and click Connect.'
            : session.connectionState === 'connected'
            ? '# Connected. Awaiting output...'
            : ''}
        </div>
      )}
      {session.buffer.map((line, i) => (
        <div key={i} className={cn('whitespace-pre-wrap break-all', lineColor(line.type))}>
          {session.logging && (
            <span className="text-gray-600 mr-2 select-none text-[10px]">
              {format(new Date(line.timestamp), 'HH:mm:ss')}
            </span>
          )}
          {line.type === 'input' && <span className="text-green-600 select-none">&gt; </span>}
          {line.text}
        </div>
      ))}
      {session.paused && (
        <div className="text-yellow-600 mt-1 select-none">--- Output paused ---</div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// ─── Command Input ───────────────────────────────────────────
function CommandInput({ session, insertedCmd, onClearInserted, onSend }: {
  session: TerminalSession;
  insertedCmd?: string;
  onClearInserted?: () => void;
  onSend?: (cmd: string) => void;
}) {
  const [cmd, setCmd] = useState('');
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const appendLine = useTerminalStore(s => s.appendLine);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle inserted commands from snippet library
  useEffect(() => {
    if (insertedCmd) {
      setCmd(insertedCmd);
      onClearInserted?.();
      inputRef.current?.focus();
    }
  }, [insertedCmd, onClearInserted]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!cmd.trim()) return;

    // Show typed command locally if local echo is on, or if not connected
    if (session.localEcho || session.connectionState !== 'connected') {
      appendLine(session.id, {
        text: cmd,
        timestamp: new Date().toISOString(),
        type: 'input',
      });
    }

    if (session.connectionState === 'connected' && onSend) {
      onSend(cmd);
    } else if (session.connectionState !== 'connected') {
      appendLine(session.id, {
        text: 'Not connected. Command logged locally only.',
        timestamp: new Date().toISOString(),
        type: 'system',
      });
    }

    setCmdHistory(prev => [cmd, ...prev].slice(0, 50));
    setHistoryIdx(-1);
    setCmd('');
  }, [cmd, session.id, session.connectionState, session.localEcho, appendLine, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length > 0) {
        const newIdx = Math.min(historyIdx + 1, cmdHistory.length - 1);
        setHistoryIdx(newIdx);
        setCmd(cmdHistory[newIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx > 0) {
        const newIdx = historyIdx - 1;
        setHistoryIdx(newIdx);
        setCmd(cmdHistory[newIdx]);
      } else {
        setHistoryIdx(-1);
        setCmd('');
      }
    }
  }, [cmdHistory, historyIdx]);

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-[#21262d] bg-[#0d1117] px-3 py-2">
      <span className="text-green-500 font-mono text-sm select-none">$</span>
      <input
        ref={inputRef}
        value={cmd}
        onChange={e => setCmd(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={session.connectionState === 'connected' ? 'Type command...' : 'Type command (local mode)...'}
        className="flex-1 bg-transparent text-gray-200 font-mono text-sm outline-none placeholder:text-gray-600"
        autoComplete="off"
        spellCheck={false}
        aria-label="Terminal command input"
      />
    </form>
  );
}

// ─── Attach to Project Dialog ────────────────────────────────
function AttachDialog({ open, onOpenChange, session }: {
  open: boolean; onOpenChange: (o: boolean) => void; session: TerminalSession;
}) {
  const { projects } = useProjects();
  const [projectId, setProjectId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAttach = async () => {
    if (!projectId) return;
    setSaving(true);
    const content = generateExportText(session);
    const blob = new Blob([content], { type: 'text/plain' });
    const fileName = generateFileName(session);
    const blobKey = crypto.randomUUID();
    await saveFileBlob(blobKey, blob);

    // We save as a file blob that can be retrieved later
    // The user can then go to the project and find it in uploads
    toast.success(`Session log saved as ${fileName}`);
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach Session Log to Project</DialogTitle>
          <DialogDescription>
            Save the terminal session log as a text file attached to a project.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={v => v && setProjectId(v)}>
                <SelectTrigger><SelectValue placeholder="Select project..." /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.projectNumber} — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p><strong>File:</strong> {generateFileName(session)}</p>
              <p><strong>Lines:</strong> {session.buffer.length}</p>
              <p><strong>Host:</strong> {session.host || 'N/A'} : {session.port}</p>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleAttach} disabled={!projectId || saving}>
            {saving ? 'Saving...' : 'Attach Log'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Export Helpers ───────────────────────────────────────────
function generateFileName(session: TerminalSession) {
  const host = session.host || 'local';
  const date = format(new Date(), 'yyyy-MM-dd_HH-mm');
  return sanitizeFilename(`${session.label.replace(/\s+/g, '_')}_telnet_session_${date}.txt`);
}

function generateExportText(session: TerminalSession) {
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('  BAU Suite — Telnet HMI Session Log');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`Session:    ${session.label}`);
  lines.push(`Host:       ${session.host || 'N/A'}`);
  lines.push(`Port:       ${session.port}`);
  lines.push(`Protocol:   Telnet TCP`);
  lines.push(`Started:    ${session.startedAt ? format(new Date(session.startedAt), 'MMM d, yyyy h:mm:ss a') : 'N/A'}`);
  lines.push(`Ended:      ${session.endedAt ? format(new Date(session.endedAt), 'MMM d, yyyy h:mm:ss a') : 'Active'}`);
  lines.push(`Lines:      ${session.buffer.length}`);
  lines.push('');
  lines.push('───────────────────────────────────────────────────────');
  lines.push('');

  for (const line of session.buffer) {
    const ts = format(new Date(line.timestamp), 'HH:mm:ss');
    const prefix = line.type === 'input' ? '> ' : line.type === 'system' ? '# ' : line.type === 'error' ? '! ' : '  ';
    lines.push(`[${ts}] ${prefix}${line.text}`);
  }

  lines.push('');
  lines.push('───────────────────────────────────────────────────────');
  lines.push('Generated by BAU Suite');
  return lines.join('\n');
}

// ─── Settings Panel ──────────────────────────────────────────
function SettingsPanel() {
  const settings = useTerminalStore(s => s.settings);
  const updateSettings = useTerminalStore(s => s.updateSettings);

  return (
    <div className="space-y-4 p-4 border-t border-border">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Settings2 className="h-4 w-4" /> Terminal Settings
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Default Line Ending</Label>
          <Select
            value={settings.defaultLineEnding ?? 'crlf'}
            onValueChange={v => v && updateSettings({ defaultLineEnding: v as LineEnding })}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LINE_ENDINGS.map(le => <SelectItem key={le.value} value={le.value}>{le.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Buffer Size (lines)</Label>
          <Select
            value={String(settings.defaultBufferSize)}
            onValueChange={v => v && updateSettings({ defaultBufferSize: Number(v) as BufferSize })}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BUFFER_SIZES.map(b => <SelectItem key={b} value={String(b)}>{b.toLocaleString()}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2 pb-0.5">
          <Switch
            checked={settings.autoLogging}
            onCheckedChange={c => updateSettings({ autoLogging: !!c })}
            size="sm"
          />
          <Label className="text-xs">Auto-log sessions</Label>
        </div>
      </div>
    </div>
  );
}

// ─── Session History Panel ───────────────────────────────────
function HistoryPanel() {
  const history = useTerminalStore(s => s.sessionHistory);
  const clearHistory = useTerminalStore(s => s.clearHistory);
  const createSession = useTerminalStore(s => s.createSession);
  const updateSession = useTerminalStore(s => s.updateSession);
  const activeSessionId = useTerminalStore(s => s.activeSessionId);

  if (history.length === 0) {
    return (
      <div className="p-4 border-t border-border text-xs text-muted-foreground text-center">
        No connection history yet.
      </div>
    );
  }

  return (
    <div className="p-4 border-t border-border space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <History className="h-4 w-4" /> Recent Connections
        </h3>
        <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={clearHistory}>
          Clear
        </Button>
      </div>
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {history.map((h, i) => (
          <button
            key={i}
            onClick={() => {
              updateSession(activeSessionId, {
                host: h.host,
                port: h.port,
                baudRate: h.baudRate,
                lineEnding: h.lineEnding ?? 'crlf',
                label: h.label,
              });
            }}
            className="w-full flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted/50 transition-colors text-left"
          >
            <div>
              <span className="font-medium">{h.host}:{h.port}</span>
              <span className="text-muted-foreground ml-2">{h.label}</span>
            </div>
            <span className="text-muted-foreground text-[10px]">
              {format(new Date(h.lastConnected), 'MMM d, HH:mm')}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Command Snippet Library Panel ──────────────────────────
function SnippetLibraryPanel({
  onInsert,
}: {
  onInsert: (command: string) => void;
}) {
  const { snippets, addSnippet, updateSnippet, removeSnippet, recordUsage } = useCommandSnippets();
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [newCmd, setNewCmd] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCat, setNewCat] = useState<SnippetCategory>('general');

  const filtered = snippets.filter(s => {
    const matchSearch = !search || s.command.toLowerCase().includes(search.toLowerCase()) ||
      s.label.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === 'all' || s.category === filterCat;
    return matchSearch && matchCat;
  });

  const handleAdd = async () => {
    if (!newCmd.trim() || !newLabel.trim()) {
      toast.error('Command and label required');
      return;
    }
    await addSnippet({
      command: newCmd,
      label: newLabel,
      description: newDesc,
      category: newCat,
      tags: [],
      isFavorite: false,
    });
    toast.success('Snippet saved');
    setShowAdd(false);
    setNewCmd('');
    setNewLabel('');
    setNewDesc('');
    setNewCat('general');
  };

  const handleInsert = async (snippet: CommandSnippet) => {
    onInsert(snippet.command);
    await recordUsage(snippet.id);
  };

  const toggleFavorite = async (snippet: CommandSnippet) => {
    await updateSnippet({ ...snippet, isFavorite: !snippet.isFavorite });
  };

  const categories: { value: string; label: string }[] = [
    { value: 'all', label: 'All Categories' },
    ...Object.entries(SNIPPET_CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l })),
  ];

  return (
    <div className="p-4 border-t border-border space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <BookmarkPlus className="h-4 w-4" /> Command Snippets
        </h3>
        <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>

      {/* Quick add form */}
      {showAdd && (
        <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/30">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[10px]">Label</Label>
              <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. List BACnet objects" className="h-7 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Category</Label>
              <Select value={newCat} onValueChange={v => v && setNewCat(v as SnippetCategory)}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SNIPPET_CATEGORY_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Command</Label>
            <Input value={newCmd} onChange={e => setNewCmd(e.target.value)} placeholder="who -r" className="h-7 text-xs font-mono" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Description (optional)</Label>
            <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Lists all BACnet objects on device" className="h-7 text-xs" />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" className="h-6 text-xs" onClick={handleAdd}>Save Snippet</Button>
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search snippets..."
            className="h-7 text-xs pl-7" />
        </div>
        <Select value={filterCat} onValueChange={v => v && setFilterCat(v)}>
          <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Snippet list */}
      <div className="space-y-1 max-h-52 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">
            {snippets.length === 0 ? 'No snippets yet. Save commands you use often.' : 'No matching snippets.'}
          </p>
        )}
        {filtered.map(s => (
          <div key={s.id} className="group flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted/30 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{s.label}</span>
                <Badge variant="outline" className="text-[9px] shrink-0">{SNIPPET_CATEGORY_LABELS[s.category]}</Badge>
              </div>
              <div className="font-mono text-muted-foreground truncate mt-0.5">{s.command}</div>
              {s.description && <div className="text-muted-foreground/70 truncate mt-0.5">{s.description}</div>}
            </div>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button onClick={() => toggleFavorite(s)} className="p-1 rounded hover:bg-muted" title="Favorite">
                <Star className={cn('h-3 w-3', s.isFavorite ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground')} />
              </button>
              <button onClick={() => { navigator.clipboard.writeText(s.command); toast.success('Copied'); }}
                className="p-1 rounded hover:bg-muted" title="Copy">
                <Copy className="h-3 w-3 text-muted-foreground" />
              </button>
              <button onClick={() => handleInsert(s)} className="p-1 rounded hover:bg-muted" title="Insert into terminal">
                <PlayCircle className="h-3 w-3 text-muted-foreground" />
              </button>
              <button onClick={() => removeSnippet(s.id)} className="p-1 rounded hover:bg-muted hover:text-destructive" title="Delete">
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function TelnetPage() {
  const sessions = useTerminalStore(s => s.sessions);
  const activeSessionId = useTerminalStore(s => s.activeSessionId);
  const setActiveSession = useTerminalStore(s => s.setActiveSession);
  const createSession = useTerminalStore(s => s.createSession);
  const removeSession = useTerminalStore(s => s.removeSession);
  const updateSession = useTerminalStore(s => s.updateSession);
  const appendLine = useTerminalStore(s => s.appendLine);
  const clearBuffer = useTerminalStore(s => s.clearBuffer);
  const togglePause = useTerminalStore(s => s.togglePause);
  const toggleLogging = useTerminalStore(s => s.toggleLogging);
  const setConnectionState = useTerminalStore(s => s.setConnectionState);
  const addToHistory = useTerminalStore(s => s.addToHistory);
  const settings = useTerminalStore(s => s.settings);

  // Ensure we always have a valid session (guard against corrupted persisted state)
  if (sessions.length === 0) {
    createSession();
  }
  const session = sessions.find(s => s.id === activeSessionId) || sessions[0];
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSnippets, setShowSnippets] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [connPanelOpen, setConnPanelOpen] = useState(true);
  const [insertedCmd, setInsertedCmd] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  // Track Tauri event listener cleanup per session (key = session ID)
  const cleanupListenersMapRef = useRef<Map<string, (() => void)[]>>(new Map());
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => { setIsDesktop(isTauri()); }, []);

  // ─── Connection logic ────────────────────────────────────
  const handleConnect = useCallback(async () => {
    if (!session.host.trim()) {
      toast.error('Please enter a host/IP address');
      return;
    }

    setConnectionState(session.id, 'connecting');
    appendLine(session.id, {
      text: `Connecting to ${session.host}:${session.port} (Telnet TCP)...`,
      timestamp: new Date().toISOString(),
      type: 'system',
    });

    if (isDesktop) {
      // ─── Native TCP via Tauri ──────────────────────────
      const sid = session.id;
      try {
        // Clean up any existing listeners for this session first
        const existing = cleanupListenersMapRef.current.get(sid);
        if (existing) {
          for (const fn of existing) fn();
          cleanupListenersMapRef.current.delete(sid);
        }

        // Register event listeners BEFORE connecting to avoid missing data
        const unData = await onTelnetData(sid, (data) => {
          appendLine(sid, {
            text: data,
            timestamp: new Date().toISOString(),
            type: 'output',
          });
        });
        const unClosed = await onTelnetClosed(sid, () => {
          setConnectionState(sid, 'disconnected');
          appendLine(sid, {
            text: 'Connection closed by remote host.',
            timestamp: new Date().toISOString(),
            type: 'system',
          });
          // Auto-cleanup listeners when remote closes
          const fns = cleanupListenersMapRef.current.get(sid);
          if (fns) { for (const fn of fns) fn(); cleanupListenersMapRef.current.delete(sid); }
        });
        const unError = await onTelnetError(sid, (error) => {
          setConnectionState(sid, 'error', `Connection error: ${error}`);
          appendLine(sid, {
            text: `Connection error: ${error}`,
            timestamp: new Date().toISOString(),
            type: 'error',
          });
        });

        // Store cleanup functions keyed by session ID
        cleanupListenersMapRef.current.set(sid, [unData, unClosed, unError]);

        // Now initiate the TCP connection
        await nativeTelnetConnect(sid, session.host, session.port);

        setConnectionState(sid, 'connected');
        appendLine(sid, {
          text: `Connected to ${session.host}:${session.port}`,
          timestamp: new Date().toISOString(),
          type: 'system',
        });
        addToHistory({
          host: session.host,
          port: session.port,
          baudRate: session.baudRate,
          lineEnding: session.lineEnding,
          label: session.label,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setConnectionState(sid, 'error', msg);
        appendLine(sid, {
          text: `Connection failed: ${msg}`,
          timestamp: new Date().toISOString(),
          type: 'error',
        });
        // Clean up listeners on connect failure
        const fns = cleanupListenersMapRef.current.get(sid);
        if (fns) { for (const fn of fns) fn(); cleanupListenersMapRef.current.delete(sid); }
      }
    } else {
      // ─── Browser: WebSocket fallback ───────────────────
      const wsUrl = `ws://${session.host}:${session.port}`;
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnectionState(session.id, 'connected');
          appendLine(session.id, {
            text: `Connected to ${session.host}:${session.port}`,
            timestamp: new Date().toISOString(),
            type: 'system',
          });
          addToHistory({
            host: session.host,
            port: session.port,
            baudRate: session.baudRate,
            lineEnding: session.lineEnding,
            label: session.label,
          });
        };

        ws.onmessage = (event) => {
          appendLine(session.id, {
            text: String(event.data),
            timestamp: new Date().toISOString(),
            type: 'output',
          });
        };

        ws.onerror = () => {
          setConnectionState(session.id, 'error', 'Live connections require the BAU Suite desktop app');
          appendLine(session.id, {
            text: 'Cannot connect from browser — web browsers cannot make raw TCP/Telnet connections due to security restrictions. Use the BAU Suite desktop app for live Telnet sessions. In the browser, you can still use this terminal for local command logging and session documentation.',
            timestamp: new Date().toISOString(),
            type: 'error',
          });
        };

        ws.onclose = () => {
          if (session.connectionState === 'connected') {
            setConnectionState(session.id, 'disconnected');
            appendLine(session.id, {
              text: 'Connection closed.',
              timestamp: new Date().toISOString(),
              type: 'system',
            });
          }
          wsRef.current = null;
        };
      } catch {
        setConnectionState(session.id, 'error', 'Live connections require the BAU Suite desktop app');
        appendLine(session.id, {
          text: 'Browser cannot make raw TCP connections. Use the desktop app for live sessions, or use local mode to log commands.',
          timestamp: new Date().toISOString(),
          type: 'error',
        });
      }
    }
  }, [session, isDesktop, setConnectionState, appendLine, addToHistory]);

  const handleDisconnect = useCallback(async (sessionIdOverride?: string) => {
    const sid = sessionIdOverride || session.id;
    if (isDesktop) {
      try {
        await nativeTelnetDisconnect(sid);
      } catch { /* ignore */ }
      // Clean up event listeners for this session
      const fns = cleanupListenersMapRef.current.get(sid);
      if (fns) { for (const fn of fns) fn(); cleanupListenersMapRef.current.delete(sid); }
    } else {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    }
    setConnectionState(sid, 'disconnected');
    appendLine(sid, {
      text: 'Disconnected.',
      timestamp: new Date().toISOString(),
      type: 'system',
    });
  }, [session.id, isDesktop, setConnectionState, appendLine]);

  const handleReconnect = useCallback(async () => {
    await handleDisconnect();
    await handleConnect();
  }, [handleConnect, handleDisconnect]);

  const handleTestPort = useCallback(async () => {
    if (!session.host.trim()) {
      toast.error('Please enter a host/IP address');
      return;
    }
    if (!isDesktop) {
      toast.error('Port testing requires the desktop app');
      return;
    }
    appendLine(session.id, {
      text: `Testing TCP port ${session.host}:${session.port}...`,
      timestamp: new Date().toISOString(),
      type: 'system',
    });
    try {
      const result = await nativeCheckPort(session.host, session.port, 5000);
      if (result.open) {
        appendLine(session.id, {
          text: `Port ${session.port} is OPEN on ${session.host} (${result.response_time_ms}ms). Ready to connect.`,
          timestamp: new Date().toISOString(),
          type: 'system',
        });
        toast.success(`Port ${session.port} is open — ready to connect`);
      } else {
        appendLine(session.id, {
          text: `Port ${session.port} is CLOSED/FILTERED on ${session.host}. ${result.error || 'No response.'}` +
            '\nTroubleshooting: Check Windows Firewall, verify the device is on and you\'re on the correct network/VLAN.',
          timestamp: new Date().toISOString(),
          type: 'error',
        });
        toast.error(`Port ${session.port} is not reachable`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      appendLine(session.id, {
        text: `Port test failed: ${msg}`,
        timestamp: new Date().toISOString(),
        type: 'error',
      });
    }
  }, [session.id, session.host, session.port, isDesktop, appendLine]);

  // ─── Send command ──────────────────────────────────────
  const handleSendCommand = useCallback(async (cmd: string) => {
    if (isDesktop) {
      try {
        await nativeTelnetSend(session.id, cmd, session.lineEnding);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        appendLine(session.id, {
          text: `Send failed: ${msg}`,
          timestamp: new Date().toISOString(),
          type: 'error',
        });
      }
    } else if (wsRef.current?.readyState === WebSocket.OPEN) {
      const ending = session.lineEnding === 'cr' ? '\r' : session.lineEnding === 'lf' ? '\n' : '\r\n';
      wsRef.current.send(cmd + ending);
    }
  }, [session.id, session.lineEnding, isDesktop, appendLine]);

  // ─── Export ──────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const content = generateExportText(session);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = generateFileName(session);
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Session log exported');
  }, [session]);

  // Cleanup on unmount — tear down all sessions
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      // Clean up all Tauri event listeners across all sessions
      for (const [, fns] of cleanupListenersMapRef.current) {
        for (const fn of fns) fn();
      }
      cleanupListenersMapRef.current.clear();
    };
  }, []);

  const stateConfig = STATE_CONFIG[session.connectionState];
  const StateIcon = stateConfig.icon;

  return (
    <>
      <TopBar title="Telnet HMI Tool" />
      <div className="flex flex-col" style={{ height: 'calc(100vh - 3.5rem)' }}>
        {/* Session Tabs */}
        <div className="flex items-center border-b border-border bg-muted/30 shrink-0">
          <div className="flex flex-1 overflow-x-auto scrollbar-none">
            {sessions.map(s => {
              const sc = STATE_CONFIG[s.connectionState];
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSession(s.id)}
                  className={cn(
                    'flex items-center gap-1.5 shrink-0 border-r border-border px-3 py-2 text-xs font-medium transition-colors group',
                    s.id === activeSessionId
                      ? 'bg-background text-foreground border-b-2 border-b-primary -mb-px'
                      : 'text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  <Circle className={cn('h-2 w-2 fill-current', sc.color)} />
                  <span className="truncate max-w-28">{s.label}</span>
                  {sessions.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Disconnect if connected before removing session
                        if (s.connectionState === 'connected' || s.connectionState === 'connecting') {
                          handleDisconnect(s.id);
                        }
                        removeSession(s.id);
                      }}
                      className="ml-1 opacity-0 group-hover:opacity-100 hover:text-destructive p-0.5 rounded transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => createSession({ baudRate: settings.defaultBaudRate, lineEnding: settings.defaultLineEnding ?? 'crlf' })}
            className="shrink-0 p-2.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title="New session"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Connection Panel (collapsible) */}
        <div className="shrink-0 border-b border-border">
          <button
            onClick={() => setConnPanelOpen(!connPanelOpen)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <div className="flex items-center gap-2">
              <Plug className="h-3.5 w-3.5" />
              <span>Connection</span>
              <Badge variant="outline" className={cn('text-[10px] gap-1', stateConfig.color)}>
                <StateIcon className={cn('h-2.5 w-2.5', session.connectionState === 'connecting' && 'animate-spin')} />
                {stateConfig.label}
              </Badge>
              {session.host && (
                <span className="text-muted-foreground">{session.host}:{session.port}</span>
              )}
            </div>
            {connPanelOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {connPanelOpen && (
            <div className="px-4 pb-3 space-y-3">
              {/* Connection fields */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                  <Label htmlFor="term-label" className="text-xs">Session Label</Label>
                  <Input
                    id="term-label"
                    value={session.label}
                    onChange={e => updateSession(session.id, { label: e.target.value })}
                    placeholder="Panel A"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="term-host" className="text-xs">Host / IP Address</Label>
                  <Input
                    id="term-host"
                    value={session.host}
                    onChange={e => updateSession(session.id, { host: e.target.value })}
                    placeholder="10.40.1.10"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="term-port" className="text-xs">Port</Label>
                  <Input
                    id="term-port"
                    type="number"
                    value={session.port}
                    onChange={e => updateSession(session.id, { port: parseInt(e.target.value) || 23 })}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Line Ending</Label>
                  <Select
                    value={session.lineEnding}
                    onValueChange={v => v && updateSession(session.id, { lineEnding: v as LineEnding })}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LINE_ENDINGS.map(le => <SelectItem key={le.value} value={le.value}>{le.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Toggles row */}
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={session.localEcho}
                    onCheckedChange={c => updateSession(session.id, { localEcho: !!c })}
                    size="sm"
                  />
                  Local Echo
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={session.lineMode}
                    onCheckedChange={c => updateSession(session.id, { lineMode: !!c })}
                    size="sm"
                  />
                  Line Mode
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={session.logging}
                    onCheckedChange={() => toggleLogging(session.id)}
                    size="sm"
                  />
                  Logging
                </label>
              </div>

              {/* Connection buttons */}
              <div className="flex flex-wrap gap-2">
                {session.connectionState === 'disconnected' || session.connectionState === 'error' ? (
                  <>
                    <Button size="sm" onClick={handleConnect} className="gap-1.5 h-8">
                      <Plug className="h-3.5 w-3.5" /> Connect
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleTestPort} className="gap-1.5 h-8">
                      <Search className="h-3.5 w-3.5" /> Test Port
                    </Button>
                  </>
                ) : session.connectionState === 'connected' ? (
                  <>
                    <Button size="sm" variant="destructive" onClick={() => handleDisconnect()} className="gap-1.5 h-8">
                      <Unplug className="h-3.5 w-3.5" /> Disconnect
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleReconnect} className="gap-1.5 h-8">
                      <RotateCcw className="h-3.5 w-3.5" /> Reconnect
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" disabled className="gap-1.5 h-8">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Connecting...
                  </Button>
                )}

                <div className="border-l border-border" />

                <Button size="sm" variant="outline" onClick={() => clearBuffer(session.id)} className="gap-1.5 h-8">
                  <Trash2 className="h-3.5 w-3.5" /> Clear
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => togglePause(session.id)}
                  className="gap-1.5 h-8"
                >
                  {session.paused
                    ? <><Play className="h-3.5 w-3.5" /> Resume</>
                    : <><Pause className="h-3.5 w-3.5" /> Pause</>
                  }
                </Button>

                <div className="border-l border-border" />

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExport}
                  disabled={session.buffer.length === 0}
                  className="gap-1.5 h-8"
                >
                  <Download className="h-3.5 w-3.5" /> Export .txt
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAttach(true)}
                  disabled={session.buffer.length === 0}
                  className="gap-1.5 h-8"
                >
                  <Paperclip className="h-3.5 w-3.5" /> Attach to Project
                </Button>

                <div className="ml-auto flex gap-1">
                  <Button
                    size="sm"
                    variant={showSnippets ? 'secondary' : 'ghost'}
                    onClick={() => { setShowSnippets(!showSnippets); setShowHistory(false); setShowSettings(false); }}
                    className="h-8 w-8 p-0"
                    title="Command snippets"
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant={showHistory ? 'secondary' : 'ghost'}
                    onClick={() => { setShowHistory(!showHistory); setShowSettings(false); setShowSnippets(false); }}
                    className="h-8 w-8 p-0"
                    title="Session history"
                  >
                    <History className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant={showSettings ? 'secondary' : 'ghost'}
                    onClick={() => { setShowSettings(!showSettings); setShowHistory(false); setShowSnippets(false); }}
                    className="h-8 w-8 p-0"
                    title="Terminal settings"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Browser mode notice */}
              {!isDesktop && session.connectionState === 'disconnected' && (
                <div className="rounded-lg bg-field-info/10 border border-field-info/20 px-3 py-2 text-xs text-field-info flex items-start gap-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>Live Telnet connections require the <strong>BAU Suite desktop app</strong>. In the browser, you can log commands and document sessions locally.</span>
                </div>
              )}

              {/* Error message */}
              {session.connectionState === 'error' && session.errorMessage && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
                  {session.errorMessage}
                </div>
              )}
            </div>
          )}

          {showSettings && <SettingsPanel />}
          {showHistory && <HistoryPanel />}
          {showSnippets && <SnippetLibraryPanel onInsert={(cmd) => setInsertedCmd(cmd)} />}
        </div>

        {/* Terminal View */}
        <TerminalView session={session} />

        {/* Command Input */}
        <CommandInput session={session} insertedCmd={insertedCmd} onClearInserted={() => setInsertedCmd('')} onSend={handleSendCommand} />

        {/* Status Bar */}
        <div className="shrink-0 flex items-center justify-between px-3 py-1 border-t border-border bg-muted/30 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className={stateConfig.color}>{stateConfig.label}</span>
            {session.host && <span>{session.host}:{session.port}</span>}
            <span>Telnet TCP</span>
            <span>{LINE_ENDINGS.find(le => le.value === session.lineEnding)?.label ?? 'CR+LF'}</span>
          </div>
          <div className="flex items-center gap-3">
            <span>{session.buffer.length} lines</span>
            {session.logging && <span className="text-green-500">LOG</span>}
            {session.paused && <span className="text-yellow-500">PAUSED</span>}
          </div>
        </div>
      </div>

      {/* Attach dialog */}
      {showAttach && (
        <AttachDialog
          open={showAttach}
          onOpenChange={setShowAttach}
          session={session}
        />
      )}
    </>
  );
}
