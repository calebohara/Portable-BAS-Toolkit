'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Download, RefreshCw, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
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
import { Progress, ProgressLabel } from '@/components/ui/progress';
import { isTauri } from '@/lib/tauri-bridge';
import { checkForUpdate, downloadAndInstall, type UpdateStatus } from '@/lib/updater';
import {
  APP_VERSION,
  shouldShowUpdate,
  setDismissedVersion,
  clearDismissedVersion,
  logUpdateDebug,
} from '@/lib/version';

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'error' | 'up-to-date';

export function UpdateNotifier() {
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<UpdateState>('idle');
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const hasCheckedRef = useRef(false);

  // Prevent hydration mismatch: render nothing until mounted on client
  useEffect(() => { setMounted(true); }, []);

  const doCheck = useCallback(async (silent = false) => {
    if (!isTauri()) return;

    setState('checking');
    setError(null);

    const result = await checkForUpdate();

    if (result.error) {
      setState('error');
      setError(result.error);
      if (!silent) setDialogOpen(true);
      return;
    }

    if (result.available && result.version) {
      // Check dismissal state — don't nag about versions the user already dismissed
      if (silent && !shouldShowUpdate(result.version)) {
        logUpdateDebug('dismissed', {
          latestVersion: result.version,
          reason: 'User previously dismissed this version',
        });
        setState('idle');
        return;
      }

      setState('available');
      setUpdate(result);
      setDialogOpen(true);
    } else {
      // Up to date — clear any stale dismissals since current version caught up
      clearDismissedVersion();
      setState('up-to-date');
      if (!silent) setDialogOpen(true);
      // Reset to idle after a few seconds if no update
      setTimeout(() => setState('idle'), 3000);
    }
  }, []);

  // Automatic check on startup (silent — no dialog if up-to-date or dismissed)
  useEffect(() => {
    if (!isTauri() || hasCheckedRef.current) return;
    hasCheckedRef.current = true;
    // Wait for app to settle before checking
    const timer = setTimeout(() => doCheck(true), 5000);
    return () => clearTimeout(timer);
  }, [doCheck]);

  const handleDismiss = useCallback(() => {
    // Persist dismissal so user isn't nagged on next launch
    if (update?.version) {
      setDismissedVersion(update.version);
      logUpdateDebug('user-dismissed', { dismissedVersion: update.version });
    }
    setDialogOpen(false);
  }, [update]);

  const handleDownload = async () => {
    setState('downloading');
    setProgress(0);

    try {
      await downloadAndInstall((p) => {
        if (p.contentLength) {
          setProgress(Math.round((p.chunkLength / p.contentLength) * 100));
        }
      });
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  };

  // Don't render until mounted (avoids SSR hydration mismatch), and skip in browser mode
  if (!mounted || !isTauri()) return null;

  return (
    <>
      {/* Manual check button — shown in sidebar footer */}
      <ManualCheckButton state={state} onClick={() => doCheck(false)} />

      {/* Update dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) handleDismiss(); else setDialogOpen(true); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {state === 'available' && 'Update Available'}
              {state === 'downloading' && 'Downloading Update'}
              {state === 'up-to-date' && 'You\'re Up to Date'}
              {state === 'error' && 'Update Error'}
              {state === 'checking' && 'Checking for Updates'}
            </DialogTitle>
            <DialogDescription>
              {state === 'available' && update && (
                <>
                  A new version <strong>v{update.version}</strong> is available.
                  <span className="block mt-1 text-xs opacity-70">Current: v{APP_VERSION}</span>
                </>
              )}
              {state === 'downloading' && 'Please wait while the update is being downloaded...'}
              {state === 'up-to-date' && `You are running the latest version (v${APP_VERSION}) of BAU Suite.`}
              {state === 'error' && (error || 'An error occurred while checking for updates.')}
              {state === 'checking' && 'Checking for new versions...'}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
          {/* Release notes */}
          {state === 'available' && update?.body && (
            <div className="px-5 pb-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">Release Notes</p>
              <div className="max-h-32 overflow-y-auto rounded-md bg-muted/50 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                {update.body}
              </div>
            </div>
          )}

          {/* Download progress */}
          {state === 'downloading' && (
            <div className="px-5 pb-2">
              <Progress value={progress}>
                <ProgressLabel>Downloading — {progress}%</ProgressLabel>
              </Progress>
            </div>
          )}

          {/* Status icons */}
          {state === 'up-to-date' && (
            <div className="flex justify-center py-4">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
            </div>
          )}
          {state === 'error' && (
            <div className="flex justify-center py-4">
              <AlertCircle className="h-12 w-12 text-destructive" />
            </div>
          )}
          </DialogBody>

          <DialogFooter>
            {state === 'available' && (
              <>
                <Button variant="outline" onClick={handleDismiss}>
                  Later
                </Button>
                <Button onClick={handleDownload}>
                  <Download className="mr-2 h-4 w-4" />
                  Download & Install
                </Button>
              </>
            )}
            {state === 'downloading' && (
              <Button variant="outline" disabled>
                Downloading...
              </Button>
            )}
            {(state === 'up-to-date' || state === 'error') && (
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Small button for the sidebar footer — manual "Check for Updates" */
function ManualCheckButton({
  state,
  onClick,
}: {
  state: UpdateState;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={state === 'checking' || state === 'downloading'}
      className="w-full justify-center gap-1.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground h-6"
    >
      <RefreshCw className={`h-3 w-3 ${state === 'checking' ? 'animate-spin' : ''}`} />
      {state === 'checking' ? 'Checking...' : state === 'available' ? 'Update Available!' : 'Check for Updates'}
    </Button>
  );
}
