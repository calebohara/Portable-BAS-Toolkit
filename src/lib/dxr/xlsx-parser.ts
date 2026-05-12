/**
 * xlsx-parser.ts
 *
 * Parses a "DXR Smart Copy" Excel export from Desigo CC into an array of
 * DxrEntry-shaped objects (minus id / projectId / createdAt / updatedAt —
 * those are added by bulkUpsertProjectDxrs in db.ts).
 *
 * Dependencies: `xlsx` (SheetJS, MIT licence).
 */

import type { DxrEntry } from '@/types';

// ─── Canonical column headers (normalised to lowercase, whitespace collapsed) ─

/** Maps normalised header → camelCase field name. */
const HEADER_MAP: Record<string, keyof Omit<DxrEntry, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>> = {
  'name':                    'name',
  'location':                'location',
  'description':             'description',
  'device instance number':  'deviceInstanceNumber',
  'equipment id':            'equipmentId',
  'serial number':           'serialNumber',
  'application template':    'applicationTemplate',
  'application number':      'applicationNumber',
  'network':                 'network',
  'auto addressing':         'autoAddressing',
  'mac address':             'macAddress',
  'max. manager address':    'maxManagerAddress',
  'baud rate':               'baudRate',
  'room hierarchy':          'roomHierarchy',
  'room name':               'roomName',
  'room description':        'roomDescription',
  'segment hierarchy':       'segmentHierarchy',
  'segment name':            'segmentName',
  'segment description':     'segmentDescription',
  'ms/tp nw id':             'msTpNwId',
  'guid':                    'guid',
};

const NUMERIC_FIELDS = new Set<keyof DxrEntry>([
  'deviceInstanceNumber',
  'applicationNumber',
  'network',
  'macAddress',
  'maxManagerAddress',
  'baudRate',
]);

const BOOLEAN_FIELDS = new Set<keyof DxrEntry>(['autoAddressing']);

/** Normalise a raw header string: collapse multi-line, trim, lowercase. */
function normaliseHeader(raw: string): string {
  return String(raw)
    .replace(/[\r\n]+/g, ' ')   // "Device instance\nnumber" → "Device instance number"
    .replace(/\s+/g, ' ')       // collapse multiple spaces
    .trim()
    .toLowerCase();
}

/** Coerce a cell value to string | null, trimming outer whitespace. */
function cellToString(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null;
  return String(val).trim() || null;
}

/** Coerce a cell value to boolean | null. */
function cellToBoolean(val: unknown): boolean | null {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim().toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return null;
}

/** Coerce a cell value to number | null. Returns [value, warning | null]. */
function cellToNumber(val: unknown, fieldName: string, rowIndex: number): [number | null, string | null] {
  if (val === null || val === undefined || val === '') return [null, null];
  const n = Number(val);
  if (Number.isNaN(n)) {
    return [null, `Row ${rowIndex}: field "${fieldName}" has non-numeric value "${val}" — set to null`];
  }
  return [n, null];
}

export type DxrImportRow = Omit<DxrEntry, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>;

export interface ParseDxrXlsxResult {
  rows: DxrImportRow[];
  warnings: string[];
}

/**
 * Parse a .xlsx / .xls File from Desigo CC "DXR Smart Copy" export.
 *
 * - Uses the first sheet.
 * - Row 1 must contain the canonical 21-column header set (case- and
 *   whitespace-insensitive; multi-line headers are normalised).
 * - If headers don't match, returns empty rows + warnings. Does NOT throw.
 * - Skips rows where both Name AND Guid are blank.
 * - id / projectId / createdAt / updatedAt are NOT populated — the
 *   bulk-upsert helper in db.ts owns those.
 */
export async function parseDxrXlsx(file: File): Promise<ParseDxrXlsxResult> {
  const warnings: string[] = [];

  // Load SheetJS lazily (it's a large library — don't pay the cost at module load)
  let XLSX: Awaited<typeof import('xlsx')>;
  try {
    XLSX = await import('xlsx');
  } catch {
    return {
      rows: [],
      warnings: ['Failed to load xlsx parser library. Is the "xlsx" package installed?'],
    };
  }

  // Read file as ArrayBuffer
  const buffer = await file.arrayBuffer();
  let workbook: ReturnType<typeof XLSX.read>;
  try {
    workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  } catch (e) {
    return {
      rows: [],
      warnings: [`Failed to parse file "${file.name}": ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], warnings: ['Workbook has no sheets.'] };
  }

  const sheet = workbook.Sheets[sheetName];

  // Convert to array-of-arrays so we can handle multi-line header cells cleanly
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][];

  if (raw.length < 2) {
    warnings.push('Sheet appears to be empty (fewer than 2 rows).');
    return { rows: [], warnings };
  }

  // ── Header detection ──────────────────────────────────────────────────────
  const headerRow = raw[0] as unknown[];
  const normalisedHeaders = headerRow.map((h) => normaliseHeader(String(h ?? '')));

  // Build column-index → field-name mapping
  const colMap: Map<number, keyof DxrImportRow> = new Map();
  for (let i = 0; i < normalisedHeaders.length; i++) {
    const h = normalisedHeaders[i];
    const field = HEADER_MAP[h];
    if (field) colMap.set(i, field);
  }

  // Check for missing canonical columns
  const foundFields = new Set(colMap.values());
  const missingFields: string[] = [];
  for (const [header, field] of Object.entries(HEADER_MAP)) {
    if (!foundFields.has(field)) {
      missingFields.push(`"${header}"`);
    }
  }

  if (missingFields.length > 0) {
    warnings.push(
      `Header mismatch — missing columns: ${missingFields.join(', ')}. ` +
      `Found: ${normalisedHeaders.filter(Boolean).join(', ')}. ` +
      'Returning empty rows. Check that this is a DXR Smart Copy export.'
    );
    return { rows: [], warnings };
  }

  // ── Row parsing ───────────────────────────────────────────────────────────
  const rows: DxrImportRow[] = [];

  for (let ri = 1; ri < raw.length; ri++) {
    const rawRow = raw[ri] as unknown[];
    const humanRow = ri + 1; // 1-based row number for warnings

    // Build a partial record from the mapped columns
    const partial: Record<string, unknown> = {};
    for (const [colIdx, fieldName] of colMap) {
      const cellVal = rawRow[colIdx] ?? '';
      partial[fieldName] = cellVal;
    }

    // Skip row if both Name AND Guid are blank
    const rawName = cellToString(partial.name);
    const rawGuid = cellToString(partial.guid);
    if (!rawName && !rawGuid) continue;

    const entry: DxrImportRow = {
      name:                null,
      location:            null,
      description:         null,
      deviceInstanceNumber: null,
      equipmentId:         null,
      serialNumber:        null,
      applicationTemplate: null,
      applicationNumber:   null,
      network:             null,
      autoAddressing:      null,
      macAddress:          null,
      maxManagerAddress:   null,
      baudRate:            null,
      roomHierarchy:       null,
      roomName:            null,
      roomDescription:     null,
      segmentHierarchy:    null,
      segmentName:         null,
      segmentDescription:  null,
      msTpNwId:            null,
      guid:                null,
    };

    for (const [fieldName, rawVal] of Object.entries(partial)) {
      const field = fieldName as keyof DxrImportRow;

      if (BOOLEAN_FIELDS.has(field as keyof DxrEntry)) {
        (entry as Record<string, unknown>)[field] = cellToBoolean(rawVal);
      } else if (NUMERIC_FIELDS.has(field as keyof DxrEntry)) {
        const [num, warn] = cellToNumber(rawVal, field, humanRow);
        (entry as Record<string, unknown>)[field] = num;
        if (warn) warnings.push(warn);
      } else {
        (entry as Record<string, unknown>)[field] = cellToString(rawVal);
      }
    }

    rows.push(entry);
  }

  return { rows, warnings };
}

// ── Smart Paste (TSV) ─────────────────────────────────────────────────────────

/** Canonical column order (matches the source Excel layout exactly). */
export const CANONICAL_COLUMN_ORDER: (keyof DxrImportRow)[] = [
  'name',
  'location',
  'description',
  'deviceInstanceNumber',
  'equipmentId',
  'serialNumber',
  'applicationTemplate',
  'applicationNumber',
  'network',
  'autoAddressing',
  'macAddress',
  'maxManagerAddress',
  'baudRate',
  'roomHierarchy',
  'roomName',
  'roomDescription',
  'segmentHierarchy',
  'segmentName',
  'segmentDescription',
  'msTpNwId',
  'guid',
];

export interface ParseDxrTsvResult {
  rows: DxrImportRow[];
  warnings: string[];
  detectedColumns: number;
}

export interface ParseDxrTsvOptions {
  /** If true, the first line is treated as a header row and dropped. */
  hasHeader?: boolean;
}

/**
 * Parse tab-separated text copied from an Excel range.
 *
 * Excel's clipboard format separates cells with `\t` and rows with `\n` (or
 * `\r\n`). Columns are matched by position, in CANONICAL_COLUMN_ORDER. Rows
 * with fewer columns leave trailing fields as null; rows with more columns
 * have the extras ignored.
 *
 * Same coercion rules as parseDxrXlsx (booleans, numbers, trimmed strings).
 * Rows where both Name and Guid are blank are skipped.
 */
export function parseDxrTsv(text: string, opts: ParseDxrTsvOptions = {}): ParseDxrTsvResult {
  const warnings: string[] = [];

  // Normalise line endings, drop trailing blank lines
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line, idx, arr) => !(idx === arr.length - 1 && line.trim() === ''));

  if (lines.length === 0) {
    return { rows: [], warnings: ['Nothing to paste.'], detectedColumns: 0 };
  }

  // Detect column count from the widest line
  let detectedColumns = 0;
  for (const line of lines) {
    const cols = line.split('\t').length;
    if (cols > detectedColumns) detectedColumns = cols;
  }

  if (detectedColumns > CANONICAL_COLUMN_ORDER.length) {
    warnings.push(
      `Pasted data has ${detectedColumns} columns; only the first ${CANONICAL_COLUMN_ORDER.length} will be used.`
    );
  } else if (detectedColumns < CANONICAL_COLUMN_ORDER.length) {
    warnings.push(
      `Pasted data has ${detectedColumns} column${detectedColumns === 1 ? '' : 's'}; remaining ${
        CANONICAL_COLUMN_ORDER.length - detectedColumns
      } field${CANONICAL_COLUMN_ORDER.length - detectedColumns === 1 ? '' : 's'} will be blank.`
    );
  }

  const dataLines = opts.hasHeader ? lines.slice(1) : lines;
  if (dataLines.length === 0) {
    return { rows: [], warnings: [...warnings, 'No data rows after header.'], detectedColumns };
  }

  const rows: DxrImportRow[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    if (line.trim() === '') continue;

    const cells = line.split('\t');
    const humanRow = opts.hasHeader ? i + 2 : i + 1;

    const entry: DxrImportRow = {
      name:                null,
      location:            null,
      description:         null,
      deviceInstanceNumber: null,
      equipmentId:         null,
      serialNumber:        null,
      applicationTemplate: null,
      applicationNumber:   null,
      network:             null,
      autoAddressing:      null,
      macAddress:          null,
      maxManagerAddress:   null,
      baudRate:            null,
      roomHierarchy:       null,
      roomName:            null,
      roomDescription:     null,
      segmentHierarchy:    null,
      segmentName:         null,
      segmentDescription:  null,
      msTpNwId:            null,
      guid:                null,
    };

    for (let c = 0; c < CANONICAL_COLUMN_ORDER.length && c < cells.length; c++) {
      const field = CANONICAL_COLUMN_ORDER[c];
      const rawVal = cells[c];

      if (BOOLEAN_FIELDS.has(field as keyof DxrEntry)) {
        (entry as Record<string, unknown>)[field] = cellToBoolean(rawVal);
      } else if (NUMERIC_FIELDS.has(field as keyof DxrEntry)) {
        const [num, warn] = cellToNumber(rawVal, field, humanRow);
        (entry as Record<string, unknown>)[field] = num;
        if (warn) warnings.push(warn);
      } else {
        (entry as Record<string, unknown>)[field] = cellToString(rawVal);
      }
    }

    // Skip rows where both Name and Guid are blank
    if (!entry.name && !entry.guid) continue;

    rows.push(entry);
  }

  return { rows, warnings, detectedColumns };
}
