'use client';

import { useState, useCallback, type ReactNode, type ComponentType } from 'react';
import { Cloud, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog';

type Phase = 'confirm' | 'running' | 'success' | 'error';

/** Minimal contract a result must satisfy so the dialog can branch on errors. */
interface ResultWithErrors {
  errors: string[];
}

export interface SyncOperationDialogProps<TResult extends ResultWithErrors> {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  /** Title shown in the confirm/running/success/error headers (per phase). */
  title: string;
  successTitle: string;
  errorTitle: string;
  /** Header + sub-text shown while the operation is running. */
  runningTitle: string;
  runningDescription: string;
  /** Confirm-phase body text + last-run timestamp. */
  confirmDescription: ReactNode;
  lastTimestamp: string | null;
  lastTimestampLabel: string;
  /** Confirm-phase action button. */
  actionLabel: string;
  actionIcon: ComponentType<{ className?: string }>;

  /** The async operation. Returns null when sync is unavailable (not signed in). */
  action: () => Promise<TResult | null>;
  /** Result synthesised when `action` resolves null. Must carry the error. */
  unavailableResult: TResult;
  /** Result synthesised when `action` throws — receives the error message. */
  makeThrownResult: (message: string) => TResult;

  /** Render the success-phase description from the result. */
  renderSuccess: (result: TResult) => ReactNode;
  /** Render the error-phase summary line from the result. */
  renderErrorSummary: (result: TResult) => ReactNode;
}

/**
 * Shared phase-machine dialog for cloud backup / restore (and any future
 * one-shot sync operation). Both `BackupDialog` and `RestoreDialog` are thin
 * configuration wrappers over this. Behavior (phases, close-locking during the
 * run, 200ms reset-on-close, error list capped at 5) is identical to the
 * original hand-rolled dialogs. See ReviewAgents-findings-2026-05-20 P3-7.
 */
export function SyncOperationDialog<TResult extends ResultWithErrors>({
  open,
  onOpenChange,
  title,
  successTitle,
  errorTitle,
  runningTitle,
  runningDescription,
  confirmDescription,
  lastTimestamp,
  lastTimestampLabel,
  actionLabel,
  actionIcon: ActionIcon,
  action,
  unavailableResult,
  makeThrownResult,
  renderSuccess,
  renderErrorSummary,
}: SyncOperationDialogProps<TResult>) {
  const [phase, setPhase] = useState<Phase>('confirm');
  const [result, setResult] = useState<TResult | null>(null);

  const handleOpenChange = useCallback((next: boolean) => {
    if (phase === 'running') return; // prevent close during the operation
    if (!next) {
      // Reset state when closing
      setTimeout(() => {
        setPhase('confirm');
        setResult(null);
      }, 200);
    }
    onOpenChange(next);
  }, [phase, onOpenChange]);

  const handleRun = useCallback(async () => {
    setPhase('running');
    try {
      const res = await action();
      if (!res) {
        setResult(unavailableResult);
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
      setResult(makeThrownResult(msg));
      setPhase('error');
    }
  }, [action, unavailableResult, makeThrownResult]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={phase !== 'running'} className="sm:max-w-md">
        {/* ── Confirm ── */}
        {phase === 'confirm' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Cloud className="h-6 w-6 text-primary" />
              </div>
              <DialogTitle className="text-center">{title}</DialogTitle>
              <DialogDescription className="text-center">
                {confirmDescription}
              </DialogDescription>
            </DialogHeader>
            {lastTimestamp && (
              <DialogBody>
                <p className="text-center text-xs text-muted-foreground">
                  {lastTimestampLabel}: {new Date(lastTimestamp).toLocaleString()}
                </p>
              </DialogBody>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button onClick={handleRun} className="gap-1.5">
                <ActionIcon className="h-3.5 w-3.5" /> {actionLabel}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Running ── */}
        {phase === 'running' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Cloud className="h-6 w-6 text-primary animate-pulse" />
              </div>
              <DialogTitle className="text-center">{runningTitle}</DialogTitle>
              <DialogDescription className="text-center">
                {runningDescription}
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
              <DialogTitle className="text-center">{successTitle}</DialogTitle>
              <DialogDescription className="text-center">
                {renderSuccess(result)}
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
              <DialogTitle className="text-center">{errorTitle}</DialogTitle>
              <DialogDescription className="text-center">
                {renderErrorSummary(result)}
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
