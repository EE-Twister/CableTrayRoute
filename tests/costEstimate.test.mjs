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
  parsePricingCSV,
  exportPricingCSV,
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

// ---------------------------------------------------------------------------
const FULL_CSV = `# CableTrayRoute Pricing Book
# Source: Distributor ABC
# Date: 2026-04-11
category,key,unit_price,unit,source,date
cable,14 AWG,0.22,$/ft,Distributor ABC,2026-04-11
cable,12 AWG,0.30,$/ft,Distributor ABC,2026-04-11
cable,default,1.65,$/ft,Distributor ABC,2026-04-11
tray,12,7.20,$/ft,Distributor ABC,2026-04-11
tray,default,7.50,$/ft,Distributor ABC,2026-04-11
conduit,1,1.35,$/ft,Distributor ABC,2026-04-11
conduit,default,3.20,$/ft,Distributor ABC,2026-04-11
fitting,,42.00,$,Distributor ABC,2026-04-11
labor,cableInstall,80.00,$/hr,Distributor ABC,2026-04-11
labor,trayInstall,95.00,$/hr,Distributor ABC,2026-04-11
labor,conduitInstall,90.00,$/hr,Distributor ABC,2026-04-11
productivity,cablePullFtPerHr,140,ft/hr,Distributor ABC,2026-04-11
`;

describe('parsePricingCSV — valid full CSV', () => {
  const { prices, meta } = parsePricingCSV(FULL_CSV);

  it('parses cable prices into prices.cable map', () => {
    assert.strictEqual(prices.cable['14 AWG'], 0.22);
    assert.strictEqual(prices.cable['12 AWG'], 0.30);
    assert.strictEqual(prices.cable['default'], 1.65);
  });

  it('parses tray prices into prices.tray map', () => {
    assert.strictEqual(prices.tray['12'], 7.20);
    assert.strictEqual(prices.tray['default'], 7.50);
  });

  it('parses conduit prices into prices.conduit map', () => {
    assert.strictEqual(prices.conduit['1'], 1.35);
    assert.strictEqual(prices.conduit['default'], 3.20);
  });

  it('parses labor rates into prices.labor map', () => {
    assert.strictEqual(prices.labor.cableInstall, 80.00);
    assert.strictEqual(prices.labor.trayInstall, 95.00);
    assert.strictEqual(prices.labor.conduitInstall, 90.00);
  });

  it('parses fitting price as scalar', () => {
    assert.strictEqual(prices.fitting, 42.00);
  });

  it('parses productivity values', () => {
    assert.strictEqual(prices.laborProductivity.cablePullFtPerHr, 140);
  });

  it('returns correct meta.source', () => {
    assert.strictEqual(meta.source, 'Distributor ABC');
  });

  it('returns correct meta.date', () => {
    assert.strictEqual(meta.date, '2026-04-11');
  });

  it('returns correct meta.rowCount', () => {
    assert.strictEqual(meta.rowCount, 12);
  });

  it('returns empty warnings array', () => {
    assert.ok(Array.isArray(meta.warnings));
    assert.strictEqual(meta.warnings.length, 0);
  });
});

// ---------------------------------------------------------------------------
describe('parsePricingCSV — partial CSV (cable only)', () => {
  const csv = `category,key,unit_price,unit,source,date
cable,4 AWG,1.40,$/ft,Local Supplier,2026-01-01
cable,default,2.00,$/ft,Local Supplier,2026-01-01
`;
  const { prices, meta } = parsePricingCSV(csv);

  it('populates prices.cable', () => {
    assert.strictEqual(prices.cable['4 AWG'], 1.40);
    assert.strictEqual(prices.cable['default'], 2.00);
  });

  it('does not include tray or conduit keys', () => {
    assert.strictEqual(prices.tray, undefined);
    assert.strictEqual(prices.conduit, undefined);
  });

  it('reports correct rowCount', () => {
    assert.strictEqual(meta.rowCount, 2);
  });
});

// ---------------------------------------------------------------------------
describe('parsePricingCSV — malformed input', () => {
  it('skips rows with non-numeric unit_price', () => {
    const csv = `category,key,unit_price,unit,source,date
cable,12 AWG,N/A,$/ft,,
cable,10 AWG,0.48,$/ft,,
`;
    const { prices, meta } = parsePricingCSV(csv);
    assert.strictEqual(prices.cable['12 AWG'], undefined);
    assert.strictEqual(prices.cable['10 AWG'], 0.48);
    assert.ok(meta.warnings.some(w => w.includes('N/A')));
  });

  it('skips blank lines and comment lines', () => {
    const csv = `# this is a comment
category,key,unit_price,unit,source,date

# another comment
cable,8 AWG,0.70,$/ft,,
`;
    const { prices, meta } = parsePricingCSV(csv);
    assert.strictEqual(prices.cable['8 AWG'], 0.70);
    assert.strictEqual(meta.warnings.length, 0);
  });

  it('adds a warning for unrecognized categories', () => {
    const csv = `category,key,unit_price,unit,source,date
widget,foo,9.99,$/ea,,
`;
    const { meta } = parsePricingCSV(csv);
    assert.ok(meta.warnings.some(w => w.includes('widget')));
  });

  it('returns empty prices object for completely malformed CSV', () => {
    const { prices, meta } = parsePricingCSV('not,a,pricing,csv\ngarbage');
    assert.deepStrictEqual(prices, {});
    assert.strictEqual(meta.rowCount, 0);
  });

  it('skips unknown labor keys and warns', () => {
    const csv = `category,key,unit_price,unit,source,date
labor,unknownKey,99.00,$/hr,,
`;
    const { prices, meta } = parsePricingCSV(csv);
    assert.strictEqual(prices.labor, undefined);
    assert.ok(meta.warnings.some(w => w.includes('unknownKey')));
  });
});

// ---------------------------------------------------------------------------
describe('exportPricingCSV — roundtrip', () => {
  it('export then parse gives same cable prices', () => {
    const original = { cable: { '4 AWG': 1.30, 'default': 1.50 } };
    const csv = exportPricingCSV(original, { source: 'Test', date: '2026-04-11' });
    const { prices } = parsePricingCSV(csv);
    assert.strictEqual(prices.cable['4 AWG'], 1.30);
    assert.strictEqual(prices.cable['default'], 1.50);
  });

  it('export then parse gives same tray prices', () => {
    const original = { tray: { '12': 7.20, 'default': 7.00 } };
    const csv = exportPricingCSV(original, {});
    const { prices } = parsePricingCSV(csv);
    assert.strictEqual(prices.tray['12'], 7.20);
    assert.strictEqual(prices.tray['default'], 7.00);
  });

  it('export then parse gives same fitting price', () => {
    const original = { fitting: 42.50 };
    const csv = exportPricingCSV(original, {});
    const { prices } = parsePricingCSV(csv);
    assert.strictEqual(prices.fitting, 42.50);
  });

  it('export then parse preserves labor rates', () => {
    const original = { labor: { cableInstall: 82, trayInstall: 97, conduitInstall: 91 } };
    const csv = exportPricingCSV(original, {});
    const { prices } = parsePricingCSV(csv);
    assert.strictEqual(prices.labor.cableInstall, 82);
    assert.strictEqual(prices.labor.trayInstall, 97);
  });

  it('CSV includes meta source and date in header comment', () => {
    const csv = exportPricingCSV({}, { source: 'IBEW Local', date: '2026-04-11' });
    assert.ok(csv.includes('IBEW Local'));
    assert.ok(csv.includes('2026-04-11'));
  });

  it('CSV starts with a comment block', () => {
    const csv = exportPricingCSV({});
    assert.ok(csv.startsWith('# CableTrayRoute Pricing Book'));
  });

  it('roundtrip of DEFAULT_PRICES preserves all cable entries', () => {
    const csv = exportPricingCSV(DEFAULT_PRICES, { source: 'RS Means 2024' });
    const { prices } = parsePricingCSV(csv);
    Object.entries(DEFAULT_PRICES.cable).forEach(([k, v]) => {
      assert.strictEqual(prices.cable[k], v, `Mismatch for cable key "${k}"`);
    });
  });
});
