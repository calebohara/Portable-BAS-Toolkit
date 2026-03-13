'use client';

import { useState, useCallback } from 'react';
import { Cloud, Upload, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog';

type Phase = 'confirm' | 'syncing' | 'success' | 'error';

interface BackupResult {
  enqueued: number;
  errors: string[];
}

interface BackupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lastSyncedAt: string | null;
  triggerFullSync: () => Promise<BackupResult | null>;
}

export function BackupDialog({ open, onOpenChange, lastSyncedAt, triggerFullSync }: BackupDialogProps) {
  const [phase, setPhase] = useState<Phase>('confirm');
  const [result, setResult] = useState<BackupResult | null>(null);

  const handleOpenChange = useCallback((next: boolean) => {
    if (phase === 'syncing') return;
    if (!next) {
      setTimeout(() => {
        setPhase('confirm');
        setResult(null);
      }, 200);
    }
    onOpenChange(next);
  }, [phase, onOpenChange]);

  const handleBackup = useCallback(async () => {
    setPhase('syncing');
    try {
      const res = await triggerFullSync();
      if (!res) {
        setResult({ enqueued: 0, errors: ['Sync not available — are you signed in?'] });
        setPhase('error');
      } else if (res.errors.length > 0) {
        setResult(res);
        setPhase('error');
      } else {
        setResult(res);
        setPhase('success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({ enqueued: 0, errors: [msg] });
      setPhase('error');
    }
  }, [triggerFullSync]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={phase !== 'syncing'} className="sm:max-w-md">
        {/* ── Confirm ── */}
        {phase === 'confirm' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Cloud className="h-6 w-6 text-primary" />
              </div>
              <DialogTitle className="text-center">Back Up to Cloud</DialogTitle>
              <DialogDescription className="text-center">
                This will upload all your local data to the cloud. Existing cloud data will be updated.
              </DialogDescription>
            </DialogHeader>
            {lastSyncedAt && (
              <DialogBody>
                <p className="text-center text-xs text-muted-foreground">
                  Last backed up: {new Date(lastSyncedAt).toLocaleString()}
                </p>
              </DialogBody>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button onClick={handleBackup} className="gap-1.5">
                <Upload className="h-3.5 w-3.5" /> Back Up Now
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Syncing ── */}
        {phase === 'syncing' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Cloud className="h-6 w-6 text-primary animate-pulse" />
              </div>
              <DialogTitle className="text-center">Backing up your data&hellip;</DialogTitle>
              <DialogDescription className="text-center">
                Uploading local data to the cloud.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="flex justify-center py-2">
                <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin" />
              </div>
            </DialogBody>
            <DialogFooter />
          </>
        )}

        {/* ── Success ── */}
        {phase === 'success' && result && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-field-success/10 animate-in zoom-in duration-300">
                <CheckCircle2 className="h-6 w-6 text-field-success" />
              </div>
              <DialogTitle className="text-center">Backup Complete</DialogTitle>
              <DialogDescription className="text-center">
                {result.enqueued > 0
                  ? `${result.enqueued} item${result.enqueued !== 1 ? 's' : ''} backed up.`
                  : 'Everything is up to date — no new data to back up.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}

        {/* ── Error ── */}
        {phase === 'error' && result && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-field-warning/10">
                <AlertTriangle className="h-6 w-6 text-field-warning" />
              </div>
              <DialogTitle className="text-center">Backup had errors</DialogTitle>
              <DialogDescription className="text-center">
                {result.enqueued > 0
                  ? `${result.enqueued} item${result.enqueued !== 1 ? 's' : ''} enqueued with ${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}.`
                  : `${result.errors.length} error${result.errors.length !== 1 ? 's' : ''} occurred.`}
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="rounded-lg bg-muted p-3 space-y-1 max-h-40 overflow-y-auto">
                {result.errors.slice(0, 5).map((err, i) => (
                  <p key={i} className="text-xs text-muted-foreground font-mono break-all">{err}</p>
                ))}
                {result.errors.length > 5 && (
                  <p className="text-xs text-muted-foreground">…and {result.errors.length - 5} more</p>
                )}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
