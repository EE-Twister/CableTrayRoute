/**
 * Tray Fill "Export Excel": the Fill Analysis sheet reports the same selected
 * Article 392 evaluation the page draws, per compartment, plus the geometric
 * packing density labelled as not an NEC limit.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import { evaluateTrayFill } from '../analysis/trayFill.mjs';
import {
  buildTrayFillAnalysisRows,
  evaluateTrayFillCompartments,
  TRAY_FILL_ANALYSIS_SHEET,
} from '../src/tray-fill/fillAnalysisSheet.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  ✓', name); }
  catch (error) { console.error('  ✗', name, error.message || error); process.exitCode = 1; }
}

// Cable rows in the Draw Tray handler's shape.
function cable(overrides = {}) {
  return {
    tag: 'P-1',
    cableType: 'Power',
    count: 3,
    size: '#2 AWG',
    rating: 600,
    voltage: 480,
    cable_size: '',
    OD: 1,
    weight: 1,
    zone: 1,
    parallelCount: 1,
    ...overrides,
  };
}

const compartments = [
  { id: 1, width: 12, depth: 4, label: 'Power' },
  { id: 2, width: 6, depth: 4, label: '' },
];

const baseInput = {
  trayName: 'TR-1',
  trayType: 'ladder',
  trayWidth: 18,
  trayDepth: 4,
  compartments,
  cables: [
    cable({ tag: 'P-1' }),
    cable({ tag: 'P-2' }),
    cable({ tag: 'C-1', cableType: 'Control', count: 7, size: '#14 AWG', OD: 0.5, zone: 2 }),
  ],
};

function headerIndex(rows) {
  return rows.findIndex(row => row[0] === 'Compartment');
}

function dataRow(rows, label) {
  const header = rows[headerIndex(rows)];
  const row = rows.find(candidate => candidate[0] === label);
  return Object.fromEntries(header.map((name, index) => [name, row?.[index]]));
}

describe('Tray Fill analysis sheet', () => {
  it('evaluates each compartment exactly as the Draw Tray handler does', () => {
    const analysis = evaluateTrayFillCompartments(baseInput);
    const power = analysis.compartments.find(entry => entry.id === 1);
    const expected = evaluateTrayFill({ tray_id: 'TR-1:1', tray_type: 'ladder', inside_width: 12, tray_depth: 4 }, baseInput.cables.slice(0, 2));
    assert.deepEqual(power.result, expected);
    assert.equal(power.result.clause, '392.22(A)(1)(b)');
    assert.equal(analysis.status, 'pass');
    assert.equal(analysis.governingCompartment, 'Power');
  });

  it('writes clause, utilization, status, governing compartment and limits per compartment', () => {
    const rows = buildTrayFillAnalysisRows(baseInput);
    assert.deepEqual(rows.find(row => row[0] === 'Overall Article 392 status'), ['Overall Article 392 status', 'Selected-rule pass']);
    assert.deepEqual(rows.find(row => row[0] === 'Governing compartment'), ['Governing compartment', 'Power']);
    const power = dataRow(rows, 'Power');
    assert.equal(power['NEC 2023 clause'], '392.22(A)(1)(b)');
    assert.equal(power['Table 392.22(A)(1) column'], 1);
    assert.equal(power['Used cable area (in²)'], 1.571);
    assert.equal(power['Allowable cable area (in²)'], 14);
    assert.equal(power['Utilization of selected allowance (%)'], 11.2);
    assert.equal(power.Status, 'Selected-rule pass');
    assert.equal(power.Governing, 'Yes');
    assert.match(power['Result note'], /11\.2% of the selected 392\.22\(A\)\(1\)\(b\) allowance/);
    const control = dataRow(rows, 'Compartment 2');
    assert.equal(control['NEC 2023 clause'], '392.22(A)(2)');
    assert.equal(control['Allowable cable area (in²)'], 12);
    assert.equal(control['Utilization of selected allowance (%)'], 1.6);
    assert.equal(control.Governing, '');
  });

  it('reports geometric packing density with the gauge formula, labelled as not an NEC limit', () => {
    const rows = buildTrayFillAnalysisRows(baseInput);
    const header = rows[headerIndex(rows)];
    assert.ok(header.includes('Geometric packing density (%) — not an NEC limit'));
    assert.equal(dataRow(rows, 'Power')['Geometric packing density (%) — not an NEC limit'], 3.3);
    assert.ok(rows.some(row => /not an NEC limit/.test(row[0] || '')));
    const doubled = buildTrayFillAnalysisRows({ ...baseInput, cables: [cable({ parallelCount: 2 })] });
    assert.equal(dataRow(doubled, 'Power')['Geometric packing density (%) — not an NEC limit'], 3.3, 'parallel sets count toward area');
    assert.equal(dataRow(doubled, 'Power')['Cables'], 2);
  });

  it('marks an exceeding compartment as governing and the tray as an exceedance', () => {
    const crowded = Array.from({ length: 20 }, (_, index) => cable({ tag: `P-${index + 1}`, zone: 2 }));
    const rows = buildTrayFillAnalysisRows({ ...baseInput, cables: [...baseInput.cables.slice(0, 2), ...crowded] });
    assert.equal(rows.find(row => row[0] === 'Overall Article 392 status')[1], 'Selected-rule exceedance');
    assert.equal(rows.find(row => row[0] === 'Governing compartment')[1], 'Compartment 2');
    const over = dataRow(rows, 'Compartment 2');
    assert.equal(over.Status, 'Selected-rule exceedance');
    assert.ok(over['Utilization of selected allowance (%)'] > 100);
    assert.equal(over.Governing, 'Yes');
  });

  it('keeps incomplete evidence blank rather than 0 % and flags cables outside any compartment', () => {
    const rows = buildTrayFillAnalysisRows({
      ...baseInput,
      cables: [cable({ OD: Number.NaN }), cable({ tag: 'X-9', zone: 3 })],
    });
    const power = dataRow(rows, 'Power');
    assert.equal(power.Status, 'Evidence incomplete');
    assert.equal(power['Utilization of selected allowance (%)'], '');
    assert.match(power['Result note'], /outside diameter/);
    assert.equal(dataRow(rows, 'Compartment 2').Status, 'No cables assigned');
    assert.equal(rows.find(row => row[0] === 'Overall Article 392 status')[1], 'Evidence incomplete');
    assert.ok(rows.some(row => /Not evaluated: X-9 is assigned to a compartment that does not exist/.test(row[0] || '')));
  });

  it('uses the conductor size from the size picker the same way the page evaluator does', () => {
    const rows = buildTrayFillAnalysisRows({ ...baseInput, cables: [cable({ cable_size: '3/C 4/0 AWG', OD: 1.5 })] });
    assert.equal(dataRow(rows, 'Power')['NEC 2023 clause'], '392.22(A)(1)(a)');
    assert.equal(dataRow(rows, 'Power')['Used large-cable diameter sum (in)'], 1.5);
    assert.equal(dataRow(rows, 'Power')['Allowable large-cable diameter sum (in)'], 12);
  });

  it('flags only one governing compartment when labels repeat', () => {
    const sameLabels = [{ id: 1, width: 12, depth: 4, label: 'Power' }, { id: 2, width: 12, depth: 4, label: 'Power' }];
    const rows = buildTrayFillAnalysisRows({ ...baseInput, compartments: sameLabels, cables: [cable(), cable({ tag: 'P-2', zone: 2 }), cable({ tag: 'P-3', zone: 2 })] });
    const header = rows[headerIndex(rows)];
    const governingFlags = rows.slice(headerIndex(rows) + 1).filter(row => row[0] === 'Power').map(row => row[header.indexOf('Governing')]);
    assert.deepEqual(governingFlags, ['', 'Yes']);
  });

  it('produces a sheet SheetJS can write with numeric result cells', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildTrayFillAnalysisRows(baseInput)), TRAY_FILL_ANALYSIS_SHEET);
    const read = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(read.Sheets[TRAY_FILL_ANALYSIS_SHEET], { header: 1, defval: '' });
    assert.equal(typeof dataRow(rows, 'Power')['Utilization of selected allowance (%)'], 'number');
  });
});

const pageSource = await readFile(new URL('../cabletrayfill.js', import.meta.url), 'utf8');
describe('Tray Fill Export Excel wiring', () => {
  const start = pageSource.indexOf('function exportCableXlsx(');
  const body = pageSource.slice(start, pageSource.indexOf('function importCableXlsx(', start));
  it('builds evaluator cables like Draw Tray and appends the analysis after the import sheets', () => {
    assert.match(body, /cable_size:selSize\?selSize\.value:''/);
    assert.match(body, /parallelCount:Math\.max\(1,parseInt\(row\.dataset\.parallelCount\)\|\|1\)/);
    const cablesAt = body.indexOf("'Cables')");
    const compartmentsAt = body.indexOf("'Compartments')");
    const analysisAt = body.indexOf('TRAY_FILL_ANALYSIS_SHEET)');
    assert.ok(cablesAt > 0 && cablesAt < compartmentsAt && compartmentsAt < analysisAt);
  });
});
