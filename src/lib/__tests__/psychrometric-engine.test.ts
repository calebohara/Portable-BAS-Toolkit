import { describe, it, expect } from 'vitest';
import {
  pressureFromAltitude,
  saturationPressure,
  humidityRatioFromRH,
  humidityRatioFromWetBulb,
  humidityRatioFromDewPoint,
  humidityRatioFromEnthalpy,
  relativeHumidityFromW,
  enthalpyFromW,
  specificVolumeFromW,
  vaporPressureFromW,
  degreeOfSatFromW,
  dewPointFromW,
  wetBulbFromW,
  computeAllProperties,
  validateInputs,
  checkComfortZone,
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  ipToSi,
  siToIp,
  calculateMixedAir,
  calculateCoilLoad,
} from '../psychrometric-engine';

const P_SEA = 14.696; // psi at sea level

// ─── Atmospheric Pressure ────────────────────────────────────

describe('pressureFromAltitude', () => {
  it('returns standard pressure at sea level', () => {
    expect(pressureFromAltitude(0)).toBeCloseTo(14.696, 2);
  });

  it('returns ~12.23 psi at Denver (5000 ft)', () => {
    expect(pressureFromAltitude(5000)).toBeCloseTo(12.23, 1);
  });

  it('returns ~10.11 psi at 10000 ft', () => {
    expect(pressureFromAltitude(10000)).toBeCloseTo(10.11, 1);
  });

  it('pressure decreases with altitude', () => {
    expect(pressureFromAltitude(5000)).toBeLessThan(pressureFromAltitude(0));
    expect(pressureFromAltitude(10000)).toBeLessThan(pressureFromAltitude(5000));
  });
});

// ─── Saturation Pressure ─────────────────────────────────────

describe('saturationPressure', () => {
  it('returns ~0.0886 psi at 32°F (freezing)', () => {
    expect(saturationPressure(32)).toBeCloseTo(0.0886, 3);
  });

  it('returns ~0.9503 psi at 100°F', () => {
    expect(saturationPressure(100)).toBeCloseTo(0.9503, 2);
  });

  it('returns ~14.696 psi at 212°F (boiling)', () => {
    expect(saturationPressure(212)).toBeCloseTo(14.696, 0);
  });

  it('handles below-freezing (ice equations)', () => {
    const pws = saturationPressure(0);
    expect(pws).toBeGreaterThan(0);
    expect(pws).toBeLessThan(saturationPressure(32));
  });

  it('increases monotonically with temperature', () => {
    const temps = [-20, 0, 32, 50, 75, 100, 150, 212];
    for (let i = 1; i < temps.length; i++) {
      expect(saturationPressure(temps[i])).toBeGreaterThan(saturationPressure(temps[i - 1]));
    }
  });
});

// ─── Humidity Ratio Calculations ─────────────────────────────

describe('humidityRatioFromRH', () => {
  it('computes W at 75°F, 50% RH, sea level', () => {
    const W = humidityRatioFromRH(75, 50, P_SEA);
    // ASHRAE tables: ~0.00927 lb/lb (65 grains/lb)
    expect(W).toBeCloseTo(0.00927, 4);
  });

  it('returns 0 at 0% RH', () => {
    expect(humidityRatioFromRH(75, 0, P_SEA)).toBeCloseTo(0, 6);
  });

  it('clamps near saturation', () => {
    const W = humidityRatioFromRH(75, 100, P_SEA);
    expect(W).toBeGreaterThan(0);
    expect(W).toBeLessThan(0.05);
  });
});

describe('humidityRatioFromWetBulb', () => {
  it('computes W from wet bulb at standard conditions', () => {
    // 80°F db, 67°F wb → ~0.0112 (ASHRAE)
    const W = humidityRatioFromWetBulb(80, 67, P_SEA);
    expect(W).toBeCloseTo(0.0112, 3);
  });

  it('returns saturation W when wb = db', () => {
    const W = humidityRatioFromWetBulb(75, 75, P_SEA);
    const Ws = humidityRatioFromRH(75, 100, P_SEA);
    expect(W).toBeCloseTo(Ws, 4);
  });

  it('handles below-freezing wet bulb', () => {
    const W = humidityRatioFromWetBulb(35, 30, P_SEA);
    expect(W).toBeGreaterThan(0);
    expect(W).toBeLessThan(humidityRatioFromRH(35, 100, P_SEA));
  });
});

describe('humidityRatioFromDewPoint', () => {
  it('computes W from dew point', () => {
    // 55°F dew point at sea level
    const W = humidityRatioFromDewPoint(55, P_SEA);
    expect(W).toBeCloseTo(0.00915, 3);
  });

  it('roundtrips with dewPointFromW', () => {
    const W = humidityRatioFromDewPoint(60, P_SEA);
    const dp = dewPointFromW(W, P_SEA);
    expect(dp).toBeCloseTo(60, 1);
  });
});

describe('humidityRatioFromEnthalpy', () => {
  it('computes W from enthalpy and dry bulb', () => {
    // At 75°F, h = 28.1 BTU/lb, W ≈ 0.0093
    const W = humidityRatioFromEnthalpy(75, 28.1);
    expect(W).toBeCloseTo(0.0093, 3);
  });

  it('returns 0 for dry air enthalpy', () => {
    // Dry air at 75°F: h = 0.240 * 75 = 18 BTU/lb
    const W = humidityRatioFromEnthalpy(75, 18);
    expect(W).toBeCloseTo(0, 4);
  });
});

// ─── Derived Properties ──────────────────────────────────────

describe('relativeHumidityFromW', () => {
  it('roundtrips with humidityRatioFromRH', () => {
    const W = humidityRatioFromRH(75, 50, P_SEA);
    const rh = relativeHumidityFromW(75, W, P_SEA);
    expect(rh).toBeCloseTo(50, 1);
  });

  it('clamps to 0–100%', () => {
    expect(relativeHumidityFromW(75, 0, P_SEA)).toBeCloseTo(0, 0);
    expect(relativeHumidityFromW(75, 1, P_SEA)).toBeLessThanOrEqual(100);
  });
});

describe('enthalpyFromW', () => {
  it('computes enthalpy at standard conditions', () => {
    // 75°F, W = 0.0093 → ~28.1 BTU/lb
    const h = enthalpyFromW(75, 0.0093);
    expect(h).toBeCloseTo(28.1, 0);
  });

  it('returns sensible-only enthalpy for dry air', () => {
    // h = 0.240 * T
    expect(enthalpyFromW(75, 0)).toBeCloseTo(18, 0);
  });
});

describe('specificVolumeFromW', () => {
  it('computes volume at standard conditions', () => {
    // 75°F, W = 0.0093 → ~13.68 ft³/lb
    const v = specificVolumeFromW(75, 0.0093, P_SEA);
    expect(v).toBeCloseTo(13.68, 1);
  });
});

describe('vaporPressureFromW', () => {
  it('computes vapor pressure from humidity ratio', () => {
    const pw = vaporPressureFromW(0.01, P_SEA);
    expect(pw).toBeGreaterThan(0);
    expect(pw).toBeLessThan(P_SEA);
  });
});

describe('degreeOfSatFromW', () => {
  it('returns 1 at saturation', () => {
    const Ws = humidityRatioFromRH(75, 100, P_SEA);
    const mu = degreeOfSatFromW(Ws, 75, P_SEA);
    expect(mu).toBeCloseTo(1, 2);
  });

  it('returns ~0.5 at 50% RH', () => {
    const W = humidityRatioFromRH(75, 50, P_SEA);
    const mu = degreeOfSatFromW(W, 75, P_SEA);
    // Degree of saturation ≈ RH for typical conditions
    expect(mu).toBeCloseTo(0.5, 1);
  });
});

// ─── Iterative Solvers ───────────────────────────────────────

describe('dewPointFromW', () => {
  it('computes dew point from humidity ratio', () => {
    const W = humidityRatioFromRH(75, 50, P_SEA);
    const dp = dewPointFromW(W, P_SEA);
    // 75°F, 50% RH → dp ≈ 55°F
    expect(dp).toBeCloseTo(55, 0);
  });

  it('returns very low for near-zero W', () => {
    const dp = dewPointFromW(0.0001, P_SEA);
    expect(dp).toBeLessThan(0);
  });
});

describe('wetBulbFromW', () => {
  it('computes wet bulb from humidity ratio', () => {
    const W = humidityRatioFromRH(75, 50, P_SEA);
    const wb = wetBulbFromW(75, W, P_SEA);
    // 75°F, 50% RH → wb ≈ 62.6°F
    expect(wb).toBeCloseTo(62.6, 0);
  });

  it('returns db when saturated', () => {
    const Ws = humidityRatioFromRH(75, 100, P_SEA);
    const wb = wetBulbFromW(75, Ws, P_SEA);
    expect(wb).toBeCloseTo(75, 0);
  });
});

// ─── Master Solver ───────────────────────────────────────────

describe('computeAllProperties', () => {
  it('computes from db-rh inputs', () => {
    const state = computeAllProperties('db-rh', 75, 50, 0);
    expect(state.dryBulb).toBe(75);
    expect(state.relativeHumidity).toBeCloseTo(50, 0);
    expect(state.humidityRatio).toBeCloseTo(0.0093, 3);
    expect(state.enthalpy).toBeCloseTo(28.1, 0);
    expect(state.dewPoint).toBeCloseTo(55, 0);
  });

  it('computes from db-wb inputs', () => {
    const state = computeAllProperties('db-wb', 80, 67, 0);
    expect(state.dryBulb).toBe(80);
    expect(state.wetBulb).toBeCloseTo(67, 0);
    expect(state.humidityRatio).toBeGreaterThan(0.005);
    expect(state.relativeHumidity).toBeGreaterThan(20);
    expect(state.relativeHumidity).toBeLessThan(80);
  });

  it('computes from db-dp inputs', () => {
    const state = computeAllProperties('db-dp', 75, 55, 0);
    expect(state.dryBulb).toBe(75);
    expect(state.dewPoint).toBeCloseTo(55, 0);
    expect(state.relativeHumidity).toBeCloseTo(50, 0);
  });

  it('computes from db-w inputs', () => {
    const state = computeAllProperties('db-w', 75, 0.0093, 0);
    expect(state.dryBulb).toBe(75);
    expect(state.humidityRatio).toBe(0.0093);
    expect(state.relativeHumidity).toBeCloseTo(50, 0);
  });

  it('computes from db-h inputs', () => {
    const state = computeAllProperties('db-h', 75, 28.1, 0);
    expect(state.dryBulb).toBe(75);
    expect(state.enthalpy).toBeCloseTo(28.1, 0);
    expect(state.relativeHumidity).toBeCloseTo(50, 1);
  });

  it('all properties are self-consistent', () => {
    const state = computeAllProperties('db-rh', 80, 60, 0);
    // Roundtrip: W from RH should match state.humidityRatio
    const W_check = humidityRatioFromRH(80, state.relativeHumidity, P_SEA);
    expect(W_check).toBeCloseTo(state.humidityRatio, 5);
    // Enthalpy should match independent calculation
    const h_check = enthalpyFromW(80, state.humidityRatio);
    expect(h_check).toBeCloseTo(state.enthalpy, 2);
  });

  it('handles high altitude', () => {
    const seaLevel = computeAllProperties('db-rh', 75, 50, 0);
    const denver = computeAllProperties('db-rh', 75, 50, 5000);
    // At altitude, same RH means higher humidity ratio (lower pressure)
    expect(denver.humidityRatio).toBeGreaterThan(seaLevel.humidityRatio);
  });

  it('clamps W to non-negative', () => {
    // Very low enthalpy for the given db should not produce negative W
    const state = computeAllProperties('db-h', 75, 10, 0);
    expect(state.humidityRatio).toBeGreaterThanOrEqual(0);
  });
});

// ─── Input Validation ────────────────────────────────────────

describe('validateInputs', () => {
  it('accepts valid db-rh inputs', () => {
    const result = validateInputs('db-rh', 75, 50, 0);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects NaN inputs', () => {
    const result = validateInputs('db-rh', NaN, 50, 0);
    expect(result.valid).toBe(false);
  });

  it('rejects dry bulb out of range', () => {
    const result = validateInputs('db-rh', 300, 50, 0);
    expect(result.valid).toBe(false);
  });

  it('rejects altitude out of range', () => {
    const result = validateInputs('db-rh', 75, 50, 50000);
    expect(result.valid).toBe(false);
  });

  it('rejects wet bulb > dry bulb', () => {
    const result = validateInputs('db-wb', 75, 80, 0);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Wet bulb'))).toBe(true);
  });

  it('rejects RH out of range', () => {
    const result = validateInputs('db-rh', 75, 110, 0);
    expect(result.valid).toBe(false);
  });

  it('rejects dew point > dry bulb', () => {
    const result = validateInputs('db-dp', 75, 80, 0);
    expect(result.valid).toBe(false);
  });

  it('rejects negative humidity ratio', () => {
    const result = validateInputs('db-w', 75, -0.01, 0);
    expect(result.valid).toBe(false);
  });

  it('warns for below-freezing dry bulb', () => {
    const result = validateInputs('db-rh', 20, 50, 0);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('freezing'))).toBe(true);
  });

  it('warns for high altitude', () => {
    const result = validateInputs('db-rh', 75, 50, 6000);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('altitude'))).toBe(true);
  });
});

// ─── Comfort Zone ────────────────────────────────────────────

describe('checkComfortZone', () => {
  it('identifies comfort conditions', () => {
    const state = computeAllProperties('db-rh', 73, 50, 0);
    const result = checkComfortZone(state);
    expect(result.inComfortZone).toBe(true);
  });

  it('flags too cold', () => {
    const state = computeAllProperties('db-rh', 60, 50, 0);
    const result = checkComfortZone(state);
    expect(result.inComfortZone).toBe(false);
    expect(result.reason).toContain('cold');
  });

  it('flags too warm', () => {
    const state = computeAllProperties('db-rh', 85, 50, 0);
    const result = checkComfortZone(state);
    expect(result.inComfortZone).toBe(false);
    expect(result.reason).toContain('warm');
  });

  it('flags too humid', () => {
    const state = computeAllProperties('db-rh', 75, 80, 0);
    const result = checkComfortZone(state);
    expect(result.inComfortZone).toBe(false);
  });

  it('flags too dry', () => {
    const state = computeAllProperties('db-rh', 73, 10, 0);
    const result = checkComfortZone(state);
    expect(result.inComfortZone).toBe(false);
    expect(result.reason).toContain('dry');
  });
});

// ─── Unit Conversions ────────────────────────────────────────

describe('unit conversions', () => {
  it('converts C↔F correctly', () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(100)).toBe(212);
    expect(fahrenheitToCelsius(32)).toBe(0);
    expect(fahrenheitToCelsius(212)).toBe(100);
  });

  it('roundtrips C→F→C', () => {
    expect(fahrenheitToCelsius(celsiusToFahrenheit(25))).toBeCloseTo(25, 10);
  });

  it('roundtrips ipToSi → siToIp', () => {
    const state = computeAllProperties('db-rh', 75, 50, 0);
    const si = ipToSi(state);
    const back = siToIp(si);
    expect(back.dryBulb).toBeCloseTo(state.dryBulb, 1);
    expect(back.humidityRatio).toBeCloseTo(state.humidityRatio, 5);
    expect(back.enthalpy).toBeCloseTo(state.enthalpy, 1);
    expect(back.specificVolume).toBeCloseTo(state.specificVolume, 1);
  });

  it('ipToSi converts temperature to Celsius', () => {
    const state = computeAllProperties('db-rh', 75, 50, 0);
    const si = ipToSi(state);
    expect(si.dryBulb).toBeCloseTo(fahrenheitToCelsius(75), 1);
  });
});

// ─── AHU Calculations ───────────────────────────────────────

describe('calculateMixedAir', () => {
  it('computes mixed air at 30% OA', () => {
    const oa = computeAllProperties('db-rh', 95, 40, 0);
    const ra = computeAllProperties('db-rh', 75, 50, 0);

    const result = calculateMixedAir({
      oaDryBulb: oa.dryBulb,
      oaHumidityRatio: oa.humidityRatio,
      oaEnthalpy: oa.enthalpy,
      raDryBulb: ra.dryBulb,
      raHumidityRatio: ra.humidityRatio,
      raEnthalpy: ra.enthalpy,
      oaFraction: 0.3,
    }, 0);

    // Mixed temp = 0.3×95 + 0.7×75 = 81°F
    expect(result.mixedDryBulb).toBeCloseTo(81, 0);
    expect(result.mixedState.dryBulb).toBeCloseTo(81, 0);
    expect(result.mixedState.relativeHumidity).toBeGreaterThan(0);
    expect(result.mixedState.relativeHumidity).toBeLessThan(100);
  });

  it('returns pure RA at 0% OA fraction', () => {
    const oa = computeAllProperties('db-rh', 95, 40, 0);
    const ra = computeAllProperties('db-rh', 75, 50, 0);

    const result = calculateMixedAir({
      oaDryBulb: oa.dryBulb, oaHumidityRatio: oa.humidityRatio, oaEnthalpy: oa.enthalpy,
      raDryBulb: ra.dryBulb, raHumidityRatio: ra.humidityRatio, raEnthalpy: ra.enthalpy,
      oaFraction: 0,
    }, 0);

    expect(result.mixedDryBulb).toBeCloseTo(75, 1);
  });
});

describe('calculateCoilLoad', () => {
  it('computes cooling coil load', () => {
    const entering = computeAllProperties('db-rh', 80, 50, 0);
    const leaving = computeAllProperties('db-rh', 55, 90, 0);

    const result = calculateCoilLoad({
      airflowCfm: 10000,
      enteringState: entering,
      leavingState: leaving,
    });

    // Sensible = 1.08 × 10000 × (80-55) = 270,000 BTU/hr
    expect(result.sensibleLoad).toBeCloseTo(270000, -3);
    expect(result.totalLoad).toBeGreaterThan(result.sensibleLoad);
    expect(result.latentLoad).toBeGreaterThan(0);
    expect(result.sensibleHeatRatio).toBeGreaterThan(0);
    expect(result.sensibleHeatRatio).toBeLessThanOrEqual(1);
  });

  it('returns SHR of 1 for sensible-only cooling', () => {
    // Same humidity ratio, just temperature change
    const entering = computeAllProperties('db-w', 80, 0.008, 0);
    const leaving = computeAllProperties('db-w', 60, 0.008, 0);

    const result = calculateCoilLoad({
      airflowCfm: 1000,
      enteringState: entering,
      leavingState: leaving,
    });

    expect(result.sensibleHeatRatio).toBeCloseTo(1, 1);
  });
});
