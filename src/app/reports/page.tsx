'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Plus, Search, ClipboardList, ChevronRight,
  CalendarDays, Filter,
} from 'lucide-react';
import { useDailyReports } from '@/hooks/use-projects';
import { useProjects } from '@/hooks/use-projects';
import { TopBar } from '@/components/layout/top-bar';
import { EmptyState } from '@/components/shared/empty-state';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { navigateToReport } from '@/lib/routes';
import type { ReportStatus } from '@/types';

const STATUS_COLORS: Record<ReportStatus, string> = {
  draft: 'bg-field-warning/15 text-field-warning',
  submitted: 'bg-field-info/15 text-field-info',
  finalized: 'bg-field-success/15 text-field-success',
};

export default function ReportsListPage() {
  const router = useRouter();
  const { reports, loading } = useDailyReports();
  const { projects } = useProjects();
  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const projectMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of projects) map[p.id] = p.name;
    return map;
  }, [projects]);

  const filtered = useMemo(() => {
    let result = reports;
    if (projectFilter !== 'all') {
      result = result.filter(r => r.projectId === projectFilter);
    }
    if (statusFilter !== 'all') {
      result = result.filter(r => r.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(r =>
        r.technicianName.toLowerCase().includes(q) ||
        r.workCompleted.toLowerCase().includes(q) ||
        r.issuesEncountered.toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q) ||
        r.date.includes(q) ||
        (projectMap[r.projectId] || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [reports, projectFilter, statusFilter, query, projectMap]);

  return (
    <>
      <TopBar title="Daily Reports" />
      <div className="p-4 md:p-6 space-y-4 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Daily Reports</h1>
            <p className="text-sm text-muted-foreground">
              {reports.length} report{reports.length !== 1 ? 's' : ''} total
            </p>
          </div>
          <Button onClick={() => router.push('/reports/new')} className="gap-1.5">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Report</span>
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search reports..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={projectFilter} onValueChange={(v) => v && setProjectFilter(v)}>
            <SelectTrigger className="w-full sm:w-[180px] h-9">
              <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
            <SelectTrigger className="w-full sm:w-[140px] h-9">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="finalized">Finalized</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-label="Loading" />
          </div>
        )}

        {/* Report List */}
        {!loading && filtered.length > 0 && (
          <div className="space-y-2">
            {filtered.map(r => (
              <button
                key={r.id}
                onClick={() => navigateToReport(router, r.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-accent transition-colors"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      Report #{r.reportNumber} — {format(new Date(r.date + 'T00:00:00'), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {projectMap[r.projectId] || 'Unknown Project'} — {r.technicianName}
                    {r.location ? ` — ${r.location}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.hoursOnSite && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">{r.hoursOnSite}h</span>
                  )}
                  <Badge className={`text-[10px] ${STATUS_COLORS[r.status]}`}>
                    {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Empty States */}
        {!loading && reports.length === 0 && (
          <EmptyState
            icon={ClipboardList}
            title="No daily reports yet"
            description="Create your first daily report to start documenting field work."
            action={
              <Button onClick={() => router.push('/reports/new')} className="gap-1.5">
                <Plus className="h-4 w-4" /> Create Report
              </Button>
            }
          />
        )}
        {!loading && reports.length > 0 && filtered.length === 0 && (
          <EmptyState
            icon={Search}
            title="No reports match"
            description="Try adjusting your search or filters."
          />
        )}
      </div>
    </>
  );
}
