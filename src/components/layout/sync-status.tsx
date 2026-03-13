'use client';

import { Cloud, CloudOff, Loader2, AlertTriangle, Check } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/providers/auth-provider';
import { useSyncContext } from '@/providers/sync-provider';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function SyncStatusIndicator({ collapsed }: { collapsed?: boolean }) {
  const { mode } = useAuth();
  const syncStatus = useAppStore((s) => s.syncStatus);
  const pendingCount = useAppStore((s) => s.pendingSyncCount);
  const lastSyncedAt = useAppStore((s) => s.lastSyncedAt);
  const { triggerFullSync } = useSyncContext();

  // Don't show when not authenticated
  if (mode !== 'authenticated' || syncStatus === 'disabled') return null;

  const statusConfig = {
    idle: {
      icon: Check,
      label: 'Synced',
      color: 'text-emerald-500',
      animate: false,
    },
    syncing: {
      icon: Loader2,
      label: `Syncing${pendingCount > 0 ? ` (${pendingCount})` : ''}`,
      color: 'text-primary',
      animate: true,
    },
    error: {
      icon: AlertTriangle,
      label: `${pendingCount} failed`,
      color: 'text-field-warning',
      animate: false,
    },
    offline: {
      icon: CloudOff,
      label: 'Offline',
      color: 'text-muted-foreground',
      animate: false,
    },
  } as const;

  const config = statusConfig[syncStatus === 'disabled' ? 'idle' : syncStatus];
  const Icon = config.icon;

  const lastSyncLabel = lastSyncedAt
    ? `Last backed up ${new Date(lastSyncedAt).toLocaleTimeString()}`
    : 'Not yet backed up';

  const content = (
    <button
      onClick={() => triggerFullSync()}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
        'hover:bg-sidebar-accent',
        config.color,
      )}
    >
      <Cloud className="h-3.5 w-3.5 shrink-0" />
      {!collapsed && (
        <div className="flex items-center gap-1.5 overflow-hidden">
          <Icon className={cn('h-3 w-3 shrink-0', config.animate && 'animate-spin')} />
          <span className="truncate">{config.label}</span>
        </div>
      )}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger render={<span className="block" />}>
          {content}
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          <p>{config.label}</p>
          <p className="text-[10px] text-muted-foreground">{lastSyncLabel}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="block" />}>
        {content}
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        <p>{lastSyncLabel}</p>
        <p className="text-[10px] text-muted-foreground">Click to back up now</p>
      </TooltipContent>
    </Tooltip>
  );
}
