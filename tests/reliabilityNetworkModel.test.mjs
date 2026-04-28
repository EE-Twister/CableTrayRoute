import assert from 'node:assert/strict';
import {
  buildReliabilityIndices,
  buildReliabilityNetworkPackage,
  evaluateReliabilityNetworkModel,
  normalizeReliabilityComponentRows,
  normalizeReliabilityCustomerRows,
  normalizeReliabilityModel,
  normalizeReliabilityRestorationRows,
  renderReliabilityNetworkHTML,
  runReliability,
} from '../analysis/reliability.js';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

const componentRows = [
  {
    id: 'brk-1',
    tag: 'Breaker <A>',
    type: 'breaker',
    mtbf: 8760,
    mttr: 4,
    protectionZone: 'Z1',
    commonModeGroup: 'SWGR-1',
  },
  {
    id: 'xfmr-1',
    tag: 'Transformer B',
    type: 'transformer',
    failureRatePerYear: 0.5,
    repairTimeHours: 8,
    protectionZone: 'Z2',
    commonModeGroup: 'SWGR-1',
  },
];

const customerRows = [
  {
    id: 'cust-1',
    name: 'Process <Line>',
    protectionZone: 'Z1',
    customerCount: 10,
    loadKw: 100,
    valueOfLostLoadPerKwh: 10,
  },
  {
    id: 'cust-2',
    name: 'Warehouse',
    protectionZone: 'Z2',
    customerCount: 5,
    loadKw: 50,
    valueOfLostLoadPerKwh: 5,
  },
];

describe('reliability network model', () => {
  it('preserves legacy runReliability behavior', () => {
    const result = runReliability([{ id: 'brk-1', type: 'breaker', mtbf: 8760, mttr: 4 }]);
    assert.equal(result.systemAvailability, 1);
    assert.equal(result.expectedOutage, 4);
    assert('componentStats' in result);
    assert.equal(result.componentStats['brk-1'].downtime, 4);
  });

  it('normalizes legacy reliability results into a package-compatible output', () => {
    const legacy = runReliability([{ id: 'brk-1', type: 'breaker', mtbf: 8760, mttr: 4, protectionZone: 'Z1' }]);
    const pkg = buildReliabilityNetworkPackage({
      projectName: 'North <Unit>',
      reliability: legacy,
      components: [{ id: 'brk-1', tag: 'Breaker <A>', type: 'breaker', mtbf: 8760, mttr: 4, protectionZone: 'Z1' }],
      customerRows: [customerRows[0]],
      generatedAt: '2026-04-27T12:00:00.000Z',
    });
    assert.equal(pkg.version, 'reliability-network-v1');
    assert.equal(pkg.legacyResult.expectedOutage, 4);
    assert(pkg.warningRows.some(row => row.code === 'legacyReliabilityResult'));
    assert.equal(pkg.summary.totalCustomers, 10);
  });

  it('normalizes model, component, customer, and restoration rows with deterministic defaults', () => {
    const model = normalizeReliabilityModel({});
    assert.equal(model.annualHours, 8760);
    assert.equal(model.restorationEnabled, true);

    const components = normalizeReliabilityComponentRows([{ id: 'brk-1', mtbf: 8760, mttr: 4 }], { model });
    assert.equal(components[0].failureRatePerYear, 1);
    assert.equal(components[0].repairTimeHours, 4);

    const customers = normalizeReliabilityCustomerRows([{ name: 'Load A', customers: 3 }], { model });
    assert.equal(customers[0].customerCount, 3);
    assert.equal(customers[0].valueOfLostLoadPerKwh, 10);

    const restoration = normalizeReliabilityRestorationRows([{ sourceId: 'tie-1', switchId: 'sw-1', capacityKw: 200 }]);
    assert.equal(restoration[0].tieSourceId, 'tie-1');
    assert.equal(restoration[0].restorationTimeHours, 1);
  });

  it('rejects invalid numeric values', () => {
    assert.throws(() => normalizeReliabilityModel({ annualHours: 0 }), /annualHours/);
    assert.throws(() => normalizeReliabilityComponentRows([{ id: 'bad', failureRatePerYear: -1 }]), /failureRatePerYear/);
    assert.throws(() => normalizeReliabilityCustomerRows([{ customerCount: -1 }]), /customerCount/);
    assert.throws(() => normalizeReliabilityRestorationRows([{ pickupCapacityKw: -1 }]), /pickupCapacityKw/);
  });

  it('calculates deterministic SAIFI, SAIDI, CAIDI, ASAI, EENS, and ECOST rows', () => {
    const evaluation = evaluateReliabilityNetworkModel({
      model: { saifiReviewLimit: 2, saidiReviewLimitHours: 2, eensReviewLimitKwh: 200 },
      componentRows: [componentRows[0]],
      customerRows: [customerRows[0]],
      restorationRows: [{ id: 'tie-1', tieSourceId: 'tie-a', switchingDevice: 'NO-1', affectedZone: 'Z1', restorationTimeHours: 1, pickupCapacityKw: 200 }],
    });
    const indices = Object.fromEntries(buildReliabilityIndices(evaluation).map(row => [row.id, row]));
    assert.equal(indices.SAIFI.value, 1);
    assert.equal(indices.SAIDI.value, 1);
    assert.equal(indices.CAIDI.value, 1);
    assert.equal(indices.ASAI.value, 0.99988584);
    assert.equal(indices.EENS.value, 100);
    assert.equal(indices.ECOST.value, 1000);
    assert.equal(indices.SAIFI.status, 'pass');
  });

  it('reduces customer interruption duration when restoration capacity and scope are valid', () => {
    const noRestoration = evaluateReliabilityNetworkModel({
      model: { restorationEnabled: true },
      componentRows: [componentRows[0]],
      customerRows: [customerRows[0]],
      restorationRows: [{ id: 'tie-small', tieSourceId: 'tie-a', switchingDevice: 'NO-1', affectedZone: 'Z1', restorationTimeHours: 1, pickupCapacityKw: 50 }],
    });
    assert.equal(noRestoration.scenarioRows[0].outageDurationHours, 4);
    assert.equal(noRestoration.scenarioRows[0].status, 'warn');

    const restored = evaluateReliabilityNetworkModel({
      model: { restorationEnabled: true },
      componentRows: [componentRows[0]],
      customerRows: [customerRows[0]],
      restorationRows: [{ id: 'tie-ok', tieSourceId: 'tie-a', switchingDevice: 'NO-1', affectedZone: 'Z1', restorationTimeHours: 1, pickupCapacityKw: 200 }],
    });
    assert.equal(restored.scenarioRows[0].outageDurationHours, 1);
    assert.equal(restored.scenarioRows[0].restorationApplied, true);
    assert.equal(restored.scenarioRows[0].status, 'pass');
  });

  it('creates common-mode scenario rows and stable contributor rankings', () => {
    const evaluation = evaluateReliabilityNetworkModel({
      model: { includeCommonMode: true },
      componentRows,
      customerRows,
      restorationRows: [],
    });
    assert(evaluation.scenarioRows.some(row => row.scenarioType === 'commonMode' && row.status === 'warn'));
    assert(evaluation.warningRows.some(row => row.code === 'commonModeGroup'));
    assert.equal(evaluation.contributorRows[0].rank, 1);
    assert(evaluation.contributorRows[0].customerHours >= evaluation.contributorRows[1].customerHours);
  });

  it('builds package summary and escapes rendered HTML', () => {
    const pkg = buildReliabilityNetworkPackage({
      projectName: 'North <Unit>',
      componentRows: [componentRows[0]],
      customerRows: [{ ...customerRows[0], notes: 'Critical <note>' }],
      restorationRows: [{ id: 'tie-<1>', tieSourceId: 'tie-a', switchingDevice: 'NO <1>', affectedZone: 'Z1', restorationTimeHours: 1, pickupCapacityKw: 200 }],
      generatedAt: '2026-04-27T12:00:00.000Z',
    });
    assert.equal(pkg.summary.componentCount, 1);
    assert.equal(pkg.summary.totalCustomers, 10);
    assert.equal(pkg.summary.saidi, 1);
    const html = renderReliabilityNetworkHTML(pkg);
    assert(html.includes('Reliability Network Model and Customer Indices'));
    assert(html.includes('Breaker &lt;A&gt;'));
    assert(!html.includes('Breaker <A>'));
  });
});
