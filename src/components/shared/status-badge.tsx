'use client';

import { Badge } from '@/components/ui/badge';
import type { ProjectStatus, FileStatus } from '@/types';

const projectStatusVariant: Record<ProjectStatus, 'success' | 'warning' | 'info' | 'outline'> = {
  active: 'success',
  'on-hold': 'warning',
  completed: 'info',
  archived: 'outline',
};

const fileStatusVariant: Record<FileStatus, 'success' | 'warning' | 'info' | 'danger' | 'outline'> = {
  current: 'success',
  previous: 'outline',
  archived: 'outline',
  'field-verified': 'info',
  superseded: 'warning',
  'backup-snapshot': 'info',
  obsolete: 'danger',
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const labels: Record<ProjectStatus, string> = {
    active: 'Active', 'on-hold': 'On Hold', completed: 'Completed', archived: 'Archived',
  };
  return (
    <Badge variant={projectStatusVariant[status]}>
      {labels[status]}
    </Badge>
  );
}

export function FileStatusBadge({ status }: { status: FileStatus }) {
  const labels: Record<FileStatus, string> = {
    current: 'Current', previous: 'Previous', archived: 'Archived',
    'field-verified': 'Field Verified', superseded: 'Superseded',
    'backup-snapshot': 'Backup Snapshot', obsolete: 'Obsolete',
  };
  return (
    <Badge variant={fileStatusVariant[status]}>
      {labels[status]}
    </Badge>
  );
}
