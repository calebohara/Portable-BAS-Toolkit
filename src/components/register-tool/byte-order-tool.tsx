'use client';

import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CopyBtn } from './shared';
import {
  parseNumberInput,
  generateAllByteOrders,
  isReasonableFloat,
  type ByteOrderResult,
} from '@/lib/register-utils';

export function ByteOrderTool() {
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
