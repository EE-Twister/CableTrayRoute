import assert from 'node:assert/strict';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { evaluateDesignSynthesisMotorProtectionTiming } from '../analysis/designSynthesisMotorProtectionTiming.mjs';
import { protectionTimingFixture } from './helpers/motorProtectionTimingFixture.mjs';

const timingOf = input => input.equipment[0].motor.protectionTiming;
const makeRangeInput = () => {
  const input = protectionTimingFixture();
  const timing = timingOf(input);
  timing.schemaVersion = '2.0.0';
  timing.stallCurrentRangeA = { minimumA: 80, maximumA: 125, reference: 'Synthetic constant-current stalled-condition interval for the focused comparison.' };
  delete timing.motorWithstand.referenceCurrentA;
  delete timing.motorWithstand.hotMinimumSafeStallTimeS;
  delete timing.motorWithstand.coldMinimumSafeStallTimeS;
  const curve = scale => [80, 100, 125].map(currentA => ({ currentA, minimumSafeStallTimeS: scale / Math.sqrt(currentA) }));
  timing.motorWithstand.hotMinimumSafeStallCurve = curve(640);
  timing.motorWithstand.coldMinimumSafeStallCurve = curve(640);
  return input;
};

test('v2 recomputes nominal network locked-rotor current and compares device clearing across declared stall range', () => {
  const input = makeRangeInput();
  const proposal = generateDesignProposal(input);
  const result = proposal.motorProtectionTimingValidation;
  assert.equal(result.status, 'pass', JSON.stringify(result));
  const row = result.cases[0];
  assert.equal(row.schemaVersion, '2.0.0');
  assert.equal(row.completeProtectionStatus, 'blocked');
  assert.equal(row.networkLockedRotorCurrentA.status, 'recomputed-and-matched-to-acceleration');
  assert.ok(row.networkLockedRotorCurrentA.valueA >= 80 && row.networkLockedRotorCurrentA.valueA <= 125);
  assert.equal(row.comparisons.selectedStateSafeStall.referenceCurrentOnly, false);
  assert.equal(row.comparisons.selectedStateSafeStall.scope, 'all-compared-bounds-below-limit');
  for (const device of row.devices) {
    assert.equal(device.stallRangeComparison.status, 'pass');
    assert.equal(device.stallRangeComparison.scope, 'all-compared-bounds-below-limit');
    assert.ok(device.stallRangeComparison.points.some(point => point.currentA === row.networkLockedRotorCurrentA.valueA));
    assert.ok(device.stallRangeComparison.minimumMarginS > 0);
  }
  assert.equal(proposal.status, 'blocked', 'bounded timing pass must not release the motor Apply gate');
  assert.ok(proposal.issues.some(item => item.code === 'MOTOR_PROTECTION_UNRESOLVED'));
});

test('v2 accepts a degenerate stall-current interval at the exact recomputed network locked-rotor point', () => {
  const input = makeRangeInput();
  const baseline = generateDesignProposal(input);
  const currentA = baseline.motorProtectionTimingValidation.cases[0].networkLockedRotorCurrentA.valueA;
  timingOf(input).stallCurrentRangeA.minimumA = currentA;
  timingOf(input).stallCurrentRangeA.maximumA = currentA;
  const result = generateDesignProposal(input).motorProtectionTimingValidation;
  assert.equal(result.status, 'pass', JSON.stringify(result));
  assert.equal(result.cases[0].stallCurrentRangeA.minimumA, result.cases[0].stallCurrentRangeA.maximumA);
  for (const device of result.cases[0].devices) {
    assert.equal(device.stallRangeComparison.status, 'pass');
    assert.equal(device.stallRangeComparison.points.length, 1);
    assert.equal(device.stallRangeComparison.points[0].currentA, currentA);
  }
});

test('v2 keeps finite extreme endpoint ratios in log-log segment calculations', () => {
  const input = makeRangeInput();
  for (const device of timingOf(input).devices) {
    device.minimumTrip = [{ currentA: 80, timeS: 1e299 }, { currentA: 125, timeS: 1e-301 }];
    device.maximumTotalCircuitClearing = [{ currentA: 80, timeS: 1e300 }, { currentA: 125, timeS: 1e-300 }];
  }
  timingOf(input).motorWithstand.coldMinimumSafeStallCurve = [{ currentA: 80, minimumSafeStallTimeS: 1e300 }, { currentA: 125, minimumSafeStallTimeS: 1e-300 }];
  const result = generateDesignProposal(input).motorProtectionTimingValidation;
  assert.equal(result.status, 'fail', 'finite bounds can fail comparisons but must not disappear through ratio overflow');
  const caseResult = result.cases[0];
  assert.ok(caseResult.devices.every(device => device.stallRangeComparison.points.every(point =>
    [point.minimumTripS, point.maximumTotalCircuitClearingS, point.minimumSafeStallTimeS, point.marginS].every(Number.isFinite))));
});

test('v2 blocks contradictory LR bases, uncovered range, and stale speed-zero acceleration evidence', () => {
  const edits = [
    timing => { timing.stallCurrentRangeA.minimumA = 1; },
    timing => { timing.stallCurrentRangeA.maximumA = 80; },
  ];
  for (const edit of edits) {
    const input = makeRangeInput();
    edit(timingOf(input));
    assert.equal(generateDesignProposal(input).motorProtectionTimingValidation.status, 'blocked');
  }
  const contradictory = makeRangeInput();
  contradictory.equipment[0].motor.acceleration.performanceCurve.points[0].currentA *= 1.01;
  assert.equal(generateDesignProposal(contradictory).motorProtectionTimingValidation.status, 'blocked');
  const tampered = makeRangeInput();
  const proposal = generateDesignProposal(tampered);
  proposal.motorAccelerationValidation.cases[0].timeline[0].currentA *= 1.01;
  const result = evaluateDesignSynthesisMotorProtectionTiming(proposal, proposal.motorAccelerationValidation, { equipment: tampered.equipment, criteria: tampered.criteria });
  assert.equal(result.status, 'blocked');
});

test('v2 selected-state curve failure remains a numeric failure while complete protection stays blocked', () => {
  const input = makeRangeInput();
  timingOf(input).motorWithstand.coldMinimumSafeStallCurve = [80, 100, 125].map(currentA => ({ currentA, minimumSafeStallTimeS: 100 / Math.sqrt(currentA) }));
  const result = generateDesignProposal(input).motorProtectionTimingValidation;
  assert.equal(result.status, 'fail');
  assert.equal(result.cases[0].comparisons.selectedStateSafeStall.status, 'fail');
  assert.ok(result.cases[0].devices.some(device => device.stallRangeComparison.status === 'fail'));
  assert.equal(result.completeProtectionStatus, 'blocked');
});

test('v2 evaluates the analytical interior minimum of the log-log clearing-minus-withstand margin', () => {
  const input = makeRangeInput();
  for (const device of timingOf(input).devices) {
    device.maximumTotalCircuitClearing = [80, 125].map(currentA => ({ currentA, timeS: 32 / Math.sqrt(currentA) }));
    device.minimumTrip = [80, 125].map(currentA => ({ currentA, timeS: 16 / Math.sqrt(currentA) }));
  }
  timingOf(input).motorWithstand.coldMinimumSafeStallCurve = [80, 125].map(currentA => ({ currentA, minimumSafeStallTimeS: 1000 / currentA ** 1.5 }));
  const result = generateDesignProposal(input).motorProtectionTimingValidation;
  const row = result.cases[0];
  const expectedCriticalA = 3 * 1000 / 32;
  for (const device of row.devices) {
    const comparison = device.stallRangeComparison;
    const critical = comparison.points.find(point => Math.abs(point.currentA - expectedCriticalA) < 1e-10);
    assert.ok(critical, `missing analytical interior point ${expectedCriticalA} A`);
    assert.ok(critical.marginS < comparison.points[0].marginS);
    assert.ok(critical.marginS < comparison.points.at(-1).marginS);
  }
  assert.equal(row.comparisons.selectedStateSafeStall.status, 'fail');
  assert.equal(result.completeProtectionStatus, 'blocked');
});
