/**
 * Prefabrication Spool Sheet Generator
 *
 * Groups cable tray segments into prefabricated assemblies ("spools") based on
 * area, elevation, and connectivity, then generates per-spool material lists
 * with straight sections, fittings, support brackets, and assigned cables.
 *
 * Industry background:
 *   Trimble SysQue and Bentley Raceway both support LOD-400 spool sheet output.
 *   Prefabrication reduces field labour by 30-50 % for structured raceway runs
 *   (BICSI TDM-1 §12, NEMA VE 2 §9).
 *
 * References:
 *   NEMA VE 1-2017 §4  — Load Classification / Span
 *   NEMA VE 2-2013 §9  — Prefabrication guidelines
 *   BICSI TDM-1 §12    — Raceway installation
 */

/** Standard tray section length (ft). */
const DEFAULT_SECTION_LEN = 12;

/** Typical self-weight of a tray (lbs/ft) used when cable weight is unknown. */
const TRAY_SELF_WEIGHT_LB_FT = 2;

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function trayLength(tray) {
  const dx = (parseFloat(tray.end_x) || 0) - (parseFloat(tray.start_x) || 0);
  const dy = (parseFloat(tray.end_y) || 0) - (parseFloat(tray.start_y) || 0);
  const dz = (parseFloat(tray.end_z) || 0) - (parseFloat(tray.start_z) || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Average Z (elevation) of a tray segment. */
function trayElevation(tray) {
  return ((parseFloat(tray.start_z) || 0) + (parseFloat(tray.end_z) || 0)) / 2;
}

/** Midpoint of a tray segment (used for grouping). */
function trayMidpoint(tray) {
  return {
    x: ((parseFloat(tray.start_x) || 0) + (parseFloat(tray.end_x) || 0)) / 2,
    y: ((parseFloat(tray.start_y) || 0) + (parseFloat(tray.end_y) || 0)) / 2,
    z: ((parseFloat(tray.start_z) || 0) + (parseFloat(tray.end_z) || 0)) / 2,
  };
}

// ---------------------------------------------------------------------------
// Spool grouping logic
// ---------------------------------------------------------------------------

/**
 * Assign trays to spool groups based on:
 *   1. Elevation band  (rounded to nearest 2 ft)
 *   2. Width match     (trays of the same width group together)
 *   3. Spatial proximity in plan (grid cell 20 ft × 20 ft)
 *
 * @param {object[]} trays   Raceway schedule rows.
 * @param {object}   options
 * @param {number}   [options.gridCellFt=20]       Grouping grid cell size (ft).
 * @param {number}   [options.elevBandFt=2]        Elevation band rounding (ft).
 * @param {number}   [options.maxSpoolSegments=10] Max segments per spool.
 * @returns {Map<string, object[]>}  Map of spoolKey → array of trays.
 */
function assignSpools(trays, options = {}) {
  const gridCell = options.gridCellFt    ?? 20;
  const elevBand = options.elevBandFt    ?? 2;
  const maxSegs  = options.maxSpoolSegments ?? 10;

  const spoolMap = new Map();

  for (const tray of trays) {
    const mid  = trayMidpoint(tray);
    const elev = trayElevation(tray);
    const w    = Math.round(parseFloat(tray.inside_width) || 12);

    const gridX = Math.floor(mid.x / gridCell);
    const gridY = Math.floor(mid.y / gridCell);
    const band  = Math.round(elev / elevBand);

    let spoolKey = `W${w}-E${band}-G${gridX}_${gridY}`;

    // If the current group is full, append a sequence suffix
    let seq = 0;
    while (true) {
      const key = seq === 0 ? spoolKey : `${spoolKey}-${seq}`;
      if (!spoolMap.has(key)) {
        spoolMap.set(key, [tray]);
        break;
      }
      const group = spoolMap.get(key);
      if (group.length < maxSegs) {
        group.push(tray);
        break;
      }
      seq++;
    }
  }

  return spoolMap;
}

// ---------------------------------------------------------------------------
// Per-spool material calculation
// ---------------------------------------------------------------------------

/**
 * Calculate materials for a single spool assembly.
 *
 * @param {string}   spoolId   Human-readable spool identifier.
 * @param {object[]} trays     Tray segments in this spool.
 * @param {object[]} cables    All cables (filtered by route_preference).
 * @param {object}   opts
 * @param {number}   [opts.sectionLengthFt=12]  Standard section length.
 * @returns {SpoolSheet}
 *
 * @typedef {{
 *   spoolId:         string,
 *   trayCount:       number,
 *   totalLengthFt:   number,
 *   width_in:        number,
 *   straightSections: number,
 *   bracketCount:    number,
 *   estimatedWeight: number,
 *   cables:          SpoolCable[],
 *   trayIds:         string[],
 * }} SpoolSheet
 *
 * @typedef {{
 *   cable_tag: string,
 *   from:      string,
 *   to:        string,
 *   lengthFt:  number,
 * }} SpoolCable
 */
function calcSpoolSheet(spoolId, trays, cables, opts = {}) {
  const sectionLen = opts.sectionLengthFt ?? DEFAULT_SECTION_LEN;

  let totalLengthFt = 0;
  const trayIds = [];

  for (const t of trays) {
    const len = trayLength(t);
    totalLengthFt += len;
    trayIds.push(t.tray_id);
  }

  const width_in = parseFloat(trays[0]?.inside_width) || 12;

  // Straight sections (ceiling division)
  const straightSections = Math.ceil(totalLengthFt / sectionLen);

  // Support brackets: one per standard span (default 10 ft), minimum 2 per segment
  const BRACKET_SPAN = 10;
  let bracketCount = 0;
  for (const t of trays) {
    const len = trayLength(t);
    bracketCount += Math.max(2, Math.ceil(len / BRACKET_SPAN) + 1);
  }

  // Estimated tray weight (lbs)
  const selfWeightPerFt = TRAY_SELF_WEIGHT_LB_FT + (width_in - 12) * 0.05;
  const estimatedWeight = Math.round(totalLengthFt * selfWeightPerFt);

  // Cables assigned to any tray in this spool
  const trayIdSet = new Set(trayIds);
  const spoolCables = [];
  for (const cable of cables) {
    if (trayIdSet.has(cable.route_preference)) {
      // Use cable length from schedule if available, else estimate from tray
      const cableLenFt = parseFloat(cable.length_ft) || parseFloat(cable.cable_length) || totalLengthFt;
      spoolCables.push({
        cable_tag: cable.cable_tag || cable.tag || cable.id || '—',
        from:      cable.from || cable.source || '—',
        to:        cable.to   || cable.destination || '—',
        lengthFt:  +cableLenFt.toFixed(1),
      });
    }
  }

  return {
    spoolId,
    trayCount:        trays.length,
    totalLengthFt:    +totalLengthFt.toFixed(2),
    width_in,
    straightSections,
    bracketCount,
    estimatedWeight,
    cables:           spoolCables,
    trayIds,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate spool sheets for a complete tray installation.
 *
 * @param {object[]} trays   Raceway schedule rows.
 * @param {object[]} cables  Cable schedule rows.
 * @param {object}   options
 * @param {number}   [options.gridCellFt=20]        Grouping grid cell size (ft).
 * @param {number}   [options.elevBandFt=2]          Elevation band (ft).
 * @param {number}   [options.maxSpoolSegments=10]   Max tray segments per spool.
 * @param {number}   [options.sectionLengthFt=12]    Standard section length (ft).
 * @returns {{ spools: SpoolSheet[], summary: SpoolSummary }}
 *
 * @typedef {{
 *   spoolCount:         number,
 *   totalTrays:         number,
 *   totalLengthFt:      number,
 *   totalSections:      number,
 *   totalBrackets:      number,
 *   totalEstimatedWeight: number,
 *   totalCableEntries:  number,
 * }} SpoolSummary
 */
export function generateSpoolSheets(trays, cables, options = {}) {
  if (!Array.isArray(trays) || trays.length === 0) {
    return {
      spools: [],
      summary: {
        spoolCount: 0, totalTrays: 0, totalLengthFt: 0,
        totalSections: 0, totalBrackets: 0, totalEstimatedWeight: 0,
        totalCableEntries: 0,
      },
    };
  }

  const safeCables = Array.isArray(cables) ? cables : [];
  const spoolMap   = assignSpools(trays, options);

  // Build spool IDs with a human-friendly counter prefix
  let counter = 1;
  const spools = [];
  for (const [, segList] of spoolMap) {
    const id = `SP-${String(counter).padStart(3, '0')}`;
    counter++;
    spools.push(calcSpoolSheet(id, segList, safeCables, options));
  }

  // Sort by spool ID for stable ordering
  spools.sort((a, b) => a.spoolId.localeCompare(b.spoolId));

  const summary = spools.reduce((acc, s) => {
    acc.totalTrays            += s.trayCount;
    acc.totalLengthFt         += s.totalLengthFt;
    acc.totalSections         += s.straightSections;
    acc.totalBrackets         += s.bracketCount;
    acc.totalEstimatedWeight  += s.estimatedWeight;
    acc.totalCableEntries     += s.cables.length;
    return acc;
  }, {
    spoolCount:            spools.length,
    totalTrays:            0,
    totalLengthFt:         0,
    totalSections:         0,
    totalBrackets:         0,
    totalEstimatedWeight:  0,
    totalCableEntries:     0,
  });

  summary.totalLengthFt = +summary.totalLengthFt.toFixed(2);

  return { spools, summary };
}

// ---------------------------------------------------------------------------
// Cable Procurement / Ordered-Length Planning
// ---------------------------------------------------------------------------

/**
 * Build a cable procurement schedule from routed cable lengths.
 *
 * Groups cables by conductor specification (conductors × size × cable_type),
 * applies a field-trim allowance per IEEE 1185 §6.4, then uses a
 * first-fit-decreasing bin-packing algorithm to assign cables to standard
 * reel lengths — minimising offcut waste.
 *
 * @param {Array<{cable: string, total_length: number}>} routeResults
 *   Batch routing results. Each entry must have `.cable` (tag) and
 *   `.total_length` (routed length in ft).
 *
 * @param {Array<{name?: string, tag?: string, cable_tag?: string,
 *   conductors?: number|string, conductor_size?: string, cable_type?: string,
 *   pull_allowance_pct?: number}>} cableList
 *   Full cable schedule. Matched by tag/name.
 *
 * @param {number[]} [reelCatalog=[500,1000,2000,5000]]
 *   Available standard reel lengths in feet, sorted ascending.
 *
 * @returns {Array<{
 *   reelSpec: string,
 *   conductorSpec: string,
 *   standardLengthFt: number,
 *   cableAssignments: Array<{cableTag: string, routedLengthFt: number,
 *                            addedAllowanceFt: number, totalCutFt: number}>,
 *   offcutFt: number,
 *   reelUtilizationPct: number,
 * }>} One entry per reel, sorted by conductorSpec then reel number.
 */
export function buildCableProcurementSchedule(
  routeResults = [],
  cableList = [],
  reelCatalog = [500, 1000, 2000, 5000]
) {
  if (!Array.isArray(routeResults)) return [];
  const catalog = [...reelCatalog].sort((a, b) => a - b);
  const safeCableList = Array.isArray(cableList) ? cableList : [];
  const lookup = new Map(
    safeCableList.map(c => [c.name || c.tag || c.cable_tag, c])
  );

  // Build per-cable cut lengths with allowance
  const items = [];
  for (const r of routeResults) {
    if (!r || !r.cable || !Number.isFinite(parseFloat(r.total_length))) continue;
    const routedFt = parseFloat(r.total_length);
    const spec = lookup.get(r.cable) || {};
    const allowancePct = parseFloat(spec.pull_allowance_pct) || 10;
    const addedFt = routedFt * (allowancePct / 100);
    const cutFt = routedFt + addedFt;
    const conductors = spec.conductors || r.conductors || '';
    const size = spec.conductor_size || r.conductor_size || '';
    const cableType = (spec.cable_type || r.cable_type || 'Power').trim();
    const conductorSpec = [cableType, conductors, size].filter(Boolean).join(' ');
    items.push({ cableTag: r.cable, routedFt, addedFt, cutFt, conductorSpec });
  }

  // Group by conductorSpec
  const specGroups = new Map();
  for (const item of items) {
    if (!specGroups.has(item.conductorSpec)) specGroups.set(item.conductorSpec, []);
    specGroups.get(item.conductorSpec).push(item);
  }

  const reels = [];

  for (const [conductorSpec, group] of specGroups) {
    // First-fit decreasing: sort cables by cut length descending
    const sorted = [...group].sort((a, b) => b.cutFt - a.cutFt);

    // Each reel: { standardLengthFt, remainingFt, assignments[] }
    const openReels = [];

    for (const item of sorted) {
      // Find the smallest reel that fits this cable
      let placed = false;
      for (const reel of openReels) {
        if (reel.remainingFt >= item.cutFt) {
          reel.assignments.push(item);
          reel.remainingFt -= item.cutFt;
          placed = true;
          break;
        }
      }

      if (!placed) {
        // Open a new reel: smallest standard length that fits
        const reelLen = catalog.find(l => l >= item.cutFt) ?? catalog[catalog.length - 1];
        const newReel = { standardLengthFt: reelLen, remainingFt: reelLen - item.cutFt, assignments: [item] };
        openReels.push(newReel);
      }
    }

    // Convert internal reels to output format
    openReels.forEach((reel, idx) => {
      const usedFt = reel.standardLengthFt - reel.remainingFt;
      reels.push({
        reelSpec: `${conductorSpec} — Reel ${idx + 1}`,
        conductorSpec,
        standardLengthFt: reel.standardLengthFt,
        cableAssignments: reel.assignments.map(a => ({
          cableTag: a.cableTag,
          routedLengthFt: +a.routedFt.toFixed(1),
          addedAllowanceFt: +a.addedFt.toFixed(1),
          totalCutFt: +a.cutFt.toFixed(1),
        })),
        offcutFt: +Math.max(0, reel.remainingFt).toFixed(1),
        reelUtilizationPct: +(usedFt / reel.standardLengthFt * 100).toFixed(1),
      });
    });
  }

  // Sort by conductorSpec then reelSpec for stable output
  reels.sort((a, b) => a.reelSpec.localeCompare(b.reelSpec));
  return reels;
}
