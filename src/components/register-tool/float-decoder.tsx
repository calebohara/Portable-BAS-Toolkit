'use client';

import { useState, useMemo } from 'react';
import { Calculator, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SectionCard, ResultRow, Warning } from './shared';
import {
  parseNumberInput, toHex,
  wordsToFloat32, float32ToWords, floatToIEEE754Breakdown, isReasonableFloat,
} from '@/lib/register-utils';

export function FloatDecoder() {
  const [direction, setDirection] = useState<'decode' | 'encode'>('decode');
  const [reg1Str, setReg1Str] = useState('');
  const [reg2Str, setReg2Str] = useState('');
  const [floatInput, setFloatInput] = useState('');
  const [swapWords, setSwapWords] = useState(false);

  // Decode: registers → float
  const decoded = useMemo(() => {
    if (direction !== 'decode') return null;
    const r1 = parseNumberInput(reg1Str.trim() || '0');
    const r2 = parseNumberInput(reg2Str.trim() || '0');
    if (!r1.valid || !r2.valid) return null;
    const f = wordsToFloat32(r1.value, r2.value, swapWords);
    const breakdown = floatToIEEE754Breakdown(f);
    return { float: f, breakdown, reasonable: isReasonableFloat(f) };
  }, [direction, reg1Str, reg2Str, swapWords]);

  // Encode: float → registers
  const encoded = useMemo(() => {
    if (direction !== 'encode') return null;
    const f = parseFloat(floatInput);
    if (isNaN(f)) return null;
    const [w1, w2] = float32ToWords(f);
    const breakdown = floatToIEEE754Breakdown(f);
    return { words: swapWords ? [w2, w1] : [w1, w2], breakdown };
  }, [direction, floatInput, swapWords]);

  const breakdown = direction === 'decode' ? decoded?.breakdown : encoded?.breakdown;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs">
          <input type="radio" checked={direction === 'decode'} onChange={() => setDirection('decode')} className="accent-primary" />
          Registers → Float
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="radio" checked={direction === 'encode'} onChange={() => setDirection('encode')} className="accent-primary" />
          Float → Registers
        </label>
        <label className="flex items-center gap-2 text-xs ml-4">
          <Switch checked={swapWords} onCheckedChange={c => setSwapWords(!!c)} size="sm" />
          Swap Words
        </label>
      </div>

      {direction === 'decode' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Register 1 (High Word)</Label>
            <Input value={reg1Str} onChange={e => setReg1Str(e.target.value)} placeholder="0x4248" className="h-9 font-mono text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Register 2 (Low Word)</Label>
            <Input value={reg2Str} onChange={e => setReg2Str(e.target.value)} placeholder="0x0000" className="h-9 font-mono text-sm" />
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 max-w-xs">
          <Label className="text-xs">Float Value</Label>
          <Input value={floatInput} onChange={e => setFloatInput(e.target.value)} placeholder="50.0" className="h-9 font-mono text-sm" />
        </div>
      )}

      {decoded && direction === 'decode' && (
        <SectionCard title="Decoded Result" icon={Calculator}>
          <ResultRow label="Float32" value={decoded.float.toPrecision(7)} />
          {!decoded.reasonable && <Warning>This float value may be incorrect — try swapping word order</Warning>}
        </SectionCard>
      )}

      {encoded && direction === 'encode' && (
        <SectionCard title="Encoded Registers" icon={Calculator}>
          <ResultRow label="Register 1 (High)" value={`${encoded.words[0]} (${toHex(encoded.words[0], 16)})`} />
          <ResultRow label="Register 2 (Low)" value={`${encoded.words[1]} (${toHex(encoded.words[1], 16)})`} />
        </SectionCard>
      )}

      {breakdown && (
        <SectionCard title="IEEE 754 Breakdown" icon={Info}>
          <ResultRow label="Sign" value={breakdown.sign === 0 ? '0 (+)' : '1 (-)'} />
          <ResultRow label="Exponent (biased)" value={`${breakdown.exponentBiased} (unbiased: ${breakdown.exponent})`} />
          <ResultRow label="Mantissa bits" value={breakdown.mantissaBits} />
          <ResultRow label="Full binary" value={breakdown.fullBinary} />
          <ResultRow label="Hex" value={breakdown.hex} />
          {breakdown.isSpecial && breakdown.specialLabel && (
            <Warning>{breakdown.specialLabel}</Warning>
          )}
        </SectionCard>
      )}
    </div>
  );
}
