'use client';

import { Download } from 'lucide-react';
import { SyncOperationDialog } from './sync-operation-dialog';

interface RestoreResult {
  pulled: number;
  deleted: number;
  errors: string[];
}

interface RestoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lastPulledAt: string | null;
  triggerPullSync: () => Promise<RestoreResult | null>;
}

export function RestoreDialog({ open, onOpenChange, lastPulledAt, triggerPullSync }: RestoreDialogProps) {
  return (
    <SyncOperationDialog<RestoreResult>
      open={open}
      onOpenChange={onOpenChange}
      title="Restore from Cloud"
      successTitle="Restore Complete"
      errorTitle="Restore had errors"
      runningTitle="Restoring your data…"
      runningDescription="Downloading from cloud and updating local database."
      confirmDescription="This will download all your data from the cloud to this device. Any matching local data will be overwritten."
      lastTimestamp={lastPulledAt}
      lastTimestampLabel="Last restored"
      actionLabel="Restore Now"
      actionIcon={Download}
      action={triggerPullSync}
      unavailableResult={{ pulled: 0, deleted: 0, errors: ['Sync not available — are you signed in?'] }}
      makeThrownResult={(msg) => ({ pulled: 0, deleted: 0, errors: [msg] })}
      renderSuccess={(res) => (
        <>
          {res.pulled} item{res.pulled !== 1 ? 's' : ''} restored
          {res.deleted > 0 && `, ${res.deleted} removed`}.
        </>
      )}
      renderErrorSummary={(res) =>
        res.pulled > 0
          ? `${res.pulled} item${res.pulled !== 1 ? 's' : ''} restored with ${res.errors.length} error${res.errors.length !== 1 ? 's' : ''}.`
          : `${res.errors.length} error${res.errors.length !== 1 ? 's' : ''} occurred.`
      }
    />
  );
}
