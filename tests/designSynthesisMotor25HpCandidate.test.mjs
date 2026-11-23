import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateMotorBranchBreakerCandidate } from '../analysis/designSynthesisMotorBranchBreakers.mjs';
import { evaluateMotor25HpCandidate } from '../analysis/designSynthesisMotor25HpCandidate.mjs';
import { validateDesignSynthesisMotorInputs } from '../analysis/designSynthesisMotors.mjs';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';

const makeLoad = () => ({ id: 'M25', voltage: 480, phases: 3, frequencyHz: 60, kw: Math.sqrt(3) * 480 * 29.5 * 0.85 / 1000, powerFactor: 0.85, duty: 'continuous', ratingsBasis: 'electrical-input-kW', motor: { ratedVoltageV: 460, fullLoadCurrentA: 34, fullLoadCurrentBasis: { reference: 'Synthetic design-current case' }, nameplateCurrentA: 29.5, nameplateHorsepower: 25, nameplateFrequencyHz: 60, lockedRotorCurrentA: 183, lockedRotorPowerFactor: 0.3, starterType: 'dol', rotorType: 'squirrel-cage' } });
const supply = { voltage: 480, phases: 3, frequencyHz: 60, availableFaultCurrentKA: 20 };
const criteria = { code: 'NEC', motorStarter: { branchProtectionMethod: 'inverse-time-breaker', controlVoltageV: 24, controlCurrentType: 'DC' } };

test('25 hp selection uses exact 50 A, 22–32 A relay and conditional combination without claiming protection', () => {
  const result = evaluateMotorBranchBreakerCandidate({ load: makeLoad(), supply, criteria });
  assert.equal(result.status, 'blocked');
  assert.equal(result.candidate.contactor.catalogNumber, '3RT2036-1NB30');
  assert.equal(result.candidate.overloadRelay.catalogNumber, '3RU2136-4EB0');
  assert.equal(result.candidate.overloadRelay.candidateDialSettingA, 29.5);
  assert.equal(result.candidate.overloadRelay.publishedNominalTripCurrentA, 36.875);
  assert.equal(result.candidate.branchCircuitBreaker.catalogNumber, '3VA5150-6EC31-0AA0');
  assert.deepEqual(result.candidate.branchCircuitBreaker.allowedInstantaneousPickupA, [250, 300, 350, 400, 450, 500]);
  assert.equal(result.candidate.sizing.minimumBreakerPickupA, 42.5);
  assert.equal(result.candidate.sizing.conservativeMaximumBreakerPickupA, 85);
  assert.equal(result.candidate.conditionalCombination.shortCircuitCurrentKA, 25);
  assert.equal(result.candidate.conditionalCombination.maximumBreakerCurrentA, 50);
  assert.equal(result.candidate.selectedForApply, false);
  assert.equal(result.candidate.curveResearch.matchingManufacturerGraphicAvailable, null);
  assert.equal(result.candidate.checks.find(check => check.id === 'tccStartingAndCoordination').status, 'unevaluated');
  assert.ok(result.candidate.fieldSources.some(item => item.sourceId === 'siemens-ul-3ru2136-2023' && item.pointer === '/candidate/conditionalCombination'));
});

test('50 A settings, design floors and exact source limits reject incompatible inputs', () => {
  for (const pickup of [250, 300, 350, 400, 450, 500]) {
    const load = makeLoad(); load.motor.instantaneousPickupA = pickup;
    assert.equal(evaluateMotor25HpCandidate({ load, supply, criteria }).candidate.branchCircuitBreaker.instantaneousPickupA, pickup);
    assert.equal(validateDesignSynthesisMotorInputs({ equipment: [load], criteria }).inputIssues.some(issue => issue.code === 'INVALID_MOTOR_INSTANTANEOUS_PICKUP'), false);
  }
  const changes = [
    ({ load }) => { load.motor.nameplateCurrentA = 21.99; },
    ({ load }) => { load.motor.nameplateCurrentA = 32.01; },
    ({ load }) => { load.motor.fullLoadCurrentA = 40.01; },
    ({ load }) => { load.motor.fullLoadCurrentA = 19.99; },
    ({ load }) => { load.motor.fullLoadCurrentBasis.reference = ''; },
    ({ load }) => { load.motor.rotorType = 'wound-rotor'; },
    ({ load }) => { load.type = 'vfd'; },
    ({ load }) => { load.motor.instantaneousPickupA = 420; },
    ({ load }) => { load.motor.breakerAmbientTemperatureC = 50; },
    ({ supply: source }) => { source.availableFaultCurrentKA = 25.01; },
    ({ supply: source }) => { source.voltage = 600; },
    ({ criteria: basis }) => { basis.motorStarter.controlCurrentType = 'AC'; },
    input => { input.operatingCurrentA = 41; input.operatingCurrentReference = 'Synthetic study'; },
    input => { input.operatingCurrentA = 30; },
  ];
  for (const change of changes) {
    const input = { load: makeLoad(), supply: structuredClone(supply), criteria: structuredClone(criteria) };
    change(input);
    const result = evaluateMotor25HpCandidate(input);
    assert.equal(result.candidate, null, String(change));
    assert.ok(result.candidates[0].checks.some(check => check.status === 'fail'));
  }
  for (const current of [22, 32]) { const load = makeLoad(); load.motor.nameplateCurrentA = current; assert.ok(evaluateMotor25HpCandidate({ load, supply, criteria }).candidate); }
  const malformed = makeLoad(); malformed.motor.nameplateCurrentA = '29.5';
  assert.equal(evaluateMotor25HpCandidate({ load: malformed, supply, criteria }).candidates[0].overloadRelay.publishedNominalTripCurrentA, null);
  const huge = makeLoad(); huge.motor.fullLoadCurrentA = Number.MAX_VALUE; huge.kw = Number.MAX_VALUE;
  const extreme = evaluateMotor25HpCandidate({ load: huge, supply, criteria });
  assert.equal(extreme.candidate, null);
  assert.doesNotMatch(JSON.stringify(extreme), /Infinity|NaN/);
});

for (const count of [25, 50]) test(`${count} loads retain the 25 hp exact research assembly, conductor floor and protection blocker`, () => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const original = input.equipment;
  input.equipment = Array.from({ length: count }, (_, i) => ({ ...original[i % original.length], id: `L-${i}`, tag: `L-${i}`, kw: 2, powerFactor: 0.9, duty: 'continuous' }));
  Object.assign(input.equipment[0], makeLoad(), { id: 'L-0', tag: 'L-0', x: input.equipment[0].x, y: input.equipment[0].y, z: input.equipment[0].z });
  input.equipment[0].motor.instantaneousPickupA = 350;
  input.supply.availableFaultCurrentKA = 20;
  input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic source study' };
  input.criteria.motorStarting = { minimumVoltagePu: 0.7 };
  input.criteria.motorStarter = structuredClone(criteria.motorStarter);
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.loads.length, count);
  const result = proposal.motorStarterCandidates.cases.find(item => item.motorId === 'L-0');
  assert.equal(result.candidate.branchCircuitBreaker.catalogNumber, '3VA5150-6EC31-0AA0');
  assert.equal(result.candidate.branchCircuitBreaker.instantaneousPickupA, 350);
  const cable = proposal.cables.find(row => row.loadId === 'L-0');
  assert.equal(cable.motor.branchBreakerAmpacityFloorA, 50);
  assert.ok(cable.routeThermalAmpacity >= 50);
  assert.equal(cable.protectiveDevice.catalogNumber, '3VA5150-6EC31-0AA0');
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(issue => issue.code === 'MOTOR_PROTECTION_UNRESOLVED'));
  assert.equal(result.candidate.selectedForApply, false);
  const mixed = structuredClone(input);
  Object.assign(mixed.equipment[1], { kw: Math.sqrt(3) * 480 * 48 * 0.86 / 1000, powerFactor: 0.86, ratingsBasis: 'electrical-input-kW', motor: { ratedVoltageV: 460, fullLoadCurrentA: 52, fullLoadCurrentBasis: { reference: 'Synthetic 40 hp design current' }, nameplateCurrentA: 48, nameplateHorsepower: 40, nameplateFrequencyHz: 60, lockedRotorCurrentA: 338, lockedRotorPowerFactor: 0.27, starterType: 'dol', rotorType: 'squirrel-cage', instantaneousPickupA: 490 } });
  const mixedProposal = generateDesignProposal(mixed);
  const small = mixedProposal.motorStarterCandidates.cases.find(item => item.motorId === 'L-0').candidate;
  const large = mixedProposal.motorStarterCandidates.cases.find(item => item.motorId === 'L-1').candidate;
  assert.equal(small.branchCircuitBreaker.instantaneousPickupA, 350);
  assert.equal(large.branchCircuitBreaker.instantaneousPickupA, 490);
  assert.equal(small.branchCircuitBreaker.catalogNumber, '3VA5150-6EC31-0AA0');
  assert.equal(large.branchCircuitBreaker.catalogNumber, '3VA5170-6EC31-0AA0');
  assert.equal(mixedProposal.cables.find(row => row.loadId === 'L-1').motor.branchBreakerAmpacityFloorA, 70);
  assert.equal(mixedProposal.status, 'blocked');
});
