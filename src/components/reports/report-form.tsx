'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Save, Clock, MapPin, CloudSun, Wrench,
  AlertTriangle, CalendarCheck, Users, Shield, StickyNote,
  Paperclip, X, FileText, ArrowLeft, Send, Lock, Loader2,
} from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { saveFileBlob } from '@/lib/db';
import { TopBar } from '@/components/layout/top-bar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { formatFileSize } from '@/components/shared/file-icon';
import { v4 as uuid } from 'uuid';
import { navigateToReport } from '@/lib/routes';
import type { DailyReport, ReportAttachment, ReportStatus } from '@/types';

interface ReportFormProps {
  initial?: DailyReport;
  onSave: (data: Omit<DailyReport, 'id' | 'createdAt' | 'updatedAt' | 'reportNumber'>) => Promise<DailyReport>;
  onUpdate?: (report: DailyReport) => Promise<void>;
  mode: 'create' | 'edit';
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function nowTime() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function ReportForm({ initial, onSave, onUpdate, mode }: ReportFormProps) {
  const router = useRouter();
  const { projects } = useProjects();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Form state
  const [projectId, setProjectId] = useState(initial?.projectId || '');
  const [date, setDate] = useState(initial?.date || today());
  const [technicianName, setTechnicianName] = useState(initial?.technicianName || '');
  const [status, setStatus] = useState<ReportStatus>(initial?.status || 'draft');
  const [startTime, setStartTime] = useState(initial?.startTime || '');
  const [endTime, setEndTime] = useState(initial?.endTime || '');
  const [hoursOnSite, setHoursOnSite] = useState(initial?.hoursOnSite || '');
  const [location, setLocation] = useState(initial?.location || '');
  const [weather, setWeather] = useState(initial?.weather || '');

  const [workCompleted, setWorkCompleted] = useState(initial?.workCompleted || '');
  const [issuesEncountered, setIssuesEncountered] = useState(initial?.issuesEncountered || '');
  const [workPlannedNext, setWorkPlannedNext] = useState(initial?.workPlannedNext || '');
  const [coordinationNotes, setCoordinationNotes] = useState(initial?.coordinationNotes || '');
  const [equipmentWorkedOn, setEquipmentWorkedOn] = useState(initial?.equipmentWorkedOn || '');
  const [deviceIpChanges, setDeviceIpChanges] = useState(initial?.deviceIpChanges || '');
  const [safetyNotes, setSafetyNotes] = useState(initial?.safetyNotes || '');
  const [generalNotes, setGeneralNotes] = useState(initial?.generalNotes || '');

  const [attachments, setAttachments] = useState<ReportAttachment[]>(initial?.attachments || []);

  const isReadOnly = initial?.status === 'finalized' && mode === 'edit';

  // Autosave (drafts only, every 30s)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const autosave = useCallback(async () => {
    if (!initial || !onUpdate || status !== 'draft') return;
    const report: DailyReport = {
      ...initial,
      projectId, date, technicianName, status,
      startTime, endTime, hoursOnSite, location, weather,
      workCompleted, issuesEncountered, workPlannedNext,
      coordinationNotes, equipmentWorkedOn, deviceIpChanges,
      safetyNotes, generalNotes, attachments,
      updatedAt: new Date().toISOString(),
    };
    await onUpdate(report);
    setLastSaved(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
  }, [initial, onUpdate, projectId, date, technicianName, status, startTime, endTime, hoursOnSite, location, weather, workCompleted, issuesEncountered, workPlannedNext, coordinationNotes, equipmentWorkedOn, deviceIpChanges, safetyNotes, generalNotes, attachments]);

  useEffect(() => {
    if (mode !== 'edit' || status !== 'draft') return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(autosave, 30000);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [mode, status, autosave]);

  // Auto-calculate hours
  useEffect(() => {
    if (startTime && endTime) {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
        const diff = (eh * 60 + em) - (sh * 60 + sm);
        if (diff > 0) setHoursOnSite((diff / 60).toFixed(1));
      }
    }
  }, [startTime, endTime]);

  const handleAttachFiles = async (fileList: FileList) => {
    const maxSize = 100 * 1024 * 1024; // 100MB
    const newAttachments: ReportAttachment[] = [];
    for (const file of Array.from(fileList)) {
      if (file.size > maxSize) continue;
      const blobKey = uuid();
      await saveFileBlob(blobKey, file);
      newAttachments.push({
        id: uuid(),
        fileName: file.name,
        fileType: file.name.split('.').pop() || '',
        mimeType: file.type,
        size: file.size,
        blobKey,
      });
    }
    setAttachments(prev => [...prev, ...newAttachments]);
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSubmit = async (submitStatus?: ReportStatus) => {
    if (!projectId) return;
    setSaving(true);
    try {
      const finalStatus = submitStatus || status;
      const data = {
        projectId, date, technicianName, status: finalStatus,
        startTime, endTime, hoursOnSite, location, weather,
        workCompleted, issuesEncountered, workPlannedNext,
        coordinationNotes, equipmentWorkedOn, deviceIpChanges,
        safetyNotes, generalNotes, attachments,
      };

      if (mode === 'create') {
        const report = await onSave(data as Omit<DailyReport, 'id' | 'createdAt' | 'updatedAt' | 'reportNumber'>);
        navigateToReport(router, report.id);
      } else if (initial && onUpdate) {
        await onUpdate({ ...initial, ...data, updatedAt: new Date().toISOString() });
        navigateToReport(router, initial.id);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <TopBar title={mode === 'create' ? 'New Daily Report' : `Edit Report #${initial?.reportNumber || ''}`} />
      <div className="p-4 md:p-6 max-w-3xl space-y-6 pb-24">
        {/* Back button */}
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        {isReadOnly && (
          <div className="flex items-center gap-2 rounded-lg bg-field-warning/10 p-3 text-sm text-field-warning">
            <Lock className="h-4 w-4" />
            This report is finalized and read-only. Change status to edit.
          </div>
        )}

        {/* ── Report Header ── */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Report Header
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label htmlFor="project">Project *</Label>
              <Select value={projectId} onValueChange={(v) => v && setProjectId(v)} disabled={isReadOnly}>
                <SelectTrigger className="w-full mt-1.5">
                  <SelectValue placeholder="Select a project..." />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.projectNumber})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} disabled={isReadOnly} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="technician">Technician Name</Label>
              <Input id="technician" value={technicianName} onChange={e => setTechnicianName(e.target.value)} placeholder="Your name" disabled={isReadOnly} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(v) => v && setStatus(v as ReportStatus)}>
                <SelectTrigger className="w-full mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="finalized">Finalized</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* ── Time & Location ── */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Time &amp; Location
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="start-time">Start Time</Label>
              <Input id="start-time" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} disabled={isReadOnly} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="end-time">End Time</Label>
              <Input id="end-time" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} disabled={isReadOnly} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="hours">Hours On Site</Label>
              <Input id="hours" value={hoursOnSite} onChange={e => setHoursOnSite(e.target.value)} placeholder="8.0" disabled={isReadOnly} className="mt-1.5" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="location" className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> Location / Building / Area</Label>
              <Input id="location" value={location} onChange={e => setLocation(e.target.value)} placeholder="Building A, Floor 3 — MER Room" disabled={isReadOnly} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="weather" className="flex items-center gap-1.5"><CloudSun className="h-3 w-3" /> Weather</Label>
              <Input id="weather" value={weather} onChange={e => setWeather(e.target.value)} placeholder="Clear, 72°F" disabled={isReadOnly} className="mt-1.5" />
            </div>
          </div>
        </section>

        {/* ── Work Summary ── */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-primary" /> Work Summary
          </h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="work-completed">Work Completed</Label>
              <Textarea id="work-completed" value={workCompleted} onChange={e => setWorkCompleted(e.target.value)} placeholder="Describe work completed today..." rows={4} disabled={isReadOnly} className="mt-1.5 resize-y" />
            </div>
            <div>
              <Label htmlFor="issues" className="flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 text-field-warning" /> Issues Encountered</Label>
              <Textarea id="issues" value={issuesEncountered} onChange={e => setIssuesEncountered(e.target.value)} placeholder="Any problems, blockers, or concerns..." rows={3} disabled={isReadOnly} className="mt-1.5 resize-y" />
            </div>
            <div>
              <Label htmlFor="planned-next">Work Planned Next</Label>
              <Textarea id="planned-next" value={workPlannedNext} onChange={e => setWorkPlannedNext(e.target.value)} placeholder="Upcoming tasks and priorities..." rows={3} disabled={isReadOnly} className="mt-1.5 resize-y" />
            </div>
          </div>
        </section>

        {/* ── Systems / Equipment ── */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" /> Systems / Equipment
          </h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="equipment">Equipment / Systems Worked On</Label>
              <Textarea id="equipment" value={equipmentWorkedOn} onChange={e => setEquipmentWorkedOn(e.target.value)} placeholder="AHU-1, VAV-301, Chiller Plant Controller..." rows={3} disabled={isReadOnly} className="mt-1.5 resize-y" />
            </div>
            <div>
              <Label htmlFor="device-ip">Devices / IP Changes</Label>
              <Textarea id="device-ip" value={deviceIpChanges} onChange={e => setDeviceIpChanges(e.target.value)} placeholder="IP assignments, controller firmware updates, MAC changes..." rows={3} disabled={isReadOnly} className="mt-1.5 resize-y" />
            </div>
          </div>
        </section>

        {/* ── Coordination ── */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Coordination
          </h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="coordination">Coordination Notes</Label>
              <Textarea id="coordination" value={coordinationNotes} onChange={e => setCoordinationNotes(e.target.value)} placeholder="Communication with other trades, GC, customer..." rows={3} disabled={isReadOnly} className="mt-1.5 resize-y" />
            </div>
            <div>
              <Label htmlFor="safety" className="flex items-center gap-1.5"><Shield className="h-3 w-3 text-field-success" /> Safety Notes</Label>
              <Textarea id="safety" value={safetyNotes} onChange={e => setSafetyNotes(e.target.value)} placeholder="Safety observations, PPE, hazards..." rows={2} disabled={isReadOnly} className="mt-1.5 resize-y" />
            </div>
          </div>
        </section>

        {/* ── Additional Notes ── */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-primary" /> Additional Notes
          </h2>
          <Textarea value={generalNotes} onChange={e => setGeneralNotes(e.target.value)} placeholder="Any additional notes, observations, or follow-ups..." rows={3} disabled={isReadOnly} className="resize-y" />
        </section>

        {/* ── Attachments ── */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-primary" /> Attachments
          </h2>
          {attachments.length > 0 && (
            <div className="space-y-1.5">
              {attachments.map(a => (
                <div key={a.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate flex-1">{a.fileName}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(a.size)}</span>
                  {!isReadOnly && (
                    <button onClick={() => removeAttachment(a.id)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {!isReadOnly && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => { if (e.target.files) handleAttachFiles(e.target.files); e.target.value = ''; }}
              />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5">
                <Paperclip className="h-3.5 w-3.5" /> Attach Files
              </Button>
            </>
          )}
        </section>

        {/* ── Actions ── */}
        <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t border-border -mx-4 px-4 py-3 md:-mx-6 md:px-6 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {lastSaved && `Saved ${lastSaved}`}
          </div>
          <div className="flex items-center gap-2">
            {!isReadOnly && (
              <>
                <Button variant="outline" onClick={() => handleSubmit('draft')} disabled={saving || !projectId} className="gap-1.5">
                  <Save className="h-4 w-4" /> Save Draft
                </Button>
                <Button onClick={() => handleSubmit('submitted')} disabled={saving || !projectId} className="gap-1.5">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {mode === 'create' ? 'Submit' : 'Save'}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
