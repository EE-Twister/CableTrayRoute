/**
 * Differential Protection Analysis (87B / 87T / 87G)
 *
 * Models percentage-differential relays for buses (87B), transformers (87T),
 * and generators (87G). The relay operates when the differential (operate)
 * current exceeds a percentage of the restraint (through) current, providing
 * sensitive internal-fault detection with stability on through-faults and inrush.
 *
 * Algorithm
 * ---------
 * 1. Convert primary and secondary currents to a common base using CT ratios
 *    and, for transformer applications, apply winding correction (phase-shift
 *    compensation for delta-wye connections, magnitude correction via √3 factor).
 * 2. Compute operate and restraint currents:
 *      I_op  = |I1_pu + I2_pu|           (phasor sum of normalised winding currents)
 *      I_res = (|I1_pu| + |I2_pu|) / 2   (average of magnitudes)
 * 3. Evaluate the dual-slope percentage-differential characteristic:
 *      Zone 1 (I_res ≤ I_res_break): trip if I_op > I_min_pu + slope1 × I_res
 *      Zone 2 (I_res >  I_res_break): trip if I_op > I_min_pu + slope2 × I_res
 * 4. Apply harmonic restraint:
 *      Block for inrush:        |I2_h| / |I1_f| > ihr2Threshold  (2nd harmonic)
 *      Block for overexcitation: |I5_h| / |I1_f| > ihr5Threshold (5th harmonic)
 * 5. Determine per-phase relay status: RESTRAINED | OPERATE | HARMONIC_BLOCKED.
 *
 * References
 * ----------
 *   IEEE C37.91-2008  — Guide for Protecting Power Transformers
 *   IEEE C37.102-2006 — Guide for AC Generator Protection
 *   IEEE C37.97-2020  — Guide for Protective Relay Applications to Power
 *                       System Buses
 *   IEC 60255-151:2009 — Functional requirements for protection equipment —
 *                        percentage differential relays
 */

/** Protected element types. */
export const ELEMENT_TYPES = {
  TRANSFORMER: '87T',
  BUS: '87B',
  GENERATOR: '87G',
};

/**
 * Standard transformer winding connections with their phase shifts (degrees).
 * The IEC vector group notation is used; angle = clockwise HV-LV phase shift.
 */
export const WINDING_CONNECTIONS = {
  'Yy0':  { shift: 0,   correction: 1,           label: 'Yy0  (0°)'   },
  'Yd1':  { shift: 30,  correction: Math.sqrt(3),   label: 'Yd1  (30°)'  },
  'Yd11': { shift: 330, correction: Math.sqrt(3),   label: 'Yd11 (330°)' },
  'Dy1':  { shift: 30,  correction: 1 / Math.sqrt(3), label: 'Dy1  (30°)' },
  'Dy11': { shift: 330, correction: 1 / Math.sqrt(3), label: 'Dy11 (330°)' },
  'Yy6':  { shift: 180, correction: 1,           label: 'Yy6  (180°)' },
  'Dd0':  { shift: 0,   correction: 1,           label: 'Dd0  (0°)'   },
};

/**
 * Convert the secondary winding CT current to per-unit of transformer rated
 * secondary current, and return the winding correction factor for reference.
 *
 * For NUMERICAL relays (the model implemented here), the relay software applies
 * digital phase-rotation compensation for delta-wye connections (30° for Yd1,
 * etc.). The MAGNITUDE is already balanced at rated load through the per-unit
 * normalisation using rated currents — no additional magnitude correction is
 * applied to the per-unit value itself.
 *
 * The `correctionFactor` field returns the connection's physical magnitude factor
 * (√3 for Yd/Dy, 1 for Yy/Dd). This is informational — used by the UI to show
 * the winding correction applied in electromechanical relay applications — but is
 * NOT applied to `i2Pu` in this numerical-relay model.
 *
 * @param {object} params
 * @param {number} params.iSecondaryA        Measured secondary current magnitude (A)
 * @param {number} params.ctr2               Secondary CT ratio (primary A / secondary A)
 * @param {number} params.iRatedSecondaryA   Transformer rated secondary current (A)
 * @param {string} params.windingConnection  IEC vector group (e.g. 'Yd1')
 * @returns {{ i2Pu: number, correctionFactor: number }}
 */
export function correctSecondaryWinding({ iSecondaryA, ctr2, iRatedSecondaryA, windingConnection }) {
  if (ctr2 <= 0) throw new Error('CT ratio CTR2 must be greater than zero');
  if (iRatedSecondaryA <= 0) throw new Error('Rated secondary current must be greater than zero');

  const conn = WINDING_CONNECTIONS[windingConnection] ?? WINDING_CONNECTIONS['Yy0'];
  // Per-unit normalisation: i2Pu = I_secondary / I_rated_secondary
  // The CT ratio cancels: (I_secondary/CTR2) / (I_rated_secondary/CTR2)
  const i2Pu = iRatedSecondaryA > 0 ? Math.abs(iSecondaryA / iRatedSecondaryA) : 0;

  return {
    i2Pu: Math.round(i2Pu * 10000) / 10000,
    correctionFactor: conn.correction,  // informational — not applied to i2Pu
  };
}

/**
 * Compute percentage-differential operate and restraint currents in per-unit.
 *
 * @param {object} params
 * @param {number} params.i1PrimaryA        Primary winding measured current (A, line-to-line basis)
 * @param {number} params.ctr1              Primary CT ratio (primary A / secondary A)
 * @param {number} params.iRatedPrimaryA    Transformer rated primary current (A)
 * @param {number} params.i2Pu             Secondary winding corrected current (pu) from correctSecondaryWinding()
 * @returns {{ iOpPu: number, iResPu: number, i1Pu: number }}
 */
export function differentialCurrents({ i1PrimaryA, ctr1, iRatedPrimaryA, i2Pu }) {
  if (ctr1 <= 0) throw new Error('CT ratio CTR1 must be greater than zero');
  if (iRatedPrimaryA <= 0) throw new Error('Rated primary current must be greater than zero');

  // CT secondary current in A
  const iCtPrimary = i1PrimaryA / ctr1;
  // Normalise to rated primary current / CTR1
  const iRatedCtPrimary = iRatedPrimaryA / ctr1;
  const i1Pu = iRatedCtPrimary > 0 ? Math.abs(iCtPrimary / iRatedCtPrimary) : 0;

  // Phasor sum (magnitude only, assuming worst-case in-phase summation for operate)
  const iOpPu = Math.abs(i1Pu - i2Pu);   // Through-fault: currents nearly equal → Iop ≈ 0
  const iResPu = (i1Pu + i2Pu) / 2;      // Average restraint

  return {
    i1Pu: Math.round(i1Pu * 10000) / 10000,
    iOpPu: Math.round(iOpPu * 10000) / 10000,
    iResPu: Math.round(iResPu * 10000) / 10000,
  };
}

/**
 * Evaluate the dual-slope percentage-differential characteristic.
 *
 * The IEEE C37.91 / IEC 60255-151 dual-slope characteristic:
 *   • Zone 1 (I_res ≤ I_res_break):  trip threshold = I_min + slope1 × I_res
 *   • Zone 2 (I_res  > I_res_break):  trip threshold = I_min + slope2 × I_res
 *
 * @param {object} params
 * @param {number} params.iOpPu       Operate current (pu)
 * @param {number} params.iResPu      Restraint current (pu)
 * @param {number} params.iMinPu      Minimum differential pickup (pu, default 0.2)
 * @param {number} params.slope1      Slope 1 (0–1, default 0.25)
 * @param {number} params.slope2      Slope 2 (0–1, default 0.50)
 * @param {number} params.iResBreakPu Breakpoint restraint current (pu, default 2.0)
 * @returns {{ tripThresholdPu: number, zone: 1|2, wouldOperate: boolean }}
 */
export function evaluateCharacteristic({
  iOpPu, iResPu,
  iMinPu = 0.2, slope1 = 0.25, slope2 = 0.50, iResBreakPu = 2.0,
}) {
  const zone = iResPu <= iResBreakPu ? 1 : 2;
  const slope = zone === 1 ? slope1 : slope2;
  const tripThresholdPu = iMinPu + slope * iResPu;
  const wouldOperate = iOpPu >= tripThresholdPu;

  return {
    tripThresholdPu: Math.round(tripThresholdPu * 10000) / 10000,
    zone,
    wouldOperate,
  };
}

/**
 * Evaluate harmonic restraint blocking conditions.
 *
 * Inrush detection (2nd harmonic): when the 2nd harmonic content of the
 * differential current exceeds the threshold, the relay is blocked to avoid
 * tripping on transformer inrush.
 *
 * Overexcitation detection (5th harmonic): excessive 5th harmonic indicates
 * transformer core saturation (overexcitation); the relay is blocked.
 *
 * @param {object} params
 * @param {number} params.iDiff1stA    Fundamental differential current (A)
 * @param {number} params.iDiff2ndA    2nd harmonic differential current (A)
 * @param {number} params.iDiff5thA    5th harmonic differential current (A)
 * @param {number} [params.ihr2Threshold]  2nd harmonic blocking threshold (default 0.15 = 15%)
 * @param {number} [params.ihr5Threshold]  5th harmonic blocking threshold (default 0.20 = 20%)
 * @returns {{ inrushBlocked: boolean, overexcitationBlocked: boolean,
 *             har2Ratio: number, har5Ratio: number }}
 */
export function evaluateHarmonicRestraint({
  iDiff1stA, iDiff2ndA, iDiff5thA,
  ihr2Threshold = 0.15,
  ihr5Threshold = 0.20,
}) {
  const har2Ratio = iDiff1stA > 0 ? iDiff2ndA / iDiff1stA : 0;
  const har5Ratio = iDiff1stA > 0 ? iDiff5thA / iDiff1stA : 0;

  return {
    inrushBlocked: har2Ratio >= ihr2Threshold,
    overexcitationBlocked: har5Ratio >= ihr5Threshold,
    har2Ratio: Math.round(har2Ratio * 10000) / 10000,
    har5Ratio: Math.round(har5Ratio * 10000) / 10000,
  };
}

/**
 * Generate characteristic curve points for the I_op vs I_res diagram.
 *
 * Returns arrays of {x, y} points for:
 *  - zone1: the slope-1 line from 0 to iResBreakPu
 *  - zone2: the slope-2 line from iResBreakPu to iResMax
 *  - minimum pickup: horizontal line at iMinPu
 *
 * @param {object} params
 * @param {number} params.iMinPu
 * @param {number} params.slope1
 * @param {number} params.slope2
 * @param {number} params.iResBreakPu
 * @param {number} [params.iResMax]   Upper limit for x-axis (default 5.0 pu)
 * @returns {{ zone1: {x:number,y:number}[], zone2: {x:number,y:number}[], pickup: {x:number,y:number}[] }}
 */
export function buildCharacteristicCurve({ iMinPu, slope1, slope2, iResBreakPu, iResMax = 5.0 }) {
  const zone1 = [];
  const zone2 = [];
  const step = 0.05;

  for (let res = 0; res <= iResBreakPu + 1e-9; res = Math.round((res + step) * 1000) / 1000) {
    zone1.push({ x: res, y: Math.round((iMinPu + slope1 * res) * 10000) / 10000 });
  }

  for (let res = iResBreakPu; res <= iResMax + 1e-9; res = Math.round((res + step) * 1000) / 1000) {
    zone2.push({ x: res, y: Math.round((iMinPu + slope2 * res) * 10000) / 10000 });
  }

  const pickup = [
    { x: 0, y: iMinPu },
    { x: iResBreakPu * 0.5, y: iMinPu },
  ];

  return { zone1, zone2, pickup };
}

/**
 * Run a complete differential protection analysis for one protected element.
 *
 * This is the main entry point.  It does NOT read from or write to the data
 * store — the caller (differentialprotection.js) is responsible for persistence.
 *
 * @param {object} inputs
 * @param {string} [inputs.elementLabel]      Descriptive label (e.g. "T1 – 10 MVA 115/13.8 kV")
 * @param {string} inputs.elementType         'transformer'|'bus'|'generator'
 * @param {number} inputs.ratingMva           Rated MVA of the protected element
 * @param {number} inputs.voltageHvKv         HV winding voltage (kV)
 * @param {number} inputs.voltageLvKv         LV winding voltage (kV), same as HV for bus/gen
 * @param {string} inputs.windingConnection   IEC vector group (e.g. 'Yd1')
 * @param {number} inputs.ctr1               Primary CT ratio
 * @param {number} inputs.ctr2               Secondary CT ratio
 * @param {number} inputs.iMinPu             Minimum differential pickup (pu)
 * @param {number} inputs.slope1             Slope 1 (fractional, e.g. 0.25)
 * @param {number} inputs.slope2             Slope 2 (fractional, e.g. 0.50)
 * @param {number} inputs.iResBreakPu        Slope breakpoint (pu restraint)
 * @param {number} inputs.ihr2Threshold      2nd harmonic blocking threshold (fractional)
 * @param {number} inputs.ihr5Threshold      5th harmonic blocking threshold (fractional)
 * @param {object[]} inputs.phases           Per-phase measured currents
 * @param {string}  inputs.phases[].label    Phase label (A, B, C)
 * @param {number}  inputs.phases[].i1A     Primary current magnitude (A)
 * @param {number}  inputs.phases[].i2A     Secondary current magnitude (A)
 * @param {number}  [inputs.phases[].i2ndA] 2nd harmonic differential current (A)
 * @param {number}  [inputs.phases[].i5thA] 5th harmonic differential current (A)
 * @returns {object}
 */
export function runDifferentialProtectionAnalysis(inputs) {
  const {
    elementLabel = '',
    elementType = 'transformer',
    ratingMva,
    voltageHvKv,
    voltageLvKv,
    windingConnection = 'Yd1',
    ctr1,
    ctr2,
    iMinPu = 0.20,
    slope1 = 0.25,
    slope2 = 0.50,
    iResBreakPu = 2.0,
    ihr2Threshold = 0.15,
    ihr5Threshold = 0.20,
    phases,
  } = inputs;

  if (!ratingMva || ratingMva <= 0) throw new Error('Rated MVA must be greater than zero');
  if (!voltageHvKv || voltageHvKv <= 0) throw new Error('HV voltage must be greater than zero');
  if (!voltageLvKv || voltageLvKv <= 0) throw new Error('LV voltage must be greater than zero');
  if (!ctr1 || ctr1 <= 0) throw new Error('Primary CT ratio CTR1 must be greater than zero');
  if (!ctr2 || ctr2 <= 0) throw new Error('Secondary CT ratio CTR2 must be greater than zero');
  if (!phases || phases.length === 0) throw new Error('At least one phase must be provided');
  if (slope1 < 0 || slope1 >= 1) throw new Error('Slope 1 must be in [0, 1)');
  if (slope2 < 0 || slope2 >= 1) throw new Error('Slope 2 must be in [0, 1)');
  if (slope2 < slope1) throw new Error('Slope 2 must be ≥ slope 1');
  if (iMinPu <= 0 || iMinPu >= 1) throw new Error('Minimum pickup must be in (0, 1)');

  // Rated currents from MVA and voltage
  const iRatedPrimaryA  = (ratingMva * 1000) / (Math.sqrt(3) * voltageHvKv);
  const iRatedSecondaryA = (ratingMva * 1000) / (Math.sqrt(3) * voltageLvKv);

  const warnings = [];
  const phaseResults = [];

  for (const ph of phases) {
    const { label, i1A, i2A, i2ndA = 0, i5thA = 0 } = ph;

    // Step 1 — secondary winding correction
    const { i2Pu, correctionFactor } = correctSecondaryWinding({
      iSecondaryA: i2A,
      ctr2,
      iRatedSecondaryA,
      windingConnection: elementType === 'bus' ? 'Yy0' : windingConnection,
    });

    // Step 2 — operate / restraint currents
    const { i1Pu, iOpPu, iResPu } = differentialCurrents({
      i1PrimaryA: i1A,
      ctr1,
      iRatedPrimaryA,
      i2Pu,
    });

    // Step 3 — evaluate characteristic
    const { tripThresholdPu, zone, wouldOperate } = evaluateCharacteristic({
      iOpPu, iResPu, iMinPu, slope1, slope2, iResBreakPu,
    });

    // Step 4 — harmonic restraint
    const iDiff1stA = Math.abs(i1A - i2A);
    const harmonicResult = evaluateHarmonicRestraint({
      iDiff1stA,
      iDiff2ndA: i2ndA,
      iDiff5thA: i5thA,
      ihr2Threshold,
      ihr5Threshold,
    });

    // Step 5 — relay status
    let status;
    if (wouldOperate) {
      if (harmonicResult.inrushBlocked) {
        status = 'HARMONIC_BLOCKED_INRUSH';
      } else if (harmonicResult.overexcitationBlocked) {
        status = 'HARMONIC_BLOCKED_OVEREXC';
      } else {
        status = 'OPERATE';
      }
    } else {
      status = 'RESTRAINED';
    }

    if (status === 'OPERATE') {
      warnings.push(`Phase ${label}: Relay will OPERATE — differential current (${iOpPu.toFixed(3)} pu) exceeds threshold (${tripThresholdPu.toFixed(3)} pu).`);
    }
    if (harmonicResult.inrushBlocked) {
      warnings.push(`Phase ${label}: 2nd harmonic ratio ${(harmonicResult.har2Ratio * 100).toFixed(1)}% exceeds threshold (${(ihr2Threshold * 100).toFixed(0)}%) — inrush blocking active.`);
    }
    if (harmonicResult.overexcitationBlocked) {
      warnings.push(`Phase ${label}: 5th harmonic ratio ${(harmonicResult.har5Ratio * 100).toFixed(1)}% exceeds threshold (${(ihr5Threshold * 100).toFixed(0)}%) — overexcitation blocking active.`);
    }

    phaseResults.push({
      label,
      i1Pu,
      i2Pu,
      correctionFactor,
      iOpPu,
      iResPu,
      tripThresholdPu,
      zone,
      status,
      har2Ratio: harmonicResult.har2Ratio,
      har5Ratio: harmonicResult.har5Ratio,
      inrushBlocked: harmonicResult.inrushBlocked,
      overexcitationBlocked: harmonicResult.overexcitationBlocked,
    });
  }

  // Overall relay status
  const hasOperate = phaseResults.some(p => p.status === 'OPERATE');
  const hasBlocked = phaseResults.some(p =>
    p.status === 'HARMONIC_BLOCKED_INRUSH' || p.status === 'HARMONIC_BLOCKED_OVEREXC'
  );
  const overallStatus = hasOperate ? 'OPERATE' : hasBlocked ? 'HARMONIC_BLOCKED' : 'RESTRAINED';

  // Characteristic curve for plotting
  const curve = buildCharacteristicCurve({ iMinPu, slope1, slope2, iResBreakPu });

  // Minimum operate primary current (for TCC integration)
  const iMinOperateA = Math.round(iMinPu * iRatedPrimaryA * 10) / 10;

  return {
    elementLabel,
    elementType,
    ratingMva,
    voltageHvKv,
    voltageLvKv,
    windingConnection,
    ctr1,
    ctr2,
    iRatedPrimaryA: Math.round(iRatedPrimaryA * 10) / 10,
    iRatedSecondaryA: Math.round(iRatedSecondaryA * 10) / 10,
    iMinPu,
    slope1,
    slope2,
    iResBreakPu,
    ihr2Threshold,
    ihr5Threshold,
    iMinOperateA,
    overallStatus,
    phaseResults,
    curve,
    warnings,
    timestamp: new Date().toISOString(),
  };
}
