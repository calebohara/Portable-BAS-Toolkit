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
  /** Send password reset email */
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  /** Update password (used after reset link callback) */
  updatePassword: (newPassword: string) => Promise<{ error: AuthError | null }>;
}

// ─── Not-configured error helper ────────────────────────────
const notConfiguredError = { message: 'Supabase not configured', name: 'AuthError', status: 0 } as AuthError;

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

    // Subscribe to auth state changes (sign in, sign out, token refresh, password recovery)
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });

    return () => { subscription.unsubscribe(); };
  }, [client]);

  // Bootstrap user profile on first sign-in (upsert to Supabase profiles table)
  useEffect(() => {
    if (!client || !user) return;

    // Fire-and-forget: ensure a profile row exists for this user.
    // Uses upsert with ON CONFLICT so it's idempotent.
    client
      .from('profiles')
      .upsert(
        {
          id: user.id,
          email: user.email ?? '',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .then(({ error }) => {
        if (error && process.env.NODE_ENV === 'development') {
          // Profile table may not exist yet — this is non-fatal.
          // It will succeed once the SQL schema is applied to Supabase.
          console.warn('[auth] Profile upsert failed (table may not exist yet):', error.message);
        }
      });
  }, [client, user]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!client) return { error: notConfiguredError };
    const { error } = await client.auth.signInWithPassword({ email, password });
    return { error };
  }, [client]);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!client) return { error: notConfiguredError };
    const { error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    return { error };
  }, [client]);

  const signOut = useCallback(async () => {
    if (!client) return;
    await client.auth.signOut();
    setUser(null);
    setSession(null);
  }, [client]);

  const resetPassword = useCallback(async (email: string) => {
    if (!client) return { error: notConfiguredError };
    const { error } = await client.auth.resetPasswordForEmail(email, {
      // Supabase will append the recovery token to this URL
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error };
  }, [client]);

  const updatePassword = useCallback(async (newPassword: string) => {
    if (!client) return { error: notConfiguredError };
    const { error } = await client.auth.updateUser({ password: newPassword });
    return { error };
  }, [client]);

  const mode: AuthMode = user ? 'authenticated' : 'local';

  return (
    <AuthContext.Provider value={{
      mode, user, session, loading, isConfigured: configured,
      signIn, signUp, signOut, resetPassword, updatePassword,
    }}>
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
