import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { buildDesignSynthesisOneLine } from '../analysis/designSynthesisOneLine.mjs';
import { evaluateDesignSynthesisMotorAcceleration, validateDesignSynthesisMotorAccelerationInputs } from '../analysis/designSynthesisMotorAcceleration.mjs';

const criteria = { motorStarting: { minimumVoltagePu: 0.8 }, motorAcceleration: { maximumTimeS: 10 } };
const near = (actual, expected, label) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-4), `${label}: ${actual} versus ${expected}`);

function fixture({ initialTorqueNm = 60, finalTorqueNm = 60, loadTorqueNm = 10 } = {}) {
  const supply = { id: 'S', type: 'source', voltage: 480, phases: 3, frequencyHz: 60, capacityKva: 1000, availableFaultCurrentKA: 20,
    motorStartingImpedance: { rOhm: 0.03, xOhm: 0.06, reference: 'Synthetic source, per-phase ohms at 480 V.' } };
  const motor = {
    ratedVoltageV: 460, fullLoadCurrentA: 14,
    fullLoadCurrentBasis: { reference: 'Synthetic design current; no installed motor represented.' },
    nameplateCurrentA: 12.8, nameplateFrequencyHz: 60, lockedRotorCurrentA: 90, lockedRotorPowerFactor: 0.3,
    starterType: 'dol', rotorType: 'squirrel-cage',
    acceleration: {
      reference: 'Synthetic independent mechanics fixture.',
      motorInertiaKgM2: 0.4, motorInertiaReference: 'Synthetic motor-shaft inertia.',
      loadInertiaKgM2: 0.6, loadInertiaReference: 'Synthetic load inertia already referred to motor shaft.',
      targetSpeedRpm: 1000,
      performanceCurve: { reference: 'Synthetic constant electrical point and supplied mechanical torque.', points: [
        { speedRpm: 0, currentA: 90, powerFactor: 0.3, torqueNm: initialTorqueNm },
        { speedRpm: 1000, currentA: 90, powerFactor: 0.3, torqueNm: finalTorqueNm },
      ] },
      loadTorqueCurve: { reference: 'Synthetic constant resisting torque.', points: [
        { speedRpm: 0, torqueNm: loadTorqueNm }, { speedRpm: 1000, torqueNm: loadTorqueNm },
      ] },
    },
  };
  const load = { id: 'M', tag: 'M', type: 'load', kw: 8, voltage: 480, phases: 3, frequencyHz: 60, powerFactor: 0.86, duty: 'continuous', ratingsBasis: 'electrical-input-kW', motor };
  const cable = { id: 'C', tag: 'C', from: 'S', to: 'M', loadId: 'M', conductor_size: '#8 AWG', lengthFt: 100, length: 100,
    r_ohm_per_kft: 0.2, x_ohm_per_kft: 0.4, ampacityA: 100, impedance: { r: 0.02, x: 0.04 }, phases: 3, voltage: 480 };
  const proposal = { equipment: [supply, load], loads: [load], cables: [cable], inputs: { supply } };
  proposal.oneLine = buildDesignSynthesisOneLine({ supply, loads: [load], cables: [cable] });
  return proposal;
}

// Independent series-circuit arithmetic. No application network solver, motor
// interpolation, integration, or model-builder calculations generate expectations.
function electricalPoint() {
  const motorZ = 460 / (Math.sqrt(3) * 90);
  const totalR = 0.03 + 0.02 + motorZ * 0.3;
  const totalX = 0.06 + 0.04 + motorZ * Math.sqrt(1 - 0.3 ** 2);
  const currentA = (480 / Math.sqrt(3)) / Math.hypot(totalR, totalX);
  const motorVoltageV = Math.sqrt(3) * currentA * motorZ;
  return { currentA, voltageSquaredRatio: (motorVoltageV / 460) ** 2, motorVoltageV };
}

test('coupled DOL acceleration matches the constant-torque closed form and per-line-current exposure', () => {
  const proposal = fixture();
  const before = structuredClone(proposal);
  const expectedElectrical = electricalPoint();
  const expectedNetTorque = 60 * expectedElectrical.voltageSquaredRatio - 10;
  const expectedTime = (0.4 + 0.6) * (1000 * 2 * Math.PI / 60) / expectedNetTorque;
  const result = evaluateDesignSynthesisMotorAcceleration(proposal, criteria);
  assert.equal(result.status, 'evaluated', JSON.stringify(result));
  const row = result.cases[0];
  near(row.timeS, expectedTime, 'J delta-omega divided by actual net torque');
  near(row.electricalExposureA2S, expectedElectrical.currentA ** 2 * expectedTime, 'integral line-current squared over time');
  assert.equal(row.criterionStatus, 'pass');
  assert.deepEqual(proposal, before, 'Curve solving must preserve canonical running data and topology');

  const stricter = evaluateDesignSynthesisMotorAcceleration(proposal, { ...criteria, motorAcceleration: { maximumTimeS: expectedTime / 2 } });
  assert.equal(stricter.cases[0].criterionStatus, 'fail');
  near(stricter.cases[0].timeS, expectedTime, 'Changing the duration limit must not tune the physical result');
  assert.notEqual(stricter.modelInputFingerprint, result.modelInputFingerprint);
});

test('a linearly rising torque curve matches its logarithmic time integral and reacts to inertia', () => {
  const proposal = fixture({ initialTorqueNm: 40, finalTorqueNm: 60 });
  const electrical = electricalPoint();
  const intercept = 40 * electrical.voltageSquaredRatio - 10;
  const slopePerRpm = (60 - 40) * electrical.voltageSquaredRatio / 1000;
  const expectedTime = (2 * Math.PI / 60) * Math.log((intercept + slopePerRpm * 1000) / intercept) / slopePerRpm;
  const result = evaluateDesignSynthesisMotorAcceleration(proposal, criteria);
  assert.equal(result.status, 'evaluated', JSON.stringify(result));
  near(result.cases[0].timeS, expectedTime, 'analytic integral of inverse linear accelerating torque');
  near(result.cases[0].electricalExposureA2S, electrical.currentA ** 2 * expectedTime, 'constant current times integrated duration');
  proposal.loads[0].motor.acceleration.loadInertiaKgM2 = 1.6;
  const doubled = evaluateDesignSynthesisMotorAcceleration(proposal, criteria);
  near(doubled.cases[0].timeS, 2 * expectedTime, 'Doubling total motor-shaft inertia doubles time');
  assert.notEqual(doubled.modelInputFingerprint, result.modelInputFingerprint);
});

test('speed-curve schema rejects impossible interior mechanical power without network solving', () => {
  const proposal = fixture({ initialTorqueNm: 1000, finalTorqueNm: 1, loadTorqueNm: 0 });
  const points = proposal.loads[0].motor.acceleration.performanceCurve.points;
  const electricalInputW = Math.sqrt(3) * 460 * 90 * 0.3;
  assert.ok(points.every(point => point.torqueNm * point.speedRpm * 2 * Math.PI / 60 < electricalInputW));
  const interiorShaftPowerW = ((1000 + 1) / 2) * 500 * 2 * Math.PI / 60;
  assert.ok(interiorShaftPowerW > electricalInputW, 'Endpoints alone miss this nonphysical interpolation');
  const checked = validateDesignSynthesisMotorAccelerationInputs({ loads: proposal.loads, criteria });
  assert.ok(checked.issues.length > 0, JSON.stringify(checked));
  const result = evaluateDesignSynthesisMotorAcceleration(proposal, criteria);
  assert.equal(result.status, 'blocked');
  assert.ok(!result.cases?.some(row => Number.isFinite(row.timeS)), 'Impossible input must not produce a credible numeric time');
});

test('a torque deficit cannot produce a finite successful acceleration time', () => {
  const proposal = fixture({ initialTorqueNm: 5, finalTorqueNm: 5, loadTorqueNm: 10 });
  const result = evaluateDesignSynthesisMotorAcceleration(proposal, criteria);
  assert.equal(result.status, 'evaluated', 'A detected torque deficit is a known failed model outcome');
  assert.equal(result.cases[0].status, 'fail');
  assert.equal(result.cases[0].failure, 'insufficient-positive-acceleration-torque');
  assert.equal(result.cases[0].failedAtSpeedRpm, 0);
  assert.equal(result.cases[0].criterionStatus, 'not-evaluated');
  assert.ok(!result.cases.some(row => Number.isFinite(row.timeS)), 'A stalled model has no finite time to the target');
});

test('acceleration uses the motor-side voltage base through a 480/208 V transformer', () => {
  const proposal = fixture();
  const supply = proposal.equipment[0];
  const load = proposal.loads[0];
  load.voltage = 208;
  load.motor.ratedVoltageV = 200;
  const primary = { id: 'P', tag: 'P', type: 'bus', voltage: 480, phases: 3 };
  const secondary = { id: 'Q', tag: 'Q', type: 'bus', voltage: 208, phases: 3 };
  const transformer = { id: 'T', type: 'transformer', primaryBusId: 'P', secondaryBusId: 'Q', primaryVoltageVac: 480,
    secondaryVoltageVac: 208, ratedKVA: 100, coreLossKw: 0, seriesModel: { zPercent: 5, xr: 3 }, primaryConnection: 'delta', secondaryConnection: 'wye' };
  const cable = proposal.cables[0];
  const primaryCable = { ...cable, id: 'CP', tag: 'CP', to: 'P', loadId: undefined };
  const secondaryCable = { ...cable, id: 'CS', tag: 'CS', from: 'Q', voltage: 208 };
  proposal.equipment = [supply, primary, secondary, transformer, load];
  proposal.cables = [primaryCable, secondaryCable];
  proposal.oneLine = buildDesignSynthesisOneLine({ supply, loads: [load], cables: proposal.cables, transformers: [transformer], terminalBuses: [primary, secondary] });

  const ratio = 208 / 480;
  const transformerZ = 0.05 * 208 ** 2 / 100000;
  const transformerR = transformerZ / Math.sqrt(10);
  const motorZ = 200 / (Math.sqrt(3) * 90);
  const totalR = (0.03 + 0.02) * ratio ** 2 + transformerR + 0.02 + motorZ * 0.3;
  const totalX = (0.06 + 0.04) * ratio ** 2 + transformerR * 3 + 0.04 + motorZ * Math.sqrt(1 - 0.3 ** 2);
  const amps = (208 / Math.sqrt(3)) / Math.hypot(totalR, totalX);
  const squaredVoltageRatio = (Math.sqrt(3) * amps * motorZ / 200) ** 2;
  const expectedTime = (2 * Math.PI * 1000 / 60) / (60 * squaredVoltageRatio - 10);
  const result = evaluateDesignSynthesisMotorAcceleration(proposal, criteria);
  assert.equal(result.status, 'evaluated', JSON.stringify(result));
  near(result.cases[0].timeS, expectedTime, 'secondary-referred series impedance and motor-rated voltage torque');
  near(result.cases[0].electricalExposureA2S, amps ** 2 * expectedTime, 'secondary line current exposure');
});

test('acceleration freshness follows physical inputs and ignores attached result/report metadata', () => {
  const proposal = fixture();
  const original = evaluateDesignSynthesisMotorAcceleration(proposal, criteria);
  proposal.motorAccelerationValidation = structuredClone(original);
  proposal.report = { summary: 'A changed presentation only.' };
  proposal.generatedAt = '2099-01-01';
  proposal.checks = [{ id: 'presentation-only', status: 'not-evaluated' }];
  const rechecked = evaluateDesignSynthesisMotorAcceleration(proposal, criteria);
  assert.equal(rechecked.modelInputFingerprint, original.modelInputFingerprint);
  near(rechecked.cases[0].timeS, original.cases[0].timeS, 'Attaching result must not alter the physical study');
  proposal.equipment[0].availableFaultCurrentKA = 21;
  const changed = evaluateDesignSynthesisMotorAcceleration(proposal, criteria);
  assert.notEqual(changed.modelInputFingerprint, original.modelInputFingerprint, 'Canonical source bound remains part of validated input');
});

test('missing duration and voltage criteria do not become fictitious passing requirements', () => {
  const proposal = fixture();
  const result = evaluateDesignSynthesisMotorAcceleration(proposal);
  assert.equal(result.status, 'evaluated', JSON.stringify(result));
  assert.ok(result.cases[0].timeS > 0);
  assert.equal(result.cases[0].criterionStatus, 'not-evaluated');
  assert.equal(result.criteria.maximumTimeS, null);
});

test('a stale one-line motor voltage base cannot override the canonical load voltage', () => {
  const proposal = fixture();
  proposal.loads[0].voltage = 208;
  const result = evaluateDesignSynthesisMotorAcceleration(proposal, criteria);
  assert.equal(result.status, 'blocked', 'Canonical load and modeled terminal nominal voltage disagree');
  assert.ok(!result.cases.some(row => Number.isFinite(row.timeS)));
});

test('malformed, uncovered and unsupported acceleration input has no numeric time', () => {
  const mutations = [
    model => { model.acceleration = null; },
    model => { model.acceleration.performanceCurve.points.reverse(); },
    model => { model.acceleration.performanceCurve.points[1].speedRpm = 0; },
    model => { delete model.acceleration.performanceCurve.points[1].powerFactor; },
    model => { model.acceleration.performanceCurve.reference = ''; },
    model => { model.acceleration.targetSpeedRpm = 1001; },
    model => { model.acceleration.loadInertiaKgM2 = -1; },
    model => { model.acceleration.motorInertiaKgM2 = 1e308; model.acceleration.loadInertiaKgM2 = 1e308; },
    model => { model.acceleration.undocumentedDefault = true; },
    model => { model.acceleration.performanceCurve.points[0].currentA = 100; },
    model => { model.rotorType = 'synchronous'; },
    model => { delete model.nameplateFrequencyHz; },
    model => { model.nameplateFrequencyHz = 50; },
  ];
  for (const mutate of mutations) {
    const proposal = fixture();
    mutate(proposal.loads[0].motor);
    const result = evaluateDesignSynthesisMotorAcceleration(proposal, criteria);
    assert.equal(result.status, 'blocked', JSON.stringify(result));
    assert.ok(result.issues.length > 0);
    assert.ok(!result.cases.some(row => Number.isFinite(row.timeS)));
  }
});

test('25/50 mixed loads retain the acceleration model through generation, regeneration and protection blocking', () => {
  for (const count of [25, 50]) {
    const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
    const originals = input.equipment;
    input.equipment = Array.from({ length: count }, (_, index) => ({ ...originals[index % originals.length], id: `LOAD-${index}`, tag: `LOAD-${index}`,
      voltage: index < count * 0.8 ? 208 : 480, kw: index < count * 0.8 ? 1 : 3, powerFactor: 0.9, duty: 'continuous' }));
    const motorIndex = count - 1;
    input.equipment[motorIndex] = { ...input.equipment[motorIndex], kw: 8, powerFactor: 0.86, ratingsBasis: 'electrical-input-kW', motor: structuredClone(fixture().loads[0].motor) };
    input.supply.frequencyHz = 60;
    input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic bounded source for generation acceptance.' };
    input.criteria.motorStarting = { minimumVoltagePu: 0.8 };
    input.criteria.motorAcceleration = { maximumTimeS: 10 };
    const before = structuredClone(input);
    const generated = generateDesignProposal(input);
    assert.equal(generated.loads.length, count, JSON.stringify(generated.issues));
    assert.ok(generated.transformer);
    assert.equal(generated.motorAccelerationValidation.status, 'evaluated', JSON.stringify(generated.motorAccelerationValidation));
    assert.equal(generated.motorAccelerationValidation.cases[0].criterionStatus, 'pass');
    assert.equal(generated.status, 'blocked', 'Acceleration cannot clear unresolved motor protection');
    assert.ok(generated.issues.some(row => row.code === 'MOTOR_PROTECTION_UNRESOLVED'));
    assert.deepEqual(input, before);

    const changed = structuredClone(input);
    changed.equipment[motorIndex].motor.acceleration.loadInertiaKgM2 = 1.6;
    const regenerated = generateDesignProposal(changed);
    assert.notEqual(regenerated.inputSignature, generated.inputSignature);
    assert.notEqual(regenerated.motorAccelerationValidation.modelInputFingerprint, generated.motorAccelerationValidation.modelInputFingerprint);
    near(regenerated.motorAccelerationValidation.cases[0].timeS, 2 * generated.motorAccelerationValidation.cases[0].timeS, `${count} loads: mechanical inertia changes duration under the same electrical design`);
    assert.deepEqual(regenerated.cables.map(row => [row.id, row.conductor_size, row.lengthFt]), generated.cables.map(row => [row.id, row.conductor_size, row.lengthFt]));
  }
});
