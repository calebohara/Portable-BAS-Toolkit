'use client';

import { useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, Brush,
  ReferenceArea, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { format } from 'date-fns';
import type { TrendDataPoint, TrendSeries, TrendAnomaly } from '@/types';
import { downsampleForChart } from '@/lib/trend-downsample';

interface TrendChartProps {
  data: TrendDataPoint[];
  series: TrendSeries[];
  anomalies: TrendAnomaly[];
  zoomDomain: [number, number] | null;
  onZoomChange: (domain: [number, number] | null) => void;
}

export interface TrendChartHandle {
  containerRef: HTMLDivElement | null;
}

export const TrendChart = forwardRef<TrendChartHandle, TrendChartProps>(
  function TrendChart({ data, series, anomalies, zoomDomain, onZoomChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      get containerRef() { return containerRef.current; },
    }));

    const visibleSeries = useMemo(() => series.filter(s => s.visible), [series]);
    const visibleIds = useMemo(() => visibleSeries.map(s => s.id), [visibleSeries]);

    // Apply zoom filter
    const zoomedData = useMemo(() => {
      if (!zoomDomain) return data;
      return data.filter(d => d.timestamp >= zoomDomain[0] && d.timestamp <= zoomDomain[1]);
    }, [data, zoomDomain]);

    // Downsample for performance
    const chartData = useMemo(
      () => downsampleForChart(zoomedData, visibleIds, 2000),
      [zoomedData, visibleIds]
    );

    // Flatten data for Recharts (it wants flat objects)
    const flatData = useMemo(() =>
      chartData.map(p => ({
        timestamp: p.timestamp,
        ...p.values,
      })),
      [chartData]
    );

    // Anomaly regions for visible series
    const anomalyRegions = useMemo(() =>
      anomalies.filter(a => {
        const s = series.find(s => s.id === a.seriesId);
        return s?.visible;
      }),
      [anomalies, series]
    );

    const leftSeries = visibleSeries.filter(s => s.yAxisSide === 'left');
    const rightSeries = visibleSeries.filter(s => s.yAxisSide === 'right');
    const isLargeDataset = data.length > 5000;

    if (flatData.length === 0) {
      return (
        <div className="flex items-center justify-center h-[350px] text-muted-foreground text-sm">
          No data to display
        </div>
      );
    }

    return (
      <div ref={containerRef}>
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={flatData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />

            <XAxis
              dataKey="timestamp"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(ts: number) => format(new Date(ts), 'MMM d HH:mm')}
              fontSize={11}
              tickMargin={4}
            />

            {/* Left Y-Axis */}
            {leftSeries.length > 0 && (
              <YAxis
                yAxisId="left"
                orientation="left"
                fontSize={11}
                tickMargin={4}
                width={55}
                label={leftSeries.length === 1 && leftSeries[0].unit
                  ? { value: leftSeries[0].unit, angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 11 } }
                  : undefined}
              />
            )}

            {/* Right Y-Axis */}
            {rightSeries.length > 0 && (
              <YAxis
                yAxisId="right"
                orientation="right"
                fontSize={11}
                tickMargin={4}
                width={55}
                label={rightSeries.length === 1 && rightSeries[0].unit
                  ? { value: rightSeries[0].unit, angle: 90, position: 'insideRight', offset: 10, style: { fontSize: 11 } }
                  : undefined}
              />
            )}

            <Tooltip
              content={({ payload, label }) => {
                if (!payload || payload.length === 0) return null;
                const ts = label as number;
                return (
                  <div className="rounded-lg border bg-popover p-2.5 shadow-md text-xs max-w-xs">
                    <p className="font-medium mb-1.5">{format(new Date(ts), 'MMM d, yyyy HH:mm:ss')}</p>
                    {payload.map((entry, idx) => {
                      const s = series.find(s => s.id === entry.dataKey);
                      return (
                        <div key={String(entry.dataKey) || idx} className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                          <span className="truncate text-muted-foreground">{s?.name || String(entry.dataKey)}:</span>
                          <span className="font-medium ml-auto">
                            {typeof entry.value === 'number' ? entry.value.toFixed(2) : '—'}
                            {s?.unit ? ` ${s.unit}` : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              }}
            />

            {/* Anomaly highlight regions */}
            {anomalyRegions.map(a => (
              <ReferenceArea
                key={a.id}
                x1={a.startTimestamp}
                x2={a.endTimestamp || a.startTimestamp + 60000}
                yAxisId={series.find(s => s.id === a.seriesId)?.yAxisSide === 'right' ? 'right' : 'left'}
                fill={a.severity === 'critical' ? '#ef4444' : a.severity === 'warning' ? '#f59e0b' : '#3b82f6'}
                fillOpacity={0.08}
                strokeOpacity={0}
              />
            ))}

            {/* Data lines */}
            {visibleSeries.map(s => (
              <Line
                key={s.id}
                dataKey={s.id}
                yAxisId={s.yAxisSide === 'right' ? 'right' : 'left'}
                stroke={s.color}
                strokeWidth={1.5}
                dot={false}
                connectNulls={false}
                isAnimationActive={!isLargeDataset}
                name={s.name}
              />
            ))}

            {/* Brush for time range selection */}
            {!zoomDomain && data.length > 50 && (
              <Brush
                dataKey="timestamp"
                height={30}
                stroke="var(--color-primary)"
                fill="var(--color-muted)"
                tickFormatter={(ts: number) => format(new Date(ts), 'MMM d')}
                onChange={(range) => {
                  if (range && 'startIndex' in range && range.startIndex !== undefined && range.endIndex !== undefined) {
                    const start = flatData[range.startIndex]?.timestamp;
                    const end = flatData[range.endIndex]?.timestamp;
                    if (start && end && (range.startIndex > 0 || range.endIndex < flatData.length - 1)) {
                      onZoomChange([start, end]);
                    }
                  }
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  }
);
