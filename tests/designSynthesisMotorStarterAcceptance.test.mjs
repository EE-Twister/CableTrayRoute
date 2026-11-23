import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { validateDesignSynthesisMotorInputs } from '../analysis/designSynthesisMotors.mjs';

function fixture(count = 25) {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const originals = input.equipment;
  input.equipment = Array.from({ length: count }, (_, index) => ({ ...originals[index % originals.length], id: `L-${index}`, tag: `L-${index}`, kw: 2 }));
  input.equipment[0] = { ...input.equipment[0], kw: 9, powerFactor: 0.86, duty: 'continuous', ratingsBasis: 'electrical-input-kW', motor: {
    ratedVoltageV: 460, fullLoadCurrentA: 14, fullLoadCurrentBasis: { reference: 'Synthetic design current for acceptance; no installed motor implied' },
    nameplateCurrentA: 12.8, nameplateHorsepower: 10, nameplateFrequencyHz: 60,
    lockedRotorCurrentA: 90, lockedRotorPowerFactor: 0.3, starterType: 'dol',
  } };
  input.supply.voltageSystem = { connection: 'wye', grounding: 'solid', lineToGroundVoltageV: 277, reference: 'Synthetic 480Y/277 V supply basis' };
  input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic source impedance within its 20 kA external bound' };
  input.criteria.motorStarting = { minimumVoltagePu: 0.8 };
  input.criteria.motorStarter = { controlVoltageV: 24, controlCurrentType: 'DC', enclosureMm: { height: 610, width: 305, depth: 205 } };
  return input;
}

function caseCheck(proposal, id, index = 0) {
  const item = proposal.motorStarterCandidates.cases[index];
  return (item.candidate || item.rejectedCandidate).checks.find(row => row.id === id);
}

test('25/50-load generation retains the exact researched assembly separately from the standalone overload and selected circuit breaker', () => {
  for (const count of [25, 50]) {
    const input = fixture(count);
    const snapshot = structuredClone(input);
    const proposal = generateDesignProposal(input);
    const candidate = proposal.motorStarterCandidates.cases[0].candidate;
    assert.deepEqual(input, snapshot);
    assert.equal(proposal.loads.length, count);
    assert.equal(proposal.studyValidation.status, 'pass');
    assert.equal(proposal.motorStartingValidation.status, 'pass');
    assert.equal(proposal.sourceFaultConsistency.status, 'pass');
    assert.equal(candidate.contactor.catalogNumber, '3RT2025-1BB40');
    assert.equal(candidate.overloadRelay.catalogNumber, '3RU2126-4AB0');
    assert.equal(candidate.shortCircuitController.catalogNumber, '3RV2021-4AA10');
    assert.equal(candidate.ulCombination.coordinationType, 'Type 1');
    assert.equal(candidate.ulCombination.shortCircuitCurrentKA, 65);
    assert.equal(candidate.relayDialSettingCandidateA, 12.8);
    assert.equal(candidate.relayPublishedNominalTripCurrentA, 16, '12.8 A dial × published 125% nominal calibration; not a clearing curve');
    assert.equal(candidate.shortCircuitControllerSettingA, null, '16 A certificate condition must not become an applied setting');
    assert.equal(proposal.motorOverloadCandidates.cases[0].candidate.catalogNumber, '3RU2116-4AB0');
    assert.notEqual(proposal.cables.find(row => row.loadId === 'L-0').protectiveDevice?.catalogNumber, candidate.shortCircuitController.catalogNumber);
    assert.equal(proposal.status, 'blocked');
    assert.equal(proposal.distributionBaseline, null);
    assert.equal(proposal.checks.find(row => row.id === 'motorStarterAssembly').status, 'fail');
    assert.equal(proposal.checks.find(row => row.id === 'motorProtection').status, 'fail');
    assert.equal(candidate.selectedForApply, false);
    for (const id of ['certifiedControllerCondition', 'enclosureOrientation', 'branchProtectionSelection', 'motorOverloadApplication', 'faultDutyAndCoordination', 'startingAndThermalWithstand']) {
      assert.equal(caseCheck(proposal, id).status, 'unevaluated');
    }
    assert.deepEqual(proposal.inputEvidence.records.supply.values.voltageSystem, { value: input.supply.voltageSystem, basis: 'provided' });
    proposal.inputEvidence.records.supply.values.voltageSystem.value.reference = 'changed exported evidence';
    assert.deepEqual(input, snapshot, 'Evidence must not mutate supplied records');
  }
});

test('motor assembly limits use nameplate hp and UL current, with exact inclusive boundaries', () => {
  for (const [nameplateCurrentA, nameplateHorsepower, eligible] of [[11, 10, true], [14, 10, true], [14.000001, 10, false], [10.999999, 10, false], [12.8, 10.000001, false]]) {
    const input = fixture();
    Object.assign(input.equipment[0].motor, { nameplateCurrentA, nameplateHorsepower });
    const proposal = generateDesignProposal(input);
    assert.equal(Boolean(proposal.motorStarterCandidates.cases[0].candidate), eligible, `${nameplateCurrentA} A, ${nameplateHorsepower} hp`);
    assert.equal(proposal.status, 'blocked');
  }
  const noHp = fixture();
  delete noHp.equipment[0].motor.nameplateHorsepower;
  const missing = generateDesignProposal(noHp);
  assert.equal(missing.motorStarterCandidates.cases[0].candidate, null);
  assert.equal(caseCheck(missing, 'ulHorsepower').status, 'fail');
  assert.equal(missing.motorStartingValidation.status, 'pass', 'Missing hp does not silently disable separately complete starting-voltage inputs');
  assert.equal(missing.motorStarterCandidates.cases[0].rejectedCandidate.sources[0].sha256, 'c55126215a47084e9d40a8f0e11589a083285798a294c2ff32ce1ef00e55d45d');
});

test('mixed 480/208 V motors do not borrow the primary source voltage, fault or grounding qualification', () => {
  const input = fixture(50);
  input.equipment[1] = { ...input.equipment[1], kw: 2, voltage: 208, duty: 'continuous', ratingsBasis: 'electrical-input-kW',
    motor: { ...structuredClone(input.equipment[0].motor), ratedVoltageV: 200, fullLoadCurrentA: 10, nameplateCurrentA: 9, nameplateHorsepower: 2, lockedRotorCurrentA: 60 } };
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.loads.length, 50);
  assert.ok(proposal.transformer);
  assert.equal(proposal.motorStarterCandidates.cases.length, 2);
  assert.ok(proposal.motorStarterCandidates.cases[0].candidate);
  assert.equal(proposal.motorStarterCandidates.cases[1].candidate, null);
  assert.equal(caseCheck(proposal, 'direct480VCircuit', 1).status, 'fail');
  assert.equal(caseCheck(proposal, 'conditionalShortCircuitRating', 1).status, 'unevaluated');
  assert.equal(proposal.status, 'blocked');
});

test('changed control, grounding and enclosure inputs invalidate identity and retain exact failed conditions', () => {
  const input = fixture();
  const first = generateDesignProposal(input);
  input.criteria.motorStarter.controlVoltageV = 120;
  input.criteria.motorStarter.controlCurrentType = 'AC';
  input.criteria.motorStarter.enclosureMm.depth = 204;
  input.supply.voltageSystem.grounding = 'resistance';
  const snapshot = structuredClone(input);
  const changed = generateDesignProposal(input);
  assert.notEqual(changed.inputSignature, first.inputSignature);
  assert.notEqual(changed.motorStarterCandidates.inputFingerprint, first.motorStarterCandidates.inputFingerprint);
  for (const id of ['controlSupply', 'minimumEnclosureDimensions', 'slashVoltageSystem']) assert.equal(caseCheck(changed, id).status, 'fail');
  assert.deepEqual(input, snapshot, 'No condition may be automatically rewritten to fit the catalog');
  assert.equal(changed.motorStarterCandidates.cases[0].candidate.selectedForApply, false);
  assert.equal(changed.status, 'blocked');
});

test('frequency inheritance is explicit while a missing motor nameplate frequency prevents the assembly candidate', () => {
  const input = fixture();
  input.supply.frequency = 60;
  const inherited = generateDesignProposal(input);
  assert.equal(caseCheck(inherited, 'threePhase60Hz').status, 'pass');
  assert.equal(inherited.motorStarterCandidates.cases[0].candidate.ulCombination.evaluatedNetworkFrequencyHz, 60);
  delete input.equipment[0].motor.nameplateFrequencyHz;
  const missing = generateDesignProposal(input);
  assert.equal(caseCheck(missing, 'motorNameplateFrequency').status, 'fail');
  assert.equal(missing.motorStarterCandidates.cases[0].candidate, null);
  assert.equal(missing.motorStartingValidation.status, 'pass');
});

test('a positive 50 Hz motor nameplate blocks generation before any passing 60 Hz starting claim', () => {
  const input = fixture();
  input.equipment[0].motor.nameplateFrequencyHz = 50;
  const validation = validateDesignSynthesisMotorInputs(input);
  assert.ok(validation.inputIssues.some(item => item.code === 'UNSUPPORTED_MOTOR_NAMEPLATE_FREQUENCY'));
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(item => item.code === 'UNSUPPORTED_MOTOR_NAMEPLATE_FREQUENCY'));
  assert.notEqual(proposal.motorStartingValidation?.status, 'pass');
});

test('source consistency cannot be cleared by the combination conditional rating comparison', () => {
  const input = fixture();
  input.supply.availableFaultCurrentKA = 10;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.sourceFaultConsistency.status, 'blocked');
  assert.equal(proposal.motorStartingValidation.status, 'blocked');
  assert.equal(caseCheck(proposal, 'conditionalShortCircuitRating').status, 'pass', 'Only comparison with the declared external-source bound; full duty check is separate');
  assert.equal(caseCheck(proposal, 'faultDutyAndCoordination').status, 'unevaluated');
  assert.equal(proposal.checks.find(row => row.id === 'sourceFaultConsistency').status, 'fail');
  assert.equal(proposal.status, 'blocked');
});

test('malformed and unknown assembly input fields block before becoming design assumptions', () => {
  const edits = [
    input => { input.equipment[0].motor.nameplateHorsepower = '10'; },
    input => { input.equipment[0].motor.nameplateFrequencyHz = 0; },
    input => { input.supply.voltageSystem.lineToGroundVoltageV = Infinity; },
    input => { input.supply.voltageSystem.grounding = 'unknown'; },
    input => { input.supply.voltageSystem.unused = true; },
    input => { input.criteria.motorStarter.controlVolts = 24; },
    input => { input.criteria.motorStarter.controlCurrentType = 'dc'; },
    input => { input.criteria.motorStarter.enclosureMm.depth = -1; },
    input => { input.criteria.motorStarter.enclosureMm.units = 'in'; },
  ];
  for (const edit of edits) {
    const input = fixture(); edit(input);
    const validation = validateDesignSynthesisMotorInputs(input);
    assert.equal(validation.ok, false);
    assert.ok(validation.inputIssues.length);
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'blocked');
    assert.ok(proposal.issues.some(row => row.severity === 'blocking'));
  }
});

test('nonmotor proposals retain their existing workflow without starter data or candidate output', () => {
  const input = fixture();
  delete input.equipment[0].motor;
  delete input.supply.voltageSystem;
  delete input.supply.motorStartingImpedance;
  delete input.criteria.motorStarting;
  delete input.criteria.motorStarter;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  assert.equal(proposal.motorStarterCandidates, undefined);
  assert.equal(proposal.checks.some(row => row.id === 'motorStarterAssembly'), false);
});
