'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, RefreshCw, Loader2, UserCheck, UserX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { SectionHeading } from './section-heading';
import { isTauri } from '@/lib/tauri-bridge';
import { toast } from 'sonner';

interface PendingUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  approved: boolean;
  created_at: string;
}

// NOTE: In Tauri mode, queries use the anon-key client. RLS policies on the
// `profiles` table MUST restrict SELECT and UPDATE to users whose own
// profile.role = 'admin'. The client-side role check below is defense-in-depth.
export function AdminApprovalPanel({ session, currentUserRole }: { session: { access_token: string } | null; currentUserRole?: string }) {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [denyTarget, setDenyTarget] = useState<{ id: string; email: string } | null>(null);
  const isDesktop = isTauri();

  const fetchUsers = useCallback(async () => {
    if (!session) return;
    if (currentUserRole !== 'admin') return;
    setLoading(true);
    try {
      if (isDesktop) {
        // Desktop (Tauri): use direct Supabase client queries
        const { getSupabaseClient } = await import('@/lib/supabase/client');
        const client = getSupabaseClient();
        if (!client) return;
        const { data, error } = await client
          .from('profiles')
          .select('id, email, first_name, last_name, display_name, avatar_url, role, approved, created_at')
          .order('created_at', { ascending: false });
        if (!error && data) setUsers(data as PendingUser[]);
      } else {
        // Web: use API route (server-side service role key)
        const res = await fetch('/api/admin/users', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUsers(data.users ?? []);
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [session, isDesktop, currentUserRole]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleApproval = async (userId: string, approved: boolean) => {
    if (!session) return;
    setUpdating(userId);
    try {
      if (isDesktop) {
        // Desktop (Tauri): update profile directly via Supabase client
        const { getSupabaseClient } = await import('@/lib/supabase/client');
        const client = getSupabaseClient();
        if (!client) { toast.error('Supabase not configured'); return; }
        const { error } = await client
          .from('profiles')
          .update({ approved })
          .eq('id', userId);
        if (error) {
          toast.error(error.message);
        } else {
          toast.success(approved ? 'User approved' : 'User approval revoked');
          await fetchUsers();
        }
      } else {
        // Web: use API route
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ userId, approved }),
        });
        if (res.ok) {
          toast.success(approved ? 'User approved' : 'User approval revoked');
          await fetchUsers();
        } else {
          const data = await res.json();
          toast.error(data.error || 'Failed to update user');
        }
      }
    } catch {
      toast.error('Failed to update user');
    } finally {
      setUpdating(null);
    }
  };

  const handleDeny = (userId: string, email: string) => {
    if (!session) return;
    if (isDesktop) {
      toast.error('Deny & delete requires the web app (needs server-side admin privileges).');
      return;
    }
    setDenyTarget({ id: userId, email });
  };

  const executeDeny = async () => {
    if (!session || !denyTarget) return;
    setUpdating(denyTarget.id);
    try {
      const res = await fetch(`/api/admin/users?userId=${denyTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        toast.success('User denied and removed');
        await fetchUsers();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to deny user');
      }
    } catch {
      toast.error('Failed to deny user');
    } finally {
      setUpdating(null);
    }
  };

  const pendingUsers = users.filter((u) => !u.approved);
  const approvedUsers = users.filter((u) => u.approved);

  return (
    <section>
      <SectionHeading>Admin — Account Approval</SectionHeading>
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
                <ShieldCheck className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">User Approval</h3>
                <p className="text-xs text-muted-foreground">
                  {pendingUsers.length === 0
                    ? 'No pending accounts'
                    : `${pendingUsers.length} account${pendingUsers.length > 1 ? 's' : ''} awaiting approval`}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchUsers} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Pending Users */}
              {pendingUsers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-amber-500 uppercase tracking-wider">Pending</p>
                  {pendingUsers.map((u) => (
                    <div key={u.id} className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 overflow-hidden text-xs font-semibold text-primary">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          (u.first_name?.[0] || u.email?.[0] || '?').toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {u.display_name || u.email}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {u.email} · Signed up {new Date(u.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          className="gap-1.5"
                          disabled={updating === u.id}
                          onClick={() => handleApproval(u.id, true)}
                        >
                          {updating === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                          Approve
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-muted-foreground hover:text-destructive"
                          disabled={updating === u.id}
                          onClick={() => handleDeny(u.id, u.email)}
                        >
                          <UserX className="h-3.5 w-3.5" />
                          Deny
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Approved Users */}
              {approvedUsers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Approved ({approvedUsers.length})
                  </p>
                  {approvedUsers.map((u) => (
                    <div key={u.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 overflow-hidden text-xs font-semibold text-primary">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          (u.first_name?.[0] || u.email?.[0] || '?').toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {u.display_name || u.email}
                          {u.role === 'admin' && (
                            <span className="ml-1.5 text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">ADMIN</span>
                          )}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                      </div>
                      {u.role !== 'admin' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 shrink-0 text-muted-foreground hover:text-destructive"
                          disabled={updating === u.id}
                          onClick={() => handleApproval(u.id, false)}
                        >
                          <UserX className="h-3.5 w-3.5" />
                          Revoke
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={denyTarget !== null}
        onOpenChange={(open) => { if (!open) setDenyTarget(null); }}
        title="Deny & Delete User"
        description={`Permanently deny and delete ${denyTarget?.email ?? ''}? This cannot be undone.`}
        confirmLabel="Deny & Delete"
        variant="destructive"
        onConfirm={executeDeny}
      />
    </section>
  );
}
