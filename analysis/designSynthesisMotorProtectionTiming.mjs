import { fingerprintStudyValue } from './studyLifecycle.mjs';
import { designSynthesisMotorAccelerationFingerprint, evaluateDesignSynthesisMotorAcceleration, sameDesignSynthesisAccelerationCase } from './designSynthesisMotorAcceleration.mjs';
import { evaluateMotorBranchBreakerCandidate } from './designSynthesisMotorBranchBreakers.mjs';
import { buildMotorStartingCaseModel, evaluateDesignSynthesisMotorStarting } from './designSynthesisMotorStarting.mjs';
import { runMotorStartingNetwork } from './designSynthesisMotorIdealTies.mjs';

const METHOD = 'motor-protection-reference-current-envelope-v1';
const METHOD_RANGE = 'motor-protection-supplied-stall-current-range-v2';
const LIMITATIONS = Object.freeze([
  'Reference-current envelope comparison only; selected-state clearing/withstand is compared only at the declared reference current and does not bound longer clearing at lower actual stall or fault currents or prove actual motor stall protection.',
  'No current-trajectory integration, thermal memory, cooling, conductor damage, timed fault duty, SCCR, or complete protection determination is performed.',
  'Supplied bounds and source references are not independently authenticated. Synthetic inputs remain illustrative and do not represent installed settings or protection approval.',
]);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => finite(value) && value > 0;
const text = value => typeof value === 'string' && value.trim().length > 0;
const issue = (code, path, message) => ({ code, path, message, severity: 'blocking' });
// The same canonical network is solved again; require close agreement below the
// load-flow solver's 1e-6 pu mismatch threshold, rather than machine epsilon.
const relativeSolverTolerance = 1e-7;
const marginPasses = (margin, a, b) => finite(margin) && margin > 64 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b), Number.MIN_VALUE);
const unknown = (value, allowed, path, issues) => {
  if (!object(value)) { issues.push(issue('MOTOR_PROTECTION_TIMING_OBJECT_REQUIRED', path, 'A structured object is required.')); return; }
  for (const key of Object.keys(value)) if (!allowed.includes(key)) issues.push(issue('MOTOR_PROTECTION_TIMING_UNKNOWN_FIELD', `${path}.${key}`, 'Field is not part of the motor protection timing contract.'));
};

function checkSource(source, path, issues) {
  unknown(source, ['id', 'reference', 'evidenceClass'], path, issues);
  if (!text(source?.id) || !text(source?.reference) || !['manufacturer', 'synthetic'].includes(source?.evidenceClass)) {
    issues.push(issue('MOTOR_PROTECTION_TIMING_SOURCE_REQUIRED', path, 'Source id, source reference, and evidenceClass (manufacturer or synthetic) are required.'));
  }
}

function validateConditions(conditions, expectedState, path, issues) {
  unknown(conditions, ['initialState', 'ambientTemperatureC', 'frequencyHz', 'phases', 'voltageRangeV', 'reference'], path, issues);
  if (conditions?.initialState !== expectedState || !finite(conditions?.ambientTemperatureC) || conditions.ambientTemperatureC <= -273.15
    || !positive(conditions?.frequencyHz) || !Number.isInteger(conditions?.phases) || conditions.phases < 1 || !text(conditions?.reference)) {
    issues.push(issue('MOTOR_PROTECTION_TIMING_CONDITIONS_INVALID', path, `Conditions require initialState ${expectedState}, ambient above absolute zero, positive frequency, positive integer phase count, and a nonblank source reference.`));
  }
  const range = conditions?.voltageRangeV;
  if (!Array.isArray(range) || range.length !== 2 || !positive(range[0]) || !positive(range[1]) || range[0] > range[1]) {
    issues.push(issue('MOTOR_PROTECTION_TIMING_VOLTAGE_RANGE', `${path}.voltageRangeV`, 'voltageRangeV must be [positive minimum V, positive maximum V].'));
  }
}

function normalizeCurve(curve, path, issues, { timeKey = 'timeS' } = {}) {
  if (!Array.isArray(curve) || curve.length < 2 || curve.length > 128) {
    issues.push(issue('MOTOR_PROTECTION_TIMING_CURVE_LENGTH', path, 'Curve must contain 2 to 128 current/time points.'));
    return [];
  }
  const result = []; let previousPoint = null;
  curve.forEach((point, index) => {
    const pointPath = `${path}[${index}]`;
    unknown(point, ['currentA', timeKey], pointPath, issues);
    if (!positive(point?.currentA) || !positive(point?.[timeKey])) {
      issues.push(issue('MOTOR_PROTECTION_TIMING_POINT_INVALID', pointPath, 'Current and time must be finite positive amperes and seconds.'));
      return;
    }
    if (previousPoint && (!(point.currentA > previousPoint.currentA) || point[timeKey] > previousPoint.timeS)) {
      issues.push(issue('MOTOR_PROTECTION_TIMING_CURVE_ORDER', pointPath, 'Current must strictly increase and time must not increase. Points are not reordered.'));
    }
    previousPoint = { currentA: point.currentA, timeS: point[timeKey] };
    result.push(previousPoint);
  });
  return result;
}

function interpolate(curve, currentA) {
  if (!curve.length || currentA < curve[0].currentA || currentA > curve.at(-1).currentA) return null;
  if (currentA === curve[0].currentA) return curve[0].timeS;
  if (currentA === curve.at(-1).currentA) return curve.at(-1).timeS;
  for (let i = 1; i < curve.length; i++) {
    const left = curve[i - 1]; const right = curve[i];
    if (currentA <= right.currentA) {
      const ratio = (Math.log(currentA) - Math.log(left.currentA)) / (Math.log(right.currentA) - Math.log(left.currentA));
      return Math.exp(Math.log(left.timeS) + ratio * (Math.log(right.timeS) - Math.log(left.timeS)));
    }
  }
  return null;
}

function logLogSegment(curve, currentA) {
  for (let index = 1; index < curve.length; index += 1) {
    const left = curve[index - 1]; const right = curve[index];
    if (currentA >= left.currentA && currentA <= right.currentA) {
      const exponent = (Math.log(right.timeS) - Math.log(left.timeS)) / (Math.log(right.currentA) - Math.log(left.currentA));
      return { exponent };
    }
  }
  return null;
}

function marginCriticalCurrents(clearCurve, withstandCurve, minimumA, maximumA) {
  const knots = [...new Set([minimumA, maximumA,
    ...clearCurve.map(point => point.currentA).filter(value => value > minimumA && value < maximumA),
    ...withstandCurve.map(point => point.currentA).filter(value => value > minimumA && value < maximumA)])].sort((a, b) => a - b);
  const result = new Set(knots);
  let valid = true;
  for (let index = 1; index < knots.length; index += 1) {
    const left = knots[index - 1]; const right = knots[index];
    const midpoint = Math.exp((Math.log(left) + Math.log(right)) / 2);
    const clearing = logLogSegment(clearCurve, midpoint);
    const withstand = logLogSegment(withstandCurve, midpoint);
    if (!clearing || !withstand) { valid = false; continue; }
    if (!finite(clearing.exponent) || !finite(withstand.exponent)) { valid = false; continue; }
    if (clearing.exponent === withstand.exponent || clearing.exponent === 0 || withstand.exponent === 0
      || Math.sign(clearing.exponent) !== Math.sign(withstand.exponent)) continue;
    const exponentDifference = withstand.exponent - clearing.exponent;
    const clearingAtLeft = interpolate(clearCurve, left);
    const withstandAtLeft = interpolate(withstandCurve, left);
    const logCurrent = Math.log(left) + (Math.log(Math.abs(clearing.exponent)) - Math.log(Math.abs(withstand.exponent))
      + Math.log(clearingAtLeft) - Math.log(withstandAtLeft)) / exponentDifference;
    if (Number.isNaN(logCurrent)) { valid = false; continue; }
    if (!finite(logCurrent) || logCurrent <= Math.log(left) || logCurrent >= Math.log(right)) continue;
    const currentA = Math.exp(logCurrent);
    if (finite(currentA) && currentA > left && currentA < right) result.add(currentA);
  }
  return { currents: [...result].sort((a, b) => a - b), valid };
}

function recomputeLockedRotorPoint(proposal, load, criteria, acceleration, path) {
  const issues = [];
  const sourceRows = (proposal?.equipment || []).filter(item => String(item?.type || '').toLowerCase() === 'source');
  const source = sourceRows.length === 1 ? sourceRows[0] : null;
  const motor = load?.motor;
  const performancePoint = motor?.acceleration?.performanceCurve?.points?.[0];
  if (!positive(motor?.lockedRotorCurrentA) || !positive(performancePoint?.currentA)
    || !finite(motor?.lockedRotorPowerFactor) || motor.lockedRotorPowerFactor <= 0 || motor.lockedRotorPowerFactor > 1
    || !finite(performancePoint?.powerFactor) || performancePoint.powerFactor <= 0 || performancePoint.powerFactor > 1
    || Math.abs(motor.lockedRotorCurrentA - performancePoint.currentA) > Math.max(1e-9, Math.abs(motor.lockedRotorCurrentA) * 1e-9)
    || Math.abs(motor.lockedRotorPowerFactor - performancePoint.powerFactor) > 1e-9) {
    issues.push(issue('MOTOR_PROTECTION_TIMING_LR_BASE_CONTRADICTION', path, 'Motor lockedRotorCurrentA/lockedRotorPowerFactor and speed-zero performance-curve current/PF must agree; v2 does not reconcile distinct starting-model bases.'));
    return { issues };
  }
  if (!source) {
    issues.push(issue('MOTOR_PROTECTION_TIMING_SOURCE_INVALID', path, 'Exactly one canonical source is required to recompute the network locked-rotor point.'));
    return { issues };
  }
  const connectionRows = (proposal?.oneLine?.sheets || []).flatMap(sheet => Array.isArray(sheet?.connections) ? sheet.connections : []);
  const cableRows = Array.isArray(proposal?.cables) ? proposal.cables : [];
  for (const cable of cableRows) {
    const matches = connectionRows.filter(connection => String(connection?.cableId ?? connection?.cable?.id ?? '') === String(cable?.id));
    const savedCable = matches.length === 1 ? matches[0].cable : null;
    const aligned = savedCable && String(savedCable.id) === String(cable.id)
      && String(savedCable.from) === String(cable.from) && String(savedCable.to) === String(cable.to)
      && savedCable.r_ohm_per_kft === cable.r_ohm_per_kft && savedCable.x_ohm_per_kft === cable.x_ohm_per_kft
      && (savedCable.lengthFt ?? savedCable.length) === (cable.lengthFt ?? cable.length);
    if (!aligned) {
      issues.push(issue('MOTOR_PROTECTION_TIMING_FINAL_NETWORK_CABLE_MISMATCH', `${path}.network`, `Final cable ${String(cable?.id ?? 'unknown')} must have one matching one-line connection with identical endpoints and impedance/length inputs.`));
    }
  }
  if (!Array.isArray(proposal?.cables) || !cableRows.length || issues.length) return { issues };
  let built; let result; let topology;
  try {
    built = buildMotorStartingCaseModel(proposal, load, source);
    topology = evaluateDesignSynthesisMotorStarting(proposal, criteria, { validationOnly: true });
    if (!['pass', 'validated'].includes(proposal?.motorStartingValidation?.status)
      || topology?.status !== 'validated' || !Array.isArray(topology?.issues) || topology.issues.length !== 0
      || !text(topology?.modelInputFingerprint) || proposal.motorStartingValidation?.modelInputFingerprint !== topology.modelInputFingerprint) {
      issues.push(issue('MOTOR_PROTECTION_TIMING_STARTING_EVIDENCE_STALE', path, 'Saved initial-starting evidence must match a fresh structural fingerprint before v2 network recomputation.'));
      return { issues };
    }
    const maxIterations = criteria?.loadFlow?.maxIterations ?? 60;
    result = runMotorStartingNetwork(built.model, { baseMVA: 1, balanced: true, maxIterations });
  } catch (error) {
    issues.push(issue('MOTOR_PROTECTION_TIMING_LR_SOLVER_FAILED', path, error?.message || String(error)));
    return { issues };
  }
  const buses = Array.isArray(result?.buses) ? result.buses : [];
  const lines = Array.isArray(result?.lines) ? result.lines : [];
  const expectedBusIds = new Set(built.model.buses.filter(bus => String(bus.id) !== String(built.syntheticId)).map(bus => String(bus.id)));
  const actualBusIds = buses.filter(bus => String(bus.id) !== String(built.syntheticId)).map(bus => String(bus.id));
  const expectedLineIds = new Set(built.model.branches.map(branch => String(branch.id)));
  const actualLineIds = lines.map(line => String(line.id || line.componentId));
  const complete = actualBusIds.length === expectedBusIds.size && new Set(actualBusIds).size === expectedBusIds.size
    && actualBusIds.every(id => expectedBusIds.has(id)) && actualLineIds.length === expectedLineIds.size
    && new Set(actualLineIds).size === expectedLineIds.size && actualLineIds.every(id => expectedLineIds.has(id))
    && buses.filter(bus => String(bus.id) !== String(built.syntheticId)).every(bus => finite(bus.Vm))
    && lines.every(line => finite(line.fromCurrentA) || finite(line.amps)) && lines.every(line => finite(line.toCurrentA));
  if (result?.converged !== true || !finite(result?.maxMismatch) || result.maxMismatch >= 1e-6 || !complete) {
    issues.push(issue('MOTOR_PROTECTION_TIMING_LR_SOLVER_INCOMPLETE', path, 'Fresh locked-rotor load flow must converge and return finite, complete bus and circuit results.'));
    return { issues };
  }
  const bus = buses.find(item => String(item.id) === String(built.motorBusId));
  const modelBus = built.model.buses.find(item => String(item.id) === String(built.motorBusId));
  const voltagePu = bus?.Vm;
  const currentA = voltagePu * modelBus.baseKV * 1000 / motor.ratedVoltageV * motor.lockedRotorCurrentA;
  const initialTimeline = acceleration?.timeline?.[0];
  const currentToleranceA = Math.max(Math.abs(currentA), Math.abs(initialTimeline?.currentA || 0)) * relativeSolverTolerance;
  const voltageTolerancePu = Math.max(Math.abs(voltagePu), Math.abs(initialTimeline?.terminalVoltagePu || 0)) * relativeSolverTolerance;
  if (!positive(currentA) || !positive(voltagePu) || !initialTimeline || initialTimeline.speedRpm !== 0 || initialTimeline.timeS !== 0
    || !positive(initialTimeline.currentA) || !positive(initialTimeline.terminalVoltagePu)
    || Math.abs(currentA - initialTimeline.currentA) > currentToleranceA || Math.abs(voltagePu - initialTimeline.terminalVoltagePu) > voltageTolerancePu) {
    issues.push(issue('MOTOR_PROTECTION_TIMING_LR_ACCELERATION_MISMATCH', path, 'Fresh nominal locked-rotor network current and voltage must match the validated acceleration timeline at speed zero within 1e-7 relative solver tolerance.'));
    return { issues };
  }
  const matchingSavedCases = (Array.isArray(proposal?.motorStartingValidation?.cases) ? proposal.motorStartingValidation.cases : [])
    .filter(item => String(item?.motorId) === String(load.id));
  const saved = matchingSavedCases.length === 1 ? matchingSavedCases[0] : null;
  if (!saved || saved.status !== 'pass' || saved.converged !== true || !positive(saved.motorCurrentA) || !positive(saved.motorVoltagePu)
    || Math.abs(saved.motorCurrentA - currentA) > currentToleranceA || Math.abs(saved.motorVoltagePu - voltagePu) > voltageTolerancePu) {
    issues.push(issue('MOTOR_PROTECTION_TIMING_STARTING_RESULT_MISMATCH', path, 'Saved initial-starting result must agree with the fresh network locked-rotor solution.'));
    return { issues };
  }
  return { issues, currentA, voltagePu, maxMismatch: result.maxMismatch, iterations: result.iterations, modelInputFingerprint: topology.modelInputFingerprint };
}

function validateDevice(device, index, issues) {
  const path = `motor.protectionTiming.devices[${index}]`;
  unknown(device, ['role', 'catalogNumber', 'setting', 'conditions', 'source', 'minimumTrip', 'maximumTotalCircuitClearing', 'includesContactorOpening'], path, issues);
  if (!['branch-breaker', 'overload-relay'].includes(device?.role)) issues.push(issue('MOTOR_PROTECTION_TIMING_ROLE_INVALID', `${path}.role`, 'Device role must be branch-breaker or overload-relay.'));
  if (!text(device?.catalogNumber)) issues.push(issue('MOTOR_PROTECTION_TIMING_DEVICE_ID_REQUIRED', `${path}.catalogNumber`, 'Exact candidate catalog number is required.'));
  const settingKeys = device?.role === 'branch-breaker' ? ['fixedIrA', 'instantaneousPickupA'] : ['dialSettingA'];
  unknown(device?.setting, settingKeys, `${path}.setting`, issues);
  for (const key of settingKeys) if (!positive(device?.setting?.[key])) issues.push(issue('MOTOR_PROTECTION_TIMING_SETTING_REQUIRED', `${path}.setting.${key}`, 'Exact positive finite candidate setting is required.'));
  checkSource(device?.source, `${path}.source`, issues);
  validateConditions(device?.conditions, device?.conditions?.initialState, `${path}.conditions`, issues);
  if (device?.role === 'overload-relay' && device?.includesContactorOpening !== true) issues.push(issue('MOTOR_PROTECTION_TIMING_CONTACTOR_OPENING_REQUIRED', `${path}.includesContactorOpening`, 'Overload total clearing bound must include contactor opening time.'));
  if (device?.role === 'branch-breaker' && device?.includesContactorOpening !== false) issues.push(issue('MOTOR_PROTECTION_TIMING_BREAKER_OPENING_FLAG', `${path}.includesContactorOpening`, 'Branch-breaker curve must explicitly set includesContactorOpening to false.'));
  const minimumTrip = normalizeCurve(device?.minimumTrip, `${path}.minimumTrip`, issues);
  const maximumTotalCircuitClearing = normalizeCurve(device?.maximumTotalCircuitClearing, `${path}.maximumTotalCircuitClearing`, issues);
  if (minimumTrip.length && maximumTotalCircuitClearing.length) {
    const currents = [...new Set([...minimumTrip, ...maximumTotalCircuitClearing].map(point => point.currentA))].sort((a, b) => a - b);
    for (const currentA of currents) {
      const minTrip = interpolate(minimumTrip, currentA); const maxClear = interpolate(maximumTotalCircuitClearing, currentA);
      if (minTrip !== null && maxClear !== null && (!finite(minTrip) || !finite(maxClear) || minTrip > maxClear)) issues.push(issue('MOTOR_PROTECTION_TIMING_BOUNDS_CROSS', path, `Minimum-trip bound exceeds maximum-total-clearing bound or is non-finite at ${currentA} A.`));
    }
  }
  return { role: device?.role, catalogNumber: device?.catalogNumber, setting: device?.setting, conditions: device?.conditions, source: device?.source, minimumTrip, maximumTotalCircuitClearing, includesContactorOpening: device?.includesContactorOpening };
}

export function validateDesignSynthesisMotorProtectionTimingInputs({ equipment = [], criteria = {} } = {}) {
  const issues = [];
  if (!Array.isArray(equipment)) issues.push(issue('MOTOR_PROTECTION_TIMING_EQUIPMENT_INVALID', 'equipment', 'Equipment must be an explicit array; malformed inputs are not treated as an empty request.'));
  const motors = (Array.isArray(equipment) ? equipment : []).filter(row => object(row?.motor));
  const requested = motors.some(row => row.motor.protectionTiming !== undefined);
  for (const motor of motors) {
    const timing = motor.motor.protectionTiming;
    if (timing === undefined) continue;
    const path = `equipment.${motor.id}.motor.protectionTiming`;
    unknown(timing, ['schemaVersion', 'initialState', 'ambientTemperatureC', 'frequencyHz', 'phases', 'referenceStartCurrentA', 'referenceStartCurrentReference', 'currentEnvelopeA', 'stallCurrentRangeA', 'startMarginS', 'motorWithstand', 'devices'], path, issues);
    if (!object(timing)) continue;
    const isRangeV2 = timing.schemaVersion === '2.0.0';
    if (!['1.0.0', '2.0.0'].includes(timing.schemaVersion)) issues.push(issue('MOTOR_PROTECTION_TIMING_SCHEMA_VERSION', `${path}.schemaVersion`, 'schemaVersion must be 1.0.0 or 2.0.0.'));
    if (!['hot', 'cold'].includes(timing.initialState) || !finite(timing.ambientTemperatureC) || timing.ambientTemperatureC <= -273.15 || timing.frequencyHz !== 60 || timing.phases !== 3) issues.push(issue('MOTOR_PROTECTION_TIMING_TEST_CONDITIONS', path, 'Explicit initialState (hot/cold), ambient above absolute zero, 60 Hz, and three phases are required.'));
    if (!positive(timing.referenceStartCurrentA) || !text(timing.referenceStartCurrentReference)) issues.push(issue('MOTOR_PROTECTION_TIMING_REFERENCE_CURRENT', `${path}.referenceStartCurrentA`, 'Reference start current and its basis reference are required.'));
    if (!finite(timing.startMarginS) || timing.startMarginS < 0) issues.push(issue('MOTOR_PROTECTION_TIMING_MARGIN', `${path}.startMarginS`, 'Explicit startMarginS must be finite and nonnegative.'));
    unknown(timing.currentEnvelopeA, ['minimumA', 'maximumA', 'reference'], `${path}.currentEnvelopeA`, issues);
    if (!positive(timing.currentEnvelopeA?.minimumA) || !positive(timing.currentEnvelopeA?.maximumA) || timing.currentEnvelopeA.minimumA > timing.currentEnvelopeA.maximumA || !text(timing.currentEnvelopeA?.reference)) issues.push(issue('MOTOR_PROTECTION_TIMING_CURRENT_ENVELOPE', `${path}.currentEnvelopeA`, 'A referenced positive current interval with minimumA <= maximumA is required.'));
    if (positive(timing.referenceStartCurrentA) && positive(timing.currentEnvelopeA?.maximumA) && timing.referenceStartCurrentA < timing.currentEnvelopeA.maximumA) issues.push(issue('MOTOR_PROTECTION_TIMING_REFERENCE_NOT_BOUNDING', `${path}.referenceStartCurrentA`, 'Reference start current must be at least currentEnvelopeA.maximumA.'));
    if (isRangeV2) {
      unknown(timing.stallCurrentRangeA, ['minimumA', 'maximumA', 'reference'], `${path}.stallCurrentRangeA`, issues);
      if (!positive(timing.stallCurrentRangeA?.minimumA) || !positive(timing.stallCurrentRangeA?.maximumA)
        || timing.stallCurrentRangeA.minimumA > timing.stallCurrentRangeA.maximumA || !text(timing.stallCurrentRangeA?.reference)) {
        issues.push(issue('MOTOR_PROTECTION_TIMING_STALL_CURRENT_RANGE', `${path}.stallCurrentRangeA`, 'A separately referenced positive constant-stall current interval with minimumA <= maximumA is required.'));
      }
    }
    const withstand = timing.motorWithstand;
    unknown(withstand, isRangeV2 ? ['hotMinimumSafeStallCurve', 'coldMinimumSafeStallCurve', 'hotConditions', 'coldConditions', 'source'] : ['referenceCurrentA', 'hotMinimumSafeStallTimeS', 'coldMinimumSafeStallTimeS', 'hotConditions', 'coldConditions', 'source'], `${path}.motorWithstand`, issues);
    for (const kind of ['hot', 'cold']) {
      const timeKey = `${kind}MinimumSafeStallTimeS`; const conditions = withstand?.[`${kind}Conditions`];
      if (isRangeV2) {
        const curve = normalizeCurve(withstand?.[`${kind}MinimumSafeStallCurve`], `${path}.motorWithstand.${kind}MinimumSafeStallCurve`, issues, { timeKey: 'minimumSafeStallTimeS' });
        if (positive(timing.stallCurrentRangeA?.minimumA) && positive(timing.stallCurrentRangeA?.maximumA)
          && curve.length && (curve[0].currentA > timing.stallCurrentRangeA.minimumA || curve.at(-1).currentA < timing.stallCurrentRangeA.maximumA)) {
          issues.push(issue('MOTOR_PROTECTION_TIMING_WITHSTAND_CURVE_COVERAGE', `${path}.motorWithstand.${kind}MinimumSafeStallCurve`, 'Each supplied hot/cold withstand curve must cover the full declared stall-current range without extrapolation.'));
        }
      } else if (!positive(withstand?.[timeKey])) issues.push(issue('MOTOR_PROTECTION_TIMING_STALL_TIME', `${path}.motorWithstand.${timeKey}`, 'Hot and cold minimum safe-stall times must be positive finite seconds.'));
      validateConditions(conditions, kind, `${path}.motorWithstand.${kind}Conditions`, issues);
    }
    const selectedWithstandConditions = withstand?.[`${timing.initialState}Conditions`];
    if (selectedWithstandConditions?.ambientTemperatureC !== timing.ambientTemperatureC || selectedWithstandConditions?.frequencyHz !== timing.frequencyHz || selectedWithstandConditions?.phases !== timing.phases) issues.push(issue('MOTOR_PROTECTION_TIMING_SELECTED_CONDITION_MISMATCH', `${path}.motorWithstand.${timing.initialState}Conditions`, 'Selected hot/cold motor withstand conditions must match the stated comparison conditions.'));
    if (!isRangeV2 && timing.motorWithstand?.referenceCurrentA !== timing.referenceStartCurrentA) issues.push(issue('MOTOR_PROTECTION_TIMING_WITHSTAND_CURRENT_MISMATCH', `${path}.motorWithstand.referenceCurrentA`, 'Motor hot/cold withstand must be stated at the same exact reference start current.'));
    checkSource(withstand?.source, `${path}.motorWithstand.source`, issues);
    if (!Array.isArray(timing.devices) || timing.devices.length !== 2) issues.push(issue('MOTOR_PROTECTION_TIMING_DEVICE_SET', `${path}.devices`, 'Exactly one branch-breaker and one overload-relay bound are required.'));
    const devices = (Array.isArray(timing.devices) ? timing.devices : []).map((device, index) => validateDevice(device, index, issues));
    for (const device of devices) {
      const conditions = device.conditions;
      if (conditions?.initialState !== timing.initialState || conditions?.ambientTemperatureC !== timing.ambientTemperatureC || conditions?.frequencyHz !== timing.frequencyHz || conditions?.phases !== timing.phases) issues.push(issue('MOTOR_PROTECTION_TIMING_DEVICE_CONDITION_MISMATCH', `${path}.devices.${device.role}.conditions`, 'Device bound conditions must match selected state, ambient, frequency, and phases.'));
    }
    if (devices.filter(device => device.role === 'branch-breaker').length !== 1 || devices.filter(device => device.role === 'overload-relay').length !== 1) issues.push(issue('MOTOR_PROTECTION_TIMING_DEVICE_ROLES', `${path}.devices`, 'Exactly one device of each required role is required.'));
  }
  const inverseTime = criteria?.motorStarter?.branchProtectionMethod === 'inverse-time-breaker';
  if (requested && !inverseTime) issues.push(issue('MOTOR_PROTECTION_TIMING_TOPOLOGY', 'criteria.motorStarter.branchProtectionMethod', 'motor.protectionTiming is supported only for inverse-time-breaker topology.'));
  return { ok: issues.length === 0, requested, issues };
}

export function evaluateDesignSynthesisMotorProtectionTiming(proposal, accelerationResult, options = {}) {
  const canonicalLoads = Array.isArray(proposal?.loads) ? proposal.loads : [];
  const optionShapeIssues = [];
  if (!object(options)) optionShapeIssues.push(issue('MOTOR_PROTECTION_TIMING_OPTIONS_INVALID', 'options', 'Evaluation options must be a structured object.'));
  const safeOptions = object(options) ? options : {};
  const equipment = safeOptions.equipment === undefined ? canonicalLoads : safeOptions.equipment;
  const criteria = safeOptions.criteria === undefined ? (proposal?.inputs?.original?.criteria || {}) : safeOptions.criteria;
  const supply = safeOptions.supply === undefined ? (proposal?.inputs?.original?.supply || proposal?.inputs?.supply || {}) : safeOptions.supply;
  if (!object(criteria)) optionShapeIssues.push(issue('MOTOR_PROTECTION_TIMING_CRITERIA_INVALID', 'criteria', 'Explicit or saved criteria must be a structured object.'));
  if (!object(supply)) optionShapeIssues.push(issue('MOTOR_PROTECTION_TIMING_SUPPLY_INVALID', 'supply', 'Explicit or saved supply must be a structured object.'));
  const input = { equipment, criteria, supply };
  const validation = validateDesignSynthesisMotorProtectionTimingInputs({ equipment: input?.equipment, criteria: input?.criteria || {} });
  const motors = (Array.isArray(input?.equipment) ? input.equipment : []).filter(row => object(row?.motor) && row.motor.protectionTiming !== undefined);
  const canonicalRequested = canonicalLoads.filter(row => object(row?.motor) && row.motor.protectionTiming !== undefined);
  const requestedIds = motors.map(row => String(row.id));
  const canonicalRequestedIds = canonicalRequested.map(row => String(row.id));
  const requestedVersions = [...new Set([...motors, ...canonicalRequested].map(row => row.motor.protectionTiming?.schemaVersion).filter(value => ['1.0.0', '2.0.0'].includes(value)))];
  const hasRangeV2 = requestedVersions.includes('2.0.0');
  const hasReferenceV1 = requestedVersions.includes('1.0.0');
  const contextIssues = [...optionShapeIssues];
  if (new Set(requestedIds).size !== requestedIds.length || new Set(canonicalRequestedIds).size !== canonicalRequestedIds.length
    || requestedIds.length !== canonicalRequestedIds.length || requestedIds.some(id => !canonicalRequestedIds.includes(id))) {
    contextIssues.push(issue('MOTOR_PROTECTION_TIMING_REQUEST_CONTEXT_MISMATCH', 'equipment', 'Explicit timing inputs must contain exactly one record for each canonical motor with protectionTiming; missing, extra, or duplicate motor ids are rejected.'));
  }
  const method = hasRangeV2 && hasReferenceV1 ? 'motor-protection-timing-mixed-v1-v2' : hasRangeV2 ? METHOD_RANGE : METHOD;
  const fingerprint = fingerprintStudyValue({ method, input: (Array.isArray(input?.equipment) ? input.equipment : []).map(row => ({ id: row?.id, motor: row?.motor, kw: row?.kw, voltage: row?.voltage, phases: row?.phases, ratingsBasis: row?.ratingsBasis })), supply: input.supply, criteria: input.criteria, acceleration: accelerationResult, final: { cables: proposal?.cables, motorStarterCandidates: proposal?.motorStarterCandidates } });
  const suppliedCases = Array.isArray(accelerationResult?.cases) ? accelerationResult.cases : [];
  let recomputedAcceleration = null;
  if (motors.length && validation.ok && !contextIssues.length && accelerationResult?.status === 'evaluated') {
    try { recomputedAcceleration = evaluateDesignSynthesisMotorAcceleration(proposal, criteria); } catch { /* Reproduction failure is reported below. */ }
  }
  const cases = motors.map(load => {
    const timing = load.motor.protectionTiming; const motorId = String(load.id);
    const issues = [...validation.issues, ...contextIssues];
    if (issues.length) return { motorId, schemaVersion: timing?.schemaVersion ?? null, status: 'blocked', issues, completeProtectionStatus: 'blocked' };
    const acceleration = suppliedCases.find(item => String(item?.motorId) === motorId);
    if (accelerationResult?.status !== 'evaluated' || acceleration?.status !== 'evaluated' || !positive(acceleration.timeS) || !Array.isArray(acceleration.timeline) || acceleration.timeline.length < 2) issues.push(issue('MOTOR_PROTECTION_TIMING_ACCELERATION_UNAVAILABLE', `motor.protectionTiming.${motorId}`, 'A complete evaluated acceleration study and final motor timeline/duration are required.'));
    const expectedAccelerationFingerprint = designSynthesisMotorAccelerationFingerprint(proposal, criteria);
    if (!text(expectedAccelerationFingerprint) || accelerationResult?.modelInputFingerprint !== expectedAccelerationFingerprint) issues.push(issue('MOTOR_PROTECTION_TIMING_ACCELERATION_STALE', `motor.protectionTiming.${motorId}`, 'Acceleration evidence must match the proposal’s final saved acceleration fingerprint.'));
    const matchingFreshCases = (recomputedAcceleration?.cases || []).filter(item => String(item?.motorId) === motorId);
    if (!issues.length && (recomputedAcceleration?.status !== 'evaluated' || recomputedAcceleration.modelInputFingerprint !== expectedAccelerationFingerprint
      || suppliedCases.filter(item => String(item?.motorId) === motorId).length !== 1 || matchingFreshCases.length !== 1
      || !sameDesignSynthesisAccelerationCase(acceleration, matchingFreshCases[0]))) {
      issues.push(issue('MOTOR_PROTECTION_TIMING_ACCELERATION_RESULT_MISMATCH', `motor.protectionTiming.${motorId}`, 'The supplied acceleration time, exposure, or timeline does not match a fresh evaluation of the finalized network.'));
    }
    if (Array.isArray(acceleration?.timeline)) {
      const targetSpeedRpm = load.motor.acceleration?.targetSpeedRpm;
      if (acceleration.timeline.some((row, index) => !positive(row?.currentA) || !positive(row?.terminalVoltagePu) || !finite(row?.timeS) || !finite(row?.speedRpm) || (index && row.timeS < acceleration.timeline[index - 1].timeS))
        || acceleration.timeline[0]?.timeS !== 0 || Math.abs(acceleration.timeline.at(-1)?.timeS - acceleration.timeS) > Math.max(1e-10, acceleration.timeS * 1e-10)
        || acceleration.timeline[0]?.speedRpm !== 0 || acceleration.timeline.at(-1)?.speedRpm !== targetSpeedRpm) {
        issues.push(issue('MOTOR_PROTECTION_TIMING_ACCELERATION_TIMELINE_INVALID', `motor.protectionTiming.${motorId}`, 'Final acceleration timeline must contain finite positive currents/voltages, monotone time from zero to the reported duration, and span zero speed to the supplied target speed.'));
      }
    }
    const accelerationCurrents = (acceleration?.timeline || []).map(item => item.currentA);
    const rawPerformance = load.motor.acceleration?.performanceCurve?.points;
    if (!Array.isArray(rawPerformance) || rawPerformance.length < 2 || rawPerformance.some(point => !positive(point?.currentA))) issues.push(issue('MOTOR_PROTECTION_TIMING_PERFORMANCE_CURVE_REQUIRED', `motor.protectionTiming.${motorId}`, 'Complete finite motor.acceleration.performanceCurve.points are required to bound the supplied performance current envelope.'));
    const ratedVoltageV = load.motor.ratedVoltageV;
    const nominalVoltageV = Number(load.voltage);
    if (!positive(ratedVoltageV) || !positive(nominalVoltageV)) issues.push(issue('MOTOR_PROTECTION_TIMING_CANONICAL_VOLTAGE_REQUIRED', `motor.protectionTiming.${motorId}`, 'Positive canonical motor rated voltage and circuit voltage are required.'));
    const voltageScale = nominalVoltageV / ratedVoltageV;
    const performanceCurrents = (rawPerformance || []).map(item => item?.currentA * voltageScale);
    const allCurrents = [...accelerationCurrents, ...performanceCurrents];
    if (allCurrents.some(value => !positive(value)) || (allCurrents.length && (Math.min(...allCurrents) < timing.currentEnvelopeA.minimumA || Math.max(...allCurrents) > timing.currentEnvelopeA.maximumA || timing.referenceStartCurrentA < Math.max(...allCurrents)))) issues.push(issue('MOTOR_PROTECTION_TIMING_CURRENT_COVERAGE', `motor.protectionTiming.${motorId}.currentEnvelopeA`, 'Declared envelope must contain every voltage-scaled performance and final acceleration current, and referenceStartCurrentA must bound their maximum.'));
    const timelineVoltages = (acceleration?.timeline || []).map(row => Number(row.terminalVoltagePu) * nominalVoltageV);
    const allVoltages = [nominalVoltageV, ...timelineVoltages];
    let lockedRotorPoint = null;
    if (timing.schemaVersion === '2.0.0' && !issues.length) {
      lockedRotorPoint = recomputeLockedRotorPoint(proposal, canonicalLoads.find(row => String(row.id) === motorId), criteria, acceleration, `motor.protectionTiming.${motorId}`);
      issues.push(...lockedRotorPoint.issues);
      if (positive(lockedRotorPoint.voltagePu)) allVoltages.push(lockedRotorPoint.voltagePu * nominalVoltageV);
      if (positive(lockedRotorPoint.currentA) && (lockedRotorPoint.currentA < timing.stallCurrentRangeA.minimumA || lockedRotorPoint.currentA > timing.stallCurrentRangeA.maximumA)) {
        issues.push(issue('MOTOR_PROTECTION_TIMING_STALL_RANGE_MISSING_NETWORK_POINT', `motor.protectionTiming.${motorId}.stallCurrentRangeA`, 'The declared constant-stall range must contain the freshly recomputed nominal network locked-rotor current.'));
      }
    }
    const canonicalRecord = (Array.isArray(proposal?.loads) ? proposal.loads : []).find(row => String(row.id) === motorId);
    if (!canonicalRecord || fingerprintStudyValue(canonicalRecord.motor) !== fingerprintStudyValue(load.motor) || Number(canonicalRecord.voltage) !== Number(load.voltage) || Number(canonicalRecord.phases) !== Number(load.phases)) issues.push(issue('MOTOR_PROTECTION_TIMING_CANONICAL_SOURCE_MISMATCH', `motor.protectionTiming.${motorId}`, 'Raw motor timing evidence must match the exact canonical finalized motor, circuit voltage, and phase inputs.'));
    const expectedFrequencyHz = Number(load.motor.nameplateFrequencyHz ?? load.frequencyHz ?? load.frequency ?? criteria?.frequencyHz ?? criteria?.frequency);
    if (Number(load.phases) !== timing.phases || !finite(expectedFrequencyHz) || expectedFrequencyHz !== timing.frequencyHz) issues.push(issue('MOTOR_PROTECTION_TIMING_CANONICAL_CONDITION_MISMATCH', `motor.protectionTiming.${motorId}`, 'Supplied phase/frequency conditions must exactly match the canonical motor circuit and nameplate inputs.'));
    for (const device of timing.devices || []) {
      const range = device.conditions?.voltageRangeV;
      if (allVoltages.some(value => !positive(value)) || !Array.isArray(range) || Math.min(...allVoltages) < range[0] || Math.max(...allVoltages) > range[1]) issues.push(issue('MOTOR_PROTECTION_TIMING_VOLTAGE_COVERAGE', `motor.protectionTiming.${motorId}.devices.${device.role}.conditions.voltageRangeV`, 'Device evidence voltage range must cover canonical motor voltage and every final acceleration timeline voltage.'));
      if (timing.schemaVersion === '2.0.0' && (interpolate(device.minimumTrip, timing.stallCurrentRangeA.minimumA) === null
        || interpolate(device.minimumTrip, timing.stallCurrentRangeA.maximumA) === null
        || interpolate(device.maximumTotalCircuitClearing, timing.stallCurrentRangeA.minimumA) === null
        || interpolate(device.maximumTotalCircuitClearing, timing.stallCurrentRangeA.maximumA) === null)) {
        issues.push(issue('MOTOR_PROTECTION_TIMING_STALL_CURVE_COVERAGE', `motor.protectionTiming.${motorId}.devices.${device.role}`, 'Both device bounds must cover the full declared stall-current range without extrapolation.'));
      }
      if (timing.schemaVersion === '2.0.0') {
        const selectedCurve = timing.motorWithstand[`${timing.initialState}MinimumSafeStallCurve`].map(point => ({ currentA: point.currentA, timeS: point.minimumSafeStallTimeS }));
        if (!marginCriticalCurrents(device.maximumTotalCircuitClearing, selectedCurve, timing.stallCurrentRangeA.minimumA, timing.stallCurrentRangeA.maximumA).valid) {
          issues.push(issue('MOTOR_PROTECTION_TIMING_STALL_MARGIN_NUMERIC', `motor.protectionTiming.${motorId}.devices.${device.role}`, 'Log-log segment arithmetic cannot safely evaluate the complete clearing-versus-withstand margin.'));
        }
      }
    }
    const selectedWithstandRange = timing.motorWithstand[`${timing.initialState}Conditions`]?.voltageRangeV;
    if (allVoltages.some(value => !positive(value)) || !Array.isArray(selectedWithstandRange) || Math.min(...allVoltages) < selectedWithstandRange[0] || Math.max(...allVoltages) > selectedWithstandRange[1]) issues.push(issue('MOTOR_PROTECTION_TIMING_WITHSTAND_VOLTAGE_COVERAGE', `motor.protectionTiming.${motorId}.motorWithstand.${timing.initialState}Conditions.voltageRangeV`, 'Selected-state motor withstand voltage range must cover canonical motor voltage and every final acceleration timeline voltage.'));
    const starter = (proposal?.motorStarterCandidates?.cases || []).find(item => String(item.motorId) === motorId)?.candidate;
    if (!starter || starter.topology !== 'separate-branch-breaker-contactor-overload-relay') issues.push(issue('MOTOR_PROTECTION_TIMING_FINAL_CANDIDATE_MISSING', `motor.protectionTiming.${motorId}.devices`, 'Final inverse-time breaker starter candidate is unavailable.'));
    const branchCable = (proposal?.cables || []).find(item => String(item.loadId) === motorId);
    const operatingCurrentA = Number(branchCable?.motor?.branchBreakerOperatingCurrentA);
    const operatingCurrentReference = branchCable?.motor?.branchBreakerOperatingCurrentReference;
    const sourceFrequencyHz = supply.frequencyHz ?? supply.frequency ?? input.criteria?.frequencyHz ?? input.criteria?.frequency ?? 60;
    const currentContextCandidate = evaluateMotorBranchBreakerCandidate({
      load: { ...load, frequencyHz: load.frequencyHz ?? load.frequency ?? sourceFrequencyHz },
      supply: { ...supply, frequencyHz: sourceFrequencyHz }, criteria: input.criteria,
      ...(positive(operatingCurrentA) && text(operatingCurrentReference) ? { operatingCurrentA, operatingCurrentReference } : {}),
    }).candidate;
    if (!currentContextCandidate || !starter || currentContextCandidate.branchCircuitBreaker.catalogNumber !== starter.branchCircuitBreaker.catalogNumber
      || currentContextCandidate.branchCircuitBreaker.fixedOverloadPickupA !== starter.branchCircuitBreaker.fixedOverloadPickupA
      || currentContextCandidate.branchCircuitBreaker.instantaneousPickupA !== starter.branchCircuitBreaker.instantaneousPickupA
      || currentContextCandidate.contactor.catalogNumber !== starter.contactor.catalogNumber
      || currentContextCandidate.contactor.coilVoltageV !== starter.contactor.coilVoltageV
      || currentContextCandidate.overloadRelay.catalogNumber !== starter.overloadRelay.catalogNumber
      || currentContextCandidate.overloadRelay.candidateDialSettingA !== starter.overloadRelay.candidateDialSettingA) {
      issues.push(issue('MOTOR_PROTECTION_TIMING_STARTER_CONTEXT_STALE', `motor.protectionTiming.${motorId}`, 'Final candidate and exact settings do not match the current supplied starter criteria and retained operating-current basis.'));
    }
    const breaker = starter?.branchCircuitBreaker; const overload = starter?.overloadRelay;
    const expected = { 'branch-breaker': breaker ? { catalogNumber: breaker.catalogNumber, setting: { fixedIrA: breaker.fixedOverloadPickupA, instantaneousPickupA: breaker.instantaneousPickupA } } : null,
      'overload-relay': overload ? { catalogNumber: overload.catalogNumber, setting: { dialSettingA: overload.candidateDialSettingA } } : null };
    for (const device of timing.devices || []) {
      const match = expected[device.role];
      if (!match || device.catalogNumber !== match.catalogNumber || Object.entries(match.setting).some(([key, value]) => device.setting?.[key] !== value)) issues.push(issue('MOTOR_PROTECTION_TIMING_CANDIDATE_MISMATCH', `motor.protectionTiming.${motorId}.devices.${device.role}`, 'Exact catalog number and settings must match the finalized proposed candidate.'));
      if (interpolate(device.minimumTrip, timing.referenceStartCurrentA) === null || interpolate(device.maximumTotalCircuitClearing, timing.referenceStartCurrentA) === null) issues.push(issue('MOTOR_PROTECTION_TIMING_CURVE_COVERAGE', `motor.protectionTiming.${motorId}.devices.${device.role}`, 'Both curve bounds must cover referenceStartCurrentA without extrapolation.'));
    }
    if (issues.length) return { motorId, schemaVersion: timing?.schemaVersion ?? null, status: 'blocked', issues, completeProtectionStatus: 'blocked' };
    const startupDurationS = acceleration.timeS + timing.startMarginS;
    const deviceRows = timing.devices.map(device => {
      const minimumTripS = interpolate(device.minimumTrip, timing.referenceStartCurrentA);
      const maximumTotalCircuitClearingS = interpolate(device.maximumTotalCircuitClearing, timing.referenceStartCurrentA);
      const startupRideThroughMarginS = minimumTripS - startupDurationS;
      const selectedStateWithstandMarginS = timing.schemaVersion === '1.0.0'
        ? timing.motorWithstand[`${timing.initialState}MinimumSafeStallTimeS`] - maximumTotalCircuitClearingS : null;
      const row = { role: device.role, catalogNumber: device.catalogNumber, setting: device.setting, source: device.source,
        sourceFingerprint: fingerprintStudyValue({ source: device.source, conditions: device.conditions, setting: device.setting, minimumTrip: device.minimumTrip, maximumTotalCircuitClearing: device.maximumTotalCircuitClearing }),
        status: marginPasses(startupRideThroughMarginS, minimumTripS, startupDurationS) ? 'pass' : 'fail',
        minimumTripS, maximumTotalCircuitClearingS,
        startupRideThroughMarginS, ...(timing.schemaVersion === '1.0.0' ? { selectedStateWithstandMarginS } : {}) };
      if (timing.schemaVersion === '2.0.0') {
        const withstandCurve = timing.motorWithstand[`${timing.initialState}MinimumSafeStallCurve`].map(point => ({ currentA: point.currentA, timeS: point.minimumSafeStallTimeS }));
        const criticalCurrents = marginCriticalCurrents(device.maximumTotalCircuitClearing, withstandCurve, timing.stallCurrentRangeA.minimumA, timing.stallCurrentRangeA.maximumA);
        const knots = [...new Set([timing.stallCurrentRangeA.minimumA, timing.stallCurrentRangeA.maximumA, lockedRotorPoint.currentA,
          ...device.minimumTrip.map(point => point.currentA), ...device.maximumTotalCircuitClearing.map(point => point.currentA),
          ...withstandCurve.map(point => point.currentA), ...criticalCurrents.currents,
        ].filter(currentA => currentA >= timing.stallCurrentRangeA.minimumA && currentA <= timing.stallCurrentRangeA.maximumA))].sort((a, b) => a - b);
        const points = knots.map(currentA => {
          const minimumTripAtCurrentS = interpolate(device.minimumTrip, currentA);
          const maximumTotalCircuitClearingAtCurrentS = interpolate(device.maximumTotalCircuitClearing, currentA);
          const minimumSafeStallTimeS = interpolate(withstandCurve, currentA);
          const marginS = minimumSafeStallTimeS - maximumTotalCircuitClearingAtCurrentS;
          return { currentA, minimumTripS: minimumTripAtCurrentS, maximumTotalCircuitClearingS: maximumTotalCircuitClearingAtCurrentS,
            minimumSafeStallTimeS, marginS, status: marginPasses(marginS, minimumSafeStallTimeS, maximumTotalCircuitClearingAtCurrentS) ? 'pass' : 'fail' };
        });
        const limitingPoint = points.reduce((best, point) => !best || point.marginS < best.marginS ? point : best, null);
        const numeric = criticalCurrents.valid && points.length >= 1 && points.every(point => [point.currentA, point.minimumTripS, point.maximumTotalCircuitClearingS, point.minimumSafeStallTimeS, point.marginS].every(finite));
        row.stallRangeComparison = { status: numeric && points.every(point => point.status === 'pass') ? 'pass' : 'fail',
          scope: 'all-compared-bounds-below-limit', currentRangeA: { ...timing.stallCurrentRangeA }, points,
          limitingCurrentA: limitingPoint?.currentA ?? null, minimumMarginS: limitingPoint?.marginS ?? null,
          networkLockedRotorCurrentA: lockedRotorPoint.currentA, evidenceClass: device.source.evidenceClass,
          evidenceStatus: 'supplied-unverified' };
      }
      return row;
    });
    const earliestClearing = Math.min(...deviceRows.map(row => row.maximumTotalCircuitClearingS));
    if (![startupDurationS, earliestClearing, ...deviceRows.flatMap(row => [row.minimumTripS, row.maximumTotalCircuitClearingS, row.startupRideThroughMarginS,
      ...(timing.schemaVersion === '1.0.0' ? [row.selectedStateWithstandMarginS] : []), ...(row.stallRangeComparison?.points || []).flatMap(point => [point.minimumTripS, point.maximumTotalCircuitClearingS, point.minimumSafeStallTimeS, point.marginS])])].every(finite)) {
      return { motorId, schemaVersion: timing?.schemaVersion ?? null, status: 'blocked', issues: [issue('MOTOR_PROTECTION_TIMING_NUMERIC_RANGE', `motor.protectionTiming.${motorId}`, 'Interpolation or margin arithmetic exceeded finite numeric range.')], completeProtectionStatus: 'blocked' };
    }
    const limitingDevice = deviceRows.find(row => row.minimumTripS === Math.min(...deviceRows.map(item => item.minimumTripS)));
    const responsibleDevice = deviceRows.find(row => row.maximumTotalCircuitClearingS === earliestClearing);
    const safeStallMarginS = timing.schemaVersion === '1.0.0' ? timing.motorWithstand[`${timing.initialState}MinimumSafeStallTimeS`] - earliestClearing : null;
    const stallRangeRows = deviceRows.map(row => row.stallRangeComparison).filter(Boolean);
    const limitingRange = stallRangeRows.flatMap(row => row.points.map(point => ({ ...point, responsibleDevice: deviceRows.find(device => device.stallRangeComparison === row)?.role })))
      .reduce((best, point) => !best || point.marginS < best.marginS ? point : best, null);
    const comparisons = {
      startupRideThrough: { status: deviceRows.every(row => marginPasses(row.startupRideThroughMarginS, row.minimumTripS, startupDurationS)) ? 'pass' : 'fail', requiredTimeS: startupDurationS,
        availableTimeS: limitingDevice.minimumTripS, marginS: limitingDevice.startupRideThroughMarginS, limitingDevice: limitingDevice.role },
      selectedStateSafeStall: timing.schemaVersion === '1.0.0'
        ? { status: marginPasses(safeStallMarginS, timing.motorWithstand[`${timing.initialState}MinimumSafeStallTimeS`], earliestClearing) ? 'pass' : 'fail',
          requiredTimeS: earliestClearing, availableTimeS: timing.motorWithstand[`${timing.initialState}MinimumSafeStallTimeS`], marginS: safeStallMarginS,
          responsibleDevice: responsibleDevice.role, referenceCurrentOnly: true, currentA: timing.referenceStartCurrentA }
        : { status: stallRangeRows.length === deviceRows.length && stallRangeRows.every(row => row.status === 'pass') ? 'pass' : 'fail',
          scope: 'all-compared-bounds-below-limit', requiredTimeS: limitingRange?.maximumTotalCircuitClearingS ?? null,
          availableTimeS: limitingRange?.minimumSafeStallTimeS ?? null, marginS: limitingRange?.marginS ?? null,
          responsibleDevice: limitingRange?.responsibleDevice ?? null, referenceCurrentOnly: false,
          currentRangeA: { ...timing.stallCurrentRangeA }, limitingCurrentA: limitingRange?.currentA ?? null },
    };
    const status = Object.values(comparisons).every(value => value.status === 'pass') ? 'pass' : 'fail';
    return { motorId, status, comparisons, referenceStartCurrentA: timing.referenceStartCurrentA, referenceStartCurrentReference: timing.referenceStartCurrentReference,
      currentEnvelopeA: timing.currentEnvelopeA, accelerationTimeS: acceleration.timeS, startMarginS: timing.startMarginS, startupDurationS,
      initialState: timing.initialState, ambientTemperatureC: timing.ambientTemperatureC, frequencyHz: timing.frequencyHz, phases: timing.phases,
      motorWithstand: timing.motorWithstand, devices: deviceRows, earliestMaximumTotalCircuitClearingS: earliestClearing,
      ...(timing.schemaVersion === '2.0.0' ? { schemaVersion: '2.0.0', stallCurrentRangeA: { ...timing.stallCurrentRangeA },
        networkLockedRotorCurrentA: { valueA: lockedRotorPoint.currentA, terminalVoltagePu: lockedRotorPoint.voltagePu, maxMismatch: lockedRotorPoint.maxMismatch,
          iterations: lockedRotorPoint.iterations, basis: 'fresh canonical network locked-rotor solution at speed zero', status: 'recomputed-and-matched-to-acceleration' } } : { schemaVersion: '1.0.0' }),
      motorWithstandSourceFingerprint: fingerprintStudyValue(timing.motorWithstand),
      otherInitialState: timing.initialState === 'hot' ? { status: 'not-evaluated', reason: 'only the explicitly selected hot-state device bounds were supplied for this comparison' } : { status: 'not-evaluated', reason: 'only the explicitly selected cold-state device bounds were supplied for this comparison' },
      responsibleEarliestClearingDevice: responsibleDevice.role,
      evidenceClass: [...deviceRows.map(row => row.source.evidenceClass), timing.motorWithstand.source.evidenceClass].includes('synthetic') ? 'synthetic' : 'manufacturer',
      evidenceStatus: 'supplied-unverified',
      limitations: timing.schemaVersion === '2.0.0' ? [
        'The supplied stall-current interval is a separately referenced constant-stall-condition range; it is not inferred from the whole acceleration curve or fault-current study and does not establish coverage of every installed voltage/fault scenario.',
        'The range comparison evaluates supplied maximum total circuit-clearing and selected-state motor withstand bounds at the merged current points only. It does not integrate a changing current trajectory, establish actual stall protection, relay behavior, thermal memory, cooling, conductor damage, timed fault duty, SCCR, or complete protection.',
        ...LIMITATIONS.slice(1),
      ] : LIMITATIONS, completeProtectionStatus: 'blocked', issues: [] };
  });
  const status = !validation.ok || contextIssues.length || cases.some(item => item.status === 'blocked') ? 'blocked' : cases.some(item => item.status === 'fail') ? 'fail' : (cases.length ? 'pass' : 'not-requested');
  const aggregateLimitations = hasRangeV2 ? [
    'V1 cases remain reference-current-only; v2 cases compare the selected-state supplied withstand curve against device maximum total-clearing bounds over the separately declared constant-stall current interval and fresh nominal network locked-rotor point.',
    'The stall-current interval is supplied and unverified; it is not inferred from acceleration or fault-current histories and does not establish coverage of every installed voltage/fault scenario.',
    'No changing-current trajectory, actual stall protection, relay behavior, thermal memory, cooling, conductor damage, timed fault duty, SCCR, coordination, installation suitability, or complete protection is determined.',
    'All source references and device/motor performance bounds are supplied and unverified; synthetic evidence remains illustrative and does not represent installed settings or approval.',
  ] : LIMITATIONS;
  return { status, method, ...(requestedVersions.length ? { schemaVersions: requestedVersions } : {}), inputFingerprint: fingerprint, requested: validation.requested || canonicalRequested.length > 0, cases, issues: [...validation.issues, ...contextIssues, ...cases.flatMap(item => item.issues || [])],
    completeProtectionStatus: 'blocked', limitations: aggregateLimitations };
}

export default { validateDesignSynthesisMotorProtectionTimingInputs, evaluateDesignSynthesisMotorProtectionTiming };
