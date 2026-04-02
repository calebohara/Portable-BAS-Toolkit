import { describe, it, expect, vi } from 'vitest';

vi.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import {
  defaultAnomalyConfig,
  computeSeriesStats,
  detectAnomalies,
} from '../trend-anomaly-engine';
import type { TrendDataPoint, TrendSeries, AnomalyConfig } from '@/types';

// ─── Helpers ────────────────────────────────────────────────

const MIN = 60_000;
const HOUR = 3_600_000;

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
  seriesId: string, count: number, intervalMs: number, valueFn: (i: number) => number | null, startTs = 0,
): TrendDataPoint[] {
  return Array.from({ length: count }, (_, i) =>
    makePoint(startTs + i * intervalMs, { [seriesId]: valueFn(i) })
  );
}

// ─── Default Config ─────────────────────────────────────────

describe('defaultAnomalyConfig', () => {
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
});

// ─── Series Statistics ──────────────────────────────────────

describe('computeSeriesStats', () => {
  it('computes min, max, mean, median for normal data', () => {
    const data = [1, 3, 5, 7, 9].map((v, i) =>
      makePoint(i * MIN, { temp: v })
    );
    const stats = computeSeriesStats(data, 'temp');

    expect(stats.min).toBe(1);
    expect(stats.max).toBe(9);
    expect(stats.mean).toBe(5);
    expect(stats.median).toBe(5);
    expect(stats.sampleCount).toBe(5);
  });

  it('computes stdDev correctly', () => {
    // Values: 2, 4, 4, 4, 5, 5, 7, 9 → stdDev ≈ 2.0
    const vals = [2, 4, 4, 4, 5, 5, 7, 9];
    const data = vals.map((v, i) => makePoint(i * MIN, { s: v }));
    const stats = computeSeriesStats(data, 's');

    expect(stats.stdDev).toBeCloseTo(2.0, 0);
  });

  it('handles empty/null values gracefully', () => {
    const data = [
      makePoint(0, { s: null }),
      makePoint(MIN, { s: null }),
    ];
    const stats = computeSeriesStats(data, 's');
    expect(stats.sampleCount).toBe(0);
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
    expect(stats.mean).toBe(0);
  });

  it('detects gaps in timestamps', () => {
    // 5 points at 1-min intervals, then a 30-min gap, then 5 more
    const data = [
      ...generateData('s', 5, MIN, () => 72),
      ...generateData('s', 5, MIN, () => 72, 5 * MIN + 30 * MIN),
    ];
    const stats = computeSeriesStats(data, 's');
    expect(stats.gapCount).toBeGreaterThanOrEqual(1);
  });

  it('tracks first and last timestamps', () => {
    // Use non-zero start to avoid the firstTs === 0 initialization edge case
    const startTs = HOUR;
    const data = generateData('s', 10, MIN, () => 50, startTs);
    const stats = computeSeriesStats(data, 's');
    expect(stats.firstTimestamp).toBe(startTs);
    expect(stats.lastTimestamp).toBe(startTs + 9 * MIN);
  });

  it('computes median for even-length array', () => {
    const data = [10, 20, 30, 40].map((v, i) => makePoint(i * MIN, { s: v }));
    const stats = computeSeriesStats(data, 's');
    expect(stats.median).toBe(25); // (20 + 30) / 2
  });
});

// ─── Stuck Sensor Detection ─────────────────────────────────

describe('stuck sensor detection', () => {
  it('flags sensor stuck for > threshold', () => {
    // Sensor stuck at 72.0 for 2 hours
    const data = generateData('temp', 120, MIN, () => 72.0);
    const config = makeConfig({ stuckThresholdMinutes: 60 });
    const anomalies = detectAnomalies(data, [makeSeries('temp')], config);

    const stuck = anomalies.filter(a => a.type === 'stuck-sensor');
    expect(stuck.length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag normal variation', () => {
    // Temperature varying within normal range
    const data = generateData('temp', 120, MIN, (i) => 72 + Math.sin(i / 10) * 2);
    const config = makeConfig({ stuckThresholdMinutes: 60 });
    const anomalies = detectAnomalies(data, [makeSeries('temp')], config);

    const stuck = anomalies.filter(a => a.type === 'stuck-sensor');
    expect(stuck).toHaveLength(0);
  });

  it('respects stuckTolerance', () => {
    // Value varies by 0.005 (within default tolerance of 0.01)
    const data = generateData('temp', 120, MIN, (i) => 72 + (i % 2) * 0.005);
    const config = makeConfig({ stuckThresholdMinutes: 60 });
    const anomalies = detectAnomalies(data, [makeSeries('temp')], config);

    const stuck = anomalies.filter(a => a.type === 'stuck-sensor');
    expect(stuck.length).toBeGreaterThanOrEqual(1);
  });

  it('detects trailing stuck period', () => {
    // Normal for 30 min, then stuck for 90 min at end
    const data = [
      ...generateData('temp', 30, MIN, (i) => 70 + i * 0.1),
      ...generateData('temp', 90, MIN, () => 73.0, 30 * MIN),
    ];
    const config = makeConfig({ stuckThresholdMinutes: 60 });
    const anomalies = detectAnomalies(data, [makeSeries('temp')], config);

    const stuck = anomalies.filter(a => a.type === 'stuck-sensor');
    expect(stuck.length).toBeGreaterThanOrEqual(1);
  });

  it('sets critical severity for > 4 hours', () => {
    const data = generateData('temp', 300, MIN, () => 72.0); // 5 hours
    const config = makeConfig({ stuckThresholdMinutes: 60 });
    const anomalies = detectAnomalies(data, [makeSeries('temp')], config);

    const stuck = anomalies.filter(a => a.type === 'stuck-sensor');
    expect(stuck.some(a => a.severity === 'critical')).toBe(true);
  });
});

// ─── Spike Detection ────────────────────────────────────────

describe('spike detection', () => {
  it('detects a sudden outlier', () => {
    // 25 normal values then a spike
    const data = generateData('temp', 30, MIN, (i) => i === 25 ? 200 : 72);
    const config = makeConfig({ spikeRollingWindowSize: 20, spikeStdDevMultiplier: 3 });
    const anomalies = detectAnomalies(data, [makeSeries('temp')], config);

    const spikes = anomalies.filter(a => a.type === 'spike');
    expect(spikes.length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag constant values', () => {
    const data = generateData('temp', 30, MIN, () => 72);
    const config = makeConfig();
    const anomalies = detectAnomalies(data, [makeSeries('temp')], config);

    const spikes = anomalies.filter(a => a.type === 'spike');
    expect(spikes).toHaveLength(0);
  });

  it('spike severity is warning for single-point outlier', () => {
    // With a rolling window of size N, a single outlier's z-score is bounded by
    // sqrt(N-1) ≈ 4.36 for N=20, so critical (z > 5) is unreachable for single
    // spikes — this is a known limitation of including the spike in its own window.
    const data = generateData('temp', 50, MIN, (i) => {
      if (i === 45) return 100000;
      return 72 + (i % 3) * 0.1;
    });
    const config = makeConfig({ spikeRollingWindowSize: 20, spikeStdDevMultiplier: 3 });
    const anomalies = detectAnomalies(data, [makeSeries('temp')], config);

    const spikes = anomalies.filter(a => a.type === 'spike');
    expect(spikes.length).toBeGreaterThanOrEqual(1);
    // Max z for single outlier in window of 20 ≈ sqrt(19) ≈ 4.36 → always 'warning'
    expect(spikes.every(a => a.severity === 'warning')).toBe(true);
  });
});

// ─── Out of Range ───────────────────────────────────────────

describe('out of range detection', () => {
  it('flags values below minimum', () => {
    const data = generateData('temp', 10, MIN, (i) => i === 5 ? -10 : 72);
    const config = makeConfig({ outOfRangeMin: 0, outOfRangeMax: 100 });
    const anomalies = detectAnomalies(data, [makeSeries('temp')], config);

    const oor = anomalies.filter(a => a.type === 'out-of-range');
    expect(oor.length).toBeGreaterThanOrEqual(1);
    expect(oor[0].description).toContain('Below');
  });

  it('flags values above maximum', () => {
    const data = generateData('temp', 10, MIN, (i) => i === 5 ? 150 : 72);
    const config = makeConfig({ outOfRangeMin: 0, outOfRangeMax: 100 });
    const anomalies = detectAnomalies(data, [makeSeries('temp')], config);

    const oor = anomalies.filter(a => a.type === 'out-of-range');
    expect(oor.length).toBeGreaterThanOrEqual(1);
    expect(oor[0].description).toContain('Above');
  });

  it('does not flag when both limits are null', () => {
    const data = generateData('temp', 10, MIN, (i) => i === 5 ? 500 : 72);
    const config = makeConfig({ outOfRangeMin: null, outOfRangeMax: null });
    const anomalies = detectAnomalies(data, [makeSeries('temp')], config);

    const oor = anomalies.filter(a => a.type === 'out-of-range');
    expect(oor).toHaveLength(0);
  });
});

// ─── Oscillation Detection ──────────────────────────────────

describe('oscillation detection', () => {
  it('flags rapidly oscillating data', () => {
    // Rapid up/down pattern within 10 min window
    const data = generateData('temp', 60, 10_000, (i) => (i % 2 === 0) ? 72 : 68);
    const config = makeConfig({ oscillationWindowMinutes: 10, oscillationMinReversals: 6 });
    const anomalies = detectAnomalies(data, [makeSeries('temp')], config);

    const osc = anomalies.filter(a => a.type === 'oscillation');
    expect(osc.length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag smooth data', () => {
    // Gradually increasing
    const data = generateData('temp', 60, MIN, (i) => 70 + i * 0.1);
    const config = makeConfig();
    const anomalies = detectAnomalies(data, [makeSeries('temp')], config);

    const osc = anomalies.filter(a => a.type === 'oscillation');
    expect(osc).toHaveLength(0);
  });
});

// ─── Short Cycling Detection ────────────────────────────────

describe('short cycling detection', () => {
  it('flags rapid binary transitions', () => {
    // Binary signal toggling every 30 seconds for 15 minutes
    const data = generateData('fan', 30, 30_000, (i) => (i % 2 === 0) ? 1 : 0);
    const series = makeSeries('fan', 'binary');
    const config = makeConfig({ shortCycleWindowMinutes: 15, shortCycleMinTransitions: 8 });
    const anomalies = detectAnomalies(data, [series], config);

    const sc = anomalies.filter(a => a.type === 'short-cycling');
    expect(sc.length).toBeGreaterThanOrEqual(1);
    expect(sc[0].severity).toBe('critical');
  });

  it('does not flag normal binary operation', () => {
    // Fan turns on once and stays on
    const data = [
      ...generateData('fan', 10, MIN, () => 0),
      ...generateData('fan', 50, MIN, () => 1, 10 * MIN),
    ];
    const series = makeSeries('fan', 'binary');
    const config = makeConfig();
    const anomalies = detectAnomalies(data, [series], config);

    const sc = anomalies.filter(a => a.type === 'short-cycling');
    expect(sc).toHaveLength(0);
  });

  it('does not detect short cycling for non-binary series', () => {
    // Same toggling data but on an analog series
    const data = generateData('temp', 30, 30_000, (i) => (i % 2 === 0) ? 1 : 0);
    const series = makeSeries('temp', 'numeric');
    const config = makeConfig({ shortCycleMinTransitions: 8 });
    const anomalies = detectAnomalies(data, [series], config);

    const sc = anomalies.filter(a => a.type === 'short-cycling');
    expect(sc).toHaveLength(0);
  });
});

// ─── Gap Detection ──────────────────────────────────────────

describe('gap detection', () => {
  it('flags large data gaps', () => {
    // Regular 1-min data with a 30-min gap in the middle
    const data = [
      ...generateData('temp', 20, MIN, () => 72),
      ...generateData('temp', 20, MIN, () => 72, 20 * MIN + 30 * MIN),
    ];
    const config = makeConfig({ gapThresholdMultiplier: 3 });
    const anomalies = detectAnomalies(data, [makeSeries('temp')], config);

    const gaps = anomalies.filter(a => a.type === 'gap');
    expect(gaps.length).toBeGreaterThanOrEqual(1);
    expect(gaps[0].severity).toBe('info');
  });

  it('does not flag evenly spaced data', () => {
    const data = generateData('temp', 60, MIN, () => 72);
    const config = makeConfig();
    const anomalies = detectAnomalies(data, [makeSeries('temp')], config);

    const gaps = anomalies.filter(a => a.type === 'gap');
    expect(gaps).toHaveLength(0);
  });
});

// ─── Master Function ────────────────────────────────────────

describe('detectAnomalies', () => {
  it('runs all detectors for analog series', () => {
    // Create data with multiple anomaly types
    const data = [
      // Stuck period (2 hours)
      ...generateData('temp', 120, MIN, () => 72),
      // Then a spike
      makePoint(120 * MIN, { temp: 200 }),
      // Then normal
      ...generateData('temp', 30, MIN, (i) => 72 + Math.sin(i) * 2, 121 * MIN),
    ];
    const config = makeConfig({ stuckThresholdMinutes: 60, spikeRollingWindowSize: 20 });
    const anomalies = detectAnomalies(data, [makeSeries('temp')], config);

    // Should find at least stuck sensor anomaly
    const types = new Set(anomalies.map(a => a.type));
    expect(types.has('stuck-sensor')).toBe(true);
  });

  it('handles empty data gracefully', () => {
    const anomalies = detectAnomalies([], [makeSeries('temp')], makeConfig());
    expect(anomalies).toHaveLength(0);
  });

  it('handles multiple series', () => {
    const data = generateData('temp', 120, MIN, () => 72).map(p => ({
      ...p,
      values: { ...p.values, humidity: 50 },
    }));
    const series = [makeSeries('temp'), makeSeries('humidity')];
    const config = makeConfig({ stuckThresholdMinutes: 60 });
    const anomalies = detectAnomalies(data, series, config);

    // Both series are stuck
    const stuckTemp = anomalies.filter(a => a.type === 'stuck-sensor' && a.seriesId === 'temp');
    const stuckHumidity = anomalies.filter(a => a.type === 'stuck-sensor' && a.seriesId === 'humidity');
    expect(stuckTemp.length).toBeGreaterThanOrEqual(1);
    expect(stuckHumidity.length).toBeGreaterThanOrEqual(1);
  });
});
