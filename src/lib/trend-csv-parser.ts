import Papa from 'papaparse';
import { v4 as uuid } from 'uuid';
import type { TrendDataPoint, TrendSeries } from '@/types';
import { getSeriesColor } from './trend-colors';

export interface ParseOptions {
  delimiter?: string;
  timestampColumn?: number;
  headerRow?: number;
  timestampFormat?: 'auto' | 'iso' | 'unix-s' | 'unix-ms' | 'us-locale' | 'eu-locale';
  /**
   * How to interpret non-ISO date/time strings (US/EU locale formats, which carry
   * no timezone). 'local' (default) uses the browser timezone; 'utc' treats them as
   * UTC. ISO strings with an explicit offset/Z are always honoured as written, so
   * this only affects the locale branches. Set consistently across files before a
   * multi-file merge so overlays don't drift by the local UTC offset.
   */
  timezone?: 'local' | 'utc';
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
  detectedDecimalSeparator: '.' | ',';
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

export function parseTimestamp(
  value: string,
  format: ParseOptions['timestampFormat'] = 'auto',
  timezone: ParseOptions['timezone'] = 'local',
): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Purely numeric — Unix timestamps
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const num = parseFloat(trimmed);
    if (format === 'unix-ms' || (format === 'auto' && num > 1e12)) return num;
    if (format === 'unix-s' || (format === 'auto' && num > 1e9)) return num * 1000;
    return null;
  }

  // ISO 8601 — `new Date` honours an explicit Z / ±offset; a bare ISO string is
  // local time per the ECMAScript spec for date-time forms with a time part.
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
      const ts = buildDateFromParts(parseInt(m[2]), parseInt(m[1]), m[3], m[4], m[5], m[6], m[7], m[8], timezone);
      if (ts !== null) return ts;
    }
  }

  // EU locale: DD/MM/YYYY HH:mm:ss
  if (format === 'eu-locale') {
    const m = trimmed.match(EU_DATE_RE);
    if (m) {
      const ts = buildDateFromParts(parseInt(m[1]), parseInt(m[2]), m[3], m[4], m[5], m[6], m[7], undefined, timezone);
      if (ts !== null) return ts;
    }
  }

  // No silent `new Date(trimmed)` catch-all: V8 would fabricate timestamps for
  // ambiguous text ("May 20" → current year, "12:30" → today), placing data at
  // the wrong time with no signal. Unmatched strings return null so the caller
  // can surface them as ambiguous/failed rows.
  return null;
}

function buildDateFromParts(
  day: number, month: number, yearStr: string,
  hourStr?: string, minStr?: string, secStr?: string, msStr?: string, ampm?: string,
  timezone: ParseOptions['timezone'] = 'local',
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

  const ts = timezone === 'utc'
    ? Date.UTC(year, month - 1, day, hour, min, sec, ms)
    : new Date(year, month - 1, day, hour, min, sec, ms).getTime();
  if (isNaN(ts)) return null;
  return ts;
}

// Common BMS null-ish / bad-quality sentinels (WebCTRL `#N/A`, Niagara `null`,
// generic `NaN`, `N/A`, `bad`, `none`, em-dash `—`, double-dash `--`). Matched
// case-insensitively against an already-trimmed cell so they become null cells
// instead of being silently coerced by parseLocaleFloat.
const BAD_QUALITY_RE = /^(null|nan|n\/a|#n\/a|bad|none|—|--)$/i;

// ─── Locale-Aware Numeric Parsing ────────────────────────────

// Matches a comma-decimal number with optional dot thousands separators,
// e.g. "1,5", "-1,5", "1.234,56", "12.345.678,9".
const EU_DECIMAL_RE = /^[+-]?(\d{1,3}(\.\d{3})+|\d+),\d+$/;
// Matches a dot-decimal number with optional comma thousands separators,
// e.g. "1.5", "1,234.56".
const US_DECIMAL_RE = /^[+-]?(\d{1,3}(,\d{3})+|\d+)\.\d+$/;

/**
 * Parse a numeric cell that may use either US (`1,234.56`) or EU (`1.234,56`)
 * conventions. `decimalSeparator` is the separator detected for the file as a
 * whole; the opposite character is treated as a (strippable) thousands grouping
 * separator. NOTE: this operates on a cell that has *already* been split out of
 * the CSV by the column delimiter, so an in-cell comma can only ever be a
 * decimal or thousands separator — never a column delimiter.
 */
export function parseLocaleFloat(raw: string, decimalSeparator: '.' | ',' = '.'): number {
  const t = raw.trim();
  if (t === '') return NaN;

  let normalized: string;
  if (decimalSeparator === ',') {
    // EU: dots are thousands separators, comma is the decimal point.
    normalized = t.replace(/\./g, '').replace(',', '.');
  } else {
    // US: commas are thousands separators, dot is the decimal point.
    normalized = t.replace(/,/g, '');
  }

  return parseFloat(normalized);
}

/**
 * Sample value cells to decide whether the file uses comma decimal separators.
 * Returns ',' when comma-decimals clearly dominate dot-decimals, else '.'.
 */
export function detectDecimalSeparator(
  dataRows: string[][],
  valueColIndexes: number[],
  format?: ParseOptions['timestampFormat'],
): '.' | ',' {
  // Explicit locale selection wins over heuristics for consistency.
  if (format === 'eu-locale') return ',';
  if (format === 'us-locale' || format === 'iso') return '.';

  let euHits = 0;
  let usHits = 0;
  const maxSamples = 200;
  let seen = 0;

  outer: for (const row of dataRows) {
    for (const col of valueColIndexes) {
      const cell = row[col];
      if (cell === undefined) continue;
      const t = cell.trim();
      if (t === '') continue;
      if (EU_DECIMAL_RE.test(t)) euHits++;
      else if (US_DECIMAL_RE.test(t)) usHits++;
      if (++seen >= maxSamples) break outer;
    }
  }

  return euHits > usHits ? ',' : '.';
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
    if (rowIsMostlyData(nextRow)) {
      return i;
    }

    // Some BMS exports (Niagara/Desigo) put a short units row (°F, %, psi, …)
    // directly below the header. Such a row is mostly non-numeric/non-timestamp
    // (so the check above fails) but its cells are short (1–2 tokens). When the
    // row below *that* is real data, treat i as the header and i+1 as a units
    // row to skip — i.e. data begins at i+2.
    const rowAfterNext = rows[i + 2];
    if (rowAfterNext && rowIsShortUnitsRow(nextRow) && rowIsMostlyData(rowAfterNext)) {
      return i;
    }
  }
  return 0;
}

/** A row whose non-empty cells are at least 40% numeric or parseable timestamps. */
function rowIsMostlyData(row: string[]): boolean {
  const numericOrTs = row.filter(cell => {
    const t = cell.trim();
    return t && (isNumeric(t) || parseTimestamp(t) !== null);
  }).length;
  const nonEmpty = row.filter(c => c.trim()).length;
  return nonEmpty > 0 && numericOrTs / nonEmpty >= 0.4;
}

/**
 * A short, mostly non-numeric row — the signature of a units row beneath a
 * header (`°F, %, psi`). Each non-empty cell holds 1–2 whitespace-separated
 * tokens and the row is predominantly non-numeric/non-timestamp.
 */
function rowIsShortUnitsRow(row: string[]): boolean {
  const nonEmpty = row.filter(c => c.trim());
  if (nonEmpty.length < 2) return false;
  const allShort = nonEmpty.every(c => c.trim().split(/\s+/).length <= 2);
  if (!allShort) return false;
  const nonNumeric = nonEmpty.filter(c => {
    const t = c.trim();
    return !isNumeric(t) && parseTimestamp(t) === null;
  }).length;
  return nonNumeric / nonEmpty.length >= 0.6;
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

  // Skip a units row (e.g. °F, %, psi) sitting between the header and the data —
  // common in Niagara/Desigo exports. Only skip when the row below the header
  // looks like units and the row after that looks like real data.
  const unitsRow = allRows[headerRowIdx + 1];
  const skipUnitsRow =
    options.headerRow === undefined &&
    !!unitsRow &&
    rowIsShortUnitsRow(unitsRow) &&
    !rowIsMostlyData(unitsRow) &&
    !!allRows[headerRowIdx + 2] &&
    rowIsMostlyData(allRows[headerRowIdx + 2]);
  const dataStartIdx = headerRowIdx + (skipUnitsRow ? 2 : 1);
  const dataRows = allRows.slice(dataStartIdx);
  if (skipUnitsRow) {
    warnings.push('Detected a units row beneath the header — skipped.');
  }

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

  // 6. Detect decimal separator (EU exports like Desigo/Bosch/ABB use commas).
  const decimalSeparator = detectDecimalSeparator(dataRows, valueColIndexes, options.timestampFormat);
  if (decimalSeparator === ',') {
    warnings.push('Detected EU-format decimals (comma separator) — values normalized accordingly.');
  }

  // 7. Parse data rows
  const data: TrendDataPoint[] = [];
  let missingTsRows = 0;   // empty timestamp cell
  let ambiguousTsRows = 0; // non-empty but unparseable timestamp
  let badQualityCells = 0; // recognized bad-quality / null-ish sentinels
  const timezone = options.timezone ?? 'local';

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const tsRaw = row[tsCol];
    if (!tsRaw || !tsRaw.trim()) { missingTsRows++; continue; }

    const timestamp = parseTimestamp(tsRaw, options.timestampFormat, timezone);
    if (timestamp === null) { ambiguousTsRows++; continue; }

    const values: Record<string, number | null> = {};
    for (let j = 0; j < valueColIndexes.length; j++) {
      const cell = row[valueColIndexes[j]];
      const t = cell?.trim() ?? '';
      if (t === '') {
        values[series[j].id] = null;
      } else if (BAD_QUALITY_RE.test(t)) {
        // Recognized BMS null-ish / bad-quality sentinel (#N/A, null, NaN, --, —, …).
        values[series[j].id] = null;
        badQualityCells++;
      } else {
        const num = parseLocaleFloat(cell, decimalSeparator);
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

  if (missingTsRows > 0) {
    warnings.push(`${missingTsRows} row(s) skipped — empty timestamp cell.`);
  }
  if (ambiguousTsRows > 0) {
    warnings.push(`${ambiguousTsRows} row(s) skipped — ambiguous/unrecognized date format. Try setting the Timestamp Format explicitly.`);
  }
  if (badQualityCells > 0) {
    warnings.push(`${badQualityCells} bad-quality cell(s) (e.g. #N/A, null, NaN) treated as missing.`);
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
    detectedDecimalSeparator: decimalSeparator,
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
    detectedDecimalSeparator: '.',
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
