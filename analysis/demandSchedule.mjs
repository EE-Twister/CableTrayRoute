/**
 * Electrical Demand & Diversity Estimator — Gap #92
 *
 * Applies NEC 220 (US) and IEC 60439-1 (international) demand factors to a
 * load list and produces a coincident demand schedule suitable for service-
 * entrance sizing and utility coordination.
 *
 * NEC references:
 *   220.12  Lighting load (VA/ft²) and general demand factors
 *   220.14  Receptacle demand factors
 *   220.42  General lighting demand factors (dwelling / non-dwelling)
 *   220.44  Receptacle loads — non-dwelling (first 10 kVA @ 100%, remainder @ 50%)
 *   220.53  Fixed appliances (4+ appliances: 75% demand factor)
 *   220.56  Commercial kitchen / cooking equipment (Table 220.56)
 *   220.60  Non-coincident loads (heating vs. AC — use larger)
 *   430.24  Motors — sum all + 25% of largest FLA
 *   625.42  EV supply equipment
 *
 * IEC 60439-1 reference:
 *   Table B.1  Diversity factors by consumer count
 */

// ---------------------------------------------------------------------------
// NEC 220 demand-factor library
// ---------------------------------------------------------------------------

/**
 * Load categories recognised by the NEC 220 engine.
 * Each entry describes how the connected load is derated to coincident demand.
 *
 * @type {Record<string, {label: string, standard: string, description: string}>}
 */
export const NEC_CATEGORIES = {
  lighting:        { label: 'Lighting',                standard: 'NEC 220.42', description: 'General illumination loads' },
  receptacle:      { label: 'Receptacles',             standard: 'NEC 220.44', description: 'Convenience receptacle circuits' },
  motor:           { label: 'Motors',                  standard: 'NEC 430.24', description: 'Electric motor loads (largest motor +25%)' },
  kitchen:         { label: 'Kitchen / Cooking',       standard: 'NEC 220.56', description: 'Commercial cooking equipment' },
  hvac:            { label: 'HVAC / Heating',          standard: 'NEC 220.60', description: 'Heating and air-conditioning (non-coincident)' },
  ev:              { label: 'EV Charging',             standard: 'NEC 625.42', description: 'Electric vehicle supply equipment' },
  appliance:       { label: 'Fixed Appliances',        standard: 'NEC 220.53', description: 'Fixed appliances (4+ units get 75% factor)' },
  critical:        { label: 'Critical / UPS',          standard: 'NEC 220',    description: '100% demand — UPS, datacenter, emergency loads' },
  general:         { label: 'General / Other',         standard: 'NEC 220',    description: '100% demand — unclassified loads' },
};

/**
 * NEC Table 220.56 — Commercial Kitchen Equipment demand factors.
 * Index 0 = 1 unit, index 4 = 5 units, ≥ 6 = 0.65.
 */
const KITCHEN_FACTORS = [1.0, 1.0, 0.90, 0.80, 0.70, 0.65];

function kitchenFactor(unitCount) {
  const n = Math.max(1, Math.round(unitCount));
  return n < KITCHEN_FACTORS.length ? KITCHEN_FACTORS[n - 1] : KITCHEN_FACTORS[KITCHEN_FACTORS.length - 1];
}

/**
 * NEC 625.42 — EV supply equipment demand factors.
 * Position by charger ordinal (1-based).
 */
function evFactor(ordinal) {
  if (ordinal === 1) return 1.0;
  if (ordinal <= 4)  return 0.75;
  return 0.50;
}

/**
 * NEC 220.44 — Receptacle loads (non-dwelling):
 *   First 10 kVA of total receptacle load at 100%
 *   Remainder at 50%
 */
function receptacleDemandKw(totalConnectedKw) {
  const threshold = 10; // kVA ≈ kW at unity PF for demand calculation
  if (totalConnectedKw <= threshold) return totalConnectedKw;
  return threshold + (totalConnectedKw - threshold) * 0.50;
}

/**
 * NEC 220.42 — General lighting demand factors (non-dwelling):
 *   First 50 kVA at 100%
 *   Remainder at 50%
 * (Simplified from the full Table 220.42 non-dwelling column.)
 */
function lightingDemandKw(totalConnectedKw) {
  const threshold = 50;
  if (totalConnectedKw <= threshold) return totalConnectedKw;
  return threshold + (totalConnectedKw - threshold) * 0.50;
}

// ---------------------------------------------------------------------------
// IEC 60439-1 diversity
// ---------------------------------------------------------------------------

/**
 * IEC 60439-1 Table B.1 diversity factor by consumer count.
 * Returns factor in [0, 1] to multiply connected load.
 *
 * @param {number} count
 * @returns {number}
 */
export function iecDiversityFactor(count) {
  const n = Math.max(1, Math.round(count));
  if (n <= 2)   return 1.0;
  if (n <= 5)   return 0.9;
  if (n <= 10)  return 0.8;
  if (n <= 40)  return 0.7;
  return 0.6;
}

// ---------------------------------------------------------------------------
// Category assignment heuristic
// ---------------------------------------------------------------------------

/**
 * Map a free-text loadType string to a recognised NEC category key.
 * Case-insensitive keyword search.
 *
 * @param {string} loadType
 * @returns {keyof typeof NEC_CATEGORIES}
 */
export function categorise(loadType) {
  const t = (loadType || '').toLowerCase();
  if (/light|luminaire|illum|lamp/.test(t))            return 'lighting';
  if (/recept|outlet|plug|strip/.test(t))               return 'receptacle';
  if (/motor|pump|fan|compressor|drive|vfd/.test(t))    return 'motor';
  if (/kitchen|cook|oven|range|fryer|dishwash/.test(t)) return 'kitchen';
  if (/hvac|\bheat\b|cool|\bac\b|air.cond|chiller|furnace|boiler/.test(t)) return 'hvac';
  if (/ev|electric.?vehicle|charger|evse/.test(t))      return 'ev';
  if (/appliance|washer|dryer|dishwasher/.test(t))      return 'appliance';
  if (/ups|uninterrupt|critical|server|datacen/.test(t)) return 'critical';
  return 'general';
}

// ---------------------------------------------------------------------------
// Core demand calculation
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} LoadRow
 * @property {string}  [source]      Panel / source name
 * @property {string}  [tag]
 * @property {string}  [description]
 * @property {string}  [loadType]    Free-text load type
 * @property {string|number} [kw]    Connected kW per unit
 * @property {string|number} [quantity]
 * @property {string|number} [powerFactor]
 * @property {string|number} [phases]
 * @property {string|number} [voltage]
 * @property {string|number} [efficiency]
 * @property {string|number} [loadFactor]  Load factor % (0-100)
 * @property {string|number} [duty]
 * @property {string}  [necCategory] Override auto-categorisation
 */

/**
 * @typedef {Object} DemandRow
 * @property {string}  tag
 * @property {string}  description
 * @property {string}  source
 * @property {string}  loadType
 * @property {string}  necCategory
 * @property {string}  categoryLabel
 * @property {number}  quantity
 * @property {number}  connectedKw     kW per unit × quantity
 * @property {number}  powerFactor
 * @property {number}  connectedKva
 * @property {number}  demandFactor    Final factor applied (0-1)
 * @property {number}  demandKw
 * @property {number}  demandKva
 * @property {string}  standard        NEC / IEC reference
 * @property {string}  note            Explanation of factor applied
 */

/**
 * @typedef {Object} DemandScheduleResult
 * @property {DemandRow[]}  rows
 * @property {Object}       summary
 * @property {number}       summary.totalConnectedKw
 * @property {number}       summary.totalConnectedKva
 * @property {number}       summary.totalDemandKw
 * @property {number}       summary.totalDemandKva
 * @property {number}       summary.diversityFactor    IEC overall (if IEC mode)
 * @property {string}       mode  'nec' | 'iec'
 * @property {Object[]}     sourceBreakdown  Per-panel demand summary
 */

/**
 * Compute connected kW for a single load row (gross, before demand factors).
 *
 * @param {LoadRow} load
 * @returns {number}
 */
function connectedKw(load) {
  const qty = parseFloat(load.quantity) || 1;
  const kw  = parseFloat(load.kw)       || 0;
  const lf  = parseFloat(load.loadFactor);
  const eff = parseFloat(load.efficiency);
  let base  = kw * qty;
  if (!isNaN(lf))          base *= lf / 100;
  if (!isNaN(eff) && eff)  base /= eff / 100;
  return base;
}

/**
 * Run the NEC 220 demand schedule over a load list.
 *
 * The function groups loads by category, applies per-category demand factors
 * (including the NEC 430.24 largest-motor adder), then re-emits per-row
 * demand kW values consistent with the aggregate category factors.
 *
 * @param {LoadRow[]} loads
 * @param {{mode?: 'nec'|'iec', standard?: 'nec'|'iec'}} [options]
 * @returns {DemandScheduleResult}
 */
export function buildDemandSchedule(loads, options = {}) {
  const mode = options.mode || options.standard || 'nec';

  if (!Array.isArray(loads) || loads.length === 0) {
    return _emptyResult(mode);
  }

  // -------------------------------------------------------------------------
  // 1. Enrich each load with category and connected kW
  // -------------------------------------------------------------------------
  const enriched = loads.map(load => {
    const category = (load.necCategory && NEC_CATEGORIES[load.necCategory])
      ? load.necCategory
      : categorise(load.loadType);
    const connKw   = connectedKw(load);
    const pf       = parseFloat(load.powerFactor) || 1;
    const connKva  = pf ? connKw / pf : connKw;
    return { load, category, connKw, connKva, pf };
  });

  // -------------------------------------------------------------------------
  // 2. IEC 60439-1 mode — apply uniform diversity factor to all loads
  // -------------------------------------------------------------------------
  if (mode === 'iec') {
    const totalCount   = enriched.length;
    const df           = iecDiversityFactor(totalCount);
    let totalConnKw    = 0;
    let totalConnKva   = 0;
    let totalDemandKw  = 0;
    let totalDemandKva = 0;

    const rows = enriched.map(({ load, category, connKw, connKva, pf }) => {
      const dKw  = connKw  * df;
      const dKva = connKva * df;
      totalConnKw   += connKw;
      totalConnKva  += connKva;
      totalDemandKw  += dKw;
      totalDemandKva += dKva;

      return _makeRow(load, category, connKw, connKva, pf, df,
        `IEC 60439-1 diversity factor for ${totalCount} consumers`, 'IEC 60439-1 Table B.1');
    });

    return {
      rows,
      mode,
      summary: {
        totalConnectedKw:  round2(totalConnKw),
        totalConnectedKva: round2(totalConnKva),
        totalDemandKw:     round2(totalDemandKw),
        totalDemandKva:    round2(totalDemandKva),
        diversityFactor:   df,
      },
      sourceBreakdown: _buildSourceBreakdown(rows),
    };
  }

  // -------------------------------------------------------------------------
  // 3. NEC 220 mode — category-specific demand factors
  // -------------------------------------------------------------------------

  // Group connected kW by category
  const byCategory = {};
  for (const cat of Object.keys(NEC_CATEGORIES)) byCategory[cat] = [];
  for (const e of enriched) byCategory[e.category].push(e);

  // Pre-compute category-level demand kW totals & factors
  // Motor: need largest unit kW for NEC 430.24 adder
  const motorEntries = byCategory['motor'];
  const largestMotorKw = motorEntries.length
    ? Math.max(...motorEntries.map(e => (parseFloat(e.load.kw) || 0) * (parseFloat(e.load.quantity) || 1)))
    : 0;

  // Receptacle total connected kW
  const receptacleTotal = byCategory['receptacle'].reduce((s, e) => s + e.connKw, 0);
  // Lighting total
  const lightingTotal   = byCategory['lighting'].reduce((s, e) => s + e.connKw, 0);
  // Kitchen: count of units
  const kitchenUnitCount = byCategory['kitchen'].reduce((s, e) => s + (parseFloat(e.load.quantity) || 1), 0);
  // Appliance count
  const applianceCount   = byCategory['appliance'].reduce((s, e) => s + (parseFloat(e.load.quantity) || 1), 0);

  // EV charger ordinal counter (reset per source group for simplicity)
  let evOrdinal = 0;

  let totalConnKw   = 0;
  let totalConnKva  = 0;
  let totalDemandKw = 0;
  let totalDemandKva = 0;

  const rows = [];

  for (const e of enriched) {
    const { load, category, connKw, connKva, pf } = e;
    totalConnKw  += connKw;
    totalConnKva += connKva;

    let df   = 1.0;
    let note = '';
    let std  = NEC_CATEGORIES[category].standard;

    switch (category) {
      case 'lighting': {
        // Compute the proportional factor this row contributes to the category total
        const categoryDemand  = lightingDemandKw(lightingTotal);
        const categoryFactor  = lightingTotal > 0 ? categoryDemand / lightingTotal : 1;
        df   = categoryFactor;
        note = lightingTotal > 50
          ? 'First 50 kVA @ 100%, remainder @ 50% (NEC 220.42)'
          : '100% demand (NEC 220.42, ≤50 kVA)';
        break;
      }
      case 'receptacle': {
        const categoryDemand = receptacleDemandKw(receptacleTotal);
        df   = receptacleTotal > 0 ? categoryDemand / receptacleTotal : 1;
        note = receptacleTotal > 10
          ? 'First 10 kVA @ 100%, remainder @ 50% (NEC 220.44)'
          : '100% demand (NEC 220.44, ≤10 kVA)';
        break;
      }
      case 'motor': {
        const isLargest = connKw === largestMotorKw && largestMotorKw > 0;
        // All motors at 100%, largest gets +25%
        df   = isLargest ? 1.25 : 1.0;
        note = isLargest
          ? 'Largest motor: 125% FLA per NEC 430.24'
          : '100% demand per NEC 430.24';
        break;
      }
      case 'kitchen': {
        df   = kitchenFactor(kitchenUnitCount);
        note = `${Math.round(df * 100)}% per NEC Table 220.56 (${Math.round(kitchenUnitCount)} unit${kitchenUnitCount !== 1 ? 's' : ''})`;
        break;
      }
      case 'hvac': {
        // NEC 220.60: use the larger of heating or AC; treat all as 100%
        // (full non-coincident selection requires paired loads; default 100%)
        df   = 1.0;
        note = '100% demand — verify non-coincident loads per NEC 220.60';
        break;
      }
      case 'ev': {
        evOrdinal++;
        df   = evFactor(evOrdinal);
        note = `${Math.round(df * 100)}% demand per NEC 625.42 (charger #${evOrdinal})`;
        break;
      }
      case 'appliance': {
        df   = applianceCount >= 4 ? 0.75 : 1.0;
        note = applianceCount >= 4
          ? `75% demand per NEC 220.53 (${Math.round(applianceCount)} appliances ≥ 4)`
          : `100% demand per NEC 220.53 (${Math.round(applianceCount)} appliance${applianceCount !== 1 ? 's' : ''} < 4)`;
        break;
      }
      case 'critical':
      default: {
        df   = 1.0;
        note = '100% demand (critical / unclassified load)';
        break;
      }
    }

    const dKw  = connKw  * df;
    const dKva = connKva * df;
    totalDemandKw  += dKw;
    totalDemandKva += dKva;

    rows.push(_makeRow(load, category, connKw, connKva, pf, df, note, std));
  }

  return {
    rows,
    mode,
    summary: {
      totalConnectedKw:  round2(totalConnKw),
      totalConnectedKva: round2(totalConnKva),
      totalDemandKw:     round2(totalDemandKw),
      totalDemandKva:    round2(totalDemandKva),
      diversityFactor:   totalConnKw > 0 ? round2(totalDemandKw / totalConnKw) : 1,
    },
    sourceBreakdown: _buildSourceBreakdown(rows),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n) {
  return Math.round(n * 100) / 100;
}

function _makeRow(load, category, connKw, connKva, pf, df, note, standard) {
  return {
    tag:           String(load.tag || ''),
    description:   String(load.description || ''),
    source:        String(load.source || ''),
    loadType:      String(load.loadType || ''),
    necCategory:   category,
    categoryLabel: NEC_CATEGORIES[category]?.label || category,
    quantity:      parseFloat(load.quantity) || 1,
    connectedKw:   round2(connKw),
    powerFactor:   round2(pf),
    connectedKva:  round2(connKva),
    demandFactor:  df,
    demandKw:      round2(connKw  * df),
    demandKva:     round2(connKva * df),
    standard:      standard || '',
    note,
  };
}

function _buildSourceBreakdown(rows) {
  const map = {};
  for (const row of rows) {
    const src = row.source || '(unassigned)';
    if (!map[src]) {
      map[src] = { source: src, connectedKw: 0, connectedKva: 0, demandKw: 0, demandKva: 0 };
    }
    map[src].connectedKw  += row.connectedKw;
    map[src].connectedKva += row.connectedKva;
    map[src].demandKw     += row.demandKw;
    map[src].demandKva    += row.demandKva;
  }
  return Object.values(map).map(e => ({
    ...e,
    connectedKw:  round2(e.connectedKw),
    connectedKva: round2(e.connectedKva),
    demandKw:     round2(e.demandKw),
    demandKva:    round2(e.demandKva),
  }));
}

function _emptyResult(mode) {
  return {
    rows: [],
    mode,
    summary: {
      totalConnectedKw:  0,
      totalConnectedKva: 0,
      totalDemandKw:     0,
      totalDemandKva:    0,
      diversityFactor:   1,
    },
    sourceBreakdown: [],
  };
}
