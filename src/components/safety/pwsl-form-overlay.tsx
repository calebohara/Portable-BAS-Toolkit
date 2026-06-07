'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldAlert, ExternalLink, AlertTriangle, CheckCircle2 } from 'lucide-react';

import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter,
  DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// The company Microsoft Forms Pre-Work Safety Log. It loads fine in a top-level
// browsing context (new tab / popup window) where the user's Microsoft session
// applies, but renders blank inside an <iframe> because third-party-cookie auth
// is blocked — so we open it in a sized companion window beside the tool rather
// than embedding it.
const FORM_URL =
  'https://forms.office.com/Pages/ResponsePage.aspx?id=zTuuOHmV1E-t2rQuFJXVWrqlf-kYGPpGmQwEjPzuQMxUOVkxNzZYSVpPTjlTMElQWVZKNUxVWU8xMS4u';
const SAFETY_WINDOW_NAME = 'pwsl-safety-log';

/**
 * Opens the Pre-Work Safety Log in a sized companion browser window pinned to
 * the right edge of the screen, so the user can complete it beside the tool
 * instead of juggling a background tab. Returns the window handle, or null if
 * the browser blocked the popup.
 */
function openSafetyWindow(): Window | null {
  if (typeof window === 'undefined') return null;

  const availW = window.screen?.availWidth ?? 1200;
  const availH = window.screen?.availHeight ?? 800;
  // screen.availLeft/availTop are non-standard but widely supported; default to 0.
  const availLeft = (window.screen as Screen & { availLeft?: number }).availLeft ?? 0;
  const availTop = (window.screen as Screen & { availTop?: number }).availTop ?? 0;

  const width = Math.max(440, Math.min(620, Math.floor(availW * 0.45)));
  const height = Math.max(560, Math.floor(availH * 0.92));
  const left = Math.round(availLeft + availW - width); // pin to the right edge
  const top = Math.round(availTop + Math.max(0, (availH - height) / 2));

  const features = `popup=yes,width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`;
  return window.open(FORM_URL, SAFETY_WINDOW_NAME, features);
}

export function PwslFormOverlay(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { open, onOpenChange } = props;
  const winRef = useRef<Window | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [windowClosed, setWindowClosed] = useState(false);

  const launch = useCallback(() => {
    const win = openSafetyWindow();
    winRef.current = win;
    if (win) {
      win.focus();
      setBlocked(false);
      setWindowClosed(false);
    } else {
      setBlocked(true);
    }
  }, []);

  // Auto-open the companion window when the overlay opens. This runs in the
  // transient-activation window of the user's "No" click, so popups are
  // normally allowed; if blocked, the UI offers a manual button.
  useEffect(() => {
    if (!open) return;
    // launch() opens the companion browser window (an external system) and must
    // run inside the transient-activation window of the user's click. The state
    // resets synchronize the overlay UI with that external action on the
    // open→true signal, so the synchronous setState here is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- launch-on-open syncs to an external window; gated on `open`
    setBlocked(false);
    setWindowClosed(false);
    launch();
  }, [open, launch]);

  // While open, watch whether the user closed the companion window.
  useEffect(() => {
    if (!open || blocked) return;
    const id = window.setInterval(() => {
      if (winRef.current && winRef.current.closed) {
        setWindowClosed(true);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [open, blocked]);

  const handleDone = () => {
    try {
      if (winRef.current && !winRef.current.closed) winRef.current.close();
    } catch {
      // cross-origin close can throw in rare cases — ignore.
    }
    winRef.current = null;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="sm:max-w-md">
        <DialogHeader className="bg-field-warning/10 border-field-warning/30">
          <div className="flex items-start gap-3">
            <div
              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-field-warning/15 text-field-warning"
              aria-hidden="true"
            >
              <ShieldAlert className="size-6" />
            </div>
            <div className="flex flex-col gap-1.5">
              <DialogTitle className="text-field-warning">
                Complete Your Pre-Work Safety Log
              </DialogTitle>
              <DialogDescription>
                The Pre-Work Safety Log opens in a window beside the tool so you
                don&apos;t lose your place.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="px-5 py-4">
          {blocked ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-field-warning/30 bg-field-warning/10 p-3">
              <AlertTriangle className="size-4 shrink-0 text-field-warning mt-0.5" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-medium text-foreground">Your browser blocked the safety window.</p>
                <p className="mt-0.5 text-muted-foreground">
                  Click the button below to open your Pre-Work Safety Log.
                </p>
              </div>
            </div>
          ) : windowClosed ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3">
              <CheckCircle2 className="size-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-medium text-foreground">Safety window closed.</p>
                <p className="mt-0.5 text-muted-foreground">
                  If you finished, confirm below. Otherwise reopen it.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3">
              <ExternalLink className="size-4 shrink-0 text-field-info mt-0.5" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-medium text-foreground">Safety log is open in a separate window.</p>
                <p className="mt-0.5 text-muted-foreground">
                  Complete it there, then come back and confirm. The tool stays
                  right here where you left it.
                </p>
              </div>
            </div>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Don&apos;t see it? Use <span className="font-medium text-foreground">Reopen safety window</span> below.
          </p>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={launch}
            className={cn(blocked && 'border-field-warning/40 text-field-warning hover:text-field-warning hover:bg-field-warning/10')}
          >
            <ExternalLink className="size-4" />
            {blocked ? 'Open safety window' : 'Reopen safety window'}
          </Button>
          <Button onClick={handleDone} className="font-semibold">
            I&apos;ve completed it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
