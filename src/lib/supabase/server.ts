import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Create a Supabase admin client using the service role key.
 * This should ONLY be used in server-side API routes — never in client code.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
