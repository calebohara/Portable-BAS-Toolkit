'use client';

import { format } from 'date-fns';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TrendSeriesStats, TrendSeries, TrendDataPoint } from '@/types';
import { copyStatsToClipboard } from '@/lib/trend-export';
import { toast } from 'sonner';

interface StatisticsPanelProps {
  stats: TrendSeriesStats[];
  series: TrendSeries[];
  data: TrendDataPoint[];
}

export function StatisticsPanel({ stats, series, data }: StatisticsPanelProps) {
  const handleCopy = async () => {
    await copyStatsToClipboard(stats, series);
    toast.success('Statistics copied to clipboard');
  };

  const timeRange = data.length > 0
    ? `${format(new Date(data[0].timestamp), 'MMM d, yyyy HH:mm')} — ${format(new Date(data[data.length - 1].timestamp), 'MMM d, yyyy HH:mm')}`
    : '—';

  const totalDuration = data.length >= 2
    ? formatDuration(data[data.length - 1].timestamp - data[0].timestamp)
    : '—';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">Range:</span> {timeRange} ({totalDuration})
          <span className="ml-3 font-medium">Total Points:</span> {data.length.toLocaleString()}
        </div>
        <Button variant="outline" size="xs" onClick={handleCopy}>
          <Copy className="h-3 w-3 mr-1" />
          Copy
        </Button>
      </div>

      <div className="overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Series</TableHead>
              <TableHead className="text-xs text-right">Min</TableHead>
              <TableHead className="text-xs text-right">Max</TableHead>
              <TableHead className="text-xs text-right">Mean</TableHead>
              <TableHead className="text-xs text-right">Median</TableHead>
              <TableHead className="text-xs text-right">Std Dev</TableHead>
              <TableHead className="text-xs text-right">Samples</TableHead>
              <TableHead className="text-xs text-right">Gaps</TableHead>
              <TableHead className="text-xs text-right">Runtime</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.map(stat => {
              const s = series.find(s => s.id === stat.seriesId);
              return (
                <TableRow key={stat.seriesId}>
                  <TableCell className="text-xs font-medium">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s?.color }} />
                      <span className="truncate max-w-[150px]">{s?.name || 'Unknown'}</span>
                      {s?.unit && <span className="text-muted-foreground">({s.unit})</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-right font-mono">{stat.min.toFixed(2)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{stat.max.toFixed(2)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{stat.mean.toFixed(2)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{stat.median.toFixed(2)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{stat.stdDev.toFixed(2)}</TableCell>
                  <TableCell className="text-xs text-right">{stat.sampleCount.toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-right">{stat.gapCount}</TableCell>
                  <TableCell className="text-xs text-right">
                    {stat.runtimeHours !== null ? `${stat.runtimeHours.toFixed(1)} hr` : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const hours = ms / 3600000;
  if (hours < 24) return `${hours.toFixed(1)} hr`;
  return `${(hours / 24).toFixed(1)} days`;
}
