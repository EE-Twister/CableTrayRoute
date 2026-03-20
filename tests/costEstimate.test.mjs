/**
 * Tests for analysis/costEstimate.mjs
 */
import assert from 'assert';
import {
  estimateCableCosts,
  estimateTrayCosts,
  estimateConduitCosts,
  summarizeCosts,
  DEFAULT_PRICES,
} from '../analysis/costEstimate.mjs';

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

// ---------------------------------------------------------------------------
describe('DEFAULT_PRICES', () => {
  it('has cable prices for common AWG sizes', () => {
    assert.ok(DEFAULT_PRICES.cable['4 AWG'] > 0);
    assert.ok(DEFAULT_PRICES.cable['default'] > 0);
  });

  it('has tray prices for standard widths', () => {
    assert.ok(DEFAULT_PRICES.tray['12'] > 0);
    assert.ok(DEFAULT_PRICES.tray['default'] > 0);
  });

  it('has conduit prices for common trade sizes', () => {
    assert.ok(DEFAULT_PRICES.conduit['1'] > 0);
    assert.ok(DEFAULT_PRICES.conduit['default'] > 0);
  });

  it('has labor rates', () => {
    assert.ok(DEFAULT_PRICES.labor.cableInstall > 0);
    assert.ok(DEFAULT_PRICES.labor.trayInstall > 0);
  });
});

// ---------------------------------------------------------------------------
describe('estimateCableCosts', () => {
  const cables = [
    { cable_tag: 'C-001', conductor_size: '4 AWG', conductors: 3 },
    { cable_tag: 'C-002', conductor_size: '2/0', conductors: 3 },
  ];
  const routes = [
    { cable: 'C-001', total_length: '200' },
    { cable: 'C-002', total_length: '150' },
  ];

  it('returns one item per cable', () => {
    const items = estimateCableCosts(cables, routes);
    assert.strictEqual(items.length, 2);
  });

  it('assigns category Cable', () => {
    const items = estimateCableCosts(cables, routes);
    assert.ok(items.every(i => i.category === 'Cable'));
  });

  it('uses route length when available', () => {
    const items = estimateCableCosts(cables, routes);
    assert.strictEqual(items[0].quantity, 200);
    assert.strictEqual(items[1].quantity, 150);
  });

  it('computes non-zero costs for known sizes', () => {
    const items = estimateCableCosts(cables, routes);
    assert.ok(items[0].materialCost > 0);
    assert.ok(items[0].laborCost > 0);
    assert.ok(items[0].totalCost > 0);
  });

  it('falls back to default price for unknown size', () => {
    const unknownCable = [{ cable_tag: 'X-1', conductor_size: 'UNKNOWN', conductors: 1 }];
    const unknownRoute = [{ cable: 'X-1', total_length: '100' }];
    const items = estimateCableCosts(unknownCable, unknownRoute);
    assert.strictEqual(items[0].unitPrice, DEFAULT_PRICES.cable['default']);
  });

  it('returns empty array for empty input', () => {
    assert.deepStrictEqual(estimateCableCosts([], []), []);
  });
});

// ---------------------------------------------------------------------------
describe('estimateTrayCosts', () => {
  const trays = [
    { tray_id: 'T-01', tray_type: 'Ladder', inside_width: '12', length_ft: '100' },
    { tray_id: 'T-02', tray_type: 'Solid', inside_width: '6', length_ft: '50', fitting_count: '4' },
  ];

  it('returns one item per tray', () => {
    assert.strictEqual(estimateTrayCosts(trays).length, 2);
  });

  it('assigns category Tray', () => {
    assert.ok(estimateTrayCosts(trays).every(i => i.category === 'Tray'));
  });

  it('uses length_ft correctly', () => {
    const items = estimateTrayCosts(trays);
    assert.strictEqual(items[0].quantity, 100);
    assert.strictEqual(items[1].quantity, 50);
  });

  it('adds fitting cost when fitting_count provided', () => {
    const items = estimateTrayCosts(trays);
    const withFittings = items[1].materialCost;
    const withoutFittings = estimateTrayCosts([{ ...trays[1], fitting_count: '0' }])[0].materialCost;
    assert.ok(withFittings > withoutFittings);
  });
});

// ---------------------------------------------------------------------------
describe('estimateConduitCosts', () => {
  const conduits = [
    { conduit_id: 'CND-01', conduit_type: 'EMT', trade_size: '2', length_ft: '80' },
  ];

  it('returns one item per conduit', () => {
    assert.strictEqual(estimateConduitCosts(conduits).length, 1);
  });

  it('assigns category Conduit', () => {
    assert.ok(estimateConduitCosts(conduits).every(i => i.category === 'Conduit'));
  });

  it('uses known trade size price', () => {
    const items = estimateConduitCosts(conduits);
    assert.strictEqual(items[0].unitPrice, DEFAULT_PRICES.conduit['2']);
  });
});

// ---------------------------------------------------------------------------
describe('summarizeCosts', () => {
  const lineItems = [
    { category: 'Cable', materialCost: 500, laborCost: 200, totalCost: 700 },
    { category: 'Cable', materialCost: 300, laborCost: 100, totalCost: 400 },
    { category: 'Tray',  materialCost: 800, laborCost: 250, totalCost: 1050 },
  ];

  it('sums by category', () => {
    const { categories } = summarizeCosts(lineItems);
    assert.strictEqual(categories.Cable.totalCost, 1100);
    assert.strictEqual(categories.Tray.totalCost, 1050);
  });

  it('computes grand total', () => {
    const { grandTotal } = summarizeCosts(lineItems);
    assert.strictEqual(grandTotal, 2150);
  });

  it('separates material and labor in grand totals', () => {
    const { grandMaterial, grandLabor } = summarizeCosts(lineItems);
    assert.strictEqual(grandMaterial, 1600);
    assert.strictEqual(grandLabor, 550);
  });

  it('returns zeros for empty input', () => {
    const { grandTotal } = summarizeCosts([]);
    assert.strictEqual(grandTotal, 0);
  });
});
