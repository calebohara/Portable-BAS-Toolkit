'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Types ──────────────────────────────────────────────────
export type Protocol = 'http' | 'https';
export type OpenMode = 'auto' | 'embedded' | 'new-tab';
export type EmbedSupport = 'unknown' | 'supported' | 'blocked';

export interface WebEndpoint {
  id: string;
  friendlyName: string;
  host: string;
  protocol: Protocol;
  port: string;
  path: string;
  projectId: string;
  panelName: string;
  systemName: string;
  notes: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  preferredOpenMode: OpenMode;
  favorite: boolean;
  lastKnownEmbedSupport: EmbedSupport;
}

export interface RecentConnection {
  id: string;
  endpointId: string;
  fullUrl: string;
  friendlyName: string;
  openedAt: string;
  openMode: OpenMode;
  projectId: string;
}

// ─── Helpers ────────────────────────────────────────────────

/** Validate that a host string is safe (no protocol injection, no script vectors) */
export function isValidHost(host: string): boolean {
  const trimmed = host.trim();
  if (!trimmed) return false;
  // Block protocol-like patterns in host field
  if (/^[a-z]+:/i.test(trimmed)) return false;
  // Block characters that could break URL parsing or enable injection
  if (/[<>"'`{}|\\^~\[\]]/.test(trimmed)) return false;
  // Block javascript-like content
  if (/javascript|data:|vbscript|blob:/i.test(trimmed)) return false;
  return true;
}

/** Validate a port string is a valid port number */
export function isValidPort(port: string): boolean {
  if (!port) return true; // empty = default
  const n = Number(port);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

/** Sanitize a URL path component */
function sanitizePath(path: string): string {
  // Remove any protocol-like patterns from path
  return path.replace(/[<>"'`]/g, '');
}

/** Build a URL from endpoint fields. Only allows http/https protocols. */
export function buildUrl(ep: Pick<WebEndpoint, 'protocol' | 'host' | 'port' | 'path'>): string {
  // Enforce only http/https at runtime
  const safeProtocol = ep.protocol === 'https' ? 'https' : 'http';
  const defaultPort = safeProtocol === 'https' ? '443' : '80';
  const portStr = ep.port && ep.port !== defaultPort ? `:${ep.port}` : '';
  const rawPath = ep.path ? sanitizePath(ep.path) : '';
  const pathStr = rawPath ? (rawPath.startsWith('/') ? rawPath : `/${rawPath}`) : '';
  return `${safeProtocol}://${ep.host}${portStr}${pathStr}`;
}

/** Validate a fully-constructed URL is safe to open/embed */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// ─── Store ──────────────────────────────────────────────────
interface WebInterfaceStore {
  // Saved endpoints
  endpoints: WebEndpoint[];
  saveEndpoint: (ep: WebEndpoint) => void;
  updateEndpoint: (id: string, patch: Partial<WebEndpoint>) => void;
  removeEndpoint: (id: string) => void;
  toggleFavorite: (id: string) => void;

  // Recent connections
  recentConnections: RecentConnection[];
  addRecentConnection: (conn: Omit<RecentConnection, 'id'>) => void;
  clearRecentConnections: () => void;

  // Active workspace
  activeUrl: string;
  activeEndpointId: string;
  embedState: 'idle' | 'loading' | 'loaded' | 'blocked';
  setActiveUrl: (url: string, endpointId?: string) => void;
  setEmbedState: (state: 'idle' | 'loading' | 'loaded' | 'blocked') => void;
  clearWorkspace: () => void;
}

export const useWebInterfaceStore = create<WebInterfaceStore>()(
  persist(
    (set, get) => ({
      endpoints: [],

      saveEndpoint: (ep) => {
        set(s => {
          const existing = s.endpoints.findIndex(e => e.id === ep.id);
          if (existing >= 0) {
            const updated = [...s.endpoints];
            updated[existing] = ep;
            return { endpoints: updated };
          }
          return { endpoints: [ep, ...s.endpoints] };
        });
      },

      updateEndpoint: (id, patch) => {
        set(s => ({
          endpoints: s.endpoints.map(e =>
            e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e
          ),
        }));
      },

      removeEndpoint: (id) => {
        set(s => ({ endpoints: s.endpoints.filter(e => e.id !== id) }));
      },

      toggleFavorite: (id) => {
        set(s => ({
          endpoints: s.endpoints.map(e =>
            e.id === id ? { ...e, favorite: !e.favorite } : e
          ),
        }));
      },

      recentConnections: [],

      addRecentConnection: (conn) => {
        set(s => ({
          recentConnections: [
            { ...conn, id: crypto.randomUUID() },
            ...s.recentConnections.filter(r => r.fullUrl !== conn.fullUrl),
          ].slice(0, 30),
        }));
      },

      clearRecentConnections: () => set({ recentConnections: [] }),

      activeUrl: '',
      activeEndpointId: '',
      embedState: 'idle',

      setActiveUrl: (url, endpointId) => {
        set({ activeUrl: url, activeEndpointId: endpointId || '', embedState: url ? 'loading' : 'idle' });
      },

      setEmbedState: (state) => set({ embedState: state }),

      clearWorkspace: () => set({ activeUrl: '', activeEndpointId: '', embedState: 'idle' }),
    }),
    {
      name: 'bau-suite-web-interface',
      partialize: (state) => ({
        endpoints: state.endpoints,
        recentConnections: state.recentConnections,
        activeUrl: state.activeUrl,
        activeEndpointId: state.activeEndpointId,
        // embedState resets to 'loading' on rehydration so the iframe re-loads
        ...(state.activeUrl ? { embedState: 'loading' as const } : {}),
      }),
    }
  )
);
