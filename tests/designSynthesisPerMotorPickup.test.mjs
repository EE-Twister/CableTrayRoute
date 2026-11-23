import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveMotorStarterPickup } from '../analysis/motorStarterPickup.mjs';
import { evaluateMotorBranchBreakerCandidate } from '../analysis/designSynthesisMotorBranchBreakers.mjs';
import { validateDesignSynthesisMotorInputs } from '../analysis/designSynthesisMotors.mjs';
import { buildDesignSynthesisProjectEquipmentAdoption } from '../analysis/designSynthesisProjectEquipment.mjs';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';

const motor = (hp, pickup) => ({ ratedVoltageV: 460, fullLoadCurrentA: hp === 40 ? 52 : 16.8, fullLoadCurrentBasis: { reference: 'Synthetic referenced current' }, nameplateCurrentA: hp === 40 ? 48 : 16.8, nameplateHorsepower: hp, nameplateFrequencyHz: 60, lockedRotorCurrentA: hp === 40 ? 338 : 121, lockedRotorPowerFactor: 0.27, starterType: 'dol', rotorType: 'squirrel-cage', ...(pickup !== undefined ? { instantaneousPickupA: pickup } : {}) });
const load = (hp, pickup) => ({ id: `M-${hp}`, voltage: 480, phases: 3, frequencyHz: 60, kw: 8, powerFactor: 0.8, duty: 'continuous', ratingsBasis: 'electrical-input-kW', motor: motor(hp, pickup) });
const supply = { voltage: 480, phases: 3, frequencyHz: 60, availableFaultCurrentKA: 20 };
const criteria = { code: 'NEC', motorStarter: { branchProtectionMethod: 'inverse-time-breaker', controlVoltageV: 24, controlCurrentType: 'DC', instantaneousPickupA: 150 } };

test('motor override, explicit unset and legacy project inheritance are distinct', () => {
  assert.deepEqual(resolveMotorStarterPickup({}, criteria), { value: 150, basis: 'project' });
  assert.deepEqual(resolveMotorStarterPickup({ instantaneousPickupA: null }, criteria), { value: undefined, basis: 'motor-unset' });
  assert.deepEqual(resolveMotorStarterPickup({ instantaneousPickupA: 180 }, criteria), { value: 180, basis: 'motor' });
  const suppressed = evaluateMotorBranchBreakerCandidate({ load: load(40, null), supply, criteria });
  assert.equal(suppressed.candidate.branchCircuitBreaker.instantaneousPickupA, null);
  assert.equal(suppressed.candidate.branchCircuitBreaker.instantaneousPickupBasis, 'motor-unset');
  assert.equal(suppressed.candidate.checks.find(item => item.id === 'instantaneousPickup').status, 'unevaluated');
  assert.equal(evaluateMotorBranchBreakerCandidate({ load: load(40), supply, criteria }).candidate, null);
  assert.equal(evaluateMotorBranchBreakerCandidate({ load: load(10, 180), supply, criteria }).candidate.branchCircuitBreaker.instantaneousPickupA, 180);
});

test('each exact breaker enforces its own manufacturer-listed settings', () => {
  for (const value of [350, 420, 490, 560, 630, 700]) {
    const result = evaluateMotorBranchBreakerCandidate({ load: load(40, value), supply, criteria });
    assert.equal(result.candidate.branchCircuitBreaker.instantaneousPickupA, value);
    assert.equal(result.candidate.branchCircuitBreaker.instantaneousPickupBasis, 'motor');
    assert.equal(result.candidate.selectedForApply, false);
  }
  assert.equal(evaluateMotorBranchBreakerCandidate({ load: load(40, 180), supply, criteria }).candidate, null);
  assert.equal(evaluateMotorBranchBreakerCandidate({ load: load(10, 490), supply, criteria }).candidate, null);
  for (const value of [151, '180', Infinity]) {
    const result = validateDesignSynthesisMotorInputs({ equipment: [load(10, value)] });
    assert.ok(result.inputIssues.some(item => item.code === 'INVALID_MOTOR_INSTANTANEOUS_PICKUP'));
  }
  const wrongMethod = validateDesignSynthesisMotorInputs({ equipment: [load(10, 180)], criteria: { motorStarter: { branchProtectionMethod: 'manual-controller' } } });
  assert.ok(wrongMethod.inputIssues.some(item => item.code === 'MISMATCHED_MOTOR_BRANCH_PICKUP_METHOD'));
});

test('project equipment handoff retains numeric and explicit unset overrides', () => {
  const equipment = [
    { id: 'M10', tag: 'M10', category: 'Motor', kw: 8, voltage: 480, phases: 3, powerFactor: 0.8, duty: 'continuous', x: 0, y: 0, z: 0, motorRatedVoltageV: 460, motorFullLoadCurrentA: 16.8, motorFullLoadCurrentReference: 'Synthetic basis', motorNameplateCurrentA: 16.8, motorNameplateHorsepower: 10, motorNameplateFrequencyHz: 60, motorLockedRotorCurrentA: 121, motorLockedRotorPowerFactor: 0.27, motorStarterType: 'dol', motorRotorType: 'squirrel-cage', motorInstantaneousPickupA: '180' },
    { id: 'M40', tag: 'M40', category: 'Motor', kw: 33, voltage: 480, phases: 3, powerFactor: 0.86, duty: 'continuous', x: 1, y: 0, z: 0, motorRatedVoltageV: 460, motorFullLoadCurrentA: 52, motorFullLoadCurrentReference: 'Synthetic basis', motorNameplateCurrentA: 48, motorNameplateHorsepower: 40, motorNameplateFrequencyHz: 60, motorLockedRotorCurrentA: 338, motorLockedRotorPowerFactor: 0.27, motorStarterType: 'dol', motorRotorType: 'squirrel-cage', motorInstantaneousPickupA: 'none' }
  ];
  const context = { equipment, loads: [], selectedEquipmentIds: equipment.map(item => item.id), projectId: 'Project', scenario: 'base', projectFingerprint: 'fixture', acknowledgements: { electricalInputKW: true, voltageLineToLine: true, coordinatesFeet: true } };
  const adoption = buildDesignSynthesisProjectEquipmentAdoption(context);
  assert.equal(adoption.ok, true, JSON.stringify(adoption.issues));
  assert.equal(adoption.selectedRows[0].motor.instantaneousPickupA, 180);
  assert.equal(adoption.selectedRows[1].motor.instantaneousPickupA, null);
  const conflict = structuredClone(context);
  conflict.equipment[1].motor = { instantaneousPickupA: 490 };
  assert.equal(buildDesignSynthesisProjectEquipmentAdoption(conflict).ok, false);
});

for (const count of [25, 50]) test(`${count} mixed loads preserve separate proposed pickups in candidate and one-line evidence`, () => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const templates = input.equipment;
  input.equipment = Array.from({ length: count }, (_, i) => ({ ...templates[i % templates.length], id: `L-${i}`, tag: `L-${i}`, kw: 2, powerFactor: 0.9, duty: 'continuous' }));
  Object.assign(input.equipment[0], { ...load(40, 490), id: 'L-0', kw: Math.sqrt(3) * 480 * 48 * 0.86 / 1000, powerFactor: 0.86 });
  Object.assign(input.equipment[1], { ...load(10, 180), id: 'L-1', kw: Math.sqrt(3) * 480 * 16.8 * 0.8 / 1000 });
  input.supply.availableFaultCurrentKA = 20;
  input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic source study' };
  input.criteria.motorStarting = { minimumVoltagePu: 0.7 };
  input.criteria.motorStarter = structuredClone(criteria.motorStarter);
  const proposal = generateDesignProposal(input);
  for (const [id, value, catalog] of [['L-0', 490, '3VA5170-6EC31-0AA0'], ['L-1', 180, '3VA5125-6EC31-0AA0']]) {
    const candidate = proposal.motorStarterCandidates.cases.find(item => item.motorId === id).candidate;
    assert.equal(candidate.branchCircuitBreaker.catalogNumber, catalog);
    assert.equal(candidate.branchCircuitBreaker.instantaneousPickupA, value);
    assert.equal(candidate.branchCircuitBreaker.instantaneousPickupBasis, 'motor');
    const cable = proposal.cables.find(item => item.loadId === id);
    assert.equal(cable.protectiveDevice.proposedInstantaneousPickupA, value);
    assert.equal(cable.protectiveDevice.proposedInstantaneousPickupBasis, 'motor');
    const connection = proposal.oneLine.sheets[0].connections.find(row => row.cableRef === cable.id);
    assert.equal(connection.cable.protectiveDevice.proposedInstantaneousPickupA, value);
  }
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(item => item.code === 'MOTOR_PROTECTION_UNRESOLVED'));
  const changed = structuredClone(input); changed.equipment[0].motor.instantaneousPickupA = 560;
  assert.notEqual(generateDesignProposal(changed).inputSignature, proposal.inputSignature);
});
