'use client';

import { useState, useMemo } from 'react';
import { Calculator, Database, HelpCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { SectionCard, ResultRow } from './shared';
import {
  parseNumberInput, toHex,
  toSigned16, toUnsigned16, toSigned32, toUnsigned32,
  wordsToFloat32,
  modbusAddressInfo, MODBUS_REFERENCE,
} from '@/lib/register-utils';

export function ModbusBuilder() {
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
