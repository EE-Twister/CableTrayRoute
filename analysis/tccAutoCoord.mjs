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

const MIN_TIME = 1e-4;
const TIME_DIAL_MIN = 0.05;
const TIME_DIAL_MAX = 10.0;
const BINARY_SEARCH_ITERATIONS = 30;
const LOG_SPACE_POINTS = 50;
const DEFAULT_MARGIN = 0.3;

/**
 * Log-log linear interpolation of time from a curve at a given current.
 * Mirrors the private interpolateTimeAtCurrent() in tccUtils.js.
 *
 * @param {Array<{current: number, time: number}>} curve - Sorted ascending by current
 * @param {number} current - Current value to interpolate at [A]
 * @returns {number} Interpolated time [s], never below MIN_TIME
 */
export function interpolateTime(curve, current) {
  if (!Array.isArray(curve) || !curve.length || !Number.isFinite(current) || current <= 0) {
    return MIN_TIME;
  }
  const first = curve[0];
  if (!first || first.current >= current) {
    return Math.max(first?.time ?? MIN_TIME, MIN_TIME);
  }
  for (let i = 1; i < curve.length; i += 1) {
    const prev = curve[i - 1];
    const next = curve[i];
    if (!next) continue;
    if (current <= next.current) {
      const prevC = Math.max(prev.current, MIN_TIME);
      const nextC = Math.max(next.current, MIN_TIME);
      if (Math.abs(nextC - prevC) < 1e-12) {
        return Math.max(Math.min(prev.time, next.time), MIN_TIME);
      }
      const logPrevC = Math.log(prevC);
      const logNextC = Math.log(nextC);
      const span = logNextC - logPrevC;
      const ratio = span === 0 ? 0 : (Math.log(current) - logPrevC) / span;
      const clampedRatio = Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : 0;
      const logPrevT = Math.log(Math.max(prev.time, MIN_TIME));
      const logNextT = Math.log(Math.max(next.time, MIN_TIME));
      const interpolated = logPrevT + clampedRatio * (logNextT - logPrevT);
      return Math.max(Math.exp(interpolated), MIN_TIME);
    }
  }
  const last = curve[curve.length - 1];
  return Math.max(last?.time ?? MIN_TIME, MIN_TIME);
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
 * @returns {{ coordinated: boolean, violations: Array<{current, upstreamMinTime, downstreamMaxTime, gap}> }}
 */
export function checkCoordination(upstreamScaled, downstreamScaled, testCurrents, margin = DEFAULT_MARGIN) {
  const upMin = upstreamScaled?.minCurve ?? upstreamScaled?.curve ?? [];
  const downMax = downstreamScaled?.maxCurve ?? downstreamScaled?.curve ?? [];
  const safeMargin = Number.isFinite(margin) ? margin : DEFAULT_MARGIN;

  if (!Array.isArray(testCurrents) || !testCurrents.length) {
    return { coordinated: false, violations: [] };
  }

  const violations = [];
  for (const I of testCurrents) {
    if (!Number.isFinite(I) || I <= 0) continue;
    const upTime = interpolateTime(upMin, I);
    const downTime = interpolateTime(downMax, I);
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
  return { coordinated: violations.length === 0, violations };
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

  // Quick check: does the maximum dial coordinate?
  const scaledHi = scaleCurve(device, { ...overrides, time: TIME_DIAL_MAX });
  const checkHi = checkCoordination(scaledHi, downstreamScaled, testCurrents, margin);
  if (!checkHi.coordinated) {
    return { found: false, timeDial: TIME_DIAL_MAX, scaledResult: scaledHi, violations: checkHi.violations };
  }

  // Quick check: is the minimum dial already coordinated?
  const scaledLo = scaleCurve(device, { ...overrides, time: TIME_DIAL_MIN });
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
    const scaled = scaleCurve(device, { ...overrides, time: mid });
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
    const timeDial = scaled.settings?.time ?? scaled.settings?.longTimeDelay ?? 1;
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
  const timeDial0 = scaled0.settings?.time ?? scaled0.settings?.longTimeDelay ?? 1;
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
