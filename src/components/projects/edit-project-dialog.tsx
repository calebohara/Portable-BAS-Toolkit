'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { Project, ProjectStatus } from '@/types';
import { PROJECT_STATUS_LABELS } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  onSave: (data: Partial<Project>) => Promise<void>;
}

const statusOptions: ProjectStatus[] = ['active', 'on-hold', 'completed', 'archived'];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-2 pb-1 border-b border-border/50 sm:col-span-2">
      {children}
    </p>
  );
}

export function EditProjectDialog({ open, onOpenChange, project, onSave }: Props) {
  const [saving, setSaving] = useState(false);
  const [pnWarning, setPnWarning] = useState('');
  const [form, setForm] = useState({
    name: '',
    projectNumber: '',
    customerName: '',
    siteAddress: '',
    buildingArea: '',
    status: 'active' as ProjectStatus,
    tags: '',
    panelRosterSummary: '',
    networkSummary: '',
    technicianNotes: '',
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: project.name,
        projectNumber: project.projectNumber,
        customerName: project.customerName,
        siteAddress: project.siteAddress,
        buildingArea: project.buildingArea,
        status: project.status,
        tags: project.tags.join(', '),
        panelRosterSummary: project.panelRosterSummary || '',
        networkSummary: project.networkSummary || '',
        technicianNotes: project.technicianNotes,
      });
      setPnWarning('');
    }
  }, [open, project]);

  const validateProjectNumber = (pn: string) => {
    if (!pn || /^44OP-\d{6}$/.test(pn)) {
      setPnWarning('');
    } else {
      setPnWarning('Expected format: 44OP-XXXXXX');
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.name.trim() || !form.projectNumber.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        projectNumber: form.projectNumber.trim(),
        customerName: form.customerName.trim(),
        siteAddress: form.siteAddress.trim(),
        buildingArea: form.buildingArea.trim(),
        status: form.status,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        panelRosterSummary: form.panelRosterSummary.trim() || undefined,
        networkSummary: form.networkSummary.trim() || undefined,
        technicianNotes: form.technicianNotes.trim(),
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const u = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Project Details</DialogTitle>
          <DialogDescription>Update project information and metadata.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="px-5 pb-1">
          <div className="grid gap-3 sm:grid-cols-2">
            {/* — Project Info — */}
            <SectionLabel>Project Info</SectionLabel>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ep-name">Project Name *</Label>
              <Input id="ep-name" value={form.name} onChange={e => u('name', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-pn">Project Number *</Label>
              <Input id="ep-pn" placeholder="e.g. 44OP-001234" value={form.projectNumber} onChange={e => u('projectNumber', e.target.value)} onBlur={() => validateProjectNumber(form.projectNumber)} required />
              {pnWarning && <p className="text-xs text-field-warning">{pnWarning}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-status">Status</Label>
              <Select value={form.status} onValueChange={v => v && u('status', v)}>
                <SelectTrigger id="ep-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map(s => (
                    <SelectItem key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ep-tags">Tags</Label>
              <Input id="ep-tags" placeholder="comma separated — e.g. healthcare, ahu, retrofit" value={form.tags} onChange={e => u('tags', e.target.value)} />
            </div>

            {/* — Site / Location — */}
            <SectionLabel>Site / Location</SectionLabel>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ep-customer">Customer / Site</Label>
              <Input id="ep-customer" value={form.customerName} onChange={e => u('customerName', e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ep-address">Site Address</Label>
              <Input id="ep-address" value={form.siteAddress} onChange={e => u('siteAddress', e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ep-building">Building / Area / System</Label>
              <Input id="ep-building" value={form.buildingArea} onChange={e => u('buildingArea', e.target.value)} />
            </div>

            {/* — BAS Context & Notes — */}
            <SectionLabel>BAS Context</SectionLabel>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ep-panels">Panel Roster</Label>
              <Textarea id="ep-panels" placeholder="e.g. PXC36-AHU1, PXC36-AHU2, PXC100-Main..." value={form.panelRosterSummary} onChange={e => u('panelRosterSummary', e.target.value)} rows={2} className="resize-none" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ep-network">Network Summary</Label>
              <Textarea id="ep-network" placeholder="e.g. BACnet/IP on VLAN 100, subnet 10.40.1.0/24..." value={form.networkSummary} onChange={e => u('networkSummary', e.target.value)} rows={2} className="resize-none" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ep-notes">Technician Notes</Label>
              <Textarea id="ep-notes" placeholder="Project-level notes..." value={form.technicianNotes} onChange={e => u('technicianNotes', e.target.value)} rows={3} className="resize-none" />
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !form.name.trim() || !form.projectNumber.trim()}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
