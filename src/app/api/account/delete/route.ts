import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * POST /api/account/delete
 *
 * Deletes the authenticated user's cloud data, profile, and auth account.
 * Requires the user's access token in the Authorization header.
 * Uses the service role key server-side to perform admin deletion.
 */
export async function POST(request: Request) {
  // 1. Verify the caller is authenticated
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  // Create a client using the user's token to verify identity
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  // 2. Get admin client
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: 'Account deletion is not available — service role key not configured.' },
      { status: 503 },
    );
  }

  const userId = user.id;
  const errors: string[] = [];

  // 3. Delete user's cloud data from all synced tables
  const syncedTables = [
    'projects', 'files', 'notes', 'devices', 'ip_plan',
    'daily_reports', 'activity_log', 'network_diagrams',
    'command_snippets', 'ping_sessions', 'terminal_logs',
    'connection_profiles', 'register_calculations',
  ];

  for (const table of syncedTables) {
    const { error } = await admin.from(table).delete().eq('user_id', userId);
    if (error) errors.push(`${table}: ${error.message}`);
  }

  // 4. Delete user profile
  const { error: profileError } = await admin.from('profiles').delete().eq('id', userId);
  if (profileError) errors.push(`profiles: ${profileError.message}`);

  // 5. Delete the auth user (this is irreversible)
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return NextResponse.json(
      { error: `Failed to delete account: ${deleteError.message}`, dataErrors: errors },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    dataErrors: errors.length > 0 ? errors : undefined,
  });
}
