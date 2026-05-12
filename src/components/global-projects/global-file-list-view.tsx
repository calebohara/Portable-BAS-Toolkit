'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import {
  Search, Upload, Download, Pin, Clock, ChevronDown,
  MoreHorizontal, Eye, Trash2, FileText, Edit2, X,
} from 'lucide-react';
import { FileIcon, formatFileSize } from '@/components/shared/file-icon';
import { FileStatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FILE_CATEGORY_LABELS, type FileCategory, type FileStatus } from '@/types';
import type { GlobalProjectFile } from '@/types/global-projects';
import { cn, sanitizeFilename } from '@/lib/utils';
import {
  buildStoragePath, uploadProjectFile, getPublicUrl, validateFileSize,
  isImageFile, formatBytes,
} from '@/lib/storage';
import { toast } from 'sonner';

interface Props {
  projectId: string;
  category: FileCategory;
  files: GlobalProjectFile[];
  currentUserId: string;
  isAdmin: boolean;
  getMemberName: (id: string) => string;
  onAdd: (data: Omit<GlobalProjectFile, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'globalProjectId' | 'versions'>) => Promise<unknown>;
  onUpdate: (id: string, data: Partial<GlobalProjectFile>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

const FILE_STATUSES: { value: FileStatus; label: string }[] = [
  { value: 'current', label: 'Current' },
  { value: 'previous', label: 'Previous' },
  { value: 'field-verified', label: 'Field Verified' },
  { value: 'superseded', label: 'Superseded' },
  { value: 'backup-snapshot', label: 'Backup Snapshot' },
  { value: 'archived', label: 'Archived' },
  { value: 'obsolete', label: 'Obsolete' },
];

export function GlobalFileListView({
  projectId, category, files, currentUserId, isAdmin, getMemberName,
  onAdd, onUpdate, onRemove,
}: Props) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'updated' | 'name' | 'size'>('updated');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GlobalProjectFile | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [editTarget, setEditTarget] = useState<GlobalProjectFile | null>(null);

  const filteredFiles = useMemo(() => {
    let result = [...files];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((f) =>
        f.title.toLowerCase().includes(q) ||
        f.fileName.toLowerCase().includes(q) ||
        f.notes.toLowerCase().includes(q) ||
        f.tags.some((t) => t.toLowerCase().includes(q)) ||
        (f.panelSystem || '').toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      if (sortBy === 'name') return a.title.localeCompare(b.title);
      if (sortBy === 'size') return b.size - a.size;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    return result;
  }, [files, search, sortBy]);

  const selectedFile = selectedFileId ? files.find((f) => f.id === selectedFileId) : null;
  const canEdit = (file: GlobalProjectFile) => isAdmin || file.createdBy === currentUserId;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await onRemove(deleteTarget.id);
      if (selectedFileId === deleteTarget.id) setSelectedFileId(null);
      setDeleteTarget(null);
      toast.success('File deleted');
    } catch {
      toast.error('Failed to delete file');
    }
  };

  const handleDownload = (file: GlobalProjectFile) => {
    const url = file.storagePath ? getPublicUrl(file.storagePath) : null;
    if (!url) { toast.error('No file data available'); return; }
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilename(file.fileName);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  const handlePreview = (file: GlobalProjectFile) => {
    const url = file.storagePath ? getPublicUrl(file.storagePath) : null;
    if (!url) { toast.error('No preview available'); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{FILE_CATEGORY_LABELS[category]}</h2>
        <Button size="sm" className="gap-1.5" onClick={() => setShowUpload(true)}>
          <Upload className="h-4 w-4" />
          <span className="hidden sm:inline">Upload</span>
        </Button>
      </div>

      {/* Search and Sort */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground"
          >
            Sort <ChevronDown className="h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSortBy('updated')}>
              <Clock className="mr-2 h-4 w-4" /> Last Updated
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('name')}>
              <FileText className="mr-2 h-4 w-4" /> Name
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('size')}>
              <Download className="mr-2 h-4 w-4" /> Size
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {filteredFiles.length === 0 ? (
        <EmptyState
          icon={Upload}
          title={search ? 'No matching files' : `No ${FILE_CATEGORY_LABELS[category].toLowerCase()} yet`}
          description={search ? 'Try a different search term.' : 'Upload your first file to get started.'}
          action={!search ? (
            <Button size="sm" className="gap-1.5" onClick={() => setShowUpload(true)}>
              <Upload className="h-4 w-4" /> Upload File
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* File List */}
          <div className="flex-1 space-y-2">
            {filteredFiles.map((file) => (
              <Card
                key={file.id}
                role="button"
                tabIndex={0}
                aria-pressed={selectedFileId === file.id}
                className={cn(
                  'cursor-pointer transition-all hover:shadow-sm',
                  selectedFileId === file.id && 'ring-2 ring-primary border-primary/20'
                )}
                onClick={() => setSelectedFileId(file.id === selectedFileId ? null : file.id)}
                onDoubleClick={() => handlePreview(file)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedFileId(file.id === selectedFileId ? null : file.id); } }}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <FileIcon fileType={file.fileType} className="mt-0.5 h-6 w-6" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold">{file.title}</h3>
                          <p className="truncate text-xs text-muted-foreground">{file.fileName}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <FileStatusBadge status={file.status as FileStatus} />
                          {file.isPinned && <Pin className="h-3 w-3 text-primary" />}
                        </div>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {file.revisionNumber && <span>{file.revisionNumber}</span>}
                        <span>{formatFileSize(file.size)}</span>
                        <span>{format(new Date(file.updatedAt), 'MMM d, yyyy')}</span>
                        {file.panelSystem && <span className="text-primary">{file.panelSystem}</span>}
                      </div>

                      {file.tags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {file.tags.slice(0, 4).map((tag) => (
                            <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* File Detail Panel — scrollable independently */}
          {selectedFile && (
            <div className="lg:w-80 shrink-0">
              <Card className="lg:sticky lg:top-20 lg:overflow-y-auto" style={{ maxHeight: 'calc(100vh - 6rem)' }}>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">File Details</h3>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md p-1.5 text-sm hover:bg-accent">
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handlePreview(selectedFile)}>
                          <Eye className="mr-2 h-4 w-4" /> Preview
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownload(selectedFile)}>
                          <Download className="mr-2 h-4 w-4" /> Download
                        </DropdownMenuItem>
                        {canEdit(selectedFile) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={async () => {
                              try {
                                await onUpdate(selectedFile.id, { isPinned: !selectedFile.isPinned });
                                toast.success(!selectedFile.isPinned ? 'Pinned' : 'Unpinned');
                              } catch {
                                toast.error('Failed to update pin');
                              }
                            }}>
                              <Pin className="mr-2 h-4 w-4" /> {selectedFile.isPinned ? 'Unpin' : 'Pin'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditTarget(selectedFile)}>
                              <Edit2 className="mr-2 h-4 w-4" /> Edit Details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(selectedFile)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex items-center gap-3">
                    <FileIcon fileType={selectedFile.fileType} className="h-8 w-8" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{selectedFile.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{selectedFile.fileName}</p>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <DetailRow label="Status"><FileStatusBadge status={selectedFile.status as FileStatus} /></DetailRow>
                    {selectedFile.revisionNumber && <DetailRow label="Revision">{selectedFile.revisionNumber}</DetailRow>}
                    {selectedFile.revisionDate && <DetailRow label="Revision date">{selectedFile.revisionDate}</DetailRow>}
                    <DetailRow label="Size">{formatFileSize(selectedFile.size)}</DetailRow>
                    <DetailRow label="Uploaded by">{getMemberName(selectedFile.createdBy)}</DetailRow>
                    <DetailRow label="Last updated">{format(new Date(selectedFile.updatedAt), 'MMM d, yyyy h:mm a')}</DetailRow>
                    {selectedFile.panelSystem && <DetailRow label="Panel/System">{selectedFile.panelSystem}</DetailRow>}
                    <DetailRow label="Category">{FILE_CATEGORY_LABELS[selectedFile.category as FileCategory] ?? selectedFile.category}</DetailRow>
                  </div>

                  {selectedFile.notes && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                      <p className="text-sm whitespace-pre-wrap">{selectedFile.notes}</p>
                    </div>
                  )}

                  {selectedFile.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {selectedFile.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      <GlobalUploadFileDialog
        open={showUpload}
        onOpenChange={setShowUpload}
        projectId={projectId}
        category={category}
        onSubmit={onAdd}
      />

      <GlobalEditFileDialog
        file={editTarget}
        onOpenChange={(open) => { if (!open) setEditTarget(null); }}
        onSubmit={async (data) => {
          if (!editTarget) return;
          try {
            await onUpdate(editTarget.id, data);
            setEditTarget(null);
            toast.success('File updated');
          } catch {
            toast.error('Failed to update file');
          }
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete File"
        description={deleteTarget ? `Delete "${deleteTarget.title}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  );
}

// ─── Upload Dialog ─────────────────────────────────────────────────────────

function FilePreviewImage({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt="Preview" className="mx-auto mb-2 max-h-24 rounded-md object-contain" />;
}

function GlobalUploadFileDialog({
  open, onOpenChange, projectId, category, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  category: FileCategory;
  onSubmit: (data: Omit<GlobalProjectFile, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'globalProjectId' | 'versions'>) => Promise<unknown>;
}) {
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    title: '',
    panelSystem: '',
    revisionNumber: '',
    notes: '',
  });

  // Reset title when dialog reopens for a new category
  useEffect(() => {
    if (open) setForm((f) => ({ ...f, title: '' }));
  }, [open]);

  const updateField = (field: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleFileSelect = (selected: File | null) => {
    if (!selected) return;
    const sizeError = validateFileSize(selected);
    if (sizeError) { toast.error(sizeError); return; }
    setFile(selected);
    if (!form.title) {
      setForm((f) => ({ ...f, title: selected.name.replace(/\.[^.]+$/, '') }));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  };

  const resetForm = () => {
    setFile(null);
    setForm({ title: '', panelSystem: '', revisionNumber: '', notes: '' });
    setDragOver(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      let storagePath: string | null = null;
      let fileName = '';
      let fileType = '';
      let mimeType = '';
      let size = 0;

      if (file) {
        fileName = file.name;
        fileType = file.name.split('.').pop() || '';
        mimeType = file.type || 'application/octet-stream';
        size = file.size;
        storagePath = buildStoragePath(projectId, file.name);
        await uploadProjectFile(file, storagePath);
      }

      await onSubmit({
        title: form.title.trim(),
        fileName,
        fileType,
        mimeType,
        category,
        panelSystem: form.panelSystem.trim() || null,
        revisionNumber: form.revisionNumber.trim(),
        revisionDate: '',
        notes: form.notes.trim(),
        status: 'current',
        tags: [],
        isPinned: false,
        size,
        storagePath,
        updatedBy: null,
        deletedAt: null,
      });
      resetForm();
      onOpenChange(false);
      toast.success(file ? 'File uploaded' : 'File added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload to {FILE_CATEGORY_LABELS[category]}</DialogTitle>
          <DialogDescription>
            Upload a file to this Global Project. Photos: 5MB max. Documents: 50MB max.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1" style={{ minHeight: 0 }}>
          <DialogBody className="px-5 py-4 space-y-4">
            <div
              className={cn(
                'relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer',
                dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                file && 'border-field-success/50 bg-field-success/5'
              )}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="*"
                className="hidden"
                onChange={(e) => { handleFileSelect(e.target.files?.[0] || null); if (e.target) e.target.value = ''; }}
              />
              {file ? (
                <div className="text-center">
                  {isImageFile(file.type) && <FilePreviewImage file={file} />}
                  <p className="text-sm font-medium truncate max-w-[280px]">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                  <button
                    type="button"
                    className="absolute top-2 right-2 rounded p-1 hover:bg-muted"
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Drop file here or click to browse</p>
                    <p className="text-xs text-muted-foreground">PDFs, drawings, panel exports, photos</p>
                  </div>
                </>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="gfile-title">Title *</Label>
                <Input
                  id="gfile-title"
                  placeholder="e.g. AHU-1 Panel Backup"
                  value={form.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gfile-panel">Panel / System</Label>
                <Input
                  id="gfile-panel"
                  placeholder="e.g. MEC-1"
                  value={form.panelSystem}
                  onChange={(e) => updateField('panelSystem', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gfile-rev">Revision</Label>
                <Input
                  id="gfile-rev"
                  placeholder="e.g. Rev A"
                  value={form.revisionNumber}
                  onChange={(e) => updateField('revisionNumber', e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="gfile-notes">Notes</Label>
                <Textarea
                  id="gfile-notes"
                  placeholder="Any notes about this file..."
                  value={form.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !form.title.trim()}>
              {saving ? 'Uploading...' : file ? 'Upload' : 'Add Record'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Dialog ───────────────────────────────────────────────────────────

function GlobalEditFileDialog({
  file, onOpenChange, onSubmit,
}: {
  file: GlobalProjectFile | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: Partial<GlobalProjectFile>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    panelSystem: '',
    revisionNumber: '',
    revisionDate: '',
    notes: '',
    status: 'current' as FileStatus,
  });

  useEffect(() => {
    if (file) {
      setForm({
        title: file.title || '',
        panelSystem: file.panelSystem || '',
        revisionNumber: file.revisionNumber || '',
        revisionDate: file.revisionDate || '',
        notes: file.notes || '',
        status: (file.status as FileStatus) || 'current',
      });
    }
  }, [file]);

  const updateField = (field: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        title: form.title.trim(),
        panelSystem: form.panelSystem.trim() || null,
        revisionNumber: form.revisionNumber.trim(),
        revisionDate: form.revisionDate.trim(),
        notes: form.notes.trim(),
        status: form.status,
      });
    } catch {
      toast.error('Failed to update file');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={file !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit File Details</DialogTitle>
          <DialogDescription>Update metadata for this file.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1" style={{ minHeight: 0 }}>
          <DialogBody className="px-5 py-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-gfile-title">Title *</Label>
                <Input
                  id="edit-gfile-title"
                  value={form.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-gfile-panel">Panel / System</Label>
                <Input
                  id="edit-gfile-panel"
                  value={form.panelSystem}
                  onChange={(e) => updateField('panelSystem', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-gfile-status">Status</Label>
                <select
                  id="edit-gfile-status"
                  value={form.status}
                  onChange={(e) => updateField('status', e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {FILE_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-gfile-rev">Revision Number</Label>
                <Input
                  id="edit-gfile-rev"
                  value={form.revisionNumber}
                  onChange={(e) => updateField('revisionNumber', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-gfile-revdate">Revision Date</Label>
                <Input
                  id="edit-gfile-revdate"
                  type="date"
                  value={form.revisionDate}
                  onChange={(e) => updateField('revisionDate', e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="edit-gfile-notes">Notes</Label>
                <Textarea
                  id="edit-gfile-notes"
                  value={form.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !form.title.trim()}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
