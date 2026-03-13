'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, FileJson, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import { saveProject, saveNote, saveDevice, saveIpEntry, addActivity } from '@/lib/db';
import { toast } from 'sonner';
import type { Project, FieldNote, DeviceEntry, IpPlanEntry } from '@/types';

type Phase = 'select' | 'preview' | 'importing' | 'success' | 'error';

interface PackageMeta {
  generator: string;
  version?: string;
  exportedAt?: string;
  preparedBy?: string;
  title?: string;
  coverNote?: string;
}

interface SharePackage {
  _meta: PackageMeta;
  project?: Record<string, unknown>;
  contacts?: Array<Record<string, unknown>>;
  panelRoster?: string;
  technicianNotes?: string;
  networkSummary?: string;
  files?: Array<Record<string, unknown>>;
  notes?: Array<Record<string, unknown>>;
  devices?: Array<Record<string, unknown>>;
  ipPlan?: Array<Record<string, unknown>>;
  activity?: Array<Record<string, unknown>>;
}

interface ImportProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (projectId: string) => void;
}

export function ImportProjectDialog({ open, onOpenChange, onImported }: ImportProjectDialogProps) {
  const [phase, setPhase] = useState<Phase>('select');
  const [pkg, setPkg] = useState<SharePackage | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importedName, setImportedName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setPhase('select');
    setPkg(null);
    setFileName('');
    setError(null);
    setImportedName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    if (phase === 'importing') return;
    if (!next) setTimeout(reset, 200);
    onOpenChange(next);
  }, [phase, onOpenChange, reset]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as SharePackage;

        // Validate it's a BAU Suite package
        if (!data._meta || data._meta.generator !== 'BAU Suite') {
          setError('This file is not a valid BAU Suite share package. It must have been exported using the Share > Package feature.');
          setPhase('error');
          return;
        }

        if (!data.project) {
          setError('This package does not contain project data.');
          setPhase('error');
          return;
        }

        setPkg(data);
        setPhase('preview');
      } catch {
        setError('Failed to parse the file. Please make sure it is a valid JSON file.');
        setPhase('error');
      }
    };
    reader.onerror = () => {
      setError('Failed to read the file.');
      setPhase('error');
    };
    reader.readAsText(file);
  }, []);

  const handleImport = useCallback(async () => {
    if (!pkg?.project) return;
    setPhase('importing');

    try {
      const now = new Date().toISOString();
      const projectId = uuid();
      const proj = pkg.project;

      // Build the new project with fresh ID
      const newProject: Project = {
        id: projectId,
        name: (proj.name as string) || 'Imported Project',
        customerName: (proj.customerName as string) || '',
        siteAddress: (proj.siteAddress as string) || '',
        buildingArea: (proj.buildingArea as string) || '',
        projectNumber: (proj.projectNumber as string) || '',
        technicianNotes: (pkg.technicianNotes as string) || (proj.technicianNotes as string) || '',
        createdAt: now,
        updatedAt: now,
        tags: (proj.tags as string[]) || [],
        status: (proj.status as Project['status']) || 'active',
        contacts: (pkg.contacts as unknown as Project['contacts']) || (proj.contacts as unknown as Project['contacts']) || [],
        panelRosterSummary: (pkg.panelRoster as string) || (proj.panelRosterSummary as string) || undefined,
        networkSummary: (pkg.networkSummary as string) || (proj.networkSummary as string) || undefined,
        isPinned: false,
        isOfflineAvailable: false,
      };

      await saveProject(newProject);

      // Import notes
      if (pkg.notes && Array.isArray(pkg.notes)) {
        for (const n of pkg.notes) {
          const note: FieldNote = {
            id: uuid(),
            projectId,
            content: (n.content as string) || '',
            category: (n.category as FieldNote['category']) || 'general',
            author: (n.author as string) || 'Imported',
            isPinned: (n.isPinned as boolean) || false,
            createdAt: (n.createdAt as string) || now,
            updatedAt: now,
            tags: (n.tags as string[]) || [],
          };
          await saveNote(note);
        }
      }

      // Import devices
      if (pkg.devices && Array.isArray(pkg.devices)) {
        for (const d of pkg.devices) {
          const device: DeviceEntry = {
            id: uuid(),
            projectId,
            deviceName: (d.deviceName as string) || '',
            description: (d.description as string) || '',
            system: (d.system as string) || '',
            panel: (d.panel as string) || '',
            controllerType: (d.controllerType as string) || '',
            macAddress: (d.macAddress as string) || undefined,
            instanceNumber: (d.instanceNumber as string) || undefined,
            ipAddress: (d.ipAddress as string) || undefined,
            floor: (d.floor as string) || '',
            area: (d.area as string) || '',
            status: (d.status as DeviceEntry['status']) || 'Not Commissioned',
            notes: (d.notes as string) || '',
            createdAt: now,
            updatedAt: now,
          };
          await saveDevice(device);
        }
      }

      // Import IP plan
      if (pkg.ipPlan && Array.isArray(pkg.ipPlan)) {
        for (const e of pkg.ipPlan) {
          const entry: IpPlanEntry = {
            id: uuid(),
            projectId,
            ipAddress: (e.ipAddress as string) || '',
            hostname: (e.hostname as string) || '',
            panel: (e.panel as string) || '',
            vlan: (e.vlan as string) || '',
            subnet: (e.subnet as string) || '',
            deviceRole: (e.deviceRole as string) || '',
            macAddress: (e.macAddress as string) || undefined,
            notes: (e.notes as string) || '',
            status: (e.status as IpPlanEntry['status']) || 'active',
            createdAt: now,
            updatedAt: now,
          };
          await saveIpEntry(entry);
        }
      }

      // Add activity log entry
      await addActivity({
        id: uuid(),
        projectId,
        action: 'Project imported',
        details: `Imported from share package "${fileName}"`,
        timestamp: now,
        user: 'User',
      });

      setImportedName(newProject.name);
      setPhase('success');
      toast.success(`Imported "${newProject.name}"`);
      onImported(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }, [pkg, fileName, onImported]);

  // Count what's in the package for preview
  const counts = pkg ? {
    notes: pkg.notes?.length ?? 0,
    devices: pkg.devices?.length ?? 0,
    ipPlan: pkg.ipPlan?.length ?? 0,
    files: pkg.files?.length ?? 0,
    contacts: pkg.contacts?.length ?? 0,
  } : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={phase !== 'importing'} className="sm:max-w-md">
        {/* ── Select File ── */}
        {phase === 'select' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <DialogTitle className="text-center">Import Project</DialogTitle>
              <DialogDescription className="text-center">
                Import a project from a BAU Suite share package (.json) exported by a team member.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <label
                htmlFor="import-file-input"
                className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/25 py-10 px-6 cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/30"
              >
                <FileJson className="h-10 w-10 text-muted-foreground/50" />
                <div className="text-center">
                  <p className="text-sm font-medium">Choose a file or drag it here</p>
                  <p className="text-xs text-muted-foreground mt-1">BAU Suite share package (.json)</p>
                </div>
                <input
                  ref={fileInputRef}
                  id="import-file-input"
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  onChange={handleFileSelect}
                />
              </label>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
            </DialogFooter>
          </>
        )}

        {/* ── Preview ── */}
        {phase === 'preview' && pkg?.project && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <FileJson className="h-6 w-6 text-primary" />
              </div>
              <DialogTitle className="text-center">Import &ldquo;{String(pkg.project.name)}&rdquo;?</DialogTitle>
              <DialogDescription className="text-center">
                This will create a new project with the data from this package.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="space-y-3">
                {/* Package info */}
                <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">File:</span> {fileName}
                  </p>
                  {pkg._meta.preparedBy && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Shared by:</span> {pkg._meta.preparedBy}
                    </p>
                  )}
                  {pkg._meta.exportedAt && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Exported:</span>{' '}
                      {new Date(pkg._meta.exportedAt).toLocaleDateString()}
                    </p>
                  )}
                  {pkg._meta.coverNote && (
                    <p className="text-xs text-muted-foreground italic mt-2">&ldquo;{String(pkg._meta.coverNote)}&rdquo;</p>
                  )}
                </div>

                {/* Project details */}
                <div className="rounded-lg border border-border p-3 space-y-1.5">
                  <p className="text-sm font-semibold">{String(pkg.project.name)}</p>
                  {typeof pkg.project.customerName === 'string' && pkg.project.customerName && (
                    <p className="text-xs text-muted-foreground">{pkg.project.customerName}</p>
                  )}
                  {typeof pkg.project.projectNumber === 'string' && pkg.project.projectNumber && (
                    <p className="text-xs text-muted-foreground">#{pkg.project.projectNumber}</p>
                  )}
                </div>

                {/* Content counts */}
                {counts && (counts.contacts > 0 || counts.notes > 0 || counts.devices > 0 || counts.ipPlan > 0 || counts.files > 0) && (
                  <div className="flex flex-wrap gap-2">
                    {counts.contacts > 0 && (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {counts.contacts} contact{counts.contacts !== 1 ? 's' : ''}
                      </span>
                    )}
                    {counts.files > 0 && (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {counts.files} file{counts.files !== 1 ? 's' : ''} (metadata only)
                      </span>
                    )}
                    {counts.notes > 0 && (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {counts.notes} note{counts.notes !== 1 ? 's' : ''}
                      </span>
                    )}
                    {counts.devices > 0 && (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {counts.devices} device{counts.devices !== 1 ? 's' : ''}
                      </span>
                    )}
                    {counts.ipPlan > 0 && (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {counts.ipPlan} IP entr{counts.ipPlan !== 1 ? 'ies' : 'y'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>Choose Different File</Button>
              <Button onClick={handleImport} className="gap-1.5">
                <Upload className="h-3.5 w-3.5" /> Import Project
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Importing ── */}
        {phase === 'importing' && (
          <>
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Upload className="h-6 w-6 text-primary animate-pulse" />
              </div>
              <DialogTitle className="text-center">Importing project&hellip;</DialogTitle>
              <DialogDescription className="text-center">
                Creating project and importing all data.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
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
              <DialogTitle className="text-center">Import Complete</DialogTitle>
              <DialogDescription className="text-center">
                &ldquo;{importedName}&rdquo; has been imported successfully with all its data.
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
              <DialogTitle className="text-center">Import Failed</DialogTitle>
              <DialogDescription className="text-center">
                {error || 'An error occurred while importing the project.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>Try Again</Button>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
