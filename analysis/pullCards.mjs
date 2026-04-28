/**
 * Cable Pull Card & Pull Table Generator
 *
 * Groups cables into "pulls" — sets of cables that share the same cable type
 * and the same ordered sequence of raceway segments, so they can be pulled
 * together in a single operation by field crews.
 *
 * Also generates individual pull cards with route detail, tension estimates,
 * and cable data for construction documentation.
 *
 * References:
 *   NEC Article 300.31 — Securing and supporting
 *   IEEE Std 1185 — Cable installation in substations
 *   AEIC CG5 — Underground extruded power cable pulling guide
 */

import { calcPullTension } from '../src/pullCalc.js';

const CONSTRUCTION_DETAIL_KEYS = [
  'supportFamily',
  'supportType',
  'supportSpacingFt',
  'dividerLane',
  'constructionPhase',
  'constructionStatus',
  'drawingRef',
  'detailRef',
  'labelId',
  'sectionRef',
  'installArea',
  'constructionNotes',
];

function constructionDetailFromSegment(seg = {}) {
  const detail = {};
  CONSTRUCTION_DETAIL_KEYS.forEach(key => {
    if (seg[key] !== undefined && seg[key] !== null && seg[key] !== '') detail[key] = seg[key];
  });
  return detail;
}

// ---------------------------------------------------------------------------
// QR code generation
// ---------------------------------------------------------------------------

/**
 * Generate a QR code as a PNG data URL for the given text.
 *
 * Uses the `qrcode` npm package in Node.js or server environments.
 * In the browser this function may also be called if the package is bundled.
 * Falls back gracefully if the package is unavailable (returns null).
 *
 * @param {string} text - The content to encode in the QR code
 * @returns {Promise<string|null>} PNG data URL (data:image/png;base64,...) or null
 */
export async function generateQRDataURL(text) {
  try {
    const mod = await import('qrcode');
    const QRCode = mod.default ?? mod;
    return await QRCode.toDataURL(String(text), { margin: 1, width: 120 });
  } catch {
    return null;
  }
}

/**
 * Build a mobile field-view URL for use in QR codes on pull cards.
 * Scanning the QR code opens the mobile-optimized field view for the cable.
 *
 * @param {string} cableTag
 * @param {string} [baseURL='https://cabletrayroute.com']
 * @returns {string}
 */
export function cableQRPayload(cableTag, baseURL = 'https://cabletrayroute.com') {
  return `${baseURL}/fieldview.html#cable=${encodeURIComponent(cableTag)}`;
}

/**
 * Build a mobile field-view URL for tray QR codes on hardware BOM / tray tags.
 *
 * @param {string} trayId
 * @param {string} [baseURL='https://cabletrayroute.com']
 * @returns {string}
 */
export function trayQRPayload(trayId, baseURL = 'https://cabletrayroute.com') {
  return `${baseURL}/fieldview.html#tray=${encodeURIComponent(trayId)}`;
}

// ---------------------------------------------------------------------------
// Route signature — canonical key for grouping cables by shared path
// ---------------------------------------------------------------------------

/**
 * Build a route signature string from a cable's breakdown segments.
 * Two cables with the same signature traverse the same raceways in
 * the same order, so they can be pulled together.
 *
 * Field-route segments are included using their rounded start/end coords
 * so that cables sharing the same open-air run are still grouped.
 *
 * @param {Array} breakdown - route breakdown segments
 * @returns {string} pipe-delimited signature
 */
function routeSignature(breakdown) {
  if (!Array.isArray(breakdown) || breakdown.length === 0) return '';
  return breakdown.map(seg => {
    if (seg.conduit_id) {
      const prefix = seg.ductbankTag ? `${seg.ductbankTag}:` : '';
      return `C:${prefix}${seg.conduit_id}`;
    }
    if (seg.tray_id && seg.tray_id !== 'Field Route' && seg.tray_id !== 'N/A') {
      return `T:${seg.tray_id}`;
    }
    // Field segment — use rounded endpoints as key
    const fmt = arr => (arr || []).map(v => Number(v).toFixed(1)).join(',');
    return `F:${fmt(seg.start)}-${fmt(seg.end)}`;
  }).join('|');
}

// ---------------------------------------------------------------------------
// Group cables into pulls
// ---------------------------------------------------------------------------

/**
 * Group routed cables into pulls.
 *
 * A "pull" is a set of cables that:
 *   1. Share the same cable_type (Power, Control, Signal)
 *   2. Traverse the same ordered sequence of raceway segments
 *
 * @param {Array} routeResults - batch routing results (each has .cable,
 *   .breakdown, .total_length, .route_segments, etc.)
 * @param {Array} cableList - full cable schedule entries (each has .name,
 *   .cable_type, .conductors, .conductor_size, .diameter, .weight, etc.)
 * @returns {Array<Pull>} array of pull objects
 */
export function groupCablesIntoPulls(routeResults = [], cableList = []) {
  const cableLookup = new Map(
    cableList.map(c => [c.name || c.tag || c.cable_tag, c])
  );

  // Map: groupKey → { cables, breakdown, signature, cable_type }
  const pullMap = new Map();

  for (const result of routeResults) {
    if (!result || result.status === '✗ Failed' || !Array.isArray(result.breakdown) || result.breakdown.length === 0) {
      continue;
    }

    const cableSpec = cableLookup.get(result.cable) || {};
    const cableType = (cableSpec.cable_type || result.cable_type || 'Power').trim();
    const sig = routeSignature(result.breakdown);
    if (!sig) continue;

    const groupKey = `${cableType}::${sig}`;

    if (!pullMap.has(groupKey)) {
      pullMap.set(groupKey, {
        cable_type: cableType,
        signature: sig,
        cables: [],
        breakdown: result.breakdown,
        total_length: parseFloat(result.total_length) || 0,
        route_segments: result.route_segments || result.breakdown,
      });
    }

    const pull = pullMap.get(groupKey);
    pull.cables.push({
      tag: result.cable,
      cable_type: cableType,
      conductors: cableSpec.conductors || result.conductors || '',
      conductor_size: cableSpec.conductor_size || result.conductor_size || '',
      diameter: parseFloat(cableSpec.diameter) || parseFloat(result.diameter) || 0,
      weight: parseFloat(cableSpec.weight) || parseFloat(result.weight) || 0,
      allowed_cable_group: cableSpec.allowed_cable_group || '',
    });
  }

  // Convert to sorted array and assign pull numbers
  const pulls = [];
  let pullNum = 1;
  for (const [, pull] of pullMap) {
    pulls.push({
      pull_number: pullNum++,
      cable_type: pull.cable_type,
      cable_count: pull.cables.length,
      cables: pull.cables,
      total_length: pull.total_length,
      breakdown: pull.breakdown,
      route_segments: pull.route_segments,
    });
  }

  // Sort: multi-cable pulls first (most value from grouping), then by type
  pulls.sort((a, b) => b.cable_count - a.cable_count || a.cable_type.localeCompare(b.cable_type));

  // Re-number after sort
  pulls.forEach((p, i) => { p.pull_number = i + 1; });

  return pulls;
}

// ---------------------------------------------------------------------------
// Build pull card detail for a single pull
// ---------------------------------------------------------------------------

/**
 * Build a detailed pull card for a single pull (group of cables).
 *
 * @param {Pull} pull - a pull object from groupCablesIntoPulls
 * @returns {PullCard} enriched pull card with tension and route detail
 */
export function buildPullCard(pull) {
  const totalWeight = pull.cables.reduce((sum, c) => {
    const p = Math.max(1, parseInt(c.parallel_count) || 1);
    return sum + (c.weight || 0) * p;
  }, 0);
  const maxDiameter = Math.max(...pull.cables.map(c => c.diameter || 0), 0);
  const totalArea = pull.cables.reduce((sum, c) => {
    const d = c.diameter || 0;
    const p = Math.max(1, parseInt(c.parallel_count) || 1);
    return sum + Math.PI * (d / 2) ** 2 * p;
  }, 0);
  // Total physical cable count accounts for parallel sets
  const parallelCableCount = pull.cables.reduce((sum, c) => {
    return sum + Math.max(1, parseInt(c.parallel_count) || 1);
  }, 0);

  // Build route description with from/to tags
  const routeSteps = (pull.breakdown || []).map((seg, i) => {
    let elementType = 'Field';
    let elementId = '';
    if (seg.conduit_id) {
      elementType = 'Conduit';
      elementId = seg.ductbankTag ? `${seg.ductbankTag}:${seg.conduit_id}` : seg.conduit_id;
    } else if (seg.tray_id && seg.tray_id !== 'Field Route' && seg.tray_id !== 'N/A') {
      elementType = 'Tray';
      elementId = seg.tray_id;
    }
    const len = parseFloat(seg.length) || 0;
    return {
      step: i + 1,
      type: elementType,
      id: elementId,
      length: Math.round(len * 100) / 100,
      start: seg.start || null,
      end: seg.end || null,
      constructionDetail: constructionDetailFromSegment(seg),
      drawingRef: seg.drawingRef || seg.drawing_ref || '',
      detailRef: seg.detailRef || seg.detail_ref || '',
      labelId: seg.labelId || seg.label_id || '',
      sectionRef: seg.sectionRef || seg.section_ref || '',
      constructionPhase: seg.constructionPhase || seg.construction_phase || '',
      constructionStatus: seg.constructionStatus || seg.construction_status || '',
      installArea: seg.installArea || seg.install_area || '',
      notes: seg.constructionNotes || seg.construction_notes || seg.notes || '',
      raw: seg,
    };
  });

  // Estimate pull tension for the combined cable weight
  const tensionResult = calcPullTension(
    pull.route_segments || [],
    { weight: totalWeight, coeffFriction: 0.35 }
  );

  // Determine from/to from first and last segments
  const firstSeg = pull.breakdown[0];
  const lastSeg = pull.breakdown[pull.breakdown.length - 1];
  const formatPt = pt => {
    if (!pt) return '—';
    return pt.map(v => Number(v).toFixed(1)).join(', ');
  };

  return {
    pull_number: pull.pull_number,
    cable_type: pull.cable_type,
    cable_count: pull.cable_count,
    parallel_cable_count: parallelCableCount,
    cables: pull.cables,
    cable_tags: pull.cables.map(c => c.tag),
    from: formatPt(firstSeg?.start),
    to: formatPt(lastSeg?.end),
    total_length_ft: Math.round(pull.total_length * 100) / 100,
    total_weight_lb_ft: Math.round(totalWeight * 1000) / 1000,
    max_diameter_in: Math.round(maxDiameter * 1000) / 1000,
    total_cross_section_area_sqin: Math.round(totalArea * 10000) / 10000,
    route_steps: routeSteps,
    segment_count: routeSteps.length,
    estimated_tension_lbs: Math.round(tensionResult.totalTension * 10) / 10,
    max_tension_lbs: Math.round(tensionResult.maxTension * 10) / 10,
    max_sidewall_pressure: Math.round((tensionResult.maxSidewallPressure || 0) * 10) / 10,
    route_segments: Array.isArray(pull.route_segments) ? pull.route_segments : [],
    breakdown: Array.isArray(pull.breakdown) ? pull.breakdown : [],
  };
}

// ---------------------------------------------------------------------------
// Build the full pull table (summary of all pulls)
// ---------------------------------------------------------------------------

/**
 * Generate a pull table — a summary list of all pulls with cable groupings,
 * lengths, and tension estimates.
 *
 * @param {Array} routeResults - batch routing results
 * @param {Array} cableList - cable schedule
 * @returns {{ pulls: Array<PullCard>, summary: PullSummary }}
 */
export function buildPullTable(routeResults = [], cableList = []) {
  const groups = groupCablesIntoPulls(routeResults, cableList);
  const pulls = groups.map(g => buildPullCard(g));

  const totalCables = pulls.reduce((s, p) => s + p.cable_count, 0);
  const totalPulls = pulls.length;
  const multiCablePulls = pulls.filter(p => p.cable_count > 1).length;
  const singleCablePulls = pulls.filter(p => p.cable_count === 1).length;

  return {
    pulls,
    summary: {
      total_cables: totalCables,
      total_pulls: totalPulls,
      multi_cable_pulls: multiCablePulls,
      single_cable_pulls: singleCablePulls,
      cables_per_pull_avg: totalPulls > 0 ? Math.round((totalCables / totalPulls) * 10) / 10 : 0,
    },
  };
}
