'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Globe, Check, UserPlus, X, Search, Loader2, ExternalLink, AlertTriangle,
} from 'lucide-react';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { reconcileLocalToGlobal } from '@/lib/global-projects/reconcile';
import { navigateToGlobalProject } from '@/lib/routes';
import {
  searchUsersForSharing,
  shareProjectWithUsers,
  type SearchableUser,
} from '@/lib/global-projects/api';
import { useInbox } from '@/hooks/use-inbox';
import { useAuth } from '@/providers/auth-provider';
import type { Project } from '@/types';

interface ShareWithUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
}

type DialogState = 'preview' | 'sharing' | 'success';

interface ShareSummary {
  globalProjectId: string;
  added: number;
  alreadyMember: number;
  dmsSent: number;
  totalAttempted: number;
}

export function ShareWithUserDialog({
  open,
  onOpenChange,
  project,
}: ShareWithUserDialogProps) {
  const router = useRouter();
  const { profile, user } = useAuth();
  const { sendMessage } = useInbox();

  const [state, setState] = useState<DialogState>('preview');
  const [progressMessage, setProgressMessage] = useState('');
  const [result, setResult] = useState<ShareSummary | null>(null);

  // Search state
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchableUser[]>([]);
  const [pickedUsers, setPickedUsers] = useState<SearchableUser[]>([]);

  // Reset everything when the dialog closes.
  const reset = useCallback(() => {
    setState('preview');
    setProgressMessage('');
    setResult(null);
    setQuery('');
    setResults([]);
    setPickedUsers([]);
    setSearching(false);
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && state === 'sharing') return; // can't close mid-share
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  // Debounced search — vanilla setTimeout with cleanup (no lodash dep).
  useEffect(() => {
    if (!open || state !== 'preview') return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      const res = await searchUsersForSharing(q);
      if (res.error === null) {
        // Filter out anyone already picked so the dropdown shows fresh options.
        const pickedIds = new Set(pickedUsers.map((u) => u.id));
        setResults(res.data.filter((u) => !pickedIds.has(u.id)));
      } else {
        setResults([]);
      }
      setSearching(false);
    }, 250);
    return () => {
      clearTimeout(handle);
    };
  }, [query, open, state, pickedUsers]);

  const addUser = (u: SearchableUser) => {
    setPickedUsers((prev) =>
      prev.some((p) => p.id === u.id) ? prev : [...prev, u],
    );
    setQuery('');
    setResults([]);
  };

  const removeUser = (id: string) => {
    setPickedUsers((prev) => prev.filter((u) => u.id !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && query.length === 0 && pickedUsers.length > 0) {
      e.preventDefault();
      setPickedUsers((prev) => prev.slice(0, -1));
    }
  };

  const senderDisplayName =
    profile?.displayName?.trim() ||
    user?.email ||
    'A teammate';

  const handleShare = useCallback(async () => {
    if (pickedUsers.length === 0) return;
    setState('sharing');
    try {
      // 1. Ensure the project is global.
      let globalProjectId = project.syncedGlobalId;
      if (!globalProjectId) {
        setProgressMessage('Sharing project to Global...');
        const reconcileResult = await reconcileLocalToGlobal(project.id);
        globalProjectId = reconcileResult.globalProjectId;
      }

      // 2. Add members (idempotent — already-members count toward alreadyMember).
      setProgressMessage('Adding selected users...');
      const memberResult = await shareProjectWithUsers(
        globalProjectId,
        pickedUsers.map((u) => u.id),
      );
      if (memberResult.error !== null) {
        throw new Error(memberResult.error);
      }

      // 3. DM each recipient — best-effort, failures are non-fatal.
      setProgressMessage('Sending notifications...');
      let dmsSent = 0;
      const subject = `${senderDisplayName} shared a project with you`;
      const body =
        `${senderDisplayName} shared the project "${project.name}" with you. ` +
        `Open Global Projects to view it.`;
      for (const u of pickedUsers) {
        try {
          const { error } = await sendMessage(u.id, subject, body);
          if (error) {
            console.warn('[share-with-user] DM failed for', u.id, error);
          } else {
            dmsSent++;
          }
        } catch (err) {
          console.warn('[share-with-user] DM threw for', u.id, err);
        }
      }

      setResult({
        globalProjectId,
        added: memberResult.data.added,
        alreadyMember: memberResult.data.alreadyMember,
        dmsSent,
        totalAttempted: pickedUsers.length,
      });
      setState('success');
    } catch (e) {
      toast.error(
        'Share failed: ' + (e instanceof Error ? e.message : 'Unknown error'),
      );
      setState('preview');
    }
  }, [pickedUsers, project, senderDisplayName, sendMessage]);

  // ─── Success state ────────────────────────────────────────────────────────
  if (state === 'success' && result) {
    const total = result.added + result.alreadyMember;
    const summaryLine =
      result.alreadyMember > 0
        ? `Project shared with ${total} user${total === 1 ? '' : 's'} (${result.alreadyMember} already had access)`
        : `Project shared with ${total} user${total === 1 ? '' : 's'}`;
    const dmShortfall = result.totalAttempted - result.dmsSent;
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              Project Shared
            </DialogTitle>
            <DialogDescription>{summaryLine}</DialogDescription>
          </DialogHeader>
          <DialogBody className="px-5 py-4 space-y-3">
            <div className="rounded-md border p-3 space-y-1.5 text-sm">
              <p className="font-medium">Share Summary</p>
              <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                <span>New members added:</span>
                <span className="font-mono">{result.added}</span>
                <span>Already had access:</span>
                <span className="font-mono">{result.alreadyMember}</span>
                <span>Notifications sent:</span>
                <span className="font-mono">
                  {result.dmsSent} / {result.totalAttempted}
                </span>
              </div>
            </div>
            {dmShortfall > 0 && (
              <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 flex items-start gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-600 dark:text-yellow-400">
                    Some notifications failed
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    {dmShortfall} of {result.totalAttempted} direct messages
                    could not be sent. Users were still added as members.
                  </p>
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
            <Button
              className="gap-1.5"
              onClick={() => {
                handleOpenChange(false);
                navigateToGlobalProject(router, result.globalProjectId);
              }}
            >
              <ExternalLink className="h-4 w-4" />
              View Global Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Sharing state ────────────────────────────────────────────────────────
  if (state === 'sharing') {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 animate-spin" />
              Sharing with users...
            </DialogTitle>
            <DialogDescription>
              Please wait while access is granted and notifications are sent.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="px-5 py-6">
            <div className="flex flex-col items-center gap-3">
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full w-1/2 rounded-full bg-primary animate-pulse" />
              </div>
              <p className="text-sm text-muted-foreground">{progressMessage}</p>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── Preview state (user picker) ──────────────────────────────────────────
  const trimmedQuery = query.trim();
  const showDropdown = trimmedQuery.length >= 2;
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Share with User
          </DialogTitle>
          <DialogDescription>
            Pick one or more users to share this project with. They&apos;ll be added as members of the Global Project.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="px-5 py-4 space-y-3">
          {/* Project name pill */}
          <div className="rounded-md border p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Project</p>
            <p className="font-semibold">{project.name}</p>
          </div>

          {/* Picked chips */}
          {pickedUsers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pickedUsers.map((u) => (
                <div
                  key={u.id}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 py-0.5 pl-0.5 pr-2 text-sm"
                >
                  <Avatar size="sm">
                    {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt="" />}
                    <AvatarFallback>
                      {(u.displayName ?? '?').slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate max-w-[140px]">
                    {u.displayName ?? 'Unnamed user'}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeUser(u.id)}
                    className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Remove ${u.displayName ?? 'user'}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Search input */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search users by name..."
              className="pl-8"
            />
            {searching && (
              <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Results dropdown / hints */}
          <div className="rounded-md border max-h-64 overflow-y-auto">
            {!showDropdown && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                Type at least 2 characters to search.
              </p>
            )}
            {showDropdown && !searching && results.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                No users found.
              </p>
            )}
            {showDropdown && results.length > 0 && (
              <ul className="divide-y">
                {results.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => addUser(u)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <Avatar size="sm">
                        {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt="" />}
                        <AvatarFallback>
                          {(u.displayName ?? '?').slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">
                        {u.displayName ?? 'Unnamed user'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {project.syncedGlobalId
              ? 'Users will be added to the linked Global Project and receive a DM with a link.'
              : 'This project will be shared to Global if it isn’t already, then users will be added and notified by DM.'}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="gap-1.5"
            onClick={handleShare}
            disabled={pickedUsers.length === 0}
          >
            <UserPlus className="h-4 w-4" />
            Share
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
