import assert from 'node:assert/strict';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { evaluateDesignSynthesisMotorProtectionTiming, validateDesignSynthesisMotorProtectionTimingInputs } from '../analysis/designSynthesisMotorProtectionTiming.mjs';
import { protectionTimingFixture } from './helpers/motorProtectionTimingFixture.mjs';
import { physicalStart, magnitude } from './helpers/motorNetworkOracle.mjs';

const near = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${actual} versus ${expected}`);
const timingOf = input => input.equipment[0].motor.protectionTiming;
const evaluate = (proposal, input, acceleration = proposal.motorAccelerationValidation, options = {}) => evaluateDesignSynthesisMotorProtectionTiming(proposal, acceleration, { equipment: input.equipment, criteria: input.criteria, ...options });
const codes = result => [...(result.issues || []), ...(result.cases || []).flatMap(row => row.issues || [])].map(row => row.code);

test('rejects modified acceleration output even when its input fingerprint is unchanged', () => {
  const input = protectionTimingFixture();
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.motorProtectionTimingValidation.status, 'pass');
  for (const change of [
    altered => {
      const row = altered.cases[0];
      const scale = 0.01 / row.timeS;
      row.timeline.forEach(point => { point.timeS *= scale; });
      row.timeS = 0.01;
    },
    altered => { altered.cases[0].timeline[0].currentA *= 0.9; },
    altered => { altered.cases[0].electricalExposureA2S *= 0.9; },
    altered => { altered.cases.push(structuredClone(altered.cases[0])); },
  ]) {
    const altered = structuredClone(proposal.motorAccelerationValidation);
    change(altered);
    const result = evaluate(proposal, input, altered);
    assert.equal(result.status, 'blocked');
    assert.ok(codes(result).includes('MOTOR_PROTECTION_TIMING_ACCELERATION_RESULT_MISMATCH'));
    assert.equal(result.completeProtectionStatus, 'blocked');
  }
});

test('geometric-mean source knots yield independently derived trip/clearing margins without claiming complete protection', () => {
  const input = protectionTimingFixture();
  const before = structuredClone(input);
  const proposal = generateDesignProposal(input);
  assert.deepEqual(input, before);
  const result = proposal.motorProtectionTimingValidation;
  assert.equal(result.status, 'pass', JSON.stringify(result));
  const row = result.cases[0];
  // 100 A is sqrt(80 A * 125 A), so each log-log time is the
  // geometric mean of its endpoint times; no runtime interpolator is called.
  near(row.devices[0].minimumTripS, Math.sqrt(15.625 * 6.4));
  near(row.devices[0].maximumTotalCircuitClearingS, Math.sqrt(31.25 * 12.8));
  near(row.devices[1].minimumTripS, Math.sqrt(14.0625 * 5.76));
  near(row.devices[1].maximumTotalCircuitClearingS, Math.sqrt(25 * 10.24));
  near(row.startupDurationS, proposal.motorAccelerationValidation.cases[0].timeS + 0.2);
  near(row.devices[1].startupRideThroughMarginS, 9 - row.startupDurationS);
  near(row.earliestMaximumTotalCircuitClearingS, 16);
  assert.equal(row.responsibleEarliestClearingDevice, 'overload-relay');
  assert.equal(row.comparisons.selectedStateSafeStall.referenceCurrentOnly, true);
  assert.equal(row.comparisons.selectedStateSafeStall.currentA, 100);
  assert.equal(row.otherInitialState.status, 'not-evaluated');
  assert.equal(row.evidenceClass, 'synthetic');
  assert.equal(row.evidenceStatus, 'supplied-unverified');
  assert.equal(result.completeProtectionStatus, 'blocked');
  assert.equal(proposal.status, 'blocked');
  assert.equal(proposal.distributionBaseline, null);
  assert.ok(proposal.issues.some(item => item.code === 'MOTOR_PROTECTION_UNRESOLVED'));
});

test('finite source curves need only cover the reference bound; lower observed currents do not require invented under-pickup times', () => {
  const input = protectionTimingFixture();
  for (const device of timingOf(input).devices) {
    device.minimumTrip = [{ currentA: 100, timeS: 10 }, { currentA: 1000, timeS: 0.1 }];
    device.maximumTotalCircuitClearing = [{ currentA: 100, timeS: 20 }, { currentA: 1000, timeS: 0.2 }];
  }
  const proposal = generateDesignProposal(input);
  assert.ok(proposal.motorAccelerationValidation.cases[0].timeline.every(point => point.currentA < 100));
  assert.equal(proposal.motorProtectionTimingValidation.status, 'pass', JSON.stringify(proposal.motorProtectionTimingValidation));
  timingOf(input).referenceStartCurrentA = 1001;
  timingOf(input).motorWithstand.referenceCurrentA = 1001;
  const outside = generateDesignProposal(input).motorProtectionTimingValidation;
  assert.equal(outside.status, 'blocked');
  assert.ok(codes(outside).some(code => code.includes('COVERAGE') || code.includes('RANGE')));
});

test('selected-state clearing and strict start boundaries retain failing arithmetic and leave the opposite state unevaluated', () => {
  const input = protectionTimingFixture();
  timingOf(input).motorWithstand.hotMinimumSafeStallTimeS = 1;
  assert.equal(generateDesignProposal(input).motorProtectionTimingValidation.status, 'pass');
  timingOf(input).initialState = 'hot';
  for (const device of timingOf(input).devices) device.conditions.initialState = 'hot';
  const hot = generateDesignProposal(input).motorProtectionTimingValidation;
  assert.equal(hot.status, 'fail');
  assert.equal(hot.cases[0].comparisons.selectedStateSafeStall.status, 'fail');
  near(hot.cases[0].earliestMaximumTotalCircuitClearingS, 16);
  assert.equal(hot.cases[0].otherInitialState.status, 'not-evaluated');

  const boundary = protectionTimingFixture();
  timingOf(boundary).motorWithstand.coldMinimumSafeStallTimeS = 16;
  const clearingEquality = generateDesignProposal(boundary).motorProtectionTimingValidation;
  assert.equal(clearingEquality.status, 'fail', 'Zero stall margin must not pass through rounding.');
  assert.equal(clearingEquality.cases[0].comparisons.selectedStateSafeStall.status, 'fail');
  const exactStart = protectionTimingFixture();
  const actualTime = generateDesignProposal(exactStart).motorAccelerationValidation.cases[0].timeS;
  timingOf(exactStart).startMarginS = 0;
  for (const device of timingOf(exactStart).devices) device.minimumTrip = [{ currentA: 80, timeS: actualTime }, { currentA: 100, timeS: actualTime }, { currentA: 125, timeS: actualTime }];
  const startEquality = generateDesignProposal(exactStart).motorProtectionTimingValidation;
  assert.equal(startEquality.status, 'fail', 'Minimum trip exactly at the final duration cannot establish ride-through.');
  assert.equal(startEquality.cases[0].comparisons.startupRideThrough.status, 'fail');
});

test('curve ordering is checked at merged interior knots and malformed shapes fail without exceptions', () => {
  const input = protectionTimingFixture();
  timingOf(input).devices[0].minimumTrip = [{ currentA: 80, timeS: 100 }, { currentA: 100, timeS: 10 }, { currentA: 125, timeS: 1 }];
  timingOf(input).devices[0].maximumTotalCircuitClearing = [{ currentA: 80, timeS: 200 }, { currentA: 90, timeS: 10 }, { currentA: 125, timeS: 2 }];
  const crossed = generateDesignProposal(input).motorProtectionTimingValidation;
  assert.equal(crossed.status, 'blocked');
  assert.ok(codes(crossed).includes('MOTOR_PROTECTION_TIMING_BOUNDS_CROSS'));
  for (const change of [null, [], { nonsense: true }, [null, { currentA: 125, timeS: 1 }]]) {
    const malformed = protectionTimingFixture();
    timingOf(malformed).devices[0].minimumTrip = change;
    assert.doesNotThrow(() => validateDesignSynthesisMotorProtectionTimingInputs(malformed));
    assert.equal(generateDesignProposal(malformed).motorProtectionTimingValidation.status, 'blocked');
  }
});

test('candidate identity, source class, contactor delay and physical applicability cannot be silently bypassed', () => {
  const edits = [
    timing => { timing.devices[0].catalogNumber = '3VA5130-6EC31-0AA0'; },
    timing => { timing.devices[0].setting.instantaneousPickupA = 180; },
    timing => { timing.devices[1].setting.dialSettingA = 13; },
    timing => { timing.devices[1].includesContactorOpening = false; },
    timing => { timing.devices[0].source.evidenceClass = 'nominal'; },
    timing => { timing.devices[0].conditions.initialState = 'hot'; },
    timing => { timing.motorWithstand.coldConditions.voltageRangeV = [479, 480]; },
    timing => { timing.devices[0].conditions.voltageRangeV = [400, 479]; },
    timing => { timing.currentEnvelopeA.maximumA = 92; timing.referenceStartCurrentA = 92; timing.motorWithstand.referenceCurrentA = 92; },
    timing => { timing.ambientTemperatureC = -300; },
  ];
  for (const edit of edits) {
    const input = protectionTimingFixture();
    edit(timingOf(input));
    const result = generateDesignProposal(input).motorProtectionTimingValidation;
    assert.equal(result.status, 'blocked', JSON.stringify(result));
    assert.ok(codes(result).length);
    assert.ok(result.cases.every(row => row.status !== 'pass'));
  }
});

test('stale, incomplete, malformed and foreign final evidence cannot reuse a timing pass', () => {
  const input = protectionTimingFixture();
  const proposal = generateDesignProposal(input);
  for (const edit of [
    acceleration => { acceleration.status = 'unknown'; },
    acceleration => { acceleration.modelInputFingerprint = 'stale'; },
    acceleration => { acceleration.cases[0].timeline.pop(); },
    acceleration => { acceleration.cases[0].timeline[0].currentA = null; },
    acceleration => { acceleration.cases[0].timeline[0].terminalVoltagePu = Number.NaN; },
  ]) {
    const acceleration = structuredClone(proposal.motorAccelerationValidation);
    edit(acceleration);
    assert.equal(evaluate(proposal, input, acceleration).status, 'blocked');
  }
  assert.equal(evaluate(proposal, input, undefined, { equipment: {} }).status, 'blocked');
  const foreign = structuredClone(input.equipment);
  foreign[0].motor.protectionTiming.startMarginS += 0.1;
  assert.equal(evaluate(proposal, input, undefined, { equipment: foreign }).status, 'blocked');
  const changed = structuredClone(proposal);
  changed.motorStarterCandidates.cases[0].candidate.branchCircuitBreaker.instantaneousPickupA = 180;
  const changedResult = evaluate(changed, input);
  assert.equal(changedResult.status, 'blocked');
  assert.notEqual(changedResult.inputFingerprint, proposal.motorProtectionTimingValidation.inputFingerprint);
});

test('malformed nested structures are diagnostic outcomes and never throw or expose numeric passes', () => {
  const edits = [
    motor => { motor.protectionTiming = null; },
    motor => { motor.protectionTiming = []; },
    motor => { motor.protectionTiming.motorWithstand = null; },
    motor => { motor.protectionTiming.currentEnvelopeA = null; },
    motor => { motor.protectionTiming.devices = {}; },
    motor => { motor.protectionTiming.devices[0] = null; },
    motor => { motor.protectionTiming.devices[0].conditions = null; },
    motor => { motor.protectionTiming.devices[0].source = null; },
    motor => { motor.protectionTiming.motorWithstand.coldConditions = null; },
    motor => { motor.protectionTiming.motorWithstand.source = {}; },
    motor => { motor.protectionTiming.startMarginS = Number.MAX_VALUE; motor.protectionTiming.devices[0].minimumTrip[0].timeS = Number.MAX_VALUE; },
  ];
  for (const edit of edits) {
    const input = protectionTimingFixture();
    edit(input.equipment[0].motor);
    let proposal;
    assert.doesNotThrow(() => { proposal = generateDesignProposal(input); });
    const result = proposal.motorProtectionTimingValidation;
    assert.ok(['blocked', 'fail'].includes(result.status));
    assert.ok(result.cases.every(row => row.status !== 'pass'));
    assert.doesNotThrow(() => JSON.stringify(proposal));
  }
});

test('omitted input can use canonical timing but an explicit missing request or changed starter context cannot hide it', () => {
  const input = protectionTimingFixture();
  const proposal = generateDesignProposal(input);
  assert.equal(evaluateDesignSynthesisMotorProtectionTiming(proposal, proposal.motorAccelerationValidation, { criteria: input.criteria }).status, 'pass');
  assert.equal(evaluate(proposal, input, undefined, { equipment: [] }).status, 'blocked');
  assert.equal(evaluate(proposal, input, undefined, { equipment: [input.equipment[0], input.equipment[0]] }).status, 'blocked');
  assert.equal(evaluate(proposal, input, undefined, { criteria: null }).status, 'blocked');
  assert.equal(evaluate(proposal, input, undefined, { supply: null }).status, 'blocked');
  const alteredCriteria = structuredClone(input.criteria);
  alteredCriteria.motorStarter.instantaneousPickupA = 180;
  assert.equal(evaluate(proposal, input, undefined, { criteria: alteredCriteria }).status, 'blocked');
  alteredCriteria.motorStarter.instantaneousPickupA = 150;
  alteredCriteria.motorStarter.controlVoltageV = 48;
  assert.equal(evaluate(proposal, input, undefined, { criteria: alteredCriteria }).status, 'blocked');
});

for (const [count, maximumTimeS] of [[25, 2.03], [50, 2.045]]) {
  test(`${count} loads: protection comparison uses final revised network and independent constant-torque duration`, () => {
    const input = protectionTimingFixture(count);
    input.criteria.loadFlow.maxRevisions = 1;
    input.criteria.motorAcceleration.maximumTimeS = maximumTimeS;
    const before = structuredClone(input);
    const proposal = generateDesignProposal(input);
    assert.deepEqual(input, before);
    assert.equal(proposal.motorAccelerationValidation.revision.status, 'complete');
    const { volts } = physicalStart(input, proposal, 'LOAD-1');
    const lineVoltageV = Math.sqrt(3) * magnitude(volts.get('LOAD-1'));
    const expectedTimeS = (1000 * 2 * Math.PI / 60) / (60 * (lineVoltageV / 460) ** 2 - 10);
    const result = proposal.motorProtectionTimingValidation;
    assert.equal(result.status, 'pass', JSON.stringify(result));
    assert.ok(Math.abs(result.cases[0].accelerationTimeS - expectedTimeS) < expectedTimeS * 1e-5);
    near(result.cases[0].startupDurationS, proposal.motorAccelerationValidation.cases[0].timeS + 0.2);
    near(result.cases[0].devices[1].startupRideThroughMarginS, 9 - result.cases[0].startupDurationS);
    assert.equal(result.completeProtectionStatus, 'blocked');
    assert.equal(proposal.status, 'blocked');
    assert.equal(proposal.distributionBaseline, null);
  });
}
