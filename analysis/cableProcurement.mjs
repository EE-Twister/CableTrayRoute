/**
 * Ordered-Length Cable Procurement Schedule
 *
 * Groups routed cables by conductor specification and assigns them to
 * standard reel lengths using a greedy first-fit-decreasing bin-packing
 * algorithm to minimise offcut waste.
 *
 * References:
 *   IEEE Std 1185 §6.4 — Field-trim allowance for cable installation
 *   ICEA S-93-639       — Standard reel lengths for power cables
 *   NEC Article 310     — Conductors for general wiring
 */

import { groupCablesIntoPulls } from './pullCards.mjs';

// ---------------------------------------------------------------------------
// Standard reel sizes
// ---------------------------------------------------------------------------

/**
 * Default standard reel sizes available from cable manufacturers.
 * Users may pass a custom subset via the `reelSizes` option.
 *
 * @type {Array<{name: string, feet: number}>}
 */
export const STANDARD_REEL_SIZES = [
  { name: '100 ft',  feet: 100  },
  { name: '250 ft',  feet: 250  },
  { name: '500 ft',  feet: 500  },
  { name: '1000 ft', feet: 1000 },
  { name: '2500 ft', feet: 2500 },
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const UNKNOWN_SPEC_VALUE = 'Unspecified';

const SPEC_FIELDS = [
  ['type', 'cable_type'],
  ['conductors', 'conductors'],
  ['size', 'conductor_size'],
  ['material', 'material'],
  ['rating_v', 'cable_rating'],
  ['insulation', 'insulation_type'],
  ['insulation_c', 'insulation_rating'],
  ['jacket', 'shielding_jacket'],
  ['egc_size', 'ground_size'],
  ['egc_material', 'ground_material'],
  ['manufacturer', 'manufacturer'],
  ['model', 'model'],
];

export const PROCUREMENT_STATUSES = [
  'Planning',
  'RFQ',
  'Quoted',
  'Approved',
  'Ordered',
  'Partially Received',
  'Received',
  'On Hold',
  'Cancelled',
];

function textValue(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function normalizedKeyValue(value) {
  return textValue(value, UNKNOWN_SPEC_VALUE)
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeMaterial(value, conductorSize = '') {
  const normalized = textValue(value).toLowerCase();
  if (['cu', 'copper'].includes(normalized)) return 'Copper';
  if (['al', 'aluminum', 'aluminium'].includes(normalized)) return 'Aluminum';
  if (normalized) return textValue(value);
  if (/\b(?:al|aluminum|aluminium)\b/i.test(String(conductorSize ?? ''))) return 'Aluminum';
  return UNKNOWN_SPEC_VALUE;
}

function resolveCableTag(cable) {
  return textValue(cable?.name ?? cable?.tag ?? cable?.cable_tag);
}

/**
 * Resolve the product-defining fields used for procurement grouping.
 *
 * Legacy aliases remain supported, but an absent material is no longer silently
 * treated as copper. A material suffix in the conductor-size text can be used as
 * a compatibility fallback and is reported through the coverage warnings.
 *
 * @param {Object} cable
 * @returns {Object}
 */
export function resolveProcurementSpec(cable = {}) {
  const conductorSize = textValue(cable.conductor_size ?? cable.size, UNKNOWN_SPEC_VALUE);
  const explicitMaterial = textValue(
    cable.conductor_material ?? cable.conductorMaterial ?? cable.material
  );
  const material = normalizeMaterial(explicitMaterial, conductorSize);
  return {
    cable_type: textValue(cable.cable_type ?? cable.type, UNKNOWN_SPEC_VALUE),
    conductors: textValue(cable.conductors ?? cable.conductor_count, UNKNOWN_SPEC_VALUE),
    conductor_size: conductorSize,
    material,
    cable_rating: textValue(
      cable.cable_rating ?? cable.voltage_rating ?? cable.rated_voltage,
      UNKNOWN_SPEC_VALUE
    ),
    insulation_type: textValue(cable.insulation_type ?? cable.insulation, UNKNOWN_SPEC_VALUE),
    insulation_rating: textValue(
      cable.insulation_rating ?? cable.temperature_rating,
      UNKNOWN_SPEC_VALUE
    ),
    shielding_jacket: textValue(
      cable.shielding_jacket ?? cable.jacket ?? cable.shielding,
      UNKNOWN_SPEC_VALUE
    ),
    ground_size: textValue(cable.ground_size, UNKNOWN_SPEC_VALUE),
    ground_material: normalizeMaterial(cable.ground_material),
    manufacturer: textValue(cable.manufacturer, UNKNOWN_SPEC_VALUE),
    model: textValue(
      cable.model ?? cable.catalog_number ?? cable.catalogNumber,
      UNKNOWN_SPEC_VALUE
    ),
    _material_source: explicitMaterial
      ? 'schedule'
      : (material !== UNKNOWN_SPEC_VALUE ? 'size-fallback' : 'missing'),
  };
}

/**
 * Return a deterministic versioned key for a commercially distinct cable.
 *
 * @param {Object} spec
 * @returns {string}
 */
export function buildProcurementSpecKey(spec = {}) {
  const fields = SPEC_FIELDS.map(([label, key]) => (
    `${label}=${encodeURIComponent(normalizedKeyValue(spec[key]))}`
  ));
  return `v2::${fields.join('|')}`;
}

function makeCoverageWarning(code, severity, cableTag, message, fields = []) {
  return { code, severity, cable_tag: cableTag, message, fields };
}

function evaluateSpecCoverage(cableTag, spec, matchedSchedule) {
  const warnings = [];
  if (!matchedSchedule) {
    warnings.push(makeCoverageWarning(
      'missing-schedule-record',
      'error',
      cableTag,
      `${cableTag || 'A routed cable'} is not linked to a Cable Schedule record.`,
      ['cable_tag']
    ));
  }
  if (spec._material_source === 'size-fallback') {
    warnings.push(makeCoverageWarning(
      'material-from-size-fallback',
      'warning',
      cableTag,
      `${cableTag}: conductor material was inferred from the legacy size text; confirm it in Cable Schedule.`,
      ['conductor_material']
    ));
  } else if (spec.material === UNKNOWN_SPEC_VALUE) {
    warnings.push(makeCoverageWarning(
      'missing-conductor-material',
      'error',
      cableTag,
      `${cableTag}: conductor material is required for procurement grouping.`,
      ['conductor_material']
    ));
  }

  const requiredFields = [
    ['cable_type', 'cable type'],
    ['conductors', 'conductor count'],
    ['conductor_size', 'conductor size'],
    ['cable_rating', 'cable voltage rating'],
    ['insulation_type', 'insulation type'],
    ['insulation_rating', 'insulation temperature rating'],
  ];
  for (const [field, label] of requiredFields) {
    if (spec[field] !== UNKNOWN_SPEC_VALUE) continue;
    warnings.push(makeCoverageWarning(
      `missing-${field.replaceAll('_', '-')}`,
      'error',
      cableTag,
      `${cableTag}: ${label} is required to distinguish purchasable cable.`,
      [field]
    ));
  }
  if (spec.manufacturer === UNKNOWN_SPEC_VALUE || spec.model === UNKNOWN_SPEC_VALUE) {
    warnings.push(makeCoverageWarning(
      'missing-catalog-identity',
      'warning',
      cableTag,
      `${cableTag}: manufacturer/model is not assigned; the line item is specification-based only.`,
      ['manufacturer', 'model']
    ));
  }
  return warnings;
}

/**
 * Build an empty procurement report structure.
 *
 * @param {{tolerancePct: number, reelSizes: Array}} opts
 * @returns {ProcurementReport}
 */
function emptyReport(opts) {
  return {
    lineItems: [],
    warnings: [],
    coverage: {
      routed_cables: 0,
      matched_schedule_cables: 0,
      complete_spec_cables: 0,
      error_count: 0,
      warning_count: 0,
      procurement_ready: false,
    },
    summary: {
      total_line_items: 0,
      total_cut_count:  0,
      total_required_ft: 0,
      total_ordered_ft:  0,
      total_waste_ft:    0,
      avg_waste_pct:     0,
    },
    options: opts,
  };
}

function nowIso(now) {
  if (typeof now === 'string' && now.trim()) return now;
  if (now instanceof Date && !Number.isNaN(now.getTime())) return now.toISOString();
  return new Date().toISOString();
}

function lineItemSnapshot(lineItem = {}) {
  return {
    spec_key: textValue(lineItem.spec_key),
    legacy_spec_key: textValue(lineItem.legacy_spec_key),
    cable_type: textValue(lineItem.cable_type),
    conductor_size: textValue(lineItem.conductor_size),
    conductors: textValue(lineItem.conductors),
    material: textValue(lineItem.material),
    cable_rating: textValue(lineItem.cable_rating),
    insulation_type: textValue(lineItem.insulation_type),
    insulation_rating: textValue(lineItem.insulation_rating),
    shielding_jacket: textValue(lineItem.shielding_jacket),
    manufacturer: textValue(lineItem.manufacturer),
    model: textValue(lineItem.model),
    cut_count: Math.max(0, Number(lineItem.cut_count) || 0),
    total_required_ft: Math.max(0, Number(lineItem.total_required_ft) || 0),
    planned_order_ft: Math.max(0, Number(lineItem.total_ordered_ft) || 0),
  };
}

function normalizeRegisterStatus(value) {
  const normalized = textValue(value).toLowerCase();
  return PROCUREMENT_STATUSES.find(status => status.toLowerCase() === normalized)
    ?? 'Planning';
}

function optionalNonnegativeNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

/**
 * Normalize procurement tracking records loaded from older project payloads.
 *
 * @param {Array} records
 * @returns {Array}
 */
export function normalizeProcurementRegister(records = []) {
  if (!Array.isArray(records)) return [];
  return records
    .filter(record => record && typeof record === 'object')
    .map(record => ({
      ...record,
      spec_key: textValue(record.spec_key),
      legacy_spec_key: textValue(record.legacy_spec_key),
      vendor: textValue(record.vendor),
      quote_number: textValue(record.quote_number),
      quote_date: textValue(record.quote_date),
      need_by_date: textValue(record.need_by_date),
      lead_time_weeks: optionalNonnegativeNumber(record.lead_time_weeks),
      po_number: textValue(record.po_number),
      po_date: textValue(record.po_date),
      status: normalizeRegisterStatus(record.status),
      promised_delivery_date: textValue(record.promised_delivery_date),
      actual_delivery_date: textValue(record.actual_delivery_date),
      ordered_quantity_ft: optionalNonnegativeNumber(record.ordered_quantity_ft),
      received_quantity_ft: optionalNonnegativeNumber(record.received_quantity_ft),
      received_date: textValue(record.received_date),
      notes: textValue(record.notes),
      schedule_state: record.schedule_state === 'inactive' ? 'inactive' : 'active',
      created_at: textValue(record.created_at),
      updated_at: textValue(record.updated_at),
    }))
    .filter(record => record.spec_key || record.legacy_spec_key);
}

/**
 * Merge a generated schedule into the saved procurement register.
 *
 * Existing commercial tracking fields survive recalculation. Records created by
 * the legacy type/size grouping are matched once through `legacy_spec_key`; any
 * ambiguous remainder is retained as inactive rather than discarded.
 *
 * @param {ProcurementLineItem[]} lineItems
 * @param {Array} existingRecords
 * @param {{now?: string|Date}} options
 * @returns {Array}
 */
export function reconcileProcurementRegister(lineItems = [], existingRecords = [], options = {}) {
  const stamp = nowIso(options.now);
  const existing = normalizeProcurementRegister(existingRecords);
  const claimed = new Set();

  const active = (Array.isArray(lineItems) ? lineItems : []).map(lineItem => {
    let index = existing.findIndex((record, candidateIndex) => (
      !claimed.has(candidateIndex)
      && record.spec_key
      && record.spec_key === lineItem.spec_key
    ));
    if (index < 0 && lineItem.legacy_spec_key) {
      index = existing.findIndex((record, candidateIndex) => (
        !claimed.has(candidateIndex)
        && (record.spec_key === lineItem.legacy_spec_key
          || record.legacy_spec_key === lineItem.legacy_spec_key)
      ));
    }
    if (index >= 0) claimed.add(index);

    const previous = index >= 0 ? existing[index] : {};
    const snapshot = lineItemSnapshot(lineItem);
    return {
      ...previous,
      ...snapshot,
      status: normalizeRegisterStatus(previous.status),
      ordered_quantity_ft: previous.ordered_quantity_ft ?? snapshot.planned_order_ft,
      schedule_state: 'active',
      created_at: previous.created_at || stamp,
      updated_at: previous.updated_at || stamp,
      schedule_updated_at: stamp,
    };
  });

  const inactive = existing
    .filter((record, index) => !claimed.has(index))
    .map(record => ({ ...record, schedule_state: 'inactive' }));

  return [...active, ...inactive];
}

/**
 * Assign a list of cut lengths to reels using greedy first-fit-decreasing
 * bin-packing.
 *
 * A reel is considered "full" (and no further cuts attempted on it) when the
 * remaining capacity is ≤ 5% of the reel's total size — this avoids a tiny
 * sliver being left open, which would distort reel counts.
 *
 * @param {number[]} cutLengths  - Required lengths in feet (unsorted)
 * @param {Array<{name: string, feet: number}>} reelSizes - Available sizes, sorted ascending
 * @returns {{reels: Array<{size: {name,feet}, used: number}>, selectedReelSize: {name,feet}}}
 */
function packIntoReels(cutLengths, reelSizes) {
  // Sort cuts largest-first (First-Fit Decreasing)
  const sorted = [...cutLengths].sort((a, b) => b - a);
  const sizesSorted = [...reelSizes].sort((a, b) => a.feet - b.feet);
  const largest = sizesSorted[sizesSorted.length - 1];

  /** @type {Array<{size: {name,feet}, remaining: number}>} */
  const openReels = [];

  for (const cut of sorted) {
    let placed = false;

    // Try to place on an existing open reel
    for (const reel of openReels) {
      const afterPlacement = reel.remaining - cut;
      if (afterPlacement >= 0) {
        reel.remaining -= cut;
        placed = true;
        break;
      }
    }

    if (!placed) {
      if (cut > largest.feet) {
        // Cut exceeds every reel size — fill as many largest-size reels as needed
        const reelsNeeded = Math.ceil(cut / largest.feet);
        const totalCapacity = reelsNeeded * largest.feet;
        // Track as a single virtual reel entry using a sentinel remaining value
        openReels.push({ size: largest, remaining: totalCapacity - cut, _count: reelsNeeded });
      } else {
        // Open the smallest reel that fits this cut
        const suitable = sizesSorted.find(s => s.feet >= cut);
        openReels.push({ size: suitable, remaining: suitable.feet - cut });
      }
    }
  }

  // Determine dominant reel size (mode), accounting for multi-reel entries
  const counts = new Map();
  for (const r of openReels) {
    const n = r._count ?? 1;
    counts.set(r.size.name, (counts.get(r.size.name) ?? 0) + n);
  }
  let selectedReelSize = largest;
  let maxCount = 0;
  for (const [name, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      selectedReelSize = sizesSorted.find(s => s.name === name) ?? largest;
    }
  }

  // Expand multi-reel entries into individual reel records for consistent counting
  const expandedReels = [];
  for (const r of openReels) {
    const n = r._count ?? 1;
    if (n === 1) {
      expandedReels.push({ size: r.size, used: r.size.feet - r.remaining });
    } else {
      // Fill completely-used reels plus one partial (last) reel
      const totalUsed = r._count * r.size.feet - r.remaining;
      for (let i = 0; i < n; i++) {
        const used = Math.min(r.size.feet, Math.max(0, totalUsed - i * r.size.feet));
        expandedReels.push({ size: r.size, used });
      }
    }
  }

  return {
    reels: expandedReels,
    selectedReelSize,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ProcurementCut
 * @property {number} pull_number
 * @property {string} cable_tag
 * @property {number} length_ft
 */

/**
 * @typedef {Object} ProcurementLineItem
 * @property {string} spec_key           - Versioned canonical cable-product key
 * @property {string} legacy_spec_key    - Legacy "cable_type::conductor_size" key
 * @property {string} cable_type
 * @property {string} conductor_size
 * @property {string} conductors
 * @property {string} material
 * @property {string} cable_rating
 * @property {string} insulation_type
 * @property {string} insulation_rating
 * @property {string} shielding_jacket
 * @property {string} manufacturer
 * @property {string} model
 * @property {number} cut_count
 * @property {ProcurementCut[]} cuts
 * @property {number} total_required_ft
 * @property {{name: string, feet: number}} selected_reel_size
 * @property {number} num_reels
 * @property {number} total_ordered_ft
 * @property {number} waste_ft
 * @property {number} waste_pct
 */

/**
 * @typedef {Object} ProcurementReport
 * @property {ProcurementLineItem[]} lineItems
 * @property {{total_line_items, total_cut_count, total_required_ft, total_ordered_ft, total_waste_ft, avg_waste_pct}} summary
 * @property {{tolerancePct: number, reelSizes: Array}} options
 */

/**
 * Generate an ordered-length cable procurement schedule.
 *
 * Cables are grouped by normalized commercial construction, rating, and catalog identity;
 * tolerance is added to each cable's routed length per IEEE 1185 §6.4.
 * The resulting cut lengths are assigned to standard reels using greedy
 * first-fit-decreasing bin-packing to minimise waste.
 *
 * @param {Array}  routeResults - Route results array (same format as pullCards)
 * @param {Array}  cableList    - Cable schedule array (same format as pullCards)
 * @param {Object} [options]
 * @param {number} [options.tolerancePct=3]          - Field-trim tolerance percentage
 * @param {Array}  [options.reelSizes=STANDARD_REEL_SIZES] - Reel sizes to use
 * @returns {ProcurementReport}
 */
export function calculateProcurement(routeResults = [], cableList = [], options = {}) {
  const tolerancePct = options.tolerancePct ?? 3;
  const reelSizes    = (options.reelSizes && options.reelSizes.length > 0)
    ? options.reelSizes
    : STANDARD_REEL_SIZES;

  const opts = { tolerancePct, reelSizes };

  if (!Array.isArray(routeResults) || routeResults.length === 0) {
    return emptyReport(opts);
  }

  // Group cables into pulls (reuses pullCards logic for route grouping)
  const pulls = groupCablesIntoPulls(routeResults, cableList);
  if (!pulls || pulls.length === 0) {
    return emptyReport(opts);
  }

  // Build a lookup: cable tag → cable spec (from cableList)
  const cableLookup = new Map();
  for (const cable of (cableList ?? [])) {
    const cableTag = resolveCableTag(cable);
    if (cableTag) cableLookup.set(cableTag, cable);
  }

  // Accumulate cuts per spec_key
  /** @type {Map<string, Object>} */
  const specMap = new Map();
  const warnings = [];
  const routedCableTags = new Set();
  const matchedScheduleTags = new Set();
  const completeSpecTags = new Set();
  const routeResultByTag = new Map(
    routeResults
      .filter(result => result && result.cable)
      .map(result => [textValue(result.cable), result])
  );

  for (const pull of pulls) {
    for (const cable of (pull.cables ?? [])) {
      const cableTag = resolveCableTag(cable);
      const scheduleCable = cableLookup.get(cableTag);
      const cableRecord = scheduleCable ?? cable;
      const resolvedSpec = resolveProcurementSpec(cableRecord);
      const spec_key = buildProcurementSpecKey(resolvedSpec);
      const legacy_spec_key = `${resolvedSpec.cable_type}::${resolvedSpec.conductor_size}`;
      const cableWarnings = evaluateSpecCoverage(cableTag, resolvedSpec, Boolean(scheduleCable));
      const routeLength = Number(routeResultByTag.get(cableTag)?.total_length);
      if (!Number.isFinite(routeLength) || routeLength <= 0) {
        cableWarnings.push(makeCoverageWarning(
          'invalid-route-length',
          'error',
          cableTag,
          `${cableTag}: a positive routed length is required for ordered-length planning.`,
          ['total_length']
        ));
      }
      const hasCoverageError = cableWarnings.some(warning => warning.severity === 'error');
      routedCableTags.add(cableTag);
      if (scheduleCable) matchedScheduleTags.add(cableTag);
      if (!hasCoverageError) completeSpecTags.add(cableTag);
      warnings.push(...cableWarnings);

      if (!specMap.has(spec_key)) {
        specMap.set(spec_key, {
          ...resolvedSpec,
          legacy_spec_key,
          cuts: [],
        });
      }

      const parallelCount = Math.max(
        1,
        parseInt(cableRecord.parallel_count ?? cable.parallel_count, 10) || 1
      );
      const required_ft = Math.max(0, routeLength || 0) * (1 + tolerancePct / 100);
      for (let parallelRun = 1; parallelRun <= parallelCount; parallelRun++) {
        specMap.get(spec_key).cuts.push({
          pull_number: pull.pull_number,
          cable_tag: cableTag,
          parallel_run: parallelRun,
          length_ft: Math.round(required_ft * 10) / 10,
        });
      }
    }
  }

  if (specMap.size === 0) {
    return emptyReport(opts);
  }

  // Build line items
  const lineItems = [];

  for (const [spec_key, spec] of specMap) {
    const cuts = spec.cuts;
    const total_required_ft = Math.round(cuts.reduce((s, c) => s + c.length_ft, 0) * 10) / 10;

    const { reels, selectedReelSize } = packIntoReels(cuts.map(c => c.length_ft), reelSizes);

    const num_reels = reels.length;
    const total_ordered_ft = reels.reduce((sum, reel) => sum + reel.size.feet, 0);
    const waste_ft        = Math.round((total_ordered_ft - total_required_ft) * 10) / 10;
    const waste_pct       = total_ordered_ft > 0
      ? Math.round((waste_ft / total_ordered_ft) * 10000) / 100
      : 0;

    lineItems.push({
      spec_key,
      legacy_spec_key:     spec.legacy_spec_key,
      cable_type:        spec.cable_type,
      conductor_size:    spec.conductor_size,
      conductors:        spec.conductors,
      material:          spec.material,
      cable_rating:      spec.cable_rating,
      insulation_type:   spec.insulation_type,
      insulation_rating: spec.insulation_rating,
      shielding_jacket:  spec.shielding_jacket,
      ground_size:       spec.ground_size,
      ground_material:   spec.ground_material,
      manufacturer:      spec.manufacturer,
      model:             spec.model,
      cut_count:         cuts.length,
      cuts,
      total_required_ft,
      selected_reel_size: selectedReelSize,
      reel_assignments: reels,
      num_reels,
      total_ordered_ft,
      waste_ft:          Math.max(0, waste_ft),
      waste_pct:         Math.max(0, waste_pct),
    });
  }

  // Sort by cable_type then conductor_size for consistent output
  lineItems.sort((a, b) => {
    if (a.cable_type !== b.cable_type) return a.cable_type.localeCompare(b.cable_type);
    return a.conductor_size.localeCompare(b.conductor_size);
  });

  // Build summary
  const total_cut_count   = lineItems.reduce((s, li) => s + li.cut_count, 0);
  const total_required_ft = Math.round(lineItems.reduce((s, li) => s + li.total_required_ft, 0) * 10) / 10;
  const total_ordered_ft  = lineItems.reduce((s, li) => s + li.total_ordered_ft, 0);
  const total_waste_ft    = Math.round(lineItems.reduce((s, li) => s + li.waste_ft, 0) * 10) / 10;
  const avg_waste_pct     = total_ordered_ft > 0
    ? Math.round((total_waste_ft / total_ordered_ft) * 10000) / 100
    : 0;

  return {
    lineItems,
    warnings,
    coverage: {
      routed_cables: routedCableTags.size,
      matched_schedule_cables: matchedScheduleTags.size,
      complete_spec_cables: completeSpecTags.size,
      error_count: warnings.filter(warning => warning.severity === 'error').length,
      warning_count: warnings.filter(warning => warning.severity === 'warning').length,
      procurement_ready: warnings.every(warning => warning.severity !== 'error'),
    },
    summary: {
      total_line_items:  lineItems.length,
      total_cut_count,
      total_required_ft,
      total_ordered_ft,
      total_waste_ft,
      avg_waste_pct,
    },
    options: opts,
  };
}

/**
 * Export a procurement report as a CSV string.
 *
 * Produces a header row, one data row per line item, a blank separator, and
 * a totals row. Uses CRLF line endings for spreadsheet compatibility.
 *
 * @param {ProcurementReport} report
 * @param {Array} [register=[]] - Persisted commercial tracking records
 * @returns {string}
 */
export function exportProcurementCSV(report, register = []) {
  const CRLF = '\r\n';

  function esc(v) {
    const raw = String(v ?? '');
    const s = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')
      ? `"${s.replace(/"/g, '""')}"` : s;
  }

  const headerFields = [
    'Spec Key', 'Cable Type', 'Conductor Size', 'Conductors', 'Material',
    'Cable Rating (V)', 'Insulation Type', 'Insulation Rating (C)',
    'Shielding/Jacket', 'EGC Size', 'EGC Material', 'Manufacturer', 'Model',
    'Cut Count', 'Total Required (ft)', 'Reel Size', 'Num Reels',
    'Total Ordered (ft)', 'Waste (ft)', 'Waste (%)',
    'Vendor', 'Quote Number', 'Quote Date', 'Need By Date', 'Lead Time (weeks)',
    'PO Number', 'PO Date', 'Status', 'Promised Delivery', 'Actual Delivery',
    'Ordered Quantity (ft)', 'Received Quantity (ft)', 'Received Date', 'Notes',
  ];
  const header = headerFields.map(esc).join(',');
  const registerByKey = new Map(
    normalizeProcurementRegister(register)
      .filter(record => record.schedule_state !== 'inactive')
      .map(record => [record.spec_key, record])
  );

  const rows = (report?.lineItems ?? []).map(li => {
    const tracker = registerByKey.get(li.spec_key) ?? {};
    return [
      li.spec_key,
      li.cable_type,
      li.conductor_size,
      li.conductors,
      li.material,
      li.cable_rating,
      li.insulation_type,
      li.insulation_rating,
      li.shielding_jacket,
      li.ground_size,
      li.ground_material,
      li.manufacturer,
      li.model,
      li.cut_count,
      li.total_required_ft,
      li.selected_reel_size?.name ?? '',
      li.num_reels,
      li.total_ordered_ft,
      li.waste_ft,
      li.waste_pct,
      tracker.vendor,
      tracker.quote_number,
      tracker.quote_date,
      tracker.need_by_date,
      tracker.lead_time_weeks,
      tracker.po_number,
      tracker.po_date,
      tracker.status,
      tracker.promised_delivery_date,
      tracker.actual_delivery_date,
      tracker.ordered_quantity_ft,
      tracker.received_quantity_ft,
      tracker.received_date,
      tracker.notes,
    ].map(esc).join(',');
  });

  const s = report?.summary ?? {};
  const totalFields = new Array(headerFields.length).fill('');
  totalFields[0] = 'TOTALS';
  totalFields[13] = s.total_cut_count ?? 0;
  totalFields[14] = s.total_required_ft ?? 0;
  totalFields[17] = s.total_ordered_ft ?? 0;
  totalFields[18] = s.total_waste_ft ?? 0;
  totalFields[19] = s.avg_waste_pct ?? 0;
  const totals = totalFields.map(esc).join(',');

  return [header, ...rows, '', totals].join(CRLF) + CRLF;
}
