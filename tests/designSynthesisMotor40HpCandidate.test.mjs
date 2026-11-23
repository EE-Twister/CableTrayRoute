import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateMotorBranchBreakerCandidate } from '../analysis/designSynthesisMotorBranchBreakers.mjs';
import { evaluateMotor40HpCandidate } from '../analysis/designSynthesisMotor40HpCandidate.mjs';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { validateDesignSynthesisMotorInputs } from '../analysis/designSynthesisMotors.mjs';

const motor = { ratedVoltageV: 460, fullLoadCurrentA: 52, fullLoadCurrentBasis: { reference: '2017 historical table; applicability unverified' }, nameplateCurrentA: 48, nameplateHorsepower: 40, nameplateFrequencyHz: 60, lockedRotorCurrentA: 338, lockedRotorPowerFactor: 0.27, starterType: 'dol', rotorType: 'squirrel-cage' };
const makeLoad = () => ({ id: 'M40', voltage: 480, phases: 3, frequencyHz: 60, kw: Math.sqrt(3) * 480 * 48 * 0.86 / 1000, powerFactor: 0.86, duty: 'continuous', ratingsBasis: 'electrical-input-kW', motor: structuredClone(motor) });
const supply = { voltage: 480, phases: 3, frequencyHz: 60, availableFaultCurrentKA: 20 };
const criteria = { code: 'NEC', motorStarter: { branchProtectionMethod: 'inverse-time-breaker', controlVoltageV: 24, controlCurrentType: 'DC' } };

test('40 hp 48 A motor matches the documented combination while full protection remains blocked', () => {
  const result = evaluateMotorBranchBreakerCandidate({ load: makeLoad(), supply, criteria });
  assert.equal(result.status, 'blocked');
  assert.equal(result.candidate.contactor.catalogNumber, '3RT2036-1NB30');
  assert.equal(result.candidate.overloadRelay.catalogNumber, '3RU2136-4HB0');
  assert.equal(result.candidate.overloadRelay.publishedTripCalibrationMultiplier, 1.25);
  assert.equal(result.candidate.overloadRelay.publishedNominalTripCurrentA, 60);
  assert.ok(result.candidate.fieldSources.some(item => item.pointer === '/candidate/overloadRelay/publishedNominalTripCurrentA' && item.sourceId === 'siemens-ul-3ru2136-2023'));
  assert.equal(result.candidate.branchCircuitBreaker.catalogNumber, '3VA5170-6EC31-0AA0');
  assert.equal(result.candidate.sizing.minimumBreakerPickupA, 65);
  assert.equal(result.candidate.sizing.conservativeMaximumBreakerPickupA, 130);
  assert.equal(result.candidate.conditionalCombination.shortCircuitCurrentKA, 25);
  assert.equal(result.candidate.selectedForApply, false);
  assert.equal(result.candidate.branchCircuitBreaker.instantaneousPickupA, null);
  assert.equal(result.candidate.curveResearch.status, 'matching-graphic-located-unqualified');
  assert.equal(result.candidate.curveResearch.voltageApplicability, 'unqualified-for-480v');
  assert.equal(result.candidate.curveResearch.displayedConditions.operatingVoltageV, 415);
  assert.equal(result.candidate.curveResearch.settingsApplicability.selectedInstantaneousPickupA, null);
  assert.equal(result.candidate.curveResearch.settingsApplicability.selectedSettingArchived, null);
  assert.ok(result.candidate.checks.some(item => item.id === 'tccStartingAndCoordination' && item.status === 'unevaluated'));
  assert.ok(result.candidate.checks.some(item => item.id === 'coordinationAndInstallation' && item.status === 'unevaluated'));
});

test('exact 70 A curve exports retain settings and voltage qualifications without inventing timing data', () => {
  for (const pickup of [350, 420, 490, 560, 630, 700]) {
    const load = makeLoad(); load.motor.instantaneousPickupA = pickup;
    const result = evaluateMotor40HpCandidate({ load, supply, criteria });
    const research = result.candidate.curveResearch;
    assert.equal(research.settingsApplicability.selectedInstantaneousPickupA, pickup);
    assert.equal(research.settingsApplicability.selectedSettingArchived, pickup === 350 || pickup === 490);
    assert.equal(research.displayedConditions.iecIcuKA, 70);
    assert.equal(result.candidate.branchCircuitBreaker.interruptingRatingKA, 65);
    assert.equal(result.candidate.conditionalCombination.shortCircuitCurrentKA, 25);
    assert.equal(research.displayedConditions.frequencyHz, null);
    assert.equal(research.displayedConditions.initialState, null);
    assert.equal(research.displayedConditions.installation, null);
    assert.ok(result.candidate.sources.some(source => source.id === research.sourceId && source.url === research.sourceUrl));
    assert.ok(result.candidate.checks.find(item => item.id === 'tccStartingAndCoordination').sourceIds.includes(research.sourceId));
    assert.equal(result.candidate.checks.find(item => item.id === 'tccStartingAndCoordination').status, 'unevaluated');
    assert.equal(result.candidate.selectedForApply, false);
    assert.equal(research.curvePoints, undefined);
    assert.equal(result.candidate.branchCircuitBreaker.curvePoints, undefined);
  }
});

test('referenced operating-study current is retained in candidate evidence', () => {
  const result = evaluateMotorBranchBreakerCandidate({ load: makeLoad(), supply, criteria, operatingCurrentA: 50, operatingCurrentReference: 'Study case A' });
  assert.equal(result.candidate.sizing.operatingCurrentA, 50);
  assert.deepEqual(result.candidate.checks.find(item => item.id === 'referencedOperatingCurrent').evidence, { operatingCurrentA: 50, reference: 'Study case A' });
  const malformed = makeLoad(); malformed.motor.nameplateCurrentA = '48';
  const rejected = evaluateMotorBranchBreakerCandidate({ load: malformed, supply, criteria });
  assert.equal(rejected.candidate, null);
  assert.equal(rejected.candidates[0].overloadRelay.publishedNominalTripCurrentA, null);
});

test('70 A breaker compares referenced enclosure temperature against the dated source without claiming qualification', () => {
  const expected = [[40, 70], [45, 69], [50, 68], [55, 67], [60, 66], [65, 65], [70, 64]];
  for (const [temperature, rating] of expected) {
    const basis = structuredClone(criteria);
    Object.assign(basis.motorStarter, { breakerAmbientTemperatureC: temperature, breakerAmbientReference: 'Synthetic enclosure temperature study' });
    const result = evaluateMotor40HpCandidate({ load: makeLoad(), supply, criteria: basis });
    const check = result.candidates[0].checks.find(item => item.id === 'breakerAmbientOperatingCurrent');
    assert.equal(check.evidence.publishedOperatingCurrentA, rating);
    assert.equal(check.evidence.screeningFloorA, 65);
    assert.equal(check.status, temperature === 70 ? 'fail' : 'unevaluated');
    assert.equal(check.evidence.comparison, temperature === 70 ? 'exceeds-2025-table' : 'within-2025-table-unqualified');
    assert.equal(check.evidence.differingDatasheetValuesUnresolved, true);
    assert.equal(result.candidate === null, temperature === 70);
    assert.match(check.message, /Another Siemens datasheet reports different values/);
    assert.equal(result.protectionStatus, 'blocked');
  }
  const noTemperature = evaluateMotor40HpCandidate({ load: makeLoad(), supply, criteria });
  const missing = noTemperature.candidate.checks.find(item => item.id === 'breakerAmbientOperatingCurrent');
  assert.equal(missing.status, 'unevaluated');
  assert.equal(missing.evidence.publishedOperatingCurrentA, null);
  for (const invalid of [{ breakerAmbientTemperatureC: 47, breakerAmbientReference: 'test' }, { breakerAmbientTemperatureC: 50 }, { breakerAmbientTemperatureC: '50', breakerAmbientReference: 'test' }]) {
    const basis = structuredClone(criteria); Object.assign(basis.motorStarter, invalid);
    const result = evaluateMotor40HpCandidate({ load: makeLoad(), supply, criteria: basis });
    assert.equal(result.candidate, null);
    assert.equal(result.candidates[0].checks.find(item => item.id === 'breakerAmbientOperatingCurrent').status, 'fail');
    assert.ok(validateDesignSynthesisMotorInputs({ equipment: [makeLoad()], criteria: basis }).inputIssues.some(item => ['INVALID_BREAKER_AMBIENT_TEMPERATURE', 'BREAKER_AMBIENT_REFERENCE_REQUIRED'].includes(item.code)));
  }
});

test('malformed and extreme inputs block without exporting non-finite numbers', () => {
  const load = makeLoad();
  load.kw = Number.MAX_VALUE;
  load.motor.fullLoadCurrentA = Number.MAX_VALUE;
  const result = evaluateMotor40HpCandidate({ load, supply: { ...supply, availableFaultCurrentKA: Infinity }, criteria });
  assert.equal(result.candidate, null);
  assert.equal(result.candidates[0].sizing.calculatedRunningCurrentA, null);
  assert.equal(result.candidates[0].sizing.conservativeMaximumBreakerPickupA, null);
  assert.doesNotMatch(JSON.stringify(result), /Infinity|NaN/);
  assert.equal(evaluateMotor40HpCandidate({ load: null, supply: null, criteria: null }).candidate, null);
});

test('conditional limit, source voltage, nameplate, starting and operating floor reject unsupported cases', () => {
  const variants = [
    ({ supply }) => { supply.availableFaultCurrentKA = 25.01; },
    ({ supply }) => { supply.voltage = 600; },
    ({ load }) => { load.motor.nameplateCurrentA = 50.01; },
    ({ load }) => { load.motor.nameplateCurrentA = 39.99; },
    ({ load }) => { load.motor.rotorType = 'wound-rotor'; },
    ({ load }) => { load.type = 'vfd'; },
    ({ load }) => { load.loadType = ' Soft Starter '; },
    ({ load }) => { load.motor.nameplateFrequencyHz = 50; },
    ({ load }) => { load.motor.fullLoadCurrentA = 57; },
    ({ criteria }) => { criteria.motorStarter.instantaneousPickupA = 150; },
    input => { input.operatingCurrentA = 60; input.operatingCurrentReference = 'Study'; },
    input => { input.operatingCurrentA = 48; },
  ];
  for (const change of variants) {
    const input = { load: makeLoad(), supply: structuredClone(supply), criteria: structuredClone(criteria) };
    change(input);
    const result = evaluateMotorBranchBreakerCandidate(input);
    assert.equal(result.candidate, null, String(change));
    assert.ok(result.candidates[0].checks.some(item => item.status === 'fail'));
  }
  const boundary = evaluateMotorBranchBreakerCandidate({ load: makeLoad(), supply: { ...supply, availableFaultCurrentKA: 25 }, criteria });
  assert.ok(boundary.candidate);
});

for (const count of [25, 50]) test(`${count}-load synthesis retains a 40 hp candidate and its conductor floor while Apply stays blocked`, () => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const source = input.equipment;
  input.equipment = Array.from({ length: count }, (_, i) => ({ ...source[i % source.length], id: `L-${i}`, tag: `L-${i}`, kw: 2, powerFactor: 0.9, duty: 'continuous' }));
  Object.assign(input.equipment[0], makeLoad(), { id: 'L-0', tag: 'L-0', x: input.equipment[0].x, y: input.equipment[0].y, z: input.equipment[0].z });
  Object.assign(input.equipment[1], { kw: Math.sqrt(3) * 480 * 16.8 * 0.8 / 1000, powerFactor: 0.8, ratingsBasis: 'electrical-input-kW', motor: { ...structuredClone(motor), nameplateHorsepower: 10, nameplateCurrentA: 16.8, fullLoadCurrentA: 16.8, lockedRotorCurrentA: 121, lockedRotorPowerFactor: 0.254 } });
  input.supply.availableFaultCurrentKA = 20;
  input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic source study' };
  input.criteria.motorStarting = { minimumVoltagePu: 0.7 };
  input.criteria.motorStarter = structuredClone(criteria.motorStarter);
  input.criteria.motorStarter.breakerAmbientTemperatureC = 50;
  input.criteria.motorStarter.breakerAmbientReference = 'Synthetic enclosure temperature';
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.loads.length, count);
  const result = proposal.motorStarterCandidates.cases.find(item => item.motorId === 'L-0');
  assert.equal(result.candidate?.branchCircuitBreaker.catalogNumber, '3VA5170-6EC31-0AA0', JSON.stringify(result.diagnostics));
  assert.equal(result.candidate.checks.find(item => item.id === 'breakerAmbientOperatingCurrent').evidence.publishedOperatingCurrentA, 68);
  const smallMotor = proposal.motorStarterCandidates.cases.find(item => item.motorId === 'L-1');
  assert.equal(smallMotor.candidate?.branchCircuitBreaker.catalogNumber, '3VA5125-6EC31-0AA0', JSON.stringify(smallMotor.diagnostics));
  assert.equal(smallMotor.candidate.branchCircuitBreaker.instantaneousPickupA, null);
  const cable = proposal.cables.find(item => item.loadId === 'L-0');
  assert.ok(cable.motor.designAmpacityA >= 65);
  assert.equal(cable.motor.branchBreakerAmpacityFloorA, 70);
  assert.ok(cable.ampacityA >= 70);
  assert.equal(cable.protectiveDevice.catalogNumber, '3VA5170-6EC31-0AA0');
  assert.equal(cable.protectiveDevice.selectedForApply, false);
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(item => item.code === 'MOTOR_PROTECTION_UNRESOLVED'));
  input.criteria.motorStarter.breakerAmbientTemperatureC = 70;
  const tooHot = generateDesignProposal(input);
  const rejected = tooHot.motorStarterCandidates.cases.find(item => item.motorId === 'L-0');
  assert.equal(rejected.candidate, null);
  assert.equal(rejected.candidates[0].checks.find(item => item.id === 'breakerAmbientOperatingCurrent').status, 'fail');
  assert.equal(tooHot.status, 'blocked');
});
