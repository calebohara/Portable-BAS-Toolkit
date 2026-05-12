'use client';

import { useState, useMemo, useEffect } from 'react';
import { ClipboardPaste, AlertCircle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { parseDxrTsv, CANONICAL_COLUMN_ORDER, type DxrImportRow } from '@/lib/dxr/xlsx-parser';

const COLUMN_LABELS: Partial<Record<keyof DxrImportRow, string>> = {
  name: 'Name',
  location: 'Location',
  description: 'Description',
  deviceInstanceNumber: 'Device Instance #',
  equipmentId: 'Equipment ID',
  serialNumber: 'Serial Number',
  applicationTemplate: 'Application Template',
  applicationNumber: 'Application Number',
  network: 'Network',
  autoAddressing: 'Auto Addressing',
  macAddress: 'MAC Address',
  maxManagerAddress: 'Max. Manager Address',
  baudRate: 'Baud Rate',
  roomHierarchy: 'Room Hierarchy',
  roomName: 'Room Name',
  roomDescription: 'Room Description',
  segmentHierarchy: 'Segment Hierarchy',
  segmentName: 'Segment Name',
  segmentDescription: 'Segment Description',
  msTpNwId: 'MS/TP NW ID',
  guid: 'GUID',
};

interface DxrSmartPasteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  bulkImport: (rows: DxrImportRow[]) => Promise<{ inserted: number; updated: number }>;
  onCreated?: (count: number) => void;
}

export function DxrSmartPasteDialog({
  open,
  onOpenChange,
  bulkImport,
  onCreated,
}: DxrSmartPasteDialogProps) {
  const [text, setText] = useState('');
  const [hasHeader, setHasHeader] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; updated: number } | null>(null);

  useEffect(() => {
    if (open) {
      setText('');
      setHasHeader(false);
      setSubmitting(false);
      setResult(null);
    }
  }, [open]);

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    return parseDxrTsv(text, { hasHeader });
  }, [text, hasHeader]);

  const handleSubmit = async () => {
    if (!parsed || parsed.rows.length === 0) return;
    setSubmitting(true);
    try {
      const r = await bulkImport(parsed.rows);
      setResult(r);
      onCreated?.(parsed.rows.length);
      // auto-close after a short success display
      setTimeout(() => onOpenChange(false), 1400);
    } finally {
      setSubmitting(false);
    }
  };

  const previewRows = parsed?.rows.slice(0, 5) ?? [];
  const previewCols = CANONICAL_COLUMN_ORDER.slice(0, 6);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create DXRs from Smart Paste</DialogTitle>
          <DialogDescription>
            Copy a range of cells from Excel and paste below. Columns are matched by position, in the exact order they
            appear in a DXR Smart Copy export.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="px-5 pb-1 space-y-4">
          {/* Column-order reference */}
          <details className="rounded-md border bg-muted/30 text-xs">
            <summary className="cursor-pointer select-none px-3 py-2 font-medium">
              Expected column order (21 columns)
            </summary>
            <ol className="px-6 py-2 space-y-0.5 list-decimal text-muted-foreground">
              {CANONICAL_COLUMN_ORDER.map((key) => (
                <li key={key}>{COLUMN_LABELS[key]}</li>
              ))}
            </ol>
          </details>

          {/* Paste area */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="dxr-smart-paste" className="text-sm font-medium">
                Pasted data
              </Label>
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-input accent-primary cursor-pointer"
                  checked={hasHeader}
                  onChange={(e) => setHasHeader(e.target.checked)}
                />
                <span>First row is a header (skip it)</span>
              </label>
            </div>
            <Textarea
              id="dxr-smart-paste"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste tab-separated rows here (Ctrl+V after copying from Excel)..."
              className="font-mono text-xs min-h-32 max-h-48"
              spellCheck={false}
              disabled={submitting || !!result}
            />
          </div>

          {/* Parse status */}
          {parsed && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">
                  Detected: {parsed.rows.length} row{parsed.rows.length === 1 ? '' : 's'} ·{' '}
                  {parsed.detectedColumns} column{parsed.detectedColumns === 1 ? '' : 's'}
                </span>
              </div>

              {parsed.warnings.length > 0 && (
                <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-yellow-700 dark:text-yellow-500 text-xs font-medium">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {parsed.warnings.length} warning{parsed.warnings.length === 1 ? '' : 's'}
                  </div>
                  <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5 max-h-24 overflow-y-auto">
                    {parsed.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Preview table */}
              {parsed.rows.length > 0 && (
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        {previewCols.map((key) => (
                          <th key={key} className="text-left px-2 py-1.5 font-medium whitespace-nowrap">
                            {COLUMN_LABELS[key]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, ri) => (
                        <tr key={ri} className="border-t">
                          {previewCols.map((key) => {
                            const v = row[key];
                            const display =
                              v === null || v === undefined || v === ''
                                ? '—'
                                : typeof v === 'boolean'
                                  ? v ? 'True' : 'False'
                                  : String(v);
                            return (
                              <td key={key} className="px-2 py-1 whitespace-nowrap">
                                {display}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsed.rows.length > 5 && (
                    <div className="text-xs text-muted-foreground px-2 py-1 border-t">
                      …and {parsed.rows.length - 5} more
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Success state */}
          {result && (
            <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3 text-sm">
              Created {result.inserted + result.updated} DXR{result.inserted + result.updated === 1 ? '' : 's'} (
              {result.inserted} new, {result.updated} updated).
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {result ? 'Close' : 'Cancel'}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!parsed || parsed.rows.length === 0 || submitting || !!result}
            className="gap-1.5"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ClipboardPaste className="h-4 w-4" />
            )}
            {parsed && parsed.rows.length > 0
              ? `Create ${parsed.rows.length} DXR${parsed.rows.length === 1 ? '' : 's'}`
              : 'Create DXRs'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
