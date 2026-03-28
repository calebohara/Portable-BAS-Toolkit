/**
 * Psychrometric calculation engine — ASHRAE 2017 Fundamentals Chapter 1.
 *
 * All internal calculations use IP units (°F, psi, lb_w/lb_da).
 * Humidity ratio is stored as lb/lb internally, displayed as grains/lb (×7000) in IP.
 */

import type {
  PsychInputMode, PsychState, PsychComfortResult, PsychUnitSystem,
  AhuMixedAirInputs, AhuMixedAirResult, AhuCoilLoadInputs, AhuCoilLoadResult,
} from '@/types';

// ─── ASHRAE Constants ────────────────────────────────────────
// Saturation pressure over ice (T < 32°F / 0°C), T in Rankine
const C1 = -1.0214165e4;
const C2 = -4.8932428;
const C3 = -5.3765794e-3;
const C4 = 1.9202377e-7;
const C5 = 3.5575832e-10;
const C6 = -9.0344688e-14;
const C7 = 4.1635019;

// Saturation pressure over water (T >= 32°F / 0°C), T in Rankine
const C8 = -1.0440397e4;
const C9 = -1.1294650e1;
const C10 = -2.7022355e-2;
const C11 = 1.2890360e-5;
const C12 = -2.4780681e-9;
const C13 = 6.5459673;

const P_STD = 14.696; // psi standard atmosphere at sea level

// ─── Atmospheric Pressure ────────────────────────────────────
/** Barometric pressure from altitude (ft) → psi. ASHRAE formula. */
export function pressureFromAltitude(altitude_ft: number): number {
  // P = 14.696 * (1 - 6.8754e-6 * Z)^5.2559
  return P_STD * Math.pow(1 - 6.8754e-6 * altitude_ft, 5.2559);
}

// ─── Saturation Pressure ─────────────────────────────────────
/** Saturation pressure of water vapor (psi) given temperature (°F). */
export function saturationPressure(T_F: number): number {
  const T_R = T_F + 459.67; // Convert to Rankine

  let lnPws: number;
  if (T_F < 32) {
    // Over ice
    lnPws = C1 / T_R + C2 + C3 * T_R + C4 * T_R * T_R
      + C5 * T_R * T_R * T_R + C6 * T_R * T_R * T_R * T_R
      + C7 * Math.log(T_R);
  } else {
    // Over liquid water
    lnPws = C8 / T_R + C9 + C10 * T_R + C11 * T_R * T_R
      + C12 * T_R * T_R * T_R + C13 * Math.log(T_R);
  }

  return Math.exp(lnPws);
}

// ─── Humidity Ratio Calculations ─────────────────────────────
/** Humidity ratio from relative humidity (%). Returns lb_w/lb_da. */
export function humidityRatioFromRH(T_db_F: number, rh: number, P_atm: number): number {
  const pws = saturationPressure(T_db_F);
  const pw = (rh / 100) * pws;
  if (pw >= P_atm) return 0.03; // clamp at practical max
  return 0.621945 * pw / (P_atm - pw);
}

/** Humidity ratio from wet bulb temperature (°F). Returns lb_w/lb_da. */
export function humidityRatioFromWetBulb(T_db_F: number, T_wb_F: number, P_atm: number): number {
  const pws_wb = saturationPressure(T_wb_F);
  const Ws_wb = 0.621945 * pws_wb / (P_atm - pws_wb);

  if (T_wb_F >= 32) {
    // Above freezing
    return ((1093 - 0.556 * T_wb_F) * Ws_wb - 0.240 * (T_db_F - T_wb_F))
      / (1093 + 0.444 * T_db_F - T_wb_F);
  } else {
    // Below freezing (ice on thermometer)
    return ((1220 - 0.04 * T_wb_F) * Ws_wb - 0.240 * (T_db_F - T_wb_F))
      / (1220 + 0.444 * T_db_F - 0.48 * T_wb_F);
  }
}

/** Humidity ratio from dew point temperature (°F). Returns lb_w/lb_da. */
export function humidityRatioFromDewPoint(T_dp_F: number, P_atm: number): number {
  const pws_dp = saturationPressure(T_dp_F);
  if (pws_dp >= P_atm) return 0.03;
  return 0.621945 * pws_dp / (P_atm - pws_dp);
}

/** Humidity ratio from enthalpy (BTU/lb_da) and dry bulb (°F). Returns lb_w/lb_da. */
export function humidityRatioFromEnthalpy(T_db_F: number, h: number): number {
  // h = 0.240 * T_db + W * (1061 + 0.444 * T_db)
  // Solve: W = (h - 0.240 * T_db) / (1061 + 0.444 * T_db)
  const denom = 1061 + 0.444 * T_db_F;
  if (Math.abs(denom) < 1e-10) return 0;
  return (h - 0.240 * T_db_F) / denom;
}

// ─── Derived Properties ──────────────────────────────────────
/** Relative humidity (%) from humidity ratio. */
export function relativeHumidityFromW(T_db_F: number, W: number, P_atm: number): number {
  const pws = saturationPressure(T_db_F);
  const pw = W * P_atm / (0.621945 + W);
  const rh = (pw / pws) * 100;
  return Math.min(Math.max(rh, 0), 100);
}

/** Enthalpy (BTU/lb_da) from humidity ratio. */
export function enthalpyFromW(T_db_F: number, W: number): number {
  return 0.240 * T_db_F + W * (1061 + 0.444 * T_db_F);
}

/** Specific volume (ft³/lb_da) from humidity ratio. */
export function specificVolumeFromW(T_db_F: number, W: number, P_atm: number): number {
  const T_R = T_db_F + 459.67;
  // v = 0.370486 * T_R * (1 + 1.6078 * W) / P_atm
  // where 0.370486 = R_da / 144 = 53.350 / 144
  return 0.370486 * T_R * (1 + 1.6078 * W) / P_atm;
}

/** Vapor pressure (psi) from humidity ratio. */
export function vaporPressureFromW(W: number, P_atm: number): number {
  return W * P_atm / (0.621945 + W);
}

/** Degree of saturation (0–1). */
export function degreeOfSatFromW(W: number, T_db_F: number, P_atm: number): number {
  const pws = saturationPressure(T_db_F);
  const Ws = 0.621945 * pws / (P_atm - pws);
  if (Ws <= 0) return 0;
  return Math.min(W / Ws, 1);
}

// ─── Iterative Solvers ───────────────────────────────────────
/** Dew point temperature (°F) from humidity ratio using bisection. */
export function dewPointFromW(W: number, P_atm: number): number {
  // Target: find T where pws(T) = pw = W * P_atm / (0.621945 + W)
  const pw = vaporPressureFromW(W, P_atm);
  if (pw <= 0) return -80;

  let lo = -80;
  let hi = 200;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const pws_mid = saturationPressure(mid);
    if (Math.abs(pws_mid - pw) < 1e-7) return mid;
    if (pws_mid < pw) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Wet bulb temperature (°F) from humidity ratio using bisection. */
export function wetBulbFromW(T_db_F: number, W: number, P_atm: number): number {
  // Find T_wb where humidityRatioFromWetBulb(T_db, T_wb, P) = W
  let lo = -80;
  let hi = T_db_F;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const W_calc = humidityRatioFromWetBulb(T_db_F, mid, P_atm);
    if (Math.abs(W_calc - W) < 1e-7) return mid;
    if (W_calc < W) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ─── Master Solver ───────────────────────────────────────────
/** Compute all psychrometric properties from two known inputs. */
export function computeAllProperties(
  inputMode: PsychInputMode,
  input1: number, // always dry bulb (°F)
  input2: number, // second parameter in IP units
  altitude_ft: number,
): PsychState {
  const P_atm = pressureFromAltitude(altitude_ft);
  const T_db = input1;
  let W: number;

  switch (inputMode) {
    case 'db-wb':
      W = humidityRatioFromWetBulb(T_db, input2, P_atm);
      break;
    case 'db-rh':
      W = humidityRatioFromRH(T_db, input2, P_atm);
      break;
    case 'db-dp':
      W = humidityRatioFromDewPoint(input2, P_atm);
      break;
    case 'db-w':
      W = input2; // already lb/lb
      break;
    case 'db-h':
      W = humidityRatioFromEnthalpy(T_db, input2);
      break;
    default:
      W = 0;
  }

  // Clamp W to physically meaningful range
  W = Math.max(0, W);

  const pws = saturationPressure(T_db);
  const rh = relativeHumidityFromW(T_db, W, P_atm);
  const h = enthalpyFromW(T_db, W);
  const v = specificVolumeFromW(T_db, W, P_atm);
  const pw = vaporPressureFromW(W, P_atm);
  const dp = dewPointFromW(W, P_atm);
  const wb = wetBulbFromW(T_db, W, P_atm);
  const mu = degreeOfSatFromW(W, T_db, P_atm);

  return {
    dryBulb: T_db,
    wetBulb: wb,
    dewPoint: dp,
    relativeHumidity: rh,
    humidityRatio: W,
    enthalpy: h,
    specificVolume: v,
    vaporPressure: pw,
    saturationPressure: pws,
    degreeOfSaturation: mu,
  };
}

// ─── Input Validation ────────────────────────────────────────
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateInputs(
  inputMode: PsychInputMode,
  input1: number,
  input2: number,
  altitude_ft: number,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (isNaN(input1) || isNaN(input2)) {
    errors.push('Both inputs must be valid numbers.');
    return { valid: false, errors, warnings };
  }

  // Dry bulb range
  if (input1 < -80 || input1 > 200) {
    errors.push('Dry bulb must be between -80°F and 200°F.');
  }

  // Altitude range
  if (altitude_ft < -1000 || altitude_ft > 36000) {
    errors.push('Altitude must be between -1,000 and 36,000 ft.');
  }

  switch (inputMode) {
    case 'db-wb':
      if (input2 > input1) errors.push('Wet bulb cannot exceed dry bulb.');
      if (input2 < -80) errors.push('Wet bulb is below physical minimum.');
      break;
    case 'db-rh':
      if (input2 < 0 || input2 > 100) errors.push('Relative humidity must be 0–100%.');
      break;
    case 'db-dp':
      if (input2 > input1) errors.push('Dew point cannot exceed dry bulb.');
      if (input2 < -80) errors.push('Dew point is below physical minimum.');
      break;
    case 'db-w':
      if (input2 < 0) errors.push('Humidity ratio cannot be negative.');
      if (input2 > 0.03) warnings.push('Humidity ratio is unusually high (> 0.03 lb/lb).');
      break;
    case 'db-h':
      if (input2 < -20) warnings.push('Enthalpy is unusually low.');
      if (input2 > 80) warnings.push('Enthalpy is unusually high for normal HVAC conditions.');
      break;
  }

  if (input1 < 32) {
    warnings.push('Below freezing — ice saturation equations apply.');
  }

  if (altitude_ft > 5000) {
    warnings.push('High altitude — significant pressure correction applied.');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── ASHRAE 55 Comfort Zone ──────────────────────────────────
export function checkComfortZone(state: PsychState): PsychComfortResult {
  const T = state.dryBulb;
  const W = state.humidityRatio;
  const rh = state.relativeHumidity;

  // ASHRAE 55 simplified comfort boundaries
  // Summer (0.5 clo): ~73–80°F
  // Winter (1.0 clo): ~68–75°F
  // Combined envelope: 68–80°F
  // Humidity ratio upper limit: ~0.012 lb/lb (~84 grains/lb)
  // RH lower bound: ~20% (dryness discomfort)

  if (T < 68) return { inComfortZone: false, reason: `Too cold (${T.toFixed(1)}°F < 68°F)` };
  if (T > 80) return { inComfortZone: false, reason: `Too warm (${T.toFixed(1)}°F > 80°F)` };
  if (W > 0.012) return { inComfortZone: false, reason: `Too humid (humidity ratio > 84 grains/lb)` };
  if (rh < 20) return { inComfortZone: false, reason: `Too dry (RH ${rh.toFixed(0)}% < 20%)` };
  if (rh > 65) return { inComfortZone: false, reason: `High humidity (RH ${rh.toFixed(0)}% > 65%)` };

  return { inComfortZone: true, reason: 'Within ASHRAE 55 comfort zone' };
}

// ─── Unit Conversion ─────────────────────────────────────────
export function celsiusToFahrenheit(C: number): number { return C * 9 / 5 + 32; }
export function fahrenheitToCelsius(F: number): number { return (F - 32) * 5 / 9; }
export function feetToMeters(ft: number): number { return ft * 0.3048; }
export function metersToFeet(m: number): number { return m / 0.3048; }

/** Convert a full PsychState from IP → SI display units. */
export function ipToSi(s: PsychState): PsychState {
  return {
    dryBulb: fahrenheitToCelsius(s.dryBulb),
    wetBulb: fahrenheitToCelsius(s.wetBulb),
    dewPoint: fahrenheitToCelsius(s.dewPoint),
    relativeHumidity: s.relativeHumidity,
    humidityRatio: s.humidityRatio * 1000, // lb/lb → g/kg
    enthalpy: s.enthalpy * 2.326, // BTU/lb → kJ/kg
    specificVolume: s.specificVolume * 0.0624279606, // ft³/lb → m³/kg (inverse of density conversion)
    vaporPressure: s.vaporPressure * 6.89476, // psi → kPa
    saturationPressure: s.saturationPressure * 6.89476,
    degreeOfSaturation: s.degreeOfSaturation,
  };
}

/** Convert a full PsychState from SI display → IP internal units. */
export function siToIp(s: PsychState): PsychState {
  return {
    dryBulb: celsiusToFahrenheit(s.dryBulb),
    wetBulb: celsiusToFahrenheit(s.wetBulb),
    dewPoint: celsiusToFahrenheit(s.dewPoint),
    relativeHumidity: s.relativeHumidity,
    humidityRatio: s.humidityRatio / 1000, // g/kg → lb/lb
    enthalpy: s.enthalpy / 2.326,
    specificVolume: s.specificVolume / 0.0624279606,
    vaporPressure: s.vaporPressure / 6.89476,
    saturationPressure: s.saturationPressure / 6.89476,
    degreeOfSaturation: s.degreeOfSaturation,
  };
}

// ─── AHU Process Calculations ────────────────────────────────
/** Calculate mixed air conditions from outdoor and return air. */
export function calculateMixedAir(inputs: AhuMixedAirInputs, altitude_ft: number): AhuMixedAirResult {
  const f = inputs.oaFraction;
  const mixedDB = f * inputs.oaDryBulb + (1 - f) * inputs.raDryBulb;
  const mixedW = f * inputs.oaHumidityRatio + (1 - f) * inputs.raHumidityRatio;
  const mixedH = f * inputs.oaEnthalpy + (1 - f) * inputs.raEnthalpy;

  // Recompute full state from mixed dry bulb + humidity ratio
  const P_atm = pressureFromAltitude(altitude_ft);
  const rh = relativeHumidityFromW(mixedDB, mixedW, P_atm);
  const pws = saturationPressure(mixedDB);
  const v = specificVolumeFromW(mixedDB, mixedW, P_atm);
  const pw = vaporPressureFromW(mixedW, P_atm);
  const dp = dewPointFromW(mixedW, P_atm);
  const wb = wetBulbFromW(mixedDB, mixedW, P_atm);
  const mu = degreeOfSatFromW(mixedW, mixedDB, P_atm);

  return {
    mixedDryBulb: mixedDB,
    mixedHumidityRatio: mixedW,
    mixedEnthalpy: mixedH,
    mixedState: {
      dryBulb: mixedDB,
      wetBulb: wb,
      dewPoint: dp,
      relativeHumidity: rh,
      humidityRatio: mixedW,
      enthalpy: mixedH,
      specificVolume: v,
      vaporPressure: pw,
      saturationPressure: pws,
      degreeOfSaturation: mu,
    },
  };
}

/** Calculate coil loads (BTU/hr in IP, kW in SI). All inputs in IP. */
export function calculateCoilLoad(inputs: AhuCoilLoadInputs): AhuCoilLoadResult {
  const cfm = inputs.airflowCfm;
  const entering = inputs.enteringState;
  const leaving = inputs.leavingState;

  // Sensible: qs = 1.08 × CFM × ΔT (BTU/hr)
  // 1.08 = 0.075 lb/ft³ × 60 min/hr × 0.24 BTU/(lb·°F)
  const sensible = 1.08 * cfm * (entering.dryBulb - leaving.dryBulb);

  // Total: qt = 4.5 × CFM × Δh (BTU/hr)
  // 4.5 = 0.075 lb/ft³ × 60 min/hr
  const total = 4.5 * cfm * (entering.enthalpy - leaving.enthalpy);

  const latent = total - sensible;
  const shr = Math.abs(total) > 0.01 ? Math.abs(sensible / total) : 1;

  return {
    sensibleLoad: sensible,
    latentLoad: latent,
    totalLoad: total,
    sensibleHeatRatio: Math.min(Math.max(shr, 0), 1),
  };
}

// ─── Condition Presets ───────────────────────────────────────
export interface ConditionPreset {
  id: string;
  label: string;
  description: string;
  dryBulb_F: number;
  rh: number;
  category: 'design' | 'typical' | 'ahu';
}

export const CONDITION_PRESETS: ConditionPreset[] = [
  { id: 'summer-design', label: 'Summer Design OA', description: 'ASHRAE 0.4% cooling design', dryBulb_F: 95, rh: 40, category: 'design' },
  { id: 'winter-design', label: 'Winter Design OA', description: 'ASHRAE 99.6% heating design', dryBulb_F: 0, rh: 50, category: 'design' },
  { id: 'return-air', label: 'Typical Return Air', description: 'Standard office return', dryBulb_F: 75, rh: 50, category: 'typical' },
  { id: 'supply-cooling', label: 'Supply Air (Cooling)', description: 'Typical cooling coil discharge', dryBulb_F: 55, rh: 90, category: 'ahu' },
  { id: 'mixed-econ', label: 'Mixed Air (Economizer)', description: '~30% outdoor air', dryBulb_F: 65, rh: 55, category: 'ahu' },
  { id: 'mild-oa', label: 'Mild Outdoor Air', description: 'Spring/fall conditions', dryBulb_F: 70, rh: 50, category: 'typical' },
  { id: 'hot-humid', label: 'Hot & Humid OA', description: 'Gulf Coast summer', dryBulb_F: 85, rh: 85, category: 'design' },
  { id: 'server-room', label: 'Server Room', description: 'ASHRAE A1 data center', dryBulb_F: 72, rh: 45, category: 'typical' },
  { id: 'hospital-or', label: 'Hospital OR', description: 'ASHRAE 170 operating room', dryBulb_F: 68, rh: 50, category: 'typical' },
  { id: 'natatorium', label: 'Natatorium', description: 'Indoor pool space', dryBulb_F: 82, rh: 60, category: 'typical' },
];

// ─── Altitude Presets ────────────────────────────────────────
export interface AltitudePreset {
  label: string;
  altitude_ft: number;
}

export const ALTITUDE_PRESETS: AltitudePreset[] = [
  { label: 'Sea Level', altitude_ft: 0 },
  { label: '1,000 ft', altitude_ft: 1000 },
  { label: '2,500 ft', altitude_ft: 2500 },
  { label: '5,000 ft (Denver)', altitude_ft: 5000 },
  { label: '7,000 ft', altitude_ft: 7000 },
  { label: '10,000 ft', altitude_ft: 10000 },
];

// ─── OA Fraction Presets ─────────────────────────────────────
export interface OaFractionPreset {
  label: string;
  fraction: number;
}

export const OA_FRACTION_PRESETS: OaFractionPreset[] = [
  { label: 'Min OA (20%)', fraction: 0.20 },
  { label: '30%', fraction: 0.30 },
  { label: '50%', fraction: 0.50 },
  { label: '75%', fraction: 0.75 },
  { label: 'Full Econ (100%)', fraction: 1.00 },
];

// ─── Reference Content ──────────────────────────────────────
export interface PsychReferenceSection {
  title: string;
  content: string;
}

export const PSYCH_REFERENCE: PsychReferenceSection[] = [
  {
    title: 'What is Psychrometrics?',
    content: 'Psychrometrics is the study of moist air properties and their relationships. In HVAC, understanding these properties is essential for designing and troubleshooting air handling systems. Given any two independent properties of moist air (at a known pressure), all other properties can be calculated.',
  },
  {
    title: 'Dry Bulb & Wet Bulb Temperature',
    content: 'Dry bulb is the air temperature measured by a standard thermometer. Wet bulb is measured with a moistened wick and reflects the evaporative cooling potential — it is always equal to or lower than dry bulb. The difference (wet bulb depression) indicates how far the air is from saturation. At 100% RH, dry bulb equals wet bulb.',
  },
  {
    title: 'Humidity Ratio & Relative Humidity',
    content: 'Humidity ratio (W) is the mass of water vapor per mass of dry air (grains/lb in IP, g/kg in SI). Relative humidity (RH) is the percentage of saturation at the current temperature. RH changes with temperature even if moisture content stays the same — this is why cooling air increases RH and can cause condensation.',
  },
  {
    title: 'Enthalpy',
    content: 'Enthalpy (h) is the total heat content of moist air in BTU/lb (or kJ/kg). It includes both sensible heat (from temperature) and latent heat (from moisture). Enthalpy is key for coil load calculations: total load = airflow × density × enthalpy difference.',
  },
  {
    title: 'Dew Point',
    content: 'The dew point is the temperature at which air becomes saturated (100% RH) if cooled at constant pressure and humidity ratio. If a surface is below the dew point, condensation forms. This is critical for coil selection, duct insulation, and preventing mold.',
  },
  {
    title: 'Specific Volume',
    content: 'Specific volume (ft³/lb or m³/kg) is the volume occupied by one unit mass of dry air plus its associated moisture. Warmer and more humid air has a higher specific volume (lower density). This affects fan sizing and airflow measurements.',
  },
  {
    title: 'Altitude Effects',
    content: 'Atmospheric pressure decreases with altitude: ~14.7 psi at sea level vs ~12.2 psi at 5,000 ft. Lower pressure means lower air density, which affects humidity calculations, fan performance, and coil capacity. Always correct for altitude at job sites above 2,000 ft.',
  },
  {
    title: 'AHU Mixed Air',
    content: 'Mixed air is the blend of outdoor air (OA) and return air (RA) entering a coil. Properties mix linearly: T_mix = f×T_OA + (1-f)×T_RA, where f is the OA fraction. The mixed air point determines cooling or heating coil entering conditions.',
  },
  {
    title: 'Coil Load Calculations',
    content: 'Sensible load: qs = 1.08 × CFM × ΔT (BTU/hr). Total load: qt = 4.5 × CFM × Δh (BTU/hr). Latent load: ql = qt - qs. The sensible heat ratio (SHR = qs/qt) indicates the proportion of sensible vs latent cooling. Typical cooling coil SHR is 0.65–0.85.',
  },
  {
    title: 'Common BAS Applications',
    content: 'Psychrometric calculations are used in: economizer control (comparing OA and RA enthalpy), supply air temperature reset, dehumidification control, condensation prevention, mixed air temperature verification, coil performance monitoring, and indoor air quality assessments.',
  },
];

export const COMMON_CONDITIONS_TABLE = [
  { condition: 'ASHRAE Summer Design', dryBulb: '95°F / 35°C', rh: '40%', humidityRatio: '105 gr/lb', enthalpy: '40.3 BTU/lb', dewPoint: '69°F / 20.5°C' },
  { condition: 'ASHRAE Winter Design', dryBulb: '0°F / -18°C', rh: '50%', humidityRatio: '2.5 gr/lb', enthalpy: '-0.2 BTU/lb', dewPoint: '-16°F / -27°C' },
  { condition: 'Standard Return Air', dryBulb: '75°F / 24°C', rh: '50%', humidityRatio: '65 gr/lb', enthalpy: '28.1 BTU/lb', dewPoint: '55°F / 13°C' },
  { condition: 'Cooling Coil Discharge', dryBulb: '55°F / 13°C', rh: '90%', humidityRatio: '57 gr/lb', enthalpy: '22.2 BTU/lb', dewPoint: '52°F / 11°C' },
  { condition: 'Comfort Zone (Mid)', dryBulb: '73°F / 23°C', rh: '50%', humidityRatio: '60 gr/lb', enthalpy: '26.8 BTU/lb', dewPoint: '53°F / 12°C' },
  { condition: 'Hot & Humid', dryBulb: '85°F / 29°C', rh: '85%', humidityRatio: '156 gr/lb', enthalpy: '50.5 BTU/lb', dewPoint: '80°F / 27°C' },
];

// ─── Formatting Helpers ──────────────────────────────────────
export function formatProperty(
  key: keyof PsychState,
  value: number,
  units: PsychUnitSystem,
): { value: string; unit: string } {
  switch (key) {
    case 'dryBulb':
    case 'wetBulb':
    case 'dewPoint':
      return { value: value.toFixed(1), unit: units === 'ip' ? '°F' : '°C' };
    case 'relativeHumidity':
      return { value: value.toFixed(1), unit: '%' };
    case 'humidityRatio':
      if (units === 'ip') {
        return { value: (value * 7000).toFixed(1), unit: 'gr/lb' };
      }
      return { value: value.toFixed(2), unit: 'g/kg' };
    case 'enthalpy':
      return { value: value.toFixed(2), unit: units === 'ip' ? 'BTU/lb' : 'kJ/kg' };
    case 'specificVolume':
      return { value: value.toFixed(units === 'ip' ? 2 : 3), unit: units === 'ip' ? 'ft³/lb' : 'm³/kg' };
    case 'vaporPressure':
    case 'saturationPressure':
      return { value: value.toFixed(units === 'ip' ? 4 : 3), unit: units === 'ip' ? 'psi' : 'kPa' };
    case 'degreeOfSaturation':
      return { value: (value * 100).toFixed(1), unit: '%' };
    default:
      return { value: value.toFixed(2), unit: '' };
  }
}
