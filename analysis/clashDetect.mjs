/**
 * Clash Detection — Cable Tray 3D Interference Analysis
 *
 * Detects routing conflicts (hard clashes) and clearance violations (soft clashes)
 * between cable tray segments using Axis-Aligned Bounding Box (AABB) tests in 3D space.
 *
 * References:
 *   NEMA VE 2-2013 §8.4 — Minimum clearances between cable trays
 *   IEC 61537 §8.3       — Clearance requirements for international installations
 */

/**
 * Minimum clearance (ft) between tray outer surfaces for a soft-clash warning.
 * Per NEMA VE 2 §8.4, a minimum 3-inch (0.25 ft) clear space between adjacent
 * runs is recommended for maintenance access.
 */
const DEFAULT_CLEARANCE_FT = 0.25;

/**
 * Severity levels for clash results.
 */
export const CLASH_SEVERITY = {
  HARD: 'hard',       // Bounding boxes overlap — physical interference
  SOFT: 'soft',       // Within clearance distance — maintenance/installation concern
};

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * Build an Axis-Aligned Bounding Box for a tray segment.
 *
 * The tray occupies a rectangular cross-section (width × depth) centred on the
 * run axis.  We compute the axis-aligned envelope by expanding the segment
 * endpoints by half-width in X/Y and half-depth in Z (trays are assumed to
 * run horizontally; vertical stacking represented by Z offset).
 *
 * @param {object} tray  Raceway schedule row with start/end coordinates and dimensions.
 * @returns {{ minX, maxX, minY, maxY, minZ, maxZ }}
 */
function trayAABB(tray) {
  const x0 = parseFloat(tray.start_x) || 0;
  const y0 = parseFloat(tray.start_y) || 0;
  const z0 = parseFloat(tray.start_z) || 0;
  const x1 = parseFloat(tray.end_x)   || 0;
  const y1 = parseFloat(tray.end_y)   || 0;
  const z1 = parseFloat(tray.end_z)   || 0;

  // Width in inches → convert to ft, half for each side
  const halfW = (parseFloat(tray.inside_width) || 12) / 2 / 12;
  // Depth in inches → convert to ft
  const depth  = (parseFloat(tray.tray_depth)  || 4)  / 12;

  return {
    minX: Math.min(x0, x1) - halfW,
    maxX: Math.max(x0, x1) + halfW,
    minY: Math.min(y0, y1) - halfW,
    maxY: Math.max(y0, y1) + halfW,
    minZ: Math.min(z0, z1),
    maxZ: Math.max(z0, z1) + depth,
  };
}

/**
 * Return the minimum gap (ft) between two AABBs along a single axis.
 * Negative value means they overlap on that axis.
 */
function axisGap(minA, maxA, minB, maxB) {
  if (maxA < minB) return minB - maxA;
  if (maxB < minA) return minA - maxB;
  return Math.max(minA, minB) - Math.min(maxA, maxB); // negative = overlap depth
}

/**
 * True if segment a is the same physical object as segment b
 * (identical coordinates — happens when a tray is compared with itself).
 */
function sameTray(a, b) {
  return a.tray_id === b.tray_id;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run clash detection on a list of tray segments.
 *
 * @param {object[]} trays           Raceway schedule rows.
 * @param {object}   [options]
 * @param {number}   [options.clearanceFt=0.25]  Soft-clash threshold in feet.
 * @returns {{ clashes: ClashResult[], stats: ClashStats }}
 *
 * @typedef {{
 *   trayA:       string,
 *   trayB:       string,
 *   severity:    'hard' | 'soft',
 *   overlapX:    number,
 *   overlapY:    number,
 *   overlapZ:    number,
 *   minGapFt:    number,
 *   description: string,
 * }} ClashResult
 *
 * @typedef {{
 *   totalTrays:   number,
 *   pairs:        number,
 *   hardClashes:  number,
 *   softClashes:  number,
 * }} ClashStats
 */
export function detectClashes(trays, options = {}) {
  const clearanceFt = options.clearanceFt ?? DEFAULT_CLEARANCE_FT;

  if (!Array.isArray(trays) || trays.length === 0) {
    return {
      clashes: [],
      stats: { totalTrays: 0, pairs: 0, hardClashes: 0, softClashes: 0 },
    };
  }

  const boxes = trays.map(t => ({ tray: t, box: trayAABB(t) }));
  const clashes = [];
  let pairs = 0;

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (sameTray(boxes[i].tray, boxes[j].tray)) continue;
      pairs++;

      const a = boxes[i].box;
      const b = boxes[j].box;

      const gapX = axisGap(a.minX, a.maxX, b.minX, b.maxX);
      const gapY = axisGap(a.minY, a.maxY, b.minY, b.maxY);
      const gapZ = axisGap(a.minZ, a.maxZ, b.minZ, b.maxZ);

      // Hard clash: all three axes overlap (both gaps are negative / zero)
      const overlapX = -gapX;
      const overlapY = -gapY;
      const overlapZ = -gapZ;

      const hardClash = overlapX > 0 && overlapY > 0 && overlapZ > 0;

      if (hardClash) {
        const minOverlap = Math.min(overlapX, overlapY, overlapZ).toFixed(3);
        clashes.push({
          trayA: boxes[i].tray.tray_id,
          trayB: boxes[j].tray.tray_id,
          severity: CLASH_SEVERITY.HARD,
          overlapX: +overlapX.toFixed(3),
          overlapY: +overlapY.toFixed(3),
          overlapZ: +overlapZ.toFixed(3),
          minGapFt: -parseFloat(minOverlap),
          description:
            `Hard clash: Trays physically overlap by ${minOverlap} ft minimum. ` +
            `Resolve by rerouting ${boxes[i].tray.tray_id} or ${boxes[j].tray.tray_id}.`,
        });
        continue;
      }

      // Soft clash: bounding boxes are separated, but closer than the clearance threshold.
      // Compute the true 3D gap (min separation across axes that aren't overlapping).
      const separations = [];
      if (gapX > 0) separations.push(gapX);
      if (gapY > 0) separations.push(gapY);
      if (gapZ > 0) separations.push(gapZ);

      const minGap = separations.length > 0 ? Math.min(...separations) : 0;

      if (minGap < clearanceFt) {
        clashes.push({
          trayA: boxes[i].tray.tray_id,
          trayB: boxes[j].tray.tray_id,
          severity: CLASH_SEVERITY.SOFT,
          overlapX: 0,
          overlapY: 0,
          overlapZ: 0,
          minGapFt: +minGap.toFixed(3),
          description:
            `Clearance violation: ${minGap.toFixed(3)} ft gap is less than the ` +
            `${clearanceFt} ft minimum clearance between ` +
            `${boxes[i].tray.tray_id} and ${boxes[j].tray.tray_id}.`,
        });
      }
    }
  }

  const hardClashes = clashes.filter(c => c.severity === CLASH_SEVERITY.HARD).length;
  const softClashes = clashes.filter(c => c.severity === CLASH_SEVERITY.SOFT).length;

  return {
    clashes,
    stats: {
      totalTrays: trays.length,
      pairs,
      hardClashes,
      softClashes,
    },
  };
}

/**
 * Compute a summary severity for display purposes.
 * @param {ClashResult[]} clashes
 * @returns {'pass'|'warning'|'fail'}
 */
export function overallSeverity(clashes) {
  if (clashes.some(c => c.severity === CLASH_SEVERITY.HARD)) return 'fail';
  if (clashes.some(c => c.severity === CLASH_SEVERITY.SOFT)) return 'warning';
  return 'pass';
}
