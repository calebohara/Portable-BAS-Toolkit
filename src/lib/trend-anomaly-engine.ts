import { v4 as uuid } from 'uuid';
import type {
  TrendDataPoint, TrendSeries, TrendAnomaly,
  TrendSeriesStats, AnomalyConfig, TrendAnomalyType,
} from '@/types';

// ─── Default Config ──────────────────────────────────────────

export function defaultAnomalyConfig(): AnomalyConfig {
  return {
    stuckThresholdMinutes: 60,
    stuckTolerance: 0.01,
    spikeStdDevMultiplier: 3,
    spikeRollingWindowSize: 20,
    outOfRangeMin: null,
    outOfRangeMax: null,
    oscillationWindowMinutes: 10,
    oscillationMinReversals: 6,
    shortCycleWindowMinutes: 15,
    shortCycleMinTransitions: 8,
    gapThresholdMultiplier: 3,
  };
}

// ─── Statistics Computation ──────────────────────────────────

export function computeSeriesStats(data: TrendDataPoint[], seriesId: string): TrendSeriesStats {
  const values: number[] = [];
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let firstTs = 0;
  let lastTs = 0;
  let gapCount = 0;
  let runtimeMs = 0;

  // Welford's online algorithm for stddev
  let m2 = 0;
  let wMean = 0;
  let n = 0;

  // For gap detection
  const intervals: number[] = [];
  let prevTs: number | null = null;

  for (const point of data) {
    const val = point.values[seriesId];
    if (val === null || val === undefined) continue;

    values.push(val);
    sum += val;
    if (val < min) min = val;
    if (val > max) max = val;
    if (firstTs === 0) firstTs = point.timestamp;
    lastTs = point.timestamp;

    // Welford's
    n++;
    const delta = val - wMean;
    wMean += delta / n;
    m2 += delta * (val - wMean);

    // Intervals for gap detection
    if (prevTs !== null) {
      intervals.push(point.timestamp - prevTs);
    }
    prevTs = point.timestamp;

    // Runtime for binary series (value >= 0.5 = ON)
    if (val >= 0.5 && prevTs !== null) {
      const prevPoint = data.find(p => p.timestamp === prevTs);
      if (prevPoint) {
        const prevVal = prevPoint.values[seriesId];
        if (prevVal !== null && prevVal >= 0.5) {
          runtimeMs += point.timestamp - prevTs;
        }
      }
    }
  }

  // Median
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted.length > 0
    ? sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)]
    : 0;

  // Gap count
  if (intervals.length > 0) {
    const sortedIntervals = [...intervals].sort((a, b) => a - b);
    const medianInterval = sortedIntervals[Math.floor(sortedIntervals.length / 2)];
    if (medianInterval > 0) {
      gapCount = intervals.filter(i => i > medianInterval * 3).length;
    }
  }

  const stdDev = n > 1 ? Math.sqrt(m2 / (n - 1)) : 0;

  return {
    seriesId,
    min: min === Infinity ? 0 : min,
    max: max === -Infinity ? 0 : max,
    mean: n > 0 ? sum / n : 0,
    median,
    stdDev,
    sampleCount: n,
    gapCount,
    runtimeHours: runtimeMs > 0 ? runtimeMs / 3600000 : null,
    firstTimestamp: firstTs,
    lastTimestamp: lastTs,
  };
}

// ─── Anomaly Detection ───────────────────────────────────────

export function detectAnomalies(
  data: TrendDataPoint[],
  series: TrendSeries[],
  config: AnomalyConfig,
): TrendAnomaly[] {
  const anomalies: TrendAnomaly[] = [];

  for (const s of series) {
    anomalies.push(...detectStuckSensor(data, s, config));
    anomalies.push(...detectSpikes(data, s, config));
    anomalies.push(...detectOutOfRange(data, s, config));
    anomalies.push(...detectOscillation(data, s, config));
    if (s.valueType === 'binary') {
      anomalies.push(...detectShortCycling(data, s, config));
    }
    anomalies.push(...detectGaps(data, s, config));
  }

  return anomalies;
}

// ── Stuck Sensor ─────────────────────────────────────────────

function detectStuckSensor(data: TrendDataPoint[], series: TrendSeries, config: AnomalyConfig): TrendAnomaly[] {
  const anomalies: TrendAnomaly[] = [];
  const thresholdMs = config.stuckThresholdMinutes * 60_000;

  let lastValue: number | null = null;
  let stuckStartTs = 0;

  for (const point of data) {
    const val = point.values[series.id];
    if (val === null) continue;

    if (lastValue === null) {
      lastValue = val;
      stuckStartTs = point.timestamp;
      continue;
    }

    if (Math.abs(val - lastValue) > config.stuckTolerance) {
      // Value changed — check if we were stuck long enough
      const duration = point.timestamp - stuckStartTs;
      if (duration >= thresholdMs) {
        const durationHours = duration / 3600_000;
        anomalies.push(makeAnomaly(
          series.id, 'stuck-sensor', stuckStartTs, point.timestamp,
          durationHours > 4 ? 'critical' : 'warning',
          `Value stuck at ${lastValue.toFixed(2)} for ${formatDuration(duration)}`,
          lastValue
        ));
      }
      lastValue = val;
      stuckStartTs = point.timestamp;
    }
  }

  // Check trailing stuck period
  if (lastValue !== null && data.length > 0) {
    const lastPoint = data[data.length - 1];
    const duration = lastPoint.timestamp - stuckStartTs;
    if (duration >= thresholdMs) {
      const durationHours = duration / 3600_000;
      anomalies.push(makeAnomaly(
        series.id, 'stuck-sensor', stuckStartTs, lastPoint.timestamp,
        durationHours > 4 ? 'critical' : 'warning',
        `Value stuck at ${lastValue.toFixed(2)} for ${formatDuration(duration)}`,
        lastValue
      ));
    }
  }

  return anomalies;
}

// ── Spike Detection ──────────────────────────────────────────

function detectSpikes(data: TrendDataPoint[], series: TrendSeries, config: AnomalyConfig): TrendAnomaly[] {
  const anomalies: TrendAnomaly[] = [];
  const windowSize = config.spikeRollingWindowSize;
  const buffer: number[] = [];

  for (const point of data) {
    const val = point.values[series.id];
    if (val === null) continue;

    buffer.push(val);
    if (buffer.length > windowSize) buffer.shift();

    if (buffer.length >= windowSize) {
      const mean = buffer.reduce((a, b) => a + b, 0) / buffer.length;
      const variance = buffer.reduce((sum, v) => sum + (v - mean) ** 2, 0) / buffer.length;
      const stdDev = Math.sqrt(variance);

      if (stdDev > 0) {
        const zScore = Math.abs(val - mean) / stdDev;
        if (zScore > config.spikeStdDevMultiplier) {
          anomalies.push(makeAnomaly(
            series.id, 'spike', point.timestamp, point.timestamp,
            zScore > 5 ? 'critical' : 'warning',
            `Spike: value ${val.toFixed(2)} is ${zScore.toFixed(1)}σ from rolling mean (${mean.toFixed(2)})`,
            val
          ));
        }
      }
    }
  }

  return anomalies;
}

// ── Out of Range ─────────────────────────────────────────────

function detectOutOfRange(data: TrendDataPoint[], series: TrendSeries, config: AnomalyConfig): TrendAnomaly[] {
  if (config.outOfRangeMin === null && config.outOfRangeMax === null) return [];
  const anomalies: TrendAnomaly[] = [];

  for (const point of data) {
    const val = point.values[series.id];
    if (val === null) continue;

    if (config.outOfRangeMin !== null && val < config.outOfRangeMin) {
      anomalies.push(makeAnomaly(
        series.id, 'out-of-range', point.timestamp, point.timestamp,
        'warning', `Below minimum: ${val.toFixed(2)} < ${config.outOfRangeMin}`, val
      ));
    }
    if (config.outOfRangeMax !== null && val > config.outOfRangeMax) {
      anomalies.push(makeAnomaly(
        series.id, 'out-of-range', point.timestamp, point.timestamp,
        'warning', `Above maximum: ${val.toFixed(2)} > ${config.outOfRangeMax}`, val
      ));
    }
  }

  return anomalies;
}

// ── Oscillation Detection ────────────────────────────────────

function detectOscillation(data: TrendDataPoint[], series: TrendSeries, config: AnomalyConfig): TrendAnomaly[] {
  const anomalies: TrendAnomaly[] = [];
  const windowMs = config.oscillationWindowMinutes * 60_000;

  // Collect values with timestamps
  const points: { ts: number; val: number }[] = [];
  for (const p of data) {
    const val = p.values[series.id];
    if (val !== null) points.push({ ts: p.timestamp, val });
  }

  if (points.length < 4) return anomalies;

  // Compute deltas
  const deltas: { ts: number; sign: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const diff = points[i].val - points[i - 1].val;
    if (diff !== 0) {
      deltas.push({ ts: points[i].ts, sign: diff > 0 ? 1 : -1 });
    }
  }

  // Sliding window for reversals
  let windowStart = 0;
  for (let i = 1; i < deltas.length; i++) {
    // Advance window start
    while (windowStart < i && deltas[i].ts - deltas[windowStart].ts > windowMs) {
      windowStart++;
    }

    // Count reversals in window
    let reversals = 0;
    for (let j = windowStart + 1; j <= i; j++) {
      if (deltas[j].sign !== deltas[j - 1].sign) reversals++;
    }

    if (reversals >= config.oscillationMinReversals) {
      // Avoid duplicate flags — check if we recently flagged
      const lastAnomaly = anomalies[anomalies.length - 1];
      if (lastAnomaly && deltas[i].ts - lastAnomaly.endTimestamp < windowMs) {
        lastAnomaly.endTimestamp = deltas[i].ts;
        continue;
      }

      anomalies.push(makeAnomaly(
        series.id, 'oscillation', deltas[windowStart].ts, deltas[i].ts,
        reversals >= config.oscillationMinReversals * 2 ? 'critical' : 'warning',
        `${reversals} direction reversals in ${config.oscillationWindowMinutes} min window`
      ));
    }
  }

  return anomalies;
}

// ── Short Cycling ────────────────────────────────────────────

function detectShortCycling(data: TrendDataPoint[], series: TrendSeries, config: AnomalyConfig): TrendAnomaly[] {
  const anomalies: TrendAnomaly[] = [];
  const windowMs = config.shortCycleWindowMinutes * 60_000;

  const points: { ts: number; val: number }[] = [];
  for (const p of data) {
    const val = p.values[series.id];
    if (val !== null) points.push({ ts: p.timestamp, val });
  }

  if (points.length < 3) return anomalies;

  let windowStart = 0;
  for (let i = 1; i < points.length; i++) {
    while (windowStart < i && points[i].ts - points[windowStart].ts > windowMs) {
      windowStart++;
    }

    let transitions = 0;
    for (let j = windowStart + 1; j <= i; j++) {
      if (Math.abs(points[j].val - points[j - 1].val) >= 0.5) transitions++;
    }

    if (transitions >= config.shortCycleMinTransitions) {
      const lastAnomaly = anomalies[anomalies.length - 1];
      if (lastAnomaly && points[i].ts - lastAnomaly.endTimestamp < windowMs) {
        lastAnomaly.endTimestamp = points[i].ts;
        continue;
      }

      anomalies.push(makeAnomaly(
        series.id, 'short-cycling', points[windowStart].ts, points[i].ts,
        'critical',
        `${transitions} state transitions in ${config.shortCycleWindowMinutes} min — equipment may be short-cycling`
      ));
    }
  }

  return anomalies;
}

// ── Gap Detection ────────────────────────────────────────────

function detectGaps(data: TrendDataPoint[], series: TrendSeries, config: AnomalyConfig): TrendAnomaly[] {
  const anomalies: TrendAnomaly[] = [];

  // Collect timestamps where this series has data
  const timestamps: number[] = [];
  for (const p of data) {
    if (p.values[series.id] !== null) timestamps.push(p.timestamp);
  }

  if (timestamps.length < 3) return anomalies;

  // Compute intervals and median
  const intervals: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }

  const sorted = [...intervals].sort((a, b) => a - b);
  const medianInterval = sorted[Math.floor(sorted.length / 2)];
  const threshold = medianInterval * config.gapThresholdMultiplier;

  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1];
    if (gap > threshold) {
      anomalies.push(makeAnomaly(
        series.id, 'gap', timestamps[i - 1], timestamps[i],
        'info',
        `Data gap: ${formatDuration(gap)} (${(gap / medianInterval).toFixed(1)}× normal interval)`
      ));
    }
  }

  return anomalies;
}

// ─── Helpers ─────────────────────────────────────────────────

function makeAnomaly(
  seriesId: string, type: TrendAnomalyType,
  start: number, end: number,
  severity: TrendAnomaly['severity'],
  description: string, value?: number
): TrendAnomaly {
  return { id: uuid(), seriesId, type, startTimestamp: start, endTimestamp: end, severity, description, value };
}

function formatDuration(ms: number): string {
  const minutes = ms / 60_000;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)} hr`;
  return `${(hours / 24).toFixed(1)} days`;
}
