import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase browser client singleton.
 *
 * Returns null when environment variables are not configured.
 * This allows the app to run in local-only mode without Supabase.
 */

let _client: SupabaseClient | null = null;
let _checked = false;

export function getSupabaseClient(): SupabaseClient | null {
  if (_checked) return _client;
  _checked = true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    if (process.env.NODE_ENV === 'development') {
      console.info(
        '[supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not set. ' +
        'Running in local-only mode (no auth, no cloud sync).'
      );
    }
    return null;
  }

  _client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Use localStorage for session persistence (works in both web and Tauri)
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  });

  return _client;
}

/** Check if Supabase is configured (env vars present). */
export function isSupabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
