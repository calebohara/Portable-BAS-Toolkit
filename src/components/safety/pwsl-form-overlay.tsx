'use client';

import { useEffect, useRef, useState } from 'react';
import { ShieldAlert, ExternalLink, X, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Base responder URL (used for the "open in new tab" escape hatch) and the
// embed variant (used inside the iframe — &embed=true gives a chromeless,
// frame-friendly layout). Microsoft Forms permits embedding (no X-Frame-Options
// and no CSP frame-ancestors), so this renders inline for anonymous forms and
// for users whose browser carries their Microsoft session.
const FORM_BASE_URL =
  'https://forms.office.com/Pages/ResponsePage.aspx?id=zTuuOHmV1E-t2rQuFJXVWrqlf-kYGPpGmQwEjPzuQMxUOVkxNzZYSVpPTjlTMElQWVZKNUxVWU8xMS4u';
const FORM_EMBED_URL = `${FORM_BASE_URL}&embed=true`;

// MS Forms is a single-page app; the shell fires onLoad fast but the form can
// take a moment to paint. Only treat it as un-embeddable if onLoad never fires.
const LOAD_TIMEOUT_MS = 12000;

export function PwslFormOverlay(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { open, onOpenChange } = props;
  const [loaded, setLoaded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = () => onOpenChange(false);

  // Reset load state each time the overlay opens.
  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    setBlocked(false);
  }, [open]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // If the iframe never fires onLoad, surface the fallback panel.
  useEffect(() => {
    if (!open || loaded) return;
    timerRef.current = setTimeout(() => setBlocked(true), LOAD_TIMEOUT_MS);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [open, loaded]);

  if (!open) return null;

  const handleLoad = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setLoaded(true);
    setBlocked(false);
  };

  return (
    <div
      className={cn(
        'fixed inset-0 z-[60] flex flex-col bg-background',
        'animate-in fade-in-0 slide-in-from-bottom-2 duration-200'
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Pre-Work Safety Log"
    >
      {/* App bar */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-field-warning/10 text-field-warning">
            <ShieldAlert className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">
              Pre-Work Safety Log
            </p>
            <p className="truncate text-xs leading-tight text-muted-foreground">
              Complete before work begins
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* Always-available escape hatch in case the embed can't render
              (e.g. third-party-cookie auth blocks the org sign-in). */}
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<a href={FORM_BASE_URL} target="_blank" rel="noopener noreferrer" />}
          >
            <ExternalLink className="size-4" />
            <span className="hidden sm:inline">Open in new tab</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={close}
            aria-label="Close safety log"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Iframe + states */}
      <div className="relative flex-1 bg-white">
        {/* No `sandbox` attribute: this is the company's own trusted Microsoft
            Forms origin, and sandboxing can break MS sign-in / cookies / storage
            that the form needs to render for authenticated users. */}
        <iframe
          src={FORM_EMBED_URL}
          className="h-full w-full border-0"
          title="Pre-Work Safety Log form"
          onLoad={handleLoad}
        />

        {/* Loading shimmer until the form paints */}
        {!loaded && !blocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background">
            <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-label="Loading" />
            <p className="text-sm text-muted-foreground">Loading your safety log…</p>
          </div>
        )}

        {/* Fallback if the form never loads */}
        {blocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-background px-6 text-center animate-in fade-in-0 duration-200">
            <div className="flex size-14 items-center justify-center rounded-full bg-field-warning/10 text-field-warning">
              <AlertTriangle className="size-7" />
            </div>
            <div className="space-y-1.5">
              <p className="text-base font-semibold">
                The safety log is taking too long to load.
              </p>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                Open it in a new tab to complete your Pre-Work Safety Log, then
                return here.
              </p>
            </div>
            <div className="flex flex-col items-center gap-2 sm:flex-row">
              <Button
                nativeButton={false}
                render={<a href={FORM_BASE_URL} target="_blank" rel="noopener noreferrer" />}
              >
                <ExternalLink className="size-4" />
                Open in a new tab
              </Button>
              <Button variant="outline" onClick={close}>
                Go back
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
