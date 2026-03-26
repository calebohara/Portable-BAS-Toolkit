'use client';

import { useState, useCallback, useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { SectionCard, ResultRow } from './shared';
import { scaleLinear, inverseScaleLinear, SCALING_PRESETS } from '@/lib/register-utils';

export function ScalingCalculator() {
  const [rawMin, setRawMin] = useState('0');
  const [rawMax, setRawMax] = useState('65535');
  const [engMin, setEngMin] = useState('0');
  const [engMax, setEngMax] = useState('100');
  const [rawInput, setRawInput] = useState('');
  const [engInput, setEngInput] = useState('');
  const [precision, setPrecision] = useState(2);

  const applyPreset = useCallback((p: typeof SCALING_PRESETS[number]) => {
    setRawMin(String(p.rawMin));
    setRawMax(String(p.rawMax));
    setEngMin(String(p.engMin));
    setEngMax(String(p.engMax));
  }, []);

  const rawToEng = useMemo(() => {
    const raw = parseFloat(rawInput);
    if (isNaN(raw)) return null;
    return scaleLinear(raw, parseFloat(rawMin), parseFloat(rawMax), parseFloat(engMin), parseFloat(engMax));
  }, [rawInput, rawMin, rawMax, engMin, engMax]);

  const engToRaw = useMemo(() => {
    const eng = parseFloat(engInput);
    if (isNaN(eng)) return null;
    return inverseScaleLinear(eng, parseFloat(rawMin), parseFloat(rawMax), parseFloat(engMin), parseFloat(engMax));
  }, [engInput, rawMin, rawMax, engMin, engMax]);

  return (
    <div className="space-y-4">
      {/* Presets */}
      <div className="flex flex-wrap gap-1.5">
        {SCALING_PRESETS.map(p => (
          <Button key={p.name} variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => applyPreset(p)}>
            {p.name}
          </Button>
        ))}
      </div>

      {/* Range setup */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Raw Min</Label>
          <Input value={rawMin} onChange={e => setRawMin(e.target.value)} className="h-8 font-mono text-xs" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Raw Max</Label>
          <Input value={rawMax} onChange={e => setRawMax(e.target.value)} className="h-8 font-mono text-xs" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Eng Min</Label>
          <Input value={engMin} onChange={e => setEngMin(e.target.value)} className="h-8 font-mono text-xs" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Eng Max</Label>
          <Input value={engMax} onChange={e => setEngMax(e.target.value)} className="h-8 font-mono text-xs" />
        </div>
      </div>

      <div className="flex items-end gap-2">
        <Label className="text-xs">Decimal Precision:</Label>
        <Select value={String(precision)} onValueChange={v => v && setPrecision(Number(v))}>
          <SelectTrigger className="h-8 text-xs w-16"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[0, 1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Raw → Engineering */}
        <SectionCard title="Raw → Engineering" icon={TrendingUp}>
          <div className="space-y-1.5">
            <Label className="text-xs">Raw Register Value</Label>
            <Input value={rawInput} onChange={e => setRawInput(e.target.value)} placeholder="32767" className="h-8 font-mono text-xs" />
          </div>
          {rawToEng && (
            <div className="space-y-1">
              <ResultRow label="Engineering Value" value={rawToEng.value.toFixed(precision)} />
              <ResultRow label="Slope" value={rawToEng.slope.toFixed(6)} />
              <ResultRow label="Intercept" value={rawToEng.intercept.toFixed(4)} />
              <p className="text-[10px] text-muted-foreground font-mono mt-2">{rawToEng.formula}</p>
            </div>
          )}
        </SectionCard>

        {/* Engineering → Raw */}
        <SectionCard title="Engineering → Raw" icon={TrendingUp}>
          <div className="space-y-1.5">
            <Label className="text-xs">Engineering Value</Label>
            <Input value={engInput} onChange={e => setEngInput(e.target.value)} placeholder="72.5" className="h-8 font-mono text-xs" />
          </div>
          {engToRaw && (
            <div className="space-y-1">
              <ResultRow label="Raw Register Value" value={Math.round(engToRaw.value).toLocaleString()} />
              <ResultRow label="Raw (exact)" value={engToRaw.value.toFixed(precision)} />
              <p className="text-[10px] text-muted-foreground font-mono mt-2">{engToRaw.formula}</p>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
