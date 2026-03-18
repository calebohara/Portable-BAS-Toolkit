'use client';

import { useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';

/**
 * Redirects unauthenticated users to /login when Supabase is configured.
 *
 * When Supabase env vars are present (isConfigured=true), the user should
 * sign in to access the app. If they haven't signed in yet (mode='local'),
 * redirect to the login page.
 *
 * When Supabase is NOT configured (local-only mode), this hook does nothing —
 * the app functions fully offline without authentication.
 *
 * Uses window.location.href for Tauri static export compatibility.
 */
export function useAuthGate() {
  const { mode, loading, isConfigured } = useAuth();

  useEffect(() => {
    // Wait for auth to finish loading
    if (loading) return;

    // Only redirect if Supabase is configured but user isn't authenticated
    // When Supabase is NOT configured, the app runs in full local-only mode
    if (isConfigured && mode === 'local') {
      // Use window.location for Tauri compatibility (no router.push in static export)
      window.location.href = '/login';
    }
  }, [mode, loading, isConfigured]);

  return { loading, shouldShow: !loading && (!isConfigured || mode === 'authenticated') };
}
