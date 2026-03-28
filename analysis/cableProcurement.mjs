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

/**
 * Determine conductor material from the size string.
 * Returns "aluminum" if the size contains "AL" (case-insensitive), else "copper".
 *
 * @param {string} conductorSize
 * @returns {"copper"|"aluminum"}
 */
function deriveMaterial(conductorSize) {
  return /AL/i.test(String(conductorSize ?? '')) ? 'aluminum' : 'copper';
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
      if (afterPlacement >= 0 && afterPlacement > reel.size.feet * 0.05) {
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
 * @property {string} spec_key           - "cable_type::conductor_size"
 * @property {string} cable_type
 * @property {string} conductor_size
 * @property {string} conductors
 * @property {string} material
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
 * Cables are grouped by conductor specification (type + size). A field-trim
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
    if (cable && cable.name) cableLookup.set(cable.name, cable);
  }

  // Accumulate cuts per spec_key
  /** @type {Map<string, {cable_type, conductor_size, conductors, material, cuts: ProcurementCut[]}>} */
  const specMap = new Map();

  for (const pull of pulls) {
    const required_ft = pull.total_length * (1 + tolerancePct / 100);

    for (const cable of (pull.cables ?? [])) {
      const spec = cableLookup.get(cable.tag) ?? cable;
      const cable_type     = spec.cable_type     ?? cable.cable_type     ?? 'Unknown';
      const conductor_size = spec.conductor_size ?? cable.conductor_size ?? 'Unknown';
      const conductors     = String(spec.conductors ?? cable.conductors ?? '');
      const material       = deriveMaterial(conductor_size);
      const spec_key       = `${cable_type}::${conductor_size}`;

      if (!specMap.has(spec_key)) {
        specMap.set(spec_key, { cable_type, conductor_size, conductors, material, cuts: [] });
      }

      specMap.get(spec_key).cuts.push({
        pull_number: pull.pull_number,
        cable_tag:   cable.tag,
        length_ft:   Math.round(required_ft * 10) / 10,
      });
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

    const num_reels       = reels.length;
    const total_ordered_ft = num_reels * selectedReelSize.feet;
    const waste_ft        = Math.round((total_ordered_ft - total_required_ft) * 10) / 10;
    const waste_pct       = total_ordered_ft > 0
      ? Math.round((waste_ft / total_ordered_ft) * 10000) / 100
      : 0;

    lineItems.push({
      spec_key,
      cable_type:        spec.cable_type,
      conductor_size:    spec.conductor_size,
      conductors:        spec.conductors,
      material:          spec.material,
      cut_count:         cuts.length,
      cuts,
      total_required_ft,
      selected_reel_size: selectedReelSize,
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
 * @returns {string}
 */
export function exportProcurementCSV(report) {
  const CRLF = '\r\n';

  function esc(v) {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  }

  const header = [
    'Spec Key', 'Cable Type', 'Conductor Size', 'Conductors', 'Material',
    'Cut Count', 'Total Required (ft)', 'Reel Size', 'Num Reels',
    'Total Ordered (ft)', 'Waste (ft)', 'Waste (%)',
  ].map(esc).join(',');

  const rows = (report?.lineItems ?? []).map(li => [
    li.spec_key,
    li.cable_type,
    li.conductor_size,
    li.conductors,
    li.material,
    li.cut_count,
    li.total_required_ft,
    li.selected_reel_size?.name ?? '',
    li.num_reels,
    li.total_ordered_ft,
    li.waste_ft,
    li.waste_pct,
  ].map(esc).join(','));

  const s = report?.summary ?? {};
  const totals = [
    'TOTALS', '', '', '', '',
    s.total_cut_count   ?? 0,
    s.total_required_ft ?? 0,
    '',
    '',
    s.total_ordered_ft  ?? 0,
    s.total_waste_ft    ?? 0,
    s.avg_waste_pct     ?? 0,
  ].map(esc).join(',');

  return [header, ...rows, '', totals].join(CRLF) + CRLF;
}
