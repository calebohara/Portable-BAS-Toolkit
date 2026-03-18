'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Palette, HardDrive, Info, Trash2, Download, PlayCircle, LogOut,
  Cloud, Upload, AlertTriangle, Monitor, KeyRound, Mail, Database,
  RefreshCw, ChevronRight, Camera, Loader2, ShieldCheck, UserCheck, UserX,
  Crown, ExternalLink,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/top-bar';
import { ThemeSwitcher } from '@/components/theme/theme-switcher';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { BackupDialog } from '@/components/settings/backup-dialog';
import { RestoreDialog } from '@/components/settings/restore-dialog';
import { DataCleanupDialog } from '@/components/settings/data-cleanup-dialog';
import { ChangePasswordDialog } from '@/components/settings/change-password-dialog';
import { ChangeEmailDialog } from '@/components/settings/change-email-dialog';
import { DeleteAccountDialog } from '@/components/settings/delete-account-dialog';
import { AvatarCropDialog } from '@/components/settings/avatar-crop-dialog';
import { BugReportsPanel } from '@/components/settings/bug-reports-panel';
import { UpgradeCTA } from '@/components/settings/upgrade-cta';
import { hasSyncAccess, isPaywallEnabled } from '@/lib/paywall';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/providers/auth-provider';
import { useSyncContext } from '@/providers/sync-provider';
import { getStorageEstimate, clearFileCache, resetFailedSyncItems, getFirstSyncError } from '@/lib/db';
import { formatFileSize } from '@/components/shared/file-icon';
import { APP_VERSION } from '@/lib/version';
import { useDeviceClass } from '@/hooks/use-device-class';
import { isTauri } from '@/lib/tauri-bridge';
import { toast } from 'sonner';

/* ─── Helpers ─────────────────────────────────────────────── */

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
      {children}
    </h2>
  );
}

/** A premium action card for settings controls. */
function ActionCard({
  icon: Icon,
  iconColor = 'text-primary',
  iconBg = 'bg-primary/10',
  title,
  description,
  children,
  className = '',
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  iconBg?: string;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
            {children}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Admin Approval Panel ────────────────────────────────── */

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
function AdminApprovalPanel({ session, currentUserRole }: { session: { access_token: string } | null; currentUserRole?: string }) {
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

/* ─── Page ────────────────────────────────────────────────── */

export default function SettingsPage() {
  const router = useRouter();
  const { mode, user, session, profile, signOut, updatePassword, updateEmail, updateProfile } = useAuth();
  const { triggerFullSync, triggerPullSync } = useSyncContext();
  const syncStatus = useAppStore((s) => s.syncStatus);
  const pendingSyncCount = useAppStore((s) => s.pendingSyncCount);
  const lastSyncedAt = useAppStore((s) => s.lastSyncedAt);
  const lastPulledAt = useAppStore((s) => s.lastPulledAt);
  const [storage, setStorage] = useState({ used: 0, quota: 0 });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const startTour = useAppStore((s) => s.startTour);
  const { isWindowsDesktopWeb, isTauriRuntime } = useDeviceClass();

  // Profile editing state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [showAvatarDialog, setShowAvatarDialog] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  // Initialize name fields from profile
  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName);
      setLastName(profile.lastName);
      setAvatarLoadFailed(false); // Reset on profile change (e.g. after upload)
    }
  }, [profile]);

  useEffect(() => {
    getStorageEstimate().then(setStorage).catch(() => {});
  }, []);

  const storagePercent = storage.quota > 0 ? (storage.used / storage.quota) * 100 : 0;

  const handleClearCache = async () => {
    const count = await clearFileCache();
    toast.success(`Cleared ${count} cached file(s)`);
    getStorageEstimate().then(setStorage).catch(() => {});
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    const { error } = await updateProfile({ firstName, lastName });
    if (error) {
      toast.error('Failed to save profile: ' + error);
    } else {
      toast.success('Profile updated');
    }
    setSavingProfile(false);
  };

  const handleAvatarUpload = async (croppedBlob: Blob) => {
    if (!user) throw new Error('Not authenticated');

    const { getSupabaseClient } = await import('@/lib/supabase/client');
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase is not configured');

    const path = `${user.id}/avatar.png`;

    // Upload to Supabase Storage
    const { error: uploadError } = await client.storage
      .from('avatars')
      .upload(path, croppedBlob, { upsert: true, contentType: 'image/png' });

    if (uploadError) throw new Error(uploadError.message);

    // Get public URL
    const { data: { publicUrl } } = client.storage
      .from('avatars')
      .getPublicUrl(path);

    // Add cache-buster to force refresh
    const avatarUrl = `${publicUrl}?t=${Date.now()}`;
    const { error: profileError } = await updateProfile({ avatarUrl });
    if (profileError) throw new Error(profileError);
  };

  const profileInitials = (() => {
    if (firstName || lastName) {
      return [firstName?.[0], lastName?.[0]].filter(Boolean).join('').toUpperCase();
    }
    return user?.email?.slice(0, 2).toUpperCase() ?? '??';
  })();

  const syncStatusLabel = (() => {
    switch (syncStatus) {
      case 'idle': return 'Up to date';
      case 'syncing': return 'Syncing…';
      case 'error': return 'Sync errors';
      case 'offline': return 'Offline';
      case 'disabled': return 'Disabled';
      default: return '';
    }
  })();

  return (
    <>
      <TopBar title="Settings" />
      <div className="p-4 md:p-6 space-y-8 max-w-3xl">

        {/* ═══════════════════════════════════════════════════════════
            ACCOUNT
        ═══════════════════════════════════════════════════════════ */}
        {mode === 'authenticated' && (
          <section>
            <SectionHeading>Account</SectionHeading>
            <div className="space-y-3">
              {/* Profile card */}
              <Card>
                <CardContent className="p-5 space-y-5">
                  {/* Header row: avatar + email + sign out */}
                  <div className="flex items-center gap-4">
                    {/* Avatar with crop dialog */}
                    <div className="relative group">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 overflow-hidden">
                        {profile?.avatarUrl && !avatarLoadFailed ? (
                          <img
                            src={profile.avatarUrl}
                            alt=""
                            className="h-14 w-14 rounded-full object-cover"
                            onError={() => setAvatarLoadFailed(true)}
                            onLoad={() => setAvatarLoadFailed(false)}
                          />
                        ) : (
                          <span className="text-lg font-semibold text-primary">{profileInitials}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label="Change avatar"
                        onClick={() => setShowAvatarDialog(true)}
                        className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <Camera className="h-5 w-5 text-white" />
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {profile?.displayName || user?.email}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                      <p className="text-[10px] text-muted-foreground/60">Signed in · Synced to cloud</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 shrink-0"
                      onClick={async () => { await signOut(); }}
                    >
                      <LogOut className="h-3.5 w-3.5" /> Sign Out
                    </Button>
                  </div>

                  <Separator />

                  {/* Subscription Tier Badge & Management */}
                  {isPaywallEnabled() && (
                    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                          profile?.subscriptionTier === 'team' ? 'bg-blue-500/10' :
                          profile?.subscriptionTier === 'pro' ? 'bg-primary/10' :
                          'bg-muted'
                        }`}>
                          <Crown className={`h-4 w-4 ${
                            profile?.subscriptionTier === 'team' ? 'text-blue-500' :
                            profile?.subscriptionTier === 'pro' ? 'text-primary' :
                            'text-muted-foreground'
                          }`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">
                              {profile?.subscriptionTier === 'team' ? 'Team' :
                               profile?.subscriptionTier === 'pro' ? 'Pro' : 'Free'} Plan
                            </p>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              profile?.subscriptionTier === 'team' ? 'bg-blue-500/15 text-blue-500 border border-blue-500/25' :
                              profile?.subscriptionTier === 'pro' ? 'bg-primary/15 text-primary border border-primary/25' :
                              'bg-muted text-muted-foreground border border-border'
                            }`}>
                              {profile?.subscriptionTier === 'free' ? 'FREE' : profile?.subscriptionTier?.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {profile?.subscriptionTier === 'free'
                              ? 'Local-only — upgrade for cloud sync'
                              : profile?.subscriptionExpiresAt
                                ? `Renews ${new Date(profile.subscriptionExpiresAt).toLocaleDateString()}`
                                : 'Active subscription'}
                          </p>
                        </div>
                      </div>
                      {profile?.subscriptionTier !== 'free' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-xs shrink-0"
                          onClick={async () => {
                            try {
                              const res = await fetch('/api/subscribe/portal', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ stripeCustomerId: '' }),
                              });
                              const data = await res.json();
                              if (data.url) window.location.href = data.url;
                              else toast.error(data.error || 'Unable to open portal');
                            } catch { toast.error('Failed to open subscription portal'); }
                          }}
                        >
                          <ExternalLink className="h-3 w-3" /> Manage
                        </Button>
                      )}
                    </div>
                  )}

                  <Separator />

                  {/* Name fields */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Profile</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="firstName" className="text-xs">First Name</Label>
                        <Input
                          id="firstName"
                          placeholder="First name"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="lastName" className="text-xs">Last Name</Label>
                        <Input
                          id="lastName"
                          placeholder="Last name"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground">
                        Your name is visible to other members in Global Projects.
                      </p>
                      <Button
                        size="sm"
                        className="gap-1.5"
                        disabled={savingProfile || (firstName === (profile?.firstName ?? '') && lastName === (profile?.lastName ?? ''))}
                        onClick={handleSaveProfile}
                      >
                        {savingProfile && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Save
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Change Password */}
              <Card className="transition-colors hover:border-primary/30 cursor-pointer" role="button" tabIndex={0} onClick={() => setShowPasswordDialog(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowPasswordDialog(true); } }}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <KeyRound className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Change Password</p>
                    <p className="text-xs text-muted-foreground">Update your sign-in password</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>

              {/* Change Email */}
              <Card className="transition-colors hover:border-primary/30 cursor-pointer" role="button" tabIndex={0} onClick={() => setShowEmailDialog(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowEmailDialog(true); } }}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Mail className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Change Email</p>
                    <p className="text-xs text-muted-foreground">Update your email address</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>

              {/* Delete Account */}
              <Card className="border-destructive/30 transition-colors hover:border-destructive/50 cursor-pointer" role="button" tabIndex={0} onClick={() => setShowDeleteDialog(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowDeleteDialog(true); } }}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                    <Trash2 className="h-4.5 w-4.5 text-destructive" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-destructive">Delete Account</p>
                    <p className="text-xs text-muted-foreground">Permanently delete your account and all data</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════
            ADMIN — ACCOUNT APPROVAL
        ═══════════════════════════════════════════════════════════ */}
        {mode === 'authenticated' && profile?.role === 'admin' && (
          <AdminApprovalPanel session={session} currentUserRole={profile?.role} />
        )}

        {/* ═══════════════════════════════════════════════════════════
            BUG REPORTS (Admin View)
        ═══════════════════════════════════════════════════════════ */}
        {mode === 'authenticated' && profile?.role === 'admin' && (
          <section>
            <SectionHeading>Bug Reports</SectionHeading>
            <Card>
              <CardContent className="p-5">
                <BugReportsPanel />
              </CardContent>
            </Card>
          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════
            CLOUD & SYNC
        ═══════════════════════════════════════════════════════════ */}
        {mode === 'authenticated' && isPaywallEnabled() && !hasSyncAccess(profile?.subscriptionTier) && (
          <section>
            <SectionHeading>Cloud & Sync</SectionHeading>
            <UpgradeCTA currentTier={profile?.subscriptionTier ?? 'free'} />
          </section>
        )}

        {mode === 'authenticated' && (!isPaywallEnabled() || hasSyncAccess(profile?.subscriptionTier)) && (
          <section>
            <SectionHeading>Cloud & Sync</SectionHeading>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Cloud Backup */}
              <ActionCard
                icon={Cloud}
                iconColor="text-primary"
                iconBg="bg-primary/10"
                title="Cloud Backup"
                description={lastSyncedAt
                  ? `Last backed up ${new Date(lastSyncedAt).toLocaleString()}`
                  : 'Back up all eligible local data to the cloud.'}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${
                      syncStatus === 'idle' ? 'bg-field-success' :
                      syncStatus === 'syncing' ? 'bg-primary animate-pulse' :
                      syncStatus === 'error' ? 'bg-field-warning' :
                      'bg-muted-foreground'
                    }`} />
                    <span className="text-xs text-muted-foreground">{syncStatusLabel}</span>
                    {pendingSyncCount > 0 && (
                      <span className="text-xs text-field-warning">· {pendingSyncCount} pending</span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={syncStatus === 'offline'}
                    onClick={() => setShowBackupDialog(true)}
                  >
                    <Upload className="h-3.5 w-3.5" /> Back Up
                  </Button>
                </div>
                {syncStatus === 'error' && pendingSyncCount > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-field-warning/10 border border-field-warning/20 px-3 py-2">
                    <div className="flex items-center gap-2 text-xs text-field-warning">
                      <AlertTriangle className="h-3 w-3" />
                      <span>{pendingSyncCount} failed</span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={async () => {
                          const err = await getFirstSyncError();
                          if (err) toast.error(err, { duration: 10000 });
                          else toast.info('No error details available');
                        }}
                      >
                        Details
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={async () => {
                          const count = await resetFailedSyncItems();
                          toast.success(`Reset ${count} failed item(s) for retry`);
                        }}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" /> Retry
                      </Button>
                    </div>
                  </div>
                )}
              </ActionCard>

              {/* Restore from Cloud */}
              <ActionCard
                icon={Download}
                iconColor="text-blue-600 dark:text-blue-400"
                iconBg="bg-blue-500/10"
                title="Restore from Cloud"
                description={lastPulledAt
                  ? `Last restored ${new Date(lastPulledAt).toLocaleString()}`
                  : 'Download cloud data to this device.'}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Overwrites matching local records with cloud versions.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 shrink-0"
                    disabled={syncStatus === 'offline'}
                    onClick={() => setShowRestoreDialog(true)}
                  >
                    <Download className="h-3.5 w-3.5" /> Restore
                  </Button>
                </div>
              </ActionCard>
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════
            PREFERENCES & STORAGE
        ═══════════════════════════════════════════════════════════ */}
        <section>
          <SectionHeading>Preferences & Storage</SectionHeading>
          <div className="space-y-4">
            {/* Theme */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                      <Palette className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">Theme</h3>
                      <p className="text-xs text-muted-foreground">Choose your preferred appearance</p>
                    </div>
                  </div>
                  <ThemeSwitcher />
                </div>
              </CardContent>
            </Card>

            {/* Storage Usage */}
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <HardDrive className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold">Offline Storage</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatFileSize(storage.used)} of {formatFileSize(storage.quota)} used
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Progress value={storagePercent} className="h-2" />
                      <p className="text-[11px] text-muted-foreground">{storagePercent.toFixed(1)}% of available storage</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Storage Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Clear File Cache */}
              <ActionCard
                icon={Trash2}
                iconColor="text-muted-foreground"
                iconBg="bg-muted"
                title="Clear File Cache"
                description="Remove cached file previews and offline copies. Project data and notes are preserved."
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowClearConfirm(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear Cache
                </Button>
              </ActionCard>

              {/* Clean Up Local Data */}
              <ActionCard
                icon={Database}
                iconColor="text-amber-600 dark:text-amber-400"
                iconBg="bg-amber-500/10"
                title="Clean Up Local Data"
                description="Select and remove unwanted projects and all their associated data from this browser."
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowCleanupDialog(true)}
                >
                  <Database className="h-3.5 w-3.5" /> Clean Up
                </Button>
              </ActionCard>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════
            HELP & ABOUT
        ═══════════════════════════════════════════════════════════ */}
        <section>
          <SectionHeading>Help & About</SectionHeading>
          <Card>
            <CardContent className="p-5 space-y-4">
              {/* Guided Tour */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <PlayCircle className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Guided Tour</p>
                    <p className="text-xs text-muted-foreground">Walk through the key features of BAU Suite.</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={startTour} className="gap-1.5">
                  <PlayCircle className="h-3.5 w-3.5" /> Replay
                </Button>
              </div>

              {/* Desktop App — only shown on desktop web, not in Tauri or on phones */}
              {isWindowsDesktopWeb && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Monitor className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Desktop App</p>
                        <p className="text-xs text-muted-foreground">Native Windows app with full network access and ICMP ping.</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => router.push('/desktop')} className="gap-1.5">
                      <Monitor className="h-3.5 w-3.5" /> Learn More
                    </Button>
                  </div>
                </>
              )}

              {isTauriRuntime && (
                <>
                  <Separator />
                  <div className="flex items-center gap-3">
                    <Monitor className="h-4 w-4 text-primary shrink-0" />
                    <p className="text-sm text-muted-foreground">
                      You&apos;re using the <strong className="text-foreground">desktop app</strong>.
                    </p>
                  </div>
                </>
              )}

              {/* Install as PWA */}
              {!isTauriRuntime && (
                <>
                  <Separator />
                  <div className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground space-y-2">
                    <p className="font-medium text-foreground flex items-center gap-2">
                      <Download className="h-4 w-4" /> Install as App
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-xs">
                      <li>Open this page in Chrome, Edge, or Safari</li>
                      <li>Look for the install icon in the address bar or browser menu</li>
                      <li>Click &ldquo;Install&rdquo; or &ldquo;Add to Home Screen&rdquo;</li>
                    </ol>
                    <p className="text-xs">Once installed, the app works offline and opens like a native application.</p>
                  </div>
                </>
              )}

              <Separator />

              {/* About */}
              <div className="flex items-center gap-3">
                <Info className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="text-sm text-muted-foreground">
                  <p><strong className="text-foreground">BAU Suite</strong> — Portable Project Toolkit · v{APP_VERSION}</p>
                  <p className="text-xs">Offline-first. Fast. Field-ready.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Danger Zone removed — Delete Account is now in the Account section above */}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          DIALOGS
      ═══════════════════════════════════════════════════════════ */}
      <ConfirmDialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title="Clear File Cache"
        description="All cached file previews will be removed. Your project data and notes are preserved."
        confirmLabel="Clear Cache"
        variant="destructive"
        onConfirm={handleClearCache}
      />

      <BackupDialog
        open={showBackupDialog}
        onOpenChange={setShowBackupDialog}
        lastSyncedAt={lastSyncedAt}
        triggerFullSync={triggerFullSync}
      />

      <RestoreDialog
        open={showRestoreDialog}
        onOpenChange={setShowRestoreDialog}
        lastPulledAt={lastPulledAt}
        triggerPullSync={triggerPullSync}
      />

      <DataCleanupDialog
        open={showCleanupDialog}
        onOpenChange={setShowCleanupDialog}
      />

      <ChangePasswordDialog
        open={showPasswordDialog}
        onOpenChange={setShowPasswordDialog}
        updatePassword={updatePassword}
      />

      <ChangeEmailDialog
        open={showEmailDialog}
        onOpenChange={setShowEmailDialog}
        currentEmail={user?.email ?? ''}
        updateEmail={updateEmail}
      />

      <DeleteAccountDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        userEmail={user?.email ?? ''}
        accessToken={session?.access_token}
        onDeleted={signOut}
      />

      <AvatarCropDialog
        open={showAvatarDialog}
        onOpenChange={setShowAvatarDialog}
        onUpload={handleAvatarUpload}
        currentAvatarUrl={profile?.avatarUrl}
        initials={profileInitials}
      />
    </>
  );
}
