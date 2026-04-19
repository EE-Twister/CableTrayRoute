/**
 * Voltage Flicker Assessment — IEC 61000-4-15 Pst / Plt
 *
 * Computes short-term (Pst) and long-term (Plt) flicker severity indices
 * for fluctuating loads at the point of common coupling (PCC), using the
 * simplified rectangular voltage-change method from IEC 61000-4-15 Annex A
 * and IEEE 1453-2022.
 *
 * Method:
 *   1. Single-event voltage dip:  ΔV% = (ΔP_kW / S_sc_kVA) × 100
 *      (IEC 61000-3-3 §4, Thevenin equivalent, unity-PF load step)
 *   2. Pst lookup via bilinear log-log interpolation on the iso-Pst matrix
 *      derived from IEC 61000-4-15 Figure A.1 (rectangular voltage changes)
 *   3. Plt = (1/N × Σ Pst_i³)^(1/3)  over N = 12 observation periods (2 hr)
 *
 * Limits (IEC 61000-3-3 / IEEE 1453):
 *   Pst ≤ 1.0  at PCC — mandatory limit
 *   Pst ≤ 0.8  planning level (utility allocation target)
 *
 * References:
 *   IEC 61000-4-15:2010+AMD1:2012 — Flickermeter; Functional and design specs
 *   IEC 61000-3-3:2013 — Voltage fluctuations in public LV supply systems
 *   IEEE 1453-2022 — IEEE Recommended Practice — Voltage Fluctuations
 */

/** IEC 61000-3-3 planning-level target at the PCC. */
export const PST_PASS_THRESHOLD = 0.8;

/** Mandatory Pst limit at the PCC per IEC 61000-3-3 / IEEE 1453. */
export const PST_LIMIT = 1.0;

/** Number of 10-minute Pst periods in a standard 2-hour Plt observation. */
export const PLT_OBSERVATION_PERIODS = 12;

// ---------------------------------------------------------------------------
// Pst look-up table — IEC 61000-4-15 Annex A iso-Pst contours
// Rows: ΔV/V levels (%)
// Cols: repetition rates (events/hour)
// Values: Pst for a rectangular voltage change of ΔV% at r events/hr
// ---------------------------------------------------------------------------
const DV_BREAKPOINTS = [0.1, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0, 7.0, 10.0];
const R_BREAKPOINTS  = [0.00028, 0.0017, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 20, 30, 60, 120, 360, 720, 1800, 3600];

// Each row corresponds to a ΔV/V level (same order as DV_BREAKPOINTS).
// Each column corresponds to a repetition rate (same order as R_BREAKPOINTS).
const PST_TABLE = [
  // ΔV = 0.1 %
  [0.02, 0.03, 0.05, 0.08, 0.10, 0.14, 0.18, 0.22, 0.30, 0.38, 0.45, 0.52, 0.65, 0.78, 0.95, 1.10, 1.35, 1.55],
  // ΔV = 0.2 %
  [0.04, 0.06, 0.10, 0.15, 0.20, 0.27, 0.35, 0.43, 0.58, 0.72, 0.84, 0.97, 1.18, 1.40, 1.65, 1.90, 2.25, 2.55],
  // ΔV = 0.3 %
  [0.06, 0.09, 0.15, 0.23, 0.30, 0.41, 0.53, 0.64, 0.85, 1.05, 1.22, 1.40, 1.68, 1.95, 2.30, 2.60, 3.00, 3.40],
  // ΔV = 0.5 %
  [0.10, 0.15, 0.25, 0.38, 0.50, 0.67, 0.87, 1.05, 1.38, 1.68, 1.95, 2.22, 2.65, 3.00, 3.50, 3.90, 4.50, 5.00],
  // ΔV = 0.7 %
  [0.14, 0.21, 0.35, 0.53, 0.70, 0.93, 1.20, 1.45, 1.90, 2.30, 2.65, 3.00, 3.55, 4.00, 4.60, 5.10, 5.80, 6.40],
  // ΔV = 1.0 %
  [0.20, 0.30, 0.50, 0.75, 1.00, 1.32, 1.70, 2.05, 2.65, 3.20, 3.65, 4.10, 4.80, 5.40, 6.10, 6.70, 7.55, 8.25],
  // ΔV = 1.5 %
  [0.30, 0.45, 0.75, 1.12, 1.50, 1.97, 2.52, 3.00, 3.85, 4.60, 5.20, 5.80, 6.70, 7.50, 8.40, 9.10, 10.2, 11.0],
  // ΔV = 2.0 %
  [0.40, 0.60, 1.00, 1.48, 1.98, 2.60, 3.30, 3.95, 5.05, 6.00, 6.75, 7.55, 8.65, 9.60, 10.8, 11.6, 12.9, 14.0],
  // ΔV = 3.0 %
  [0.60, 0.90, 1.50, 2.22, 2.95, 3.87, 4.92, 5.85, 7.45, 8.80, 9.90, 11.0, 12.5, 13.8, 15.4, 16.6, 18.4, 19.9],
  // ΔV = 4.0 %
  [0.80, 1.20, 1.99, 2.95, 3.93, 5.13, 6.50, 7.70, 9.80, 11.6, 13.0, 14.4, 16.3, 18.0, 20.0, 21.5, 23.8, 25.7],
  // ΔV = 5.0 %
  [1.00, 1.49, 2.49, 3.69, 4.90, 6.38, 8.08, 9.55, 12.1, 14.3, 16.0, 17.8, 20.1, 22.1, 24.6, 26.4, 29.2, 31.5],
  // ΔV = 7.0 %
  [1.40, 2.08, 3.47, 5.15, 6.83, 8.88, 11.2, 13.2, 16.7, 19.7, 22.1, 24.5, 27.6, 30.4, 33.7, 36.1, 39.9, 43.0],
  // ΔV = 10.0 %
  [2.00, 2.97, 4.95, 7.32, 9.71, 12.6, 15.9, 18.7, 23.6, 27.8, 31.1, 34.4, 38.8, 42.6, 47.2, 50.6, 55.8, 60.1],
];

function round(v, d = 4) {
  const p = 10 ** d;
  return Math.round(v * p) / p;
}

/**
 * Compute the single-event voltage dip at the PCC for a rectangular load step.
 *
 * Uses the IEC 61000-3-3 §4 simplified Thevenin formula:
 *   ΔV% = (ΔP_kW / S_sc_kVA) × 100
 *
 * @param {number} loadKw       Step change in active power (kW, > 0)
 * @param {number} systemKva    Short-circuit kVA at the PCC (> 0)
 * @param {number} [xrRatio=10] Source X/R ratio (informational, not used in simplified formula)
 * @returns {{ deltaVPercent: number, dipPu: number }}
 */
export function calcVoltageDip(loadKw, systemKva, xrRatio = 10) {
  if (!Number.isFinite(loadKw) || loadKw <= 0) throw new Error('loadKw must be greater than zero');
  if (!Number.isFinite(systemKva) || systemKva <= 0) throw new Error('systemKva must be greater than zero');
  if (!Number.isFinite(xrRatio) || xrRatio <= 0) throw new Error('xrRatio must be a positive number');

  const dipPu = loadKw / systemKva;
  const deltaVPercent = round(dipPu * 100, 4);
  return { deltaVPercent, dipPu: round(dipPu, 6) };
}

/**
 * Look up Pst for a rectangular voltage change using bilinear log-log interpolation
 * on the IEC 61000-4-15 Annex A iso-Pst matrix.
 *
 * Both the ΔV/V axis and the repetition-rate axis are logarithmically spaced in the
 * standard, so interpolation is performed in log space on both axes.
 *
 * @param {number} deltaVPercent      Voltage change magnitude (%, > 0)
 * @param {number} repetitionsPerHour Disturbance repetition rate (events/hour, > 0)
 * @returns {number} Pst (dimensionless flicker severity index), rounded to 3 d.p.
 */
export function pstFromTable(deltaVPercent, repetitionsPerHour) {
  const dv = Math.max(DV_BREAKPOINTS[0], Math.min(DV_BREAKPOINTS[DV_BREAKPOINTS.length - 1], deltaVPercent));
  const r  = Math.max(R_BREAKPOINTS[0],  Math.min(R_BREAKPOINTS[R_BREAKPOINTS.length - 1], repetitionsPerHour));

  // Find bounding row indices for ΔV
  let i1 = 0;
  for (let i = 0; i < DV_BREAKPOINTS.length - 1; i++) {
    if (DV_BREAKPOINTS[i] <= dv && dv <= DV_BREAKPOINTS[i + 1]) { i1 = i; break; }
    if (i === DV_BREAKPOINTS.length - 2) i1 = i;
  }
  const i2 = Math.min(i1 + 1, DV_BREAKPOINTS.length - 1);

  // Find bounding column indices for r
  let j1 = 0;
  for (let j = 0; j < R_BREAKPOINTS.length - 1; j++) {
    if (R_BREAKPOINTS[j] <= r && r <= R_BREAKPOINTS[j + 1]) { j1 = j; break; }
    if (j === R_BREAKPOINTS.length - 2) j1 = j;
  }
  const j2 = Math.min(j1 + 1, R_BREAKPOINTS.length - 1);

  // Bilinear log-log interpolation
  const alpha = i1 === i2
    ? 0
    : (Math.log(dv) - Math.log(DV_BREAKPOINTS[i1])) /
      (Math.log(DV_BREAKPOINTS[i2]) - Math.log(DV_BREAKPOINTS[i1]));
  const beta = j1 === j2
    ? 0
    : (Math.log(r) - Math.log(R_BREAKPOINTS[j1])) /
      (Math.log(R_BREAKPOINTS[j2]) - Math.log(R_BREAKPOINTS[j1]));

  const logPst =
    (1 - alpha) * (1 - beta) * Math.log(PST_TABLE[i1][j1]) +
    alpha       * (1 - beta) * Math.log(PST_TABLE[i2][j1]) +
    (1 - alpha) * beta       * Math.log(PST_TABLE[i1][j2]) +
    alpha       * beta       * Math.log(PST_TABLE[i2][j2]);

  return round(Math.exp(logPst), 3);
}

/**
 * Compute long-term flicker severity per IEC 61000-4-15 §4.7.
 *
 *   Plt = (1/N × Σ Pst_i³)^(1/3)
 *
 * @param {number[]} pstValues Array of Pst values (≥ 1 element, all > 0)
 * @returns {number} Plt, rounded to 3 d.p.
 */
export function pltFromPst(pstValues) {
  if (!Array.isArray(pstValues) || pstValues.length === 0) {
    throw new Error('pstValues must be a non-empty array');
  }
  for (const v of pstValues) {
    if (!Number.isFinite(v) || v < 0) throw new Error(`pstValues contains invalid entry: ${v}`);
  }
  const meanCube = pstValues.reduce((acc, p) => acc + p ** 3, 0) / pstValues.length;
  return round(Math.cbrt(meanCube), 3);
}

/**
 * Classify flicker severity against IEC 61000-3-3 / IEEE 1453 thresholds.
 *
 * @param {number} pst Pst or Plt value
 * @returns {'pass' | 'marginal' | 'fail'}
 */
export function classifyFlickerRisk(pst) {
  if (pst <= PST_PASS_THRESHOLD) return 'pass';
  if (pst <= PST_LIMIT)          return 'marginal';
  return 'fail';
}

/**
 * Run a complete voltage flicker assessment study.
 *
 * @param {object}   inputs
 * @param {string}   [inputs.studyLabel]           Descriptive label
 * @param {number}   [inputs.nominalVoltageKv]      System nominal voltage kV (display only)
 * @param {number}   inputs.systemKva               Short-circuit kVA at the PCC (> 0)
 * @param {number}   [inputs.xrRatio=10]            Source X/R ratio (> 0)
 * @param {object[]} inputs.loadSteps               One or more disturbance load steps
 * @param {string}   inputs.loadSteps[].label       Descriptive label
 * @param {number}   inputs.loadSteps[].loadKw      Step active power (kW, > 0)
 * @param {number}   inputs.loadSteps[].repetitionsPerHour  Events per hour (> 0)
 * @param {number[]} [inputs.pstSeriesForPlt]        Up to 12 measured Pst values for Plt
 * @returns {object} Study result — see return structure below
 */
export function runVoltageFlickerStudy(inputs) {
  validateInputs(inputs);

  const {
    studyLabel = '',
    nominalVoltageKv = null,
    systemKva,
    xrRatio = 10,
    loadSteps,
    pstSeriesForPlt,
  } = inputs;

  const warnings = [];
  const loadStepResults = [];

  for (const step of loadSteps) {
    const { deltaVPercent } = calcVoltageDip(step.loadKw, systemKva, xrRatio);
    const pst = pstFromTable(deltaVPercent, step.repetitionsPerHour);
    const pstRisk = classifyFlickerRisk(pst);
    const pstLimitPct = round((pst / PST_LIMIT) * 100, 1);

    loadStepResults.push({
      label: step.label || 'Load Step',
      loadKw: step.loadKw,
      repetitionsPerHour: step.repetitionsPerHour,
      deltaVPercent,
      pst,
      pstRisk,
      pstLimitPct,
    });
  }

  const worstPst = Math.max(...loadStepResults.map(r => r.pst));
  const worstPstRisk = classifyFlickerRisk(worstPst);

  // Plt: use provided series or fall back to worst-case constant estimate
  let plt;
  let pltSource;
  if (Array.isArray(pstSeriesForPlt) && pstSeriesForPlt.length > 0) {
    plt = pltFromPst(pstSeriesForPlt);
    pltSource = 'measured';
  } else {
    plt = pltFromPst([worstPst]);
    pltSource = 'estimated';
    warnings.push(
      'Plt is estimated from the worst-case Pst (conservative). Enter a series of 12 measured Pst values for an accurate long-term assessment.'
    );
  }
  const pltRisk = classifyFlickerRisk(plt);

  if (worstPst > PST_LIMIT) {
    warnings.push(
      `Worst-case Pst = ${worstPst} exceeds the IEC 61000-3-3 / IEEE 1453 limit of ${PST_LIMIT} at the PCC. Mitigation required (voltage stabiliser, SVC, or load scheduling).`
    );
  } else if (worstPst > PST_PASS_THRESHOLD) {
    warnings.push(
      `Worst-case Pst = ${worstPst} exceeds the planning level of ${PST_PASS_THRESHOLD}. Verify utility allocation and consider mitigation.`
    );
  }

  return {
    inputs: { studyLabel, nominalVoltageKv, systemKva, xrRatio, loadSteps, pstSeriesForPlt: pstSeriesForPlt || null },
    loadStepResults,
    worstPst,
    worstPstRisk,
    plt,
    pltRisk,
    pltSource,
    warnings,
    timestamp: new Date().toISOString(),
  };
}

function validateInputs(inputs) {
  if (!inputs || typeof inputs !== 'object') {
    throw new Error('inputs must be an object');
  }
  if (!Number.isFinite(inputs.systemKva) || inputs.systemKva <= 0) {
    throw new Error('systemKva must be greater than zero');
  }
  if (inputs.xrRatio != null && (!Number.isFinite(inputs.xrRatio) || inputs.xrRatio <= 0)) {
    throw new Error('xrRatio must be a positive number');
  }
  if (!Array.isArray(inputs.loadSteps) || inputs.loadSteps.length === 0) {
    throw new Error('loadSteps must be a non-empty array');
  }
  for (let i = 0; i < inputs.loadSteps.length; i++) {
    const s = inputs.loadSteps[i];
    if (!Number.isFinite(s.loadKw) || s.loadKw <= 0) {
      throw new Error(`loadSteps[${i}].loadKw must be greater than zero`);
    }
    if (!Number.isFinite(s.repetitionsPerHour) || s.repetitionsPerHour <= 0) {
      throw new Error(`loadSteps[${i}].repetitionsPerHour must be greater than zero`);
    }
  }
  if (inputs.pstSeriesForPlt != null) {
    if (!Array.isArray(inputs.pstSeriesForPlt)) {
      throw new Error('pstSeriesForPlt must be an array');
    }
    for (const v of inputs.pstSeriesForPlt) {
      if (!Number.isFinite(v) || v < 0) {
        throw new Error(`pstSeriesForPlt contains invalid value: ${v}`);
      }
    }
  }
}
