import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDesignSynthesisOneLine } from '../analysis/designSynthesisOneLine.mjs';
import { evaluateDesignSynthesisMotorStarting } from '../analysis/designSynthesisMotorStarting.mjs';

const criteria = { motorStarting: { minimumVoltagePu: 0.8 } };
function input() {
  const source = { id: 'S', type: 'source', voltage: 480, phases: 3, capacityKva: 1000, availableFaultCurrentKA: 20,
    motorStartingImpedance: { rOhm: 0.03, xOhm: 0.06, reference: 'Synthetic positive-sequence source phase ohms.' } };
  const motor = { ratedVoltageV: 460, fullLoadCurrentA: 14, fullLoadCurrentBasis: { reference: 'Synthetic motor basis.' },
    nameplateCurrentA: 12.8, lockedRotorCurrentA: 90, lockedRotorPowerFactor: 0.3, starterType: 'dol' };
  const load = { id: 'M', type: 'load', kw: 8, voltage: 480, phases: 3, powerFactor: 0.86, motor };
  const cable = { id: 'C', from: 'S', to: 'M', impedance: { r: 0.02, x: 0.04 }, phases: 3 };
  const proposal = { equipment: [source, load], loads: [load], cables: [cable], inputs: { supply: source } };
  proposal.oneLine = buildDesignSynthesisOneLine({ supply: source, loads: [load], cables: [cable] });
  return proposal;
}

test('rejects single-phase canonical and one-line source/load records', () => {
  const proposal = input();
  proposal.equipment[0].phases = 1;
  proposal.loads[0].phases = 1;
  proposal.oneLine.sheets[0].components.find(row => row.id === 'S').phases = 1;
  proposal.oneLine.sheets[0].components.find(row => row.id === 'M').phases = 1;
  const result = evaluateDesignSynthesisMotorStarting(proposal, criteria);
  assert.equal(result.status, 'blocked');
  assert.ok(result.issues.some(item => item.code === 'UNSUPPORTED_MOTOR_START_PHASES'));
});

test('rejects omitted canonical P/Q for a generic running load', () => {
  const proposal = input();
  const generic = { id: 'FAN', type: 'load', voltage: 480, phases: 3 };
  const cable = { id: 'C-FAN', from: 'S', to: 'FAN', impedance: { r: 0.03, x: 0.05 }, phases: 3 };
  proposal.equipment.push(generic);
  proposal.loads.push(generic);
  proposal.cables.push(cable);
  proposal.oneLine = buildDesignSynthesisOneLine({ supply: proposal.equipment[0], loads: proposal.loads, cables: proposal.cables });
  const result = evaluateDesignSynthesisMotorStarting(proposal, criteria);
  assert.equal(result.status, 'blocked');
  assert.ok(result.issues.some(item => item.code === 'MISSING_CANONICAL_RUNNING_LOAD'));
});

test('rejects a missing canonical cable even when the modeled network remains connected', () => {
  const proposal = input();
  proposal.cables = [];
  const result = evaluateDesignSynthesisMotorStarting(proposal, criteria);
  assert.equal(result.status, 'blocked');
  assert.ok(result.issues.some(item => item.code === 'MOTOR_START_CIRCUIT_COVERAGE'));
});

test('rejects duplicate canonical motor ids', () => {
  const proposal = input();
  proposal.loads.push(structuredClone(proposal.loads[0]));
  const result = evaluateDesignSynthesisMotorStarting(proposal, criteria);
  assert.equal(result.status, 'blocked');
  assert.ok(result.issues.some(item => item.code === 'DUPLICATE_CANONICAL_ID'));
});

test('chooses unused synthetic source ids when a canonical circuit uses the default prefix', () => {
  const proposal = input();
  proposal.cables[0].id = '__motor_start_source__S';
  proposal.oneLine = buildDesignSynthesisOneLine({ supply: proposal.equipment[0], loads: proposal.loads, cables: proposal.cables });
  const result = evaluateDesignSynthesisMotorStarting(proposal, criteria);
  assert.equal(result.status, 'pass', JSON.stringify(result));
  assert.ok(result.cases[0].circuits.some(circuit => circuit.id === '__motor_start_source__S'));
});

test('one iteration cannot turn a nonconverged result into a passing case', () => {
  const result = evaluateDesignSynthesisMotorStarting(input(), { ...criteria, loadFlow: { maxIterations: 1 } });
  assert.equal(result.status, 'blocked');
  assert.equal(result.cases[0].converged, false);
  assert.equal(result.cases[0].status, 'blocked');
});
