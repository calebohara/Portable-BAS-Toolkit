'use client';

import { useState } from 'react';
import { useOnlineUsers } from '@/hooks/use-online-users';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronDown, ChevronUp } from 'lucide-react';

function UserAvatar({ name, avatarUrl, size = 'sm' }: { name: string; avatarUrl: string | null; size?: 'sm' | 'xs' }) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const sizeClasses = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-5 w-5 text-[9px]';

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={cn('rounded-full object-cover shrink-0', sizeClasses)}
      />
    );
  }

  return (
    <div
      className={cn(
        'rounded-full bg-primary/20 text-primary font-medium flex items-center justify-center shrink-0',
        sizeClasses,
      )}
    >
      {initials}
    </div>
  );
}

export function OnlineUsers({ collapsed }: { collapsed: boolean }) {
  const { onlineUsers, count } = useOnlineUsers();
  const [expanded, setExpanded] = useState(false);

  if (count === 0) return null;

  // Collapsed sidebar: just show pulsing dot + count with tooltip
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs text-muted-foreground hover:bg-sidebar-accent transition-colors"
            />
          }
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="font-medium text-sidebar-foreground">{count}</span>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          <div className="space-y-1">
            <p className="font-medium text-xs">{count} Online</p>
            {onlineUsers.map((u) => (
              <div key={u.userId} className="flex items-center gap-2 text-xs">
                <UserAvatar name={u.displayName} avatarUrl={u.avatarUrl} size="xs" />
                <span>{u.displayName}</span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  // Expanded sidebar: show pulsing dot + count, expandable user list
  return (
    <div className="rounded-lg">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-sidebar-accent transition-colors"
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
        <span className="font-medium text-sidebar-foreground">
          {count} Online
        </span>
        <span className="ml-auto">
          {expanded ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="mt-1 space-y-0.5 px-2 pb-1">
          {onlineUsers.map((u) => (
            <div
              key={u.userId}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/80"
            >
              <UserAvatar name={u.displayName} avatarUrl={u.avatarUrl} />
              <span className="truncate">{u.displayName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
