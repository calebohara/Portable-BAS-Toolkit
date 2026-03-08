'use client';

import { cn } from '@/lib/utils';
import type { ProjectStatus, FileStatus } from '@/types';

const projectStatusStyles: Record<ProjectStatus, string> = {
  active: 'bg-field-success/10 text-field-success border-field-success/20',
  'on-hold': 'bg-field-warning/10 text-field-warning border-field-warning/20',
  completed: 'bg-primary/10 text-primary border-primary/20',
  archived: 'bg-muted text-muted-foreground border-border',
};

const fileStatusStyles: Record<FileStatus, string> = {
  current: 'bg-field-success/10 text-field-success border-field-success/20',
  previous: 'bg-muted text-muted-foreground border-border',
  archived: 'bg-muted text-muted-foreground border-border',
  'field-verified': 'bg-primary/10 text-primary border-primary/20',
  superseded: 'bg-field-warning/10 text-field-warning border-field-warning/20',
  'backup-snapshot': 'bg-field-info/10 text-field-info border-field-info/20',
  obsolete: 'bg-field-danger/10 text-field-danger border-field-danger/20',
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const labels: Record<ProjectStatus, string> = {
    active: 'Active', 'on-hold': 'On Hold', completed: 'Completed', archived: 'Archived',
  };
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', projectStatusStyles[status])}>
      {labels[status]}
    </span>
  );
}

export function FileStatusBadge({ status }: { status: FileStatus }) {
  const labels: Record<FileStatus, string> = {
    current: 'Current', previous: 'Previous', archived: 'Archived',
    'field-verified': 'Field Verified', superseded: 'Superseded',
    'backup-snapshot': 'Backup Snapshot', obsolete: 'Obsolete',
  };
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', fileStatusStyles[status])}>
      {labels[status]}
    </span>
  );
}
