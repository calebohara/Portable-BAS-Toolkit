'use client';

import { useState, useCallback } from 'react';
import { KeyRound, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog';

type Phase = 'form' | 'saving' | 'success' | 'error';

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updatePassword: (newPassword: string) => Promise<{ error: { message: string } | null }>;
}

export function ChangePasswordDialog({ open, onOpenChange, updatePassword }: ChangePasswordDialogProps) {
  const [phase, setPhase] = useState<Phase>('form');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleOpenChange = useCallback((next: boolean) => {
    if (phase === 'saving') return;
    if (!next) {
      setTimeout(() => {
        setPhase('form');
        setNewPassword('');
        setConfirmPassword('');
        setError('');
      }, 200);
    }
    onOpenChange(next);
  }, [phase, onOpenChange]);

  const handleSubmit = useCallback(async () => {
    setError('');

    if (!newPassword.trim()) {
      setError('New password is required');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setPhase('saving');
    try {
      const { error: err } = await updatePassword(newPassword);
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
  }, [newPassword, confirmPassword, updatePassword]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={phase !== 'saving'} className="sm:max-w-md">
        {/* ── Form ── */}
        {phase === 'form' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <KeyRound className="h-6 w-6 text-primary" />
              </div>
              <DialogTitle className="text-center">Change Password</DialogTitle>
              <DialogDescription className="text-center">
                Enter a new password for your account. Must be at least 6 characters.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-pw" className="text-xs">New Password</Label>
                  <Input
                    id="new-pw"
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="New password"
                    autoComplete="new-password"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-pw" className="text-xs">Confirm Password</Label>
                  <Input
                    id="confirm-pw"
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    autoComplete="new-password"
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
                <KeyRound className="h-3.5 w-3.5" /> Update Password
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Saving ── */}
        {phase === 'saving' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <KeyRound className="h-6 w-6 text-primary animate-pulse" />
              </div>
              <DialogTitle className="text-center">Updating password&hellip;</DialogTitle>
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
                <CheckCircle2 className="h-6 w-6 text-field-success" />
              </div>
              <DialogTitle className="text-center">Password Updated</DialogTitle>
              <DialogDescription className="text-center">
                Your password has been changed successfully.
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
              <DialogTitle className="text-center">Password Change Failed</DialogTitle>
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
