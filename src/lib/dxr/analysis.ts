// Pure analysis helpers for DXR commissioning quality checks.
// No React, no side-effects — safe to call from any context.

export interface FieldConsistency<T> {
  kind: 'consistent' | 'mixed' | 'empty';
  /** when 'consistent': the single shared value */
  value?: T;
  /** when 'mixed': all distinct values with their counts, sorted by count desc */
  distribution?: { value: T; count: number }[];
}

export interface DuplicateGroup<T> {
  value: T;
  count: number;
  /** DxrEntry.name for each row in the group — first 5 stored; caller appends "…and N more" */
  names: string[];
}

// A row type that accepts any concrete record (including DxrEntry) without
// requiring an explicit index signature on DxrEntry itself.
type AnyRow = Record<string, unknown> & { name: string | null };

/**
 * Analyse the distribution of a single field across all rows.
 * null / undefined / '' values are ignored entirely (not counted).
 */
export function analyzeField<T>(
  rows: AnyRow[],
  field: string,
): FieldConsistency<T> {
  const counts = new Map<T, number>();

  for (const row of rows) {
    const raw = row[field];
    if (raw === null || raw === undefined || raw === '') continue;
    const val = raw as T;
    counts.set(val, (counts.get(val) ?? 0) + 1);
  }

  if (counts.size === 0) {
    return { kind: 'empty' };
  }

  if (counts.size === 1) {
    const [value] = counts.keys();
    return { kind: 'consistent', value };
  }

  // Mixed — sort desc by count
  const distribution = Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);

  return { kind: 'mixed', distribution };
}

/**
 * Find values that appear in more than one row (count >= 2).
 * null / undefined / '' are NOT considered duplicates.
 * Returned groups are sorted desc by count.
 * Each group's `names` list contains at most the first 5 row names.
 */
export function findDuplicates<T>(
  rows: AnyRow[],
  field: string,
): DuplicateGroup<T>[] {
  // Build: value → list of names
  const nameMap = new Map<T, string[]>();

  for (const row of rows) {
    const raw = row[field];
    if (raw === null || raw === undefined || raw === '') continue;
    const val = raw as T;
    if (!nameMap.has(val)) nameMap.set(val, []);
    nameMap.get(val)!.push(row.name ?? '(unnamed)');
  }

  return Array.from(nameMap.entries())
    .filter(([, names]) => names.length >= 2)
    .map(([value, names]) => ({
      value,
      count: names.length,
      names: names.slice(0, 5),
    }))
    .sort((a, b) => b.count - a.count);
}
