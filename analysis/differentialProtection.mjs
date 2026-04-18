/**
 * Differential Protection Zone Modeling — Gap #67 (87B / 87T / 87G)
 *
 * Implements the percentage-differential characteristic used in bus, transformer,
 * and generator differential relays per IEEE C37.91/C37.97/C37.101:
 *   - Dual-slope operating/restraint characteristic curve
 *   - CT ratio mismatch analysis and tap compensation
 *   - 2nd-harmonic inrush blocking and 5th-harmonic overexcitation restraint (87T)
 *   - Zone check returning OPERATE / RESTRAIN / BLOCKED
 *
 * All exported functions are pure (no DOM, no I/O).
 *
 * References:
 *   IEEE C37.91-2008  — IEEE Guide for Protecting Power Transformers
 *   IEEE C37.97-2012  — IEEE Guide for Protective Relay Applications to Power System Buses
 *   IEEE C37.101-2006 — IEEE Guide for Generator Ground Protection
 *   NERC PRC-001-2   — Protection system coordination
 */

/** Valid relay types supported by this module. */
export const DIFF_TYPES = ['87B', '87T', '87G'];

/**
 * Compute the percentage-differential operating threshold for a given restraint current multiple.
 *
 * The characteristic has three regions:
 *   1. Flat: 0 ≤ I_rest ≤ I_min  → threshold = I_min (minimum pickup)
 *   2. Slope 1: I_min < I_rest ≤ I_bp  → threshold = max(S1 × I_rest, I_min)
 *   3. Slope 2: I_rest > I_bp  → threshold = threshold_at_bp + S2 × (I_rest − I_bp)
 *
 * @param {number} restraintMultiple — per-unit restraint current (I_rest / I_rated); ≥ 0
 * @param {Object} [settings]
 * @param {number} [settings.slope1Pct=25]         Slope 1 in percent
 * @param {number} [settings.slope2Pct=50]         Slope 2 in percent
 * @param {number} [settings.minPickupMultiple=0.2] Minimum differential pickup (pu)
 * @param {number} [settings.breakpointMultiple=3.0] Per-unit restraint where slope changes
 * @returns {{ threshold: number, slope: 1|2, region: 'flat'|'slope1'|'slope2' }}
 */
export function percentDifferentialCharacteristic(restraintMultiple, settings = {}) {
  const {
    slope1Pct = 25,
    slope2Pct = 50,
    minPickupMultiple = 0.2,
    breakpointMultiple = 3.0,
  } = settings;

  if (typeof restraintMultiple !== 'number' || restraintMultiple < 0) {
    throw new RangeError('restraintMultiple must be a non-negative number');
  }

  const s1 = slope1Pct / 100;
  const s2 = slope2Pct / 100;

  if (restraintMultiple <= minPickupMultiple) {
    return { threshold: minPickupMultiple, slope: 1, region: 'flat' };
  }

  if (restraintMultiple <= breakpointMultiple) {
    const threshold = Math.max(s1 * restraintMultiple, minPickupMultiple);
    return { threshold, slope: 1, region: 'slope1' };
  }

  // Slope 2 continues from where slope 1 left off at the breakpoint
  const thresholdAtBp = Math.max(s1 * breakpointMultiple, minPickupMultiple);
  const threshold = thresholdAtBp + s2 * (restraintMultiple - breakpointMultiple);
  return { threshold, slope: 2, region: 'slope2' };
}

/**
 * Calculate CT ratio mismatch between the primary and secondary sides of a protected zone.
 *
 * For a transformer zone:
 *   tap = (xfmrTurnsRatio × secondaryCTRatio) / primaryCTRatio
 *   mismatch% = |tap − 1| × 100
 *
 * A tap of 1.0 means the CT secondary currents are perfectly balanced across the relay.
 * IEEE C37.91 considers mismatches ≤ 10% acceptable without additional compensation.
 *
 * @param {number} primaryCTRatio   Primary CT turns ratio (e.g. 600/5 = 120)
 * @param {number} secondaryCTRatio Secondary CT turns ratio (e.g. 300/5 = 60)
 * @param {number} xfmrTurnsRatio   Transformer voltage ratio (V_primary / V_secondary); use 1.0 for 87B/87G
 * @returns {{ tapFactor: number, mismatchPct: number, correction: string, withinLimit: boolean }}
 */
export function ctRatioMismatch(primaryCTRatio, secondaryCTRatio, xfmrTurnsRatio = 1) {
  if (primaryCTRatio <= 0 || secondaryCTRatio <= 0 || xfmrTurnsRatio <= 0) {
    throw new RangeError('primaryCTRatio, secondaryCTRatio, and xfmrTurnsRatio must be positive');
  }

  const tapFactor = (xfmrTurnsRatio * secondaryCTRatio) / primaryCTRatio;
  const mismatchPct = Math.abs(tapFactor - 1) * 100;
  const withinLimit = mismatchPct <= 10;

  let correction;
  if (mismatchPct <= 5) {
    correction = `Mismatch ${mismatchPct.toFixed(1)}% — within 5% tolerance, no compensation required.`;
  } else if (mismatchPct <= 10) {
    correction = `Mismatch ${mismatchPct.toFixed(1)}% — within IEEE C37.91 10% limit; monitor for marginal operation during inrush.`;
  } else {
    correction = `Mismatch ${mismatchPct.toFixed(1)}% exceeds 10% IEEE C37.91 limit — select matched CT ratios or enable numerical relay tap compensation.`;
  }

  return { tapFactor, mismatchPct, correction, withinLimit };
}

/**
 * Check harmonic restraint blocking conditions for transformer differential protection (87T).
 *
 * Two mechanisms per IEEE C37.91:
 *   1. 2nd harmonic blocking — magnetizing inrush: |I_2nd / I_diff| ≥ threshold (typ. 15–20%)
 *   2. 5th harmonic restraint — overexcitation: |I_5th / I_diff| ≥ threshold (typ. 35%)
 *
 * @param {number} iDiffPu  Differential (operating) current, per-unit of rated
 * @param {number} i2ndPu   2nd harmonic component, per-unit of rated
 * @param {number} i5thPu   5th harmonic component, per-unit of rated
 * @param {Object} [settings]
 * @param {number} [settings.restraint2ndPct=20] 2nd harmonic block threshold (%)
 * @param {number} [settings.restraint5thPct=35] 5th harmonic restraint threshold (%)
 * @returns {{ blocked: boolean, reason: string|null, inrushBlocked: boolean,
 *             overexcitationBlocked: boolean, ratio2ndPct: number, ratio5thPct: number }}
 */
export function harmonicRestraintCheck(iDiffPu, i2ndPu, i5thPu, settings = {}) {
  const { restraint2ndPct = 20, restraint5thPct = 35 } = settings;

  if (iDiffPu <= 0) {
    return {
      blocked: false, reason: null, inrushBlocked: false,
      overexcitationBlocked: false, ratio2ndPct: 0, ratio5thPct: 0,
    };
  }

  const ratio2ndPct = (i2ndPu / iDiffPu) * 100;
  const ratio5thPct = (i5thPu / iDiffPu) * 100;
  const inrushBlocked = ratio2ndPct >= restraint2ndPct;
  const overexcitationBlocked = ratio5thPct >= restraint5thPct;
  const blocked = inrushBlocked || overexcitationBlocked;

  let reason = null;
  if (inrushBlocked && overexcitationBlocked) {
    reason = `2nd harmonic ${ratio2ndPct.toFixed(1)}% ≥ ${restraint2ndPct}% (inrush) AND 5th harmonic ${ratio5thPct.toFixed(1)}% ≥ ${restraint5thPct}% (overexcitation)`;
  } else if (inrushBlocked) {
    reason = `2nd harmonic ${ratio2ndPct.toFixed(1)}% ≥ ${restraint2ndPct}% — magnetizing inrush blocking active`;
  } else if (overexcitationBlocked) {
    reason = `5th harmonic ${ratio5thPct.toFixed(1)}% ≥ ${restraint5thPct}% — overexcitation restraint active`;
  }

  return { blocked, reason, inrushBlocked, overexcitationBlocked, ratio2ndPct, ratio5thPct };
}

/**
 * Determine the relay decision for a differential protection zone.
 *
 * Decision logic:
 *   1. For 87T: check harmonic restraint first — if blocked, return BLOCKED (highest priority)
 *   2. Compare I_diff against the characteristic threshold:
 *      I_diff ≥ threshold → OPERATE (trip)
 *      I_diff < threshold → RESTRAIN (no trip)
 *
 * @param {'87B'|'87T'|'87G'} diffType        Relay type
 * @param {number}             iDiffPu         Differential current (per-unit of rated)
 * @param {number}             iRestraintPu    Restraint current (per-unit of rated)
 * @param {Object}             [settings]      Slope and harmonic settings
 * @param {Object}             [harmonics]     { i2ndPu, i5thPu } — used for 87T only
 * @returns {{ decision: 'OPERATE'|'RESTRAIN'|'BLOCKED', reason: string,
 *             thresholdPu: number, margin: number,
 *             characteristic: object, harmonicCheck: object|null }}
 */
export function protectionZoneCheck(diffType, iDiffPu, iRestraintPu, settings = {}, harmonics = {}) {
  if (!DIFF_TYPES.includes(diffType)) {
    throw new RangeError(`diffType must be one of: ${DIFF_TYPES.join(', ')}`);
  }
  if (typeof iDiffPu !== 'number' || iDiffPu < 0) {
    throw new RangeError('iDiffPu must be a non-negative number');
  }
  if (typeof iRestraintPu !== 'number' || iRestraintPu < 0) {
    throw new RangeError('iRestraintPu must be a non-negative number');
  }

  const characteristic = percentDifferentialCharacteristic(iRestraintPu, settings);
  const { threshold } = characteristic;
  const margin = iDiffPu - threshold;

  let harmonicCheck = null;
  if (diffType === '87T') {
    const { i2ndPu = 0, i5thPu = 0 } = harmonics;
    harmonicCheck = harmonicRestraintCheck(iDiffPu, i2ndPu, i5thPu, settings);
    if (harmonicCheck.blocked) {
      return {
        decision: 'BLOCKED',
        reason: `Harmonic restraint active — ${harmonicCheck.reason}`,
        thresholdPu: threshold,
        margin,
        characteristic,
        harmonicCheck,
      };
    }
  }

  const decision = iDiffPu >= threshold ? 'OPERATE' : 'RESTRAIN';
  const reason = decision === 'OPERATE'
    ? `I_diff (${iDiffPu.toFixed(3)} pu) ≥ threshold (${threshold.toFixed(3)} pu) — relay operates (trip)`
    : `I_diff (${iDiffPu.toFixed(3)} pu) < threshold (${threshold.toFixed(3)} pu) — in restraint region (no trip)`;

  return { decision, reason, thresholdPu: threshold, margin, characteristic, harmonicCheck };
}

/**
 * Generate characteristic curve sample points for plotting.
 * Returns { restraint, threshold } pairs at key breakpoints and intermediate steps.
 *
 * @param {Object} [settings] — slope settings
 * @param {number} [maxRestraint=10] — maximum restraint multiple to plot
 * @returns {Array<{restraint: number, threshold: number}>}
 */
export function buildCharacteristicCurve(settings = {}, maxRestraint = 10) {
  const {
    slope1Pct = 25,
    slope2Pct = 50,
    minPickupMultiple = 0.2,
    breakpointMultiple = 3.0,
  } = settings;

  const pts = [];
  const add = r => {
    const { threshold } = percentDifferentialCharacteristic(r, { slope1Pct, slope2Pct, minPickupMultiple, breakpointMultiple });
    pts.push({ restraint: parseFloat(r.toFixed(4)), threshold: parseFloat(threshold.toFixed(6)) });
  };

  // Flat region
  add(0);
  add(minPickupMultiple);

  // Slope 1 — sample at several points
  const step1 = (breakpointMultiple - minPickupMultiple) / 5;
  for (let i = 1; i <= 5; i++) add(minPickupMultiple + i * step1);

  // Slope 2 — sample to maxRestraint
  const step2 = (maxRestraint - breakpointMultiple) / 5;
  for (let i = 1; i <= 5; i++) add(breakpointMultiple + i * step2);

  return pts;
}

/**
 * Unified study entry point — validates inputs, runs all sub-checks, returns a
 * serialisable result suitable for `studies.differentialProtection` in dataStore.
 *
 * @param {Object} inputs
 * @param {'87B'|'87T'|'87G'} inputs.diffType
 * @param {string}  [inputs.zoneLabel]
 * @param {number}  [inputs.slope1Pct=25]
 * @param {number}  [inputs.slope2Pct=50]
 * @param {number}  [inputs.minPickupMultiple=0.2]
 * @param {number}  [inputs.breakpointMultiple=3.0]
 * @param {number}  [inputs.primaryCTRatio]    required for CT mismatch check
 * @param {number}  [inputs.secondaryCTRatio]  required for CT mismatch check
 * @param {number}  [inputs.xfmrTurnsRatio=1]
 * @param {number}  inputs.iDiffPu
 * @param {number}  inputs.iRestraintPu
 * @param {number}  [inputs.restraint2ndPct=20]
 * @param {number}  [inputs.restraint5thPct=35]
 * @param {number}  [inputs.i2ndPu=0]
 * @param {number}  [inputs.i5thPu=0]
 * @returns {Object} study result
 */
export function runDifferentialProtectionStudy(inputs) {
  const {
    diffType = '87T',
    zoneLabel = '',
    slope1Pct = 25,
    slope2Pct = 50,
    minPickupMultiple = 0.2,
    breakpointMultiple = 3.0,
    primaryCTRatio,
    secondaryCTRatio,
    xfmrTurnsRatio = 1,
    iDiffPu,
    iRestraintPu,
    restraint2ndPct = 20,
    restraint5thPct = 35,
    i2ndPu = 0,
    i5thPu = 0,
  } = inputs;

  if (!DIFF_TYPES.includes(diffType)) {
    throw new RangeError(`diffType must be one of: ${DIFF_TYPES.join(', ')}`);
  }
  if (typeof iDiffPu !== 'number' || iDiffPu < 0) {
    throw new RangeError('iDiffPu must be a non-negative number');
  }
  if (typeof iRestraintPu !== 'number' || iRestraintPu < 0) {
    throw new RangeError('iRestraintPu must be a non-negative number');
  }

  const settings = { slope1Pct, slope2Pct, minPickupMultiple, breakpointMultiple, restraint2ndPct, restraint5thPct };

  const zoneCheck = protectionZoneCheck(
    diffType, iDiffPu, iRestraintPu, settings,
    { i2ndPu, i5thPu }
  );

  let ctMismatch = null;
  if (primaryCTRatio != null && secondaryCTRatio != null) {
    ctMismatch = ctRatioMismatch(primaryCTRatio, secondaryCTRatio, xfmrTurnsRatio);
  }

  const characteristicCurve = buildCharacteristicCurve(settings);

  return {
    diffType,
    zoneLabel,
    settings,
    iDiffPu,
    iRestraintPu,
    zoneCheck,
    ctMismatch,
    characteristicCurve,
    timestamp: new Date().toISOString(),
  };
}
