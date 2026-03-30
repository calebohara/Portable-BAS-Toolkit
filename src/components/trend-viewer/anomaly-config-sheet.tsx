'use client';

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

export function AnomalyConfigSheet({ open, onOpenChange, config, onChange }: AnomalyConfigSheetProps) {
  const update = (key: keyof AnomalyConfig, value: string) => {
    const numVal = value === '' ? null : parseFloat(value);
    onChange({ ...config, [key]: numVal });
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
              <div>
                <Label className="text-[10px]">Threshold (minutes)</Label>
                <Input type="number" min={1} value={config.stuckThresholdMinutes} onChange={e => update('stuckThresholdMinutes', e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[10px]">Tolerance</Label>
                <Input type="number" min={0} step={0.001} value={config.stuckTolerance} onChange={e => update('stuckTolerance', e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          </section>

          {/* Spike */}
          <section>
            <h4 className="text-xs font-semibold mb-2">Spike Detection</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px]">Std Dev Multiplier (sigma)</Label>
                <Input type="number" min={1} step={0.5} value={config.spikeStdDevMultiplier} onChange={e => update('spikeStdDevMultiplier', e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[10px]">Rolling Window Size</Label>
                <Input type="number" min={5} value={config.spikeRollingWindowSize} onChange={e => update('spikeRollingWindowSize', e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          </section>

          {/* Out of Range */}
          <section>
            <h4 className="text-xs font-semibold mb-2">Out of Range</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px]">Minimum (empty = disabled)</Label>
                <Input type="number" value={config.outOfRangeMin ?? ''} onChange={e => update('outOfRangeMin', e.target.value)} className="h-8 text-sm" placeholder="—" />
              </div>
              <div>
                <Label className="text-[10px]">Maximum (empty = disabled)</Label>
                <Input type="number" value={config.outOfRangeMax ?? ''} onChange={e => update('outOfRangeMax', e.target.value)} className="h-8 text-sm" placeholder="—" />
              </div>
            </div>
          </section>

          {/* Oscillation */}
          <section>
            <h4 className="text-xs font-semibold mb-2">Oscillation / Hunting</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px]">Window (minutes)</Label>
                <Input type="number" min={1} value={config.oscillationWindowMinutes} onChange={e => update('oscillationWindowMinutes', e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[10px]">Min Reversals</Label>
                <Input type="number" min={2} value={config.oscillationMinReversals} onChange={e => update('oscillationMinReversals', e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          </section>

          {/* Short Cycling */}
          <section>
            <h4 className="text-xs font-semibold mb-2">Short Cycling (Binary Points)</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px]">Window (minutes)</Label>
                <Input type="number" min={1} value={config.shortCycleWindowMinutes} onChange={e => update('shortCycleWindowMinutes', e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[10px]">Min Transitions</Label>
                <Input type="number" min={2} value={config.shortCycleMinTransitions} onChange={e => update('shortCycleMinTransitions', e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          </section>

          {/* Gap */}
          <section>
            <h4 className="text-xs font-semibold mb-2">Data Gaps</h4>
            <div>
              <Label className="text-[10px]">Gap Threshold Multiplier (× median interval)</Label>
              <Input type="number" min={1} step={0.5} value={config.gapThresholdMultiplier} onChange={e => update('gapThresholdMultiplier', e.target.value)} className="h-8 text-sm w-1/2" />
            </div>
          </section>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onChange(defaultAnomalyConfig())}>
            Reset to Defaults
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
