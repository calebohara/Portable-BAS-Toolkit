'use client';

import { useState, useCallback } from 'react';
import {
  FolderKanban, Check, AlertTriangle, ExternalLink,
  FileText, HardDrive, Network, ClipboardList, X,
} from 'lucide-react';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { migrateGlobalToLocal } from '@/lib/global-projects/migrate';
import type { ImportResult } from '@/lib/global-projects/migrate';
import type {
  GlobalProject,
  GlobalFieldNote,
  GlobalDevice,
  GlobalIpPlanEntry,
  GlobalDailyReport,
} from '@/types/global-projects';

interface SaveToLocalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: GlobalProject;
  notes: GlobalFieldNote[];
  devices: GlobalDevice[];
  ipEntries: GlobalIpPlanEntry[];
  reports: GlobalDailyReport[];
  onSaved?: (localProjectId: string) => void;
}

type DialogState = 'preview' | 'migrating' | 'success';

export function SaveToLocalDialog({
  open,
  onOpenChange,
  project,
  notes,
  devices,
  ipEntries,
  reports,
  onSaved,
}: SaveToLocalDialogProps) {
  const [state, setState] = useState<DialogState>('preview');
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setState('preview');
    setProgressMessage('');
    setResult(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && state === 'migrating') return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleImport = useCallback(async () => {
    setState('migrating');
    setProgressMessage('Preparing import...');
    try {
      const importResult = await migrateGlobalToLocal(
        { project, notes, devices, ipEntries, reports },
        (step, current, total) => {
          setProgressMessage(`${step} (${current}/${total})...`);
        },
      );
      setResult(importResult);
      setState('success');
      toast.success('Project saved to My Projects');
    } catch (err) {
      toast.error('Import failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
      setState('preview');
    }
  }, [project, notes, devices, ipEntries, reports]);

  const totalFailed = result
    ? result.failed.notes + result.failed.devices + result.failed.ipEntries + result.failed.reports
    : 0;

  // State 3: Success
  if (state === 'success' && result) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              Saved to My Projects
            </DialogTitle>
            <DialogDescription>
              The global project has been saved as a local project.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="px-5 py-4 space-y-4">
            {/* Import Summary */}
            <div className="rounded-md border p-3 space-y-1.5 text-sm">
              <p className="font-medium">Import Summary</p>
              <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                <span>Notes imported:</span>
                <span className="font-mono">{result.migrated.notes}</span>
                <span>Devices imported:</span>
                <span className="font-mono">{result.migrated.devices}</span>
                <span>IP Entries imported:</span>
                <span className="font-mono">{result.migrated.ipEntries}</span>
                <span>Reports imported:</span>
                <span className="font-mono">{result.migrated.reports}</span>
              </div>
            </div>

            {/* Failure Warning */}
            {totalFailed > 0 && (
              <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 flex items-start gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-600 dark:text-yellow-400">
                    Some items failed to import
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    {result.failed.notes > 0 && `${result.failed.notes} notes, `}
                    {result.failed.devices > 0 && `${result.failed.devices} devices, `}
                    {result.failed.ipEntries > 0 && `${result.failed.ipEntries} IP entries, `}
                    {result.failed.reports > 0 && `${result.failed.reports} reports`}
                  </p>
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
            <Button
              className="gap-1.5"
              onClick={() => {
                handleOpenChange(false);
                onSaved?.(result.localProjectId);
              }}
            >
              <ExternalLink className="h-4 w-4" />
              View Local Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // State 2: Migrating
  if (state === 'migrating') {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5 animate-spin" />
              Saving to My Projects...
            </DialogTitle>
            <DialogDescription>
              Please wait while the project data is being imported.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="px-5 py-6">
            <div className="flex flex-col items-center gap-3">
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full w-1/2 rounded-full bg-primary animate-pulse" />
              </div>
              <p className="text-sm text-muted-foreground">{progressMessage}</p>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    );
  }

  // State 1: Preview
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderKanban className="h-5 w-5" />
            Save to My Projects
          </DialogTitle>
          <DialogDescription>
            Import this Global Project into your local projects.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="px-5 py-4 space-y-4">
          {/* Project Name */}
          <div className="rounded-md border p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Global Project</p>
            <p className="font-semibold text-lg">{project.name}</p>
            {project.jobSiteName && (
              <p className="text-sm text-muted-foreground">{project.jobSiteName}</p>
            )}
          </div>

          {/* What Will Be Imported */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Will be imported</p>
            <div className="space-y-1.5">
              <ImportItem icon={FileText} label="Notes" count={notes.length} included />
              <ImportItem icon={HardDrive} label="Devices" count={devices.length} included />
              <ImportItem icon={Network} label="IP Plan Entries" count={ipEntries.length} included />
              <ImportItem icon={ClipboardList} label="Daily Reports" count={reports.length} included />
            </div>
          </div>

          {/* What Cannot Be Imported */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Cannot be imported</p>
            <div className="space-y-1.5 text-muted-foreground">
              <div className="flex items-center gap-2 text-sm">
                <X className="h-4 w-4 text-muted-foreground/60" />
                <span>Files (stored in cloud — must be re-uploaded locally)</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <X className="h-4 w-4 text-muted-foreground/60" />
                <span>Member list, activity log</span>
              </div>
            </div>
          </div>

          {/* Info Text */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            This will create a new local project with a copy of the data.
            The Global Project will remain unchanged.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button className="gap-1.5" onClick={handleImport}>
            <FolderKanban className="h-4 w-4" />
            Save to My Projects
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportItem({
  icon: Icon,
  label,
  count,
  included,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  included: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        {included ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <X className="h-4 w-4 text-muted-foreground/60" />
        )}
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <Badge variant="secondary" className="font-mono text-xs">
        {count}
      </Badge>
    </div>
  );
}
