/**
 * TCC Auto-Coordination Algorithm
 *
 * Implements a greedy source-to-load selective coordination algorithm for
 * protective devices. Given an ordered chain of devices (downstream first),
 * checks each adjacent upstream-downstream pair for selective coordination
 * and suggests minimum time-dial settings to achieve it.
 *
 * Selective coordination: upstream device must not operate for any fault
 * that the downstream device will clear. This requires:
 *   upstream.minCurve(I) >= downstream.maxCurve(I) + margin
 * at every fault current I below the upstream instantaneous pickup.
 */

import { scaleCurve } from './tccUtils.js';
import { evaluateTimeCurrentCurve, normalizeTimeCurrentCurve } from './timeCurrentCurve.mjs';

const MIN_TIME = 1e-4;
const TIME_DIAL_MIN = 0.05;
const TIME_DIAL_MAX = 10.0;
const BINARY_SEARCH_ITERATIONS = 30;
const LOG_SPACE_POINTS = 50;
const DEFAULT_MARGIN = 0.3;

/**
 * Return the override key used to vary the time dial for a device.
 * IEC 60255-151 formula-based relays use 'tms'.
 * Long-time electronic trip models use 'longTimeDelay'.
 * Other devices use the legacy 'time' alias.
 *
 * @param {object} device - Raw device object from protectiveDevices.json
 * @returns {string} 'tms' | 'longTimeDelay' | 'time'
 */
function dialOverrideKey(device) {
  if (device?.iec60255 === true) return 'tms';
  const base = device?.settings ?? {};
  if (base.longTimePickup !== undefined || base.longTimeDelay !== undefined) return 'longTimeDelay';
  return 'time';
}

/**
 * Log-log linear interpolation of time from a curve at a given current.
 *
 * Below the curve's minimum current (the pickup), the device does not operate,
 * so no time is returned (null) rather than the first point's time. Above the
 * curve's maximum current, the last point's time is held; no slope is
 * extrapolated. This raw lookup suits comparing two curves point by point (for
 * example, library review spot checks). Coordination margins must use
 * evaluateOperatingTime(), which holds a time above the curve only for an
 * instantaneous plateau.
 *
 * @param {Array<{current: number, time: number}>} curve - Sorted ascending by current
 * @param {number} current - Current value to interpolate at [A]
 * @returns {number|null} Interpolated time [s], never below MIN_TIME, or null
 *   when the current is below the curve's minimum current (no trip). An empty
 *   curve or a non-positive current still returns MIN_TIME.
 */
export function interpolateTime(curve, current) {
  const evaluation = evaluateTimeCurrentCurve(curve, current, {
    boundary: 'lower',
    outOfRange: 'clamp',
  });
  if (evaluation.status === 'clamped-below-domain') return null;
  return Math.max(evaluation.time ?? MIN_TIME, MIN_TIME);
}

/**
 * Keep only the longest time at the curve's last current. scaleCurve() ends
 * instantaneous characteristics with a vertical drop at the instantaneous-max
 * current (to MIN_TIME on the nominal and minimum curves, to MIN_TIME × the
 * upper tolerance on the maximum curve). The drop leads nowhere: it marks the
 * end of the plotted curve and is not an operating time. Without this, a
 * 'lower' lookup at exactly that current would report about 0.0001 s instead
 * of the instantaneous clearing time.
 *
 * @param {Array<{current: number, time: number}>} curve
 * @returns {Array<{current: number, time: number}>}
 */
function withoutEndOfCurveMarker(curve) {
  const points = normalizeTimeCurrentCurve(curve);
  if (points.length < 2) return points;
  // normalizeTimeCurrentCurve sorts equal currents by descending time.
  const lastCurrent = points.at(-1).current;
  return points.slice(0, points.findIndex(point => point.current === lastCurrent) + 1);
}

function sameCurrent(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 1e-9;
}

/**
 * Evaluate a device's operating time at a fault current for coordination
 * reporting, without making up a time outside the curve's range.
 *
 * Status values:
 *   - 'operates': `time` is the exact or log-log interpolated time for the
 *     requested boundary within the curve's range. Above the range, it is the
 *     instantaneous time held as described below.
 *   - 'no-trip': the current is below the curve's minimum current (pickup).
 *     The device does not operate, and `time` is null.
 *   - 'above-domain': the current is above the curve's maximum current, and
 *     `time` is null. The exception is a curve that ends on an instantaneous
 *     plateau: the caller passes `instantaneousCeilingA` (the scaled device's
 *     settings.instantaneousMax), and the curve's last current equals it.
 *     scaleCurve() cuts the plateau at the instantaneous-max setting, the
 *     interrupting rating, or a 10× pickup plotting fallback. The
 *     instantaneous element still operates at every current above its pickup,
 *     so the plateau time is held ('operates', `heldInstantaneous: true`).
 *     Interrupting-rating duty is checked separately by checkDuty() in
 *     tccUtils.js. Any other curve that ends while still sloping (fuses, IEC
 *     inverse-time relays) gets no time: holding its last point would
 *     overstate an upstream device's delay, and the slope is not extrapolated.
 *   - 'no-curve': the curve has no usable points, or the current is invalid.
 *     `time` is null.
 *
 * @param {Array<{current: number, time: number}>} curve
 * @param {number} current - Fault current [A]
 * @param {{ boundary?: 'lower'|'upper', instantaneousCeilingA?: number|null }} [options]
 *   Use boundary 'lower' for an upstream minimum curve and 'upper' for a
 *   downstream maximum (clearing) curve, as checkCoordination() does.
 * @returns {{ time: number|null, status: 'operates'|'no-trip'|'above-domain'|'no-curve', domain: object, heldInstantaneous?: boolean }}
 */
export function evaluateOperatingTime(curve, current, { boundary = 'lower', instantaneousCeilingA = null } = {}) {
  const points = withoutEndOfCurveMarker(curve);
  const evaluation = evaluateTimeCurrentCurve(points, current, {
    boundary,
    outOfRange: 'reject',
  });
  const { domain } = evaluation;
  if (evaluation.status === 'below-domain') return { time: null, status: 'no-trip', domain };
  if (evaluation.status === 'above-domain') {
    if (sameCurrent(Number(instantaneousCeilingA), domain.maximumCurrent)) {
      const plateau = evaluateTimeCurrentCurve(points, domain.maximumCurrent, { boundary, outOfRange: 'reject' });
      if (Number.isFinite(plateau.time)) {
        return { time: Math.max(plateau.time, MIN_TIME), status: 'operates', domain, heldInstantaneous: true };
      }
    }
    return { time: null, status: 'above-domain', domain };
  }
  if (!Number.isFinite(evaluation.time)) return { time: null, status: 'no-curve', domain };
  return { time: Math.max(evaluation.time, MIN_TIME), status: 'operates', domain };
}

/**
 * Generate n logarithmically spaced values between start and end (inclusive).
 *
 * @param {number} start - Start value (> 0)
 * @param {number} end - End value (> start)
 * @param {number} [n=50] - Number of points (clamped to >= 2)
 * @returns {number[]}
 */
export function generateFaultCurrents(start, end, n = LOG_SPACE_POINTS) {
  const count = Math.max(2, Math.floor(n));
  const safeStart = Math.max(start, MIN_TIME);
  const safeEnd = Math.max(end, safeStart * 2);
  if (count === 2) return [safeStart, safeEnd];
  const logStart = Math.log(safeStart);
  const logEnd = Math.log(safeEnd);
  const result = [];
  for (let i = 0; i < count; i += 1) {
    result.push(Math.exp(logStart + (i / (count - 1)) * (logEnd - logStart)));
  }
  return result;
}

/**
 * Check whether an upstream device is selectively coordinated with a downstream device.
 *
 * Coordination requires:
 *   upstream.minCurve(I) >= downstream.maxCurve(I) + margin
 * at every test current.
 *
 * @param {object} upstreamScaled - Return value of scaleCurve() for the upstream device
 * @param {object} downstreamScaled - Return value of scaleCurve() for the downstream device
 * @param {number[]} testCurrents - Array of fault current levels to test [A]
 * @param {number} [margin=0.3] - Required time separation [s]
 * @returns {{ coordinated: boolean, violations: Array<{current, upstreamMinTime, downstreamMaxTime, gap}>, unevaluated: Array, comparisonCount: number }}
 */
export function checkCoordination(upstreamScaled, downstreamScaled, testCurrents, margin = DEFAULT_MARGIN) {
  const upMin = upstreamScaled?.minCurve ?? upstreamScaled?.curve ?? [];
  const downMax = downstreamScaled?.maxCurve ?? downstreamScaled?.curve ?? [];
  const safeMargin = Number.isFinite(margin) ? margin : DEFAULT_MARGIN;

  if (!Array.isArray(testCurrents) || !testCurrents.length) {
    return { coordinated: false, violations: [], unevaluated: [], comparisonCount: 0 };
  }

  const violations = [];
  const unevaluated = [];
  let comparisonCount = 0;
  for (const I of testCurrents) {
    if (!Number.isFinite(I) || I <= 0) continue;
    const upstreamEvaluation = evaluateTimeCurrentCurve(upMin, I, {
      boundary: 'lower',
      outOfRange: 'reject',
    });
    const downstreamEvaluation = evaluateTimeCurrentCurve(downMax, I, {
      boundary: 'upper',
      outOfRange: 'reject',
    });
    // Below the downstream pickup/curve domain, the downstream device does not
    // operate and there is no selective-coordination comparison to make.
    if (downstreamEvaluation.status === 'below-domain') continue;
    const upTime = upstreamEvaluation.time;
    const downTime = downstreamEvaluation.time;
    if (!Number.isFinite(upTime) || !Number.isFinite(downTime)) {
      unevaluated.push({
        current: I,
        upstreamStatus: upstreamEvaluation.status,
        downstreamStatus: downstreamEvaluation.status,
        upstreamDomain: upstreamEvaluation.domain,
        downstreamDomain: downstreamEvaluation.domain,
      });
      continue;
    }
    comparisonCount += 1;
    // Only check where the downstream device actually trips (above MIN_TIME floor)
    if (downTime <= MIN_TIME * 2) continue;
    if (upTime < downTime + safeMargin) {
      violations.push({
        current: I,
        upstreamMinTime: upTime,
        downstreamMaxTime: downTime,
        gap: upTime - downTime
      });
    }
  }
  return {
    coordinated: comparisonCount > 0 && violations.length === 0 && unevaluated.length === 0,
    violations,
    unevaluated,
    comparisonCount,
  };
}

/**
 * Find the minimum time-dial multiplier for a device that achieves coordination
 * with a given downstream device, using binary search.
 *
 * @param {object} device - Raw device object (input to scaleCurve)
 * @param {object} currentOverrides - Current override settings (pickup, instantaneous, etc.)
 * @param {object} downstreamScaled - Already-scaled downstream device
 * @param {number[]} testCurrents - Current levels to test [A]
 * @param {number} [margin=0.3] - Required time margin [s]
 * @returns {{ found: boolean, timeDial: number, scaledResult: object, violations: Array }}
 *   found=false + timeDial=TIME_DIAL_MAX if coordination is not achievable in range
 */
export function findCoordinatingTimeDial(device, currentOverrides, downstreamScaled, testCurrents, margin = DEFAULT_MARGIN) {
  const overrides = currentOverrides && typeof currentOverrides === 'object' ? currentOverrides : {};
  const dialKey = dialOverrideKey(device);

  // Quick check: does the maximum dial coordinate?
  const scaledHi = scaleCurve(device, { ...overrides, [dialKey]: TIME_DIAL_MAX });
  const checkHi = checkCoordination(scaledHi, downstreamScaled, testCurrents, margin);
  if (!checkHi.coordinated) {
    return {
      found: false,
      timeDial: TIME_DIAL_MAX,
      scaledResult: scaledHi,
      violations: checkHi.violations,
      unevaluated: checkHi.unevaluated,
    };
  }

  // Quick check: is the minimum dial already coordinated?
  const scaledLo = scaleCurve(device, { ...overrides, [dialKey]: TIME_DIAL_MIN });
  const checkLo = checkCoordination(scaledLo, downstreamScaled, testCurrents, margin);
  if (checkLo.coordinated) {
    return { found: true, timeDial: TIME_DIAL_MIN, scaledResult: scaledLo, violations: [] };
  }

  // Binary search: find smallest time dial where coordination holds
  let lo = TIME_DIAL_MIN;
  let hi = TIME_DIAL_MAX;
  let bestDial = TIME_DIAL_MAX;
  let bestScaled = scaledHi;

  for (let iter = 0; iter < BINARY_SEARCH_ITERATIONS; iter += 1) {
    const mid = (lo + hi) / 2;
    const scaled = scaleCurve(device, { ...overrides, [dialKey]: mid });
    if (checkCoordination(scaled, downstreamScaled, testCurrents, margin).coordinated) {
      bestDial = mid;
      bestScaled = scaled;
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return { found: true, timeDial: bestDial, scaledResult: bestScaled, violations: [] };
}

/**
 * Greedy source-to-load coordination pass.
 *
 * Iterates over devices from most-downstream to most-upstream. For each
 * upstream device, finds the minimum time-dial that achieves coordination
 * with the device immediately downstream of it.
 *
 * @param {Array<{id: string, device: object, overrides: object}>} deviceEntries
 *   Ordered **load → source** (index 0 = most downstream).
 * @param {number} faultCurrentA - Maximum fault current [A]
 * @param {object} [options={}]
 * @param {number} [options.margin=0.3] - Required time separation [s]
 * @param {number} [options.sampleCount=50] - Number of log-spaced test points
 * @returns {{ results: Array<{id, found, timeDial, scaledResult, violations}>, allCoordinated: boolean }}
 *   results[0] corresponds to deviceEntries[0] (fixed reference), subsequent entries are suggestions.
 */
export function greedyCoordinate(deviceEntries, faultCurrentA, options = {}) {
  if (!Array.isArray(deviceEntries) || !deviceEntries.length) {
    return { results: [], allCoordinated: true };
  }

  if (deviceEntries.length === 1) {
    const e = deviceEntries[0];
    const scaled = scaleCurve(e.device, e.overrides ?? {});
    const timeDial = scaled.settings?.tms ?? scaled.settings?.time ?? scaled.settings?.longTimeDelay ?? 1;
    return {
      results: [{ id: e.id, found: true, timeDial, scaledResult: scaled, violations: [] }],
      allCoordinated: true
    };
  }

  const margin = typeof options.margin === 'number' && options.margin > 0 ? options.margin : DEFAULT_MARGIN;
  const sampleCount = typeof options.sampleCount === 'number' ? Math.max(10, options.sampleCount) : LOG_SPACE_POINTS;

  // Scale the downstream reference device
  const entry0 = deviceEntries[0];
  const scaled0 = scaleCurve(entry0.device, entry0.overrides ?? {});
  const timeDial0 = scaled0.settings?.tms ?? scaled0.settings?.time ?? scaled0.settings?.longTimeDelay ?? 1;
  const minTestCurrent = scaled0.curve?.[0]?.current ?? 1;
  const maxTestCurrent = Math.max(faultCurrentA, minTestCurrent * 10);
  const testCurrents = generateFaultCurrents(minTestCurrent, maxTestCurrent, sampleCount);

  const results = [
    { id: entry0.id, found: true, timeDial: timeDial0, scaledResult: scaled0, violations: [] }
  ];
  let allCoordinated = true;
  let downstreamScaled = scaled0;

  for (let i = 1; i < deviceEntries.length; i += 1) {
    const entry = deviceEntries[i];
    const r = findCoordinatingTimeDial(entry.device, entry.overrides ?? {}, downstreamScaled, testCurrents, margin);
    results.push({ id: entry.id, ...r });
    if (!r.found) allCoordinated = false;
    downstreamScaled = r.scaledResult;
  }

  return { results, allCoordinated };
}

/**
 * Ground Fault Protection coordination pass.
 *
 * Identical algorithm to greedyCoordinate() but validates that every entry
 * carries a device with groundFault === true. This keeps the GFP coordination
 * path clearly named at the call-site and independently testable.
 *
 * NEC 230.95 does not specify a separate CTI value for GFP; engineering
 * practice follows the standard 0.3 s default used for phase relays.
 *
 * @param {Array<{id: string, device: object, overrides?: object}>} deviceEntries
 *   Ordered downstream-first, same shape as greedyCoordinate().
 *   All entries must have device.groundFault === true.
 * @param {number} faultCurrentA - Maximum ground fault current [A].
 * @param {object} [options={}] - Same options as greedyCoordinate().
 * @returns {{ results: Array, allCoordinated: boolean, error?: string }}
 */
export function greedyCoordinateGFP(deviceEntries, faultCurrentA, options = {}) {
  const nonGfp = Array.isArray(deviceEntries)
    ? deviceEntries.filter(e => e?.device?.groundFault !== true)
    : [true]; // treat non-array as invalid
  if (nonGfp.length) {
    return {
      results: [],
      allCoordinated: false,
      error: 'Non-GFP device in GFP coordination chain'
    };
  }
  return greedyCoordinate(deviceEntries, faultCurrentA, options);
}
