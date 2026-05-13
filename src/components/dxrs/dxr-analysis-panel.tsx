'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle2, Minus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { DxrEntry } from '@/types';
import { analyzeField, findDuplicates } from '@/lib/dxr/analysis';
import type { FieldConsistency, DuplicateGroup } from '@/lib/dxr/analysis';

// Cast helper: DxrEntry lacks an index signature but matches the AnyRow shape
// used by the analysis helpers — safe because we always access known keys.
type AnyRow = Record<string, unknown> & { name: string | null };
function asRows(rows: DxrEntry[]): AnyRow[] {
  return rows as unknown as AnyRow[];
}

// ── Constants ──────────────────────────────────────────────────────────────

const BAUD_RATES = [9600, 19200, 38400, 76800, 115200] as const;
const DEFAULT_BAUD_RATE = 76800;

// ── Props ──────────────────────────────────────────────────────────────────

interface DxrAnalysisPanelProps {
  rows: DxrEntry[];
  onApplyBaudRate?: (rate: number) => Promise<void>;
  readOnly?: boolean;
}

// ── Sub-components ─────────────────────────────────────────────────────────

/** Shared card wrapper */
function AnalysisCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border p-3 space-y-2', className)}>
      {children}
    </div>
  );
}

/** Card header row: label + status icon */
function CardHeader({
  label,
  status,
}: {
  label: string;
  status: 'ok' | 'warn' | 'empty';
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium">{label}</span>
      {status === 'ok' && (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
      )}
      {status === 'warn' && (
        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
      )}
      {status === 'empty' && (
        <Minus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
    </div>
  );
}

/** Renders a duplicate group as a single line */
function DuplicateRow<T>({ group }: { group: DuplicateGroup<T> }) {
  const extra = group.count - group.names.length; // names is already sliced to 5
  const nameList = group.names.join(', ') + (extra > 0 ? ` …and ${extra} more` : '');
  return (
    <div className="text-xs">
      <span className="font-mono text-red-500">{String(group.value)}</span>
      <span className="text-muted-foreground">
        {' '}· {group.count} rows · {nameList}
      </span>
    </div>
  );
}

/** Renders a consistency distribution row */
function DistributionRow<T>({
  value,
  count,
}: {
  value: T;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="font-mono">{String(value)}</span>
      <span className="text-muted-foreground shrink-0">{count} rows</span>
    </div>
  );
}

/** Duplicate card (Device Instance # / MAC Address) */
function DuplicateCard<T>({
  label,
  groups,
}: {
  label: string;
  groups: DuplicateGroup<T>[];
}) {
  const hasIssues = groups.length > 0;
  return (
    <AnalysisCard>
      <CardHeader label={label} status={hasIssues ? 'warn' : 'ok'} />
      {hasIssues ? (
        <div className="space-y-1">
          {groups.map((g, i) => (
            <DuplicateRow key={i} group={g} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No duplicates found.</p>
      )}
    </AnalysisCard>
  );
}

/** Consistency card (Network / Application # / Max. Manager Address) */
function ConsistencyCard<T>({
  label,
  result,
}: {
  label: string;
  result: FieldConsistency<T>;
}) {
  const status =
    result.kind === 'empty' ? 'empty' : result.kind === 'consistent' ? 'ok' : 'warn';

  return (
    <AnalysisCard>
      <CardHeader label={label} status={status} />
      {result.kind === 'empty' && (
        <p className="text-xs text-muted-foreground">No data.</p>
      )}
      {result.kind === 'consistent' && (
        <div className="text-xs flex items-center gap-1">
          <span className="font-mono">{String(result.value)}</span>
          <span className="text-muted-foreground">— consistent</span>
        </div>
      )}
      {result.kind === 'mixed' && result.distribution && (
        <div className="space-y-0.5">
          {result.distribution.map((d, i) => (
            <DistributionRow key={i} value={d.value} count={d.count} />
          ))}
        </div>
      )}
    </AnalysisCard>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function DxrAnalysisPanel({
  rows,
  onApplyBaudRate,
  readOnly = false,
}: DxrAnalysisPanelProps) {
  const [baudRateSelection, setBaudRateSelection] = useState<number>(DEFAULT_BAUD_RATE);
  const [applying, setApplying] = useState(false);

  if (rows.length === 0) return null;

  // ── Compute analyses ───────────────────────────────────────
  const r = asRows(rows);
  const deviceInstanceDupes = findDuplicates<number>(r, 'deviceInstanceNumber');
  const macAddressDupes = findDuplicates<number>(r, 'macAddress');
  const networkConsistency = analyzeField<number>(r, 'network');
  const appNumberConsistency = analyzeField<number>(r, 'applicationNumber');
  const maxManagerConsistency = analyzeField<number>(r, 'maxManagerAddress');
  const baudRateConsistency = analyzeField<number>(r, 'baudRate');

  const applyDisabled = readOnly || !onApplyBaudRate || applying;

  const handleApply = async () => {
    if (!onApplyBaudRate) return;
    setApplying(true);
    try {
      await onApplyBaudRate(baudRateSelection);
    } finally {
      setApplying(false);
    }
  };

  // ── Baud Rate card status ──────────────────────────────────
  const baudStatus: 'ok' | 'warn' | 'empty' =
    baudRateConsistency.kind === 'empty'
      ? 'empty'
      : baudRateConsistency.kind === 'consistent'
      ? 'ok'
      : 'warn';

  return (
    <div className="max-h-[70vh] overflow-y-auto space-y-2">
      {/* Card 1: Device Instance # duplicates */}
      <DuplicateCard<number>
        label="Device Instance #"
        groups={deviceInstanceDupes}
      />

      {/* Card 2: MAC Address duplicates */}
      <DuplicateCard<number>
        label="MAC Address"
        groups={macAddressDupes}
      />

      {/* Card 3: Network consistency */}
      <ConsistencyCard<number>
        label="Network"
        result={networkConsistency}
      />

      {/* Card 4: Application Number consistency */}
      <ConsistencyCard<number>
        label="Application Number"
        result={appNumberConsistency}
      />

      {/* Card 5: Max. Manager Address consistency */}
      <ConsistencyCard<number>
        label="Max. Manager Address"
        result={maxManagerConsistency}
      />

      {/* Card 6: Baud Rate consistency + Set All action */}
      <AnalysisCard>
        <CardHeader label="Baud Rate" status={baudStatus} />

        {/* Distribution */}
        {baudRateConsistency.kind === 'empty' && (
          <p className="text-xs text-muted-foreground">No data.</p>
        )}
        {baudRateConsistency.kind === 'consistent' && (
          <div className="text-xs flex items-center gap-1">
            <span className="font-mono">{String(baudRateConsistency.value)}</span>
            <span className="text-muted-foreground">— consistent</span>
          </div>
        )}
        {baudRateConsistency.kind === 'mixed' && baudRateConsistency.distribution && (
          <div className="space-y-0.5">
            {baudRateConsistency.distribution.map((d, i) => (
              <DistributionRow key={i} value={d.value} count={d.count} />
            ))}
          </div>
        )}

        {/* Set all row */}
        <div className="flex items-center gap-2 pt-1">
          <Select
            value={baudRateSelection}
            onValueChange={(val: number | null) => {
              if (val !== null) setBaudRateSelection(val);
            }}
            disabled={applyDisabled}
          >
            <SelectTrigger size="sm" className="flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BAUD_RATES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant="outline"
            className="shrink-0 text-xs h-7 px-2.5"
            disabled={applyDisabled}
            onClick={handleApply}
          >
            {applying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              'Apply'
            )}
          </Button>
        </div>
      </AnalysisCard>
    </div>
  );
}
