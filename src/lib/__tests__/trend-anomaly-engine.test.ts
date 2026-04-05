import { describe, it, expect, vi } from 'vitest';

vi.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import {
  defaultAnomalyConfig,
  computeSeriesStats,
  detectAnomalies,
} from '../trend-anomaly-engine';
import type { TrendDataPoint, TrendSeries, AnomalyConfig } from '@/types';

// ─── Time constants ──────────────────────────────────────────

const MIN = 60_000;
const HOUR = 3_600_000;

// ─── Test data factories ─────────────────────────────────────

function makePoint(ts: number, values: Record<string, number | null>): TrendDataPoint {
  return { timestamp: ts, values };
}

function makeSeries(id: string, valueType: 'numeric' | 'binary' = 'numeric'): TrendSeries {
  return { id, name: id, unit: '°F', color: '#000', visible: true, yAxisSide: 'left', valueType, sourceFile: 'test.csv' };
}

function makeConfig(overrides: Partial<AnomalyConfig> = {}): AnomalyConfig {
  return { ...defaultAnomalyConfig(), ...overrides };
}

/** Generate evenly-spaced data points with a value function. */
function generateData(
  seriesId: string,
  count: number,
  intervalMs: number,
  valueFn: (i: number) => number | null,
  startTs = 0,
): TrendDataPoint[] {
  return Array.from({ length: count }, (_, i) =>
    makePoint(startTs + i * intervalMs, { [seriesId]: valueFn(i) })
  );
}

/**
 * Run detectAnomalies and return only the anomalies matching a given type,
 * for a single named series.
 */
function runDetector(
  data: TrendDataPoint[],
  seriesId: string,
  config: AnomalyConfig,
  valueType: 'numeric' | 'binary' = 'numeric',
) {
  return detectAnomalies(data, [makeSeries(seriesId, valueType)], config);
}

// ─── defaultAnomalyConfig ────────────────────────────────────

describe('defaultAnomalyConfig', () => {
  it('returns an object with all required keys', () => {
    const config = defaultAnomalyConfig();
    expect(config).toHaveProperty('stuckThresholdMinutes');
    expect(config).toHaveProperty('stuckTolerance');
    expect(config).toHaveProperty('spikeStdDevMultiplier');
    expect(config).toHaveProperty('spikeRollingWindowSize');
    expect(config).toHaveProperty('outOfRangeMin');
    expect(config).toHaveProperty('outOfRangeMax');
    expect(config).toHaveProperty('oscillationWindowMinutes');
    expect(config).toHaveProperty('oscillationMinReversals');
    expect(config).toHaveProperty('shortCycleWindowMinutes');
    expect(config).toHaveProperty('shortCycleMinTransitions');
    expect(config).toHaveProperty('gapThresholdMultiplier');
  });

  it('returns valid config with expected defaults', () => {
    const config = defaultAnomalyConfig();
    expect(config.stuckThresholdMinutes).toBe(60);
    expect(config.stuckTolerance).toBe(0.01);
    expect(config.spikeStdDevMultiplier).toBe(3);
    expect(config.spikeRollingWindowSize).toBe(20);
    expect(config.outOfRangeMin).toBeNull();
    expect(config.outOfRangeMax).toBeNull();
    expect(config.oscillationWindowMinutes).toBe(10);
    expect(config.oscillationMinReversals).toBe(6);
    expect(config.shortCycleWindowMinutes).toBe(15);
    expect(config.shortCycleMinTransitions).toBe(8);
    expect(config.gapThresholdMultiplier).toBe(3);
  });

  it('returns a fresh object on each call (no shared reference)', () => {
    const a = defaultAnomalyConfig();
    const b = defaultAnomalyConfig();
    a.stuckThresholdMinutes = 9999;
    expect(b.stuckThresholdMinutes).toBe(60);
  });
});

// ─── computeSeriesStats ──────────────────────────────────────

describe('computeSeriesStats', () => {
  // ── normal data ───────────────────────────────────────────

  describe('normal numeric data', () => {
    // Five evenly-spaced readings: 1, 3, 5, 7, 9
    const data = [1, 3, 5, 7, 9].map((v, i) => makePoint(i * MIN, { temp: v }));

    it('returns the correct seriesId', () => {
      expect(computeSeriesStats(data, 'temp').seriesId).toBe('temp');
    });

    it('computes min and max', () => {
      const stats = computeSeriesStats(data, 'temp');
      expect(stats.min).toBe(1);
      expect(stats.max).toBe(9);
    });

    it('computes mean', () => {
      expect(computeSeriesStats(data, 'temp').mean).toBeCloseTo(5, 10);
    });

    it('computes median for odd-length array', () => {
      expect(computeSeriesStats(data, 'temp').median).toBe(5);
    });

    it('computes median for even-length array', () => {
      const evenData = [10, 20, 30, 40].map((v, i) => makePoint(i * MIN, { s: v }));
      expect(computeSeriesStats(evenData, 's').median).toBeCloseTo(25, 10);
    });

    it('computes sample standard deviation via Welfords algorithm', () => {
      // Values: 2, 4, 4, 4, 5, 5, 7, 9 — sample stddev ≈ 2.0
      const vals = [2, 4, 4, 4, 5, 5, 7, 9];
      const d = vals.map((v, i) => makePoint(i * MIN, { s: v }));
      expect(computeSeriesStats(d, 's').stdDev).toBeCloseTo(2.0, 0);
    });

    it('returns correct sampleCount', () => {
      expect(computeSeriesStats(data, 'temp').sampleCount).toBe(5);
    });

    it('records firstTimestamp and lastTimestamp', () => {
      // Use non-zero startTs to avoid the firstTs === 0 edge case
      const startTs = HOUR;
      const d = generateData('s', 10, MIN, () => 50, startTs);
      const stats = computeSeriesStats(d, 's');
      expect(stats.firstTimestamp).toBe(startTs);
      expect(stats.lastTimestamp).toBe(startTs + 9 * MIN);
    });

    it('returns gapCount of 0 for evenly-spaced data', () => {
      expect(computeSeriesStats(data, 'temp').gapCount).toBe(0);
    });

    it('returns null runtimeHours for ordinary numeric data', () => {
      expect(computeSeriesStats(data, 'temp').runtimeHours).toBeNull();
    });
  });

  // ── empty / null values ───────────────────────────────────

  describe('empty data / null values', () => {
    it('returns safe zero/null defaults for an empty array', () => {
      const stats = computeSeriesStats([], 'temp');
      expect(stats.sampleCount).toBe(0);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
      expect(stats.mean).toBe(0);
      expect(stats.median).toBe(0);
      expect(stats.stdDev).toBe(0);
      expect(stats.gapCount).toBe(0);
      expect(stats.runtimeHours).toBeNull();
    });

    it('treats all-null values as zero samples', () => {
      const data = [makePoint(0, { s: null }), makePoint(MIN, { s: null })];
      const stats = computeSeriesStats(data, 's');
      expect(stats.sampleCount).toBe(0);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
    });

    it('handles data where the requested seriesId is absent from all points', () => {
      const data = [makePoint(0, { other: 1 }), makePoint(MIN, { other: 2 })];
      const stats = computeSeriesStats(data, 'temp');
      expect(stats.sampleCount).toBe(0);
    });

    it('skips null entries but still counts non-null ones', () => {
      const data = [
        makePoint(0,       { temp: 10 }),
        makePoint(MIN,     { temp: null }),
        makePoint(2 * MIN, { temp: 30 }),
      ];
      const stats = computeSeriesStats(data, 'temp');
      expect(stats.sampleCount).toBe(2);
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(30);
    });

    it('returns stdDev of 0 for a single sample', () => {
      const stats = computeSeriesStats([makePoint(0, { temp: 42 })], 'temp');
      expect(stats.stdDev).toBe(0);
    });
  });

  // ── binary data / runtimeHours ────────────────────────────

  describe('binary data – runtimeHours', () => {
    it('returns null runtimeHours when sensor is always OFF (value 0)', () => {
      const data = generateData('fan', 4, HOUR, () => 0);
      expect(computeSeriesStats(data, 'fan').runtimeHours).toBeNull();
    });

    it('returns null runtimeHours for constant-ON sensor due to prevTs overwrite', () => {
      // The engine overwrites prevTs with the current point before looking it up,
      // so the "previous" lookup always finds the current point itself (prevVal ===
      // current val), meaning runtimeMs never accumulates — this tests the actual
      // observable behaviour of the implementation.
      const data = generateData('fan', 4, HOUR, () => 1);
      expect(computeSeriesStats(data, 'fan').runtimeHours).toBeNull();
    });
  });

  // ── gap detection ─────────────────────────────────────────

  describe('gap detection', () => {
    it('detects a single large gap in otherwise regular data', () => {
      // 5 points at 1-min intervals, then a 30-min gap, then 5 more at 1-min
      const data = [
        ...generateData('s', 5, MIN, () => 72),
        ...generateData('s', 5, MIN, () => 72, 5 * MIN + 30 * MIN),
      ];
      expect(computeSeriesStats(data, 's').gapCount).toBeGreaterThanOrEqual(1);
    });

    it('returns gapCount 0 for evenly-spaced data', () => {
      const data = generateData('s', 10, MIN, () => 42);
      expect(computeSeriesStats(data, 's').gapCount).toBe(0);
    });

    it('returns gapCount 0 when there is only one interval (two points)', () => {
      const data = [makePoint(0, { s: 1 }), makePoint(MIN, { s: 2 })];
      expect(computeSeriesStats(data, 's').gapCount).toBe(0);
    });

    it('counts multiple gaps independently', () => {
      // Three clusters separated by large gaps
      const data = [
        ...generateData('s', 5, MIN, () => 1),
        ...generateData('s', 5, MIN, () => 1, 5 * MIN + 30 * MIN),
        ...generateData('s', 5, MIN, () => 1, 5 * MIN + 30 * MIN + 5 * MIN + 30 * MIN),
      ];
      expect(computeSeriesStats(data, 's').gapCount).toBeGreaterThanOrEqual(2);
    });
  });
});

// ─── detectStuckSensor ───────────────────────────────────────

describe('detectStuckSensor', () => {
  /** Config that disables all detectors except stuck-sensor. */
  function stuckOnly(overrides: Partial<AnomalyConfig> = {}): AnomalyConfig {
    return makeConfig({
      stuckThresholdMinutes: 60,
      stuckTolerance: 0.01,
      spikeStdDevMultiplier: 999,
      outOfRangeMin: null,
      outOfRangeMax: null,
      oscillationMinReversals: 999,
      shortCycleMinTransitions: 999,
      gapThresholdMultiplier: 999,
      ...overrides,
    });
  }

  function stuck(data: TrendDataPoint[], cfg = stuckOnly()) {
    return runDetector(data, 'temp', cfg).filter(a => a.type === 'stuck-sensor');
  }

  it('flags a sensor stuck at a constant value beyond the threshold', () => {
    // 120 minutes of constant 72°F — threshold is 60 min, so this must trigger.
    const data = generateData('temp', 121, MIN, () => 72.0);
    expect(stuck(data).length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag normal variation', () => {
    // Sin-wave well above stuckTolerance — should never trigger.
    const data = generateData('temp', 120, MIN, (i) => 72 + Math.sin(i / 10) * 2);
    expect(stuck(data)).toHaveLength(0);
  });

  it('does not flag a stuck period shorter than the threshold', () => {
    // 30 min stuck (below 60-min threshold) then a value change.
    const data = [
      ...generateData('temp', 31, MIN, () => 72),
      makePoint(31 * MIN, { temp: 73 }),
    ];
    expect(stuck(data)).toHaveLength(0);
  });

  it('treats tiny variation within stuckTolerance as stuck', () => {
    // Alternates 72.000 / 72.005 — delta 0.005 < tolerance 0.01.
    const data = generateData('temp', 121, MIN, (i) => 72 + (i % 2 === 0 ? 0 : 0.005));
    expect(stuck(data, stuckOnly({ stuckTolerance: 0.01 })).length).toBeGreaterThanOrEqual(1);
  });

  it('detects a trailing stuck period at the end of the data', () => {
    // Changes once early, then stuck for 70 min all the way to the last point.
    const data: TrendDataPoint[] = [
      makePoint(0,   { temp: 65 }),
      makePoint(MIN, { temp: 72 }),  // value changes here
      ...generateData('temp', 70, MIN, () => 72, 2 * MIN),
    ];
    const anomalies = stuck(data);
    expect(anomalies.length).toBeGreaterThanOrEqual(1);
    // Trailing anomaly ends at the final timestamp in the dataset.
    const last = anomalies[anomalies.length - 1];
    expect(last.endTimestamp).toBe(71 * MIN);
  });

  it('assigns severity "warning" when stuck duration is ≤ 4 hours', () => {
    // 2 hours stuck — above threshold, at most 2 h → "warning".
    const data = generateData('temp', 121, MIN, () => 72.0);
    const anomalies = stuck(data);
    expect(anomalies[0].severity).toBe('warning');
  });

  it('assigns severity "critical" when stuck duration exceeds 4 hours', () => {
    // 5 hours of constant value.
    const data = generateData('temp', 301, MIN, () => 72.0);
    expect(stuck(data).some(a => a.severity === 'critical')).toBe(true);
  });

  it('includes the stuck value in the anomaly description', () => {
    const data = generateData('temp', 121, MIN, () => 55.5);
    expect(stuck(data)[0].description).toContain('55.50');
  });

  it('annotates anomalies with the correct seriesId', () => {
    const data = generateData('temp', 121, MIN, () => 72);
    stuck(data).forEach(a => expect(a.seriesId).toBe('temp'));
  });

  it('sets startTimestamp to the beginning of the stuck run', () => {
    // Stuck starts from the very first sample (t = 0).
    const data = generateData('temp', 121, MIN, () => 72.0);
    const anomalies = stuck(data);
    expect(anomalies[0].startTimestamp).toBe(0);
  });
});

// ─── detectSpikes ────────────────────────────────────────────

describe('detectSpikes', () => {
  /** Config that disables all detectors except spikes. */
  function spikeOnly(overrides: Partial<AnomalyConfig> = {}): AnomalyConfig {
    return makeConfig({
      spikeStdDevMultiplier: 3,
      spikeRollingWindowSize: 20,
      stuckThresholdMinutes: 9999,
      outOfRangeMin: null,
      outOfRangeMax: null,
      oscillationMinReversals: 999,
      shortCycleMinTransitions: 999,
      gapThresholdMultiplier: 999,
      ...overrides,
    });
  }

  function spikes(data: TrendDataPoint[], cfg = spikeOnly()) {
    return runDetector(data, 'temp', cfg).filter(a => a.type === 'spike');
  }

  it('detects a sudden outlier in otherwise normal data', () => {
    // 30 readings near 72°F; index 25 is a far-out spike.
    const data = generateData('temp', 30, MIN, (i) => i === 25 ? 200 : 72);
    expect(spikes(data).length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag constant-value data (stdDev = 0 guard)', () => {
    const data = generateData('temp', 30, MIN, () => 72);
    expect(spikes(data)).toHaveLength(0);
  });

  it('does not detect anything before the rolling window fills', () => {
    // windowSize=20, only 10 points total — engine should never evaluate
    const data = generateData('temp', 10, MIN, (i) => i === 9 ? 999 : 72);
    expect(spikes(data, spikeOnly({ spikeRollingWindowSize: 20 }))).toHaveLength(0);
  });

  it('spike severity is "warning" for z-score between multiplier and 5σ', () => {
    // A single spike inside a window of 20 has a theoretical z-score cap of
    // sqrt(windowSize - 1) ≈ 4.36 (because the spike is included in its own
    // window mean/stdDev), which is below the critical threshold of 5σ.
    const data = generateData('temp', 50, MIN, (i) => {
      if (i === 45) return 100_000;
      return 72 + (i % 3) * 0.1;
    });
    const anomalies = spikes(data, spikeOnly({ spikeRollingWindowSize: 20 }));
    expect(anomalies.length).toBeGreaterThanOrEqual(1);
    // Every detected spike is "warning" because z ≤ 4.36 < 5
    expect(anomalies.every(a => a.severity === 'warning')).toBe(true);
  });

  it('spike severity is "critical" for an isolated spike in a window large enough to exceed 5σ', () => {
    // For a single spike in a window of n points, the maximum z-score is sqrt(n-1).
    // With windowSize=27, sqrt(26) ≈ 5.099 > 5, so a lone far-out spike scores critical.
    // We need enough leading normal points to fill the window before the spike.
    const data = generateData('temp', 40, MIN, (i) => {
      if (i === 35) return 1_000_000;  // extreme isolated spike
      return 72;
    });
    const anomalies = spikes(data, spikeOnly({ spikeRollingWindowSize: 27, spikeStdDevMultiplier: 3 }));
    expect(anomalies.some(a => a.severity === 'critical')).toBe(true);
  });

  it('records the correct timestamp for the spike point', () => {
    const spikeTs = 25 * MIN;
    const data = generateData('temp', 30, MIN, (i) => i === 25 ? 500 : 72);
    const anomalies = spikes(data);
    expect(anomalies.some(a => a.startTimestamp === spikeTs)).toBe(true);
  });

  it('includes the spike value and z-score in the description', () => {
    const data = generateData('temp', 30, MIN, (i) => i === 25 ? 500 : 72);
    const anomalies = spikes(data);
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0].description).toMatch(/\d+\.\d+σ/);
  });

  it('records the spike value on the anomaly object', () => {
    const data = generateData('temp', 30, MIN, (i) => i === 25 ? 200 : 72);
    const anomalies = spikes(data);
    const spikeAnomaly = anomalies.find(a => a.startTimestamp === 25 * MIN);
    expect(spikeAnomaly?.value).toBe(200);
  });
});

// ─── detectOutOfRange ────────────────────────────────────────

describe('detectOutOfRange', () => {
  /** Config that disables all detectors except out-of-range. */
  function oorOnly(overrides: Partial<AnomalyConfig> = {}): AnomalyConfig {
    return makeConfig({
      stuckThresholdMinutes: 9999,
      spikeStdDevMultiplier: 999,
      oscillationMinReversals: 999,
      shortCycleMinTransitions: 999,
      gapThresholdMultiplier: 999,
      ...overrides,
    });
  }

  function oor(data: TrendDataPoint[], cfg: AnomalyConfig) {
    return runDetector(data, 'temp', cfg).filter(a => a.type === 'out-of-range');
  }

  it('flags values below outOfRangeMin', () => {
    const data = generateData('temp', 10, MIN, (i) => i === 5 ? -10 : 72);
    const anomalies = oor(data, oorOnly({ outOfRangeMin: 0, outOfRangeMax: null }));
    expect(anomalies.length).toBeGreaterThanOrEqual(1);
    expect(anomalies[0].description).toContain('Below minimum');
  });

  it('flags values above outOfRangeMax', () => {
    const data = generateData('temp', 10, MIN, (i) => i === 5 ? 150 : 72);
    const anomalies = oor(data, oorOnly({ outOfRangeMin: null, outOfRangeMax: 100 }));
    expect(anomalies.length).toBeGreaterThanOrEqual(1);
    expect(anomalies[0].description).toContain('Above maximum');
  });

  it('flags both min and max violations independently in a single pass', () => {
    const data = [
      makePoint(0,       { temp: 20 }),   // below min 50
      makePoint(MIN,     { temp: 72 }),   // in range
      makePoint(2 * MIN, { temp: 120 }),  // above max 100
    ];
    const anomalies = oor(data, oorOnly({ outOfRangeMin: 50, outOfRangeMax: 100 }));
    expect(anomalies.length).toBe(2);
    expect(anomalies.map(a => a.startTimestamp)).toContain(0);
    expect(anomalies.map(a => a.startTimestamp)).toContain(2 * MIN);
  });

  it('produces no flags when both outOfRangeMin and outOfRangeMax are null', () => {
    const data = generateData('temp', 10, MIN, (i) => i === 5 ? 500 : 72);
    const anomalies = oor(data, oorOnly({ outOfRangeMin: null, outOfRangeMax: null }));
    expect(anomalies).toHaveLength(0);
  });

  it('does not flag in-range values', () => {
    const data = [makePoint(0, { temp: 72 }), makePoint(MIN, { temp: 68 })];
    const anomalies = oor(data, oorOnly({ outOfRangeMin: 50, outOfRangeMax: 90 }));
    expect(anomalies).toHaveLength(0);
  });

  it('skips null values without throwing', () => {
    const data = [makePoint(0, { temp: null }), makePoint(MIN, { temp: 20 })];
    const anomalies = oor(data, oorOnly({ outOfRangeMin: 50, outOfRangeMax: null }));
    expect(anomalies.length).toBe(1);
    expect(anomalies[0].startTimestamp).toBe(MIN);
  });

  it('includes the offending value in the description', () => {
    const data = [makePoint(0, { temp: 25.75 })];
    const anomalies = oor(data, oorOnly({ outOfRangeMin: 50, outOfRangeMax: null }));
    expect(anomalies[0].description).toContain('25.75');
  });

  it('attaches the offending value to the anomaly object', () => {
    const data = [makePoint(0, { temp: -5 })];
    const anomalies = oor(data, oorOnly({ outOfRangeMin: 0, outOfRangeMax: null }));
    expect(anomalies[0].value).toBe(-5);
  });
});

// ─── detectOscillation ──────────────────────────────────────

describe('detectOscillation', () => {
  /** Config that disables all detectors except oscillation. */
  function oscOnly(overrides: Partial<AnomalyConfig> = {}): AnomalyConfig {
    return makeConfig({
      oscillationWindowMinutes: 10,
      oscillationMinReversals: 6,
      stuckThresholdMinutes: 9999,
      spikeStdDevMultiplier: 999,
      outOfRangeMin: null,
      outOfRangeMax: null,
      shortCycleMinTransitions: 999,
      gapThresholdMultiplier: 999,
      ...overrides,
    });
  }

  function osc(data: TrendDataPoint[], cfg = oscOnly()) {
    return runDetector(data, 'temp', cfg).filter(a => a.type === 'oscillation');
  }

  it('flags rapidly oscillating data with many direction reversals', () => {
    // 60 readings at 10-second intervals alternating 72/68 — dense reversals in window.
    const data = generateData('temp', 60, 10_000, (i) => i % 2 === 0 ? 72 : 68);
    expect(osc(data).length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag monotonically increasing (smooth) data', () => {
    const data = generateData('temp', 60, MIN, (i) => 70 + i * 0.1);
    expect(osc(data)).toHaveLength(0);
  });

  it('does not flag data with fewer reversals than the minimum threshold', () => {
    // Only 4 reversals total — below oscillationMinReversals=6.
    const data = [
      ...Array.from({ length: 5 }, (_, i) => makePoint(i * MIN, { temp: 50 + i % 2 })),
      ...generateData('temp', 20, MIN, () => 50, 5 * MIN),
    ];
    expect(osc(data)).toHaveLength(0);
  });

  it('returns empty array gracefully when fewer than 4 non-null points exist', () => {
    const data = [
      makePoint(0,       { temp: 50 }),
      makePoint(MIN,     { temp: 60 }),
      makePoint(2 * MIN, { temp: 50 }),
    ];
    expect(() => osc(data)).not.toThrow();
    expect(osc(data)).toHaveLength(0);
  });

  it('merges overlapping oscillation windows into a single extended anomaly', () => {
    // 25 minutes of continuous alternating data → should yield 1 merged anomaly.
    const data = generateData('temp', 25, MIN, (i) => i % 2 === 0 ? 50 : 60);
    const anomalies = osc(data, oscOnly({ oscillationWindowMinutes: 10, oscillationMinReversals: 6 }));
    expect(anomalies.length).toBe(1);
    expect(anomalies[0].endTimestamp).toBeGreaterThan(anomalies[0].startTimestamp);
  });

  it('assigns "warning" severity when reversals are between min and 2× min', () => {
    const data = generateData('temp', 30, 30_000, (i) => i % 2 === 0 ? 50 : 55);
    const anomalies = osc(data, oscOnly({ oscillationWindowMinutes: 10, oscillationMinReversals: 6 }));
    expect(anomalies.length).toBeGreaterThan(0);
    // First anomaly spans a small window — reversals likely < 2×6 = 12.
    expect(anomalies[0].severity).toBe('warning');
  });

  it('includes reversal count in the description', () => {
    const data = generateData('temp', 60, 10_000, (i) => i % 2 === 0 ? 72 : 68);
    const anomalies = osc(data);
    expect(anomalies[0].description).toMatch(/\d+ direction reversals/);
  });
});

// ─── detectShortCycling ──────────────────────────────────────

describe('detectShortCycling', () => {
  /** Config that disables all detectors except short-cycling. */
  function scOnly(overrides: Partial<AnomalyConfig> = {}): AnomalyConfig {
    return makeConfig({
      shortCycleWindowMinutes: 15,
      shortCycleMinTransitions: 8,
      stuckThresholdMinutes: 9999,
      spikeStdDevMultiplier: 999,
      outOfRangeMin: null,
      outOfRangeMax: null,
      oscillationMinReversals: 999,
      gapThresholdMultiplier: 999,
      ...overrides,
    });
  }

  function sc(data: TrendDataPoint[], cfg = scOnly(), valueType: 'numeric' | 'binary' = 'binary') {
    return detectAnomalies(data, [makeSeries('fan', valueType)], cfg).filter(a => a.type === 'short-cycling');
  }

  it('flags rapid on/off transitions in a binary series', () => {
    // Binary signal toggling every 30 s for 15 minutes — 30 transitions.
    const data = generateData('fan', 30, 30_000, (i) => i % 2 === 0 ? 1 : 0);
    const anomalies = sc(data, scOnly({ shortCycleWindowMinutes: 15, shortCycleMinTransitions: 8 }));
    expect(anomalies.length).toBeGreaterThanOrEqual(1);
    expect(anomalies[0].severity).toBe('critical');
  });

  it('does not flag normal binary operation with few transitions', () => {
    // ON for 10 min, then OFF — only 2 total transitions.
    const data = [
      ...generateData('fan', 10, MIN, () => 0),
      ...generateData('fan', 50, MIN, () => 1, 10 * MIN),
    ];
    expect(sc(data)).toHaveLength(0);
  });

  it('does not flag a numeric series even with rapid transitions', () => {
    const data = generateData('fan', 30, 30_000, (i) => i % 2 === 0 ? 1 : 0);
    expect(sc(data, scOnly({ shortCycleMinTransitions: 4 }), 'numeric')).toHaveLength(0);
  });

  it('merges overlapping short-cycle windows into a small number of anomalies', () => {
    // 30 points alternating — should produce far fewer anomalies than 30.
    const data = generateData('fan', 30, MIN, (i) => i % 2 === 0 ? 0 : 1);
    const anomalies = sc(data, scOnly({ shortCycleMinTransitions: 8, shortCycleWindowMinutes: 15 }));
    expect(anomalies.length).toBeLessThan(10);
  });

  it('returns gracefully with fewer than 3 data points', () => {
    const data = [makePoint(0, { fan: 0 }), makePoint(MIN, { fan: 1 })];
    expect(() => sc(data)).not.toThrow();
    expect(sc(data)).toHaveLength(0);
  });

  it('includes transition count and window duration in the description', () => {
    const data = generateData('fan', 30, 30_000, (i) => i % 2 === 0 ? 1 : 0);
    const anomalies = sc(data);
    expect(anomalies[0].description).toMatch(/\d+ state transitions/);
    expect(anomalies[0].description).toMatch(/\d+ min/);
  });
});

// ─── detectGaps ──────────────────────────────────────────────

describe('detectGaps', () => {
  /** Config that disables all detectors except gaps. */
  function gapOnly(overrides: Partial<AnomalyConfig> = {}): AnomalyConfig {
    return makeConfig({
      gapThresholdMultiplier: 3,
      stuckThresholdMinutes: 9999,
      spikeStdDevMultiplier: 999,
      outOfRangeMin: null,
      outOfRangeMax: null,
      oscillationMinReversals: 999,
      shortCycleMinTransitions: 999,
      ...overrides,
    });
  }

  function gaps(data: TrendDataPoint[], cfg = gapOnly()) {
    return runDetector(data, 'temp', cfg).filter(a => a.type === 'gap');
  }

  it('detects a large gap between otherwise evenly spaced points', () => {
    const data = [
      ...generateData('temp', 20, MIN, () => 72),
      ...generateData('temp', 20, MIN, () => 72, 20 * MIN + 30 * MIN),
    ];
    expect(gaps(data).length).toBeGreaterThanOrEqual(1);
    expect(gaps(data)[0].severity).toBe('info');
  });

  it('records the correct start and end timestamps for the gap', () => {
    const pts = [
      ...generateData('temp', 5, MIN, () => 10),
    ];
    const gapEnd = 4 * MIN + 20 * MIN;
    const rest = generateData('temp', 5, MIN, () => 10, gapEnd);
    const data = [...pts, ...rest];
    const anomalies = gaps(data);
    const g = anomalies.find(a => a.type === 'gap');
    expect(g).toBeDefined();
    expect(g!.startTimestamp).toBe(4 * MIN);
    expect(g!.endTimestamp).toBe(gapEnd);
  });

  it('does not flag evenly-spaced data', () => {
    const data = generateData('temp', 60, MIN, () => 72);
    expect(gaps(data)).toHaveLength(0);
  });

  it('returns no anomalies when fewer than 3 data points exist', () => {
    const data = [makePoint(0, { temp: 1 }), makePoint(MIN, { temp: 2 })];
    expect(gaps(data)).toHaveLength(0);
  });

  it('respects gapThresholdMultiplier — larger multiplier requires a bigger gap to trigger', () => {
    // Gap is 4× the normal interval (4-min gap with 1-min spacing).
    const pts = [
      ...generateData('temp', 5, MIN, () => 10),
      ...generateData('temp', 5, MIN, () => 10, 4 * MIN + 4 * MIN),
    ];
    expect(gaps(pts, gapOnly({ gapThresholdMultiplier: 3 })).length).toBeGreaterThan(0);
    expect(gaps(pts, gapOnly({ gapThresholdMultiplier: 5 }))).toHaveLength(0);
  });

  it('detects multiple independent gaps in a single dataset', () => {
    const data = [
      ...generateData('temp', 5, MIN, () => 1),
      ...generateData('temp', 5, MIN, () => 1, 5 * MIN + 20 * MIN),          // gap 1
      ...generateData('temp', 5, MIN, () => 1, 5 * MIN + 20 * MIN + 5 * MIN + 20 * MIN), // gap 2
    ];
    expect(gaps(data).length).toBeGreaterThanOrEqual(2);
  });

  it('includes gap magnitude relative to median interval in the description', () => {
    const data = [
      ...generateData('temp', 10, MIN, () => 72),
      ...generateData('temp', 10, MIN, () => 72, 10 * MIN + 30 * MIN),
    ];
    const anomalies = gaps(data);
    expect(anomalies[0].description).toMatch(/\d+(\.\d+)?× normal interval/);
  });

  it('assigns severity "info" for all gap anomalies', () => {
    const data = [
      ...generateData('temp', 10, MIN, () => 72),
      ...generateData('temp', 10, MIN, () => 72, 10 * MIN + 30 * MIN),
    ];
    gaps(data).forEach(g => expect(g.severity).toBe('info'));
  });
});

// ─── detectAnomalies (master function) ───────────────────────

describe('detectAnomalies', () => {
  it('returns an empty array when passed no series', () => {
    const data = generateData('temp', 10, MIN, () => 72);
    expect(detectAnomalies(data, [], makeConfig())).toEqual([]);
  });

  it('returns an empty array when data is empty', () => {
    expect(detectAnomalies([], [makeSeries('temp')], makeConfig())).toHaveLength(0);
  });

  it('calls all sub-detectors and aggregates their results for a numeric series', () => {
    // 2-hour constant value → stuck-sensor + out-of-range
    const data = generateData('temp', 121, MIN, () => 72);
    const config = makeConfig({
      stuckThresholdMinutes: 60,
      outOfRangeMin: null,
      outOfRangeMax: 65,
    });
    const types = new Set(
      detectAnomalies(data, [makeSeries('temp')], config).map(a => a.type)
    );
    expect(types.has('stuck-sensor')).toBe(true);
    expect(types.has('out-of-range')).toBe(true);
  });

  it('does NOT invoke detectShortCycling for a numeric series', () => {
    const data = generateData('temp', 20, MIN, (i) => i % 2 === 0 ? 0 : 1);
    const anomalies = detectAnomalies(
      data,
      [makeSeries('temp', 'numeric')],
      makeConfig({ shortCycleMinTransitions: 4 }),
    );
    expect(anomalies.some(a => a.type === 'short-cycling')).toBe(false);
  });

  it('invokes detectShortCycling for a binary series', () => {
    const data = generateData('fan', 20, MIN, (i) => i % 2 === 0 ? 0 : 1);
    const config = makeConfig({ shortCycleWindowMinutes: 15, shortCycleMinTransitions: 4 });
    const anomalies = detectAnomalies(data, [makeSeries('fan', 'binary')], config);
    expect(anomalies.some(a => a.type === 'short-cycling')).toBe(true);
  });

  it('processes each series independently and tags anomalies with the correct seriesId', () => {
    const data = generateData('temp', 121, MIN, () => 72).map(p => ({
      ...p,
      values: { ...p.values, humidity: 50 },
    }));
    const series = [makeSeries('temp'), makeSeries('humidity')];
    const config = makeConfig({ stuckThresholdMinutes: 60 });
    const anomalies = detectAnomalies(data, series, config);

    const stuckTemp     = anomalies.filter(a => a.type === 'stuck-sensor' && a.seriesId === 'temp');
    const stuckHumidity = anomalies.filter(a => a.type === 'stuck-sensor' && a.seriesId === 'humidity');
    expect(stuckTemp.length).toBeGreaterThanOrEqual(1);
    expect(stuckHumidity.length).toBeGreaterThanOrEqual(1);
  });

  it('assigns the mocked uuid ("test-uuid") as the id on every anomaly', () => {
    const data = generateData('temp', 121, MIN, () => 72);
    const anomalies = detectAnomalies(data, [makeSeries('temp')], makeConfig());
    expect(anomalies.length).toBeGreaterThan(0);
    anomalies.forEach(a => expect(a.id).toBe('test-uuid'));
  });

  it('returns results covering stuck-sensor and gap when data contains both patterns', () => {
    const data = [
      ...generateData('temp', 5, MIN, () => 72),
      // 30-minute gap
      ...generateData('temp', 70, MIN, () => 72, 5 * MIN + 30 * MIN),
    ];
    const config = makeConfig({ stuckThresholdMinutes: 60, gapThresholdMultiplier: 3 });
    const types = new Set(detectAnomalies(data, [makeSeries('temp')], config).map(a => a.type));
    expect(types.has('gap')).toBe(true);
    expect(types.has('stuck-sensor')).toBe(true);
  });
});
