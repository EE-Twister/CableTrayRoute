import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateMotorBranchBreakerCandidate } from '../analysis/designSynthesisMotorBranchBreakers.mjs';
import { evaluateMotorS2BreakerAmbient } from '../analysis/motorS2BreakerAmbient.mjs';
import { validateDesignSynthesisMotorInputs } from '../analysis/designSynthesisMotors.mjs';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';

const supply = { voltage: 480, phases: 3, frequencyHz: 60, availableFaultCurrentKA: 20 };
const criteria = () => ({ code: 'NEC', motorStarter: { branchProtectionMethod: 'inverse-time-breaker', controlVoltageV: 24, controlCurrentType: 'DC' } });
const motorLoad = (hp, nameplate, flc) => ({ id: 'M', voltage: 480, phases: 3, frequencyHz: 60, kw: Math.sqrt(3) * 480 * nameplate * 0.85 / 1000, powerFactor: 0.85, duty: 'continuous', ratingsBasis: 'electrical-input-kW', motor: { ratedVoltageV: 460, fullLoadCurrentA: flc, fullLoadCurrentBasis: { reference: 'Synthetic design-current case' }, nameplateCurrentA: nameplate, nameplateHorsepower: hp, nameplateFrequencyHz: 60, lockedRotorCurrentA: 228, lockedRotorPowerFactor: 0.3, starterType: 'dol', rotorType: 'squirrel-cage' } });
const reference = 'Synthetic enclosure-temperature study';

// Independent fixtures transcribed directly from the archived exact-part Siemens PDFs.
for (const [breaker, primary, alternate] of [
  [35, [35, 34, 34, 33, 33, 32, 32], [35, 34.4, 33.9, 33.4, 32.9, 32.4, 31.9]],
  [50, [50, 49.1, 48.3, 47.5, 46.7, 46, 45.2], null],
  [60, [60, 59, 58, 57, 56, 55, 54], null]
]) test(`${breaker} A exact-part temperature points reject only floors above the conservative source comparison`, () => {
  for (const [index, temperature] of [40, 45, 50, 55, 60, 65, 70].entries()) {
    const limit = Math.min(primary[index], alternate?.[index] ?? primary[index]);
    const input = { breakerA: breaker, motor: { breakerAmbientTemperatureC: temperature, breakerAmbientReference: reference }, criteria: criteria() };
    const equal = evaluateMotorS2BreakerAmbient({ ...input, floorA: limit });
    assert.equal(equal.status, 'unevaluated');
    assert.equal(equal.evidence.publishedOperatingCurrentA, primary[index]);
    assert.equal(equal.evidence.alternatePublishedOperatingCurrentA, alternate?.[index] ?? null);
    assert.equal(equal.evidence.conservativeComparisonA, limit);
    assert.equal(equal.evidence.comparison, 'within-screening-value-unqualified');
    assert.equal(equal.evidence.differingDatasheetValuesUnresolved, alternate !== null);
    assert.equal(equal.evidence.valuesDifferAtTemperature, alternate ? primary[index] !== alternate[index] : null);
    assert.equal(evaluateMotorS2BreakerAmbient({ ...input, floorA: limit + 0.001 }).status, 'fail');
    assert.equal(evaluateMotorS2BreakerAmbient({ ...input, floorA: null }).evidence.comparison, 'not-evaluated');
  }
});

test('a documented conflicting 35 A source can reject the smaller candidate and select an exact 50 A alternative', () => {
  const load = motorLoad(20, 24, 27.2); // 125% of 27.2 A = 34 A; the 2020 source says 33.9 A at 50 °C.
  const basis = criteria(); Object.assign(basis.motorStarter, { s2BreakerAmbientTemperatureC: 50, s2BreakerAmbientReference: reference });
  const result = evaluateMotorBranchBreakerCandidate({ load, supply, criteria: basis });
  const smaller = result.candidates.find(item => item.branchCircuitBreaker.continuousCurrentA === 35);
  const check = smaller.checks.find(item => item.id === 'breakerAmbientOperatingCurrent');
  assert.equal(check.status, 'fail');
  assert.equal(check.evidence.screeningFloorA, 34);
  assert.equal(check.evidence.publishedOperatingCurrentA, 34);
  assert.equal(check.evidence.alternatePublishedOperatingCurrentA, 33.9);
  assert.equal(check.evidence.basis, 'project-s2');
  assert.equal(result.candidate.branchCircuitBreaker.continuousCurrentA, 50);
  assert.equal(result.candidate.checks.find(item => item.id === 'breakerAmbientOperatingCurrent').status, 'unevaluated');
  assert.equal(result.candidate.selectedForApply, false);
  assert.ok(smaller.sources.some(source => source.id === 'siemens-3va5135-ambient-2024'));
  assert.ok(smaller.sources.some(source => source.id === 'siemens-3va5135-ambient-2020'));
});

test('50 A temperature rejection can select 60 A while motor override and explicit suppression remain distinct', () => {
  const load = motorLoad(25, 29.5, 39.2); // 49 A floor: exceeds 48.3 A at 50 °C for 50 A, fits 58 A for 60 A.
  const basis = criteria(); Object.assign(basis.motorStarter, { breakerAmbientTemperatureC: 70, breakerAmbientReference: '70 A only', s2BreakerAmbientTemperatureC: 50, s2BreakerAmbientReference: reference });
  let result = evaluateMotorBranchBreakerCandidate({ load, supply, criteria: basis });
  assert.equal(result.candidate.branchCircuitBreaker.continuousCurrentA, 60);
  assert.equal(result.candidate.checks.find(item => item.id === 'breakerAmbientOperatingCurrent').evidence.basis, 'project-s2');
  Object.assign(load.motor, { breakerAmbientTemperatureC: 40, breakerAmbientReference: 'Motor enclosure study' });
  result = evaluateMotorBranchBreakerCandidate({ load, supply, criteria: basis });
  assert.equal(result.candidate.branchCircuitBreaker.continuousCurrentA, 50);
  assert.equal(result.candidate.checks.find(item => item.id === 'breakerAmbientOperatingCurrent').evidence.basis, 'motor');
  Object.assign(load.motor, { breakerAmbientTemperatureC: null, breakerAmbientReference: null });
  result = evaluateMotorBranchBreakerCandidate({ load, supply, criteria: basis });
  assert.equal(result.candidate.branchCircuitBreaker.continuousCurrentA, 50);
  assert.equal(result.candidate.checks.find(item => item.id === 'breakerAmbientOperatingCurrent').evidence.basis, 'motor-unset');
  delete load.motor.breakerAmbientTemperatureC; delete load.motor.breakerAmbientReference;
  delete basis.motorStarter.s2BreakerAmbientTemperatureC; delete basis.motorStarter.s2BreakerAmbientReference;
  result = evaluateMotorBranchBreakerCandidate({ load, supply, criteria: basis });
  assert.equal(result.candidate.branchCircuitBreaker.continuousCurrentA, 50);
  assert.equal(result.candidate.checks.find(item => item.id === 'breakerAmbientOperatingCurrent').evidence.basis, 'unspecified', '70 A project basis must not be reinterpreted for S2');
});

test('invalid, partial, and mismatched S2 project inputs block without interpolation or defaults', () => {
  for (const [settings, code] of [
    [{ s2BreakerAmbientTemperatureC: 52, s2BreakerAmbientReference: reference }, 'INVALID_S2_BREAKER_AMBIENT_TEMPERATURE'],
    [{ s2BreakerAmbientTemperatureC: '50', s2BreakerAmbientReference: reference }, 'INVALID_S2_BREAKER_AMBIENT_TEMPERATURE'],
    [{ s2BreakerAmbientTemperatureC: 50 }, 'S2_BREAKER_AMBIENT_REFERENCE_REQUIRED'],
    [{ s2BreakerAmbientReference: reference }, 'INVALID_S2_BREAKER_AMBIENT_TEMPERATURE'],
    [{ s2BreakerAmbientTemperatureC: 50, s2BreakerAmbientReference: reference, branchProtectionMethod: 'manual-controller' }, 'MISMATCHED_S2_BREAKER_AMBIENT_METHOD']
  ]) {
    const basis = criteria(); Object.assign(basis.motorStarter, settings);
    assert.ok(validateDesignSynthesisMotorInputs({ equipment: [motorLoad(30, 38, 40)], criteria: basis }).inputIssues.some(item => item.code === code));
  }
  const input = { breakerA: 60, motor: { breakerAmbientTemperatureC: 52, breakerAmbientReference: reference }, floorA: 40 };
  assert.equal(evaluateMotorS2BreakerAmbient(input).status, 'fail');
  assert.equal(evaluateMotorS2BreakerAmbient({ ...input, motor: {} }).status, 'unevaluated');
});

for (const count of [25, 50]) test(`${count} load proposal retains independently scoped S2 and 70 A temperature evidence`, () => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const original = input.equipment;
  input.equipment = Array.from({ length: count }, (_, index) => ({ ...original[index % original.length], id: `L-${index}`, tag: `L-${index}`, kw: 2, powerFactor: 0.9, duty: 'continuous' }));
  for (const [index, row] of [motorLoad(15, 22, 21), motorLoad(20, 27, 27), motorLoad(30, 38, 40), motorLoad(40, 48, 52)].entries()) {
    const existing = input.equipment[index];
    Object.assign(existing, row, { id: `L-${index}`, tag: `L-${index}`, x: existing.x, y: existing.y, z: existing.z });
  }
  input.supply.availableFaultCurrentKA = 20;
  input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic source study' };
  input.criteria.motorStarting = { minimumVoltagePu: 0.7 };
  input.criteria.motorStarter = { ...criteria().motorStarter, breakerAmbientTemperatureC: 65, breakerAmbientReference: '70 A enclosure study', s2BreakerAmbientTemperatureC: 50, s2BreakerAmbientReference: reference };
  const proposal = generateDesignProposal(input);
  for (const [index, amps, basis] of [[0, 35, 'project-s2'], [1, 50, 'project-s2'], [2, 60, 'project-s2'], [3, 70, 'project']]) {
    const candidate = proposal.motorStarterCandidates.cases.find(item => item.motorId === `L-${index}`).candidate;
    assert.equal(candidate.branchCircuitBreaker.continuousCurrentA, amps);
    assert.equal(candidate.checks.find(item => item.id === 'breakerAmbientOperatingCurrent').evidence.basis, basis);
    assert.equal(proposal.cables.find(item => item.loadId === `L-${index}`).motor.branchBreakerAmpacityFloorA, amps);
    assert.equal(candidate.selectedForApply, false);
  }
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(item => item.code === 'MOTOR_PROTECTION_UNRESOLVED'));
});
