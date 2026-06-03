'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { AnomalyConfig } from '@/types';
import { defaultAnomalyConfig } from '@/lib/trend-anomaly-engine';

interface AnomalyConfigSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: AnomalyConfig;
  onChange: (config: AnomalyConfig) => void;
}

// Keys that may legitimately be cleared (empty = feature disabled). Every other
// numeric key is required by the detector and must never hold NaN/null, or the
// engine silently returns 0 anomalies (see detectOutOfRange's null guards vs.
// the unconditional `* 60_000` math in the other detectors).
const NULLABLE_KEYS = new Set<keyof AnomalyConfig>(['outOfRangeMin', 'outOfRangeMax']);

// Minimum allowed value for each required field (mirrors the engine's math and
// the input `min` attributes). Required fields clamp to this floor.
const MIN_VALUES: Partial<Record<keyof AnomalyConfig, number>> = {
  stuckThresholdMinutes: 1,
  stuckTolerance: 0,
  spikeStdDevMultiplier: 1,
  spikeRollingWindowSize: 5,
  oscillationWindowMinutes: 1,
  oscillationMinReversals: 2,
  shortCycleWindowMinutes: 1,
  shortCycleMinTransitions: 2,
  gapThresholdMultiplier: 1,
};

export function AnomalyConfigSheet({ open, onOpenChange, config, onChange }: AnomalyConfigSheetProps) {
  // Track raw input text so an in-progress invalid entry (empty / garbage) stays
  // visible with an error state instead of silently snapping back to the last
  // valid value. The committed `config` only ever receives valid numbers.
  const [raw, setRaw] = useState<Partial<Record<keyof AnomalyConfig, string>>>({});

  // Discard local raw overrides when the sheet transitions open so the inputs
  // reflect the authoritative config on each fresh open. We intentionally do NOT
  // key this on `config` identity — `update()` commits to config on every valid
  // keystroke, and resetting raw there would clear mid-typed multi-digit input.
  // "Reset to Defaults" clears raw explicitly instead (see resetDefaults). Done
  // with the React "adjust state during render" pattern rather than an effect, to
  // avoid a cascading-render lint and an extra paint.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) setRaw({});
  }

  const update = (key: keyof AnomalyConfig, value: string) => {
    setRaw(prev => ({ ...prev, [key]: value }));

    if (NULLABLE_KEYS.has(key)) {
      // Optional field: empty clears it (disables the check).
      if (value.trim() === '') {
        onChange({ ...config, [key]: null });
        return;
      }
      const parsed = parseFloat(value);
      if (Number.isNaN(parsed)) return; // invalid — leave prior value committed
      onChange({ ...config, [key]: parsed });
      return;
    }

    // Required field: reject empty/NaN, clamp to the field's minimum.
    const parsed = parseFloat(value);
    if (Number.isNaN(parsed)) return; // invalid — leave prior value committed
    const min = MIN_VALUES[key] ?? 0;
    onChange({ ...config, [key]: Math.max(min, parsed) });
  };

  // A field shows an error when its raw text is present but cannot be committed:
  // empty/garbage for a required field, or non-numeric garbage for an optional one.
  const isInvalid = (key: keyof AnomalyConfig): boolean => {
    const r = raw[key];
    if (r === undefined) return false; // untouched — reflects valid config
    const trimmed = r.trim();
    if (trimmed === '') return !NULLABLE_KEYS.has(key); // empty only valid for nullable
    return Number.isNaN(parseFloat(trimmed));
  };

  // Display value: prefer the user's raw text while editing, else the config value.
  const display = (key: keyof AnomalyConfig): string | number => {
    if (raw[key] !== undefined) return raw[key] as string;
    const v = config[key];
    return v === null || v === undefined ? '' : v;
  };

  const resetDefaults = () => {
    setRaw({});
    onChange(defaultAnomalyConfig());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Anomaly Detection Settings</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-5">
          {/* Stuck Sensor */}
          <section>
            <h4 className="text-xs font-semibold mb-2">Stuck Sensor</h4>
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Threshold (minutes)" fieldKey="stuckThresholdMinutes" min={1}
                value={display('stuckThresholdMinutes')} invalid={isInvalid('stuckThresholdMinutes')} onUpdate={update} />
              <NumField label="Tolerance" fieldKey="stuckTolerance" min={0} step={0.001}
                value={display('stuckTolerance')} invalid={isInvalid('stuckTolerance')} onUpdate={update} />
            </div>
          </section>

          {/* Spike */}
          <section>
            <h4 className="text-xs font-semibold mb-2">Spike Detection</h4>
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Std Dev Multiplier (sigma)" fieldKey="spikeStdDevMultiplier" min={1} step={0.5}
                value={display('spikeStdDevMultiplier')} invalid={isInvalid('spikeStdDevMultiplier')} onUpdate={update} />
              <NumField label="Rolling Window Size" fieldKey="spikeRollingWindowSize" min={5}
                value={display('spikeRollingWindowSize')} invalid={isInvalid('spikeRollingWindowSize')} onUpdate={update} />
            </div>
          </section>

          {/* Out of Range */}
          <section>
            <h4 className="text-xs font-semibold mb-2">Out of Range</h4>
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Minimum (empty = disabled)" fieldKey="outOfRangeMin" placeholder="—"
                value={display('outOfRangeMin')} invalid={isInvalid('outOfRangeMin')} onUpdate={update} />
              <NumField label="Maximum (empty = disabled)" fieldKey="outOfRangeMax" placeholder="—"
                value={display('outOfRangeMax')} invalid={isInvalid('outOfRangeMax')} onUpdate={update} />
            </div>
          </section>

          {/* Oscillation */}
          <section>
            <h4 className="text-xs font-semibold mb-2">Oscillation / Hunting</h4>
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Window (minutes)" fieldKey="oscillationWindowMinutes" min={1}
                value={display('oscillationWindowMinutes')} invalid={isInvalid('oscillationWindowMinutes')} onUpdate={update} />
              <NumField label="Min Reversals" fieldKey="oscillationMinReversals" min={2}
                value={display('oscillationMinReversals')} invalid={isInvalid('oscillationMinReversals')} onUpdate={update} />
            </div>
          </section>

          {/* Short Cycling */}
          <section>
            <h4 className="text-xs font-semibold mb-2">Short Cycling (Binary Points)</h4>
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Window (minutes)" fieldKey="shortCycleWindowMinutes" min={1}
                value={display('shortCycleWindowMinutes')} invalid={isInvalid('shortCycleWindowMinutes')} onUpdate={update} />
              <NumField label="Min Transitions" fieldKey="shortCycleMinTransitions" min={2}
                value={display('shortCycleMinTransitions')} invalid={isInvalid('shortCycleMinTransitions')} onUpdate={update} />
            </div>
          </section>

          {/* Gap */}
          <section>
            <h4 className="text-xs font-semibold mb-2">Data Gaps</h4>
            <div className="w-1/2">
              <NumField label="Gap Threshold Multiplier (× median interval)" fieldKey="gapThresholdMultiplier" min={1} step={0.5}
                value={display('gapThresholdMultiplier')} invalid={isInvalid('gapThresholdMultiplier')} onUpdate={update} />
            </div>
          </section>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={resetDefaults}>
            Reset to Defaults
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface NumFieldProps {
  label: string;
  fieldKey: keyof AnomalyConfig;
  value: string | number;
  invalid: boolean;
  onUpdate: (key: keyof AnomalyConfig, value: string) => void;
  min?: number;
  step?: number;
  placeholder?: string;
}

function NumField({ label, fieldKey, value, invalid, onUpdate, min, step, placeholder }: NumFieldProps) {
  return (
    <div>
      <Label className="text-[10px]">{label}</Label>
      <Input
        type="number"
        min={min}
        step={step}
        placeholder={placeholder}
        value={value}
        aria-invalid={invalid}
        onChange={e => onUpdate(fieldKey, e.target.value)}
        className="h-8 text-sm"
      />
      {invalid && (
        <p className="text-[10px] text-destructive mt-0.5">
          Enter a valid number{min !== undefined ? ` (≥ ${min})` : ''}.
        </p>
      )}
    </div>
  );
}
