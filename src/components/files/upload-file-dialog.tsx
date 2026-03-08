'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, FileUp, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { saveFile, saveFileBlob, addActivity } from '@/lib/db';
import { FILE_CATEGORY_LABELS, type FileCategory, type ProjectFile, type FileVersion } from '@/types';
import { formatFileSize } from '@/components/shared/file-icon';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  category: FileCategory;
  onUploaded?: () => void;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 50;

const ACCEPTED_TYPES: Record<FileCategory, { extensions: string[]; accept: string; description: string }> = {
  'panel-databases': { extensions: ['.pcl'], accept: '.pcl', description: 'PCL files' },
  'wiring-diagrams': { extensions: ['.pdf'], accept: '.pdf', description: 'PDF files' },
  'sequences': { extensions: ['.txt', '.pdf'], accept: '.txt,.pdf', description: 'TXT or PDF files' },
  'backups': { extensions: ['.pcl'], accept: '.pcl', description: 'PCL files' },
  'ip-plan': { extensions: ['.xlsx', '.csv', '.pdf'], accept: '.xlsx,.csv,.pdf', description: 'XLSX, CSV, or PDF files' },
  'device-list': { extensions: ['.xlsx', '.csv'], accept: '.xlsx,.csv', description: 'XLSX or CSV files' },
  'other': { extensions: [], accept: '*', description: 'Any file' },
};

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

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"|?*\\\/]/g, '_').replace(/\.{2,}/g, '.');
}

function sanitizeTags(tagsString: string): string[] {
  return tagsString
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
    .filter(t => t.length <= MAX_TAG_LENGTH)
    .slice(0, MAX_TAGS);
}

export function UploadFileDialog({ open, onOpenChange, projectId, category, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [stage, setStage] = useState<UploadStage>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  const [form, setForm] = useState({
    title: '',
    panelSystem: '',
    revisionNumber: 'Rev 1',
    uploadedBy: '',
    notes: '',
    tags: '',
  });

  const accepted = ACCEPTED_TYPES[category];
  const isUploading = stage !== 'idle' && stage !== 'complete' && stage !== 'failed';

  const resetForm = useCallback(() => {
    setFile(null);
    setForm({ title: '', panelSystem: '', revisionNumber: 'Rev 1', uploadedBy: '', notes: '', tags: '' });
    setDragOver(false);
    setStage('idle');
    setErrorMessage('');
    submittingRef.current = false;
  }, []);

  const handleOpenChange = (open: boolean) => {
    if (!open && isUploading) return; // prevent closing during upload
    if (!open) resetForm();
    onOpenChange(open);
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
    const ext = '.' + getFileExtension(selected.name);
    if (accepted.accept !== '*' && !accepted.extensions.includes(ext)) {
      toast.error(`Invalid file type. Expected: ${accepted.description}`);
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
  }, [accepted, isUploading]);

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
        projectId,
        title: form.title.trim(),
        fileName: sanitizeFilename(file.name),
        fileType: ext,
        mimeType: file.type || 'application/octet-stream',
        category,
        panelSystem: form.panelSystem.trim() || undefined,
        revisionNumber: form.revisionNumber.trim() || 'Rev 1',
        revisionDate: now,
        uploadedBy: form.uploadedBy.trim() || 'Unknown',
        notes: form.notes.trim(),
        tags: sanitizeTags(form.tags),
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
      await addActivity({
        id: crypto.randomUUID(),
        projectId,
        action: 'file_uploaded',
        details: `Uploaded "${form.title.trim()}" to ${FILE_CATEGORY_LABELS[category]}`,
        timestamp: now,
        user: form.uploadedBy.trim() || 'Unknown',
        fileId,
      });

      setStage('complete');
      toast.success(`"${form.title.trim()}" uploaded`);

      setTimeout(() => {
        handleOpenChange(false);
        onUploaded?.();
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
            <DialogTitle>Upload to {FILE_CATEGORY_LABELS[category]}</DialogTitle>
            <DialogDescription>
              Accepted: {accepted.description} — Max {MAX_FILE_SIZE / 1024 / 1024}MB
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
                  accept={accepted.accept}
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
                      <p className="text-xs text-muted-foreground">{accepted.description}</p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Form Fields */}
            {stage !== 'complete' && (
              <fieldset disabled={isUploading}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="uf-title">Title *</Label>
                    <Input
                      id="uf-title"
                      placeholder="e.g. AHU-1 Panel Database"
                      value={form.title}
                      onChange={e => u('title', e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="uf-panel">Panel / System</Label>
                    <Input
                      id="uf-panel"
                      placeholder="e.g. PXC36.1-AHU1"
                      value={form.panelSystem}
                      onChange={e => u('panelSystem', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="uf-rev">Revision</Label>
                    <Input
                      id="uf-rev"
                      placeholder="e.g. Rev 1"
                      value={form.revisionNumber}
                      onChange={e => u('revisionNumber', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="uf-by">Uploaded By</Label>
                    <Input
                      id="uf-by"
                      placeholder="Your name / initials"
                      value={form.uploadedBy}
                      onChange={e => u('uploadedBy', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="uf-tags">Tags</Label>
                    <Input
                      id="uf-tags"
                      placeholder="comma separated"
                      value={form.tags}
                      onChange={e => u('tags', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="uf-notes">Notes</Label>
                    <Textarea
                      id="uf-notes"
                      placeholder="Optional notes about this file..."
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
