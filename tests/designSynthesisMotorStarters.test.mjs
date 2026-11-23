import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateMotorStarterCandidates, MOTOR_STARTER_CANDIDATE_SOURCES } from '../analysis/designSynthesisMotorStarters.mjs';

function input(overrides = {}) {
  return {
    load: {
      id: 'M-01',
      voltage: 480,
      phases: 3,
      frequencyHz: 60,
      kw: 7.5,
      motor: {
        ratedVoltageV: 460,
        fullLoadCurrentA: 14,
        nameplateCurrentA: 12.8,
        nameplateHorsepower: 10,
        nameplateFrequencyHz: 60,
        starterType: 'dol'
      },
      ...overrides.load
    },
    supply: {
      voltage: 480,
      phases: 3,
      frequencyHz: 60,
      availableFaultCurrentKA: 20,
      voltageSystem: {
        connection: 'wye',
        grounding: 'solid',
        lineToGroundVoltageV: 277,
        reference: 'Project electrical basis: 480Y/277 V solidly grounded wye'
      },
      ...overrides.supply
    },
    criteria: {
      motorStarter: {
        controlVoltageV: 24,
        controlCurrentType: 'DC',
        enclosureMm: { height: 610, width: 305, depth: 205 }
      },
      ...overrides.criteria
    }
  };
}

function status(result, id) {
  return (result.candidate?.checks ?? result.rejectedCandidate?.checks ?? []).find(item => item.id === id)?.status;
}

function assertFiniteNumberLeaves(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value));
  else if (Array.isArray(value)) value.forEach(assertFiniteNumberLeaves);
  else if (value && typeof value === 'object') Object.values(value).forEach(assertFiniteNumberLeaves);
}

test('returns the exact Siemens combination as a blocked screening candidate for a fitting 460 V motor on a direct 480 V supply', () => {
  const result = evaluateMotorStarterCandidates(input());

  assert.equal(result.status, 'blocked');
  assert.equal(result.protectionStatus, 'blocked');
  assert.equal(result.researchStatus, 'candidate');
  assert.equal(result.libraryStatus, 'screening');
  assert.ok(result.candidate);
  assert.equal(result.candidate.contactor.catalogNumber, '3RT2025-1BB40');
  assert.equal(result.candidate.overloadRelay.catalogNumber, '3RU2126-4AB0');
  assert.equal(result.candidate.shortCircuitController.catalogNumber, '3RV2021-4AA10');
  assert.equal(result.candidate.motorNameplate.ratedVoltageV, 460);
  assert.equal(result.candidate.ulCombination.voltageV, 480);
  assert.equal(result.candidate.ulCombination.shortCircuitCurrentKA, 65);
  assert.equal(result.candidate.relayDialSettingCandidateA, 12.8);
  assert.equal(result.candidate.relayPublishedNominalTripCurrentA, 16);
  assert.equal(status(result, 'relayPublishedTripCalibration'), 'pass');
  assert.equal(result.candidate.shortCircuitControllerSettingA, null);
  assert.equal(status(result, 'direct480VCircuit'), 'pass');
  assert.equal(status(result, 'motorVoltageRating'), 'pass');
  assert.equal(status(result, 'contactorUlCurrent'), 'pass');
  assert.equal(status(result, 'relayCurrentRange'), 'pass');
  assert.equal(status(result, 'controllerCurrentRange'), 'pass');
  assert.equal(status(result, 'ulHorsepower'), 'pass');
  assert.equal(status(result, 'conditionalShortCircuitRating'), 'pass');
  assert.equal(status(result, 'controlSupply'), 'pass');
  assert.equal(status(result, 'certifiedControllerCondition'), 'unevaluated');
  assert.equal(status(result, 'enclosureOrientation'), 'unevaluated');
  assert.equal(status(result, 'faultDutyAndCoordination'), 'unevaluated');
  assert.equal(result.candidate.selectedForApply, false);
});

test('uses local motor-circuit voltage and phase/frequency before considering the source fault bound', () => {
  const transformedVoltage = evaluateMotorStarterCandidates(input({
    load: { voltage: 208 },
    supply: { voltage: 480 }
  }));
  assert.equal(transformedVoltage.candidate, null);
  assert.equal(status(transformedVoltage, 'direct480VCircuit'), 'fail');
  assert.equal(status(transformedVoltage, 'conditionalShortCircuitRating'), 'unevaluated');

  const wrongLocalPhases = evaluateMotorStarterCandidates(input({ load: { phases: 1 } }));
  assert.equal(wrongLocalPhases.candidate, null);
  assert.equal(status(wrongLocalPhases, 'threePhase60Hz'), 'fail');

  const wrongFrequency = evaluateMotorStarterCandidates(input({ load: { frequencyHz: 50 } }));
  assert.equal(wrongFrequency.candidate, null);
  assert.equal(status(wrongFrequency, 'threePhase60Hz'), 'fail');

  const wrongMotorFrequency = evaluateMotorStarterCandidates(input({ load: { motor: { nameplateFrequencyHz: 50 } } }));
  assert.equal(wrongMotorFrequency.candidate, null);
  assert.equal(status(wrongMotorFrequency, 'threePhase60Hz'), 'fail');

  const wrongSourceFrequency = evaluateMotorStarterCandidates(input({ supply: { frequencyHz: 50 } }));
  assert.equal(wrongSourceFrequency.candidate, null);
  assert.equal(status(wrongSourceFrequency, 'threePhase60Hz'), 'fail');

  const wrongSourcePhases = evaluateMotorStarterCandidates(input({ supply: { phases: 1 } }));
  assert.equal(wrongSourcePhases.candidate, null);
  assert.equal(status(wrongSourcePhases, 'threePhase60Hz'), 'fail');
});

test('rejects delta or ungrounded system bases even when the line voltage is 480 V', () => {
  for (const voltageSystem of [
    { connection: 'delta', grounding: 'solid', lineToGroundVoltageV: 277, reference: 'source record' },
    { connection: 'wye', grounding: 'high-resistance', lineToGroundVoltageV: 277, reference: 'source record' },
    { connection: 'wye', grounding: 'solid', lineToGroundVoltageV: 240, reference: 'source record' }
  ]) {
    const result = evaluateMotorStarterCandidates(input({ supply: { voltageSystem } }));
    assert.ok(result.candidate);
    assert.equal(result.status, 'blocked');
    assert.equal(status(result, 'slashVoltageSystem'), 'fail');
  }
});

test('accepts the nominal 277 V label or the direct 480 divided by square root of three value only', () => {
  const calculated = evaluateMotorStarterCandidates(input({
    supply: { voltageSystem: { connection: 'wye', grounding: 'solid', lineToGroundVoltageV: 480 / Math.sqrt(3), reference: 'Calculated from 480 V line-to-line voltage' } }
  }));
  assert.equal(status(calculated, 'slashVoltageSystem'), 'pass');
  assert.equal(calculated.candidate.checks.find(item => item.id === 'slashVoltageSystem').evidence.acceptedBasis, 'calculated-480-over-sqrt3');

  const looseVoltage = evaluateMotorStarterCandidates(input({
    supply: { voltageSystem: { connection: 'wye', grounding: 'solid', lineToGroundVoltageV: 277.001, reference: 'source record' } }
  }));
  assert.equal(status(looseVoltage, 'slashVoltageSystem'), 'fail');
});

test('does not use electrical-input kW as a substitute for nameplate horsepower', () => {
  const missingHorsepower = evaluateMotorStarterCandidates(input({ load: { motor: { nameplateHorsepower: undefined } } }));
  assert.equal(missingHorsepower.candidate, null);
  assert.equal(status(missingHorsepower, 'ulHorsepower'), 'fail');

  const overHorsepower = evaluateMotorStarterCandidates(input({ load: { motor: { nameplateHorsepower: 10.01 } } }));
  assert.equal(overHorsepower.candidate, null);
  assert.equal(status(overHorsepower, 'ulHorsepower'), 'fail');
});

test('applies the contactor UL FLA limit separately from the relay and controller ranges', () => {
  const contactorOverload = evaluateMotorStarterCandidates(input({ load: { motor: { nameplateCurrentA: 14.01 } } }));
  assert.equal(contactorOverload.candidate, null);
  assert.equal(status(contactorOverload, 'contactorUlCurrent'), 'fail');

  const relayBelowRange = evaluateMotorStarterCandidates(input({ load: { motor: { nameplateCurrentA: 10.9 } } }));
  assert.equal(relayBelowRange.candidate, null);
  assert.equal(status(relayBelowRange, 'relayCurrentRange'), 'fail');

  const controllerBelowRange = evaluateMotorStarterCandidates(input({ load: { motor: { nameplateCurrentA: 9.9 } } }));
  assert.equal(controllerBelowRange.candidate, null);
  assert.equal(status(controllerBelowRange, 'controllerCurrentRange'), 'fail');
});

test('keeps the candidate visible when explicit project criteria or fault evidence is incomplete', () => {
  const missingCriteria = evaluateMotorStarterCandidates(input({ criteria: { motorStarter: undefined } }));
  assert.ok(missingCriteria.candidate);
  assert.equal(missingCriteria.status, 'blocked');
  assert.equal(status(missingCriteria, 'controlSupply'), 'fail');
  assert.equal(missingCriteria.candidate.protectionStatus, 'blocked');

  const excessiveFault = evaluateMotorStarterCandidates(input({ supply: { availableFaultCurrentKA: 65.1 } }));
  assert.ok(excessiveFault.candidate);
  assert.equal(excessiveFault.status, 'blocked');
  assert.equal(status(excessiveFault, 'conditionalShortCircuitRating'), 'fail');

  const noFaultBound = evaluateMotorStarterCandidates(input({ supply: { availableFaultCurrentKA: undefined } }));
  assert.ok(noFaultBound.candidate);
  assert.equal(status(noFaultBound, 'sourceFaultBound'), 'fail');

  const zeroFaultBound = evaluateMotorStarterCandidates(input({ supply: { availableFaultCurrentKA: 0 } }));
  assert.ok(zeroFaultBound.candidate);
  assert.equal(status(zeroFaultBound, 'sourceFaultBound'), 'fail');
  assert.equal(status(zeroFaultBound, 'conditionalShortCircuitRating'), 'fail');
});

test('requires explicit 24 V DC control and dimensioned enclosure evidence without claiming orientation is verified', () => {
  const missingControl = evaluateMotorStarterCandidates(input({ criteria: { motorStarter: { enclosureMm: { height: 610, width: 305, depth: 205 } } } }));
  assert.ok(missingControl.candidate);
  assert.equal(status(missingControl, 'controlSupply'), 'fail');

  const undersized = evaluateMotorStarterCandidates(input({ criteria: { motorStarter: { controlVoltageV: 24, controlCurrentType: 'DC', enclosureMm: { height: 609, width: 305, depth: 205 } } } }));
  assert.ok(undersized.candidate);
  assert.equal(status(undersized, 'minimumEnclosureDimensions'), 'fail');
  assert.equal(status(undersized, 'enclosureOrientation'), 'unevaluated');
});

test('preserves source provenance, derived exact-part mapping, and conditional status labels', () => {
  const result = evaluateMotorStarterCandidates(input());
  const candidate = result.candidate;

  assert.ok(candidate.sources.some(source => source.id === 'siemens-ul-e44653-2025-03-17' && source.sha256 === 'c55126215a47084e9d40a8f0e11589a083285798a294c2ff32ce1ef00e55d45d'));
  assert.equal(candidate.fieldSources.find(source => source.pointer === '/candidate/ulCombination/combination')?.status, 'derived');
  assert.equal(candidate.fieldSources.find(source => source.pointer === '/candidate/shortCircuitController/catalogNumber')?.status, 'verified');
  assert.equal(candidate.libraryStatus, 'screening');
  assert.equal(candidate.researchStatus, 'candidate');
  assert.equal(candidate.ulCombination.coordinationType, 'Type 1');
  assert.equal(candidate.ulCombination.evaluatedNetworkFrequencyHz, 60);
  assert.equal(candidate.ulCombination.shortCircuitCurrentKA, 65);
  assert.ok(candidate.sources.every(source => source.publisher && source.accessedOn === '2026-10-19'));
  for (const pointer of [
    '/candidate/contactor/poles',
    '/candidate/contactor/size',
    '/candidate/contactor/coilCurrentType',
    '/candidate/overloadRelay/tripClass',
    '/candidate/overloadRelay/mounting',
    '/candidate/overloadRelay/publishedTripCalibrationMultiplier',
    '/candidate/shortCircuitController/ulThreePhaseMotorFlaAt480V',
    '/candidate/shortCircuitController/ulThreePhaseMotorHorsepowerAt460Or480V',
    '/candidate/ulCombination/coordinationType',
    '/candidate/relayPublishedNominalTripCurrentA'
  ]) assert.ok(candidate.fieldSources.some(source => source.pointer === pointer), `Missing field provenance for ${pointer}`);
  assert.match(candidate.checks.find(item => item.id === 'faultDutyAndCoordination').message, /not an assembled-panel SCCR/);
  assert.equal(Object.isFrozen(candidate.sources), false);
  assert.equal(Object.isFrozen(candidate.sources[0].locators), false);
  assert.equal(Object.isFrozen(MOTOR_STARTER_CANDIDATE_SOURCES), true);
});

test('rejects malformed numeric values without throwing', () => {
  for (const malformed of [NaN, Infinity, -Infinity, '12.8', 0, -1]) {
    const result = evaluateMotorStarterCandidates(input({ load: { motor: { nameplateCurrentA: malformed } } }));
    assert.equal(result.candidate, null);
    assert.equal(status(result, 'motorNameplateCurrent'), 'fail');
    assertFiniteNumberLeaves(result);
  }
});
