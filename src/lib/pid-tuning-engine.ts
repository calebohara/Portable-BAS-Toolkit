import type { PidLoopType, PidControlMode, PidTuningValues, PidResponseData, PidAction } from '@/types';

// ─── Conversion helpers ─────────────────────────────────────
export function gainToProportionalBand(gain: number): number {
  if (gain <= 0) return Infinity;
  return Math.round((100 / gain) * 10) / 10;
}

export function proportionalBandToGain(pb: number): number {
  if (pb <= 0) return Infinity;
  return Math.round((100 / pb) * 100) / 100;
}

// ─── Loop type defaults ─────────────────────────────────────
export interface LoopTypeDefaults {
  gain: number;
  integralTime: number; // seconds
  derivativeTime: number;
  mode: PidControlMode;
  action: PidAction;
  processSpeed: 'fast' | 'medium' | 'slow';
  description: string;
}

export const LOOP_TYPE_DEFAULTS: Record<PidLoopType, LoopTypeDefaults> = {
  'sat': {
    gain: 4, integralTime: 240, derivativeTime: 0,
    mode: 'pi', action: 'reverse', processSpeed: 'slow',
    description: 'Slow process. Coil thermal mass and duct length create dead time. Start conservative.',
  },
  'dat': {
    gain: 5, integralTime: 180, derivativeTime: 0,
    mode: 'pi', action: 'reverse', processSpeed: 'slow',
    description: 'Similar to SAT but closer to coil. Moderate dead time from coil response.',
  },
  'static-pressure': {
    gain: 2, integralTime: 30, derivativeTime: 0,
    mode: 'pi', action: 'direct', processSpeed: 'fast',
    description: 'Fast process. Pressure responds quickly to fan speed changes. Low gain to avoid hunting.',
  },
  'room-temp': {
    gain: 3, integralTime: 300, derivativeTime: 0,
    mode: 'pi', action: 'reverse', processSpeed: 'slow',
    description: 'Very slow process. Room thermal mass creates significant dead time. Be patient with tuning.',
  },
  'hot-water': {
    gain: 3, integralTime: 120, derivativeTime: 0,
    mode: 'pi', action: 'reverse', processSpeed: 'medium',
    description: 'Medium-speed process. Valve authority and pipe length affect response.',
  },
  'chilled-water': {
    gain: 3, integralTime: 120, derivativeTime: 0,
    mode: 'pi', action: 'reverse', processSpeed: 'medium',
    description: 'Similar to hot water. Watch for valve sizing issues causing overshoot.',
  },
  'humidity': {
    gain: 2, integralTime: 600, derivativeTime: 0,
    mode: 'pi', action: 'reverse', processSpeed: 'slow',
    description: 'Very slow process with significant transport delay. Requires patience. Derivative rarely helps.',
  },
  'room-pressure': {
    gain: 1.5, integralTime: 20, derivativeTime: 0,
    mode: 'pi', action: 'direct', processSpeed: 'fast',
    description: 'Fast process. Very sensitive to gain. Start low and increase carefully.',
  },
  'vfd-speed': {
    gain: 2, integralTime: 45, derivativeTime: 0,
    mode: 'pi', action: 'direct', processSpeed: 'fast',
    description: 'Fast process. VFD ramp time acts as built-in dampening. Match tuning to ramp rate.',
  },
  'heat-exchanger': {
    gain: 3, integralTime: 180, derivativeTime: 0,
    mode: 'pi', action: 'reverse', processSpeed: 'medium',
    description: 'Medium process with thermal lag. Dead time depends on flow rate and exchanger size.',
  },
  'generic': {
    gain: 3, integralTime: 120, derivativeTime: 0,
    mode: 'pi', action: 'reverse', processSpeed: 'medium',
    description: 'Generic starting point. Adjust based on observed process response.',
  },
};

// ─── Symptom definitions ────────────────────────────────────
export interface SymptomDefinition {
  id: string;
  label: string;
  description: string;
  category: 'tuning' | 'mechanical' | 'sensor';
}

export const PID_SYMPTOMS: SymptomDefinition[] = [
  { id: 'hunting', label: 'Hunting / Cycling', description: 'Output swings back and forth around setpoint', category: 'tuning' },
  { id: 'sluggish', label: 'Sluggish Response', description: 'Takes too long to reach setpoint after a change', category: 'tuning' },
  { id: 'overshoot', label: 'Overshoots Setpoint', description: 'Process variable goes past setpoint before settling', category: 'tuning' },
  { id: 'saturation', label: 'Output Saturates', description: 'Output hits 0% or 100% and stays there', category: 'tuning' },
  { id: 'oscillation', label: 'Sustained Oscillation', description: 'Regular oscillation that never dampens out', category: 'tuning' },
  { id: 'offset', label: 'Steady-State Offset', description: 'Settles near but not at setpoint (P-only behavior)', category: 'tuning' },
  { id: 'noise', label: 'Noisy Output', description: 'Rapid small changes in output signal (chattering)', category: 'tuning' },
  { id: 'slow-recovery', label: 'Slow Disturbance Recovery', description: 'Slow to recover after load change or setpoint bump', category: 'tuning' },
  { id: 'wind-up', label: 'Integral Windup', description: 'After saturation, overshoots badly on recovery', category: 'tuning' },
  { id: 'mechanical-stick', label: 'Mechanical Sticking', description: 'Valve/damper appears stuck, jerky, or doesn\'t track output', category: 'mechanical' },
  { id: 'sensor-lag', label: 'Sensor Lag / Placement Issue', description: 'PV reading changes are delayed vs actual conditions', category: 'sensor' },
];

// ─── Diagnosis engine ───────────────────────────────────────
export interface DiagnosisItem {
  parameter: 'gain' | 'integralTime' | 'derivativeTime' | 'deadband' | 'mode';
  direction: 'increase' | 'decrease' | 'remove' | 'add';
  magnitude: 'slight' | 'moderate' | 'significant';
  explanation: string;
}

export interface NonTuningIssue {
  issue: string;
  explanation: string;
  suggestion: string;
}

export interface DiagnosisResult {
  tuningAdjustments: DiagnosisItem[];
  nonTuningIssues: NonTuningIssue[];
  cautions: string[];
  overallAssessment: string;
}

export function diagnoseSymptoms(
  symptoms: string[],
  loopType: PidLoopType,
  controlMode: PidControlMode,
  currentValues: PidTuningValues,
): DiagnosisResult {
  const adjustments: DiagnosisItem[] = [];
  const nonTuningIssues: NonTuningIssue[] = [];
  const cautions: string[] = [];

  const hasSymptom = (id: string) => symptoms.includes(id);
  const defaults = LOOP_TYPE_DEFAULTS[loopType];
  const currentGain = currentValues.gain ?? defaults.gain;

  if (hasSymptom('hunting')) {
    adjustments.push({
      parameter: 'gain', direction: 'decrease', magnitude: 'moderate',
      explanation: 'Reducing proportional gain dampens the output response, reducing the tendency to oscillate around setpoint.',
    });
    if (controlMode !== 'p' && currentValues.integralTime !== null) {
      adjustments.push({
        parameter: 'integralTime', direction: 'increase', magnitude: 'moderate',
        explanation: 'Slowing integral action reduces the cumulative correction that drives oscillation.',
      });
    }
    if (controlMode === 'pid' && (currentValues.derivativeTime ?? 0) > 0) {
      adjustments.push({
        parameter: 'derivativeTime', direction: 'decrease', magnitude: 'significant',
        explanation: 'Derivative amplifies noise and can cause hunting in BAS loops. Try reducing or removing it.',
      });
    }
  }

  if (hasSymptom('sluggish')) {
    adjustments.push({
      parameter: 'gain', direction: 'increase', magnitude: 'slight',
      explanation: 'Increasing gain makes the controller respond more aggressively to error. Increase cautiously to avoid overshoot.',
    });
    if (controlMode !== 'p') {
      adjustments.push({
        parameter: 'integralTime', direction: 'decrease', magnitude: 'slight',
        explanation: 'Faster integral action builds correction more quickly, reducing time to reach setpoint.',
      });
    }
    cautions.push('Increase gain gradually — too much will cause hunting or overshoot.');
  }

  if (hasSymptom('overshoot')) {
    adjustments.push({
      parameter: 'gain', direction: 'decrease', magnitude: 'slight',
      explanation: 'Lower gain reduces the initial correction magnitude, limiting how far past setpoint the process travels.',
    });
    if (controlMode !== 'p') {
      adjustments.push({
        parameter: 'integralTime', direction: 'increase', magnitude: 'moderate',
        explanation: 'Slower integral action allows the proportional term to settle before integral adds more correction.',
      });
    }
    if (defaults.processSpeed === 'slow') {
      cautions.push('Slow processes (like temperature loops) naturally overshoot. Some overshoot may be acceptable.');
    }
  }

  if (hasSymptom('offset')) {
    if (controlMode === 'p') {
      adjustments.push({
        parameter: 'mode', direction: 'add', magnitude: 'significant',
        explanation: 'P-only control always has steady-state offset. Adding integral action (PI mode) eliminates this.',
      });
    } else {
      adjustments.push({
        parameter: 'integralTime', direction: 'decrease', magnitude: 'slight',
        explanation: 'If offset exists in PI/PID mode, integral may be too slow to eliminate error. Speed it up slightly.',
      });
    }
  }

  if (hasSymptom('saturation')) {
    cautions.push('Output saturation may indicate the actuator or equipment is undersized for the load. Check valve/damper sizing before adjusting tuning.');
    if (currentGain > defaults.gain * 1.5) {
      adjustments.push({
        parameter: 'gain', direction: 'decrease', magnitude: 'moderate',
        explanation: 'High gain may be driving the output to limits unnecessarily. Reducing gain can help the output stay in a controllable range.',
      });
    }
    nonTuningIssues.push({
      issue: 'Possible equipment sizing issue',
      explanation: 'If the output consistently saturates at 0% or 100%, the valve, damper, or VFD may be undersized for the load condition.',
      suggestion: 'Verify mechanical sizing. Check valve Cv, damper area, or VFD capacity vs. actual load.',
    });
  }

  if (hasSymptom('oscillation')) {
    adjustments.push({
      parameter: 'gain', direction: 'decrease', magnitude: 'significant',
      explanation: 'Sustained oscillation typically means the loop is at or near instability. Reduce gain significantly.',
    });
    if (controlMode === 'pid') {
      adjustments.push({
        parameter: 'derivativeTime', direction: 'remove', magnitude: 'significant',
        explanation: 'Derivative in BAS environments often amplifies oscillation due to noisy signals. Remove it.',
      });
    }
    cautions.push('If oscillation persists after reducing gain, check for mechanical backlash or hysteresis in the actuator.');
  }

  if (hasSymptom('noise')) {
    if (controlMode === 'pid' && (currentValues.derivativeTime ?? 0) > 0) {
      adjustments.push({
        parameter: 'derivativeTime', direction: 'remove', magnitude: 'significant',
        explanation: 'Derivative amplifies high-frequency noise. Remove it for noisy BAS signals.',
      });
    }
    if ((currentValues.deadband ?? 0) < 0.5) {
      adjustments.push({
        parameter: 'deadband', direction: 'increase', magnitude: 'slight',
        explanation: 'Adding or increasing deadband prevents the controller from reacting to small signal variations.',
      });
    }
    nonTuningIssues.push({
      issue: 'Possible sensor noise',
      explanation: 'Noisy output may be caused by electrical interference on the sensor signal, not tuning.',
      suggestion: 'Check sensor wiring, shielding, and grounding. Verify sensor is reading correctly at the controller.',
    });
  }

  if (hasSymptom('slow-recovery')) {
    if (controlMode === 'p') {
      adjustments.push({
        parameter: 'mode', direction: 'add', magnitude: 'moderate',
        explanation: 'PI mode recovers from disturbances faster than P-only because integral action drives error to zero.',
      });
    } else {
      adjustments.push({
        parameter: 'integralTime', direction: 'decrease', magnitude: 'slight',
        explanation: 'Faster integral action speeds recovery from load disturbances.',
      });
    }
  }

  if (hasSymptom('wind-up')) {
    cautions.push('Integral windup occurs when the output saturates and integral keeps accumulating. Many Siemens controllers have built-in anti-windup — verify it is enabled.');
    adjustments.push({
      parameter: 'integralTime', direction: 'increase', magnitude: 'moderate',
      explanation: 'Slower integral action reduces the severity of windup. Consider also limiting output range.',
    });
  }

  if (hasSymptom('mechanical-stick')) {
    nonTuningIssues.push({
      issue: 'Mechanical sticking or binding',
      explanation: 'The valve or damper is not tracking the output signal smoothly. This creates position error that tuning cannot fix.',
      suggestion: 'Check actuator linkage, valve stem packing, damper blade bearings. Verify actuator has adequate torque. Stroke the actuator manually to confirm smooth operation.',
    });
    cautions.push('Do NOT increase gain to overcome mechanical sticking — this typically makes the problem worse by causing the actuator to jump between positions.');
  }

  if (hasSymptom('sensor-lag')) {
    nonTuningIssues.push({
      issue: 'Sensor lag or poor placement',
      explanation: 'The process variable reading is delayed relative to actual conditions, making the controller react to old data.',
      suggestion: 'Check sensor insertion depth in well, verify well has thermal compound, check sensor response time spec. Consider relocating sensor closer to the point of control.',
    });
    cautions.push('Sensor lag adds effective dead time to the loop. Even perfect tuning will produce sluggish response if the sensor is slow.');
  }

  // Overall assessment
  let overallAssessment = '';
  if (symptoms.length === 0) {
    overallAssessment = 'No symptoms selected. Enter observed loop behavior to get tuning guidance.';
  } else if (nonTuningIssues.length > 0 && adjustments.length === 0) {
    overallAssessment = 'The reported symptoms suggest mechanical or sensor issues rather than tuning problems. Address the non-tuning issues first.';
  } else if (nonTuningIssues.length > 0) {
    overallAssessment = 'Both tuning adjustments and non-tuning issues were identified. Fix mechanical/sensor issues first — tuning a loop with mechanical problems is unreliable.';
  } else if (adjustments.length > 0) {
    overallAssessment = 'Tuning adjustments are recommended based on the reported symptoms. Make changes one at a time and observe the effect before making further adjustments.';
  }

  return { tuningAdjustments: adjustments, nonTuningIssues, cautions, overallAssessment };
}

// ─── Recommendation engine ──────────────────────────────────
export interface TuningRecommendation {
  recommendedValues: Partial<PidTuningValues>;
  explanations: Record<string, string>;
  cautions: string[];
  confidence: 'low' | 'medium' | 'high';
  rationale: string;
}

export function generateRecommendation(
  loopType: PidLoopType,
  controlMode: PidControlMode,
  currentValues: PidTuningValues,
  symptoms: string[],
  responseData: PidResponseData,
): TuningRecommendation {
  const defaults = LOOP_TYPE_DEFAULTS[loopType];
  const explanations: Record<string, string> = {};
  const cautions: string[] = [];

  const currentGain = currentValues.gain ?? defaults.gain;
  const currentIntegral = currentValues.integralTime ?? defaults.integralTime;
  const currentDerivative = currentValues.derivativeTime ?? defaults.derivativeTime;

  let recGain = currentGain;
  let recIntegral = currentIntegral;
  let recDerivative = currentDerivative;

  // Apply symptom-based adjustments
  const hasSymptom = (id: string) => symptoms.includes(id);

  // Gain adjustments
  if (hasSymptom('hunting') || hasSymptom('oscillation')) {
    recGain = Math.round(currentGain * 0.6 * 100) / 100;
    explanations.gain = `Reduced from ${currentGain} to ${recGain} (40% reduction) to dampen oscillation.`;
  } else if (hasSymptom('overshoot')) {
    recGain = Math.round(currentGain * 0.8 * 100) / 100;
    explanations.gain = `Reduced from ${currentGain} to ${recGain} (20% reduction) to limit overshoot.`;
  } else if (hasSymptom('sluggish')) {
    recGain = Math.round(currentGain * 1.35 * 100) / 100;
    explanations.gain = `Increased from ${currentGain} to ${recGain} (35% increase) to improve response speed.`;
    cautions.push('Monitor for overshoot after increasing gain. Increase gradually in the field.');
  }

  // Integral adjustments
  if (controlMode !== 'p') {
    if (hasSymptom('hunting') || hasSymptom('wind-up') || hasSymptom('overshoot')) {
      recIntegral = Math.round(currentIntegral * 1.5);
      explanations.integralTime = `Increased from ${currentIntegral}s to ${recIntegral}s to slow integral accumulation and reduce overshoot/cycling.`;
    } else if (hasSymptom('sluggish') || hasSymptom('slow-recovery') || hasSymptom('offset')) {
      recIntegral = Math.round(currentIntegral * 0.75);
      explanations.integralTime = `Decreased from ${currentIntegral}s to ${recIntegral}s to speed up error correction.`;
    }
  }

  // Derivative adjustments
  if (controlMode === 'pid') {
    if (hasSymptom('noise') || hasSymptom('hunting') || hasSymptom('oscillation')) {
      recDerivative = 0;
      explanations.derivativeTime = 'Removed derivative action. Derivative amplifies noise and is rarely beneficial in BAS HVAC loops.';
    } else if (defaults.processSpeed === 'fast') {
      recDerivative = 0;
      explanations.derivativeTime = 'Derivative not recommended for fast-response loops (pressure, VFD). Signal noise will cause instability.';
      cautions.push('Consider switching to PI mode for this loop type.');
    }
  }

  // Response data adjustments
  if (responseData.overshootPercent !== null && responseData.overshootPercent > 15 && !hasSymptom('overshoot')) {
    recGain = Math.round(recGain * 0.85 * 100) / 100;
    explanations.gain = (explanations.gain || '') + ` Additional 15% gain reduction due to ${responseData.overshootPercent}% observed overshoot.`;
  }

  if (responseData.deadTimeSeconds !== null && responseData.deadTimeSeconds > 30) {
    if (recIntegral < responseData.deadTimeSeconds * 4) {
      recIntegral = Math.round(responseData.deadTimeSeconds * 4);
      explanations.integralTime = `Set to ${recIntegral}s (4x dead time of ${responseData.deadTimeSeconds}s). Long dead time requires slow integral action.`;
    }
    cautions.push(`Significant dead time (${responseData.deadTimeSeconds}s) detected. Aggressive tuning will cause instability.`);
  }

  // If no symptoms and no response data, suggest defaults
  if (symptoms.length === 0 && !responseData.setpoint) {
    recGain = defaults.gain;
    recIntegral = defaults.integralTime;
    recDerivative = defaults.derivativeTime;
    explanations.gain = `Starting value of ${defaults.gain} for ${loopType} loops. ${defaults.description}`;
    explanations.integralTime = `Starting value of ${defaults.integralTime}s for ${loopType} loops.`;
    if (defaults.derivativeTime === 0) {
      explanations.derivativeTime = 'Derivative not recommended for this loop type.';
    }
  }

  // Confidence level
  let confidence: 'low' | 'medium' | 'high' = 'medium';
  if (symptoms.length === 0 && !responseData.setpoint) {
    confidence = 'low';
    cautions.push('These are generic starting values. Enter symptoms or response data for more specific recommendations.');
  } else if (symptoms.length >= 2 && responseData.setpoint) {
    confidence = 'high';
  } else if (symptoms.some(s => ['mechanical-stick', 'sensor-lag'].includes(s))) {
    confidence = 'low';
    cautions.push('Non-tuning issues detected. Fix mechanical/sensor problems before relying on tuning recommendations.');
  }

  const rationale = symptoms.length > 0
    ? `Adjustments based on ${symptoms.length} reported symptom(s) for a ${LOOP_TYPE_DEFAULTS[loopType].processSpeed}-speed ${loopType} loop.`
    : `Starting values for a typical ${loopType} loop. Refine after observing actual process behavior.`;

  return {
    recommendedValues: {
      gainMode: currentValues.gainMode,
      gain: recGain,
      proportionalBand: gainToProportionalBand(recGain),
      integralTime: controlMode !== 'p' ? recIntegral : null,
      derivativeTime: controlMode === 'pid' ? recDerivative : null,
      sampleInterval: currentValues.sampleInterval,
      outputMin: currentValues.outputMin,
      outputMax: currentValues.outputMax,
      deadband: hasSymptom('noise') ? Math.max(currentValues.deadband ?? 0, 1) : currentValues.deadband,
    },
    explanations,
    cautions,
    confidence,
    rationale,
  };
}

// ─── BAS Reference content ──────────────────────────────────
export interface ReferenceSection {
  title: string;
  content: string;
}

export const BAS_PID_REFERENCE: ReferenceSection[] = [
  {
    title: 'What Proportional (P) Action Does',
    content: 'Proportional action produces an output change proportional to the current error (difference between setpoint and process variable). Higher gain = stronger response. In BAS terms: if your SAT setpoint is 55\u00B0F and the current SAT is 60\u00B0F, the error is 5\u00B0F. The proportional action drives the cooling valve open based on that error. Too much gain causes hunting; too little makes the loop sluggish. P-only control always has a steady-state offset \u2014 the loop settles near but not exactly at setpoint.',
  },
  {
    title: 'What Integral (I) Action Does',
    content: 'Integral action accumulates error over time and adds correction until the error reaches zero. This eliminates the steady-state offset that P-only control cannot. In BAS: integral is what finally drives the temperature exactly to setpoint. Integral time (Ti) controls how fast this happens \u2014 shorter Ti = faster correction but risk of overshoot and windup. Longer Ti = more stable but slower to reach setpoint. Most BAS HVAC loops use PI control.',
  },
  {
    title: 'When Derivative (D) Action Helps \u2014 And When It Hurts',
    content: 'Derivative action responds to the rate of change of error, providing early correction for fast-moving errors. In theory, it reduces overshoot. In BAS practice: derivative is RARELY useful. BAS sensors are often noisy (electrical interference, sensor resolution limits), and derivative amplifies that noise into rapid output changes. Use derivative only for: temperature loops with very long dead time where you need predictive correction. NEVER use derivative for pressure loops, humidity loops, or any loop with noisy signals.',
  },
  {
    title: 'Gain vs. Proportional Band',
    content: 'These are two ways to express the same thing. Gain (Kp) is the multiplier applied to error. Proportional Band (PB%) is the error range that drives 0\u2013100% output. They are inversely related: PB% = 100 / Kp, and Kp = 100 / PB%. A gain of 4 equals a 25% proportional band. Siemens controllers may use either convention depending on the platform \u2014 always verify which one your controller uses.',
  },
  {
    title: 'Signs the Problem Isn\'t Tuning',
    content: 'Not every loop problem is a tuning problem. Suspect mechanical/design issues when: the valve or damper is visibly oversized for the application, the actuator doesn\'t track the output signal smoothly, the sensor is located far from the point of control, the process load exceeds equipment capacity, TAB (Testing Adjusting Balancing) hasn\'t been completed, or the control sequence has logic errors. Fix these issues BEFORE spending time on tuning \u2014 tuning a mechanically broken loop is futile.',
  },
  {
    title: 'Field Tuning Best Practices',
    content: '1. Make ONE change at a time and observe the result. 2. Wait for the loop to reach steady state before judging (this can take 15\u201330 minutes for temperature loops). 3. Test under representative load conditions \u2014 a loop tuned at 30% load may hunt at 80% load. 4. Document before/after values. 5. Start with the default values for your loop type and adjust from there. 6. If a loop is stable but slow, that\'s often acceptable \u2014 don\'t chase perfection at the cost of stability.',
  },
];

export interface TypicalRange {
  loopType: string;
  gain: string;
  integralTime: string;
  derivative: string;
  notes: string;
}

export const TYPICAL_RANGES: TypicalRange[] = [
  { loopType: 'Supply Air Temp', gain: '3\u20136', integralTime: '180\u2013360s', derivative: 'None', notes: 'Slow process, conservative gain' },
  { loopType: 'Discharge Air Temp', gain: '4\u20138', integralTime: '120\u2013240s', derivative: 'None', notes: 'Moderate dead time from coil' },
  { loopType: 'Static Pressure', gain: '1\u20133', integralTime: '15\u201345s', derivative: 'None', notes: 'Fast process, low gain critical' },
  { loopType: 'Room Temperature', gain: '2\u20135', integralTime: '240\u2013600s', derivative: 'None', notes: 'Very slow, be patient' },
  { loopType: 'Hot/Chilled Water Valve', gain: '2\u20134', integralTime: '60\u2013180s', derivative: 'None', notes: 'Check valve authority' },
  { loopType: 'Humidity', gain: '1\u20133', integralTime: '300\u2013900s', derivative: 'None', notes: 'Extremely slow, long Ti' },
  { loopType: 'Room Pressure', gain: '1\u20132', integralTime: '10\u201330s', derivative: 'None', notes: 'Very sensitive, start low' },
  { loopType: 'VFD / Fan Speed', gain: '1.5\u20133', integralTime: '30\u201360s', derivative: 'None', notes: 'Match to VFD ramp time' },
  { loopType: 'Heat Exchanger', gain: '2\u20134', integralTime: '120\u2013300s', derivative: '0\u201315s', notes: 'D only if long dead time' },
];

// ─── Tuning Method Calculators ──────────────────────────────

export interface TuningMethodResult {
  mode: 'P' | 'PI' | 'PID';
  kp: number;
  pb: number;        // proportional band %
  ti: number | null; // integral time, seconds
  td: number | null; // derivative time, seconds
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Ziegler-Nichols Ultimate Gain (closed-loop) method.
 * Drive loop to sustained oscillation, record Ku and Pu.
 */
export function calculateZNUltimate(ku: number, pu: number): TuningMethodResult[] {
  const kpP   = round3(0.50 * ku);
  const kpPI  = round3(0.45 * ku);
  const kpPID = round3(0.60 * ku);
  return [
    { mode: 'P',   kp: kpP,   pb: round3(100 / kpP),   ti: null,             td: null },
    { mode: 'PI',  kp: kpPI,  pb: round3(100 / kpPI),  ti: round3(pu / 1.2), td: null },
    { mode: 'PID', kp: kpPID, pb: round3(100 / kpPID), ti: round3(pu / 2),   td: round3(pu / 8) },
  ];
}

/**
 * Ziegler-Nichols Step Response (open-loop reaction curve) method.
 * K = process gain (ΔPV% / ΔOutput%), L = dead time (s), T = time constant (s)
 */
export function calculateZNStep(k: number, l: number, t: number): TuningMethodResult[] {
  const base  = t / (k * l);
  const kpP   = round3(base);
  const kpPI  = round3(0.9 * base);
  const kpPID = round3(1.2 * base);
  return [
    { mode: 'P',   kp: kpP,   pb: round3(100 / kpP),   ti: null,              td: null },
    { mode: 'PI',  kp: kpPI,  pb: round3(100 / kpPI),  ti: round3(3.33 * l),  td: null },
    { mode: 'PID', kp: kpPID, pb: round3(100 / kpPID), ti: round3(2 * l),     td: round3(0.5 * l) },
  ];
}

/**
 * Cohen-Coon method — better than ZN for high dead-time processes (L/T > 0.1),
 * which covers most HVAC loops (VAV boxes, chilled water, SAT control).
 * K = process gain (ΔPV% / ΔOutput%), L = dead time (s), T = time constant (s)
 */
export function calculateCohenCoon(k: number, l: number, t: number): TuningMethodResult[] {
  const r     = l / t; // dead time ratio θ/τ
  const base  = t / (k * l);
  const kpP   = round3(base * (1 + r / 3));
  const kpPI  = round3(base * (0.9 + r / 12));
  const kpPID = round3(base * (4 / 3 + r / 4));
  const tiPI  = round3(l * (30 + 3 * r) / (9 + 20 * r));
  const tiPID = round3(l * (32 + 6 * r) / (13 + 8 * r));
  const tdPID = round3(l * 4 / (11 + 2 * r));
  return [
    { mode: 'P',   kp: kpP,   pb: round3(100 / kpP),   ti: null,  td: null },
    { mode: 'PI',  kp: kpPI,  pb: round3(100 / kpPI),  ti: tiPI,  td: null },
    { mode: 'PID', kp: kpPID, pb: round3(100 / kpPID), ti: tiPID, td: tdPID },
  ];
}
