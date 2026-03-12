/**
 * ANSI escape code parser for terminal display.
 *
 * Handles control characters and escape sequences commonly seen from
 * BAS panels (Siemens, etc.) so terminal output renders cleanly in React,
 * similar to how Tera Term displays it.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TerminalSpan {
  text: string;
  bold?: boolean;
  fgColor?: string; // CSS color string
  bgColor?: string;
}

export interface ParsedLine {
  spans: TerminalSpan[];
}

// ---------------------------------------------------------------------------
// Color maps (One Dark-inspired palette)
// ---------------------------------------------------------------------------

const ANSI_COLORS: Record<number, string> = {
  30: '#1e1e1e', // black
  31: '#e06c75', // red
  32: '#98c379', // green
  33: '#e5c07b', // yellow
  34: '#61afef', // blue
  35: '#c678dd', // magenta
  36: '#56b6c2', // cyan
  37: '#abb2bf', // white
  90: '#5c6370', // bright black (gray)
  91: '#e06c75', // bright red
  92: '#98c379', // bright green
  93: '#e5c07b', // bright yellow
  94: '#61afef', // bright blue
  95: '#c678dd', // bright magenta
  96: '#56b6c2', // bright cyan
  97: '#ffffff', // bright white
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: '#1e1e1e',
  41: '#e06c75',
  42: '#98c379',
  43: '#e5c07b',
  44: '#61afef',
  45: '#c678dd',
  46: '#56b6c2',
  47: '#abb2bf',
};

// ---------------------------------------------------------------------------
// Style state tracked across SGR parameters
// ---------------------------------------------------------------------------

interface StyleState {
  bold: boolean;
  fgColor: string | undefined;
  bgColor: string | undefined;
}

function defaultStyle(): StyleState {
  return { bold: false, fgColor: undefined, bgColor: undefined };
}

function applySgrParam(state: StyleState, code: number): void {
  if (code === 0) {
    // Reset all
    state.bold = false;
    state.fgColor = undefined;
    state.bgColor = undefined;
  } else if (code === 1) {
    state.bold = true;
  } else if (code === 22) {
    state.bold = false;
  } else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
    state.fgColor = ANSI_COLORS[code];
  } else if (code === 39) {
    // Default foreground
    state.fgColor = undefined;
  } else if (code >= 40 && code <= 47) {
    state.bgColor = ANSI_BG_COLORS[code];
  } else if (code === 49) {
    // Default background
    state.bgColor = undefined;
  }
  // All other codes are silently ignored.
}

// ---------------------------------------------------------------------------
// Regex that matches any CSI sequence: ESC [ <params> <final byte>
// Final byte is in the range 0x40-0x7E (@ through ~).
// ---------------------------------------------------------------------------

const CSI_RE = /\x1b\[[0-9;]*[A-Za-z@`]/g;

// Matches an SGR sequence specifically: ESC [ <digits;...> m
const SGR_RE = /^\x1b\[([0-9;]*)m$/;

// Matches any remaining escape sequence we did not handle (OSC, etc.)
const OTHER_ESC_RE = /\x1b(?:\][^\x07\x1b]*(?:\x07|\x1b\\)?|[^\[].?)/g;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a terminal line that may contain ANSI escape sequences.
 * Returns an array of styled spans for rendering.
 *
 * This does NOT handle carriage returns — run `processCarriageReturns`
 * on the raw text first if needed.
 */
export function parseAnsiLine(text: string): ParsedLine {
  const spans: TerminalSpan[] = [];
  const style = defaultStyle();

  // Collect all CSI sequences and their positions so we can walk the string
  // segment by segment.
  const tokens: { start: number; end: number; seq: string }[] = [];

  // First pass: find CSI sequences
  CSI_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CSI_RE.exec(text)) !== null) {
    tokens.push({ start: m.index, end: m.index + m[0].length, seq: m[0] });
  }

  // Second pass: find other escape sequences that are not CSI
  OTHER_ESC_RE.lastIndex = 0;
  while ((m = OTHER_ESC_RE.exec(text)) !== null) {
    // Only add if this position was not already covered by a CSI match
    const overlaps = tokens.some(
      (t) => m!.index >= t.start && m!.index < t.end,
    );
    if (!overlaps) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        seq: m[0],
      });
    }
  }

  // Sort tokens by start position
  tokens.sort((a, b) => a.start - b.start);

  let cursor = 0;

  for (const token of tokens) {
    // Emit any plain text before this token
    if (token.start > cursor) {
      const plain = text.slice(cursor, token.start);
      if (plain.length > 0) {
        pushSpan(spans, plain, style);
      }
    }
    cursor = token.end;

    // If this is an SGR sequence, update style state
    const sgrMatch = SGR_RE.exec(token.seq);
    if (sgrMatch) {
      const params = sgrMatch[1];
      if (params === '' || params === undefined) {
        // ESC[m is equivalent to ESC[0m (reset)
        applySgrParam(style, 0);
      } else {
        for (const p of params.split(';')) {
          const code = parseInt(p, 10);
          if (!isNaN(code)) {
            applySgrParam(style, code);
          }
        }
      }
    }
    // All other escape sequences (cursor movement, etc.) are stripped.
  }

  // Emit remaining plain text
  if (cursor < text.length) {
    const remaining = text.slice(cursor);
    if (remaining.length > 0) {
      pushSpan(spans, remaining, style);
    }
  }

  // If no spans were produced, emit an empty span so the line still renders
  if (spans.length === 0) {
    spans.push({ text: '' });
  }

  return { spans };
}

/**
 * Process raw terminal text that may contain `\r` (carriage return).
 *
 * Rules:
 * - `\r\n` is treated as a regular newline (preserved as `\n`).
 * - A bare `\r` (not followed by `\n`) moves the cursor to column 0,
 *   so subsequent characters overwrite earlier ones from the start.
 *
 * Returns the processed visible text (newlines preserved).
 */
export function processCarriageReturns(text: string): string {
  // First, normalise \r\n to a placeholder so we don't treat them as bare \r.
  const CRLF_PLACEHOLDER = '\x00CRLF\x00';
  let working = text.replaceAll('\r\n', CRLF_PLACEHOLDER);

  // Process each line that was separated by real newlines
  const lines = working.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    result.push(processLineCarriageReturns(line));
  }

  // Rejoin and restore CRLF placeholders back to newlines
  return result.join('\n').replaceAll(CRLF_PLACEHOLDER, '\n');
}

/**
 * Check if text contains a clear-screen sequence (`ESC[2J`).
 */
export function containsClearScreen(text: string): boolean {
  return text.includes('\x1b[2J');
}

/**
 * Check if text contains a cursor-home sequence (`ESC[H`).
 */
export function containsCursorHome(text: string): boolean {
  return text.includes('\x1b[H');
}

/**
 * Convenience: strip all escape sequences from text, returning plain text.
 */
export function stripAnsi(text: string): string {
  return text
    .replace(CSI_RE, '')
    .replace(OTHER_ESC_RE, '')
    .replace(/\x1b/g, '');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function pushSpan(spans: TerminalSpan[], text: string, style: StyleState) {
  // Strip any stray control characters (except newlines/tabs) that might
  // have slipped through.
  const clean = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  if (clean.length === 0) return;

  const span: TerminalSpan = { text: clean };
  if (style.bold) span.bold = true;
  if (style.fgColor) span.fgColor = style.fgColor;
  if (style.bgColor) span.bgColor = style.bgColor;
  spans.push(span);
}

/**
 * Handle bare `\r` within a single line (no `\n` present).
 * Each `\r` moves the write cursor back to column 0, so later segments
 * overwrite earlier ones character-by-character.
 */
function processLineCarriageReturns(line: string): string {
  if (!line.includes('\r')) return line;

  const segments = line.split('\r');
  // Start with the first segment as the buffer
  const buf: string[] = segments[0] ? segments[0].split('') : [];

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    for (let j = 0; j < seg.length; j++) {
      if (j < buf.length) {
        buf[j] = seg[j];
      } else {
        buf.push(seg[j]);
      }
    }
  }

  return buf.join('');
}
