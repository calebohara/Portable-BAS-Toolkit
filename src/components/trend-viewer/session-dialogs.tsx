'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, BarChart3 } from 'lucide-react';
import type { TrendSession, TrendSourceSystem } from '@/types';
import { TREND_SOURCE_SYSTEM_LABELS } from '@/types';

// ─── Save Dialog ─────────────────────────────────────────────

interface SessionSaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (metadata: { name: string; description: string; sourceSystem: TrendSourceSystem; projectId: string }) => void;
  defaultName?: string;
}

export function SessionSaveDialog({ open, onOpenChange, onSave, defaultName }: SessionSaveDialogProps) {
  const [name, setName] = useState(defaultName || `Trend ${format(new Date(), 'MMM d HH:mm')}`);
  const [description, setDescription] = useState('');
  const [sourceSystem, setSourceSystem] = useState<TrendSourceSystem>('generic');

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), description: description.trim(), sourceSystem, projectId: '' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save Trend Session</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div>
            <Label className="text-xs">Session Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" placeholder="e.g., AHU-1 Supply Temps" />
          </div>
          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} className="mt-1" placeholder="e.g., Debugging hunting loop on 3rd floor" />
          </div>
          <div>
            <Label className="text-xs">Source System</Label>
            <Select value={sourceSystem} onValueChange={v => v && setSourceSystem(v as TrendSourceSystem)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TREND_SOURCE_SYSTEM_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim()}>Save Session</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Load Dialog ─────────────────────────────────────────────

interface SessionLoadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: TrendSession[];
  onLoad: (session: TrendSession) => void;
  onDelete: (id: string) => void;
}

export function SessionLoadDialog({ open, onOpenChange, sessions, onLoad, onDelete }: SessionLoadDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Open Saved Session</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <BarChart3 className="h-8 w-8" />
              <p className="text-sm">No saved sessions yet</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-80 overflow-auto">
              {sessions.map(session => (
                <div key={session.id} className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-muted/50 transition-colors group">
                  <button
                    className="flex-1 text-left min-w-0"
                    onClick={() => { onLoad(session); onOpenChange(false); }}
                  >
                    <p className="text-sm font-medium truncate">{session.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {session.series.length} series, {session.data.length.toLocaleString()} points
                      {' — '}
                      {TREND_SOURCE_SYSTEM_LABELS[session.sourceSystem]}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Saved {format(new Date(session.updatedAt), 'MMM d, yyyy HH:mm')}
                    </p>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-field-danger"
                    onClick={() => onDelete(session.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
