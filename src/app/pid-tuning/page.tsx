'use client';

import { useState, useCallback, useMemo } from 'react';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Gauge, Save, Trash2, FileDown, Copy, Printer, FileJson, ChevronDown,
  AlertTriangle, CheckCircle2, Info, ArrowRight, RotateCcw, Plus, FolderOpen,
  Wrench, BookOpen, Activity, Settings2, MessageSquare, Lightbulb, TrendingUp,
  ArrowUpDown, HelpCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useProjects } from '@/hooks/use-projects';
import { usePidTuningSessions } from '@/hooks/use-pid-tuning';
import { format } from 'date-fns';
import type {
  PidLoopType, PidOutputType, PidControlMode, PidAction, PidGainMode,
  PidTuningValues, PidResponseData, PidTuningSession,
} from '@/types';
import {
  PID_LOOP_TYPE_LABELS, PID_OUTPUT_TYPE_LABELS, PID_CONTROL_MODE_LABELS,
} from '@/types';
import {
  LOOP_TYPE_DEFAULTS, PID_SYMPTOMS, BAS_PID_REFERENCE, TYPICAL_RANGES,
  diagnoseSymptoms, generateRecommendation,
  gainToProportionalBand, proportionalBandToGain,
} from '@/lib/pid-tuning-engine';

// ─── Default values ──────────────────────────────────────────
const defaultTuningValues = (): PidTuningValues => ({
  gainMode: 'gain',
  gain: null,
  proportionalBand: null,
  integralTime: null,
  derivativeTime: null,
  sampleInterval: null,
  outputMin: 0,
  outputMax: 100,
  deadband: null,
});

const defaultResponseData = (): PidResponseData => ({
  setpoint: null,
  startingPv: null,
  finalPv: null,
  overshootPercent: null,
  responseTimeSeconds: null,
  settleTimeSeconds: null,
  oscillationCount: null,
  saturated: false,
  deadTimeSeconds: null,
});

// ─── Helper components ──────────────────────────────────────
function SectionCard({ title, icon: Icon, children, className }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-5 space-y-4', className)}>
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function FieldGroup({ label, hint, children }: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <Label className="text-xs">{label}</Label>
        {hint && (
          <Tooltip>
            <TooltipTrigger>
              <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
          </Tooltip>
        )}
      </div>
      {children}
    </div>
  );
}

function CompareRow({ label, before, after, unit }: {
  label: string;
  before: string | number | null;
  after: string | number | null;
  unit?: string;
}) {
  const bVal = before ?? '—';
  const aVal = after ?? '—';
  const changed = before !== after && before !== null && after !== null;
  const delta = typeof before === 'number' && typeof after === 'number'
    ? after - before : null;

  return (
    <div className="grid grid-cols-4 gap-2 items-center py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-xs text-center">{bVal}{unit && before !== null ? ` ${unit}` : ''}</span>
      <span className={cn('text-xs text-center font-medium', changed && 'text-primary')}>
        {aVal}{unit && after !== null ? ` ${unit}` : ''}
      </span>
      <span className={cn('text-xs text-center', delta !== null && delta > 0 && 'text-green-500', delta !== null && delta < 0 && 'text-amber-500')}>
        {delta !== null ? (delta > 0 ? `+${Math.round(delta * 100) / 100}` : `${Math.round(delta * 100) / 100}`) : '—'}
      </span>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────
export default function PidTuningPage() {
  const { projects } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const { sessions, addSession, updateSession, removeSession } = usePidTuningSessions(selectedProjectId || undefined);

  // Active session state
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loopName, setLoopName] = useState('');
  const [equipment, setEquipment] = useState('');
  const [loopType, setLoopType] = useState<PidLoopType>('sat');
  const [controlledVariable, setControlledVariable] = useState('');
  const [outputType, setOutputType] = useState<PidOutputType>('valve');
  const [actuatorStrokeTime, setActuatorStrokeTime] = useState<string>('');
  const [action, setAction] = useState<PidAction>('reverse');
  const [controlMode, setControlMode] = useState<PidControlMode>('pi');

  // Tuning values
  const [currentValues, setCurrentValues] = useState<PidTuningValues>(defaultTuningValues());
  const [recommendedValues, setRecommendedValues] = useState<PidTuningValues>(defaultTuningValues());

  // Symptoms
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);

  // Response data
  const [responseData, setResponseData] = useState<PidResponseData>(defaultResponseData());

  // Notes
  const [fieldNotes, setFieldNotes] = useState('');

  // Export dropdown
  const [exportOpen, setExportOpen] = useState(false);

  // ─── Derived data ───────────────────────────────────────
  const diagnosis = useMemo(() =>
    diagnoseSymptoms(selectedSymptoms, loopType, controlMode, currentValues),
    [selectedSymptoms, loopType, controlMode, currentValues]
  );

  const recommendation = useMemo(() =>
    generateRecommendation(loopType, controlMode, currentValues, selectedSymptoms, responseData, action),
    [loopType, controlMode, currentValues, selectedSymptoms, responseData, action]
  );

  // ─── Actions ────────────────────────────────────────────
  const handleLoopTypeChange = useCallback((type: PidLoopType) => {
    setLoopType(type);
    const defaults = LOOP_TYPE_DEFAULTS[type];
    setAction(defaults.action);
    setControlMode(defaults.mode);
  }, []);

  const applyRecommendations = useCallback(() => {
    const rec = recommendation.recommendedValues;
    setRecommendedValues({
      gainMode: currentValues.gainMode,
      gain: rec.gain ?? currentValues.gain,
      proportionalBand: rec.proportionalBand ?? currentValues.proportionalBand,
      integralTime: rec.integralTime ?? currentValues.integralTime,
      derivativeTime: rec.derivativeTime ?? currentValues.derivativeTime,
      sampleInterval: rec.sampleInterval ?? currentValues.sampleInterval,
      outputMin: rec.outputMin ?? currentValues.outputMin,
      outputMax: rec.outputMax ?? currentValues.outputMax,
      deadband: rec.deadband ?? currentValues.deadband,
    });
    toast.success('Recommendations applied to comparison');
  }, [recommendation, currentValues]);

  const loadDefaults = useCallback(() => {
    const defaults = LOOP_TYPE_DEFAULTS[loopType];
    setCurrentValues(prev => ({
      ...prev,
      gain: defaults.gain,
      proportionalBand: gainToProportionalBand(defaults.gain),
      integralTime: defaults.integralTime,
      derivativeTime: defaults.derivativeTime,
    }));
    toast.success('Default values loaded for ' + PID_LOOP_TYPE_LABELS[loopType]);
  }, [loopType]);

  const resetForm = useCallback(() => {
    setActiveSessionId(null);
    setLoopName('');
    setEquipment('');
    setLoopType('sat');
    setControlledVariable('');
    setOutputType('valve');
    setActuatorStrokeTime('');
    setAction('reverse');
    setControlMode('pi');
    setCurrentValues(defaultTuningValues());
    setRecommendedValues(defaultTuningValues());
    setSelectedSymptoms([]);
    setResponseData(defaultResponseData());
    setFieldNotes('');
  }, []);

  const loadSession = useCallback((session: PidTuningSession) => {
    setActiveSessionId(session.id);
    setSelectedProjectId(session.projectId);
    setLoopName(session.loopName);
    setEquipment(session.equipment);
    setLoopType(session.loopType);
    setControlledVariable(session.controlledVariable);
    setOutputType(session.outputType);
    setActuatorStrokeTime(session.actuatorStrokeTime?.toString() ?? '');
    setAction(session.action);
    setControlMode(session.controlMode);
    setCurrentValues(session.currentValues);
    setRecommendedValues(session.recommendedValues);
    setSelectedSymptoms(session.symptoms);
    setResponseData(session.responseData);
    setFieldNotes(session.fieldNotes);
    toast.success('Session loaded');
  }, []);

  const handleSave = useCallback(async () => {
    if (!loopName.trim()) {
      toast.error('Enter a loop name before saving');
      return;
    }
    const data = {
      projectId: selectedProjectId,
      loopName: loopName.trim(),
      equipment: equipment.trim(),
      loopType,
      controlledVariable: controlledVariable.trim(),
      outputType,
      actuatorStrokeTime: actuatorStrokeTime ? parseFloat(actuatorStrokeTime) : null,
      action,
      controlMode,
      currentValues,
      recommendedValues,
      symptoms: selectedSymptoms,
      responseData,
      fieldNotes,
    };

    if (activeSessionId) {
      await updateSession({
        ...data,
        id: activeSessionId,
        createdAt: sessions.find(s => s.id === activeSessionId)?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      toast.success('Session updated');
    } else {
      const session = await addSession(data);
      setActiveSessionId(session.id);
      toast.success('Session saved');
    }
  }, [loopName, equipment, loopType, controlledVariable, outputType, actuatorStrokeTime, action, controlMode, currentValues, recommendedValues, selectedSymptoms, responseData, fieldNotes, selectedProjectId, activeSessionId, sessions, addSession, updateSession]);

  // ─── Export helpers ─────────────────────────────────────
  const formatSessionText = useCallback(() => {
    const lines: string[] = [];
    lines.push('═══════════════════════════════════════════════════════');
    lines.push('  PID TUNING SESSION — BAU Suite');
    lines.push('═══════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Loop Name:      ${loopName || '—'}`);
    lines.push(`Equipment:      ${equipment || '—'}`);
    lines.push(`Loop Type:      ${PID_LOOP_TYPE_LABELS[loopType]}`);
    lines.push(`Control Mode:   ${PID_CONTROL_MODE_LABELS[controlMode]}`);
    lines.push(`Action:         ${action === 'direct' ? 'Direct' : 'Reverse'}`);
    lines.push(`Output Type:    ${PID_OUTPUT_TYPE_LABELS[outputType]}`);
    if (actuatorStrokeTime) lines.push(`Stroke Time:    ${actuatorStrokeTime}s`);
    const proj = projects.find(p => p.id === selectedProjectId);
    if (proj) lines.push(`Project:        ${proj.name}`);
    lines.push('');
    lines.push('─── CURRENT TUNING VALUES ─────────────────────────────');
    lines.push(`  Gain (Kp):       ${currentValues.gain ?? '—'}`);
    lines.push(`  PB%:             ${currentValues.proportionalBand ?? '—'}`);
    if (controlMode !== 'p') lines.push(`  Integral (Ti):   ${currentValues.integralTime ?? '—'}s`);
    if (controlMode === 'pid') lines.push(`  Derivative (Td):  ${currentValues.derivativeTime ?? '—'}s`);
    lines.push(`  Output Range:    ${currentValues.outputMin ?? 0}% – ${currentValues.outputMax ?? 100}%`);
    if (currentValues.deadband) lines.push(`  Deadband:        ${currentValues.deadband}`);
    lines.push('');
    lines.push('─── RECOMMENDED VALUES ────────────────────────────────');
    lines.push(`  Gain (Kp):       ${recommendedValues.gain ?? '—'}`);
    lines.push(`  PB%:             ${recommendedValues.proportionalBand ?? '—'}`);
    if (controlMode !== 'p') lines.push(`  Integral (Ti):   ${recommendedValues.integralTime ?? '—'}s`);
    if (controlMode === 'pid') lines.push(`  Derivative (Td):  ${recommendedValues.derivativeTime ?? '—'}s`);
    lines.push('');
    if (selectedSymptoms.length > 0) {
      lines.push('─── OBSERVED SYMPTOMS ─────────────────────────────────');
      for (const sid of selectedSymptoms) {
        const sym = PID_SYMPTOMS.find(s => s.id === sid);
        if (sym) lines.push(`  • ${sym.label}`);
      }
      lines.push('');
    }
    if (fieldNotes.trim()) {
      lines.push('─── FIELD NOTES ───────────────────────────────────────');
      lines.push(fieldNotes);
      lines.push('');
    }
    lines.push(`Date: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`);
    lines.push('Generated by BAU Suite — PID Tuning Tool');
    return lines.join('\n');
  }, [loopName, equipment, loopType, controlMode, action, outputType, actuatorStrokeTime, currentValues, recommendedValues, selectedSymptoms, fieldNotes, selectedProjectId, projects]);

  const handleCopyClipboard = useCallback(async () => {
    await navigator.clipboard.writeText(formatSessionText());
    toast.success('Copied to clipboard');
    setExportOpen(false);
  }, [formatSessionText]);

  const handlePrint = useCallback(() => {
    window.print();
    setExportOpen(false);
  }, []);

  const handleExportJson = useCallback(() => {
    const data = {
      loopName, equipment, loopType, controlMode, action, outputType,
      actuatorStrokeTime: actuatorStrokeTime ? parseFloat(actuatorStrokeTime) : null,
      currentValues, recommendedValues, symptoms: selectedSymptoms,
      responseData, fieldNotes,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pid-tuning_${loopName || 'session'}_${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('JSON exported');
    setExportOpen(false);
  }, [loopName, equipment, loopType, controlMode, action, outputType, actuatorStrokeTime, currentValues, recommendedValues, selectedSymptoms, responseData, fieldNotes]);

  const updateGainValue = useCallback((val: string) => {
    const num = val === '' ? null : parseFloat(val);
    setCurrentValues(prev => ({
      ...prev,
      gain: num,
      proportionalBand: num ? gainToProportionalBand(num) : null,
    }));
  }, []);

  const updatePbValue = useCallback((val: string) => {
    const num = val === '' ? null : parseFloat(val);
    setCurrentValues(prev => ({
      ...prev,
      proportionalBand: num,
      gain: num ? proportionalBandToGain(num) : null,
    }));
  }, []);

  // ─── Render ─────────────────────────────────────────────
  return (
    <>
      <TopBar title="PID Tuning Tool" />
      <div className="p-4 md:p-6 space-y-4 max-w-5xl print:max-w-none">
        {/* Header actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={resetForm}>
            <Plus className="h-3.5 w-3.5" /> New Session
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handleSave}>
            <Save className="h-3.5 w-3.5" /> {activeSessionId ? 'Update' : 'Save'}
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={loadDefaults}>
            <RotateCcw className="h-3.5 w-3.5" /> Load Defaults
          </Button>

          {/* Export dropdown */}
          <div className="relative ml-auto">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setExportOpen(!exportOpen)}>
              <FileDown className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3 w-3" />
            </Button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 rounded-lg border border-border bg-popover p-1 shadow-lg min-w-[160px]">
                  <button onClick={handleCopyClipboard} className="flex items-center gap-2 w-full rounded-md px-3 py-2 text-xs hover:bg-muted transition-colors">
                    <Copy className="h-3.5 w-3.5" /> Copy to Clipboard
                  </button>
                  <button onClick={handlePrint} className="flex items-center gap-2 w-full rounded-md px-3 py-2 text-xs hover:bg-muted transition-colors">
                    <Printer className="h-3.5 w-3.5" /> Print / PDF
                  </button>
                  <button onClick={handleExportJson} className="flex items-center gap-2 w-full rounded-md px-3 py-2 text-xs hover:bg-muted transition-colors">
                    <FileJson className="h-3.5 w-3.5" /> Export JSON
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="setup" className="space-y-4">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="setup" className="gap-1.5 text-xs"><Settings2 className="h-3.5 w-3.5" /> Setup</TabsTrigger>
            <TabsTrigger value="diagnosis" className="gap-1.5 text-xs"><Activity className="h-3.5 w-3.5" /> Diagnosis</TabsTrigger>
            <TabsTrigger value="recommendations" className="gap-1.5 text-xs"><Lightbulb className="h-3.5 w-3.5" /> Recommendations</TabsTrigger>
            <TabsTrigger value="sessions" className="gap-1.5 text-xs"><MessageSquare className="h-3.5 w-3.5" /> Notes & Sessions</TabsTrigger>
            <TabsTrigger value="reference" className="gap-1.5 text-xs"><BookOpen className="h-3.5 w-3.5" /> Reference</TabsTrigger>
          </TabsList>

          {/* ═══ TAB 1: Setup ═══ */}
          <TabsContent value="setup" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Loop Setup */}
              <SectionCard title="Loop Setup" icon={Gauge}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FieldGroup label="Loop Name">
                    <Input className="h-8 text-xs" placeholder="e.g., AHU-1 SAT Loop" value={loopName} onChange={e => setLoopName(e.target.value)} />
                  </FieldGroup>
                  <FieldGroup label="Equipment / System">
                    <Input className="h-8 text-xs" placeholder="e.g., AHU-1" value={equipment} onChange={e => setEquipment(e.target.value)} />
                  </FieldGroup>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FieldGroup label="Project">
                    <Select value={selectedProjectId} onValueChange={(v) => setSelectedProjectId(v ?? '')}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select project..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value=" ">No project</SelectItem>
                        {projects.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldGroup>
                  <FieldGroup label="Loop Type">
                    <Select value={loopType} onValueChange={(v) => v && handleLoopTypeChange(v as PidLoopType)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PID_LOOP_TYPE_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldGroup>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FieldGroup label="Controlled Variable">
                    <Input className="h-8 text-xs" placeholder="e.g., Supply Air Temp" value={controlledVariable} onChange={e => setControlledVariable(e.target.value)} />
                  </FieldGroup>
                  <FieldGroup label="Output Device">
                    <Select value={outputType} onValueChange={(v) => v && setOutputType(v as PidOutputType)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PID_OUTPUT_TYPE_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldGroup>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FieldGroup label="Actuator Stroke Time" hint="Approximate time for the actuator to travel full range (0-100%). Affects recommended tuning aggressiveness.">
                    <div className="flex items-center gap-1.5">
                      <Input className="h-8 text-xs" type="number" placeholder="e.g., 90" value={actuatorStrokeTime} onChange={e => setActuatorStrokeTime(e.target.value)} />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">sec</span>
                    </div>
                  </FieldGroup>
                  <FieldGroup label="Control Action" hint="Reverse: output increases as PV drops below setpoint (heating/cooling valves). Direct: output increases as PV rises (pressure, VFD).">
                    <div className="flex items-center gap-3 h-8">
                      <span className={cn('text-xs', action === 'reverse' ? 'text-foreground font-medium' : 'text-muted-foreground')}>Reverse</span>
                      <Switch checked={action === 'direct'} onCheckedChange={(v) => setAction(v ? 'direct' : 'reverse')} />
                      <span className={cn('text-xs', action === 'direct' ? 'text-foreground font-medium' : 'text-muted-foreground')}>Direct</span>
                    </div>
                  </FieldGroup>
                </div>
                {/* Loop type info */}
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground">{LOOP_TYPE_DEFAULTS[loopType].description}</p>
                </div>
              </SectionCard>

              {/* Tuning Inputs */}
              <SectionCard title="Current Tuning Values" icon={Settings2}>
                {/* Control Mode */}
                <FieldGroup label="Control Mode">
                  <Select value={controlMode} onValueChange={(v) => v && setControlMode(v as PidControlMode)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PID_CONTROL_MODE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>

                {/* Gain mode toggle + inputs */}
                <div className="flex items-center gap-2 text-xs">
                  <span className={cn(currentValues.gainMode === 'gain' ? 'font-medium text-foreground' : 'text-muted-foreground')}>Gain (Kp)</span>
                  <Switch
                    checked={currentValues.gainMode === 'proportional-band'}
                    onCheckedChange={(v) => setCurrentValues(prev => ({ ...prev, gainMode: v ? 'proportional-band' : 'gain' }))}
                  />
                  <span className={cn(currentValues.gainMode === 'proportional-band' ? 'font-medium text-foreground' : 'text-muted-foreground')}>PB%</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label={currentValues.gainMode === 'gain' ? 'Gain (Kp)' : 'Proportional Band (%)'}>
                    <Input
                      className="h-8 text-xs"
                      type="number"
                      step="0.1"
                      placeholder={currentValues.gainMode === 'gain' ? 'e.g., 4' : 'e.g., 25'}
                      value={currentValues.gainMode === 'gain' ? (currentValues.gain ?? '') : (currentValues.proportionalBand ?? '')}
                      onChange={e => currentValues.gainMode === 'gain' ? updateGainValue(e.target.value) : updatePbValue(e.target.value)}
                    />
                  </FieldGroup>
                  <div className="flex items-end pb-1">
                    <p className="text-[10px] text-muted-foreground">
                      {currentValues.gainMode === 'gain'
                        ? currentValues.gain ? `= ${gainToProportionalBand(currentValues.gain)}% PB` : ''
                        : currentValues.proportionalBand ? `= Kp ${proportionalBandToGain(currentValues.proportionalBand)}` : ''
                      }
                    </p>
                  </div>
                </div>

                {controlMode !== 'p' && (
                  <FieldGroup label="Integral Time (Ti)" hint="Time in seconds for integral action to repeat the proportional correction. Longer = slower integral.">
                    <div className="flex items-center gap-1.5">
                      <Input className="h-8 text-xs" type="number" placeholder="e.g., 240" value={currentValues.integralTime ?? ''} onChange={e => setCurrentValues(prev => ({ ...prev, integralTime: e.target.value === '' ? null : parseFloat(e.target.value) }))} />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">sec</span>
                    </div>
                  </FieldGroup>
                )}

                {controlMode === 'pid' && (
                  <FieldGroup label="Derivative Time (Td)" hint="Rarely used in BAS HVAC loops. Amplifies noise. Use only for temperature loops with significant dead time.">
                    <div className="flex items-center gap-1.5">
                      <Input className="h-8 text-xs" type="number" placeholder="e.g., 0" value={currentValues.derivativeTime ?? ''} onChange={e => setCurrentValues(prev => ({ ...prev, derivativeTime: e.target.value === '' ? null : parseFloat(e.target.value) }))} />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">sec</span>
                    </div>
                  </FieldGroup>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="Output Min (%)">
                    <Input className="h-8 text-xs" type="number" value={currentValues.outputMin ?? ''} onChange={e => setCurrentValues(prev => ({ ...prev, outputMin: e.target.value === '' ? null : parseFloat(e.target.value) }))} />
                  </FieldGroup>
                  <FieldGroup label="Output Max (%)">
                    <Input className="h-8 text-xs" type="number" value={currentValues.outputMax ?? ''} onChange={e => setCurrentValues(prev => ({ ...prev, outputMax: e.target.value === '' ? null : parseFloat(e.target.value) }))} />
                  </FieldGroup>
                </div>

                <FieldGroup label="Deadband" hint="Prevents the controller from reacting to small errors within this band around setpoint.">
                  <Input className="h-8 text-xs" type="number" step="0.1" placeholder="e.g., 0.5" value={currentValues.deadband ?? ''} onChange={e => setCurrentValues(prev => ({ ...prev, deadband: e.target.value === '' ? null : parseFloat(e.target.value) }))} />
                </FieldGroup>

                <FieldGroup label="Sample / Update Interval" hint="How often the controller recalculates the output. Some Siemens controllers allow configuring this.">
                  <div className="flex items-center gap-1.5">
                    <Input className="h-8 text-xs" type="number" placeholder="e.g., 5" value={currentValues.sampleInterval ?? ''} onChange={e => setCurrentValues(prev => ({ ...prev, sampleInterval: e.target.value === '' ? null : parseFloat(e.target.value) }))} />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">sec</span>
                  </div>
                </FieldGroup>
              </SectionCard>
            </div>
          </TabsContent>

          {/* ═══ TAB 2: Diagnosis ═══ */}
          <TabsContent value="diagnosis" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Symptom Analysis */}
              <SectionCard title="Symptom Analysis" icon={Wrench}>
                <p className="text-xs text-muted-foreground">Select symptoms you observe in the field. The tool will diagnose likely causes.</p>
                <div className="space-y-2">
                  {PID_SYMPTOMS.map(sym => {
                    const active = selectedSymptoms.includes(sym.id);
                    return (
                      <button
                        key={sym.id}
                        onClick={() => setSelectedSymptoms(prev => active ? prev.filter(s => s !== sym.id) : [...prev, sym.id])}
                        className={cn(
                          'w-full text-left rounded-lg border px-3 py-2.5 transition-colors',
                          active
                            ? sym.category === 'mechanical' ? 'border-amber-500/40 bg-amber-500/10' : sym.category === 'sensor' ? 'border-blue-500/40 bg-blue-500/10' : 'border-primary/40 bg-primary/10'
                            : 'border-border hover:border-primary/20',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            'h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0',
                            active ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                          )}>
                            {active && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                          </div>
                          <span className="text-xs font-medium">{sym.label}</span>
                          {sym.category !== 'tuning' && (
                            <span className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded',
                              sym.category === 'mechanical' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400',
                            )}>
                              {sym.category === 'mechanical' ? 'Mechanical' : 'Sensor'}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 ml-5.5">{sym.description}</p>
                      </button>
                    );
                  })}
                </div>

                {/* Diagnosis results */}
                {selectedSymptoms.length > 0 && (
                  <div className="space-y-3 pt-2 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Diagnosis</p>
                    <p className="text-xs">{diagnosis.overallAssessment}</p>

                    {diagnosis.tuningAdjustments.map((adj, i) => (
                      <div key={i} className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <ArrowUpDown className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="text-xs font-medium capitalize">{adj.direction} {adj.parameter} ({adj.magnitude})</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">{adj.explanation}</p>
                      </div>
                    ))}

                    {diagnosis.nonTuningIssues.map((issue, i) => (
                      <div key={i} className="rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span className="text-xs font-medium">{issue.issue}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">{issue.explanation}</p>
                        <p className="text-[11px] text-primary mt-1">{issue.suggestion}</p>
                      </div>
                    ))}

                    {diagnosis.cautions.map((c, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-amber-400">
                        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>{c}</span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* Response Interpretation */}
              <SectionCard title="Response Interpretation" icon={TrendingUp}>
                <p className="text-xs text-muted-foreground">Enter observed step response data from trending or field testing.</p>
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="Setpoint">
                    <Input className="h-8 text-xs" type="number" step="0.1" value={responseData.setpoint ?? ''} onChange={e => setResponseData(prev => ({ ...prev, setpoint: e.target.value === '' ? null : parseFloat(e.target.value) }))} />
                  </FieldGroup>
                  <FieldGroup label="Starting PV">
                    <Input className="h-8 text-xs" type="number" step="0.1" value={responseData.startingPv ?? ''} onChange={e => setResponseData(prev => ({ ...prev, startingPv: e.target.value === '' ? null : parseFloat(e.target.value) }))} />
                  </FieldGroup>
                  <FieldGroup label="Final PV">
                    <Input className="h-8 text-xs" type="number" step="0.1" value={responseData.finalPv ?? ''} onChange={e => setResponseData(prev => ({ ...prev, finalPv: e.target.value === '' ? null : parseFloat(e.target.value) }))} />
                  </FieldGroup>
                  <FieldGroup label="Overshoot (%)">
                    <Input className="h-8 text-xs" type="number" step="1" value={responseData.overshootPercent ?? ''} onChange={e => setResponseData(prev => ({ ...prev, overshootPercent: e.target.value === '' ? null : parseFloat(e.target.value) }))} />
                  </FieldGroup>
                  <FieldGroup label="Response Time" hint="Time from setpoint change to first reaching setpoint">
                    <div className="flex items-center gap-1.5">
                      <Input className="h-8 text-xs" type="number" value={responseData.responseTimeSeconds ?? ''} onChange={e => setResponseData(prev => ({ ...prev, responseTimeSeconds: e.target.value === '' ? null : parseFloat(e.target.value) }))} />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">sec</span>
                    </div>
                  </FieldGroup>
                  <FieldGroup label="Settle Time" hint="Time until PV stays within deadband of setpoint">
                    <div className="flex items-center gap-1.5">
                      <Input className="h-8 text-xs" type="number" value={responseData.settleTimeSeconds ?? ''} onChange={e => setResponseData(prev => ({ ...prev, settleTimeSeconds: e.target.value === '' ? null : parseFloat(e.target.value) }))} />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">sec</span>
                    </div>
                  </FieldGroup>
                  <FieldGroup label="Dead Time" hint="Delay before PV begins to change after output changes">
                    <div className="flex items-center gap-1.5">
                      <Input className="h-8 text-xs" type="number" value={responseData.deadTimeSeconds ?? ''} onChange={e => setResponseData(prev => ({ ...prev, deadTimeSeconds: e.target.value === '' ? null : parseFloat(e.target.value) }))} />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">sec</span>
                    </div>
                  </FieldGroup>
                  <FieldGroup label="Oscillation Count" hint="Number of times PV crosses setpoint before settling">
                    <Input className="h-8 text-xs" type="number" step="1" value={responseData.oscillationCount ?? ''} onChange={e => setResponseData(prev => ({ ...prev, oscillationCount: e.target.value === '' ? null : parseInt(e.target.value) }))} />
                  </FieldGroup>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={responseData.saturated} onCheckedChange={(v) => setResponseData(prev => ({ ...prev, saturated: v }))} />
                  <Label className="text-xs">Output saturated (hit 0% or 100%)</Label>
                </div>

                {/* Response summary */}
                {responseData.setpoint !== null && (
                  <div className="rounded-lg bg-muted/50 px-3 py-2 space-y-1">
                    <p className="text-xs font-medium">Response Summary</p>
                    {responseData.overshootPercent !== null && responseData.overshootPercent > 10 && (
                      <p className="text-[11px] text-amber-400">Overshoot of {responseData.overshootPercent}% is significant — consider reducing gain.</p>
                    )}
                    {responseData.deadTimeSeconds !== null && responseData.deadTimeSeconds > 30 && (
                      <p className="text-[11px] text-amber-400">Dead time of {responseData.deadTimeSeconds}s is significant — use conservative tuning.</p>
                    )}
                    {responseData.oscillationCount !== null && responseData.oscillationCount > 3 && (
                      <p className="text-[11px] text-amber-400">Multiple oscillations ({responseData.oscillationCount}) indicate the loop is under-damped.</p>
                    )}
                    {responseData.saturated && (
                      <p className="text-[11px] text-amber-400">Output saturation occurred — check equipment sizing.</p>
                    )}
                    {responseData.overshootPercent !== null && responseData.overshootPercent <= 10 && (responseData.oscillationCount ?? 0) <= 2 && !responseData.saturated && (
                      <p className="text-[11px] text-green-500">Response looks well-controlled. Minor adjustments may still improve performance.</p>
                    )}
                  </div>
                )}
              </SectionCard>
            </div>
          </TabsContent>

          {/* ═══ TAB 3: Recommendations ═══ */}
          <TabsContent value="recommendations" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Recommendations */}
              <SectionCard title="Tuning Recommendations" icon={Lightbulb}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn(
                    'text-[10px] font-semibold px-2 py-0.5 rounded',
                    recommendation.confidence === 'high' ? 'bg-green-500/20 text-green-400'
                      : recommendation.confidence === 'medium' ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                  )}>
                    {recommendation.confidence.toUpperCase()} CONFIDENCE
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{recommendation.rationale}</p>

                {Object.entries(recommendation.explanations).map(([key, explanation]) => (
                  <div key={key} className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-xs font-medium capitalize">{key === 'integralTime' ? 'Integral Time' : key === 'derivativeTime' ? 'Derivative Time' : key}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">{explanation}</p>
                  </div>
                ))}

                {recommendation.cautions.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span className="text-xs text-amber-400">{c}</span>
                  </div>
                ))}

                <Button size="sm" className="gap-1.5 w-full" onClick={applyRecommendations}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Apply Recommendations
                </Button>
              </SectionCard>

              {/* Before vs After */}
              <SectionCard title="Before vs After Comparison" icon={ArrowUpDown}>
                <div className="grid grid-cols-4 gap-2 pb-2 border-b border-border">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">Parameter</span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">Before</span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">After</span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">Delta</span>
                </div>
                <CompareRow label="Gain (Kp)" before={currentValues.gain} after={recommendedValues.gain} />
                <CompareRow label="PB%" before={currentValues.proportionalBand} after={recommendedValues.proportionalBand} unit="%" />
                {controlMode !== 'p' && (
                  <CompareRow label="Integral (Ti)" before={currentValues.integralTime} after={recommendedValues.integralTime} unit="s" />
                )}
                {controlMode === 'pid' && (
                  <CompareRow label="Derivative (Td)" before={currentValues.derivativeTime} after={recommendedValues.derivativeTime} unit="s" />
                )}
                <CompareRow label="Output Min" before={currentValues.outputMin} after={recommendedValues.outputMin} unit="%" />
                <CompareRow label="Output Max" before={currentValues.outputMax} after={recommendedValues.outputMax} unit="%" />
                <CompareRow label="Deadband" before={currentValues.deadband} after={recommendedValues.deadband} />

                {/* Rationale summary */}
                {(recommendedValues.gain !== null || recommendedValues.integralTime !== null) && (
                  <div className="rounded-lg bg-muted/50 px-3 py-2 mt-2">
                    <p className="text-xs font-medium mb-1">Change Summary</p>
                    {currentValues.gain !== null && recommendedValues.gain !== null && currentValues.gain !== recommendedValues.gain && (
                      <p className="text-[11px] text-muted-foreground">
                        Gain {recommendedValues.gain > currentValues.gain ? 'increased' : 'decreased'} by{' '}
                        {Math.abs(Math.round((1 - recommendedValues.gain / currentValues.gain) * 100))}%
                      </p>
                    )}
                    {currentValues.integralTime !== null && recommendedValues.integralTime !== null && currentValues.integralTime !== recommendedValues.integralTime && (
                      <p className="text-[11px] text-muted-foreground">
                        Integral time {recommendedValues.integralTime > currentValues.integralTime ? 'increased' : 'decreased'} by{' '}
                        {Math.abs(Math.round((1 - recommendedValues.integralTime / currentValues.integralTime) * 100))}%
                      </p>
                    )}
                  </div>
                )}
              </SectionCard>
            </div>
          </TabsContent>

          {/* ═══ TAB 4: Notes & Sessions ═══ */}
          <TabsContent value="sessions" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Field Notes */}
              <SectionCard title="Field Notes" icon={MessageSquare}>
                <Textarea
                  className="min-h-[200px] text-xs"
                  placeholder="Enter field observations, mechanical notes, site conditions, constraints...&#10;&#10;Examples:&#10;• Valve appears oversized for this coil&#10;• Sensor located downstream of mixing box&#10;• TAB not complete yet&#10;• Static loop affected by VAV hunting"
                  value={fieldNotes}
                  onChange={e => setFieldNotes(e.target.value)}
                />
              </SectionCard>

              {/* Saved Sessions */}
              <SectionCard title="Saved Sessions" icon={FolderOpen}>
                <FieldGroup label="Filter by Project">
                  <Select value={selectedProjectId} onValueChange={(v) => setSelectedProjectId(v ?? '')}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All sessions..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value=" ">All sessions</SelectItem>
                      {projects.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>

                {sessions.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">No saved sessions{selectedProjectId ? ' for this project' : ''}.</p>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {sessions.map(session => (
                      <div
                        key={session.id}
                        className={cn(
                          'rounded-lg border px-3 py-2.5 cursor-pointer transition-colors',
                          session.id === activeSessionId ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-primary/20',
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <button onClick={() => loadSession(session)} className="flex-1 text-left">
                            <p className="text-xs font-medium">{session.loopName}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {session.equipment} &middot; {PID_LOOP_TYPE_LABELS[session.loopType]} &middot; {format(new Date(session.updatedAt), 'MMM d, yyyy')}
                            </p>
                          </button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 shrink-0"
                            onClick={(e) => { e.stopPropagation(); removeSession(session.id); toast.success('Session deleted'); }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          </TabsContent>

          {/* ═══ TAB 5: Reference ═══ */}
          <TabsContent value="reference" className="space-y-4">
            {/* Reference articles */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {BAS_PID_REFERENCE.map((section, i) => (
                <SectionCard key={i} title={section.title} icon={BookOpen}>
                  <p className="text-xs text-muted-foreground leading-relaxed">{section.content}</p>
                </SectionCard>
              ))}
            </div>

            {/* Typical ranges table */}
            <SectionCard title="Typical Starting Values by Loop Type" icon={Activity}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-3 font-semibold text-muted-foreground">Loop Type</th>
                      <th className="text-left py-2 pr-3 font-semibold text-muted-foreground">Gain (Kp)</th>
                      <th className="text-left py-2 pr-3 font-semibold text-muted-foreground">Integral (Ti)</th>
                      <th className="text-left py-2 pr-3 font-semibold text-muted-foreground">Derivative</th>
                      <th className="text-left py-2 font-semibold text-muted-foreground">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TYPICAL_RANGES.map((row, i) => (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="py-2 pr-3 font-medium">{row.loopType}</td>
                        <td className="py-2 pr-3">{row.gain}</td>
                        <td className="py-2 pr-3">{row.integralTime}</td>
                        <td className="py-2 pr-3">{row.derivative}</td>
                        <td className="py-2 text-muted-foreground">{row.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
