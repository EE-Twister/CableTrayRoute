import assert from 'assert';
import {
  arcFlashBarRows,
  barChartHtml,
  nextStandardAicKa,
  ppeCategoryForEnergy,
  shortCircuitBarRows,
  statusBadgeHtml,
  voltageDropBarRows,
} from '../src/components/resultViz.mjs';

assert.strictEqual(nextStandardAicKa(21.9), 22);
assert.strictEqual(nextStandardAicKa(22), 22);
assert.strictEqual(nextStandardAicKa(250), null);
assert.strictEqual(nextStandardAicKa('abc'), null);

assert.strictEqual(ppeCategoryForEnergy(1).id, 'cat0');
assert.strictEqual(ppeCategoryForEnergy(4).id, 'cat1');
assert.strictEqual(ppeCategoryForEnergy(8).id, 'cat2');
assert.strictEqual(ppeCategoryForEnergy(25).id, 'cat3');
assert.strictEqual(ppeCategoryForEnergy(40).id, 'cat4');
assert.strictEqual(ppeCategoryForEnergy(41).id, 'danger');
assert.strictEqual(ppeCategoryForEnergy(null).id, 'unknown');

const scRows = shortCircuitBarRows([['a', { equipmentTag: 'MSB', threePhaseKA: 43 }], ['b', { threePhaseKA: 'x' }]]);
assert.strictEqual(scRows.length, 1);
assert.strictEqual(scRows[0].status, 'warn');
assert.match(scRows[0].note, /50 kA/);

assert.strictEqual(arcFlashBarRows([['x', { incidentEnergy: 12, boundary: 900 }]])[0].status, 'warn');

const vd = voltageDropBarRows([
  { tag: 'C1', evaluated: true, dropPct: 2, limitPct: 3, status: 'pass' },
  { tag: 'C2', evaluated: false },
]);
assert.strictEqual(vd.length, 1);
assert.strictEqual(vd[0].limit, 3);

const html = barChartHtml([{ label: '<b>x</b>', value: 5, limit: 10, status: 'fail' }, { label: 'y', value: 10 }], { unit: 'kA' });
assert.ok(!html.includes('<b>x</b>'), 'labels are escaped');
assert.ok(html.indexOf('y</span>') < html.indexOf('&lt;b&gt;x'), 'sorted descending');
assert.strictEqual(barChartHtml([]), '');
assert.ok(statusBadgeHtml('fail').includes('viz-badge--fail'));
assert.ok(statusBadgeHtml('bogus').includes('viz-badge--na'));
console.log('resultViz tests passed');

import { cableSummaryHtml, summarizeCables, racewaySummaryHtml } from '../src/components/scheduleSummary.mjs';
const sum = summarizeCables([
  { length: '100', operating_voltage: '480' },
  { length: '', operating_voltage: '13800' },
  { length: 50, operating_voltage: null },
]);
assert.strictEqual(sum.count, 3);
assert.strictEqual(sum.totalLength, 150);
assert.strictEqual(sum.missing, 2);
assert.strictEqual(sum.voltageMix['Medium voltage'], 1);
assert.strictEqual(cableSummaryHtml([]), '');
assert.ok(cableSummaryHtml([{ length: 1, operating_voltage: 480 }]).includes('viz-kpi'));
assert.strictEqual(racewaySummaryHtml({}), '');
console.log('scheduleSummary tests passed');

import { loadFlowVoltageRows } from '../src/components/resultViz.mjs';
const lf = loadFlowVoltageRows([{ id: 'B1', Vm: 0.93 }, { id: 'B2', Vm: 1.0 }, { id: 'B3' }]);
assert.strictEqual(lf.length, 2);
assert.strictEqual(lf[0].status, 'fail');
assert.strictEqual(lf[1].status, 'pass');
const ranged = barChartHtml([{ label: 'a', value: 1.0 }], { min: 0.9, max: 1.1 });
assert.ok(ranged.includes('width:50.00%'), 'min offsets the bar scale');
console.log('loadFlow viz tests passed');

import { cablesForRaceway, highlightQuery, parseHighlightParam, racewaysForCable } from '../src/components/crossHighlight.mjs';
const routes = [
  { cable: 'C-1', status: 'Routed', breakdown: [{ tray_id: 'T-1', type: 'tray', length: 10 }, { tray_id: 'Field Route', type: 'field', length: 5 }, { tray_id: 'T-2', type: 'tray', length: 4 }] },
  { cable: 'C-2', status: 'Routed', breakdown: [{ tray_id: 'T-2', type: 'tray', length: 8 }] },
  { cable: 'C-3', status: 'Failed', breakdown: [] },
];
assert.deepStrictEqual(racewaysForCable(routes, 'c-1'), ['T-1', 'T-2']);
assert.deepStrictEqual(cablesForRaceway(routes, 't-2'), ['C-1', 'C-2']);
assert.deepStrictEqual(cablesForRaceway(routes, 'T-9'), []);
assert.deepStrictEqual(racewaysForCable(routes, 'C-3'), []);
assert.deepStrictEqual(racewaysForCable(null, 'C-1'), []);
assert.deepStrictEqual(parseHighlightParam(`?${highlightQuery(['T-1', 'T-2'], 'C-1')}`), ['T-1', 'T-2']);
console.log('crossHighlight tests passed');
