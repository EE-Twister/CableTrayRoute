/**
 * Project cost estimation module.
 * Calculates material and labor costs from cable schedule, raceway schedule,
 * and routing results using configurable unit pricing.
 *
 * Built-in values are conceptual allowances. Imported price books and the
 * source-aware regional/escalation basis provide the auditable pricing path.
 */

import { buildBomCatalogFields } from './manufacturerCatalog.mjs';
import { buildDuctbankBOM } from './ductbankBom.mjs';

export const COST_SOURCE_URLS = Object.freeze({
  oewsElectricians: 'https://www.bls.gov/ooh/construction-and-extraction/electricians.htm',
  eciEscalation: 'https://www.bls.gov/eci/factsheets/how-to-use-eci-for-escalation.htm',
  ppiData: 'https://www.bls.gov/ppi/databases/',
});

export const DEFAULT_ESTIMATE_BASIS = Object.freeze({
  estimateClass: 'Conceptual / screening',
  currency: 'USD',
  baseDate: '2024-01',
  estimateDate: '',
  laborRegion: 'United States — national',
  nationalElectricianHourlyWage: 29.98,
  localElectricianHourlyWage: 29.98,
  wageDataDate: 'May 2024',
  wageSource: 'BLS OEWS — Electricians (SOC 47-2111)',
  wageSourceUrl: COST_SOURCE_URLS.oewsElectricians,
  materialBaseIndex: 100,
  materialCurrentIndex: 100,
  materialSeriesId: '',
  materialSeriesName: 'BLS PPI — user-selected electrical material series',
  materialSourceUrl: COST_SOURCE_URLS.ppiData,
  laborBaseIndex: 100,
  laborCurrentIndex: 100,
  laborSeriesId: '',
  laborSeriesName: 'BLS ECI — user-selected non-seasonally adjusted construction series',
  laborSourceUrl: COST_SOURCE_URLS.eciEscalation,
});

/**
 * Return current index / base index. Invalid or non-positive inputs are
 * deliberately neutral so an incomplete basis cannot silently distort cost.
 */
export function calculateEscalationFactor(baseIndex, currentIndex) {
  const base = Number(baseIndex);
  const current = Number(currentIndex);
  if (!Number.isFinite(base) || !Number.isFinite(current) || base <= 0 || current <= 0) return 1;
  return current / base;
}

/**
 * Build the source-aware estimate basis used to localize and escalate prices.
 */
export function buildEstimateBasis(input = {}) {
  const basis = { ...DEFAULT_ESTIMATE_BASIS, ...input };
  const materialFactor = calculateEscalationFactor(basis.materialBaseIndex, basis.materialCurrentIndex);
  const laborEscalationFactor = calculateEscalationFactor(basis.laborBaseIndex, basis.laborCurrentIndex);
  const nationalWage = Number(basis.nationalElectricianHourlyWage);
  const localWage = Number(basis.localElectricianHourlyWage);
  const regionalLaborFactor = Number.isFinite(nationalWage)
    && Number.isFinite(localWage)
    && nationalWage > 0
    && localWage > 0
    ? localWage / nationalWage
    : 1;
  const combinedLaborFactor = regionalLaborFactor * laborEscalationFactor;

  return {
    ...basis,
    materialBaseIndex: Number(basis.materialBaseIndex) || 0,
    materialCurrentIndex: Number(basis.materialCurrentIndex) || 0,
    laborBaseIndex: Number(basis.laborBaseIndex) || 0,
    laborCurrentIndex: Number(basis.laborCurrentIndex) || 0,
    nationalElectricianHourlyWage: Number(basis.nationalElectricianHourlyWage) || 0,
    localElectricianHourlyWage: Number(basis.localElectricianHourlyWage) || 0,
    materialFactor,
    regionalLaborFactor,
    laborEscalationFactor,
    combinedLaborFactor,
    materialIndexDocumented: Boolean(basis.materialSeriesId && basis.materialSeriesName),
    laborIndexDocumented: Boolean(basis.laborSeriesId && basis.laborSeriesName),
    regionalWageDocumented: Boolean(basis.laborRegion && localWage > 0 && nationalWage > 0),
  };
}

function scalePriceMap(map, factor) {
  return Object.fromEntries(Object.entries(map || {}).map(([key, value]) => [
    key,
    Number.isFinite(Number(value)) ? Number(value) * factor : value,
  ]));
}

/**
 * Apply material escalation separately from regional and time-based labor
 * adjustments. Manual final-rate overrides should be applied after this step.
 */
export function applyEstimateBasis(prices = DEFAULT_PRICES, basisInput = {}) {
  const basis = basisInput && basisInput.materialFactor != null
    ? basisInput
    : buildEstimateBasis(basisInput);

  return {
    cable: scalePriceMap(prices.cable || DEFAULT_PRICES.cable, basis.materialFactor),
    tray: scalePriceMap(prices.tray || DEFAULT_PRICES.tray, basis.materialFactor),
    conduit: scalePriceMap(prices.conduit || DEFAULT_PRICES.conduit, basis.materialFactor),
    traySupport: scalePriceMap(prices.traySupport || DEFAULT_PRICES.traySupport, basis.materialFactor),
    construction: scalePriceMap(prices.construction || DEFAULT_PRICES.construction, basis.materialFactor),
    fitting: Number(prices.fitting ?? DEFAULT_PRICES.fitting) * basis.materialFactor,
    labor: scalePriceMap(prices.labor || DEFAULT_PRICES.labor, basis.combinedLaborFactor),
    laborProductivity: {
      ...DEFAULT_PRICES.laborProductivity,
      ...(prices.laborProductivity || {}),
    },
    laborUnitHours: {
      ...DEFAULT_PRICES.laborUnitHours,
      ...(prices.laborUnitHours || {}),
    },
  };
}

/**
 * Default conceptual unit-price allowances (2024 USD).
 * Replace with current supplier, internal, or licensed cost data for issue.
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

  // No built-in values are asserted for support or civil assemblies. These
  // maps are populated by a governed pricing CSV and intentionally price at 0
  // until that evidence is supplied.
  traySupport: { default: 0 },
  construction: {},

  // Labor rates ($/hr)
  labor: {
    cableInstall:  75.00,  // per hour to pull cable
    trayInstall:   90.00,  // per hour to install cable tray
    conduitInstall: 85.00, // per hour to install conduit
    civilInstall: 0,       // governed civil crew rate required
  },

  // Labor productivity (units per hour)
  laborProductivity: {
    cablePullFtPerHr:    150, // ft of cable pulled per labor-hour
    trayInstallFtPerHr:   30, // ft of tray installed per labor-hour
    conduitInstallFtPerHr: 25, // ft of conduit installed per labor-hour
    traySupportInstallEaPerHr: 0,
    trayFittingInstallEaPerHr: 0,
  },

  // Mixed-unit ductbank BOM labor basis: labor-hours per BOM unit, keyed with
  // the same deterministic construction key as the material price.
  laborUnitHours: {},
};

/**
 * Look up a price from a pricing map, falling back to 'default'.
 * @param {Object} priceMap
 * @param {string|number} key
 * @returns {{unitPrice: number, priceKey: string, usedDefaultPrice: boolean}}
 */
export function lookupPriceEvidence(priceMap, key) {
  const k = String(key ?? '').trim();
  if (priceMap[k] !== undefined) return { unitPrice: priceMap[k], priceKey: k, usedDefaultPrice: false };
  // Try numeric key (e.g. trade size '1.0' vs '1')
  const numKey = String(parseFloat(k));
  if (priceMap[numKey] !== undefined) return { unitPrice: priceMap[numKey], priceKey: numKey, usedDefaultPrice: false };
  return { unitPrice: priceMap['default'] ?? 0, priceKey: 'default', usedDefaultPrice: true };
}

function lookupCatalogOrAttributePriceEvidence(priceMap, record, attributeKey) {
  const catalog = buildBomCatalogFields(record).catalogNumber;
  if (catalog && priceMap[catalog] !== undefined) {
    return { ...lookupPriceEvidence(priceMap, catalog), priceBasis: 'catalog-number' };
  }
  return { ...lookupPriceEvidence(priceMap, attributeKey), priceBasis: 'schedule-attribute' };
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
    const tag = c.cable_tag || c.tag || c.name || c.id || '';
    const size = c.conductor_size || c.size || '';
    const conductors = Math.max(1, parseInt(c.conductors, 10) || 1);
    const routeLengthFt = lengthMap[tag] || parseFloat(c.length_ft || c.route_length || 0) || 0;
    const runCount = Math.max(1, parseInt(
      c.parallel_sets || c.parallelSets || c.parallel_runs || c.parallelRuns || c.quantity || c.qty || 1,
      10
    ) || 1);
    const lengthFt = routeLengthFt * runCount;

    const priceEvidence = lookupCatalogOrAttributePriceEvidence(cablePrices, c, size);
    const unitPrice = priceEvidence.unitPrice;
    const materialCost = unitPrice * conductors * lengthFt;
    const laborHrs = lengthFt / (productivity.cablePullFtPerHr || 150);
    const laborCost = laborHrs * (labor.cableInstall || 75);

    return {
      category: 'Cable',
      id: tag,
      description: `${conductors}C-${size}`,
      ...buildBomCatalogFields(c),
      quantity: lengthFt,
      unit: 'ft',
      routeLengthFt,
      runCount,
      conductorCount: conductors,
      extendedQuantity: conductors * lengthFt,
      extendedUnit: 'conductor-ft',
      priceKey: priceEvidence.priceKey,
      priceBasis: priceEvidence.priceBasis,
      usedDefaultPrice: priceEvidence.usedDefaultPrice,
      unitPrice,
      materialCost,
      laborHrs,
      laborRate: labor.cableInstall || 75,
      productivityFtPerHr: productivity.cablePullFtPerHr || 150,
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

    const priceEvidence = lookupCatalogOrAttributePriceEvidence(trayPrices, t, width);
    const unitPrice = priceEvidence.unitPrice;
    const materialCost = unitPrice * lengthFt + fittingCount * fittingPrice;
    const routeLaborHrs = lengthFt / (productivity.trayInstallFtPerHr || 30);
    const fittingProductivityEaPerHr = Number(productivity.trayFittingInstallEaPerHr) || 0;
    const fittingLaborHrs = fittingProductivityEaPerHr > 0 ? fittingCount / fittingProductivityEaPerHr : 0;
    const laborHrs = routeLaborHrs + fittingLaborHrs;
    const laborCost = laborHrs * (labor.trayInstall || 90);

    return {
      category: 'Tray',
      id,
      description: `${t.tray_type || 'Ladder'} ${width}"`,
      ...buildBomCatalogFields(t),
      quantity: lengthFt,
      unit: 'ft',
      fittingCount,
      fittingUnitPrice: fittingPrice,
      priceKey: priceEvidence.priceKey,
      priceBasis: priceEvidence.priceBasis,
      usedDefaultPrice: priceEvidence.usedDefaultPrice,
      unitPrice,
      materialCost,
      laborHrs,
      laborRate: labor.trayInstall || 90,
      productivityFtPerHr: productivity.trayInstallFtPerHr || 30,
      fittingProductivityEaPerHr,
      routeLaborHrs,
      fittingLaborHrs,
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

    const priceEvidence = lookupCatalogOrAttributePriceEvidence(conduitPrices, c, tradeSize);
    const unitPrice = priceEvidence.unitPrice;
    const materialCost = unitPrice * lengthFt;
    const laborHrs = lengthFt / (productivity.conduitInstallFtPerHr || 25);
    const laborCost = laborHrs * (labor.conduitInstall || 85);

    return {
      category: 'Conduit',
      id,
      description: `${c.conduit_type || 'EMT'} ${tradeSize}"`,
      ...buildBomCatalogFields(c),
      quantity: lengthFt,
      unit: 'ft',
      priceKey: priceEvidence.priceKey,
      priceBasis: priceEvidence.priceBasis,
      usedDefaultPrice: priceEvidence.usedDefaultPrice,
      unitPrice,
      materialCost,
      laborHrs,
      laborRate: labor.conduitInstall || 85,
      productivityFtPerHr: productivity.conduitInstallFtPerHr || 25,
      laborCost,
      totalCost: materialCost + laborCost,
    };
  });
}

/** Estimate tray support material and labor from governed route-ledger counts. */
export function estimateTraySupportCosts(trays = [], prices = {}) {
  const supportPrices = { ...DEFAULT_PRICES.traySupport, ...(prices.traySupport || {}) };
  const labor = { ...DEFAULT_PRICES.labor, ...(prices.labor || {}) };
  const productivity = { ...DEFAULT_PRICES.laborProductivity, ...(prices.laborProductivity || {}) };

  return trays.flatMap(tray => {
    const quantity = Math.max(0, Number(tray.support_quantity ?? tray.supportQuantity) || 0);
    if (!quantity) return [];
    const id = tray.tray_id || tray.id || tray.tag || '';
    const width = String(tray.inside_width || tray.width || '').trim();
    const supportRecord = {
      manufacturer: tray.support_manufacturer ?? tray.supportManufacturer,
      catalog_number: tray.support_catalog_number ?? tray.supportCatalogNumber,
      approved_part: tray.support_approved_part ?? tray.supportApprovedPart,
      approval_status: tray.support_approval_status ?? tray.supportApprovalStatus,
      catalog_source: tray.support_catalog_source ?? tray.supportCatalogSource,
      catalog_last_verified: tray.support_catalog_last_verified ?? tray.supportCatalogLastVerified,
    };
    const priceEvidence = lookupCatalogOrAttributePriceEvidence(supportPrices, supportRecord, width);
    const unitPrice = Number(priceEvidence.unitPrice) || 0;
    const productivityEaPerHr = Number(productivity.traySupportInstallEaPerHr) || 0;
    const laborHrs = productivityEaPerHr > 0 ? quantity / productivityEaPerHr : 0;
    const laborRate = Number(labor.trayInstall) || 0;
    const materialCost = quantity * unitPrice;
    const laborCost = laborHrs * laborRate;
    return [{
      category: 'Tray Support',
      id,
      description: `${width || 'Unspecified'} in tray support assembly`,
      ...buildBomCatalogFields(supportRecord),
      quantity,
      unit: 'EA',
      priceKey: priceEvidence.priceKey,
      priceBasis: priceEvidence.priceBasis,
      usedDefaultPrice: priceEvidence.usedDefaultPrice,
      unitPrice,
      materialCost,
      laborHrs,
      laborRate,
      productivityEaPerHr,
      laborCost,
      totalCost: materialCost + laborCost,
    }];
  });
}

function slug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unspecified';
}

/** Deterministic pricing key for one mixed-unit ductbank BOM row. */
export function ductbankConstructionPriceKey(row = {}) {
  return `ductbank.${slug(row.category)}.${slug(row.item)}.${slug(row.specification)}`;
}

function ductbankId(record = {}) {
  return String(record.tag || record.ductbank_tag || record.ductbankTag || record.id || '').trim();
}

function truthySelection(value) {
  if (typeof value === 'boolean') return value;
  return ['yes', 'true', '1', 'concrete', 'encased'].includes(String(value ?? '').trim().toLowerCase());
}

function lookupConstructionEvidence(map, exactKey, genericKey) {
  if (map[exactKey] !== undefined) return lookupPriceEvidence(map, exactKey);
  if (map[genericKey] !== undefined) return lookupPriceEvidence(map, genericKey);
  if (map.default !== undefined) return lookupPriceEvidence(map, 'default');
  return { unitPrice: 0, priceKey: exactKey, usedDefaultPrice: false };
}

/**
 * Price the existing ductbank BOM with governed material rates and
 * labor-hours-per-unit. No civil price or productivity is invented.
 */
export function estimateDuctbankCosts(ductbanks = [], quantityRows = [], prices = {}) {
  const constructionPrices = { ...DEFAULT_PRICES.construction, ...(prices.construction || {}) };
  const laborUnitHours = { ...DEFAULT_PRICES.laborUnitHours, ...(prices.laborUnitHours || {}) };
  const labor = { ...DEFAULT_PRICES.labor, ...(prices.labor || {}) };
  const quantityMap = new Map((Array.isArray(quantityRows) ? quantityRows : [])
    .filter(row => row.type === 'ductbank')
    .map(row => [String(row.id || '').trim().toLowerCase(), Number(row.quantity) || 0]));
  const lineItems = [];
  const assemblies = [];

  (Array.isArray(ductbanks) ? ductbanks : []).forEach(record => {
    const id = ductbankId(record);
    const routeQuantityFt = quantityMap.get(id.toLowerCase());
    if (!(routeQuantityFt > 0)) return;
    const depthIn = Number(
      record.depth_in
      ?? record.depthIn
      ?? record.cover_depth_in
      ?? record.coverDepthIn
      ?? record.coverDepth
    ) || 0;
    const conduits = (Array.isArray(record.conduits) ? record.conduits : []).map(conduit => ({
      ...conduit,
      conduit_type: conduit.conduit_type || conduit.type,
      x: conduit.x ?? conduit.offset_x,
      y: conduit.y ?? conduit.offset_y,
    }));
    const bom = buildDuctbankBOM({
      tag: id,
      lengthFt: routeQuantityFt,
      depthIn,
      concreteEncasement: truthySelection(record.concrete_encasement ?? record.concreteEncasement ?? record.encasement),
      conduits,
      routeProfile: record.routeProfile || record.route_profile || null,
      layout: record.layout || record.bom_layout || {
        topPad: record.topPad ?? record.top_pad,
        bottomPad: record.bottomPad ?? record.bottom_pad,
        leftPad: record.leftPad ?? record.left_pad,
        rightPad: record.rightPad ?? record.right_pad,
      },
      assumptions: record.bomAssumptions || record.bom_assumptions || {},
      optionalMaterials: record.bomOptionalMaterials || record.bom_optional_materials || {},
    });
    const blockingReasons = [];
    if (!bom.ready) blockingReasons.push('Ductbank BOM is not ready.');
    if (!(depthIn > 0) && !bom.routeProfileApplied) blockingReasons.push('Positive cover/depth input is missing.');
    bom.warnings.forEach(warning => blockingReasons.push(warning));
    assemblies.push({
      ductbankId: id,
      routeQuantityFt,
      ready: bom.ready && blockingReasons.length === 0,
      blockingReasons,
      bom,
    });

    bom.rows.filter(row => Number(row.quantity) > 0).forEach((row, index) => {
      const exactKey = ductbankConstructionPriceKey(row);
      const genericKey = `ductbank.${slug(row.category)}.${slug(row.item)}`;
      const priceEvidence = lookupConstructionEvidence(constructionPrices, exactKey, genericKey);
      const hoursEvidence = lookupConstructionEvidence(laborUnitHours, exactKey, genericKey);
      const quantity = Number(row.quantity) || 0;
      const unitPrice = Number(priceEvidence.unitPrice) || 0;
      const laborHoursPerUnit = Number(hoursEvidence.unitPrice) || 0;
      const laborHrs = quantity * laborHoursPerUnit;
      const laborRate = Number(labor.civilInstall) || 0;
      const materialCost = quantity * unitPrice;
      const laborCost = laborHrs * laborRate;
      lineItems.push({
        category: 'Ductbank',
        id: `${id}:${index + 1}`,
        ductbankId: id,
        description: `${row.item}${row.specification ? ` — ${row.specification}` : ''}`,
        quantity,
        unit: row.unit,
        basis: row.basis,
        priceKey: priceEvidence.priceKey,
        laborHoursKey: hoursEvidence.priceKey,
        usedDefaultPrice: priceEvidence.usedDefaultPrice,
        unitPrice,
        materialCost,
        laborHrs,
        laborHoursPerUnit,
        laborRate,
        laborCost,
        totalCost: materialCost + laborCost,
      });
    });
  });

  return { lineItems, assemblies };
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

/**
 * Parse a pricing CSV into a prices object compatible with DEFAULT_PRICES.
 *
 * Expected CSV columns: category, key, unit_price, unit, source, date
 * Lines beginning with '#' are treated as comments and ignored.
 *
 * Supported categories:
 *   cable        – key = conductor size string (e.g. "4 AWG", "default")
 *   tray         – key = nominal width in inches (e.g. "12", "default")
 *   conduit      – key = trade size in inches (e.g. "1", "0.5", "default")
 *   fitting      – key is ignored; sets the scalar fitting unit price
 *   tray_support – key = tray width or "default"
 *   construction – key = deterministic ductbank BOM material key
 *   labor_unit_hours – key = matching ductbank BOM key, value = labor-hours/unit
 *   labor        – key ∈ { cableInstall, trayInstall, conduitInstall, civilInstall }
 *   productivity – also supports traySupportInstallEaPerHr and trayFittingInstallEaPerHr
 *
 * @param {string} csvText  Raw CSV text
 * @returns {{ prices: Object, meta: { source: string, date: string, rowCount: number, warnings: string[] } }}
 */
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  fields.push(current.trim());
  return fields;
}

function sanitizeSpreadsheetCell(value) {
  const text = String(value ?? '');
  if (!text) return '';
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function encodeCSVCell(value) {
  const text = sanitizeSpreadsheetCell(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function parsePricingCSV(csvText) {
  const prices = {};
  const warnings = [];
  let source = '';
  let date = '';
  let rowCount = 0;

  const VALID_LABOR_KEYS = new Set(['cableInstall', 'trayInstall', 'conduitInstall', 'civilInstall']);
  const VALID_PRODUCTIVITY_KEYS = new Set([
    'cablePullFtPerHr',
    'trayInstallFtPerHr',
    'conduitInstallFtPerHr',
    'traySupportInstallEaPerHr',
    'trayFittingInstallEaPerHr',
  ]);
  const VALID_CATEGORIES = new Set([
    'cable',
    'tray',
    'conduit',
    'fitting',
    'tray_support',
    'construction',
    'labor_unit_hours',
    'labor',
    'productivity',
  ]);

  const lines = csvText.split(/\r?\n/);
  let headerParsed = false;
  let colIndex = { category: 0, key: 1, unit_price: 2, unit: 3, source: 4, date: 5 };

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const raw = lines[lineNum].trim();
    if (!raw || raw.startsWith('#')) continue;

    // Parse header row
    if (!headerParsed) {
      const cols = parseCSVLine(raw).map(c => c.toLowerCase());
      if (cols.includes('category') && cols.includes('unit_price')) {
        colIndex = {
          category: cols.indexOf('category'),
          key:      cols.indexOf('key'),
          unit_price: cols.indexOf('unit_price'),
          unit:     cols.indexOf('unit'),
          source:   cols.indexOf('source'),
          date:     cols.indexOf('date'),
        };
        headerParsed = true;
        continue;
      }
      // If first non-comment line is not a recognizable header, skip it
      headerParsed = true;
      continue;
    }

    const fields = parseCSVLine(raw);
    const get = idx => (idx >= 0 && idx < fields.length ? fields[idx].trim() : '');

    const category = get(colIndex.category).toLowerCase();
    const key      = get(colIndex.key);
    const rawPrice = get(colIndex.unit_price);
    const rowSource = get(colIndex.source);
    const rowDate   = get(colIndex.date);

    if (!category) continue;

    const unitPrice = parseFloat(rawPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      warnings.push(`Line ${lineNum + 1}: skipped — non-numeric unit_price "${rawPrice}"`);
      continue;
    }

    if (!VALID_CATEGORIES.has(category)) {
      warnings.push(`Line ${lineNum + 1}: unrecognized category "${category}" — skipped`);
      continue;
    }

    // Capture source/date from first data row that provides them
    if (!source && rowSource) source = rowSource;
    if (!date   && rowDate)   date   = rowDate;

    if (category === 'cable') {
      if (!prices.cable) prices.cable = {};
      prices.cable[key || 'default'] = unitPrice;
      rowCount++;
    } else if (category === 'tray') {
      if (!prices.tray) prices.tray = {};
      prices.tray[key || 'default'] = unitPrice;
      rowCount++;
    } else if (category === 'conduit') {
      if (!prices.conduit) prices.conduit = {};
      prices.conduit[key || 'default'] = unitPrice;
      rowCount++;
    } else if (category === 'fitting') {
      prices.fitting = unitPrice;
      rowCount++;
    } else if (category === 'tray_support') {
      if (!prices.traySupport) prices.traySupport = {};
      prices.traySupport[key || 'default'] = unitPrice;
      rowCount++;
    } else if (category === 'construction') {
      if (!prices.construction) prices.construction = {};
      prices.construction[key || 'default'] = unitPrice;
      rowCount++;
    } else if (category === 'labor_unit_hours') {
      if (!prices.laborUnitHours) prices.laborUnitHours = {};
      prices.laborUnitHours[key || 'default'] = unitPrice;
      rowCount++;
    } else if (category === 'labor') {
      if (!VALID_LABOR_KEYS.has(key)) {
        warnings.push(`Line ${lineNum + 1}: unknown labor key "${key}" — skipped`);
        continue;
      }
      if (!prices.labor) prices.labor = {};
      prices.labor[key] = unitPrice;
      rowCount++;
    } else if (category === 'productivity') {
      if (!VALID_PRODUCTIVITY_KEYS.has(key)) {
        warnings.push(`Line ${lineNum + 1}: unknown productivity key "${key}" — skipped`);
        continue;
      }
      if (!prices.laborProductivity) prices.laborProductivity = {};
      prices.laborProductivity[key] = unitPrice;
      rowCount++;
    }
  }

  return { prices, meta: { source, date, rowCount, warnings } };
}

/**
 * Serialize a prices object (shape of DEFAULT_PRICES) to a CSV string.
 *
 * @param {Object} prices   Prices object (may be partial)
 * @param {{ source?: string, date?: string }} [meta]
 * @returns {string} CSV text
 */
export function exportPricingCSV(prices = {}, meta = {}) {
  const source = sanitizeSpreadsheetCell(meta.source || '');
  const date   = sanitizeSpreadsheetCell(meta.date || new Date().toISOString().slice(0, 10));
  const rows   = [];

  rows.push('# CableTrayRoute Pricing Book');
  if (source) rows.push(`# Source: ${source}`);
  rows.push(`# Date: ${date}`);
  rows.push('# Generated: ' + new Date().toISOString());
  rows.push('category,key,unit_price,unit,source,date');

  function addRows(category, map, unit) {
    if (!map || typeof map !== 'object') return;
    Object.entries(map).forEach(([key, price]) => {
      if (Number.isFinite(price)) {
        rows.push([category, key, price, unit, source, date].map(encodeCSVCell).join(','));
      }
    });
  }

  addRows('cable',   prices.cable,   '$/ft');
  addRows('tray',    prices.tray,    '$/ft');
  addRows('conduit', prices.conduit, '$/ft');
  addRows('tray_support', prices.traySupport, '$/ea');
  addRows('construction', prices.construction, '$/BOM unit');

  if (Number.isFinite(prices.fitting)) {
    rows.push(['fitting', '', prices.fitting, '$', source, date].map(encodeCSVCell).join(','));
  }

  addRows('labor',        prices.labor,            '$/hr');
  addRows('productivity', prices.laborProductivity, 'units/hr');
  addRows('labor_unit_hours', prices.laborUnitHours, 'labor-hr/BOM unit');

  return rows.join('\n') + '\n';
}
