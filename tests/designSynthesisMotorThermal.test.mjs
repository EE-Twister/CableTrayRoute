import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { evaluateDesignSynthesisMotorThermal, evaluateRem610ReferenceStart, validateDesignSynthesisMotorThermalInputs } from '../analysis/designSynthesisMotorThermal.mjs';
import { evaluateRem610StartupSupervision } from '../analysis/designSynthesisMotorStartupSupervision.mjs';

function startup(overrides = {}) {
  return { reference: 'Synthetic relay settings for a hypothetical study.', relayFlaPrimaryA: 20,
    relayFlaReference: 'Synthetic primary equivalent for illustration.', pickupMultipleOfFla: 5, settingTimeS: 2,
    pickupMode: 'motor-start-condition', startConditionActiveEntireTrajectory: true, speedSwitchBlocking: false, ...overrides };
}

function rem610(overrides = {}) {
  return {
    reference: 'Synthetic REM610 input for engine testing; not a device setting.',
    motorSafeStallTimeS: 100,
    motorSafeStallReference: 'Synthetic safe-stall input.',
    referenceStartCurrentA: 120,
    referenceStartCurrentReference: 'Synthetic current envelope.',
    currentScalingFactor: 1,
    ambientTemperatureC: 40,
    priorLoadCurrentA: 12.8,
    priorLoadReference: 'Synthetic prior load current.',
    permittedHotStarts: 1,
    permittedColdStarts: 2,
    startTimeMarginPct: 10,
    ...overrides,
  };
}

function referenceStart(overrides = {}) {
  return {
    ...rem610({
      motorSafeStallTimeS: 21,
      referenceStartCurrentA: 9900,
      currentScalingFactor: 1,
      ambientTemperatureC: 50,
      priorLoadCurrentA: 1485,
      permittedHotStarts: 0,
      permittedColdStarts: 2,
      startTimeMarginPct: 0,
      candidateT6xSettingS: 25,
    }),
    nameplateCurrentA: 1650,
    nameplateCurrentReference: 'ABB REM610 worked example rated current, printed p.143.',
    startupTimeS: 9,
    ...overrides,
  };
}

function synthesisInput() {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const original = input.equipment[0];
  input.equipment = [{ ...original, id: 'M-REM', tag: 'M-REM', kw: 8, voltage: 480, powerFactor: 0.86, duty: 'continuous',
    ratingsBasis: 'electrical-input-kW', motor: {
      ratedVoltageV: 460, fullLoadCurrentA: 14, fullLoadCurrentBasis: { reference: 'Synthetic motor current basis.' },
      nameplateCurrentA: 12.8, nameplateFrequencyHz: 60, lockedRotorCurrentA: 90, lockedRotorPowerFactor: 0.3, starterType: 'dol', rotorType: 'squirrel-cage',
      acceleration: { reference: 'Synthetic curve; not manufacturer data.', motorInertiaKgM2: 0.4, motorInertiaReference: 'Synthetic motor inertia.',
        loadInertiaKgM2: 0.6, loadInertiaReference: 'Synthetic coupled inertia.', targetSpeedRpm: 1000,
        performanceCurve: { reference: 'Synthetic current and torque curve.', points: [
          { speedRpm: 0, currentA: 90, powerFactor: 0.3, torqueNm: 60 },
          { speedRpm: 1000, currentA: 70, powerFactor: 0.5, torqueNm: 60 },
        ] },
        loadTorqueCurve: { reference: 'Synthetic load torque.', points: [{ speedRpm: 0, torqueNm: 10 }, { speedRpm: 1000, torqueNm: 10 }] },
      },
      rem610Thermal: rem610(),
    } }];
  input.supply = { ...input.supply, capacityKva: 10000, motorStartingImpedance: { rOhm: 0.08, xOhm: 0.16, reference: 'Synthetic source phase-ohm model.' } };
  input.criteria.motorStarting = { minimumVoltagePu: 0.1 };
  input.criteria.motorAcceleration = { maximumTimeS: 100 };
  input.criteria.loadFlow = { maxRevisions: 0 };
  input.overrides = { panelLocations: { 'DP-01': { x: 0, y: 0, z: 0 } } };
  return input;
}

test('matches ABB REM610 worked example equations with explicitly stated internal-FLA prior load', () => {
  const result = evaluateRem610ReferenceStart(referenceStart());
  assert.equal(result.status, 'evaluated', JSON.stringify(result.issues));
  assert.equal(result.normalized.internalFlaFactor, 0.9);
  assert.equal(result.normalized.referenceStartCurrentMultipleOfInternalFla, 6.666666666666667);
  assert.equal(result.normalized.priorLoadMultipleOfInternalFla, 1);
  const t25 = result.settings.find(row => row.t6xSettingS === 25);
  assert.ok(Math.abs(t25.hotOperateTimeS - 11.09605) < 0.0001);
  assert.ok(Math.abs(t25.coldOperateTimeS - 20.18948) < 0.0001);
  assert.equal(t25.nominalFeasible, true);
  assert.equal(t25.toleranceAwareFeasible, false);
  assert.deepEqual(result.feasibleRange.toleranceAwareCandidatesS, [24]);
  assert.equal(result.candidate.t6xSettingS, 25);
});

test('start-up exposure comparison uses primary phase amperes and remains nominal only', () => {
  const result = evaluateRem610StartupSupervision(startup(), { status: 'evaluated', timeS: 1, electricalExposureA2S: 5000 });
  assert.equal(result.status, 'nominal-comparison-only');
  assert.equal(result.pickupPrimaryA, 100);
  assert.equal(result.referenceExposureA2S, 20000);
  assert.equal(result.nominalExposurePercent, 25);
  assert.equal(result.tripTimeS, undefined);
  assert.equal(result.protectionStatus, undefined);
  assert.equal(evaluateRem610StartupSupervision(undefined).status, 'not-requested');
  for (const input of [startup({ pickupMultipleOfFla: 0.99 }), startup({ settingTimeS: 80.01 }), startup({ relayFlaPrimaryA: 0 }), startup({ speedSwitchBlocking: true }), startup({ startConditionActiveEntireTrajectory: false }), startup({ pickupMode: 'current-threshold' }), startup({ reference: '' }), startup({ unknown: true })]) {
    const blocked = evaluateRem610StartupSupervision(input, { status: 'evaluated', timeS: 1, electricalExposureA2S: 5000 });
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.nominalExposurePercent, undefined);
  }
  assert.equal(evaluateRem610StartupSupervision(startup(), { status: 'blocked', timeS: 1, electricalExposureA2S: 5000 }).status, 'blocked');
  assert.equal(evaluateRem610StartupSupervision(startup({ relayFlaPrimaryA: Number.MAX_VALUE }), { status: 'evaluated', timeS: 1, electricalExposureA2S: 5000 }).status, 'blocked');
});

test('start-up exposure uses the freshly verified final acceleration integral', () => {
  const input = synthesisInput();
  input.equipment[0].motor.rem610Thermal.startupSupervision = startup();
  const proposal = generateDesignProposal(input);
  const evidence = proposal.motorThermalValidation.cases[0].startupSupervision;
  assert.equal(evidence.status, 'nominal-comparison-only');
  assert.equal(evidence.accelerationExposureA2S, proposal.motorAccelerationValidation.cases[0].electricalExposureA2S);
  assert.equal(evidence.referenceExposureA2S, 20000);
  assert.ok(Math.abs(evidence.nominalExposurePercent - 100 * evidence.accelerationExposureA2S / 20000) < 1e-12);
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(item => item.code === 'MOTOR_PROTECTION_UNRESOLVED'));
  const altered = structuredClone(proposal.motorAccelerationValidation);
  altered.cases[0].electricalExposureA2S = 1;
  const mismatch = evaluateDesignSynthesisMotorThermal(proposal, altered, { equipment: input.equipment, criteria: input.criteria });
  assert.equal(mismatch.status, 'blocked');
  assert.equal(mismatch.cases[0].startupSupervision, undefined);
});

test('keeps prior amps distinct from one internal FLA and validates candidate setting grid', () => {
  const nameplatePrior = evaluateRem610ReferenceStart(referenceStart({ priorLoadCurrentA: 1650 }));
  assert.ok(Math.abs(nameplatePrior.normalized.priorLoadMultipleOfInternalFla - 1 / 0.9) < 1e-12);
  assert.ok(Math.abs(nameplatePrior.settings.find(row => row.t6xSettingS === 25).hotOperateTimeS - 8.94804) < 0.0001);
  const bad = evaluateRem610ReferenceStart(referenceStart({ candidateT6xSettingS: 25.25 }));
  assert.equal(bad.status, 'blocked');
  assert.ok(bad.issues.some(item => item.code === 'REM610_T6X_SETTING_INVALID'));
  const almostGrid = evaluateRem610ReferenceStart(referenceStart({ candidateT6xSettingS: 25.0000000001 }));
  assert.equal(almostGrid.status, 'blocked');
  assert.ok(almostGrid.issues.some(item => item.code === 'REM610_T6X_SETTING_INVALID'));
});

test('blocks recommendations when REM610 protected-unit current scaling is not the documented unit basis', () => {
  const result = evaluateRem610ReferenceStart(referenceStart({ currentScalingFactor: 1.212 }));
  assert.equal(result.status, 'blocked');
  assert.ok(result.issues.some(item => item.code === 'REM610_ACCURACY_SCALING_UNQUALIFIED'));
  assert.ok(result.feasibleRange.nominalCandidatesS.length > 0);
  assert.deepEqual(result.feasibleRange.toleranceAwareCandidatesS, []);
  assert.equal(result.candidate.nominalFeasible, true);
  assert.equal(result.candidate.toleranceAwareFeasible, false);
  assert.equal(result.timingBandBasis.currentScalingFactor, 1.212);
  assert.equal(result.timingBandBasis.status, 'unqualified-current-scaling');
});

test('blocks invalid REM610 logarithm domains, missing references, and nonfinite derived limits', () => {
  assert.ok(evaluateRem610ReferenceStart(referenceStart({ referenceStartCurrentA: 1550 })).issues.some(item => item.code === 'REM610_EQUATION_DOMAIN'));
  assert.ok(evaluateRem610ReferenceStart(referenceStart({ priorLoadCurrentA: 3000 })).issues.some(item => item.code === 'REM610_EQUATION_DOMAIN'));
  assert.ok(evaluateRem610ReferenceStart(referenceStart({ motorSafeStallReference: ' ' })).issues.some(item => item.code === 'REM610_REFERENCE_REQUIRED'));
  assert.ok(evaluateRem610ReferenceStart(referenceStart({ startupTimeS: Number.MAX_VALUE, permittedColdStarts: 64 })).issues.some(item => item.code === 'REM610_CALCULATION_RANGE'));
});

test('validates strict nested input and evaluates only a fresh finalized acceleration case', () => {
  const input = synthesisInput();
  const validation = validateDesignSynthesisMotorThermalInputs({ equipment: input.equipment });
  assert.equal(validation.requested, true);
  assert.deepEqual(validation.issues, []);
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.motorThermalValidation.status, 'evaluated', JSON.stringify(proposal.motorThermalValidation.issues));
  assert.equal(proposal.motorThermalValidation.cases[0].status, 'pass');
  assert.ok(proposal.motorThermalValidation.cases[0].recommendedT6xSettingS >= 2);
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(item => item.code === 'MOTOR_PROTECTION_UNRESOLVED'));

  const stale = { ...proposal.motorAccelerationValidation, modelInputFingerprint: 'stale' };
  const staleResult = evaluateDesignSynthesisMotorThermal(proposal, stale, { equipment: input.equipment, criteria: input.criteria });
  assert.equal(staleResult.status, 'blocked');
  assert.ok(staleResult.issues.some(item => item.code === 'REM610_ACCELERATION_FINGERPRINT_MISMATCH'));
  const unknownStatus = { ...proposal.motorAccelerationValidation, status: 'unknown' };
  const unknownResult = evaluateDesignSynthesisMotorThermal(proposal, unknownStatus, { equipment: input.equipment, criteria: input.criteria });
  assert.equal(unknownResult.status, 'blocked');
  assert.ok(unknownResult.issues.some(item => item.code === 'REM610_ACCELERATION_UNAVAILABLE'));
  const invalidEquipment = evaluateDesignSynthesisMotorThermal(proposal, proposal.motorAccelerationValidation, { equipment: {}, criteria: input.criteria });
  assert.equal(invalidEquipment.status, 'blocked');
  assert.ok(invalidEquipment.issues.some(item => item.code === 'REM610_EQUIPMENT_INVALID'));

  const changedSource = structuredClone(input.equipment);
  changedSource[0].motor.rem610Thermal.referenceStartCurrentA += 1;
  const sourceMismatch = evaluateDesignSynthesisMotorThermal(proposal, proposal.motorAccelerationValidation, { equipment: changedSource, criteria: input.criteria });
  assert.ok(sourceMismatch.cases[0].issues.some(item => item.code === 'REM610_SOURCE_CANONICAL_MISMATCH'));

  const malformedTimeline = structuredClone(proposal.motorAccelerationValidation);
  malformedTimeline.cases[0].timeline[0].currentA = Number.NaN;
  const badCurrent = evaluateDesignSynthesisMotorThermal(proposal, malformedTimeline, { equipment: input.equipment, criteria: input.criteria });
  assert.ok(badCurrent.cases[0].issues.some(item => item.code === 'REM610_CURRENT_ENVELOPE_INVALID'));
});

test('blocks an undersized reference-current envelope and malformed relay input before evaluation', () => {
  const input = synthesisInput();
  input.equipment[0].motor.rem610Thermal.referenceStartCurrentA = 80;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.motorThermalValidation.status, 'blocked');
  assert.ok(proposal.motorThermalValidation.issues.some(item => item.code === 'REM610_REFERENCE_CURRENT_TOO_LOW'));

  const malformed = synthesisInput();
  malformed.equipment[0].motor.rem610Thermal.extra = true;
  const invalid = validateDesignSynthesisMotorThermalInputs({ equipment: malformed.equipment });
  assert.ok(invalid.issues.some(item => item.code === 'REM610_UNKNOWN_FIELD'));
  const blocked = generateDesignProposal(malformed);
  assert.equal(blocked.motorThermalValidation.status, 'blocked');
});

test('rejects altered acceleration output even when its input fingerprint is unchanged', () => {
  const input = synthesisInput();
  const proposal = generateDesignProposal(input);
  for (const change of [
    altered => { altered.cases[0].timeS = 0.001; altered.cases[0].timeline.at(-1).timeS = 0.001; },
    altered => { altered.cases[0].timeline[0].currentA *= 0.9; },
    altered => { altered.cases[0].electricalExposureA2S *= 0.9; },
    altered => { altered.cases.push(structuredClone(altered.cases[0])); },
  ]) {
    const altered = structuredClone(proposal.motorAccelerationValidation);
    change(altered);
    const result = evaluateDesignSynthesisMotorThermal(proposal, altered, { equipment: input.equipment, criteria: input.criteria });
    assert.equal(result.status, 'blocked');
    assert.ok(result.issues.some(item => item.code === 'REM610_ACCELERATION_RESULT_MISMATCH'));
    assert.equal(result.cases[0].recommendedT6xSettingS, undefined);
  }
});
