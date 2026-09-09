import assert from 'assert';
import {
  assessSavedRouteCostArtifact,
  buildRouteCostAssurance,
  buildRouteQuantityLedger,
} from '../analysis/routeCostAssurance.mjs';
import {
  estimateCableCosts,
  estimateDuctbankCosts,
} from '../analysis/costEstimate.mjs';

function route(cable, length = 100, trayId = 'T-1') {
  return {
    cable,
    status: 'Routed',
    total_length: length,
    route_segments: [{ type: 'straight', tray_id: trayId, length, start: [0, 0, 0], end: [length, 0, 0] }],
  };
}

const cables = [
  { cable_tag: 'C-1', conductor_size: '4 AWG', conductors: 3 },
  { cable_tag: 'C-2', conductor_size: '4 AWG', conductors: 4 },
];
const trays = [{ tray_id: 'T-1', inside_width: 12, length_ft: 100 }];

const shared = buildRouteQuantityLedger({
  routeResults: [route('C-1'), route('C-2')],
  cables,
  trays,
});
assert.equal(shared.status, 'pass');
assert.equal(shared.summary.cableRunFt, 200);
assert.equal(shared.summary.conductorFt, 700);
assert.equal(shared.summary.uniqueTrayFt, 100);
assert.equal(shared.summary.traySupports, 11);
assert.equal(shared.rows.filter(row => row.type === 'tray').length, 1);

const parallel = buildRouteQuantityLedger({
  routeResults: [route('P-1', 50)],
  cables: [{ cable_tag: 'P-1', conductors: 3, parallel_sets: 2 }],
  trays: [{ tray_id: 'T-1', length_ft: 50 }],
});
assert.equal(parallel.summary.cableRunFt, 100);
assert.equal(parallel.summary.conductorFt, 300);
assert.equal(parallel.summary.uniqueTrayFt, 50);

const mismatch = buildRouteQuantityLedger({
  routeResults: [{ ...route('C-1'), total_length: 100, route_segments: [{ ...route('C-1').route_segments[0], length: 90 }] }],
  cables,
  trays,
});
assert.equal(mismatch.status, 'blocked');
assert(mismatch.blockingIssues.some(item => item.code === 'ROUTE-COST-LENGTH-MISMATCH'));

const missingRaceway = buildRouteQuantityLedger({ routeResults: [route('C-1')], cables });
assert.equal(missingRaceway.status, 'blocked');
assert(missingRaceway.blockingIssues.some(item => item.code === 'ROUTE-COST-RACEWAY-SCHEDULE-MISSING'));

const lineItems = [
  { category: 'Cable', id: 'C-1', quantity: 100, extendedQuantity: 300, unit: 'ft', priceKey: '4 AWG', unitPrice: 2, materialCost: 600, laborHrs: 1, laborRate: 75, productivityFtPerHr: 100, laborCost: 75, totalCost: 675 },
  { category: 'Cable', id: 'C-2', quantity: 100, extendedQuantity: 400, unit: 'ft', priceKey: '4 AWG', unitPrice: 2, materialCost: 800, laborHrs: 1, laborRate: 75, productivityFtPerHr: 100, laborCost: 75, totalCost: 875 },
  { category: 'Tray', id: 'T-1', quantity: 100, unit: 'ft', priceKey: '12', unitPrice: 10, materialCost: 1000, laborHrs: 4, laborRate: 90, productivityFtPerHr: 25, laborCost: 360, totalCost: 1360 },
  { category: 'Tray Support', id: 'T-1', quantity: 11, unit: 'EA', priceKey: '12', unitPrice: 20, materialCost: 220, laborHrs: 5.5, laborRate: 90, productivityEaPerHr: 2, laborCost: 495, totalCost: 715 },
];
const governedPrices = {
  cable: { '4 AWG': 2 },
  tray: { 12: 10 },
  traySupport: { 12: 20 },
  labor: { cableInstall: 75, trayInstall: 90 },
  laborProductivity: { cablePullFtPerHr: 100, trayInstallFtPerHr: 25, traySupportInstallEaPerHr: 2 },
};
const assurance = buildRouteCostAssurance({
  routeResults: [route('C-1'), route('C-2')],
  cables,
  trays,
  lineItems,
  governedPrices,
  pricingMeta: { source: 'Qualified supplier quote Q-42', date: '2026-08-25', rowCount: 6 },
  estimateBasis: { currency: 'USD', materialFactor: 1, laborEscalationFactor: 1 },
  inputFingerprint: 'inputs-1',
  contingencyPct: 0.15,
});
assert.equal(assurance.status, 'pass');
assert.equal(assurance.classification, 'Screening only');
assert.equal(assurance.totals.subtotal, 3625);
assert.equal(assurance.totals.total, 4168.75);

const quantityMismatch = buildRouteCostAssurance({
  routeResults: [route('C-1')],
  cables: [cables[0]],
  trays,
  lineItems: [{ ...lineItems[0], quantity: 90 }, lineItems[2]],
  governedPrices,
  pricingMeta: { source: 'Q-42', date: '2026-08-25' },
  inputFingerprint: 'inputs-1',
});
assert(quantityMismatch.blockingIssues.some(item => item.code === 'ROUTE-COST-QUANTITY-MISMATCH'));

const changedPrice = buildRouteCostAssurance({
  routeResults: [route('C-1'), route('C-2')],
  cables,
  trays,
  lineItems: [{ ...lineItems[0], unitPrice: 3, materialCost: 900, totalCost: 975 }, ...lineItems.slice(1)],
  governedPrices: { ...governedPrices, cable: { '4 AWG': 3 } },
  pricingMeta: { source: 'Qualified supplier quote Q-43', date: '2026-08-25' },
  inputFingerprint: 'inputs-1',
});
assert.notEqual(changedPrice.signature, assurance.signature);

const missingFittingProductivity = buildRouteCostAssurance({
  routeResults: [route('C-1'), route('C-2')],
  cables,
  trays: [{ ...trays[0], fitting_count: 2 }],
  lineItems: lineItems.map(item => item.category === 'Tray'
    ? { ...item, fittingCount: 2, fittingUnitPrice: 40, materialCost: 1080, totalCost: 1440 }
    : item),
  governedPrices: { ...governedPrices, fitting: 40 },
  pricingMeta: { source: 'Q-42', date: '2026-08-25' },
  inputFingerprint: 'inputs-1',
});
assert(missingFittingProductivity.blockingIssues.some(item => item.code === 'ROUTE-COST-FITTING-PRODUCTIVITY-UNGOVERNED'));

const genericCatalogPrice = buildRouteCostAssurance({
  routeResults: [route('C-1'), route('C-2')],
  cables,
  trays,
  lineItems: lineItems.map(item => item.id === 'C-1'
    ? { ...item, catalogNumber: 'CAB-4-EXACT', priceBasis: 'schedule-attribute' }
    : item),
  governedPrices,
  pricingMeta: { source: 'Q-42', date: '2026-08-25' },
  inputFingerprint: 'inputs-1',
});
assert(genericCatalogPrice.blockingIssues.some(item => item.code === 'ROUTE-COST-CATALOG-PRICE-UNGOVERNED'));

const ductbankRoute = {
  cable: 'C-DB',
  status: 'Routed',
  total_length: 100,
  route_segments: [{
    type: 'ductbank',
    ductbankTag: 'DB-1',
    tray_id: 'DB-1',
    length: 100,
    start: [0, 0, 0],
    end: [100, 0, 0],
  }],
};
const ductbankCable = [{ cable_tag: 'C-DB', conductor_size: '4 AWG', conductors: 3 }];
const ductbankSchedule = [{
  tag: 'DB-1',
  length_ft: 100,
  depth_in: 36,
  concrete_encasement: true,
  conduits: [{ conduit_id: 'DB-C1', conduit_type: 'PVC Sch 40', trade_size: '2', x: 0, y: 0 }],
}];
const ductbankLedger = buildRouteQuantityLedger({
  routeResults: [ductbankRoute],
  cables: ductbankCable,
  ductbanks: ductbankSchedule,
});
assert(!ductbankLedger.warnings.some(item => item.code === 'ROUTE-COST-SUPPORT-SPACING-ASSUMED'));
const unpricedDuctbank = estimateDuctbankCosts(ductbankSchedule, ductbankLedger.rows);
const construction = {};
const laborUnitHours = {};
unpricedDuctbank.lineItems.forEach(item => {
  construction[item.priceKey] = 2;
  laborUnitHours[item.laborHoursKey] = 0.25;
});
const ductbankPrices = {
  cable: { '4 AWG': 2 },
  construction,
  laborUnitHours,
  labor: { cableInstall: 75, civilInstall: 100 },
  laborProductivity: { cablePullFtPerHr: 100 },
};
const pricedDuctbank = estimateDuctbankCosts(ductbankSchedule, ductbankLedger.rows, ductbankPrices);
const ductbankAssurance = buildRouteCostAssurance({
  routeResults: [ductbankRoute],
  cables: ductbankCable,
  ductbanks: ductbankSchedule,
  lineItems: [
    ...estimateCableCosts(ductbankCable, [ductbankRoute], ductbankPrices),
    ...pricedDuctbank.lineItems,
  ],
  ductbankAssemblies: pricedDuctbank.assemblies,
  governedPrices: ductbankPrices,
  pricingMeta: { source: 'Civil subcontractor Q-17', date: '2026-08-25' },
  estimateBasis: { currency: 'USD', materialFactor: 1, laborEscalationFactor: 1 },
  inputFingerprint: 'inputs-db',
});
assert.equal(ductbankAssurance.status, 'pass');
assert(ductbankAssurance.totals.subtotal > 0);

const incompleteDuctbank = estimateDuctbankCosts(
  [{ ...ductbankSchedule[0], depth_in: 0 }],
  ductbankLedger.rows,
  ductbankPrices
);
const incompleteDuctbankAssurance = buildRouteCostAssurance({
  routeResults: [ductbankRoute],
  cables: ductbankCable,
  ductbanks: [{ ...ductbankSchedule[0], depth_in: 0 }],
  lineItems: [
    ...estimateCableCosts(ductbankCable, [ductbankRoute], ductbankPrices),
    ...incompleteDuctbank.lineItems,
  ],
  ductbankAssemblies: incompleteDuctbank.assemblies,
  governedPrices: ductbankPrices,
  pricingMeta: { source: 'Civil subcontractor Q-17', date: '2026-08-25' },
  inputFingerprint: 'inputs-db',
});
assert(incompleteDuctbankAssurance.blockingIssues.some(item => item.code === 'ROUTE-COST-DUCTBANK-BOM-INCOMPLETE'));

const stale = assessSavedRouteCostArtifact({ routeCostAssurance: assurance }, 'inputs-2');
assert.equal(stale.status, 'blocked');
assert(stale.blockingIssues.some(item => item.code === 'ROUTE-COST-ASSURANCE-STALE'));

console.log('route cost assurance');
