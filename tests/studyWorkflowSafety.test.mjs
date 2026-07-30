import assert from 'assert';
import { renderLoadFlowResultsHtml } from '../analysis/loadFlowResultsRenderer.js';
import { calculateMotorStartCase, validateMotorStartInput } from '../analysis/motorStartCalc.mjs';

const storage = {};
global.localStorage = {
  getItem: key => storage[key] ?? null,
  setItem: (key, value) => { storage[key] = value; },
  removeItem: key => { delete storage[key]; }
};

const { isUsableLoadFlowResult, validateLoadFlowModel } = await import('../studies/loadFlow.js');

const incompleteModel = {
  buses: [{ id: 'B1', type: 'PQ', baseKV: 0 }],
  branches: []
};
const readiness = validateLoadFlowModel(incompleteModel);
assert.strictEqual(readiness.ready, false);
assert.ok(readiness.errors.some(error => error.includes('slack')));
assert.ok(readiness.errors.some(error => error.includes('branch')));

assert.strictEqual(isUsableLoadFlowResult({
  converged: false,
  buses: [{ Vm: -250 }]
}), false);
assert.strictEqual(isUsableLoadFlowResult({
  converged: true,
  buses: [{ Vm: 1 }, { Vm: 0.98 }]
}), true);

const failedHtml = renderLoadFlowResultsHtml({
  converged: false,
  maxMismatch: 12,
  maxMismatchKW: 1200,
  buses: [{ id: 'B1', Vm: -250, Va: 0 }]
});
assert.ok(failedHtml.includes('No valid load flow result'));
assert.ok(failedHtml.includes('No result was saved or exported'));
assert.ok(!failedHtml.includes('Bus Voltages'));

const missingMotor = {
  id: 'M1',
  label: 'Motor 1',
  hp: 100,
  volts: 480,
  powerFactor: 0.9,
  efficiency: 0.9,
  inrushMultiple: 6,
  theveninR: 0,
  theveninX: 0,
  inertia: 0,
  type: 'dol'
};
assert.strictEqual(validateMotorStartInput(missingMotor).ready, false);

const motorResult = calculateMotorStartCase({
  ...missingMotor,
  theveninR: 0.01,
  theveninX: 0.02,
  inertia: 2,
  speedRpm: 1800
}, { maxVoltageSagPct: 15, maxAccelerationTimeSec: 10 });
assert.strictEqual(motorResult.ready, true);
assert.strictEqual(motorResult.status, 'pass');
assert.strictEqual(motorResult.inrushKA, 0.665);
assert.strictEqual(motorResult.voltageSagPct, 3.1);

console.log('study workflow safety tests passed');
