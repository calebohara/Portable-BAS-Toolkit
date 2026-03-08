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
export function buildUrl(ep: Pick<WebEndpoint, 'protocol' | 'host' | 'port' | 'path'>): string {
  const defaultPort = ep.protocol === 'https' ? '443' : '80';
  const portStr = ep.port && ep.port !== defaultPort ? `:${ep.port}` : '';
  const pathStr = ep.path ? (ep.path.startsWith('/') ? ep.path : `/${ep.path}`) : '';
  return `${ep.protocol}://${ep.host}${portStr}${pathStr}`;
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
        // Don't persist active workspace state
      }),
    }
  )
);
