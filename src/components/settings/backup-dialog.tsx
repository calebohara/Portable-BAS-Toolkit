'use client';

import { Upload } from 'lucide-react';
import { SyncOperationDialog } from './sync-operation-dialog';

interface BackupResult {
  enqueued: number;
  errors: string[];
}

interface BackupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lastSyncedAt: string | null;
  triggerFullSync: () => Promise<BackupResult | null>;
}

export function BackupDialog({ open, onOpenChange, lastSyncedAt, triggerFullSync }: BackupDialogProps) {
  return (
    <SyncOperationDialog<BackupResult>
      open={open}
      onOpenChange={onOpenChange}
      title="Back Up to Cloud"
      successTitle="Backup Complete"
      errorTitle="Backup had errors"
      runningTitle="Backing up your data…"
      runningDescription="Uploading local data to the cloud."
      confirmDescription="This will upload all your local data to the cloud. Existing cloud data will be updated."
      lastTimestamp={lastSyncedAt}
      lastTimestampLabel="Last backed up"
      actionLabel="Back Up Now"
      actionIcon={Upload}
      action={triggerFullSync}
      unavailableResult={{ enqueued: 0, errors: ['Sync not available — are you signed in?'] }}
      makeThrownResult={(msg) => ({ enqueued: 0, errors: [msg] })}
      renderSuccess={(res) =>
        res.enqueued > 0
          ? `${res.enqueued} item${res.enqueued !== 1 ? 's' : ''} backed up.`
          : 'Everything is up to date — no new data to back up.'
      }
      renderErrorSummary={(res) =>
        res.enqueued > 0
          ? `${res.enqueued} item${res.enqueued !== 1 ? 's' : ''} enqueued with ${res.errors.length} error${res.errors.length !== 1 ? 's' : ''}.`
          : `${res.errors.length} error${res.errors.length !== 1 ? 's' : ''} occurred.`
      }
    />
  );
}
