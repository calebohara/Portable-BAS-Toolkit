import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * GET /api/admin/users
 * Returns all profiles (admin only). Used for the approval panel.
 *
 * POST /api/admin/users
 * Approve or reject a user. Body: { userId, approved }
 */

async function verifyAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return null;

  // Check if this user is an admin
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') return null;

  return { user, admin };
}

export async function GET(request: Request) {
  const auth = await verifyAdmin(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized — admin access required' }, { status: 403 });
  }

  const { data, error } = await auth.admin
    .from('profiles')
    .select('id, email, first_name, last_name, display_name, avatar_url, role, approved, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data });
}

export async function POST(request: Request) {
  const auth = await verifyAdmin(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized — admin access required' }, { status: 403 });
  }

  const body = await request.json();
  const { userId, approved } = body;

  if (!userId || typeof approved !== 'boolean') {
    return NextResponse.json({ error: 'userId and approved (boolean) are required' }, { status: 400 });
  }

  const { error } = await auth.admin
    .from('profiles')
    .update({ approved })
    .eq('id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await verifyAdmin(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized — admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  // Prevent admin from deleting themselves
  if (userId === auth.user.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
  }

  // Delete from auth.users (cascades to profiles via FK)
  const { error } = await auth.admin.auth.admin.deleteUser(userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
