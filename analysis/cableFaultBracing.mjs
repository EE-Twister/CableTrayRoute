/**
 * Cable Fault Bracing Calculator
 * Electromagnetic force on cables during short-circuit fault conditions.
 *
 * During a fault, the peak current flowing through conductors generates
 * repulsive electromagnetic forces between cables.  Securing devices
 * (cable cleats, clips, or ties) must resist this force over their
 * tributary span.
 *
 * Methodology:
 *
 *   1. Peak (asymmetrical) fault current — IEC 60909-0:2016 §4.3.1.1:
 *
 *        κ = 1.02 + 0.98 × e^(−3R/X)
 *        i_peak = κ × √2 × I_sc
 *
 *      where I_sc is the symmetrical RMS short-circuit current and R/X
 *      is the resistance-to-reactance ratio at the fault point.
 *
 *   2. Electromagnetic force per unit length between parallel conductors
 *      — from Biot–Savart / Ampère's force law:
 *
 *        Single-phase (2 conductors):
 *          F = (μ₀/2π) × i_peak² / d  =  2×10⁻⁷ × i_peak² / d   [N/m]
 *
 *        Three-phase balanced fault (trefoil or flat arrangement):
 *          F = √3×10⁻⁷ × i_peak² / d   [N/m]
 *
 *      where d is the centre-to-centre spacing (m).  For the flat
 *      three-phase case, this is the analytically derived maximum force
 *      on the centre conductor; trefoil yields the same peak magnitude.
 *
 *   3. Cleat tensile load over its tributary span L:
 *
 *        T = F × L   [N]
 *
 *   4. Required rated cleat strength (IEC 61914:2015 default SF = 2.5):
 *
 *        T_req = T × safety_factor   [N]
 *
 * References:
 *   IEC 60909-0:2016 — Short-circuit currents in three-phase AC systems
 *   IEC 61914:2015   — Cable cleats for electrical installations
 *   Biot–Savart / Ampère's force law (classical electromagnetism)
 */

/** μ₀ / (2π)  =  2×10⁻⁷  T·m/A  (magnetic permeability constant) */
const MU0_OVER_2PI = 2e-7;

/**
 * IEC 60909-0 §4.3.1.1 peak factor κ.
 *
 * κ accounts for the DC offset in the asymmetrical fault current.
 * Range: 1.02 (purely resistive, no DC offset) → ~2.0 (purely inductive).
 *
 * @param {number} xrRatio  – X/R ratio at the fault point (≥ 0)
 * @returns {number} κ (dimensionless, ≥ 1.02)
 */
export function calcPeakFactor(xrRatio) {
  if (!Number.isFinite(xrRatio) || xrRatio < 0) {
    throw new Error('X/R ratio must be a non-negative number');
  }
  if (xrRatio === 0) return 1.02;
  return 1.02 + 0.98 * Math.exp(-3 / xrRatio);
}

/**
 * Peak (asymmetrical) fault current.
 *
 * @param {number} iScRms_A    – Symmetrical RMS fault current (A)
 * @param {number} peakFactor  – κ from {@link calcPeakFactor}
 * @returns {number} i_peak (A)
 */
export function calcPeakCurrent(iScRms_A, peakFactor) {
  if (!Number.isFinite(iScRms_A) || iScRms_A <= 0) {
    throw new Error('Fault current must be a positive number');
  }
  if (!Number.isFinite(peakFactor) || peakFactor < 1.02) {
    throw new Error('Peak factor κ must be ≥ 1.02');
  }
  return Math.SQRT2 * peakFactor * iScRms_A;
}

/**
 * Maximum electromagnetic force per unit length on the worst-case conductor.
 *
 * For single-phase (two conductors):
 *   F = 2×10⁻⁷ × i_peak² / d
 *
 * For three-phase balanced fault (flat or trefoil):
 *   F = √3×10⁻⁷ × i_peak² / d
 *
 * These represent the instantaneous peak force over the fault cycle.
 *
 * @param {number} iPeak_A          – Peak fault current (A)
 * @param {number} spacing_m        – Centre-to-centre cable spacing (m, > 0)
 * @param {'three-phase'|'single-phase'} systemType
 * @returns {number} Force per unit length (N/m)
 */
export function calcEmfForcePerMeter(iPeak_A, spacing_m, systemType) {
  if (!Number.isFinite(iPeak_A) || iPeak_A <= 0) {
    throw new Error('Peak current must be positive');
  }
  if (!Number.isFinite(spacing_m) || spacing_m <= 0) {
    throw new Error('Cable spacing must be a positive number');
  }

  const coeff = systemType === 'single-phase'
    ? MU0_OVER_2PI           // 2×10⁻⁷
    : Math.SQRT3 * 1e-7;    // √3×10⁻⁷ ≈ 1.732×10⁻⁷

  return coeff * (iPeak_A ** 2) / spacing_m;
}

/** √3 — defined once to avoid repeated computation */
Math.SQRT3 = Math.sqrt(3);

/**
 * Tensile load on a cleat over its tributary span.
 *
 * Each cleat is responsible for the force accumulated over the distance
 * to its adjacent cleats.  For uniformly spaced cleats the tributary
 * length equals the cleat spacing.
 *
 * @param {number} forcePerMeter_Nm  – Electromagnetic force per unit length (N/m)
 * @param {number} cleatSpacing_m    – Centre-to-centre cleat spacing (m, > 0)
 * @returns {number} Cleat tensile load (N)
 */
export function calcCleatLoad(forcePerMeter_Nm, cleatSpacing_m) {
  if (!Number.isFinite(forcePerMeter_Nm) || forcePerMeter_Nm < 0) {
    throw new Error('Force per meter must be non-negative');
  }
  if (!Number.isFinite(cleatSpacing_m) || cleatSpacing_m <= 0) {
    throw new Error('Cleat spacing must be a positive number');
  }
  return forcePerMeter_Nm * cleatSpacing_m;
}

/**
 * Convert N/m to lbf/ft.
 * @param {number} n_per_m
 * @returns {number}
 */
export function nmToLbfFt(n_per_m) {
  return n_per_m * 0.0685218;
}

/**
 * Full cable fault bracing calculation.
 *
 * @param {object} params
 * @param {number} params.faultCurrent_kA    – Symmetrical RMS fault current (kA)
 * @param {number} params.xrRatio            – X/R ratio at the fault point
 * @param {'three-phase'|'single-phase'} params.systemType
 * @param {'trefoil'|'flat'} [params.arrangement='trefoil']
 *   Cable arrangement in the raceway (informational; both use √3×10⁻⁷ coefficient).
 * @param {number} params.spacing_mm         – Centre-to-centre cable spacing (mm)
 * @param {number} params.cleatSpacing_mm    – Centre-to-centre cleat spacing (mm)
 * @param {number} [params.safetyFactor=2.5] – IEC 61914 design safety factor
 *
 * @returns {{
 *   peakFactor:             number,   // κ (dimensionless)
 *   iPeak_kA:               number,   // Peak fault current (kA)
 *   forcePerMeter_Nm:       number,   // Electromagnetic force (N/m)
 *   forcePerMeter_lbfFt:    number,   // Electromagnetic force (lbf/ft)
 *   cleatLoad_N:            number,   // Tensile load per cleat (N)
 *   cleatLoad_kN:           number,   // Tensile load per cleat (kN)
 *   requiredStrength_N:     number,   // Required rated cleat strength with SF (N)
 *   requiredStrength_kN:    number,   // Required rated cleat strength with SF (kN)
 *   safetyFactor:           number,
 *   recommendation:         string,
 * }}
 */
export function calcCableFaultBracing(params) {
  const {
    faultCurrent_kA,
    xrRatio,
    systemType,
    spacing_mm,
    cleatSpacing_mm,
  } = params;
  const arrangement  = params.arrangement  ?? 'trefoil';
  const safetyFactor = params.safetyFactor ?? 2.5;

  if (!Number.isFinite(faultCurrent_kA) || faultCurrent_kA <= 0) {
    throw new Error('Fault current must be a positive number');
  }
  if (!Number.isFinite(xrRatio) || xrRatio < 0) {
    throw new Error('X/R ratio must be non-negative');
  }
  if (systemType !== 'three-phase' && systemType !== 'single-phase') {
    throw new Error('systemType must be "three-phase" or "single-phase"');
  }
  if (!Number.isFinite(spacing_mm) || spacing_mm <= 0) {
    throw new Error('Cable spacing must be a positive number');
  }
  if (!Number.isFinite(cleatSpacing_mm) || cleatSpacing_mm <= 0) {
    throw new Error('Cleat spacing must be a positive number');
  }
  if (!Number.isFinite(safetyFactor) || safetyFactor < 1) {
    throw new Error('Safety factor must be ≥ 1');
  }

  const iSc_A     = faultCurrent_kA * 1000;
  const spacing_m = spacing_mm / 1000;
  const cleat_m   = cleatSpacing_mm / 1000;

  const kappa         = calcPeakFactor(xrRatio);
  const iPeak_A       = calcPeakCurrent(iSc_A, kappa);
  const fPerM         = calcEmfForcePerMeter(iPeak_A, spacing_m, systemType);
  const cleatLoad_N   = calcCleatLoad(fPerM, cleat_m);
  const reqStrength_N = cleatLoad_N * safetyFactor;

  const iPeak_kA          = Math.round(iPeak_A / 10) / 100;   // 2 d.p. kA
  const forcePerMeter_Nm  = Math.round(fPerM * 10) / 10;
  const forcePerMeter_lbfFt = Math.round(nmToLbfFt(fPerM) * 10) / 10;
  const cleatLoad_kN      = Math.round(cleatLoad_N / 10) / 100;
  const reqStrength_kN    = Math.round(reqStrength_N / 10) / 100;

  const arrangementLabel = systemType === 'single-phase'
    ? 'single-phase (2-conductor)'
    : `three-phase ${arrangement}`;

  const rec =
    `${arrangementLabel.charAt(0).toUpperCase() + arrangementLabel.slice(1)} fault at ` +
    `${faultCurrent_kA.toFixed(1)} kA (RMS), X/R = ${xrRatio.toFixed(1)}: ` +
    `κ = ${kappa.toFixed(3)}, i_peak = ${iPeak_kA.toFixed(2)} kA. ` +
    `Force = ${forcePerMeter_Nm.toFixed(1)} N/m at ${spacing_mm} mm spacing. ` +
    `Cleat load = ${cleatLoad_kN.toFixed(2)} kN over ${cleatSpacing_mm} mm span. ` +
    `Required rated cleat strength ≥ ${reqStrength_kN.toFixed(2)} kN ` +
    `(SF = ${safetyFactor} per IEC 61914).`;

  return {
    peakFactor:             Math.round(kappa * 1e4) / 1e4,
    iPeak_kA:               Math.round(iPeak_A / 1000 * 1e3) / 1e3,
    forcePerMeter_Nm,
    forcePerMeter_lbfFt,
    cleatLoad_N:            Math.round(cleatLoad_N * 10) / 10,
    cleatLoad_kN,
    requiredStrength_N:     Math.round(reqStrength_N * 10) / 10,
    requiredStrength_kN:    reqStrength_kN,
    safetyFactor,
    recommendation:         rec,
  };
}
