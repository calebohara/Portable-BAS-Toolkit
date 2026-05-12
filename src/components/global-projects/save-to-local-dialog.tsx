'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  FolderKanban, Check, AlertTriangle, ExternalLink,
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
import { toast } from 'sonner';
import { reconcileGlobalToLocal, type ReconcileResult } from '@/lib/global-projects/reconcile';
import { getSupabaseClient } from '@/lib/supabase/client';
import type { GlobalProject } from '@/types/global-projects';

interface SaveToLocalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: GlobalProject;
  onSaved?: (localProjectId: string) => void;
}

type DialogState = 'preview' | 'migrating' | 'success';

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

// Tables to count, paired with the counts-key they populate.
const COUNT_TABLES: ReadonlyArray<{ table: string; key: keyof EntityCounts }> = [
  { table: 'global_field_notes',           key: 'notes' },
  { table: 'global_devices',               key: 'devices' },
  { table: 'global_ip_plan',               key: 'ipEntries' },
  { table: 'global_daily_reports',         key: 'reports' },
  { table: 'global_network_diagrams',      key: 'diagrams' },
  { table: 'global_project_files',         key: 'files' },
  { table: 'global_ppcl_documents',        key: 'ppcl' },
  { table: 'global_terminal_session_logs', key: 'terminalLogs' },
  { table: 'global_pid_tuning_sessions',   key: 'pidSessions' },
  { table: 'global_psych_sessions',        key: 'psychSessions' },
  { table: 'global_register_calculations', key: 'registerCalcs' },
  { table: 'global_ping_sessions',         key: 'pingSessions' },
  { table: 'global_trend_sessions',        key: 'trendSessions' },
  { table: 'global_connection_profiles',   key: 'connectionProfiles' },
];

async function fetchGlobalEntityCounts(globalProjectId: string): Promise<EntityCounts> {
  const client = getSupabaseClient();
  if (!client) return ZERO_COUNTS;
  const out: EntityCounts = { ...ZERO_COUNTS };
  // Issue all count queries in parallel. Failures (e.g. table not yet
  // migrated in this environment) fall back to 0.
  await Promise.all(
    COUNT_TABLES.map(async ({ table, key }) => {
      try {
        const { count, error } = await client
          .from(table)
          .select('id', { count: 'exact', head: true })
          .eq('global_project_id', globalProjectId)
          .is('deleted_at', null);
        if (!error && typeof count === 'number') out[key] = count;
      } catch {
        // ignore — leave at 0
      }
    }),
  );
  return out;
}

export function SaveToLocalDialog({
  open,
  onOpenChange,
  project,
  onSaved,
}: SaveToLocalDialogProps) {
  const [state, setState] = useState<DialogState>('preview');
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [counts, setCounts] = useState<EntityCounts>(ZERO_COUNTS);

  useEffect(() => {
    if (!open || state !== 'preview') return;
    let cancelled = false;
    (async () => {
      try {
        const c = await fetchGlobalEntityCounts(project.id);
        if (!cancelled) setCounts(c);
      } catch (e) {
        console.warn('[save-to-local] failed to load counts:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [open, state, project.id]);

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
    setProgressMessage('Preparing reconcile...');
    try {
      const reconcileResult = await reconcileGlobalToLocal(
        project.id,
        (step, current, total) => {
          setProgressMessage(`${step} (${current}/${total})...`);
        },
      );
      setResult(reconcileResult);
      setState('success');
      toast.success('Project saved to My Projects');
    } catch (err) {
      toast.error('Reconcile failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
      setState('preview');
    }
  }, [project.id]);

  const totalPulled = result
    ? Object.values(result.counts).reduce((sum, c) => sum + c.pulled, 0)
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
              {result.isNewProject ? 'Saved to My Projects' : 'Local Project Updated'}
            </DialogTitle>
            <DialogDescription>
              {result.isNewProject
                ? 'The global project has been saved as a local project.'
                : 'Local project synced with the latest from Global.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="px-5 py-4 space-y-4">
            <div className="rounded-md border p-3 space-y-1.5 text-sm">
              <p className="font-medium">Reconcile Summary</p>
              <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                <span>Rows pulled:</span>
                <span className="font-mono">{totalPulled}</span>
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
                    Some rows failed to reconcile
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
              Please wait while the project data is being reconciled.
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
            Import (or refresh) this Global Project as a local project.
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

          {/* What Will Be Reconciled */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Will be reconciled</p>
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
              <ImportItem icon={FileText}      label="Notes"               count={counts.notes} />
              <ImportItem icon={HardDrive}     label="Devices"             count={counts.devices} />
              <ImportItem icon={Network}       label="IP Plan Entries"     count={counts.ipEntries} />
              <ImportItem icon={ClipboardList} label="Daily Reports"       count={counts.reports} />
              <ImportItem icon={FolderOpen}    label="Files"               count={counts.files} />
              <ImportItem icon={GitBranch}     label="Network Diagrams"    count={counts.diagrams} />
              <ImportItem icon={FileCode}      label="PPCL Documents"      count={counts.ppcl} />
              <ImportItem icon={Terminal}      label="Terminal Logs"       count={counts.terminalLogs} />
              <ImportItem icon={Activity}      label="PID Sessions"        count={counts.pidSessions} />
              <ImportItem icon={Wind}          label="Psych Sessions"      count={counts.psychSessions} />
              <ImportItem icon={Calculator}    label="Register Calcs"      count={counts.registerCalcs} />
              <ImportItem icon={Radio}         label="Ping Sessions"       count={counts.pingSessions} />
              <ImportItem icon={LineChart}     label="Trend Sessions"      count={counts.trendSessions} />
              <ImportItem icon={Plug}          label="Connection Profiles" count={counts.connectionProfiles} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            UUIDs are preserved. Running this again updates the existing local project in place
            rather than creating a duplicate.
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
