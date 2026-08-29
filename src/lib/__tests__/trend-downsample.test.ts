import { describe, it, expect } from 'vitest';
import { downsampleLTTB } from '../trend-downsample';
import type { TrendDataPoint } from '@/types';

/**
 * Regression coverage for the LTTB bucket arithmetic.
 *
 * The selection and averaging buckets were each shifted one bucket forward,
 * which meant points 1..floor(bucketSize) were never selection candidates (a
 * transient early in a trend was silently absent from the chart) and the final
 * iteration re-emitted the last point.
 */

function series(values: number[], stepMs = 1000): TrendDataPoint[] {
  return values.map((v, i) => ({ timestamp: i * stepMs, values: { s1: v } }));
}

describe('downsampleLTTB', () => {
  it('returns the input untouched when it is already under the target', () => {
    const data = series([1, 2, 3]);
    expect(downsampleLTTB(data, 's1', 10)).toHaveLength(3);
  });

  it('emits exactly targetPoints and keeps the true first and last samples', () => {
    const data = series(Array.from({ length: 1000 }, (_, i) => i));
    const out = downsampleLTTB(data, 's1', 100);

    expect(out).toHaveLength(100);
    expect(out[0]).toEqual({ timestamp: 0, value: 0 });
    expect(out[out.length - 1]).toEqual({ timestamp: 999_000, value: 999 });
  });

  it('never emits a duplicate timestamp', () => {
    const data = series(Array.from({ length: 1000 }, (_, i) => i));
    const out = downsampleLTTB(data, 's1', 100);

    const stamps = out.map(p => p.timestamp);
    expect(new Set(stamps).size).toBe(stamps.length);
  });

  it('preserves a spike in the FIRST bucket', () => {
    // bucketSize here is ~10.2, so index 5 sits in the very first bucket —
    // exactly the range the old arithmetic skipped.
    const values = Array.from({ length: 1000 }, () => 0);
    values[5] = 9999;
    const out = downsampleLTTB(series(values), 's1', 100);

    expect(out.some(p => p.value === 9999)).toBe(true);
  });

  it('preserves a spike in the middle of the series', () => {
    const values = Array.from({ length: 1000 }, () => 0);
    values[500] = 9999;
    const out = downsampleLTTB(series(values), 's1', 100);

    expect(out.some(p => p.value === 9999)).toBe(true);
  });

  it('emits monotonically increasing timestamps', () => {
    const values = Array.from({ length: 500 }, (_, i) => Math.sin(i / 10) * 100);
    const out = downsampleLTTB(series(values), 's1', 50);

    for (let i = 1; i < out.length; i++) {
      expect(out[i].timestamp).toBeGreaterThan(out[i - 1].timestamp);
    }
  });

  it('skips null samples rather than treating them as zero', () => {
    const data: TrendDataPoint[] = Array.from({ length: 100 }, (_, i) => ({
      timestamp: i * 1000,
      values: { s1: i % 2 === 0 ? i : null },
    }));
    const out = downsampleLTTB(data, 's1', 10);

    expect(out.every(p => p.value !== null)).toBe(true);
    expect(out.length).toBeLessThanOrEqual(50);
  });
});
