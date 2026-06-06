'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseTrendCSV, type ParseResult, type ParseOptions } from '@/lib/trend-csv-parser';
import { CsvPreviewDialog } from './csv-preview-dialog';
import { toast } from 'sonner';

interface CsvUploadPanelProps {
  onFilesLoaded: (results: ParseResult[]) => void;
  existingSeriesCount: number;
}

interface PendingFile {
  file: File;
  result: ParseResult;
}

export function CsvUploadPanel({ onFilesLoaded, existingSeriesCount }: CsvUploadPanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  // Files parsed alongside the previewed one in a multi-file drop, awaiting
  // auto-load after the preview is confirmed. Their series offset already
  // accounts for the previewed file's series.
  const [queuedResults, setQueuedResults] = useState<ParseResult[]>([]);
  const [loadedFiles, setLoadedFiles] = useState<{ name: string; rows: number; series: number }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const summarize = (r: ParseResult) => ({
    name: r.series[0]?.sourceFile || 'Unknown',
    rows: r.rowCount,
    series: r.series.length,
  });

  const handleFiles = useCallback(async (files: FileList) => {
    setIsProcessing(true);
    const results: ParseResult[] = [];
    // The first valid CSV gets a preview; the rest auto-load. Reserve the
    // previewed file's series slots by parsing it first so subsequent offsets
    // don't collide.
    let firstPending: PendingFile | null = null;
    let offset = existingSeriesCount;

    for (const file of Array.from(files)) {
      if (!file.name.match(/\.csv$/i)) {
        toast.error(`Skipped ${file.name} — not a CSV file`);
        continue;
      }
      try {
        const result = await parseTrendCSV(file, {}, offset);
        if (result.series.length === 0) {
          toast.error(`No data columns found in ${file.name}`);
          continue;
        }
        offset += result.series.length;
        if (!firstPending && loadedFiles.length === 0) {
          firstPending = { file, result };
        } else {
          results.push(result);
        }
      } catch (e) {
        toast.error(`Failed to parse ${file.name}`);
        console.error(e);
      }
    }

    if (firstPending) {
      // Show preview for the first; stash the rest to load on confirm.
      setQueuedResults(results);
      setPendingFile(firstPending);
      if (results.length > 0) {
        toast.info(`${results.length} more file(s) will load after you confirm the preview`);
      }
    } else if (results.length > 0) {
      // Already have loaded files — no preview; load everything directly.
      setLoadedFiles(prev => [...prev, ...results.map(summarize)]);
      onFilesLoaded(results);
    }
    setIsProcessing(false);
  }, [existingSeriesCount, loadedFiles.length, onFilesLoaded]);

  const handlePreviewConfirm = useCallback((result: ParseResult) => {
    const all = [result, ...queuedResults];
    setLoadedFiles(prev => [...prev, ...all.map(summarize)]);
    onFilesLoaded(all);
    setPendingFile(null);
    setQueuedResults([]);
  }, [onFilesLoaded, queuedResults]);

  const handlePreviewCancel = useCallback(() => {
    // Cancelling the preview discards the whole drop, including queued files.
    if (queuedResults.length > 0) {
      toast.info(`Cancelled — ${queuedResults.length} queued file(s) were not loaded`);
    }
    setPendingFile(null);
    setQueuedResults([]);
  }, [queuedResults.length]);

  const handleReparse = useCallback(async (options: ParseOptions) => {
    if (!pendingFile) return;
    const result = await parseTrendCSV(pendingFile.file, options, existingSeriesCount);
    setPendingFile({ file: pendingFile.file, result });
  }, [pendingFile, existingSeriesCount]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  return (
    <>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors',
          isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/50',
          isProcessing && 'pointer-events-none opacity-60'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          multiple
          className="hidden"
          onChange={e => e.target.files && handleFiles(e.target.files)}
        />

        {isProcessing ? (
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="h-8 w-8 text-muted-foreground" />
        )}

        <div className="text-center">
          <p className="text-sm font-medium">
            {loadedFiles.length > 0 ? 'Add more CSV files' : 'Drop trend CSVs here or click to browse'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Supports Niagara, Desigo, Metasys, EcoStruxure, WebCTRL and generic CSV exports
          </p>
        </div>
      </div>

      {/* Loaded files summary */}
      {loadedFiles.length > 0 && (
        <div className="mt-3 space-y-1">
          {loadedFiles.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5 text-xs">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate font-medium">{f.name}</span>
              <span className="text-muted-foreground ml-auto shrink-0">
                {f.rows.toLocaleString()} rows, {f.series} series
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Preview dialog */}
      {pendingFile && (
        <CsvPreviewDialog
          open
          file={pendingFile.file}
          parseResult={pendingFile.result}
          onConfirm={handlePreviewConfirm}
          onReparse={handleReparse}
          onCancel={handlePreviewCancel}
        />
      )}
    </>
  );
}
