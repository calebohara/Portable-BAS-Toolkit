'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { copyToClipboard } from '@/lib/utils';
import { toast } from 'sonner';
import type { CreateGlobalProjectData, GlobalProject } from '@/types/global-projects';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: CreateGlobalProjectData) => Promise<GlobalProject>;
}

export function CreateGlobalProjectDialog({ open, onOpenChange, onCreate }: Props) {
  const [saving, setSaving] = useState(false);
  const [createdProject, setCreatedProject] = useState<GlobalProject | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    name: '',
    jobSiteName: '',
    siteAddress: '',
    buildingArea: '',
    projectNumber: '',
    description: '',
  });

  const resetForm = () => {
    setForm({ name: '', jobSiteName: '', siteAddress: '', buildingArea: '', projectNumber: '', description: '' });
    setCreatedProject(null);
    setCopied(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.jobSiteName.trim()) return;
    setSaving(true);
    try {
      const project = await onCreate({
        name: form.name.trim(),
        jobSiteName: form.jobSiteName.trim(),
        siteAddress: form.siteAddress.trim() || undefined,
        buildingArea: form.buildingArea.trim() || undefined,
        projectNumber: form.projectNumber.trim() || undefined,
        description: form.description.trim() || undefined,
      });
      setCreatedProject(project);
      toast.success('Global project created');
    } catch {
      toast.error('Failed to create project');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyCode = async () => {
    if (!createdProject) return;
    try {
      await copyToClipboard(createdProject.accessCode);
      setCopied(true);
      toast.success('Access code copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const updateField = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  // Success state
  if (createdProject) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Project Created</DialogTitle>
            <DialogDescription>
              Share this access code with team members so they can join the project.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="px-5 py-4 space-y-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Access Code</p>
              <div className="flex items-center justify-center gap-2">
                <code className="rounded-lg bg-muted px-4 py-2 text-lg font-mono font-bold tracking-widest">
                  {createdProject.accessCode}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={handleCopyCode}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Project: <strong>{createdProject.name}</strong>
            </p>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Form state
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Global Project</DialogTitle>
          <DialogDescription>Create a shared project that team members can join with an access code.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1" style={{ minHeight: 0 }}>
          <DialogBody className="space-y-4 px-5 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="gp-name">Project Name *</Label>
                <Input id="gp-name" placeholder="e.g. AHU Controls Upgrade" value={form.name} onChange={(e) => updateField('name', e.target.value)} required />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="gp-jobSite">Job Site Name *</Label>
                <Input id="gp-jobSite" placeholder="e.g. Memorial Hospital" value={form.jobSiteName} onChange={(e) => updateField('jobSiteName', e.target.value)} required />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="gp-address">Site Address</Label>
                <Input id="gp-address" placeholder="e.g. 3501 Johnson St, Hollywood, FL" value={form.siteAddress} onChange={(e) => updateField('siteAddress', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gp-area">Building / Area</Label>
                <Input id="gp-area" placeholder="e.g. Central Plant" value={form.buildingArea} onChange={(e) => updateField('buildingArea', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gp-number">Project Number</Label>
                <Input id="gp-number" placeholder="e.g. 44OP-001234" value={form.projectNumber} onChange={(e) => updateField('projectNumber', e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="gp-description">Description</Label>
                <Textarea id="gp-description" placeholder="Brief description of the project scope..." value={form.description} onChange={(e) => updateField('description', e.target.value)} rows={3} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.name.trim() || !form.jobSiteName.trim()}>
              {saving ? 'Creating...' : 'Create Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
