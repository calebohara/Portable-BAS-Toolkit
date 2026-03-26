'use client';

import { useState, useCallback, useMemo } from 'react';
import { ArrowLeftRight, Grid3X3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { MonoValue, SectionCard } from './shared';
import {
  parseNumberInput, toHex, toBinary,
  getBits, toggleBit, applyMask, shiftLeft, shiftRight,
} from '@/lib/register-utils';

export function BitmaskTool() {
  const [value, setValue] = useState(0);
  const [valueInput, setValueInput] = useState('0');
  const [width, setWidth] = useState<16 | 32>(16);
  const [maskInput, setMaskInput] = useState('');
  const [maskOp, setMaskOp] = useState<'AND' | 'OR' | 'XOR' | 'NOT'>('AND');
  const [shiftDir, setShiftDir] = useState<'left' | 'right'>('left');
  const [shiftAmt, setShiftAmt] = useState(1);
  const [bitLabels, setBitLabels] = useState<Record<number, string>>({});
  const [editingLabel, setEditingLabel] = useState<number | null>(null);
  const [labelDraft, setLabelDraft] = useState('');

  const bits = useMemo(() => getBits(value, width), [value, width]);

  const handleValueChange = useCallback((input: string) => {
    setValueInput(input);
    const p = parseNumberInput(input.trim() || '0');
    if (p.valid) setValue(p.value & (width === 16 ? 0xFFFF : 0xFFFFFFFF));
  }, [width]);

  const handleBitToggle = useCallback((bit: number) => {
    const newVal = toggleBit(value, bit);
    const masked = newVal & (width === 16 ? 0xFFFF : 0xFFFFFFFF);
    setValue(masked);
    setValueInput(String(masked));
  }, [value, width]);

  const handleApplyMask = useCallback(() => {
    const m = parseNumberInput(maskInput.trim() || '0');
    if (!m.valid) { toast.error('Invalid mask value'); return; }
    const result = applyMask(value, m.value, maskOp);
    const masked = result & (width === 16 ? 0xFFFF : 0xFFFFFFFF);
    setValue(masked);
    setValueInput(String(masked));
    toast.success(`Applied ${maskOp} mask`);
  }, [value, maskInput, maskOp, width]);

  const handleShift = useCallback(() => {
    const result = shiftDir === 'left'
      ? shiftLeft(value, shiftAmt, width)
      : shiftRight(value, shiftAmt, width);
    setValue(result);
    setValueInput(String(result));
  }, [value, shiftDir, shiftAmt, width]);

  const handleLabelSave = useCallback((bit: number) => {
    if (labelDraft.trim()) {
      setBitLabels(prev => ({ ...prev, [bit]: labelDraft.trim() }));
    } else {
      setBitLabels(prev => { const n = { ...prev }; delete n[bit]; return n; });
    }
    setEditingLabel(null);
    setLabelDraft('');
  }, [labelDraft]);

  // Display bits in rows of 8, MSB first
  const bitRows = useMemo(() => {
    const rows: number[][] = [];
    for (let i = width - 1; i >= 0; i -= 8) {
      const row: number[] = [];
      for (let j = i; j > i - 8 && j >= 0; j--) {
        row.push(j);
      }
      rows.push(row);
    }
    return rows;
  }, [width]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-1.5 flex-1 min-w-48">
          <Label className="text-xs">Register Value</Label>
          <Input value={valueInput} onChange={e => handleValueChange(e.target.value)} placeholder="0" className="h-9 font-mono text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Width</Label>
          <Select value={String(width)} onValueChange={v => v && setWidth(Number(v) as 16 | 32)}>
            <SelectTrigger className="h-9 text-xs w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="16">16-bit</SelectItem>
              <SelectItem value="32">32-bit</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Live readouts */}
      <div className="flex flex-wrap gap-4 text-xs">
        <span>Dec: <MonoValue className="text-foreground">{value}</MonoValue></span>
        <span>Hex: <MonoValue className="text-foreground">{toHex(value, width)}</MonoValue></span>
        <span>Bin: <MonoValue className="text-foreground">{toBinary(value, width)}</MonoValue></span>
      </div>

      {/* Bit grid */}
      <div className="overflow-x-auto">
        {bitRows.map((row, ri) => (
          <div key={ri} className="flex gap-0.5 mb-1">
            {row.map(bitNum => (
              <div key={bitNum} className="flex flex-col items-center">
                <span className="text-[9px] text-muted-foreground mb-0.5">{bitNum}</span>
                <button
                  onClick={() => handleBitToggle(bitNum)}
                  className={cn(
                    'w-8 h-8 rounded border text-xs font-mono font-bold transition-colors',
                    bits[bitNum]
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/30 text-muted-foreground border-border hover:border-primary/50'
                  )}
                >
                  {bits[bitNum] ? '1' : '0'}
                </button>
                {bitLabels[bitNum] ? (
                  <button
                    onClick={() => { setEditingLabel(bitNum); setLabelDraft(bitLabels[bitNum] || ''); }}
                    className="text-[8px] text-primary mt-0.5 max-w-8 truncate hover:underline"
                    title={bitLabels[bitNum]}
                  >
                    {bitLabels[bitNum]}
                  </button>
                ) : (
                  <button
                    onClick={() => { setEditingLabel(bitNum); setLabelDraft(''); }}
                    className="text-[8px] text-muted-foreground/40 mt-0.5 hover:text-muted-foreground"
                  >
                    +
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {editingLabel !== null && (
        <div className="flex items-center gap-2">
          <Label className="text-xs shrink-0">Label bit {editingLabel}:</Label>
          <Input
            value={labelDraft}
            onChange={e => setLabelDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLabelSave(editingLabel)}
            placeholder="e.g. Run Enable"
            className="h-7 text-xs max-w-48"
            autoFocus
          />
          <Button size="sm" className="h-7 text-xs" onClick={() => handleLabelSave(editingLabel)}>Set</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingLabel(null)}>Cancel</Button>
        </div>
      )}

      {/* Mask operations */}
      <div className="grid gap-3 sm:grid-cols-2">
        <SectionCard title="Bit Mask" icon={Grid3X3}>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">Mask Value</Label>
              <Input value={maskInput} onChange={e => setMaskInput(e.target.value)} placeholder="0xFF00" className="h-8 font-mono text-xs" />
            </div>
            <Select value={maskOp} onValueChange={v => v && setMaskOp(v as typeof maskOp)}>
              <SelectTrigger className="h-8 text-xs w-20"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="AND">AND</SelectItem>
                <SelectItem value="OR">OR</SelectItem>
                <SelectItem value="XOR">XOR</SelectItem>
                <SelectItem value="NOT">NOT</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8 text-xs" onClick={handleApplyMask}>Apply</Button>
          </div>
        </SectionCard>

        <SectionCard title="Bit Shift" icon={ArrowLeftRight}>
          <div className="flex items-end gap-2">
            <Select value={shiftDir} onValueChange={v => v && setShiftDir(v as typeof shiftDir)}>
              <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Shift Left</SelectItem>
                <SelectItem value="right">Shift Right</SelectItem>
              </SelectContent>
            </Select>
            <div className="w-16 space-y-1.5">
              <Label className="text-xs">Amount</Label>
              <Input
                type="number" min={1} max={width} value={shiftAmt}
                onChange={e => setShiftAmt(parseInt(e.target.value) || 1)}
                className="h-8 text-xs"
              />
            </div>
            <Button size="sm" className="h-8 text-xs" onClick={handleShift}>Shift</Button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
