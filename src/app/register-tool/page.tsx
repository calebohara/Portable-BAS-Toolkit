'use client';

import { useState, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import {
  Calculator, Binary, Layers, ArrowLeftRight, Cpu, Grid3X3,
  TrendingUp, Database, Clock, Save, Trash2, Copy, RotateCcw,
  HelpCircle, AlertTriangle, Info,
} from 'lucide-react';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn, copyToClipboard } from '@/lib/utils';
import { toast } from 'sonner';
import { useProjects } from '@/hooks/use-projects';
import { useRegisterCalculations } from '@/hooks/use-register-calculations';
import type { RegisterToolModule, SavedCalcCategory } from '@/types';
import { SAVED_CALC_CATEGORY_LABELS } from '@/types';
import {
  parseNumberInput,
  toHex, toBinary, toOctal,
  toSigned16, toUnsigned16, toSigned32, toUnsigned32,
  getValueRangeWarnings,
  interpretRegister, interpretRegisterPair,
  generateAllByteOrders,
  wordsToFloat32, float32ToWords, floatToIEEE754Breakdown, isReasonableFloat,
  getBits, toggleBit, applyMask, shiftLeft, shiftRight,
  scaleLinear, inverseScaleLinear, SCALING_PRESETS,
  modbusAddressInfo, MODBUS_REFERENCE,
  type ByteOrderResult,
} from '@/lib/register-utils';

// ─── Shared helpers ───────────────────────────────────────────
function CopyBtn({ value, label }: { value: string; label?: string }) {
  return (
    <button
      onClick={() => { copyToClipboard(value).then(() => toast.success(`Copied ${label || 'value'}`)).catch(() => toast.error('Clipboard access denied')); }}
      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      title={`Copy ${label || 'value'}`}
    >
      <Copy className="h-3 w-3" />
    </button>
  );
}

function MonoValue({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('font-mono text-sm select-all', className)}>{children}</span>;
}

function SectionCard({ title, icon: Icon, children, className }: {
  title: string; icon: React.ElementType; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4 space-y-4', className)}>
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" /> {title}
      </h3>
      {children}
    </div>
  );
}

function ResultRow({ label, value, copyLabel }: { label: string; value: string; copyLabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="flex items-center gap-1">
        <MonoValue>{value}</MonoValue>
        <CopyBtn value={value} label={copyLabel || label} />
      </div>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-field-warning/10 border border-field-warning/20 px-3 py-2 text-xs text-field-warning">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODULE 1 — QUICK VALUE CONVERTER
// ═══════════════════════════════════════════════════════════════
function QuickConverter() {
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

// ═══════════════════════════════════════════════════════════════
// MODULE 2 — REGISTER INTERPRETER
// ═══════════════════════════════════════════════════════════════
function RegisterInterpreter() {
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

// ═══════════════════════════════════════════════════════════════
// MODULE 3 — WORD / BYTE ORDER TOOL
// ═══════════════════════════════════════════════════════════════
function ByteOrderTool() {
  const [reg1Str, setReg1Str] = useState('');
  const [reg2Str, setReg2Str] = useState('');

  const reg1 = useMemo(() => parseNumberInput(reg1Str.trim() || '0'), [reg1Str]);
  const reg2 = useMemo(() => parseNumberInput(reg2Str.trim() || '0'), [reg2Str]);

  const results = useMemo<ByteOrderResult[]>(() => {
    if (!reg1.valid || !reg2.valid) return [];
    return generateAllByteOrders(reg1.value, reg2.value);
  }, [reg1, reg2]);

  const hasInput = reg1Str.trim() !== '' || reg2Str.trim() !== '';

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Enter two 16-bit registers and see how different byte/word orderings change the 32-bit interpretation.
        Use this when field values look wrong — one of these is the correct ordering.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Register 1 (e.g. 40001)</Label>
          <Input value={reg1Str} onChange={e => setReg1Str(e.target.value)} placeholder="0x1234" className="h-9 font-mono text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Register 2 (e.g. 40002)</Label>
          <Input value={reg2Str} onChange={e => setReg2Str(e.target.value)} placeholder="0x5678" className="h-9 font-mono text-sm" />
        </div>
      </div>

      {hasInput && results.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-3 font-semibold text-muted-foreground">Order</th>
                <th className="text-left py-2 pr-3 font-semibold text-muted-foreground">Hex</th>
                <th className="text-right py-2 pr-3 font-semibold text-muted-foreground">UInt32</th>
                <th className="text-right py-2 pr-3 font-semibold text-muted-foreground">Int32</th>
                <th className="text-right py-2 font-semibold text-muted-foreground">Float32</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 pr-3 font-medium">{r.order}</td>
                  <td className="py-2 pr-3 font-mono">{r.hex} <CopyBtn value={r.hex} /></td>
                  <td className="py-2 pr-3 font-mono text-right">{r.uint32.toLocaleString()}</td>
                  <td className="py-2 pr-3 font-mono text-right">{r.int32.toLocaleString()}</td>
                  <td className="py-2 font-mono text-right">
                    {isReasonableFloat(r.float32) ? r.float32.toPrecision(7) : <span className="text-muted-foreground">{String(r.float32)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODULE 4 — FLOAT / INTEGER DECODER
// ═══════════════════════════════════════════════════════════════
function FloatDecoder() {
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

// ═══════════════════════════════════════════════════════════════
// MODULE 5 — BIT MASK / BITFIELD TOOL
// ═══════════════════════════════════════════════════════════════
function BitmaskTool() {
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

// ═══════════════════════════════════════════════════════════════
// MODULE 6 — SCALING CALCULATOR
// ═══════════════════════════════════════════════════════════════
function ScalingCalculator() {
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

// ═══════════════════════════════════════════════════════════════
// MODULE 7 — MODBUS REGISTER BUILDER
// ═══════════════════════════════════════════════════════════════
function ModbusBuilder() {
  const [addressStr, setAddressStr] = useState('');
  const [notation, setNotation] = useState<'0-based' | '1-based' | 'modicon'>('modicon');
  const [rawValue1, setRawValue1] = useState('');
  const [rawValue2, setRawValue2] = useState('');
  const [decodeType, setDecodeType] = useState<'uint16' | 'int16' | 'uint32' | 'int32' | 'float32'>('uint16');

  const addressInfo = useMemo(() => {
    const addr = parseInt(addressStr);
    if (isNaN(addr) || addr < 0) return null;
    return modbusAddressInfo(addr, notation);
  }, [addressStr, notation]);

  const decodedValue = useMemo(() => {
    const r1 = parseNumberInput(rawValue1.trim() || '0');
    if (!r1.valid) return null;
    if (decodeType === 'uint16') return { value: toUnsigned16(r1.value) };
    if (decodeType === 'int16') return { value: toSigned16(r1.value) };
    const r2 = parseNumberInput(rawValue2.trim() || '0');
    if (!r2.valid) return null;
    if (decodeType === 'float32') return { value: wordsToFloat32(r1.value, r2.value) };
    // uint32 / int32
    const combined = ((r1.value & 0xFFFF) << 16) | (r2.value & 0xFFFF);
    if (decodeType === 'int32') return { value: toSigned32(combined) };
    return { value: toUnsigned32(combined) };
  }, [rawValue1, rawValue2, decodeType]);

  const needs2Regs = decodeType === 'uint32' || decodeType === 'int32' || decodeType === 'float32';

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Register Address</Label>
          <Input value={addressStr} onChange={e => setAddressStr(e.target.value)} placeholder="40001" className="h-9 font-mono text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Address Notation</Label>
          <Select value={notation} onValueChange={v => v && setNotation(v as typeof notation)}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="modicon">Modicon (40001)</SelectItem>
              <SelectItem value="1-based">1-based</SelectItem>
              <SelectItem value="0-based">0-based</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Data Type</Label>
          <Select value={decodeType} onValueChange={v => v && setDecodeType(v as typeof decodeType)}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="uint16">UInt16</SelectItem>
              <SelectItem value="int16">Int16</SelectItem>
              <SelectItem value="uint32">UInt32 (2 regs)</SelectItem>
              <SelectItem value="int32">Int32 (2 regs)</SelectItem>
              <SelectItem value="float32">Float32 (2 regs)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {addressInfo && (
        <SectionCard title="Address Resolution" icon={Database}>
          <ResultRow label="Zero-based offset" value={String(addressInfo.zeroBased)} />
          <ResultRow label="1-based address" value={String(addressInfo.oneBased)} />
          <ResultRow label="Modicon notation" value={addressInfo.modicon} />
          <ResultRow label="Register type" value={addressInfo.registerType} />
          <ResultRow label="Function code" value={addressInfo.functionCode} />
          {addressInfo.notes && (
            <p className="text-[10px] text-muted-foreground mt-2">{addressInfo.notes}</p>
          )}
        </SectionCard>
      )}

      {/* Raw value input + decode */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Raw Value (Register 1)</Label>
          <Input value={rawValue1} onChange={e => setRawValue1(e.target.value)} placeholder="0" className="h-8 font-mono text-xs" />
        </div>
        {needs2Regs && (
          <div className="space-y-1.5">
            <Label className="text-xs">Raw Value (Register 2)</Label>
            <Input value={rawValue2} onChange={e => setRawValue2(e.target.value)} placeholder="0" className="h-8 font-mono text-xs" />
          </div>
        )}
      </div>

      {decodedValue && rawValue1 && (
        <SectionCard title="Decoded Value" icon={Calculator}>
          <ResultRow label={decodeType.toUpperCase()} value={
            decodeType === 'float32'
              ? (typeof decodedValue.value === 'number' ? decodedValue.value.toPrecision(7) : String(decodedValue.value))
              : String(decodedValue.value)
          } />
        </SectionCard>
      )}

      {/* Reference */}
      <SectionCard title="Modbus Address Reference" icon={HelpCircle}>
        <div className="text-xs text-muted-foreground space-y-1 whitespace-pre-line">
          {MODBUS_REFERENCE}
        </div>
      </SectionCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODULE 8 — SAVED CALCULATIONS / HISTORY
// ═══════════════════════════════════════════════════════════════
function CalculationHistory({ onSaveRequest }: { onSaveRequest: () => void }) {
  const { calculations, removeCalculation } = useRegisterCalculations();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {calculations.length} saved calculation{calculations.length !== 1 ? 's' : ''}
        </p>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onSaveRequest}>
          <Save className="h-3 w-3" /> Save Current
        </Button>
      </div>

      {calculations.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No saved calculations yet. Use the Save button in any module to save a result.
        </div>
      )}

      <div className="space-y-2">
        {calculations.map(calc => (
          <div key={calc.id} className="rounded-lg border border-border p-3 space-y-2 hover:bg-muted/20 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-medium">{calc.label}</h4>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-[9px]">{calc.module.replace('-', ' ')}</Badge>
                  <Badge variant="outline" className="text-[9px]">{SAVED_CALC_CATEGORY_LABELS[calc.category]}</Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(calc.updatedAt), 'MMM d, yyyy HH:mm')}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeCalculation(calc.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            {calc.notes && <p className="text-xs text-muted-foreground">{calc.notes}</p>}
            {Object.keys(calc.result).length > 0 && (
              <div className="text-[10px] font-mono text-muted-foreground">
                {Object.entries(calc.result).slice(0, 4).map(([k, v]) => (
                  <span key={k} className="mr-3">{k}: {String(v)}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODULE 9 — SAVE DIALOG
// ═══════════════════════════════════════════════════════════════
function SaveDialog({ open, onOpenChange, activeModule }: {
  open: boolean; onOpenChange: (o: boolean) => void; activeModule: string;
}) {
  const { projects } = useProjects();
  const { addCalculation } = useRegisterCalculations();
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [projectId, setProjectId] = useState('');
  const [category, setCategory] = useState<SavedCalcCategory>('general');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!label.trim()) { toast.error('Label is required'); return; }
    setSaving(true);
    try {
      await addCalculation({
        label: label.trim(),
        module: activeModule as RegisterToolModule,
        category,
        inputs: {},
        result: {},
        notes,
        tags: [],
        projectId: projectId || '',
      });
      toast.success('Calculation saved');
      onOpenChange(false);
      setLabel('');
      setNotes('');
    } catch {
      toast.error('Failed to save');
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Calculation</DialogTitle>
          <DialogDescription>Save this calculation for later reference or attach it to a project.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Label</Label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Yaskawa speed feedback decode" className="h-8 text-xs" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Select value={category} onValueChange={v => v && setCategory(v as SavedCalcCategory)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SAVED_CALC_CATEGORY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Project (optional)</Label>
                <Select value={projectId || '_none'} onValueChange={v => v && setProjectId(v === '_none' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="No project" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">No project</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.projectNumber} — {p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. ABB status word bit 7 = run enable"
                className="w-full rounded-lg border border-border bg-background p-2 text-xs resize-y min-h-[60px] outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════
// MODULE 10 — HELP / REFERENCE
// ═══════════════════════════════════════════════════════════════
function HelpReference() {
  return (
    <div className="space-y-6 max-w-3xl">
      <SectionCard title="Signed vs Unsigned Values" icon={Info}>
        <div className="text-xs text-muted-foreground space-y-2">
          <p><strong>Unsigned 16-bit:</strong> Range 0 to 65,535. All bits represent magnitude.</p>
          <p><strong>Signed 16-bit (two&apos;s complement):</strong> Range -32,768 to 32,767. Bit 15 is the sign bit. A register reading 65535 as unsigned is -1 as signed.</p>
          <p><strong>Unsigned 32-bit:</strong> Range 0 to 4,294,967,295.</p>
          <p><strong>Signed 32-bit:</strong> Range -2,147,483,648 to 2,147,483,647.</p>
          <p className="font-medium text-foreground">Field tip: If a value looks wrong (e.g. temperature reads 65530), try interpreting it as signed — it&apos;s probably -6.</p>
        </div>
      </SectionCard>

      <SectionCard title="Byte Order / Word Order" icon={Layers}>
        <div className="text-xs text-muted-foreground space-y-2">
          <p>A 32-bit value stored across two 16-bit Modbus registers can be arranged in 4 ways:</p>
          <div className="font-mono bg-muted/30 rounded-lg p-3 space-y-1">
            <p><strong>AB CD</strong> — Big-endian (most common in Modbus). High word first, big-endian bytes.</p>
            <p><strong>CD AB</strong> — Word-swapped. Low word first, big-endian bytes.</p>
            <p><strong>BA DC</strong> — Byte-swapped within each word.</p>
            <p><strong>DC BA</strong> — Little-endian. Low word first, little-endian bytes.</p>
          </div>
          <p className="font-medium text-foreground">Field tip: If your float/32-bit value looks like garbage, try all 4 orderings in the Byte Order Tool. One will be correct.</p>
        </div>
      </SectionCard>

      <SectionCard title="IEEE 754 Float Basics" icon={Calculator}>
        <div className="text-xs text-muted-foreground space-y-2">
          <p>A 32-bit float has: 1 sign bit + 8 exponent bits + 23 mantissa bits.</p>
          <p>Common device values: temperature (20.5), pressure (14.7), speed (1750.0) produce &ldquo;reasonable&rdquo; floats. If you decode a float and get 1.2e+38 or NaN, the byte order is wrong or the registers don&apos;t contain a float.</p>
          <p><strong>Common register pairs for float:</strong></p>
          <div className="font-mono bg-muted/30 rounded-lg p-3">
            <p>50.0°F = 0x4248 0x0000 (big-endian)</p>
            <p>72.5°F = 0x4291 0x0000</p>
            <p>100.0 = 0x42C8 0x0000</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Modbus Addressing Pitfalls" icon={Database}>
        <div className="text-xs text-muted-foreground space-y-2">
          <div className="whitespace-pre-line font-mono bg-muted/30 rounded-lg p-3">{MODBUS_REFERENCE}</div>
          <p className="font-medium text-foreground">Field tip: If the first register reads wrong, try subtracting 1 from the address. Many devices and software disagree on 0-based vs 1-based addressing.</p>
        </div>
      </SectionCard>

      <SectionCard title="Scaling Formulas" icon={TrendingUp}>
        <div className="text-xs text-muted-foreground space-y-2">
          <p><strong>Linear scaling:</strong></p>
          <p className="font-mono bg-muted/30 rounded-lg p-2">eng = (raw - rawMin) × (engMax - engMin) / (rawMax - rawMin) + engMin</p>
          <p><strong>Common patterns:</strong></p>
          <ul className="list-disc list-inside space-y-1">
            <li>0–10V → 0–65535 raw → 0–100% engineering</li>
            <li>4–20mA → 0–65535 raw → configured range (e.g. 0–250 PSI)</li>
            <li>Thermistor: raw count → lookup table or polynomial (use linear as approximation over small ranges)</li>
          </ul>
        </div>
      </SectionCard>

      <SectionCard title="Bit Mask Basics" icon={Grid3X3}>
        <div className="text-xs text-muted-foreground space-y-2">
          <p><strong>AND</strong> — Extract specific bits: value AND 0x00FF gets the low byte.</p>
          <p><strong>OR</strong> — Set bits: value OR 0x0004 sets bit 2.</p>
          <p><strong>XOR</strong> — Toggle bits: value XOR 0x0001 flips bit 0.</p>
          <p><strong>NOT</strong> — Invert all bits.</p>
          <p className="font-medium text-foreground">Field tip: VFD status words are almost always bitmapped. Check the manual for which bit means what — bit 0 might be &ldquo;Ready&rdquo;, bit 7 &ldquo;Running&rdquo;, bit 11 &ldquo;Fault&rdquo;, etc.</p>
        </div>
      </SectionCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
const TAB_ITEMS = [
  { value: 'convert', label: 'Converter', icon: Binary },
  { value: 'register', label: 'Register', icon: Cpu },
  { value: 'byte-order', label: 'Byte Order', icon: Layers },
  { value: 'float', label: 'Float', icon: Calculator },
  { value: 'bitmask', label: 'Bitmask', icon: Grid3X3 },
  { value: 'scaling', label: 'Scaling', icon: TrendingUp },
  { value: 'modbus', label: 'Modbus', icon: Database },
  { value: 'history', label: 'Saved', icon: Clock },
  { value: 'help', label: 'Help', icon: HelpCircle },
];

export default function RegisterToolPage() {
  const [activeTab, setActiveTab] = useState('convert');
  const [showSave, setShowSave] = useState(false);

  return (
    <>
      <TopBar title="Protocol Converter / Register Tool" />
      <div className="flex flex-col" style={{ height: 'calc(100vh - 3.5rem)' }}>
        <Tabs value={activeTab} onValueChange={v => v && setActiveTab(v)}>
          <div className="shrink-0 border-b border-border bg-muted/20 px-4">
            <TabsList variant="line" className="overflow-x-auto scrollbar-none">
              {TAB_ITEMS.map(t => (
                <TabsTrigger key={t.value} value={t.value} className="gap-1.5 px-3 py-2 text-xs">
                  <t.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <TabsContent value="convert"><QuickConverter /></TabsContent>
            <TabsContent value="register"><RegisterInterpreter /></TabsContent>
            <TabsContent value="byte-order"><ByteOrderTool /></TabsContent>
            <TabsContent value="float"><FloatDecoder /></TabsContent>
            <TabsContent value="bitmask"><BitmaskTool /></TabsContent>
            <TabsContent value="scaling"><ScalingCalculator /></TabsContent>
            <TabsContent value="modbus"><ModbusBuilder /></TabsContent>
            <TabsContent value="history"><CalculationHistory onSaveRequest={() => setShowSave(true)} /></TabsContent>
            <TabsContent value="help"><HelpReference /></TabsContent>
          </div>
        </Tabs>

        {/* Floating save button (visible on calculation tabs) */}
        {!['history', 'help'].includes(activeTab) && (
          <div className="shrink-0 flex items-center justify-between px-4 py-2 border-t border-border bg-muted/30">
            <span className="text-[10px] text-muted-foreground">
              {TAB_ITEMS.find(t => t.value === activeTab)?.label} Module
            </span>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowSave(true)}>
              <Save className="h-3 w-3" /> Save Calculation
            </Button>
          </div>
        )}
      </div>

      <SaveDialog open={showSave} onOpenChange={setShowSave} activeModule={activeTab} />
    </>
  );
}
