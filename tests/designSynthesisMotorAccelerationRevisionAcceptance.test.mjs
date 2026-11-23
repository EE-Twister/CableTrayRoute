import assert from 'node:assert/strict';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { evaluateDesignSynthesisMotorAcceleration } from '../analysis/designSynthesisMotorAcceleration.mjs';
import { motorRevisionFixture } from './helpers/motorAccelerationRevisionFixture.mjs';
import { physicalStart, magnitude } from './helpers/motorNetworkOracle.mjs';

// Expected acceleration uses a separate physical-V/A network implementation,
// independently transcribed cable impedances, and the constant-torque integral.
// The duration criteria are fixed independently of the application's results.
function expectedTime(input, proposal) {
  const { volts } = physicalStart(input, proposal, 'LOAD-1');
  const motor = input.equipment.find(row => row.id === 'LOAD-1').motor;
  const motorLineV = Math.sqrt(3) * magnitude(volts.get('LOAD-1'));
  return (1000 * 2 * Math.PI / 60) / (60 * (motorLineV / motor.ratedVoltageV) ** 2 - 10);
}

function near(actual, expected) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-5 * expected,
    `${actual} should agree with independent expectation ${expected}`);
}

for (const [count, maximumTimeS] of [[25, 2.03], [50, 2.045]]) {
  test(`${count} loads: fixed acceleration limit drives exactly one affected-path revision matching the independent mechanics oracle`, () => {
    const input = motorRevisionFixture(count);
    input.criteria.motorAcceleration.maximumTimeS = maximumTimeS;
    const unchanged = structuredClone(input);
    const initial = generateDesignProposal(input);
    const initialTime = expectedTime(input, initial);
    assert.equal(initial.studyValidation.status, 'pass');
    assert.equal(initial.motorStartingValidation.status, 'pass');
    assert.equal(initial.motorAccelerationValidation.cases[0].criterionStatus, 'fail');
    near(initial.motorAccelerationValidation.cases[0].timeS, initialTime);
    assert.ok(initialTime > maximumTimeS);
    assert.equal(initial.motorAccelerationValidation.revision.stopReason, 'revision-budget-exhausted');
    assert.deepEqual(input, unchanged);

    input.criteria.loadFlow.maxRevisions = 1;
    const before = structuredClone(input);
    const final = generateDesignProposal(input);
    const result = final.motorAccelerationValidation;
    assert.deepEqual(input, before, 'Revision must never alter ratings, curves, criteria or corridor geometry.');
    assert.equal(final.loads.length, count);
    assert.equal(final.studyValidation.status, 'pass');
    assert.equal(final.motorStartingValidation.status, 'pass');
    assert.equal(result.status, 'evaluated');
    assert.equal(result.criteria.maximumTimeS, maximumTimeS);
    assert.equal(result.cases[0].criterionStatus, 'pass');
    near(result.cases[0].timeS, expectedTime(input, final));
    assert.ok(result.cases[0].timeS < maximumTimeS);
    assert.equal(result.revision.status, 'complete');
    assert.equal(result.revision.stopReason, null);
    assert.deepEqual(result.revision.history.map(row => row.revision), [0, 1]);
    assert.deepEqual(result.revision.history.map(row => row.status), ['fail', 'pass']);
    near(result.revision.history[0].accelerationCases[0].timeS, initialTime);
    const changes = final.cables.filter(cable => initial.cables.find(old => old.id === cable.id).conductor_size !== cable.conductor_size);
    assert.deepEqual(changes.map(row => [row.id, row.conductor_size]).sort(), [['C-LOAD-1', '#6 AWG'], ['F-DP-01', '#6 AWG']]);
    assert.deepEqual(result.revision.history[1].changedCircuits.map(row => row.id).sort(), ['C-LOAD-1', 'F-DP-01']);
    const { revision, ...finalEvaluation } = result;
    assert.deepEqual(finalEvaluation, evaluateDesignSynthesisMotorAcceleration(final, input.criteria),
      'Returned numerical evidence and fingerprint must describe the final network, not an earlier passing candidate.');
    assert.equal(final.status, 'blocked');
    assert.equal(final.distributionBaseline, null);
    assert.ok(final.issues.some(row => row.code === 'MOTOR_PROTECTION_UNRESOLVED'));
    assert.ok(!final.issues.some(row => row.code === 'MOTOR_ACCELERATION_TIME_LIMIT_EXCEEDED'));
  });
}

test('an operating-voltage revision spends the single shared revision before acceleration can request another', () => {
  const input = motorRevisionFixture();
  input.criteria.loadFlow = { minimumVoltagePu: 0.994, maxRevisions: 1 };
  input.criteria.motorAcceleration.maximumTimeS = 1;
  const before = structuredClone(input);
  const final = generateDesignProposal(input);
  assert.deepEqual(input, before);
  assert.equal(final.studyValidation.status, 'pass');
  assert.deepEqual(final.studyValidation.history.map(row => row.status), ['fail', 'pass']);
  assert.equal(Math.max(...final.studyValidation.history.map(row => row.revision)), 1);
  assert.deepEqual(final.motorAccelerationValidation.revision.history.map(row => row.revision), [1]);
  assert.equal(final.motorAccelerationValidation.revision.stopReason, 'revision-budget-exhausted');
  assert.equal(final.motorAccelerationValidation.cases[0].criterionStatus, 'fail');
  near(final.motorAccelerationValidation.cases[0].timeS, expectedTime(input, final));
});

test('a secondary motor tries affected transformer profiles after exhausting conductors and satisfies the original fixed limit', () => {
  const input = motorRevisionFixture(2);
  input.equipment[0].voltage = 208;
  input.equipment[0].kw = 2;
  input.equipment[0].motor.ratedVoltageV = 200;
  input.criteria.loadFlow.maxRevisions = 64;
  input.criteria.motorAcceleration.maximumTimeS = 2.05;
  const before = structuredClone(input);
  const final = generateDesignProposal(input);
  assert.deepEqual(input, before);
  const result = final.motorAccelerationValidation;
  assert.equal(result.revision.status, 'complete');
  assert.equal(result.cases[0].criterionStatus, 'pass');
  assert.equal(result.criteria.maximumTimeS, 2.05);
  assert.equal(final.studyValidation.status, 'pass');
  assert.equal(final.motorStartingValidation.status, 'pass');
  const history = result.revision.history;
  assert.deepEqual(history.map(row => row.revision), Array.from({ length: 17 }, (_, index) => index));
  assert.equal(history[14].transformerProfileId, 'schneider-exn30t3hcu-2020');
  assert.equal(history[15].transformerProfileId, 'schneider-exn75t3hcu-2020');
  assert.equal(history[16].transformerProfileId, 'schneider-exn150t3hcu-2020');
  assert.deepEqual(history[15].changedCircuits, []);
  assert.deepEqual(history[16].changedCircuits, []);
  for (const id of ['F-DP-01', 'C-LOAD-1', 'F-TX-SWGR-01-480-208-3P-PRI']) {
    assert.equal(final.cables.find(row => row.id === id).conductor_size, '750 kcmil');
  }
  near(result.cases[0].timeS, expectedTime(input, final));
  assert.ok(result.cases[0].timeS < 2.05);
  assert.equal(final.cables.find(row => row.id === 'C-LOAD-2').conductor_size, '#8 AWG');
  assert.equal(final.distributionBaseline, null);
  assert.ok(final.issues.some(row => row.code === 'MOTOR_PROTECTION_UNRESOLVED'));
});

test('exhausting a direct motor path cannot trigger a larger unrelated secondary transformer', () => {
  const input = motorRevisionFixture(2);
  input.equipment[1].voltage = 208;
  input.criteria.loadFlow.maxRevisions = 64;
  input.criteria.motorAcceleration.maximumTimeS = 1e-5;
  const final = generateDesignProposal(input);
  const result = final.motorAccelerationValidation;
  assert.equal(result.revision.status, 'stopped');
  assert.equal(result.revision.stopReason, 'no-larger-sourced-conductor-or-transformer-candidate');
  assert.equal(result.revision.history.length, 15);
  assert.ok(result.revision.history.every(row => row.transformerProfileId === 'schneider-exn30t3hcu-2020'));
  assert.equal(final.transformer.profileId, 'schneider-exn30t3hcu-2020');
  assert.equal(final.cables.find(row => row.id === 'C-LOAD-1').conductor_size, '750 kcmil');
  assert.equal(final.cables.find(row => row.id === 'C-LOAD-2').conductor_size, '#8 AWG');
  near(result.cases[0].timeS, expectedTime(input, final));
  assert.equal(result.cases[0].criterionStatus, 'fail');
});
