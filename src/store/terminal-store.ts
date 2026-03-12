'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Types ──────────────────────────────────────────────────
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
export type ConnectionMode = 'serial' | 'tcp';
export type BaudRate = 1200 | 2400 | 4800 | 9600 | 19200 | 38400 | 57600 | 115200;
export type DataBits = 5 | 6 | 7 | 8;
export type Parity = 'none' | 'odd' | 'even';
export type StopBits = '1' | '2';
export type LineEnding = 'crlf' | 'cr' | 'lf';

export const CONNECTION_MODES: { value: ConnectionMode; label: string }[] = [
  { value: 'serial', label: 'Serial (COM)' },
  { value: 'tcp', label: 'TCP / Telnet' },
];
export const DATA_BITS_OPTIONS: DataBits[] = [5, 6, 7, 8];
export const PARITY_OPTIONS: { value: Parity; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'odd', label: 'Odd' },
  { value: 'even', label: 'Even' },
];
export const STOP_BITS_OPTIONS: { value: StopBits; label: string }[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
];

export type FlowControl = 'none' | 'hardware' | 'software';
export const FLOW_CONTROL_OPTIONS: { value: FlowControl; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'hardware', label: 'Hardware (RTS/CTS)' },
  { value: 'software', label: 'Software (XON/XOFF)' },
];

export const BAUD_RATES: BaudRate[] = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];
export const LINE_ENDINGS: { value: LineEnding; label: string }[] = [
  { value: 'crlf', label: 'CR+LF (\\r\\n)' },
  { value: 'cr', label: 'CR (\\r)' },
  { value: 'lf', label: 'LF (\\n)' },
];
const MAX_BUFFER_LINES = 10000;
export const BUFFER_SIZES = [100, 500, 1000, 5000, 10000] as const;
export type BufferSize = typeof BUFFER_SIZES[number];

export interface TerminalLine {
  text: string;
  timestamp: string;
  type: 'input' | 'output' | 'system' | 'error';
}

export interface TerminalSession {
  id: string;
  label: string;
  connectionMode: ConnectionMode;
  // TCP fields
  host: string;
  port: number;
  // Serial fields
  serialPort: string;
  dataBits: DataBits;
  parity: Parity;
  stopBits: StopBits;
  flowControl: FlowControl;
  // Common fields
  baudRate: BaudRate;
  lineEnding: LineEnding;
  localEcho: boolean;
  lineMode: boolean;
  connectionState: ConnectionState;
  errorMessage: string;
  buffer: TerminalLine[];
  paused: boolean;
  logging: boolean;
  sessionNotes: string;
  startedAt: string;
  endedAt: string;
}

export interface SessionHistoryEntry {
  connectionMode?: ConnectionMode;
  host: string;
  port: number;
  serialPort?: string;
  baudRate: BaudRate;
  lineEnding?: LineEnding;
  label: string;
  lastConnected: string;
}

// ─── Settings ───────────────────────────────────────────────
export type FontSize = 10 | 11 | 12 | 13 | 14 | 16 | 18;
export const FONT_SIZES: FontSize[] = [10, 11, 12, 13, 14, 16, 18];

export interface TerminalSettings {
  defaultBaudRate: BaudRate;
  defaultLineEnding: LineEnding;
  defaultBufferSize: BufferSize;
  autoLogging: boolean;
  fontSize: FontSize;
}

// ─── Store ──────────────────────────────────────────────────
interface TerminalStore {
  // Sessions
  sessions: TerminalSession[];
  activeSessionId: string;
  setActiveSession: (id: string) => void;

  // Session management
  createSession: (opts?: { connectionMode?: ConnectionMode; host?: string; port?: number; serialPort?: string; baudRate?: BaudRate; lineEnding?: LineEnding; label?: string }) => string;
  removeSession: (id: string) => void;
  updateSession: (id: string, patch: Partial<TerminalSession>) => void;

  // Terminal actions
  appendLine: (sessionId: string, line: TerminalLine) => void;
  clearBuffer: (sessionId: string) => void;
  togglePause: (sessionId: string) => void;
  toggleLogging: (sessionId: string) => void;

  // Connection actions
  setConnectionState: (sessionId: string, state: ConnectionState, error?: string) => void;

  // History
  sessionHistory: SessionHistoryEntry[];
  addToHistory: (entry: Omit<SessionHistoryEntry, 'lastConnected'>) => void;
  clearHistory: () => void;

  // Settings
  settings: TerminalSettings;
  updateSettings: (patch: Partial<TerminalSettings>) => void;
}

function makeSession(opts?: { connectionMode?: ConnectionMode; host?: string; port?: number; serialPort?: string; baudRate?: BaudRate; lineEnding?: LineEnding; label?: string }): TerminalSession {
  return {
    id: crypto.randomUUID(),
    label: opts?.label || 'New Session',
    connectionMode: opts?.connectionMode || 'serial',
    host: opts?.host || '',
    port: opts?.port || 23,
    serialPort: opts?.serialPort || '',
    dataBits: 8,
    parity: 'none',
    stopBits: '1',
    flowControl: 'none',
    baudRate: opts?.baudRate || 115200,
    lineEnding: opts?.lineEnding || 'crlf',
    localEcho: false,
    lineMode: true,
    connectionState: 'disconnected',
    errorMessage: '',
    buffer: [],
    paused: false,
    logging: true,
    sessionNotes: '',
    startedAt: new Date().toISOString(),
    endedAt: '',
  };
}

export const useTerminalStore = create<TerminalStore>()(
  persist(
    (set, get) => {
      const defaultSession = makeSession();
      return {
        sessions: [defaultSession],
        activeSessionId: defaultSession.id,
        setActiveSession: (id) => set({ activeSessionId: id }),

        createSession: (opts) => {
          const session = makeSession(opts);
          set(s => ({
            sessions: [...s.sessions, session],
            activeSessionId: session.id,
          }));
          return session.id;
        },

        removeSession: (id) => {
          const { sessions, activeSessionId } = get();
          if (sessions.length <= 1) return;
          const idx = sessions.findIndex(s => s.id === id);
          const newSessions = sessions.filter(s => s.id !== id);
          let newActive = activeSessionId;
          if (activeSessionId === id) {
            newActive = newSessions[Math.min(idx, newSessions.length - 1)].id;
          }
          set({ sessions: newSessions, activeSessionId: newActive });
        },

        updateSession: (id, patch) => {
          set(s => ({
            sessions: s.sessions.map(sess =>
              sess.id === id ? { ...sess, ...patch } : sess
            ),
          }));
        },

        appendLine: (sessionId, line) => {
          const { settings } = get();
          set(s => ({
            sessions: s.sessions.map(sess => {
              if (sess.id !== sessionId || sess.paused) return sess;
              const buffer = [...sess.buffer, line];
              // Trim to buffer size (capped at MAX_BUFFER_LINES)
              const maxLines = Math.min(settings.defaultBufferSize, MAX_BUFFER_LINES);
              return {
                ...sess,
                buffer: buffer.length > maxLines ? buffer.slice(-maxLines) : buffer,
              };
            }),
          }));
        },

        clearBuffer: (sessionId) => {
          set(s => ({
            sessions: s.sessions.map(sess =>
              sess.id === sessionId ? { ...sess, buffer: [] } : sess
            ),
          }));
        },

        togglePause: (sessionId) => {
          set(s => ({
            sessions: s.sessions.map(sess =>
              sess.id === sessionId ? { ...sess, paused: !sess.paused } : sess
            ),
          }));
        },

        toggleLogging: (sessionId) => {
          set(s => ({
            sessions: s.sessions.map(sess =>
              sess.id === sessionId ? { ...sess, logging: !sess.logging } : sess
            ),
          }));
        },

        setConnectionState: (sessionId, state, error) => {
          set(s => ({
            sessions: s.sessions.map(sess =>
              sess.id === sessionId
                ? {
                    ...sess,
                    connectionState: state,
                    errorMessage: error || '',
                    ...(state === 'disconnected' ? { endedAt: new Date().toISOString() } : {}),
                    ...(state === 'connected' ? { startedAt: new Date().toISOString(), endedAt: '' } : {}),
                  }
                : sess
            ),
          }));
        },

        sessionHistory: [],
        addToHistory: (entry) => {
          set(s => {
            const filtered = s.sessionHistory.filter(
              h => !(h.host === entry.host && h.port === entry.port)
            );
            return {
              sessionHistory: [
                { ...entry, lastConnected: new Date().toISOString() },
                ...filtered,
              ].slice(0, 20),
            };
          });
        },
        clearHistory: () => set({ sessionHistory: [] }),

        settings: {
          defaultBaudRate: 115200,
          defaultLineEnding: 'crlf' as LineEnding,
          defaultBufferSize: 1000,
          autoLogging: true,
          fontSize: 12 as FontSize,
        },
        updateSettings: (patch) => {
          set(s => ({ settings: { ...s.settings, ...patch } }));
        },
      };
    },
    {
      name: 'bau-suite-terminal',
      partialize: (state) => ({
        sessions: state.sessions.map(s => ({
          ...s,
          // Reset live connection state — WebSocket can't survive navigation
          connectionState: 'disconnected' as ConnectionState,
          errorMessage: '',
          paused: false,
        })),
        activeSessionId: state.activeSessionId,
        sessionHistory: state.sessionHistory,
        settings: state.settings,
      }),
      // Migrate old persisted sessions that are missing newer fields
      merge: (persisted, current) => {
        const p = persisted as Partial<typeof current>;
        return {
          ...current,
          ...p,
          sessions: (p.sessions ?? current.sessions).map(s => ({
            ...s,
            connectionMode: s.connectionMode ?? 'serial' as ConnectionMode,
            serialPort: s.serialPort ?? '',
            dataBits: s.dataBits ?? (8 as DataBits),
            parity: s.parity ?? ('none' as Parity),
            stopBits: s.stopBits ?? ('1' as StopBits),
            flowControl: s.flowControl ?? ('none' as FlowControl),
            lineEnding: s.lineEnding ?? ('crlf' as LineEnding),
            localEcho: s.localEcho ?? false,
            lineMode: s.lineMode ?? true,
            sessionNotes: s.sessionNotes ?? '',
          })),
        };
      },
    }
  )
);
