'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PSYCH_REFERENCE, COMMON_CONDITIONS_TABLE } from '@/lib/psychrometric-engine';
import { SectionCard } from './shared';

function ReferenceAccordion({ title, content }: { title: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 p-3 text-sm font-medium text-left hover:bg-muted/50 transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        {title}
      </button>
      {open && (
        <div className="px-3 pb-3 text-sm text-muted-foreground leading-relaxed">
          {content}
        </div>
      )}
    </div>
  );
}

export function ReferencePanel() {
  return (
    <div className="space-y-5">
      <SectionCard title="Psychrometric Reference" icon={BookOpen}>
        <div className="space-y-2">
          {PSYCH_REFERENCE.map((section) => (
            <ReferenceAccordion key={section.title} title={section.title} content={section.content} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Common Conditions" icon={Table2}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-3 font-semibold">Condition</th>
                <th className="py-2 pr-3 font-semibold">Dry Bulb</th>
                <th className="py-2 pr-3 font-semibold">RH</th>
                <th className="py-2 pr-3 font-semibold">W</th>
                <th className="py-2 pr-3 font-semibold">Enthalpy</th>
                <th className="py-2 font-semibold">Dew Point</th>
              </tr>
            </thead>
            <tbody>
              {COMMON_CONDITIONS_TABLE.map((row) => (
                <tr key={row.condition} className="border-b border-border/50">
                  <td className="py-2 pr-3 font-medium">{row.condition}</td>
                  <td className="py-2 pr-3 font-mono">{row.dryBulb}</td>
                  <td className="py-2 pr-3 font-mono">{row.rh}</td>
                  <td className="py-2 pr-3 font-mono">{row.humidityRatio}</td>
                  <td className="py-2 pr-3 font-mono">{row.enthalpy}</td>
                  <td className="py-2 font-mono">{row.dewPoint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
