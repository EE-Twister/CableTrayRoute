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
 */

import { interpolateTime } from '../analysis/tccAutoCoord.mjs';

/** Column headers for the CTI report table. */
export const CTI_HEADERS = [
  'Upstream Device',
  'Downstream Device',
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
export function buildCTIRows(deviceEntries, coordResult, faultCurrentA, margin = 0.3) {
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
    // matching the conservative coordination check in tccAutoCoord.mjs.
    const downCurve = downstreamScaled.maxCurve ?? downstreamScaled.curve ?? [];
    const upCurve = upstreamScaled.minCurve ?? upstreamScaled.curve ?? [];

    for (const fraction of TEST_FRACTIONS) {
      const testCurrent = faultCurrentA * fraction;
      const upTime = interpolateTime(upCurve, testCurrent);
      const downTime = interpolateTime(downCurve, testCurrent);
      const actualMargin = upTime - downTime;
      const pass = actualMargin >= safeMargin;

      rows.push({
        'Upstream Device': upstreamEntry.id,
        'Downstream Device': downstreamEntry.id,
        'Test Current (A)': testCurrent.toFixed(1),
        'Upstream Time (s)': upTime.toFixed(4),
        'Downstream Time (s)': downTime.toFixed(4),
        'Margin (s)': actualMargin.toFixed(4),
        'Required CTI (s)': safeMargin.toFixed(2),
        'Pass/Fail': pass ? 'PASS' : 'FAIL'
      });
    }
  }

  return rows;
}
