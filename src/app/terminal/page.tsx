'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
  Terminal as TerminalIcon, Plug, Unplug, RotateCcw, Trash2, Pause, Play,
  Download, Plus, X, Settings2, History, FileText, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2, Loader2, Circle, BookOpen, Paperclip,
  BookmarkPlus, Star, Tag, Search, Copy, PlayCircle, Clock, StickyNote,
  Wifi, WifiOff, Save, Edit2, CircleHelp,
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
  BAUD_RATES, BUFFER_SIZES, LINE_ENDINGS, CONNECTION_MODES,
  DATA_BITS_OPTIONS, PARITY_OPTIONS, STOP_BITS_OPTIONS,
  FLOW_CONTROL_OPTIONS, FONT_SIZES,
  type TerminalSession, type ConnectionState, type ConnectionMode,
  type BaudRate, type BufferSize, type DataBits, type Parity, type StopBits,
  type FlowControl, type FontSize,
  type TerminalLine, type LineEnding,
} from '@/store/terminal-store';
import { useConnectionProfiles } from '@/hooks/use-projects';
import { useProjects, useCommandSnippets } from '@/hooks/use-projects';
// db imports handled via dynamic import in AttachDialog
import type { CommandSnippet, SnippetCategory, ConnectionProfile } from '@/types';
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
  nativeSerialListPorts,
  nativeSerialConnect,
  nativeSerialSend,
  nativeSerialDisconnect,
  onSerialData,
  onSerialClosed,
  onSerialError,
  type NativeSerialPortInfo,
} from '@/lib/tauri-bridge';
import { parseAnsiLine, processCarriageReturns, containsClearScreen } from '@/lib/hmi/ansi-parser';

// ─── Connection State UI ─────────────────────────────────────
const STATE_CONFIG: Record<ConnectionState, { label: string; color: string; icon: typeof Circle }> = {
  disconnected: { label: 'Disconnected', color: 'text-muted-foreground', icon: Circle },
  connecting: { label: 'Connecting...', color: 'text-yellow-500', icon: Loader2 },
  connected: { label: 'Connected', color: 'text-green-500', icon: CheckCircle2 },
  error: { label: 'Error', color: 'text-red-500', icon: AlertCircle },
};

// ─── Connection Duration Hook ────────────────────────────────
function useConnectionDuration(session: TerminalSession) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (session.connectionState !== 'connected' || !session.startedAt) {
      setElapsed('');
      return;
    }
    const start = new Date(session.startedAt).getTime();
    const tick = () => {
      const diff = Math.floor((Date.now() - start) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsed(h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.connectionState, session.startedAt]);

  return elapsed;
}

// ─── Session Notes Panel ─────────────────────────────────────
function SessionNotesPanel({ session }: { session: TerminalSession }) {
  const updateSession = useTerminalStore(s => s.updateSession);
  const [notes, setNotes] = useState(session.sessionNotes ?? '');

  useEffect(() => { setNotes(session.sessionNotes ?? ''); }, [session.id, session.sessionNotes]);

  const handleSave = () => {
    updateSession(session.id, { sessionNotes: notes });
    toast.success('Session notes saved');
  };

  return (
    <div className="p-4 border-t border-border space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <StickyNote className="h-4 w-4" /> Session Notes
        </h3>
        <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={handleSave}>
          <Save className="h-3 w-3" /> Save
        </Button>
      </div>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Add notes about this session (panel info, issues observed, etc.)..."
        className="w-full min-h-[80px] rounded-lg border border-border bg-background p-2 text-xs font-mono resize-y outline-none focus:ring-1 focus:ring-ring"
        spellCheck={false}
      />
    </div>
  );
}

// ─── Connection Profiles Sidebar ─────────────────────────────
function ProfilesSidebar({ session, onApplyProfile }: {
  session: TerminalSession;
  onApplyProfile: (profile: ConnectionProfile) => void;
}) {
  const { profiles, addProfile, updateProfile, removeProfile } = useConnectionProfiles();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState('');

  const handleSaveCurrentAsProfile = async () => {
    if (!profileName.trim()) {
      toast.error('Profile name is required');
      return;
    }
    await addProfile({
      name: profileName,
      connectionType: session.connectionMode,
      serialPort: session.serialPort,
      baudRate: session.baudRate,
      dataBits: session.dataBits ?? 8,
      parity: session.parity ?? 'none',
      stopBits: session.stopBits ?? '1',
      flowControl: session.flowControl ?? 'none',
      host: session.host,
      port: session.port,
      localEcho: session.localEcho,
      lineEnding: session.lineEnding,
      logging: session.logging,
      projectId: '',
      notes: session.sessionNotes ?? '',
      isFavorite: false,
      tags: [],
    });
    toast.success(`Profile "${profileName}" saved`);
    setProfileName('');
    setShowAdd(false);
  };

  const handleDelete = async (id: string, name: string) => {
    await removeProfile(id);
    toast.success(`Profile "${name}" deleted`);
  };

  const handleToggleFav = async (profile: ConnectionProfile) => {
    await updateProfile({ ...profile, isFavorite: !profile.isFavorite });
  };

  const sortedProfiles = [...profiles].sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="w-56 shrink-0 border-r border-border bg-muted/20 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-xs font-semibold">Profiles</h3>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowAdd(!showAdd)} title="Save current as profile">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {showAdd && (
        <div className="px-3 py-2 border-b border-border space-y-2 bg-muted/30">
          <Input
            value={profileName}
            onChange={e => setProfileName(e.target.value)}
            placeholder="Profile name..."
            className="h-7 text-xs"
            onKeyDown={e => e.key === 'Enter' && handleSaveCurrentAsProfile()}
          />
          <div className="flex gap-1">
            <Button size="sm" className="h-6 text-[10px] flex-1" onClick={handleSaveCurrentAsProfile}>Save</Button>
            <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {sortedProfiles.length === 0 && (
          <div className="px-3 py-6 text-center text-[10px] text-muted-foreground">
            No saved profiles yet.
            <br />Click + to save current settings.
          </div>
        )}
        {sortedProfiles.map(p => (
          <button
            key={p.id}
            onClick={() => onApplyProfile(p)}
            className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors border-b border-border/50 group"
          >
            <div className="flex items-center gap-1.5">
              {p.isFavorite && <Star className="h-2.5 w-2.5 fill-yellow-500 text-yellow-500 shrink-0" />}
              <span className="font-medium truncate">{p.name}</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {p.connectionType === 'serial'
                ? `${p.serialPort || 'Serial'} @ ${p.baudRate}`
                : `${p.host || '—'}:${p.port}`
              }
            </div>
            <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={e => { e.stopPropagation(); handleToggleFav(p); }}
                className="p-0.5 rounded hover:bg-muted"
                title={p.isFavorite ? 'Unfavorite' : 'Favorite'}
              >
                <Star className={cn('h-2.5 w-2.5', p.isFavorite ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground')} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); handleDelete(p.id, p.name); }}
                className="p-0.5 rounded hover:bg-muted hover:text-destructive"
                title="Delete profile"
              >
                <Trash2 className="h-2.5 w-2.5 text-muted-foreground" />
              </button>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Terminal Output ─────────────────────────────────────────
function TerminalView({ session, fontSize }: { session: TerminalSession; fontSize: number }) {
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
      case 'output': return undefined; // ANSI-parsed spans handle color
      case 'system': return 'text-blue-400';
      case 'error': return 'text-red-400';
    }
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto bg-[#0d1117] p-3 font-mono leading-relaxed"
      style={{ fontSize: `${fontSize}px` }}
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
            <span className="text-gray-600 mr-2 select-none" style={{ fontSize: '10px' }}>
              {format(new Date(line.timestamp), 'HH:mm:ss')}
            </span>
          )}
          {line.type === 'input' && <span className="text-green-600 select-none">&gt; </span>}
          {line.type === 'output' ? (
            <TerminalLineSpans text={line.text} />
          ) : (
            line.text
          )}
        </div>
      ))}
      {session.paused && (
        <div className="text-yellow-600 mt-1 select-none">--- Output paused ---</div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// Renders ANSI-styled spans for a single output line
function TerminalLineSpans({ text }: { text: string }) {
  const parsed = parseAnsiLine(text);
  if (parsed.spans.length === 1 && !parsed.spans[0].bold && !parsed.spans[0].fgColor && !parsed.spans[0].bgColor) {
    return <span className="text-gray-300">{parsed.spans[0].text}</span>;
  }
  return (
    <>
      {parsed.spans.map((span, i) => (
        <span
          key={i}
          style={{
            color: span.fgColor || '#abb2bf',
            backgroundColor: span.bgColor,
            fontWeight: span.bold ? 'bold' : undefined,
          }}
        >
          {span.text}
        </span>
      ))}
    </>
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
    try {
      const content = generateExportText(session);
      const { saveTerminalLog, addActivity } = await import('@/lib/db');
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await saveTerminalLog({
        id,
        projectId,
        sessionLabel: session.label,
        connectionMode: session.connectionMode,
        host: session.host,
        port: session.port,
        serialPort: session.serialPort,
        baudRate: session.baudRate,
        lineCount: session.buffer.length,
        logContent: content,
        startedAt: session.startedAt,
        endedAt: session.endedAt || now,
        createdAt: now,
      });
      await addActivity({
        id: crypto.randomUUID(),
        projectId,
        action: 'Terminal log attached',
        details: `${session.connectionMode === 'serial' ? 'Serial' : 'Telnet'} session "${session.label}" log attached (${session.buffer.length} lines)`,
        timestamp: now,
        user: 'User',
      });
      toast.success('Session log attached to project');
    } catch (err) {
      toast.error('Failed to attach session log');
      console.error(err);
    }
    setSaving(false);
    onOpenChange(false);
  };

  const isSerial = session.connectionMode === 'serial';
  const connectionInfo = isSerial
    ? `${session.serialPort || 'N/A'} @ ${session.baudRate} baud`
    : `${session.host || 'N/A'}:${session.port}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach Session Log to Project</DialogTitle>
          <DialogDescription>
            Save the terminal session log to a project. It will appear under the Terminal Logs tab.
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
              <p><strong>Mode:</strong> {isSerial ? 'Serial' : 'Telnet TCP'}</p>
              <p><strong>Connection:</strong> {connectionInfo}</p>
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
  const isSerial = session.connectionMode === 'serial';
  const target = isSerial ? (session.serialPort || 'serial') : (session.host || 'local');
  const mode = isSerial ? 'serial' : 'telnet';
  const date = format(new Date(), 'yyyy-MM-dd_HH-mm');
  return sanitizeFilename(`${session.label.replace(/\s+/g, '_')}_${mode}_session_${date}.txt`);
}

function generateExportText(session: TerminalSession) {
  const isSerial = session.connectionMode === 'serial';
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════════════════');
  lines.push(`  BAU Suite — ${isSerial ? 'Serial' : 'Telnet'} HMI Session Log`);
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`Session:    ${session.label}`);
  if (isSerial) {
    lines.push(`Port:       ${session.serialPort || 'N/A'}`);
    lines.push(`Baud Rate:  ${session.baudRate}`);
    lines.push(`Settings:   ${session.dataBits}${(session.parity ?? 'none')[0].toUpperCase()}${session.stopBits}`);
    lines.push(`Protocol:   Serial`);
  } else {
    lines.push(`Host:       ${session.host || 'N/A'}`);
    lines.push(`Port:       ${session.port}`);
    lines.push(`Protocol:   Telnet TCP`);
  }
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
      <div className="grid gap-3 sm:grid-cols-5">
        <div className="space-y-1.5">
          <Label className="text-xs">Default Baud Rate</Label>
          <Select
            value={String(settings.defaultBaudRate)}
            onValueChange={v => v && updateSettings({ defaultBaudRate: Number(v) as BaudRate })}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BAUD_RATES.map(br => <SelectItem key={br} value={String(br)}>{br.toLocaleString()}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
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
        <div className="space-y-1.5">
          <Label className="text-xs">Font Size</Label>
          <Select
            value={String(settings.fontSize ?? 12)}
            onValueChange={v => v && updateSettings({ fontSize: Number(v) as FontSize })}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FONT_SIZES.map(fs => <SelectItem key={fs} value={String(fs)}>{fs}px</SelectItem>)}
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
              <button onClick={() => { navigator.clipboard.writeText(s.command).then(() => toast.success('Copied')).catch(() => toast.error('Clipboard access denied')); }}
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
  useEffect(() => {
    if (sessions.length === 0) createSession();
  }, [sessions.length, createSession]);
  const session = sessions.find(s => s.id === activeSessionId) || sessions[0];
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSnippets, setShowSnippets] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [showProfiles, setShowProfiles] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [connPanelOpen, setConnPanelOpen] = useState(true);
  const [insertedCmd, setInsertedCmd] = useState('');

  const connectionDuration = useConnectionDuration(session);

  const wsRef = useRef<WebSocket | null>(null);
  // Track Tauri event listener cleanup per session (key = session ID)
  const cleanupListenersMapRef = useRef<Map<string, (() => void)[]>>(new Map());
  const [isDesktop, setIsDesktop] = useState(false);

  // ─── Line buffering for incoming data ──────────────────────
  // Raw serial/telnet data arrives in arbitrary byte chunks, not neat lines.
  // We buffer partial lines and only emit complete lines (split on \r\n, \r, \n).
  // A flush timer emits partial lines after 100ms for interactive prompts.
  const lineBufferRef = useRef<Map<string, string>>(new Map());
  const flushTimeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const processIncomingData = useCallback((sessionId: string, data: string) => {
    // Handle ANSI clear screen — wipe buffer
    if (containsClearScreen(data)) {
      clearBuffer(sessionId);
    }

    // Process carriage returns (bare \r overwrites from column 0)
    const processed = processCarriageReturns(data);

    const existing = lineBufferRef.current.get(sessionId) ?? '';
    const combined = existing + processed;

    // Split on any newline variant: \r\n, \r, or \n
    const parts = combined.split(/\r\n|\r|\n/);

    // All parts except the last are complete lines
    for (let i = 0; i < parts.length - 1; i++) {
      appendLine(sessionId, {
        text: parts[i],
        timestamp: new Date().toISOString(),
        type: 'output',
      });
    }

    // Last part is a partial (no trailing newline yet) — keep in buffer
    const partial = parts[parts.length - 1];
    lineBufferRef.current.set(sessionId, partial);

    // Clear any existing flush timer for this session
    const existingTimer = flushTimeoutRef.current.get(sessionId);
    if (existingTimer) clearTimeout(existingTimer);

    // If there's a partial line, flush it after 100ms (for interactive prompts)
    if (partial) {
      const timer = setTimeout(() => {
        const buffered = lineBufferRef.current.get(sessionId);
        if (buffered) {
          appendLine(sessionId, {
            text: buffered,
            timestamp: new Date().toISOString(),
            type: 'output',
          });
          lineBufferRef.current.set(sessionId, '');
        }
        flushTimeoutRef.current.delete(sessionId);
      }, 100);
      flushTimeoutRef.current.set(sessionId, timer);
    }
  }, [appendLine, clearBuffer]);

  const flushLineBuffer = useCallback((sessionId: string) => {
    const timer = flushTimeoutRef.current.get(sessionId);
    if (timer) clearTimeout(timer);
    flushTimeoutRef.current.delete(sessionId);
    const buffered = lineBufferRef.current.get(sessionId);
    if (buffered) {
      appendLine(sessionId, {
        text: buffered,
        timestamp: new Date().toISOString(),
        type: 'output',
      });
      lineBufferRef.current.set(sessionId, '');
    }
  }, [appendLine]);

  // Clean up flush timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of flushTimeoutRef.current.values()) clearTimeout(timer);
    };
  }, []);

  useEffect(() => { setIsDesktop(isTauri()); }, []);

  // ─── Serial port list ────────────────────────────────────
  const [availablePorts, setAvailablePorts] = useState<NativeSerialPortInfo[]>([]);
  const refreshPorts = useCallback(async () => {
    if (!isDesktop) return;
    try {
      const ports = await nativeSerialListPorts();
      setAvailablePorts(ports);
      // Auto-select first port if none selected
      if (ports.length > 0 && !session.serialPort) {
        updateSession(session.id, { serialPort: ports[0].name });
      }
    } catch { /* ignore in browser */ }
  }, [isDesktop, session.id, session.serialPort, updateSession]);

  useEffect(() => { refreshPorts(); }, [refreshPorts]);

  // ─── Connection logic ────────────────────────────────────
  const handleConnect = useCallback(async () => {
    const isSerial = session.connectionMode === 'serial';

    if (isSerial && !session.serialPort) {
      toast.error('Please select a serial port');
      return;
    }
    if (!isSerial && !session.host.trim()) {
      toast.error('Please enter a host/IP address');
      return;
    }

    setConnectionState(session.id, 'connecting');
    const db = session.dataBits ?? 8;
    const par = (session.parity ?? 'none')[0].toUpperCase();
    const sb = session.stopBits ?? '1';
    const connectLabel = isSerial
      ? `${session.serialPort} @ ${session.baudRate} baud (${db}${par}${sb})`
      : `${session.host}:${session.port} (Telnet TCP)`;
    appendLine(session.id, {
      text: `Connecting to ${connectLabel}...`,
      timestamp: new Date().toISOString(),
      type: 'system',
    });

    if (isDesktop) {
      const sid = session.id;
      try {
        // Clean up any existing listeners for this session first
        const existing = cleanupListenersMapRef.current.get(sid);
        if (existing) {
          for (const fn of existing) fn();
          cleanupListenersMapRef.current.delete(sid);
        }

        if (isSerial) {
          // ─── Serial Port via Tauri ──────────────────────
          const unData = await onSerialData(sid, (data) => {
            processIncomingData(sid, data);
          });
          const unClosed = await onSerialClosed(sid, () => {
            flushLineBuffer(sid);
            setConnectionState(sid, 'disconnected');
            appendLine(sid, { text: 'Serial port closed.', timestamp: new Date().toISOString(), type: 'system' });
            const fns = cleanupListenersMapRef.current.get(sid);
            if (fns) { for (const fn of fns) fn(); cleanupListenersMapRef.current.delete(sid); }
          });
          const unError = await onSerialError(sid, (error) => {
            setConnectionState(sid, 'error', `Serial error: ${error}`);
            appendLine(sid, { text: `Serial error: ${error}`, timestamp: new Date().toISOString(), type: 'error' });
          });
          cleanupListenersMapRef.current.set(sid, [unData, unClosed, unError]);

          await nativeSerialConnect(
            sid, session.serialPort, session.baudRate,
            session.dataBits, session.parity, session.stopBits,
          );
        } else {
          // ─── TCP Telnet via Tauri ───────────────────────
          const unData = await onTelnetData(sid, (data) => {
            processIncomingData(sid, data);
          });
          const unClosed = await onTelnetClosed(sid, () => {
            flushLineBuffer(sid);
            setConnectionState(sid, 'disconnected');
            appendLine(sid, { text: 'Connection closed by remote host.', timestamp: new Date().toISOString(), type: 'system' });
            const fns = cleanupListenersMapRef.current.get(sid);
            if (fns) { for (const fn of fns) fn(); cleanupListenersMapRef.current.delete(sid); }
          });
          const unError = await onTelnetError(sid, (error) => {
            setConnectionState(sid, 'error', `Connection error: ${error}`);
            appendLine(sid, { text: `Connection error: ${error}`, timestamp: new Date().toISOString(), type: 'error' });
          });
          cleanupListenersMapRef.current.set(sid, [unData, unClosed, unError]);

          await nativeTelnetConnect(sid, session.host, session.port);
        }

        setConnectionState(sid, 'connected');
        appendLine(sid, {
          text: `Connected to ${connectLabel}`,
          timestamp: new Date().toISOString(),
          type: 'system',
        });
        addToHistory({
          connectionMode: session.connectionMode,
          host: session.host,
          port: session.port,
          serialPort: session.serialPort,
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
          processIncomingData(session.id, String(event.data));
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
          flushLineBuffer(session.id);
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
  }, [session, isDesktop, setConnectionState, appendLine, addToHistory, processIncomingData, flushLineBuffer]);

  const handleDisconnect = useCallback(async (sessionIdOverride?: string) => {
    const sid = sessionIdOverride || session.id;
    if (isDesktop) {
      try {
        if (session.connectionMode === 'serial') {
          await nativeSerialDisconnect(sid);
        } else {
          await nativeTelnetDisconnect(sid);
        }
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
    flushLineBuffer(sid);
    setConnectionState(sid, 'disconnected');
    appendLine(sid, {
      text: 'Disconnected.',
      timestamp: new Date().toISOString(),
      type: 'system',
    });
  }, [session.id, session.connectionMode, isDesktop, setConnectionState, appendLine, flushLineBuffer]);

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
        if (session.connectionMode === 'serial') {
          await nativeSerialSend(session.id, cmd, session.lineEnding);
        } else {
          await nativeTelnetSend(session.id, cmd, session.lineEnding);
        }
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
  }, [session.id, session.connectionMode, session.lineEnding, isDesktop, appendLine]);

  // ─── Export ──────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const content = generateExportText(session);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = generateFileName(session);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
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

  const handleApplyProfile = useCallback((profile: ConnectionProfile) => {
    updateSession(session.id, {
      connectionMode: profile.connectionType as ConnectionMode,
      serialPort: profile.serialPort,
      baudRate: profile.baudRate as BaudRate,
      dataBits: profile.dataBits as DataBits,
      parity: profile.parity as Parity,
      stopBits: profile.stopBits as StopBits,
      flowControl: (profile.flowControl ?? 'none') as FlowControl,
      host: profile.host,
      port: profile.port,
      localEcho: profile.localEcho,
      lineEnding: profile.lineEnding as LineEnding,
      logging: profile.logging,
      label: profile.name,
    });
    toast.success(`Profile "${profile.name}" applied`);
  }, [session.id, updateSession]);

  const stateConfig = STATE_CONFIG[session.connectionState];
  const StateIcon = stateConfig.icon;

  return (
    <>
      <TopBar title="HMI Terminal" />
      <div className="flex" style={{ height: 'calc(100vh - 3.5rem)' }}>
        {/* Profiles Sidebar */}
        {showProfiles && (
          <ProfilesSidebar session={session} onApplyProfile={handleApplyProfile} />
        )}

        <div className="flex flex-col flex-1 min-w-0">
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
              {session.connectionMode === 'serial'
                ? session.serialPort && <span className="text-muted-foreground">{session.serialPort} @ {session.baudRate}</span>
                : session.host && <span className="text-muted-foreground">{session.host}:{session.port}</span>
              }
            </div>
            {connPanelOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {connPanelOpen && (
            <div className="px-4 pb-2.5 space-y-2">
              {/* Row 1: Mode, Label, Port/Host fields — all inline */}
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-[100px]">
                  <Label className="text-[10px] text-muted-foreground mb-0.5 block">Mode</Label>
                  <Select
                    value={session.connectionMode ?? 'serial'}
                    onValueChange={v => v && updateSession(session.id, { connectionMode: v as ConnectionMode })}
                  >
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONNECTION_MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[140px] flex-1 max-w-[220px]">
                  <Label className="text-[10px] text-muted-foreground mb-0.5 block">Session Label</Label>
                  <Input
                    value={session.label}
                    onChange={e => updateSession(session.id, { label: e.target.value })}
                    placeholder="Panel A"
                    className="h-7 text-xs"
                  />
                </div>

                {session.connectionMode === 'serial' ? (
                  <>
                    <div className="min-w-[180px] flex-1 max-w-[280px]">
                      <Label className="text-[10px] text-muted-foreground mb-0.5 block">Serial Port</Label>
                      <div className="flex gap-1">
                        <Select
                          value={session.serialPort}
                          onValueChange={v => v && updateSession(session.id, { serialPort: v })}
                        >
                          <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Select port..." /></SelectTrigger>
                          <SelectContent>
                            {availablePorts.map(p => (
                              <SelectItem key={p.name} value={p.name}>{p.name} — {p.description}</SelectItem>
                            ))}
                            {availablePorts.length === 0 && (
                              <SelectItem value="_none" disabled>No ports found</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={refreshPorts} title="Refresh ports">
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="w-[110px]">
                      <Label className="text-[10px] text-muted-foreground mb-0.5 block">Baud Rate</Label>
                      <Select
                        value={String(session.baudRate)}
                        onValueChange={v => v && updateSession(session.id, { baudRate: Number(v) as BaudRate })}
                      >
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BAUD_RATES.map(br => <SelectItem key={br} value={String(br)}>{br.toLocaleString()}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="min-w-[140px] flex-1 max-w-[200px]">
                      <Label className="text-[10px] text-muted-foreground mb-0.5 block">Host / IP</Label>
                      <Input
                        value={session.host}
                        onChange={e => updateSession(session.id, { host: e.target.value })}
                        placeholder="10.40.1.10"
                        className="h-7 text-xs font-mono"
                      />
                    </div>
                    <div className="w-[70px]">
                      <Label className="text-[10px] text-muted-foreground mb-0.5 block">Port</Label>
                      <Input
                        type="number"
                        value={session.port}
                        onChange={e => updateSession(session.id, { port: parseInt(e.target.value) || 23 })}
                        className="h-7 text-xs font-mono"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Row 2: Secondary settings + toggles — all in one compact row */}
              <div className="flex flex-wrap items-end gap-2">
                {session.connectionMode === 'serial' ? (
                  <>
                    <div className="w-[72px]">
                      <Label className="text-[10px] text-muted-foreground mb-0.5 block">Data Bits</Label>
                      <Select
                        value={String(session.dataBits ?? 8)}
                        onValueChange={v => v && updateSession(session.id, { dataBits: Number(v) as DataBits })}
                      >
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DATA_BITS_OPTIONS.map(d => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-[80px]">
                      <Label className="text-[10px] text-muted-foreground mb-0.5 block">Parity</Label>
                      <Select
                        value={session.parity ?? 'none'}
                        onValueChange={v => v && updateSession(session.id, { parity: v as Parity })}
                      >
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PARITY_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-[72px]">
                      <Label className="text-[10px] text-muted-foreground mb-0.5 block">Stop Bits</Label>
                      <Select
                        value={session.stopBits ?? '1'}
                        onValueChange={v => v && updateSession(session.id, { stopBits: v as StopBits })}
                      >
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STOP_BITS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-[90px]">
                      <Label className="text-[10px] text-muted-foreground mb-0.5 block">Flow Ctrl</Label>
                      <Select
                        value={session.flowControl ?? 'none'}
                        onValueChange={v => v && updateSession(session.id, { flowControl: v as FlowControl })}
                      >
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FLOW_CONTROL_OPTIONS.map(fc => <SelectItem key={fc.value} value={fc.value}>{fc.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-[80px]">
                      <Label className="text-[10px] text-muted-foreground mb-0.5 block">Line End</Label>
                      <Select
                        value={session.lineEnding}
                        onValueChange={v => v && updateSession(session.id, { lineEnding: v as LineEnding })}
                      >
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {LINE_ENDINGS.map(le => <SelectItem key={le.value} value={le.value}>{le.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-[110px]">
                      <Label className="text-[10px] text-muted-foreground mb-0.5 block">Baud Rate</Label>
                      <Select
                        value={String(session.baudRate)}
                        onValueChange={v => v && updateSession(session.id, { baudRate: Number(v) as BaudRate })}
                      >
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BAUD_RATES.map(br => <SelectItem key={br} value={String(br)}>{br.toLocaleString()}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-[80px]">
                      <Label className="text-[10px] text-muted-foreground mb-0.5 block">Line End</Label>
                      <Select
                        value={session.lineEnding}
                        onValueChange={v => v && updateSession(session.id, { lineEnding: v as LineEnding })}
                      >
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {LINE_ENDINGS.map(le => <SelectItem key={le.value} value={le.value}>{le.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {/* Divider */}
                <div className="border-l border-border h-7 mx-0.5" />

                {/* Toggles inline */}
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer h-7">
                  <Switch
                    checked={session.localEcho}
                    onCheckedChange={c => updateSession(session.id, { localEcho: !!c })}
                    size="sm"
                  />
                  Echo
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer h-7">
                  <Switch
                    checked={session.lineMode}
                    onCheckedChange={c => updateSession(session.id, { lineMode: !!c })}
                    size="sm"
                  />
                  Line
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer h-7">
                  <Switch
                    checked={session.logging}
                    onCheckedChange={() => toggleLogging(session.id)}
                    size="sm"
                  />
                  Log
                </label>
              </div>

              {/* Row 3: Action buttons — compact single row */}
              <div className="flex flex-wrap items-center gap-1.5">
                {session.connectionState === 'disconnected' || session.connectionState === 'error' ? (
                  <>
                    <Button size="sm" onClick={handleConnect} className="gap-1 h-7 text-xs px-2.5">
                      <Plug className="h-3 w-3" /> Connect
                    </Button>
                    {session.connectionMode !== 'serial' && (
                      <Button size="sm" variant="outline" onClick={handleTestPort} className="gap-1 h-7 text-xs px-2.5">
                        <Search className="h-3 w-3" /> Test Port
                      </Button>
                    )}
                  </>
                ) : session.connectionState === 'connected' ? (
                  <>
                    <Button size="sm" variant="destructive" onClick={() => handleDisconnect()} className="gap-1 h-7 text-xs px-2.5">
                      <Unplug className="h-3 w-3" /> Disconnect
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleReconnect} className="gap-1 h-7 text-xs px-2.5">
                      <RotateCcw className="h-3 w-3" /> Reconnect
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" disabled className="gap-1 h-7 text-xs px-2.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Connecting...
                  </Button>
                )}

                <div className="border-l border-border h-5" />

                <Button size="sm" variant="ghost" onClick={() => clearBuffer(session.id)} className="gap-1 h-7 text-xs px-2">
                  <Trash2 className="h-3 w-3" /> Clear
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => togglePause(session.id)}
                  className="gap-1 h-7 text-xs px-2"
                >
                  {session.paused
                    ? <><Play className="h-3 w-3" /> Resume</>
                    : <><Pause className="h-3 w-3" /> Pause</>
                  }
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleExport}
                  disabled={session.buffer.length === 0}
                  className="gap-1 h-7 text-xs px-2"
                >
                  <Download className="h-3 w-3" /> Export
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowAttach(true)}
                  disabled={session.buffer.length === 0}
                  className="gap-1 h-7 text-xs px-2"
                >
                  <Paperclip className="h-3 w-3" /> Attach
                </Button>

                <div className="ml-auto flex gap-0.5">
                  <Button
                    size="sm"
                    variant={showProfiles ? 'secondary' : 'ghost'}
                    onClick={() => setShowProfiles(!showProfiles)}
                    className="h-7 w-7 p-0"
                    title="Connection profiles"
                  >
                    <Wifi className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant={showSnippets ? 'secondary' : 'ghost'}
                    onClick={() => { setShowSnippets(!showSnippets); setShowHistory(false); setShowSettings(false); setShowNotes(false); }}
                    className="h-7 w-7 p-0"
                    title="Command snippets"
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant={showNotes ? 'secondary' : 'ghost'}
                    onClick={() => { setShowNotes(!showNotes); setShowHistory(false); setShowSettings(false); setShowSnippets(false); }}
                    className="h-7 w-7 p-0"
                    title="Session notes"
                  >
                    <StickyNote className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant={showHistory ? 'secondary' : 'ghost'}
                    onClick={() => { setShowHistory(!showHistory); setShowSettings(false); setShowSnippets(false); setShowNotes(false); }}
                    className="h-7 w-7 p-0"
                    title="Session history"
                  >
                    <History className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant={showSettings ? 'secondary' : 'ghost'}
                    onClick={() => { setShowSettings(!showSettings); setShowHistory(false); setShowSnippets(false); setShowNotes(false); }}
                    className="h-7 w-7 p-0"
                    title="Terminal settings"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowHelp(true)}
                    className="h-7 w-7 p-0"
                    title="Help"
                  >
                    <CircleHelp className="h-3.5 w-3.5" />
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
          {showNotes && <SessionNotesPanel session={session} />}
        </div>

        {/* Terminal View */}
        <TerminalView session={session} fontSize={settings.fontSize ?? 12} />

        {/* Command Input */}
        <CommandInput session={session} insertedCmd={insertedCmd} onClearInserted={() => setInsertedCmd('')} onSend={handleSendCommand} />

        {/* Status Bar */}
        <div className="shrink-0 flex items-center justify-between px-3 py-1 border-t border-border bg-muted/30 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className={stateConfig.color}>{stateConfig.label}</span>
            {session.connectionMode === 'serial'
              ? <>{session.serialPort && <span>{session.serialPort}</span>}<span>Serial {session.dataBits ?? 8}{(session.parity ?? 'none')[0].toUpperCase()}{session.stopBits ?? '1'}</span></>
              : <>{session.host && <span>{session.host}:{session.port}</span>}<span>Telnet TCP</span></>
            }
            <span>{session.baudRate.toLocaleString()} baud</span>
            <span>{LINE_ENDINGS.find(le => le.value === session.lineEnding)?.label ?? 'CR+LF'}</span>
          </div>
          <div className="flex items-center gap-3">
            {connectionDuration && (
              <span className="flex items-center gap-1 text-green-500">
                <Clock className="h-2.5 w-2.5" />
                {connectionDuration}
              </span>
            )}
            <span>{session.buffer.length} lines</span>
            {session.logging && <span className="text-green-500">LOG</span>}
            {session.paused && <span className="text-yellow-500">PAUSED</span>}
            {session.sessionNotes && <span className="text-blue-400">NOTES</span>}
          </div>
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

      {/* Help Dialog */}
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CircleHelp className="h-4 w-4" /> HMI Terminal Help
            </DialogTitle>
            <DialogDescription>Button reference and feature guide for the Telnet HMI tool.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-6 text-sm py-4 px-6">
            {/* Connection Settings */}
            <div>
              <h4 className="font-semibold text-xs uppercase text-muted-foreground mb-2.5">Connection Settings</h4>
              <dl className="space-y-2.5 text-xs">
                <div><dt className="font-medium inline">Mode</dt> — <dd className="inline text-muted-foreground">Switch between Serial (RS-232/USB) and Telnet (TCP/IP) connections.</dd></div>
                <div><dt className="font-medium inline">Session Label</dt> — <dd className="inline text-muted-foreground">Name your session for easy identification in tabs and history.</dd></div>
                <div><dt className="font-medium inline">Host / Serial Port</dt> — <dd className="inline text-muted-foreground">Enter the IP address or hostname for Telnet, or select a COM port for Serial.</dd></div>
                <div><dt className="font-medium inline">Baud Rate</dt> — <dd className="inline text-muted-foreground">Serial communication speed (e.g., 9600, 115200). Common BAS default is 9600.</dd></div>
                <div><dt className="font-medium inline">Data Bits / Parity / Stop Bits / Flow Ctrl</dt> — <dd className="inline text-muted-foreground">Serial port framing parameters. Typical BAS setting is 8N1 (8 data, No parity, 1 stop).</dd></div>
                <div><dt className="font-medium inline">Line End</dt> — <dd className="inline text-muted-foreground">Line ending format sent with each command: CR+LF, CR, LF, or None.</dd></div>
              </dl>
            </div>

            {/* Toggles */}
            <div>
              <h4 className="font-semibold text-xs uppercase text-muted-foreground mb-2.5">Toggles</h4>
              <dl className="space-y-2.5 text-xs">
                <div><dt className="font-medium inline">Echo</dt> — <dd className="inline text-muted-foreground">Show your typed commands in the terminal output (local echo).</dd></div>
                <div><dt className="font-medium inline">Line</dt> — <dd className="inline text-muted-foreground">Line mode buffers input until Enter. When off, each keystroke is sent immediately.</dd></div>
                <div><dt className="font-medium inline">Log</dt> — <dd className="inline text-muted-foreground">Enable session logging. Logged sessions can be exported or attached to a project.</dd></div>
              </dl>
            </div>

            {/* Action Buttons */}
            <div>
              <h4 className="font-semibold text-xs uppercase text-muted-foreground mb-2.5">Action Buttons</h4>
              <dl className="space-y-2.5 text-xs">
                <div><dt className="font-medium inline"><Plug className="h-3 w-3 inline mr-0.5" />Connect</dt> — <dd className="inline text-muted-foreground">Open a connection using the configured settings. Requires the desktop app for live connections.</dd></div>
                <div><dt className="font-medium inline"><Unplug className="h-3 w-3 inline mr-0.5" />Disconnect</dt> — <dd className="inline text-muted-foreground">Close the active connection gracefully.</dd></div>
                <div><dt className="font-medium inline"><RotateCcw className="h-3 w-3 inline mr-0.5" />Reconnect</dt> — <dd className="inline text-muted-foreground">Disconnect and immediately reconnect with the same settings.</dd></div>
                <div><dt className="font-medium inline"><Search className="h-3 w-3 inline mr-0.5" />Test Port</dt> — <dd className="inline text-muted-foreground">Check if the target host and port are reachable before connecting (Telnet mode only).</dd></div>
                <div><dt className="font-medium inline"><Trash2 className="h-3 w-3 inline mr-0.5" />Clear</dt> — <dd className="inline text-muted-foreground">Clear the terminal output buffer. Does not disconnect.</dd></div>
                <div><dt className="font-medium inline"><Pause className="h-3 w-3 inline mr-0.5" />Pause / Resume</dt> — <dd className="inline text-muted-foreground">Freeze the terminal display. Data continues to buffer in the background.</dd></div>
                <div><dt className="font-medium inline"><Download className="h-3 w-3 inline mr-0.5" />Export</dt> — <dd className="inline text-muted-foreground">Download the session log as a .txt file with timestamps and connection details.</dd></div>
                <div><dt className="font-medium inline"><Paperclip className="h-3 w-3 inline mr-0.5" />Attach</dt> — <dd className="inline text-muted-foreground">Save the session log to a project as a document for future reference.</dd></div>
              </dl>
            </div>

            {/* Icon Buttons */}
            <div>
              <h4 className="font-semibold text-xs uppercase text-muted-foreground mb-2.5">Toolbar Icons (Right Side)</h4>
              <dl className="space-y-2.5 text-xs">
                <div><dt className="font-medium inline"><Wifi className="h-3 w-3 inline mr-0.5" />Profiles</dt> — <dd className="inline text-muted-foreground">Save and load connection profiles (host, port, serial settings). Quickly switch between devices.</dd></div>
                <div><dt className="font-medium inline"><BookmarkPlus className="h-3 w-3 inline mr-0.5" />Snippets</dt> — <dd className="inline text-muted-foreground">Open the command snippet library. Save, search, and insert frequently used commands.</dd></div>
                <div><dt className="font-medium inline"><StickyNote className="h-3 w-3 inline mr-0.5" />Notes</dt> — <dd className="inline text-muted-foreground">Open session notes. Record observations, panel info, or issues during the session.</dd></div>
                <div><dt className="font-medium inline"><History className="h-3 w-3 inline mr-0.5" />History</dt> — <dd className="inline text-muted-foreground">View saved session history with timestamps, connection details, and line counts.</dd></div>
                <div><dt className="font-medium inline"><Settings2 className="h-3 w-3 inline mr-0.5" />Settings</dt> — <dd className="inline text-muted-foreground">Terminal display settings: font size, buffer size, scrollback behavior, and ANSI color support.</dd></div>
              </dl>
            </div>

            {/* Sessions */}
            <div>
              <h4 className="font-semibold text-xs uppercase text-muted-foreground mb-2.5">Sessions</h4>
              <dl className="space-y-2.5 text-xs">
                <div><dt className="font-medium inline"><Plus className="h-3 w-3 inline mr-0.5" />New Session</dt> — <dd className="inline text-muted-foreground">Open a new terminal tab. Each session has its own connection and buffer.</dd></div>
                <div><dt className="font-medium inline"><X className="h-3 w-3 inline mr-0.5" />Close Tab</dt> — <dd className="inline text-muted-foreground">Close a session tab. Disconnects if active. At least one session always remains.</dd></div>
              </dl>
            </div>

            {/* Status Bar */}
            <div>
              <h4 className="font-semibold text-xs uppercase text-muted-foreground mb-2.5">Status Bar</h4>
              <p className="text-xs text-muted-foreground">
                The bottom bar shows connection state, host/port or serial settings, baud rate, line ending, connection duration, buffer line count, and active indicators for LOG, PAUSED, and NOTES.
              </p>
            </div>

            {/* Tips */}
            <div>
              <h4 className="font-semibold text-xs uppercase text-muted-foreground mb-2.5">Tips</h4>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                <li>Use <kbd className="px-1 py-0.5 rounded border bg-muted font-mono text-[10px]">↑</kbd> / <kbd className="px-1 py-0.5 rounded border bg-muted font-mono text-[10px]">↓</kbd> arrow keys to recall previous commands.</li>
                <li>Save connection profiles to quickly switch between BAS controllers.</li>
                <li>Enable logging before connecting to capture the full session.</li>
                <li>Use snippets to store and reuse common BACnet, Modbus, or Niagara commands.</li>
                <li>Attach session logs to projects for documentation and commissioning records.</li>
                <li>Live connections require the BAU Suite desktop app. Browser mode supports local logging only.</li>
              </ul>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
