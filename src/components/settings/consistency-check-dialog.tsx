'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DatabaseZap, CheckCircle2, AlertTriangle, Loader2, RefreshCw,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSyncContext } from '@/providers/sync-provider';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type {
  ConsistencyReport, EntityConsistency, ConsistencyStatus,
} from '@/lib/sync/consistency-check';

type Phase = 'checking' | 'results' | 'updating' | 'done' | 'error';

interface PullResult {
  pulled: number;
  deleted: number;
  errors: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Per-status badge config: only non-in-sync rows are rendered prominently. */
const STATUS_BADGE: Record<
  Exclude<ConsistencyStatus, 'in-sync'>,
  { label: string; variant: 'warning' | 'info' | 'secondary' }
> = {
  behind: { label: 'Out of date', variant: 'warning' },
  diverged: { label: 'Out of date', variant: 'warning' },
  ahead: { label: 'Local only', variant: 'info' },
  error: { label: "Couldn't check", variant: 'secondary' },
};

export function ConsistencyCheckDialog({ open, onOpenChange }: Props) {
  const { checkConsistency, triggerFullPull } = useSyncContext();
  const [phase, setPhase] = useState<Phase>('checking');
  const [report, setReport] = useState<ConsistencyReport | null>(null);
  const [pullResult, setPullResult] = useState<PullResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    setPhase('checking');
    setErrorMsg(null);
    try {
      const r = await checkConsistency();
      setReport(r);
      setPhase('results');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }, [checkConsistency]);

  // Kick off the check each time the dialog opens. runCheck synchronously sets
  // phase='checking' before its first await — that's an intentional reset on the
  // open→true external signal (not a render-derivable value), gated on `open`.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- check-on-open is a legitimate external-signal sync, gated on `open`
      void runCheck();
    }
  }, [open, runCheck]);

  const handleOpenChange = useCallback((next: boolean) => {
    if (phase === 'updating') return; // never close mid-pull
    if (!next) {
      // Reset after the close animation so the next open starts fresh.
      setTimeout(() => {
        setPhase('checking');
        setReport(null);
        setPullResult(null);
        setErrorMsg(null);
      }, 200);
    }
    onOpenChange(next);
  }, [phase, onOpenChange]);

  const handleUpdate = useCallback(async () => {
    setPhase('updating');
    setErrorMsg(null);
    try {
      const res = await triggerFullPull();
      if (!res) {
        setErrorMsg('Sync not available — are you signed in?');
        setPhase('error');
        return;
      }
      setPullResult(res);
      // Re-run the check so the results reflect the freshly pulled data.
      try {
        const r = await checkConsistency();
        setReport(r);
      } catch {
        // The pull itself succeeded; a refresh failure shouldn't block "done".
      }
      if (res.errors.length > 0) {
        toast.warning('Updated with some errors', {
          description: `${res.errors.length} item${res.errors.length !== 1 ? 's' : ''} could not be updated.`,
        });
      } else {
        toast.success('Local data updated from the cloud');
      }
      setPhase('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      toast.error('Update failed', { description: msg });
      setPhase('error');
    }
  }, [triggerFullPull, checkConsistency]);

  const flagged = report?.entities.filter((e) => e.status !== 'in-sync') ?? [];
  const inSyncCount = report
    ? report.entities.filter((e) => e.status === 'in-sync').length
    : 0;
  const behindCount = report?.behindEntities ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={phase !== 'updating'} className="sm:max-w-lg">
        {/* ── Checking ── */}
        {phase === 'checking' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <DatabaseZap className="h-6 w-6 text-primary" />
              </div>
              <DialogTitle className="text-center">Checking consistency&hellip;</DialogTitle>
              <DialogDescription className="text-center">
                Comparing your local data with the cloud&hellip;
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
              </div>
            </DialogBody>
            <DialogFooter />
          </>
        )}

        {/* ── Results ── */}
        {phase === 'results' && report && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <DatabaseZap className="h-5 w-5 text-primary" />
                Database Consistency
              </DialogTitle>
              <DialogDescription>
                {!report.supported
                  ? 'Cloud sync is not available. Sign in to check your data against the cloud.'
                  : report.inSync
                    ? 'Your local data matches the cloud.'
                    : 'Some item types on this device are out of date.'}
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-4 px-5 py-4">
              {!report.supported ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nothing to compare while signed out.
                </p>
              ) : report.inSync && flagged.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-field-success/10">
                    <CheckCircle2 className="h-6 w-6 text-field-success" />
                  </div>
                  <p className="text-sm font-medium">Everything is up to date</p>
                  <p className="text-xs text-muted-foreground">
                    Local matches the cloud across all {report.entities.length} item types.
                  </p>
                </div>
              ) : (
                <>
                  {/* Amber callout when one or more entities are behind. */}
                  {behindCount > 0 && (
                    <div className="flex items-start gap-2.5 rounded-lg border border-field-warning/30 bg-field-warning/5 p-3">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-field-warning mt-0.5" />
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {behindCount} item type{behindCount !== 1 ? 's are' : ' is'} out of date
                        </span>{' '}
                        on this device. Update from the cloud to bring{' '}
                        {behindCount !== 1 ? 'them' : 'it'} in line.
                      </p>
                    </div>
                  )}

                  {/* Flagged entity rows. */}
                  <ul className="space-y-1.5">
                    {flagged.map((entity) => (
                      <EntityRow key={entity.entityType} entity={entity} />
                    ))}
                  </ul>

                  {/* Summary of the quiet, in-sync rows. */}
                  {inSyncCount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {inSyncCount} item type{inSyncCount !== 1 ? 's' : ''} in sync.
                    </p>
                  )}
                </>
              )}
            </DialogBody>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
              {behindCount > 0 ? (
                <Button onClick={handleUpdate} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Update from cloud
                </Button>
              ) : (
                <Button variant="outline" onClick={() => void runCheck()} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Re-check
                </Button>
              )}
            </DialogFooter>
          </>
        )}

        {/* ── Updating ── */}
        {phase === 'updating' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <DatabaseZap className="h-6 w-6 text-primary animate-pulse" />
              </div>
              <DialogTitle className="text-center">Updating from cloud&hellip;</DialogTitle>
              <DialogDescription className="text-center">
                Pulling the latest data onto this device.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
              </div>
            </DialogBody>
            <DialogFooter />
          </>
        )}

        {/* ── Done ── */}
        {phase === 'done' && pullResult && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-field-success/10 animate-in zoom-in duration-300">
                <CheckCircle2 className="h-6 w-6 text-field-success" />
              </div>
              <DialogTitle className="text-center">Up to date</DialogTitle>
              <DialogDescription className="text-center">
                {pullResult.pulled > 0
                  ? `Updated. Pulled ${pullResult.pulled} item${pullResult.pulled !== 1 ? 's' : ''}${pullResult.deleted > 0 ? `, removed ${pullResult.deleted}` : ''} from the cloud.`
                  : 'Your local data is now in line with the cloud.'}
              </DialogDescription>
            </DialogHeader>
            {pullResult.errors.length > 0 && (
              <DialogBody className="px-5 py-4">
                <div className="rounded-lg bg-muted p-3 space-y-1 max-h-40 overflow-y-auto">
                  <p className="text-xs font-medium text-foreground">
                    {pullResult.errors.length} item{pullResult.errors.length !== 1 ? 's' : ''} could not be updated:
                  </p>
                  {pullResult.errors.slice(0, 5).map((err, i) => (
                    <p key={i} className="text-xs text-muted-foreground font-mono break-all">{err}</p>
                  ))}
                  {pullResult.errors.length > 5 && (
                    <p className="text-xs text-muted-foreground">…and {pullResult.errors.length - 5} more</p>
                  )}
                </div>
              </DialogBody>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => void runCheck()} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Re-check
              </Button>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}

        {/* ── Error ── */}
        {phase === 'error' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-field-warning/10">
                <AlertTriangle className="h-6 w-6 text-field-warning" />
              </div>
              <DialogTitle className="text-center">Something went wrong</DialogTitle>
              <DialogDescription className="text-center">
                {errorMsg ?? 'The consistency check could not be completed.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Close</Button>
              <Button onClick={() => void runCheck()} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A single flagged (non-in-sync) entity row: label, counts, status badge. */
function EntityRow({ entity }: { entity: EntityConsistency }) {
  if (entity.status === 'in-sync') return null;
  const badge = STATUS_BADGE[entity.status];
  const isWarn = entity.status === 'behind' || entity.status === 'diverged';

  return (
    <li
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg border px-3 py-2',
        isWarn
          ? 'border-field-warning/30 bg-field-warning/5'
          : 'border-border bg-background',
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{entity.label}</p>
        <p className="text-xs text-muted-foreground">
          Local {entity.localCount} · Cloud {entity.remoteCount}
        </p>
      </div>
      <Badge variant={badge.variant} className="shrink-0">{badge.label}</Badge>
    </li>
  );
}
