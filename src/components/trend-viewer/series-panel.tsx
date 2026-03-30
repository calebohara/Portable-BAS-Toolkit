'use client';

import type { TrendSeries } from '@/types';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';

interface SeriesPanelProps {
  series: TrendSeries[];
  onSeriesChange: (series: TrendSeries[]) => void;
}

export function SeriesPanel({ series, onSeriesChange }: SeriesPanelProps) {
  const toggleVisibility = (id: string) => {
    onSeriesChange(series.map(s => s.id === id ? { ...s, visible: !s.visible } : s));
  };

  const toggleAxis = (id: string) => {
    onSeriesChange(series.map(s => s.id === id ? { ...s, yAxisSide: s.yAxisSide === 'left' ? 'right' : 'left' } : s));
  };

  const showAll = () => onSeriesChange(series.map(s => ({ ...s, visible: true })));
  const hideAll = () => onSeriesChange(series.map(s => ({ ...s, visible: false })));

  const visibleCount = series.filter(s => s.visible).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground">
          {visibleCount} of {series.length} visible
        </span>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="xs" onClick={showAll}>Show All</Button>
          <Button variant="ghost" size="xs" onClick={hideAll}>Hide All</Button>
        </div>
      </div>

      <div className="space-y-1">
        {series.map(s => (
          <div
            key={s.id}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
          >
            {/* Color swatch */}
            <span
              className="h-3 w-3 rounded-full shrink-0 border border-black/10"
              style={{ backgroundColor: s.color, opacity: s.visible ? 1 : 0.3 }}
            />

            {/* Visibility toggle */}
            <button
              onClick={() => toggleVisibility(s.id)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title={s.visible ? 'Hide series' : 'Show series'}
            >
              {s.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>

            {/* Name + unit */}
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium truncate ${!s.visible ? 'text-muted-foreground' : ''}`}>
                {s.name}
              </p>
              {s.unit && (
                <p className="text-[10px] text-muted-foreground">{s.unit}</p>
              )}
            </div>

            {/* Source file */}
            <span className="text-[10px] text-muted-foreground truncate max-w-[100px]" title={s.sourceFile}>
              {s.sourceFile}
            </span>

            {/* Axis toggle */}
            <button
              onClick={() => toggleAxis(s.id)}
              className="text-[10px] px-1.5 py-0.5 rounded border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors shrink-0"
              title={`Move to ${s.yAxisSide === 'left' ? 'right' : 'left'} axis`}
            >
              {s.yAxisSide === 'left' ? 'L' : 'R'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
