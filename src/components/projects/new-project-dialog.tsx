'use client';

import { useState } from 'react';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Project, ProjectStatus } from '@/types';

type CreateData = Omit<Project, 'id' | 'createdAt' | 'updatedAt'>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: CreateData) => Promise<void>;
}

export function NewProjectDialog({ open, onOpenChange, onCreate }: Props) {
  const [saving, setSaving] = useState(false);
  const [pnWarning, setPnWarning] = useState('');
  const [form, setForm] = useState({
    name: '',
    customerName: '',
    siteAddress: '',
    buildingArea: '',
    projectNumber: '44OP-',
    technicianNotes: '',
    tags: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.projectNumber.trim()) return;
    setSaving(true);
    try {
      await onCreate({
        name: form.name.trim(),
        customerName: form.customerName.trim(),
        siteAddress: form.siteAddress.trim(),
        buildingArea: form.buildingArea.trim(),
        projectNumber: form.projectNumber.trim(),
        technicianNotes: form.technicianNotes.trim(),
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        status: 'active' as ProjectStatus,
        contacts: [],
        isPinned: false,
        isOfflineAvailable: false,
      });
      setForm({ name: '', customerName: '', siteAddress: '', buildingArea: '', projectNumber: '44OP-', technicianNotes: '', tags: '' });
      setPnWarning('');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New BAS Project</DialogTitle>
          <DialogDescription>Create a new project container for your BAS field work.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1" style={{ minHeight: 0 }}>
          <DialogBody className="space-y-4 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Project Name *</Label>
              <Input id="name" placeholder="e.g. AHU-1/2 Controls Upgrade" value={form.name} onChange={(e) => updateField('name', e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectNumber">Project Number *</Label>
              <Input id="projectNumber" placeholder="e.g. 44OP-001234" value={form.projectNumber} onChange={(e) => updateField('projectNumber', e.target.value)} onBlur={() => { const pn = form.projectNumber.trim(); if (pn && !/^44OP-\d{6}$/.test(pn)) setPnWarning('Expected format: 44OP-XXXXXX'); else setPnWarning(''); }} required />
              {pnWarning && <p className="text-xs text-amber-500">{pnWarning}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerName">Customer / Site</Label>
              <Input id="customerName" placeholder="e.g. Memorial Hospital" value={form.customerName} onChange={(e) => updateField('customerName', e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="siteAddress">Site Address</Label>
              <Input id="siteAddress" placeholder="e.g. 3501 Johnson St, Hollywood, FL" value={form.siteAddress} onChange={(e) => updateField('siteAddress', e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="buildingArea">Building / Area / System</Label>
              <Input id="buildingArea" placeholder="e.g. Central Plant / Mech Room 104" value={form.buildingArea} onChange={(e) => updateField('buildingArea', e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="tags">Tags (comma separated)</Label>
              <Input id="tags" placeholder="e.g. healthcare, ahu, retrofit" value={form.tags} onChange={(e) => updateField('tags', e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="technicianNotes">Technician Notes</Label>
              <Textarea id="technicianNotes" placeholder="Any initial notes about this project..." value={form.technicianNotes} onChange={(e) => updateField('technicianNotes', e.target.value)} rows={3} />
            </div>
          </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.name.trim() || !form.projectNumber.trim()}>
              {saving ? 'Creating...' : 'Create Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
