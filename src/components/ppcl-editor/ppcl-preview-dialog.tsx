'use client';

import dynamic from 'next/dynamic';
import { Download, ExternalLink, FileCode } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { sanitizeFilename } from '@/lib/utils';
import { formatFileSize } from '@/components/shared/file-icon';
import { toast } from 'sonner';
import type { PpclDocument } from '@/types';

// CodeMirror is heavy; only load it when a preview is actually opened.
const PpclEditorComponent = dynamic(
  () => import('./ppcl-editor').then((m) => ({ default: m.PpclEditorComponent })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading viewer…
      </div>
    ),
  },
);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: PpclDocument | null;
  onOpenInEditor: (docId: string) => void;
}

function ensurePclExtension(name: string): string {
  return name.toLowerCase().endsWith('.pcl') ? name : `${name}.pcl`;
}

function downloadPpcl(doc: PpclDocument) {
  try {
    const blob = new Blob([doc.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = ensurePclExtension(sanitizeFilename(doc.name) || 'program');
    a.click();
    // 5s is plenty for the browser to start the download; the URL holds the blob alive.
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success('Downloaded');
  } catch {
    toast.error('Download failed');
  }
}

export function PpclPreviewDialog({ open, onOpenChange, document: doc, onOpenInEditor }: Props) {
  // doc transitions to null on close; keep the Dialog mounted so the close animation plays.
  // Content is only rendered when doc is present (which is always true while the dialog is open).
  const lineCount = doc ? (doc.content === '' ? 0 : doc.content.split('\n').length) : 0;
  const byteSize = doc ? new Blob([doc.content]).size : 0;
  const isEmpty = doc ? doc.content.trim().length === 0 : true;
  const charLimit = doc?.firmware === 'ptec' ? 80 : 198;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        {doc && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 min-w-0 pr-8">
                <FileCode className="h-5 w-5 text-primary shrink-0" />
                <span className="truncate">{doc.name}</span>
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                <span className="uppercase">{doc.firmware}</span>
                <span className="mx-1.5">·</span>
                {lineCount.toLocaleString()} line{lineCount === 1 ? '' : 's'}
                <span className="mx-1.5">·</span>
                {formatFileSize(byteSize)}
              </p>
            </DialogHeader>
            <DialogBody className="p-0 min-h-[400px] max-h-[65vh]">
              {isEmpty ? (
                <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                  <FileCode className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">Empty program</p>
                  <p className="text-xs text-muted-foreground/60 max-w-xs">
                    This PPCL document has no content yet. Open it in the editor to start writing.
                  </p>
                </div>
              ) : (
                <PpclEditorComponent
                  content={doc.content}
                  onContentChange={() => { /* read-only: never called */ }}
                  charLimit={charLimit}
                  readOnly
                />
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                variant="outline"
                onClick={() => downloadPpcl(doc)}
                className="gap-1.5"
                aria-label={`Download ${doc.name}`}
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
              <Button
                onClick={() => { onOpenChange(false); onOpenInEditor(doc.id); }}
                className="gap-1.5"
              >
                <ExternalLink className="h-4 w-4" />
                Open in Editor
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
