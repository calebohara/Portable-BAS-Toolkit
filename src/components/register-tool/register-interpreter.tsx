'use client';

import { useState, useMemo } from 'react';
import { Cpu } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionCard, ResultRow } from './shared';
import {
  parseNumberInput,
  interpretRegister, interpretRegisterPair,
  isReasonableFloat,
} from '@/lib/register-utils';

export function RegisterInterpreter() {
  const [reg1Str, setReg1Str] = useState('');
  const [reg2Str, setReg2Str] = useState('');
  const [mode, setMode] = useState<'single' | 'pair'>('pair');

  const reg1 = useMemo(() => parseNumberInput(reg1Str.trim() || '0'), [reg1Str]);
  const reg2 = useMemo(() => parseNumberInput(reg2Str.trim() || '0'), [reg2Str]);

  const singleResult = useMemo(() => {
    if (!reg1.valid) return null;
    return interpretRegister(reg1.value);
  }, [reg1]);

  const pairResult = useMemo(() => {
    if (!reg1.valid || !reg2.valid) return null;
    return interpretRegisterPair(reg1.value, reg2.value);
  }, [reg1, reg2]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs">
          <input type="radio" checked={mode === 'single'} onChange={() => setMode('single')} className="accent-primary" />
          Single Register (16-bit)
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="radio" checked={mode === 'pair'} onChange={() => setMode('pair')} className="accent-primary" />
          Register Pair (32-bit)
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Register 1 (High Word)</Label>
          <Input value={reg1Str} onChange={e => setReg1Str(e.target.value)} placeholder="e.g. 0x1234 or 4660" className="h-9 font-mono text-sm" />
          {reg1Str && !reg1.valid && <p className="text-xs text-destructive">{reg1.error}</p>}
        </div>
        {mode === 'pair' && (
          <div className="space-y-1.5">
            <Label className="text-xs">Register 2 (Low Word)</Label>
            <Input value={reg2Str} onChange={e => setReg2Str(e.target.value)} placeholder="e.g. 0x5678 or 22136" className="h-9 font-mono text-sm" />
            {reg2Str && !reg2.valid && <p className="text-xs text-destructive">{reg2.error}</p>}
          </div>
        )}
      </div>

      {mode === 'single' && singleResult && (
        <SectionCard title="16-bit Interpretation" icon={Cpu}>
          <ResultRow label="Unsigned 16" value={String(singleResult.uint16)} />
          <ResultRow label="Signed 16" value={String(singleResult.int16)} />
          <ResultRow label="Hex" value={singleResult.hex} />
          <ResultRow label="Binary" value={singleResult.binary} />
        </SectionCard>
      )}

      {mode === 'pair' && pairResult && (
        <div className="grid gap-3 sm:grid-cols-2">
          {pairResult.byteOrders.map((r, i) => (
            <SectionCard key={i} title={r.order} icon={Cpu}>
              <ResultRow label="Unsigned 32" value={r.uint32.toLocaleString()} />
              <ResultRow label="Signed 32" value={r.int32.toLocaleString()} />
              <ResultRow label="Float 32" value={isReasonableFloat(r.float32) ? r.float32.toPrecision(7) : `${r.float32} (suspect)`} />
              <ResultRow label="Hex" value={r.hex} />
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}
