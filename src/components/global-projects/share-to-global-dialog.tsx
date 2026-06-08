'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Globe, Check, AlertTriangle, Copy, ExternalLink,
  FileText, HardDrive, Network, ClipboardList, FolderOpen,
  GitBranch, FileCode, Terminal, Activity, Wind, Calculator,
  Radio, LineChart, Plug, FileSearch, ChevronRight,
} from 'lucide-react';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/lib/utils';
import { toast } from 'sonner';
import {
  reconcileLocalToGlobal, computeUnsharedChanges,
  type ReconcileResult, type UnsharedChanges, type UnsharedItem,
  type ShareSelection, type ReconciledEntityKey,
} from '@/lib/global-projects/reconcile';
import { emitUnsharedChanged } from '@/lib/global-projects/unshared-events';
import { navigateToGlobalProject } from '@/lib/routes';
import type { Project } from '@/types';

interface ShareToGlobalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
}

type DialogState = 'preview' | 'sharing' | 'success';

// All 15 shareable categories, aligned 1:1 with RECONCILED_ENTITY_PAIRS keys so
// the selective UI can never drift from what the engine pushes. (Previously the
// dialog was missing `dxrs`.)
const CATEGORY_META: { key: ReconciledEntityKey; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { key: 'notes', icon: FileText, label: 'Notes' },
  { key: 'devices', icon: HardDrive, label: 'Devices' },
  { key: 'ipPlan', icon: Network, label: 'IP Plan Entries' },
  { key: 'dailyReports', icon: ClipboardList, label: 'Daily Reports' },
  { key: 'files', icon: FolderOpen, label: 'Files' },
  { key: 'networkDiagrams', icon: GitBranch, label: 'Network Diagrams' },
  { key: 'ppclDocuments', icon: FileCode, label: 'PPCL Documents' },
  { key: 'terminalLogs', icon: Terminal, label: 'Terminal Logs' },
  { key: 'pidTuningSessions', icon: Activity, label: 'PID Sessions' },
  { key: 'psychSessions', icon: Wind, label: 'Psych Sessions' },
  { key: 'registerCalculations', icon: Calculator, label: 'Register Calcs' },
  { key: 'pingSessions', icon: Radio, label: 'Ping Sessions' },
  { key: 'trendSessions', icon: LineChart, label: 'Trend Sessions' },
  { key: 'connectionProfiles', icon: Plug, label: 'Connection Profiles' },
  { key: 'dxrs', icon: FileSearch, label: 'DXRs' },
];

const ALL_KEYS = CATEGORY_META.map((c) => c.key);
const PER_ITEM_CAP = 50; // cap the per-item expand list; category counts stay exact

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
  // The read-only diff (rows not yet published up) + the per-category selection.
  const [diff, setDiff] = useState<UnsharedChanges | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(true);
  const [selected, setSelected] = useState<Record<ReconciledEntityKey, Set<string>>>(() => emptySelection());
  const [expanded, setExpanded] = useState<ReconciledEntityKey | null>(null);

  // Compute the unshared-changes diff when the dialog opens; default-select all.
  useEffect(() => {
    if (!open || state !== 'preview') return;
    let cancelled = false;
    setLoadingDiff(true);
    (async () => {
      try {
        const d = await computeUnsharedChanges(project.id);
        if (cancelled) return;
        setDiff(d);
        const sel = emptySelection();
        for (const key of ALL_KEYS) sel[key] = new Set(d[key].map((i) => i.id));
        setSelected(sel);
      } catch (e) {
        console.warn('[share-to-global] failed to compute diff:', e);
        if (!cancelled) setDiff(emptyDiff());
      } finally {
        if (!cancelled) setLoadingDiff(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, state, project.id]);

  const reset = () => {
    setState('preview');
    setProgressMessage('');
    setResult(null);
    setCopied(false);
    setDiff(null);
    setSelected(emptySelection());
    setExpanded(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && state === 'sharing') return; // prevent close during sync
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  // ── Selection helpers ──────────────────────────────────────────────────────
  const totalUnshared = diff ? ALL_KEYS.reduce((n, k) => n + diff[k].length, 0) : 0;
  const totalSelected = ALL_KEYS.reduce((n, k) => n + selected[k].size, 0);
  const allSelected = totalUnshared > 0 && totalSelected === totalUnshared;

  const toggleCategory = (key: ReconciledEntityKey) => {
    if (!diff) return;
    setSelected((prev) => {
      const next = { ...prev };
      next[key] = prev[key].size === diff[key].length ? new Set() : new Set(diff[key].map((i) => i.id));
      return next;
    });
  };
  const toggleItem = (key: ReconciledEntityKey, id: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(prev[key]);
      if (set.has(id)) set.delete(id); else set.add(id);
      next[key] = set;
      return next;
    });
  };
  const setAll = (on: boolean) => {
    if (!diff) return;
    const next = emptySelection();
    if (on) for (const k of ALL_KEYS) next[k] = new Set(diff[k].map((i) => i.id));
    setSelected(next);
  };

  const handleShare = useCallback(async () => {
    // Build the selection: omit categories with nothing checked (engine skips the
    // pair); send 'all' when every unshared row of a category is checked, else
    // the explicit id list.
    const selection: ShareSelection = {};
    for (const key of ALL_KEYS) {
      const ids = selected[key];
      if (!ids || ids.size === 0) continue;
      const total = diff ? diff[key].length : 0;
      selection[key] = total > 0 && ids.size === total ? 'all' : Array.from(ids);
    }
    if (Object.keys(selection).length === 0) {
      toast.error('Select at least one category to share');
      return;
    }
    setState('sharing');
    setProgressMessage('Preparing share...');
    try {
      const shareResult = await reconcileLocalToGlobal(
        project.id,
        (step, current, total) => {
          setProgressMessage(`${step} (${current}/${total})...`);
        },
        selection,
      );
      setResult(shareResult);
      setState('success');
      emitUnsharedChanged(project.id); // tell the project page to recompute (→ count drops)
      if (shareResult.parentMetadataShared === false) {
        toast.success('Your data was shared — project details are admin-only and were left unchanged');
      } else {
        toast.success('Selected data shared to Global');
      }
    } catch (err) {
      toast.error('Share failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
      setState('preview');
    }
  }, [project.id, selected, diff]);

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

          {/* Choose what to share */}
          {loadingDiff ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Checking for unshared changes…</p>
          ) : totalUnshared === 0 ? (
            <div className="rounded-md border border-green-500/30 bg-green-500/5 p-4 text-center">
              <Check className="h-5 w-5 text-green-500 mx-auto mb-1.5" />
              <p className="text-sm font-medium">Everything is up to date</p>
              <p className="text-xs text-muted-foreground mt-0.5">No unshared changes to publish.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Choose what to share</p>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setAll(!allSelected)}
                >
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="space-y-1 max-h-80 overflow-y-auto pr-1 -mr-1">
                {CATEGORY_META.filter((c) => diff && diff[c.key].length > 0).map((c) => (
                  <SelectableCategoryRow
                    key={c.key}
                    icon={c.icon}
                    label={c.label}
                    items={diff![c.key]}
                    selectedIds={selected[c.key]}
                    expanded={expanded === c.key}
                    onToggleCategory={() => toggleCategory(c.key)}
                    onToggleExpand={() => setExpanded(expanded === c.key ? null : c.key)}
                    onToggleItem={(id) => toggleItem(c.key, id)}
                  />
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground leading-relaxed">
            {project.syncedGlobalId
              ? 'Only the selected items are published to the linked Global Project; sharing overwrites the Global copy of changed items. IDs are preserved, so this is safe to run again. (Local deletions are not propagated up yet.)'
              : 'A new Global Project is created and the selected data is pushed. The project name and contacts always sync. Your local project stays unchanged.'}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button className="gap-1.5" onClick={handleShare} disabled={totalSelected === 0}>
            <Globe className="h-4 w-4" />
            {totalSelected > 0 ? `Share ${totalSelected}` : 'Share'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// A small check/dash box mirroring the app's data-cleanup checkbox style.
function CheckBox({ state }: { state: 'on' | 'off' | 'partial' }) {
  return (
    <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-[1.5px] transition-colors ${
      state === 'off' ? 'border-muted-foreground/40' : 'border-primary bg-primary text-primary-foreground'
    }`}>
      {state === 'on' && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {state === 'partial' && <div className="h-1.5 w-1.5 rounded-[1px] bg-primary-foreground" />}
    </div>
  );
}

function SelectableCategoryRow({
  icon: Icon, label, items, selectedIds, expanded,
  onToggleCategory, onToggleExpand, onToggleItem,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  items: UnsharedItem[];
  selectedIds: Set<string>;
  expanded: boolean;
  onToggleCategory: () => void;
  onToggleExpand: () => void;
  onToggleItem: (id: string) => void;
}) {
  const newCount = items.filter((i) => i.status === 'new').length;
  const changedCount = items.length - newCount;
  const boxState: 'on' | 'off' | 'partial' =
    selectedIds.size === 0 ? 'off' : selectedIds.size === items.length ? 'on' : 'partial';
  const summary = [newCount ? `${newCount} new` : '', changedCount ? `${changedCount} changed` : '']
    .filter(Boolean).join(' · ');

  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-2.5 p-2.5">
        <div
          role="button"
          tabIndex={0}
          onClick={onToggleCategory}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleCategory(); } }}
          className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer select-none"
        >
          <CheckBox state={boxState} />
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium truncate">{label}</span>
          <span className="text-[11px] text-muted-foreground shrink-0">{summary}</span>
        </div>
        <button
          type="button"
          onClick={onToggleExpand}
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
          className="p-1 text-muted-foreground hover:text-foreground shrink-0"
        >
          <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      </div>
      {expanded && (
        <div className="border-t px-2.5 py-1.5 space-y-0.5">
          {items.slice(0, PER_ITEM_CAP).map((item) => (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => onToggleItem(item.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleItem(item.id); } }}
              className="flex items-center gap-2.5 py-1 pl-1 cursor-pointer select-none"
            >
              <CheckBox state={selectedIds.has(item.id) ? 'on' : 'off'} />
              <span className="text-xs truncate flex-1 min-w-0">{item.label}</span>
              <span className={`text-[10px] shrink-0 ${item.status === 'new' ? 'text-green-500' : 'text-amber-500'}`}>
                {item.status}
              </span>
            </div>
          ))}
          {items.length > PER_ITEM_CAP && (
            <p className="text-[10px] text-muted-foreground pl-1 py-1">
              + {items.length - PER_ITEM_CAP} more (toggle the category to include all)
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function emptySelection(): Record<ReconciledEntityKey, Set<string>> {
  const sel = {} as Record<ReconciledEntityKey, Set<string>>;
  for (const key of ALL_KEYS) sel[key] = new Set();
  return sel;
}

function emptyDiff(): UnsharedChanges {
  const d = {} as UnsharedChanges;
  for (const key of ALL_KEYS) d[key] = [];
  return d;
}
