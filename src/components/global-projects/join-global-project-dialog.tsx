'use client';

import { useState } from 'react';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
interface JoinResult {
  projectId: string;
  projectName: string;
  role: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJoin: (code: string) => Promise<JoinResult | { error: string }>;
  onNavigate: (id: string) => void;
}

export function JoinGlobalProjectDialog({ open, onOpenChange, onJoin, onNavigate }: Props) {
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  const resetForm = () => {
    setCode('');
    setError('');
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setJoining(true);
    setError('');
    try {
      const result = await onJoin(trimmed);
      if (result && 'error' in result && result.error) {
        setError(result.error);
      } else if ('projectId' in result) {
        toast.success(`Joined "${result.projectName}"`);
        handleOpenChange(false);
        onNavigate(result.projectId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join project. Check your access code and try again.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Join Global Project</DialogTitle>
          <DialogDescription>Enter the access code shared by your project admin to join.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1" style={{ minHeight: 0 }}>
          <DialogBody className="px-5 py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="access-code">Access Code</Label>
              <Input
                id="access-code"
                placeholder="ABC-1234"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setError('');
                }}
                className="font-mono text-center text-lg tracking-widest"
                autoComplete="off"
                autoFocus
                required
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={joining || !code.trim()}>
              {joining ? 'Joining...' : 'Join Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
