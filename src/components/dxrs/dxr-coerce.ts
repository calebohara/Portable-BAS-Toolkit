/**
 * Pure coercion helpers for the editable DXR row detail form.
 *
 * The form holds every field as a string (and the boolean column as a
 * tri-state string). On save we coerce back to the nullable shapes the
 * `DxrEntry` source columns expect.
 */

export type DxrTriState = 'true' | 'false' | 'null';

/** Trim a string field; blank → null. */
export function coerceStringField(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const t = raw.trim();
  return t === '' ? null : t;
}

/**
 * Parse a numeric field. Blank or non-numeric → null (never NaN).
 * Accepts surrounding whitespace.
 */
export function coerceNumberField(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Map a tri-state form value to a nullable boolean. */
export function coerceTriState(t: DxrTriState): boolean | null {
  return t === 'true' ? true : t === 'false' ? false : null;
}
