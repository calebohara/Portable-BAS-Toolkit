'use client';

import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  WifiOff,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Send,
  Trash2,
  EraserIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SyncError } from '@/types';

// ── Classification ────────────────────────────────────────────

interface UiClass {
  icon: LucideIcon;
  color: string;
  label: string;
}

function classifyForUi(error: SyncError): UiClass {
  const code = error.errorCode;
  const msg = error.errorMessage ?? '';

  if (code === '42P01') {
    return { icon: AlertCircle, color: 'text-red-500', label: 'Missing table' };
  }
  if (code === '42501') {
    return { icon: ShieldAlert, color: 'text-red-500', label: 'RLS rejected' };
  }
  if (code === '42703' || code?.includes('PGRST') || msg.includes('schema cache')) {
    return { icon: AlertCircle, color: 'text-red-500', label: 'Missing column' };
  }
  if (code === '23503') {
    return { icon: AlertCircle, color: 'text-red-500', label: 'FK violation' };
  }
  if (code === '23505') {
    return { icon: AlertCircle, color: 'text-yellow-500', label: 'Duplicate' };
  }
  if (code === null && (msg.includes('fetch') || msg.includes('NetworkError'))) {
    return { icon: WifiOff, color: 'text-yellow-500', label: 'Network' };
  }
  return { icon: AlertTriangle, color: 'text-yellow-500', label: 'Unknown' };
}

// ── Relative time helper ──────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

// ── Copy details builder ──────────────────────────────────────

function buildCopyText(error: SyncError): string {
  return [
    '[Sync Error]',
    `Time: ${error.createdAt}`,
    `Entity: ${error.entityType}/${error.entityId}`,
    `Action: ${error.action}`,
    `Table: ${error.table}`,
    `Code: ${error.errorCode ?? 'n/a'}`,
    `Retry count: ${error.retryCount}`,
    `App version: ${error.appVersion}`,
    '',
    'Message:',
    error.errorMessage,
    '',
    'Hint:',
    error.hint ?? 'n/a',
    '',
    'Details:',
    error.details ?? 'n/a',
    '',
    'Payload (sanitized):',
    error.payload !== null ? JSON.stringify(error.payload, null, 2) : '(no payload)',
  ].join('\n');
}

// ── Props ─────────────────────────────────────────────────────

interface SyncErrorRowProps {
  error: SyncError;
  onReport: (error: SyncError) => void | Promise<void>;
  /** Drops the captured error + the underlying syncQueue item (keeps local row). */
  onRemove: (error: SyncError) => void | Promise<void>;
  /** Same as onRemove plus deletes the local IndexedDB entity row. */
  onForget: (error: SyncError) => void | Promise<void>;
}

// ── Component ─────────────────────────────────────────────────

export function SyncErrorRow({ error, onReport, onRemove, onForget }: SyncErrorRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmingForget, setConfirmingForget] = useState(false);
  const { icon: Icon, color, label } = classifyForUi(error);

  // Pull-side errors have no specific row to forget — disable the Forget button.
  const canForgetRow = error.entityId !== '*';

  const shortEntityId =
    error.entityId === '*' ? 'pull' : error.entityId.slice(0, 8);
  const entityDisplay = `${error.entityType}/${shortEntityId}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildCopyText(error));
    } catch {
      // silently fail — clipboard may be unavailable in non-secure contexts
    }
  };

  return (
    <div className="rounded-lg border border-border bg-background">
      {/* Collapsed row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors rounded-lg"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {/* Severity icon */}
        <Icon className={cn('h-4 w-4 shrink-0', color)} aria-label={label} />

        {/* Time */}
        <span className="text-xs text-muted-foreground w-16 shrink-0">
          {formatRelativeTime(error.createdAt)}
        </span>

        {/* Entity */}
        <span className="text-xs font-mono w-40 shrink-0 truncate" title={entityDisplay}>
          {entityDisplay}
        </span>

        {/* Code */}
        <span className="text-xs text-muted-foreground w-24 shrink-0 truncate">
          {error.errorCode ?? '—'}
        </span>

        {/* Message */}
        <span className="flex-1 text-xs truncate text-muted-foreground min-w-0">
          {error.errorMessage}
        </span>

        {/* Chevron */}
        <span className="shrink-0 text-muted-foreground">
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {/* Full message */}
          <div>
            <p className="text-[10px] font-medium uppercase text-muted-foreground mb-1">Message</p>
            <p className="text-sm">{error.errorMessage}</p>
          </div>

          {/* Hint */}
          {error.hint !== null && (
            <div>
              <p className="text-[10px] font-medium uppercase text-muted-foreground mb-1">Hint</p>
              <p className="text-sm text-muted-foreground">{error.hint}</p>
            </div>
          )}

          {/* Details */}
          {error.details !== null && (
            <div>
              <p className="text-[10px] font-medium uppercase text-muted-foreground mb-1">Details</p>
              <p className="text-sm text-muted-foreground">{error.details}</p>
            </div>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">Retries:</span>{' '}
              {error.retryCount}
            </span>
            <span>
              <span className="font-medium text-foreground">Version:</span>{' '}
              {error.appVersion}
            </span>
            <span>
              <span className="font-medium text-foreground">Table:</span>{' '}
              {error.table}
            </span>
          </div>

          {/* Payload */}
          <div>
            <p className="text-[10px] font-medium uppercase text-muted-foreground mb-1">
              Payload (sanitized)
            </p>
            <pre className="font-mono text-xs bg-muted/50 p-2 rounded max-h-64 overflow-y-auto whitespace-pre-wrap break-all">
              {error.payload !== null
                ? JSON.stringify(error.payload, null, 2)
                : '(no payload)'}
            </pre>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={handleCopy}
            >
              <Clipboard className="h-3.5 w-3.5" />
              Copy details
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => onReport(error)}
            >
              <Send className="h-3.5 w-3.5" />
              Report to developer
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
              onClick={() => onRemove(error)}
              title="Drop this error + stop retrying. Local row is preserved."
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>

            {canForgetRow && !confirmingForget && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 ml-auto"
                onClick={() => setConfirmingForget(true)}
                title="Drop this error + stop retrying + delete the local row entirely. Irreversible."
              >
                <EraserIcon className="h-3.5 w-3.5" />
                Forget locally
              </Button>
            )}

            {canForgetRow && confirmingForget && (
              <div className="ml-auto flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1">
                <span className="text-[11px] text-destructive">
                  Delete local row too? Irreversible.
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setConfirmingForget(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={() => { setConfirmingForget(false); onForget(error); }}
                >
                  <EraserIcon className="h-3 w-3" />
                  Forget
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
