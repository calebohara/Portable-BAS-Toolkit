'use client';

import { useState, useCallback } from 'react';
import { Bug } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { APP_VERSION } from '@/lib/version';
import { saveBugReport } from '@/lib/db';
import { useDeviceClass } from '@/hooks/use-device-class';
import { useAppStore } from '@/store/app-store';
import type { BugReportSeverity } from '@/types';

interface BugReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Friendly page/tool name, auto-filled from TopBar title */
  pageTitle?: string;
}

const SEVERITY_OPTIONS: { value: BugReportSeverity; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

export function BugReportDialog({ open, onOpenChange, pageTitle }: BugReportDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [severity, setSeverity] = useState<BugReportSeverity>('medium');
  const [submitting, setSubmitting] = useState(false);

  const { deviceClass, desktopOS } = useDeviceClass();
  const syncStatus = useAppStore((s) => s.syncStatus);

  const resetForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setStepsToReproduce('');
    setSeverity('medium');
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    if (submitting) return;
    if (!next) resetForm();
    onOpenChange(next);
  }, [submitting, resetForm, onOpenChange]);

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !description.trim()) return;

    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      await saveBugReport({
        id: crypto.randomUUID(),
        title: title.trim(),
        description: description.trim(),
        stepsToReproduce: stepsToReproduce.trim() || undefined,
        severity,
        status: 'open',
        appVersion: APP_VERSION,
        deviceClass,
        desktopOS,
        currentPage: pageTitle ? `${pageTitle} (${window.location.pathname})` : window.location.pathname,
        syncStatus,
        createdAt: now,
        updatedAt: now,
      });
      toast.success('Bug report submitted');
      resetForm();
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to save bug report:', err);
      toast.error('Failed to submit bug report');
    } finally {
      setSubmitting(false);
    }
  }, [title, description, stepsToReproduce, severity, deviceClass, desktopOS, syncStatus, resetForm, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Bug className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Report a Bug</DialogTitle>
          <DialogDescription className="text-center">
            Describe the issue you encountered. Device and app info will be captured automatically.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4 px-5 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="bug-title">Title</Label>
              <Input
                id="bug-title"
                placeholder="Brief summary of the issue"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bug-description">Description</Label>
              <Textarea
                id="bug-description"
                placeholder="What happened? What did you expect?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                disabled={submitting}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bug-steps">Steps to Reproduce (optional)</Label>
              <Textarea
                id="bug-steps"
                placeholder="1. Go to...&#10;2. Click on...&#10;3. See error"
                value={stepsToReproduce}
                onChange={(e) => setStepsToReproduce(e.target.value)}
                rows={3}
                disabled={submitting}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={(val) => setSeverity(val as BugReportSeverity)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || !description.trim()}
            className="gap-1.5"
          >
            <Bug className="h-3.5 w-3.5" />
            {submitting ? 'Submitting...' : 'Submit Report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
