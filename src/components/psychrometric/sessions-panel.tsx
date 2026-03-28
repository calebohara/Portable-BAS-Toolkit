'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Save, Trash2, FolderOpen, Copy, FileJson, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/utils';
import { format } from 'date-fns';
import type { PsychSession, PsychInputMode, PsychUnitSystem, PsychState, PsychComfortResult } from '@/types';
import type { Project } from '@/types';
import { usePsychSessions } from '@/hooks/use-psychrometric-sessions';
import { ipToSi, formatProperty } from '@/lib/psychrometric-engine';
import { SectionCard } from './shared';

interface SessionsPanelProps {
  unitSystem: PsychUnitSystem;
  altitude: number;
  inputMode: PsychInputMode;
  inputValues: Record<string, number>;
  results: PsychState | null;
  comfortResult: PsychComfortResult | null;
  projects: Project[];
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  onLoadSession: (session: PsychSession) => void;
}

export function SessionsPanel({
  unitSystem, altitude, inputMode, inputValues,
  results, comfortResult,
  projects, selectedProjectId, setSelectedProjectId,
  onLoadSession,
}: SessionsPanelProps) {
  const [filterProjectId, setFilterProjectId] = useState('');
  const [sessionLabel, setSessionLabel] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const { sessions, addSession, removeSession } = usePsychSessions(filterProjectId || undefined);

  async function handleSave() {
    if (!sessionLabel.trim()) {
      toast.error('Enter a session label');
      return;
    }
    if (!results || !comfortResult) {
      toast.error('Run a calculation first');
      return;
    }

    setSaving(true);
    try {
      await addSession({
        projectId: selectedProjectId,
        label: sessionLabel.trim(),
        unitSystem,
        altitude,
        inputMode,
        inputValues,
        results,
        comfortResult,
        notes: sessionNotes,
        tags: [],
      });
      toast.success('Session saved');
      setSessionLabel('');
      setSessionNotes('');
    } catch {
      // error handled in hook
    } finally {
      setSaving(false);
    }
  }

  function exportAsText(session: PsychSession) {
    const s = session.unitSystem === 'si' ? ipToSi(session.results) : session.results;
    const u = session.unitSystem;
    const lines = [
      `Psychrometric Calculator — ${session.label}`,
      `Date: ${format(new Date(session.createdAt), 'MMM d, yyyy HH:mm')}`,
      `Units: ${u === 'ip' ? 'Imperial (IP)' : 'SI (Metric)'}`,
      `Altitude: ${session.altitude} ${u === 'ip' ? 'ft' : 'm'}`,
      '',
      `Dry Bulb: ${formatProperty('dryBulb', s.dryBulb, u).value} ${formatProperty('dryBulb', s.dryBulb, u).unit}`,
      `Wet Bulb: ${formatProperty('wetBulb', s.wetBulb, u).value} ${formatProperty('wetBulb', s.wetBulb, u).unit}`,
      `Dew Point: ${formatProperty('dewPoint', s.dewPoint, u).value} ${formatProperty('dewPoint', s.dewPoint, u).unit}`,
      `RH: ${s.relativeHumidity.toFixed(1)}%`,
      `Humidity Ratio: ${u === 'ip' ? (s.humidityRatio * 7000).toFixed(1) + ' gr/lb' : s.humidityRatio.toFixed(2) + ' g/kg'}`,
      `Enthalpy: ${formatProperty('enthalpy', s.enthalpy, u).value} ${formatProperty('enthalpy', s.enthalpy, u).unit}`,
      `Specific Volume: ${formatProperty('specificVolume', s.specificVolume, u).value} ${formatProperty('specificVolume', s.specificVolume, u).unit}`,
      '',
      `Comfort Zone: ${session.comfortResult.reason}`,
    ];
    if (session.notes) lines.push('', `Notes: ${session.notes}`);
    copyToClipboard(lines.join('\n'));
    toast.success('Copied to clipboard');
  }

  function exportAsJson(session: PsychSession) {
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `psych_${session.label.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('JSON exported');
  }

  return (
    <div className="space-y-4">
      {/* Save Current */}
      <SectionCard title="Save Current Calculation" icon={Save}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">Session Label *</Label>
              <Input
                value={sessionLabel}
                onChange={(e) => setSessionLabel(e.target.value)}
                className="mt-1"
                placeholder="e.g. AHU-1 Summer Design"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Project</Label>
              <Select value={selectedProjectId} onValueChange={(v) => setSelectedProjectId(v ?? '')}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue>{selectedProjectId ? projects.find(p => p.id === selectedProjectId)?.name : 'No project'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea
              value={sessionNotes}
              onChange={(e) => setSessionNotes(e.target.value)}
              className="mt-1"
              rows={2}
              placeholder="Optional field notes..."
            />
          </div>
          <Button onClick={handleSave} disabled={saving || !results} size="sm">
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? 'Saving...' : 'Save Session'}
          </Button>
        </div>
      </SectionCard>

      {/* Saved Sessions */}
      <SectionCard title="Saved Sessions" icon={Clock}>
        <div className="flex items-center gap-2 mb-2">
          <Label className="text-xs text-muted-foreground shrink-0">Filter by project:</Label>
          <Select value={filterProjectId} onValueChange={(v) => setFilterProjectId(v ?? '')}>
            <SelectTrigger className="h-7 text-xs w-full">
              <SelectValue>{filterProjectId ? projects.find(p => p.id === filterProjectId)?.name : 'All projects'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No saved sessions yet. Run a calculation and save it above.</p>
        ) : (
          <div className="space-y-2" style={{ maxHeight: '24rem', overflowY: 'auto' }}>
            {sessions.map((s) => {
              const display = s.unitSystem === 'si' ? ipToSi(s.results) : s.results;
              const project = projects.find((p) => p.id === s.projectId);
              return (
                <div
                  key={s.id}
                  className="rounded-lg border border-border bg-background p-3 space-y-2 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{s.label}</div>
                      <div className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                        <span>{format(new Date(s.createdAt), 'MMM d, yyyy HH:mm')}</span>
                        {project && (
                          <span className="flex items-center gap-1"><FolderOpen className="h-3 w-3" />{project.name}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => exportAsText(s)} title="Copy as text">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => exportAsJson(s)} title="Export JSON">
                        <FileJson className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => removeSession(s.id)} title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-mono text-muted-foreground">
                    <span>DB: {display.dryBulb.toFixed(1)}{s.unitSystem === 'ip' ? '°F' : '°C'}</span>
                    <span>RH: {display.relativeHumidity.toFixed(1)}%</span>
                    <span>DP: {display.dewPoint.toFixed(1)}{s.unitSystem === 'ip' ? '°F' : '°C'}</span>
                    <span>h: {display.enthalpy.toFixed(1)} {s.unitSystem === 'ip' ? 'BTU/lb' : 'kJ/kg'}</span>
                  </div>

                  {s.notes && <p className="text-xs text-muted-foreground italic truncate">{s.notes}</p>}

                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => onLoadSession(s)}>
                    Load into calculator
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
