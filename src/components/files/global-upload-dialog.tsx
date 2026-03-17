'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, FileUp, X, CheckCircle2, AlertCircle, Loader2, FolderOpen } from 'lucide-react';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
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
import { FileIcon } from '@/components/shared/file-icon';
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

type UploadStage = 'idle' | 'uploading' | 'complete' | 'failed';

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.substring(dot + 1).toLowerCase() : '';
}

export function GlobalUploadDialog({ open, onOpenChange, onUploaded }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [stage, setStage] = useState<UploadStage>('idle');
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  const [form, setForm] = useState({
    projectId: '', // '' = unassigned
    category: 'general-documents' as FileCategory,
    uploadedBy: '',
    notes: '',
  });

  const isUploading = stage === 'uploading';

  // Load projects when dialog opens
  useEffect(() => {
    if (open) {
      getAllProjects().then(setProjects).catch(() => {});
    }
  }, [open]);

  const resetForm = useCallback(() => {
    setFiles([]);
    setForm({ projectId: '', category: 'general-documents', uploadedBy: '', notes: '' });
    setDragOver(false);
    setStage('idle');
    setUploadProgress({ current: 0, total: 0 });
    setErrorMessage('');
    submittingRef.current = false;
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isUploading) return;
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const addFiles = (newFiles: File[]) => {
    if (isUploading) return;
    const valid: File[] = [];
    for (const f of newFiles) {
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`"${f.name}" exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
        continue;
      }
      if (f.size === 0) {
        toast.error(`"${f.name}" is empty`);
        continue;
      }
      valid.push(f);
    }
    if (valid.length > 0) {
      setFiles(prev => [...prev, ...valid]);
      setStage('idle');
      setErrorMessage('');
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) addFiles(dropped);
  }, [isUploading]);

  const handleSubmit = async () => {
    if (files.length === 0 || submittingRef.current) return;
    submittingRef.current = true;
    setErrorMessage('');
    setStage('uploading');
    setUploadProgress({ current: 0, total: files.length });

    let successCount = 0;
    let lastError = '';

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress({ current: i + 1, total: files.length });

      try {
        const now = new Date().toISOString();
        const fileId = crypto.randomUUID();
        const versionId = crypto.randomUUID();
        const blobKey = crypto.randomUUID();
        const ext = getFileExtension(file.name);
        const titleFromName = file.name.replace(/\.[^.]+$/, '');

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
          projectId: form.projectId,
          title: titleFromName,
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

        await saveFileBlob(blobKey, file);
        await saveFile(projectFile);

        if (form.projectId) {
          await addActivity({
            id: crypto.randomUUID(),
            projectId: form.projectId,
            action: 'file_uploaded',
            details: `Uploaded "${titleFromName}" to ${FILE_CATEGORY_LABELS[form.category]}`,
            timestamp: now,
            user: form.uploadedBy.trim() || 'Unknown',
            fileId,
          });
        }

        successCount++;
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Unexpected error';
      }
    }

    if (successCount === files.length) {
      setStage('complete');
      const projectName = form.projectId
        ? projects.find(p => p.id === form.projectId)?.name
        : null;
      toast.success(
        files.length === 1
          ? `"${files[0].name.replace(/\.[^.]+$/, '')}" uploaded${projectName ? ` to ${projectName}` : ' to inbox'}`
          : `${successCount} files uploaded${projectName ? ` to ${projectName}` : ' to inbox'}`
      );
      setTimeout(() => {
        handleOpenChange(false);
        onUploaded?.();
        window.dispatchEvent(new CustomEvent('bau-file-uploaded', {
          detail: { projectId: form.projectId },
        }));
      }, 600);
    } else if (successCount > 0) {
      setStage('failed');
      setErrorMessage(`${successCount}/${files.length} uploaded. Error: ${lastError}`);
      submittingRef.current = false;
    } else {
      setStage('failed');
      setErrorMessage(lastError || 'An unexpected error occurred. Check storage space.');
      submittingRef.current = false;
    }
  };

  const handleRetry = () => {
    setStage('idle');
    setErrorMessage('');
    submittingRef.current = false;
  };

  const u = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Quick Upload</DialogTitle>
            <DialogDescription>
              Upload documents to a project or the uploads inbox. Max {MAX_FILE_SIZE / 1024 / 1024}MB per file.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="px-5 pb-1 space-y-4">
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
                    <p className="text-sm font-medium">
                      {stage === 'complete' ? 'Upload complete' :
                       stage === 'failed' ? 'Upload failed' :
                       `Uploading ${uploadProgress.current} of ${uploadProgress.total}...`}
                    </p>
                  </div>
                </div>
                {isUploading && (
                  <Progress value={(uploadProgress.current / uploadProgress.total) * 100} className="h-1.5" />
                )}
                {stage === 'complete' && <Progress value={100} className="h-1.5" />}
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
                  files.length > 0 && stage !== 'failed' && 'border-field-success/50 bg-field-success/5'
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
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const selected = e.target.files;
                    if (selected && selected.length > 0) {
                      addFiles(Array.from(selected));
                    }
                    if (e.target) e.target.value = '';
                  }}
                />
                {files.length > 0 ? (
                  <>
                    <FileUp className="h-8 w-8 text-field-success" />
                    <div className="text-center">
                      <p className="text-sm font-medium">
                        {files.length} {files.length === 1 ? 'file' : 'files'} selected
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(totalSize)} total — click or drop to add more
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <div className="text-center">
                      <p className="text-sm font-medium">Drop files here or click to browse</p>
                      <p className="text-xs text-muted-foreground">Any document type accepted — select multiple files</p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* File List */}
            {files.length > 0 && !isUploading && stage !== 'complete' && (
              <div className="space-y-1 max-h-32 overflow-y-auto rounded-md border border-border p-2">
                {files.map((f, i) => (
                  <div key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-2 text-sm py-1 px-1 rounded hover:bg-muted/50 group">
                    <FileIcon fileType={getFileExtension(f.name)} className="h-4 w-4 shrink-0" />
                    <span className="truncate flex-1 min-w-0">{f.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(f.size)}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Form Fields */}
            {stage !== 'complete' && (
              <fieldset disabled={isUploading}>
                <div className="grid gap-3 sm:grid-cols-2">
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
                      placeholder="Optional notes about these documents..."
                      value={form.notes}
                      onChange={e => u('notes', e.target.value)}
                      rows={2}
                      className="resize-none"
                    />
                  </div>
                </div>
              </fieldset>
            )}
          </DialogBody>

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
                disabled={isUploading || files.length === 0}
              >
                {isUploading ? (
                  <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Uploading...</>
                ) : (
                  files.length > 1 ? `Upload ${files.length} Files` : 'Upload'
                )}
              </Button>
            )}
          </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
