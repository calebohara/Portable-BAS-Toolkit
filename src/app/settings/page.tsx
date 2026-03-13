'use client';

import { useState, useEffect } from 'react';
import {
  Palette, HardDrive, Info, Trash2, Download, PlayCircle, User, LogOut,
  Cloud, Upload, AlertTriangle, Monitor, KeyRound, Mail, Database,
  RefreshCw, ChevronRight,
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
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/providers/auth-provider';
import { useSyncContext } from '@/providers/sync-provider';
import { getStorageEstimate, clearFileCache, resetFailedSyncItems, getFirstSyncError } from '@/lib/db';
import { formatFileSize } from '@/components/shared/file-icon';
import { APP_VERSION } from '@/lib/version';
import { useDeviceClass } from '@/hooks/use-device-class';
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

/* ─── Page ────────────────────────────────────────────────── */

export default function SettingsPage() {
  const router = useRouter();
  const { mode, user, session, signOut, updatePassword, updateEmail } = useAuth();
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

  useEffect(() => {
    getStorageEstimate().then(setStorage).catch(() => {});
  }, []);

  const storagePercent = storage.quota > 0 ? (storage.used / storage.quota) * 100 : 0;

  const handleClearCache = async () => {
    const count = await clearFileCache();
    toast.success(`Cleared ${count} cached file(s)`);
    getStorageEstimate().then(setStorage).catch(() => {});
  };

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
                <CardContent className="p-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{user?.email}</p>
                      <p className="text-xs text-muted-foreground">Signed in · Data stored locally & synced to cloud</p>
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
                </CardContent>
              </Card>

              {/* Change Password */}
              <Card className="transition-colors hover:border-primary/30 cursor-pointer" onClick={() => setShowPasswordDialog(true)}>
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
              <Card className="transition-colors hover:border-primary/30 cursor-pointer" onClick={() => setShowEmailDialog(true)}>
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
              <Card className="border-destructive/30 transition-colors hover:border-destructive/50 cursor-pointer" onClick={() => setShowDeleteDialog(true)}>
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
            CLOUD & SYNC
        ═══════════════════════════════════════════════════════════ */}
        {mode === 'authenticated' && (
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
    </>
  );
}
