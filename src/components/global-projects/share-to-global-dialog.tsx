'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Globe, Check, AlertTriangle, Copy, ExternalLink,
  FileText, HardDrive, Network, ClipboardList, FolderOpen,
  GitBranch, FileCode, Terminal, Activity, Wind, Calculator,
  Radio, LineChart, Plug, X,
} from 'lucide-react';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { copyToClipboard } from '@/lib/utils';
import { toast } from 'sonner';
import { reconcileLocalToGlobal, type ReconcileResult } from '@/lib/global-projects/reconcile';
import { navigateToGlobalProject } from '@/lib/routes';
import type { Project } from '@/types';
import {
  getProjectNotes, getProjectDevices, getProjectIpPlan,
  getProjectDailyReports, getProjectDiagrams, getProjectFiles,
  getProjectPpclDocuments, getProjectTerminalLogs,
  getProjectPidTuningSessions, getProjectPsychSessions,
  getProjectRegisterCalculations, getProjectPingSessions,
  getProjectTrendSessions, getProjectConnectionProfiles,
} from '@/lib/db';

interface ShareToGlobalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
}

type DialogState = 'preview' | 'sharing' | 'success';

interface EntityCounts {
  notes: number;
  devices: number;
  ipEntries: number;
  reports: number;
  diagrams: number;
  files: number;
  ppcl: number;
  terminalLogs: number;
  pidSessions: number;
  psychSessions: number;
  registerCalcs: number;
  pingSessions: number;
  trendSessions: number;
  connectionProfiles: number;
}

const ZERO_COUNTS: EntityCounts = {
  notes: 0, devices: 0, ipEntries: 0, reports: 0, diagrams: 0, files: 0,
  ppcl: 0, terminalLogs: 0, pidSessions: 0, psychSessions: 0,
  registerCalcs: 0, pingSessions: 0, trendSessions: 0, connectionProfiles: 0,
};

export function ShareToGlobalDialog({
  open,
  onOpenChange,
  project,
}: ShareToGlobalDialogProps) {
  const router = useRouter();
  const [state, setState] = useState<DialogState>('preview');
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [counts, setCounts] = useState<EntityCounts>(ZERO_COUNTS);

  // Load entity counts when the dialog opens.
  useEffect(() => {
    if (!open || state !== 'preview') return;
    let cancelled = false;
    (async () => {
      try {
        const [
          notes, devices, ipEntries, reports, diagrams, files,
          ppcl, terminalLogs, pidSessions, psychSessions,
          registerCalcs, pingSessions, trendSessions, connectionProfiles,
        ] = await Promise.all([
          getProjectNotes(project.id),
          getProjectDevices(project.id),
          getProjectIpPlan(project.id),
          getProjectDailyReports(project.id),
          getProjectDiagrams(project.id),
          getProjectFiles(project.id),
          getProjectPpclDocuments(project.id),
          getProjectTerminalLogs(project.id),
          getProjectPidTuningSessions(project.id),
          getProjectPsychSessions(project.id),
          getProjectRegisterCalculations(project.id),
          getProjectPingSessions(project.id),
          getProjectTrendSessions(project.id),
          getProjectConnectionProfiles(project.id),
        ]);
        if (cancelled) return;
        setCounts({
          notes: notes.length,
          devices: devices.length,
          ipEntries: ipEntries.length,
          reports: reports.length,
          diagrams: diagrams.length,
          files: files.length,
          ppcl: ppcl.length,
          terminalLogs: terminalLogs.length,
          pidSessions: pidSessions.length,
          psychSessions: psychSessions.length,
          registerCalcs: registerCalcs.length,
          pingSessions: pingSessions.length,
          trendSessions: trendSessions.length,
          connectionProfiles: connectionProfiles.length,
        });
      } catch (e) {
        console.warn('[share-to-global] failed to load counts:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [open, state, project.id]);

  const reset = () => {
    setState('preview');
    setProgressMessage('');
    setResult(null);
    setCopied(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && state === 'sharing') return; // prevent close during sync
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleShare = useCallback(async () => {
    setState('sharing');
    setProgressMessage('Preparing share...');
    try {
      const shareResult = await reconcileLocalToGlobal(
        project.id,
        (step, current, total) => {
          setProgressMessage(`${step} (${current}/${total})...`);
        },
      );
      setResult(shareResult);
      setState('success');
      toast.success('Project shared to Global successfully');
    } catch (err) {
      toast.error('Share failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
      setState('preview');
    }
  }, [project.id]);

  const handleCopyCode = async () => {
    if (!result?.accessCode) return;
    try {
      await copyToClipboard(result.accessCode);
      setCopied(true);
      toast.success('Access code copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const totalPushed = result
    ? Object.values(result.counts).reduce((sum, c) => sum + c.pushed, 0)
    : 0;
  const totalFailed = result
    ? Object.values(result.counts).reduce((sum, c) => sum + c.failed, 0)
    : 0;
  const totalSkipped = result
    ? Object.values(result.counts).reduce((sum, c) => sum + c.skipped, 0)
    : 0;

  // State 3: Success
  if (state === 'success' && result) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              {result.isNewProject ? 'Project Shared Successfully' : 'Updates Shared'}
            </DialogTitle>
            <DialogDescription>
              {result.isNewProject
                ? 'Your local project has been shared as a Global Project.'
                : 'Local updates have been shared to the Global Project.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="px-5 py-4 space-y-4">
            {/* Access Code — only when a new global project was created */}
            {result.accessCode && (
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
            )}

            {/* Share Summary */}
            <div className="rounded-md border p-3 space-y-1.5 text-sm">
              <p className="font-medium">Share Summary</p>
              <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                <span>Rows pushed:</span>
                <span className="font-mono">{totalPushed}</span>
                <span>Rows unchanged:</span>
                <span className="font-mono">{totalSkipped}</span>
                <span>Rows failed:</span>
                <span className="font-mono">{totalFailed}</span>
              </div>
            </div>

            {totalFailed > 0 && (
              <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 flex items-start gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-600 dark:text-yellow-400">
                    Some rows failed to share
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    Check the browser console for per-entity error details.
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
                navigateToGlobalProject(router, result.globalProjectId);
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

  // State 2: Sharing
  if (state === 'sharing') {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 animate-spin" />
              Sharing to Global...
            </DialogTitle>
            <DialogDescription>
              Please wait while your project data is being shared.
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
            {project.syncedGlobalId
              ? 'Share local updates to the linked Global Project.'
              : 'Share your local project to a new Global Project.'}
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

          {/* What Will Be Shared */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Will be shared</p>
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
              <MigrationItem icon={FileText}      label="Notes"                count={counts.notes} />
              <MigrationItem icon={HardDrive}     label="Devices"              count={counts.devices} />
              <MigrationItem icon={Network}       label="IP Plan Entries"      count={counts.ipEntries} />
              <MigrationItem icon={ClipboardList} label="Daily Reports"        count={counts.reports} />
              <MigrationItem icon={FolderOpen}    label="Files"                count={counts.files} />
              <MigrationItem icon={GitBranch}     label="Network Diagrams"     count={counts.diagrams} />
              <MigrationItem icon={FileCode}      label="PPCL Documents"       count={counts.ppcl} />
              <MigrationItem icon={Terminal}      label="Terminal Logs"        count={counts.terminalLogs} />
              <MigrationItem icon={Activity}      label="PID Sessions"         count={counts.pidSessions} />
              <MigrationItem icon={Wind}          label="Psych Sessions"       count={counts.psychSessions} />
              <MigrationItem icon={Calculator}    label="Register Calcs"       count={counts.registerCalcs} />
              <MigrationItem icon={Radio}         label="Ping Sessions"        count={counts.pingSessions} />
              <MigrationItem icon={LineChart}     label="Trend Sessions"       count={counts.trendSessions} />
              <MigrationItem icon={Plug}          label="Connection Profiles"  count={counts.connectionProfiles} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {project.syncedGlobalId
              ? 'Updates push into the linked Global Project. IDs are preserved, so this is safe to run multiple times.'
              : 'A new Global Project will be created and your data will be pushed. Your local project remains unchanged.'}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button className="gap-1.5" onClick={handleShare}>
            <Globe className="h-4 w-4" />
            Share
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
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
}) {
  const included = count > 0;
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        {included ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <X className="h-4 w-4 text-muted-foreground/40" />
        )}
        <Icon className="h-4 w-4" />
        <span className={included ? '' : 'text-muted-foreground'}>{label}</span>
      </div>
      <Badge variant="secondary" className="font-mono text-xs">
        {count}
      </Badge>
    </div>
  );
}
