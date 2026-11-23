import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import snapshot from '../data/designSynthesisDevices.json' with { type: 'json' };
import research from '../data/designSynthesisEatonCurveResearch.json' with { type: 'json' };
import { evaluateEatonConstantCurrentPlot, getEatonCurveResearchFingerprint } from '../analysis/designSynthesisEatonCurveResearch.mjs';
import { selectProtectiveDevice } from '../analysis/designSynthesisProtection.mjs';

const device = id => snapshot.records.find(row => row.id === id);
const fd = device('eaton_series_c_fd3020');
const selected = selectProtectiveDevice({ cable: { currentA: 10, ampacityA: 30 },
  supply: { voltage: 480, phases: 3, frequencyHz: 60, availableFaultCurrentKA: 10 }, devices: [fd] }).selected;

test('Eaton chart reading stays source-bound and matches a visible 20 A figure within graphical reading range', () => {
  const result = evaluateEatonConstantCurrentPlot({ device: selected, voltageVac: 480, currentA: 100 });
  assert.equal(result.status, 'evaluated-graphical-conservative-envelope');
  // Figure 29 shows the upper boundary near 10 seconds at 100 A; this deliberately broad
  // hand-read range catches axis direction, decades, and a minimum/maximum mix-up.
  assert.ok(result.plotUpperTimeSeconds > 8 && result.plotUpperTimeSeconds < 12);
  assert.equal(result.source.pageOneBased, 32);
  assert.equal(result.source.figure, 29);
  assert.equal(result.source.curveId, 'TC012037EN');
  assert.equal(result.source.sha256, 'b7e6ccdb7229f5f2c30573c1dbc64b42fbd22b8e640ecd7ceb82b943cc8d22ff');
  assert.match(result.currentAssumption, /not a current history/);
  assert.match(result.intendedUse, /not actual clearing/);
  assert.equal(getEatonCurveResearchFingerprint(), 'fnv1a-ed512259');
  assert.ok(Object.isFrozen(research.records[0].curves[0].runs[0]));
});

test('unsupported ratings, altered exact records, voltages and chart gaps never produce a time', () => {
  const checks = [
    evaluateEatonConstantCurrentPlot({ device: selected, voltageVac: 208, currentA: 100 }),
    evaluateEatonConstantCurrentPlot({ device: { ...selected, tripUnitModel: 'changed' }, voltageVac: 480, currentA: 100 }),
    evaluateEatonConstantCurrentPlot({ device: device('eaton_series_c_fd3125'), voltageVac: 480, currentA: 1000 }),
    evaluateEatonConstantCurrentPlot({ device: device('eaton_series_c_kdb3400'), voltageVac: 480, currentA: 1000 }),
    evaluateEatonConstantCurrentPlot({ device: device('eaton_series_c_hfd3150'), voltageVac: 480, currentA: 1500.0894829262122 }),
    evaluateEatonConstantCurrentPlot({ device: selected, voltageVac: 480, currentA: 10000 }),
    evaluateEatonConstantCurrentPlot({ device: selected, voltageVac: 480, currentA: -1 }),
  ];
  assert.deepEqual(checks.map(row => row.status), ['unsupported-voltage', 'unsupported-or-changed-device', 'unsupported-or-changed-device', 'unsupported-or-changed-device', 'outside-or-gap', 'outside-or-gap', 'invalid-current']);
  assert.ok(checks.every(row => row.plotUpperTimeSeconds === null));
});

test('a modified source dataset is rejected before any research value can be reported', () => {
  const program = `
    import data from './data/designSynthesisEatonCurveResearch.json' with { type: 'json' };
    import devices from './data/designSynthesisDevices.json' with { type: 'json' };
    data.records[0].part = 'changed';
    const evaluator = await import('./analysis/designSynthesisEatonCurveResearch.mjs');
    const result = evaluator.evaluateEatonConstantCurrentPlot({ device: devices.records[0], voltageVac: 480, currentA: 100 });
    console.log(JSON.stringify({ status: result.status, value: result.plotUpperTimeSeconds, fingerprint: evaluator.getEatonCurveResearchFingerprint() }));
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', program], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), { status: 'source-data-changed', value: null, fingerprint: null });
});
