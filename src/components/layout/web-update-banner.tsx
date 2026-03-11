'use client';

import { useEffect, useState } from 'react';
import { ArrowUpCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isTauri } from '@/lib/tauri-bridge';
import {
  APP_VERSION,
  fetchLatestRelease,
  shouldShowUpdate,
  setDismissedVersion,
  logUpdateDebug,
  type GitHubRelease,
} from '@/lib/version';
import { cn } from '@/lib/utils';

/**
 * Lightweight update banner for the web app.
 * Checks GitHub releases and shows a dismissable banner if a newer version exists.
 *
 * Only renders in the browser (non-Tauri). Desktop uses the Tauri updater instead.
 */
export function WebUpdateBanner() {
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    // Skip in desktop app — Tauri has its own updater
    if (!mounted || isTauri()) return;

    // Delay check to let app settle
    const timer = setTimeout(async () => {
      const latest = await fetchLatestRelease();
      if (!latest) {
        logUpdateDebug('web-check', { result: 'fetch-failed-or-no-release' });
        return;
      }

      const version = latest.tag_name.replace(/^v/, '');

      logUpdateDebug('web-check', {
        latestVersion: version,
        shouldShow: shouldShowUpdate(version),
      });

      if (shouldShowUpdate(version)) {
        setRelease(latest);
        setVisible(true);
      }
    }, 8000); // 8s — after app is fully loaded

    return () => clearTimeout(timer);
  }, [mounted]);

  const handleDismiss = () => {
    if (release) {
      const version = release.tag_name.replace(/^v/, '');
      setDismissedVersion(version);
      logUpdateDebug('web-dismissed', { dismissedVersion: version });
    }
    setVisible(false);
  };

  const handleViewRelease = () => {
    if (release) {
      window.open(release.html_url, '_blank', 'noopener,noreferrer');
    }
  };

  if (!mounted || isTauri() || !visible || !release) return null;

  const latestVersion = release.tag_name.replace(/^v/, '');

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100%-2rem)]',
        'animate-in fade-in-0 slide-in-from-bottom-4 duration-300'
      )}
    >
      <div className="rounded-xl border border-primary/20 bg-card p-4 shadow-lg ring-1 ring-foreground/5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <ArrowUpCircle className="h-5 w-5 text-primary" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              BAU Suite v{latestVersion} Available
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              You&apos;re running v{APP_VERSION}. A newer version is available.
            </p>

            <div className="mt-2.5 flex items-center gap-2">
              <Button size="sm" onClick={handleViewRelease} className="h-7 px-2.5 text-xs gap-1">
                View Release
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDismiss} className="h-7 px-2.5 text-xs text-muted-foreground">
                Dismiss
              </Button>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="shrink-0 rounded-md p-1 text-muted-foreground/60 hover:text-foreground transition-colors"
            aria-label="Dismiss update notification"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
