'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Monitor, Cloud, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSyncContext } from '@/providers/sync-provider';
import { toast } from 'sonner';
import type { SyncConflict } from '@/types';

// Human-readable entity type names
const ENTITY_LABELS: Record<string, string> = {
  projects: 'Project',
  files: 'File',
  notes: 'Note',
  devices: 'Device',
  ipPlan: 'IP Entry',
  dailyReports: 'Daily Report',
  networkDiagrams: 'Network Diagram',
  commandSnippets: 'Command Snippet',
  pingSessions: 'Ping Session',
  terminalLogs: 'Terminal Log',
  connectionProfiles: 'Connection Profile',
  registerCalculations: 'Register Calculation',
};

function getEntityLabel(conflict: SyncConflict): string {
  const typeLabel = ENTITY_LABELS[conflict.entityType] || conflict.entityType;
  // Try to find a human-readable name from the data
  const name =
    (conflict.localData.name as string) ||
    (conflict.localData.deviceName as string) ||
    (conflict.localData.title as string) ||
    (conflict.localData.subject as string) ||
    (conflict.localData.ipAddress as string) ||
    '';
  return name ? `${typeLabel}: "${name}"` : typeLabel;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SyncConflictsDialog({ open, onOpenChange }: Props) {
  const { getConflicts, resolveConflict } = useSyncContext();
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLoading(true);
      getConflicts().then((c) => {
        setConflicts(c);
        setLoading(false);
      });
    }
  }, [open, getConflicts]);

  const handleResolve = async (id: string, resolution: 'local' | 'remote') => {
    setResolving(id);
    try {
      await resolveConflict(id, resolution);
      setConflicts((prev) => prev.filter((c) => c.id !== id));
      toast.success(resolution === 'local' ? 'Kept local version' : 'Kept cloud version');
      if (conflicts.length <= 1) {
        onOpenChange(false);
      }
    } catch {
      toast.error('Failed to resolve conflict');
    } finally {
      setResolving(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Sync Conflicts
          </DialogTitle>
          <DialogDescription>
            These items were edited both locally and in the cloud while you were offline.
            Choose which version to keep for each.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : conflicts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No conflicts to resolve.
            </p>
          ) : (
            conflicts.map((conflict) => (
              <ConflictCard
                key={conflict.id}
                conflict={conflict}
                resolving={resolving === conflict.id}
                onResolve={handleResolve}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConflictCard({
  conflict,
  resolving,
  onResolve,
}: {
  conflict: SyncConflict;
  resolving: boolean;
  onResolve: (id: string, resolution: 'local' | 'remote') => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{getEntityLabel(conflict)}</p>
          <p className="text-xs text-muted-foreground">
            Detected {format(new Date(conflict.detectedAt), 'MMM d, yyyy h:mm a')}
          </p>
        </div>
        <Badge variant="secondary" className="text-[10px] shrink-0">
          {ENTITY_LABELS[conflict.entityType] || conflict.entityType}
        </Badge>
      </div>

      {/* Timestamps */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 rounded-md bg-background px-3 py-2 border border-border">
          <Monitor className="h-4 w-4 text-blue-500 shrink-0" />
          <div>
            <p className="text-[10px] font-medium text-blue-500 uppercase">Local</p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(conflict.localUpdatedAt), 'MMM d, h:mm a')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-background px-3 py-2 border border-border">
          <Cloud className="h-4 w-4 text-emerald-500 shrink-0" />
          <div>
            <p className="text-[10px] font-medium text-emerald-500 uppercase">Cloud</p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(conflict.remoteUpdatedAt), 'MMM d, h:mm a')}
            </p>
          </div>
        </div>
      </div>

      {/* Expand/collapse details */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? 'Hide details' : 'Show details'}
      </button>

      {expanded && (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-md bg-blue-500/5 border border-blue-500/20 p-3 max-h-40 overflow-y-auto">
            <p className="font-medium text-blue-500 mb-1">Local Data</p>
            <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-all">
              {JSON.stringify(summarizeData(conflict.localData), null, 2)}
            </pre>
          </div>
          <div className="rounded-md bg-emerald-500/5 border border-emerald-500/20 p-3 max-h-40 overflow-y-auto">
            <p className="font-medium text-emerald-500 mb-1">Cloud Data</p>
            <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-all">
              {JSON.stringify(summarizeData(conflict.remoteData), null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1.5 text-xs"
          onClick={() => onResolve(conflict.id, 'local')}
          disabled={resolving}
        >
          <Monitor className="h-3.5 w-3.5" />
          Keep Local
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1.5 text-xs"
          onClick={() => onResolve(conflict.id, 'remote')}
          disabled={resolving}
        >
          <Cloud className="h-3.5 w-3.5" />
          Keep Cloud
        </Button>
      </div>
    </div>
  );
}

/** Show only key user-facing fields, not internal IDs */
function summarizeData(data: Record<string, unknown>): Record<string, unknown> {
  const skip = new Set(['id', 'userId', 'user_id', 'projectId', 'project_id', 'createdAt', 'created_at']);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (skip.has(key)) continue;
    if (typeof value === 'string' && value.length > 200) {
      result[key] = value.slice(0, 200) + '…';
    } else {
      result[key] = value;
    }
  }
  return result;
}
