import { describe, it, expect } from 'vitest';
import { parseP2, looksLikeP2 } from '../p2-parser';

// ── Synthetic fixture builders ───────────────────────────────────────────────
// Reproduce the real container encoding in miniature so the parser's primitives
// (record framing, length-prefixed strings, type byte, SYST grouping) are
// exercised without depending on a proprietary sample file.

/** A length-prefixed string token: 0x01 tag, 2-byte BE length, then the bytes. */
function lp(s: string): number[] {
  const bytes = [...s].map((c) => c.charCodeAt(0));
  return [0x01, (bytes.length >> 8) & 0xff, bytes.length & 0xff, ...bytes];
}

/** A point name followed by its `00 TT` type marker (TT read by the parser). */
function typedName(name: string, typeByte: number): number[] {
  return [...lp(name), 0x00, typeByte];
}

const SYST = () => lp('SYST');

/** Frame a binary blob as one SYN/CRLF ASCII-hex record, like a real .P2 file. */
function frame(blob: number[]): Uint8Array {
  const hex = blob.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join('');
  const ascii = [...hex].map((c) => c.charCodeAt(0));
  return Uint8Array.from([0x16, ...ascii, 0x0d, 0x0a]);
}

function buildFixture(): Uint8Array {
  const blob: number[] = [
    // Analog input point: LAI (0x00), units DEG F
    ...SYST(),
    ...typedName('GVL.X.OAT', 0x00),
    ...lp('OUTSIDE TEMP'),
    ...lp('DEG F'),
    // Digital output point: LDO (0x05), state text
    ...SYST(),
    ...typedName('GVL.X.SF.SS', 0x05),
    ...lp('FAN ON/OFF'),
    // Setpoint / calculated value: LAV (0x02) — not physical I/O
    ...SYST(),
    ...typedName('GVL.X.OAT.SP', 0x02),
    ...lp('OAT SETPOINT'),
    ...lp('DEG F'),
    // Two program lines for system X (note: emitted out of order)
    ...SYST(),
    ...lp('GVL.X.PPCL'),
    ...lp('Enabled'),
    ...lp('00200 C * JOB NUMBER:        44OP-000001 *'),
    ...SYST(),
    ...lp('GVL.X.PPCL'),
    ...lp('Enabled'),
    ...lp('00100 DEFINE (X, "GVL.X.")'),
    // Trend objects for OAT (interval) and SS (cov)
    ...SYST(),
    ...lp('GVL.X.OAT'),
    ...lp('GVL.X.OAT_TL_15'),
    ...SYST(),
    ...lp('GVL.X.SF.SS'),
    ...lp('GVL.X.SF.SS_TL_COV'),
    ...SYST(),
  ];
  return frame(blob);
}

describe('parseP2', () => {
  const parsed = parseP2(buildFixture(), 'X.PXCM.P2');

  it('reconstructs programs sorted by line number', () => {
    expect(parsed.programs).toHaveLength(1);
    const prog = parsed.programs[0];
    expect(prog.system).toBe('X');
    expect(prog.lineCount).toBe(2);
    // Emitted 00200 before 00100 — must come out sorted.
    expect(prog.source).toBe('00100 DEFINE (X, "GVL.X.")\n00200 C * JOB NUMBER:        44OP-000001 *');
  });

  it('extracts metadata from program comment lines', () => {
    expect(parsed.meta.jobNumber).toBe('44OP-000001');
    expect(parsed.meta.fileName).toBe('X.PXCM.P2');
  });

  it('decodes point types, units, and state text', () => {
    const oat = parsed.points.find((p) => p.name === 'GVL.X.OAT')!;
    expect(oat.type).toBe('LAI');
    expect(oat.category).toBe('analog');
    expect(oat.units).toBe('DEG F');
    expect(oat.descriptor).toBe('OUTSIDE TEMP');
    expect(oat.isPhysical).toBe(true);

    const ss = parsed.points.find((p) => p.name === 'GVL.X.SF.SS')!;
    expect(ss.type).toBe('LDO');
    expect(ss.category).toBe('digital');
    expect(ss.states).toBe('FAN ON/OFF');
    expect(ss.isPhysical).toBe(true);
  });

  it('marks setpoints/calculated values (LAV) as non-physical', () => {
    const sp = parsed.points.find((p) => p.name === 'GVL.X.OAT.SP')!;
    expect(sp.type).toBe('LAV');
    expect(sp.isPhysical).toBe(false);
  });

  it('does not treat the .PPCL program object as a point', () => {
    expect(parsed.points.some((p) => p.name.endsWith('.PPCL'))).toBe(false);
  });

  it('extracts interval and COV trends and strips the point off trend groups', () => {
    expect(parsed.trends).toHaveLength(2);
    const interval = parsed.trends.find((t) => t.point === 'GVL.X.OAT')!;
    expect(interval.kind).toBe('interval');
    expect(interval.interval).toBe('15');
    const cov = parsed.trends.find((t) => t.point === 'GVL.X.SF.SS')!;
    expect(cov.kind).toBe('cov');
    // The bare point name inside a trend group must not become a duplicate point.
    expect(parsed.points.filter((p) => p.name === 'GVL.X.OAT')).toHaveLength(1);
  });

  it('returns empty collections for non-P2 input without throwing', () => {
    const garbage = new TextEncoder().encode('just some plain text, not a panel file');
    const r = parseP2(garbage, 'notes.txt');
    expect(r.programs).toHaveLength(0);
    expect(r.points).toHaveLength(0);
    expect(r.trends).toHaveLength(0);
  });
});

describe('looksLikeP2', () => {
  it('matches by .p2 extension (case-insensitive)', () => {
    expect(looksLikeP2('AHU7.PXCM.P2')).toBe(true);
    expect(looksLikeP2('panel.p2')).toBe(true);
    expect(looksLikeP2('program.pcl')).toBe(false);
  });

  it('matches by SYN leading byte when bytes are provided', () => {
    expect(looksLikeP2('mystery.bin', Uint8Array.from([0x16, 0x30, 0x30]))).toBe(true);
    expect(looksLikeP2('mystery.bin', Uint8Array.from([0x41, 0x42]))).toBe(false);
  });
});
