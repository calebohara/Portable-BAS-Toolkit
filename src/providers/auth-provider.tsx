'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';

// ─── Types ──────────────────────────────────────────────────
export type AuthMode = 'local' | 'authenticated';

export interface AuthState {
  /** Current auth mode: 'local' (no Supabase / not signed in) or 'authenticated' */
  mode: AuthMode;
  /** Supabase user object, null when local or signed out */
  user: User | null;
  /** Supabase session, null when local or signed out */
  session: Session | null;
  /** True while initial session is being restored */
  loading: boolean;
  /** Whether Supabase environment is configured at all */
  isConfigured: boolean;
  /** Sign in with email + password */
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  /** Sign up with email + password */
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  /** Sign out */
  signOut: () => Promise<void>;
}

// ─── Context ────────────────────────────────────────────────
const AuthContext = createContext<AuthState | null>(null);

// ─── Provider ───────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const configured = isSupabaseConfigured();
  const client = configured ? getSupabaseClient() : null;

  // Restore session on mount + listen for auth changes
  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }

    // Get initial session
    client.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // Subscribe to auth state changes (sign in, sign out, token refresh)
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });

    return () => { subscription.unsubscribe(); };
  }, [client]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!client) return { error: { message: 'Supabase not configured', name: 'AuthError', status: 0 } as AuthError };
    const { error } = await client.auth.signInWithPassword({ email, password });
    return { error };
  }, [client]);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!client) return { error: { message: 'Supabase not configured', name: 'AuthError', status: 0 } as AuthError };
    const { error } = await client.auth.signUp({ email, password });
    return { error };
  }, [client]);

  const signOut = useCallback(async () => {
    if (!client) return;
    await client.auth.signOut();
    setUser(null);
    setSession(null);
  }, [client]);

  const mode: AuthMode = user ? 'authenticated' : 'local';

  return (
    <AuthContext.Provider value={{ mode, user, session, loading, isConfigured: configured, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
