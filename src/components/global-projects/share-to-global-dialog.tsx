'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Globe, Check, AlertTriangle, Copy, ExternalLink,
  FileText, HardDrive, Network, ClipboardList, X,
} from 'lucide-react';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { copyToClipboard } from '@/lib/utils';
import { toast } from 'sonner';
import { migrateLocalToGlobal } from '@/lib/global-projects/migrate';
import type { Project, FieldNote, DeviceEntry, IpPlanEntry, DailyReport } from '@/types';
import type { MigrationResult } from '@/lib/global-projects/migrate';

interface ShareToGlobalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  notes: FieldNote[];
  devices: DeviceEntry[];
  ipEntries: IpPlanEntry[];
  reports: DailyReport[];
}

type DialogState = 'preview' | 'migrating' | 'success';

export function ShareToGlobalDialog({
  open,
  onOpenChange,
  project,
  notes,
  devices,
  ipEntries,
  reports,
}: ShareToGlobalDialogProps) {
  const router = useRouter();
  const [state, setState] = useState<DialogState>('preview');
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setState('preview');
    setProgressMessage('');
    setResult(null);
    setCopied(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && state === 'migrating') return; // prevent close during migration
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleMigrate = useCallback(async () => {
    setState('migrating');
    setProgressMessage('Preparing migration...');
    try {
      const migrationResult = await migrateLocalToGlobal(
        { project, notes, devices, ipEntries, reports },
        (step, current, total) => {
          setProgressMessage(`${step} (${current}/${total})...`);
        },
      );
      setResult(migrationResult);
      setState('success');
      toast.success('Project shared to Global successfully');
    } catch (err) {
      toast.error('Migration failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
      setState('preview');
    }
  }, [project, notes, devices, ipEntries, reports]);

  const handleCopyCode = async () => {
    if (!result) return;
    try {
      await copyToClipboard(result.accessCode);
      setCopied(true);
      toast.success('Access code copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

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
              Project Shared Successfully
            </DialogTitle>
            <DialogDescription>
              Your local project has been shared as a Global Project.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="px-5 py-4 space-y-4">
            {/* Access Code */}
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Access Code</p>
              <div className="flex items-center justify-center gap-2">
                <code className="rounded-lg bg-muted px-4 py-2 text-lg font-mono font-bold tracking-widest">
                  {result.accessCode}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={handleCopyCode}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            {/* Migration Summary */}
            <div className="rounded-md border p-3 space-y-1.5 text-sm">
              <p className="font-medium">Migration Summary</p>
              <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                <span>Notes migrated:</span>
                <span className="font-mono">{result.migrated.notes}</span>
                <span>Devices migrated:</span>
                <span className="font-mono">{result.migrated.devices}</span>
                <span>IP Entries migrated:</span>
                <span className="font-mono">{result.migrated.ipEntries}</span>
                <span>Reports migrated:</span>
                <span className="font-mono">{result.migrated.reports}</span>
              </div>
            </div>

            {/* Failure Warning */}
            {totalFailed > 0 && (
              <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 flex items-start gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-600 dark:text-yellow-400">
                    Some items failed to migrate
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
                router.push(`/global-projects/${result.globalProjectId}`);
              }}
            >
              <ExternalLink className="h-4 w-4" />
              View Global Project
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
              <Globe className="h-5 w-5 animate-spin" />
              Sharing to Global...
            </DialogTitle>
            <DialogDescription>
              Please wait while your project data is being migrated.
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
            <Globe className="h-5 w-5" />
            Share to Global Project
          </DialogTitle>
          <DialogDescription>
            Migrate your local project to a shared Global Project.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="px-5 py-4 space-y-4">
          {/* Project Name */}
          <div className="rounded-md border p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Project</p>
            <p className="font-semibold text-lg">{project.name}</p>
            {project.customerName && (
              <p className="text-sm text-muted-foreground">{project.customerName}</p>
            )}
          </div>

          {/* What Will Be Migrated */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Will be migrated</p>
            <div className="space-y-1.5">
              <MigrationItem icon={FileText} label="Notes" count={notes.length} included />
              <MigrationItem icon={HardDrive} label="Devices" count={devices.length} included />
              <MigrationItem icon={Network} label="IP Plan Entries" count={ipEntries.length} included />
              <MigrationItem icon={ClipboardList} label="Daily Reports" count={reports.length} included />
            </div>
          </div>

          {/* What Cannot Be Migrated */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Cannot be migrated</p>
            <div className="space-y-1.5 text-muted-foreground">
              <div className="flex items-center gap-2 text-sm">
                <X className="h-4 w-4 text-muted-foreground/60" />
                <span>Files (stored locally — must be re-uploaded)</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <X className="h-4 w-4 text-muted-foreground/60" />
                <span>Terminal logs, contacts, panel roster</span>
              </div>
            </div>
          </div>

          {/* Info Text */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            This will create a new Global Project and migrate all applicable data.
            Your local project will remain unchanged.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button className="gap-1.5" onClick={handleMigrate}>
            <Globe className="h-4 w-4" />
            Share to Global
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MigrationItem({
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
