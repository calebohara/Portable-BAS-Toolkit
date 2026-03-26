'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useProjects } from '@/hooks/use-projects';
import { useRegisterCalculations } from '@/hooks/use-register-calculations';
import type { RegisterToolModule, SavedCalcCategory } from '@/types';
import { SAVED_CALC_CATEGORY_LABELS } from '@/types';

export function SaveDialog({ open, onOpenChange, activeModule }: {
  open: boolean; onOpenChange: (o: boolean) => void; activeModule: string;
}) {
  const { projects } = useProjects();
  const { addCalculation } = useRegisterCalculations();
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [projectId, setProjectId] = useState('');
  const [category, setCategory] = useState<SavedCalcCategory>('general');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!label.trim()) { toast.error('Label is required'); return; }
    setSaving(true);
    try {
      await addCalculation({
        label: label.trim(),
        module: activeModule as RegisterToolModule,
        category,
        inputs: {},
        result: {},
        notes,
        tags: [],
        projectId: projectId || '',
      });
      toast.success('Calculation saved');
      onOpenChange(false);
      setLabel('');
      setNotes('');
      setProjectId('');
      setCategory('general');
    } catch {
      toast.error('Failed to save');
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Calculation</DialogTitle>
          <DialogDescription>Save this calculation for later reference or attach it to a project.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Label</Label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Yaskawa speed feedback decode" className="h-8 text-xs" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Select value={category} onValueChange={v => v && setCategory(v as SavedCalcCategory)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SAVED_CALC_CATEGORY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Project (optional)</Label>
                <Select value={projectId || '_none'} onValueChange={v => v && setProjectId(v === '_none' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="No project" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">No project</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.projectNumber} — {p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. ABB status word bit 7 = run enable"
                className="w-full rounded-lg border border-border bg-background p-2 text-xs resize-y min-h-[60px] outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
