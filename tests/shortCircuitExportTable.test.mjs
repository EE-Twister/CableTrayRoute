import assert from 'node:assert/strict';
import { buildShortCircuitExportTable } from '../studies/shortCircuitExportTable.mjs';

const lifecycle = {
  resultValidity: 'unevaluated',
  freshness: 'current',
  resultEligibility: 'withheld',
  calculationVersion: 'calculation-v1',
  calculatedAt: '2026-11-23T00:00:00.000Z',
  warnings: ['Study-level warning'],
};
const table = buildShortCircuitExportTable([
  ['bus-swbd', { equipmentTag: 'SWBD-1', threePhaseKA: 25.26, lineToGroundKA: 18.4, lineToLineKA: 21.9, doubleLineGroundKA: 20.1, validity: 'evaluated', calculationStatus: 'evaluated', warnings: [], requiredInputs: [] }],
  ['bus-mcc', { equipmentTag: 'MCC-2', threePhaseKA: null, lineToGroundKA: null, lineToLineKA: null, doubleLineGroundKA: null, validity: 'unevaluated', calculationStatus: 'incomplete', warnings: ['Not evaluated — inputs are incomplete.'], requiredInputs: ['Source impedance'] }],
], lifecycle);

const swbd = table.rows.find(row => row.bus === 'SWBD-1');
const mcc = table.rows.find(row => row.bus === 'MCC-2');
assert.equal(table.title, 'Short Circuit Report');
assert.equal(swbd.validity, 'evaluated', 'an evaluated bus keeps its own validity');
assert.equal(swbd.studyValidity, 'unevaluated', 'study-level validity is a separate column');
assert.equal(mcc.warnings, 'Not evaluated — inputs are incomplete.', 'per-bus warnings are not overwritten');
assert.equal(mcc.requiredInputs, 'Source impedance');
assert.equal(mcc.threePhaseKA, 'Unevaluated', 'a missing current prints as on screen, not blank');
assert.equal(swbd.studyWarnings, 'Study-level warning');
assert.ok(table.headers.includes('requiredInputs') && table.headers.includes('calculationStatus'));

const iec = buildShortCircuitExportTable([['b1', { method: 'IEC', threePhaseKA: 10, ip: 25, prefaultKV: 11 }]], lifecycle);
assert.equal(iec.title, 'IEC 60909 Short-Circuit Report');
assert.ok(iec.headers.includes('ip'));

console.log('short-circuit export table tests passed');
