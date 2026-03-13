'use client';

import { useState, useCallback, useEffect } from 'react';
import { Trash2, RefreshCw, CheckCircle2, AlertTriangle, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import { getAllProjects, deleteProject } from '@/lib/db';
import type { Project } from '@/types';

type Phase = 'loading' | 'select' | 'confirm' | 'deleting' | 'success' | 'error';

interface DataCleanupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DataCleanupDialog({ open, onOpenChange }: DataCleanupDialogProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deletedCount, setDeletedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Load projects when dialog opens
  useEffect(() => {
    if (!open) return;
    setPhase('loading');
    setSelected(new Set());
    setDeletedCount(0);
    setError(null);
    getAllProjects()
      .then((p) => {
        setProjects(p);
        setPhase('select');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      });
  }, [open]);

  const handleOpenChange = useCallback((next: boolean) => {
    if (phase === 'deleting') return;
    if (!next) {
      setTimeout(() => {
        setPhase('loading');
        setSelected(new Set());
        setDeletedCount(0);
        setError(null);
      }, 200);
    }
    onOpenChange(next);
  }, [phase, onOpenChange]);

  const toggleProject = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDelete = useCallback(async () => {
    setPhase('deleting');
    try {
      let count = 0;
      for (const id of selected) {
        await deleteProject(id);
        count++;
      }
      setDeletedCount(count);
      setPhase('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }, [selected]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={phase !== 'deleting'} className="sm:max-w-md">
        {/* ── Loading ── */}
        {phase === 'loading' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Database className="h-6 w-6 text-primary animate-pulse" />
              </div>
              <DialogTitle className="text-center">Loading local data&hellip;</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <div className="flex justify-center py-2">
                <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin" />
              </div>
            </DialogBody>
            <DialogFooter />
          </>
        )}

        {/* ── Select ── */}
        {phase === 'select' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <Database className="h-6 w-6 text-destructive" />
              </div>
              <DialogTitle className="text-center">Clean Up Local Data</DialogTitle>
              <DialogDescription className="text-center">
                Select projects to permanently delete from this browser. All associated files,
                notes, devices, and other records will be removed.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              {projects.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-4">
                  No projects found in local storage.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {projects.map((project) => (
                    <label
                      key={project.id}
                      className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <div
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          selected.has(project.id)
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input'
                        }`}
                      >
                        {selected.has(project.id) && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{project.name || 'Untitled Project'}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {project.customerName && `${project.customerName} · `}
                          {project.projectNumber && `#${project.projectNumber} · `}
                          Created {new Date(project.createdAt).toLocaleDateString()}
                        </p>
                        <p className="text-[10px] text-muted-foreground/60 font-mono truncate mt-0.5">
                          {project.id}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={selected.size === 0}
                onClick={() => setPhase('confirm')}
                className="gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete {selected.size > 0 ? `${selected.size} Project${selected.size !== 1 ? 's' : ''}` : 'Selected'}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Confirm ── */}
        {phase === 'confirm' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <DialogTitle className="text-center">Are you sure?</DialogTitle>
              <DialogDescription className="text-center">
                This will permanently delete {selected.size} project{selected.size !== 1 ? 's' : ''} and
                all associated data from this browser. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPhase('select')}>Go Back</Button>
              <Button variant="destructive" onClick={handleDelete} className="gap-1.5">
                <Trash2 className="h-3.5 w-3.5" /> Delete Permanently
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
              <DialogTitle className="text-center">Deleting projects&hellip;</DialogTitle>
              <DialogDescription className="text-center">
                Removing selected projects and all associated data.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="flex justify-center py-2">
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
              <DialogTitle className="text-center">Cleanup Complete</DialogTitle>
              <DialogDescription className="text-center">
                {deletedCount} project{deletedCount !== 1 ? 's' : ''} and all associated
                data removed from local storage.
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
              <DialogTitle className="text-center">Something went wrong</DialogTitle>
              <DialogDescription className="text-center">
                An error occurred while cleaning up data.
              </DialogDescription>
            </DialogHeader>
            {error && (
              <DialogBody>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground font-mono break-all">{error}</p>
                </div>
              </DialogBody>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
