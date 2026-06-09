'use client';

import { memo, useMemo, useState } from 'react';
import { Search, X, Download, Database, Activity, ListTree } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, sanitizeFilename } from '@/lib/utils';
import type { P2ImportData } from '@/store/p2-inspector-store';
import type { P2Point, P2PointType } from '@/lib/p2-parser';

interface PpclP2InspectorProps {
  data: P2ImportData;
  onClose: () => void;
}

/** Badge colour per APOGEE point type. */
const TYPE_VARIANT: Record<P2PointType, 'info' | 'success' | 'warning' | 'danger' | 'secondary' | 'outline'> = {
  LAI: 'info',
  LAO: 'success',
  LDI: 'warning',
  LDO: 'danger',
  LAV: 'secondary',
  Unknown: 'outline',
};

/** Commissioning "Function" column, derived from point type. */
function functionFor(type: P2PointType): string {
  if (type === 'LDI') return 'Status';
  if (type === 'LDO') return 'On/Off';
  return 'Value';
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// Memoized: the PPCL editor re-renders its page on every cursor move, and this
// panel renders a row per point — without memo it would re-render on each tick.
export const PpclP2Inspector = memo(function PpclP2Inspector({ data, onClose }: PpclP2InspectorProps) {
  const [tab, setTab] = useState<'points' | 'trends'>('points');
  const [filter, setFilter] = useState('');
  const [physicalOnly, setPhysicalOnly] = useState(true);

  const physicalCount = useMemo(() => data.points.filter((p) => p.isPhysical).length, [data.points]);

  // Base point names that have a trend, for the "trended" marker / CSV column.
  const trendedPoints = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of data.trends) m.set(t.point, t.kind === 'cov' ? 'COV' : `${t.interval ?? ''}`.trim());
    return m;
  }, [data.trends]);

  const visiblePoints = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return data.points.filter((p) => {
      if (physicalOnly && !p.isPhysical) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.descriptor.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q) ||
        (p.units ?? '').toLowerCase().includes(q) ||
        (p.states ?? '').toLowerCase().includes(q)
      );
    });
  }, [data.points, filter, physicalOnly]);

  const visibleTrends = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return data.trends;
    return data.trends.filter((t) => t.point.toLowerCase().includes(q));
  }, [data.trends, filter]);

  const handleExportCsv = () => {
    const header = ['Point Name', 'Type', 'Function', 'Descriptor', 'Units/State', 'Physical', 'Trend'];
    const rows = visiblePoints.map((p) => [
      p.name,
      p.type,
      functionFor(p.type),
      p.descriptor,
      p.units ?? p.states ?? '',
      p.isPhysical ? 'Yes' : 'No',
      trendedPoints.get(p.name) ? `Yes (${trendedPoints.get(p.name)})` : '',
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    const base = data.fileName.replace(/\.[^.]+$/, '');
    const blob = new Blob([csv], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilename(`${base}-points.csv`);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div className="w-80 max-w-[85vw] lg:w-96 h-full border-l border-border bg-muted/20 flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-start gap-2">
        <Database className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate" title={data.fileName}>{data.fileName}</p>
          <p className="text-[10px] text-muted-foreground truncate">
            {[data.meta.jobNumber, data.meta.systemName].filter(Boolean).join(' · ') || 'Panel database'}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          title="Hide panel inspector"
          aria-label="Hide panel inspector"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'points'}
          onClick={() => setTab('points')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors',
            tab === 'points'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <ListTree className="h-3.5 w-3.5" /> Points
          <span className="text-[10px] text-muted-foreground">{data.points.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'trends'}
          onClick={() => setTab('trends')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors',
            tab === 'trends'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <Activity className="h-3.5 w-3.5" /> Trends
          <span className="text-[10px] text-muted-foreground">{data.trends.length}</span>
        </button>
      </div>

      {/* Controls */}
      <div className="p-2 border-b border-border space-y-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={tab === 'points' ? 'Filter points...' : 'Filter trends...'}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-7 pl-7 text-xs"
          />
        </div>
        {tab === 'points' && (
          <div className="flex items-center gap-1">
            <Button
              variant={physicalOnly ? 'default' : 'outline'}
              size="sm"
              className="h-6 flex-1 text-[11px]"
              onClick={() => setPhysicalOnly((v) => !v)}
              title="Show only physically-wired I/O (LAI/LAO/LDI/LDO)"
            >
              Physical I/O {physicalOnly ? `(${physicalCount})` : 'only'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px] gap-1"
              onClick={handleExportCsv}
              title="Download the visible points as CSV"
            >
              <Download className="h-3 w-3" /> CSV
            </Button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'points' ? (
          visiblePoints.length === 0 ? (
            <Empty label="No matching points." />
          ) : (
            <ul className="divide-y divide-border/50">
              {visiblePoints.map((p) => (
                <PointRow key={p.name} point={p} trend={trendedPoints.get(p.name)} />
              ))}
            </ul>
          )
        ) : visibleTrends.length === 0 ? (
          <Empty label="No trends logged in this panel." />
        ) : (
          <ul className="divide-y divide-border/50">
            {visibleTrends.map((t) => (
              <li key={t.raw} className="flex items-center gap-2 px-3 py-1.5">
                <Badge variant={t.kind === 'cov' ? 'secondary' : 'info'} className="shrink-0 font-mono text-[10px]">
                  {t.kind === 'cov' ? 'COV' : `${t.interval ?? ''} min`}
                </Badge>
                <span className="text-[11px] font-mono truncate" title={t.point}>{t.point}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer summary */}
      <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground shrink-0">
        {tab === 'points'
          ? `${visiblePoints.length} shown · ${physicalCount} physical · ${data.points.length} total`
          : `${visibleTrends.length} shown · ${data.trends.length} trends`}
      </div>
    </div>
  );
});

function PointRow({ point, trend }: { point: P2Point; trend?: string }) {
  const meta = point.units ?? point.states ?? '';
  return (
    <li className="px-3 py-1.5">
      <div className="flex items-center gap-2">
        <Badge variant={TYPE_VARIANT[point.type]} className="shrink-0 font-mono text-[10px]">{point.type}</Badge>
        <span className="text-[11px] font-mono truncate flex-1" title={point.name}>{point.name}</span>
        {trend && (
          <span className="shrink-0" title={`Trended (${trend === 'COV' ? 'COV' : `${trend} min`})`}>
            <Activity className="h-3 w-3 text-muted-foreground" aria-label="Trended" />
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 pl-[3.25rem] -mt-0.5">
        <span className="text-[10px] text-muted-foreground truncate flex-1">{point.descriptor || '—'}</span>
        {meta && <span className="text-[10px] text-muted-foreground/80 shrink-0">{meta}</span>}
      </div>
    </li>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="p-4 text-center text-xs text-muted-foreground">{label}</div>;
}
