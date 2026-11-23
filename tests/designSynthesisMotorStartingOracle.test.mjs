import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { evaluateDesignSynthesisStudy } from '../analysis/designSynthesisStudy.mjs';
import { buildDesignSynthesisOneLine } from '../analysis/designSynthesisOneLine.mjs';
import { evaluateDesignSynthesisMotorStarting } from '../analysis/designSynthesisMotorStarting.mjs';
import { magnitude, physicalStart } from './helpers/motorNetworkOracle.mjs';

const near = (actual, expected, tolerance, label) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} versus ${expected}`);
const motor = {
  ratedVoltageV: 460, fullLoadCurrentA: 14,
  fullLoadCurrentBasis: { reference: 'Synthetic test current basis; not a selected manufacturer motor.' },
  nameplateCurrentA: 12.8, lockedRotorCurrentA: 90,
  lockedRotorPowerFactor: 0.3, starterType: 'dol',
};

function proposal() {
  const supply = { id: 'S', type: 'source', voltage: 480, phases: 3, capacityKva: 1000, availableFaultCurrentKA: 20,
    motorStartingImpedance: { rOhm: 0.03, xOhm: 0.06, reference: 'Synthetic positive-sequence source phase ohms at 480 V.' } };
  const load = { id: 'M', tag: 'M', type: 'load', kw: 8, voltage: 480, phases: 3, powerFactor: 0.86, duty: 'continuous', motor: structuredClone(motor) };
  const cable = { id: 'C', tag: 'C', from: 'S', to: 'M', loadId: 'M', conductor_size: '#8 AWG',
    lengthFt: 100, length: 100, r_ohm_per_kft: 0.2, x_ohm_per_kft: 0.4, ampacityA: 100,
    impedance: { r: 0.02, x: 0.04 }, phases: 3, voltage: 480 };
  const value = { equipment: [supply, load], loads: [load], cables: [cable], inputs: { supply } };
  value.oneLine = buildDesignSynthesisOneLine({ supply, loads: [load], cables: [cable] });
  return value;
}

// Independently solve the complex voltage divider, not a power-flow model.
// R + jX motor impedance follows its declared rated-voltage locked-rotor point.
function divider(ratedV, lockedA, pf, sourceR = 0.03, sourceX = 0.06, cableR = 0.02, cableX = 0.04) {
  const zMotor = ratedV / (Math.sqrt(3) * lockedA);
  const rMotor = zMotor * pf;
  const xMotor = zMotor * Math.sqrt(1 - pf ** 2);
  const totalR = sourceR + cableR + rMotor;
  const totalX = sourceX + cableX + xMotor;
  const amps = (480 / Math.sqrt(3)) / Math.hypot(totalR, totalX);
  return { motorPu: amps * zMotor / (480 / Math.sqrt(3)), amps,
    sourcePu: amps * Math.hypot(cableR + rMotor, cableX + xMotor) / (480 / Math.sqrt(3)) };
}

test('DOL network screen agrees with an independent complex divider on both voltage bases', () => {
  for (const ratedV of [460, 480]) {
    const input = proposal();
    input.loads[0].motor.ratedVoltageV = ratedV;
    const snapshot = structuredClone(input);
    const expected = divider(ratedV, 90, 0.3);
    const result = evaluateDesignSynthesisMotorStarting(input, { motorStarting: { minimumVoltagePu: 0.8 } });
    assert.equal(result.status, 'pass', JSON.stringify(result));
    assert.equal(result.cases.length, 1);
    const actual = result.cases[0];
    near(actual.motorVoltagePu, expected.motorPu, 1e-5, 'motor voltage relative to network nominal');
    near(actual.motorCurrentA, expected.amps, 0.02, 'voltage-dependent locked-rotor amps');
    near(actual.buses.find(bus => bus.id === 'S').voltagePu, expected.sourcePu, 1e-5, 'upstream source terminal depression');
    assert.deepEqual(input, snapshot, 'A starting case must not overwrite running load or canonical connectivity');
  }
});

test('starting PF and source R/X affect the result rather than a scalar impedance-magnitude sag', () => {
  const values = [];
  for (const pf of [0.2, 0.9]) {
    const input = proposal(); input.loads[0].motor.lockedRotorPowerFactor = pf;
    const result = evaluateDesignSynthesisMotorStarting(input, { motorStarting: { minimumVoltagePu: 0.8 } });
    const expected = divider(460, 90, pf);
    near(result.cases[0].motorVoltagePu, expected.motorPu, 1e-5, 'complex PF-dependent voltage');
    values.push(result.cases[0].motorVoltagePu);
  }
  assert.ok(Math.abs(values[0] - values[1]) > 0.005);
});

test('a higher minimum voltage fails without rewriting criteria and evidence changes with starting inputs', () => {
  const input = proposal();
  const criteria = { motorStarting: { minimumVoltagePu: 0.99 } };
  const result = evaluateDesignSynthesisMotorStarting(input, criteria);
  assert.equal(result.status, 'fail');
  assert.equal(criteria.motorStarting.minimumVoltagePu, 0.99);
  for (const mutate of [
    value => { value.loads[0].motor.lockedRotorCurrentA = 120; },
    value => { value.loads[0].motor.lockedRotorPowerFactor = 0.5; },
    value => { value.equipment[0].motorStartingImpedance.reference = 'Changed source record'; },
    value => { value.equipment[0].motorStartingImpedance.xOhm = 0.09; },
  ]) {
    const changed = structuredClone(input); mutate(changed);
    const next = evaluateDesignSynthesisMotorStarting(changed, criteria);
    assert.notEqual(next.modelInputFingerprint, result.modelInputFingerprint);
  }
});

test('direct starting validates every supplied 60 Hz basis at each boundary and fingerprints source/load aliases', () => {
  const mutations = [
    ['source equipment frequencyHz', (input, criteria) => { input.equipment[0].frequencyHz = 50; }],
    ['source equipment frequency alias', (input, criteria) => { input.equipment[0].frequency = 50; }],
    ['proposal input supply', (input, criteria) => { input.inputs.supply = { ...input.inputs.supply, frequencyHz: 50 }; }],
    ['criteria frequencyHz', (input, criteria) => { criteria.frequencyHz = 50; }],
    ['criteria frequency alias', (input, criteria) => { criteria.frequency = 50; }],
    ['canonical load frequencyHz', (input, criteria) => { input.loads[0].frequencyHz = 50; }],
    ['canonical load frequency alias', (input, criteria) => { input.loads[0].frequency = 50; }],
    ['one-line source component', (input, criteria) => { input.oneLine.sheets[0].components.find(row => row.id === 'S').frequencyHz = 50; }],
    ['one-line load component', (input, criteria) => { input.oneLine.sheets[0].components.find(row => row.id === 'M').frequency = 50; }],
    ['one-line physical load component', (input, criteria) => { input.oneLine.sheets[0].components.find(row => row.id === 'M').physical.frequencyHz = 50; }],
    ['motor nameplate frequency', (input, criteria) => { input.loads[0].motor.nameplateFrequencyHz = 50; }],
  ];
  for (const [label, mutate] of mutations) {
    const input = proposal(); const criteria = { motorStarting: { minimumVoltagePu: 0.8 } };
    mutate(input, criteria);
    const result = evaluateDesignSynthesisMotorStarting(input, criteria);
    assert.equal(result.status, 'blocked', `${label}: ${JSON.stringify(result)}`);
    assert.equal(result.cases.length, 0, `${label} must block before producing cases`);
    assert.ok(result.issues.some(item => item.code.startsWith('UNSUPPORTED_MOTOR_') || item.code === 'CONFLICTING_MOTOR_START_FREQUENCY_ALIASES'), label);
  }

  const contradictory = proposal();
  contradictory.equipment[0].frequencyHz = 60;
  contradictory.equipment[0].frequency = 50;
  const conflicting = evaluateDesignSynthesisMotorStarting(contradictory, { motorStarting: { minimumVoltagePu: 0.8 } });
  assert.equal(conflicting.status, 'blocked');
  assert.equal(conflicting.cases.length, 0);
  assert.ok(conflicting.issues.some(item => item.code === 'CONFLICTING_MOTOR_START_FREQUENCY_ALIASES'));

  for (const malformed of [null, '60', NaN]) {
    const input = proposal();
    input.loads[0].motor.nameplateFrequencyHz = malformed;
    const result = evaluateDesignSynthesisMotorStarting(input, { motorStarting: { minimumVoltagePu: 0.8 } });
    assert.equal(result.status, 'blocked', `nameplate ${String(malformed)}`);
    assert.equal(result.cases.length, 0);
    assert.ok(result.issues.some(item => item.code === 'UNSUPPORTED_MOTOR_NAMEPLATE_FREQUENCY'));
  }
  for (const malformed of [null, '60', NaN]) {
    const input = proposal();
    input.loads[0].frequencyHz = malformed;
    const result = evaluateDesignSynthesisMotorStarting(input, { motorStarting: { minimumVoltagePu: 0.8 } });
    assert.equal(result.status, 'blocked', `load alias ${String(malformed)}`);
    assert.equal(result.cases.length, 0);
    assert.ok(result.issues.some(item => item.code === 'UNSUPPORTED_MOTOR_START_FREQUENCY'));
  }

  const base = proposal();
  const criteria = { motorStarting: { minimumVoltagePu: 0.8 } };
  const original = evaluateDesignSynthesisMotorStarting(base, criteria);
  assert.equal(original.status, 'pass', 'Omitted frequency fields retain the legacy 60 Hz model behavior');
  assert.ok(original.limitations.some(item => item.includes('legacy 60 Hz basis when frequency fields are omitted')));
  const undefinedNameplateFrequency = proposal();
  undefinedNameplateFrequency.loads[0].motor.nameplateFrequencyHz = undefined;
  const undefinedResult = evaluateDesignSynthesisMotorStarting(undefinedNameplateFrequency, criteria);
  assert.equal(undefinedResult.status, 'pass', 'An explicitly undefined optional nameplate frequency behaves like omission');
  const frequencyChanges = [
    input => { input.equipment[0].frequencyHz = 60; },
    input => { input.equipment[0].frequency = 60; },
    input => { input.inputs.supply = { ...input.inputs.supply, frequencyHz: 60 }; },
    input => { input.loads[0].frequencyHz = 60; },
    input => { input.loads[0].frequency = 60; },
    input => { input.oneLine.sheets[0].components.find(row => row.id === 'S').frequencyHz = 60; },
    input => { input.oneLine.sheets[0].components.find(row => row.id === 'M').frequency = 60; },
  ];
  for (const mutate of frequencyChanges) {
    const changed = structuredClone(base); mutate(changed);
    const result = evaluateDesignSynthesisMotorStarting(changed, criteria);
    assert.equal(result.status, 'pass', JSON.stringify(result));
    assert.notEqual(result.modelInputFingerprint, original.modelInputFingerprint, 'Supplied source/load frequency bases invalidate prior evidence');
  }
});

test('missing electrical inputs or incomplete topology cannot become a passing screen', () => {
  for (const mutate of [
    value => { delete value.equipment[0].motorStartingImpedance; delete value.inputs.supply.motorStartingImpedance; },
    value => { value.loads[0].motor.lockedRotorCurrentA = NaN; },
    value => { value.loads[0].motor.lockedRotorPowerFactor = 0; },
    value => { value.oneLine.sheets[0].components = value.oneLine.sheets[0].components.filter(row => row.id !== 'M'); },
    value => { value.loads.push({ ...value.loads[0], id: 'UNMODELED' }); },
  ]) {
    const input = proposal(); mutate(input);
    const result = evaluateDesignSynthesisMotorStarting(input, { motorStarting: { minimumVoltagePu: 0.8 } });
    assert.equal(result.status, 'blocked', JSON.stringify(result));
  }
});

test('direct starting cannot bypass a contradictory or missing source fault bound', () => {
  const input = proposal();
  input.equipment[0].motorStartingImpedance = { rOhm: 0.006, xOhm: 0.008, reference: 'Synthetic 3-4-5 impedance triangle at 480 V' };
  const before = structuredClone(input);
  const blocked = evaluateDesignSynthesisMotorStarting(input, { motorStarting: { minimumVoltagePu: 0.8 } });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.cases.length, 0);
  near(blocked.sourceFaultConsistency.impliedSourceOnlyFaultCurrentKA, 27.712812921102035, 1e-10, 'independent source-only 3-4-5 current in kA');
  assert.equal(blocked.sourceFaultConsistency.declaredAvailableFaultCurrentKA, 20);
  assert.ok(blocked.issues.some(item => item.code === 'SOURCE_FAULT_BOUND_INCONSISTENT'));
  assert.deepEqual(input, before);
  input.equipment[0].availableFaultCurrentKA = 30;
  const passing = evaluateDesignSynthesisMotorStarting(input, { motorStarting: { minimumVoltagePu: 0.8 } });
  assert.equal(passing.status, 'pass', JSON.stringify(passing));
  assert.notEqual(passing.modelInputFingerprint, blocked.modelInputFingerprint, 'Fault-bound changes invalidate starting evidence');
  delete input.equipment[0].availableFaultCurrentKA;
  const missing = evaluateDesignSynthesisMotorStarting(input, { motorStarting: { minimumVoltagePu: 0.8 } });
  assert.equal(missing.status, 'blocked');
  assert.equal(missing.cases.length, 0);
  assert.ok(missing.issues.some(item => item.code === 'SOURCE_FAULT_BOUND_REQUIRED'));
});

test('source fault consistency follows the exact source voltage used by the one-line solver', () => {
  const input = proposal();
  const sourceComponent = input.oneLine.sheets[0].components.find(item => item.id === 'S');
  sourceComponent.voltage = 208;
  const mismatch = evaluateDesignSynthesisMotorStarting(input, { motorStarting: { minimumVoltagePu: 0.8 } });
  assert.equal(mismatch.status, 'blocked');
  assert.equal(mismatch.sourceFaultConsistency.status, 'blocked');
  assert.ok(mismatch.issues.some(item => item.code === 'SOURCE_FAULT_MODEL_SOURCE_MISMATCH'));
  assert.equal(mismatch.cases.length, 0);
});


for (const count of [25, 50]) {
  test(`${count} mixed-voltage loads retain running demand during a generated motor start`, () => {
    const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
    const original = input.equipment;
    input.equipment = Array.from({ length: count }, (_, index) => ({ ...original[index % original.length], id: `L${index}`, tag: `L${index}`,
      kw: index < count * 0.8 ? 1 : 3, voltage: index < count * 0.8 ? 208 : 480, powerFactor: 0.9, duty: 'continuous' }));
    input.equipment[0] = { ...input.equipment[0], kw: 8, ratingsBasis: 'electrical-input-kW', motor: { ...motor, ratedVoltageV: 208, fullLoadCurrentA: 35, nameplateCurrentA: 28, lockedRotorCurrentA: 180 } };
    input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic known source for independent starting fixture; within the 20 kA external source bound.' };
    input.criteria.motorStarting = { minimumVoltagePu: 0.8 };
    const before = structuredClone(input);
    const design = generateDesignProposal(input);
    assert.equal(design.loads.length, count, JSON.stringify(design.issues));
    assert.ok(design.transformer, 'Mixed voltage must include its transformer during motor start');
    const result = evaluateDesignSynthesisMotorStarting(design, input.criteria);
    assert.ok(['pass', 'fail'].includes(result.status), JSON.stringify(result));
    assert.equal(result.cases[0].converged, true, 'Numeric agreement alone cannot substitute for a converged starting study');
    const expected = physicalStart(input, design, 'L0');
    for (const bus of result.cases[0].buses) near(bus.voltagePu, magnitude(expected.volts.get(bus.id)) * Math.sqrt(3) / expected.nodes.get(bus.id).voltage, 1e-5, `${count} ${bus.id}`);
    for (const circuit of result.cases[0].circuits.filter(row => expected.currents.has(row.id))) near(circuit.toCurrentA, magnitude(expected.currents.get(circuit.id)), 0.05, `${count} ${circuit.id} receiving amps`);
    assert.deepEqual(input, before);
    const branch = design.cables.find(row => row.loadId === 'L0');
    assert.ok(branch.ampacityA >= 43.75, 'Motor table/design current floor controls conductor ampacity');
    assert.equal(design.status, 'blocked', 'Voltage success does not resolve motor overload and coordination requirements');
    if (count === 50) {
      const bounded = structuredClone(input);
      bounded.criteria.loadFlow = { maxRevisions: 1 };
      bounded.criteria.motorStarting.minimumVoltagePu = 0.97;
      const exhausted = generateDesignProposal(bounded);
      assert.equal(exhausted.studyValidation.status, 'pass');
      assert.equal(exhausted.studyValidation.history.at(-1).revision, 1);
      assert.equal(exhausted.motorStartingValidation.status, 'fail');
      assert.equal(exhausted.motorStartingValidation.history.length, 1, 'Operating revision already consumed the single shared trial');
      assert.equal(exhausted.motorStartingValidation.stopReason, 'revision-budget-exhausted');
      assert.equal(exhausted.inputs.criteria.motorStarting.minimumVoltagePu, 0.97);
    }
  });
}

test('a stricter starting criterion revises real conductors under the original shared budget', () => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  input.equipment = input.equipment.slice(0, 25).map(row => ({ ...row, kw: 2 }));
  input.equipment[0] = { ...input.equipment[0], kw: 30, ratingsBasis: 'electrical-input-kW', duty: 'continuous', powerFactor: 0.9,
    motor: { ...motor, fullLoadCurrentA: 60, nameplateCurrentA: 48, lockedRotorCurrentA: 300 } };
  input.supply.motorStartingImpedance = { rOhm: 0.002, xOhm: 0.014, reference: 'Synthetic 19.595918 kA source, within the 20 kA external source bound.' };
  input.criteria.motorStarting = { minimumVoltagePu: 0.97 };
  input.criteria.loadFlow = { maxRevisions: 0 };
  const initial = generateDesignProposal(input);
  assert.equal(initial.motorStartingValidation.status, 'fail');
  assert.equal(initial.motorStartingValidation.stopReason, 'revision-budget-exhausted');
  assert.equal(initial.motorStartingValidation.history.length, 1);
  const initialBranch = initial.cables.find(cable => cable.loadId === input.equipment[0].id);
  input.criteria.loadFlow.maxRevisions = 12;
  const before = structuredClone(input);
  const final = generateDesignProposal(input);
  const start = final.motorStartingValidation;
  assert.equal(start.status, 'pass', JSON.stringify(final.issues));
  assert.equal(final.studyValidation.status, 'pass');
  assert.ok(start.history.length > 1 && start.history.at(-1).revision <= 12);
  assert.notEqual(final.cables.find(cable => cable.loadId === input.equipment[0].id).conductor_size, initialBranch.conductor_size);
  const expected = physicalStart(input, final, input.equipment[0].id);
  for (const bus of start.cases[0].buses) near(bus.voltagePu, magnitude(expected.volts.get(bus.id)) * Math.sqrt(3) / expected.nodes.get(bus.id).voltage, 1e-5, `revised ${bus.id}`);
  assert.deepEqual(input, before, 'Ratings, locations, corridors and voltage criteria must not be changed to pass');
  assert.deepEqual(final.loads[0].motor, input.equipment[0].motor, 'Computed statuses must not overwrite declarative motor inputs');
  assert.equal(start.modelInputFingerprint, evaluateDesignSynthesisMotorStarting(final, input.criteria).modelInputFingerprint, 'Published evidence must be fresh immediately after generation');
  assert.equal(final.status, 'blocked');
  assert.equal(final.summary.generatedLoadCount, 0);
  assert.equal(final.distributionBaseline, null);
  assert.ok(final.issues.some(item => item.code === 'MOTOR_PROTECTION_UNRESOLVED'));
  const weakerInput = structuredClone(input);
  weakerInput.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic weaker 17.153801 kA source within the same 20 kA external bound.' };
  const weakerBefore = structuredClone(weakerInput);
  const weaker = generateDesignProposal(weakerInput);
  assert.equal(weaker.sourceFaultConsistency.status, 'pass');
  assert.equal(weaker.motorStartingValidation.status, 'fail', 'A source-consistent design still fails when the fixed voltage criterion cannot be achieved');
  assert.equal(weaker.motorStartingValidation.stopReason, 'revision-budget-exhausted');
  assert.equal(weaker.motorStartingValidation.history.at(-1).revision, 12);
  assert.equal(weakerInput.criteria.motorStarting.minimumVoltagePu, 0.97);
  assert.deepEqual(weakerInput, weakerBefore);
  const weakExpected = physicalStart(weakerInput, weaker, weakerInput.equipment[0].id);
  for (const bus of weaker.motorStartingValidation.cases[0].buses) near(bus.voltagePu, magnitude(weakExpected.volts.get(bus.id)) * Math.sqrt(3) / weakExpected.nodes.get(bus.id).voltage, 1e-5, `exhausted ${bus.id}`);
  const edited = structuredClone(final);
  const branch = edited.cables.find(cable => cable.loadId === input.equipment[0].id);
  branch.ampacityA = 74;
  const study = evaluateDesignSynthesisStudy(edited, input.criteria);
  assert.equal(study.final.circuits.find(circuit => circuit.id === branch.id).status, 'fail', 'Operating study must retain the 75 A motor design floor even when running current is lower');
});

test('multiple motors on both voltage levels start individually with every other motor still running', () => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const original = input.equipment;
  input.equipment = Array.from({ length: 50 }, (_, index) => ({ ...original[index % original.length], id: `MULTI-${index}`, tag: `MULTI-${index}`,
    kw: 2, voltage: index < 30 ? 208 : 480, powerFactor: 0.9, duty: 'continuous' }));
  for (const index of [0, 20, 40]) {
    const voltage = input.equipment[index].voltage;
    input.equipment[index] = { ...input.equipment[index], ratingsBasis: 'electrical-input-kW', motor: {
      ...motor, ratedVoltageV: voltage === 480 ? 460 : 208,
      fullLoadCurrentA: voltage === 480 ? 7 : 14,
      nameplateCurrentA: voltage === 480 ? 5 : 10,
      lockedRotorCurrentA: voltage === 480 ? 30 : 60,
    } };
  }
  input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic multi-motor source basis; within the 20 kA external source bound.' };
  input.criteria.motorStarting = { minimumVoltagePu: 0.8 };
  const before = structuredClone(input);
  const design = generateDesignProposal(input);
  assert.equal(design.motorStartingValidation.cases.length, 3);
  assert.equal(design.motorOverloadCandidates.cases.length, 3);
  for (const actual of design.motorStartingValidation.cases) {
    assert.equal(actual.converged, true, JSON.stringify(actual));
    const expected = physicalStart(input, design, actual.motorId);
    for (const bus of actual.buses) near(bus.voltagePu, magnitude(expected.volts.get(bus.id)) * Math.sqrt(3) / expected.nodes.get(bus.id).voltage, 1e-5, `${actual.motorId} ${bus.id}`);
    for (const circuit of actual.circuits.filter(row => expected.currents.has(row.id))) near(circuit.toCurrentA, magnitude(expected.currents.get(circuit.id)), 0.05, `${actual.motorId} ${circuit.id}`);
  }
  assert.deepEqual(input, before);
  assert.equal(design.status, 'blocked', 'Multiple passing starts still do not establish complete motor protection');
});
