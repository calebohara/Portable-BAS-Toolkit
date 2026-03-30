'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { TrendDataPoint, TrendSeries, TrendAnomaly } from '@/types';

interface DataTablePanelProps {
  data: TrendDataPoint[];
  series: TrendSeries[];
  anomalies: TrendAnomaly[];
  zoomDomain: [number, number] | null;
}

const MAX_VISIBLE_ROWS = 500;

export function DataTablePanel({ data, series, anomalies, zoomDomain }: DataTablePanelProps) {
  const [search, setSearch] = useState('');

  const visibleSeries = useMemo(() => series.filter(s => s.visible), [series]);

  // Filter to zoom range
  const rangeData = useMemo(() => {
    if (!zoomDomain) return data;
    return data.filter(d => d.timestamp >= zoomDomain[0] && d.timestamp <= zoomDomain[1]);
  }, [data, zoomDomain]);

  // Build anomaly timestamp set for highlighting
  const anomalyTimestamps = useMemo(() => {
    const set = new Set<number>();
    for (const a of anomalies) {
      // Mark data points within the anomaly range
      for (const d of rangeData) {
        if (d.timestamp >= a.startTimestamp && d.timestamp <= a.endTimestamp) {
          set.add(d.timestamp);
        }
      }
    }
    return set;
  }, [anomalies, rangeData]);

  // Text search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return rangeData;
    const q = search.toLowerCase();
    return rangeData.filter(point => {
      const ts = format(new Date(point.timestamp), 'yyyy-MM-dd HH:mm:ss').toLowerCase();
      if (ts.includes(q)) return true;
      for (const s of visibleSeries) {
        const val = point.values[s.id];
        if (val !== null && val.toString().includes(q)) return true;
      }
      return false;
    });
  }, [rangeData, search, visibleSeries]);

  const displayData = filtered.slice(0, MAX_VISIBLE_ROWS);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search data..."
            className="h-8 pl-8 text-xs"
          />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {filtered.length.toLocaleString()} rows
          {filtered.length > MAX_VISIBLE_ROWS && ` (showing first ${MAX_VISIBLE_ROWS})`}
        </span>
      </div>

      <div className="overflow-auto rounded-md border" style={{ maxHeight: '400px' }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium border-b">Timestamp</th>
              {visibleSeries.map(s => (
                <th key={s.id} className="px-2 py-1.5 text-right font-medium border-b">
                  <div className="flex items-center gap-1 justify-end">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="truncate max-w-[120px]">{s.name}</span>
                    {s.unit && <span className="text-muted-foreground">({s.unit})</span>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayData.map((point, i) => {
              const isAnomaly = anomalyTimestamps.has(point.timestamp);
              return (
                <tr
                  key={i}
                  className={`${isAnomaly ? 'bg-field-warning/10' : i % 2 === 0 ? '' : 'bg-muted/20'}`}
                >
                  <td className="px-2 py-1 font-mono whitespace-nowrap">
                    {format(new Date(point.timestamp), 'yyyy-MM-dd HH:mm:ss')}
                  </td>
                  {visibleSeries.map(s => {
                    const val = point.values[s.id];
                    return (
                      <td key={s.id} className="px-2 py-1 text-right font-mono">
                        {val !== null ? val.toFixed(2) : <span className="text-muted-foreground">—</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
