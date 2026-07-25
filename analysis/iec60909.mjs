/**
 * IEC 60909-0:2016 Short-Circuit Current Calculation Engine
 *
 * Implements the equivalent voltage source method per IEC 60909-0:2016 for
 * calculating short-circuit currents in three-phase AC systems. This module
 * is invoked automatically when method === 'IEC' in runShortCircuit().
 *
 * Supported output quantities:
 *   I"k3  — initial symmetrical three-phase short-circuit current (kA)
 *   I"k2  — initial symmetrical line-to-line short-circuit current (kA)
 *   I"k1  — initial symmetrical line-to-ground short-circuit current (kA)
 *   I"k2E — initial symmetrical double-line-to-ground short-circuit current (kA)
 *   ip    — peak short-circuit current (kA)  [IEC §4.3.1]
 *   Ib    — symmetrical short-circuit breaking current (kA)  [IEC §8]
 *   Ith   — thermal equivalent short-circuit current (kA)  [IEC §4.8]
 *   kappa — peak factor κ
 *   mu    — breaking-current decay factor μ  [IEC §8.1.5.2]
 *   cFactor — voltage factor c used in this calculation
 *
 * Impedance corrections:
 *   - K_T for transformers (§6.3.3) and K_G for synchronous generators
 *     (§6.6.1) are applied per element by shortCircuit.mjs before the
 *     impedance cascade, since each factor corrects only its own element's
 *     impedance rather than the summed impedance at the bus.
 *
 * Assumptions / simplifications:
 *   - Near-to-generator decay is applied to the synchronous-machine share of
 *     I"k only; the remaining infeed is carried through undecayed. Callers that
 *     cannot apportion the generator contribution get μ = 1 (far-from-
 *     generator), which is the conservative result for breaker breaking duty.
 *   - Ith uses the simplified m+n method (IEC 60909-0:2016 §4.8.1)
 */

// ---------------------------------------------------------------------------
// Re-export core helpers (kept DRY — these are shared with shortCircuit.mjs)
// ---------------------------------------------------------------------------

function add(a, b) {
  return { r: (a.r || 0) + (b.r || 0), x: (a.x || 0) + (b.x || 0) };
}

function mag(z) {
  return Math.sqrt((z.r || 0) ** 2 + (z.x || 0) ** 2) || 1e-6;
}

function mult(a, b) {
  return { r: a.r * b.r - a.x * b.x, x: a.r * b.x + a.x * b.r };
}

function div(a, b) {
  const denom = (b.r || 0) ** 2 + (b.x || 0) ** 2 || 1e-6;
  return { r: (a.r * b.r + a.x * b.x) / denom, x: (a.x * b.r - a.r * b.x) / denom };
}

function parallel(a, b) {
  return div(mult(a, b), add(a, b));
}

function toImpedance(value) {
  if (!value || typeof value !== 'object') return { r: 0, x: 0 };
  const r = Number(value.r);
  const x = Number(value.x);
  return {
    r: Number.isFinite(r) ? r : 0,
    x: Number.isFinite(x) ? x : 0
  };
}

// ---------------------------------------------------------------------------
// IEC 60909-0:2016 — Voltage factor c (Table 1)
// ---------------------------------------------------------------------------

/**
 * Returns the IEC 60909-0:2016 voltage factor c per Table 1.
 *
 * @param {number} kV       - Nominal line-to-line voltage (kV)
 * @param {'max'|'min'} mode - 'max' for maximum fault current (equipment rating);
 *                             'min' for minimum fault current (protection setting)
 * @param {number} lvTolerancePct - LV system voltage tolerance in %; ≥6% → c_max=1.10
 *                                   (default 10, most common for IEC LV systems)
 * @returns {number} c factor
 */
export function cFactor(kV, mode = 'max', lvTolerancePct = 10) {
  if (kV <= 1.0) {
    // Low voltage (100 V to 1000 V)
    if (mode === 'min') return 0.95;
    return lvTolerancePct >= 6 ? 1.10 : 1.05;
  }
  // Medium voltage (>1 kV to ≤35 kV) and high voltage (>35 kV)
  return mode === 'min' ? 1.00 : 1.10;
}

// ---------------------------------------------------------------------------
// IEC 60909-0:2016 — Peak factor κ (§4.3.1.1, Equation 14)
// ---------------------------------------------------------------------------

/**
 * Calculates the IEC 60909-0 peak factor κ.
 *
 * κ = 1.02 + 0.98 × e^(−3 × R/X)
 *
 * Range: 1.02 (high R/X, resistive circuit) to 2.0 (purely inductive X/R → ∞).
 *
 * @param {number} xr - X/R ratio at the fault point (dimensionless)
 * @returns {number} κ factor
 */
export function kappaIEC(xr) {
  // Guard against zero / very small X/R (purely resistive — κ → 1.02)
  const safeXR = Math.max(xr, 0.01);
  return 1.02 + 0.98 * Math.exp(-3 / safeXR);
}

// ---------------------------------------------------------------------------
// IEC 60909-0:2016 — Thermal m-factor (§4.8.1, Equation 74 simplified)
// ---------------------------------------------------------------------------

/**
 * Calculates the thermal factor m for DC component heating (IEC 60909-0 Fig. 22).
 *
 * Uses the analytical approximation:
 *   m = (1 / (2 × f × Tk × ln(κ²))) × (e^(2 × f × Tk × ln(κ²)) − 1)
 *
 * This is exact for the IEC exponential DC decay model.
 *
 * @param {number} kappa - Peak factor κ
 * @param {number} faultDurationS - Fault duration Tk in seconds (default 1.0 s)
 * @param {number} freqHz - System frequency in Hz (default 50 Hz per IEC)
 * @returns {number} m factor (≥ 0)
 */
export function thermalMFactor(kappa, faultDurationS = 1.0, freqHz = 50) {
  const Tk = Math.max(faultDurationS, 0.02);
  // DC component decrement: lnKsq = ln(κ²) but derived from κ = 1.02 + 0.98×e^(−3/xr)
  // Equivalent: the DC time constant τ = X / (ω × R) = X/R / (2πf)
  // From κ: κ − 1.02 = 0.98 × e^(−3/xr) → 3/xr = −ln((κ−1.02)/0.98)
  // xr = −3 / ln((κ−1.02)/0.98)
  const inner = (kappa - 1.02) / 0.98;
  if (inner <= 0 || inner >= 1) {
    // κ at boundary — m approaches 0
    return 0;
  }
  const xr = -3 / Math.log(inner);
  const tau = xr / (2 * Math.PI * freqHz); // DC time constant in seconds
  const exponent = 2 * Tk / tau;
  if (exponent < 1e-9) return 0;
  return (tau / (2 * Tk)) * (Math.exp(exponent) - 1) * Math.exp(-exponent);
}

// ---------------------------------------------------------------------------
// IEC 60909-0:2016 — Transformer impedance correction factor K_T (§3.3.3)
// ---------------------------------------------------------------------------

/**
 * Calculates the IEC 60909-0 transformer impedance correction factor K_T.
 *
 * K_T = 0.95 × c_max / (1 + 0.6 × |xT|)
 *
 * where xT is the per-unit transformer reactance based on rated MVA.
 *
 * @param {number} xTPu   - Per-unit transformer reactance (e.g. 0.06 for 6%)
 * @param {number} cMax   - c_max voltage factor for the voltage level
 * @returns {number} K_T (correction factor, typically 0.9 – 1.0)
 */
export function transformerCorrectionKT(xTPu, cMax = 1.10) {
  const xT = Math.abs(xTPu);
  return (0.95 * cMax) / (1 + 0.6 * xT);
}

// ---------------------------------------------------------------------------
// IEC 60909-0:2016 — Generator impedance correction factor K_G (§6.6.1, Eq. 18)
// ---------------------------------------------------------------------------

/**
 * Calculates the IEC 60909-0:2016 synchronous generator impedance correction
 * factor K_G for a generator connected directly to the faulted network (no
 * unit transformer).
 *
 *   K_G = (U_n / U_rG) × c_max / (1 + x"_d × sin φ_rG)
 *
 * The corrected generator impedance is Z_GK = K_G × Z_G, applied to the
 * positive-, negative- and zero-sequence generator impedance alike.
 *
 * @param {object} params
 * @param {number} params.unKV    - Nominal system voltage U_n at the generator terminals (kV)
 * @param {number} params.urgKV   - Generator rated voltage U_rG (kV)
 * @param {number} params.xdppPu  - Subtransient reactance x"_d, per unit on the generator rating
 * @param {number} params.ratedPF - Generator rated power factor cos φ_rG (0 < pf ≤ 1)
 * @param {number} params.cMax    - c_max voltage factor for the generator voltage level
 * @returns {number|null} K_G, or null when the required generator data is absent
 */
export function generatorCorrectionKG({ unKV, urgKV, xdppPu, ratedPF, cMax = 1.10 } = {}) {
  const un = Number(unKV);
  const urg = Number(urgKV);
  const xdpp = Number(xdppPu);
  const pf = Number(ratedPF);
  if (!Number.isFinite(un) || un <= 0) return null;
  if (!Number.isFinite(urg) || urg <= 0) return null;
  if (!Number.isFinite(xdpp) || xdpp <= 0) return null;
  // cos φ_rG must be a genuine power factor for sin φ_rG to be meaningful.
  if (!Number.isFinite(pf) || pf <= 0 || pf > 1) return null;
  const sinPhi = Math.sqrt(Math.max(1 - pf * pf, 0));
  return (un / urg) * (cMax / (1 + xdpp * sinPhi));
}

// ---------------------------------------------------------------------------
// IEC 60909-0:2016 — Breaking current decay factor μ (§8.1.5.2)
// ---------------------------------------------------------------------------

// μ curves are tabulated against the minimum time delay t_min. Each entry is
// [t_min (s), a, b, k] for μ = a + b × e^(−k × q), where q = I"kG / I_rG.
const MU_CURVES = [
  [0.02, 0.84, 0.26, 0.26],
  [0.05, 0.71, 0.51, 0.30],
  [0.10, 0.62, 0.72, 0.32],
  [0.25, 0.56, 0.94, 0.38]
];

function muFromCurve([, a, b, k], q) {
  return a + b * Math.exp(-k * q);
}

/**
 * Calculates the IEC 60909-0:2016 decay factor μ for the symmetrical
 * short-circuit breaking current of a near-to-generator fault.
 *
 * μ accounts for the decay of the AC component between fault inception and
 * contact separation. It is tabulated for minimum time delays of 0.02, 0.05,
 * 0.10 and ≥0.25 s; IEC permits linear interpolation between those curves.
 *
 * μ = 1 when I"kG / I_rG ≤ 2 — the fault is then treated as far-from-generator
 * and the AC component is taken as non-decaying (§8.1.5.2).
 *
 * @param {number} q      - Ratio I"kG / I_rG (generator contribution over rated current)
 * @param {number} tMinS  - Minimum time delay t_min in seconds (default 0.05 s)
 * @returns {number} μ in the range (0, 1]
 */
export function muFactor(q, tMinS = 0.05) {
  const ratio = Number(q);
  if (!Number.isFinite(ratio) || ratio <= 2) return 1;

  const t = Number.isFinite(Number(tMinS)) ? Number(tMinS) : 0.05;

  let mu;
  if (t <= MU_CURVES[0][0]) {
    mu = muFromCurve(MU_CURVES[0], ratio);
  } else if (t >= MU_CURVES[MU_CURVES.length - 1][0]) {
    mu = muFromCurve(MU_CURVES[MU_CURVES.length - 1], ratio);
  } else {
    // Linear interpolation between the two bracketing tabulated curves.
    let upper = 1;
    while (upper < MU_CURVES.length && MU_CURVES[upper][0] < t) upper += 1;
    const lowCurve = MU_CURVES[upper - 1];
    const highCurve = MU_CURVES[upper];
    const span = highCurve[0] - lowCurve[0];
    const weight = span > 0 ? (t - lowCurve[0]) / span : 0;
    const low = muFromCurve(lowCurve, ratio);
    const high = muFromCurve(highCurve, ratio);
    mu = low + weight * (high - low);
  }

  // μ is a decay factor: it can never amplify the initial symmetrical current.
  return Math.min(Math.max(mu, 0), 1);
}

/**
 * Resolves the symmetrical short-circuit breaking current I_b (IEC 60909-0 §8).
 *
 * Only the synchronous-machine contribution decays, so μ is applied to that
 * portion alone and the remainder (network / utility infeed) is carried through
 * undecayed:
 *
 *   I_b = μ × I"kG + (I"k − I"kG)
 *
 * When no generator contribution is supplied the fault is treated as
 * far-from-generator and I_b = I"k, which is the conservative result for
 * breaker breaking duty.
 *
 * @param {object} params
 * @param {number} params.ikTotalKA               - Initial symmetrical current I"k at the bus (kA)
 * @param {number|null} params.generatorContributionKA - Synchronous-machine share of I"k (kA)
 * @param {number|null} params.generatorRatedCurrentKA - Summed generator rated current I_rG (kA)
 * @param {number} params.minTimeDelayS           - Minimum time delay t_min (s)
 * @returns {{Ib: number, mu: number, nearToGenerator: boolean, ratio: number|null}}
 */
export function breakingCurrent({
  ikTotalKA,
  generatorContributionKA = null,
  generatorRatedCurrentKA = null,
  minTimeDelayS = 0.05
} = {}) {
  const ik = Number(ikTotalKA);
  const safeIk = Number.isFinite(ik) && ik > 0 ? ik : 0;
  const iGen = Number(generatorContributionKA);
  const iRated = Number(generatorRatedCurrentKA);

  const hasGeneratorData = Number.isFinite(iGen) && iGen > 0
    && Number.isFinite(iRated) && iRated > 0;

  if (!hasGeneratorData) {
    return { Ib: safeIk, mu: 1, nearToGenerator: false, ratio: null };
  }

  // The generator share cannot exceed the total current at the bus.
  const genShare = Math.min(iGen, safeIk);
  const ratio = genShare / iRated;
  const mu = muFactor(ratio, minTimeDelayS);
  const Ib = mu * genShare + (safeIk - genShare);

  return {
    Ib,
    mu,
    nearToGenerator: mu < 1,
    ratio
  };
}

// ---------------------------------------------------------------------------
// IEC 60909-0:2016 — X/R ratio at fault point
// ---------------------------------------------------------------------------

/**
 * Derives the effective X/R ratio from a complex impedance object.
 *
 * @param {{r: number, x: number}} z - Fault impedance
 * @returns {number} X/R ratio (≥ 0.01)
 */
function xrFromImpedance(z) {
  const r = Math.abs(z.r || 0);
  const x = Math.abs(z.x || 0);
  if (r < 1e-12) return 100; // practically infinite X/R
  return Math.max(x / r, 0.01);
}

// ---------------------------------------------------------------------------
// Main IEC 60909-0:2016 engine
// ---------------------------------------------------------------------------

/**
 * Runs the IEC 60909-0:2016 short-circuit calculation for a set of buses.
 *
 * Inputs are pre-computed impedances and voltages from shortCircuit.mjs
 * (which handles impedance cascade, transformer models, and protection limits).
 * This function applies IEC-specific voltage factors, formulas, and computes
 * the additional quantities ip, Ib, and Ith.
 *
 * @param {object} params
 * @param {{r:number,x:number}} params.z1          - Positive-sequence impedance (pu or Ω on system base)
 * @param {{r:number,x:number}} params.z2          - Negative-sequence impedance
 * @param {{r:number,x:number}} params.z0          - Zero-sequence impedance
 * @param {number}              params.prefaultKV   - Nominal line-to-line voltage (kV)
 * @param {'max'|'min'}         params.cMode        - Voltage factor mode
 * @param {number}              params.lvTolerancePct - LV voltage tolerance %
 * @param {number}              params.faultDurationS - Fault duration Tk (s), for Ith
 * @param {number}              params.freqHz        - System frequency (Hz)
 * @param {number|null}         params.xrOverride    - Override X/R (from comp.xr_ratio)
 * @returns {object} IEC 60909 result fields
 */
export function computeIEC60909Bus(params) {
  const {
    z1,
    z2,
    z0,
    prefaultKV,
    cMode = 'max',
    lvTolerancePct = 10,
    faultDurationS = 1.0,
    freqHz = 50,
    xrOverride = null,
    generatorContributionKA = null,
    generatorRatedCurrentKA = null,
    minTimeDelayS = 0.05
  } = params;

  const c = cFactor(prefaultKV, cMode, lvTolerancePct);
  // Phase voltage with IEC c-factor: V = c × Un / √3
  const V = (prefaultKV * c) / Math.sqrt(3); // kV

  // Determine X/R at fault point from positive-sequence impedance
  const xr = (xrOverride !== null && xrOverride > 0)
    ? xrOverride
    : xrFromImpedance(z1);

  // --- Four fault type initial short-circuit currents ---

  // IEC 60909-0 §4.2 (Eq. 29): Three-phase
  const Ik3 = V / mag(z1);

  // IEC 60909-0 §4.4 (Eq. 38): Line-to-line (Z1 = Z2 assumed)
  const Ik2 = Ik3 * (Math.sqrt(3) / 2); // = c×Un / (2×|Z1|) = (√3/2) × I"k3

  // IEC 60909-0 §4.3 (Eq. 35): Line-to-ground
  // I"k1 = √3 × c × Un / |2Z1 + Z0|  (with Z2 = Z1)
  const z1z2z0 = add(add(z1, z2), z0);
  const Ik1 = (3 * V) / mag(z1z2z0);

  // IEC 60909-0 §4.5: Two-phase-to-earth (double-line-to-ground)
  // Using symmetrical components: Ia1 = V / (Z1 + Z2||Z0)
  // Reported value = 3×|Ia1| — the reference fault current for the 2LG sequence network
  const Z2Z0 = parallel(z2, z0);
  const Ik2E = (3 * V) / mag(add(z1, Z2Z0));

  // --- Peak factor and peak current (IEC 60909-0 §4.3.1.1) ---
  const kappa = kappaIEC(xr);
  const ip = kappa * Math.sqrt(2) * Ik3; // kA

  // --- Breaking current (IEC 60909-0 §8) ---
  // μ decays the synchronous-machine share of I"k3 when the fault is
  // near-to-generator; with no generator data μ = 1 and Ib = I"k3.
  const breaking = breakingCurrent({
    ikTotalKA: Ik3,
    generatorContributionKA,
    generatorRatedCurrentKA,
    minTimeDelayS
  });
  const Ib = breaking.Ib;

  // --- Thermal equivalent current (IEC 60909-0 §4.8.1) ---
  // Ith = I"k3 × √(m + n)
  // m = DC component factor from IEC Fig. 22
  // n accounts for AC decay. It is 1.0 for a far-from-generator fault; for a
  // near-to-generator fault the AC component decays, which IEC represents with
  // n < 1. Using n = 1 there would overstate Ith, so scale it by the same decay
  // ratio μ that sets Ib (n ≈ (Ib/I"k)²).
  const m = thermalMFactor(kappa, faultDurationS, freqHz);
  const decayRatio = Ik3 > 0 ? Math.min(Ib / Ik3, 1) : 1;
  const n = decayRatio * decayRatio;
  const Ith = Ik3 * Math.sqrt(m + n);

  return {
    cFactor: c,
    kappa: Number(kappa.toFixed(4)),
    mu: Number(breaking.mu.toFixed(4)),
    nearToGenerator: breaking.nearToGenerator,
    generatorRatioIkgIrg: breaking.ratio === null ? null : Number(breaking.ratio.toFixed(3)),
    // IEC standard notation
    threePhaseKA: Number(Ik3.toFixed(2)),
    lineToLineKA: Number(Ik2.toFixed(2)),
    lineToGroundKA: Number(Ik1.toFixed(2)),
    doubleLineGroundKA: Number(Ik2E.toFixed(2)),
    ip: Number(ip.toFixed(2)),
    Ib: Number(Ib.toFixed(2)),
    Ith: Number(Ith.toFixed(2)),
    // asymKA kept as alias for ip to remain compatible with arc flash / TCC consumers
    asymKA: Number(ip.toFixed(2))
  };
}

/**
 * Batch IEC 60909-0:2016 study runner.
 *
 * Called by runShortCircuit() when method === 'IEC'. Accepts the already-resolved
 * per-bus impedance and voltage data computed by the main engine, applies
 * IEC-specific corrections, and returns enriched result entries.
 *
 * @param {Array<{id, z1, z2, z0, prefaultKV, xr_ratio}>} busData - Pre-computed bus data
 * @param {object} opts
 * @param {'max'|'min'} opts.cMode          - Voltage factor mode (default 'max')
 * @param {number}      opts.lvTolerancePct - LV voltage tolerance % (default 10)
 * @param {number}      opts.faultDurationS - Fault duration for Ith (default 1.0 s)
 * @param {number}      opts.freqHz         - System frequency Hz (default 50)
 * @returns {Object.<string, object>} result map keyed by bus id
 */
export function runIEC60909Batch(busData, opts = {}) {
  const cMode = opts.cMode || 'max';
  const lvTolerancePct = opts.lvTolerancePct ?? 10;
  const faultDurationS = opts.faultDurationS ?? 1.0;
  const freqHz = opts.freqHz ?? 50;
  const minTimeDelayS = opts.minTimeDelayS ?? 0.05;

  const results = {};
  for (const bus of busData) {
    const iecResult = computeIEC60909Bus({
      z1: bus.z1,
      z2: bus.z2,
      z0: bus.z0,
      prefaultKV: bus.prefaultKV,
      cMode,
      lvTolerancePct,
      faultDurationS,
      freqHz,
      xrOverride: (typeof bus.xr_ratio === 'number' && bus.xr_ratio > 0) ? bus.xr_ratio : null,
      generatorContributionKA: bus.generatorContributionKA ?? null,
      generatorRatedCurrentKA: bus.generatorRatedCurrentKA ?? null,
      minTimeDelayS: bus.minTimeDelayS ?? minTimeDelayS
    });
    results[bus.id] = {
      method: 'IEC',
      prefaultKV: Number((bus.prefaultKV || 1).toFixed(3)),
      ...iecResult
    };
  }
  return results;
}
