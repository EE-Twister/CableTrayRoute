import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDesignSynthesisOneLine } from '../analysis/designSynthesisOneLine.mjs';
import { evaluateDesignSynthesisMotorAcceleration, validateDesignSynthesisMotorAccelerationInputs } from '../analysis/designSynthesisMotorAcceleration.mjs';

function input() {
  const source = { id: 'S', type: 'source', voltage: 480, phases: 3, capacityKva: 1000, availableFaultCurrentKA: 20,
    motorStartingImpedance: { rOhm: 0.01, xOhm: 0.02, reference: 'Synthetic positive-sequence source phase ohms.' } };
  const acceleration = { reference: 'Synthetic test curve; not manufacturer data.', motorInertiaKgM2: 2, motorInertiaReference: 'Synthetic test inertia.',
    loadInertiaKgM2: 0, loadInertiaReference: 'Synthetic zero load inertia.', targetSpeedRpm: 1000,
    performanceCurve: { reference: 'Synthetic electrical and torque curve.', points: [
      { speedRpm: 0, currentA: 90, powerFactor: 0.3, torqueNm: 10 },
      { speedRpm: 1000, currentA: 50, powerFactor: 0.8, torqueNm: 10 }
    ] },
    loadTorqueCurve: { reference: 'Synthetic load curve.', points: [{ speedRpm: 0, torqueNm: 0 }, { speedRpm: 1000, torqueNm: 0 }] } };
  const motor = { ratedVoltageV: 460, fullLoadCurrentA: 14, fullLoadCurrentBasis: { reference: 'Synthetic motor basis.' },
    nameplateCurrentA: 12.8, nameplateFrequencyHz: 60, lockedRotorCurrentA: 90, lockedRotorPowerFactor: 0.3, starterType: 'dol', rotorType: 'squirrel-cage', acceleration };
  const load = { id: 'M', type: 'load', kw: 8, voltage: 480, phases: 3, powerFactor: 0.86, motor };
  const cable = { id: 'C', from: 'S', to: 'M', impedance: { r: 0.0001, x: 0.0002 }, phases: 3 };
  const proposal = { equipment: [source, load], loads: [load], cables: [cable], inputs: { supply: source } };
  proposal.oneLine = buildDesignSynthesisOneLine({ supply: source, loads: [load], cables: [cable] });
  return proposal;
}

test('computes a network-coupled quasi-steady acceleration time and keeps duration criterion separate', () => {
  const proposal = input();
  const result = evaluateDesignSynthesisMotorAcceleration(proposal);
  assert.equal(result.status, 'evaluated', JSON.stringify(result.issues));
  assert.equal(result.cases[0].status, 'evaluated');
  assert.equal(result.cases[0].criterionStatus, 'not-evaluated');
  const idealTimeS = 2 * (1000 * 2 * Math.PI / 60) / (10 * (480 / 460) ** 2);
  assert.ok(result.cases[0].timeS > idealTimeS * 0.99);
  assert.ok(result.cases[0].timeS < idealTimeS * 1.2, `${result.cases[0].timeS} vs ${idealTimeS}`);
  assert.ok(result.cases[0].electricalExposureA2S > 0);
  assert.equal(result.cases[0].timeline.at(-1).speedRpm, 1000);
  assert.ok(result.cases[0].refinement.caseNetworkEvaluations <= result.cases[0].refinement.maximumCaseEvaluations);
  assert.ok(result.cases[0].refinement.totalNetworkEvaluations <= result.cases[0].refinement.maximumTotalEvaluations);
  assert.equal(evaluateDesignSynthesisMotorAcceleration(proposal, { motorAcceleration: { maximumTimeS: result.cases[0].timeS * 1.01 } }).cases[0].criterionStatus, 'pass');
  assert.equal(evaluateDesignSynthesisMotorAcceleration(proposal, { motorAcceleration: { maximumTimeS: result.cases[0].timeS * 0.99 } }).cases[0].criterionStatus, 'fail');
});

test('reports a torque stall without inventing a finite acceleration time', () => {
  const proposal = input();
  proposal.loads[0].motor.acceleration.loadTorqueCurve.points[1].torqueNm = 12;
  const result = evaluateDesignSynthesisMotorAcceleration(proposal);
  assert.equal(result.status, 'evaluated');
  assert.equal(result.cases[0].status, 'fail');
  assert.equal(result.cases[0].timeS, null);
  assert.equal(result.cases[0].failure, 'insufficient-positive-acceleration-torque');
});

test('blocks partial inputs, unused duration criteria, and physically impossible interior power curves', () => {
  const proposal = input();
  proposal.loads[0].motor.acceleration.performanceCurve.points[0].torqueNm = 0;
  proposal.loads[0].motor.acceleration.performanceCurve.points[1] = { speedRpm: 1000, currentA: 1, powerFactor: 0.01, torqueNm: 1000 };
  const issues = validateDesignSynthesisMotorAccelerationInputs({ loads: proposal.loads, equipment: proposal.equipment });
  assert.ok(issues.issues.some(item => item.code === 'ACCELERATION_POWER_BALANCE_INVALID'));
  const badCurve = evaluateDesignSynthesisMotorAcceleration(proposal);
  assert.equal(badCurve.status, 'blocked');
  assert.equal(badCurve.cases.length, 0);

  const partial = input();
  partial.loads[0].motor.acceleration = null;
  assert.ok(validateDesignSynthesisMotorAccelerationInputs({ loads: partial.loads }).issues.length > 0);
  const absent = input();
  delete absent.loads[0].motor.acceleration;
  assert.ok(evaluateDesignSynthesisMotorAcceleration(absent, { motorAcceleration: { maximumTimeS: 10 } }).issues.some(item => item.code === 'ACCELERATION_CRITERION_UNUSED'));
  const frequencyMissing = input();
  delete frequencyMissing.loads[0].motor.nameplateFrequencyHz;
  assert.ok(evaluateDesignSynthesisMotorAcceleration(frequencyMissing).issues.some(item => item.code === 'ACCELERATION_FREQUENCY_UNSUPPORTED'));
});

test('accepts a maximum-detail varying electrical curve within the per-case evaluation budget', () => {
  const proposal = input();
  proposal.loads[0].motor.acceleration.performanceCurve.points = Array.from({ length: 65 }, (_, index) => ({
    speedRpm: index * 1000 / 64,
    currentA: 90 - 40 * index / 64,
    powerFactor: 0.3 + 0.5 * index / 64,
    torqueNm: 10,
  }));
  const result = evaluateDesignSynthesisMotorAcceleration(proposal);
  assert.equal(result.status, 'evaluated', JSON.stringify(result.issues));
  assert.equal(result.cases[0].status, 'evaluated');
  assert.ok(result.cases[0].refinement.caseNetworkEvaluations > 65);
  assert.ok(result.cases[0].refinement.caseNetworkEvaluations <= result.cases[0].refinement.maximumCaseEvaluations);
});

test('keeps 25- and 50-motor five-knot scenarios within the explicit study network budget', () => {
  for (const count of [25, 50]) {
    const base = input();
    const source = base.equipment[0];
    const loads = [];
    const cables = [];
    for (let index = 0; index < count; index += 1) {
      const motor = structuredClone(base.loads[0].motor);
      motor.acceleration.performanceCurve.points = [0, 250, 500, 750, 1000].map((speedRpm, pointIndex) => ({
        speedRpm, currentA: [90, 80, 70, 60, 50][pointIndex], powerFactor: [0.3, 0.4, 0.5, 0.65, 0.8][pointIndex], torqueNm: 10,
      }));
      loads.push({ ...structuredClone(base.loads[0]), id: `M-${index + 1}`, motor });
      cables.push({ id: `C-${index + 1}`, from: 'S', to: `M-${index + 1}`, impedance: { r: 0.0001, x: 0.0002 }, phases: 3 });
    }
    const proposal = { equipment: [source, ...loads], loads, cables, inputs: { supply: source } };
    proposal.oneLine = buildDesignSynthesisOneLine({ supply: source, loads, cables });
    const result = evaluateDesignSynthesisMotorAcceleration(proposal);
    assert.equal(result.status, 'evaluated', `${count} motors: ${JSON.stringify(result.issues.slice(0, 3))}`);
    assert.equal(result.coverage.status, 'complete');
    assert.equal(result.coverage.evaluatedMotorCount, count);
    assert.ok(result.coverage.totalNetworkEvaluations <= result.coverage.maximumTotalEvaluations);
  }
});

test('fingerprint excludes unrelated cached output while tracking the supplied motor model', () => {
  const proposal = input();
  const first = evaluateDesignSynthesisMotorAcceleration(proposal);
  proposal.motorAccelerationValidation = { old: true, generatedAt: 'unrelated' };
  const second = evaluateDesignSynthesisMotorAcceleration(proposal);
  assert.equal(second.modelInputFingerprint, first.modelInputFingerprint);
  proposal.loads[0].motor.acceleration.motorInertiaKgM2 += 0.1;
  const changed = evaluateDesignSynthesisMotorAcceleration(proposal);
  assert.notEqual(changed.modelInputFingerprint, first.modelInputFingerprint);
});

test('fingerprint tracks the canonical source fault bound when source input objects are separate', () => {
  const proposal = input();
  proposal.inputs = {
    supply: { ...proposal.equipment[0] },
    original: { supply: { ...proposal.equipment[0] } },
  };
  const first = evaluateDesignSynthesisMotorAcceleration(proposal);
  proposal.equipment[0].availableFaultCurrentKA = 21;
  const changed = evaluateDesignSynthesisMotorAcceleration(proposal);
  assert.notEqual(changed.modelInputFingerprint, first.modelInputFingerprint);
});
