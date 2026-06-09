'use client';

/**
 * DxrImportDialog
 *
 * Visual parity with upload-file-dialog.tsx:
 * - Same Dialog primitive (DialogContent max-w-lg), DialogHeader, DialogBody, DialogFooter
 * - Same drop-zone: border-2 border-dashed, border-primary on drag, FileUp icon when file selected
 * - Same Cancel/Confirm button placement and sizing in DialogFooter
 * - Differences (intentional):
 *   - No category/notes/panel/tags form fields — body is parse-preview instead
 *   - Single-file only (one file per import) vs multi-file in upload dialog
 *   - Custom body states: Pick → Parse → Preview → Importing → Success
 *   - Confirm text is dynamic ("Import N DXRs") vs static "Upload"
 */

import { useState, useRef, useCallback } from 'react';
import { Upload, FileUp, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { parseDxrXlsx } from '@/lib/dxr/xlsx-parser';
import type { DxrImportRow } from '@/lib/dxr/xlsx-parser';
import { bulkUpsertProjectDxrs, saveFile, saveFileBlob, addActivity } from '@/lib/db';
import { roamFileToStorage } from '@/lib/file-roaming';
import type { ProjectFile, FileVersion } from '@/types';
import { sanitizeFilename } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onImported?: (count: number) => void;
}

type ImportStage = 'pick' | 'parse' | 'preview' | 'importing' | 'success';

/** The 6 default visible columns for the preview table */
const PREVIEW_COLS: Array<{ key: keyof DxrImportRow; label: string }> = [
  { key: 'name',                 label: 'Name' },
  { key: 'description',          label: 'Description' },
  { key: 'deviceInstanceNumber', label: 'Device Instance #' },
  { key: 'macAddress',           label: 'MAC Address' },
  { key: 'network',              label: 'Network' },
  { key: 'applicationTemplate',  label: 'App Template' },
];

function displayCell(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—';
  return String(val);
}

export function DxrImportDialog({ open, onOpenChange, projectId, onImported }: Props) {
  const [stage, setStage] = useState<ImportStage>('pick');
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<DxrImportRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  const reset = useCallback(() => {
    setStage('pick');
    setDragOver(false);
    setFile(null);
    setRows([]);
    setWarnings([]);
    setImportResult(null);
    setError(null);
    processingRef.current = false;
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && stage === 'importing') return; // block close during import
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  // ── File selection ──────────────────────────────────────────
  const processFile = useCallback(async (f: File) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setFile(f);
    setStage('parse');
    setError(null);

    try {
      const result = await parseDxrXlsx(f);
      setRows(result.rows);
      setWarnings(result.warnings);
      setStage('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected parse error');
      setStage('pick');
    } finally {
      processingRef.current = false;
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    const xlsx = dropped.find((f) => f.name.match(/\.(xlsx|xls)$/i));
    if (xlsx) processFile(xlsx);
  }, [processFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) processFile(selected);
    if (e.target) e.target.value = '';
  };

  // ── Import ──────────────────────────────────────────────────
  const handleImport = async () => {
    if (rows.length === 0 || processingRef.current) return;
    processingRef.current = true;
    setStage('importing');
    setError(null);

    try {
      // 1. Save source .xlsx as a ProjectFile (category: 'general-documents')
      let savedFileId: string | undefined;
      if (file) {
        try {
          const now = new Date().toISOString();
          const fileId = crypto.randomUUID();
          const versionId = crypto.randomUUID();
          const blobKey = crypto.randomUUID();
          const titleFromName = file.name.replace(/\.[^.]+$/, '');
          const ext = (file.name.split('.').pop() ?? 'xlsx').toLowerCase();

          const version: FileVersion = {
            id: versionId,
            fileId,
            versionNumber: 1,
            uploadedAt: now,
            uploadedBy: 'DXR Import',
            notes: `Source for DXR import on ${now.slice(0, 10)}`,
            size: file.size,
            status: 'current',
            blobKey,
          };

          const projectFile: ProjectFile = {
            id: fileId,
            projectId,
            title: titleFromName,
            fileName: sanitizeFilename(file.name),
            fileType: ext,
            mimeType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            category: 'general-documents',
            revisionNumber: 'Rev 1',
            revisionDate: now,
            uploadedBy: 'DXR Import',
            notes: `Source for DXR import on ${now.slice(0, 10)}`,
            tags: ['dxr-import'],
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
          // GAP-1: roam the source blob to Storage for other devices (best-effort).
          void roamFileToStorage(projectFile, versionId, file).catch(() => {});
          await addActivity({
            id: crypto.randomUUID(),
            projectId,
            action: 'file_uploaded',
            details: `DXR import source "${titleFromName}" saved`,
            timestamp: now,
            user: 'DXR Import',
            fileId,
          });

          savedFileId = fileId;
        } catch (fileErr) {
          console.warn('[DxrImportDialog] Source file save failed (rows will still import):', fileErr);
        }
      }

      // 2. Stamp importedFromFileId if file save succeeded
      const rowsWithFileId: DxrImportRow[] = savedFileId
        ? rows.map((r) => ({ ...r, importedFromFileId: savedFileId }))
        : rows;

      // 3. Bulk upsert rows
      const result = await bulkUpsertProjectDxrs(projectId, rowsWithFileId);
      setImportResult(result);
      setStage('success');

      // 4. Auto-close after 1.2s
      setTimeout(() => {
        onImported?.(result.inserted + result.updated);
        onOpenChange(false);
        reset();
      }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed unexpectedly');
      setStage('preview'); // revert so user can retry
      processingRef.current = false;
    }
  };

  const isImporting = stage === 'importing';
  const confirmDisabled =
    isImporting ||
    stage === 'success' ||
    stage === 'parse' ||
    (rows.length === 0 && warnings.length > 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import DXRs from .xlsx</DialogTitle>
          <DialogDescription>
            Import a Desigo CC &quot;DXR Smart Copy&quot; export. Existing rows are updated by GUID.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="px-5 pb-1 space-y-4">

          {/* ── Error banner ─────────────────────────────────── */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* ── Success banner ────────────────────────────────── */}
          {stage === 'success' && importResult && (
            <div className="flex items-center gap-2 rounded-lg border border-field-success/30 bg-field-success/5 p-3">
              <CheckCircle2 className="h-4 w-4 text-field-success shrink-0" />
              <p className="text-sm font-medium">
                Imported {importResult.inserted + importResult.updated} DXRs
                ({importResult.inserted} new, {importResult.updated} updated)
              </p>
            </div>
          )}

          {/* ── Importing state ───────────────────────────────── */}
          {stage === 'importing' && (
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              <p className="text-sm">Importing {rows.length} DXRs...</p>
            </div>
          )}

          {/* ── Drop zone (pick + preview states) ────────────── */}
          {(stage === 'pick' || stage === 'preview') && (
            <div
              className={cn(
                'relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer',
                dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                stage === 'preview' && 'border-field-success/50 bg-field-success/5',
              )}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
              {stage === 'preview' && file ? (
                <>
                  <FileUp className="h-8 w-8 text-field-success" />
                  <div className="text-center">
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Parsed {rows.length} rows — click or drop to replace
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Drop .xlsx here or click to browse</p>
                    <p className="text-xs text-muted-foreground">XLSX or XLS — one file</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Parse state (brief spinner while parsing) ─────── */}
          {stage === 'parse' && (
            <div className="flex items-center gap-3 rounded-lg border border-border p-4">
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              <p className="text-sm">Parsing {file?.name}...</p>
            </div>
          )}

          {/* ── Warnings callout ──────────────────────────────── */}
          {stage === 'preview' && warnings.length > 0 && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-1">
              <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400">
                {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
              </p>
              <ul className="space-y-0.5">
                {warnings.map((w, i) => (
                  <li key={i} className="text-xs text-yellow-700/80 dark:text-yellow-400/80">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Preview table (first 5 rows × 6 columns) ─────── */}
          {stage === 'preview' && rows.length > 0 && (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {PREVIEW_COLS.map((col) => (
                      <TableHead key={col.key} className="text-xs whitespace-nowrap">
                        {col.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 5).map((row, idx) => (
                    <TableRow key={idx}>
                      {PREVIEW_COLS.map((col) => (
                        <TableCell key={col.key} className="text-xs font-mono max-w-36 truncate">
                          {displayCell(row[col.key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > 5 && (
                <p className="text-xs text-muted-foreground px-3 py-2 border-t border-border">
                  Showing 5 of {rows.length} rows
                </p>
              )}
            </div>
          )}

          {/* ── Empty parse result with no warnings ───────────── */}
          {stage === 'preview' && rows.length === 0 && warnings.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              No data rows found in the file.
            </p>
          )}

        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isImporting}
          >
            {stage === 'success' ? 'Close' : 'Cancel'}
          </Button>
          {stage !== 'success' && (
            <Button
              onClick={handleImport}
              disabled={confirmDisabled}
            >
              {isImporting ? (
                <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Importing...</>
              ) : rows.length > 0 ? (
                `Import ${rows.length} DXRs`
              ) : (
                'Import'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
