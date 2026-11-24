/**
 * Cost Estimate XLSX export: the workbook is built from the run-time snapshot,
 * money and quantity cells are numbers, and export is refused when page inputs
 * changed after the run.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import {
  applyEstimateBasis,
  buildCostEstimateWorkbookSheets,
  buildEstimateBasis,
  DEFAULT_PRICES,
  estimateCableCosts,
  estimateDuctbankCosts,
  listChangedEstimateInputs,
} from '../analysis/costEstimate.mjs';
import { buildRouteCostAssurance, buildRouteQuantityLedger } from '../analysis/routeCostAssurance.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  ✓', name); }
  catch (error) { console.error('  ✗', name, error.message || error); process.exitCode = 1; }
}

const runBasisInputs = {
  estimateClass: 'Conceptual / screening',
  baseDate: '2024-01',
  estimateDate: '2026-11',
  laborRegion: 'United States — national',
  nationalElectricianHourlyWage: 29.98,
  localElectricianHourlyWage: 29.98,
  materialBaseIndex: 100,
  materialCurrentIndex: 100,
  materialSeriesId: '',
  materialSeriesName: 'BLS PPI — user-selected electrical material series',
  laborBaseIndex: 100,
  laborCurrentIndex: 100,
  laborSeriesId: '',
  laborSeriesName: 'BLS ECI — user-selected non-seasonally adjusted construction series',
};

const runInputs = {
  basis: runBasisInputs,
  contingencyPct: 0.15,
  overrides: { laborCableRate: null, laborTrayRate: null, laborConduitRate: null, fittingPrice: null },
  pricing: null,
};

// Subtotal $3,101.00; 15 % contingency $465.15; grand total $3,566.15 (screen: $3,566).
const lineItems = [
  { category: 'Cables', id: 'C1', description: '3/C #4 AWG', unit: 'ft', quantity: 250.12345, unitPrice: 3.456, laborHrs: 4.16666, materialCost: 864.42, laborCost: 650.58, totalCost: 1515 },
  { category: 'Trays', id: 'T1', description: '12 in ladder', unit: 'ft', quantity: 100, unitPrice: 5.5, laborHrs: 3.3333, materialCost: 550.25, laborCost: 279.75, totalCost: 830 },
  { category: 'Conduits', id: 'K1', description: '2 in EMT', unit: 'ft', quantity: 80, unitPrice: 4.1, laborHrs: 2.5, materialCost: 328, laborCost: 428, totalCost: 756 },
];

const snapshot = {
  generatedAt: '2026-11-23T12:00:00.000Z',
  inputs: runInputs,
  basis: buildEstimateBasis(runBasisInputs),
  contingencyPct: 0.15,
  pricingSource: 'Built-in 2024 conceptual pricing allowances',
  lineItems,
  routeCostAssurance: null,
  ductbankAssemblies: [],
};

function sheetRows(sheets, name) {
  return sheets.find(sheet => sheet.name === name)?.rows || [];
}

describe('Cost Estimate workbook built from the run-time snapshot', () => {
  const sheets = buildCostEstimateWorkbookSheets(snapshot);
  const summary = sheetRows(sheets, 'Summary');
  const findRow = label => summary.find(row => row[0] === label) || [];

  it('reports the run-time contingency, subtotal and grand total as whole-dollar numbers', () => {
    assert.deepEqual(findRow('Subtotal'), ['Subtotal', 1743, 1358, 3101]);
    assert.deepEqual(findRow('Contingency (15%)'), ['Contingency (15%)', '', '', 465]);
    assert.deepEqual(findRow('Grand Total'), ['Grand Total', '', '', 3566]);
    assert.deepEqual(findRow('Cables'), ['Cables', 864, 651, 1515]);
  });

  it('records the snapshot basis and run time, not live page values', () => {
    assert.ok(summary.some(row => row[0] === 'Material factor: 1.000000'));
    assert.ok(summary.some(row => row[0] === 'Estimate run: 2026-11-23T12:00:00.000Z'));
    const basisRows = sheetRows(sheets, 'Estimate Basis');
    assert.deepEqual(basisRows.find(row => row[0] === 'Material current index'), ['Material current index', 100, '']);
  });

  it('writes line-item money and quantities as numbers that Excel can SUM', () => {
    const [header, first] = sheetRows(sheets, 'Line Items');
    const cell = name => first[header.indexOf(name)];
    assert.equal(cell('Quantity'), 250.123);
    assert.equal(cell('Unit Price ($)'), 3.46);
    assert.equal(cell('Labor Hours'), 4.167);
    assert.equal(cell('Material ($)'), 864.42);
    assert.equal(cell('Labor ($)'), 650.58);
    assert.equal(cell('Total ($)'), 1515);
    const totals = sheetRows(sheets, 'Line Items').slice(1).map(row => row[header.indexOf('Total ($)')]);
    assert.ok(totals.every(value => typeof value === 'number'));
    assert.equal(totals.reduce((sum, value) => sum + value, 0), 3101);
  });

  it('round-trips through XLSX with numeric cells and the on-screen text rendering', () => {
    const wb = { SheetNames: [], Sheets: {} };
    sheets.forEach(({ name, rows }) => {
      wb.SheetNames.push(name);
      wb.Sheets[name] = XLSX.utils.aoa_to_sheet(rows);
    });
    const read = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
    const formatted = XLSX.utils.sheet_to_json(read.Sheets.Summary, { header: 1, defval: '', raw: false });
    assert.equal(formatted.find(row => row[0] === 'Subtotal')[3], '3101');
    assert.equal(formatted.find(row => row[0] === 'Contingency (15%)')[3], '465');
    assert.equal(formatted.find(row => row[0] === 'Grand Total')[3], '3566');
    const raw = XLSX.utils.sheet_to_json(read.Sheets['Line Items'], { header: 1, defval: '' });
    assert.equal(typeof raw[1][12], 'number');
    const grandTotalRow = summary.findIndex(row => row[0] === 'Grand Total') + 1;
    assert.equal(read.Sheets.Summary[`D${grandTotalRow}`].t, 'n');
  });

  it('keeps the route quantity and ductbank sheets when assurance evidence exists', () => {
    const withAssurance = buildCostEstimateWorkbookSheets({
      ...snapshot,
      routeCostAssurance: {
        classification: 'Conceptual',
        status: 'pass',
        signature: 'cost-sig',
        inputFingerprint: 'fp',
        quantityLedger: { signature: 'qty-sig', rows: [{ category: 'Tray', id: 'T1', quantity: 100, unit: 'ft', basis: 'route' }] },
        issues: [],
        warnings: [],
      },
      ductbankAssemblies: [{ ductbankId: 'DB-1', ready: true, routeQuantityFt: 100, bom: { rows: [{ category: 'Civil', item: 'Trench excavation', specification: '', quantity: 10, unit: 'yd3', basis: 'route' }] } }],
    });
    assert.deepEqual(withAssurance.map(sheet => sheet.name), ['Summary', 'Estimate Basis', 'Line Items', 'Route Quantity', 'Cost Assurance', 'Ductbank Assemblies']);
    assert.equal(sheetRows(withAssurance, 'Ductbank Assemblies')[1][4], 'Trench excavation');
  });
});

describe('Estimate input change detection', () => {
  it('reports no change when the page still matches the run', () => {
    assert.deepEqual(listChangedEstimateInputs(runInputs, structuredClone(runInputs)), []);
  });

  it('names contingency and PPI index edits made after the run (review finding E4)', () => {
    const current = structuredClone(runInputs);
    current.contingencyPct = 0.30;
    current.basis.materialCurrentIndex = 150;
    assert.deepEqual(listChangedEstimateInputs(runInputs, current), ['Contingency (%)', 'Current PPI index']);
  });

  it('detects manual rate overrides and pricing-book imports or resets', () => {
    const overridden = structuredClone(runInputs);
    overridden.overrides.fittingPrice = 40;
    assert.deepEqual(listChangedEstimateInputs(runInputs, overridden), ['Tray fitting unit price']);
    const imported = { ...runInputs, pricing: { prices: { cable: { default: 2 } }, meta: { source: 'Quote', rowCount: 1 } } };
    assert.deepEqual(listChangedEstimateInputs(runInputs, imported), ['Pricing book']);
    assert.deepEqual(listChangedEstimateInputs(imported, runInputs), ['Pricing book']);
  });
});

describe('Snapshot of real estimator output', () => {
  it('survives structuredClone and builds every sheet, as runEstimate does before rendering', () => {
    const route = {
      cable: 'C-DB',
      status: 'Routed',
      total_length: 100,
      route_segments: [{ type: 'ductbank', ductbankTag: 'DB-1', tray_id: 'DB-1', length: 100, start: [0, 0, 0], end: [100, 0, 0] }],
    };
    const cables = [{ cable_tag: 'C-DB', conductor_size: '4 AWG', conductors: 3 }];
    const ductbanks = [{
      tag: 'DB-1', length_ft: 100, depth_in: 36, concrete_encasement: true,
      conduits: [{ conduit_id: 'DB-C1', conduit_type: 'PVC Sch 40', trade_size: '2', x: 0, y: 0 }],
    }];
    const basis = buildEstimateBasis(runBasisInputs);
    const prices = applyEstimateBasis(DEFAULT_PRICES, basis);
    const ledger = buildRouteQuantityLedger({ routeResults: [route], cables, ductbanks });
    const ductbankEstimate = estimateDuctbankCosts(ductbanks, ledger.rows, prices);
    const items = [...estimateCableCosts(cables, [route], prices), ...ductbankEstimate.lineItems];
    const assurance = buildRouteCostAssurance({
      routeResults: [route], cables, ductbanks, lineItems: items, estimateBasis: basis,
      pricingMeta: {}, governedPrices: null, ductbankAssemblies: ductbankEstimate.assemblies,
      contingencyPct: 0.15, inputFingerprint: 'fp',
    });
    const cloned = structuredClone({
      ...snapshot, basis, lineItems: items, routeCostAssurance: assurance, ductbankAssemblies: ductbankEstimate.assemblies,
    });
    const sheets = buildCostEstimateWorkbookSheets(cloned);
    assert.ok(items.length > 1);
    assert.deepEqual(sheets.map(sheet => sheet.name), ['Summary', 'Estimate Basis', 'Line Items', 'Route Quantity', 'Cost Assurance', 'Ductbank Assemblies']);
    assert.equal(sheetRows(sheets, 'Line Items').length, items.length + 1);
  });
});

const source = await readFile(new URL('../costestimate.js', import.meta.url), 'utf8');
describe('Cost Estimate page export wiring', () => {
  const body = name => {
    const start = source.indexOf(`function ${name}(`);
    const next = source.indexOf('\n  function ', start + 1);
    return source.slice(start, next === -1 ? undefined : next);
  };
  it('exports only from the snapshot and blocks when inputs changed', () => {
    const exportBody = body('exportXlsx');
    assert.match(exportBody, /buildCostEstimateWorkbookSheets\(lastEstimateSnapshot\)/);
    assert.match(exportBody, /listChangedEstimateInputs\(lastEstimateSnapshot\.inputs, readEstimateInputs\(\)\)/);
    assert.doesNotMatch(exportBody, /getContingencyPct|lastEstimateBasis|customPricingMeta|toFixed/);
  });
  it('does not let the escalation preview overwrite the run-time basis', () => {
    assert.doesNotMatch(body('updateEscalationPreview'), /lastEstimateBasis\s*=/);
  });
});
