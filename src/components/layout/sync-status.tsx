'use client';

import { useEffect, useState } from 'react';
import { CloudOff, Loader2, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/providers/auth-provider';
import { useSyncContext } from '@/providers/sync-provider';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SyncConflictsDialog } from '@/components/settings/sync-conflicts-dialog';
import { SyncErrorInspectorDialog } from '@/components/sync/sync-error-inspector-dialog';
import { reportSyncErrorAsBug } from '@/lib/sync/report-sync-error';

const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

function getRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function SyncStatusIndicator({ collapsed }: { collapsed?: boolean }) {
  const { mode, user, profile } = useAuth();
  const syncStatus = useAppStore((s) => s.syncStatus);
  const pendingCount = useAppStore((s) => s.pendingSyncCount);
  const lastSyncedAt = useAppStore((s) => s.lastSyncedAt);
  const conflictCount = useAppStore((s) => s.syncConflictCount);
  const { triggerFullSync } = useSyncContext();

  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  // Re-render every 30s to keep relative time fresh — pause when tab is hidden
  const [, setTick] = useState(0);
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { id = setInterval(() => setTick((t) => t + 1), 30_000); };
    const stop = () => { if (id !== null) { clearInterval(id); id = null; } };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') start(); else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  if (mode !== 'authenticated' || syncStatus === 'disabled') return null;

  const isStale = lastSyncedAt
    ? Date.now() - new Date(lastSyncedAt).getTime() > STALE_THRESHOLD_MS
    : true;

  const relativeTime = lastSyncedAt ? getRelativeTime(lastSyncedAt) : null;

  // Determine visual state
  let icon = CheckCircle2;
  let label = '';
  let sublabel = '';
  let colorClass = 'text-emerald-500';
  let bgClass = 'hover:bg-emerald-500/10';
  let animate = false;

  if (conflictCount > 0) {
    icon = AlertTriangle;
    label = `${conflictCount} conflict${conflictCount === 1 ? '' : 's'}`;
    sublabel = 'Tap to resolve';
    colorClass = 'text-amber-500';
    bgClass = 'hover:bg-amber-500/10';
  } else if (syncStatus === 'offline') {
    icon = CloudOff;
    label = 'Offline';
    sublabel = relativeTime ? `Last backup ${relativeTime}` : '';
    colorClass = 'text-muted-foreground';
    bgClass = 'hover:bg-muted/50';
  } else if (syncStatus === 'syncing') {
    icon = Loader2;
    label = `Syncing${pendingCount > 0 ? ` (${pendingCount})` : ''}…`;
    sublabel = '';
    colorClass = 'text-primary';
    bgClass = 'hover:bg-primary/10';
    animate = true;
  } else if (syncStatus === 'error') {
    icon = AlertTriangle;
    label = `${pendingCount} failed`;
    sublabel = pendingCount > 0 ? 'Tap to inspect' : 'Tap to retry';
    colorClass = 'text-red-500';
    bgClass = 'hover:bg-red-500/10';
  } else if (isStale) {
    // idle but stale (>1h since last sync or never synced)
    icon = RefreshCw;
    label = 'Back Up Now';
    sublabel = relativeTime ? `Last: ${relativeTime}` : 'Not yet backed up';
    colorClass = 'text-amber-500';
    bgClass = 'hover:bg-amber-500/10';
  } else {
    // idle and recent
    icon = CheckCircle2;
    label = `Backed up ${relativeTime}`;
    sublabel = '';
    colorClass = 'text-emerald-500';
    bgClass = 'hover:bg-emerald-500/10';
  }

  const Icon = icon;

  const handleClick = () => {
    if (conflictCount > 0) {
      setConflictsOpen(true);
    } else if (syncStatus === 'error' && pendingCount > 0) {
      setInspectorOpen(true);
    } else {
      triggerFullSync();
    }
  };

  const handleReport = async (error: Parameters<typeof reportSyncErrorAsBug>[0]) => {
    await reportSyncErrorAsBug(error, {
      userName: profile?.displayName ?? user?.email ?? undefined,
    });
    toast.success('Report drafted — see Settings → Bug Reports');
  };

  // Collapsed mode: icon-only with tooltip
  if (collapsed) {
    return (
      <div>
        <Tooltip>
          <TooltipTrigger render={<span className="block w-full" />}>
            <button
              onClick={handleClick}
              className={cn(
                'flex w-full items-center justify-center rounded-lg p-2 transition-colors',
                bgClass,
                colorClass,
              )}
              aria-label={label}
            >
              <Icon className={cn('h-4.5 w-4.5', animate && 'animate-spin')} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            <p className="font-medium">{label}</p>
            {sublabel && <p className="text-[10px] text-muted-foreground">{sublabel}</p>}
            <p className="text-[10px] text-muted-foreground">Click to back up now</p>
          </TooltipContent>
        </Tooltip>
        <SyncConflictsDialog open={conflictsOpen} onOpenChange={setConflictsOpen} />
        <SyncErrorInspectorDialog
          open={inspectorOpen}
          onOpenChange={setInspectorOpen}
          onReport={handleReport}
        />
      </div>
    );
  }

  // Expanded mode: full-width button with label + sublabel
  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors',
          bgClass,
          colorClass,
        )}
      >
        <Icon className={cn('h-4.5 w-4.5 shrink-0', animate && 'animate-spin')} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{label}</p>
          {sublabel && (
            <p className="truncate text-[10px] text-muted-foreground">{sublabel}</p>
          )}
        </div>
      </button>
      <SyncConflictsDialog open={conflictsOpen} onOpenChange={setConflictsOpen} />
      <SyncErrorInspectorDialog
        open={inspectorOpen}
        onOpenChange={setInspectorOpen}
        onReport={handleReport}
      />
    </div>
  );
}
