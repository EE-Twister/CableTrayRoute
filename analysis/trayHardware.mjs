/**
 * Tray Hardware BOM / Take-Off Generator
 *
 * Analyzes tray geometry to detect fittings (elbows, tees, crosses, reducers)
 * and calculates support bracket quantities based on NEMA VE 1 support spans.
 *
 * References:
 *   NEMA VE 1-2017 §4 — Load Classification / Support Spacing
 *   NEMA VE 2 — Cable Tray Installation Guidelines
 */

import { calcMaxSpan, NEMA_LOAD_CLASSES } from './supportSpan.mjs';
import { generateQRDataURL } from './pullCards.mjs';

/** Distance threshold (ft) for treating two endpoints as coincident. */
const COINCIDENCE_TOL = 0.5;

/** Angle thresholds in degrees for classifying bends. */
const STRAIGHT_ANGLE_TOL = 10;   // ≤10° deviation → straight (splice plate)
const ELBOW_ANGLE_MIN = 10;      // >10° and ≤100° → elbow
const ELBOW_ANGLE_MAX = 100;     // >100° → unusual, still counted as elbow

/**
 * Standard tray section length (ft). Fittings are typically sold separately
 * from straight sections that come in 10 ft or 12 ft lengths.
 */
const STANDARD_SECTION_LENGTH = 12;

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function dist3(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function vec3(from, to) {
  return [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function mag3(v) {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

/**
 * Angle in degrees between two direction vectors.
 */
function angleDeg(v1, v2) {
  const m1 = mag3(v1);
  const m2 = mag3(v2);
  if (m1 === 0 || m2 === 0) return 0;
  const cosA = Math.max(-1, Math.min(1, dot3(v1, v2) / (m1 * m2)));
  return Math.acos(cosA) * (180 / Math.PI);
}

// ---------------------------------------------------------------------------
// Tray normalization
// ---------------------------------------------------------------------------

/**
 * Extract the two endpoint coordinates from a tray object.
 * Coordinates are expected in feet.
 */
function trayEndpoints(tray) {
  return {
    start: [
      parseFloat(tray.start_x) || 0,
      parseFloat(tray.start_y) || 0,
      parseFloat(tray.start_z) || 0,
    ],
    end: [
      parseFloat(tray.end_x) || 0,
      parseFloat(tray.end_y) || 0,
      parseFloat(tray.end_z) || 0,
    ],
  };
}

function trayLength(tray) {
  const { start, end } = trayEndpoints(tray);
  return dist3(start, end);
}

function trayDirection(tray) {
  const { start, end } = trayEndpoints(tray);
  return vec3(start, end);
}

function trayWidth(tray) {
  return parseFloat(tray.inside_width) || 0;
}

// ---------------------------------------------------------------------------
// Junction detection
// ---------------------------------------------------------------------------

/**
 * Build a map of endpoint → [{ trayIndex, whichEnd, point }].
 * Two endpoints are grouped if they are within COINCIDENCE_TOL of each other.
 */
function buildJunctionMap(trays) {
  const entries = [];
  trays.forEach((tray, idx) => {
    const { start, end } = trayEndpoints(tray);
    entries.push({ trayIndex: idx, whichEnd: 'start', point: start });
    entries.push({ trayIndex: idx, whichEnd: 'end', point: end });
  });

  // Group endpoints by proximity
  const visited = new Set();
  const junctions = [];

  for (let i = 0; i < entries.length; i++) {
    if (visited.has(i)) continue;
    const group = [entries[i]];
    visited.add(i);
    for (let j = i + 1; j < entries.length; j++) {
      if (visited.has(j)) continue;
      if (dist3(entries[i].point, entries[j].point) <= COINCIDENCE_TOL) {
        group.push(entries[j]);
        visited.add(j);
      }
    }
    if (group.length >= 2) {
      junctions.push(group);
    }
  }

  return junctions;
}

/**
 * Classify a junction based on how many trays meet and their angles.
 *
 * Returns one of:
 *   'splice_plate' — two trays, roughly collinear (≤10° deviation), same width
 *   'elbow'        — two trays, angle > 10°
 *   'reducer'      — two trays, collinear but different widths
 *   'tee'          — three trays meeting
 *   'cross'        — four trays meeting
 *   'junction_N'   — N > 4 trays (unusual)
 */
function classifyJunction(group, trays) {
  const n = group.length;

  // Direction vectors pointing AWAY from the junction for each tray
  const dirs = group.map(entry => {
    const tray = trays[entry.trayIndex];
    const rawDir = trayDirection(tray);
    // If this is the "end" endpoint, the direction away from junction
    // is reversed (from end toward start).
    if (entry.whichEnd === 'end') {
      return [-rawDir[0], -rawDir[1], -rawDir[2]];
    }
    return rawDir;
  });

  const widths = group.map(entry => trayWidth(trays[entry.trayIndex]));
  const trayIds = group.map(entry => trays[entry.trayIndex].tray_id || `tray_${entry.trayIndex}`);

  if (n === 2) {
    const rawAngle = angleDeg(dirs[0], dirs[1]);
    const widthsDiffer = Math.abs(widths[0] - widths[1]) > 0.25;

    // Away-from-junction vectors for collinear trays point in opposite
    // directions (≈180°).  The "bend angle" experienced by the cable is
    // the supplement: bendAngle = 180 − rawAngle.
    const bendAngle = 180 - rawAngle;

    if (bendAngle <= STRAIGHT_ANGLE_TOL) {
      if (widthsDiffer) {
        return {
          type: 'reducer',
          tray_ids: trayIds,
          angle: Math.round(bendAngle * 10) / 10,
          widths,
        };
      }
      return {
        type: 'splice_plate',
        tray_ids: trayIds,
        angle: Math.round(bendAngle * 10) / 10,
        widths,
      };
    }
    // Angled junction → elbow.  Report the bend angle (e.g. 90° for a
    // right-angle turn).
    return {
      type: 'elbow',
      tray_ids: trayIds,
      angle: Math.round(bendAngle * 10) / 10,
      widths,
    };
  }

  if (n === 3) {
    return { type: 'tee', tray_ids: trayIds, widths };
  }

  if (n === 4) {
    return { type: 'cross', tray_ids: trayIds, widths };
  }

  return { type: `junction_${n}`, tray_ids: trayIds, widths };
}

// ---------------------------------------------------------------------------
// Support bracket calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the number of support brackets for a single tray segment.
 *
 * Per NEMA VE 2, supports are required at each end plus intermediate supports
 * so that the span between any two adjacent supports does not exceed maxSpan.
 *
 * @param {number} segLength  – tray segment length in ft
 * @param {number} maxSpan    – maximum allowable span in ft
 * @returns {number} number of support brackets (minimum 2: one at each end)
 */
function supportBracketCount(segLength, maxSpan) {
  if (segLength <= 0 || maxSpan <= 0) return 0;
  // Number of spans needed = ceil(segLength / maxSpan)
  // Number of supports = spans + 1
  const spans = Math.ceil(segLength / maxSpan);
  return spans + 1;
}

// ---------------------------------------------------------------------------
// Straight section count
// ---------------------------------------------------------------------------

/**
 * Number of standard-length straight sections needed to cover a tray run.
 */
function straightSectionCount(segLength, sectionLen = STANDARD_SECTION_LENGTH) {
  if (segLength <= 0) return 0;
  return Math.ceil(segLength / sectionLen);
}

// ---------------------------------------------------------------------------
// Cover calculation
// ---------------------------------------------------------------------------

/**
 * Determine cover sections needed for a tray.
 * Covers are typically the same length as straight sections.
 * Only solid-bottom and ventilated trays typically use covers; ladder trays
 * rarely do. We include a `needs_cover` flag but count for all.
 */
function coverSectionCount(segLength, sectionLen = STANDARD_SECTION_LENGTH) {
  if (segLength <= 0) return 0;
  return Math.ceil(segLength / sectionLen);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate the tray hardware BOM from tray geometry.
 *
 * @param {Array<Object>} trays – array of tray objects with start_x/y/z,
 *   end_x/y/z, inside_width, tray_depth, tray_type, tray_id
 * @param {Object} [options]
 * @param {string} [options.loadClass='16A'] – NEMA load class for support span
 * @param {number} [options.cableLoadPerFt=0] – default cable weight lbs/ft when
 *   per-tray data is unavailable (0 uses rated load for max span)
 * @param {Object} [options.trayWeights] – map of tray_id → cable lbs/ft
 * @param {boolean} [options.includeCoverSections=true] – include cover sections
 * @param {number} [options.standardSectionLength=12] – straight section length (ft)
 * @returns {{ fittings: Array, supports: Array, sections: Array, summary: Array }}
 */
export function buildTrayHardwareBOM(trays, options = {}) {
  const {
    loadClass = '16A',
    cableLoadPerFt = 0,
    trayWeights = {},
    includeCoverSections = true,
    standardSectionLength = STANDARD_SECTION_LENGTH,
  } = options;

  if (!trays || trays.length === 0) {
    return { fittings: [], supports: [], sections: [], summary: [] };
  }

  // Filter to actual trays (exclude conduits/ductbanks if present)
  const trayList = trays.filter(t =>
    t.tray_id &&
    t.start_x != null && t.end_x != null &&
    (!t.raceway_type || t.raceway_type === 'tray')
  );

  // 1. Detect junctions → fittings
  const junctionGroups = buildJunctionMap(trayList);
  const fittings = junctionGroups.map(group => classifyJunction(group, trayList));

  // 2. Supports & sections per tray segment
  const supports = [];
  const sections = [];

  const cls = NEMA_LOAD_CLASSES[loadClass];
  const defaultMaxSpan = cls ? cls.ratedSpan : 12;

  trayList.forEach(tray => {
    const id = tray.tray_id;
    const len = trayLength(tray);
    if (len <= 0) return;

    // Determine max support span for this tray
    let maxSpan = defaultMaxSpan;
    const weight = trayWeights[id] != null ? trayWeights[id] : cableLoadPerFt;
    if (weight > 0 && cls) {
      try {
        const result = calcMaxSpan(weight, loadClass);
        maxSpan = result.maxSpan;
      } catch {
        // Fall back to default
      }
    }

    const bracketQty = supportBracketCount(len, maxSpan);

    supports.push({
      tray_id: id,
      tray_type: tray.tray_type || '',
      width: trayWidth(tray),
      depth: parseFloat(tray.tray_depth) || 0,
      length_ft: Math.round(len * 100) / 100,
      max_span_ft: maxSpan,
      bracket_qty: bracketQty,
    });

    const straightQty = straightSectionCount(len, standardSectionLength);
    const coverQty = includeCoverSections ? coverSectionCount(len, standardSectionLength) : 0;

    sections.push({
      tray_id: id,
      tray_type: tray.tray_type || '',
      width: trayWidth(tray),
      depth: parseFloat(tray.tray_depth) || 0,
      length_ft: Math.round(len * 100) / 100,
      straight_sections: straightQty,
      section_length_ft: standardSectionLength,
      cover_sections: coverQty,
    });
  });

  // 3. Build summary (aggregate by fitting type and tray size)
  const summary = buildHardwareSummary(fittings, supports, sections, trayList);

  return { fittings, supports, sections, summary };
}

/**
 * Aggregate hardware into a procurement-oriented summary.
 * Groups items by type × width so a purchaser can place orders.
 */
function buildHardwareSummary(fittings, supports, sections, trays) {
  const items = [];

  // Aggregate fittings by type × max width at junction
  const fittingCounts = new Map();
  fittings.forEach(f => {
    const maxWidth = Math.max(...(f.widths || [0]));
    const key = `${f.type}|${maxWidth}`;
    if (!fittingCounts.has(key)) {
      fittingCounts.set(key, { item: f.type, width: maxWidth, qty: 0 });
    }
    fittingCounts.get(key).qty += 1;
  });
  fittingCounts.forEach(v => {
    items.push({
      category: 'Fitting',
      item: formatFittingName(v.item),
      width_in: v.width,
      qty: v.qty,
      unit: 'ea',
    });
  });

  // Aggregate straight sections by width
  const sectionCounts = new Map();
  sections.forEach(s => {
    const key = `straight|${s.width}`;
    if (!sectionCounts.has(key)) {
      sectionCounts.set(key, { width: s.width, qty: 0, coverQty: 0, sectionLen: s.section_length_ft });
    }
    const entry = sectionCounts.get(key);
    entry.qty += s.straight_sections;
    entry.coverQty += s.cover_sections;
  });
  sectionCounts.forEach(v => {
    items.push({
      category: 'Straight Section',
      item: `${v.sectionLen} ft Straight Section`,
      width_in: v.width,
      qty: v.qty,
      unit: 'ea',
    });
    if (v.coverQty > 0) {
      items.push({
        category: 'Cover',
        item: `${v.sectionLen} ft Cover`,
        width_in: v.width,
        qty: v.coverQty,
        unit: 'ea',
      });
    }
  });

  // Aggregate support brackets by width
  const bracketCounts = new Map();
  supports.forEach(s => {
    const key = `bracket|${s.width}`;
    if (!bracketCounts.has(key)) {
      bracketCounts.set(key, { width: s.width, qty: 0 });
    }
    bracketCounts.get(key).qty += s.bracket_qty;
  });
  bracketCounts.forEach(v => {
    items.push({
      category: 'Support',
      item: 'Support Bracket / Trapeze Hanger',
      width_in: v.width,
      qty: v.qty,
      unit: 'ea',
    });
  });

  return items;
}

function formatFittingName(type) {
  const names = {
    elbow: 'Elbow',
    tee: 'Tee',
    cross: 'Cross',
    reducer: 'Reducer',
    splice_plate: 'Splice Plate',
  };
  return names[type] || type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// QR enrichment — optional async post-processing
// ---------------------------------------------------------------------------

/**
 * Enrich a BOM from buildTrayHardwareBOM with QR code data URLs per tray row.
 * This is a separate async step so that the synchronous buildTrayHardwareBOM API
 * is not affected.
 *
 * Each entry in `supports` and `sections` gains a `qr_data_url` field whose value
 * is a PNG data URL encoding a URL that links to the raceway schedule filtered to
 * that tray ID.
 *
 * @param {{ supports: Array, sections: Array }} bom - result of buildTrayHardwareBOM
 * @param {{ baseURL?: string }} [options]
 * @returns {Promise<void>} mutates bom in place
 */
export async function enrichTrayBOMWithQR(bom, options = {}) {
  const baseURL = options.baseURL || 'https://cabletrayroute.com';
  const allRows = [...(bom.supports || []), ...(bom.sections || [])];
  const seen = new Map();
  await Promise.all(
    allRows.map(async row => {
      const id = row.tray_id;
      if (!id) return;
      if (!seen.has(id)) {
        const url = `${baseURL}/racewayschedule.html#tray=${encodeURIComponent(id)}`;
        seen.set(id, generateQRDataURL(url));
      }
      row.qr_data_url = await seen.get(id);
    })
  );
}

// Exported for testing
export {
  buildJunctionMap,
  classifyJunction,
  supportBracketCount,
  straightSectionCount,
  trayEndpoints,
  trayLength,
  angleDeg,
  COINCIDENCE_TOL,
};
