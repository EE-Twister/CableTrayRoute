import { analyzeDesignSynthesisSourceFaultConsistency } from './designSynthesisSourceFault.mjs';
import { validateDesignSynthesisMotorThermalInputs } from './designSynthesisMotorThermal.mjs';
import { validateDesignSynthesisMotorProtectionTimingInputs } from './designSynthesisMotorProtectionTiming.mjs';
import { validateMotorDesignCurrentReference } from './motorDesignCurrentReference.mjs';
import { SUPPORTED_MOTOR_BREAKER_PICKUPS } from './motorStarterPickup.mjs';
import { indicatesDesignSynthesisMotor, hasUnsupportedDesignSynthesisStarter } from './designSynthesisMotorClassification.mjs';
import { validateMotorOperatingReference } from './motorReferenceProfiles.mjs';
import { MOTOR_40HP_BREAKER_AMBIENT_RATINGS } from './designSynthesisMotor40HpCandidate.mjs';
import { MOTOR_S2_AMBIENT_TEMPERATURES } from './motorS2BreakerAmbient.mjs';

const MOTOR_KEYS = new Set([
  'ratedVoltageV',
  'fullLoadCurrentA',
  'fullLoadCurrentBasis',
  'nameplateCurrentA',
  'nameplateHorsepower',
  'nameplateFrequencyHz',
  'lockedRotorCurrentA',
  'lockedRotorPowerFactor',
  'starterType',
  'rotorType',
  'instantaneousPickupA',
  'breakerAmbientTemperatureC',
  'breakerAmbientReference',
  'acceleration',
  'rem610Thermal',
  'protectionTiming',
]);

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function positive(value) { return finite(value) && value > 0; }
function issue(code, message, path, severity = 'blocking') { return { code, message, path, severity }; }

export function isDesignSynthesisMotor(record = {}) {
  return indicatesDesignSynthesisMotor(record);
}

function validateMotorRecord(record, path, issues, motors) {
  const motor = record?.motor;
  if (!object(motor)) {
    issues.push(issue('MOTOR_DATA_REQUIRED', 'Motor-classified equipment requires a motor object with explicit design and starting data.', `${path}.motor`));
    return;
  }
  for (const key of Object.keys(motor)) if (!MOTOR_KEYS.has(key)) issues.push(issue('UNKNOWN_MOTOR_FIELD', `Unknown motor field ${key}.`, `${path}.motor.${key}`));
  if (Object.prototype.hasOwnProperty.call(motor, 'instantaneousPickupA') && motor.instantaneousPickupA !== null && !SUPPORTED_MOTOR_BREAKER_PICKUPS.includes(motor.instantaneousPickupA)) issues.push(issue('INVALID_MOTOR_INSTANTANEOUS_PICKUP', 'Motor instantaneous pickup must be null or a supported discrete TM230 value; the selected breaker must also support it.', `${path}.motor.instantaneousPickupA`));
  const hasAmbient = motor.breakerAmbientTemperatureC !== undefined || motor.breakerAmbientReference !== undefined;
  const ambientSuppressed = motor.breakerAmbientTemperatureC === null && motor.breakerAmbientReference === null;
  if (hasAmbient) {
    if (!ambientSuppressed && (typeof motor.breakerAmbientTemperatureC !== 'number' || !Object.prototype.hasOwnProperty.call(MOTOR_40HP_BREAKER_AMBIENT_RATINGS, motor.breakerAmbientTemperatureC))) issues.push(issue('INVALID_BREAKER_AMBIENT_TEMPERATURE', 'Motor breaker enclosure temperature must match a published 40, 45, 50, 55, 60, 65, or 70 °C table point.', `${path}.motor.breakerAmbientTemperatureC`));
    if (!ambientSuppressed && (typeof motor.breakerAmbientReference !== 'string' || !motor.breakerAmbientReference.trim())) issues.push(issue('BREAKER_AMBIENT_REFERENCE_REQUIRED', 'Motor breaker enclosure temperature requires a nonblank reference.', `${path}.motor.breakerAmbientReference`));
  }
  for (const key of ['ratedVoltageV', 'fullLoadCurrentA', 'nameplateCurrentA', 'lockedRotorCurrentA']) {
    if (!positive(motor[key])) issues.push(issue('INVALID_MOTOR_RATING', `motor.${key} must be a positive finite number in the documented units.`, `${path}.motor.${key}`));
  }
  for (const key of ['nameplateHorsepower', 'nameplateFrequencyHz']) {
    if (motor[key] !== undefined && !positive(motor[key])) issues.push(issue('INVALID_MOTOR_NAMEPLATE_VALUE', `motor.${key} must be a positive finite number when supplied.`, `${path}.motor.${key}`));
  }
  if (positive(motor.nameplateFrequencyHz) && motor.nameplateFrequencyHz !== 60) {
    issues.push(issue('UNSUPPORTED_MOTOR_NAMEPLATE_FREQUENCY', 'The motor starting model currently supports only an explicitly supplied 60 Hz nameplate frequency.', `${path}.motor.nameplateFrequencyHz`));
  }
  if (!object(motor.fullLoadCurrentBasis)) {
    issues.push(issue('MOTOR_FLC_BASIS_REQUIRED', 'Motor design full-load current requires a referenced basis object.', `${path}.motor.fullLoadCurrentBasis`));
  } else {
    for (const key of Object.keys(motor.fullLoadCurrentBasis)) if (!['reference', 'label'].includes(key)) issues.push(issue('UNKNOWN_MOTOR_FLC_BASIS_FIELD', `Unknown full-load-current basis field ${key}.`, `${path}.motor.fullLoadCurrentBasis.${key}`));
    if (typeof motor.fullLoadCurrentBasis.reference !== 'string' || !motor.fullLoadCurrentBasis.reference.trim()) issues.push(issue('MOTOR_FLC_BASIS_REQUIRED', 'fullLoadCurrentBasis.reference must identify the table or source basis.', `${path}.motor.fullLoadCurrentBasis.reference`));
    if (motor.fullLoadCurrentBasis.label !== undefined && (typeof motor.fullLoadCurrentBasis.label !== 'string' || !motor.fullLoadCurrentBasis.label.trim())) issues.push(issue('INVALID_MOTOR_FLC_LABEL', 'fullLoadCurrentBasis.label must be a non-blank string when supplied.', `${path}.motor.fullLoadCurrentBasis.label`));
  }
  const referenceIssue = validateMotorDesignCurrentReference(record);
  if (referenceIssue) issues.push(issue('MOTOR_DESIGN_CURRENT_REFERENCE_STALE', referenceIssue, `${path}.motor.fullLoadCurrentBasis.reference`));
  const operatingIssue = validateMotorOperatingReference(record);
  if (operatingIssue) issues.push(issue('MOTOR_OPERATING_REFERENCE_STALE', operatingIssue, `${path}.motorOperatingBasis`));
  if (!finite(motor.lockedRotorPowerFactor) || motor.lockedRotorPowerFactor <= 0 || motor.lockedRotorPowerFactor > 1) issues.push(issue('INVALID_MOTOR_LOCKED_ROTOR_PF', 'motor.lockedRotorPowerFactor must be greater than zero and no greater than one.', `${path}.motor.lockedRotorPowerFactor`));
  if (motor.starterType !== 'dol') issues.push(issue('UNSUPPORTED_MOTOR_STARTER', 'Only explicitly modeled direct-on-line (dol) starting is currently supported.', `${path}.motor.starterType`));
  if (motor.rotorType !== undefined && !['squirrel-cage', 'wound-rotor', 'synchronous'].includes(motor.rotorType)) issues.push(issue('UNSUPPORTED_MOTOR_ROTOR_TYPE', 'motor.rotorType must be squirrel-cage, wound-rotor, or synchronous when supplied.', `${path}.motor.rotorType`));
  if (hasUnsupportedDesignSynthesisStarter(record)) issues.push(issue('UNSUPPORTED_MOTOR_STARTER', 'A VFD or soft-starter classification cannot use the DOL starting model.', path));
  if (record?.ratingsBasis !== 'electrical-input-kW') issues.push(issue('MOTOR_INPUT_KW_BASIS_REQUIRED', 'Motor equipment requires explicit electrical-input-kW ratingsBasis.', `${path}.ratingsBasis`));
  if (record?.phases !== 3) issues.push(issue('UNSUPPORTED_MOTOR_PHASES', 'Motor synthesis currently requires a balanced three-phase load.', `${path}.phases`));
  if (!positive(record?.kw)) issues.push(issue('MOTOR_INPUT_KW_REQUIRED', 'Motor equipment kw must remain an explicit positive electrical-input kW rating.', `${path}.kw`));
  if (!positive(record?.powerFactor) || record.powerFactor > 1) issues.push(issue('MOTOR_POWER_FACTOR_REQUIRED', 'Motor equipment requires an explicit row powerFactor greater than zero and no greater than one.', `${path}.powerFactor`));
  if (String(record?.duty || '').toLowerCase() !== 'continuous') issues.push(issue('MOTOR_CONTINUOUS_DUTY_REQUIRED', 'Motor conductor screening currently requires explicit continuous duty.', `${path}.duty`));
  if (positive(motor.fullLoadCurrentA) && positive(motor.ratedVoltageV) && positive(motor.lockedRotorCurrentA) && finite(motor.lockedRotorPowerFactor) && motor.lockedRotorPowerFactor > 0 && motor.lockedRotorPowerFactor <= 1 && typeof motor.fullLoadCurrentBasis?.reference === 'string' && motor.fullLoadCurrentBasis.reference.trim() && motor.starterType === 'dol' && positive(record?.kw) && positive(record?.powerFactor) && record.powerFactor <= 1 && String(record?.duty || '').toLowerCase() === 'continuous') {
    motors.push({
      id: String(record.id),
      motor: structuredClone(motor),
      runningCurrentA: positive(record.voltage) && [1, 3].includes(record.phases) ? record.kw * 1000 / (record.phases === 3 ? Math.sqrt(3) * record.voltage : record.voltage) / record.powerFactor : null,
      designCurrentA: motor.fullLoadCurrentA,
      designAmpacityA: 1.25 * motor.fullLoadCurrentA,
    });
  }
}

export function validateDesignSynthesisMotorInputs(input = {}) {
  const inputIssues = [];
  const studyIssues = [];
  const motors = [];
  const voltageSystem = input?.supply?.voltageSystem;
  if (voltageSystem !== undefined) {
    if (!object(voltageSystem)) inputIssues.push(issue('INVALID_VOLTAGE_SYSTEM', 'supply.voltageSystem must be an object with a referenced connection and grounding basis.', 'supply.voltageSystem'));
    else {
      for (const key of Object.keys(voltageSystem)) if (!['connection', 'grounding', 'lineToGroundVoltageV', 'reference'].includes(key)) inputIssues.push(issue('UNKNOWN_VOLTAGE_SYSTEM_FIELD', `Unknown voltageSystem field ${key}.`, `supply.voltageSystem.${key}`));
      if (!['wye', 'delta'].includes(voltageSystem.connection)) inputIssues.push(issue('INVALID_VOLTAGE_SYSTEM_CONNECTION', 'Voltage-system connection must be wye or delta.', 'supply.voltageSystem.connection'));
      if (!['solid', 'resistance', 'ungrounded'].includes(voltageSystem.grounding)) inputIssues.push(issue('INVALID_VOLTAGE_SYSTEM_GROUNDING', 'Voltage-system grounding must be solid, resistance, or ungrounded.', 'supply.voltageSystem.grounding'));
      if (voltageSystem.lineToGroundVoltageV !== undefined && !positive(voltageSystem.lineToGroundVoltageV)) inputIssues.push(issue('INVALID_LINE_TO_GROUND_VOLTAGE', 'lineToGroundVoltageV must be a positive finite voltage when supplied.', 'supply.voltageSystem.lineToGroundVoltageV'));
      if (typeof voltageSystem.reference !== 'string' || !voltageSystem.reference.trim()) inputIssues.push(issue('VOLTAGE_SYSTEM_REFERENCE_REQUIRED', 'The supplied voltage system requires a non-blank reference.', 'supply.voltageSystem.reference'));
    }
  }
  const starterCriteria = input?.criteria?.motorStarter;
  if (starterCriteria !== undefined) {
    if (!object(starterCriteria)) inputIssues.push(issue('INVALID_MOTOR_STARTER_CRITERIA', 'criteria.motorStarter must be an object.', 'criteria.motorStarter'));
    else {
      for (const key of Object.keys(starterCriteria)) if (!['controlVoltageV', 'controlCurrentType', 'enclosureMm', 'branchProtectionMethod', 'instantaneousPickupA', 'breakerAmbientTemperatureC', 'breakerAmbientReference', 's2BreakerAmbientTemperatureC', 's2BreakerAmbientReference'].includes(key)) inputIssues.push(issue('UNKNOWN_MOTOR_STARTER_CRITERION', `Unknown motorStarter criterion ${key}.`, `criteria.motorStarter.${key}`));
      if (starterCriteria.breakerAmbientTemperatureC !== undefined || starterCriteria.breakerAmbientReference !== undefined) {
        if (typeof starterCriteria.breakerAmbientTemperatureC !== 'number' || !Object.prototype.hasOwnProperty.call(MOTOR_40HP_BREAKER_AMBIENT_RATINGS, starterCriteria.breakerAmbientTemperatureC)) inputIssues.push(issue('INVALID_BREAKER_AMBIENT_TEMPERATURE', 'Breaker enclosure temperature must match a published 40, 45, 50, 55, 60, 65, or 70 °C table point.', 'criteria.motorStarter.breakerAmbientTemperatureC'));
        if (typeof starterCriteria.breakerAmbientReference !== 'string' || !starterCriteria.breakerAmbientReference.trim()) inputIssues.push(issue('BREAKER_AMBIENT_REFERENCE_REQUIRED', 'Breaker enclosure temperature requires a nonblank project reference.', 'criteria.motorStarter.breakerAmbientReference'));
      }
      if (starterCriteria.s2BreakerAmbientTemperatureC !== undefined || starterCriteria.s2BreakerAmbientReference !== undefined) {
        if (!MOTOR_S2_AMBIENT_TEMPERATURES.includes(starterCriteria.s2BreakerAmbientTemperatureC)) inputIssues.push(issue('INVALID_S2_BREAKER_AMBIENT_TEMPERATURE', 'S2 breaker enclosure temperature must match a published 40, 45, 50, 55, 60, 65, or 70 °C table point.', 'criteria.motorStarter.s2BreakerAmbientTemperatureC'));
        if (typeof starterCriteria.s2BreakerAmbientReference !== 'string' || !starterCriteria.s2BreakerAmbientReference.trim()) inputIssues.push(issue('S2_BREAKER_AMBIENT_REFERENCE_REQUIRED', 'S2 breaker enclosure temperature requires a nonblank project reference.', 'criteria.motorStarter.s2BreakerAmbientReference'));
        if (starterCriteria.branchProtectionMethod !== 'inverse-time-breaker') inputIssues.push(issue('MISMATCHED_S2_BREAKER_AMBIENT_METHOD', 'An S2 breaker enclosure basis requires the inverse-time-breaker method.', 'criteria.motorStarter.s2BreakerAmbientTemperatureC'));
      }
      if (starterCriteria.branchProtectionMethod !== undefined && !['manual-controller', 'inverse-time-breaker'].includes(starterCriteria.branchProtectionMethod)) inputIssues.push(issue('INVALID_BRANCH_PROTECTION_METHOD', 'branchProtectionMethod must be manual-controller or inverse-time-breaker.', 'criteria.motorStarter.branchProtectionMethod'));
      if (starterCriteria.instantaneousPickupA !== undefined && !SUPPORTED_MOTOR_BREAKER_PICKUPS.includes(starterCriteria.instantaneousPickupA)) inputIssues.push(issue('INVALID_MOTOR_STARTER_INSTANTANEOUS_PICKUP', 'instantaneousPickupA must be a supported discrete TM230 value; the selected breaker must also support it.', 'criteria.motorStarter.instantaneousPickupA'));
      if (starterCriteria.instantaneousPickupA !== undefined && starterCriteria.branchProtectionMethod !== 'inverse-time-breaker') inputIssues.push(issue('MISMATCHED_MOTOR_BRANCH_PICKUP_METHOD', 'A proposed TM230 instantaneous pickup requires branchProtectionMethod = inverse-time-breaker; clear the pickup when using manual-controller mode.', 'criteria.motorStarter.instantaneousPickupA'));
      if (starterCriteria.controlVoltageV !== undefined && !positive(starterCriteria.controlVoltageV)) inputIssues.push(issue('INVALID_STARTER_CONTROL_VOLTAGE', 'controlVoltageV must be a positive finite voltage.', 'criteria.motorStarter.controlVoltageV'));
      if (starterCriteria.controlCurrentType !== undefined && !['AC', 'DC'].includes(starterCriteria.controlCurrentType)) inputIssues.push(issue('INVALID_STARTER_CONTROL_CURRENT_TYPE', 'controlCurrentType must be AC or DC.', 'criteria.motorStarter.controlCurrentType'));
      if (starterCriteria.enclosureMm !== undefined) {
        if (!object(starterCriteria.enclosureMm)) inputIssues.push(issue('INVALID_STARTER_ENCLOSURE', 'enclosureMm must be an object with dimensions in millimetres.', 'criteria.motorStarter.enclosureMm'));
        else for (const [key, value] of Object.entries(starterCriteria.enclosureMm)) {
          if (!['height', 'width', 'depth'].includes(key)) inputIssues.push(issue('UNKNOWN_STARTER_ENCLOSURE_DIMENSION', `Unknown enclosure dimension ${key}.`, `criteria.motorStarter.enclosureMm.${key}`));
          else if (!positive(value)) inputIssues.push(issue('INVALID_STARTER_ENCLOSURE_DIMENSION', `${key} must be a positive finite dimension in millimetres.`, `criteria.motorStarter.enclosureMm.${key}`));
        }
      }
    }
  }
  const equipment = Array.isArray(input?.equipment) ? input.equipment : [];
  equipment.forEach((record, index) => {
    if (isDesignSynthesisMotor(record)) validateMotorRecord(record, `equipment[${index}]`, inputIssues, motors);
    if (input.criteria !== undefined && (record?.motor?.breakerAmbientTemperatureC !== undefined || record?.motor?.breakerAmbientReference !== undefined) && !(record?.motor?.breakerAmbientTemperatureC === null && record?.motor?.breakerAmbientReference === null) && input.criteria?.motorStarter?.branchProtectionMethod !== 'inverse-time-breaker') inputIssues.push(issue('MISMATCHED_MOTOR_BREAKER_AMBIENT_METHOD', 'Per-motor breaker enclosure basis requires the inverse-time-breaker method.', `equipment[${index}].motor.breakerAmbientTemperatureC`));
    if (input.criteria !== undefined && record?.motor?.instantaneousPickupA != null && input.criteria?.motorStarter?.branchProtectionMethod !== 'inverse-time-breaker') inputIssues.push(issue('MISMATCHED_MOTOR_BRANCH_PICKUP_METHOD', 'Per-motor instantaneous pickup requires the inverse-time-breaker method.', `equipment[${index}].motor.instantaneousPickupA`));
  });
  inputIssues.push(...validateDesignSynthesisMotorThermalInputs({ equipment }).issues);
  inputIssues.push(...validateDesignSynthesisMotorProtectionTimingInputs({ equipment, criteria: input?.criteria || {} }).issues);
  if (motors.length) {
    const sourceFaultConsistency = analyzeDesignSynthesisSourceFaultConsistency({ source: input?.supply });
    studyIssues.push(...sourceFaultConsistency.issues);
    const impedance = input?.supply?.motorStartingImpedance;
    if (!object(impedance) || !finite(impedance.rOhm) || impedance.rOhm < 0 || !finite(impedance.xOhm) || impedance.xOhm < 0 || Math.hypot(impedance.rOhm, impedance.xOhm) <= 0 || typeof impedance.reference !== 'string' || !impedance.reference.trim()) {
      studyIssues.push(issue('MOTOR_STARTING_SOURCE_IMPEDANCE_REQUIRED', 'Motor starting screen requires positive source impedance magnitude with finite nonnegative rOhm/xOhm values and a non-blank reference.', 'supply.motorStartingImpedance'));
    }
    const criterion = input?.criteria?.motorStarting;
    if (!object(criterion) || !positive(criterion.minimumVoltagePu) || criterion.minimumVoltagePu > 1) {
      studyIssues.push(issue('MOTOR_STARTING_CRITERION_REQUIRED', 'Motor starting screen requires criteria.motorStarting.minimumVoltagePu greater than zero and no greater than one.', 'criteria.motorStarting.minimumVoltagePu'));
    }
  }
  const requestedCriteria = input?.criteria?.motorStarting;
  if (requestedCriteria !== undefined && (!object(requestedCriteria) || !positive(requestedCriteria.minimumVoltagePu) || requestedCriteria.minimumVoltagePu > 1)) {
    if (!studyIssues.some(item => item.code === 'MOTOR_STARTING_CRITERION_REQUIRED')) studyIssues.push(issue('MOTOR_STARTING_CRITERION_REQUIRED', 'criteria.motorStarting.minimumVoltagePu must be greater than zero and no greater than one.', 'criteria.motorStarting.minimumVoltagePu'));
  }
  const requestedImpedance = input?.supply?.motorStartingImpedance;
  if (object(requestedImpedance)) for (const key of Object.keys(requestedImpedance)) if (!['rOhm', 'xOhm', 'reference'].includes(key)) inputIssues.push(issue('UNKNOWN_MOTOR_STARTING_IMPEDANCE_FIELD', `Unknown motorStartingImpedance field ${key}.`, `supply.motorStartingImpedance.${key}`));
  if (object(requestedCriteria)) for (const key of Object.keys(requestedCriteria)) if (key !== 'minimumVoltagePu') inputIssues.push(issue('UNKNOWN_MOTOR_STARTING_CRITERION', `Unknown motorStarting criterion ${key}.`, `criteria.motorStarting.${key}`));
  if (requestedImpedance !== undefined && (!object(requestedImpedance) || !finite(requestedImpedance.rOhm) || requestedImpedance.rOhm < 0 || !finite(requestedImpedance.xOhm) || requestedImpedance.xOhm < 0 || Math.hypot(requestedImpedance.rOhm, requestedImpedance.xOhm) <= 0 || typeof requestedImpedance.reference !== 'string' || !requestedImpedance.reference.trim())) {
    if (!studyIssues.some(item => item.code === 'MOTOR_STARTING_SOURCE_IMPEDANCE_REQUIRED')) studyIssues.push(issue('MOTOR_STARTING_SOURCE_IMPEDANCE_REQUIRED', 'supply.motorStartingImpedance requires finite nonnegative rOhm/xOhm values, positive magnitude, and a non-blank reference.', 'supply.motorStartingImpedance'));
  }
  if (!motors.length) inputIssues.push(...studyIssues);
  return { ok: inputIssues.length === 0, issues: [...inputIssues, ...studyIssues], inputIssues, studyIssues, motors };
}

export default { isDesignSynthesisMotor, validateDesignSynthesisMotorInputs };
