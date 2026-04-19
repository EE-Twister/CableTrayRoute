/**
 * Voltage Stability Analysis — P-V and Q-V Curves
 *
 * Analytical two-bus Thevenin equivalent model for steady-state voltage
 * stability margin assessment.
 *
 * Model: Source bus V_s = 1.0 pu → Series impedance Z = R + jX (pu) → Load bus
 *
 * Voltage equation (quadratic in V²):
 *   V⁴ + (2PR + 2QX − 1)V² + (P² + Q²)Z² = 0
 *
 * References:
 *   P. Kundur, "Power System Stability and Control," Ch. 14 (McGraw-Hill, 1994)
 *   IEEE/PES Task Force, "Voltage Stability Assessment," June 2002
 *   Carson W. Taylor, "Power System Voltage Stability" (McGraw-Hill, 1994)
 */

/** Bus voltage below this level is considered voltage collapse. */
export const COLLAPSE_VOLTAGE_PU = 0.5;

function validate(cond, msg) {
  if (!cond) throw new RangeError(msg);
}

function round4(v) {
  return Math.round(v * 10000) / 10000;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

/**
 * Compute per-unit R and X from short-circuit MVA and X/R ratio.
 *
 * Z_pu = baseMva / scMva (Thevenin impedance magnitude in pu)
 * R = Z_pu / √(1 + XR²),  X = Z_pu · XR / √(1 + XR²)
 */
function theveninZpu(scMva, xrRatio, baseMva) {
  const zMag = baseMva / scMva;
  const d = Math.sqrt(1 + xrRatio * xrRatio);
  return { r: zMag / d, x: zMag * xrRatio / d };
}

/**
 * Solve 2-bus power flow for load bus voltage magnitude (pu).
 *
 * Returns the upper (high-voltage, stable) solution, or null if no real
 * solution exists (load past the nose/collapse point).
 *
 * V⁴ + bV² + c = 0,  b = 2PR + 2QX − 1,  c = (P² + Q²)(R² + X²)
 * Stable root: V² = (−b + √(b² − 4c)) / 2
 */
function solveVoltage(p, q, r, x) {
  const z2 = r * r + x * x;
  const b = 2 * p * r + 2 * q * x - 1;
  const disc = b * b - 4 * (p * p + q * q) * z2;
  if (disc < 0) return null;
  const v2 = (-b + Math.sqrt(disc)) / 2;
  return v2 > 0 ? Math.sqrt(v2) : null;
}

/**
 * Analytical nose-point active power for a constant-power-factor load.
 *
 * Derived by setting the voltage quadratic's discriminant to zero with Q = P·tanφ:
 *   4P²(X − R·tanφ)² + 4P(R + X·tanφ) − 1 = 0
 *
 * Solving: P_nose = (|Z|/cosφ − (R + X·tanφ)) / (2·(X − R·tanφ)²)
 *
 * Special case X = R·tanφ (impedance angle = load angle): P_nose = 1/(4(R + X·tanφ))
 */
function nosePointP(p0, tanPhi, r, x) {
  const cosPhi = 1 / Math.sqrt(1 + tanPhi * tanPhi);
  const alpha = r + x * tanPhi;
  const zMag  = Math.sqrt(r * r + x * x);
  const beta  = x - r * tanPhi;

  if (Math.abs(beta) < 1e-9) {
    if (alpha < 1e-9) throw new RangeError('Degenerate impedance: R and X are both near zero.');
    return 1 / (4 * alpha);
  }
  return (zMag / cosPhi - alpha) / (2 * beta * beta);
}

/**
 * Lower (unstable) branch voltage at a given (P, Q).
 * Returns null if no solution.
 */
function solveVoltageLower(p, q, r, x) {
  const z2 = r * r + x * x;
  const b = 2 * p * r + 2 * q * x - 1;
  const disc = b * b - 4 * (p * p + q * q) * z2;
  if (disc < 0) return null;
  const v2 = (-b - Math.sqrt(disc)) / 2;
  return v2 > 0 ? Math.sqrt(v2) : null;
}

/**
 * Solve for the reactive compensation Q_comp needed to hold bus voltage V
 * at fixed active load P. Both branches (stable/unstable) are returned.
 *
 * Quadratic in Q_net (net reactive absorbed from network = Q_load − Q_comp):
 *   k·Q_net² + 2XV²·Q_net + (V⁴ + (2PR − 1)V² + P²k) = 0
 *   k = R² + X²
 *
 * Q_comp = Q_load − Q_net
 *
 * Returns { upper, lower } where each is Q_comp in pu (null if no solution).
 */
function qCompAtVoltage(v, p, qLoad, r, x) {
  const k = r * r + x * x;
  const v2 = v * v;
  const a = k;
  const bCoef = 2 * x * v2;
  const cCoef = v2 * v2 + (2 * p * r - 1) * v2 + p * p * k;
  const disc = bCoef * bCoef - 4 * a * cCoef;
  if (disc < 0) return { upper: null, lower: null };
  const sqrtDisc = Math.sqrt(disc);
  const qNetUpper = (-bCoef + sqrtDisc) / (2 * a);
  const qNetLower = (-bCoef - sqrtDisc) / (2 * a);
  return {
    upper: qLoad - qNetUpper,
    lower: qLoad - qNetLower,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Trace the P-V nose curve for a constant-power-factor radial load.
 *
 * Returns upper (stable) and lower (unstable) voltage branches vs. active
 * power loading, plus the nose point and collapse margin.
 *
 * @param {object}  opts
 * @param {number}  opts.scMva           Short-circuit MVA at load bus
 * @param {number}  [opts.xrRatio=10]    Source X/R ratio
 * @param {number}  [opts.baseMva=100]   System base MVA
 * @param {number}  [opts.systemKv=4.16] Base kV L-L (for display only)
 * @param {number}  opts.loadMw          Base-case active load (MW)
 * @param {number}  [opts.powerFactor=0.85]  Lagging load power factor
 * @param {number}  [opts.steps=100]     Trace resolution (10–500)
 * @returns {{ upperPoints, lowerPoints, nosePoint, loadMarginMW,
 *             loadMarginPct, baseCaseVPu, warnings, inputs, timestamp }}
 */
export function runPVCurve(opts = {}) {
  const {
    scMva,
    xrRatio = 10,
    baseMva = 100,
    systemKv = 4.16,
    loadMw = 10,
    powerFactor = 0.85,
    steps = 100,
  } = opts;

  validate(scMva > 0, 'scMva must be greater than zero');
  validate(xrRatio > 0, 'xrRatio must be greater than zero');
  validate(baseMva > 0, 'baseMva must be greater than zero');
  validate(systemKv > 0, 'systemKv must be greater than zero');
  validate(loadMw > 0, 'loadMw must be greater than zero');
  validate(powerFactor > 0 && powerFactor <= 1, 'powerFactor must be in (0, 1]');
  validate(Number.isInteger(steps) && steps >= 10 && steps <= 500,
    'steps must be an integer between 10 and 500');

  const { r, x } = theveninZpu(scMva, xrRatio, baseMva);
  const tanPhi   = Math.tan(Math.acos(powerFactor));
  const p0       = loadMw / baseMva;
  const q0       = p0 * tanPhi;

  const pNosePu = nosePointP(p0, tanPhi, r, x);
  validate(pNosePu > 0,
    'Computed nose-point power is non-positive — check scMva and impedance inputs.');

  const lambdaNose = pNosePu / p0;

  const warnings = [];
  const v0 = solveVoltage(p0, q0, r, x);
  validate(v0 !== null,
    'Base-case load already exceeds the stability limit. Reduce loadMw or increase scMva.');

  if (v0 < 0.70) {
    warnings.push(
      `Base-case voltage ${(v0 * 100).toFixed(1)}% is below 0.70 pu — operating point is near the stability limit.`
    );
  }

  // Upper (stable) branch: λ from 0 to λ_nose
  const upperPoints = [];
  for (let i = 0; i <= steps; i++) {
    const lambda = (i / steps) * lambdaNose;
    const p = lambda * p0;
    const q = lambda * q0;
    const v = solveVoltage(p, q, r, x);
    if (v === null) break;
    upperPoints.push({ lambdaPu: round4(lambda), pMw: round4(p * baseMva), vPu: round4(v) });
  }

  // Lower (unstable) branch: from λ_nose back toward 0
  const lowerPoints = [];
  for (let i = steps; i >= 0; i--) {
    const lambda = (i / steps) * lambdaNose;
    const p = lambda * p0;
    const q = lambda * q0;
    const v = solveVoltageLower(p, q, r, x);
    if (v === null) continue;
    lowerPoints.push({ lambdaPu: round4(lambda), pMw: round4(p * baseMva), vPu: round4(v) });
  }

  // Nose voltage from analytical formula: V²_nose = (1 − 2·P_nose·(R + X·tanφ)) / 2
  const vNoseSq = (1 - 2 * pNosePu * (r + x * tanPhi)) / 2;
  const vNose   = vNoseSq > 0 ? Math.sqrt(vNoseSq) : 0;
  const loadMarginMW  = round2((pNosePu - p0) * baseMva);
  const loadMarginPct = round2(((pNosePu - p0) / pNosePu) * 100);

  return {
    upperPoints,
    lowerPoints,
    nosePoint: {
      lambdaPu: round4(lambdaNose),
      pMw:      round4(pNosePu * baseMva),
      vPu:      round4(vNose),
    },
    baseCasePMw:    round4(loadMw),
    baseCaseVPu:    round4(v0),
    loadMarginMW,
    loadMarginPct,
    impedance: { r: round4(r), x: round4(x) },
    warnings,
    inputs:    { scMva, xrRatio, baseMva, systemKv, loadMw, powerFactor, steps },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Trace the Q-V curve for a bus at constant active power loading.
 *
 * Sweeps bus voltage from V_max to V_min and computes the reactive
 * compensation Q_comp needed to hold each voltage level at fixed P.
 * Positive Q_comp = capacitive injection (raises voltage).
 *
 * The Q-margin is the reactive reserve: how much compensation can be
 * withdrawn before voltage collapse (= |minimum Q_comp| on upper branch
 * when the minimum is negative).
 *
 * @param {object}  opts
 * @param {number}  opts.scMva
 * @param {number}  [opts.xrRatio=10]
 * @param {number}  [opts.baseMva=100]
 * @param {number}  [opts.systemKv=4.16]
 * @param {number}  opts.loadMw
 * @param {number}  [opts.powerFactor=0.85]
 * @param {number}  [opts.steps=100]
 * @returns {{ upperPoints, lowerPoints, vOperating, qMarginMvar,
 *             warnings, inputs, timestamp }}
 */
export function runQVCurve(opts = {}) {
  const {
    scMva,
    xrRatio = 10,
    baseMva = 100,
    systemKv = 4.16,
    loadMw = 10,
    powerFactor = 0.85,
    steps = 100,
  } = opts;

  validate(scMva > 0, 'scMva must be greater than zero');
  validate(xrRatio > 0, 'xrRatio must be greater than zero');
  validate(baseMva > 0, 'baseMva must be greater than zero');
  validate(systemKv > 0, 'systemKv must be greater than zero');
  validate(loadMw > 0, 'loadMw must be greater than zero');
  validate(powerFactor > 0 && powerFactor <= 1, 'powerFactor must be in (0, 1]');
  validate(Number.isInteger(steps) && steps >= 10 && steps <= 500,
    'steps must be an integer between 10 and 500');

  const { r, x } = theveninZpu(scMva, xrRatio, baseMva);
  const tanPhi = Math.tan(Math.acos(powerFactor));
  const p      = loadMw / baseMva;
  const qLoad  = p * tanPhi;

  const warnings = [];
  const vOp = solveVoltage(p, qLoad, r, x);
  validate(vOp !== null,
    'Base-case load already exceeds the stability limit. Reduce loadMw or increase scMva.');

  if (vOp < 0.70) {
    warnings.push(
      `Base-case voltage ${(vOp * 100).toFixed(1)}% is below 0.70 pu — operating point is near the stability limit.`
    );
  }

  // Voltage sweep range: from 1.1 pu down to 0.30 pu
  const vMax = 1.1;
  const vMin = 0.30;

  const upperPoints = [];
  const lowerPoints = [];

  for (let i = 0; i <= steps; i++) {
    const v = vMax - (i / steps) * (vMax - vMin);
    const { upper, lower } = qCompAtVoltage(v, p, qLoad, r, x);
    if (upper !== null) {
      upperPoints.push({ vPu: round4(v), qCompMvar: round4(upper * baseMva) });
    }
    if (lower !== null) {
      lowerPoints.push({ vPu: round4(v), qCompMvar: round4(lower * baseMva) });
    }
  }

  // Q-margin: minimum Q_comp on upper branch (negative = capacitive reserve)
  let qCompMinPu = 0;
  for (const pt of upperPoints) {
    const q = pt.qCompMvar / baseMva;
    if (q < qCompMinPu) qCompMinPu = q;
  }
  const qMarginMvar = round2(-qCompMinPu * baseMva);

  if (qMarginMvar <= 0) {
    warnings.push('Q-margin is zero or negative — the system requires reactive injection to maintain voltage stability.');
  }

  return {
    upperPoints,
    lowerPoints,
    vOperating:  round4(vOp),
    qMarginMvar,
    impedance:   { r: round4(r), x: round4(x) },
    warnings,
    inputs:    { scMva, xrRatio, baseMva, systemKv, loadMw, powerFactor, steps },
    timestamp: new Date().toISOString(),
  };
}
