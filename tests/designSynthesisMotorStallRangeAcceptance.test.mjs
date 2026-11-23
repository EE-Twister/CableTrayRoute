import assert from 'node:assert/strict';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { evaluateDesignSynthesisMotorProtectionTiming, validateDesignSynthesisMotorProtectionTimingInputs } from '../analysis/designSynthesisMotorProtectionTiming.mjs';
import { motorStallRangeFixture } from './helpers/motorStallRangeFixture.mjs';
import { protectionTimingFixture } from './helpers/motorProtectionTimingFixture.mjs';
import { physicalStart, magnitude } from './helpers/motorNetworkOracle.mjs';

const near = (actual, expected, tolerance = 1e-9) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} versus ${expected}`);
const timingOf = input => input.equipment[0].motor.protectionTiming;
const resultOf = input => generateDesignProposal(input).motorProtectionTimingValidation;
const evaluate = (proposal, input, acceleration = proposal.motorAccelerationValidation) => evaluateDesignSynthesisMotorProtectionTiming(proposal, acceleration, { equipment: input.equipment, criteria: input.criteria });
const rowOf = result => result.cases[0];
const constant = value => [{ currentA: 80, minimumSafeStallTimeS: value }, { currentA: 125, minimumSafeStallTimeS: value }];

function assertArithmetic(proposal, input) {
  const result = proposal.motorProtectionTimingValidation;
  assert.equal(result.status, 'pass', JSON.stringify(result));
  const row = rowOf(result);
  const { volts } = physicalStart(input, proposal, 'LOAD-1');
  const voltageV = Math.sqrt(3) * magnitude(volts.get('LOAD-1'));
  const currentA = 90 * voltageV / 460;
  near(row.networkLockedRotorCurrentA.valueA, currentA, 1e-7);
  near(row.networkLockedRotorCurrentA.terminalVoltagePu, voltageV / 480, 1e-7);
  assert.equal(row.networkLockedRotorCurrentA.status, 'recomputed-and-matched-to-acceleration');
  assert.equal(row.comparisons.selectedStateSafeStall.referenceCurrentOnly, false);
  for (const device of row.devices) {
    const upperCoefficient = device.role === 'branch-breaker' ? 200000 : 160000;
    const lowerCoefficient = device.role === 'branch-breaker' ? 100000 : 90000;
    const comparison = device.stallRangeComparison;
    assert.equal(comparison.status, 'pass');
    assert.ok(comparison.points.some(point => point.currentA === row.networkLockedRotorCurrentA.valueA));
    for (const point of comparison.points) {
      near(point.minimumTripS, lowerCoefficient / point.currentA ** 2);
      near(point.maximumTotalCircuitClearingS, upperCoefficient / point.currentA ** 2);
      near(point.minimumSafeStallTimeS, 400000 / point.currentA ** 2);
      near(point.marginS, (400000 - upperCoefficient) / point.currentA ** 2);
    }
    near(comparison.limitingCurrentA, 110);
    near(comparison.minimumMarginS, (400000 - upperCoefficient) / 110 ** 2);
  }
  assert.equal(row.otherInitialState.status, 'not-evaluated');
  assert.equal(row.evidenceClass, 'synthetic');
  assert.equal(row.evidenceStatus, 'supplied-unverified');
  assert.equal(result.completeProtectionStatus, 'blocked');
  assert.equal(proposal.status, 'blocked');
  assert.equal(proposal.distributionBaseline, null);
  assert.ok(proposal.issues.some(issue => issue.code === 'MOTOR_PROTECTION_UNRESOLVED'));
}

test('the supplied range uses an independently solved nominal network and exact power-law time bounds', () => {
  const input = motorStallRangeFixture();
  const before = structuredClone(input);
  assertArithmetic(generateDesignProposal(input), input);
  assert.deepEqual(input, before);
});

test('a legacy reference-current pass cannot hide a slower unsafe bound at the actual lower stalled current', () => {
  const legacy = protectionTimingFixture();
  timingOf(legacy).motorWithstand.coldMinimumSafeStallTimeS = 17;
  assert.equal(resultOf(legacy).status, 'pass');
  const input = motorStallRangeFixture();
  timingOf(input).motorWithstand.coldMinimumSafeStallCurve = constant(17);
  timingOf(input).motorWithstand.hotMinimumSafeStallCurve = constant(10);
  const result = resultOf(input);
  assert.equal(result.status, 'fail');
  const row = rowOf(result);
  assert.equal(row.comparisons.startupRideThrough.status, 'pass');
  assert.ok(row.networkLockedRotorCurrentA.valueA < 100);
  for (const device of row.devices) {
    const point = device.stallRangeComparison.points.find(item => item.currentA === row.networkLockedRotorCurrentA.valueA);
    assert.ok(point.maximumTotalCircuitClearingS > 17);
    assert.ok(point.marginS < 0);
    assert.equal(point.status, 'fail');
  }
});

test('the true worst seconds margin includes an interior extremum, proved by completing a square', () => {
  const input = motorStallRangeFixture();
  const timing = timingOf(input);
  timing.stallCurrentRangeA.maximumA = 125;
  timing.motorWithstand.coldMinimumSafeStallCurve = [{ currentA: 80, minimumSafeStallTimeS: 1.44 }, { currentA: 125, minimumSafeStallTimeS: 0.589824 }];
  timing.motorWithstand.hotMinimumSafeStallCurve = [{ currentA: 80, minimumSafeStallTimeS: 0.72 }, { currentA: 125, minimumSafeStallTimeS: 0.294912 }];
  for (const device of timing.devices) device.minimumTrip = [{ currentA: 80, timeS: 0.01 }, { currentA: 125, timeS: 0.01 }];
  timing.devices[0].maximumTotalCircuitClearing = [{ currentA: 80, timeS: 2.4 }, { currentA: 125, timeS: 1.536 }];
  timing.devices[1].maximumTotalCircuitClearing = [{ currentA: 80, timeS: 0.02 }, { currentA: 125, timeS: 0.02 }];
  const result = resultOf(input);
  assert.equal(result.status, 'fail');
  const comparison = rowOf(result).devices[0].stallRangeComparison;
  // 9216/I² - 192/I = (96/I - 1)² - 1. Its minimum is
  // exactly -1 s at 96 A, neither a supplied knot nor the reference current.
  near(comparison.limitingCurrentA, 96);
  near(comparison.minimumMarginS, -1);
  near(rowOf(result).comparisons.selectedStateSafeStall.limitingCurrentA, 96);
});

test('running/accelerating currents below the stalled range do not become invented stall conditions', () => {
  const input = motorStallRangeFixture();
  input.equipment[0].motor.acceleration.performanceCurve.points.at(-1).currentA = 60;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.motorProtectionTimingValidation.status, 'pass', JSON.stringify(proposal.motorProtectionTimingValidation));
  assert.ok(proposal.motorAccelerationValidation.cases[0].timeline.some(point => point.currentA < 80));
  assert.ok(rowOf(proposal.motorProtectionTimingValidation).networkLockedRotorCurrentA.valueA > 80);
});

test('finite steep curves retain their interior minimum without overflowing a power-law coefficient', () => {
  const input = motorStallRangeFixture();
  const timing = timingOf(input);
  const points = [80, 125];
  timing.motorWithstand.coldMinimumSafeStallCurve = points.map(currentA => ({ currentA, minimumSafeStallTimeS: 0.995 * (96 / currentA) ** 200 }));
  timing.motorWithstand.hotMinimumSafeStallCurve = points.map(currentA => ({ currentA, minimumSafeStallTimeS: 0.5 * (96 / currentA) ** 200 }));
  timing.devices[0].maximumTotalCircuitClearing = points.map(currentA => ({ currentA, timeS: (96 / currentA) ** 199 }));
  timing.devices[0].minimumTrip = timing.devices[0].maximumTotalCircuitClearing.map(point => ({ ...point, timeS: point.timeS / 2 }));
  timing.devices[1].maximumTotalCircuitClearing = points.map(currentA => ({ currentA, timeS: 0.25 * (96 / currentA) ** 200 }));
  timing.devices[1].minimumTrip = timing.devices[1].maximumTotalCircuitClearing.map(point => ({ ...point, timeS: point.timeS / 2 }));
  const result = resultOf(input);
  assert.equal(result.status, 'fail');
  const comparison = rowOf(result).devices[0].stallRangeComparison;
  near(comparison.limitingCurrentA, 96, 1e-8);
  near(comparison.minimumMarginS, -0.005, 1e-8);
});

test('missing range or finite curve coverage blocks numbers instead of extrapolating a scalar withstand', () => {
  const changes = [
    timing => { delete timing.stallCurrentRangeA; },
    timing => { timing.stallCurrentRangeA.minimumA = 79; },
    timing => { timing.stallCurrentRangeA.maximumA = 126; },
    timing => { timing.motorWithstand.coldMinimumSafeStallCurve = [{ currentA: 90, minimumSafeStallTimeS: 40 }, { currentA: 125, minimumSafeStallTimeS: 25 }]; },
    timing => { timing.motorWithstand.coldMinimumSafeStallTimeS = 1000; },
  ];
  for (const change of changes) {
    const input = motorStallRangeFixture();
    change(timingOf(input));
    const result = resultOf(input);
    assert.equal(result.status, 'blocked', JSON.stringify(result));
    assert.ok(result.cases.every(row => !row.devices));
  }
});

test('tampered acceleration or cached starting numbers cannot survive a fresh locked-rotor solve', () => {
  const input = motorStallRangeFixture();
  const proposal = generateDesignProposal(input);
  for (const change of [
    copy => { copy.motorAccelerationValidation.cases[0].timeline[0].currentA *= 0.95; },
    copy => { copy.motorAccelerationValidation.cases[0].timeline[0].terminalVoltagePu *= 0.95; },
    copy => { copy.motorStartingValidation.cases[0].motorCurrentA *= 0.95; },
    copy => { delete copy.motorStartingValidation.cases[0].motorCurrentA; },
    copy => { copy.motorStartingValidation.cases[0].motorVoltagePu = Number.NaN; },
    copy => { copy.motorStartingValidation.cases[0].motorCurrentA = String(copy.motorStartingValidation.cases[0].motorCurrentA); },
    copy => { copy.motorStartingValidation.cases.push(structuredClone(copy.motorStartingValidation.cases[0])); },
    copy => { copy.motorStartingValidation.cases[0].converged = false; },
    copy => { copy.cables[0].r_ohm_per_kft *= 1.2; },
  ]) {
    const copy = structuredClone(proposal);
    change(copy);
    assert.equal(evaluate(copy, input).status, 'blocked');
  }
});

test('contradictory locked-rotor and performance-current/PF bases cannot be reconciled by an implicit tolerance', () => {
  for (const field of ['currentA', 'powerFactor']) {
    const input = motorStallRangeFixture();
    input.equipment[0].motor.acceleration.performanceCurve.points[0][field] *= 0.95;
    assert.equal(resultOf(input).status, 'blocked');
  }
});

test('only the selected hot/cold condition is compared and its exact voltage applicability remains required', () => {
  const input = motorStallRangeFixture();
  timingOf(input).motorWithstand.hotMinimumSafeStallCurve = constant(10);
  assert.equal(resultOf(input).status, 'pass');
  timingOf(input).initialState = 'hot';
  for (const device of timingOf(input).devices) device.conditions.initialState = 'hot';
  assert.equal(resultOf(input).status, 'fail');
  timingOf(input).motorWithstand.hotConditions.voltageRangeV = [480, 500];
  assert.equal(resultOf(input).status, 'blocked');
});

test('zero and floating-point-sized positive margins cannot pass through interpolation roundoff', () => {
  for (const factor of [1, 1 + Number.EPSILON]) {
    const input = motorStallRangeFixture();
    timingOf(input).motorWithstand.coldMinimumSafeStallCurve = timingOf(input).devices[0].maximumTotalCircuitClearing.map(point => ({ currentA: point.currentA, minimumSafeStallTimeS: point.timeS * factor }));
    const result = resultOf(input);
    assert.equal(result.status, 'fail');
    assert.equal(rowOf(result).devices[0].stallRangeComparison.status, 'fail');
  }
});

test('the declared stalled range must actually contain the separately recomputed nominal locked-rotor point', () => {
  const input = motorStallRangeFixture();
  timingOf(input).stallCurrentRangeA = { minimumA: 100, maximumA: 110, reference: 'Synthetic range deliberately excluding the known nominal network point.' };
  const result = resultOf(input);
  assert.equal(result.status, 'blocked');
  assert.ok(result.cases.every(row => !row.devices));
});

test('strict range and curve validation rejects coercion, unknown fields and malformed points without throwing', () => {
  for (const change of [
    timing => { timing.stallCurrentRangeA.minimumA = '80'; },
    timing => { timing.stallCurrentRangeA.minimumA = 0; },
    timing => { timing.stallCurrentRangeA.extra = true; },
    timing => { timing.motorWithstand.coldMinimumSafeStallCurve = null; },
    timing => { timing.motorWithstand.coldMinimumSafeStallCurve[1].minimumSafeStallTimeS = 100; },
  ]) {
    const input = motorStallRangeFixture();
    change(timingOf(input));
    assert.doesNotThrow(() => validateDesignSynthesisMotorProtectionTimingInputs(input));
    assert.equal(resultOf(input).status, 'blocked');
  }
});

test('a mixed-version motor project keeps each reference-only and range comparison distinct', () => {
  const input = motorStallRangeFixture();
  const second = input.equipment[1];
  input.equipment[1] = { ...structuredClone(input.equipment[0]), id: second.id, tag: second.tag, x: second.x, y: second.y, z: second.z };
  input.equipment[1].motor.protectionTiming = timingOf(protectionTimingFixture());
  const result = resultOf(input);
  assert.equal(result.status, 'pass', JSON.stringify(result));
  assert.equal(result.cases.length, 2);
  const legacy = result.cases.find(row => row.schemaVersion === '1.0.0');
  const range = result.cases.find(row => row.schemaVersion === '2.0.0');
  assert.ok(legacy && range);
  assert.equal(legacy.comparisons.selectedStateSafeStall.referenceCurrentOnly, true);
  assert.equal(legacy.networkLockedRotorCurrentA, undefined);
  assert.equal(range.comparisons.selectedStateSafeStall.referenceCurrentOnly, false);
  assert.ok(range.networkLockedRotorCurrentA.valueA > 80);
});

for (const [count, maximumTimeS] of [[25, 2.03], [50, 2.045]]) test(`${count}-load revised network supplies the final stall point and curve comparison`, () => {
  const input = motorStallRangeFixture(count);
  input.criteria.loadFlow.maxRevisions = 1;
  input.criteria.motorAcceleration.maximumTimeS = maximumTimeS;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.motorAccelerationValidation.revision.status, 'complete');
  assertArithmetic(proposal, input);
});
