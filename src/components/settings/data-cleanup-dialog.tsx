'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Trash2, RefreshCw, CheckCircle2, AlertTriangle, Database,
  MapPin, Hash, Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import { ProjectStatusBadge } from '@/components/shared/status-badge';
import { getAllProjects, deleteProject, purgeOrphanedRecords } from '@/lib/db';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import type { Project } from '@/types';

/** Supabase child tables that reference project_id (order: children before parent) */
const SUPABASE_PROJECT_CHILD_TABLES = [
  'project_files', 'field_notes', 'devices', 'ip_plan',
  'daily_reports', 'activity_log', 'network_diagrams',
  'ping_sessions', 'terminal_session_logs', 'connection_profiles',
  'register_calculations', 'command_snippets',
];

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

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === projects.length) return new Set();
      return new Set(projects.map((p) => p.id));
    });
  }, [projects]);

  const handleDelete = useCallback(async () => {
    setPhase('deleting');
    try {
      const ids = Array.from(selected);

      // 1. Hard-delete from Supabase first (so restore can't bring them back)
      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        if (supabase) {
          // Delete children first (FK order), then projects
          for (const table of SUPABASE_PROJECT_CHILD_TABLES) {
            const { error } = await supabase.from(table).delete().in('project_id', ids);
            if (error) console.warn(`[cleanup] Failed to delete from ${table}:`, error.message);
          }
          // Also delete any orphaned rows with NULL project_id
          for (const table of SUPABASE_PROJECT_CHILD_TABLES) {
            const { error } = await supabase.from(table).delete().is('project_id', null);
            if (error) console.warn(`[cleanup] Failed to purge NULL rows from ${table}:`, error.message);
          }
          // Delete the projects themselves
          const { error: projErr } = await supabase.from('projects').delete().in('id', ids);
          if (projErr) console.warn('[cleanup] Failed to delete projects:', projErr.message);
        }
      }

      // 2. Delete from local IndexedDB
      for (const id of ids) {
        await deleteProject(id);
      }

      // 3. Purge any orphaned child records (e.g. demo files with non-UUID projectIds)
      await purgeOrphanedRecords();

      setDeletedCount(ids.length);
      setPhase('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }, [selected]);

  const allSelected = projects.length > 0 && selected.size === projects.length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={phase !== 'deleting'} className="sm:max-w-lg">
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
              <div className="flex justify-center py-4">
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
                Select projects to permanently remove from this browser.
                All files, notes, and records will be deleted.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              {projects.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No projects found in local storage.
                </p>
              ) : (
                <div className="space-y-4">
                  {/* Select all toggle */}
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-1"
                  >
                    <div
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
                        allSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : selected.size > 0
                            ? 'border-primary bg-primary/20'
                            : 'border-muted-foreground/40'
                      }`}
                    >
                      {allSelected && (
                        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      {!allSelected && selected.size > 0 && (
                        <div className="h-1.5 w-1.5 rounded-[1px] bg-primary" />
                      )}
                    </div>
                    {allSelected ? 'Deselect all' : 'Select all'} ({projects.length})
                  </button>

                  {/* Project list */}
                  <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1 -mr-1">
                    {projects.map((project) => {
                      const isSelected = selected.has(project.id);
                      return (
                        <div
                          key={project.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleProject(project.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleProject(project.id); } }}
                          className={`flex items-start gap-3.5 rounded-xl border p-4 cursor-pointer transition-all select-none ${
                            isSelected
                              ? 'border-destructive/40 bg-destructive/5 shadow-sm'
                              : 'border-border hover:border-muted-foreground/30 hover:bg-muted/40'
                          }`}
                        >
                          {/* Checkbox */}
                          <div
                            className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border-[1.5px] transition-all ${
                              isSelected
                                ? 'border-destructive bg-destructive text-white scale-110'
                                : 'border-muted-foreground/40'
                            }`}
                          >
                            {isSelected && (
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>

                          {/* Project info */}
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-sm font-semibold truncate">
                                {project.name || 'Untitled Project'}
                              </h4>
                              <ProjectStatusBadge status={project.status} />
                            </div>

                            {(project.customerName || project.projectNumber) && (
                              <p className="text-xs text-muted-foreground truncate">
                                {project.customerName}
                                {project.customerName && project.projectNumber && ' · '}
                                {project.projectNumber && (
                                  <span className="inline-flex items-center gap-0.5">
                                    <Hash className="inline h-2.5 w-2.5" />{project.projectNumber}
                                  </span>
                                )}
                              </p>
                            )}

                            <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70">
                              {project.siteAddress && (
                                <span className="inline-flex items-center gap-1 truncate">
                                  <MapPin className="h-2.5 w-2.5 shrink-0" />
                                  <span className="truncate">{project.siteAddress}</span>
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 shrink-0">
                                <Calendar className="h-2.5 w-2.5" />
                                {new Date(project.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
                This will permanently delete <strong>{selected.size} project{selected.size !== 1 ? 's' : ''}</strong> and
                all associated data from this browser and cloud. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="rounded-lg bg-muted/50 p-3 space-y-1 max-h-32 overflow-y-auto">
                {projects
                  .filter((p) => selected.has(p.id))
                  .map((p) => (
                    <p key={p.id} className="text-xs text-muted-foreground truncate">
                      <span className="font-medium text-foreground">{p.name}</span>
                      {p.projectNumber && ` · #${p.projectNumber}`}
                    </p>
                  ))}
              </div>
            </DialogBody>
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
              <DialogTitle className="text-center">Cleanup Complete</DialogTitle>
              <DialogDescription className="text-center">
                {deletedCount} project{deletedCount !== 1 ? 's' : ''} and all associated
                data removed from local storage and cloud.
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
