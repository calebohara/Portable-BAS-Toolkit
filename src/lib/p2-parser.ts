// ─── Siemens APOGEE/Desigo .P2 panel-database parser ─────────────────────────
//
// `.PXCM.P2` files are Siemens APOGEE/Desigo field-panel database exports. They
// hold the PPCL (Powers Process Control Language) programs for a panel plus the
// panel's logical point database. This module decodes that proprietary binary
// container entirely in the browser (no native deps) so the PPCL Editor can open
// a controller backup, reconstruct its programs, and list its points and trends.
//
// Container format (reverse-engineered, validated against real panel exports):
//   • The file is ASCII-hex text. Records are delimited by 0x16 (SYN) at the
//     start and CRLF at the end. Strip the framing, keep [0-9A-Fa-f], hex-decode
//     each record, then concatenate — logical structures span record boundaries.
//   • Inside the decoded blob, strings are length-prefixed: a 0x01 tag byte,
//     then a 2-byte big-endian length, then that many bytes.
//   • Point definitions are token groups delimited by the literal string "SYST".
//     A group is roughly: name → descriptor → name → name → descriptor →
//     units/state. The single byte immediately after a point name (the 2nd byte
//     of the `00 TT` pair that precedes the next `01 00` string tag) encodes the
//     point type.
//   • Program lines are SYST groups containing a `*.PPCL` object name, the string
//     "Enabled", and one PPCL source line (prefixed with its 5-digit line number).
//   • Trend objects appear as `<point>_TL_<interval>` / `<point>_TL_COV`.

/** APOGEE logical point type, decoded from the type byte after a point name. */
export type P2PointType = 'LAI' | 'LAO' | 'LAV' | 'LDI' | 'LDO' | 'Unknown';

export interface P2Point {
  /** Full point name, e.g. `GVL.CPPD.AHU7.OAT`. */
  name: string;
  /** English descriptor, e.g. `OA Tmp Cabinet`. */
  descriptor: string;
  /** Raw type byte (0x00–0x05). */
  typeCode: number;
  /** Decoded APOGEE point type. */
  type: P2PointType;
  category: 'analog' | 'digital' | 'value';
  /** Engineering units for analog points, e.g. `DEG F`. */
  units?: string;
  /** State text for digital points, e.g. `FAN ON/OFF`. */
  states?: string;
  /** True for physically-wired I/O (LAI/LAO/LDI/LDO); false for setpoints/calc values (LAV). */
  isPhysical: boolean;
}

export interface P2Trend {
  /** Base point being trended (the `_TL_*` suffix removed). */
  point: string;
  /** The raw trend object name, e.g. `GVL.CPPD.AHU7.OAT_TL_15`. */
  raw: string;
  /** Interval trend (`_TL_15`) vs change-of-value trend (`_TL_COV`). */
  kind: 'interval' | 'cov';
  /** For interval trends, the raw interval token (e.g. `15`). */
  interval?: string;
}

export interface P2Program {
  /** The `*.PPCL` object name, e.g. `GVL.CPPD.AHU7.PPCL`. */
  name: string;
  /** Short system name parsed from the object name, e.g. `AHU7`. */
  system: string;
  /** Reconstructed PPCL source, one statement per line, sorted by line number. */
  source: string;
  /** Number of source lines. */
  lineCount: number;
}

export interface P2Meta {
  fileName: string;
  jobName?: string;
  jobNumber?: string;
  systemName?: string;
  pointPrefix?: string;
}

export interface ParsedP2 {
  programs: P2Program[];
  points: P2Point[];
  trends: P2Trend[];
  meta: P2Meta;
}

/** Engineering-unit tokens (matched case-insensitively). Checked before state text. */
const UNIT_TOKENS = new Set([
  'DEG F', 'DEG C', 'DEG', 'PCT', '%', '%RH', 'RH', 'PSI', 'PSIG', 'IN WC', 'IN-WC',
  'WC', 'CFM', 'KCFM', 'FT3/M', 'GPM', 'FPM', 'AMPS', 'AMP', 'VOLTS', 'VOLT', 'KW',
  'KWH', 'HZ', 'MA', 'PPM', 'BTU/LBS', 'BTU/LB', 'RPM', 'SEC', 'MIN', 'GAL', 'LBS',
  'INWC', 'INH2O', 'TONS', 'BTU', 'BTUH',
]);

const TYPE_BY_CODE: Record<number, { type: P2PointType; category: P2Point['category'] }> = {
  0x00: { type: 'LAI', category: 'analog' },  // logical analog input  (sensors, filters)
  0x01: { type: 'LAO', category: 'analog' },  // logical analog output (valves, dampers, VFD speed)
  0x02: { type: 'LAV', category: 'value' },   // logical analog value  (setpoints, calculated values)
  0x03: { type: 'LDI', category: 'digital' }, // logical digital input (status, alarms, end switches)
  0x04: { type: 'LDO', category: 'digital' }, // logical digital output (commands)
  0x05: { type: 'LDO', category: 'digital' }, // logical digital output (start/stop, enable, occupancy)
};

const PHYSICAL_TYPES = new Set<P2PointType>(['LAI', 'LAO', 'LDI', 'LDO']);

const POINT_NAME_RE = /^(?:GVL|SITE)\.[A-Z0-9_.]+$/;
const PROGRAM_LINE_RE = /^\d{4,5}(?:\s|$)/;
const TREND_SUFFIX_RE = /_TL_(COV|\d+)$/;

interface Token {
  value: string;
  /** Byte offset just past this token's data in the decoded blob. */
  end: number;
  /** Type byte when the token is immediately followed by `00 TT 01 00`, else undefined. */
  typeByte?: number;
}

const HEX = new Set(Array.from('0123456789ABCDEFabcdef', (c) => c.charCodeAt(0)));

/**
 * Decode the SYN/CRLF-framed ASCII-hex records into one continuous binary blob.
 * Invalid/odd-length records are skipped rather than aborting the whole parse.
 */
function decodeRecords(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  const n = bytes.length;
  while (i < n) {
    // Each record starts at a SYN (0x16); skip anything before the first one.
    if (bytes[i] !== 0x16) { i++; continue; }
    i++; // consume SYN
    // Collect hex chars until the next SYN, decoding pairs as we go.
    let hi = -1;
    while (i < n && bytes[i] !== 0x16) {
      const b = bytes[i];
      if (HEX.has(b)) {
        if (hi < 0) {
          hi = b;
        } else {
          out.push(parseInt(String.fromCharCode(hi, b), 16));
          hi = -1;
        }
      }
      i++;
    }
    // A trailing unpaired nibble (odd-length record) is dropped.
  }
  return Uint8Array.from(out);
}

/** True when every byte is printable 7-bit ASCII. */
function isPrintable(blob: Uint8Array, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    const c = blob[i];
    if (c < 0x20 || c > 0x7e) return false;
  }
  return true;
}

const ASCII = new TextDecoder('latin1');

/**
 * Walk the blob extracting every length-prefixed string (`01 <len16be> bytes`).
 * Records the type byte when a string is followed by `00 TT 01 00` (point defs).
 */
function extractTokens(blob: Uint8Array): Token[] {
  const tokens: Token[] = [];
  const n = blob.length;
  let i = 0;
  while (i < n - 3) {
    if (blob[i] === 0x01) {
      const len = (blob[i + 1] << 8) | blob[i + 2];
      const start = i + 3;
      const end = start + len;
      if (len >= 1 && len <= 255 && end <= n && isPrintable(blob, start, end)) {
        let typeByte: number | undefined;
        if (blob[end] === 0x00 && blob[end + 2] === 0x01 && blob[end + 3] === 0x00) {
          typeByte = blob[end + 1];
        }
        tokens.push({ value: ASCII.decode(blob.subarray(start, end)), end, typeByte });
        i = end;
        continue;
      }
    }
    i++;
  }
  return tokens;
}

/** Split the token stream into SYST-delimited groups. */
function groupBySyst(tokens: Token[]): Token[][] {
  const groups: Token[][] = [];
  let cur: Token[] = [];
  for (const t of tokens) {
    if (t.value === 'SYST') {
      if (cur.length) groups.push(cur);
      cur = [];
    } else {
      cur.push(t);
    }
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/** System name from a `*.PPCL` object name: `GVL.CPPD.AHU7.PPCL` → `AHU7`. */
function systemFromProgramName(name: string): string {
  const parts = name.split('.').filter(Boolean);
  const idx = parts.lastIndexOf('PPCL');
  if (idx > 0) return parts[idx - 1];
  return parts[parts.length - 1] || name;
}

function classifyUnitOrState(token: string): 'unit' | 'state' | null {
  if (UNIT_TOKENS.has(token.toUpperCase())) return 'unit';
  if (token.includes('/') || token.toUpperCase() === 'ON' || token.toUpperCase() === 'OFF') return 'state';
  return null;
}

/** Parse job/system metadata from PPCL comment lines (`C * JOB NAME: ... *`). */
function parseMeta(programLines: string[], fileName: string): P2Meta {
  const meta: P2Meta = { fileName };
  const grab = (label: RegExp): string | undefined => {
    for (const line of programLines) {
      const m = line.match(label);
      if (m) {
        // Strip trailing banner asterisks/whitespace.
        const v = m[1].replace(/\s*\*+\s*$/, '').trim();
        if (v) return v;
      }
    }
    return undefined;
  };
  meta.jobName = grab(/JOB NAME:\s*(.+)$/i);
  meta.jobNumber = grab(/JOB NUMBER:\s*(.+)$/i);
  meta.systemName = grab(/SYSTEM NAME:\s*(.+)$/i);
  meta.pointPrefix = grab(/POINT NAME PREFIX:\s*(.+)$/i);
  return meta;
}

/**
 * Parse a Siemens APOGEE/Desigo `.P2` panel file into its programs, points, and
 * trends. Returns empty collections (never throws) when the input isn't a
 * recognizable P2 file, so callers can fall back to plain-text import.
 */
export function parseP2(bytes: Uint8Array, fileName: string): ParsedP2 {
  const blob = decodeRecords(bytes);
  const tokens = extractTokens(blob);
  const groups = groupBySyst(tokens);

  // ── Programs: collect (programName → ordered source lines) ────────────────
  const programLinesByName = new Map<string, Map<number, string>>();
  const allProgramLines: string[] = [];

  // ── Points: dedupe by name, keeping the richest definition ────────────────
  const pointsByName = new Map<string, P2Point>();

  // ── Trends: dedupe by raw object name ─────────────────────────────────────
  const trendsByRaw = new Map<string, P2Trend>();

  for (const group of groups) {
    // Trend object? (e.g. a `<name>_TL_15` token anywhere in the group)
    let isTrendGroup = false;
    for (const t of group) {
      const m = t.value.match(TREND_SUFFIX_RE);
      if (m) {
        isTrendGroup = true;
        const raw = t.value;
        const point = raw.slice(0, raw.length - m[0].length);
        if (!trendsByRaw.has(raw)) {
          trendsByRaw.set(raw, {
            raw,
            point,
            kind: m[1] === 'COV' ? 'cov' : 'interval',
            interval: m[1] === 'COV' ? undefined : m[1],
          });
        }
      }
    }
    if (isTrendGroup) continue;

    const nameTok = group.find((t) => POINT_NAME_RE.test(t.value));
    if (!nameTok) continue;
    const name = nameTok.value;

    // Program-line group: object name ends in .PPCL and carries a source line.
    if (name.endsWith('.PPCL')) {
      const lineTok = group.find((t) => PROGRAM_LINE_RE.test(t.value));
      if (lineTok) {
        const lineNum = parseInt(lineTok.value.match(/^\d+/)![0], 10);
        let lines = programLinesByName.get(name);
        if (!lines) { lines = new Map(); programLinesByName.set(name, lines); }
        // Last write wins for a given line number (later records supersede).
        lines.set(lineNum, lineTok.value);
        allProgramLines.push(lineTok.value);
      }
      continue;
    }

    // Point definition. Type comes from the first name occurrence's type byte.
    const typeByte = group.find((t) => t.value === name && t.typeByte !== undefined)?.typeByte;
    if (typeByte === undefined) continue; // not a real point definition
    const mapped = TYPE_BY_CODE[typeByte] ?? { type: 'Unknown' as P2PointType, category: 'value' as const };

    let descriptor = '';
    let units: string | undefined;
    let states: string | undefined;
    for (const t of group) {
      if (t.value === name) continue;
      const kind = classifyUnitOrState(t.value);
      if (kind === 'unit') { units ??= t.value; continue; }
      if (kind === 'state') { states ??= t.value; }
      if (!descriptor) descriptor = t.value;
    }

    const point: P2Point = {
      name,
      descriptor,
      typeCode: typeByte,
      type: mapped.type,
      category: mapped.category,
      units,
      states,
      isPhysical: PHYSICAL_TYPES.has(mapped.type),
    };
    const existing = pointsByName.get(name);
    if (!existing || richness(point) > richness(existing)) pointsByName.set(name, point);
  }

  const programs: P2Program[] = [...programLinesByName.entries()]
    .map(([name, lines]) => {
      const ordered = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, text]) => text);
      return { name, system: systemFromProgramName(name), source: ordered.join('\n'), lineCount: ordered.length };
    })
    .sort((a, b) => a.system.localeCompare(b.system));

  const points = [...pointsByName.values()].sort((a, b) => a.name.localeCompare(b.name));
  const trends = [...trendsByRaw.values()].sort((a, b) => a.point.localeCompare(b.point));

  return { programs, points, trends, meta: parseMeta(allProgramLines, fileName) };
}

/** Definition completeness, used to pick the best when a point appears twice. */
function richness(p: P2Point): number {
  return p.descriptor.length + (p.units ? 5 : 0) + (p.states ? 5 : 0);
}

/** Quick sniff so the importer can branch before fully parsing. */
export function looksLikeP2(fileName: string, bytes?: Uint8Array): boolean {
  if (/\.p2$/i.test(fileName)) return true;
  if (bytes && bytes.length > 0 && bytes[0] === 0x16) return true;
  return false;
}
