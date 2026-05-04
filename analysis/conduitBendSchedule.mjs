/**
 * Conduit Bend & Pull-Box Sizing Schedule — Gap #93
 *
 * Pure calculation helpers for conduit bend geometry and NEC 358.24
 * cumulative-bend validation. No DOM access; persistence is handled by the
 * page JS layer (conduitbend.js).
 *
 * NEC references:
 *   358.24  Maximum bends — EMT (also applies via reference to IMC 342.24,
 *           RMC 344.24, LFMC 350.24): no more than 360° of bends between
 *           pull points.
 *
 * Geometry source: Tom Henry's Conduit Bending Manual; Mike Holt's
 * Illustrated Guide to the NEC; NECA Manual of Labor Units (standard
 * multiplier / shrink tables reproduced in most IBEW apprenticeship texts).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Recognised bend types. */
export const BEND_TYPES = Object.freeze(['90', 'offset', 'kick', 'saddle']);

/**
 * Standard take-up values for 90° bends by EMT/RMC trade size (inches).
 * Take-up = the arc length consumed by the bend; mark this distance from
 * the finished end of the stub to position the bender arrow.
 */
export const TAKE_UP = Object.freeze({
  '0.5':  5,
  '0.75': 6,
  '1':    8,
  '1.25': 11,
  '1.5':  13,
  '2':    16,
  '2.5':  19,
  '3':    22,
  '3.5':  25,
  '4':    28,
});

/**
 * Two-bend offset reference table.
 *
 * multiplier  — mark spacing = offset height × multiplier
 * shrinkPerIn — total conduit shrink per inch of offset height
 *
 * Standard values from Tom Henry's table; derivable from geometry as
 * shrink = height × (1/sin θ − 1/tan θ) but practical tables are rounded.
 */
export const OFFSET_TABLE = Object.freeze({
  10:   { multiplier: 5.76,  shrinkPerIn: 0.094, label: '10°' },
  22.5: { multiplier: 2.60,  shrinkPerIn: 0.213, label: '22.5°' },
  30:   { multiplier: 2.00,  shrinkPerIn: 0.250, label: '30°' },
  45:   { multiplier: 1.414, shrinkPerIn: 0.375, label: '45°' },
});

const NEC_MAX_DEGREES = 360;

// ---------------------------------------------------------------------------
// Bend geometry
// ---------------------------------------------------------------------------

/**
 * Compute the geometric properties of a single conduit bend.
 *
 * @param {'90'|'offset'|'kick'|'saddle'} type  Bend type
 * @param {number} dimension  Primary dimension (inches):
 *   - '90'     → desired stub-up height
 *   - 'offset' → offset rise (height to move)
 *   - 'kick'   → kick height (distance moved at angle)
 *   - 'saddle' → obstacle height to clear
 * @param {object} [opts]
 * @param {number} [opts.angle=45]      Bend angle in degrees (offset / kick)
 * @param {number} [opts.tradeSize=1]   Conduit trade size in inches (90° take-up lookup)
 * @returns {{
 *   type: string,
 *   dimension: number,
 *   degrees: number,
 *   markSpacing: number,
 *   rise: number,
 *   run: number,
 *   shrink: number,
 *   multiplier: number,
 *   note: string
 * }}
 */
export function bendGeometry(type, dimension, opts = {}) {
  const h         = Math.abs(parseFloat(dimension) || 0);
  const angle     = parseFloat(opts.angle) || 45;
  const tradeSize = parseFloat(opts.tradeSize) || 1;

  switch (type) {
    case '90': {
      const takeUp = _lookupTakeUp(tradeSize);
      return {
        type:        '90',
        dimension:   h,
        degrees:     90,
        markSpacing: takeUp,
        rise:        h,
        run:         0,
        shrink:      takeUp,
        multiplier:  1,
        note: `90° stub-up — take-up ${takeUp}" for ${tradeSize}" conduit (mark from finished end)`,
      };
    }

    case 'offset': {
      const entry       = _closestOffsetAngle(angle);
      const markSpacing = round2(h * entry.multiplier);
      const shrink      = round2(h * entry.shrinkPerIn);
      return {
        type:        'offset',
        dimension:   h,
        degrees:     round2(angle * 2),
        markSpacing,
        rise:        h,
        run:         markSpacing,
        shrink,
        multiplier:  entry.multiplier,
        note: `${entry.label}/${entry.label} offset — marks ${markSpacing}" apart, shrink ${shrink}"`,
      };
    }

    case 'kick': {
      const entry       = _closestOffsetAngle(angle);
      const markSpacing = round2(h * entry.multiplier);
      const runDist     = round2(markSpacing * Math.cos(_toRad(angle)));
      return {
        type:        'kick',
        dimension:   h,
        degrees:     angle,
        markSpacing,
        rise:        h,
        run:         runDist,
        shrink:      0,
        multiplier:  entry.multiplier,
        note: `${entry.label} kick — mark at ${markSpacing}" from reference; no shrink (single bend)`,
      };
    }

    case 'saddle': {
      // 3-bend saddle: 45° centre bend + two 22.5° outer bends.
      // Outer-to-centre spacing = 2.5 × h (Tom Henry standard).
      const outerToCenter = round2(2.5 * h);
      const totalSpan     = round2(5 * h);
      const shrink        = round2(h * 0.213); // matches 22.5° offset shrink ratio
      return {
        type:        'saddle',
        dimension:   h,
        degrees:     90,   // 45 + 22.5 + 22.5
        markSpacing: outerToCenter,
        rise:        h,
        run:         totalSpan,
        shrink,
        multiplier:  2.5,
        note: `3-bend saddle (45°/22.5°/22.5°) — outer-to-centre ${outerToCenter}", span ${totalSpan}", shrink ${shrink}"`,
      };
    }

    default:
      throw new Error(`Unknown bend type: "${type}". Valid types: ${BEND_TYPES.join(', ')}.`);
  }
}

// ---------------------------------------------------------------------------
// Cumulative degrees and NEC 358.24 check
// ---------------------------------------------------------------------------

/**
 * Sum the total bend degrees for an array of bend results.
 *
 * @param {Array<{degrees: number}>} bends
 * @returns {number}
 */
export function cumulativeDegrees(bends) {
  if (!Array.isArray(bends)) return 0;
  return bends.reduce((sum, b) => sum + (Number(b.degrees) || 0), 0);
}

/**
 * Validate an array of conduit segments against NEC 358.24 (≤ 360° between pull points).
 *
 * @param {Array<{label?: string, bends: Array<{degrees: number}>}>} segments
 * @returns {Array<{segmentLabel: string, totalDegrees: number, pass: boolean, message: string}>}
 */
export function nec358_24Check(segments) {
  if (!Array.isArray(segments)) return [];
  return segments.map((seg, i) => {
    const label = seg.label || `Segment ${i + 1}`;
    const total = cumulativeDegrees(seg.bends || []);
    const pass  = total <= NEC_MAX_DEGREES;
    return {
      segmentLabel: label,
      totalDegrees: total,
      pass,
      message: pass
        ? `${total}° total — passes NEC 358.24 (≤ 360° between pull points)`
        : `${total}° total — exceeds NEC 358.24 limit of 360°. Add a pull point or reduce bends.`,
    };
  });
}

// ---------------------------------------------------------------------------
// Master run function
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} BendInput
 * @property {'90'|'offset'|'kick'|'saddle'} type
 * @property {number} dimension
 * @property {number} [angle=45]
 */

/**
 * @typedef {Object} ConduitRunInput
 * @property {string}      [label]
 * @property {number}      [tradeSize=1]
 * @property {BendInput[]} bends
 */

/**
 * @typedef {Object} ConduitRunResult
 * @property {string}   label
 * @property {number}   tradeSize
 * @property {object[]} bends             Enriched bend-geometry objects
 * @property {number}   totalDegrees
 * @property {boolean}  nec358_24Pass
 * @property {string}   nec358_24Message
 */

/**
 * Process conduit runs: compute bend geometry and check NEC 358.24.
 *
 * @param {ConduitRunInput[]} conduitRuns
 * @returns {{ runs: ConduitRunResult[], violations: object[], summary: object }}
 */
export function runConduitBendSchedule(conduitRuns) {
  if (!Array.isArray(conduitRuns) || conduitRuns.length === 0) {
    return _emptyResult();
  }

  const runs       = [];
  const violations = [];

  for (const [i, run] of conduitRuns.entries()) {
    const label      = run.label || `Run ${i + 1}`;
    const tradeSize  = parseFloat(run.tradeSize) || 1;
    const bendInputs = Array.isArray(run.bends) ? run.bends : [];

    if (bendInputs.length === 0) {
      runs.push({
        label,
        tradeSize,
        bends:            [],
        totalDegrees:     0,
        nec358_24Pass:    true,
        nec358_24Message: '0° total — no bends specified',
      });
      continue;
    }

    const enriched = [];
    for (const [j, b] of bendInputs.entries()) {
      const bType = String(b.type || '').toLowerCase();
      const dim   = parseFloat(b.dimension);

      if (!BEND_TYPES.includes(bType)) {
        violations.push({ runLabel: label, bendIndex: j, message: `Unknown bend type "${b.type}"` });
        continue;
      }
      if (!Number.isFinite(dim) || dim < 0) {
        violations.push({ runLabel: label, bendIndex: j, message: `Invalid dimension "${b.dimension}" for bend ${j + 1} of "${label}"` });
        continue;
      }

      enriched.push(bendGeometry(bType, dim, {
        angle:     parseFloat(b.angle) || 45,
        tradeSize,
      }));
    }

    const totalDeg = cumulativeDegrees(enriched);
    const pass     = totalDeg <= NEC_MAX_DEGREES;
    const necMsg   = pass
      ? `${totalDeg}° total — passes NEC 358.24`
      : `${totalDeg}° total — exceeds 360° NEC 358.24 limit; add a pull point`;

    if (!pass) violations.push({ runLabel: label, message: necMsg });

    runs.push({
      label,
      tradeSize,
      bends:            enriched,
      totalDegrees:     totalDeg,
      nec358_24Pass:    pass,
      nec358_24Message: necMsg,
    });
  }

  return {
    runs,
    violations,
    summary: {
      totalRuns:      runs.length,
      totalBends:     runs.reduce((s, r) => s + r.bends.length, 0),
      violationCount: violations.length,
      allPass:        violations.length === 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function round2(n) {
  return Math.round(n * 100) / 100;
}

function _toRad(deg) {
  return (deg * Math.PI) / 180;
}

function _lookupTakeUp(tradeSize) {
  const key = String(tradeSize);
  if (TAKE_UP[key] !== undefined) return TAKE_UP[key];
  const sizes   = Object.keys(TAKE_UP).map(Number).sort((a, b) => a - b);
  const nearest = sizes.reduce((prev, cur) =>
    Math.abs(cur - tradeSize) < Math.abs(prev - tradeSize) ? cur : prev
  );
  return TAKE_UP[String(nearest)];
}

function _closestOffsetAngle(angle) {
  const available = Object.keys(OFFSET_TABLE).map(Number);
  const nearest   = available.reduce((prev, cur) =>
    Math.abs(cur - angle) < Math.abs(prev - angle) ? cur : prev
  );
  return OFFSET_TABLE[nearest];
}

function _emptyResult() {
  return {
    runs:       [],
    violations: [],
    summary:    { totalRuns: 0, totalBends: 0, violationCount: 0, allPass: true },
  };
}
