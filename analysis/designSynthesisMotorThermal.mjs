import { designSynthesisMotorAccelerationFingerprint, evaluateDesignSynthesisMotorAcceleration, sameDesignSynthesisAccelerationCase } from './designSynthesisMotorAcceleration.mjs';
import { fingerprintStudyValue } from './studyLifecycle.mjs';
import { evaluateRem610StartupSupervision } from './designSynthesisMotorStartupSupervision.mjs';

const METHOD = 'abb-rem610-ansi-e-c-2011-dol-start-setting-screen-v1';
const RELAY_REFERENCE = 'ABB REM610 Motor Protection Relay Technical Reference Manual - ANSI Version, 1MRS755537, Version E / IED Revision C, 18 November 2011';
const PERCENT_WEIGHTING = 50;
const MIN_T6X_S = 2;
const MAX_T6X_S = 120;
const T6X_STEP_S = 0.5;
const LIMITATIONS = [
  'REM610-specific DOL setting feasibility screen based on the 2011 ANSI manual equations; it is not transferable to another relay family.',
  'The setting equations use one explicitly referenced constant start current and do not integrate the variable acceleration current timeline or model retained thermal history and cooling between starts.',
  'The timing band is an assumed reference envelope only for a protected-unit/CT full-load current scaling factor of exactly 1.0; the manual does not define the quoted ±5% accuracy basis as an unambiguous Eq. 7 timing tolerance.',
  'The ABB thermal equations omit cooling between starts. The optional start-up exposure comparison does not establish actual start-supervision operation, restart-inhibit, CT wiring/configuration, short-circuit protection, coordination, or motor thermal-damage validation.',
  'The feasible setting and optional recommendation are preliminary alternatives only; they do not represent an installed relay setting, protection adequacy, qualified review, or approval.'
];

const finite = value => typeof value === 'number' && Number.isFinite(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const issue = (code, path, message) => ({ code, path, message, severity: 'blocking' });

const REM610_KEYS = [
  'reference', 'motorSafeStallTimeS', 'motorSafeStallReference', 'referenceStartCurrentA', 'referenceStartCurrentReference',
  'currentScalingFactor', 'ambientTemperatureC', 'priorLoadCurrentA', 'priorLoadReference', 'permittedHotStarts', 'permittedColdStarts',
  'startTimeMarginPct', 'candidateT6xSettingS', 'startupSupervision'
];

export function validateDesignSynthesisMotorThermalInputs({ equipment } = {}) {
  const issues = [];
  if (equipment !== undefined && !Array.isArray(equipment)) {
    issues.push(issue('REM610_EQUIPMENT_INVALID', 'equipment', 'equipment must be an array when supplied.'));
    return { requested: false, issues };
  }
  const motors = (Array.isArray(equipment) ? equipment : []).filter(item => object(item?.motor));
  const requested = motors.some(item => item.motor.rem610Thermal !== undefined);
  for (const item of motors) {
    const data = item.motor.rem610Thermal;
    if (data === undefined) continue;
    const path = `equipment.${String(item.id ?? 'unknown')}.motor.rem610Thermal`;
    if (!object(data)) {
      issues.push(issue('REM610_INPUT_REQUIRED', path, 'A complete REM610 thermal-screen input object is required.'));
      continue;
    }
    for (const key of Object.keys(data)) if (!REM610_KEYS.includes(key)) issues.push(issue('REM610_UNKNOWN_FIELD', `${path}.${key}`, 'Field is not part of the REM610 thermal-screen contract.'));
    if (data.startupSupervision !== undefined) {
      const startup = evaluateRem610StartupSupervision(data.startupSupervision, { status: 'evaluated', timeS: 1, electricalExposureA2S: 1 });
      issues.push(...(startup.issues || []).map(item => ({ ...item, path: `${path}.${item.path}` })));
    }
    for (const key of ['reference', 'motorSafeStallReference', 'referenceStartCurrentReference', 'priorLoadReference']) {
      if (!text(data[key])) issues.push(issue('REM610_REFERENCE_REQUIRED', `${path}.${key}`, `${key} must be a non-blank source or configuration reference.`));
    }
    if (!finite(data.motorSafeStallTimeS) || data.motorSafeStallTimeS <= 0) issues.push(issue('REM610_SAFE_STALL_INVALID', `${path}.motorSafeStallTimeS`, 'Motor safe-stall time must be positive finite seconds.'));
    if (!finite(data.referenceStartCurrentA) || data.referenceStartCurrentA <= 0) issues.push(issue('REM610_REFERENCE_CURRENT_INVALID', `${path}.referenceStartCurrentA`, 'Reference start current must be positive finite amperes.'));
    if (!finite(data.currentScalingFactor) || data.currentScalingFactor <= 0) issues.push(issue('REM610_CURRENT_SCALING_INVALID', `${path}.currentScalingFactor`, 'Current scaling factor must be a positive finite value explicitly recorded for this relay application.'));
    if (!finite(data.ambientTemperatureC) || data.ambientTemperatureC < 0 || data.ambientTemperatureC > 70) issues.push(issue('REM610_AMBIENT_INVALID', `${path}.ambientTemperatureC`, 'REM610 configured ambient temperature must be from 0 through 70 °C.'));
    if (!finite(data.priorLoadCurrentA) || data.priorLoadCurrentA < 0) issues.push(issue('REM610_PRIOR_CURRENT_INVALID', `${path}.priorLoadCurrentA`, 'Prior load current must be finite nonnegative amperes.'));
    for (const key of ['permittedHotStarts', 'permittedColdStarts']) {
      if (!Number.isInteger(data[key]) || data[key] < 0 || data[key] > 64) issues.push(issue('REM610_START_COUNT_INVALID', `${path}.${key}`, `${key} must be an integer from zero through 64.`));
    }
    if (Number.isInteger(data.permittedHotStarts) && Number.isInteger(data.permittedColdStarts) && data.permittedHotStarts + data.permittedColdStarts < 1) {
      issues.push(issue('REM610_START_COUNT_REQUIRED', path, 'At least one permitted hot or cold start must be specified.'));
    }
    if (!finite(data.startTimeMarginPct) || data.startTimeMarginPct < 0 || data.startTimeMarginPct > 100) issues.push(issue('REM610_MARGIN_INVALID', `${path}.startTimeMarginPct`, 'Start-time margin must be from zero through 100 percent.'));
    if (data.candidateT6xSettingS !== undefined && (!finite(data.candidateT6xSettingS) || data.candidateT6xSettingS < MIN_T6X_S || data.candidateT6xSettingS > MAX_T6X_S || !Number.isInteger(data.candidateT6xSettingS * 2))) {
      issues.push(issue('REM610_T6X_SETTING_INVALID', `${path}.candidateT6xSettingS`, 'candidateT6xSettingS must be an available REM610 setting from 2.0 through 120.0 seconds in 0.5-second steps.'));
    }
    if (!object(item.motor.acceleration)) issues.push(issue('REM610_ACCELERATION_REQUIRED', path, 'A complete motor.acceleration model is required to evaluate the REM610 screen.'));
    if (!finite(item.motor.nameplateCurrentA) || item.motor.nameplateCurrentA <= 0 || !text(item.motor.fullLoadCurrentBasis?.reference)) {
      issues.push(issue('REM610_NAMEPLATE_CURRENT_REQUIRED', path, 'A positive nameplateCurrentA and its referenced fullLoadCurrentBasis are required.'));
    }
    if (item.motor.starterType !== 'dol' || item.motor.rotorType !== 'squirrel-cage') issues.push(issue('REM610_MOTOR_TYPE_UNSUPPORTED', path, 'This REM610 screen is limited to an explicitly identified DOL squirrel-cage motor.'));
  }
  return { requested, issues };
}

function internalFlaFactor(ambientTemperatureC) {
  if (ambientTemperatureC < 20) return 1.09;
  if (ambientTemperatureC < 40) return 1.18 - ambientTemperatureC * 0.09 / 20;
  if (ambientTemperatureC === 40) return 1;
  if (ambientTemperatureC <= 65) return 1 - (ambientTemperatureC - 40) / 100;
  return 0.75;
}

function operationCoefficient(q, r, weightingFactor = PERCENT_WEIGHTING) {
  const qSquared = q ** 2;
  const weightedPriorSquared = weightingFactor / 100 * r ** 2;
  if (!finite(qSquared) || !finite(weightedPriorSquared) || qSquared <= 1.1025 || weightedPriorSquared >= 1.1025) return null;
  const denominator = qSquared - 1.1025;
  if (!(denominator > 0)) return null;
  const logIncrement = (1.1025 - weightedPriorSquared) / denominator;
  if (!(logIncrement > -1) || !finite(logIncrement)) return null;
  const value = 32.15 * Math.log1p(logIncrement);
  return finite(value) && value > 0 ? value : null;
}

function makeSettingRows({ hotCoefficient, coldCoefficient, hotRequiredS, coldRequiredS, safeStallS, individualStartWithinSafeStall, timingBandQualified }) {
  const rows = [];
  const minimumT6xS = Math.max(MIN_T6X_S, hotRequiredS / hotCoefficient, coldRequiredS / coldCoefficient);
  const maximumT6xS = safeStallS / coldCoefficient;
  for (let index = 0; index <= Math.round((MAX_T6X_S - MIN_T6X_S) / T6X_STEP_S); index += 1) {
    const t6xSettingS = MIN_T6X_S + index * T6X_STEP_S;
    const hotOperateTimeS = hotCoefficient * t6xSettingS;
    const coldOperateTimeS = coldCoefficient * t6xSettingS;
    const hotAccuracyS = Math.max(0.05 * hotOperateTimeS, 0.05 * t6xSettingS, 1);
    const coldAccuracyS = Math.max(0.05 * coldOperateTimeS, 0.05 * t6xSettingS, 1);
    const nominalFeasible = individualStartWithinSafeStall && hotOperateTimeS >= hotRequiredS && coldOperateTimeS >= coldRequiredS && coldOperateTimeS <= safeStallS;
    const toleranceAwareFeasible = timingBandQualified && individualStartWithinSafeStall && hotOperateTimeS - hotAccuracyS >= hotRequiredS
      && coldOperateTimeS - coldAccuracyS >= coldRequiredS
      && coldOperateTimeS + coldAccuracyS <= safeStallS;
    rows.push({ t6xSettingS, hotOperateTimeS, coldOperateTimeS, hotAccuracyS, coldAccuracyS, nominalFeasible, toleranceAwareFeasible });
  }
  return { rows, minimumT6xS, maximumT6xS };
}

/**
 * Pure application of the REM610 ANSI equations to one explicit equivalent-current start.
 * This helper intentionally does not model variable current or thermal memory.
 */
export function evaluateRem610ReferenceStart(input = {}) {
  const issues = [];
  if (!object(input)) return { status: 'blocked', issues: [issue('REM610_INPUT_REQUIRED', 'input', 'A complete REM610 reference-start input is required.')] };
  const allowed = [...REM610_KEYS.filter(key => key !== 'startupSupervision'), 'nameplateCurrentA', 'nameplateCurrentReference', 'startupTimeS'];
  for (const key of Object.keys(input)) if (!allowed.includes(key)) issues.push(issue('REM610_UNKNOWN_FIELD', key, 'Field is not part of the REM610 reference-start contract.'));
  const required = ['reference', 'motorSafeStallReference', 'referenceStartCurrentReference', 'priorLoadReference', 'nameplateCurrentReference', 'referenceStartCurrentA', 'currentScalingFactor', 'nameplateCurrentA', 'ambientTemperatureC', 'priorLoadCurrentA', 'motorSafeStallTimeS', 'startupTimeS', 'permittedHotStarts', 'permittedColdStarts', 'startTimeMarginPct'];
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(input, key)) issues.push(issue('REM610_FIELD_REQUIRED', key, `${key} is required.`));
  for (const key of ['reference', 'motorSafeStallReference', 'referenceStartCurrentReference', 'priorLoadReference', 'nameplateCurrentReference']) if (!text(input[key])) issues.push(issue('REM610_REFERENCE_REQUIRED', key, `${key} must be a non-blank reference.`));
  for (const key of ['referenceStartCurrentA', 'nameplateCurrentA', 'motorSafeStallTimeS', 'startupTimeS']) if (!finite(input[key]) || input[key] <= 0) issues.push(issue('REM610_VALUE_INVALID', key, `${key} must be positive finite.`));
  if (!finite(input.currentScalingFactor) || input.currentScalingFactor <= 0) issues.push(issue('REM610_CURRENT_SCALING_INVALID', 'currentScalingFactor', 'currentScalingFactor must be positive finite.'));
  if (!finite(input.priorLoadCurrentA) || input.priorLoadCurrentA < 0) issues.push(issue('REM610_VALUE_INVALID', 'priorLoadCurrentA', 'priorLoadCurrentA must be finite nonnegative.'));
  if (!finite(input.ambientTemperatureC) || input.ambientTemperatureC < 0 || input.ambientTemperatureC > 70) issues.push(issue('REM610_AMBIENT_INVALID', 'ambientTemperatureC', 'REM610 configured ambient temperature must be from 0 through 70 °C.'));
  for (const key of ['permittedHotStarts', 'permittedColdStarts']) if (!Number.isInteger(input[key]) || input[key] < 0 || input[key] > 64) issues.push(issue('REM610_START_COUNT_INVALID', key, `${key} must be an integer from zero through 64.`));
  if (Number.isInteger(input.permittedHotStarts) && Number.isInteger(input.permittedColdStarts) && input.permittedHotStarts + input.permittedColdStarts < 1) issues.push(issue('REM610_START_COUNT_REQUIRED', 'permittedHotStarts', 'At least one permitted hot or cold start must be specified.'));
  if (!finite(input.startTimeMarginPct) || input.startTimeMarginPct < 0 || input.startTimeMarginPct > 100) issues.push(issue('REM610_MARGIN_INVALID', 'startTimeMarginPct', 'Start-time margin must be from zero through 100 percent.'));
  if (input.candidateT6xSettingS !== undefined && (!finite(input.candidateT6xSettingS) || input.candidateT6xSettingS < MIN_T6X_S || input.candidateT6xSettingS > MAX_T6X_S || !Number.isInteger(input.candidateT6xSettingS * 2))) issues.push(issue('REM610_T6X_SETTING_INVALID', 'candidateT6xSettingS', 'candidateT6xSettingS must be an available REM610 setting from 2.0 through 120.0 seconds in 0.5-second steps.'));
  if (issues.length) return { status: 'blocked', issues };

  const internalFlaFactorValue = internalFlaFactor(input.ambientTemperatureC);
  const internalFlaA = input.nameplateCurrentA * internalFlaFactorValue;
  const q = input.referenceStartCurrentA / internalFlaA;
  const r = input.priorLoadCurrentA / internalFlaA;
  const hotCoefficient = operationCoefficient(q, r);
  const coldCoefficient = operationCoefficient(q, 0);
  if (!finite(internalFlaA) || internalFlaA <= 0 || !finite(q) || !finite(r) || hotCoefficient === null || coldCoefficient === null) {
    return { status: 'blocked', issues: [issue('REM610_EQUATION_DOMAIN', 'referenceStartCurrentA', 'Supplied start and prior currents are outside the positive REM610 Eq. 7/8 logarithm domain for p = 50%.')] };
  }
  if (q <= 1.2 || input.referenceStartCurrentA <= 1.2 * input.nameplateCurrentA) return { status: 'blocked', issues: [issue('REM610_ACCURACY_DOMAIN', 'referenceStartCurrentA', 'The documented REM610 operate-time accuracy applies above 1.2 times internal FLA; the reference current must also exceed 1.2 times nameplate FLA for this screen.')] };

  const marginFactor = 1 + input.startTimeMarginPct / 100;
  const hotRequiredS = input.permittedHotStarts * input.startupTimeS * marginFactor;
  const coldRequiredS = input.permittedColdStarts * input.startupTimeS * marginFactor;
  const individualStartWithinSafeStall = input.startupTimeS * marginFactor <= input.motorSafeStallTimeS;
  const timingBandQualified = input.currentScalingFactor === 1;
  const { rows, minimumT6xS, maximumT6xS } = makeSettingRows({ hotCoefficient, coldCoefficient, hotRequiredS, coldRequiredS, safeStallS: input.motorSafeStallTimeS, individualStartWithinSafeStall, timingBandQualified });
  if (![hotRequiredS, coldRequiredS, minimumT6xS, maximumT6xS].every(finite)
    || rows.some(row => ![row.hotOperateTimeS, row.coldOperateTimeS, row.hotAccuracyS, row.coldAccuracyS].every(finite))) {
    return { status: 'blocked', issues: [issue('REM610_CALCULATION_RANGE', 'input', 'REM610 operating-time or setting-bound calculation exceeded the finite numeric range.')] };
  }
  const nominalCandidates = rows.filter(row => row.nominalFeasible);
  const toleranceCandidates = rows.filter(row => row.toleranceAwareFeasible);
  const timingBandBasis = { status: timingBandQualified ? 'assumed-reference-envelope' : 'unqualified-current-scaling', requiredCurrentScalingFactor: 1,
    currentScalingFactor: input.currentScalingFactor, percentTimeBasis: 'max(predicted operate time, t6x setting)', sourcePages: [23, 60, 127],
    interpretation: 'For scaling factor 1.0 only, the assumed screening envelope is max(5% of predicted operate time, 5% of t6x setting, 1 s). This conservatively covers the manual wording ambiguity and is not a guaranteed device accuracy band.' };
  return {
    requested: true,
    status: timingBandQualified ? 'evaluated' : 'blocked',
    ...(timingBandQualified ? {} : { issues: [issue('REM610_ACCURACY_SCALING_UNQUALIFIED', 'currentScalingFactor', 'The REM610 timing envelope is qualified only for protected-unit/CT full-load current scaling factor 1.0; nominal equations are retained for inspection without a recommendation.')] }),
    source: { relayReference: RELAY_REFERENCE, equations: ['6', '7', '8'], printedPages: [32, 60, 130, 135], weightingFactorPercent: PERCENT_WEIGHTING, settingRangeS: [MIN_T6X_S, MAX_T6X_S], settingStepS: T6X_STEP_S },
    inputs: { ...input },
    normalized: { internalFlaFactor: internalFlaFactorValue, internalFlaA, referenceStartCurrentMultipleOfInternalFla: q, priorLoadMultipleOfInternalFla: r },
    coefficients: { hotPerT6x: hotCoefficient, coldPerT6x: coldCoefficient },
    requirements: { hotOperateTimeS: hotRequiredS, coldOperateTimeS: coldRequiredS, motorSafeStallTimeS: input.motorSafeStallTimeS, marginFactor, individualStartWithinSafeStall },
    timingBandBasis,
    feasibleRange: { nominalMinimumT6xS: minimumT6xS, nominalMaximumT6xS: maximumT6xS,
      nominalCandidatesS: nominalCandidates.map(row => row.t6xSettingS), toleranceAwareCandidatesS: toleranceCandidates.map(row => row.t6xSettingS) },
    candidate: input.candidateT6xSettingS === undefined ? null : rows.find(row => row.t6xSettingS === input.candidateT6xSettingS) || null,
    settings: rows,
    limitations: LIMITATIONS,
  };
}

export function evaluateDesignSynthesisMotorThermal(proposal, accelerationResult, { equipment, criteria = {} } = {}) {
  const sourceEquipmentInput = equipment !== undefined ? equipment : proposal?.equipment;
  const sourceEquipment = Array.isArray(sourceEquipmentInput) ? sourceEquipmentInput : [];
  const shape = validateDesignSynthesisMotorThermalInputs({ equipment: sourceEquipmentInput });
  const accelerationFingerprint = designSynthesisMotorAccelerationFingerprint(proposal, criteria);
  const requestedRecords = sourceEquipment.filter(item => object(item?.motor) && item.motor.rem610Thermal !== undefined);
  const fingerprint = fingerprintStudyValue({ method: METHOD, relayReference: RELAY_REFERENCE, accelerationFingerprint,
    thermalInputs: requestedRecords.map(item => ({ id: item.id, motorVoltageV: item.motor.ratedVoltageV, nameplateCurrentA: item.motor.nameplateCurrentA,
      fullLoadCurrentBasis: item.motor.fullLoadCurrentBasis, acceleration: item.motor.acceleration, rem610Thermal: item.motor.rem610Thermal })),
    canonicalThermalInputs: (Array.isArray(proposal?.loads) ? proposal.loads : []).filter(item => object(item?.motor) && item.motor.rem610Thermal !== undefined)
      .map(item => ({ id: item.id, voltage: item.voltage, motorVoltageV: item.motor.ratedVoltageV, nameplateCurrentA: item.motor.nameplateCurrentA,
        fullLoadCurrentBasis: item.motor.fullLoadCurrentBasis, acceleration: item.motor.acceleration, rem610Thermal: item.motor.rem610Thermal })) });
  if (!shape.requested && !shape.issues.length) return { status: 'not-requested', method: METHOD, modelInputFingerprint: fingerprint, cases: [], issues: [], coverage: { status: 'not-applicable', requestedMotorCount: 0, evaluatedMotorCount: 0 }, limitations: LIMITATIONS };
  if (shape.issues.length) return { status: 'blocked', method: METHOD, modelInputFingerprint: fingerprint, cases: [], issues: shape.issues, coverage: { status: 'incomplete', requestedMotorCount: sourceEquipment.filter(item => item?.motor?.rem610Thermal !== undefined).length, evaluatedMotorCount: 0 }, limitations: LIMITATIONS };
  if (accelerationResult?.status !== 'evaluated' || accelerationResult?.modelInputFingerprint !== accelerationFingerprint) {
    const stale = accelerationResult?.modelInputFingerprint !== accelerationFingerprint;
    const blocked = issue(stale ? 'REM610_ACCELERATION_FINGERPRINT_MISMATCH' : 'REM610_ACCELERATION_UNAVAILABLE', 'motorThermal', stale
      ? 'The acceleration result does not match the current finalized network and inputs.'
      : 'A completed evaluated motor acceleration result is required for the REM610 screen.');
    return { status: 'blocked', method: METHOD, modelInputFingerprint: fingerprint, cases: [], issues: [blocked], coverage: { status: 'incomplete', requestedMotorCount: sourceEquipment.filter(item => item?.motor?.rem610Thermal !== undefined).length, evaluatedMotorCount: 0 }, limitations: LIMITATIONS };
  }

  // An input fingerprint establishes which network was requested, not that
  // the accompanying time and current values came from that network. Re-run
  // the bounded acceleration study before using its numbers for a setting.
  let recomputedAcceleration;
  try { recomputedAcceleration = evaluateDesignSynthesisMotorAcceleration(proposal, criteria); }
  catch { recomputedAcceleration = null; }

  const requested = requestedRecords;
  const loads = Array.isArray(proposal?.loads) ? proposal.loads : [];
  const suppliedCases = Array.isArray(accelerationResult.cases) ? accelerationResult.cases : [];
  const cases = [];
  for (const equipmentRecord of requested) {
    const motorId = String(equipmentRecord.id);
    const path = `equipment.${motorId}.motor.rem610Thermal`;
    const load = loads.find(item => String(item?.id) === motorId);
    const data = equipmentRecord.motor.rem610Thermal;
    const accelerationCase = suppliedCases.find(item => String(item?.motorId) === motorId);
    const motor = load?.motor || equipmentRecord.motor;
    if (!load || !accelerationCase || accelerationCase.status !== 'evaluated' || !finite(accelerationCase.timeS) || !Array.isArray(accelerationCase.timeline) || accelerationCase.timeline.length < 2) {
      cases.push({ motorId, status: 'blocked', issues: [issue('REM610_ACCELERATION_CASE_UNAVAILABLE', path, 'A finite evaluated final acceleration case with a complete timeline is required.')], limitations: LIMITATIONS });
      continue;
    }
    const sourceMotorFingerprint = fingerprintStudyValue({ ratedVoltageV: equipmentRecord.motor.ratedVoltageV, nameplateCurrentA: equipmentRecord.motor.nameplateCurrentA,
      fullLoadCurrentBasis: equipmentRecord.motor.fullLoadCurrentBasis, acceleration: equipmentRecord.motor.acceleration, rem610Thermal: data, voltage: equipmentRecord.voltage });
    const canonicalMotorFingerprint = fingerprintStudyValue({ ratedVoltageV: motor.ratedVoltageV, nameplateCurrentA: motor.nameplateCurrentA,
      fullLoadCurrentBasis: motor.fullLoadCurrentBasis, acceleration: motor.acceleration, rem610Thermal: motor.rem610Thermal, voltage: load.voltage });
    if (sourceMotorFingerprint !== canonicalMotorFingerprint) {
      cases.push({ motorId, status: 'blocked', issues: [issue('REM610_SOURCE_CANONICAL_MISMATCH', path, 'The requested relay inputs do not match the finalized canonical motor model and voltage base.')], limitations: LIMITATIONS });
      continue;
    }
    const curvePoints = motor.acceleration?.performanceCurve?.points;
    const loadVoltage = load.voltage;
    const motorVoltage = motor.ratedVoltageV;
    if (!Array.isArray(curvePoints) || !finite(loadVoltage) || loadVoltage <= 0 || !finite(motorVoltage) || motorVoltage <= 0) {
      cases.push({ motorId, status: 'blocked', issues: [issue('REM610_CURRENT_ENVELOPE_UNAVAILABLE', path, 'Canonical motor voltage and supplied acceleration performance current points are required.')], limitations: LIMITATIONS });
      continue;
    }
    if (curvePoints.some(point => !finite(point?.currentA) || point.currentA <= 0) || accelerationCase.timeline.some(point => !finite(point?.currentA) || point.currentA <= 0)) {
      cases.push({ motorId, status: 'blocked', issues: [issue('REM610_CURRENT_ENVELOPE_INVALID', path, 'Supplied and finalized acceleration current values must all be positive finite amperes.')], limitations: LIMITATIONS });
      continue;
    }
    const matchingFreshCases = (recomputedAcceleration?.cases || []).filter(item => String(item?.motorId) === motorId);
    const matchingSuppliedCases = suppliedCases.filter(item => String(item?.motorId) === motorId);
    if (recomputedAcceleration?.status !== 'evaluated' || recomputedAcceleration.modelInputFingerprint !== accelerationFingerprint
      || matchingFreshCases.length !== 1 || matchingSuppliedCases.length !== 1 || !sameDesignSynthesisAccelerationCase(accelerationCase, matchingFreshCases[0])) {
      cases.push({ motorId, status: 'blocked', issues: [issue('REM610_ACCELERATION_RESULT_MISMATCH', path, 'The supplied acceleration time, exposure, or timeline does not match a fresh evaluation of the finalized network.')], limitations: LIMITATIONS });
      continue;
    }
    const maximumSuppliedCurrentA = Math.max(...curvePoints.map(point => point.currentA)) * loadVoltage / motorVoltage;
    const maximumObservedCurrentA = Math.max(...accelerationCase.timeline.map(point => point.currentA));
    if (!finite(maximumSuppliedCurrentA) || !finite(maximumObservedCurrentA)) {
      cases.push({ motorId, status: 'blocked', issues: [issue('REM610_CURRENT_ENVELOPE_INVALID', path, 'Current envelope calculations exceeded the finite numeric range.')], limitations: LIMITATIONS });
      continue;
    }
    const envelopeRoundoff = 16 * Number.EPSILON * Math.max(maximumSuppliedCurrentA, maximumObservedCurrentA, data.referenceStartCurrentA, Number.MIN_VALUE);
    if (data.referenceStartCurrentA < maximumSuppliedCurrentA - envelopeRoundoff
      || maximumObservedCurrentA > data.referenceStartCurrentA + envelopeRoundoff) {
      cases.push({ motorId, status: 'blocked', issues: [issue('REM610_REFERENCE_CURRENT_TOO_LOW', path, 'The explicit reference start current must cover every supplied performance-curve current at the canonical nominal-voltage ratio and every observed final-network acceleration current.')], limitations: LIMITATIONS });
      continue;
    }
    const startupSupervision = evaluateRem610StartupSupervision(data.startupSupervision, matchingFreshCases[0]);
    if (startupSupervision.status === 'blocked') {
      cases.push({ motorId, status: 'blocked', startupSupervision, issues: startupSupervision.issues.map(item => ({ ...item, path: `${path}.${item.path}` })), limitations: LIMITATIONS });
      continue;
    }
    const evaluated = evaluateRem610ReferenceStart({
      referenceStartCurrentA: data.referenceStartCurrentA,
      nameplateCurrentA: motor.nameplateCurrentA,
      ambientTemperatureC: data.ambientTemperatureC,
      priorLoadCurrentA: data.priorLoadCurrentA,
      motorSafeStallTimeS: data.motorSafeStallTimeS,
      currentScalingFactor: data.currentScalingFactor,
      nameplateCurrentReference: data.reference,
      reference: data.reference,
      motorSafeStallReference: data.motorSafeStallReference,
      referenceStartCurrentReference: data.referenceStartCurrentReference,
      priorLoadReference: data.priorLoadReference,
      candidateT6xSettingS: data.candidateT6xSettingS,
      startupTimeS: accelerationCase.timeS,
      permittedHotStarts: data.permittedHotStarts,
      permittedColdStarts: data.permittedColdStarts,
      startTimeMarginPct: data.startTimeMarginPct,
    });
    if (evaluated.status === 'blocked') {
      cases.push({ motorId, status: 'blocked', startupSupervision, candidateStatus: 'not-evaluated', candidateT6xSettingS: data.candidateT6xSettingS ?? null, recommendedT6xSettingS: null,
        startupTimeS: accelerationCase.timeS, currentScalingFactor: data.currentScalingFactor,
        calculations: evaluated.normalized ? { source: evaluated.source, normalized: evaluated.normalized, coefficients: evaluated.coefficients,
          requirements: evaluated.requirements, timingBandBasis: evaluated.timingBandBasis, feasibleRange: evaluated.feasibleRange, candidate: evaluated.candidate } : null,
        issues: evaluated.issues.map(item => ({ ...item, path: `${path}.${item.path}` })), limitations: LIMITATIONS });
      continue;
    }
    const candidateT6xSettingS = data.candidateT6xSettingS;
    const recommendedSetting = candidateT6xSettingS === undefined ? evaluated.feasibleRange.toleranceAwareCandidatesS[0] ?? null : candidateT6xSettingS;
    const selected = recommendedSetting === null ? null : evaluated.settings.find(row => row.t6xSettingS === recommendedSetting);
    const candidateStatus = selected?.toleranceAwareFeasible ? 'pass' : 'fail';
    const status = evaluated.status === 'evaluated' && (candidateT6xSettingS === undefined ? recommendedSetting !== null : candidateStatus === 'pass') ? 'pass' : 'fail';
    cases.push({ motorId, status, startupSupervision, candidateStatus, candidateT6xSettingS: candidateT6xSettingS ?? null, recommendedT6xSettingS: candidateT6xSettingS === undefined ? recommendedSetting : null,
      startupTimeS: accelerationCase.timeS, maximumSuppliedCurrentA, maximumObservedCurrentA, currentScalingFactor: data.currentScalingFactor,
      currentBasis: 'Explicit reference current, validated to bound source curve nominal-voltage currents and final-network timeline; used as a constant-current setting-screen basis.',
      calculations: { source: evaluated.source, normalized: evaluated.normalized, coefficients: evaluated.coefficients, requirements: evaluated.requirements,
        timingBandBasis: evaluated.timingBandBasis, feasibleRange: evaluated.feasibleRange, candidate: selected },
      issues: status === 'pass' ? [] : [issue('REM610_NO_FEASIBLE_SETTING', path, selected ? `The explicit REM610 t6x ${candidateT6xSettingS} s candidate fails the tolerance-aware start/safe-stall screen.` : 'No available REM610 t6x setting satisfies the tolerance-aware start and safe-stall requirements.')],
      limitations: LIMITATIONS });
  }
  const hasBlocked = cases.some(item => item.status === 'blocked');
  const hasFailure = cases.some(item => item.status === 'fail');
  return { status: hasBlocked ? 'blocked' : hasFailure ? 'fail' : 'evaluated', method: METHOD, relayReference: RELAY_REFERENCE, modelInputFingerprint: fingerprint,
    cases, issues: cases.flatMap(item => item.issues || []), coverage: { status: hasBlocked ? 'incomplete' : 'complete', requestedMotorCount: requested.length, evaluatedMotorCount: cases.filter(item => item.status === 'pass' || item.status === 'fail').length }, limitations: LIMITATIONS };
}

export default { evaluateDesignSynthesisMotorThermal, evaluateRem610ReferenceStart, validateDesignSynthesisMotorThermalInputs };
