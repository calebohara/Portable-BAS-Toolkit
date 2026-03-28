'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Thermometer, Droplets, Wind, Gauge, Zap, CloudRain, Mountain, Sparkles,
  AlertTriangle, Info,
} from 'lucide-react';
import type { PsychInputMode, PsychUnitSystem, PsychState, PsychComfortResult } from '@/types';
import { PSYCH_INPUT_MODE_LABELS } from '@/types';
import { formatProperty, CONDITION_PRESETS, ALTITUDE_PRESETS } from '@/lib/psychrometric-engine';
import { SectionCard, PropertyCard, ComfortBadge } from './shared';

// Short labels for Select trigger display
const INPUT_MODE_SHORT_LABELS: Record<PsychInputMode, string> = {
  'db-wb': 'DB + Wet Bulb',
  'db-rh': 'DB + Rel. Humidity',
  'db-dp': 'DB + Dew Point',
  'db-w': 'DB + Humidity Ratio',
  'db-h': 'DB + Enthalpy',
};

function getInput2Meta(mode: PsychInputMode, units: PsychUnitSystem) {
  switch (mode) {
    case 'db-wb': return { label: 'Wet Bulb', unit: units === 'ip' ? '°F' : '°C' };
    case 'db-rh': return { label: 'Relative Humidity', unit: '%' };
    case 'db-dp': return { label: 'Dew Point', unit: units === 'ip' ? '°F' : '°C' };
    case 'db-w': return { label: 'Humidity Ratio', unit: units === 'ip' ? 'gr/lb' : 'g/kg' };
    case 'db-h': return { label: 'Enthalpy', unit: units === 'ip' ? 'BTU/lb' : 'kJ/kg' };
  }
}

interface CalculatorPanelProps {
  unitSystem: PsychUnitSystem;
  altitude: number;
  setAltitude: (v: number) => void;
  inputMode: PsychInputMode;
  setInputMode: (m: PsychInputMode) => void;
  input1: string;
  setInput1: (v: string) => void;
  input2: string;
  setInput2: (v: string) => void;
  displayState: PsychState | null;
  comfortResult: PsychComfortResult | null;
  errors: string[];
  warnings: string[];
}

export function CalculatorPanel({
  unitSystem, altitude, setAltitude,
  inputMode, setInputMode,
  input1, setInput1, input2, setInput2,
  displayState, comfortResult,
  errors, warnings,
}: CalculatorPanelProps) {
  const input2Meta = getInput2Meta(inputMode, unitSystem);

  function applyPreset(dryBulb_F: number, rh: number) {
    setInputMode('db-rh');
    if (unitSystem === 'si') {
      setInput1(((dryBulb_F - 32) * 5 / 9).toFixed(1));
    } else {
      setInput1(dryBulb_F.toString());
    }
    setInput2(rh.toString());
  }

  return (
    <div className="space-y-4">
      {/* Input Mode & Altitude — side by side on desktop */}
      <div className="grid gap-4 sm:grid-cols-2">
        <SectionCard title="Input Parameters" icon={Thermometer}>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Calculation Mode</Label>
              <Select value={inputMode} onValueChange={(v) => v && setInputMode(v as PsychInputMode)}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue>{INPUT_MODE_SHORT_LABELS[inputMode]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(PSYCH_INPUT_MODE_LABELS) as [PsychInputMode, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">
                  Dry Bulb ({unitSystem === 'ip' ? '°F' : '°C'})
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  value={input1}
                  onChange={(e) => setInput1(e.target.value)}
                  className="mt-1 font-mono"
                  placeholder={unitSystem === 'ip' ? '75' : '24'}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  {input2Meta.label} ({input2Meta.unit})
                </Label>
                <Input
                  type="number"
                  step={inputMode === 'db-rh' ? '1' : '0.1'}
                  value={input2}
                  onChange={(e) => setInput2(e.target.value)}
                  className="mt-1 font-mono"
                  placeholder={inputMode === 'db-rh' ? '50' : ''}
                />
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Site Conditions" icon={Mountain}>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">
                Altitude ({unitSystem === 'ip' ? 'ft' : 'm'})
              </Label>
              <Input
                type="number"
                step="100"
                value={altitude}
                onChange={(e) => setAltitude(parseFloat(e.target.value) || 0)}
                className="mt-1 font-mono"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALTITUDE_PRESETS.map((p) => {
                const isActive = unitSystem === 'ip'
                  ? altitude === p.altitude_ft
                  : altitude === Math.round(p.altitude_ft * 0.3048);
                return (
                  <Button
                    key={p.altitude_ft}
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs h-7 px-2.5"
                    onClick={() => setAltitude(unitSystem === 'ip' ? p.altitude_ft : Math.round(p.altitude_ft * 0.3048))}
                  >
                    {p.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Quick Presets */}
      <SectionCard title="Quick Presets" icon={Sparkles}>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {CONDITION_PRESETS.map((p) => (
            <button
              key={p.id}
              className="rounded-lg border border-border bg-background p-2.5 text-left hover:bg-muted/50 transition-colors space-y-0.5"
              onClick={() => applyPreset(p.dryBulb_F, p.rh)}
            >
              <div className="text-xs font-medium leading-tight">{p.label}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">{p.description}</div>
            </button>
          ))}
        </div>
      </SectionCard>

      {/* Validation Messages */}
      {errors.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
          {errors.map((e, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              {e}
            </div>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Results Dashboard */}
      {displayState && (
        <SectionCard title="Results" icon={Thermometer}>
          {comfortResult && (
            <div className="flex items-center justify-end -mt-2">
              <ComfortBadge {...comfortResult} />
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            <PropertyCard label="Dry Bulb" icon={Thermometer}
              {...formatProperty('dryBulb', displayState.dryBulb, unitSystem)} />
            <PropertyCard label="Wet Bulb" icon={Thermometer}
              {...formatProperty('wetBulb', displayState.wetBulb, unitSystem)} />
            <PropertyCard label="Dew Point" icon={CloudRain}
              {...formatProperty('dewPoint', displayState.dewPoint, unitSystem)} />
            <PropertyCard label="Relative Humidity" icon={Droplets}
              {...formatProperty('relativeHumidity', displayState.relativeHumidity, unitSystem)} />
            <PropertyCard label="Humidity Ratio" icon={Droplets}
              value={unitSystem === 'ip' ? (displayState.humidityRatio * 7000).toFixed(1) : displayState.humidityRatio.toFixed(2)}
              unit={unitSystem === 'ip' ? 'gr/lb' : 'g/kg'} />
            <PropertyCard label="Enthalpy" icon={Zap}
              {...formatProperty('enthalpy', displayState.enthalpy, unitSystem)} />
            <PropertyCard label="Specific Volume" icon={Wind}
              {...formatProperty('specificVolume', displayState.specificVolume, unitSystem)} />
            <PropertyCard label="Vapor Pressure" icon={Gauge}
              {...formatProperty('vaporPressure', displayState.vaporPressure, unitSystem)} />
            <PropertyCard label="Sat. Pressure" icon={Gauge}
              {...formatProperty('saturationPressure', displayState.saturationPressure, unitSystem)} />
            <PropertyCard label="Degree of Sat." icon={Droplets}
              {...formatProperty('degreeOfSaturation', displayState.degreeOfSaturation, unitSystem)} />
          </div>
        </SectionCard>
      )}
    </div>
  );
}
