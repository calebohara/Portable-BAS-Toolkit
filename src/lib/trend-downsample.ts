import type { TrendDataPoint } from '@/types';

/**
 * Largest-Triangle-Three-Buckets (LTTB) downsampling algorithm.
 * Preserves visual peaks and valleys while reducing point count.
 */
export function downsampleLTTB(
  data: TrendDataPoint[],
  seriesId: string,
  targetPoints: number,
): { timestamp: number; value: number }[] {
  // Extract non-null points
  const points: { timestamp: number; value: number }[] = [];
  for (const p of data) {
    const val = p.values[seriesId];
    if (val !== null) points.push({ timestamp: p.timestamp, value: val });
  }

  if (points.length <= targetPoints) return points;

  const sampled: { timestamp: number; value: number }[] = [];

  // Always include first point
  sampled.push(points[0]);

  const bucketSize = (points.length - 2) / (targetPoints - 2);

  let prevIndex = 0;

  for (let i = 0; i < targetPoints - 2; i++) {
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, points.length - 1);

    // Average of next bucket (for the triangle)
    const nextBucketStart = Math.floor((i + 2) * bucketSize) + 1;
    const nextBucketEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, points.length);

    let avgX = 0;
    let avgY = 0;
    let avgCount = 0;
    for (let j = nextBucketStart; j < nextBucketEnd && j < points.length; j++) {
      avgX += points[j].timestamp;
      avgY += points[j].value;
      avgCount++;
    }
    if (avgCount === 0) {
      avgX = points[points.length - 1].timestamp;
      avgY = points[points.length - 1].value;
    } else {
      avgX /= avgCount;
      avgY /= avgCount;
    }

    // Find the point in the current bucket with the largest triangle area
    let maxArea = -1;
    let maxIndex = bucketStart;

    const prevPoint = points[prevIndex];

    for (let j = bucketStart; j < bucketEnd && j < points.length; j++) {
      const area = Math.abs(
        (prevPoint.timestamp - avgX) * (points[j].value - prevPoint.value) -
        (prevPoint.timestamp - points[j].timestamp) * (avgY - prevPoint.value)
      ) * 0.5;

      if (area > maxArea) {
        maxArea = area;
        maxIndex = j;
      }
    }

    sampled.push(points[maxIndex]);
    prevIndex = maxIndex;
  }

  // Always include last point
  sampled.push(points[points.length - 1]);

  return sampled;
}

/**
 * Downsample all series in a dataset for chart rendering.
 * Returns a new TrendDataPoint[] with reduced density.
 */
export function downsampleForChart(
  data: TrendDataPoint[],
  seriesIds: string[],
  maxPoints = 2000,
): TrendDataPoint[] {
  if (data.length <= maxPoints) return data;

  // Downsample each series independently to preserve per-series peaks
  const seriesSamples = new Map<string, Map<number, number>>();

  for (const sid of seriesIds) {
    const sampled = downsampleLTTB(data, sid, maxPoints);
    const map = new Map<number, number>();
    for (const p of sampled) {
      map.set(p.timestamp, p.value);
    }
    seriesSamples.set(sid, map);
  }

  // Collect all unique timestamps from all downsampled series
  const allTimestamps = new Set<number>();
  for (const map of seriesSamples.values()) {
    for (const ts of map.keys()) allTimestamps.add(ts);
  }

  // Build merged downsampled data
  const timestamps = [...allTimestamps].sort((a, b) => a - b);

  // Create a lookup from original data for filling values
  const originalLookup = new Map<number, TrendDataPoint>();
  for (const p of data) {
    originalLookup.set(p.timestamp, p);
  }

  const result: TrendDataPoint[] = [];
  for (const ts of timestamps) {
    const original = originalLookup.get(ts);
    if (original) {
      result.push(original);
    } else {
      // This shouldn't happen since LTTB picks from original points
      const values: Record<string, number | null> = {};
      for (const sid of seriesIds) {
        values[sid] = seriesSamples.get(sid)?.get(ts) ?? null;
      }
      result.push({ timestamp: ts, values });
    }
  }

  return result;
}
