import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateMotorBranchBreakerCandidate } from '../analysis/designSynthesisMotorBranchBreakers.mjs';
import { evaluateMotorS3Candidate } from '../analysis/designSynthesisMotorS3Candidate.mjs';
import { compareMotorCombinationInitialRms } from '../analysis/designSynthesisMotorCombinationFault.mjs';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';

const motor = { ratedVoltageV: 460, fullLoadCurrentA: 65, fullLoadCurrentBasis: { reference: 'Synthetic design-current basis; not a code table' }, nameplateCurrentA: 60, nameplateHorsepower: 50, nameplateFrequencyHz: 60, lockedRotorCurrentA: 400, lockedRotorPowerFactor: 0.27, starterType: 'dol', rotorType: 'squirrel-cage' };
const makeLoad = () => ({ id: 'M50', voltage: 480, phases: 3, frequencyHz: 60, kw: Math.sqrt(3) * 480 * 60 * 0.86 / 1000, powerFactor: 0.86, duty: 'continuous', ratingsBasis: 'electrical-input-kW', motor: structuredClone(motor) });
const supply = { voltage: 480, phases: 3, frequencyHz: 60, availableFaultCurrentKA: 20 };
const criteria = { code: 'NEC', motorStarter: { branchProtectionMethod: 'inverse-time-breaker', controlVoltageV: 24, controlCurrentType: 'DC' } };

test('50 hp candidate retains exact S3 parts and conservative current arithmetic without implying protection', () => {
  const result = evaluateMotorBranchBreakerCandidate({ load: makeLoad(), supply, criteria });
  const candidate = result.candidate;
  assert.equal(candidate.contactor.catalogNumber, '3RT2046-1NB30');
  assert.equal(candidate.overloadRelay.catalogNumber, '3RU2146-4JB0');
  assert.equal(candidate.branchCircuitBreaker.catalogNumber, '3VA5290-6EC31-0AA0');
  assert.equal(candidate.sizing.minimumBreakerPickupA, 81.25);
  assert.equal(candidate.sizing.conservativeMaximumBreakerPickupA, 162.5);
  assert.equal(candidate.conditionalCombination.maximumBreakerCurrentA, 200);
  assert.equal(candidate.conditionalCombination.shortCircuitCurrentKA, 65);
  assert.equal(candidate.overloadRelay.publishedNominalTripCurrentA, null);
  assert.equal(candidate.selectedForApply, false);
  assert.equal(result.protectionStatus, 'blocked');
  assert.equal(candidate.checks.find(check => check.id === 'tccStartingAndCoordination').status, 'unevaluated');
});

test('part-specific pickup, current, voltage and operating bounds reject unsupported applications', () => {
  for (const value of [450, 540, 630, 720, 810, 900]) {
    const load = makeLoad(); load.motor.instantaneousPickupA = value;
    assert.equal(evaluateMotorS3Candidate({ load, supply, criteria }).candidate.branchCircuitBreaker.instantaneousPickupA, value);
  }
  const variants = [
    ({ load }) => { load.motor.nameplateCurrentA = 63.01; },
    ({ load }) => { load.motor.nameplateCurrentA = 44.99; },
    ({ load }) => { load.motor.nameplateHorsepower = 75.01; },
    ({ load }) => { load.motor.instantaneousPickupA = 700; },
    ({ load }) => { load.motor.fullLoadCurrentA = 72.01; },
    ({ load }) => { load.motor.fullLoadCurrentA = 35.99; },
    ({ load }) => { load.motor.breakerAmbientTemperatureC = 50; load.motor.breakerAmbientReference = 'Other breaker family'; },
    ({ load }) => { load.motor.starterType = 'vfd'; },
    ({ supply: source }) => { source.availableFaultCurrentKA = 65.01; },
    ({ supply: source }) => { source.voltage = 600; },
    ({ criteria: basis }) => { basis.motorStarter.controlCurrentType = 'AC'; },
  ];
  for (const mutate of variants) {
    const input = { load: makeLoad(), supply: structuredClone(supply), criteria: structuredClone(criteria) };
    mutate(input);
    assert.equal(evaluateMotorS3Candidate(input).candidate, null);
  }
  const atLimits = makeLoad(); atLimits.motor.fullLoadCurrentA = 72; atLimits.motor.nameplateCurrentA = 63; atLimits.motor.instantaneousPickupA = 900;
  assert.ok(evaluateMotorS3Candidate({ load: atLimits, supply: { ...supply, availableFaultCurrentKA: 65 }, criteria }).candidate);
  assert.equal(evaluateMotorS3Candidate({ load: makeLoad(), supply, criteria, operatingCurrentA: 73, operatingCurrentReference: 'Synthetic study' }).candidate, null);
  assert.equal(evaluateMotorS3Candidate({ load: makeLoad(), supply, criteria, operatingCurrentA: 50 }).candidate, null);
  assert.equal(evaluateMotorS3Candidate({ load: null, supply: null, criteria: null }).candidate, null);
});

test('conditional fault comparison requires the exact new certificate, part and evidence binding', () => {
  const candidate = evaluateMotorS3Candidate({ load: makeLoad(), supply, criteria }).candidate;
  const breaker = candidate.branchCircuitBreaker;
  const device = { catalogNumber: breaker.catalogNumber, continuousCurrentA: 90, tripRatingA: 90, poles: 3, ratedVoltageVac: 480, evaluatedVoltageVac: 480, interruptingRatingVoltageVac: 480, interruptingRatingKA: 65, conditionalCombination: structuredClone(candidate.conditionalCombination), sourceIds: candidate.sources.map(source => source.id), fieldSources: candidate.fieldSources };
  const binding = { ref: { motorId: 'M50', candidateId: candidate.id }, candidate, protectedSideBusId: 'M50' };
  const placement = { _researchDevice: device, _busId: 'PANEL', proposedLocation: { nominalVoltageLLV: 480 }, comparisons: { lineTerminalAvailableInitialRms: { valueKA: 20 } } };
  assert.equal(compareMotorCombinationInitialRms(binding, placement, true).status, 'not-above-cited-value-unqualified');
  assert.equal(compareMotorCombinationInitialRms(binding, placement, false).status, 'not-compared');
  const source = binding.candidate.sources.find(item => item.id === 'siemens-ul-e31519-2025');
  const sourceUrl = source.url;
  source.url = 'https://example.invalid/other-certificate';
  assert.equal(compareMotorCombinationInitialRms(binding, placement, true).status, 'not-compared');
  source.url = sourceUrl;
  placement.comparisons.lineTerminalAvailableInitialRms.valueKA = 66;
  assert.equal(compareMotorCombinationInitialRms(binding, placement, true).status, 'above-cited-value');
  binding.candidate.overloadRelay.currentSettingMaxA = 64;
  assert.equal(compareMotorCombinationInitialRms(binding, placement, true).status, 'not-compared');
  binding.candidate.overloadRelay.currentSettingMaxA = 63;
  placement._researchDevice.catalogNumber = '3VA5190-6EC31-0AA0';
  assert.equal(compareMotorCombinationInitialRms(binding, placement, true).status, 'not-compared');
});

for (const count of [25, 50]) test(`${count} loads retain the 50 hp research candidate and 90 A conductor floor`, () => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const base = input.equipment;
  input.equipment = Array.from({ length: count }, (_, i) => ({ ...base[i % base.length], id: `L-${i}`, tag: `L-${i}`, kw: 2, powerFactor: 0.9, duty: 'continuous' }));
  Object.assign(input.equipment[0], makeLoad(), { id: 'L-0', tag: 'L-0', x: input.equipment[0].x, y: input.equipment[0].y, z: input.equipment[0].z });
  input.supply.availableFaultCurrentKA = 20;
  input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic source study' };
  input.criteria.motorStarting = { minimumVoltagePu: 0.7 };
  input.criteria.motorStarter = structuredClone(criteria.motorStarter);
  const proposal = generateDesignProposal(input);
  const result = proposal.motorStarterCandidates.cases.find(item => item.motorId === 'L-0');
  assert.equal(result.candidate?.branchCircuitBreaker.catalogNumber, '3VA5290-6EC31-0AA0', JSON.stringify(result.diagnostics));
  const cable = proposal.cables.find(item => item.loadId === 'L-0');
  assert.equal(cable.motor.branchBreakerAmpacityFloorA, 90);
  assert.ok(cable.ampacityA >= 90);
  assert.equal(cable.protectiveDevice.catalogNumber, '3VA5290-6EC31-0AA0');
  assert.equal(cable.protectiveDevice.selectedForApply, false);
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(item => item.code === 'MOTOR_PROTECTION_UNRESOLVED'));
});
