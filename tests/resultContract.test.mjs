import assert from 'node:assert/strict';
import test from 'node:test';
import { createCalculationResult } from '../analysis/resultContract.mjs';
import { calculateVoltageDropResult } from '../src/voltageDrop.js';
import { evaluateCable, runVoltageDropStudy } from '../analysis/voltageDropStudy.mjs';
import { sizeConductor, summarizeCable } from '../sizing.js';

test('structured contract never turns missing numeric values into zero', () => {
  const result = createCalculationResult({ value: null, validity: 'evaluated', units: 'A' });
  assert.equal(result.value, null);
  assert.equal(result.validity, 'unevaluated');
});

test('voltage-drop result rejects missing and negative lengths', () => {
  for (const length of [0, -1, '']) {
    const result = calculateVoltageDropResult({ est_load: 20, operating_voltage: 120, conductor_size: '12' }, length, 1);
    assert.equal(result.value, null);
    assert.equal(result.resultContract.validity, 'unevaluated');
  }
});

test('invalid phases remain unevaluated with a diagnostic', () => {
  const result = evaluateCable({ cable_tag: 'BAD-PHASE', est_load: 20, operating_voltage: 120, length: 100, conductor_size: '12', phases: 4 });
  assert.equal(result.evaluated, false);
  assert.match(result.resultContract.warnings.join(' '), /Phase count/);
});

test('ambiguous ancestor suppresses downstream recommendation', () => {
  const feeder = (tag, from) => ({ cable_tag: tag, from_tag: from, to_tag: 'BUS', est_load: 20, operating_voltage: 120, length: 100, conductor_size: '14', phases: 1 });
  const study = runVoltageDropStudy([
    feeder('F1', 'A'), feeder('F2', 'B'),
    { cable_tag: 'BR', from_tag: 'BUS', to_tag: 'LOAD', est_load: 50, operating_voltage: 120, length: 1000, conductor_size: '14', phases: 1 },
  ]);
  const branch = study.results.find(result => result.tag === 'BR');
  assert.equal(branch.topologyStatus, 'ambiguous-parent');
  assert.equal(branch.pathEvaluated, false);
  assert.equal(branch.recommendation, null);
});

test('voltage-drop core rejects malformed numeric strings', () => {
  for (const cable of [
    { est_load: '120junk', operating_voltage: 480 },
    { est_load: 120, operating_voltage: '480junk' },
  ]) {
    const result = calculateVoltageDropResult({ ...cable, conductor_size: '12' }, 100, 3);
    assert.equal(result.value, null);
    assert.equal(result.resultContract.validity, 'unevaluated');
  }
});

test('voltage-drop result rejects non-finite current and voltage inputs', () => {
  const base = { conductor_size: '#10 AWG', conductor_material: 'CU', length: 25, phases: 1, power_factor: 1 };
  for (const cable of [
    { ...base, est_load: Infinity, operating_voltage: 120 },
    { ...base, est_load: 'Infinity', operating_voltage: 120 },
    { ...base, est_load: NaN, operating_voltage: 120 },
    { ...base, est_load: 20, operating_voltage: Infinity },
    { ...base, est_load: 20, operating_voltage: 'Infinity' },
    { ...base, est_load: 20, operating_voltage: NaN },
  ]) {
    const result = calculateVoltageDropResult(cable, cable.length, cable.phases);
    assert.equal(result.value, null);
    assert.equal(result.resultContract.validity, 'unevaluated');
    assert.match(result.resultContract.warnings.join(' '), /required|not evaluated/i);
  }
});

test('voltage-drop result evaluates nominal finite inputs', () => {
  const result = calculateVoltageDropResult({
    est_load: 20,
    operating_voltage: 120,
    conductor_size: '#10 AWG',
    conductor_material: 'CU',
    power_factor: 1,
  }, 25, 1);
  assert.equal(result.resultContract.validity, 'evaluated');
  assert.ok(Number.isFinite(result.value) && result.value > 0);
  assert.equal(result.resultContract.warnings.length, 0);
});

test('sizing rejects invalid phases and negative voltage-drop constraints', () => {
  assert.equal(sizeConductor({ current: 20, voltage: 120, phases: '2.5' }).size, null);
  assert.match(sizeConductor({ current: 20, voltage: 120, phases: 1 }, { maxVoltageDrop: -1 }).violation, /cannot be negative/);
});

test('sizing fingerprints include voltage-drop model inputs and separate selected ampacity', () => {
  const first = summarizeCable({ tag: 'FP', conductor_size: '12', conductor_material: 'CU', insulation_rating: 75, est_load: 20, operating_voltage: 120, length: 100, phases: 1, power_factor: 1, conduit_material: 'PVC', parallel_count: 1 });
  const second = summarizeCable({ tag: 'FP', conductor_size: '12', conductor_material: 'CU', insulation_rating: 75, est_load: 20, operating_voltage: 120, length: 100, phases: 1, power_factor: 0.8, conduit_material: 'steel', parallel_count: 2 });
  assert.notEqual(first.resultContract.inputFingerprint, second.resultContract.inputFingerprint);
  assert.equal(first.resultContract.units, '%');
  assert.equal(first.selectedAmpacityResultContract.units, 'A');
});
