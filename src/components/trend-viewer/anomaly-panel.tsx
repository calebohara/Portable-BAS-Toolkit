'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, AlertCircle, Info, Settings2, ChevronDown, ChevronRight, Locate } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { TrendAnomaly, TrendSeries, AnomalyConfig, TrendAnomalyType } from '@/types';
import { TREND_ANOMALY_LABELS } from '@/types';
import { AnomalyConfigSheet } from './anomaly-config-sheet';

interface AnomalyPanelProps {
  anomalies: TrendAnomaly[];
  series: TrendSeries[];
  config: AnomalyConfig;
  onConfigChange: (config: AnomalyConfig) => void;
  onJumpTo: (timestamp: number) => void;
}

const SEVERITY_ICON = {
  critical: <AlertCircle className="h-3.5 w-3.5 text-field-danger" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 text-field-warning" />,
  info: <Info className="h-3.5 w-3.5 text-primary" />,
};

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

export function AnomalyPanel({ anomalies, series, config, onConfigChange, onJumpTo }: AnomalyPanelProps) {
  const [configOpen, setConfigOpen] = useState(false);
  const [expandedType, setExpandedType] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const groups: Record<string, TrendAnomaly[]> = {};
    for (const a of anomalies) {
      if (!groups[a.type]) groups[a.type] = [];
      groups[a.type].push(a);
    }
    // Sort each group by severity then timestamp
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.startTimestamp - b.startTimestamp);
    }
    return groups;
  }, [anomalies]);

  const types = Object.keys(grouped) as TrendAnomalyType[];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {anomalies.length} anomalies detected
          </span>
          {anomalies.filter(a => a.severity === 'critical').length > 0 && (
            <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
              {anomalies.filter(a => a.severity === 'critical').length} critical
            </Badge>
          )}
        </div>
        <Button variant="outline" size="xs" onClick={() => setConfigOpen(true)}>
          <Settings2 className="h-3 w-3 mr-1" />
          Thresholds
        </Button>
      </div>

      {types.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6">
          No anomalies detected with current settings.
        </p>
      )}

      {types.map(type => {
        const items = grouped[type];
        const isExpanded = expandedType === type;
        return (
          <div key={type} className="rounded-md border">
            <button
              className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors"
              onClick={() => setExpandedType(isExpanded ? null : type)}
            >
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span className="text-xs font-medium">{TREND_ANOMALY_LABELS[type]}</span>
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-auto">
                {items.length}
              </Badge>
            </button>

            {isExpanded && (
              <div className="border-t divide-y">
                {items.slice(0, 50).map(a => {
                  const s = series.find(s => s.id === a.seriesId);
                  return (
                    <div key={a.id} className="flex items-start gap-2 px-3 py-2 text-xs">
                      {SEVERITY_ICON[a.severity]}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{s?.name || 'Unknown'}</p>
                        <p className="text-muted-foreground truncate">{a.description}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {format(new Date(a.startTimestamp), 'MMM d HH:mm')}
                          {a.endTimestamp !== a.startTimestamp && (
                            <> — {format(new Date(a.endTimestamp), 'HH:mm')}</>
                          )}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onJumpTo(a.startTimestamp)}
                        title="Jump to this anomaly on chart"
                      >
                        <Locate className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
                {items.length > 50 && (
                  <p className="text-[10px] text-muted-foreground text-center py-2">
                    + {items.length - 50} more
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      <AnomalyConfigSheet
        open={configOpen}
        onOpenChange={setConfigOpen}
        config={config}
        onChange={onConfigChange}
      />
    </div>
  );
}
