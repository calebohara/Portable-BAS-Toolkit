'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bug, Trash2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { getAllBugReports, saveBugReport, deleteBugReport } from '@/lib/db';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { BugReport, BugReportSeverity, BugReportStatus } from '@/types';

const SEVERITY_COLORS: Record<BugReportSeverity, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

const STATUS_COLORS: Record<BugReportStatus, string> = {
  open: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  in_progress: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  resolved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  closed: 'bg-gray-100 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400',
};

const STATUS_LABELS: Record<BugReportStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

const ALL_STATUSES: BugReportStatus[] = ['open', 'in_progress', 'resolved', 'closed'];

export function BugReportsPanel() {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BugReport | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(async () => {
    try {
      const data = await getAllBugReports();
      setReports(data.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch (err) {
      console.error('Failed to load bug reports:', err);
      toast.error('Failed to load bug reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleStatusChange = useCallback(async (report: BugReport, newStatus: BugReportStatus) => {
    try {
      const updated = { ...report, status: newStatus, updatedAt: new Date().toISOString() };
      await saveBugReport(updated);
      setReports((prev) => prev.map((r) => (r.id === report.id ? updated : r)));
      toast.success(`Status updated to ${STATUS_LABELS[newStatus]}`);
    } catch (err) {
      console.error('Failed to update status:', err);
      toast.error('Failed to update status');
    }
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteBugReport(deleteTarget.id);
      setReports((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      if (expandedId === deleteTarget.id) setExpandedId(null);
      toast.success('Bug report deleted');
    } catch (err) {
      console.error('Failed to delete bug report:', err);
      toast.error('Failed to delete bug report');
    }
  }, [deleteTarget, expandedId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        Loading bug reports...
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Bug className="mb-2 h-8 w-8 opacity-40" />
        <p className="text-sm">No bug reports yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {reports.map((report) => {
          const isExpanded = expandedId === report.id;
          return (
            <Card key={report.id} className="overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : report.id)}
                aria-expanded={isExpanded}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{report.title}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge className={SEVERITY_COLORS[report.severity]}>
                      {report.severity}
                    </Badge>
                    <Badge className={STATUS_COLORS[report.status]}>
                      {STATUS_LABELS[report.status]}
                    </Badge>
                    {report.appVersion && (
                      <span className="text-xs text-muted-foreground">v{report.appVersion}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(report.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                />
              </button>

              {isExpanded && (
                <div className="border-t border-border px-4 py-3 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                    <p className="text-sm whitespace-pre-wrap">{report.description}</p>
                  </div>

                  {report.stepsToReproduce && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Steps to Reproduce</p>
                      <p className="text-sm whitespace-pre-wrap">{report.stepsToReproduce}</p>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Device Info</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {report.deviceClass && <span>Device: {report.deviceClass}</span>}
                      {report.desktopOS && <span>OS: {report.desktopOS}</span>}
                      {report.currentPage && <span>Page: {report.currentPage}</span>}
                      {report.syncStatus && <span>Sync: {report.syncStatus}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Select
                      value={report.status}
                      onValueChange={(val) => handleStatusChange(report, val as BugReportStatus)}
                    >
                      <SelectTrigger size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive ml-auto"
                      onClick={() => setDeleteTarget(report)}
                      aria-label={`Delete bug report: ${report.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Bug Report"
        description={`Are you sure you want to delete "${deleteTarget?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </>
  );
}
