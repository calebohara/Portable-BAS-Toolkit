'use client';

import { format } from 'date-fns';
import { History, Upload, StickyNote, Settings, FolderPlus, FileText } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import type { ActivityLogEntry } from '@/types';
import { cn } from '@/lib/utils';

interface Props {
  activity: ActivityLogEntry[];
}

export const actionIcons: Record<string, typeof History> = {
  'File uploaded': Upload,
  'file_uploaded': Upload,
  'Note added': StickyNote,
  'note_added': StickyNote,
  'Status changed': Settings,
  'status_changed': Settings,
  'Project created': FolderPlus,
  'project_created': FolderPlus,
  'Device added': Settings,
  'Device updated': Settings,
  'IP entry added': Settings,
  'IP entry updated': Settings,
  'Diagram created': Settings,
  'Terminal log attached': Settings,
};

export function ActivityTimeline({ activity }: Props) {
  if (activity.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No activity yet"
        description="Activity will appear here as you work on this project."
      />
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Revision History</h2>
      <div className="relative space-y-0">
        {/* Timeline line */}
        <div className="absolute left-4 top-2 bottom-2 w-px bg-border" />

        {activity.map((entry, i) => {
          const Icon = actionIcons[entry.action] || FileText;
          return (
            <div key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
              <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="min-w-0 pt-0.5">
                <p className="text-sm font-medium">{entry.action}</p>
                <p className="text-sm text-muted-foreground">{entry.details}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {entry.user} — {format(new Date(entry.timestamp), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
