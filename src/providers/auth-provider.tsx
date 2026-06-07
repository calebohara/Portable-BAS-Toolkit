'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';

// ─── Types ──────────────────────────────────────────────────
export type AuthMode = 'local' | 'authenticated';

export type SubscriptionTier = 'free' | 'pro' | 'team';

export interface UserProfile {
  firstName: string;
  lastName: string;
  displayName: string | null;
  avatarUrl: string | null;
  approved: boolean;
  role: 'user' | 'admin';
  subscriptionTier: SubscriptionTier;
  subscriptionExpiresAt: string | null;
}

export interface AuthState {
  /** Current auth mode: 'local' (no Supabase / not signed in) or 'authenticated' */
  mode: AuthMode;
  /** Supabase user object, null when local or signed out */
  user: User | null;
  /** Supabase session, null when local or signed out */
  session: Session | null;
  /** User profile data from profiles table */
  profile: UserProfile | null;
  /** True while initial session is being restored */
  loading: boolean;
  /** Whether Supabase environment is configured at all */
  isConfigured: boolean;
  /**
   * True only after Supabase fires a PASSWORD_RECOVERY auth event (i.e. the user
   * arrived via a valid reset link). The reset-password form gates on this so a
   * normally signed-in session can't change the password without the old one.
   */
  isPasswordRecovery: boolean;
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
  /** Update email (sends confirmation to new address) */
  updateEmail: (newEmail: string) => Promise<{ error: AuthError | null }>;
  /** Update profile (first name, last name, avatar) */
  updateProfile: (data: Partial<{ firstName: string; lastName: string; avatarUrl: string | null }>) => Promise<{ error: string | null }>;
  /** Refresh profile data from Supabase */
  refreshProfile: () => Promise<void>;
}

// ─── Not-configured error helper ────────────────────────────
const notConfiguredError = { message: 'Supabase not configured', name: 'AuthError', status: 0 } as AuthError;

// ─── Context ────────────────────────────────────────────────
const AuthContext = createContext<AuthState | null>(null);

// ─── Provider ───────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const client = configured ? getSupabaseClient() : null;

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // When there's no Supabase client there's nothing to restore, so start
  // un-loaded. This avoids a synchronous setLoading(false) inside the restore
  // effect (which would trigger a cascading render).
  const [loading, setLoading] = useState(() => client !== null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  // Fetch profile data from Supabase
  const fetchProfile = useCallback(async (userId: string) => {
    if (!client) return;
    try {
      // Try fetching with new columns first, fall back to display_name only
      let { data, error } = await client
        .from('profiles')
        .select('first_name, last_name, display_name, avatar_url, approved, role, subscription_tier, subscription_expires_at')
        .eq('id', userId)
        .single();

      let schemaFallback = false;
      if (error?.message?.includes('schema cache')) {
        // New columns not migrated yet — fetch only existing columns
        schemaFallback = true;
        const fallback = await client
          .from('profiles')
          .select('display_name')
          .eq('id', userId)
          .single();
        data = fallback.data as typeof data;
        error = fallback.error;
      }

      if (!error && data) {
        const d = data as Record<string, unknown>;
        setProfile({
          firstName: d.first_name as string ?? '',
          lastName: d.last_name as string ?? '',
          displayName: data.display_name ?? null,
          avatarUrl: d.avatar_url as string ?? null,
          // Default to approved=true when column doesn't exist (pre-migration)
          approved: schemaFallback ? true : ((d.approved as boolean) ?? true),
          role: (d.role as 'user' | 'admin') ?? 'user',
          subscriptionTier: (d.subscription_tier as SubscriptionTier) ?? 'free',
          subscriptionExpiresAt: (d.subscription_expires_at as string) ?? null,
        });
      }
    } catch {
      // Profile fetch is non-fatal
    }
  }, [client]);

  // Restore session on mount + listen for auth changes
  useEffect(() => {
    // No client → loading was initialized to false; nothing to restore.
    if (!client) return;

    // Get initial session
    client.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchProfile(s.user.id);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // Subscribe to auth state changes (sign in, sign out, token refresh, password recovery)
    const { data: { subscription } } = client.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchProfile(s.user.id);
      else setProfile(null);

      // PASSWORD_RECOVERY: the user landed via a valid reset link. Flag it so the
      // reset-password form unlocks. Any other event (normal SIGNED_IN, token
      // refresh, sign-out) clears the flag so an ordinary session can't reuse it.
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      } else if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false);
      }
    });

    return () => { subscription.unsubscribe(); };
  }, [client, fetchProfile]);

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
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    return { error };
  }, [client]);

  const signOut = useCallback(async () => {
    if (!client) return;
    await client.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
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
    if (!error) {
      // Recovery is single-use — clear the flag so the form re-locks.
      setIsPasswordRecovery(false);
      // Revoke every OTHER session (keep the current one signed in). If the
      // reset was triggered because credentials were compromised, this kicks
      // any attacker who still holds a stale session for this account.
      try {
        await client.auth.signOut({ scope: 'others' });
      } catch (revokeErr) {
        // Non-fatal: the password was still changed successfully.
        console.warn('[auth] Failed to revoke other sessions after password reset:', revokeErr);
      }
    }
    return { error };
  }, [client]);

  const updateEmail = useCallback(async (newEmail: string) => {
    if (!client) return { error: notConfiguredError };
    const { error } = await client.auth.updateUser({ email: newEmail });
    return { error };
  }, [client]);

  const updateProfile = useCallback(async (data: Partial<{ firstName: string; lastName: string; avatarUrl: string | null }>) => {
    if (!client || !user) return { error: 'Not authenticated' };
    try {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (data.firstName !== undefined) updates.first_name = data.firstName;
      if (data.lastName !== undefined) updates.last_name = data.lastName;
      if (data.avatarUrl !== undefined) updates.avatar_url = data.avatarUrl;

      // Build display_name from first + last
      const firstName = data.firstName ?? profile?.firstName ?? '';
      const lastName = data.lastName ?? profile?.lastName ?? '';
      const displayName = [firstName, lastName].filter(Boolean).join(' ') || null;
      updates.display_name = displayName;

      let { error } = await client
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      // Fallback: if new columns don't exist yet, try updating only display_name
      if (error?.message?.includes('schema cache')) {
        const fallback = await client
          .from('profiles')
          .update({ display_name: displayName, updated_at: new Date().toISOString() })
          .eq('id', user.id);
        error = fallback.error;
        if (error) return { error: 'Profile columns not yet migrated. Run the SQL migration in supabase/migrations/add-profile-name-avatar.sql' };
      }

      if (error) return { error: error.message };

      // Update local state
      setProfile((prev) => ({
        firstName: data.firstName ?? prev?.firstName ?? '',
        lastName: data.lastName ?? prev?.lastName ?? '',
        displayName,
        avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : (prev?.avatarUrl ?? null),
        approved: prev?.approved ?? true,
        role: prev?.role ?? 'user',
        subscriptionTier: prev?.subscriptionTier ?? 'free',
        subscriptionExpiresAt: prev?.subscriptionExpiresAt ?? null,
      }));

      return { error: null };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [client, user, profile]);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const mode: AuthMode = user ? 'authenticated' : 'local';

  return (
    <AuthContext.Provider value={{
      mode, user, session, profile, loading, isConfigured: configured,
      isPasswordRecovery,
      signIn, signUp, signOut, resetPassword, updatePassword, updateEmail,
      updateProfile, refreshProfile,
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
