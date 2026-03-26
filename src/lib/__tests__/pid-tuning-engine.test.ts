import { describe, it, expect } from 'vitest';
import {
  gainToProportionalBand,
  proportionalBandToGain,
  LOOP_TYPE_DEFAULTS,
  PID_SYMPTOMS,
  diagnoseSymptoms,
  generateRecommendation,
  BAS_PID_REFERENCE,
  TYPICAL_RANGES,
} from '../pid-tuning-engine';
import type { PidTuningValues, PidResponseData } from '@/types';

// ─── Helpers ─────────────────────────────────────────────────

const baseTuningValues: PidTuningValues = {
  gainMode: 'gain',
  gain: 4,
  proportionalBand: 25,
  integralTime: 240,
  derivativeTime: 0,
  sampleInterval: null,
  outputMin: 0,
  outputMax: 100,
  deadband: null,
};

const emptyResponseData: PidResponseData = {
  setpoint: null,
  startingPv: null,
  finalPv: null,
  overshootPercent: null,
  responseTimeSeconds: null,
  settleTimeSeconds: null,
  oscillationCount: null,
  saturated: false,
  deadTimeSeconds: null,
};

// ─── Conversion helpers ─────────────────────────────────────

describe('gainToProportionalBand', () => {
  it('converts gain to PB%', () => {
    expect(gainToProportionalBand(4)).toBe(25);
    expect(gainToProportionalBand(2)).toBe(50);
    expect(gainToProportionalBand(1)).toBe(100);
  });

  it('handles gain of 0', () => {
    expect(gainToProportionalBand(0)).toBe(Infinity);
  });

  it('handles negative gain', () => {
    expect(gainToProportionalBand(-1)).toBe(Infinity);
  });
});

describe('proportionalBandToGain', () => {
  it('converts PB% to gain', () => {
    expect(proportionalBandToGain(25)).toBe(4);
    expect(proportionalBandToGain(50)).toBe(2);
    expect(proportionalBandToGain(100)).toBe(1);
  });

  it('handles PB of 0', () => {
    expect(proportionalBandToGain(0)).toBe(Infinity);
  });

  it('round-trips with gainToProportionalBand', () => {
    const gain = 5;
    const pb = gainToProportionalBand(gain);
    const backToGain = proportionalBandToGain(pb);
    expect(backToGain).toBe(gain);
  });
});

// ─── Loop type defaults ─────────────────────────────────────

describe('LOOP_TYPE_DEFAULTS', () => {
  it('has defaults for all expected loop types', () => {
    const expectedTypes = [
      'sat', 'dat', 'static-pressure', 'room-temp',
      'hot-water', 'chilled-water', 'humidity', 'room-pressure',
      'vfd-speed', 'heat-exchanger', 'generic',
    ];
    for (const type of expectedTypes) {
      expect(LOOP_TYPE_DEFAULTS).toHaveProperty(type);
    }
  });

  it('all defaults have required fields', () => {
    for (const [, defaults] of Object.entries(LOOP_TYPE_DEFAULTS)) {
      expect(defaults).toHaveProperty('gain');
      expect(defaults).toHaveProperty('integralTime');
      expect(defaults).toHaveProperty('derivativeTime');
      expect(defaults).toHaveProperty('mode');
      expect(defaults).toHaveProperty('action');
      expect(defaults).toHaveProperty('processSpeed');
      expect(defaults).toHaveProperty('description');
    }
  });

  it('fast processes have lower gain and integral time', () => {
    const fast = LOOP_TYPE_DEFAULTS['static-pressure'];
    const slow = LOOP_TYPE_DEFAULTS['room-temp'];
    expect(fast.gain).toBeLessThanOrEqual(slow.gain);
    expect(fast.integralTime).toBeLessThan(slow.integralTime);
  });

  it('no defaults use derivative for HVAC loops', () => {
    for (const [, defaults] of Object.entries(LOOP_TYPE_DEFAULTS)) {
      expect(defaults.derivativeTime).toBe(0);
    }
  });
});

// ─── Symptom definitions ────────────────────────────────────

describe('PID_SYMPTOMS', () => {
  it('has 11 defined symptoms', () => {
    expect(PID_SYMPTOMS).toHaveLength(11);
  });

  it('each symptom has required fields', () => {
    for (const s of PID_SYMPTOMS) {
      expect(s.id).toBeTruthy();
      expect(s.label).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(['tuning', 'mechanical', 'sensor']).toContain(s.category);
    }
  });

  it('has unique IDs', () => {
    const ids = PID_SYMPTOMS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── Diagnosis engine ───────────────────────────────────────

describe('diagnoseSymptoms', () => {
  it('returns empty adjustments for no symptoms', () => {
    const result = diagnoseSymptoms([], 'sat', 'pi', baseTuningValues);
    expect(result.tuningAdjustments).toHaveLength(0);
    expect(result.overallAssessment).toContain('No symptoms');
  });

  it('recommends gain decrease for hunting', () => {
    const result = diagnoseSymptoms(['hunting'], 'sat', 'pi', baseTuningValues);
    const gainAdj = result.tuningAdjustments.find(a => a.parameter === 'gain');
    expect(gainAdj).toBeDefined();
    expect(gainAdj!.direction).toBe('decrease');
  });

  it('recommends integral time increase for hunting in PI mode', () => {
    const result = diagnoseSymptoms(['hunting'], 'sat', 'pi', baseTuningValues);
    const integralAdj = result.tuningAdjustments.find(a => a.parameter === 'integralTime');
    expect(integralAdj).toBeDefined();
    expect(integralAdj!.direction).toBe('increase');
  });

  it('recommends derivative decrease for hunting in PID mode', () => {
    const values = { ...baseTuningValues, derivativeTime: 10 };
    const result = diagnoseSymptoms(['hunting'], 'sat', 'pid', values);
    const derivAdj = result.tuningAdjustments.find(a => a.parameter === 'derivativeTime');
    expect(derivAdj).toBeDefined();
    expect(derivAdj!.direction).toBe('decrease');
  });

  it('recommends gain increase for sluggish response', () => {
    const result = diagnoseSymptoms(['sluggish'], 'sat', 'pi', baseTuningValues);
    const gainAdj = result.tuningAdjustments.find(a => a.parameter === 'gain');
    expect(gainAdj!.direction).toBe('increase');
    expect(result.cautions.length).toBeGreaterThan(0);
  });

  it('recommends mode change for offset in P-only mode', () => {
    const result = diagnoseSymptoms(['offset'], 'sat', 'p', baseTuningValues);
    const modeAdj = result.tuningAdjustments.find(a => a.parameter === 'mode');
    expect(modeAdj).toBeDefined();
    expect(modeAdj!.direction).toBe('add');
  });

  it('recommends integral decrease for offset in PI mode', () => {
    const result = diagnoseSymptoms(['offset'], 'sat', 'pi', baseTuningValues);
    const integralAdj = result.tuningAdjustments.find(a => a.parameter === 'integralTime');
    expect(integralAdj!.direction).toBe('decrease');
  });

  it('identifies mechanical issues as non-tuning', () => {
    const result = diagnoseSymptoms(['mechanical-stick'], 'sat', 'pi', baseTuningValues);
    expect(result.nonTuningIssues.length).toBeGreaterThan(0);
    expect(result.nonTuningIssues[0].issue).toContain('Mechanical');
    expect(result.cautions.some(c => c.includes('Do NOT increase gain'))).toBe(true);
  });

  it('identifies sensor lag as non-tuning', () => {
    const result = diagnoseSymptoms(['sensor-lag'], 'sat', 'pi', baseTuningValues);
    expect(result.nonTuningIssues.length).toBeGreaterThan(0);
  });

  it('identifies saturation as possible equipment issue', () => {
    const highGainValues = { ...baseTuningValues, gain: 20 }; // well above default
    const result = diagnoseSymptoms(['saturation'], 'sat', 'pi', highGainValues);
    expect(result.nonTuningIssues.length).toBeGreaterThan(0);
    const gainAdj = result.tuningAdjustments.find(a => a.parameter === 'gain');
    expect(gainAdj).toBeDefined();
  });

  it('recommends deadband increase for noise with low deadband', () => {
    const values = { ...baseTuningValues, deadband: 0, derivativeTime: 5 };
    const result = diagnoseSymptoms(['noise'], 'sat', 'pid', values);
    const dbAdj = result.tuningAdjustments.find(a => a.parameter === 'deadband');
    expect(dbAdj).toBeDefined();
    expect(dbAdj!.direction).toBe('increase');
  });

  it('gives combined assessment when both tuning and non-tuning issues exist', () => {
    const result = diagnoseSymptoms(['hunting', 'mechanical-stick'], 'sat', 'pi', baseTuningValues);
    expect(result.overallAssessment).toContain('Fix mechanical/sensor issues first');
  });

  it('gives non-tuning-only assessment', () => {
    const result = diagnoseSymptoms(['mechanical-stick'], 'sat', 'pi', baseTuningValues);
    expect(result.overallAssessment).toContain('mechanical or sensor issues');
  });
});

// ─── Recommendation engine ──────────────────────────────────

describe('generateRecommendation', () => {
  it('returns default values with low confidence when no symptoms', () => {
    const rec = generateRecommendation('sat', 'pi', baseTuningValues, [], emptyResponseData);
    expect(rec.confidence).toBe('low');
    expect(rec.recommendedValues.gain).toBe(LOOP_TYPE_DEFAULTS.sat.gain);
    expect(rec.recommendedValues.integralTime).toBe(LOOP_TYPE_DEFAULTS.sat.integralTime);
  });

  it('reduces gain 40% for hunting', () => {
    const rec = generateRecommendation('sat', 'pi', baseTuningValues, ['hunting'], emptyResponseData);
    expect(rec.recommendedValues.gain).toBeCloseTo(baseTuningValues.gain! * 0.6, 1);
  });

  it('reduces gain 20% for overshoot', () => {
    const rec = generateRecommendation('sat', 'pi', baseTuningValues, ['overshoot'], emptyResponseData);
    expect(rec.recommendedValues.gain).toBeCloseTo(baseTuningValues.gain! * 0.8, 1);
  });

  it('increases gain 35% for sluggish', () => {
    const rec = generateRecommendation('sat', 'pi', baseTuningValues, ['sluggish'], emptyResponseData);
    expect(rec.recommendedValues.gain).toBeCloseTo(baseTuningValues.gain! * 1.35, 1);
  });

  it('slows integral 50% for hunting', () => {
    const rec = generateRecommendation('sat', 'pi', baseTuningValues, ['hunting'], emptyResponseData);
    expect(rec.recommendedValues.integralTime).toBe(Math.round(baseTuningValues.integralTime! * 1.5));
  });

  it('removes derivative for noise in PID mode', () => {
    const pidValues = { ...baseTuningValues, derivativeTime: 10 };
    const rec = generateRecommendation('sat', 'pid', pidValues, ['noise'], emptyResponseData);
    expect(rec.recommendedValues.derivativeTime).toBe(0);
  });

  it('adjusts for observed overshoot > 15%', () => {
    const responseWithOvershoot: PidResponseData = { ...emptyResponseData, overshootPercent: 25 };
    const rec = generateRecommendation('sat', 'pi', baseTuningValues, ['sluggish'], responseWithOvershoot);
    // Should apply additional 15% reduction on top of the sluggish increase
    expect(rec.explanations.gain).toContain('overshoot');
  });

  it('adjusts integral for long dead time', () => {
    const responseWithDeadTime: PidResponseData = { ...emptyResponseData, deadTimeSeconds: 60, setpoint: 55 };
    const rec = generateRecommendation('sat', 'pi', baseTuningValues, ['sluggish'], responseWithDeadTime);
    expect(rec.recommendedValues.integralTime).toBeGreaterThanOrEqual(240); // 4x dead time
    expect(rec.cautions.some(c => c.includes('dead time'))).toBe(true);
  });

  it('high confidence with symptoms + response data', () => {
    const responseData: PidResponseData = { ...emptyResponseData, setpoint: 55 };
    const rec = generateRecommendation('sat', 'pi', baseTuningValues, ['hunting', 'overshoot'], responseData);
    expect(rec.confidence).toBe('high');
  });

  it('low confidence for mechanical/sensor symptoms', () => {
    const rec = generateRecommendation('sat', 'pi', baseTuningValues, ['mechanical-stick'], emptyResponseData);
    expect(rec.confidence).toBe('low');
  });

  it('sets deadband >= 1 for noise symptom', () => {
    const noDeadbandValues = { ...baseTuningValues, deadband: 0 };
    const rec = generateRecommendation('sat', 'pi', noDeadbandValues, ['noise'], emptyResponseData);
    expect(rec.recommendedValues.deadband).toBeGreaterThanOrEqual(1);
  });

  it('removes derivative for fast processes in PID mode', () => {
    const pidValues = { ...baseTuningValues, derivativeTime: 5 };
    const rec = generateRecommendation('static-pressure', 'pid', pidValues, [], { ...emptyResponseData, setpoint: 1.5 });
    expect(rec.recommendedValues.derivativeTime).toBe(0);
  });
});

// ─── Reference data ─────────────────────────────────────────

describe('BAS_PID_REFERENCE', () => {
  it('has reference sections', () => {
    expect(BAS_PID_REFERENCE.length).toBeGreaterThan(0);
    for (const section of BAS_PID_REFERENCE) {
      expect(section.title).toBeTruthy();
      expect(section.content).toBeTruthy();
    }
  });
});

describe('TYPICAL_RANGES', () => {
  it('has typical ranges for common loop types', () => {
    expect(TYPICAL_RANGES.length).toBeGreaterThan(0);
    const loopTypes = TYPICAL_RANGES.map(r => r.loopType);
    expect(loopTypes).toContain('Supply Air Temp');
    expect(loopTypes).toContain('Static Pressure');
    expect(loopTypes).toContain('Room Temperature');
  });
});
