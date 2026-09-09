import {
  cableRouteTag,
  normalizeRouteResults,
  routeResultSucceeded,
  routeResultTag,
} from './routeResults.mjs';

const EPSILON = 1e-6;

const text = value => String(value ?? '').trim();

function finiteNonnegative(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function finitePositive(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function point(value) {
  if (!Array.isArray(value) || value.length < 3) return null;
  const normalized = value.slice(0, 3).map(Number);
  return normalized.every(Number.isFinite) ? normalized : null;
}

function geometryLength(record = {}) {
  const start = point(record.start) || point([
    record.start_x,
    record.start_y,
    record.start_z,
  ]);
  const end = point(record.end) || point([
    record.end_x,
    record.end_y,
    record.end_z,
  ]);
  if (!start || !end) return null;
  return Math.hypot(
    end[0] - start[0],
    end[1] - start[1],
    end[2] - start[2]
  );
}

function recordLength(record = {}) {
  return finitePositive(
    record.length_ft,
    record.lengthFt,
    record.length,
    geometryLength(record)
  );
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  const source = String(value);
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function issue(code, message, { severity = 'error', blocking = true, href = 'costestimate.html' } = {}) {
  return { code, severity, blocking, message, href };
}

function recordId(record = {}, fields = []) {
  for (const field of fields) {
    const value = text(record[field]);
    if (value) return value;
  }
  return '';
}

function scheduleMaps({ trays = [], conduits = [], ductbanks = [] } = {}) {
  const trayMap = new Map();
  const conduitMap = new Map();
  const ductbankMap = new Map();
  (Array.isArray(trays) ? trays : []).forEach(record => {
    const id = recordId(record, ['tray_id', 'id', 'tag']);
    if (id) trayMap.set(id.toLowerCase(), { ...record, id });
  });
  (Array.isArray(conduits) ? conduits : []).forEach(record => {
    const id = recordId(record, ['conduit_id', 'id', 'tag', 'tray_id']);
    if (id) conduitMap.set(id.toLowerCase(), { ...record, id });
  });
  (Array.isArray(ductbanks) ? ductbanks : []).forEach(record => {
    const id = recordId(record, ['ductbank_id', 'id', 'tag', 'tray_id']);
    if (!id) return;
    ductbankMap.set(id.toLowerCase(), { ...record, id });
    (Array.isArray(record.conduits) ? record.conduits : []).forEach(conduit => {
      const conduitId = recordId(conduit, ['conduit_id', 'id', 'tag', 'tray_id']);
      if (conduitId) conduitMap.set(conduitId.toLowerCase(), {
        ...conduit,
        id: conduitId,
        ductbankId: id,
        length_ft: recordLength(conduit) || recordLength(record),
      });
    });
  });
  return { trayMap, conduitMap, ductbankMap };
}

function cableMap(cables = []) {
  const map = new Map();
  (Array.isArray(cables) ? cables : []).forEach(cable => {
    const aliases = [
      cable.cable_tag,
      cable.tag,
      cable.name,
      cable.id,
      cable.cable_id,
      cable.cableId,
      cable.ref,
      cableRouteTag(cable),
    ];
    aliases.map(value => text(value).toLowerCase()).filter(Boolean).forEach(alias => map.set(alias, cable));
  });
  return map;
}

function cableRunCount(cable = {}) {
  return Math.max(1, Math.trunc(finitePositive(
    cable.parallel_sets,
    cable.parallelSets,
    cable.parallel_runs,
    cable.parallelRuns,
    cable.quantity,
    cable.qty
  ) || 1));
}

function conductorCount(cable = {}) {
  return Math.max(1, Math.trunc(finitePositive(
    cable.conductors,
    cable.conductor_count,
    cable.conductorCount
  ) || 1));
}

function bendCount(segments = []) {
  let count = 0;
  for (let index = 1; index < segments.length; index += 1) {
    const previousStart = point(segments[index - 1]?.start);
    const previousEnd = point(segments[index - 1]?.end);
    const currentStart = point(segments[index]?.start);
    const currentEnd = point(segments[index]?.end);
    if (!previousStart || !previousEnd || !currentStart || !currentEnd) continue;
    const first = previousEnd.map((value, axis) => value - previousStart[axis]);
    const second = currentEnd.map((value, axis) => value - currentStart[axis]);
    const firstLength = Math.hypot(...first);
    const secondLength = Math.hypot(...second);
    if (firstLength <= EPSILON || secondLength <= EPSILON) continue;
    const dot = first.reduce((sum, value, axis) => sum + value * second[axis], 0);
    const cosine = Math.max(-1, Math.min(1, dot / (firstLength * secondLength)));
    if (Math.acos(cosine) > EPSILON) count += 1;
  }
  return count;
}

function segmentIdentity(segment = {}) {
  const type = text(segment.type).toLowerCase();
  if (type === 'field') return { type: 'field', id: '' };
  const conduitId = text(segment.conduit_id || segment.conduitId);
  const ductbankId = text(segment.ductbankTag || segment.ductbank_tag || segment.ductbank_id);
  const racewayId = text(segment.raceway_id || segment.tray_id || segment.trayId);
  if (type === 'ductbank' || ductbankId) {
    return { type: 'ductbank', id: ductbankId || racewayId, conduitId };
  }
  if (type === 'conduit' || conduitId) return { type: 'conduit', id: conduitId || racewayId };
  return { type: 'tray', id: racewayId };
}

function addUsage(map, type, id, selectedLength, cableTag) {
  const normalizedId = text(id);
  if (!normalizedId) return;
  const key = `${type}|${normalizedId.toLowerCase()}`;
  if (!map.has(key)) {
    map.set(key, {
      type,
      id: normalizedId,
      selectedLengthFt: 0,
      maximumSelectedLengthFt: 0,
      cableTags: new Set(),
    });
  }
  const row = map.get(key);
  row.selectedLengthFt += finiteNonnegative(selectedLength, 0);
  row.maximumSelectedLengthFt = Math.max(
    row.maximumSelectedLengthFt,
    finiteNonnegative(selectedLength, 0)
  );
  if (cableTag) row.cableTags.add(cableTag);
}

function usedRacewayRow(usage, maps, issues, supportSpacingFt) {
  const sourceMap = usage.type === 'tray'
    ? maps.trayMap
    : usage.type === 'conduit'
      ? maps.conduitMap
      : maps.ductbankMap;
  const schedule = sourceMap.get(usage.id.toLowerCase());
  if (!schedule) {
    issues.push(issue(
      'ROUTE-COST-RACEWAY-SCHEDULE-MISSING',
      `${usage.type} "${usage.id}" is selected by a route but has no matching schedule record.`
    ));
  }
  const scheduledLength = recordLength(schedule || {});
  const quantity = scheduledLength || usage.maximumSelectedLengthFt;
  if (!quantity) {
    issues.push(issue(
      'ROUTE-COST-RACEWAY-LENGTH-MISSING',
      `${usage.type} "${usage.id}" does not have a positive scheduled or routed length.`
    ));
  }
  const row = {
    category: usage.type === 'tray' ? 'Tray' : usage.type === 'conduit' ? 'Conduit' : 'Ductbank',
    type: usage.type,
    id: usage.id,
    quantity: round(quantity || 0),
    unit: 'ft',
    basis: scheduledLength ? 'Unique used schedule record' : 'Maximum selected route-segment length',
    selectedCableCount: usage.cableTags.size,
    selectedCableTags: [...usage.cableTags].sort(),
    selectedLengthAcrossCablesFt: round(usage.selectedLengthFt),
    scheduleRecordFound: Boolean(schedule),
  };
  if (usage.type === 'tray' && quantity > 0) {
    row.supportSpacingFt = supportSpacingFt;
    row.supportQuantity = Math.ceil(quantity / supportSpacingFt) + 1;
  }
  return row;
}

/**
 * Build a route-scoped quantity ledger. Cable quantities are per physical run;
 * installed raceways are deduplicated by schedule identity so shared paths are
 * not purchased once per routed cable.
 */
export function buildRouteQuantityLedger({
  routeResults = [],
  cables = [],
  trays = [],
  conduits = [],
  ductbanks = [],
  options = {},
} = {}) {
  const routes = normalizeRouteResults(routeResults).filter(routeResultSucceeded);
  const cablesByTag = cableMap(cables);
  const maps = scheduleMaps({ trays, conduits, ductbanks });
  const issues = [];
  const warnings = [];
  const rows = [];
  const racewayUsage = new Map();
  const supportSpacingFt = finitePositive(options.traySupportSpacingFt) || 10;
  let cableRunFt = 0;
  let conductorFt = 0;
  let fieldRouteFt = 0;
  let totalBends = 0;
  let pullSetups = 0;

  if (!routes.length) {
    issues.push(issue('ROUTE-COST-ROUTES-MISSING', 'No successful route results are available for a route-scoped quantity ledger.'));
  }
  routes.forEach(route => {
    const tag = text(routeResultTag(route));
    const cable = cablesByTag.get(tag.toLowerCase());
    if (!cable) {
      issues.push(issue('ROUTE-COST-CABLE-SCHEDULE-MISSING', `Routed cable "${tag}" has no matching cable-schedule record.`));
    }
    const segments = Array.isArray(route.route_segments) ? route.route_segments : [];
    const segmentTotal = segments.reduce((sum, segment) => sum + finiteNonnegative(segment.length, 0), 0);
    const routeLength = finitePositive(route.total_length, segmentTotal) || 0;
    const tolerance = Math.max(0.1, routeLength * 0.005);
    if (!segments.length) {
      issues.push(issue('ROUTE-COST-SEGMENTS-MISSING', `Routed cable "${tag}" does not retain route segments for quantity reconciliation.`));
    } else if (Math.abs(segmentTotal - routeLength) > tolerance) {
      issues.push(issue(
        'ROUTE-COST-LENGTH-MISMATCH',
        `Cable "${tag}" route total is ${routeLength.toFixed(2)} ft but its segments total ${segmentTotal.toFixed(2)} ft.`
      ));
    }
    const runs = cableRunCount(cable);
    const conductors = conductorCount(cable);
    const routeCableRunFt = routeLength * runs;
    const routeConductorFt = routeCableRunFt * conductors;
    cableRunFt += routeCableRunFt;
    conductorFt += routeConductorFt;
    totalBends += bendCount(segments) * runs;
    pullSetups += Math.max(0, Number(route.pull_check?.sections?.length) || 0) * runs;
    rows.push({
      category: 'Cable',
      type: 'cable',
      id: tag,
      quantity: round(routeCableRunFt),
      unit: 'cable-ft',
      routeLengthFt: round(routeLength),
      runCount: runs,
      conductorCount: conductors,
      conductorQuantityFt: round(routeConductorFt),
      basis: 'Saved routed length × physical run count',
      scheduleRecordFound: Boolean(cable),
    });
    segments.forEach(segment => {
      const length = finiteNonnegative(segment.length, 0);
      const identity = segmentIdentity(segment);
      if (identity.type === 'field') {
        fieldRouteFt += length * runs;
        return;
      }
      addUsage(racewayUsage, identity.type, identity.id, length, tag);
      if (identity.type === 'ductbank' && identity.conduitId) {
        addUsage(racewayUsage, 'conduit', identity.conduitId, length, tag);
      }
    });
  });

  [...racewayUsage.values()]
    .sort((left, right) => `${left.type}|${left.id}`.localeCompare(`${right.type}|${right.id}`, undefined, { numeric: true }))
    .forEach(usage => rows.push(usedRacewayRow(usage, maps, issues, supportSpacingFt)));

  if (fieldRouteFt > 0) {
    rows.push({
      category: 'Field route',
      type: 'field',
      id: 'FIELD-ROUTE',
      quantity: round(fieldRouteFt),
      unit: 'cable-ft',
      basis: 'Uncontained route length × physical run count; included in cable length',
    });
  }
  if (totalBends > 0) {
    rows.push({
      category: 'Route bends',
      type: 'bend',
      id: 'ROUTE-BENDS',
      quantity: totalBends,
      unit: 'EA',
      basis: 'Geometric direction changes × physical run count',
    });
  }
  if (pullSetups > 0) {
    rows.push({
      category: 'Pull setups',
      type: 'pull-setup',
      id: 'PULL-SETUPS',
      quantity: pullSetups,
      unit: 'EA',
      basis: 'Calculated pull sections × physical run count',
    });
  }

  const racewayRows = rows.filter(row => ['tray', 'conduit', 'ductbank'].includes(row.type));
  if (racewayRows.some(row => row.type === 'tray') && !finitePositive(options.traySupportSpacingFt)) {
    warnings.push(issue(
      'ROUTE-COST-SUPPORT-SPACING-ASSUMED',
      `Tray support counts use the ${supportSpacingFt} ft screening spacing because no project spacing was supplied.`,
      { severity: 'warning', blocking: false }
    ));
  }
  const blockingIssues = issues.filter(item => item.blocking);
  const summary = {
    routes: routes.length,
    cableRunFt: round(cableRunFt),
    conductorFt: round(conductorFt),
    uniqueTrayFt: round(racewayRows.filter(row => row.type === 'tray').reduce((sum, row) => sum + row.quantity, 0)),
    uniqueConduitFt: round(racewayRows.filter(row => row.type === 'conduit').reduce((sum, row) => sum + row.quantity, 0)),
    uniqueDuctbankFt: round(racewayRows.filter(row => row.type === 'ductbank').reduce((sum, row) => sum + row.quantity, 0)),
    traySupports: racewayRows.filter(row => row.type === 'tray').reduce((sum, row) => sum + (row.supportQuantity || 0), 0),
    fieldRouteFt: round(fieldRouteFt),
    routeBends: totalBends,
    pullSetups,
  };
  const signaturePayload = {
    schemaVersion: 1,
    rows: rows.map(row => ({
      type: row.type,
      id: row.id,
      quantity: row.quantity,
      unit: row.unit,
      conductorQuantityFt: row.conductorQuantityFt,
      supportSpacingFt: row.supportSpacingFt,
      supportQuantity: row.supportQuantity,
      basis: row.basis,
    })),
    summary,
  };
  return {
    schemaVersion: 1,
    status: blockingIssues.length ? 'blocked' : 'pass',
    intendedUse: 'Route-scoped quantity evidence for conceptual estimating and qualified commercial review.',
    signature: stableHash(JSON.stringify(signaturePayload)),
    rows,
    summary,
    assumptions: { traySupportSpacingFt: supportSpacingFt },
    issues,
    warnings,
    blockingIssues,
  };
}

function customMapHas(map, key) {
  if (!map || typeof map !== 'object') return false;
  const normalized = text(key);
  if (Object.hasOwn(map, normalized)) return true;
  const numericKey = String(Number.parseFloat(normalized));
  return (Number.isFinite(Number.parseFloat(normalized)) && Object.hasOwn(map, numericKey))
    || Object.hasOwn(map, 'default');
}

function priceCoverageIssues(lineItems, prices) {
  const issues = [];
  const usedCategories = new Set();
  lineItems.filter(item => Number(item.quantity) > 0).forEach(item => {
    const category = text(item.category).toLowerCase();
    if (!['cable', 'tray', 'conduit', 'tray support', 'ductbank'].includes(category)) return;
    usedCategories.add(category);
    const priceMap = category === 'tray support'
      ? prices?.traySupport
      : category === 'ductbank'
        ? prices?.construction
        : prices?.[category];
    if (!customMapHas(priceMap, item.priceKey)) {
      issues.push(issue(
        'ROUTE-COST-MATERIAL-PRICE-UNGOVERNED',
        `${item.category} "${item.id}" uses a built-in or uncovered material price for key "${item.priceKey || 'default'}".`
      ));
    }
    if (['cable', 'tray', 'conduit'].includes(category)
      && text(item.catalogNumber)
      && item.priceBasis !== 'catalog-number') {
      issues.push(issue(
        'ROUTE-COST-CATALOG-PRICE-UNGOVERNED',
        `${item.category} "${item.id}" identifies catalog ${item.catalogNumber}, but its governed price is not keyed to that catalog number.`
      ));
    }
    if (category === 'tray' && Number(item.fittingCount) > 0 && !finitePositive(prices?.fitting)) {
      issues.push(issue('ROUTE-COST-FITTING-PRICE-UNGOVERNED', `Tray "${item.id}" has fittings without a governed fitting unit price.`));
    }
    if (category === 'tray' && Number(item.fittingCount) > 0 && !finitePositive(prices?.laborProductivity?.trayFittingInstallEaPerHr)) {
      issues.push(issue('ROUTE-COST-FITTING-PRODUCTIVITY-UNGOVERNED', `Tray "${item.id}" has fittings without governed fitting-install productivity.`));
    }
    if (category === 'ductbank' && !customMapHas(prices?.laborUnitHours, item.laborHoursKey)) {
      issues.push(issue(
        'ROUTE-COST-CIVIL-LABOR-UNIT-HOURS-UNGOVERNED',
        `Ductbank item "${item.id}" lacks governed labor-hours per ${item.unit || 'BOM unit'} for key "${item.laborHoursKey || item.priceKey || 'default'}".`
      ));
    }
  });
  const laborKeys = {
    cable: ['cableInstall', 'cablePullFtPerHr'],
    tray: ['trayInstall', 'trayInstallFtPerHr'],
    conduit: ['conduitInstall', 'conduitInstallFtPerHr'],
    'tray support': ['trayInstall', 'traySupportInstallEaPerHr'],
    ductbank: ['civilInstall', null],
  };
  usedCategories.forEach(category => {
    const [rateKey, productivityKey] = laborKeys[category];
    if (!finitePositive(prices?.labor?.[rateKey])) {
      issues.push(issue('ROUTE-COST-LABOR-RATE-UNGOVERNED', `${category} labor rate "${rateKey}" is not present in the governed pricing book.`));
    }
    if (productivityKey && !finitePositive(prices?.laborProductivity?.[productivityKey])) {
      issues.push(issue('ROUTE-COST-PRODUCTIVITY-UNGOVERNED', `${category} productivity "${productivityKey}" is not present in the governed pricing book.`));
    }
  });
  return issues;
}

function catalogCoverageWarnings(lineItems) {
  return (Array.isArray(lineItems) ? lineItems : [])
    .filter(item => Number(item.quantity) > 0
      && ['cable', 'tray', 'conduit'].includes(text(item.category).toLowerCase())
      && !text(item.catalogNumber))
    .map(item => issue(
      'ROUTE-COST-CATALOG-IDENTITY-MISSING',
      `${item.category} "${item.id}" has no manufacturer catalog number; size-based pricing remains screening evidence.`,
      { severity: 'warning', blocking: false }
    ));
}

function quantityReconciliationIssues(quantityLedger, lineItems, ductbankAssemblies = []) {
  const issues = [];
  const costRows = new Map((Array.isArray(lineItems) ? lineItems : []).map(item => [
    `${text(item.category).toLowerCase()}|${text(item.id).toLowerCase()}`,
    item,
  ]));
  quantityLedger.rows.filter(row => ['cable', 'tray', 'conduit'].includes(row.type)).forEach(row => {
    const item = costRows.get(`${row.type}|${text(row.id).toLowerCase()}`);
    if (!item) {
      issues.push(issue('ROUTE-COST-LINE-ITEM-UNPRICED', `${row.category} "${row.id}" is present in the route quantity ledger but absent from the estimate.`));
      return;
    }
    const actual = finiteNonnegative(item.quantity, 0) || 0;
    const tolerance = Math.max(0.1, row.quantity * 0.001);
    if (Math.abs(actual - row.quantity) > tolerance) {
      issues.push(issue(
        'ROUTE-COST-QUANTITY-MISMATCH',
        `${row.category} "${row.id}" ledger quantity is ${row.quantity} ${row.unit}, but the cost line uses ${actual} ${item.unit || row.unit}.`
      ));
    }
  });
  quantityLedger.rows.filter(row => row.type === 'tray' && Number(row.supportQuantity) > 0).forEach(row => {
    const item = costRows.get(`tray support|${text(row.id).toLowerCase()}`);
    if (!item) {
      issues.push(issue('ROUTE-COST-TRAY-SUPPORTS-UNPRICED', `Tray "${row.id}" requires ${row.supportQuantity} support assemblies, but no support cost line was generated.`));
      return;
    }
    const actual = finiteNonnegative(item.quantity, 0) || 0;
    if (Math.abs(actual - row.supportQuantity) > EPSILON) {
      issues.push(issue('ROUTE-COST-TRAY-SUPPORT-QUANTITY-MISMATCH', `Tray "${row.id}" ledger support count is ${row.supportQuantity} EA, but the cost line uses ${actual} EA.`));
    }
  });
  quantityLedger.rows.filter(row => row.type === 'ductbank').forEach(row => {
    const matchingItems = (Array.isArray(lineItems) ? lineItems : []).filter(item => (
      text(item.category).toLowerCase() === 'ductbank'
      && text(item.ductbankId).toLowerCase() === text(row.id).toLowerCase()
    ));
    if (!matchingItems.length) {
      issues.push(issue('ROUTE-COST-DUCTBANK-ASSEMBLY-UNPRICED', `Ductbank "${row.id}" has ${row.quantity} ft in the route ledger, but no BOM-derived construction lines were generated.`));
    }
    const assembly = (Array.isArray(ductbankAssemblies) ? ductbankAssemblies : []).find(item => (
      text(item.ductbankId).toLowerCase() === text(row.id).toLowerCase()
    ));
    if (!assembly) {
      issues.push(issue('ROUTE-COST-DUCTBANK-BOM-EVIDENCE-MISSING', `Ductbank "${row.id}" has no retained BOM readiness evidence.`));
    } else if (!assembly.ready) {
      const reasons = (assembly.blockingReasons || []).filter(Boolean).join(' ');
      issues.push(issue('ROUTE-COST-DUCTBANK-BOM-INCOMPLETE', `Ductbank "${row.id}" BOM is incomplete.${reasons ? ` ${reasons}` : ''}`));
    }
  });
  return issues;
}

/** Build signed route quantity and cost evidence around the existing estimator. */
export function buildRouteCostAssurance({
  routeResults = [],
  cables = [],
  trays = [],
  conduits = [],
  ductbanks = [],
  lineItems = [],
  estimateBasis = {},
  pricingMeta = {},
  governedPrices = null,
  ductbankAssemblies = [],
  contingencyPct = 0,
  inputFingerprint = '',
  quantityOptions = {},
} = {}) {
  const quantityLedger = buildRouteQuantityLedger({
    routeResults,
    cables,
    trays,
    conduits,
    ductbanks,
    options: quantityOptions,
  });
  const issues = [...quantityLedger.issues];
  const warnings = [...quantityLedger.warnings];
  const rows = Array.isArray(lineItems) ? lineItems : [];
  const fingerprint = text(inputFingerprint);
  const source = text(pricingMeta.source);
  const sourceDate = text(pricingMeta.date);
  if (!rows.length) issues.push(issue('ROUTE-COST-LINE-ITEMS-MISSING', 'No cost line items were generated from the route quantity basis.'));
  issues.push(...quantityReconciliationIssues(quantityLedger, rows, ductbankAssemblies));
  warnings.push(...catalogCoverageWarnings(rows));
  if (!fingerprint) issues.push(issue('ROUTE-COST-FINGERPRINT-MISSING', 'The estimate does not retain the current project-input fingerprint.'));
  if (!source) issues.push(issue('ROUTE-COST-PRICE-SOURCE-MISSING', 'The estimate uses pricing without an identified supplier, internal, or licensed source.'));
  if (!sourceDate) issues.push(issue('ROUTE-COST-PRICE-DATE-MISSING', 'The governed pricing source does not include a pricing date.'));
  if (!governedPrices || typeof governedPrices !== 'object') {
    issues.push(issue('ROUTE-COST-PRICE-BOOK-MISSING', 'Built-in conceptual allowances are active; import a governed pricing book for traceable cost assurance.'));
  } else {
    issues.push(...priceCoverageIssues(rows, governedPrices));
  }
  const materialFactor = finitePositive(estimateBasis.materialFactor) || 1;
  const laborFactor = finitePositive(estimateBasis.laborEscalationFactor) || 1;
  if (Math.abs(materialFactor - 1) > EPSILON && !estimateBasis.materialIndexDocumented) {
    issues.push(issue('ROUTE-COST-MATERIAL-INDEX-MISSING', 'Material escalation is non-neutral without a documented material index series.'));
  }
  if (Math.abs(laborFactor - 1) > EPSILON && !estimateBasis.laborIndexDocumented) {
    issues.push(issue('ROUTE-COST-LABOR-INDEX-MISSING', 'Labor escalation is non-neutral without a documented labor index series.'));
  }
  rows.forEach(item => {
    const quantity = finiteNonnegative(item.quantity);
    const unitPrice = finiteNonnegative(item.unitPrice);
    const material = finiteNonnegative(item.materialCost);
    const laborHrs = finiteNonnegative(item.laborHrs);
    const labor = finiteNonnegative(item.laborCost);
    const total = finiteNonnegative(item.totalCost);
    if ([quantity, unitPrice, material, laborHrs, labor, total].some(value => value === null)) {
      issues.push(issue('ROUTE-COST-LINE-ITEM-INVALID', `${item.category || 'Cost'} "${item.id || '(untagged)'}" has a negative or non-finite quantity or cost.`));
      return;
    }
    if (quantity > 0 && unitPrice <= 0) {
      issues.push(issue('ROUTE-COST-UNIT-PRICE-MISSING', `${item.category || 'Cost'} "${item.id || '(untagged)'}" has positive quantity without a positive unit price.`));
    }
    const category = text(item.category).toLowerCase();
    const extendedQuantity = category === 'cable'
      ? finiteNonnegative(item.extendedQuantity, quantity * Math.max(1, Number(item.conductorCount) || 1))
      : quantity;
    const fittingCount = category === 'tray' ? (finiteNonnegative(item.fittingCount, 0) || 0) : 0;
    const fittingUnitPrice = category === 'tray' ? (finiteNonnegative(item.fittingUnitPrice, 0) || 0) : 0;
    const expectedMaterial = unitPrice * extendedQuantity + fittingCount * fittingUnitPrice;
    if (Math.abs(expectedMaterial - material) > Math.max(0.01, material * 1e-6)) {
      issues.push(issue('ROUTE-COST-MATERIAL-EXTENSION-MISMATCH', `${item.category || 'Cost'} "${item.id || '(untagged)'}" material quantity × unit-price extension does not reconcile.`));
    }
    const laborRate = finitePositive(item.laborRate);
    const productivity = finitePositive(item.productivityFtPerHr);
    const productivityEa = finitePositive(item.productivityEaPerHr);
    const laborHoursPerUnit = finitePositive(item.laborHoursPerUnit);
    let expectedLaborHrs = null;
    if (category === 'tray') {
      const fittingProductivity = finitePositive(item.fittingProductivityEaPerHr);
      if (!productivity && quantity > 0) {
        issues.push(issue('ROUTE-COST-PRODUCTIVITY-BASIS-MISSING', `${item.category || 'Cost'} "${item.id || '(untagged)'}" does not retain its applied tray productivity.`));
      } else if (productivity) {
        expectedLaborHrs = quantity / productivity;
      }
      if (fittingCount > 0 && !fittingProductivity) {
        issues.push(issue('ROUTE-COST-FITTING-PRODUCTIVITY-BASIS-MISSING', `Tray "${item.id || '(untagged)'}" does not retain fitting-install productivity.`));
      } else if (fittingProductivity) {
        expectedLaborHrs = (expectedLaborHrs || 0) + fittingCount / fittingProductivity;
      }
    } else if (laborHoursPerUnit) {
      expectedLaborHrs = quantity * laborHoursPerUnit;
    } else if (productivityEa) {
      expectedLaborHrs = quantity / productivityEa;
    } else if (productivity) {
      expectedLaborHrs = quantity / productivity;
    } else if (quantity > 0) {
      issues.push(issue('ROUTE-COST-PRODUCTIVITY-BASIS-MISSING', `${item.category || 'Cost'} "${item.id || '(untagged)'}" does not retain applied productivity or labor-hours per unit.`));
    }
    if (expectedLaborHrs !== null && Math.abs(expectedLaborHrs - laborHrs) > Math.max(0.001, laborHrs * 1e-6)) {
      issues.push(issue('ROUTE-COST-LABOR-HOURS-MISMATCH', `${item.category || 'Cost'} "${item.id || '(untagged)'}" quantity and productivity basis do not reconcile to labor hours.`));
    }
    if (!laborRate && quantity > 0) {
      issues.push(issue('ROUTE-COST-LABOR-EXTENSION-BASIS-MISSING', `${item.category || 'Cost'} "${item.id || '(untagged)'}" does not retain its applied labor rate.`));
    } else if (laborRate && Math.abs(item.laborHrs * laborRate - labor) > Math.max(0.01, labor * 1e-6)) {
      issues.push(issue('ROUTE-COST-LABOR-EXTENSION-MISMATCH', `${item.category || 'Cost'} "${item.id || '(untagged)'}" labor hours × applied rate does not reconcile.`));
    }
    if (Math.abs(material + labor - total) > Math.max(0.01, total * 1e-6)) {
      issues.push(issue('ROUTE-COST-EXTENSION-MISMATCH', `${item.category || 'Cost'} "${item.id || '(untagged)'}" does not reconcile material plus labor to total cost.`));
    }
  });
  const subtotal = rows.reduce((sum, item) => sum + (finiteNonnegative(item.totalCost, 0) || 0), 0);
  const contingencyFraction = Math.max(0, finiteNonnegative(contingencyPct, 0) || 0);
  const contingency = subtotal * contingencyFraction;
  const total = subtotal + contingency;
  const blockingIssues = issues.filter(item => item.blocking);
  const payload = {
    schemaVersion: 1,
    inputFingerprint: fingerprint,
    quantitySignature: quantityLedger.signature,
    pricing: { source, date: sourceDate, rowCount: finiteNonnegative(pricingMeta.rowCount, 0) },
    estimateBasis: {
      currency: text(estimateBasis.currency || 'USD'),
      baseDate: text(estimateBasis.baseDate),
      estimateDate: text(estimateBasis.estimateDate),
      materialSeriesId: text(estimateBasis.materialSeriesId),
      materialFactor: round(materialFactor),
      laborRegion: text(estimateBasis.laborRegion),
      laborSeriesId: text(estimateBasis.laborSeriesId),
      combinedLaborFactor: round(finitePositive(estimateBasis.combinedLaborFactor) || 1),
    },
    lineItems: rows.map(item => ({
      category: item.category,
      id: item.id,
      quantity: round(item.quantity || 0),
      unit: item.unit,
      extendedQuantity: round(item.extendedQuantity || 0),
      fittingCount: round(item.fittingCount || 0),
      fittingUnitPrice: round(item.fittingUnitPrice || 0),
      priceKey: item.priceKey,
      priceBasis: item.priceBasis,
      unitPrice: round(item.unitPrice || 0),
      materialCost: round(item.materialCost || 0),
      laborHrs: round(item.laborHrs || 0),
      laborRate: round(item.laborRate || 0),
      productivityFtPerHr: round(item.productivityFtPerHr || 0),
      productivityEaPerHr: round(item.productivityEaPerHr || 0),
      fittingProductivityEaPerHr: round(item.fittingProductivityEaPerHr || 0),
      laborHoursKey: item.laborHoursKey,
      laborHoursPerUnit: round(item.laborHoursPerUnit || 0),
      laborCost: round(item.laborCost || 0),
      totalCost: round(item.totalCost || 0),
    })),
    contingencyPct: round(contingencyFraction),
    totals: { subtotal: round(subtotal), contingency: round(contingency), total: round(total) },
    ductbankAssemblies: (Array.isArray(ductbankAssemblies) ? ductbankAssemblies : []).map(assembly => ({
      ductbankId: assembly.ductbankId,
      routeQuantityFt: round(assembly.routeQuantityFt || 0),
      ready: assembly.ready === true,
      blockingReasons: assembly.blockingReasons || [],
      rowCount: Array.isArray(assembly.bom?.rows) ? assembly.bom.rows.length : 0,
    })),
  };
  return {
    schemaVersion: 1,
    applicable: quantityLedger.summary.routes > 0,
    status: blockingIssues.length ? 'blocked' : 'pass',
    classification: 'Screening only',
    intendedUse: 'Traceable route quantity and conceptual cost evidence for qualified commercial review; not a bid or issued estimate.',
    signature: stableHash(JSON.stringify(payload)),
    inputFingerprint: fingerprint,
    quantityLedger,
    pricing: payload.pricing,
    estimateBasis: payload.estimateBasis,
    totals: payload.totals,
    issues,
    warnings,
    blockingIssues,
  };
}

/** Evaluate a saved cost artifact against the current project state. */
export function assessSavedRouteCostArtifact(artifact, currentInputFingerprint = '') {
  if (!artifact || typeof artifact !== 'object') {
    return {
      applicable: false,
      status: 'not-applicable',
      signature: '',
      issues: [],
      blockingIssues: [],
    };
  }
  const saved = artifact.routeCostAssurance;
  if (!saved || saved.schemaVersion !== 1) {
    const missing = issue('ROUTE-COST-ASSURANCE-MISSING', 'The saved cost estimate predates route cost assurance and must be regenerated.');
    return { applicable: true, status: 'blocked', signature: '', issues: [missing], blockingIssues: [missing] };
  }
  const issues = [...(saved.issues || [])];
  const current = text(currentInputFingerprint);
  const savedFingerprint = text(saved.inputFingerprint || artifact.inputFingerprint);
  if (current && (!savedFingerprint || savedFingerprint !== current)) {
    issues.push(issue('ROUTE-COST-ASSURANCE-STALE', 'The saved route cost estimate does not match the current cable and raceway inputs. Regenerate it.'));
  }
  const blockingIssues = issues.filter(item => item.blocking);
  return {
    ...saved,
    applicable: true,
    status: blockingIssues.length ? 'blocked' : 'pass',
    issues,
    blockingIssues,
  };
}
