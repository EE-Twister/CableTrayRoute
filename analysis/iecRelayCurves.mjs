/**
 * IEC 60255-151 Inverse-Time Overcurrent Relay Curve Engine
 *
 * Implements the four standard curve families defined in
 * IEC 60255-151:2009 (Measuring relays and protection equipment –
 * Part 151: Functional requirements for over/under-current protection).
 *
 * Formula:  t = TMS × k / [(I / Is)^α − 1]
 *
 * Where:
 *   TMS  = Time Multiplier Setting (user parameter, 0.05–1.5)
 *   Is   = Pickup current in amperes (relay setting)
 *   I    = Fault current in amperes
 *   t    = Operating time in seconds
 *   k, α = Curve family constants (see IEC_CURVE_FAMILIES below)
 *
 * The formula is only valid for I > Is.  At I = Is the formula diverges
 * (relay does not operate); at I >> Is the operating time approaches a
 * minimum hardware floor (MIN_OPERATE_TIME_S).
 *
 * Tolerance: ±5% on operating time per IEC 60255-151 Class E1.
 */

/** Minimum relay operating time floor (hardware minimum, seconds). */
export const MIN_OPERATE_TIME_S = 0.01;

/**
 * IEC 60255-151 curve family constants.
 * @type {Record<string, {name: string, k: number, alpha: number}>}
 */
export const IEC_CURVE_FAMILIES = {
  NI: { name: 'Normal Inverse',    k: 0.14,  alpha: 0.02 },
  VI: { name: 'Very Inverse',      k: 13.5,  alpha: 1.0  },
  EI: { name: 'Extremely Inverse', k: 80.0,  alpha: 2.0  },
  LTI:{ name: 'Long-Time Inverse', k: 120.0, alpha: 1.0  }
};

/**
 * Number of log-spaced sample points generated per curve.
 * 80 points gives smooth rendering on a log-log TCC chart.
 */
const POINT_COUNT = 80;

/**
 * Upper bound of the I/Is range sampled.
 * 20× pickup captures the full practical fault-current span.
 */
const MAX_MULTIPLE = 20;

/**
 * Lower bound of the I/Is range sampled (must be > 1 for formula validity).
 * 1.02× avoids the near-pickup asymptote while keeping the curve anchored
 * close to pickup.
 */
const MIN_MULTIPLE = 1.02;

/**
 * Compute the IEC 60255-151 operating time for a single current value.
 *
 * @param {number} k       Curve constant k
 * @param {number} alpha   Curve constant α
 * @param {number} tms     Time Multiplier Setting
 * @param {number} multiple  I / Is  (must be > 1)
 * @returns {number} Operating time in seconds (clamped to MIN_OPERATE_TIME_S)
 */
export function computeIecTime(k, alpha, tms, multiple) {
  if (!Number.isFinite(multiple) || multiple <= 1) return Infinity;
  const denominator = Math.pow(multiple, alpha) - 1;
  if (denominator <= 0) return Infinity;
  const t = tms * k / denominator;
  return Math.max(t, MIN_OPERATE_TIME_S);
}

/**
 * Generate an IEC 60255-151 curve as an array of {current, time} points
 * suitable for use in the TCC chart and coordination engine.
 *
 * Points are log-spaced from MIN_MULTIPLE×Is to MAX_MULTIPLE×Is (inclusive),
 * sorted ascending by current.  Any point whose computed time equals or
 * exceeds the prior point's time (non-monotonic due to clamping) is
 * preserved — the chart renderer handles log-log interpolation.
 *
 * @param {string} familyKey  One of 'NI' | 'VI' | 'EI' | 'LTI'
 * @param {number} tms        Time Multiplier Setting (0.05–1.5)
 * @param {number} pickupAmps Pickup current Is (amperes, > 0)
 * @returns {{current: number, time: number}[]}
 *   Empty array if inputs are invalid.
 */
export function computeIecCurvePoints(familyKey, tms, pickupAmps) {
  const family = IEC_CURVE_FAMILIES[familyKey];
  if (!family) return [];
  if (!Number.isFinite(tms) || tms <= 0) return [];
  if (!Number.isFinite(pickupAmps) || pickupAmps <= 0) return [];

  const { k, alpha } = family;
  const logMin = Math.log(MIN_MULTIPLE);
  const logMax = Math.log(MAX_MULTIPLE);
  const points = [];

  for (let i = 0; i < POINT_COUNT; i++) {
    const fraction = i / (POINT_COUNT - 1);
    const multiple = Math.exp(logMin + fraction * (logMax - logMin));
    const current = multiple * pickupAmps;
    const time = computeIecTime(k, alpha, tms, multiple);
    if (Number.isFinite(time)) {
      points.push({ current, time });
    }
  }

  return points;
}

/**
 * Return the display name for a curve family key.
 * Returns the key itself if unknown.
 *
 * @param {string} familyKey
 * @returns {string}
 */
export function iecFamilyDisplayName(familyKey) {
  return IEC_CURVE_FAMILIES[familyKey]?.name ?? familyKey;
}
