'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, FileUp, X, CheckCircle2, AlertCircle, Loader2, FolderOpen } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { saveFile, saveFileBlob, addActivity, getAllProjects } from '@/lib/db';
import { FILE_CATEGORY_LABELS, type FileCategory, type ProjectFile, type FileVersion, type Project } from '@/types';
import { formatFileSize } from '@/components/shared/file-icon';
import { cn, sanitizeFilename } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded?: () => void;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// All categories available for global upload
const UPLOAD_CATEGORIES: { value: FileCategory; label: string }[] = [
  { value: 'general-documents', label: 'General Documents' },
  { value: 'panel-databases', label: 'Panel Databases' },
  { value: 'wiring-diagrams', label: 'Wiring Diagrams' },
  { value: 'sequences', label: 'Sequences' },
  { value: 'backups', label: 'Backups' },
  { value: 'other', label: 'Other' },
];

type UploadStage = 'idle' | 'preparing' | 'storing' | 'saving' | 'complete' | 'failed';

const STAGE_LABELS: Record<UploadStage, string> = {
  idle: '',
  preparing: 'Preparing upload...',
  storing: 'Storing file data...',
  saving: 'Saving metadata...',
  complete: 'Upload complete',
  failed: 'Upload failed',
};

const STAGE_PROGRESS: Record<UploadStage, number> = {
  idle: 0,
  preparing: 15,
  storing: 50,
  saving: 85,
  complete: 100,
  failed: 0,
};

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.substring(dot + 1).toLowerCase() : '';
}

export function GlobalUploadDialog({ open, onOpenChange, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [stage, setStage] = useState<UploadStage>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  const [form, setForm] = useState({
    title: '',
    projectId: '', // '' = unassigned
    category: 'general-documents' as FileCategory,
    uploadedBy: '',
    notes: '',
  });

  const isUploading = stage !== 'idle' && stage !== 'complete' && stage !== 'failed';

  // Load projects when dialog opens
  useEffect(() => {
    if (open) {
      getAllProjects().then(setProjects);
    }
  }, [open]);

  const resetForm = useCallback(() => {
    setFile(null);
    setForm({ title: '', projectId: '', category: 'general-documents', uploadedBy: '', notes: '' });
    setDragOver(false);
    setStage('idle');
    setErrorMessage('');
    submittingRef.current = false;
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isUploading) return;
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const handleFileSelect = (selected: File | null) => {
    if (!selected || isUploading) return;
    if (selected.size > MAX_FILE_SIZE) {
      toast.error(`File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
      return;
    }
    if (selected.size === 0) {
      toast.error('File is empty');
      return;
    }
    setFile(selected);
    setStage('idle');
    setErrorMessage('');
    if (!form.title) {
      const nameWithoutExt = selected.name.replace(/\.[^.]+$/, '');
      setForm(f => ({ ...f, title: nameWithoutExt }));
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  }, [isUploading]);

  const handleSubmit = async () => {
    if (!file || !form.title.trim() || submittingRef.current) return;
    submittingRef.current = true;
    setErrorMessage('');

    try {
      setStage('preparing');
      const now = new Date().toISOString();
      const fileId = crypto.randomUUID();
      const versionId = crypto.randomUUID();
      const blobKey = crypto.randomUUID();
      const ext = getFileExtension(file.name);

      const version: FileVersion = {
        id: versionId,
        fileId,
        versionNumber: 1,
        uploadedAt: now,
        uploadedBy: form.uploadedBy.trim() || 'Unknown',
        notes: form.notes.trim(),
        size: file.size,
        status: 'current',
        blobKey,
      };

      const projectFile: ProjectFile = {
        id: fileId,
        projectId: form.projectId, // '' if unassigned
        title: form.title.trim(),
        fileName: sanitizeFilename(file.name),
        fileType: ext,
        mimeType: file.type || 'application/octet-stream',
        category: form.category,
        revisionNumber: 'Rev 1',
        revisionDate: now,
        uploadedBy: form.uploadedBy.trim() || 'Unknown',
        notes: form.notes.trim(),
        tags: [],
        status: 'current',
        isPinned: false,
        isFavorite: false,
        isOfflineCached: true,
        currentVersionId: versionId,
        versions: [version],
        createdAt: now,
        updatedAt: now,
        size: file.size,
      };

      setStage('storing');
      await saveFileBlob(blobKey, file);

      setStage('saving');
      await saveFile(projectFile);

      // Log activity if assigned to a project
      if (form.projectId) {
        await addActivity({
          id: crypto.randomUUID(),
          projectId: form.projectId,
          action: 'file_uploaded',
          details: `Uploaded "${form.title.trim()}" to ${FILE_CATEGORY_LABELS[form.category]}`,
          timestamp: now,
          user: form.uploadedBy.trim() || 'Unknown',
          fileId,
        });
      }

      setStage('complete');
      const projectName = form.projectId
        ? projects.find(p => p.id === form.projectId)?.name
        : null;
      toast.success(
        projectName
          ? `"${form.title.trim()}" uploaded to ${projectName}`
          : `"${form.title.trim()}" uploaded to inbox`
      );

      setTimeout(() => {
        handleOpenChange(false);
        onUploaded?.();
        window.dispatchEvent(new CustomEvent('bau-file-uploaded', {
          detail: { projectId: form.projectId, fileId },
        }));
      }, 600);
    } catch (err) {
      setStage('failed');
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred. Check storage space.');
      submittingRef.current = false;
    }
  };

  const handleRetry = () => {
    setStage('idle');
    setErrorMessage('');
    submittingRef.current = false;
  };

  const u = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <div style={{ maxHeight: '85vh', overflowY: 'auto' }}>
          <DialogHeader>
            <DialogTitle>Quick Upload</DialogTitle>
            <DialogDescription>
              Upload a document to a project or the uploads inbox. Max {MAX_FILE_SIZE / 1024 / 1024}MB.
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 pb-1 space-y-4">
            {/* Upload Progress */}
            {stage !== 'idle' && (
              <div className={cn(
                'rounded-lg border p-3 space-y-2',
                stage === 'complete' ? 'border-field-success/30 bg-field-success/5' :
                stage === 'failed' ? 'border-destructive/30 bg-destructive/5' :
                'border-border'
              )}>
                <div className="flex items-center gap-2">
                  {stage === 'complete' && <CheckCircle2 className="h-4 w-4 text-field-success shrink-0" />}
                  {stage === 'failed' && <AlertCircle className="h-4 w-4 text-destructive shrink-0" />}
                  {isUploading && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{file?.name}</p>
                    <p className={cn(
                      'text-xs',
                      stage === 'complete' ? 'text-field-success' :
                      stage === 'failed' ? 'text-destructive' :
                      'text-muted-foreground'
                    )}>
                      {STAGE_LABELS[stage]}
                      {file && isUploading && ` (${formatFileSize(file.size)})`}
                    </p>
                  </div>
                </div>
                {(isUploading || stage === 'complete') && (
                  <Progress value={STAGE_PROGRESS[stage]} className="h-1.5" />
                )}
                {stage === 'failed' && (
                  <div className="space-y-1.5">
                    {errorMessage && (
                      <p className="text-xs text-destructive">{errorMessage}</p>
                    )}
                    <Button variant="outline" size="sm" onClick={handleRetry} className="gap-1.5">
                      Retry Upload
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Drop Zone */}
            {!isUploading && stage !== 'complete' && (
              <div
                className={cn(
                  'relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer',
                  dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                  file && stage !== 'failed' && 'border-field-success/50 bg-field-success/5'
                )}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="*"
                  className="hidden"
                  onChange={(e) => { handleFileSelect(e.target.files?.[0] || null); if (e.target) e.target.value = ''; }}
                />
                {file ? (
                  <>
                    <FileUp className="h-8 w-8 text-field-success" />
                    <div className="text-center">
                      <p className="text-sm font-medium truncate max-w-[280px]">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 h-6 w-6 p-0"
                      onClick={(e) => { e.stopPropagation(); setFile(null); setStage('idle'); }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <div className="text-center">
                      <p className="text-sm font-medium">Drop file here or click to browse</p>
                      <p className="text-xs text-muted-foreground">Any document type accepted</p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Form Fields */}
            {stage !== 'complete' && (
              <fieldset disabled={isUploading}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Title */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="gu-title">Title *</Label>
                    <Input
                      id="gu-title"
                      placeholder="e.g. AHU-1 Startup Report"
                      value={form.title}
                      onChange={e => u('title', e.target.value)}
                      required
                    />
                  </div>

                  {/* Project Selector */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Destination Project</Label>
                    <Select
                      value={form.projectId || '__unassigned__'}
                      onValueChange={(v) => v && u('projectId', v === '__unassigned__' ? '' : v)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a project..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__unassigned__">
                          <FolderOpen className="h-4 w-4 text-muted-foreground" />
                          Uploads Inbox (unassigned)
                        </SelectItem>
                        {projects.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} — {p.projectNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Category Selector */}
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select
                      value={form.category}
                      onValueChange={(v) => v && u('category', v)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UPLOAD_CATEGORIES.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Uploaded By */}
                  <div className="space-y-1.5">
                    <Label htmlFor="gu-by">Uploaded By</Label>
                    <Input
                      id="gu-by"
                      placeholder="Your name / initials"
                      value={form.uploadedBy}
                      onChange={e => u('uploadedBy', e.target.value)}
                    />
                  </div>

                  {/* Notes */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="gu-notes">Notes</Label>
                    <Textarea
                      id="gu-notes"
                      placeholder="Optional notes about this document..."
                      value={form.notes}
                      onChange={e => u('notes', e.target.value)}
                      rows={2}
                      className="resize-none"
                    />
                  </div>
                </div>
              </fieldset>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isUploading}
            >
              {stage === 'complete' ? 'Close' : 'Cancel'}
            </Button>
            {stage !== 'complete' && (
              <Button
                onClick={handleSubmit}
                disabled={isUploading || !file || !form.title.trim()}
              >
                {isUploading ? (
                  <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Uploading...</>
                ) : (
                  'Upload'
                )}
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
