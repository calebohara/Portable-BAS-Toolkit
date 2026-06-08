'use client';

import { useState } from 'react';
import { RefreshCw, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  clearSyncQueue,
  clearSyncErrors,
  clearAllSyncConflicts,
  clearSyncMeta,
} from '@/lib/db';
import { useSyncContext } from '@/providers/sync-provider';
import { emitPullComplete } from '@/lib/sync/sync-bridge';
import { useAppStore } from '@/store/app-store';

/**
 * Reset Sync State — admin recovery action.
 *
 * Clears every pending push (syncQueue), every captured SyncError, every
 * stuck sync conflict, and then triggers a fresh full pull from Supabase. Use
 * when sync is stuck in a cascade of failures the user can't recover from one
 * row at a time.
 *
 * Does NOT delete local IndexedDB entity rows — only sync metadata. If an
 * orphan row keeps failing after reset, the user must Forget Locally on the
 * specific entity through the Sync Error Inspector.
 */
export function ResetSyncStateCard() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ clearedQueue: number; clearedErrors: number; pulled: number } | null>(null);
  const { triggerPullSync } = useSyncContext();
  const setLastPulledAt = useAppStore((s) => s.setLastPulledAt);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const clearedQueue = await clearSyncQueue();
      const clearedErrors = await clearSyncErrors();
      // Also clear any stuck sync conflicts — these are equally sticky and the
      // user can't otherwise recover them from this card.
      await clearAllSyncConflicts();
      // Clear fullSync dirty-tracking high-water marks (Phase 1b) so the next
      // full sync re-enqueues every row instead of skipping "unchanged" rows.
      await clearSyncMeta();

      // Reset lastPulledAt so the next pull is a full (non-incremental) refresh.
      setLastPulledAt(null);

      const pullResult = await triggerPullSync();
      const pulled = pullResult?.pulled ?? 0;

      emitPullComplete();

      setResult({ clearedQueue, clearedErrors, pulled });
      toast.success(`Sync reset. Cleared ${clearedQueue} queued, ${clearedErrors} errors. Pulled ${pulled} rows.`);
    } catch (e) {
      toast.error(`Reset failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <RefreshCw className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Reset Sync State</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Clears every pending push, captured sync error, and stuck conflict, then re-pulls all data from Supabase.
            Use when sync is stuck in a loop of failed retries. Local entity rows are preserved — clear those
            individually via &quot;Forget locally&quot; in the Sync Error Inspector if needed.
          </p>
          {result && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-green-500/30 bg-green-500/5 px-2 py-1 text-xs text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Last reset cleared {result.clearedQueue} queued + {result.clearedErrors} errors, pulled {result.pulled} rows.
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={() => setConfirmOpen(true)}
          disabled={running}
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Reset
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!running) setConfirmOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset sync state?</DialogTitle>
            <DialogDescription>
              All pending push operations and captured sync errors will be cleared, then a fresh full pull
              from Supabase will run. Local entity rows (projects, devices, files, etc.) are preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="px-5 pb-1">
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              <p className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Heads up
              </p>
              <ul className="mt-1.5 list-disc pl-4 text-muted-foreground space-y-0.5">
                <li>Pending pushes you haven&apos;t shipped yet will be dropped.</li>
                <li>If a specific row is failing because it&apos;s an orphan, you&apos;ll still need &quot;Forget locally&quot; on it from the inspector.</li>
                <li>This is safe to re-run — it won&apos;t corrupt your data.</li>
              </ul>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={running}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="gap-1.5"
              disabled={running}
              onClick={async () => {
                await run();
                setConfirmOpen(false);
              }}
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Reset sync state
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
