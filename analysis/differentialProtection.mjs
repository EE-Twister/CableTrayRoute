/**
 * Differential Protection Zone Modeling — ANSI Device 87B / 87T / 87G
 *
 * Implements the percentage-differential characteristic used by modern numerical
 * differential relays (SEL-487B, SEL-387, GE Multilin T60, ABB RET670, etc.).
 *
 * Theory of operation:
 *   During normal conditions the algebraic sum of all currents entering the
 *   protected zone is zero (Kirchhoff's current law). A fault inside the zone
 *   creates an unbalance. The relay forms:
 *
 *     I_op  = | Σ i_k / n_k |               (operating / differential current)
 *     I_rst = Σ |i_k / n_k| / 2             (restraint current)
 *
 *   and compares I_op to a dual-slope threshold:
 *
 *     Slope 1 region  (0 ≤ I_rst < breakpoint):
 *       threshold = max(I_min_pu, slope1 × I_rst)
 *     Slope 2 region  (I_rst ≥ breakpoint):
 *       threshold = slope1×breakpoint + slope2×(I_rst − breakpoint)
 *
 *   Trip if  I_op > threshold  AND  harmonic restraint is not active.
 *
 * Harmonic restraint (87T / 87G) per IEEE C37.91-2008:
 *   2nd harmonic ≥ 15% of fundamental  → restrain (transformer inrush, 87T)
 *   5th harmonic ≥ 35% of fundamental  → restrain (over-excitation, 87G/87T)
 *
 * References:
 *   IEEE C37.91-2008  — Guide for Protecting Power Transformers
 *   IEEE C37.102-2006 — Guide for AC Generator Protection
 *   IEEE C37.97-1979  — Guide for Protective Relay Applications to Power System Buses
 *   IEEE C37.111-2013 — Common Format for Transient Data Exchange (COMTRADE)
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Harmonic restraint thresholds as fractions of fundamental. */
export const HARMONIC_RESTRAINT = {
  SECOND_HARMONIC_THRESHOLD: 0.15,  // 15% — inrush blocking (87T)
  FIFTH_HARMONIC_THRESHOLD:  0.35,  // 35% — over-excitation blocking (87T/87G)
};

/** Zone type definitions. */
export const ZONE_TYPES = {
  '87B': { label: 'Bus Differential (87B)',         harmonicRestraint: false, secondHarmonic: false, fifthHarmonic: false },
  '87T': { label: 'Transformer Differential (87T)', harmonicRestraint: true,  secondHarmonic: true,  fifthHarmonic: true  },
  '87G': { label: 'Generator Differential (87G)',   harmonicRestraint: true,  secondHarmonic: false, fifthHarmonic: true  },
};

// ---------------------------------------------------------------------------
// Pure calculation functions
// ---------------------------------------------------------------------------

/**
 * Compute the CT ratio mismatch between two current transformer ratios and a
 * relay tap setting. Returns the mismatch percentage and recommended tap.
 *
 * For a two-winding transformer zone:
 *   nominal_tap = CT1_ratio / CT2_ratio  (secondary amperes must match)
 *   mismatch%   = |tap_set − nominal_tap| / nominal_tap × 100
 *
 * IEEE C37.91 allows up to 5% mismatch without additional compensation.
 *
 * @param {number} ct1Ratio    CT1 primary:secondary ratio (e.g., 600 for 600:5)
 * @param {number} ct2Ratio    CT2 primary:secondary ratio (e.g., 100 for 100:5)
 * @param {number} tapSetting  Relay tap setting (dimensionless)
 * @returns {{ nominalTap: number, mismatchPct: number, acceptable: boolean }}
 */
export function ctRatioMismatch(ct1Ratio, ct2Ratio, tapSetting) {
  if (ct1Ratio <= 0) throw new Error('ct1Ratio must be greater than zero.');
  if (ct2Ratio <= 0) throw new Error('ct2Ratio must be greater than zero.');
  if (tapSetting <= 0) throw new Error('tapSetting must be greater than zero.');

  const nominalTap = ct1Ratio / ct2Ratio;
  const mismatchPct = Math.abs(tapSetting - nominalTap) / nominalTap * 100;

  return {
    nominalTap: Math.round(nominalTap * 10000) / 10000,
    mismatchPct: Math.round(mismatchPct * 100) / 100,
    acceptable: Math.round(mismatchPct * 100) / 100 <= 5.0,
  };
}

/**
 * Build the dual-slope characteristic boundary as an array of [I_rst, I_op_threshold]
 * points for plotting.
 *
 * @param {number} slope1      Slope 1 as a fraction (e.g., 0.25 for 25%)
 * @param {number} slope2      Slope 2 as a fraction (e.g., 0.65 for 65%)
 * @param {number} minPickupPu Minimum pickup in per-unit of CT secondary
 * @param {number} breakpointPu I_rst breakpoint (pu) where slope transitions from 1→2
 * @returns {{ irst: number, threshold: number }[]}
 */
export function dualSlopeCharacteristic(slope1, slope2, minPickupPu, breakpointPu) {
  if (slope1 <= 0 || slope1 >= 1) throw new Error('slope1 must be between 0 and 1 (exclusive).');
  if (slope2 <= slope1) throw new Error('slope2 must be greater than slope1.');
  if (minPickupPu <= 0) throw new Error('minPickupPu must be greater than zero.');
  if (breakpointPu <= 0) throw new Error('breakpointPu must be greater than zero.');

  // Pivot I_rst at breakpoint: threshold there is max(minPickup, slope1×breakpoint)
  const thresholdAtBreak = Math.max(minPickupPu, slope1 * breakpointPu);

  // Build a fine grid from 0 to 4×breakpoint
  const maxIrst = 4 * breakpointPu;
  const steps = 200;
  const points = [];

  for (let i = 0; i <= steps; i++) {
    const irst = (i / steps) * maxIrst;
    let threshold;
    if (irst < breakpointPu) {
      threshold = Math.max(minPickupPu, slope1 * irst);
    } else {
      threshold = thresholdAtBreak + slope2 * (irst - breakpointPu);
    }
    points.push({ irst: Math.round(irst * 10000) / 10000, threshold: Math.round(threshold * 10000) / 10000 });
  }

  return points;
}

/**
 * Convert measured line currents from both CT windings to operating and restraint
 * currents in per-unit of CT secondary (normalised to tap).
 *
 * For a two-terminal zone (bus or transformer):
 *   i1_pu = ia / (ct1Ratio / ctSecondary)  then normalised by tapSetting
 *   i2_pu = ib / (ct2Ratio / ctSecondary)
 *
 * Using the INTO-zone sign convention (positive = current flowing INTO the zone):
 *   I_op  = |i1_pu + i2_pu|   (algebraic sum — zero for balanced through-current)
 *   I_rst = (|i1_pu| + |i2_pu|) / 2
 *
 * @param {number} ia         Current flowing into zone terminal 1 (A primary)
 * @param {number} ib         Current flowing into zone terminal 2 (A primary; use negative for out-flow)
 * @param {number} ct1Ratio   CT1 primary:secondary ratio
 * @param {number} ct2Ratio   CT2 primary:secondary ratio
 * @param {number} tapSetting Relay tap setting
 * @param {number} [ctSecondary=5] CT secondary rating (A), default 5 A
 * @returns {{ i1Pu: number, i2Pu: number, iOp: number, iRst: number }}
 */
export function calcOperatingRestraintCurrents(ia, ib, ct1Ratio, ct2Ratio, tapSetting, ctSecondary = 5) {
  if (ct1Ratio <= 0) throw new Error('ct1Ratio must be greater than zero.');
  if (ct2Ratio <= 0) throw new Error('ct2Ratio must be greater than zero.');
  if (tapSetting <= 0) throw new Error('tapSetting must be greater than zero.');
  if (ctSecondary <= 0) throw new Error('ctSecondary must be greater than zero.');

  // Convert to CT secondary amperes, then to per-unit of tap
  const i1Sec = ia / (ct1Ratio / ctSecondary);
  const i2Sec = ib / (ct2Ratio / ctSecondary);
  const i1Pu = i1Sec / tapSetting;
  const i2Pu = i2Sec / tapSetting;

  const iOp  = Math.abs(i1Pu + i2Pu);
  const iRst = (Math.abs(i1Pu) + Math.abs(i2Pu)) / 2;

  return {
    i1Pu:  Math.round(i1Pu  * 10000) / 10000,
    i2Pu:  Math.round(i2Pu  * 10000) / 10000,
    iOp:   Math.round(iOp   * 10000) / 10000,
    iRst:  Math.round(iRst  * 10000) / 10000,
  };
}

/**
 * Evaluate harmonic restraint blocking per IEEE C37.91.
 *
 * @param {number} fundamentalA   Fundamental current magnitude (A or pu, same unit)
 * @param {number} secondHarmPct  2nd harmonic as % of fundamental (0–100)
 * @param {number} fifthHarmPct   5th harmonic as % of fundamental (0–100)
 * @param {string} zoneType       '87B', '87T', or '87G'
 * @returns {{ restrain: boolean, reason: string|null, secondPct: number, fifthPct: number }}
 */
export function checkHarmonicRestraint(fundamentalA, secondHarmPct, fifthHarmPct, zoneType) {
  if (fundamentalA < 0) throw new Error('fundamentalA must be ≥ 0.');
  if (secondHarmPct < 0 || secondHarmPct > 100) throw new Error('secondHarmPct must be between 0 and 100.');
  if (fifthHarmPct  < 0 || fifthHarmPct  > 100) throw new Error('fifthHarmPct must be between 0 and 100.');

  const zoneConfig = ZONE_TYPES[zoneType];
  if (!zoneConfig) throw new Error(`Unknown zoneType "${zoneType}". Valid: ${Object.keys(ZONE_TYPES).join(', ')}.`);

  if (!zoneConfig.harmonicRestraint) {
    return { restrain: false, reason: null, secondPct: secondHarmPct, fifthPct: fifthHarmPct };
  }

  if (zoneConfig.secondHarmonic && secondHarmPct >= HARMONIC_RESTRAINT.SECOND_HARMONIC_THRESHOLD * 100) {
    return {
      restrain: true,
      reason: `2nd harmonic ${secondHarmPct.toFixed(1)}% ≥ ${HARMONIC_RESTRAINT.SECOND_HARMONIC_THRESHOLD * 100}% threshold — transformer inrush blocked`,
      secondPct: secondHarmPct,
      fifthPct:  fifthHarmPct,
    };
  }

  if (zoneConfig.fifthHarmonic && fifthHarmPct >= HARMONIC_RESTRAINT.FIFTH_HARMONIC_THRESHOLD * 100) {
    return {
      restrain: true,
      reason: `5th harmonic ${fifthHarmPct.toFixed(1)}% ≥ ${HARMONIC_RESTRAINT.FIFTH_HARMONIC_THRESHOLD * 100}% threshold — over-excitation blocked`,
      secondPct: secondHarmPct,
      fifthPct:  fifthHarmPct,
    };
  }

  return { restrain: false, reason: null, secondPct: secondHarmPct, fifthPct: fifthHarmPct };
}

/**
 * Evaluate whether the differential relay should trip given operating and
 * restraint currents, the dual-slope characteristic, and harmonic restraint.
 *
 * @param {number}  iOp            Operating current (pu)
 * @param {number}  iRst           Restraint current (pu)
 * @param {number}  slope1         Slope 1 fraction
 * @param {number}  slope2         Slope 2 fraction
 * @param {number}  minPickupPu    Minimum pickup (pu)
 * @param {number}  breakpointPu   Breakpoint I_rst (pu)
 * @param {boolean} harmonicBlock  True when harmonic restraint is active
 * @returns {{ trip: boolean, threshold: number, marginPu: number, marginPct: number, restrainReason: string|null }}
 */
export function evalTrip(iOp, iRst, slope1, slope2, minPickupPu, breakpointPu, harmonicBlock) {
  if (iOp < 0) throw new Error('iOp must be ≥ 0.');
  if (iRst < 0) throw new Error('iRst must be ≥ 0.');

  const thresholdAtBreak = Math.max(minPickupPu, slope1 * breakpointPu);
  let threshold;
  if (iRst < breakpointPu) {
    threshold = Math.max(minPickupPu, slope1 * iRst);
  } else {
    threshold = thresholdAtBreak + slope2 * (iRst - breakpointPu);
  }

  const marginPu  = threshold - iOp;          // positive → security margin; negative → into trip zone
  const marginPct = threshold > 0 ? (marginPu / threshold) * 100 : 0;

  const trip = !harmonicBlock && iOp > threshold;

  return {
    trip,
    threshold:   Math.round(threshold   * 10000) / 10000,
    marginPu:    Math.round(marginPu    * 10000) / 10000,
    marginPct:   Math.round(marginPct   * 100)   / 100,
    restrainReason: harmonicBlock ? 'Harmonic restraint active — trip blocked' : null,
  };
}

/**
 * Build (I_rst, I_op) curve data for rendering on the TCC / differential plot.
 *
 * Returns two arrays:
 *   charLine — the dual-slope boundary (operate region above, restrain below)
 *   minPickupLine — horizontal line at I_op = minPickupPu across I_rst = 0..breakpoint
 *
 * @param {object} params
 * @param {number} params.slope1
 * @param {number} params.slope2
 * @param {number} params.minPickupPu
 * @param {number} params.breakpointPu
 * @returns {{ charLine: {irst:number,threshold:number}[], minPickupLine: {irst:number,threshold:number}[] }}
 */
export function buildDifferentialCurve(params) {
  const { slope1, slope2, minPickupPu, breakpointPu } = params;
  const charLine = dualSlopeCharacteristic(slope1, slope2, minPickupPu, breakpointPu);
  const minPickupLine = [
    { irst: 0,            threshold: minPickupPu },
    { irst: breakpointPu, threshold: minPickupPu },
  ];
  return { charLine, minPickupLine };
}

/**
 * Master analysis runner for a differential protection zone.
 *
 * @param {object} params
 * @param {string}  params.systemLabel        Human-readable zone label
 * @param {string}  params.zoneType           '87B', '87T', or '87G'
 * @param {number}  params.ct1Ratio           CT1 primary:secondary (e.g., 600)
 * @param {number}  params.ct2Ratio           CT2 primary:secondary (e.g., 100)
 * @param {number}  params.tapSetting         Relay tap (dimensionless)
 * @param {number}  [params.ctSecondary=5]    CT secondary amperes
 * @param {number}  params.slope1             Slope 1 (fraction, e.g., 0.25)
 * @param {number}  params.slope2             Slope 2 (fraction, e.g., 0.65)
 * @param {number}  params.minPickupPu        Minimum pickup (pu)
 * @param {number}  params.breakpointPu       I_rst breakpoint (pu)
 * @param {number}  params.iaA                Current at terminal 1 (A primary)
 * @param {number}  params.ibA                Current at terminal 2 (A primary, negative for out-flow)
 * @param {number}  [params.secondHarmPct=0]  2nd harmonic % of fundamental
 * @param {number}  [params.fifthHarmPct=0]   5th harmonic % of fundamental
 * @returns {object} Full result object suitable for persisting to studies.differentialProtection
 */
export function runDifferentialStudy(params) {
  const {
    systemLabel = '',
    zoneType,
    ct1Ratio,
    ct2Ratio,
    tapSetting,
    ctSecondary = 5,
    slope1,
    slope2,
    minPickupPu,
    breakpointPu,
    iaA,
    ibA,
    secondHarmPct = 0,
    fifthHarmPct  = 0,
  } = params;

  if (!ZONE_TYPES[zoneType]) {
    throw new Error(`Unknown zoneType "${zoneType}". Valid: ${Object.keys(ZONE_TYPES).join(', ')}.`);
  }
  if (slope1 <= 0 || slope1 >= 1) throw new Error('slope1 must be between 0 and 1 (exclusive).');
  if (slope2 <= slope1) throw new Error('slope2 must be greater than slope1.');
  if (minPickupPu <= 0) throw new Error('minPickupPu must be greater than zero.');
  if (breakpointPu <= 0) throw new Error('breakpointPu must be greater than zero.');

  const warnings = [];

  // --- CT ratio mismatch ---
  const ctMismatch = ctRatioMismatch(ct1Ratio, ct2Ratio, tapSetting);
  if (!ctMismatch.acceptable) {
    warnings.push(
      `CT ratio mismatch ${ctMismatch.mismatchPct.toFixed(1)}% exceeds 5% limit. ` +
      `Nominal tap = ${ctMismatch.nominalTap.toFixed(4)}; set tap to nearest available relay setting.`
    );
  }

  // --- Operating and restraint currents ---
  const currents = calcOperatingRestraintCurrents(iaA, ibA, ct1Ratio, ct2Ratio, tapSetting, ctSecondary);

  // --- Harmonic restraint ---
  const harmonic = checkHarmonicRestraint(Math.abs(iaA), secondHarmPct, fifthHarmPct, zoneType);

  // --- Trip evaluation ---
  const tripResult = evalTrip(
    currents.iOp, currents.iRst,
    slope1, slope2, minPickupPu, breakpointPu,
    harmonic.restrain
  );

  // --- Curve for plotting ---
  const curve = buildDifferentialCurve({ slope1, slope2, minPickupPu, breakpointPu });

  // --- Operating point margin warning ---
  if (!tripResult.trip && !harmonic.restrain && tripResult.marginPct < 10) {
    warnings.push(
      `Operating point is within ${tripResult.marginPct.toFixed(1)}% of trip boundary. ` +
      'Verify CT accuracy and relay settings under maximum through-fault current.'
    );
  }

  return {
    systemLabel,
    zoneType,
    zoneLabel: ZONE_TYPES[zoneType].label,
    timestamp: new Date().toISOString(),
    inputs: {
      ct1Ratio,
      ct2Ratio,
      tapSetting,
      ctSecondary,
      slope1,
      slope2,
      minPickupPu,
      breakpointPu,
      iaA,
      ibA,
      secondHarmPct,
      fifthHarmPct,
    },
    ctMismatch,
    currents,
    harmonic,
    tripResult,
    curve,
    warnings,
  };
}
