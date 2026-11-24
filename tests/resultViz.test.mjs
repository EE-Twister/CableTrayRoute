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
// A stale or input-incomplete location never shows a pass/review/fail verdict.
const notReady = arcFlashBarRows(
  [['x', { incidentEnergy: 3.8, boundary: 1067 }], ['y', { incidentEnergy: 0.9, boundary: 350 }]],
  { readiness: id => (id === 'x' ? { ready: false, reason: 'Saved result is stale' } : { ready: true }) }
);
assert.strictEqual(notReady[0].status, 'na');
assert.match(notReady[0].note, /stale/);
assert.strictEqual(notReady[1].status, 'pass');

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
import { getCableReadiness, getStepStatus } from '../src/workflowStatus.js';
const sum = summarizeCables([
  { length: '100', operating_voltage: '480' },
  { length: '', operating_voltage: '13800' },
  { length: 50, operating_voltage: null },
]);
assert.strictEqual(sum.count, 3);
assert.strictEqual(sum.totalLength, 150);
assert.strictEqual(sum.missingVoltage, 1);
assert.strictEqual(sum.voltageMix['Medium voltage'], 1);
assert.strictEqual(sum.voltageMix.Unspecified, 1);
assert.strictEqual(cableSummaryHtml([]), '');
assert.ok(cableSummaryHtml([{ length: 1, operating_voltage: 480 }]).includes('viz-kpi'));
assert.strictEqual(racewaySummaryHtml({}), '');

// The strip's schedule-ready count is the workflow step header's count, and
// operating voltage is reported separately rather than as a routing blocker.
const kpiText = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const readyNoVoltage = Array.from({ length: 3 }, (_, i) => ({ tag: `C-${i}`, from: 'MCC-1', to: `M-${i}`, conductor_size: '#10 AWG', length: 100 }));
const mixed = [...readyNoVoltage, { tag: 'C-9', from: 'MCC-1', conductor_size: '#10 AWG', length: 40, operating_voltage: 480 }, {}];
{
  const summary = summarizeCables(mixed);
  const readiness = getCableReadiness(mixed);
  assert.strictEqual(summary.scheduleReady, readiness.scheduleReady);
  assert.strictEqual(summary.scheduleTotal, readiness.total);
  assert.strictEqual(summary.scheduleReady, 3);
  assert.strictEqual(summary.scheduleTotal, 4, 'blank rows are ignored, as in the step header');
  assert.strictEqual(summary.missingVoltage, 4);
  const text = kpiText(cableSummaryHtml(mixed));
  assert.match(text, /3 of 4 Schedule-ready Needs tag, from\/to, conductor size, and length/);
  assert.match(text, /4 Missing operating voltage Needed for sizing and voltage-drop checks/);
  assert.doesNotMatch(text, /before routing|Missing length or voltage/);
}
{
  const text = kpiText(cableSummaryHtml(readyNoVoltage));
  assert.match(getStepStatus('cableSchedule', { cables: readyNoVoltage }).label, /^3 schedule-ready/);
  assert.match(text, /3 of 3 Schedule-ready/);
  assert.match(text, /3 Missing operating voltage/);
  assert.ok(cableSummaryHtml(readyNoVoltage).includes('viz-kpi viz-kpi--pass'), 'complete rows show a pass readiness card');
}
{
  const complete = readyNoVoltage.map(cable => ({ ...cable, operating_voltage: 480 }));
  const html = cableSummaryHtml(complete);
  assert.match(kpiText(html), /3 Cables Low voltage 3 300 ft Total length 3 of 3 Schedule-ready 0 Missing operating voltage$/);
  assert.ok(!html.includes('viz-kpi--warn'));
  assert.strictEqual(summarizeCables([{ operating_voltage: 0 }]).missingVoltage, 1, 'zero is not a usable operating voltage');
}
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

import { trayUtilizationRows } from '../src/components/scheduleSummary.mjs';
const trays = [{ tray_id: 'T-1', inside_width: 12, tray_depth: 4, tray_type: 'ladder' }, { tray_id: 'T-2', inside_width: 12, tray_depth: 4, tray_type: 'ladder' }];
const cabs = Array.from({ length: 3 }, (_, i) => ({ tag: `C${i}`, conductors: 3, conductor_size: '#4/0', diameter: 1.5, route_preference: 'T-1' }));
const util = trayUtilizationRows(trays, cabs, null);
assert.strictEqual(util.unassigned, 1, 'tray without cables is counted, not charted');
assert.strictEqual(util.rows.length, 1);
assert.strictEqual(util.rows[0].label, 'T-1');
console.log('trayUtilization tests passed');

const rated = shortCircuitBarRows([['id1', { equipmentTag: 'SWBD', threePhaseKA: 30 }], ['id2', { equipmentTag: 'PNL', threePhaseKA: 20 }]], { id1: 25, id2: 65 });
assert.strictEqual(rated.find(r => r.label === 'SWBD').status, 'fail');
assert.strictEqual(rated.find(r => r.label === 'PNL').status, 'pass');
assert.strictEqual(rated.find(r => r.label === 'SWBD').limit, 25);
console.log('rated shortCircuit tests passed');

import { stackedBarHtml } from '../src/components/resultViz.mjs';
const stack = stackedBarHtml([{ label: 'Pass', count: 3, status: 'pass' }, { label: 'Fail', count: 1, status: 'fail' }, { label: 'None', count: 0, status: 'warn' }]);
assert.ok(stack.includes('width:75.00%') && stack.includes('width:25.00%'));
assert.ok(!stack.includes('title="None: 0"'), 'zero segments are not drawn');
assert.ok(stack.includes('None 0'), 'zero counts remain in the caption');
assert.strictEqual(stackedBarHtml([{ label: 'x', count: 0 }]), '');
console.log('stackedBar tests passed');

import { classifyStatusText, summarizeStatusColumn } from '../src/components/resultViz.mjs';
assert.strictEqual(classifyStatusText('✓ Pass'), 'pass');
assert.strictEqual(classifyStatusText('FAIL'), 'fail');
assert.strictEqual(classifyStatusText('Warning'), 'warn');
assert.strictEqual(classifyStatusText('MCC-1'), null);
assert.strictEqual(classifyStatusText(''), null);
const grid = [['A', '1.2', 'PASS'], ['B', '3.4', 'FAIL'], ['C', '2.2', 'Warning'], ['D', '0.1', 'PASS']];
const col = summarizeStatusColumn(grid);
assert.strictEqual(col.column, 2);
assert.deepStrictEqual([col.pass, col.warn, col.fail], [2, 1, 1]);
assert.strictEqual(summarizeStatusColumn([['A', '1'], ['B', '2'], ['C', '3']]), null);
assert.strictEqual(summarizeStatusColumn([['A', 'PASS']]), null, 'too few rows');
console.log('autoSummary tests passed');
