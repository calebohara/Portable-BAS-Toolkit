'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Search, Download, Eye, Trash2, FolderOpen,
  MoreHorizontal,
  ArrowRight,
} from 'lucide-react';
import { TopBar } from '@/components/layout/top-bar';
import { FileIcon, formatFileSize } from '@/components/shared/file-icon';
import { FileStatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FilePreviewDialog } from '@/components/files/file-preview-dialog';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { FILE_CATEGORY_LABELS, type ProjectFile, type Project } from '@/types';
import { cn, sanitizeFilename } from '@/lib/utils';
import { getUnassignedFiles, getAllProjects, deleteFile, getFileBlob, saveFile, addActivity } from '@/lib/db';
import { toast } from 'sonner';

export default function DocumentsPage() {
  const _router = useRouter();
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectFile | null>(null);
  const [previewFile, setPreviewFile] = useState<ProjectFile | null>(null);
  const [_assigningFile, setAssigningFile] = useState<ProjectFile | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [f, p] = await Promise.all([getUnassignedFiles(), getAllProjects()]);
      setFiles(f);
      setProjects(p);
    } catch (e) {
      console.error('Failed to load documents:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-refresh when a global upload goes to inbox (unassigned)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.projectId) refresh();
    };
    window.addEventListener('bau-file-uploaded', handler);
    return () => window.removeEventListener('bau-file-uploaded', handler);
  }, [refresh]);

  const filteredFiles = search.trim()
    ? files.filter(f => {
        const q = search.toLowerCase();
        return f.title.toLowerCase().includes(q) ||
          f.fileName.toLowerCase().includes(q) ||
          f.notes.toLowerCase().includes(q);
      })
    : files;

  const selectedFile = selectedFileId ? files.find(f => f.id === selectedFileId) : null;

  const handleAssign = async (file: ProjectFile, projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const updated = { ...file, projectId, updatedAt: new Date().toISOString() };
    await saveFile(updated);
    await addActivity({
      id: crypto.randomUUID(),
      projectId,
      action: 'file_uploaded',
      details: `Assigned "${file.title}" from uploads inbox to ${FILE_CATEGORY_LABELS[file.category]}`,
      timestamp: new Date().toISOString(),
      user: file.uploadedBy,
      fileId: file.id,
    });
    toast.success(`Moved "${file.title}" to ${project.name}`);
    if (selectedFileId === file.id) setSelectedFileId(null);
    setAssigningFile(null);
    refresh();
  };

  const handleDownload = async (file: ProjectFile) => {
    const version = file.versions.find(v => v.id === file.currentVersionId);
    if (!version?.blobKey) { toast.error('No file data available'); return; }
    const blob = await getFileBlob(version.blobKey);
    if (!blob) { toast.error('File not found in local storage'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilename(file.fileName);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <>
      <TopBar title="Uploads Inbox" />

      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Uploads Inbox</h2>
            <p className="text-sm text-muted-foreground">
              {files.length} unassigned {files.length === 1 ? 'document' : 'documents'} — assign to a project or keep here for later
            </p>
          </div>
        </div>

        {/* Search */}
        {files.length > 0 && (
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center p-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filteredFiles.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title={search ? 'No matching documents' : 'Inbox is empty'}
            description={search ? 'Try a different search term.' : 'Use the Upload button in the top bar to quickly upload documents.'}
          />
        ) : (
          <div className="flex flex-col lg:flex-row gap-4">
            {/* File List */}
            <div className="flex-1 space-y-2">
              {filteredFiles.map(file => (
                <Card
                  key={file.id}
                  className={cn(
                    'cursor-pointer transition-all hover:shadow-sm',
                    selectedFileId === file.id && 'ring-2 ring-primary border-primary/20'
                  )}
                  onClick={() => setSelectedFileId(file.id === selectedFileId ? null : file.id)}
                  onDoubleClick={() => setPreviewFile(file)}
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
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            {FILE_CATEGORY_LABELS[file.category]}
                          </Badge>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{formatFileSize(file.size)}</span>
                          <span>{format(new Date(file.createdAt), 'MMM d, yyyy')}</span>
                          <span>{file.uploadedBy}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Detail Panel */}
            {selectedFile && (
              <div className="lg:w-80 shrink-0">
                <Card className="lg:sticky lg:top-20">
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Document Details</h3>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md p-1.5 text-sm hover:bg-accent">
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setPreviewFile(selectedFile)}>
                            <Eye className="mr-2 h-4 w-4" /> Preview
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDownload(selectedFile)}>
                            <Download className="mr-2 h-4 w-4" /> Download
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setAssigningFile(selectedFile)}>
                            <ArrowRight className="mr-2 h-4 w-4" /> Assign to Project
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(selectedFile)}>
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
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
                      <DetailRow label="Category">{FILE_CATEGORY_LABELS[selectedFile.category]}</DetailRow>
                      <DetailRow label="Size">{formatFileSize(selectedFile.size)}</DetailRow>
                      <DetailRow label="Uploaded by">{selectedFile.uploadedBy}</DetailRow>
                      <DetailRow label="Uploaded">{format(new Date(selectedFile.createdAt), 'MMM d, yyyy h:mm a')}</DetailRow>
                      <DetailRow label="Status"><FileStatusBadge status={selectedFile.status} /></DetailRow>
                    </div>

                    {selectedFile.notes && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                        <p className="text-sm whitespace-pre-wrap">{selectedFile.notes}</p>
                      </div>
                    )}

                    {/* Assign to Project */}
                    <div className="border-t border-border pt-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Assign to Project</p>
                      <Select
                        value=""
                        onValueChange={(v) => v && handleAssign(selectedFile, v)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select project..." />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map(p => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} — {p.projectNumber}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Document"
        description={`Permanently delete "${deleteTarget?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deleteFile(deleteTarget.id);
            if (selectedFileId === deleteTarget.id) setSelectedFileId(null);
            toast.success(`"${deleteTarget.title}" deleted`);
            refresh();
          } catch {
            toast.error('Failed to delete document');
          }
          setDeleteTarget(null);
        }}
      />

      <FilePreviewDialog
        open={!!previewFile}
        onOpenChange={(open) => { if (!open) setPreviewFile(null); }}
        file={previewFile}
      />
    </>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-right">{children}</span>
    </div>
  );
}
