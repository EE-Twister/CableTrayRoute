import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { validateDesignSynthesisMotorInputs } from '../analysis/designSynthesisMotors.mjs';

const sample = () => JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
const motorRecord = {
  id: 'MOTOR-TEST', tag: 'MOTOR-TEST', type: 'motor', kw: 30, ratingsBasis: 'electrical-input-kW', voltage: 480, phases: 3,
  powerFactor: 0.9, duty: 'continuous', x: 100, y: -20, z: 0,
  motor: {
    ratedVoltageV: 460, fullLoadCurrentA: 48, fullLoadCurrentBasis: { reference: 'Synthetic design-current fixture', label: '48 A test input; no manufacturer motor selected' },
    nameplateCurrentA: 42, lockedRotorCurrentA: 288, lockedRotorPowerFactor: 0.25, starterType: 'dol',
  },
};

test('motor validation requires complete explicit ratings without conflating network and motor voltage', () => {
  const input = { equipment: [motorRecord], supply: { motorStartingImpedance: { rOhm: 0.002, xOhm: 0.01, reference: 'source study' } }, criteria: { motorStarting: { minimumVoltagePu: 0.7 } } };
  const result = validateDesignSynthesisMotorInputs(input);
  assert.equal(result.ok, true);
  assert.equal(result.motors[0].designAmpacityA, 60);
  assert.equal(result.motors[0].runningCurrentA, motorRecord.kw * 1000 / (Math.sqrt(3) * 480 * 0.9));
  const missing = validateDesignSynthesisMotorInputs({ equipment: [{ ...motorRecord, motor: undefined }] });
  assert.equal(missing.ok, false);
  assert.ok(missing.inputIssues.some(item => item.code === 'MOTOR_DATA_REQUIRED'));
});

test('motor branch and feeder conductors include 125 percent of referenced design FLC and the proposal retains all motor bases', () => {
  const input = sample();
  input.equipment = [motorRecord];
  input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic source study within the 20 kA fault bound' };
  input.criteria.motorStarting = { minimumVoltagePu: 0.7 };
  const proposal = generateDesignProposal(input);
  const load = proposal.loads.find(item => item.id === motorRecord.id);
  const branch = proposal.cables.find(item => item.loadId === motorRecord.id);
  const oneLineMotor = proposal.oneLine.sheets[0].components.find(item => item.id === motorRecord.id);
  assert.equal(proposal.status, 'blocked', 'motor protection remains unresolved for apply');
  assert.equal(proposal.studyValidation.status, 'pass', 'the operating study still runs before motor protection blocks apply');
  assert.ok(branch.ampacityA >= 60);
  assert.equal(branch.currentA, load.currentA, 'running current remains derived from electrical-input kW');
  assert.equal(branch.designCurrentA, 48);
  assert.equal(branch.motor.fullLoadCurrentBasis.reference, 'Synthetic design-current fixture');
  assert.equal(load.motor.nameplateCurrentA, 42);
  assert.equal(oneLineMotor.physical.motor.ratedVoltageV, 460, 'motor nameplate voltage is retained separately from 480 V operating voltage');
  assert.equal(proposal.motorStartingValidation.cases[0].motorId, motorRecord.id);
  assert.equal(proposal.checks.find(item => item.id === 'motorProtection').status, 'fail');
  const relay = proposal.motorOverloadCandidates.cases[0].candidate;
  assert.equal(relay.catalogNumber, '3RU2136-4GB0', '42 A nameplate uses the 36–45 A relay, not the 48 A design-current range');
  assert.equal(relay.dialSettingA, 42);
  assert.equal(relay.tripClass, '10');
  assert.equal(proposal.motorOverloadCandidates.status, 'screening_only');
  assert.ok(relay.unresolved.some(item => /assembly/.test(item)));
  assert.ok(proposal.issues.some(item => item.code === 'MOTOR_PROTECTION_UNRESOLVED'));
});

test('generated overload range candidates follow changed nameplate data without clearing unresolved motor protection', () => {
  const input = sample();
  input.equipment = input.equipment.slice(0, 25).map(row => ({ ...row, kw: 2 }));
  input.equipment[0] = { ...input.equipment[0], kw: 30, ratingsBasis: 'electrical-input-kW', duty: 'continuous', powerFactor: 0.9,
    motor: structuredClone(motorRecord.motor) };
  input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic source study within the 20 kA fault bound' };
  input.criteria.motorStarting = { minimumVoltagePu: 0.8 };
  const before = structuredClone(input);
  const first = generateDesignProposal(input);
  assert.equal(first.loads.length, 25);
  assert.equal(first.motorOverloadCandidates.cases[0].candidate.catalogNumber, '3RU2136-4GB0');
  assert.deepEqual(input, before);
  input.equipment[0].motor.nameplateCurrentA = 60;
  const changed = generateDesignProposal(input);
  assert.equal(changed.motorOverloadCandidates.cases[0].candidate.catalogNumber, '3RU2136-4JB0');
  assert.equal(changed.motorOverloadCandidates.cases[0].candidate.dialSettingA, 60);
  assert.notEqual(changed.inputSignature, first.inputSignature);
  assert.equal(changed.status, 'blocked');
  assert.equal(changed.checks.find(item => item.id === 'motorProtection').status, 'fail');
  assert.equal(changed.distributionBaseline, null);
  input.equipment[0].motor.nameplateCurrentA = 200;
  const unsupported = generateDesignProposal(input);
  assert.equal(unsupported.motorOverloadCandidates.status, 'blocked');
  assert.equal(unsupported.motorOverloadCandidates.cases[0].candidate, null);
  assert.ok(unsupported.issues.some(item => item.code === 'MOTOR_NAMEPLATE_CURRENT_OUTSIDE_CATALOG'));
  assert.equal(unsupported.status, 'blocked');
});

test('each unsupported motor retains its own overload diagnostic in 25 and 50 load designs', () => {
  for (const count of [25, 50]) {
    const input = sample();
    const rows = input.equipment;
    input.equipment = Array.from({ length: count }, (_, index) => ({ ...rows[index % rows.length], id: `LOAD-${index}`, tag: `LOAD-${index}`, kw: 2 }));
    for (const index of [1, 3]) {
      input.equipment[index] = { ...input.equipment[index], kw: 9, powerFactor: 0.86, duty: 'continuous', ratingsBasis: 'electrical-input-kW',
        motor: { ...structuredClone(motorRecord.motor), fullLoadCurrentA: 14, nameplateCurrentA: 200, lockedRotorCurrentA: 90, lockedRotorPowerFactor: 0.3 } };
    }
    input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic source impedance within 20 kA fault bound' };
    input.criteria.motorStarting = { minimumVoltagePu: 0.8 };
    const proposal = generateDesignProposal(input);
    const diagnostics = proposal.issues.filter(row => row.code === 'MOTOR_NAMEPLATE_CURRENT_OUTSIDE_CATALOG');
    assert.deepEqual(diagnostics.map(row => row.path), ['equipment[1].motor', 'equipment[3].motor']);
    for (const index of [1, 3]) {
      const row = proposal.loadDispositions.find(item => item.inputIndex === index);
      assert.equal(row.status, 'rejected');
      assert.ok(row.issues.some(item => item.code === 'MOTOR_NAMEPLATE_CURRENT_OUTSIDE_CATALOG'));
    }
    assert.equal(proposal.status, 'blocked');
    assert.ok(proposal.globalBlockingIssues.some(item => item.code === 'MOTOR_PROTECTION_UNRESOLVED'));
  }
});

test('motor starters and unexpected motor fields are rejected explicitly', () => {
  const result = validateDesignSynthesisMotorInputs({ equipment: [{ ...motorRecord, motor: { ...motorRecord.motor, starterType: 'vfd', madeUpField: 1 } }] });
  assert.ok(result.inputIssues.some(item => item.code === 'UNSUPPORTED_MOTOR_STARTER'));
  assert.ok(result.inputIssues.some(item => item.code === 'UNKNOWN_MOTOR_FIELD'));
  for (const type of ['motor_controller', 'motor_starter', 'vfd', 'soft_starter']) {
    const classified = validateDesignSynthesisMotorInputs({ equipment: [{ ...motorRecord, type, motor: undefined }] });
    assert.ok(classified.inputIssues.some(item => item.code === 'MOTOR_DATA_REQUIRED'));
  }
  const contradictory = validateDesignSynthesisMotorInputs({ equipment: [{ ...motorRecord, type: 'vfd' }] });
  assert.ok(contradictory.inputIssues.some(item => item.code === 'UNSUPPORTED_MOTOR_STARTER'));
  const unknownCriterion = validateDesignSynthesisMotorInputs({ equipment: [], criteria: { motorStarting: { minimumVoltagePu: 0.8, inventedLimit: 100 } } });
  assert.ok(unknownCriterion.inputIssues.some(item => item.code === 'UNKNOWN_MOTOR_STARTING_CRITERION'));
});

test('motor indicators in imported rows cannot bypass motor validation through formatting or alternate fields', () => {
  const indicators = [
    ['type', ' Motor '], ['subtype', ' MOTOR-LOAD '], ['category', 'motor controller'],
    ['subCategory', 'Motor Starter'], ['loadType', 'motor'], ['mccUnitType', ' VFD '],
    ['type', 'soft starter'], ['motorNameplateCurrentA', 12.5], ['motorDataReference', 'Manufacturer motor nameplate'], ['starterType', 'dol'],
  ];
  for (const [field, value] of indicators) {
    const input = sample();
    input.equipment[0][field] = value;
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'blocked', `${field}=${value} must not generate an eligible nonmotor proposal`);
    assert.ok(proposal.issues.some(item => item.code === 'MOTOR_DATA_REQUIRED'), `${field}=${value} must require explicit motor data`);
    assert.ok(proposal.distributionBaseline == null);
  }
  const emptyReference = sample();
  emptyReference.equipment[0].motorDataReference = '  ';
  assert.equal(generateDesignProposal(emptyReference).status, 'proposal', 'blank reference alone is not a motor indicator');
  for (const [field, value] of [['type', ' VFD '], ['subtype', 'soft starter'], ['loadType', 'Soft-Starter'], ['starterType', 'vfd'], ['motorStarterType', 'VFD']]) {
    const record = { ...structuredClone(motorRecord), [field]: value };
    const validation = validateDesignSynthesisMotorInputs({ equipment: [record] });
    assert.ok(validation.inputIssues.some(item => item.code === 'UNSUPPORTED_MOTOR_STARTER'), `${field}=${value} cannot use the DOL model`);
  }
  for (const count of [25, 50]) {
    const input = sample();
    const rows = input.equipment;
    input.equipment = Array.from({ length: count }, (_, index) => ({ ...rows[index % rows.length], id: `L-${index}`, tag: `L-${index}`, kw: 2 }));
    input.equipment[count - 1].type = ' Motor ';
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'blocked');
    assert.ok(proposal.issues.some(item => item.code === 'MOTOR_DATA_REQUIRED' && item.path === `equipment[${count - 1}].motor`));
  }
});

test('generated motor proposals retain contradictory source evidence without repairing ratings or clearing Apply', () => {
  const input = sample();
  input.equipment = input.equipment.slice(0, 25).map(row => ({ ...row, kw: 2 }));
  input.equipment[0] = { ...input.equipment[0], ratingsBasis: 'electrical-input-kW', duty: 'continuous', powerFactor: 0.9, motor: structuredClone(motorRecord.motor) };
  input.supply.motorStartingImpedance = { rOhm: 0.003, xOhm: 0.006, reference: 'Deliberately contradictory synthetic source' };
  input.criteria.motorStarting = { minimumVoltagePu: 0.8 };
  const before = structuredClone(input);
  const design = generateDesignProposal(input);
  assert.equal(design.loads.length, 25);
  assert.equal(design.loadDispositions.length, 25);
  assert.equal(design.sourceFaultConsistency.status, 'blocked');
  assert.equal(design.sourceFaultConsistency.declaredAvailableFaultCurrentKA, 20);
  assert.ok(design.sourceFaultConsistency.impliedSourceOnlyFaultCurrentKA > 41);
  assert.equal(design.motorStartingValidation.status, 'blocked');
  assert.equal(design.motorStartingValidation.cases.length, 0);
  assert.equal(design.checks.find(item => item.id === 'sourceFaultConsistency').status, 'fail');
  assert.equal(design.status, 'blocked');
  assert.equal(design.distributionBaseline, null);
  assert.ok(design.issues.some(item => item.code === 'SOURCE_FAULT_BOUND_INCONSISTENT'));
  assert.deepEqual(input, before);
  input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Consistent synthetic replacement supplied by the test, not an automatic repair' };
  input.criteria.misspelledCriterion = 1;
  const unrelatedInputFailure = generateDesignProposal(input);
  assert.equal(unrelatedInputFailure.status, 'blocked');
  assert.equal(unrelatedInputFailure.sourceFaultConsistency.status, 'pass');
  assert.equal(unrelatedInputFailure.checks.find(item => item.id === 'sourceFaultConsistency').status, 'pass');
});
