'use client';

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  Search, Upload, Download, Pin, Star, Clock, ChevronDown,
  MoreHorizontal, Eye, Copy, Archive, Trash2, FileText,
} from 'lucide-react';
import { FileIcon, formatFileSize } from '@/components/shared/file-icon';
import { FileStatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FILE_CATEGORY_LABELS, type FileCategory, type ProjectFile } from '@/types';
import { cn } from '@/lib/utils';
import { deleteFile } from '@/lib/db';
import { toast } from 'sonner';

interface Props {
  projectId: string;
  category: FileCategory;
  files: ProjectFile[];
  onRefresh?: () => void;
}

export function FileListView({ projectId, category, files, onRefresh }: Props) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'updated' | 'name' | 'size'>('updated');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectFile | null>(null);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{FILE_CATEGORY_LABELS[category]}</h2>
        <Button size="sm" className="gap-1.5">
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
            <Button size="sm" className="gap-1.5">
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
                className={cn(
                  'cursor-pointer transition-all hover:shadow-sm',
                  selectedFileId === file.id && 'ring-2 ring-primary border-primary/20'
                )}
                onClick={() => setSelectedFileId(file.id === selectedFileId ? null : file.id)}
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
                          <FileStatusBadge status={file.status} />
                          {file.isPinned && <Pin className="h-3 w-3 text-primary" />}
                          {file.isFavorite && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                        </div>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{file.revisionNumber}</span>
                        <span>{formatFileSize(file.size)}</span>
                        <span>{format(new Date(file.updatedAt), 'MMM d, yyyy')}</span>
                        {file.panelSystem && <span className="text-primary">{file.panelSystem}</span>}
                        {file.isOfflineCached && <span className="text-field-info">Offline</span>}
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
              <Card className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">File Details</h3>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md p-1.5 text-sm hover:bg-accent">
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem><Download className="mr-2 h-4 w-4" /> Download</DropdownMenuItem>
                        <DropdownMenuItem><Eye className="mr-2 h-4 w-4" /> Preview</DropdownMenuItem>
                        <DropdownMenuItem><Copy className="mr-2 h-4 w-4" /> Duplicate</DropdownMenuItem>
                        <DropdownMenuItem><Pin className="mr-2 h-4 w-4" /> {selectedFile.isPinned ? 'Unpin' : 'Pin'}</DropdownMenuItem>
                        <DropdownMenuItem><Star className="mr-2 h-4 w-4" /> {selectedFile.isFavorite ? 'Unfavorite' : 'Favorite'}</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem><Archive className="mr-2 h-4 w-4" /> Archive</DropdownMenuItem>
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
                    <DetailRow label="Status"><FileStatusBadge status={selectedFile.status} /></DetailRow>
                    <DetailRow label="Revision">{selectedFile.revisionNumber}</DetailRow>
                    <DetailRow label="Size">{formatFileSize(selectedFile.size)}</DetailRow>
                    <DetailRow label="Uploaded by">{selectedFile.uploadedBy}</DetailRow>
                    <DetailRow label="Last updated">{format(new Date(selectedFile.updatedAt), 'MMM d, yyyy h:mm a')}</DetailRow>
                    {selectedFile.panelSystem && <DetailRow label="Panel/System">{selectedFile.panelSystem}</DetailRow>}
                    <DetailRow label="Category">{FILE_CATEGORY_LABELS[selectedFile.category]}</DetailRow>
                  </div>

                  {selectedFile.notes && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                      <p className="text-sm whitespace-pre-wrap">{selectedFile.notes}</p>
                    </div>
                  )}

                  {/* Version History */}
                  {selectedFile.versions.length > 1 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Version History</p>
                      <div className="space-y-2">
                        {[...selectedFile.versions].reverse().map((version) => (
                          <div
                            key={version.id}
                            className={cn(
                              'rounded-lg border p-2 text-xs',
                              version.id === selectedFile.currentVersionId
                                ? 'border-primary/20 bg-primary/5'
                                : 'border-border'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">v{version.versionNumber}</span>
                              <FileStatusBadge status={version.status} />
                            </div>
                            <p className="text-muted-foreground mt-0.5">{version.notes}</p>
                            <p className="text-muted-foreground mt-0.5">
                              {version.uploadedBy} — {format(new Date(version.uploadedAt), 'MMM d, yyyy')}
                            </p>
                          </div>
                        ))}
                      </div>
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

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete File"
        description={`"${deleteTarget?.title}" and all its version history will be permanently deleted. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deleteFile(deleteTarget.id);
            if (selectedFileId === deleteTarget.id) setSelectedFileId(null);
            toast.success(`"${deleteTarget.title}" deleted`);
            onRefresh?.();
          } catch {
            toast.error('Failed to delete file');
          }
          setDeleteTarget(null);
        }}
      />
    </div>
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
