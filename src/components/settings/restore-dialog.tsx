'use client';

import { useState, useCallback } from 'react';
import { Cloud, Download, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog';

type Phase = 'confirm' | 'restoring' | 'success' | 'error';

interface RestoreResult {
  pulled: number;
  deleted: number;
  errors: string[];
}

interface RestoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lastPulledAt: string | null;
  triggerPullSync: () => Promise<RestoreResult | null>;
}

export function RestoreDialog({ open, onOpenChange, lastPulledAt, triggerPullSync }: RestoreDialogProps) {
  const [phase, setPhase] = useState<Phase>('confirm');
  const [result, setResult] = useState<RestoreResult | null>(null);

  const handleOpenChange = useCallback((next: boolean) => {
    if (phase === 'restoring') return; // prevent close during restore
    if (!next) {
      // Reset state when closing
      setTimeout(() => {
        setPhase('confirm');
        setResult(null);
      }, 200);
    }
    onOpenChange(next);
  }, [phase, onOpenChange]);

  const handleRestore = useCallback(async () => {
    setPhase('restoring');
    try {
      const res = await triggerPullSync();
      if (!res) {
        setResult({ pulled: 0, deleted: 0, errors: ['Sync not available — are you signed in?'] });
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
      setResult({ pulled: 0, deleted: 0, errors: [msg] });
      setPhase('error');
    }
  }, [triggerPullSync]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={phase !== 'restoring'} className="sm:max-w-md">
        {/* ── Confirm ── */}
        {phase === 'confirm' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Cloud className="h-6 w-6 text-primary" />
              </div>
              <DialogTitle className="text-center">Restore from Cloud</DialogTitle>
              <DialogDescription className="text-center">
                This will download all your data from the cloud to this device. Any matching local data will be overwritten.
              </DialogDescription>
            </DialogHeader>
            {lastPulledAt && (
              <DialogBody>
                <p className="text-center text-xs text-muted-foreground">
                  Last restored: {new Date(lastPulledAt).toLocaleString()}
                </p>
              </DialogBody>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button onClick={handleRestore} className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> Restore Now
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Restoring ── */}
        {phase === 'restoring' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Cloud className="h-6 w-6 text-primary animate-pulse" />
              </div>
              <DialogTitle className="text-center">Restoring your data&hellip;</DialogTitle>
              <DialogDescription className="text-center">
                Downloading from cloud and updating local database.
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
              <DialogTitle className="text-center">Restore Complete</DialogTitle>
              <DialogDescription className="text-center">
                {result.pulled} item{result.pulled !== 1 ? 's' : ''} restored
                {result.deleted > 0 && `, ${result.deleted} removed`}.
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
              <DialogTitle className="text-center">Restore had errors</DialogTitle>
              <DialogDescription className="text-center">
                {result.pulled > 0
                  ? `${result.pulled} item${result.pulled !== 1 ? 's' : ''} restored with ${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}.`
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
