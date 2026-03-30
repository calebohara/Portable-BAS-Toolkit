import Papa from 'papaparse';
import { v4 as uuid } from 'uuid';
import type { TrendDataPoint, TrendSeries } from '@/types';
import { getSeriesColor } from './trend-colors';

export interface ParseOptions {
  delimiter?: string;
  timestampColumn?: number;
  headerRow?: number;
  timestampFormat?: 'auto' | 'iso' | 'unix-s' | 'unix-ms' | 'us-locale' | 'eu-locale';
}

export interface ParseResult {
  data: TrendDataPoint[];
  series: TrendSeries[];
  warnings: string[];
  rowCount: number;
  timeRange: { start: number; end: number };
  detectedDelimiter: string;
  detectedHeaderRow: number;
  detectedTimestampColumn: number;
  rawPreview: string[][];
}

// ─── Delimiter Detection ─────────────────────────────────────

const DELIMITERS = [',', ';', '\t'] as const;

export function detectDelimiter(text: string): string {
  const lines = text.split('\n').filter(l => l.trim()).slice(0, 10);
  if (lines.length === 0) return ',';

  let bestDelim = ',';
  let bestScore = Infinity;

  for (const delim of DELIMITERS) {
    const counts = lines.map(l => l.split(delim).length);
    if (counts[0] < 2) continue; // need at least 2 columns
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length;
    // Lower variance = more consistent column count = better delimiter
    if (variance < bestScore || (variance === bestScore && mean > 1)) {
      bestScore = variance;
      bestDelim = delim;
    }
  }
  return bestDelim;
}

// ─── Timestamp Parsing ───────────────────────────────────────

const US_DATE_RE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(?:\s*(AM|PM))?)?$/i;
const EU_DATE_RE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?$/i;
const ISO_LIKE_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

export function parseTimestamp(value: string, format: ParseOptions['timestampFormat'] = 'auto'): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Purely numeric — Unix timestamps
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const num = parseFloat(trimmed);
    if (format === 'unix-ms' || (format === 'auto' && num > 1e12)) return num;
    if (format === 'unix-s' || (format === 'auto' && num > 1e9)) return num * 1000;
    return null;
  }

  // ISO 8601
  if (format === 'auto' || format === 'iso') {
    if (ISO_LIKE_RE.test(trimmed)) {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) return d.getTime();
    }
  }

  // US locale: MM/DD/YYYY HH:mm:ss
  if (format === 'auto' || format === 'us-locale') {
    const m = trimmed.match(US_DATE_RE);
    if (m) {
      const ts = buildDateFromParts(parseInt(m[2]), parseInt(m[1]), m[3], m[4], m[5], m[6], m[7], m[8]);
      if (ts !== null) return ts;
    }
  }

  // EU locale: DD/MM/YYYY HH:mm:ss
  if (format === 'eu-locale') {
    const m = trimmed.match(EU_DATE_RE);
    if (m) {
      const ts = buildDateFromParts(parseInt(m[1]), parseInt(m[2]), m[3], m[4], m[5], m[6], m[7]);
      if (ts !== null) return ts;
    }
  }

  // Fallback: try Date.parse (catches many formats)
  if (format === 'auto') {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d.getTime();
  }

  return null;
}

function buildDateFromParts(
  day: number, month: number, yearStr: string,
  hourStr?: string, minStr?: string, secStr?: string, msStr?: string, ampm?: string
): number | null {
  let year = parseInt(yearStr);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  let hour = hourStr ? parseInt(hourStr) : 0;
  const min = minStr ? parseInt(minStr) : 0;
  const sec = secStr ? parseInt(secStr) : 0;
  const ms = msStr ? parseInt(msStr.slice(0, 3).padEnd(3, '0')) : 0;

  if (ampm) {
    if (ampm.toUpperCase() === 'PM' && hour < 12) hour += 12;
    if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
  }

  const d = new Date(year, month - 1, day, hour, min, sec, ms);
  if (isNaN(d.getTime())) return null;
  return d.getTime();
}

// ─── Header & Timestamp Column Detection ─────────────────────

function isNumeric(val: string): boolean {
  const t = val.trim();
  return t !== '' && !isNaN(Number(t));
}

export function detectHeaderRow(rows: string[][]): number {
  if (rows.length < 2) return 0;
  const modeColCount = getModeColumnCount(rows);

  for (let i = 0; i < Math.min(rows.length - 1, 20); i++) {
    const row = rows[i];
    if (row.length < modeColCount * 0.8) continue; // skip metadata rows with fewer columns

    const nonNumericCount = row.filter(cell => cell.trim() && !isNumeric(cell) && parseTimestamp(cell) === null).length;
    const nonEmptyCount = row.filter(cell => cell.trim()).length;

    if (nonEmptyCount < 2) continue;
    if (nonNumericCount / nonEmptyCount < 0.4) continue;

    // Check next row has mostly numeric or timestamp values
    const nextRow = rows[i + 1];
    if (!nextRow) continue;
    const nextNumericOrTs = nextRow.filter(cell => {
      const t = cell.trim();
      return t && (isNumeric(t) || parseTimestamp(t) !== null);
    }).length;
    const nextNonEmpty = nextRow.filter(c => c.trim()).length;
    if (nextNonEmpty > 0 && nextNumericOrTs / nextNonEmpty >= 0.4) {
      return i;
    }
  }
  return 0;
}

function getModeColumnCount(rows: string[][]): number {
  const counts: Record<number, number> = {};
  for (const row of rows.slice(0, 20)) {
    counts[row.length] = (counts[row.length] || 0) + 1;
  }
  let maxCount = 0;
  let mode = 0;
  for (const [len, count] of Object.entries(counts)) {
    if (count > maxCount) { maxCount = count; mode = Number(len); }
  }
  return mode;
}

export function detectTimestampColumn(headerRow: string[], sampleRows: string[][]): number {
  let bestCol = 0;
  let bestScore = 0;

  for (let col = 0; col < headerRow.length; col++) {
    let hits = 0;
    const samples = sampleRows.slice(0, 5);
    for (const row of samples) {
      if (col < row.length && parseTimestamp(row[col]) !== null) hits++;
    }
    // Also check if header contains time-related keywords
    const header = headerRow[col].toLowerCase();
    const headerBonus = /time|date|timestamp|epoch/.test(header) ? 0.5 : 0;
    const score = (samples.length > 0 ? hits / samples.length : 0) + headerBonus;
    if (score > bestScore) {
      bestScore = score;
      bestCol = col;
    }
  }
  return bestCol;
}

// ─── Unit Extraction ─────────────────────────────────────────

export function extractUnit(header: string): { name: string; unit: string } {
  const trimmed = header.trim();

  // Match trailing (...) or [...]
  const match = trimmed.match(/^(.+?)\s*[(\[](.*?)[)\]]\s*$/);
  if (match) {
    return { name: match[1].trim(), unit: match[2].trim() };
  }

  // Match common unit suffixes like "degF", "°F", "%RH" at the end
  const suffixMatch = trimmed.match(/^(.+?)\s+(deg[FC]|°[FC]|%RH?|psi|kPa|GPM|CFM|Hz|kW|kWh|Amps?|Volts?)$/i);
  if (suffixMatch) {
    return { name: suffixMatch[1].trim(), unit: suffixMatch[2].trim() };
  }

  return { name: trimmed, unit: '' };
}

// ─── Main Parser ─────────────────────────────────────────────

export async function parseTrendCSV(
  file: File,
  options: ParseOptions = {},
  existingSeriesCount = 0
): Promise<ParseResult> {
  const text = await file.text();
  const warnings: string[] = [];

  // 1. Detect delimiter
  const delimiter = options.delimiter || detectDelimiter(text);

  // 2. Parse with PapaParse
  const parsed = Papa.parse<string[]>(text, {
    delimiter,
    header: false,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    warnings.push(`Parser warnings: ${parsed.errors.slice(0, 3).map(e => e.message).join('; ')}`);
  }

  const allRows = parsed.data;
  if (allRows.length < 2) {
    return emptyResult(delimiter, [], warnings);
  }

  // 3. Detect header row
  const headerRowIdx = options.headerRow ?? detectHeaderRow(allRows);
  const headerRow = allRows[headerRowIdx] || [];
  const dataRows = allRows.slice(headerRowIdx + 1);

  // 4. Detect timestamp column
  const tsCol = options.timestampColumn ?? detectTimestampColumn(headerRow, dataRows);

  // 5. Build series metadata from non-timestamp columns
  const series: TrendSeries[] = [];
  const valueColIndexes: number[] = [];

  for (let col = 0; col < headerRow.length; col++) {
    if (col === tsCol) continue;
    const { name, unit } = extractUnit(headerRow[col] || `Column ${col + 1}`);
    if (!name) continue;

    // Skip quality/status columns
    const lower = name.toLowerCase();
    if (/^(quality|status|reliability|flags?)$/i.test(lower)) continue;

    valueColIndexes.push(col);
    series.push({
      id: uuid(),
      name,
      unit,
      color: getSeriesColor(existingSeriesCount + series.length),
      visible: true,
      yAxisSide: series.length % 2 === 0 ? 'left' : 'right',
      valueType: 'numeric',
      sourceFile: file.name,
    });
  }

  // 6. Parse data rows
  const data: TrendDataPoint[] = [];
  let failedRows = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const tsRaw = row[tsCol];
    if (!tsRaw) { failedRows++; continue; }

    const timestamp = parseTimestamp(tsRaw, options.timestampFormat);
    if (timestamp === null) { failedRows++; continue; }

    const values: Record<string, number | null> = {};
    for (let j = 0; j < valueColIndexes.length; j++) {
      const cell = row[valueColIndexes[j]];
      if (cell === undefined || cell.trim() === '' || cell.trim() === 'null' || cell.trim() === 'NaN') {
        values[series[j].id] = null;
      } else {
        const num = parseFloat(cell);
        values[series[j].id] = isNaN(num) ? null : num;
      }
    }

    data.push({ timestamp, values });
  }

  // Detect binary series
  for (const s of series) {
    const vals = data.map(d => d.values[s.id]).filter((v): v is number => v !== null);
    const unique = new Set(vals);
    if (unique.size <= 3 && vals.every(v => v === 0 || v === 1 || v === 0.0 || v === 1.0)) {
      s.valueType = 'binary';
    }
  }

  if (failedRows > 0) {
    warnings.push(`${failedRows} row(s) could not be parsed (bad timestamp or missing data).`);
  }

  // Sort by timestamp
  data.sort((a, b) => a.timestamp - b.timestamp);

  const rawPreview = allRows.slice(
    Math.max(0, headerRowIdx - 2),
    headerRowIdx + 1 + Math.min(dataRows.length, 20)
  );

  return {
    data,
    series,
    warnings,
    rowCount: data.length,
    timeRange: data.length > 0
      ? { start: data[0].timestamp, end: data[data.length - 1].timestamp }
      : { start: 0, end: 0 },
    detectedDelimiter: delimiter,
    detectedHeaderRow: headerRowIdx,
    detectedTimestampColumn: tsCol,
    rawPreview,
  };
}

function emptyResult(delimiter: string, rawPreview: string[][], warnings: string[]): ParseResult {
  return {
    data: [],
    series: [],
    warnings: [...warnings, 'No data rows found.'],
    rowCount: 0,
    timeRange: { start: 0, end: 0 },
    detectedDelimiter: delimiter,
    detectedHeaderRow: 0,
    detectedTimestampColumn: 0,
    rawPreview,
  };
}

// ─── Multi-File Merge ────────────────────────────────────────

export function mergeParsedResults(results: ParseResult[]): { data: TrendDataPoint[]; series: TrendSeries[] } {
  if (results.length === 0) return { data: [], series: [] };
  if (results.length === 1) return { data: results[0].data, series: results[0].series };

  const allSeries = results.flatMap(r => r.series);

  // Collect all unique timestamps
  const timestampMap = new Map<number, Record<string, number | null>>();

  for (const result of results) {
    for (const point of result.data) {
      const existing = timestampMap.get(point.timestamp) || {};
      for (const [sid, val] of Object.entries(point.values)) {
        existing[sid] = val;
      }
      timestampMap.set(point.timestamp, existing);
    }
  }

  // Build merged data sorted by timestamp
  const allSeriesIds = allSeries.map(s => s.id);
  const data: TrendDataPoint[] = [];

  for (const [timestamp, values] of timestampMap) {
    // Fill null for series not present at this timestamp
    const merged: Record<string, number | null> = {};
    for (const sid of allSeriesIds) {
      merged[sid] = values[sid] ?? null;
    }
    data.push({ timestamp, values: merged });
  }

  data.sort((a, b) => a.timestamp - b.timestamp);

  return { data, series: allSeries };
}
