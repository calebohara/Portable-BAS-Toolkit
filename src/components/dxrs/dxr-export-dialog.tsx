'use client';

import { useState, useEffect } from 'react';
import { Download, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export interface ExportColumnDef {
  key: string;
  label: string;
}

interface DxrExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: Record<string, unknown>[];
  columns: ExportColumnDef[];
  defaultSelectedKeys: string[];
  defaultFilename: string;
}

export function DxrExportDialog({
  open,
  onOpenChange,
  rows,
  columns,
  defaultSelectedKeys,
  defaultFilename,
}: DxrExportDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultSelectedKeys));
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set(defaultSelectedKeys));
      setFormat('xlsx');
    }
  }, [open, defaultSelectedKeys]);

  const allSelected = selected.size === columns.length;
  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(columns.map((c) => c.key)));
    }
  };

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleExport = () => {
    if (selected.size === 0 || rows.length === 0) return;
    setExporting(true);
    try {
      const chosen = columns.filter((c) => selected.has(c.key));
      const data = rows.map((row) => {
        const out: Record<string, unknown> = {};
        for (const col of chosen) {
          const v = row[col.key];
          out[col.label] = v === null || v === undefined ? '' : v;
        }
        return out;
      });
      const ws = XLSX.utils.json_to_sheet(data, {
        header: chosen.map((c) => c.label),
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'DXRs');
      const ext = format === 'xlsx' ? 'xlsx' : 'csv';
      XLSX.writeFile(wb, `${defaultFilename}.${ext}`, {
        bookType: format === 'xlsx' ? 'xlsx' : 'csv',
      });
      onOpenChange(false);
    } finally {
      setExporting(false);
    }
  };

  const rowLabel = rows.length === 1 ? 'row' : 'rows';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export DXRs</DialogTitle>
          <DialogDescription>
            Choose which columns to include. {rows.length} {rowLabel} will be exported.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="px-5 pb-1 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Columns</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={toggleAll}
                className="h-7 text-xs"
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-1 max-h-64 overflow-y-auto rounded-md border p-2">
              {columns.map((col) => {
                const checked = selected.has(col.key);
                return (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 px-2 py-1 rounded select-none"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                      checked={checked}
                      onChange={() => toggle(col.key)}
                    />
                    <span className="truncate">{col.label}</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {selected.size} of {columns.length} columns selected
            </p>
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as 'xlsx' | 'csv')}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                <SelectItem value="csv">CSV (.csv)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={exporting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleExport}
            disabled={selected.size === 0 || rows.length === 0 || exporting}
            className="gap-1.5"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export {rows.length} {rowLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
