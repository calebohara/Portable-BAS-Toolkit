'use client';

import { useState, useCallback, useMemo } from 'react';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Calculator, Wind, Clock, BookOpen,
} from 'lucide-react';
import type { PsychInputMode, PsychUnitSystem, PsychState, PsychComfortResult, PsychSession } from '@/types';
import { useProjects } from '@/hooks/use-projects';
import { CalculatorPanel } from '@/components/psychrometric/calculator-panel';
import { AhuProcessesPanel } from '@/components/psychrometric/ahu-processes-panel';
import { SessionsPanel } from '@/components/psychrometric/sessions-panel';
import { ReferencePanel } from '@/components/psychrometric/reference-panel';
import {
  computeAllProperties, validateInputs, checkComfortZone,
  ipToSi, celsiusToFahrenheit, metersToFeet,
} from '@/lib/psychrometric-engine';

export default function PsychrometricPage() {
  // Unit system & altitude
  const [unitSystem, setUnitSystem] = useState<PsychUnitSystem>('ip');
  const [altitude, setAltitude] = useState(0);

  // Calculator state
  const [inputMode, setInputMode] = useState<PsychInputMode>('db-rh');
  const [input1, setInput1] = useState('75');
  const [input2, setInput2] = useState('50');

  // Session state
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [activeTab, setActiveTab] = useState('calculator');

  const { projects } = useProjects();

  // Compute results at page level — no setState-during-render issue
  const computed = useMemo(() => {
    const v1 = parseFloat(input1);
    const v2 = parseFloat(input2);
    if (isNaN(v1) || isNaN(v2)) return null;

    let db_F = v1;
    let val2_ip = v2;
    let alt_ft = altitude;

    if (unitSystem === 'si') {
      db_F = celsiusToFahrenheit(v1);
      alt_ft = metersToFeet(altitude);
      switch (inputMode) {
        case 'db-wb':
        case 'db-dp':
          val2_ip = celsiusToFahrenheit(v2);
          break;
        case 'db-w':
          val2_ip = v2 / 1000;
          break;
        case 'db-h':
          val2_ip = v2 / 2.326;
          break;
      }
    } else if (inputMode === 'db-w') {
      val2_ip = v2 / 7000;
    }

    const validation = validateInputs(inputMode, db_F, val2_ip, alt_ft);
    if (!validation.valid) return { errors: validation.errors, warnings: validation.warnings, state: null, displayState: null, comfort: null };

    const state = computeAllProperties(inputMode, db_F, val2_ip, alt_ft);
    const comfort = checkComfortZone(state);
    const displayState = unitSystem === 'si' ? ipToSi(state) : state;

    return { state, displayState, comfort, errors: [] as string[], warnings: validation.warnings };
  }, [input1, input2, inputMode, unitSystem, altitude]);

  const results: PsychState | null = computed?.state ?? null;
  const displayState: PsychState | null = computed?.displayState ?? null;
  const comfortResult: PsychComfortResult | null = computed?.comfort ?? null;
  const errors = computed?.errors ?? [];
  const warnings = computed?.warnings ?? [];

  const toggleUnits = useCallback(() => {
    setUnitSystem((prev) => {
      const next = prev === 'ip' ? 'si' : 'ip';
      const v1 = parseFloat(input1);
      const v2 = parseFloat(input2);
      const alt = altitude;

      if (!isNaN(v1)) {
        if (next === 'si') {
          setInput1(((v1 - 32) * 5 / 9).toFixed(1));
          setAltitude(Math.round(alt * 0.3048));
        } else {
          setInput1((v1 * 9 / 5 + 32).toFixed(1));
          setAltitude(Math.round(alt / 0.3048));
        }
      }

      if (!isNaN(v2)) {
        switch (inputMode) {
          case 'db-wb':
          case 'db-dp':
            if (next === 'si') setInput2(((v2 - 32) * 5 / 9).toFixed(1));
            else setInput2((v2 * 9 / 5 + 32).toFixed(1));
            break;
          case 'db-w':
            if (next === 'si') setInput2((v2 / 7000 * 1000).toFixed(2));
            else setInput2((v2 / 1000 * 7000).toFixed(1));
            break;
          case 'db-h':
            if (next === 'si') setInput2((v2 * 2.326).toFixed(2));
            else setInput2((v2 / 2.326).toFixed(2));
            break;
        }
      }

      return next;
    });
  }, [input1, input2, altitude, inputMode]);

  const handleLoadSession = useCallback((session: PsychSession) => {
    setUnitSystem(session.unitSystem);
    setAltitude(session.altitude);
    setInputMode(session.inputMode);

    const display = session.unitSystem === 'si' ? ipToSi(session.results) : session.results;

    switch (session.inputMode) {
      case 'db-rh':
        setInput1(display.dryBulb.toFixed(1));
        setInput2(display.relativeHumidity.toFixed(1));
        break;
      case 'db-wb':
        setInput1(display.dryBulb.toFixed(1));
        setInput2(display.wetBulb.toFixed(1));
        break;
      case 'db-dp':
        setInput1(display.dryBulb.toFixed(1));
        setInput2(display.dewPoint.toFixed(1));
        break;
      case 'db-w':
        setInput1(display.dryBulb.toFixed(1));
        if (session.unitSystem === 'ip') {
          setInput2((display.humidityRatio * 7000).toFixed(1));
        } else {
          setInput2(display.humidityRatio.toFixed(2));
        }
        break;
      case 'db-h':
        setInput1(display.dryBulb.toFixed(1));
        setInput2(display.enthalpy.toFixed(2));
        break;
    }

    setActiveTab('calculator');
  }, []);

  const inputValues: Record<string, number> = {
    input1: parseFloat(input1) || 0,
    input2: parseFloat(input2) || 0,
  };

  return (
    <>
      <TopBar title="Psychrometric Calculator">
        <Button
          variant="outline"
          size="sm"
          onClick={toggleUnits}
          className="font-mono text-xs"
        >
          {unitSystem === 'ip' ? 'IP (°F)' : 'SI (°C)'}
        </Button>
      </TopBar>

      <div className="flex flex-col" style={{ height: 'calc(100vh - 3.5rem)' }}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0 gap-0">
          <div className="shrink-0 border-b border-border bg-muted/20 px-4">
            <TabsList variant="line" className="overflow-x-auto scrollbar-none">
              <TabsTrigger value="calculator" className="gap-1.5 px-3 py-2 text-xs">
                <Calculator className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Calc</span>
              </TabsTrigger>
              <TabsTrigger value="ahu" className="gap-1.5 px-3 py-2 text-xs">
                <Wind className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">AHU</span>
              </TabsTrigger>
              <TabsTrigger value="sessions" className="gap-1.5 px-3 py-2 text-xs">
                <Clock className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sessions</span>
              </TabsTrigger>
              <TabsTrigger value="reference" className="gap-1.5 px-3 py-2 text-xs">
                <BookOpen className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Reference</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="max-w-5xl mx-auto">
              <TabsContent value="calculator">
                <CalculatorPanel
                  unitSystem={unitSystem}
                  altitude={altitude}
                  setAltitude={setAltitude}
                  inputMode={inputMode}
                  setInputMode={setInputMode}
                  input1={input1}
                  setInput1={setInput1}
                  input2={input2}
                  setInput2={setInput2}
                  displayState={displayState}
                  comfortResult={comfortResult}
                  errors={errors}
                  warnings={warnings}
                />
              </TabsContent>

              <TabsContent value="ahu">
                <AhuProcessesPanel
                  unitSystem={unitSystem}
                  altitude={altitude}
                  calculatorResults={results}
                />
              </TabsContent>

              <TabsContent value="sessions">
                <SessionsPanel
                  unitSystem={unitSystem}
                  altitude={altitude}
                  inputMode={inputMode}
                  inputValues={inputValues}
                  results={results}
                  comfortResult={comfortResult}
                  projects={projects}
                  selectedProjectId={selectedProjectId}
                  setSelectedProjectId={setSelectedProjectId}
                  onLoadSession={handleLoadSession}
                />
              </TabsContent>

              <TabsContent value="reference">
                <ReferencePanel />
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>
    </>
  );
}
