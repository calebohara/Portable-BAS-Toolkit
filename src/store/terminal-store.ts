'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Types ──────────────────────────────────────────────────
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
export type BaudRate = 9600 | 19200 | 38400 | 57600 | 115200;
export type LineEnding = 'crlf' | 'cr' | 'lf';

export const BAUD_RATES: BaudRate[] = [9600, 19200, 38400, 57600, 115200];
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
  host: string;
  port: number;
  baudRate: BaudRate;
  lineEnding: LineEnding;
  localEcho: boolean;
  lineMode: boolean;
  connectionState: ConnectionState;
  errorMessage: string;
  buffer: TerminalLine[];
  paused: boolean;
  logging: boolean;
  startedAt: string;
  endedAt: string;
}

export interface SessionHistoryEntry {
  host: string;
  port: number;
  baudRate: BaudRate;
  lineEnding?: LineEnding;
  label: string;
  lastConnected: string;
}

// ─── Settings ───────────────────────────────────────────────
export interface TerminalSettings {
  defaultBaudRate: BaudRate;
  defaultLineEnding: LineEnding;
  defaultBufferSize: BufferSize;
  autoLogging: boolean;
}

// ─── Store ──────────────────────────────────────────────────
interface TerminalStore {
  // Sessions
  sessions: TerminalSession[];
  activeSessionId: string;
  setActiveSession: (id: string) => void;

  // Session management
  createSession: (opts?: { host?: string; port?: number; baudRate?: BaudRate; lineEnding?: LineEnding; label?: string }) => string;
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

function makeSession(opts?: { host?: string; port?: number; baudRate?: BaudRate; lineEnding?: LineEnding; label?: string }): TerminalSession {
  return {
    id: crypto.randomUUID(),
    label: opts?.label || 'New Session',
    host: opts?.host || '',
    port: opts?.port || 23,
    baudRate: opts?.baudRate || 9600,
    lineEnding: opts?.lineEnding || 'crlf',
    localEcho: false, // Server-side echo by default (standard telnet)
    lineMode: true,
    connectionState: 'disconnected',
    errorMessage: '',
    buffer: [],
    paused: false,
    logging: true,
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
          defaultBaudRate: 9600,
          defaultLineEnding: 'crlf' as LineEnding,
          defaultBufferSize: 1000,
          autoLogging: true,
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
    }
  )
);
