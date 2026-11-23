import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { evaluateMotorBranchBreakerCandidate } from '../analysis/designSynthesisMotorBranchBreakers.mjs';
import { evaluateDesignSynthesisStudy } from '../analysis/designSynthesisStudy.mjs';

function fixture(count = 25) {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const originals = input.equipment;
  input.equipment = Array.from({ length: count }, (_, index) => ({ ...originals[index % originals.length], id: `L-${index}`, tag: `L-${index}`, kw: 2 }));
  Object.assign(input.equipment[0], { kw: 9, powerFactor: 0.86, duty: 'continuous', ratingsBasis: 'electrical-input-kW', motor: {
    ratedVoltageV: 460, fullLoadCurrentA: 14,
    fullLoadCurrentBasis: { reference: 'Synthetic referenced design FLC; not installed motor data' },
    nameplateCurrentA: 12.8, nameplateHorsepower: 10, nameplateFrequencyHz: 60,
    lockedRotorCurrentA: 90, lockedRotorPowerFactor: 0.3, starterType: 'dol', rotorType: 'squirrel-cage',
  } });
  input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic impedance within the explicit 20 kA external bound' };
  input.criteria.motorStarting = { minimumVoltagePu: 0.8 };
  input.criteria.motorStarter = { controlVoltageV: 24, controlCurrentType: 'DC', branchProtectionMethod: 'inverse-time-breaker', instantaneousPickupA: 150 };
  return input;
}

function directInput() {
  const input = fixture();
  return { load: { ...input.equipment[0], frequencyHz: 60 }, supply: { ...input.supply, frequencyHz: 60 }, criteria: input.criteria };
}

function assertFiniteTree(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value));
  else if (Array.isArray(value)) value.forEach(assertFiniteTree);
  else if (value && typeof value === 'object') Object.values(value).forEach(assertFiniteTree);
}

test('independent breaker arithmetic selects 25/30 A at exact bounds and applies the 250% ceiling without rounding', () => {
  for (const [flc, expected] of [[10, 25], [9.999999, null], [20, 25], [20.000001, 30], [24, 30], [24.000001, null]]) {
    const input = directInput();
    input.load.motor.fullLoadCurrentA = flc;
    input.load.kw = 1;
    const result = evaluateMotorBranchBreakerCandidate(input);
    assert.equal(result.candidate?.branchCircuitBreaker.continuousCurrentA ?? null, expected, `${flc} A referenced FLC`);
    if (result.candidate) {
      assert.equal(result.candidate.sizing.minimumBreakerPickupA, 1.25 * flc);
      assert.equal(result.candidate.sizing.conservativeMaximumBreakerPickupA, 2.5 * flc);
      assert.equal(result.candidate.selectedForApply, false);
    }
  }
  const input = directInput();
  input.load.kw = 15;
  const result = evaluateMotorBranchBreakerCandidate(input);
  const handCurrent = 15000 / (Math.sqrt(3) * 480 * 0.86);
  assert.ok(Math.abs(result.candidate.sizing.calculatedRunningCurrentA - handCurrent) < 1e-12);
  assert.equal(result.candidate.branchCircuitBreaker.continuousCurrentA, 30, 'Running current, independently of FLC, raises the minimum above 25 A');
});

test('standalone selector rejects shaft output, absent continuous duty, numerical overflow and nonlisted instantaneous settings', () => {
  for (const patch of [{ ratingsBasis: 'shaft-output-kW' }, { duty: undefined }, { kw: Number.MAX_VALUE }, { motor: { fullLoadCurrentA: Number.MAX_VALUE } }, { motor: { nameplateCurrentA: Infinity } }]) {
    const input = directInput();
    input.load = { ...input.load, ...patch, motor: { ...input.load.motor, ...patch.motor } };
    const before = structuredClone(input);
    const result = evaluateMotorBranchBreakerCandidate(input);
    assert.equal(result.candidate, null);
    assertFiniteTree(result);
    assert.deepEqual(input, before);
  }
  for (const value of [null, '150', 149.999999, 151, 300.000001, NaN, Infinity]) {
    const input = directInput();
    input.criteria.motorStarter.instantaneousPickupA = value;
    const result = evaluateMotorBranchBreakerCandidate(input);
    assert.equal(result.candidate, null);
    assertFiniteTree(result);
  }
});

test('exact certificate family and straight 480 V scope are distinct from the manual-controller route', () => {
  const input = directInput();
  input.load.motor.nameplateCurrentA = 16;
  input.load.motor.nameplateHorsepower = 20;
  input.supply.voltageSystem = { connection: 'delta', grounding: 'ungrounded', reference: 'Synthetic delta source' };
  input.supply.availableFaultCurrentKA = 65;
  const candidate = evaluateMotorBranchBreakerCandidate(input).candidate;
  assert.equal(candidate.contactor.catalogNumber, '3RT2027-1BB40');
  assert.equal(candidate.contactor.ulThreePhaseMotorFlaAt480V, 27);
  assert.equal(candidate.overloadRelay.catalogNumber, '3RU2126-4AB0');
  assert.equal(candidate.branchCircuitBreaker.interruptingRatingKA, 65);
  assert.equal(candidate.conditionalCombination.coordinationType, 'Type 1');
  assert.ok(!candidate.shortCircuitController);
  assert.ok(!candidate.checks.some(row => row.id === 'slashVoltageSystem'));
  assert.equal(candidate.checks.find(row => row.id === 'groundingAndCompleteFaultDuty').status, 'unevaluated');
  assert.ok(candidate.sources.some(row => row.url.includes('language=es') && row.locators.some(text => text.includes('20 hp'))));
  assert.ok(candidate.sources.find(row => row.id === 'siemens-ul-e44653-2025-03-17').locators.some(text => text.includes('page 12') && text.includes('scope heading')));
  for (const field of candidate.fieldSources.filter(row => row.pointer.startsWith('/candidate/'))) {
    let value = { candidate };
    for (const key of field.pointer.slice(1).split('/')) value = value?.[key];
    assert.notEqual(value, undefined, `Unresolvable source pointer ${field.pointer}`);
  }
});

test('25/50-load proposals use the exact research breaker on the actual branch and retain independent motor and feeder current bases', () => {
  for (const count of [25, 50]) {
    const input = fixture(count);
    const snapshot = structuredClone(input);
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.loads.length, count);
    const assembly = proposal.motorStarterCandidates.cases[0].candidate;
    const cable = proposal.cables.find(row => row.loadId === 'L-0');
    assert.equal(assembly.branchCircuitBreaker.catalogNumber, '3VA5125-6EC31-0AA0');
    assert.equal(cable.protectiveDevice.catalogNumber, assembly.branchCircuitBreaker.catalogNumber);
    assert.equal(cable.protectiveDevice.continuousCurrentA, 25);
    assert.equal(cable.protectiveDevice.libraryStatus, 'screening');
    assert.equal(cable.protectiveDevice.selectedForApply, false);
    assert.ok(cable.ampacityA >= 25);
    const load = proposal.loads.find(row => row.id === 'L-0');
    assert.equal(load.designAmpacityA, 17.5, 'Breaker current is not the load design current');
    const feeder = proposal.cables.find(row => row.to === load.panelRef && !row.loadId);
    const panelLoads = proposal.loads.filter(row => row.panelRef === load.panelRef);
    const handFloor = panelLoads.reduce((sum, row) => sum + Math.max(row.kw * 1000 / (Math.sqrt(3) * row.voltage * row.powerFactor) * (row.duty === 'continuous' ? 1.25 : 1), row.motor ? row.motor.fullLoadCurrentA * 1.25 : 0), 0);
    assert.ok(Math.abs(feeder.designAmpacityA - handFloor) < 1e-10, 'Feeder floor does not sum branch-breaker ratings');
    const connection = proposal.oneLine.sheets[0].connections.find(row => row.cableRef === cable.id);
    assert.equal(connection.cable.protectiveDevice.catalogNumber, assembly.branchCircuitBreaker.catalogNumber);
    assert.equal(connection.cable.protectiveDevice.libraryStatus, 'screening');
    assert.equal(proposal.studyValidation.status, 'pass');
    assert.equal(proposal.motorStartingValidation.status, 'pass');
    assert.equal(proposal.status, 'blocked');
    assert.equal(proposal.distributionBaseline, null);
    assert.ok(proposal.issues.some(row => row.code === 'MOTOR_PROTECTION_UNRESOLVED'));
    assert.deepEqual(input, snapshot);
  }
});

test('25/50-load designs carry the sourced 16.8 A motor example through the researched branch without approving protection', () => {
  for (const count of [25, 50]) {
    const input = fixture(count);
    const row = input.equipment[0];
    row.kw = Math.sqrt(3) * 460 * 16.8 * 0.61 / 1000;
    row.powerFactor = 0.61;
    Object.assign(row.motor, { nameplateCurrentA: 16.8, lockedRotorCurrentA: 121, lockedRotorPowerFactor: 0.254,
      fullLoadCurrentBasis: { reference: 'Illustrative historical 10 hp / 460 V table value; application and adopted edition not verified' } });
    row.sourceDocuments = [{ title: 'ABB Baldor GNEM2332T information packet, page 6, record 101013; typical performance, not guaranteed', url: 'https://www.baldor.com/api/products/GNEM2332T/infopacket', sha256: '7af275fea860d9d38ccbfce69f802e1d58fa902dbd0b36a1f91cc25508c81de5' }];
    const proposal = generateDesignProposal(input);
    const assembly = proposal.motorStarterCandidates.cases[0].candidate;
    const cable = proposal.cables.find(item => item.loadId === 'L-0');
    assert.equal(proposal.loads.length, count);
    assert.equal(assembly.overloadRelay.catalogNumber, '3RU2126-4BB0');
    assert.equal(assembly.conditionalCombination.maximumBreakerCurrentA, 40);
    assert.equal(cable.protectiveDevice.catalogNumber, assembly.branchCircuitBreaker.catalogNumber);
    assert.ok(cable.ampacityA >= assembly.branchCircuitBreaker.fixedOverloadPickupA);
    assert.equal(proposal.loads[0].motor.nameplateCurrentA, 16.8);
    assert.equal(proposal.loads[0].motor.fullLoadCurrentA, 14);
    assert.equal(proposal.inputEvidence.records.equipment[0].sourceDocuments[0].sha256, row.sourceDocuments[0].sha256);
    assert.equal(proposal.status, 'blocked');
    assert.equal(assembly.selectedForApply, false);
    assert.ok(proposal.issues.some(item => item.code === 'MOTOR_PROTECTION_UNRESOLVED'));
  }
});

test('thermal derating uses the branch-breaker floor rather than only the 17.5 A motor conductor floor', () => {
  const input = fixture();
  input.criteria.ambientTempC = 50;
  input.criteria.bundledConductors = 20;
  const proposal = generateDesignProposal(input);
  const cable = proposal.cables.find(row => row.loadId === 'L-0');
  // Independent 75 C table arithmetic: #8 50 A * .75 * .50 = 18.75 A;
  // #6 65 A * .75 * .50 = 24.375 A; #4 85 A * .75 * .50 = 31.875 A.
  assert.equal(cable.protectiveDevice.continuousCurrentA, 25);
  assert.equal(cable.conductor_size, '#4 AWG');
  assert.ok(Math.abs(cable.ampacityA - 31.875) < 1e-12);
  assert.ok(Math.abs(cable.thermalAssessment.adjustmentFactor - 0.375) < 1e-12);
  assert.equal(proposal.status, 'blocked');
});

test('an unsupported explicit breaker combination cannot silently fall back to a generic device', () => {
  for (const patch of [{ rotorType: undefined }, { rotorType: 'wound-rotor' }, { nameplateHorsepower: 20.000001 }, { nameplateCurrentA: 20.000001 }]) {
    const input = fixture();
    Object.assign(input.equipment[0].motor, patch);
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.motorStarterCandidates.cases[0].candidate, null);
    const cable = proposal.cables.find(row => row.loadId === 'L-0');
    assert.equal(cable.protectiveDevice, null);
    assert.equal(proposal.status, 'blocked');
    assert.equal(proposal.studyValidation.status, 'pass', 'Unresolved protection does not prevent a supported operating study');
  }
});

test('changed rotor and proposed pickup are retained in inputs and invalidate generated evidence', () => {
  const input = fixture();
  const first = generateDesignProposal(input);
  input.criteria.motorStarter.instantaneousPickupA = 180;
  const changed = generateDesignProposal(input);
  assert.notEqual(changed.inputSignature, first.inputSignature);
  assert.notEqual(changed.motorStarterCandidates.inputFingerprint, first.motorStarterCandidates.inputFingerprint);
  assert.equal(changed.motorStarterCandidates.cases[0].candidate.branchCircuitBreaker.instantaneousPickupA, 180);
  assert.equal(changed.inputs.original.equipment[0].motor.rotorType, 'squirrel-cage');
  assert.equal(changed.inputs.original.criteria.motorStarter.instantaneousPickupA, 180);
  assert.equal(changed.status, 'blocked');
});

test('research protection does not weaken operating checks for ordinary circuits or disappear from study freshness', () => {
  const input = fixture();
  const proposal = generateDesignProposal(input);
  for (const cable of proposal.cables.filter(row => row.loadId && row.loadId !== 'L-0')) {
    assert.ok(cable.protectiveDevice, `${cable.id} still uses the ordinary catalog`);
    assert.ok(cable.protectiveDevice.continuousCurrentA <= cable.ampacityA);
  }
  const before = evaluateDesignSynthesisStudy(proposal, input.criteria);
  const ordinary = proposal.cables.find(row => row.loadId === 'L-1');
  ordinary.protectiveDevice = null;
  ordinary.branchProtectionMethod = 'inverse-time-breaker';
  ordinary.protectiveRequirement.status = 'motor-branch-breaker-research-unresolved';
  const changed = evaluateDesignSynthesisStudy(proposal, input.criteria);
  assert.equal(changed.status, 'fail', 'A method/status marker cannot exempt a nonmotor cable from its protection check');
  assert.notEqual(changed.modelInputFingerprint, before.modelInputFingerprint);
});

test('referenced operating current can advance the research breaker without changing motor design or nominal current', () => {
  for (const [operatingCurrentA, expected] of [[20, 25], [20.000001, 30], [24, 30], [24.000001, null]]) {
    const input = directInput();
    const snapshot = structuredClone(input);
    const result = evaluateMotorBranchBreakerCandidate({ ...input, operatingCurrentA, operatingCurrentReference: 'Independent synthetic operating-study current' });
    assert.equal(result.candidate?.branchCircuitBreaker.continuousCurrentA ?? null, expected);
    if (result.candidate) {
      assert.equal(result.candidate.sizing.operatingCurrentA, operatingCurrentA);
      assert.equal(result.candidate.sizing.designFullLoadCurrentA, 14);
      assert.ok(Math.abs(result.candidate.sizing.calculatedRunningCurrentA - 9000 / (Math.sqrt(3) * 480 * 0.86)) < 1e-12);
    }
    assert.deepEqual(input, snapshot);
  }
  for (const operating of [{ operatingCurrentA: 21 }, { operatingCurrentA: Infinity, operatingCurrentReference: 'Study' }, { operatingCurrentA: 21, operatingCurrentReference: ' ' }]) {
    const result = evaluateMotorBranchBreakerCandidate({ ...directInput(), ...operating });
    assert.equal(result.candidate, null);
    assertFiniteTree(result);
  }
});

test('a known undersized research breaker still fails operating current screening and triggers a fresh study result', () => {
  const input = fixture();
  const proposal = generateDesignProposal(input);
  const before = evaluateDesignSynthesisStudy(proposal, input.criteria);
  assert.equal(before.status, 'pass');
  const cable = proposal.cables.find(row => row.loadId === 'L-0');
  cable.protectiveDevice.continuousCurrentA = 1;
  cable.protectiveDevice.tripRatingA = 1;
  const changed = evaluateDesignSynthesisStudy(proposal, input.criteria);
  assert.equal(changed.status, 'fail');
  const circuit = changed.final.circuitResults.find(row => row.id === cable.id);
  assert.equal(circuit.conductorStatus, 'pass');
  assert.equal(circuit.operatingStatus, 'fail');
  assert.equal(circuit.protectionStatus, 'unevaluated', 'A failed continuous screen is distinct from full protection coordination');
  assert.notEqual(changed.modelInputFingerprint, before.modelInputFingerprint);
});

test('operating and starting revisions retain the same conservative breaker-current basis end to end', () => {
  const input = fixture();
  input.equipment[0].kw = 14.2;
  input.criteria.motorStarting.minimumVoltagePu = 0.98;
  const snapshot = structuredClone(input);
  const proposal = generateDesignProposal(input);
  const first = proposal.studyValidation.history[0].final.circuitResults.find(row => row.id === 'C-L-0');
  assert.ok(first.currentA > 20, 'Initial solved current exceeds the 25 A breaker / 125% policy threshold');
  assert.equal(first.protectiveContinuousA, 25);
  assert.equal(first.operatingStatus, 'fail');
  assert.ok(proposal.motorStartingValidation.history.some(row => row.status === 'fail'));
  const cable = proposal.cables.find(row => row.loadId === 'L-0');
  const candidate = proposal.motorStarterCandidates.cases[0].candidate;
  assert.equal(cable.protectiveDevice.catalogNumber, '3VA5130-6EC31-0AA0');
  assert.equal(candidate.branchCircuitBreaker.catalogNumber, cable.protectiveDevice.catalogNumber);
  assert.ok(cable.motor.branchBreakerOperatingCurrentA >= first.currentA);
  assert.equal(candidate.sizing.operatingCurrentA, cable.motor.branchBreakerOperatingCurrentA);
  assert.equal(proposal.studyValidation.status, 'pass');
  assert.equal(proposal.motorStartingValidation.status, 'pass');
  assert.ok(proposal.motorStartingValidation.cases[0].minimumVoltagePu >= 0.98);
  assert.equal(proposal.status, 'blocked');
  assert.deepEqual(input, snapshot, 'Revision does not relax starting criteria or rewrite nameplate/design inputs');
  assert.equal(proposal.motorBranchBreakerEvaluationResults, undefined, 'Internal evidence is not duplicated beside the published final cases');
});

test('a proposed TM230 pickup cannot be silently accepted for the manual-controller method', () => {
  for (const method of [undefined, 'manual-controller']) {
    const input = fixture();
    input.criteria.motorStarter.branchProtectionMethod = method;
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'blocked');
    assert.ok(proposal.issues.some(row => row.code === 'MISMATCHED_MOTOR_BRANCH_PICKUP_METHOD'));
    assert.equal(proposal.inputs.original.criteria.motorStarter.instantaneousPickupA, 150);
  }
});
