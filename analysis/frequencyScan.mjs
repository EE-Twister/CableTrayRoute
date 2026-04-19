/**
 * Harmonic Frequency Scan — Driving-Point Impedance vs. Harmonic Order
 *
 * Sweeps the Thevenin driving-point impedance Z(h) at a bus from the 1st
 * to the 50th harmonic order, identifying parallel and series resonances.
 *
 * Single-bus network model:
 *   Z_dp(h) = Z_source(h) || ΣZ_cap(h) || ΣZ_filter(h)
 *
 * Z_source includes all cables in series between the supply and the bus.
 * Capacitor banks and detuned filters are modelled as shunt elements at the bus.
 *
 * References:
 *   IEEE 519-2022 — Harmonic Control in Electric Power Systems
 *   IEEE 18-2012  — IEEE Standard for Shunt Power Capacitors
 *   IEC 61000-3-6 — Harmonic Emission Assessment in HV/MV/LV power systems
 */

/** Dominant harmonic orders produced by 6-pulse and 12-pulse non-linear loads (IEEE 519-2022). */
export const DOMINANT_HARMONICS = [5, 7, 11, 13, 17, 19, 23, 25];

/** Step size for the harmonic sweep (0.5 = half harmonic steps). */
export const SCAN_STEP = 0.5;

/** Maximum harmonic order for the default scan range. */
export const SCAN_MAX_DEFAULT = 50;

function round(v, d = 4) {
  const p = 10 ** d;
  return Math.round(v * p) / p;
}

/**
 * Compute the Thevenin source impedance at harmonic h.
 *
 * At fundamental: Z_base = V_kv² / S_sc_mva  (ohms)
 * R_s = Z_base / √(1 + XR²),  X_s1 = XR × R_s
 * At harmonic h: Z_s(h) = R_s + j × h × X_s1
 *
 * @param {number} h  Harmonic order (1 = fundamental)
 * @param {object} p  { systemKv, scMva, xrRatio }
 * @returns {{ r: number, x: number }}  Complex impedance in ohms
 */
export function computeSourceImpedance(h, { systemKv, scMva, xrRatio }) {
  const zMag = (systemKv * systemKv) / scMva;
  const den = Math.sqrt(1 + xrRatio * xrRatio);
  const rs = zMag / den;
  const xs1 = xrRatio * rs;
  return { r: rs, x: h * xs1 };
}

/**
 * Compute cable series impedance at harmonic h.
 *
 * R is approximately frequency-independent at power-frequency harmonics.
 * X scales linearly with harmonic order.
 *
 * @param {number} h  Harmonic order
 * @param {object} p  { rOhmPerKft, xOhmPerKft, lengthKft }
 * @returns {{ r: number, x: number }}
 */
export function computeCableImpedance(h, { rOhmPerKft, xOhmPerKft, lengthKft }) {
  return {
    r: rOhmPerKft * lengthKft,
    x: h * xOhmPerKft * lengthKft,
  };
}

/**
 * Compute shunt capacitor bank impedance at harmonic h.
 *
 * At fundamental: X_c1 = V_kv² × 1000 / kVAR  (ohms)
 * At harmonic h: Z_cap(h) = −j × X_c1 / h
 *
 * @param {number} h  Harmonic order
 * @param {object} p  { kvar, systemKv }
 * @returns {{ r: number, x: number }}
 */
export function computeCapacitorImpedance(h, { kvar, systemKv }) {
  const xc1 = (systemKv * systemKv * 1000) / kvar;
  return { r: 0, x: -xc1 / h };
}

/**
 * Compute detuned series L-C filter impedance at harmonic h.
 *
 * The filter capacitor is the same kVAR as a standalone bank. The reactor
 * introduces a tuning order h_tune = √(100 / reactorPct) below the
 * nearest dominant harmonic, shifting the resonance away from integer orders.
 *
 * X_C = V_kv² × 1000 / kVAR  (capacitor reactance at fundamental)
 * X_L1 = (reactorPct / 100) × X_C  (reactor reactance at fundamental)
 * At harmonic h: Z_filter(h) = j × (h × X_L1 − X_C / h)
 *
 * @param {number} h  Harmonic order
 * @param {object} p  { reactorPct, kvar, systemKv }
 * @returns {{ r: number, x: number }}
 */
export function computeFilterImpedance(h, { reactorPct, kvar, systemKv }) {
  const xc = (systemKv * systemKv * 1000) / kvar;
  const xl1 = (reactorPct / 100) * xc;
  return { r: 0, x: h * xl1 - xc / h };
}

/**
 * Combine a list of complex impedances in parallel.
 *
 * Sums their admittances: Y_total = Σ(1/Z_i),  then Z_dp = 1/Y_total.
 *
 * @param {Array<{r: number, x: number}>} zList
 * @returns {{ r: number, x: number }}
 */
export function parallelImpedances(zList) {
  let G = 0, B = 0;
  for (const z of zList) {
    const mag2 = z.r * z.r + z.x * z.x;
    if (mag2 < 1e-20) return { r: 0, x: 0 };
    G += z.r / mag2;
    B += (-z.x) / mag2;
  }
  const yMag2 = G * G + B * B;
  if (yMag2 < 1e-20) return { r: 1e12, x: 0 };
  return { r: G / yMag2, x: -B / yMag2 };
}

/**
 * Run a complete harmonic frequency scan.
 *
 * @param {object} inputs
 * @param {number} inputs.baseFreqHz      Base frequency (50 or 60 Hz)
 * @param {number} inputs.systemKv        System nominal voltage kV (L-L)
 * @param {number} inputs.scMva           Short-circuit MVA at the bus (> 0)
 * @param {number} [inputs.xrRatio=10]    Source X/R ratio (> 0)
 * @param {Array}  [inputs.capacitorBanks] [{kvar, label}]
 * @param {Array}  [inputs.cables]         [{rOhmPerKft, xOhmPerKft, lengthKft, label}]
 * @param {Array}  [inputs.filters]        [{reactorPct, kvar, label}]
 * @param {object} [inputs.harmonicRange]  {min, max} harmonic orders (default 1–50)
 * @returns {{ inputs, points, resonances, warnings }}
 */
export function runFrequencyScan(inputs) {
  validateInputs(inputs);

  const {
    baseFreqHz = 60,
    systemKv,
    scMva,
    xrRatio = 10,
    capacitorBanks = [],
    cables = [],
    filters = [],
    harmonicRange = { min: 1, max: SCAN_MAX_DEFAULT },
  } = inputs;

  const hMin = Math.max(1, harmonicRange.min ?? 1);
  const hMax = Math.min(SCAN_MAX_DEFAULT, harmonicRange.max ?? SCAN_MAX_DEFAULT);

  const points = [];

  for (let raw = hMin * 2; raw <= hMax * 2 + 1e-9; raw++) {
    const h = raw / 2;

    // Total series impedance: source + cables
    const zSrc = computeSourceImpedance(h, { systemKv, scMva, xrRatio });
    let rSeries = zSrc.r;
    let xSeries = zSrc.x;
    for (const c of cables) {
      const zc = computeCableImpedance(h, c);
      rSeries += zc.r;
      xSeries += zc.x;
    }
    const zSeries = { r: rSeries, x: xSeries };

    // Shunt elements: cap banks and filters
    const shunts = [
      ...capacitorBanks.map(cb => computeCapacitorImpedance(h, { kvar: cb.kvar, systemKv })),
      ...filters.map(f => computeFilterImpedance(h, { reactorPct: f.reactorPct, kvar: f.kvar, systemKv })),
    ];

    const zDp = shunts.length === 0
      ? zSeries
      : parallelImpedances([zSeries, ...shunts]);

    const zMag = Math.sqrt(zDp.r * zDp.r + zDp.x * zDp.x);

    points.push({
      h: round(h, 2),
      freqHz: round(h * baseFreqHz, 1),
      zMagOhm: round(zMag, 4),
      zPhaseDeg: round(Math.atan2(zDp.x, zDp.r) * 180 / Math.PI, 2),
      zRealOhm: round(zDp.r, 4),
      zImagOhm: round(zDp.x, 4),
    });
  }

  const resonances = identifyResonances(points);
  const warnings = buildWarnings(inputs);

  return { inputs, points, resonances, warnings };
}

/**
 * Identify parallel (peak) and series (trough) resonances from a scan result.
 *
 * Uses local extrema detection on the impedance magnitude curve.
 *
 * @param {Array<{h, zMagOhm}>} points
 * @returns {Array<{h, freqHz, zMagOhm, type, risk, description}>}
 */
export function identifyResonances(points) {
  const resonances = [];
  if (points.length < 3) return resonances;

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1].zMagOhm;
    const curr = points[i].zMagOhm;
    const next = points[i + 1].zMagOhm;

    const isPeak = curr > prev && curr > next;
    const isTrough = curr < prev && curr < next && curr < 1e10;

    if (!isPeak && !isTrough) continue;

    const { h, freqHz, zMagOhm } = points[i];
    const risk = isPeak ? classifyParallelResonanceRisk(h) : 'info';

    resonances.push({
      h,
      freqHz,
      zMagOhm,
      type: isPeak ? 'parallel' : 'series',
      risk,
      description: isPeak
        ? `Parallel resonance at h = ${h} — voltage amplification risk`
        : `Series resonance at h = ${h} — current amplification risk`,
    });
  }

  return resonances;
}

function classifyParallelResonanceRisk(h) {
  const dist = Math.min(...DOMINANT_HARMONICS.map(dh => Math.abs(dh - h)));
  if (dist <= 0.5) return 'danger';
  if (dist <= 1.0) return 'caution';
  return 'low';
}

function buildWarnings({ capacitorBanks = [], filters = [], scMva, xrRatio = 10 }) {
  const warnings = [];

  if (capacitorBanks.length === 0 && filters.length === 0) {
    warnings.push(
      'No capacitor banks or filters defined. The scan shows source impedance only — no resonance is possible without shunt capacitance.'
    );
  }

  if (scMva < 1) {
    warnings.push('Short-circuit MVA is very low (< 1 MVA). Impedance values will be large; verify source data.');
  }

  if (xrRatio > 50) {
    warnings.push('X/R ratio > 50 is unusually high. Verify source data.');
  }

  return warnings;
}

function validateInputs(inputs) {
  if (!inputs || typeof inputs !== 'object') {
    throw new Error('inputs must be an object');
  }
  if (!Number.isFinite(inputs.systemKv) || inputs.systemKv <= 0) {
    throw new Error('systemKv must be a positive number (kV L-L)');
  }
  if (!Number.isFinite(inputs.scMva) || inputs.scMva <= 0) {
    throw new Error('scMva must be greater than zero');
  }
  if (inputs.xrRatio != null && (!Number.isFinite(inputs.xrRatio) || inputs.xrRatio <= 0)) {
    throw new Error('xrRatio must be a positive number');
  }
  for (const cb of (inputs.capacitorBanks ?? [])) {
    if (!Number.isFinite(cb.kvar) || cb.kvar <= 0) {
      throw new Error(`Capacitor bank kVAR must be greater than zero (got ${cb.kvar})`);
    }
  }
  for (const f of (inputs.filters ?? [])) {
    if (!Number.isFinite(f.reactorPct) || f.reactorPct <= 0 || f.reactorPct >= 100) {
      throw new Error(`Filter reactorPct must be between 0 and 100 (got ${f.reactorPct})`);
    }
    if (!Number.isFinite(f.kvar) || f.kvar <= 0) {
      throw new Error(`Filter kVAR must be greater than zero (got ${f.kvar})`);
    }
  }
  for (const c of (inputs.cables ?? [])) {
    if (!Number.isFinite(c.rOhmPerKft) || c.rOhmPerKft < 0) {
      throw new Error('Cable rOhmPerKft must be >= 0');
    }
    if (!Number.isFinite(c.xOhmPerKft) || c.xOhmPerKft < 0) {
      throw new Error('Cable xOhmPerKft must be >= 0');
    }
    if (!Number.isFinite(c.lengthKft) || c.lengthKft <= 0) {
      throw new Error('Cable lengthKft must be greater than zero');
    }
  }
}
