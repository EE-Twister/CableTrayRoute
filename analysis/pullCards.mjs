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

import { tracePullTension } from '../src/pullCalc.js';

const DEFAULT_PULL_ASSUMPTIONS = Object.freeze({
  coeffFriction: 0.35,
  allowableTensionLbf: null,
  allowableSidewallPressureLbfFt: null,
  bendRadiusFt: 3,
  bendAngleDeg: 90,
  conduitInnerDiameterIn: null,
  incomingTensionLbf: 0,
  pullDirection: 'auto',
});

const finitePositive = (...values) => {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
};

const finiteNonNegative = (...values) => {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return null;
};

const firstValue = (record, fields) => {
  for (const field of fields) {
    const value = finitePositive(record?.[field]);
    if (value !== null) return { value, field };
  }
  return { value: null, field: null };
};

/**
 * Normalize the cable fields used by pull engineering. Cable Schedule's
 * canonical outside-diameter field is checked first; common imported weight
 * and manufacturer-limit aliases remain supported.
 */
export function normalizePullCable(cable = {}, fallback = {}) {
  const diameter = firstValue(cable, [
    'cable_od',
    'outerDiameterIn',
    'diameter',
    'OD',
    'od',
  ]);
  const weight = firstValue(cable, [
    'weight_lb_ft',
    'weight',
    'weight_lbs_ft',
    'weightLbsPerFt',
    'cable_weight_lb_ft',
  ]);
  const allowableTension = firstValue(cable, [
    'max_tension',
    'maxTension',
    'allowableTension',
    'allowable_tension_lbf',
    'pulling_tension_limit_lbf',
  ]);
  const allowableSidewall = firstValue(cable, [
    'max_sidewall_pressure',
    'maxSidewallPressure',
    'allowableSidewallPressure',
    'allowable_sidewall_pressure_lbf_ft',
  ]);
  return {
    diameter: diameter.value ?? finitePositive(fallback.diameter),
    diameter_source: diameter.field || (finitePositive(fallback.diameter) ? 'route result' : null),
    weight: weight.value ?? finitePositive(fallback.weight),
    weight_source: weight.field || (finitePositive(fallback.weight) ? 'route result' : null),
    allowable_tension_lbf: allowableTension.value,
    allowable_tension_source: allowableTension.field,
    allowable_sidewall_pressure_lbf_ft: allowableSidewall.value,
    allowable_sidewall_source: allowableSidewall.field,
  };
}

export function normalizePullAssumptions(input = {}) {
  const direction = String(input.pullDirection || DEFAULT_PULL_ASSUMPTIONS.pullDirection).toLowerCase();
  return {
    coeffFriction: finitePositive(input.coeffFriction, input.mu)
      ?? DEFAULT_PULL_ASSUMPTIONS.coeffFriction,
    allowableTensionLbf: finitePositive(input.allowableTensionLbf, input.maxTensionLbf),
    allowableSidewallPressureLbfFt: finitePositive(
      input.allowableSidewallPressureLbfFt,
      input.maxSidewallPressureLbfFt
    ),
    bendRadiusFt: finitePositive(input.bendRadiusFt) ?? DEFAULT_PULL_ASSUMPTIONS.bendRadiusFt,
    bendAngleDeg: finitePositive(input.bendAngleDeg) ?? DEFAULT_PULL_ASSUMPTIONS.bendAngleDeg,
    conduitInnerDiameterIn: finitePositive(input.conduitInnerDiameterIn, input.conduitIdIn),
    incomingTensionLbf: finiteNonNegative(input.incomingTensionLbf)
      ?? DEFAULT_PULL_ASSUMPTIONS.incomingTensionLbf,
    pullDirection: ['auto', 'forward', 'reverse'].includes(direction) ? direction : 'auto',
  };
}

function stablePullId(pull) {
  const tags = (pull.cables || []).map(cable => cable.tag).filter(Boolean).sort().join('|');
  const path = routeSignature(pull.breakdown || []);
  let hash = 2166136261;
  const value = `${tags}::${path}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `pull-${(hash >>> 0).toString(36)}`;
}

function reverseSegments(segments = []) {
  return [...segments].reverse().map(segment => ({
    ...segment,
    start: segment?.end ?? segment?.start ?? null,
    end: segment?.start ?? segment?.end ?? null,
  }));
}

function segmentVector(segment) {
  const start = parsePointValue(segment?.start);
  const end = parsePointValue(segment?.end);
  if (!start || !end) return null;
  const vector = end.map((value, index) => value - start[index]);
  const length = Math.hypot(...vector);
  return length > 1e-9 ? { vector, length } : null;
}

function turnAngle(previous, current) {
  const before = segmentVector(previous);
  const after = segmentVector(current);
  if (!before || !after) return 0;
  const dot = before.vector.reduce((sum, value, index) => (
    sum + value * after.vector[index]
  ), 0);
  const cosine = Math.max(-1, Math.min(1, dot / (before.length * after.length)));
  return Math.acos(cosine);
}

function buildEngineeringSegments(segments = [], assumptions) {
  const angle = assumptions.bendAngleDeg * Math.PI / 180;
  const engineeringSegments = [];
  segments.forEach((segment, index) => {
    const type = String(segment?.type || '').toLowerCase();
    const previous = segments[index - 1];
    const previousType = String(previous?.type || '').toLowerCase();
    const detectedTurn = index > 0 && type !== 'bend' && previousType !== 'bend'
      ? turnAngle(previous, segment)
      : 0;
    if (detectedTurn > 1e-6) {
      engineeringSegments.push({
        type: 'bend',
        angle,
        radius: assumptions.bendRadiusFt,
        length: assumptions.bendRadiusFt * angle,
        inferred: true,
        routeStepIndex: index,
      });
    }
    if (type === 'bend') {
      engineeringSegments.push({
        ...segment,
        angle,
        radius: assumptions.bendRadiusFt,
        length: finiteNonNegative(segment.length) ?? assumptions.bendRadiusFt * angle,
        routeStepIndex: index,
      });
    } else {
      engineeringSegments.push({ ...segment, routeStepIndex: index });
    }
  });
  return engineeringSegments;
}

function roundedTrace(trace) {
  return trace.segments.map(segment => ({
    ...segment,
    tensionIn: Math.round(segment.tensionIn * 10) / 10,
    tensionOut: Math.round(segment.tensionOut * 10) / 10,
    sidewallPressure: Math.round((segment.sidewallPressure || 0) * 10) / 10,
    stiffnessLbs: Math.round((segment.stiffnessLbs || 0) * 10) / 10,
  }));
}

function directionResult(segments, cableProps) {
  const trace = tracePullTension(segments, cableProps);
  return {
    totalTension: Math.round(trace.summary.totalTension * 10) / 10,
    maxTension: Math.round(trace.summary.maxTension * 10) / 10,
    maxSidewallPressure: Math.round((trace.summary.maxSidewallPressure || 0) * 10) / 10,
    tensionTrace: roundedTrace(trace).map(segment => ({
      ...segment,
      routeStepIndex: segments[segment.index]?.routeStepIndex ?? segment.index,
      inferredBend: Boolean(segments[segment.index]?.inferred),
    })),
  };
}

/**
 * Screen the classic three-cable conduit-jamming condition. This intentionally
 * does not claim a result for other bundle configurations or materially
 * different cable diameters.
 */
export function evaluateJamRisk(cables = [], conduitInnerDiameterIn) {
  const physicalDiameters = [];
  for (const cable of cables) {
    const count = Math.max(1, parseInt(cable.parallel_count, 10) || 1);
    for (let index = 0; index < count; index += 1) {
      physicalDiameters.push(finitePositive(cable.diameter));
    }
  }
  if (physicalDiameters.length !== 3) {
    return {
      status: 'not-applicable',
      ratio: null,
      message: 'Jam-ratio screening applies only to a three-cable pull.',
    };
  }
  if (physicalDiameters.some(diameter => diameter === null)) {
    return {
      status: 'inputs-required',
      ratio: null,
      message: 'Cable outside diameter is required for jam-ratio screening.',
    };
  }
  const minDiameter = Math.min(...physicalDiameters);
  const maxDiameter = Math.max(...physicalDiameters);
  if (maxDiameter / minDiameter > 1.1) {
    return {
      status: 'engineering-review',
      ratio: null,
      message: 'The three cable diameters differ by more than 10%; use a detailed jamming evaluation.',
    };
  }
  const conduitId = finitePositive(conduitInnerDiameterIn);
  if (!conduitId) {
    return {
      status: 'inputs-required',
      ratio: null,
      message: 'Conduit inside diameter is required for jam-ratio screening.',
    };
  }
  const averageDiameter = physicalDiameters.reduce((sum, value) => sum + value, 0) / 3;
  const ratio = conduitId / averageDiameter;
  const caution = ratio >= 2.8 && ratio <= 3.2;
  return {
    status: caution ? 'caution' : 'clear',
    ratio: Math.round(ratio * 100) / 100,
    message: caution
      ? 'Jam ratio is in the 2.8–3.2 screening band; obtain a detailed cable/conduit jamming check.'
      : 'Jam ratio is outside the 2.8–3.2 screening band.',
  };
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

/**
 * Add QR PNG data URLs to the cable rows in generated pull cards.
 * Each cable already carries the URL to encode as `field_view_url`; this async
 * step only materializes the image data when an export surface needs it.
 *
 * @param {Array} pulls - pull cards from buildPullTable()
 * @param {{ baseURL?: string, generateQRDataURL?: Function }} [options]
 * @returns {Promise<void>} mutates pulls in place
 */
export async function enrichPullCardsWithQR(pulls = [], options = {}) {
  const baseURL = options.baseURL || 'https://cabletrayroute.com';
  const generator = options.generateQRDataURL || generateQRDataURL;
  const seen = new Map();
  const cableRows = (Array.isArray(pulls) ? pulls : []).flatMap(pull => pull.cables || []);
  await Promise.all(cableRows.map(async cable => {
    const tag = cable?.tag;
    if (!tag) return;
    const url = cable.field_view_url || cableQRPayload(tag, baseURL);
    cable.field_view_url = url;
    if (!seen.has(url)) {
      seen.set(url, generator(url));
    }
    cable.qr_data_url = await seen.get(url);
  }));
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
function parsePointValue(value) {
  if (Array.isArray(value)) {
    const parsed = value.map(Number);
    return parsed.length >= 3 && parsed.every(Number.isFinite) ? parsed.slice(0, 3) : null;
  }
  if (typeof value === 'string') {
    const parsed = value.split(',').map(part => Number(part.trim()));
    return parsed.length >= 3 && parsed.every(Number.isFinite) ? parsed.slice(0, 3) : null;
  }
  return null;
}

function normalizeBreakdownSegments(breakdown = [], routeSegments = []) {
  const source = Array.isArray(breakdown) && breakdown.length ? breakdown : routeSegments;
  return (source || []).map((seg, index) => {
    const routeSeg = (routeSegments || [])[index] || {};
    const start = parsePointValue(seg.start) || parsePointValue(seg.from) || parsePointValue(routeSeg.start);
    const end = parsePointValue(seg.end) || parsePointValue(seg.to) || parsePointValue(routeSeg.end);
    return {
      ...seg,
      start,
      end,
      tray_id: seg.tray_id ?? routeSeg.tray_id ?? (seg.type === 'field' ? 'Field Route' : ''),
      conduit_id: seg.conduit_id ?? routeSeg.conduit_id,
      ductbankTag: seg.ductbankTag ?? routeSeg.ductbankTag,
      length: parseFloat(seg.length ?? routeSeg.length) || 0
    };
  });
}

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
    const fmt = arr => (parsePointValue(arr) || []).map(v => Number(v).toFixed(1)).join(',');
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
    cableList.map(c => [c.name || c.tag || c.cable_tag || c.id, c])
  );

  // Map: groupKey → { cables, breakdown, signature, cable_type }
  const pullMap = new Map();

  for (const result of routeResults) {
    const normalizedBreakdown = normalizeBreakdownSegments(result?.breakdown, result?.route_segments);
    if (!result || result.status === '✗ Failed' || normalizedBreakdown.length === 0) {
      continue;
    }

    const cableSpec = cableLookup.get(result.cable) || {};
    const normalizedCable = normalizePullCable(cableSpec, result);
    const cableType = (cableSpec.cable_type || result.cable_type || 'Power').trim();
    const sig = routeSignature(normalizedBreakdown);
    if (!sig) continue;

    const groupKey = `${cableType}::${sig}`;

    if (!pullMap.has(groupKey)) {
      pullMap.set(groupKey, {
        cable_type: cableType,
        signature: sig,
        cables: [],
        breakdown: normalizedBreakdown,
        total_length: parseFloat(result.total_length) || 0,
        route_segments: result.route_segments || normalizedBreakdown,
      });
    }

    const pull = pullMap.get(groupKey);
    pull.cables.push({
      tag: result.cable,
      cable_type: cableType,
      conductors: cableSpec.conductors || result.conductors || '',
      conductor_size: cableSpec.conductor_size || result.conductor_size || '',
      diameter: normalizedCable.diameter,
      diameter_source: normalizedCable.diameter_source,
      weight: normalizedCable.weight,
      weight_source: normalizedCable.weight_source,
      allowable_tension_lbf: normalizedCable.allowable_tension_lbf,
      allowable_tension_source: normalizedCable.allowable_tension_source,
      allowable_sidewall_pressure_lbf_ft: normalizedCable.allowable_sidewall_pressure_lbf_ft,
      allowable_sidewall_source: normalizedCable.allowable_sidewall_source,
      parallel_count: Math.max(
        1,
        parseInt(cableSpec.parallel_count ?? result.parallel_count, 10) || 1
      ),
      allowed_cable_group: cableSpec.allowed_cable_group || '',
      schedule_match: Boolean(cableLookup.get(result.cable)),
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
export function buildPullCard(pull, options = {}) {
  const baseURL = options.baseURL || 'https://cabletrayroute.com';
  const assumptions = normalizePullAssumptions(options.assumptions || options);
  const coverageWarnings = [];
  const missingWeight = pull.cables.filter(cable => !finitePositive(cable.weight));
  const missingDiameter = pull.cables.filter(cable => !finitePositive(cable.diameter));
  pull.cables.forEach(cable => {
    if (!cable.schedule_match) {
      coverageWarnings.push(`${cable.tag}: no matching Cable Schedule record; route-result fallbacks were used.`);
    }
  });
  missingWeight.forEach(cable => {
    coverageWarnings.push(`${cable.tag}: cable weight is missing; tension is not calculated.`);
  });
  missingDiameter.forEach(cable => {
    coverageWarnings.push(`${cable.tag}: cable outside diameter is missing; area and jam checks are incomplete.`);
  });

  const totalWeightValue = pull.cables.reduce((sum, cable) => {
    const count = Math.max(1, parseInt(cable.parallel_count, 10) || 1);
    return sum + Number(cable.weight) * count;
  }, 0);
  const totalWeight = missingWeight.length ? null : totalWeightValue;
  const maxDiameter = missingDiameter.length
    ? null
    : Math.max(...pull.cables.map(cable => Number(cable.diameter)), 0);
  const totalAreaValue = pull.cables.reduce((sum, cable) => {
    const diameter = Number(cable.diameter);
    const count = Math.max(1, parseInt(cable.parallel_count, 10) || 1);
    return sum + Math.PI * (diameter / 2) ** 2 * count;
  }, 0);
  const totalArea = missingDiameter.length ? null : totalAreaValue;
  const parallelCableCount = pull.cables.reduce((sum, cable) => (
    sum + Math.max(1, parseInt(cable.parallel_count, 10) || 1)
  ), 0);

  const sourceBreakdown = pull.breakdown || [];
  const sourceEngineeringSegments = pull.route_segments?.length
    ? pull.route_segments
    : sourceBreakdown;
  const forwardBreakdown = sourceBreakdown.map(segment => ({ ...segment }));
  const reverseBreakdown = reverseSegments(sourceBreakdown);
  const forwardSegments = buildEngineeringSegments(sourceEngineeringSegments, assumptions);
  const reverseEngineeringSegments = buildEngineeringSegments(
    reverseSegments(sourceEngineeringSegments),
    assumptions
  );
  if (!sourceEngineeringSegments.length) {
    coverageWarnings.push('Route engineering segments are missing; tension is not calculated.');
  }

  const cableTensionLimits = pull.cables
    .map(cable => finitePositive(cable.allowable_tension_lbf))
    .filter(value => value !== null);
  const allowableTension = assumptions.allowableTensionLbf
    ?? (cableTensionLimits.length === pull.cables.length ? Math.min(...cableTensionLimits) : null);
  if (!allowableTension) {
    coverageWarnings.push('Allowable pulling tension is missing; the tension result has no pass/fail limit.');
  }

  const cableSidewallLimits = pull.cables
    .map(cable => finitePositive(cable.allowable_sidewall_pressure_lbf_ft))
    .filter(value => value !== null);
  const allowableSidewallPressure = assumptions.allowableSidewallPressureLbfFt
    ?? (cableSidewallLimits.length === pull.cables.length ? Math.min(...cableSidewallLimits) : null);
  if (!allowableSidewallPressure) {
    coverageWarnings.push('Allowable sidewall pressure is missing; the sidewall result has no pass/fail limit.');
  }

  const tensionAvailable = totalWeight !== null && sourceEngineeringSegments.length > 0;
  const cableProps = {
    weight: totalWeight ?? 0,
    coeffFriction: assumptions.coeffFriction,
    incomingTension: assumptions.incomingTensionLbf,
  };
  const forward = tensionAvailable ? directionResult(forwardSegments, cableProps) : null;
  const reverse = tensionAvailable ? directionResult(reverseEngineeringSegments, cableProps) : null;
  const selectedDirection = assumptions.pullDirection === 'forward'
    ? 'forward'
    : assumptions.pullDirection === 'reverse'
      ? 'reverse'
      : reverse && forward && reverse.maxTension < forward.maxTension
        ? 'reverse'
        : 'forward';
  const selectedTension = selectedDirection === 'reverse' ? reverse : forward;
  const selectedBreakdown = selectedDirection === 'reverse' ? reverseBreakdown : forwardBreakdown;

  const routeSteps = selectedBreakdown.map((segment, index) => {
    let elementType = 'Field';
    let elementId = '';
    if (segment.conduit_id) {
      elementType = 'Conduit';
      elementId = segment.ductbankTag
        ? `${segment.ductbankTag}:${segment.conduit_id}`
        : segment.conduit_id;
    } else if (segment.tray_id && segment.tray_id !== 'Field Route' && segment.tray_id !== 'N/A') {
      elementType = 'Tray';
      elementId = segment.tray_id;
    }
    const length = parseFloat(segment.length) || 0;
    return {
      step: index + 1,
      type: elementType,
      id: elementId,
      length: Math.round(length * 100) / 100,
      start: segment.start || null,
      end: segment.end || null,
    };
  });

  const firstSegment = selectedBreakdown[0];
  const lastSegment = selectedBreakdown[selectedBreakdown.length - 1];
  const formatPoint = point => {
    if (!point) return '—';
    return point.map(value => Number(value).toFixed(1)).join(', ');
  };
  const jamCheck = evaluateJamRisk(pull.cables, assumptions.conduitInnerDiameterIn);
  if (['inputs-required', 'engineering-review', 'caution'].includes(jamCheck.status)) {
    coverageWarnings.push(`Jam check: ${jamCheck.message}`);
  }
  const tensionStatus = !selectedTension
    ? 'inputs-required'
    : !allowableTension
      ? 'not-evaluated'
      : selectedTension.maxTension <= allowableTension
        ? 'pass'
        : 'fail';
  const sidewallStatus = !selectedTension
    ? 'inputs-required'
    : !allowableSidewallPressure
      ? 'not-evaluated'
      : selectedTension.maxSidewallPressure <= allowableSidewallPressure
        ? 'pass'
        : 'fail';

  return {
    pull_plan_id: stablePullId(pull),
    pull_number: pull.pull_number,
    cable_type: pull.cable_type,
    cable_count: pull.cable_count,
    parallel_cable_count: parallelCableCount,
    cables: pull.cables.map(cable => ({
      ...cable,
      field_view_url: cableQRPayload(cable.tag, baseURL),
    })),
    cable_tags: pull.cables.map(cable => cable.tag),
    from: formatPoint(firstSegment?.start),
    to: formatPoint(lastSegment?.end),
    total_length_ft: Math.round(pull.total_length * 100) / 100,
    total_weight_lb_ft: totalWeight === null ? null : Math.round(totalWeight * 1000) / 1000,
    max_diameter_in: maxDiameter === null ? null : Math.round(maxDiameter * 1000) / 1000,
    total_cross_section_area_sqin: totalArea === null ? null : Math.round(totalArea * 10000) / 10000,
    route_steps: routeSteps,
    segment_count: routeSteps.length,
    estimated_tension_lbs: selectedTension?.totalTension ?? null,
    max_tension_lbs: selectedTension?.maxTension ?? null,
    max_sidewall_pressure: selectedTension?.maxSidewallPressure ?? null,
    allowable_tension_lbs: allowableTension,
    allowable_sidewall_pressure: allowableSidewallPressure,
    tension_status: tensionStatus,
    sidewall_status: sidewallStatus,
    pull_direction: selectedDirection,
    pull_direction_mode: assumptions.pullDirection,
    direction_label: selectedDirection === 'reverse'
      ? 'Reverse (route end to start)'
      : 'Forward (route start to end)',
    direction_comparison: {
      forward: forward
        ? {
            max_tension_lbs: forward.maxTension,
            max_sidewall_pressure: forward.maxSidewallPressure,
          }
        : null,
      reverse: reverse
        ? {
            max_tension_lbs: reverse.maxTension,
            max_sidewall_pressure: reverse.maxSidewallPressure,
          }
        : null,
    },
    tension_trace: selectedTension?.tensionTrace || [],
    jam_check: jamCheck,
    assumptions,
    coverage_warnings: [...new Set(coverageWarnings)],
    input_coverage_complete: coverageWarnings.length === 0,
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
export function buildPullTable(routeResults = [], cableList = [], options = {}) {
  const groups = groupCablesIntoPulls(routeResults, cableList);
  const pulls = groups.map(group => {
    const pullId = stablePullId(group);
    const savedAssumptions = options.assumptionsByPull?.[pullId];
    return buildPullCard(group, {
      ...options,
      assumptions: savedAssumptions || options.assumptions || options,
    });
  });

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
      pulls_requiring_input: pulls.filter(pull => !pull.input_coverage_complete).length,
    },
  };
}

/**
 * Build the serializable, scenario-aware artifact saved through projectStorage.
 * The keyed shape allows assumptions to survive re-sorting and pull renumbering.
 */
export function createPullPlanArtifact(pulls = [], metadata = {}) {
  const generatedAt = metadata.generatedAt || new Date().toISOString();
  return {
    schemaVersion: 1,
    artifactType: 'cable-pull-plan',
    generatedAt,
    source: metadata.source || 'Pull Cards',
    pulls: Object.fromEntries((Array.isArray(pulls) ? pulls : []).map(pull => [
      pull.pull_plan_id,
      {
        pullPlanId: pull.pull_plan_id,
        pullNumber: pull.pull_number,
        cableTags: [...(pull.cable_tags || [])],
        route: {
          from: pull.from,
          to: pull.to,
          lengthFt: pull.total_length_ft,
          steps: pull.route_steps,
        },
        assumptions: { ...pull.assumptions },
        results: {
          direction: pull.pull_direction,
          directionComparison: pull.direction_comparison,
          estimatedTensionLbf: pull.estimated_tension_lbs,
          maximumTensionLbf: pull.max_tension_lbs,
          allowableTensionLbf: pull.allowable_tension_lbs,
          tensionStatus: pull.tension_status,
          maximumSidewallPressureLbfFt: pull.max_sidewall_pressure,
          allowableSidewallPressureLbfFt: pull.allowable_sidewall_pressure,
          sidewallStatus: pull.sidewall_status,
          jamCheck: pull.jam_check,
        },
        coverageWarnings: [...(pull.coverage_warnings || [])],
      },
    ])),
  };
}
