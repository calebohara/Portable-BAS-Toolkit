'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, FileUp, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

const ACCEPTED_TYPES: Record<FileCategory, { extensions: string[]; accept: string; description: string }> = {
  'panel-databases': { extensions: ['.pcl'], accept: '.pcl', description: 'PCL files' },
  'wiring-diagrams': { extensions: ['.pdf'], accept: '.pdf', description: 'PDF files' },
  'sequences': { extensions: ['.txt', '.pdf'], accept: '.txt,.pdf', description: 'TXT or PDF files' },
  'backups': { extensions: ['.pcl'], accept: '.pcl', description: 'PCL files' },
  'ip-plan': { extensions: ['.xlsx', '.csv', '.pdf'], accept: '.xlsx,.csv,.pdf', description: 'XLSX, CSV, or PDF files' },
  'device-list': { extensions: ['.xlsx', '.csv'], accept: '.xlsx,.csv', description: 'XLSX or CSV files' },
  'other': { extensions: [], accept: '*', description: 'Any file' },
};

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.substring(dot + 1).toLowerCase() : '';
}

export function UploadFileDialog({ open, onOpenChange, projectId, category, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: '',
    panelSystem: '',
    revisionNumber: 'Rev 1',
    uploadedBy: '',
    notes: '',
    tags: '',
  });

  const accepted = ACCEPTED_TYPES[category];

  const resetForm = useCallback(() => {
    setFile(null);
    setForm({ title: '', panelSystem: '', revisionNumber: 'Rev 1', uploadedBy: '', notes: '', tags: '' });
    setDragOver(false);
  }, []);

  const handleOpenChange = (open: boolean) => {
    if (!open) resetForm();
    onOpenChange(open);
  };

  const handleFileSelect = (selected: File | null) => {
    if (!selected) return;
    const ext = '.' + getFileExtension(selected.name);
    if (accepted.accept !== '*' && !accepted.extensions.includes(ext)) {
      toast.error(`Invalid file type. Expected: ${accepted.description}`);
      return;
    }
    setFile(selected);
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
  }, [accepted]);

  const handleSubmit = async () => {
    if (!file || !form.title.trim()) return;
    setSaving(true);
    try {
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
        fileName: file.name,
        fileType: ext,
        mimeType: file.type || 'application/octet-stream',
        category,
        panelSystem: form.panelSystem.trim() || undefined,
        revisionNumber: form.revisionNumber.trim() || 'Rev 1',
        revisionDate: now,
        uploadedBy: form.uploadedBy.trim() || 'Unknown',
        notes: form.notes.trim(),
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
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
      await addActivity({
        id: crypto.randomUUID(),
        projectId,
        action: 'file_uploaded',
        details: `Uploaded "${form.title.trim()}" to ${FILE_CATEGORY_LABELS[category]}`,
        timestamp: now,
        user: form.uploadedBy.trim() || 'Unknown',
        fileId,
      });

      toast.success(`"${form.title.trim()}" uploaded`);
      handleOpenChange(false);
      onUploaded?.();
    } catch {
      toast.error('Failed to upload file');
    } finally {
      setSaving(false);
    }
  };

  const u = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload to {FILE_CATEGORY_LABELS[category]}</DialogTitle>
          <DialogDescription>
            Accepted: {accepted.description}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-1 space-y-4">
          {/* Drop Zone */}
          <div
            className={cn(
              'relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer',
              dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
              file && 'border-field-success/50 bg-field-success/5'
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
              onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
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
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
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

          {/* Form Fields */}
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
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !file || !form.title.trim()}>
            {saving ? 'Uploading...' : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
