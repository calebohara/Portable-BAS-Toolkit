'use client';

import { useState, useMemo } from 'react';
import {
  Bug,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useSyncErrors } from '@/hooks/use-sync-errors';
import { SyncErrorRow } from './sync-error-row';
import type { SyncError } from '@/types';

// ── Props ─────────────────────────────────────────────────────

interface SyncErrorInspectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReport: (error: SyncError) => void | Promise<void>;
}

// ── Component ─────────────────────────────────────────────────

export function SyncErrorInspectorDialog({
  open,
  onOpenChange,
  onReport,
}: SyncErrorInspectorDialogProps) {
  const { errors, loading, refresh, clearAll, removeOne, forgetRow } = useSyncErrors();

  const [search, setSearch] = useState('');
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return errors;
    const q = search.toLowerCase();
    return errors.filter((e) =>
      e.entityType.toLowerCase().includes(q) ||
      (e.errorCode ?? '').toLowerCase().includes(q) ||
      e.errorMessage.toLowerCase().includes(q)
    );
  }, [errors, search]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await clearAll();
      setClearConfirmOpen(false);
    } catch {
      // clearAll already logs
    } finally {
      setClearing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        {/* ── Header ── */}
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Bug className="h-5 w-5 text-amber-500" />
              <DialogTitle>Sync Error Inspector</DialogTitle>
              <Badge variant="secondary" className="text-[10px]">
                {errors.length}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              {/* Refresh button */}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={handleRefresh}
                disabled={refreshing || loading}
              >
                {refreshing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Refresh
              </Button>

              {/* Clear all — normal state */}
              {!clearConfirmOpen && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setClearConfirmOpen(true)}
                  disabled={errors.length === 0 || loading}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear all
                </Button>
              )}

              {/* Clear all — inline confirmation */}
              {clearConfirmOpen && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-1.5">
                  <span className="text-xs text-destructive font-medium">
                    Are you sure?
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => setClearConfirmOpen(false)}
                    disabled={clearing}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-6 text-xs px-2 gap-1"
                    onClick={handleClearAll}
                    disabled={clearing}
                  >
                    {clearing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Confirm
                  </Button>
                </div>
              )}
            </div>
          </div>

          <DialogDescription>
            Persistent log of every push / pull failure captured by SyncManager.
            Errors are rotated to a maximum of 100 rows.
          </DialogDescription>
        </DialogHeader>

        {/* ── Search ── */}
        <div className="px-5 pt-3 pb-0">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search entity type, code, message…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>

        {/* ── Column headers ── */}
        {!loading && errors.length > 0 && (
          <div className="px-5 pt-2 pb-0">
            <div className="flex items-center gap-3 px-4 py-1 text-[10px] font-medium uppercase text-muted-foreground select-none">
              <span className="w-4 shrink-0" />
              <span className="w-16 shrink-0">Time</span>
              <span className="w-40 shrink-0">Entity</span>
              <span className="w-24 shrink-0">Code</span>
              <span className="flex-1 min-w-0">Message</span>
              <span className="w-4 shrink-0" />
            </div>
          </div>
        )}

        {/* ── Body ── */}
        <DialogBody className="px-5 py-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 && search.trim() ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No errors match your search.
            </p>
          ) : errors.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="text-sm font-medium">No sync errors recorded. Everything is healthy.</p>
            </div>
          ) : (
            filtered.map((error) => (
              <SyncErrorRow
                key={error.id}
                error={error}
                onReport={onReport}
                onRemove={removeOne}
                onForget={forgetRow}
              />
            ))
          )}
        </DialogBody>

        {/* ── Footer ── */}
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
