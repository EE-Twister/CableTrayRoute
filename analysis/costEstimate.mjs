/**
 * Project cost estimation module.
 * Calculates material and labor costs from cable schedule, raceway schedule,
 * and routing results using configurable unit pricing.
 *
 * References: RS Means Electrical Cost Data (typical ranges), NEC Article 300.
 */

/**
 * Default unit prices (USD).
 * Prices are mid-range estimates; override via the priceOverrides parameter.
 */
export const DEFAULT_PRICES = {
  // Cables: $/ft by conductor size (AWG / kcmil) — copper THWN-2
  cable: {
    '14 AWG': 0.18,
    '12 AWG': 0.25,
    '10 AWG': 0.40,
    '8 AWG':  0.65,
    '6 AWG':  0.90,
    '4 AWG':  1.30,
    '2 AWG':  1.90,
    '1 AWG':  2.40,
    '1/0':    3.10,
    '2/0':    3.80,
    '3/0':    4.80,
    '4/0':    6.00,
    '250 kcmil': 7.50,
    '350 kcmil': 10.00,
    '500 kcmil': 13.00,
    '750 kcmil': 19.00,
    '1000 kcmil': 25.00,
    'default':   1.50, // fallback for unknown sizes
  },

  // Tray: $/ft by nominal width (inches) — aluminum ladder tray
  tray: {
    '6':  4.50,
    '9':  5.50,
    '12': 6.50,
    '18': 8.50,
    '24': 11.00,
    '30': 14.00,
    '36': 17.00,
    'default': 7.00,
  },

  // Conduit: $/ft by trade size (inches) — EMT
  conduit: {
    '0.5':  0.60,
    '0.75': 0.85,
    '1':    1.20,
    '1.25': 1.70,
    '1.5':  2.10,
    '2':    2.90,
    '2.5':  4.20,
    '3':    5.80,
    '3.5':  7.50,
    '4':    9.50,
    'default': 3.00,
  },

  // Fittings: unit cost ($) — per tray fitting (elbow, tee, reducer etc.)
  fitting: 35.00,

  // Labor rates ($/hr)
  labor: {
    cableInstall:  75.00,  // per hour to pull cable
    trayInstall:   90.00,  // per hour to install cable tray
    conduitInstall: 85.00, // per hour to install conduit
  },

  // Labor productivity (units per hour)
  laborProductivity: {
    cablePullFtPerHr:    150, // ft of cable pulled per labor-hour
    trayInstallFtPerHr:   30, // ft of tray installed per labor-hour
    conduitInstallFtPerHr: 25, // ft of conduit installed per labor-hour
  },
};

/**
 * Look up a price from a pricing map, falling back to 'default'.
 * @param {Object} priceMap
 * @param {string|number} key
 * @returns {number}
 */
function lookupPrice(priceMap, key) {
  const k = String(key ?? '').trim();
  if (priceMap[k] !== undefined) return priceMap[k];
  // Try numeric key (e.g. trade size '1.0' vs '1')
  const numKey = String(parseFloat(k));
  if (priceMap[numKey] !== undefined) return priceMap[numKey];
  return priceMap['default'] ?? 0;
}

/**
 * Estimate cable material and labor costs from cable list.
 *
 * @param {Array<Object>} cables - Cable schedule records
 * @param {Array<Object>} routeResults - Routing results with total_length
 * @param {Object} prices - Price overrides (merged with DEFAULT_PRICES)
 * @returns {Array<Object>} Line items with tag, size, length, unitPrice, materialCost, laborCost, totalCost
 */
export function estimateCableCosts(cables = [], routeResults = [], prices = {}) {
  const cablePrices = { ...DEFAULT_PRICES.cable, ...(prices.cable || {}) };
  const labor = { ...DEFAULT_PRICES.labor, ...(prices.labor || {}) };
  const productivity = { ...DEFAULT_PRICES.laborProductivity, ...(prices.laborProductivity || {}) };

  // Build route length map: tag → total_length
  const lengthMap = {};
  routeResults.forEach(r => {
    const tag = r.cable || r.cable_tag;
    if (tag) lengthMap[tag] = parseFloat(r.total_length) || 0;
  });

  return cables.map(c => {
    const tag = c.cable_tag || c.tag || '';
    const size = c.conductor_size || c.size || '';
    const conductors = Math.max(1, parseInt(c.conductors, 10) || 1);
    const lengthFt = lengthMap[tag] || parseFloat(c.length_ft || c.route_length || 0) || 0;

    const unitPrice = lookupPrice(cablePrices, size);
    const materialCost = unitPrice * conductors * lengthFt;
    const laborHrs = lengthFt / (productivity.cablePullFtPerHr || 150);
    const laborCost = laborHrs * (labor.cableInstall || 75);

    return {
      category: 'Cable',
      id: tag,
      description: `${conductors}C-${size}`,
      quantity: lengthFt,
      unit: 'ft',
      unitPrice,
      materialCost,
      laborHrs,
      laborCost,
      totalCost: materialCost + laborCost,
    };
  });
}

/**
 * Estimate tray material and labor costs from tray schedule.
 *
 * @param {Array<Object>} trays
 * @param {Object} prices - Price overrides
 * @returns {Array<Object>} Line items
 */
export function estimateTrayCosts(trays = [], prices = {}) {
  const trayPrices = { ...DEFAULT_PRICES.tray, ...(prices.tray || {}) };
  const fittingPrice = prices.fitting ?? DEFAULT_PRICES.fitting;
  const labor = { ...DEFAULT_PRICES.labor, ...(prices.labor || {}) };
  const productivity = { ...DEFAULT_PRICES.laborProductivity, ...(prices.laborProductivity || {}) };

  return trays.map(t => {
    const id = t.tray_id || '';
    const width = String(t.inside_width || '').trim();
    const lengthFt = parseFloat(t.length_ft || 0) || 0;
    const fittingCount = parseInt(t.fitting_count || 0, 10) || 0;

    const unitPrice = lookupPrice(trayPrices, width);
    const materialCost = unitPrice * lengthFt + fittingCount * fittingPrice;
    const laborHrs = lengthFt / (productivity.trayInstallFtPerHr || 30);
    const laborCost = laborHrs * (labor.trayInstall || 90);

    return {
      category: 'Tray',
      id,
      description: `${t.tray_type || 'Ladder'} ${width}"`,
      quantity: lengthFt,
      unit: 'ft',
      unitPrice,
      materialCost,
      laborHrs,
      laborCost,
      totalCost: materialCost + laborCost,
    };
  });
}

/**
 * Estimate conduit material and labor costs.
 *
 * @param {Array<Object>} conduits
 * @param {Object} prices - Price overrides
 * @returns {Array<Object>} Line items
 */
export function estimateConduitCosts(conduits = [], prices = {}) {
  const conduitPrices = { ...DEFAULT_PRICES.conduit, ...(prices.conduit || {}) };
  const labor = { ...DEFAULT_PRICES.labor, ...(prices.labor || {}) };
  const productivity = { ...DEFAULT_PRICES.laborProductivity, ...(prices.laborProductivity || {}) };

  return conduits.map(c => {
    const id = c.conduit_id || '';
    const tradeSize = String(c.trade_size || c.diameter || '').trim();
    const lengthFt = parseFloat(c.length_ft || 0) || 0;

    const unitPrice = lookupPrice(conduitPrices, tradeSize);
    const materialCost = unitPrice * lengthFt;
    const laborHrs = lengthFt / (productivity.conduitInstallFtPerHr || 25);
    const laborCost = laborHrs * (labor.conduitInstall || 85);

    return {
      category: 'Conduit',
      id,
      description: `${c.conduit_type || 'EMT'} ${tradeSize}"`,
      quantity: lengthFt,
      unit: 'ft',
      unitPrice,
      materialCost,
      laborHrs,
      laborCost,
      totalCost: materialCost + laborCost,
    };
  });
}

/**
 * Summarize line items into category subtotals and grand total.
 *
 * @param {Array<Object>} lineItems
 * @returns {{ categories: Object, grandTotal: number, grandMaterial: number, grandLabor: number }}
 */
export function summarizeCosts(lineItems = []) {
  const categories = {};
  let grandTotal = 0;
  let grandMaterial = 0;
  let grandLabor = 0;

  lineItems.forEach(item => {
    const cat = item.category || 'Other';
    if (!categories[cat]) {
      categories[cat] = { materialCost: 0, laborCost: 0, totalCost: 0, count: 0 };
    }
    categories[cat].materialCost += item.materialCost || 0;
    categories[cat].laborCost += item.laborCost || 0;
    categories[cat].totalCost += item.totalCost || 0;
    categories[cat].count += 1;
    grandTotal += item.totalCost || 0;
    grandMaterial += item.materialCost || 0;
    grandLabor += item.laborCost || 0;
  });

  return { categories, grandTotal, grandMaterial, grandLabor };
}
