'use client';

import { useState, useEffect } from 'react';
import { Download, ExternalLink, X, FileText, AlertTriangle, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileIcon, formatFileSize } from '@/components/shared/file-icon';
import { getFileBlob } from '@/lib/db';
import type { ProjectFile } from '@/types';
import { toast } from 'sonner';
import { openUrl } from '@/lib/tauri-bridge';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: ProjectFile | null;
}

type PreviewState = 'loading' | 'ready' | 'unsupported' | 'error';

const PREVIEWABLE_IMAGES = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'];
const PREVIEWABLE_TEXT = ['txt', 'csv', 'json', 'xml', 'log', 'md', 'cfg', 'ini', 'yaml', 'yml'];

function getPreviewType(ext: string): 'pdf' | 'image' | 'text' | 'unsupported' {
  const lower = ext.toLowerCase().replace('.', '');
  if (lower === 'pdf') return 'pdf';
  if (PREVIEWABLE_IMAGES.includes(lower)) return 'image';
  if (PREVIEWABLE_TEXT.includes(lower)) return 'text';
  return 'unsupported';
}

export function FilePreviewDialog({ open, onOpenChange, file }: Props) {
  const [state, setState] = useState<PreviewState>('loading');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);

  useEffect(() => {
    if (!open || !file) {
      // Cleanup
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
      setTextContent(null);
      setBlob(null);
      setState('loading');
      return;
    }

    const previewType = getPreviewType(file.fileType);
    if (previewType === 'unsupported') {
      setState('unsupported');
      return;
    }

    let cancelled = false;
    const load = async () => {
      setState('loading');
      try {
        const version = file.versions.find(v => v.id === file.currentVersionId);
        if (!version?.blobKey) {
          setState('error');
          return;
        }

        const fileBlob = await getFileBlob(version.blobKey);
        if (cancelled) return;

        if (!fileBlob) {
          setState('error');
          return;
        }

        setBlob(fileBlob);

        if (previewType === 'text') {
          const text = await fileBlob.text();
          if (cancelled) return;
          setTextContent(text.substring(0, 500000)); // limit to 500KB of text
          setState('ready');
        } else {
          // PDF or image — create object URL
          const mimeType = previewType === 'pdf' ? 'application/pdf' : file.mimeType;
          const typedBlob = new Blob([fileBlob], { type: mimeType });
          const url = URL.createObjectURL(typedBlob);
          if (cancelled) return;
          setBlobUrl(url);
          setState('ready');
        }
      } catch {
        if (!cancelled) setState('error');
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [open, file]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const handleDownload = async () => {
    if (!file) return;
    try {
      let downloadBlob = blob;
      if (!downloadBlob) {
        const version = file.versions.find(v => v.id === file.currentVersionId);
        if (!version?.blobKey) { toast.error('No file data available'); return; }
        downloadBlob = (await getFileBlob(version.blobKey)) || null;
        if (!downloadBlob) { toast.error('File not found in local storage'); return; }
      }
      const url = URL.createObjectURL(downloadBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed');
    }
  };

  const handleOpenNewTab = () => {
    if (blobUrl) {
      openUrl(blobUrl);
    }
  };

  if (!file) return null;

  const previewType = getPreviewType(file.fileType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <div style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 pr-8">
              <div className="flex items-center gap-3 min-w-0">
                <FileIcon fileType={file.fileType} className="h-5 w-5 shrink-0" />
                <div className="min-w-0">
                  <DialogTitle className="truncate text-sm">{file.title}</DialogTitle>
                  <p className="truncate text-xs text-muted-foreground">
                    {file.fileName} — {formatFileSize(file.size)} — {file.revisionNumber}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {state === 'ready' && previewType === 'pdf' && (
                  <Button variant="ghost" size="sm" onClick={handleOpenNewTab} title="Open in new tab" className="h-8 w-8 p-0">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={handleDownload} title="Download" className="h-8 w-8 p-0">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Preview Content */}
          <div className="flex-1 min-h-0 mt-3" style={{ minHeight: '300px' }}>
            {state === 'loading' && (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading preview...</p>
              </div>
            )}

            {state === 'error' && (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
                <AlertTriangle className="h-8 w-8 text-field-warning" />
                <div className="text-center">
                  <p className="text-sm font-medium">Unable to load preview</p>
                  <p className="text-xs text-muted-foreground mt-1">The file may be missing or corrupted.</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5 mt-2">
                  <Download className="h-4 w-4" /> Download Instead
                </Button>
              </div>
            )}

            {state === 'unsupported' && (
              <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
                <FileIcon fileType={file.fileType} className="h-12 w-12" />
                <div className="text-center">
                  <p className="text-sm font-medium">Preview not available</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    .{file.fileType.toUpperCase()} files cannot be previewed in the browser.
                  </p>
                </div>
                <div className="space-y-2 text-center mt-2">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-left">
                    <span className="text-muted-foreground">File</span>
                    <span className="font-medium truncate max-w-[200px]">{file.fileName}</span>
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium">.{file.fileType.toUpperCase()}</span>
                    <span className="text-muted-foreground">Size</span>
                    <span className="font-medium">{formatFileSize(file.size)}</span>
                    <span className="text-muted-foreground">Uploaded</span>
                    <span className="font-medium">{file.uploadedBy}</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5 mt-3">
                  <Download className="h-4 w-4" /> Download File
                </Button>
              </div>
            )}

            {state === 'ready' && previewType === 'pdf' && blobUrl && (
              <iframe
                src={blobUrl}
                className="w-full rounded-lg border border-border bg-white"
                style={{ height: 'min(70vh, 600px)' }}
                title={`Preview: ${file.title}`}
                sandbox="allow-same-origin"
                referrerPolicy="no-referrer"
              />
            )}

            {state === 'ready' && previewType === 'image' && blobUrl && (
              <div className="flex items-center justify-center rounded-lg border border-border bg-muted/30 p-4" style={{ maxHeight: 'min(70vh, 600px)', overflow: 'auto' }}>
                <img
                  src={blobUrl}
                  alt={file.title}
                  className="max-w-full object-contain rounded"
                  style={{ maxHeight: 'min(65vh, 560px)' }}
                />
              </div>
            )}

            {state === 'ready' && previewType === 'text' && textContent !== null && (
              <div className="rounded-lg border border-border bg-muted/30 p-4 font-mono text-xs overflow-auto" style={{ maxHeight: 'min(70vh, 600px)' }}>
                <pre className="whitespace-pre-wrap break-words">{textContent}</pre>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
