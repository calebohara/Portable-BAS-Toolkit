'use client';

import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Wind, ArrowRight, Zap, Thermometer, Droplets, ArrowDownToLine,
} from 'lucide-react';
import type { PsychUnitSystem, PsychState } from '@/types';
import {
  computeAllProperties, calculateMixedAir, calculateCoilLoad,
  ipToSi, celsiusToFahrenheit, metersToFeet, formatProperty,
  OA_FRACTION_PRESETS,
} from '@/lib/psychrometric-engine';
import { SectionCard, PropertyCard } from './shared';

interface AhuProcessesPanelProps {
  unitSystem: PsychUnitSystem;
  altitude: number;
  calculatorResults: PsychState | null;
}

export function AhuProcessesPanel({ unitSystem, altitude, calculatorResults }: AhuProcessesPanelProps) {
  const [oaDb, setOaDb] = useState('');
  const [oaRh, setOaRh] = useState('');
  const [raDb, setRaDb] = useState('');
  const [raRh, setRaRh] = useState('');
  const [oaFraction, setOaFraction] = useState(0.2);

  const [airflow, setAirflow] = useState('');
  const [enterDb, setEnterDb] = useState('');
  const [enterRh, setEnterRh] = useState('');
  const [leaveDb, setLeaveDb] = useState('');
  const [leaveRh, setLeaveRh] = useState('');

  const alt_ft = unitSystem === 'si' ? metersToFeet(altitude) : altitude;

  function parseState(dbStr: string, rhStr: string): PsychState | null {
    const db = parseFloat(dbStr);
    const rh = parseFloat(rhStr);
    if (isNaN(db) || isNaN(rh)) return null;
    const db_F = unitSystem === 'si' ? celsiusToFahrenheit(db) : db;
    return computeAllProperties('db-rh', db_F, rh, alt_ft);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const oaState = useMemo(() => parseState(oaDb, oaRh), [oaDb, oaRh, unitSystem, altitude]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const raState = useMemo(() => parseState(raDb, raRh), [raDb, raRh, unitSystem, altitude]);

  const mixedResult = useMemo(() => {
    if (!oaState || !raState) return null;
    return calculateMixedAir({
      oaDryBulb: oaState.dryBulb,
      oaHumidityRatio: oaState.humidityRatio,
      oaEnthalpy: oaState.enthalpy,
      raDryBulb: raState.dryBulb,
      raHumidityRatio: raState.humidityRatio,
      raEnthalpy: raState.enthalpy,
      oaFraction,
    }, alt_ft);
  }, [oaState, raState, oaFraction, alt_ft]);

  const mixedDisplay = mixedResult
    ? (unitSystem === 'si' ? ipToSi(mixedResult.mixedState) : mixedResult.mixedState)
    : null;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const enterState = useMemo(() => parseState(enterDb, enterRh), [enterDb, enterRh, unitSystem, altitude]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const leaveState = useMemo(() => parseState(leaveDb, leaveRh), [leaveDb, leaveRh, unitSystem, altitude]);

  const coilResult = useMemo(() => {
    if (!enterState || !leaveState) return null;
    const cfmVal = parseFloat(airflow);
    if (isNaN(cfmVal) || cfmVal <= 0) return null;
    const cfm = unitSystem === 'si' ? cfmVal * 2.11888 : cfmVal;
    return calculateCoilLoad({ airflowCfm: cfm, enteringState: enterState, leavingState: leaveState });
  }, [enterState, leaveState, airflow, unitSystem]);

  function useCalcAs(setter: 'oa' | 'ra' | 'enter') {
    if (!calculatorResults) return;
    const s = unitSystem === 'si' ? ipToSi(calculatorResults) : calculatorResults;
    const db = s.dryBulb.toFixed(1);
    const rh = s.relativeHumidity.toFixed(1);
    if (setter === 'oa') { setOaDb(db); setOaRh(rh); }
    else if (setter === 'ra') { setRaDb(db); setRaRh(rh); }
    else { setEnterDb(db); setEnterRh(rh); }
  }

  function useMixedAsEntering() {
    if (!mixedDisplay) return;
    setEnterDb(mixedDisplay.dryBulb.toFixed(1));
    setEnterRh(mixedDisplay.relativeHumidity.toFixed(1));
  }

  const tempUnit = unitSystem === 'ip' ? '°F' : '°C';

  return (
    <div className="space-y-4">
      {/* Mixed Air Calculator */}
      <SectionCard title="Mixed Air Calculator" icon={Wind}>
        <div className="grid gap-4 sm:grid-cols-3">
          {/* OA */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Outdoor Air (OA)</Label>
              {calculatorResults && (
                <Button variant="ghost" size="sm" className="text-[10px] h-5 px-1.5 text-primary" onClick={() => useCalcAs('oa')}>
                  Use calc
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">DB {tempUnit}</Label>
                <Input type="number" step="0.1" value={oaDb} onChange={(e) => setOaDb(e.target.value)}
                  className="font-mono h-8 text-sm" placeholder={unitSystem === 'ip' ? '95' : '35'} />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">RH %</Label>
                <Input type="number" step="1" value={oaRh} onChange={(e) => setOaRh(e.target.value)}
                  className="font-mono h-8 text-sm" placeholder="40" />
              </div>
            </div>
          </div>

          {/* RA */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Return Air (RA)</Label>
              {calculatorResults && (
                <Button variant="ghost" size="sm" className="text-[10px] h-5 px-1.5 text-primary" onClick={() => useCalcAs('ra')}>
                  Use calc
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">DB {tempUnit}</Label>
                <Input type="number" step="0.1" value={raDb} onChange={(e) => setRaDb(e.target.value)}
                  className="font-mono h-8 text-sm" placeholder={unitSystem === 'ip' ? '75' : '24'} />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">RH %</Label>
                <Input type="number" step="1" value={raRh} onChange={(e) => setRaRh(e.target.value)}
                  className="font-mono h-8 text-sm" placeholder="50" />
              </div>
            </div>
          </div>

          {/* OA Fraction */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">OA Fraction</Label>
            <Input
              type="number" step="0.05" min="0" max="1"
              value={oaFraction}
              onChange={(e) => setOaFraction(Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)))}
              className="font-mono h-8 text-sm"
            />
            <div className="flex flex-wrap gap-1">
              {OA_FRACTION_PRESETS.map((p) => (
                <Button
                  key={p.fraction}
                  variant={oaFraction === p.fraction ? 'default' : 'outline'}
                  size="sm"
                  className="text-[10px] h-6 px-2"
                  onClick={() => setOaFraction(p.fraction)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Mixed Air Results */}
        {mixedDisplay && (
          <div className="mt-3 pt-3 border-t border-border space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <ArrowRight className="h-3 w-3" />
              Mixed Air Results
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <PropertyCard label="Dry Bulb" icon={Thermometer} {...formatProperty('dryBulb', mixedDisplay.dryBulb, unitSystem)} />
              <PropertyCard label="Wet Bulb" icon={Thermometer} {...formatProperty('wetBulb', mixedDisplay.wetBulb, unitSystem)} />
              <PropertyCard label="Humidity Ratio" icon={Droplets}
                value={unitSystem === 'ip' ? (mixedDisplay.humidityRatio * 7000).toFixed(1) : mixedDisplay.humidityRatio.toFixed(2)}
                unit={unitSystem === 'ip' ? 'gr/lb' : 'g/kg'} />
              <PropertyCard label="Enthalpy" icon={Zap} {...formatProperty('enthalpy', mixedDisplay.enthalpy, unitSystem)} />
              <PropertyCard label="RH" icon={Droplets} {...formatProperty('relativeHumidity', mixedDisplay.relativeHumidity, unitSystem)} />
              <PropertyCard label="Dew Point" icon={Thermometer} {...formatProperty('dewPoint', mixedDisplay.dewPoint, unitSystem)} />
            </div>
          </div>
        )}
      </SectionCard>

      {/* Coil Load Calculator */}
      <SectionCard title="Coil Load Calculator" icon={Zap}>
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Entering */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Entering Air</Label>
              <div className="flex gap-1">
                {mixedDisplay && (
                  <Button variant="ghost" size="sm" className="text-[10px] h-5 px-1.5 text-primary" onClick={useMixedAsEntering}>
                    Use mixed
                  </Button>
                )}
                {calculatorResults && (
                  <Button variant="ghost" size="sm" className="text-[10px] h-5 px-1.5 text-primary" onClick={() => useCalcAs('enter')}>
                    Use calc
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">DB {tempUnit}</Label>
                <Input type="number" step="0.1" value={enterDb} onChange={(e) => setEnterDb(e.target.value)}
                  className="font-mono h-8 text-sm" placeholder={unitSystem === 'ip' ? '80' : '27'} />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">RH %</Label>
                <Input type="number" step="1" value={enterRh} onChange={(e) => setEnterRh(e.target.value)}
                  className="font-mono h-8 text-sm" placeholder="55" />
              </div>
            </div>
          </div>

          {/* Leaving */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Leaving Air</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">DB {tempUnit}</Label>
                <Input type="number" step="0.1" value={leaveDb} onChange={(e) => setLeaveDb(e.target.value)}
                  className="font-mono h-8 text-sm" placeholder={unitSystem === 'ip' ? '55' : '13'} />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">RH %</Label>
                <Input type="number" step="1" value={leaveRh} onChange={(e) => setLeaveRh(e.target.value)}
                  className="font-mono h-8 text-sm" placeholder="90" />
              </div>
            </div>
          </div>

          {/* Airflow */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Airflow ({unitSystem === 'ip' ? 'CFM' : 'L/s'})</Label>
            <Input
              type="number" step="100"
              value={airflow} onChange={(e) => setAirflow(e.target.value)}
              className="font-mono h-8 text-sm"
              placeholder={unitSystem === 'ip' ? '10000' : '4720'}
            />
          </div>
        </div>

        {/* Coil Load Results */}
        {coilResult && (
          <div className="mt-3 pt-3 border-t border-border space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <div className="flex items-center gap-2">
                <ArrowDownToLine className="h-3 w-3" />
                Coil Load Results
              </div>
              <span className="text-[10px] font-normal">
                {coilResult.totalLoad > 0 ? 'Heating mode' : 'Cooling mode'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <PropertyCard label="Sensible Load" icon={Thermometer}
                value={unitSystem === 'ip' ? Math.abs(coilResult.sensibleLoad).toFixed(0) : Math.abs(coilResult.sensibleLoad * 0.000293071).toFixed(1)}
                unit={unitSystem === 'ip' ? 'BTU/hr' : 'kW'} />
              <PropertyCard label="Latent Load" icon={Droplets}
                value={unitSystem === 'ip' ? Math.abs(coilResult.latentLoad).toFixed(0) : Math.abs(coilResult.latentLoad * 0.000293071).toFixed(1)}
                unit={unitSystem === 'ip' ? 'BTU/hr' : 'kW'} />
              <PropertyCard label="Total Load" icon={Zap}
                value={unitSystem === 'ip' ? Math.abs(coilResult.totalLoad).toFixed(0) : Math.abs(coilResult.totalLoad * 0.000293071).toFixed(1)}
                unit={unitSystem === 'ip' ? 'BTU/hr' : 'kW'} />
              <PropertyCard label="SHR" icon={Zap}
                value={coilResult.sensibleHeatRatio.toFixed(2)} unit="" />
            </div>
            {unitSystem === 'ip' && (
              <p className="text-[10px] text-muted-foreground">
                Total: {(Math.abs(coilResult.totalLoad) / 12000).toFixed(1)} tons
              </p>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
