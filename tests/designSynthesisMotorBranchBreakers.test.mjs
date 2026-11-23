import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateMotorBranchBreakerCandidate, MOTOR_BRANCH_BREAKER_SOURCES } from '../analysis/designSynthesisMotorBranchBreakers.mjs';

function input(overrides = {}) {
  const baseMotor = {
    ratedVoltageV: 460, fullLoadCurrentA: 14,
    fullLoadCurrentBasis: { reference: 'Explicit design FLC basis for selected motor' },
    nameplateCurrentA: 15, nameplateHorsepower: 10,
    nameplateFrequencyHz: 60, starterType: 'dol', rotorType: 'squirrel-cage'
  };
  return {
    load: {
      id: 'M-01', voltage: 480, phases: 3, frequencyHz: 60, kw: 7.5, powerFactor: 0.9,
      ratingsBasis: 'electrical-input-kW', duty: 'continuous',
      ...overrides.load,
      motor: { ...baseMotor, ...overrides.load?.motor }
    },
    supply: { voltage: 480, phases: 3, frequencyHz: 60, availableFaultCurrentKA: 20, ...overrides.supply },
    criteria: {
      code: 'NEC',
      ...overrides.criteria,
      motorStarter: {
        controlVoltageV: 24, controlCurrentType: 'DC', branchProtectionMethod: 'inverse-time-breaker',
        ...overrides.criteria?.motorStarter
      }
    }
  };
}

function candidateCheck(candidate, id) {
  return candidate.checks.find(item => item.id === id);
}

function inspectFiniteNumbers(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value));
  else if (Array.isArray(value)) value.forEach(inspectFiniteNumbers);
  else if (value && typeof value === 'object') Object.values(value).forEach(inspectFiniteNumbers);
}

test('selects lowest exact breaker candidate for verified 3RT2027 combination and keeps protection blocked', () => {
  const result = evaluateMotorBranchBreakerCandidate(input());
  assert.equal(result.status, 'blocked');
  assert.equal(result.protectionStatus, 'blocked');
  assert.equal(result.candidate?.contactor.catalogNumber, '3RT2027-1BB40');
  assert.equal(result.candidate?.contactor.ulThreePhaseMotorFlaAt480V, 27);
  assert.equal(result.candidate?.contactor.ulThreePhaseMotorHorsepowerAt460Or480V, 20);
  assert.equal(result.candidate?.overloadRelay.catalogNumber, '3RU2126-4AB0');
  assert.equal(result.candidate?.branchCircuitBreaker.catalogNumber, '3VA5125-6EC31-0AA0');
  assert.equal(result.candidate?.conditionalCombination.maximumBreakerCurrentA, 30);
  assert.equal(result.candidate?.conditionalCombination.shortCircuitCurrentKA, 65);
  assert.equal(result.candidate?.conditionalCombination.coordinationType, 'Type 1');
  assert.equal(result.candidate?.selectedForApply, false);
  assert.equal(result.candidate?.researchStatus, 'candidate');
  assert.equal(result.candidate?.libraryStatus, 'screening');
  assert.equal(candidateCheck(result.candidate, 'inverseTimeBreakerSizing')?.status, 'pass');
  assert.equal(candidateCheck(result.candidate, 'conditionalShortCircuitRating')?.status, 'pass');
  assert.equal(candidateCheck(result.candidate, 'tccStartingAndCoordination')?.status, 'unevaluated');
  assert.equal(candidateCheck(result.candidate, 'groundingAndCompleteFaultDuty')?.status, 'unevaluated');
  assert.equal(candidateCheck(result.candidate, 'breakerLugsEnclosureAndInstallation')?.status, 'unevaluated');
  assert.equal(candidateCheck(result.candidate, 'codeEditionAndApplication')?.status, 'unevaluated');
  assert.ok(!('shortCircuitController' in result.candidate));
  assert.ok(result.candidates.every(item => item.contactor.catalogNumber !== '3RT2025-1BB40'));
  assert.ok(result.candidate.conditionalCombination.combination.includes('3RT2027 / 3RT2028'));
  assert.deepEqual(result.candidates.map(item => item.branchCircuitBreaker.catalogNumber), [
    '3VA5125-6EC31-0AA0', '3VA5130-6EC31-0AA0'
  ]);
  assert.equal(result.candidates[1].contactor.catalogNumber, '3RT2027-1BB40');
  assert.equal(result.candidate.branchCircuitBreaker.instantaneousPickupA, null);
  assert.equal(candidateCheck(result.candidate, 'motorStarterInstantaneousPickup')?.status, 'unevaluated');
  assert.ok(!result.candidate.checks.some(item => /controllerCurrentRange|certifiedControllerCondition|slashVoltageSystem|minimumEnclosureDimensions/.test(item.id)));
});

test('selects the separately certified 14–20 A relay for a sourced 16.8 A motor nameplate', () => {
  // Baldor GNEM2332T: 10 hp, 460 V, 16.8 A, 60 Hz; electrical kW is the
  // independently calculated nominal 460 V, 16.8 A, 0.61 PF input. Project
  // source and design-current assumptions remain synthetic and unverified.
  const result = evaluateMotorBranchBreakerCandidate(input({ load: {
    kw: Math.sqrt(3) * 460 * 16.8 * 0.61 / 1000, powerFactor: 0.61,
    motor: { nameplateCurrentA: 16.8, fullLoadCurrentA: 14, fullLoadCurrentBasis: { reference: 'Illustrative 2017 table-based 10 hp/460 V value; applicability not established' } }
  } }));
  const candidate = result.candidate;
  assert.equal(candidate.overloadRelay.catalogNumber, '3RU2126-4BB0');
  assert.equal(candidate.overloadRelay.currentSettingMinA, 14);
  assert.equal(candidate.overloadRelay.currentSettingMaxA, 20);
  assert.equal(candidate.branchCircuitBreaker.catalogNumber, '3VA5125-6EC31-0AA0');
  assert.equal(candidate.conditionalCombination.maximumBreakerCurrentA, 40);
  assert.equal(candidate.conditionalCombination.shortCircuitCurrentKA, 65);
  assert.match(candidate.conditionalCombination.combination, /3RU2126-4B/);
  assert.equal(candidate.selectedForApply, false);
  assert.equal(candidate.protectionStatus, 'blocked');
  assert.equal(candidateCheck(candidate, 'tccStartingAndCoordination').status, 'unevaluated');
  assert.ok(candidate.fieldSources.some(row => row.pointer === '/candidate/overloadRelay/catalogNumber' && row.sourceId === 'siemens-3ru2126-4bb0-product'));
  assert.ok(candidate.fieldSources.some(row => row.pointer === '/candidate/conditionalCombination/maximumBreakerCurrentA' && row.locator.includes('40 A')));
  for (const [current, part] of [[14, '3RU2126-4AB0'], [16, '3RU2126-4AB0'], [16.000001, '3RU2126-4BB0'], [20, '3RU2126-4BB0'], [20.000001, '3RU2136-4DB0']]) {
    const actual = evaluateMotorBranchBreakerCandidate(input({ load: { motor: { nameplateCurrentA: current } } }));
    assert.equal(actual.candidate?.overloadRelay.catalogNumber || null, part, String(current));
  }
});

test('applies 125 percent minimum, 250 percent ceiling, and certificate cap without size exceptions', () => {
  const noCandidateCanReachMinimum = evaluateMotorBranchBreakerCandidate(input({
    load: { motor: { fullLoadCurrentA: 25, fullLoadCurrentBasis: { reference: 'Explicit design FLC basis' } } }
  }));
  assert.equal(noCandidateCanReachMinimum.candidate, null);
  assert.ok(noCandidateCanReachMinimum.candidates.every(item => candidateCheck(item, 'inverseTimeBreakerSizing')?.status === 'fail'));
  assert.match(noCandidateCanReachMinimum.limitations.join(' '), /No next-standard-size/);

  const certificateCapStillApplies = evaluateMotorBranchBreakerCandidate(input({
    load: { motor: { fullLoadCurrentA: 11, fullLoadCurrentBasis: { reference: 'Explicit design FLC basis' }, nameplateCurrentA: 12 } }
  }));
  assert.equal(candidateCheck(certificateCapStillApplies.candidates[1], 'inverseTimeBreakerSizing')?.status, 'fail');
  assert.match(candidateCheck(certificateCapStillApplies.candidates[1], 'inverseTimeBreakerSizing').message, /27\.500 A/);
});

test('requires explicit code, method, rotor type, referenced FLC, and running-current basis', () => {
  const cases = [
    [{ criteria: { code: undefined } }, 'explicitCode'],
    [{ criteria: { motorStarter: { branchProtectionMethod: undefined } } }, 'branchProtectionMethod'],
    [{ load: { motor: { rotorType: undefined } } }, 'rotorType'],
    [{ load: { motor: { fullLoadCurrentA: undefined } } }, 'designFLC'],
    [{ load: { motor: { fullLoadCurrentBasis: { reference: ' ' } } } }, 'fullLoadCurrentBasis'],
    [{ load: { powerFactor: undefined } }, 'runningCurrentBasis']
  ];
  for (const [overrides, id] of cases) {
    const result = evaluateMotorBranchBreakerCandidate(input(overrides));
    assert.equal(result.candidate, null, `${id} should prevent candidate selection`);
    assert.ok(result.candidates.every(candidate => candidate.eligibleForResearchShortlist === false));
    assert.ok(result.candidates.every(candidate => candidate.checks.some(item => item.id === id && item.status === 'fail')));
  }
});

test('does not claim 3RT2027 certificate fit for transformed local voltage or unsupported external fault bound', () => {
  const transformed = evaluateMotorBranchBreakerCandidate(input({ load: { voltage: 208 }, supply: { voltage: 480 } }));
  assert.equal(transformed.candidate, null);
  for (const candidate of transformed.candidates) {
    assert.equal(candidateCheck(candidate, 'conditionalShortCircuitRating')?.status, 'unevaluated');
  }

  const excessive = evaluateMotorBranchBreakerCandidate(input({ supply: { availableFaultCurrentKA: 65.01 } }));
  assert.equal(excessive.candidate, null);
  assert.ok(excessive.candidates.every(candidate => candidateCheck(candidate, 'conditionalShortCircuitRating')?.status === 'fail'));
});

test('checks TM230 instantaneous settings against discrete values and never assumes one', () => {
  const omitted = evaluateMotorBranchBreakerCandidate(input());
  assert.equal(candidateCheck(omitted.candidate, 'motorStarterInstantaneousPickup')?.status, 'unevaluated');
  assert.deepEqual(omitted.candidate.branchCircuitBreaker.allowedInstantaneousPickupA, [150, 180, 210, 240, 270, 300]);

  const accepted = evaluateMotorBranchBreakerCandidate(input({ criteria: { motorStarter: { instantaneousPickupA: 180 } } }));
  assert.equal(candidateCheck(accepted.candidate, 'motorStarterInstantaneousPickup')?.status, 'pass');
  assert.equal(accepted.candidate.branchCircuitBreaker.instantaneousPickupA, 180);

  const betweenDiscreteValues = evaluateMotorBranchBreakerCandidate(input({ criteria: { motorStarter: { instantaneousPickupA: 151 } } }));
  assert.equal(betweenDiscreteValues.candidate, null);
  assert.ok(betweenDiscreteValues.candidates.every(candidate => candidateCheck(candidate, 'motorStarterInstantaneousPickup')?.status === 'fail'));
});

test('records exact source provenance and returns detached source data', () => {
  const result = evaluateMotorBranchBreakerCandidate(input());
  const candidate = result.candidate;
  assert.ok(candidate.sources.some(source => source.id === 'siemens-ul-e44653-2025-03-17' && source.sha256));
  assert.ok(candidate.sources.some(source => source.id === 'siemens-3va51-speedfax-2024' && source.sha256));
  assert.ok(candidate.fieldSources.some(source => source.pointer === '/candidate/contactor/catalogNumber' && source.sourceId === 'siemens-3rt2027-1bb40-product-data'));
  assert.ok(candidate.fieldSources.some(source => source.pointer === '/candidate/branchCircuitBreaker/allowedInstantaneousPickupA' && /page 53/.test(source.locator)));
  assert.ok(candidate.fieldSources.some(source => source.pointer === '/candidate/conditionalCombination/combination' && /3RT2027/.test(source.locator)));
  assert.ok(candidate.sources.every(source => source.publisher && source.accessedOn));
  candidate.sources[0].locators.push('mutation');
  assert.equal(MOTOR_BRANCH_BREAKER_SOURCES[0].locators.includes('mutation'), false);
});

test('records the exact 30 A curve source without transferring it to the 25 A candidate', () => {
  const result = evaluateMotorBranchBreakerCandidate(input());
  const [candidate25A, candidate30A] = result.candidates;
  const sourceId = 'siemens-3va5130-30a-tcc-2018-02-01';
  const curveCheck25A = candidateCheck(candidate25A, 'tccStartingAndCoordination');
  const curveCheck30A = candidateCheck(candidate30A, 'tccStartingAndCoordination');
  const source30A = candidate30A.sources.find(source => source.id === sourceId);

  assert.equal(candidate25A.branchCircuitBreaker.catalogNumber, '3VA5125-6EC31-0AA0');
  assert.equal(candidate25A.curveResearch.status, 'exact-source-missing');
  assert.equal(candidate25A.curveResearch.matchingManufacturerGraphicAvailable, false);
  assert.equal(candidate25A.curveResearch.sourceId, null);
  assert.equal(curveCheck25A.status, 'unevaluated');
  assert.match(curveCheck25A.message, /No exact 25 A Siemens curve was located/);
  assert.deepEqual(curveCheck25A.sourceIds, []);
  assert.ok(!candidate25A.sources.some(source => source.id === sourceId));

  assert.equal(candidate30A.branchCircuitBreaker.catalogNumber, '3VA5130-6EC31-0AA0');
  assert.equal(candidate30A.curveResearch.status, 'matching-graphic-located-unqualified');
  assert.equal(candidate30A.curveResearch.matchingManufacturerGraphicAvailable, true);
  assert.equal(candidate30A.curveResearch.sourceId, sourceId);
  assert.match(candidate30A.curveResearch.sourceAvailability, /full catalog number is matched through Siemens catalog\/product records/);
  assert.equal(candidate30A.curveResearch.settingsApplicability.fixedIrA, 30);
  assert.deepEqual(candidate30A.curveResearch.settingsApplicability.instantaneousPickupA, [150, 180, 210, 240, 270, 300]);
  assert.equal(candidate30A.curveResearch.settingsApplicability.selectedInstantaneousPickupA, null);
  assert.deepEqual(candidate30A.curveResearch.testConditions, {
    ambientC: 40,
    initialCondition: 'cold start',
    installation: 'open air',
    wireLength: '4 ft',
    conductorTemperatureRatingC: 75,
    conductorBasis: 'per terminal',
    poles: 'all main poles'
  });
  assert.match(candidate30A.curveResearch.curveInterpretation.thermal, /40 C cold-start nominal trace with illustrated tolerances; not a guaranteed thermal-clearing envelope/);
  assert.match(candidate30A.curveResearch.curveInterpretation.instantaneous, /maximum clearing and solid minimum tripping only/);
  assert.equal(curveCheck30A.status, 'unevaluated');
  assert.match(curveCheck30A.message, /matching Siemens graphic for the 30 A TM230 configuration is located/);
  assert.match(curveCheck30A.message, /40 C cold-start nominal thermal trace/);
  assert.match(curveCheck30A.message, /instantaneous inset labels maximum clearing and minimum tripping only/);
  assert.deepEqual(curveCheck30A.sourceIds, [sourceId]);
  assert.equal(source30A.sha256, 'f62f22900761e701bde34df6308fe7c29fd5b2ecdf4a5d2947f882ced0e0c94e');
  assert.ok(source30A.url.includes('109801743'));
  assert.ok(result.candidates.every(candidate => candidate.protectionStatus === 'blocked'));
});

test('threads each listed 30 A instantaneous pickup into candidate research and check evidence only when valid', () => {
  for (const selectedInstantaneousPickupA of [150, 180, 210, 240, 270, 300, undefined, 151]) {
    const result = evaluateMotorBranchBreakerCandidate(input({
      criteria: { motorStarter: { instantaneousPickupA: selectedInstantaneousPickupA } }
    }));
    const candidate30A = result.candidates.find(candidate => candidate.branchCircuitBreaker.catalogNumber === '3VA5130-6EC31-0AA0');
    const curveCheck = candidateCheck(candidate30A, 'tccStartingAndCoordination');
    const expected = [150, 180, 210, 240, 270, 300].includes(selectedInstantaneousPickupA)
      ? selectedInstantaneousPickupA
      : null;
    assert.equal(candidate30A.curveResearch.settingsApplicability.selectedInstantaneousPickupA, expected);
    assert.equal(curveCheck.evidence.settingsApplicability.selectedInstantaneousPickupA, expected);
    assert.equal(candidate30A.branchCircuitBreaker.instantaneousPickupA, expected);
    assert.deepEqual(curveCheck.evidence, candidate30A.curveResearch);
  }
});

test('does not mutate input and rejects malformed numerical inputs without emitting non-finite output', () => {
  for (const malformed of [NaN, Infinity, -Infinity, '14', 0, -1]) {
    const source = input({ supply: { availableFaultCurrentKA: malformed } });
    const before = structuredClone(source);
    const result = evaluateMotorBranchBreakerCandidate(source);
    assert.deepEqual(source, before);
    assert.equal(result.candidate, null);
    assert.ok(result.candidates.every(candidate => candidateCheck(candidate, 'conditionalShortCircuitRating')?.status === 'fail'));
    inspectFiniteNumbers(result);
  }
});
