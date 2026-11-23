import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateMotorBranchBreakerCandidate } from '../analysis/designSynthesisMotorBranchBreakers.mjs';
import { evaluateMotorS2Candidates } from '../analysis/designSynthesisMotor25HpCandidate.mjs';
import { validateDesignSynthesisMotorInputs } from '../analysis/designSynthesisMotors.mjs';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';

const supply = { voltage: 480, phases: 3, frequencyHz: 60, availableFaultCurrentKA: 20 };
const criteria = { code: 'NEC', motorStarter: { branchProtectionMethod: 'inverse-time-breaker', controlVoltageV: 24, controlCurrentType: 'DC' } };
function load(hp, nameplate, flc) {
  return { id: 'M', voltage: 480, phases: 3, frequencyHz: 60, kw: Math.sqrt(3) * 480 * nameplate * 0.85 / 1000, powerFactor: 0.85, duty: 'continuous', ratingsBasis: 'electrical-input-kW', motor: { ratedVoltageV: 460, fullLoadCurrentA: flc, fullLoadCurrentBasis: { reference: 'Synthetic design-current case' }, nameplateCurrentA: nameplate, nameplateHorsepower: hp, nameplateFrequencyHz: 60, lockedRotorCurrentA: 228, lockedRotorPowerFactor: 0.3, starterType: 'dol', rotorType: 'squirrel-cage' } };
}

for (const [hp, nameplate, flc, relay, breaker, pickup] of [
  [15, 22, 21, '3RU2136-4DB0', 35, 175],
  [20, 27, 27, '3RU2136-4EB0', 50, 250],
  [25, 38, 40, '3RU2136-4FB0', 60, 360],
  [30, 38, 40, '3RU2136-4FB0', 60, 480],
  [35, 43, 45, '3RU2136-4GB0', 60, 540]
]) test(`${hp} hp source-specific S2 shortlist`, () => {
  const motor = load(hp, nameplate, flc);
  motor.motor.instantaneousPickupA = pickup;
  const result = evaluateMotorBranchBreakerCandidate({ load: motor, supply, criteria });
  const candidate = result.candidate;
  assert.ok(candidate);
  assert.equal(candidate.overloadRelay.catalogNumber, relay);
  assert.equal(candidate.overloadRelay.candidateDialSettingA, nameplate);
  assert.equal(candidate.overloadRelay.publishedNominalTripCurrentA, nameplate * 1.25);
  assert.equal(candidate.branchCircuitBreaker.catalogNumber, `3VA51${breaker}-6EC31-0AA0`);
  assert.equal(candidate.branchCircuitBreaker.instantaneousPickupA, pickup);
  assert.equal(candidate.conditionalCombination.maximumBreakerCurrentA, breaker);
  assert.equal(candidate.conditionalCombination.shortCircuitCurrentKA, 25);
  assert.equal(candidate.protectionStatus, 'blocked');
  assert.equal(candidate.selectedForApply, false);
  assert.equal(candidate.curveResearch.matchingManufacturerGraphicAvailable, breaker === 60 ? true : null);
  if (breaker === 60) {
    assert.equal(candidate.curveResearch.voltageApplicability, 'unqualified-for-480v');
    assert.equal(candidate.curveResearch.settingsApplicability.selectedSettingArchived, [300, 480].includes(pickup));
    assert.deepEqual(candidate.curveResearch.archivedExports.map(item => item.instantaneousPickupA), [300, 480]);
    assert.ok(candidate.fieldSources.some(item => item.sourceId === 'siemens-simaris-3va5160-2026'));
  }
  assert.equal(candidate.checks.find(check => check.id === 'tccStartingAndCoordination').status, 'unevaluated');
  assert.ok(candidate.sources.some(source => source.id === `siemens-3ru2136-${relay.slice(-4).toLowerCase()}`));
  assert.equal(validateDesignSynthesisMotorInputs({ equipment: [motor], criteria }).inputIssues.some(issue => issue.code === 'INVALID_MOTOR_INSTANTANEOUS_PICKUP'), false);
});

test('S2 candidates enforce relay and breaker-specific limits without transferring the 70 A ambient basis', () => {
  const sample = load(30, 38, 40);
  const input = { load: sample, supply, criteria };
  const result = evaluateMotorS2Candidates(input);
  const byRelay = name => result.candidates.find(item => item.overloadRelay.catalogNumber === name);
  assert.equal(byRelay('3RU2136-4DB0').eligibleForResearchShortlist, false);
  assert.equal(byRelay('3RU2136-4EB0').eligibleForResearchShortlist, false);
  assert.equal(byRelay('3RU2136-4FB0').eligibleForResearchShortlist, true);
  assert.equal(byRelay('3RU2136-4GB0').eligibleForResearchShortlist, true);
  assert.ok(result.sources.find(source => source.id === 'siemens-ul-3ru2136-2023').locators.some(locator => locator.includes('3RU2136-4F')));
  assert.ok(result.sources.find(source => source.id === 'siemens-ul-3ru2136-2023').locators.some(locator => locator.includes('3RU2136-4G')));
  for (const mutate of [
    x => { x.load.motor.nameplateCurrentA = 45.01; },
    x => { x.load.motor.fullLoadCurrentA = 48.01; },
    x => { x.load.motor.fullLoadCurrentA = 23.99; },
    x => { x.load.motor.instantaneousPickupA = 175; },
    x => { x.load.motor.breakerAmbientTemperatureC = 50; },
    x => { x.load.motor.rotorType = 'wound-rotor'; },
    x => { x.load.type = 'vfd'; },
    x => { x.supply.availableFaultCurrentKA = 25.01; },
    x => { x.criteria.motorStarter.controlVoltageV = 120; },
    x => { x.operatingCurrentA = 49; x.operatingCurrentReference = 'Synthetic study'; },
    x => { x.load.motor.fullLoadCurrentBasis.reference = ''; }
  ]) {
    const changed = structuredClone(input);
    mutate(changed);
    assert.equal(evaluateMotorS2Candidates(changed).candidate, null, String(mutate));
  }
  const noSetting = evaluateMotorS2Candidates(input).candidate;
  assert.equal(noSetting.branchCircuitBreaker.instantaneousPickupA, null);
  assert.equal(noSetting.checks.find(check => check.id === 'instantaneousPickup').status, 'unevaluated');
});

for (const count of [25, 50]) test(`${count} load proposal preserves S2 candidates, conductor floor and blocker`, () => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const original = input.equipment;
  input.equipment = Array.from({ length: count }, (_, i) => ({ ...original[i % original.length], id: `L-${i}`, tag: `L-${i}`, kw: 2, powerFactor: 0.9, duty: 'continuous' }));
  Object.assign(input.equipment[0], load(30, 38, 40), { id: 'L-0', tag: 'L-0', x: input.equipment[0].x, y: input.equipment[0].y, z: input.equipment[0].z });
  input.equipment[0].motor.instantaneousPickupA = 480;
  input.supply.availableFaultCurrentKA = 20;
  input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic source study' };
  input.criteria.motorStarting = { minimumVoltagePu: 0.7 };
  input.criteria.motorStarter = structuredClone(criteria.motorStarter);
  const proposal = generateDesignProposal(input);
  const candidate = proposal.motorStarterCandidates.cases.find(item => item.motorId === 'L-0').candidate;
  assert.equal(candidate.overloadRelay.catalogNumber, '3RU2136-4FB0');
  assert.equal(candidate.branchCircuitBreaker.catalogNumber, '3VA5160-6EC31-0AA0');
  assert.equal(candidate.branchCircuitBreaker.instantaneousPickupA, 480);
  const cable = proposal.cables.find(item => item.loadId === 'L-0');
  assert.equal(cable.motor.branchBreakerAmpacityFloorA, 60);
  assert.ok(cable.routeThermalAmpacity >= 60);
  assert.equal(cable.protectiveDevice.catalogNumber, '3VA5160-6EC31-0AA0');
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(issue => issue.code === 'MOTOR_PROTECTION_UNRESOLVED'));
});


test('explicitly suppressing an inherited 70 A ambient basis remains valid for smaller motors', () => {
  const projectCriteria = structuredClone(criteria);
  Object.assign(projectCriteria.motorStarter, { breakerAmbientTemperatureC: 50, breakerAmbientReference: 'Synthetic project enclosure' });
  for (const motor of [load(15, 22, 21), load(25, 29.5, 34), load(30, 38, 40)]) {
    Object.assign(motor.motor, { breakerAmbientTemperatureC: null, breakerAmbientReference: null });
    assert.ok(evaluateMotorBranchBreakerCandidate({ load: motor, supply, criteria: projectCriteria }).candidate);
    assert.equal(validateDesignSynthesisMotorInputs({ equipment: [motor], criteria: projectCriteria }).inputIssues.some(issue => issue.code === 'UNSUPPORTED_MOTOR_BREAKER_AMBIENT_BASIS'), false);
  }
});
