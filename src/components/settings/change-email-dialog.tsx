'use client';

import { useState, useCallback } from 'react';
import { Mail, RefreshCw, CheckCircle2, AlertTriangle, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog';

type Phase = 'form' | 'saving' | 'success' | 'error';

interface ChangeEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmail: string;
  updateEmail: (newEmail: string) => Promise<{ error: { message: string } | null }>;
}

export function ChangeEmailDialog({ open, onOpenChange, currentEmail, updateEmail }: ChangeEmailDialogProps) {
  const [phase, setPhase] = useState<Phase>('form');
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState('');

  const handleOpenChange = useCallback((next: boolean) => {
    if (phase === 'saving') return;
    if (!next) {
      setTimeout(() => {
        setPhase('form');
        setNewEmail('');
        setError('');
      }, 200);
    }
    onOpenChange(next);
  }, [phase, onOpenChange]);

  const handleSubmit = useCallback(async () => {
    setError('');

    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed) {
      setError('Email address is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address');
      return;
    }
    if (trimmed === currentEmail.toLowerCase()) {
      setError('New email must be different from your current email');
      return;
    }

    setPhase('saving');
    try {
      const { error: err } = await updateEmail(trimmed);
      if (err) {
        setError(err.message);
        setPhase('error');
      } else {
        setPhase('success');
      }
    } catch {
      setError('An unexpected error occurred');
      setPhase('error');
    }
  }, [newEmail, currentEmail, updateEmail]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={phase !== 'saving'} className="sm:max-w-md">
        {/* ── Form ── */}
        {phase === 'form' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <DialogTitle className="text-center">Change Email</DialogTitle>
              <DialogDescription className="text-center">
                Enter your new email address. A confirmation link will be sent to both your current and new email.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="space-y-4">
                <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">Current email</p>
                  <p className="text-sm font-medium">{currentEmail}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-email" className="text-xs">New Email</Label>
                  <Input
                    id="new-email"
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="new@example.com"
                    autoComplete="email"
                    className="h-9"
                    onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
                  />
                </div>
                {error && (
                  <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSubmit} className="gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Update Email
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Saving ── */}
        {phase === 'saving' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-6 w-6 text-primary animate-pulse" />
              </div>
              <DialogTitle className="text-center">Updating email&hellip;</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <div className="flex justify-center py-4">
                <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin" />
              </div>
            </DialogBody>
            <DialogFooter />
          </>
        )}

        {/* ── Success ── */}
        {phase === 'success' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-field-success/10 animate-in zoom-in duration-300">
                <MailCheck className="h-6 w-6 text-field-success" />
              </div>
              <DialogTitle className="text-center">Confirmation Sent</DialogTitle>
              <DialogDescription className="text-center">
                A confirmation link has been sent to <strong className="text-foreground">{newEmail.trim().toLowerCase()}</strong>.
                Click the link in the email to complete the change. Your email won&apos;t update until you confirm.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}

        {/* ── Error ── */}
        {phase === 'error' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-field-warning/10">
                <AlertTriangle className="h-6 w-6 text-field-warning" />
              </div>
              <DialogTitle className="text-center">Email Change Failed</DialogTitle>
              <DialogDescription className="text-center">
                {error || 'Something went wrong.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setPhase('form'); setError(''); }}>Try Again</Button>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
