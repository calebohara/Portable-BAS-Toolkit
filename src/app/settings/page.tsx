'use client';

import { useState, useEffect } from 'react';
import {
  Palette, HardDrive, Info, Trash2, Download,
} from 'lucide-react';
import { TopBar } from '@/components/layout/top-bar';
import { ThemeSwitcher } from '@/components/theme/theme-switcher';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { getStorageEstimate, clearFileCache } from '@/lib/db';
import { formatFileSize } from '@/components/shared/file-icon';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [storage, setStorage] = useState({ used: 0, quota: 0 });
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    getStorageEstimate().then(setStorage);
  }, []);

  const storagePercent = storage.quota > 0 ? (storage.used / storage.quota) * 100 : 0;

  const handleClearCache = async () => {
    const count = await clearFileCache();
    toast.success(`Cleared ${count} cached file(s)`);
    getStorageEstimate().then(setStorage);
  };

  return (
    <>
      <TopBar title="Settings" />
      <div className="p-4 md:p-6 space-y-6 max-w-2xl">
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

        {/* About */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="h-4 w-4" /> About
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p><strong className="text-foreground">BAU Suite</strong> — Portable Project Toolkit</p>
            <p>Version {process.env.NEXT_PUBLIC_APP_VERSION}</p>
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
