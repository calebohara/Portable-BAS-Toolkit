'use client';

import { useState, useEffect } from 'react';
import {
  Palette, HardDrive, Info, Trash2, Download, PlayCircle, User, LogOut,
  Cloud, Upload, AlertTriangle, Monitor,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/top-bar';
import { ThemeSwitcher } from '@/components/theme/theme-switcher';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { BackupDialog } from '@/components/settings/backup-dialog';
import { RestoreDialog } from '@/components/settings/restore-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
      {children}
    </h2>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { mode, user, isConfigured, signOut } = useAuth();
  const { triggerFullSync, triggerPullSync } = useSyncContext();
  const syncStatus = useAppStore((s) => s.syncStatus);
  const pendingSyncCount = useAppStore((s) => s.pendingSyncCount);
  const lastSyncedAt = useAppStore((s) => s.lastSyncedAt);
  const lastPulledAt = useAppStore((s) => s.lastPulledAt);
  const [storage, setStorage] = useState({ used: 0, quota: 0 });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
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

  return (
    <>
      <TopBar title="Settings" />
      <div className="p-4 md:p-6 space-y-8 max-w-3xl">

        {/* ─── Account ─── */}
        <section>
          <SectionHeading>Account</SectionHeading>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4" /> Account
              </CardTitle>
              <CardDescription>
                You are signed in. Your data is stored locally and synced to the cloud.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{user?.email}</p>
                  <p className="text-xs text-muted-foreground">Signed in · Data stored locally</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={async () => { await signOut(); }}
                >
                  <LogOut className="h-3.5 w-3.5" /> Sign Out
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ─── Cloud & Sync ─── */}
        {mode === 'authenticated' && (
          <section>
            <SectionHeading>Cloud & Sync</SectionHeading>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Backup card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Cloud className="h-4 w-4" /> Cloud Backup
                  </CardTitle>
                  <CardDescription>
                    {lastSyncedAt
                      ? `Last backed up ${new Date(lastSyncedAt).toLocaleString()}`
                      : 'Back up your local data to the cloud.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        {syncStatus === 'idle' && 'Backed up'}
                        {syncStatus === 'syncing' && 'Syncing...'}
                        {syncStatus === 'error' && 'Sync errors'}
                        {syncStatus === 'offline' && 'Offline'}
                        {syncStatus === 'disabled' && 'Disabled'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {pendingSyncCount > 0
                          ? `${pendingSyncCount} item(s) pending`
                          : 'Changes are backed up automatically'}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={syncStatus === 'offline'}
                      onClick={() => setShowBackupDialog(true)}
                    >
                      <Upload className="h-3.5 w-3.5" /> Back Up Now
                    </Button>
                  </div>
                  {syncStatus === 'error' && pendingSyncCount > 0 && (
                    <>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-field-warning">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span>{pendingSyncCount} failed item(s)</span>
                        </div>
                        <div className="flex gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              const err = await getFirstSyncError();
                              if (err) {
                                toast.error(err, { duration: 10000 });
                              } else {
                                toast.info('No error details available');
                              }
                            }}
                          >
                            Show Error
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              const count = await resetFailedSyncItems();
                              toast.success(`Reset ${count} failed item(s) for retry`);
                            }}
                          >
                            Retry All
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Restore card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Download className="h-4 w-4" /> Restore from Cloud
                  </CardTitle>
                  <CardDescription>
                    {lastPulledAt
                      ? `Last restored ${new Date(lastPulledAt).toLocaleString()}`
                      : 'Download your cloud data to this device.'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={syncStatus === 'offline'}
                    onClick={() => setShowRestoreDialog(true)}
                  >
                    <Download className="h-3.5 w-3.5" /> Restore
                  </Button>
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* ─── Preferences & Storage ─── */}
        <section>
          <SectionHeading>Preferences & Storage</SectionHeading>
          <Card>
            <CardContent className="space-y-4 pt-5">
              {/* Theme */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Palette className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Theme</span>
                </div>
                <ThemeSwitcher />
              </div>

              <Separator />

              {/* Storage */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Offline Storage</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Storage Used</span>
                    <span className="font-medium">{formatFileSize(storage.used)} / {formatFileSize(storage.quota)}</span>
                  </div>
                  <Progress value={storagePercent} className="h-2" />
                  <p className="text-xs text-muted-foreground">{storagePercent.toFixed(1)}% of available storage used</p>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <p className="text-sm">Clear File Cache</p>
                    <p className="text-xs text-muted-foreground">Remove cached file previews. Project data is preserved.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowClearConfirm(true)} className="gap-1.5">
                    <Trash2 className="h-3.5 w-3.5" /> Clear
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ─── Help & About ─── */}
        <section>
          <SectionHeading>Help & About</SectionHeading>
          <Card>
            <CardContent className="space-y-4 pt-5">
              {/* Guided Tour */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Guided Tour</p>
                  <p className="text-xs text-muted-foreground">Walk through the key features of BAU Suite.</p>
                </div>
                <Button variant="outline" size="sm" onClick={startTour} className="gap-1.5">
                  <PlayCircle className="h-3.5 w-3.5" /> Replay Tour
                </Button>
              </div>

              {/* Desktop App — only shown on desktop web, not in Tauri or on phones */}
              {isWindowsDesktopWeb && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Monitor className="h-4 w-4 text-muted-foreground" /> Desktop App
                    </p>
                    <p className="text-xs text-muted-foreground">Native Windows app with full network access and ICMP ping.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => router.push('/desktop')} className="gap-1.5">
                    <Monitor className="h-3.5 w-3.5" /> Learn More
                  </Button>
                </div>
              )}

              {isTauriRuntime && (
                <div className="flex items-center gap-3">
                  <Monitor className="h-4 w-4 text-primary shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    You&apos;re using the <strong className="text-foreground">desktop app</strong>.
                  </p>
                </div>
              )}

              {/* Install as PWA */}
              {!isTauriRuntime && (
                <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground space-y-2">
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
      </div>

      {/* Dialogs */}
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
    </>
  );
}
