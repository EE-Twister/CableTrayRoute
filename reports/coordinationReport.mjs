// @ts-check
/**
 * CTI (Coordination Time Interval) Report Generator
 *
 * Builds tabular report data from a greedyCoordinate() result for export
 * as CSV or PDF. For each adjacent upstream/downstream device pair, the
 * report lists operating times at five standard fault-current levels and
 * the resulting coordination margin with pass/fail status.
 *
 * Standard CTI requirements per IEEE Std 242 (Buff Book):
 *   - Electromechanical relays:  ≥ 0.3 s
 *   - Static/digital relays:     ≥ 0.1 s
 *   - Fuse-breaker combinations: ≥ 0.1 s
 *
 * The margin value used comes from the greedyCoordinate() options and is
 * stored in the coord state by the TCC UI.
 *
 * A device does not operate below its curve's minimum current (pickup), so
 * its time is reported as "No trip" rather than the first curve point's
 * time. Margins are computed only when both devices operate:
 *   - downstream does not operate  → NOT EVALUATED (nothing to coordinate)
 *   - only upstream does not operate → PASS (upstream does not operate)
 *   - the current is above a curve's range, or a curve has no usable
 *     points → NOT EVALUATED (outside curve data)
 * Above the range, a device whose curve ends on its instantaneous plateau
 * keeps operating at the instantaneous time. See evaluateOperatingTime() in
 * analysis/tccAutoCoord.mjs.
 */

import { evaluateOperatingTime, instantaneousCeiling } from '../analysis/tccAutoCoord.mjs';

const TIME_STATUS_TEXT = {
  'no-trip': 'No trip',
  'above-domain': 'Above curve range',
  'no-curve': 'No curve data'
};

export const CTI_RESULT = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  PASS_UPSTREAM_NO_TRIP: 'PASS (upstream does not operate)',
  NOT_EVALUATED_DOWNSTREAM_NO_TRIP: 'NOT EVALUATED (downstream does not operate)',
  NOT_EVALUATED_OUTSIDE_CURVE: 'NOT EVALUATED (outside curve data)'
});

function formatOperatingTime(evaluation) {
  return evaluation.status === 'operates'
    ? evaluation.time.toFixed(4)
    : TIME_STATUS_TEXT[evaluation.status] ?? TIME_STATUS_TEXT['no-curve'];
}

/**
 * Compare one upstream/downstream pair at one test current.
 *
 * @returns {{ margin: number|null, result: string }}
 */
function assessPairAtCurrent(upstream, downstream, requiredMargin) {
  if (downstream.status === 'no-trip') {
    return { margin: null, result: CTI_RESULT.NOT_EVALUATED_DOWNSTREAM_NO_TRIP };
  }
  if (downstream.status !== 'operates') {
    return { margin: null, result: CTI_RESULT.NOT_EVALUATED_OUTSIDE_CURVE };
  }
  if (upstream.status === 'no-trip') {
    return { margin: null, result: CTI_RESULT.PASS_UPSTREAM_NO_TRIP };
  }
  if (upstream.status !== 'operates') {
    return { margin: null, result: CTI_RESULT.NOT_EVALUATED_OUTSIDE_CURVE };
  }
  const margin = upstream.time - downstream.time;
  return { margin, result: margin >= requiredMargin ? CTI_RESULT.PASS : CTI_RESULT.FAIL };
}

/** Column headers for the CTI report table. */
export const CTI_HEADERS = [
  'Upstream Device',
  'Downstream Device',
  'Study Readiness',
  'Fault Current Source',
  'Input Fingerprint',
  'Intended Use',
  'Test Current (A)',
  'Upstream Time (s)',
  'Downstream Time (s)',
  'Margin (s)',
  'Required CTI (s)',
  'Pass/Fail'
];

/**
 * Standard test-current fractions of the maximum fault current.
 * These span the full operating range from bolted fault down to near-FLA.
 */
const TEST_FRACTIONS = [1.0, 0.6, 0.25, 0.1, 0.05];

/**
 * Build CTI report rows from a greedyCoordinate() result.
 *
 * For each adjacent device pair (downstream[i], upstream[i+1]), five rows
 * are produced — one per standard test-current level. Each row contains
 * both device operating times, the actual margin, the required CTI, and
 * a Pass/Fail indicator.
 *
 * @param {Array<{id: string, device: object, overrides: object}>} deviceEntries
 *   Ordered load→source (index 0 = most downstream). Same array that was
 *   passed to greedyCoordinate().
 * @param {{ results: Array<{id: string, scaledResult: object}>, allCoordinated: boolean }} coordResult
 *   Return value of greedyCoordinate().
 * @param {number} faultCurrentA
 *   Maximum bolted fault current [A]. Must be > 0.
 * @param {number} [margin=0.3]
 *   Required coordination time interval [s].
 * @returns {Array<Object>}
 *   One row object per (device pair × test-current level). Returns [] for
 *   fewer than 2 devices or invalid inputs.
 */
/**
 * @param {Array<{id: string, device: object, overrides?: object}>} deviceEntries
 * @param {{ results: Array<{id: string, scaledResult: object}>, allCoordinated?: boolean }} coordResult
 * @param {number} faultCurrentA
 * @param {number} [margin]
 * @param {{ studyContext?: { provenance?: { heading?: string, inputFingerprint?: string, intendedUse?: string }, faultCurrentSource?: string } }} [options]
 * @returns {Array<Object>}
 */
export function buildCTIRows(deviceEntries, coordResult, faultCurrentA, margin = 0.3, { studyContext = {} } = {}) {
  if (
    !Array.isArray(deviceEntries) ||
    deviceEntries.length < 2 ||
    !coordResult ||
    !Array.isArray(coordResult.results) ||
    !Number.isFinite(faultCurrentA) ||
    faultCurrentA <= 0
  ) {
    return [];
  }

  const safeMargin = Number.isFinite(margin) && margin > 0 ? margin : 0.3;

  // Build id → scaledResult lookup from coordResult
  const scaledMap = new Map();
  for (const r of coordResult.results) {
    if (r && r.id != null && r.scaledResult) {
      scaledMap.set(r.id, r.scaledResult);
    }
  }

  const rows = [];

  // Iterate adjacent pairs: deviceEntries[i] = downstream, deviceEntries[i+1] = upstream
  for (let i = 0; i < deviceEntries.length - 1; i += 1) {
    const downstreamEntry = deviceEntries[i];
    const upstreamEntry = deviceEntries[i + 1];

    if (!downstreamEntry || !upstreamEntry) continue;

    const downstreamScaled = scaledMap.get(downstreamEntry.id);
    const upstreamScaled = scaledMap.get(upstreamEntry.id);

    if (!downstreamScaled || !upstreamScaled) continue;

    // Use tolerance (max) curves for downstream and minimum curves for upstream,
    // with the same duplicate-current boundaries (downstream 'upper', upstream
    // 'lower') as the conservative coordination check in tccAutoCoord.mjs.
    const downCurve = downstreamScaled.maxCurve ?? downstreamScaled.curve ?? [];
    const upCurve = upstreamScaled.minCurve ?? upstreamScaled.curve ?? [];

    const upCeiling = instantaneousCeiling(upstreamScaled);
    const downCeiling = instantaneousCeiling(downstreamScaled);

    for (const fraction of TEST_FRACTIONS) {
      const testCurrent = faultCurrentA * fraction;
      const upstream = evaluateOperatingTime(upCurve, testCurrent, { boundary: 'lower', instantaneousCeilingA: upCeiling });
      const downstream = evaluateOperatingTime(downCurve, testCurrent, { boundary: 'upper', instantaneousCeilingA: downCeiling });
      const { margin: actualMargin, result } = assessPairAtCurrent(upstream, downstream, safeMargin);

      rows.push({
        'Upstream Device': upstreamEntry.id,
        'Downstream Device': downstreamEntry.id,
        'Study Readiness': studyContext.provenance?.heading || '',
        'Fault Current Source': studyContext.faultCurrentSource || '',
        'Input Fingerprint': studyContext.provenance?.inputFingerprint || '',
        'Intended Use': studyContext.provenance?.intendedUse || '',
        'Test Current (A)': testCurrent.toFixed(1),
        'Upstream Time (s)': formatOperatingTime(upstream),
        'Downstream Time (s)': formatOperatingTime(downstream),
        'Margin (s)': actualMargin === null ? 'N/A' : actualMargin.toFixed(4),
        'Required CTI (s)': safeMargin.toFixed(2),
        'Pass/Fail': result
      });
    }
  }

  return rows;
}
