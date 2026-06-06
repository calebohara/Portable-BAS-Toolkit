import { describe, it, expect } from 'vitest';

import {
  parseLocaleFloat,
  detectDecimalSeparator,
  parseTrendCSV,
  detectHeaderRow,
} from '../trend-csv-parser';
import { exportCleanCSV } from '../trend-export';
import type { TrendDataPoint, TrendSeries } from '@/types';

// ─── parseLocaleFloat ────────────────────────────────────────

describe('parseLocaleFloat', () => {
  it('parses plain US decimals with a dot separator', () => {
    expect(parseLocaleFloat('1.5', '.')).toBe(1.5);
    expect(parseLocaleFloat('-1.5', '.')).toBe(-1.5);
    expect(parseLocaleFloat('42', '.')).toBe(42);
  });

  it('strips US thousands separators', () => {
    expect(parseLocaleFloat('1,234.56', '.')).toBeCloseTo(1234.56, 5);
    expect(parseLocaleFloat('1,234,567', '.')).toBe(1234567);
  });

  it('parses EU comma decimals (regression for #8: "1,5" must be 1.5, not 1)', () => {
    expect(parseLocaleFloat('1,5', ',')).toBe(1.5);
    expect(parseLocaleFloat('-1,5', ',')).toBe(-1.5);
    expect(parseLocaleFloat('0,001', ',')).toBeCloseTo(0.001, 6);
  });

  it('strips EU dot thousands separators (regression for #8: "1.234,56" must be 1234.56)', () => {
    expect(parseLocaleFloat('1.234,56', ',')).toBeCloseTo(1234.56, 5);
    expect(parseLocaleFloat('12.345.678,9', ',')).toBeCloseTo(12345678.9, 5);
  });

  it('returns NaN for empty/garbage cells', () => {
    expect(parseLocaleFloat('', '.')).toBeNaN();
    expect(parseLocaleFloat('   ', ',')).toBeNaN();
    expect(parseLocaleFloat('abc', '.')).toBeNaN();
  });

  it('demonstrates the bug parseFloat had without normalization', () => {
    // The original code did parseFloat("1,5") === 1; the helper fixes it.
    expect(parseFloat('1,5')).toBe(1);
    expect(parseLocaleFloat('1,5', ',')).toBe(1.5);
  });
});

// ─── detectDecimalSeparator ──────────────────────────────────

describe('detectDecimalSeparator', () => {
  it('detects comma decimals from sampled value cells', () => {
    const rows = [
      ['2024-01-01 00:00', '21,5', '40,2'],
      ['2024-01-01 00:01', '21,6', '40,1'],
    ];
    expect(detectDecimalSeparator(rows, [1, 2])).toBe(',');
  });

  it('detects dot decimals from sampled value cells', () => {
    const rows = [
      ['2024-01-01 00:00', '21.5', '40.2'],
      ['2024-01-01 00:01', '21.6', '40.1'],
    ];
    expect(detectDecimalSeparator(rows, [1, 2])).toBe('.');
  });

  it('honors an explicit eu-locale format selection', () => {
    const rows = [['2024-01-01 00:00', '100', '200']];
    expect(detectDecimalSeparator(rows, [1, 2], 'eu-locale')).toBe(',');
  });

  it('honors an explicit us-locale / iso format selection', () => {
    const rows = [['2024-01-01 00:00', '100', '200']];
    expect(detectDecimalSeparator(rows, [1, 2], 'us-locale')).toBe('.');
    expect(detectDecimalSeparator(rows, [1, 2], 'iso')).toBe('.');
  });

  it('defaults to dot when no decimal cells are present', () => {
    const rows = [['2024-01-01 00:00', '100', '200']];
    expect(detectDecimalSeparator(rows, [1, 2])).toBe('.');
  });
});

// ─── parseTrendCSV (end-to-end, semicolon-delimited EU export) ─

describe('parseTrendCSV — EU export', () => {
  const hasFile = typeof File !== 'undefined';

  it.runIf(hasFile)('parses a semicolon-delimited EU CSV with comma decimals correctly', async () => {
    // Desigo-style export: semicolon delimiter, comma decimal separator.
    const csv = [
      'Timestamp;Supply Temp (degC);Return Temp (degC)',
      '2024-01-01 00:00:00;21,5;18,2',
      '2024-01-01 00:01:00;21,6;18,3',
      '2024-01-01 00:02:00;1.234,5;18,1',
    ].join('\n');
    const file = new File([csv], 'desigo.csv', { type: 'text/csv' });

    const result = await parseTrendCSV(file);

    expect(result.detectedDelimiter).toBe(';');
    expect(result.detectedDecimalSeparator).toBe(',');
    expect(result.rowCount).toBe(3);
    expect(result.series.length).toBe(2);

    const supplyId = result.series[0].id;
    // First row supply temp must be 21.5, NOT 21 (the bug) and NOT 215.
    expect(result.data[0].values[supplyId]).toBe(21.5);
    // Thousands-separator row: "1.234,5" must be 1234.5.
    expect(result.data[2].values[supplyId]).toBe(1234.5);

    // Metadata surfaces the EU-decimal detection.
    expect(result.warnings.some(w => /EU-format decimals/i.test(w))).toBe(true);
  });

  it.runIf(hasFile)('parses a comma-delimited US CSV with dot decimals correctly', async () => {
    const csv = [
      'Timestamp,Supply Temp (degF),Return Temp (degF)',
      '2024-01-01 00:00:00,71.5,64.2',
      '2024-01-01 00:01:00,71.6,64.3',
    ].join('\n');
    const file = new File([csv], 'jci.csv', { type: 'text/csv' });

    const result = await parseTrendCSV(file);

    expect(result.detectedDelimiter).toBe(',');
    expect(result.detectedDecimalSeparator).toBe('.');
    const supplyId = result.series[0].id;
    expect(result.data[0].values[supplyId]).toBe(71.5);
    expect(result.warnings.some(w => /EU-format decimals/i.test(w))).toBe(false);
  });
});

// ─── Bad-quality sentinel cells ──────────────────────────────

describe('parseTrendCSV — bad-quality cells', () => {
  const hasFile = typeof File !== 'undefined';

  it.runIf(hasFile)('treats #N/A, null, NaN, --, — as missing (null) and warns', async () => {
    const csv = [
      'Timestamp,Supply Temp (degF),Return Temp (degF)',
      '2024-01-01 00:00:00,#N/A,64.2',
      '2024-01-01 00:01:00,null,--',
      '2024-01-01 00:02:00,NaN,—',
      '2024-01-01 00:03:00,71.6,64.3',
    ].join('\n');
    const file = new File([csv], 'webctrl.csv', { type: 'text/csv' });

    const result = await parseTrendCSV(file);
    const supplyId = result.series[0].id;
    const returnId = result.series[1].id;

    expect(result.data[0].values[supplyId]).toBeNull(); // #N/A
    expect(result.data[1].values[supplyId]).toBeNull(); // null
    expect(result.data[1].values[returnId]).toBeNull(); // --
    expect(result.data[2].values[supplyId]).toBeNull(); // NaN
    expect(result.data[2].values[returnId]).toBeNull(); // —
    expect(result.data[3].values[supplyId]).toBe(71.6); // real value still parses

    expect(result.warnings.some(w => /bad-quality cell/i.test(w))).toBe(true);
  });
});

// ─── Units row beneath header ────────────────────────────────

describe('detectHeaderRow — units row beneath header', () => {
  it('keeps the header at the label row when a short units row sits below it', () => {
    const rows = [
      ['Timestamp', 'Supply Temp', 'Return Temp'], // header (labels)
      ['', '°F', '°F'],                              // units row (short, non-numeric)
      ['2024-01-01 00:00:00', '71.5', '64.2'],       // data
      ['2024-01-01 00:01:00', '71.6', '64.3'],
    ];
    expect(detectHeaderRow(rows)).toBe(0);
  });
});

describe('parseTrendCSV — units row skip', () => {
  const hasFile = typeof File !== 'undefined';

  it.runIf(hasFile)('skips a units row between header and data', async () => {
    const csv = [
      'Timestamp,Supply Temp,Return Temp',
      ',degF,degF',
      '2024-01-01 00:00:00,71.5,64.2',
      '2024-01-01 00:01:00,71.6,64.3',
    ].join('\n');
    const file = new File([csv], 'niagara.csv', { type: 'text/csv' });

    const result = await parseTrendCSV(file);

    // Two data rows (not three) — the units row was skipped, not parsed as data.
    expect(result.rowCount).toBe(2);
    const supplyId = result.series[0].id;
    expect(result.data[0].values[supplyId]).toBe(71.5);
    expect(result.warnings.some(w => /units row/i.test(w))).toBe(true);
  });
});

// ─── exportCleanCSV RFC 4180 escaping ────────────────────────

describe('exportCleanCSV — RFC 4180 escaping', () => {
  const mkSeries = (id: string, name: string, unit: string): TrendSeries => ({
    id, name, unit, color: '#000', visible: true, yAxisSide: 'left',
    valueType: 'numeric', sourceFile: 'x.csv',
  });

  it('quotes header cells containing commas and quotes', () => {
    const series = [
      mkSeries('a', 'Pressure, primary', 'psi'),
      mkSeries('b', 'Tag "B"', 'in"H2O'),
    ];
    const data: TrendDataPoint[] = [
      { timestamp: Date.UTC(2024, 0, 1, 0, 0, 0), values: { a: 1, b: 2 } },
    ];

    const csv = exportCleanCSV(data, series);
    const [headerLine] = csv.split('\n');

    // Comma inside the name must be quoted; embedded quotes doubled.
    expect(headerLine).toContain('"Pressure, primary (psi)"');
    expect(headerLine).toContain('"Tag ""B"" (in""H2O)"');

    // Splitting on bare commas must still yield exactly 3 columns
    // (Timestamp + 2 series) when quotes are honored.
    const cols = headerLine.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.filter(Boolean) ?? [];
    expect(cols.length).toBe(3);
  });
});
