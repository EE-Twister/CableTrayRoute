import assert from 'node:assert/strict';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { evaluateRem610ReferenceStart, evaluateDesignSynthesisMotorThermal } from '../analysis/designSynthesisMotorThermal.mjs';
import { motorRevisionFixture } from './helpers/motorAccelerationRevisionFixture.mjs';

function referenceInput() {
  return {
    reference: 'Source-inspired REM610 equation reference case with explicit unit scaling; not the actual p.143 CT configuration.',
    currentScalingFactor: 1,
    nameplateCurrentA: 1650, nameplateCurrentReference: 'ABB example nameplate current, p.143.',
    referenceStartCurrentA: 9900, referenceStartCurrentReference: 'ABB example six times nameplate FLA.',
    ambientTemperatureC: 50, priorLoadCurrentA: 1485, priorLoadReference: 'Explicit one-times internal FLA; not 1650 A nameplate FLA.',
    motorSafeStallTimeS: 21, motorSafeStallReference: 'ABB example supplied safe-stall time at its stated application conditions.',
    startupTimeS: 9, permittedHotStarts: 1, permittedColdStarts: 2, startTimeMarginPct: 0, candidateT6xSettingS: 25,
  };
}

// Independent exponential threshold solution: bisection avoids the runtime
// logarithmic formula, settings helper, FLA adjustment, and timing-band helpers.
function thresholdTime(q, r, setting) {
  let lower = 0;
  let upper = 10000;
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const time = (lower + upper) / 2;
    const level = q ** 2 - (q ** 2 - 0.5 * r ** 2) * Math.exp(-time / (32.15 * setting));
    if (level < 1.1025) lower = time;
    else upper = time;
  }
  return (lower + upper) / 2;
}

const near = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-8 * Math.max(1, Math.abs(expected)), `${actual} versus ${expected}`);

function independentSettings(q, r, startupTimeS, hotCount, coldCount, marginPct, safeStallS) {
  const settings = [];
  for (let halfSeconds = 4; halfSeconds <= 240; halfSeconds += 1) {
    const setting = halfSeconds / 2;
    const hot = thresholdTime(q, r, setting);
    const cold = thresholdTime(q, 0, setting);
    if (hot - Math.max(1, hot * 0.05, setting * 0.05) >= hotCount * startupTimeS * (1 + marginPct / 100)
      && cold - Math.max(1, cold * 0.05, setting * 0.05) >= coldCount * startupTimeS * (1 + marginPct / 100)
      && cold + Math.max(1, cold * 0.05, setting * 0.05) <= safeStallS) settings.push(setting);
  }
  return settings;
}

test('REM610 reference arithmetic preserves explicit prior amps and separates nominal from assumed-envelope feasibility', () => {
  const input = referenceInput();
  const before = structuredClone(input);
  const result = evaluateRem610ReferenceStart(input);
  assert.equal(result.status, 'evaluated', JSON.stringify(result));
  assert.deepEqual(input, before);
  near(result.normalized.internalFlaA, 1485);
  near(result.normalized.priorLoadMultipleOfInternalFla, 1);
  near(result.candidate.hotOperateTimeS, 11.09604996371491);
  near(result.candidate.coldOperateTimeS, 20.189484483559674);
  near(result.candidate.hotOperateTimeS, thresholdTime(20 / 3, 1, 25));
  near(result.candidate.coldOperateTimeS, thresholdTime(20 / 3, 0, 25));
  assert.equal(result.candidate.nominalFeasible, true);
  assert.equal(result.candidate.toleranceAwareFeasible, false, 'This unit-scaling reference is not a qualification of the published nonunit-scaling application.');
  assert.deepEqual(result.feasibleRange.toleranceAwareCandidatesS, [24]);
  assert.deepEqual(result.feasibleRange.toleranceAwareCandidatesS, independentSettings(20 / 3, 1, 9, 1, 2, 0, 21));

  input.priorLoadCurrentA = 1650;
  const nameplatePrior = evaluateRem610ReferenceStart(input);
  near(nameplatePrior.normalized.priorLoadMultipleOfInternalFla, 10 / 9);
  near(nameplatePrior.candidate.hotOperateTimeS, 8.948042496362484);
  assert.deepEqual(nameplatePrior.feasibleRange.toleranceAwareCandidatesS, [], 'Do not silently replace a supplied nameplate prior current with one-times internal FLA.');

  const actualSourceScaling = evaluateRem610ReferenceStart({ ...before, currentScalingFactor: 2000 / 1650 });
  assert.equal(actualSourceScaling.status, 'blocked', 'The actual worked-example CT scaling is outside the stated accuracy qualification.');
  assert.ok(actualSourceScaling.issues.some(row => row.code === 'REM610_ACCURACY_SCALING_UNQUALIFIED'));
});

test('ambient breakpoints and setting lattice use the manufacturer units and endpoints', () => {
  for (const [ambientTemperatureC, factor] of [[0, 1.09], [20, 1.09], [39, 1.0045], [40, 1], [41, 0.99], [65, 0.75], [66, 0.75], [70, 0.75]]) {
    const result = evaluateRem610ReferenceStart({ ...referenceInput(), priorLoadCurrentA: 0, ambientTemperatureC });
    assert.equal(result.status, 'evaluated');
    near(result.normalized.internalFlaFactor, factor);
    assert.equal(result.settings.length, 237);
    assert.equal(result.settings[0].t6xSettingS, 2);
    assert.equal(result.settings.at(-1).t6xSettingS, 120);
    assert.ok(result.settings.every(row => Number.isInteger(row.t6xSettingS * 2)));
  }
});

test('missing references, invalid model domains, unsupported settings and arithmetic overflow stay blocked', () => {
  for (const change of [
    { reference: '' }, { nameplateCurrentReference: null }, { candidateT6xSettingS: 2.1 }, { candidateT6xSettingS: 25.0000000001 }, { candidateT6xSettingS: '25' },
    { ambientTemperatureC: -1 }, { ambientTemperatureC: 71 }, { priorLoadCurrentA: 3300 },
    { referenceStartCurrentA: 1.2 * 1650, ambientTemperatureC: 40 },
    { startupTimeS: Number.MAX_VALUE, permittedHotStarts: 64 },
    { nameplateCurrentA: Number.MIN_VALUE }, { referenceStartCurrentA: Number.MAX_VALUE },
    { relayModel: 'another-relay' }, { currentScalingFactor: 0 }, { currentScalingFactor: '1' },
  ]) {
    const result = evaluateRem610ReferenceStart({ ...referenceInput(), ...change });
    assert.equal(result.status, 'blocked', JSON.stringify({ change, result }));
  }
});

function syntheticThermal() {
  return { reference: 'Synthetic REM610 setting example; no actual relay or motor approval.', currentScalingFactor: 1, motorSafeStallTimeS: 10,
    motorSafeStallReference: 'Synthetic 10 s limit at the stated 100 A reference current.',
    referenceStartCurrentA: 100, referenceStartCurrentReference: 'Synthetic 100 A constant current covers the nominal curve-current bound.',
    ambientTemperatureC: 40, priorLoadCurrentA: 12.8, priorLoadReference: 'Explicit synthetic prior current, amps.',
    permittedHotStarts: 1, permittedColdStarts: 2, startTimeMarginPct: 10 };
}

test('thermal edits, foreign input records and malformed final-current evidence cannot reuse a passing result', () => {
  const input = motorRevisionFixture(2);
  input.equipment[0].motor.rem610Thermal = syntheticThermal();
  const proposal = generateDesignProposal(input);
  const result = proposal.motorThermalValidation;
  assert.equal(result.status, 'evaluated');

  const foreign = structuredClone(input.equipment);
  foreign[0].motor.rem610Thermal.motorSafeStallTimeS = 1;
  const mismatch = evaluateDesignSynthesisMotorThermal(proposal, proposal.motorAccelerationValidation, { equipment: foreign, criteria: input.criteria });
  assert.equal(mismatch.status, 'blocked');
  assert.ok(mismatch.issues.some(row => row.code === 'REM610_SOURCE_CANONICAL_MISMATCH'));
  assert.notEqual(mismatch.modelInputFingerprint, result.modelInputFingerprint);

  const malformed = structuredClone(proposal.motorAccelerationValidation);
  malformed.cases[0].timeline[0].currentA = null;
  const badCurrent = evaluateDesignSynthesisMotorThermal(proposal, malformed, { criteria: input.criteria });
  assert.equal(badCurrent.status, 'blocked');
  assert.ok(badCurrent.issues.some(row => row.code === 'REM610_CURRENT_ENVELOPE_INVALID'));

  input.equipment[0].motor.rem610Thermal.candidateT6xSettingS = 2;
  const tooEarly = generateDesignProposal(input);
  assert.equal(tooEarly.motorThermalValidation.status, 'fail');
  assert.equal(tooEarly.motorThermalValidation.cases[0].candidateT6xSettingS, 2);
  assert.equal(tooEarly.motorThermalValidation.cases[0].calculations.candidate.toleranceAwareFeasible, false);
  assert.notEqual(tooEarly.motorThermalValidation.modelInputFingerprint, result.modelInputFingerprint);

  delete input.equipment[0].motor.rem610Thermal.candidateT6xSettingS;
  input.equipment[0].motor.rem610Thermal.referenceStartCurrentA = 90;
  const understatedCurrent = generateDesignProposal(input);
  assert.equal(understatedCurrent.motorThermalValidation.status, 'blocked');
  assert.ok(understatedCurrent.motorThermalValidation.issues.some(row => row.code === 'REM610_REFERENCE_CURRENT_TOO_LOW'));

  input.equipment[0].motor.rem610Thermal = syntheticThermal();
  delete input.equipment[0].motor.acceleration;
  delete input.criteria.motorAcceleration;
  const missingAcceleration = generateDesignProposal(input);
  assert.equal(missingAcceleration.motorThermalValidation.status, 'blocked');
});

for (const count of [25, 50]) {
  test(`${count} loads: thermal candidate uses final revised acceleration time and retains unresolved motor protection`, () => {
    const input = motorRevisionFixture(count);
    input.criteria.loadFlow.maxRevisions = 1;
    input.criteria.motorAcceleration.maximumTimeS = count === 25 ? 2.03 : 2.045;
    input.equipment[0].motor.rem610Thermal = syntheticThermal();
    input.equipment[0].motor.rem610Thermal.startupSupervision = {
      reference: 'Synthetic start setting', relayFlaPrimaryA: 20, relayFlaReference: 'Synthetic relay FLA',
      pickupMultipleOfFla: 5, settingTimeS: 2, pickupMode: 'motor-start-condition',
      startConditionActiveEntireTrajectory: true, speedSwitchBlocking: false,
    };
    const before = structuredClone(input);
    const proposal = generateDesignProposal(input);
    assert.deepEqual(input, before);
    const acceleration = proposal.motorAccelerationValidation;
    assert.equal(acceleration.revision.status, 'complete');
    const result = proposal.motorThermalValidation;
    assert.equal(result.status, 'evaluated', JSON.stringify(result));
    const row = result.cases[0];
    assert.equal(row.status, 'pass');
    near(row.startupTimeS, acceleration.cases[0].timeS);
    assert.equal(row.startupSupervision.status, 'nominal-comparison-only');
    near(row.startupSupervision.nominalExposurePercent, acceleration.cases[0].electricalExposureA2S / 20000 * 100);
    const expected = independentSettings(100 / 12.8, 1, acceleration.cases[0].timeS, 1, 2, 10, 10);
    assert.deepEqual(row.calculations.feasibleRange.toleranceAwareCandidatesS, expected);
    assert.equal(row.recommendedT6xSettingS, expected[0]);
    assert.equal(proposal.status, 'blocked');
    assert.equal(proposal.distributionBaseline, null);
    assert.ok(proposal.issues.some(item => item.code === 'MOTOR_PROTECTION_UNRESOLVED'));
    assert.ok(proposal.cables.every(item => item.motor?.overloadProtectionStatus !== 'resolved'));

    const changed = structuredClone(proposal);
    changed.loads[0].motor.rem610Thermal.motorSafeStallTimeS = 1;
    const stale = evaluateDesignSynthesisMotorThermal(changed, acceleration, { criteria: input.criteria });
    assert.equal(stale.status, 'blocked');
    assert.notEqual(stale.modelInputFingerprint, result.modelInputFingerprint);
  });
}
