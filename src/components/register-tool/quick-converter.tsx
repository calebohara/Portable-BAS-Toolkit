'use client';

import { useState, useMemo } from 'react';
import { Binary, ArrowLeftRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { SectionCard, ResultRow, Warning } from './shared';
import {
  parseNumberInput,
  toHex, toBinary, toOctal,
  toSigned16, toUnsigned16, toSigned32, toUnsigned32,
  getValueRangeWarnings,
} from '@/lib/register-utils';

export function QuickConverter() {
  const [input, setInput] = useState('');
  const [inputBase, setInputBase] = useState<'auto' | 'dec' | 'hex' | 'bin' | 'oct'>('auto');

  const parsed = useMemo(() => {
    if (!input.trim()) return null;
    const raw = input.trim();
    if (inputBase === 'hex') return parseNumberInput(raw.startsWith('0x') || raw.startsWith('0X') ? raw : '0x' + raw);
    if (inputBase === 'bin') return parseNumberInput(raw.startsWith('0b') || raw.startsWith('0B') ? raw : '0b' + raw.replace(/\s/g, ''));
    if (inputBase === 'oct') return parseNumberInput(raw.startsWith('0o') || raw.startsWith('0O') ? raw : '0o' + raw);
    return parseNumberInput(raw);
  }, [input, inputBase]);

  const warnings = useMemo(() => parsed?.valid ? getValueRangeWarnings(parsed.value) : [], [parsed]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1.5">
          <Label className="text-xs">Input Value</Label>
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Enter value (dec, 0xFF, 0b1010, 0o77)..."
            className="h-9 font-mono text-sm"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Input Base</Label>
          <Select value={inputBase} onValueChange={v => v && setInputBase(v as typeof inputBase)}>
            <SelectTrigger className="h-9 text-xs w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto-detect</SelectItem>
              <SelectItem value="dec">Decimal</SelectItem>
              <SelectItem value="hex">Hexadecimal</SelectItem>
              <SelectItem value="bin">Binary</SelectItem>
              <SelectItem value="oct">Octal</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {parsed && !parsed.valid && (
        <Warning>{parsed.error || 'Invalid input'}</Warning>
      )}

      {warnings.map((w, i) => <Warning key={i}>{w}</Warning>)}

      {parsed?.valid && (
        <div className="grid gap-3 sm:grid-cols-2">
          <SectionCard title="Number Formats" icon={Binary}>
            <ResultRow label="Decimal" value={String(parsed.value)} />
            <ResultRow label="Hex (16-bit)" value={toHex(parsed.value, 16)} />
            <ResultRow label="Hex (32-bit)" value={toHex(parsed.value, 32)} />
            <ResultRow label="Binary (16-bit)" value={toBinary(parsed.value, 16)} />
            <ResultRow label="Binary (32-bit)" value={toBinary(parsed.value, 32)} />
            <ResultRow label="Octal" value={toOctal(parsed.value)} />
          </SectionCard>

          <SectionCard title="Signed / Unsigned" icon={ArrowLeftRight}>
            <ResultRow label="Unsigned 16-bit" value={String(toUnsigned16(parsed.value))} />
            <ResultRow label="Signed 16-bit" value={String(toSigned16(parsed.value))} />
            <ResultRow label="Unsigned 32-bit" value={String(toUnsigned32(parsed.value))} />
            <ResultRow label="Signed 32-bit" value={String(toSigned32(parsed.value))} />
          </SectionCard>
        </div>
      )}

      <Button variant="outline" size="sm" onClick={() => setInput('')} className="gap-1.5">
        <RotateCcw className="h-3 w-3" /> Reset
      </Button>
    </div>
  );
}
