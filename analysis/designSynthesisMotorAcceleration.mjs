import { buildMotorStartingCaseModel, evaluateDesignSynthesisMotorStarting } from './designSynthesisMotorStarting.mjs';
import { runMotorStartingNetwork } from './designSynthesisMotorIdealTies.mjs';
import { fingerprintStudyValue } from './studyLifecycle.mjs';

const ACCELERATION_TIMELINE_FIELDS = ['speedRpm', 'timeS', 'terminalVoltagePu', 'currentA', 'motorTorqueNm', 'loadTorqueNm', 'netTorqueNm'];

/** Compare the numerical evidence used by dependent motor-protection screens. */
export function sameDesignSynthesisAccelerationCase(supplied, recomputed) {
  return recomputed?.status === 'evaluated' && Object.is(supplied?.timeS, recomputed.timeS)
    && Object.is(supplied?.electricalExposureA2S, recomputed.electricalExposureA2S)
    && Array.isArray(supplied?.timeline) && Array.isArray(recomputed.timeline)
    && supplied.timeline.length === recomputed.timeline.length
    && supplied.timeline.every((point, index) => ACCELERATION_TIMELINE_FIELDS.every(key => Object.is(point?.[key], recomputed.timeline[index]?.[key])));
}

const METHOD = 'balanced-dol-quasi-steady-acceleration-v1';
const MAX_EVALUATIONS = 25600;
const MAX_CASE_EVALUATIONS = 512;
const MAX_DEPTH = 10;
const RELATIVE_TOLERANCE = 1e-4;
const LIMITATIONS = [
  'Quasi-steady balanced DOL acceleration using explicitly supplied speed curves; this is not a time-domain motor, drive, or transient network model.',
  'Motor current and torque are adjusted by terminal-voltage ratio and squared terminal-voltage ratio respectively; these are explicit screening approximations.',
  'The integral of current squared over time is electrical exposure only; it is not conductor thermal damage, motor thermal withstand, protective clearing, or coordination evidence.',
  'Curve data, inertia, and references are supplied inputs and are not independently authenticated; no engineering approval is implied.'
];

const finite = value => typeof value === 'number' && Number.isFinite(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const idOf = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() || null : null;
const issue = (code, path, message) => ({ code, path, message, severity: 'blocking' });

function accelerationFingerprintContext(proposal, criteria) {
  const equipment = Array.isArray(proposal?.equipment) ? proposal.equipment : [];
  return fingerprintStudyValue({ method: METHOD, solverRevision: 'load-flow-v4',
    supply: proposal?.inputs?.original?.supply ?? proposal?.inputs?.supply ?? equipment.find(item => item?.type === 'source') ?? null,
    equipment: equipment.map(item => ({ id: item?.id, type: item?.type, voltage: item?.voltage, phases: item?.phases, availableFaultCurrentKA: item?.availableFaultCurrentKA,
      frequency: item?.frequency, frequencyHz: item?.frequencyHz, motorStartingImpedance: item?.motorStartingImpedance,
      profileId: item?.profileId, profileRevision: item?.profileRevision, ratedKVA: item?.ratedKVA,
      primaryBusId: item?.primaryBusId, secondaryBusId: item?.secondaryBusId, seriesModel: item?.seriesModel })),
    loads: (Array.isArray(proposal?.loads) ? proposal.loads : []).map(load => ({ id: load?.id, voltage: load?.voltage, kw: load?.kw, kvar: load?.kvar,
      powerFactor: load?.powerFactor, phases: load?.phases, frequency: load?.frequency, frequencyHz: load?.frequencyHz, motor: load?.motor ?? null })),
    cables: (Array.isArray(proposal?.cables) ? proposal.cables : []).map(cable => ({ id: cable?.id, from: cable?.from, to: cable?.to,
      lengthFt: cable?.lengthFt, conductor_size: cable?.conductor_size, r_ohm_per_kft: cable?.r_ohm_per_kft,
      x_ohm_per_kft: cable?.x_ohm_per_kft, impedanceBasis: cable?.impedanceBasis, impedance: cable?.impedance ?? null })),
    transformer: proposal?.transformer ?? null, oneLine: proposal?.oneLine ?? null,
    criteria: { maxIterations: criteria?.loadFlow?.maxIterations ?? 60, motorAcceleration: criteria?.motorAcceleration ?? null } });
}

export function designSynthesisMotorAccelerationFingerprint(proposal, criteria = {}) {
  return accelerationFingerprintContext(proposal, criteria);
}

function blockedResult(criteria, fingerprint, issues, cases = []) {
  return { status: 'blocked', method: METHOD, criteria, modelInputFingerprint: fingerprint, cases, issues,
    coverage: { status: 'incomplete', suppliedMotorCount: null, evaluatedMotorCount: cases.filter(item => item.status === 'evaluated' || item.status === 'fail').length }, limitations: LIMITATIONS };
}

function checkKeys(value, allowed, path, issues) {
  if (!object(value)) {
    issues.push(issue('ACCELERATION_OBJECT_REQUIRED', path, 'A complete object is required.'));
    return false;
  }
  for (const key of Object.keys(value)) if (!allowed.includes(key)) issues.push(issue('ACCELERATION_UNKNOWN_FIELD', `${path}.${key}`, 'Field is not part of the motor acceleration input contract.'));
  return true;
}

function validateCurve(curve, path, kind, targetSpeedRpm, issues) {
  const allowed = kind === 'performance' ? ['reference', 'points'] : ['reference', 'points'];
  if (!checkKeys(curve, allowed, path, issues)) return null;
  if (!text(curve.reference)) issues.push(issue('ACCELERATION_CURVE_REFERENCE_REQUIRED', `${path}.reference`, 'Curve reference must be non-blank.'));
  if (!Array.isArray(curve.points) || curve.points.length < 2 || curve.points.length > 65) {
    issues.push(issue('ACCELERATION_CURVE_POINT_COUNT', `${path}.points`, 'Curve must contain between 2 and 65 points.'));
    return null;
  }
  const points = [];
  curve.points.forEach((point, index) => {
    const pointPath = `${path}.points.${index}`;
    const pointKeys = kind === 'performance' ? ['speedRpm', 'currentA', 'powerFactor', 'torqueNm'] : ['speedRpm', 'torqueNm'];
    if (!checkKeys(point, pointKeys, pointPath, issues)) return;
    if (!finite(point.speedRpm) || point.speedRpm < 0 || !finite(point.torqueNm) || point.torqueNm < 0) {
      issues.push(issue('ACCELERATION_CURVE_POINT_INVALID', pointPath, 'Speed and torque must be finite and nonnegative.'));
      return;
    }
    if (kind === 'performance' && (!finite(point.currentA) || point.currentA <= 0 || !finite(point.powerFactor) || point.powerFactor < 0 || point.powerFactor > 1)) {
      issues.push(issue('ACCELERATION_ELECTRICAL_POINT_INVALID', pointPath, 'Current must be positive and power factor must be from zero through one.'));
      return;
    }
    if (index > 0 && !(point.speedRpm > curve.points[index - 1]?.speedRpm)) issues.push(issue('ACCELERATION_CURVE_ORDER', `${pointPath}.speedRpm`, 'Curve speeds must be strictly increasing; points are never reordered.'));
    points.push({ ...point });
  });
  if (points.length !== curve.points.length) return null;
  if (points[0].speedRpm !== 0) issues.push(issue('ACCELERATION_CURVE_ZERO_REQUIRED', `${path}.points.0.speedRpm`, 'Curve must start at zero speed.'));
  if (points.at(-1).speedRpm < targetSpeedRpm) issues.push(issue('ACCELERATION_CURVE_COVERAGE', path, 'Curve must cover targetSpeedRpm without extrapolation.'));
  return points;
}

export function validateDesignSynthesisMotorAccelerationInputs({ loads, equipment = [], criteria = {} } = {}) {
  const issues = [];
  const records = Array.isArray(loads) ? loads : Array.isArray(equipment) ? equipment : [];
  const motors = records.filter(load => object(load?.motor));
  const requested = motors.some(load => load.motor.acceleration !== undefined);
  const hasCriterion = object(criteria) && Object.prototype.hasOwnProperty.call(criteria, 'motorAcceleration');
  if (hasCriterion) {
    if (!object(criteria.motorAcceleration)) issues.push(issue('ACCELERATION_CRITERIA_INVALID', 'criteria.motorAcceleration', 'motorAcceleration criteria must be an object.'));
    else {
      checkKeys(criteria.motorAcceleration, ['maximumTimeS'], 'criteria.motorAcceleration', issues);
      const maximumTimeS = criteria.motorAcceleration.maximumTimeS;
      if (maximumTimeS !== undefined && (!finite(maximumTimeS) || maximumTimeS <= 0)) issues.push(issue('ACCELERATION_TIME_CRITERION_INVALID', 'criteria.motorAcceleration.maximumTimeS', 'maximumTimeS must be positive and finite when supplied.'));
      if (!requested) issues.push(issue('ACCELERATION_CRITERION_UNUSED', 'criteria.motorAcceleration', 'A motor acceleration criterion requires at least one requested motor acceleration model.'));
    }
  }
  if (!requested) return { requested, issues };
  const models = Object.create(null);
  for (const load of motors) if (load.motor.acceleration === undefined) issues.push(issue('ACCELERATION_INPUT_MISSING', `loads.${idOf(load.id) || 'unknown'}.motor.acceleration`, 'When acceleration is requested, every motor requires a complete acceleration input.'));
  for (const load of motors) {
    const motor = load.motor;
    if (motor.acceleration === undefined) continue;
    const path = `loads.${idOf(load.id) || 'unknown'}.motor.acceleration`;
    const acceleration = motor.acceleration;
    const issueStart = issues.length;
    checkKeys(acceleration, ['reference', 'motorInertiaKgM2', 'motorInertiaReference', 'loadInertiaKgM2', 'loadInertiaReference', 'targetSpeedRpm', 'performanceCurve', 'loadTorqueCurve'], path, issues);
    if (!text(acceleration?.reference)) issues.push(issue('ACCELERATION_REFERENCE_REQUIRED', `${path}.reference`, 'Acceleration model reference must be non-blank.'));
    if (!finite(acceleration?.motorInertiaKgM2) || acceleration.motorInertiaKgM2 <= 0) issues.push(issue('MOTOR_INERTIA_INVALID', `${path}.motorInertiaKgM2`, 'Motor inertia must be positive and finite.'));
    if (!text(acceleration?.motorInertiaReference)) issues.push(issue('MOTOR_INERTIA_REFERENCE_REQUIRED', `${path}.motorInertiaReference`, 'Motor inertia reference must be non-blank.'));
    if (!finite(acceleration?.loadInertiaKgM2) || acceleration.loadInertiaKgM2 < 0) issues.push(issue('LOAD_INERTIA_INVALID', `${path}.loadInertiaKgM2`, 'Load inertia must be finite and nonnegative.'));
    if (finite(acceleration?.motorInertiaKgM2) && finite(acceleration?.loadInertiaKgM2) && !finite(acceleration.motorInertiaKgM2 + acceleration.loadInertiaKgM2)) issues.push(issue('ACCELERATION_TOTAL_INERTIA_RANGE', path, 'Total motor and load inertia must remain finite.'));
    if (!text(acceleration?.loadInertiaReference)) issues.push(issue('LOAD_INERTIA_REFERENCE_REQUIRED', `${path}.loadInertiaReference`, 'Load inertia reference must be non-blank.'));
    if (!finite(acceleration?.targetSpeedRpm) || acceleration.targetSpeedRpm <= 0) issues.push(issue('ACCELERATION_TARGET_SPEED_INVALID', `${path}.targetSpeedRpm`, 'Target speed must be positive and finite.'));
    if (String(motor.starterType || '').toLowerCase() !== 'dol') issues.push(issue('ACCELERATION_STARTER_UNSUPPORTED', `${path}.starterType`, 'Only direct-on-line acceleration is supported.'));
    if (String(motor.rotorType || '').toLowerCase() !== 'squirrel-cage') issues.push(issue('ACCELERATION_ROTOR_UNSUPPORTED', `${path}.rotorType`, 'Acceleration requires an explicit squirrel-cage motor.'));
    if (motor.nameplateFrequencyHz !== 60) issues.push(issue('ACCELERATION_FREQUENCY_UNSUPPORTED', `${path}.nameplateFrequencyHz`, 'Acceleration curves require an explicit numeric 60 Hz motor nameplate frequency.'));
    const target = acceleration?.targetSpeedRpm;
    const performance = validateCurve(acceleration?.performanceCurve, `${path}.performanceCurve`, 'performance', target, issues);
    const loadTorque = validateCurve(acceleration?.loadTorqueCurve, `${path}.loadTorqueCurve`, 'load', target, issues);
    if (performance?.[0] && finite(motor.lockedRotorCurrentA) && finite(motor.lockedRotorPowerFactor)) {
      if (Math.abs(performance[0].currentA - motor.lockedRotorCurrentA) > Math.max(1e-9, Math.abs(motor.lockedRotorCurrentA) * 1e-9)
        || Math.abs(performance[0].powerFactor - motor.lockedRotorPowerFactor) > 1e-9) {
        issues.push(issue('ACCELERATION_STALL_POINT_MISMATCH', `${path}.performanceCurve.points.0`, 'The zero-speed electrical point must match lockedRotorCurrentA and lockedRotorPowerFactor.'));
      }
    }
    if (performance && finite(motor.ratedVoltageV) && motor.ratedVoltageV > 0 && finite(target) && target > 0) validateElectricalMechanicalPower(performance, motor.ratedVoltageV, target, `${path}.performanceCurve`, issues);
    if (issues.length === issueStart && performance && loadTorque) models[idOf(load.id) || 'unknown'] = { performance, loadTorque };
  }
  // Equipment is accepted so callers can use the same validator signature as adjacent synthesis validators.
  if (equipment !== undefined && !Array.isArray(equipment)) issues.push(issue('ACCELERATION_EQUIPMENT_INVALID', 'equipment', 'equipment must be an array when supplied.'));
  return { requested, issues, models };
}

function interpolate(points, speedRpm) {
  if (speedRpm < points[0].speedRpm || speedRpm > points.at(-1).speedRpm) return null;
  let upper = 1;
  while (upper < points.length - 1 && speedRpm > points[upper].speedRpm) upper += 1;
  const left = points[upper - 1]; const right = points[upper];
  const fraction = (speedRpm - left.speedRpm) / (right.speedRpm - left.speedRpm);
  const value = key => left[key] + fraction * (right[key] - left[key]);
  return Object.fromEntries(Object.keys(left).filter(key => key !== 'speedRpm').map(key => [key, value(key)]));
}

function validateElectricalMechanicalPower(points, ratedVoltageV, targetSpeedRpm, path, issues) {
  const speeds = [...new Set([0, targetSpeedRpm, ...points.map(point => point.speedRpm).filter(speed => speed > 0 && speed < targetSpeedRpm)])].sort((a, b) => a - b);
  for (let index = 0; index < speeds.length - 1; index += 1) {
    const start = speeds[index]; const end = speeds[index + 1];
    const left = interpolate(points, start); const right = interpolate(points, end);
    if (!left || !right) continue;
    const width = end - start;
    const currentSlope = (right.currentA - left.currentA) / width;
    const pfSlope = (right.powerFactor - left.powerFactor) / width;
    const torqueSlope = (right.torqueNm - left.torqueNm) / width;
    const electrical = [left.currentA * left.powerFactor, left.currentA * pfSlope + currentSlope * left.powerFactor, currentSlope * pfSlope].map(value => value * Math.sqrt(3) * ratedVoltageV);
    const mechanical = [start * left.torqueNm, start * torqueSlope + left.torqueNm, torqueSlope].map(value => value * (2 * Math.PI / 60));
    const difference = electrical.map((value, coefficient) => value - mechanical[coefficient]);
    const offsets = [0, width];
    if (difference[2] !== 0) {
      const critical = -difference[1] / (2 * difference[2]);
      if (critical > 0 && critical < width) offsets.push(critical);
    }
    for (const offset of offsets) {
      const electricalPowerW = electrical[0] + electrical[1] * offset + electrical[2] * offset ** 2;
      const shaftPowerW = mechanical[0] + mechanical[1] * offset + mechanical[2] * offset ** 2;
      const roundoff = 64 * Number.EPSILON * Math.max(Math.abs(electricalPowerW), Math.abs(shaftPowerW), Number.MIN_VALUE);
      if (shaftPowerW > electricalPowerW + roundoff) {
        issues.push(issue('ACCELERATION_POWER_BALANCE_INVALID', path, `Shaft output torque implies ${shaftPowerW} W at ${start + offset} rpm, exceeding rated-voltage electrical input ${electricalPowerW} W.`));
        return;
      }
    }
  }
}

function finiteNetworkResult(result, model, syntheticId) {
  const buses = (result?.buses || []).filter(bus => idOf(bus.id) !== syntheticId);
  const lines = result?.lines || [];
  const expectedBuses = model.buses.filter(bus => idOf(bus.id) !== syntheticId);
  const expectedLines = model.branches;
  return result?.converged === true && finite(result.maxMismatch)
    && buses.length === expectedBuses.length && new Set(buses.map(bus => idOf(bus.id))).size === expectedBuses.length
    && expectedBuses.every(bus => buses.some(row => idOf(row.id) === idOf(bus.id) && finite(row.Vm)))
    && lines.length === expectedLines.length && new Set(lines.map(row => idOf(row.id || row.componentId))).size === expectedLines.length
    && expectedLines.every(branch => lines.some(row => idOf(row.id || row.componentId) === idOf(branch.id) && finite(row.fromCurrentA ?? row.amps) && finite(row.toCurrentA)));
}

function simpson(left, middle, right, width) {
  return { time: width * (left.time + 4 * middle.time + right.time) / 6, exposure: width * (left.exposure + 4 * middle.exposure + right.exposure) / 6 };
}

function integrateInterval(evaluate, leftSpeed, rightSpeed, depth = 0) {
  const middleSpeed = (leftSpeed + rightSpeed) / 2;
  const left = evaluate(leftSpeed); const middle = evaluate(middleSpeed); const right = evaluate(rightSpeed);
  if ([left, middle, right].some(item => !item || item.status !== 'ok')) {
    const failed = [left, middle, right].find(item => item && item.status !== 'ok');
    return { status: failed?.status === 'stall' ? 'stall' : failed?.status === 'unconverged' ? 'unconverged' : 'blocked', failedAtSpeedRpm: failed?.speedRpm ?? null };
  }
  const coarse = simpson(left, middle, right, rightSpeed - leftSpeed);
  const leftMiddleSpeed = (leftSpeed + middleSpeed) / 2; const rightMiddleSpeed = (middleSpeed + rightSpeed) / 2;
  const leftMiddle = evaluate(leftMiddleSpeed); const rightMiddle = evaluate(rightMiddleSpeed);
  if ([leftMiddle, rightMiddle].some(item => !item || item.status !== 'ok')) {
    const failed = [leftMiddle, rightMiddle].find(item => item && item.status !== 'ok');
    return { status: failed?.status === 'stall' ? 'stall' : failed?.status === 'unconverged' ? 'unconverged' : 'blocked', failedAtSpeedRpm: failed?.speedRpm ?? null };
  }
  const first = simpson(left, leftMiddle, middle, middleSpeed - leftSpeed);
  const second = simpson(middle, rightMiddle, right, rightSpeed - middleSpeed);
  const refined = { time: first.time + second.time, exposure: first.exposure + second.exposure };
  const timeError = Math.abs(refined.time - coarse.time) / 15;
  const exposureError = Math.abs(refined.exposure - coarse.exposure) / 15;
  const timeScale = Math.max(Math.abs(refined.time), Number.MIN_VALUE);
  const exposureScale = Math.max(Math.abs(refined.exposure), Number.MIN_VALUE);
  if (timeError <= RELATIVE_TOLERANCE * timeScale && exposureError <= RELATIVE_TOLERANCE * exposureScale) {
    return { status: 'ok', timeS: refined.time + (refined.time - coarse.time) / 15, electricalExposureA2S: refined.exposure + (refined.exposure - coarse.exposure) / 15, evaluations: 5, estimatedRelativeError: Math.max(timeError / timeScale, exposureError / exposureScale), refinements: 0 };
  }
  if (depth >= MAX_DEPTH) return { status: 'unconverged', failedAtSpeedRpm: middleSpeed };
  const leftResult = integrateInterval(evaluate, leftSpeed, middleSpeed, depth + 1);
  if (leftResult.status !== 'ok') return leftResult;
  const rightResult = integrateInterval(evaluate, middleSpeed, rightSpeed, depth + 1);
  if (rightResult.status !== 'ok') return rightResult;
  return { status: 'ok', timeS: leftResult.timeS + rightResult.timeS, electricalExposureA2S: leftResult.electricalExposureA2S + rightResult.electricalExposureA2S,
    estimatedRelativeError: Math.max(leftResult.estimatedRelativeError, rightResult.estimatedRelativeError), refinements: leftResult.refinements + rightResult.refinements + 1 };
}

function caseIssuesForSharedValidation(validation, motorId) {
  return (validation.issues || []).map(item => ({ ...item, path: item.path?.includes(motorId) ? item.path : `loads.${motorId}.${item.path || ''}` }));
}

export function evaluateDesignSynthesisMotorAcceleration(proposal, criteria = {}) {
  const loads = Array.isArray(proposal?.loads) ? proposal.loads : [];
  const motors = loads.filter(load => object(load?.motor));
  const shape = validateDesignSynthesisMotorAccelerationInputs({ loads, equipment: proposal?.equipment, criteria });
  const requested = shape.requested;
  const maximumTimeS = criteria?.motorAcceleration?.maximumTimeS;
  const effectiveCriteria = { maximumTimeS: maximumTimeS ?? null };
  const fingerprint = accelerationFingerprintContext(proposal, criteria);
  if (!requested && !shape.issues.length) return { status: 'not-requested', method: METHOD, criteria: effectiveCriteria, modelInputFingerprint: fingerprint, cases: [], issues: [],
    coverage: { status: 'not-applicable', suppliedMotorCount: motors.length, evaluatedMotorCount: 0 }, limitations: LIMITATIONS };
  if (shape.issues.length) return blockedResult(effectiveCriteria, fingerprint, shape.issues);

  // Reuse the canonical network, frequency, source, and running-load validation used by the existing starting screen.
  const sharedValidation = evaluateDesignSynthesisMotorStarting(proposal, criteria, { requireVoltageCriterion: false, validationOnly: true });
  if ((sharedValidation.issues || []).length) return blockedResult(effectiveCriteria, fingerprint, caseIssuesForSharedValidation(sharedValidation, idOf(motors[0]?.id) || 'unknown'));
  const equipment = Array.isArray(proposal?.equipment) ? proposal.equipment : [];
  const source = equipment.find(item => String(item?.type || '').toLowerCase() === 'source');
  const maxIterations = criteria?.loadFlow?.maxIterations ?? 60;
  const cases = [];
  let globalEvaluations = 0;

  for (const load of motors) {
    const motorId = idOf(load.id) || 'unknown';
    const path = `loads.${motorId}.motor.acceleration`;
    const acceleration = load.motor.acceleration;
    const target = acceleration.targetSpeedRpm;
    const { performance, loadTorque } = shape.models[motorId] || {};
    if (!performance || !loadTorque) {
      cases.push({ motorId, status: 'blocked', timeS: null, criterionStatus: 'not-evaluated', timeline: [], electricalExposureA2S: null,
        issues: [issue('ACCELERATION_INPUT_UNAVAILABLE', path, 'Validated acceleration curves are unavailable for this motor.')], limitations: LIMITATIONS });
      continue;
    }

    const totalInertia = acceleration.motorInertiaKgM2 + acceleration.loadInertiaKgM2;
    const breakpoints = [...new Set([0, target, ...performance.map(point => point.speedRpm).filter(speed => speed < target), ...loadTorque.map(point => point.speedRpm).filter(speed => speed < target)])].sort((a, b) => a - b);
    const cache = new Map();
    const networkCache = new Map();
    let caseEvaluations = 0;
    let modelError = null;
    const evaluate = speedRpm => {
      if (cache.has(speedRpm)) return cache.get(speedRpm);
      const electrical = interpolate(performance, speedRpm);
      const mechanical = interpolate(loadTorque, speedRpm);
      if (!electrical || !mechanical) return { status: 'blocked', speedRpm };
      const electricalKey = JSON.stringify([electrical.currentA, electrical.powerFactor]);
      let solved = networkCache.get(electricalKey);
      if (!solved) {
        if (globalEvaluations >= MAX_EVALUATIONS || caseEvaluations >= MAX_CASE_EVALUATIONS) return { status: 'unconverged', speedRpm, reason: 'The per-case or study-wide network evaluation budget was exhausted.' };
        let built; let result;
        try {
          built = buildMotorStartingCaseModel(proposal, load, source, { currentA: electrical.currentA, powerFactor: electrical.powerFactor });
          result = runMotorStartingNetwork(built.model, { baseMVA: 1, balanced: true, maxIterations });
        } catch (error) {
          modelError = error.message || String(error);
          const failed = { status: 'blocked', speedRpm, reason: modelError }; cache.set(speedRpm, failed); return failed;
        }
        globalEvaluations += 1;
        caseEvaluations += 1;
        if (!finiteNetworkResult(result, built.model, built.syntheticId)) {
          const failed = { status: 'blocked', speedRpm, reason: 'The finalized network load-flow did not converge or omitted required bus/circuit outputs.' };
          cache.set(speedRpm, failed); return failed;
        }
        const busModel = built.model.buses.find(item => idOf(item.id) === motorId);
        solved = { result, motorBaseKV: busModel.baseKV };
        networkCache.set(electricalKey, solved);
      }
      const bus = solved.result.buses.find(item => idOf(item.id) === motorId);
      const voltageRatio = bus.Vm * solved.motorBaseKV * 1000 / load.motor.ratedVoltageV;
      const currentA = electrical.currentA * voltageRatio;
      const motorTorqueNm = electrical.torqueNm * voltageRatio ** 2;
      const loadTorqueNm = mechanical.torqueNm;
      const netTorqueNm = motorTorqueNm - loadTorqueNm;
      const torqueScale = Math.max(Math.abs(motorTorqueNm), Math.abs(loadTorqueNm), Number.MIN_VALUE);
      const failed = ![voltageRatio, currentA, motorTorqueNm, loadTorqueNm, netTorqueNm].every(Number.isFinite);
      if (failed) { const row = { status: 'blocked', speedRpm, reason: 'Network-adjusted acceleration quantities are outside the finite numeric range.' }; cache.set(speedRpm, row); return row; }
      if (netTorqueNm <= 0) { const row = { status: 'stall', speedRpm, terminalVoltagePu: bus.Vm, voltageRatio, currentA, motorTorqueNm, loadTorqueNm, netTorqueNm }; cache.set(speedRpm, row); return row; }
      const radiansPerSecondPerRpm = 2 * Math.PI / 60;
      const time = totalInertia * radiansPerSecondPerRpm / netTorqueNm;
      const exposure = currentA ** 2 * time;
      if (!finite(time) || time <= 0 || !finite(exposure) || exposure <= 0) {
        const row = { status: 'blocked', speedRpm, reason: 'Acceleration time or current-squared exposure exceeded the finite positive numeric range.' };
        cache.set(speedRpm, row); return row;
      }
      const row = { status: 'ok', speedRpm, terminalVoltagePu: bus.Vm, voltageRatio, currentA, motorTorqueNm, loadTorqueNm, netTorqueNm,
        time, exposure,
        torqueGuardNm: torqueScale * Number.EPSILON * 64 };
      if (netTorqueNm <= row.torqueGuardNm) row.status = 'stall';
      cache.set(speedRpm, row); return row;
    };
    const pointRows = breakpoints.map(evaluate);
    const stall = pointRows.find(row => row?.status === 'stall');
    const invalid = pointRows.find(row => row?.status !== 'ok');
    if (stall || invalid) {
      const row = stall || invalid;
      const budgetExhausted = row.status === 'unconverged';
      cases.push({ motorId, status: stall ? 'fail' : 'blocked', timeS: null, failedAtSpeedRpm: row.speedRpm, failure: stall ? 'insufficient-positive-acceleration-torque' : row.reason || 'network-evaluation-failed',
        criterionStatus: 'not-evaluated', timeline: pointRows.filter(item => item?.status === 'ok').map(item => ({ speedRpm: item.speedRpm, terminalVoltagePu: item.terminalVoltagePu, currentA: item.currentA, motorTorqueNm: item.motorTorqueNm, loadTorqueNm: item.loadTorqueNm, netTorqueNm: item.netTorqueNm })),
        electricalExposureA2S: null, refinement: { caseNetworkEvaluations: caseEvaluations, maximumCaseEvaluations: MAX_CASE_EVALUATIONS, totalNetworkEvaluations: globalEvaluations, maximumTotalEvaluations: MAX_EVALUATIONS },
        issues: stall ? [] : [issue(budgetExhausted ? 'ACCELERATION_EVALUATION_BUDGET_EXHAUSTED' : 'ACCELERATION_NETWORK_EVALUATION_FAILED', path, row.reason || modelError || 'Network evaluation failed.')], limitations: LIMITATIONS });
      continue;
    }

    const segments = [];
    for (let index = 0; index < breakpoints.length - 1; index += 1) {
      const segment = integrateInterval(evaluate, breakpoints[index], breakpoints[index + 1]);
      if (segment.status !== 'ok') { segments.push(segment); break; }
      segments.push(segment);
    }
    const failedSegment = segments.find(segment => segment.status !== 'ok');
    if (failedSegment) {
      const stalled = failedSegment.status === 'stall';
      const budgetExhausted = failedSegment.status === 'unconverged';
      cases.push({ motorId, status: stalled ? 'fail' : 'blocked', timeS: null, failedAtSpeedRpm: failedSegment.failedAtSpeedRpm,
        failure: stalled ? 'insufficient-positive-acceleration-torque' : 'integration-did-not-converge', criterionStatus: 'not-evaluated', timeline: pointRows.map(item => ({ speedRpm: item.speedRpm, terminalVoltagePu: item.terminalVoltagePu, currentA: item.currentA, motorTorqueNm: item.motorTorqueNm, loadTorqueNm: item.loadTorqueNm, netTorqueNm: item.netTorqueNm })),
        electricalExposureA2S: null, refinement: { caseNetworkEvaluations: caseEvaluations, maximumCaseEvaluations: MAX_CASE_EVALUATIONS, totalNetworkEvaluations: globalEvaluations, maximumTotalEvaluations: MAX_EVALUATIONS, maximumDepth: MAX_DEPTH },
        issues: stalled ? [] : [issue(budgetExhausted ? 'ACCELERATION_EVALUATION_BUDGET_EXHAUSTED' : 'ACCELERATION_INTEGRATION_UNCONVERGED', path,
          budgetExhausted ? 'The per-case or study-wide network evaluation budget was exhausted before time integration converged.' : 'Adaptive speed integration did not meet its bounded convergence tolerance.')], limitations: LIMITATIONS });
      continue;
    }
    const timeS = segments.reduce((sum, segment) => sum + segment.timeS, 0);
    const exposure = segments.reduce((sum, segment) => sum + segment.electricalExposureA2S, 0);
    if (!finite(timeS) || timeS <= 0 || !finite(exposure) || exposure <= 0) {
      cases.push({ motorId, status: 'blocked', timeS: null, criterionStatus: 'not-evaluated', timeline: [], electricalExposureA2S: null,
        issues: [issue('ACCELERATION_INTEGRAL_RANGE', path, 'Integrated time or current-squared exposure is outside the finite positive numeric range.')], limitations: LIMITATIONS });
      continue;
    }
    const estimatedRelativeError = Math.max(
      segments.reduce((sum, segment) => sum + segment.timeS * segment.estimatedRelativeError, 0) / timeS,
      segments.reduce((sum, segment) => sum + segment.electricalExposureA2S * segment.estimatedRelativeError, 0) / exposure,
    );
    const timeline = pointRows.map((row, index) => {
      const cumulative = segments.slice(0, index).reduce((sum, segment) => sum + segment.timeS, 0);
      return { speedRpm: row.speedRpm, timeS: cumulative, terminalVoltagePu: row.terminalVoltagePu, currentA: row.currentA,
        motorTorqueNm: row.motorTorqueNm, loadTorqueNm: row.loadTorqueNm, netTorqueNm: row.netTorqueNm };
    });
    const criterionStatus = maximumTimeS === undefined ? 'not-evaluated' : timeS <= maximumTimeS ? 'pass' : 'fail';
    cases.push({ motorId, status: 'evaluated', timeS, criterionStatus, electricalExposureA2S: exposure, timeline,
      refinement: { method: 'adaptive-simpson-by-speed-interval', relativeTolerance: RELATIVE_TOLERANCE, estimatedRelativeError,
        caseNetworkEvaluations: caseEvaluations, maximumCaseEvaluations: MAX_CASE_EVALUATIONS, totalNetworkEvaluations: globalEvaluations, maximumTotalEvaluations: MAX_EVALUATIONS, maximumDepth: MAX_DEPTH }, issues: [], limitations: LIMITATIONS });
  }
  const hasBlocked = cases.some(item => item.status === 'blocked');
  return { status: hasBlocked ? 'blocked' : 'evaluated', method: METHOD, criteria: effectiveCriteria, modelInputFingerprint: fingerprint,
    cases, issues: cases.flatMap(item => item.issues || []),
    coverage: { status: hasBlocked ? 'incomplete' : 'complete', suppliedMotorCount: motors.length, evaluatedMotorCount: cases.filter(item => item.status === 'evaluated' || item.status === 'fail').length,
      totalNetworkEvaluations: globalEvaluations, maximumTotalEvaluations: MAX_EVALUATIONS }, limitations: LIMITATIONS };
}

export default { evaluateDesignSynthesisMotorAcceleration };
