'use client';

import { Calculator, Database, Grid3X3, Info, Layers, TrendingUp } from 'lucide-react';
import { SectionCard } from './shared';
import { MODBUS_REFERENCE } from '@/lib/register-utils';

export function HelpReference() {
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
