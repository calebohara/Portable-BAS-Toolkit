'use client';

import { useState, useEffect } from 'react';
import {
  Palette, HardDrive, Info, Trash2, Download, PlayCircle,
  Cloud, Upload, AlertTriangle, Monitor, KeyRound, Mail, Database,
  RefreshCw, Camera, Loader2, LogOut, Crown, ExternalLink,
  User, Settings2, Shield,
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
import { ActionCard } from '@/components/settings/section-heading';
import { AdminApprovalPanel } from '@/components/settings/admin-approval-panel';
import { hasSyncAccess, isPaywallEnabled } from '@/lib/paywall';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/providers/auth-provider';
import { useSyncContext } from '@/providers/sync-provider';
import { getStorageEstimate, clearFileCache, resetFailedSyncItems, getFirstSyncError } from '@/lib/db';
import { reportError } from '@/lib/error-reporting';
import { formatFileSize } from '@/components/shared/file-icon';
import { APP_VERSION } from '@/lib/version';
import { useDeviceClass } from '@/hooks/use-device-class';
import { toast } from 'sonner';

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
  const [activeTab, setActiveTab] = useState('account');

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
      setAvatarLoadFailed(false);
    }
  }, [profile]);

  // Default to preferences if auth state changes away from authenticated
  useEffect(() => {
    if (mode !== 'authenticated' && ['account', 'cloud', 'admin'].includes(activeTab)) {
      setActiveTab('preferences');
    }
  }, [mode, activeTab]);

  useEffect(() => {
    getStorageEstimate().then(setStorage).catch((e) => reportError('load storage estimate', e, { silent: true }));
  }, []);

  const storagePercent = storage.quota > 0 ? (storage.used / storage.quota) * 100 : 0;

  const handleClearCache = async () => {
    const count = await clearFileCache();
    toast.success(`Cleared ${count} cached file(s)`);
    getStorageEstimate().then(setStorage).catch((e) => reportError('load storage estimate', e, { silent: true }));
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
    const { error: uploadError } = await client.storage
      .from('avatars')
      .upload(path, croppedBlob, { upsert: true, contentType: 'image/png' });
    if (uploadError) throw new Error(uploadError.message);
    const { data: { publicUrl } } = client.storage.from('avatars').getPublicUrl(path);
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

  const isAdmin = mode === 'authenticated' && profile?.role === 'admin';

  return (
    <>
      <TopBar title="Settings" />
      <div className="flex flex-col" style={{ height: 'calc(100vh - 3.5rem)' }}>

        {/* ── Profile Shelf ───────────────────────────────────── */}
        {mode === 'authenticated' && (
          <div className="shrink-0 border-b border-border bg-muted/10 px-4 md:px-6 py-3">
            <div className="max-w-3xl mx-auto flex items-center gap-3">
              {/* Avatar — click to change */}
              <button
                type="button"
                aria-label="Change avatar"
                onClick={() => setShowAvatarDialog(true)}
                className="relative group shrink-0"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 overflow-hidden">
                  {profile?.avatarUrl && !avatarLoadFailed ? (
                    <img
                      src={profile.avatarUrl}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover"
                      onError={() => setAvatarLoadFailed(true)}
                      onLoad={() => setAvatarLoadFailed(false)}
                    />
                  ) : (
                    <span className="text-sm font-semibold text-primary">{profileInitials}</span>
                  )}
                </div>
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="h-3.5 w-3.5 text-white" />
                </div>
              </button>

              {/* Identity */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate leading-tight">
                  {profile?.displayName || user?.email}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>

              {/* Subscription tier badge */}
              {isPaywallEnabled() && (
                <span className={`hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                  profile?.subscriptionTier === 'team' ? 'bg-blue-500/15 text-blue-500 border border-blue-500/25' :
                  profile?.subscriptionTier === 'pro' ? 'bg-primary/15 text-primary border border-primary/25' :
                  'bg-muted text-muted-foreground border border-border'
                }`}>
                  {profile?.subscriptionTier === 'free' ? 'FREE' : (profile?.subscriptionTier?.toUpperCase() ?? 'FREE')}
                </span>
              )}

              {/* Sign out */}
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={async () => { await signOut(); }}
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </div>
          </div>
        )}

        {/* ── Tabs ────────────────────────────────────────────── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0 gap-0">
          <div className="shrink-0 border-b border-border bg-muted/20 px-4">
            <TabsList variant="line" className="overflow-x-auto scrollbar-none">
              {mode === 'authenticated' && (
                <TabsTrigger value="account" className="gap-1.5 px-3 py-2 text-xs">
                  <User className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Account</span>
                </TabsTrigger>
              )}
              {mode === 'authenticated' && (
                <TabsTrigger value="cloud" className="gap-1.5 px-3 py-2 text-xs">
                  <Cloud className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Cloud & Sync</span>
                </TabsTrigger>
              )}
              <TabsTrigger value="preferences" className="gap-1.5 px-3 py-2 text-xs">
                <Settings2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Preferences</span>
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="admin" className="gap-1.5 px-3 py-2 text-xs">
                  <Shield className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Admin</span>
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="max-w-3xl mx-auto space-y-4">

              {/* ══════════════════════════════════════════════
                  ACCOUNT TAB
              ══════════════════════════════════════════════ */}
              <TabsContent value="account" className="space-y-4">
                {/* Identity card */}
                <Card>
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="relative group shrink-0">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 overflow-hidden">
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
                      <div>
                        <p className="text-sm font-semibold">{profile?.displayName || user?.email}</p>
                        <p className="text-xs text-muted-foreground">{user?.email}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">Hover avatar to change photo</p>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-3">
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
                          Visible to other members in Global Projects.
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

                {/* Subscription card */}
                {isPaywallEnabled() && (
                  <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        profile?.subscriptionTier === 'team' ? 'bg-blue-500/10' :
                        profile?.subscriptionTier === 'pro' ? 'bg-primary/10' : 'bg-muted'
                      }`}>
                        <Crown className={`h-4 w-4 ${
                          profile?.subscriptionTier === 'team' ? 'text-blue-500' :
                          profile?.subscriptionTier === 'pro' ? 'text-primary' : 'text-muted-foreground'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">
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
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {profile?.subscriptionTier === 'free'
                            ? 'Local-only — upgrade for cloud sync'
                            : profile?.subscriptionExpiresAt
                              ? `Renews ${new Date(profile.subscriptionExpiresAt).toLocaleDateString()}`
                              : 'Active subscription'}
                        </p>
                      </div>
                      {profile?.subscriptionTier !== 'free' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 shrink-0"
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
                    </CardContent>
                  </Card>
                )}

                {/* Security actions — 2-column grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Card
                    className="transition-colors hover:border-primary/30 cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => setShowPasswordDialog(true)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowPasswordDialog(true); } }}
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <KeyRound className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Change Password</p>
                        <p className="text-xs text-muted-foreground">Update your sign-in password</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card
                    className="transition-colors hover:border-primary/30 cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => setShowEmailDialog(true)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowEmailDialog(true); } }}
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Mail className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">Change Email</p>
                        <p className="text-xs text-muted-foreground">Update your email address</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Danger Zone */}
                <Card
                  className="border-destructive/30 transition-colors hover:border-destructive/60 cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => setShowDeleteDialog(true)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowDeleteDialog(true); } }}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-destructive">Delete Account</p>
                      <p className="text-xs text-muted-foreground">Permanently delete your account and all data</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ══════════════════════════════════════════════
                  CLOUD & SYNC TAB
              ══════════════════════════════════════════════ */}
              <TabsContent value="cloud" className="space-y-4">
                {isPaywallEnabled() && !hasSyncAccess(profile?.subscriptionTier) ? (
                  <UpgradeCTA currentTier={profile?.subscriptionTier ?? 'free'} />
                ) : (
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
                )}
              </TabsContent>

              {/* ══════════════════════════════════════════════
                  PREFERENCES TAB
              ══════════════════════════════════════════════ */}
              <TabsContent value="preferences" className="space-y-4">
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

                {/* Storage info */}
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

                {/* Storage maintenance actions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                {/* Help & About */}
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

                    {/* Desktop App — only on Windows desktop web */}
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

                    {/* Tauri indicator */}
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

                    {/* Install as PWA — not shown inside Tauri */}
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
              </TabsContent>

              {/* ══════════════════════════════════════════════
                  ADMIN TAB
              ══════════════════════════════════════════════ */}
              {isAdmin && (
                <TabsContent value="admin" className="space-y-4">
                  <AdminApprovalPanel session={session} currentUserRole={profile?.role} />
                  <Card>
                    <CardContent className="p-5">
                      <BugReportsPanel />
                    </CardContent>
                  </Card>
                </TabsContent>
              )}

            </div>
          </div>
        </Tabs>
      </div>

      {/* ══════════════════════════════════════════════════════
          DIALOGS — all wiring preserved exactly
      ══════════════════════════════════════════════════════ */}
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
