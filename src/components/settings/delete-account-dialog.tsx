'use client';

import { useState, useCallback } from 'react';
import { Trash2, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import { clearAllData } from '@/lib/db';

type Phase = 'warn' | 'confirm' | 'deleting' | 'success' | 'error';

const CONFIRM_TEXT = 'DELETE';

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userEmail: string;
  accessToken: string | undefined;
  onDeleted: () => Promise<void>;
}

export function DeleteAccountDialog({
  open, onOpenChange, userEmail, accessToken, onDeleted,
}: DeleteAccountDialogProps) {
  const [phase, setPhase] = useState<Phase>('warn');
  const [confirmInput, setConfirmInput] = useState('');
  const [error, setError] = useState('');

  const handleOpenChange = useCallback((next: boolean) => {
    if (phase === 'deleting') return;
    if (!next) {
      setTimeout(() => {
        setPhase('warn');
        setConfirmInput('');
        setError('');
      }, 200);
    }
    onOpenChange(next);
  }, [phase, onOpenChange]);

  const handleDelete = useCallback(async () => {
    if (confirmInput !== CONFIRM_TEXT) return;

    setPhase('deleting');
    setError('');

    try {
      // 1. Call server API to delete cloud data + auth account
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ confirmation: CONFIRM_TEXT }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Account deletion failed');
        setPhase('error');
        return;
      }

      // 2. Clear all local IndexedDB data
      try {
        await clearAllData();
      } catch {
        // Non-fatal — local data will be orphaned but account is deleted
      }

      // 3. Clear local storage
      try {
        localStorage.clear();
      } catch {
        // Non-fatal
      }

      setPhase('success');

      // 4. Sign out and redirect after brief delay
      setTimeout(async () => {
        await onDeleted();
        window.location.replace('/');
      }, 2000);
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setPhase('error');
    }
  }, [confirmInput, accessToken, onDeleted]);

  const isConfirmValid = confirmInput === CONFIRM_TEXT;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={phase !== 'deleting'} className="sm:max-w-md">
        {/* ── Warning ── */}
        {phase === 'warn' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <Trash2 className="h-6 w-6 text-destructive" />
              </div>
              <DialogTitle className="text-center">Delete Account</DialogTitle>
              <DialogDescription className="text-center">
                This will permanently delete your account and all associated data. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="space-y-3">
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3.5 text-xs space-y-2">
                  <p className="font-semibold text-destructive">The following will be permanently deleted:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Your account and sign-in credentials</li>
                    <li>All cloud-synced project data</li>
                    <li>Your user profile</li>
                    <li>All local data on this device</li>
                  </ul>
                </div>
                <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">Account</p>
                  <p className="text-sm font-medium">{userEmail}</p>
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button variant="destructive" onClick={() => setPhase('confirm')} className="gap-1.5">
                <Trash2 className="h-3.5 w-3.5" /> Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Confirm with typed input ── */}
        {phase === 'confirm' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <DialogTitle className="text-center">Confirm Account Deletion</DialogTitle>
              <DialogDescription className="text-center">
                Type <strong className="text-foreground font-mono">{CONFIRM_TEXT}</strong> below to permanently delete your account.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-delete" className="text-xs">
                    Type <span className="font-mono font-semibold">{CONFIRM_TEXT}</span> to confirm
                  </Label>
                  <Input
                    id="confirm-delete"
                    type="text"
                    value={confirmInput}
                    onChange={e => setConfirmInput(e.target.value)}
                    placeholder={CONFIRM_TEXT}
                    autoComplete="off"
                    spellCheck={false}
                    className="h-9 font-mono"
                    onKeyDown={e => { if (e.key === 'Enter' && isConfirmValid) handleDelete(); }}
                  />
                </div>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPhase('warn')}>Go Back</Button>
              <Button
                variant="destructive"
                disabled={!isConfirmValid}
                onClick={handleDelete}
                className="gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete My Account
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Deleting ── */}
        {phase === 'deleting' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <Trash2 className="h-6 w-6 text-destructive animate-pulse" />
              </div>
              <DialogTitle className="text-center">Deleting your account&hellip;</DialogTitle>
              <DialogDescription className="text-center">
                Removing all data. This may take a moment.
              </DialogDescription>
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
              <DialogTitle className="text-center">Account Deleted</DialogTitle>
              <DialogDescription className="text-center">
                Your account and all data have been removed. Redirecting&hellip;
              </DialogDescription>
            </DialogHeader>
            <DialogFooter />
          </>
        )}

        {/* ── Error ── */}
        {phase === 'error' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-field-warning/10">
                <AlertTriangle className="h-6 w-6 text-field-warning" />
              </div>
              <DialogTitle className="text-center">Deletion Failed</DialogTitle>
              <DialogDescription className="text-center">
                {error || 'Something went wrong.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setPhase('warn'); setError(''); setConfirmInput(''); }}>
                Try Again
              </Button>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
