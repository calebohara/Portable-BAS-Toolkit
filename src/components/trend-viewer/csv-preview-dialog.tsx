'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Check } from 'lucide-react';
import type { ParseResult, ParseOptions } from '@/lib/trend-csv-parser';

interface CsvPreviewDialogProps {
  open: boolean;
  file: File;
  parseResult: ParseResult;
  onConfirm: (result: ParseResult) => void;
  onReparse: (options: ParseOptions) => void;
  onCancel: () => void;
}

export function CsvPreviewDialog({ open, file, parseResult, onConfirm, onReparse, onCancel }: CsvPreviewDialogProps) {
  const [tsFormat, setTsFormat] = useState<ParseOptions['timestampFormat']>('auto');
  const [headerRow, setHeaderRow] = useState(parseResult.detectedHeaderRow.toString());
  const [delimiter, setDelimiter] = useState(parseResult.detectedDelimiter);

  const handleReparse = () => {
    const delimMap: Record<string, string> = { comma: ',', semicolon: ';', tab: '\t' };
    onReparse({
      timestampFormat: tsFormat,
      headerRow: parseInt(headerRow) || 0,
      delimiter: delimMap[delimiter] || delimiter,
    });
  };

  const delimDisplay = parseResult.detectedDelimiter === ',' ? 'comma'
    : parseResult.detectedDelimiter === ';' ? 'semicolon'
    : parseResult.detectedDelimiter === '\t' ? 'tab' : 'comma';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Preview: {file.name}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {/* Detection summary */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {parseResult.rowCount.toLocaleString()} rows
            </Badge>
            <Badge variant="secondary">
              {parseResult.series.length} series
            </Badge>
            <Badge variant="secondary">
              Delimiter: {delimDisplay}
            </Badge>
            <Badge variant="secondary">
              Header: row {parseResult.detectedHeaderRow + 1}
            </Badge>
            <Badge variant="secondary">
              Timestamp: col {parseResult.detectedTimestampColumn + 1}
            </Badge>
          </div>

          {/* Warnings */}
          {parseResult.warnings.length > 0 && (
            <div className="rounded-md bg-field-warning/10 p-3 space-y-1">
              {parseResult.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-field-warning">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Override controls */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Timestamp Format</Label>
              <Select value={tsFormat} onValueChange={(v) => v && setTsFormat(v as ParseOptions['timestampFormat'])}>
                <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto Detect</SelectItem>
                  <SelectItem value="iso">ISO 8601</SelectItem>
                  <SelectItem value="unix-ms">Unix ms</SelectItem>
                  <SelectItem value="unix-s">Unix seconds</SelectItem>
                  <SelectItem value="us-locale">US (MM/DD/YYYY)</SelectItem>
                  <SelectItem value="eu-locale">EU (DD/MM/YYYY)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Delimiter</Label>
              <Select value={delimiter === ',' ? 'comma' : delimiter === ';' ? 'semicolon' : 'tab'}
                onValueChange={(v) => {
                  if (!v) return;
                  setDelimiter(v === 'comma' ? ',' : v === 'semicolon' ? ';' : '\t');
                }}>
                <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="comma">Comma</SelectItem>
                  <SelectItem value="semicolon">Semicolon</SelectItem>
                  <SelectItem value="tab">Tab</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Header Row</Label>
              <div className="flex gap-1">
                <Input
                  type="number"
                  min="0"
                  value={headerRow}
                  onChange={e => setHeaderRow(e.target.value)}
                  className="h-8 text-sm"
                />
                <Button variant="outline" size="sm" onClick={handleReparse}>
                  Re-parse
                </Button>
              </div>
            </div>
          </div>

          {/* Data preview table */}
          <div className="max-h-64 overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <tbody>
                {parseResult.rawPreview.slice(0, 25).map((row, ri) => {
                  const isHeader = ri === Math.min(parseResult.detectedHeaderRow, parseResult.rawPreview.length - 1);
                  return (
                    <tr key={ri} className={isHeader ? 'bg-primary/10 font-semibold' : ri % 2 === 0 ? 'bg-muted/30' : ''}>
                      <td className="px-2 py-1 text-muted-foreground border-r w-8">{ri + 1}</td>
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className={`px-2 py-1 max-w-[150px] truncate ${ci === parseResult.detectedTimestampColumn ? 'bg-primary/5' : ''}`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Series listing */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Detected Series:</p>
            <div className="flex flex-wrap gap-1.5">
              {parseResult.series.map(s => (
                <Badge key={s.id} variant="outline" className="text-xs">
                  <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ backgroundColor: s.color }} />
                  {s.name}{s.unit ? ` (${s.unit})` : ''}
                </Badge>
              ))}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onConfirm(parseResult)} disabled={parseResult.data.length === 0}>
            <Check className="h-4 w-4 mr-1.5" />
            Load {parseResult.rowCount.toLocaleString()} rows
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
