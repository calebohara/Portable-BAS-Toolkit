'use client';

import { useState, useEffect } from 'react';
import {
  Palette, HardDrive, Info, Trash2, Download, PlayCircle, HelpCircle, User, LogOut,
  Cloud, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/top-bar';
import { ThemeSwitcher } from '@/components/theme/theme-switcher';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/providers/auth-provider';
import { useSyncContext } from '@/providers/sync-provider';
import { getStorageEstimate, clearFileCache, resetFailedSyncItems } from '@/lib/db';
import { formatFileSize } from '@/components/shared/file-icon';
import { APP_VERSION } from '@/lib/version';
import { toast } from 'sonner';

export default function SettingsPage() {
  const router = useRouter();
  const { mode, user, isConfigured, signOut } = useAuth();
  const { triggerFullSync } = useSyncContext();
  const syncStatus = useAppStore((s) => s.syncStatus);
  const pendingSyncCount = useAppStore((s) => s.pendingSyncCount);
  const lastSyncedAt = useAppStore((s) => s.lastSyncedAt);
  const [storage, setStorage] = useState({ used: 0, quota: 0 });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const startTour = useAppStore((s) => s.startTour);

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
      <div className="p-4 md:p-6 space-y-6 max-w-2xl">
        {/* Account */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" /> Account
            </CardTitle>
            <CardDescription>
              {isConfigured
                ? mode === 'authenticated'
                  ? 'You are signed in. Your data is stored locally on this device.'
                  : 'Sign in to enable cloud features in a future update.'
                : 'Cloud authentication is not configured. All data is stored locally.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isConfigured && mode === 'authenticated' && user ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{user.email}</p>
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
              </>
            ) : isConfigured ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Local Mode</p>
                  <p className="text-xs text-muted-foreground">All data stored on this device only.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => router.push('/login')}>
                  Sign In
                </Button>
              </div>
            ) : (
              <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                <p>Running in local-only mode. No cloud backend is configured.</p>
                <p className="text-xs mt-1">All projects, files, and settings are stored in your browser&apos;s IndexedDB.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cloud Backup */}
        {mode === 'authenticated' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Cloud className="h-4 w-4" /> Cloud Backup
              </CardTitle>
              <CardDescription>
                Your data is stored locally. When signed in, changes are backed up to the cloud automatically.
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
                      : lastSyncedAt
                        ? `Last backed up ${new Date(lastSyncedAt).toLocaleString()}`
                        : 'No backup yet'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={syncing || syncStatus === 'offline'}
                  onClick={async () => {
                    setSyncing(true);
                    try {
                      await triggerFullSync();
                      toast.success('Full backup started');
                    } catch {
                      toast.error('Backup failed');
                    } finally {
                      setSyncing(false);
                    }
                  }}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} /> Back Up Now
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
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Palette className="h-4 w-4" /> Appearance
            </CardTitle>
            <CardDescription>Choose your preferred theme.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm">Theme</span>
              <ThemeSwitcher />
            </div>
          </CardContent>
        </Card>

        {/* Storage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HardDrive className="h-4 w-4" /> Offline Storage
            </CardTitle>
            <CardDescription>Manage locally cached files and project data.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Storage Used</span>
                <span className="font-medium">{formatFileSize(storage.used)} / {formatFileSize(storage.quota)}</span>
              </div>
              <Progress value={storagePercent} className="h-2" />
              <p className="text-xs text-muted-foreground">{storagePercent.toFixed(1)}% of available storage used</p>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Clear File Cache</p>
                <p className="text-xs text-muted-foreground">Remove cached file previews. Project data is preserved.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowClearConfirm(true)} className="gap-1.5">
                <Trash2 className="h-3.5 w-3.5" /> Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* PWA Install */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="h-4 w-4" /> Install as App
            </CardTitle>
            <CardDescription>Install BAU Suite for offline access and a native app experience.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground space-y-2">
              <p>To install this app:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Open this page in Chrome, Edge, or Safari</li>
                <li>Look for the install icon in the address bar or browser menu</li>
                <li>Click &ldquo;Install&rdquo; or &ldquo;Add to Home Screen&rdquo;</li>
              </ol>
              <p className="text-xs">Once installed, the app works offline and opens like a native application.</p>
            </div>
          </CardContent>
        </Card>

        {/* Onboarding */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HelpCircle className="h-4 w-4" /> Onboarding
            </CardTitle>
            <CardDescription>Replay the guided tour or visit the help center.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Guided Tour</p>
                <p className="text-xs text-muted-foreground">Walk through the key features of BAU Suite.</p>
              </div>
              <Button variant="outline" size="sm" onClick={startTour} className="gap-1.5">
                <PlayCircle className="h-3.5 w-3.5" /> Replay Tour
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* About */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="h-4 w-4" /> About
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p><strong className="text-foreground">BAU Suite</strong> — Portable Project Toolkit</p>
            <p>Version {APP_VERSION}</p>
            <p>Built for BAS field technicians, commissioning agents, and service engineers.</p>
            <p>Offline-first. Fast. Field-ready.</p>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title="Clear File Cache"
        description="All cached file previews will be removed. Your project data and notes are preserved."
        confirmLabel="Clear Cache"
        variant="destructive"
        onConfirm={handleClearCache}
      />
    </>
  );
}
