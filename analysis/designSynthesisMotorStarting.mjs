import { buildLoadFlowModel } from './loadFlowModel.js';
import { runMotorStartingNetwork } from './designSynthesisMotorIdealTies.mjs';
import { fingerprintStudyValue } from './studyLifecycle.mjs';
import { analyzeDesignSynthesisSourceFaultConsistency } from './designSynthesisSourceFault.mjs';

const METHOD_REVISION = 'balanced-dol-locked-rotor-voltage-screen-v3';
const SOLVER_REVISION = 'load-flow-v4';
const DEFAULT_MAX_ITERATIONS = 60;
const MAX_ITERATIONS = 200;
const LIMITATIONS = [
  'Initial balanced direct-on-line locked-rotor voltage screen only.',
  'The model uses a legacy 60 Hz basis when frequency fields are omitted; any supplied frequency must be numeric 60 Hz.',
  'Each motor starts one at a time while other loads retain constant real and reactive power; the source open-circuit voltage is fixed at 1.0 per unit.',
  'Transformer phase displacement is not verified; positive-sequence magnitude modeling follows the existing load-flow model.',
  'Acceleration time, motor torque, thermal starting withstand, overload coordination, motor fault contribution, and engineering approval are unevaluated.'
];

function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function asId(value) { return typeof value === 'string' || typeof value === 'number' ? String(value).trim() || null : null; }
function issue(code, message, path) { return { code, message, path, severity: 'blocking' }; }
function validateFrequencyAliases(record, path, issues) {
  if (!object(record)) return;
  const hasFrequencyHz = Object.prototype.hasOwnProperty.call(record, 'frequencyHz') && record.frequencyHz !== undefined;
  const hasFrequency = Object.prototype.hasOwnProperty.call(record, 'frequency') && record.frequency !== undefined;
  for (const [key, supplied] of [['frequencyHz', hasFrequencyHz], ['frequency', hasFrequency]]) {
    if (supplied && (!finite(record[key]) || record[key] !== 60)) {
      issues.push(issue('UNSUPPORTED_MOTOR_START_FREQUENCY', `${key} must be the numeric supported value 60 Hz when supplied to the motor starting model.`, `${path}.${key}`));
    }
  }
  if (hasFrequencyHz && hasFrequency && finite(record.frequencyHz) && finite(record.frequency)
    && record.frequencyHz !== record.frequency) {
    issues.push(issue('CONFLICTING_MOTOR_START_FREQUENCY_ALIASES', 'frequencyHz and frequency must agree when both are supplied to the motor starting model.', path));
  }
}
function criteriaValue(criteria) {
  const minimumVoltagePu = criteria?.motorStarting?.minimumVoltagePu;
  const requestedIterations = criteria?.loadFlow?.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  return { minimumVoltagePu, maxIterations: requestedIterations };
}
function modelFingerprint(proposal, criteria) {
  return fingerprintStudyValue({ method: METHOD_REVISION, solver: SOLVER_REVISION, oneLine: proposal?.oneLine ?? null,
    projectSupplyFrequency: { frequencyHz: proposal?.inputs?.supply?.frequencyHz, frequency: proposal?.inputs?.supply?.frequency },
    equipment: (Array.isArray(proposal?.equipment) ? proposal.equipment : []).map(item => ({ id: item?.id, type: item?.type, voltage: item?.voltage, phases: item?.phases, frequencyHz: item?.frequencyHz, frequency: item?.frequency, availableFaultCurrentKA: item?.availableFaultCurrentKA, motorStartingImpedance: item?.motorStartingImpedance, ...(item?.motorStartingImpedanceBasis !== undefined ? { motorStartingImpedanceBasis: item.motorStartingImpedanceBasis } : {}) })),
    loads: (Array.isArray(proposal?.loads) ? proposal.loads : []).map(load => ({ id: load?.id, kw: load?.kw, kvar: load?.kvar, powerFactor: load?.powerFactor, phases: load?.phases, frequencyHz: load?.frequencyHz, frequency: load?.frequency, motor: load?.motor })),
    criteria: criteria ?? null });
}
function blocked(criteria, fingerprint, issues, sourceFaultConsistency = null) {
  return { status: 'blocked', method: METHOD_REVISION, criteria, modelInputFingerprint: fingerprint, cases: [], issues, limitations: LIMITATIONS, ...(sourceFaultConsistency ? { sourceFaultConsistency } : {}) };
}
function allComponents(oneLine) {
  return (Array.isArray(oneLine?.sheets) ? oneLine.sheets : []).flatMap(sheet => Array.isArray(sheet?.components) ? sheet.components : []);
}
function uniqueId(base, used) {
  let value = base;
  let suffix = 1;
  while (used.has(value)) value = `${base}_${suffix++}`;
  used.add(value);
  return value;
}
function zeroLoadComponent(component) {
  const clone = structuredClone(component);
  if (object(clone.load)) clone.load = { ...clone.load, kw: 0, kvar: 0, p: 0, q: 0 };
  if (object(clone.props?.load)) clone.props.load = { ...clone.props.load, kw: 0, kvar: 0, p: 0, q: 0 };
  if (object(clone.parameters?.load)) clone.parameters.load = { ...clone.parameters.load, kw: 0, kvar: 0, p: 0, q: 0 };
  for (const key of ['kw', 'kW', 'watts', 'hp', 'kvar', 'kVAr']) if (key in clone) clone[key] = 0;
  if (object(clone.props)) for (const key of ['kw', 'kW', 'watts', 'hp', 'kvar', 'kVAr']) if (key in clone.props) clone.props[key] = 0;
  if (object(clone.parameters)) for (const key of ['kw', 'kW', 'watts', 'hp', 'kvar', 'kVAr']) if (key in clone.parameters) clone.parameters[key] = 0;
  return clone;
}
export function buildMotorStartingCaseModel(proposal, motorLoad, source, motorOperatingPoint = null) {
  const oneLine = structuredClone(proposal.oneLine);
  let replaced = false;
  for (const sheet of oneLine.sheets || []) for (let index = 0; index < (sheet.components || []).length; index += 1) {
    if (asId(sheet.components[index]?.id) === asId(motorLoad.id)) { sheet.components[index] = zeroLoadComponent(sheet.components[index]); replaced = true; }
  }
  if (!replaced) throw new Error(`Motor load ${motorLoad.id} is missing from the one-line model.`);
  const model = buildLoadFlowModel(oneLine);
  const motorBusId = asId(motorLoad.id);
  if (!model.buses.some(bus => asId(bus.id) === motorBusId)) throw new Error(`Motor load ${motorLoad.id} is not modeled as its own bus.`);
  const sourceBus = model.buses.find(bus => String(bus.busType || '').toLowerCase() === 'slack');
  if (!sourceBus) throw new Error('The one-line model must contain exactly one identifiable slack bus.');
  if (model.buses.filter(bus => String(bus.busType || '').toLowerCase() === 'slack').length !== 1) throw new Error('The one-line model must contain exactly one slack bus.');
  if (asId(sourceBus.id) !== asId(source.id)) throw new Error('The source equipment id must match the modeled slack-bus id.');
  const z = source.motorStartingImpedance;
  const usedIds = new Set([...model.buses.map(bus => asId(bus.id)), ...(model.branches || []).map(branch => asId(branch.id)), ...allComponents(oneLine).map(component => asId(component.id))]);
  const syntheticId = uniqueId(`__motor_start_source__${asId(source.id)}`, usedIds);
  const sourceBranchId = uniqueId(`__motor_start_source_impedance__${asId(source.id)}`, usedIds);
  const sourceImpedanceBranch = { id: sourceBranchId, type: 'source-impedance', from: syntheticId, to: asId(sourceBus.id), impedance: { r: z.rOhm, x: z.xOhm } };
  const syntheticSource = { id: syntheticId, type: 'bus', busType: 'slack', baseKV: sourceBus.baseKV, voltageMagnitude: 1, connections: [] };
  sourceBus.busType = 'PQ';
  model.buses.unshift(syntheticSource);
  model.branches.unshift(sourceImpedanceBranch);
  for (const bus of model.buses) bus.connections = [];
  const motor = motorLoad.motor;
  const currentA = motorOperatingPoint?.currentA ?? motor.lockedRotorCurrentA;
  const powerFactor = motorOperatingPoint?.powerFactor ?? motor.lockedRotorPowerFactor;
  const sinPhi = Math.sqrt(Math.max(0, 1 - powerFactor ** 2));
  const yMagnitude = Math.sqrt(3) * currentA / motor.ratedVoltageV;
  const g = yMagnitude * powerFactor;
  const b = -yMagnitude * sinPhi;
  const bus = model.buses.find(item => asId(item.id) === motorBusId);
  bus.shunt = { ...(bus.shunt || {}), g: (Number(bus.shunt?.g) || 0) + g, b: (Number(bus.shunt?.b) || 0) + b };
  return { model, motorBusId, originalSourceBusId: asId(sourceBus.id), sourceBranchId: sourceImpedanceBranch.id, syntheticId };
}
function topologyIssue(model) {
  const ids = new Set(model.buses.map(bus => asId(bus.id)));
  const branches = model.branches || [];
  if (branches.some(branch => !ids.has(asId(branch.from)) || !ids.has(asId(branch.to)))) return 'The network contains a branch with a missing endpoint.';
  if (branches.length !== model.buses.length - 1) return 'Motor starting screening requires a complete radial network with no open or parallel paths.';
  const adj = new Map([...ids].map(id => [id, []]));
  for (const branch of branches) { adj.get(asId(branch.from)).push(asId(branch.to)); adj.get(asId(branch.to)).push(asId(branch.from)); }
  const reached = new Set(); const queue = [asId(model.buses[0]?.id)];
  while (queue.length) { const id = queue.shift(); if (reached.has(id)) continue; reached.add(id); for (const next of adj.get(id) || []) queue.push(next); }
  return reached.size === ids.size ? null : 'The network is disconnected; all modeled buses must have a path to the source.';
}

function uniqueRecordIds(records, label, issues) {
  const seen = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const id = asId(records[index]?.id);
    if (!id) issues.push(issue('MISSING_CANONICAL_ID', `${label}[${index}] requires an id.`, `${label}[${index}].id`));
    else if (seen.has(id)) issues.push(issue('DUPLICATE_CANONICAL_ID', `${label} contains duplicate id ${id}.`, `${label}.${id}`));
    else seen.add(id);
  }
  return seen;
}

function validateBuiltModel(proposal, source, loads, model, issues) {
  const components = allComponents(proposal.oneLine);
  uniqueRecordIds(components, 'oneLine.components', issues);
  const modelBusIds = uniqueRecordIds(model.buses || [], 'model.buses', issues);
  const modelBranchIds = uniqueRecordIds(model.branches || [], 'model.branches', issues);
  const expectedBusIds = new Set((Array.isArray(proposal.equipment) ? proposal.equipment : [])
    .filter(item => ['source', 'panel', 'load', 'bus'].includes(String(item?.type || '').toLowerCase()))
    .map(item => asId(item.id)).filter(Boolean));
  const expectedBranchIds = new Set([
    ...(Array.isArray(proposal.cables) ? proposal.cables.map(cable => asId(cable.id)) : []),
    ...(Array.isArray(proposal.equipment) ? proposal.equipment.filter(item => String(item?.type || '').toLowerCase() === 'transformer').map(item => asId(item.id)) : [])
  ]);
  const modelLoadIds = new Set(components.filter(component => String(component.type || '').toLowerCase() === 'load').map(component => asId(component.id)));
  if (modelBusIds.size !== expectedBusIds.size || [...expectedBusIds].some(id => !modelBusIds.has(id)) || [...modelBusIds].some(id => !expectedBusIds.has(id))) issues.push(issue('MOTOR_START_BUS_COVERAGE', 'Modeled bus ids must match canonical source, panel, load, and bus equipment ids exactly.', 'oneLine'));
  if (modelLoadIds.size !== loads.length || loads.some(load => !modelLoadIds.has(asId(load.id)))) issues.push(issue('MOTOR_START_LOAD_COVERAGE', 'The one-line load component ids must match the canonical load ids exactly.', 'oneLine'));
  if (modelBranchIds.size !== expectedBranchIds.size || [...expectedBranchIds].some(id => !modelBranchIds.has(id)) || [...modelBranchIds].some(id => !expectedBranchIds.has(id))) issues.push(issue('MOTOR_START_CIRCUIT_COVERAGE', 'Modeled circuit ids must match canonical cable and transformer ids exactly.', 'oneLine'));
  for (const bus of model.buses || []) if (!finite(bus.baseKV) || bus.baseKV <= 0) issues.push(issue('INVALID_MOTOR_START_BUS_BASE', `Bus ${asId(bus.id) || 'unknown'} requires a positive voltage base.`, `oneLine.buses.${asId(bus.id) || 'unknown'}.baseKV`));
  for (const branch of model.branches || []) {
    const z = branch.impedance;
    if (!object(z) || !finite(z.r) || !finite(z.x) || z.r < 0 || z.x < 0) issues.push(issue('INVALID_MOTOR_START_CIRCUIT_IMPEDANCE', `Circuit ${asId(branch.id) || 'unknown'} requires finite nonnegative series R/X values.`, `oneLine.branches.${asId(branch.id) || 'unknown'}.impedance`));
  }
  for (const load of loads) {
    const id = asId(load.id);
    const component = components.find(item => asId(item.id) === id && String(item.type || '').toLowerCase() === 'load');
    const modelBus = (model.buses || []).find(item => asId(item.id) === id);
    const componentVoltage = component?.physical?.voltage ?? component?.voltage;
    const modelVoltage = finite(modelBus?.baseKV) ? modelBus.baseKV * 1000 : null;
    const sameVoltage = (left, right) => finite(left) && finite(right)
      && Math.abs(left - right) <= 16 * Number.EPSILON * Math.max(Math.abs(left), Math.abs(right), Number.MIN_VALUE);
    if (!finite(load.voltage) || load.voltage <= 0 || !sameVoltage(load.voltage, componentVoltage) || !sameVoltage(load.voltage, modelVoltage)) {
      issues.push(issue('MOTOR_START_LOAD_VOLTAGE_MISMATCH', 'Canonical load voltage, one-line component voltage, and modeled bus voltage base must agree.', `loads.${id}.voltage`));
    }
    const modeledLoad = component?.load;
    const expectedKvar = finite(load.kvar) ? load.kvar : load.kw * Math.tan(Math.acos(load.powerFactor));
    if (!component || !object(modeledLoad) || !finite(modeledLoad.kw) || !finite(modeledLoad.kvar)
      || Math.abs(modeledLoad.kw - load.kw) > 1e-6 || Math.abs(modeledLoad.kvar - expectedKvar) > Math.max(1e-6, Math.abs(expectedKvar) * 1e-6)) {
      issues.push(issue('MOTOR_START_RUNNING_LOAD_MISMATCH', `Canonical running P/Q for load ${id} must be present and match its one-line model.`, `loads.${id}`));
    }
  }
}

export function evaluateDesignSynthesisMotorStarting(proposal, criteria = {}, { requireVoltageCriterion = true, validationOnly = false } = {}) {
  const effectiveCriteria = criteriaValue(criteria);
  const fingerprint = modelFingerprint(proposal, criteria);
  const loads = Array.isArray(proposal?.loads) ? proposal.loads : [];
  const motors = loads.filter(load => object(load?.motor));
  if (!motors.length) return { status: 'not-applicable', method: METHOD_REVISION, criteria: effectiveCriteria, modelInputFingerprint: fingerprint, cases: [], issues: [], limitations: LIMITATIONS };
  const issues = [];
  if (!requireVoltageCriterion && !validationOnly) issues.push(issue('INVALID_INTERNAL_VALIDATION_MODE', 'The criterion-free starting mode is restricted to validation-only use.', 'criteria.motorStarting.minimumVoltagePu'));
  if (requireVoltageCriterion && (!finite(effectiveCriteria.minimumVoltagePu) || effectiveCriteria.minimumVoltagePu <= 0 || effectiveCriteria.minimumVoltagePu > 1)) issues.push(issue('INVALID_MOTOR_STARTING_VOLTAGE_CRITERION', 'criteria.motorStarting.minimumVoltagePu must be finite, greater than zero, and no greater than 1.', 'criteria.motorStarting.minimumVoltagePu'));
  if (!Number.isInteger(effectiveCriteria.maxIterations) || effectiveCriteria.maxIterations < 1 || effectiveCriteria.maxIterations > MAX_ITERATIONS) issues.push(issue('INVALID_LOAD_FLOW_ITERATIONS', `criteria.loadFlow.maxIterations must be an integer from 1 through ${MAX_ITERATIONS}.`, 'criteria.loadFlow.maxIterations'));
  if (!Array.isArray(proposal?.oneLine?.sheets) || proposal.oneLine.sheets.length === 0) issues.push(issue('MISSING_ONE_LINE_MODEL', 'A non-empty one-line model is required.', 'oneLine'));
  uniqueRecordIds(loads, 'loads', issues);
  uniqueRecordIds(Array.isArray(proposal?.cables) ? proposal.cables : [], 'cables', issues);
  const equipment = Array.isArray(proposal?.equipment) ? proposal.equipment : [];
  uniqueRecordIds(equipment, 'equipment', issues);
  const sources = equipment.filter(item => String(item?.type || '').toLowerCase() === 'source');
  const source = sources[0];
  const components = allComponents(proposal?.oneLine);
  if (sources.length !== 1) issues.push(issue('INVALID_MOTOR_START_SOURCE_COUNT', 'Exactly one source equipment record is required.', 'equipment'));
  for (const [index, item] of equipment.entries()) {
    const type = String(item?.type || '').toLowerCase();
    if (type === 'source') validateFrequencyAliases(item, `equipment.${asId(item.id) || index}`, issues);
  }
  if (object(proposal?.inputs?.supply)) validateFrequencyAliases(proposal.inputs.supply, 'inputs.supply', issues);
  validateFrequencyAliases(criteria, 'criteria', issues);
  for (const load of loads) validateFrequencyAliases(load, `loads.${asId(load.id) || 'unknown'}`, issues);
  for (const [index, component] of components.entries()) {
    const type = String(component?.type || '').toLowerCase();
    if (['source', 'utility_source', 'load'].includes(type)) {
      const componentPath = `oneLine.components[${asId(component.id) || index}]`;
      validateFrequencyAliases(component, componentPath, issues);
      if (object(component.physical)) validateFrequencyAliases(component.physical, `${componentPath}.physical`, issues);
    }
  }
  for (const load of motors) {
    const motorFrequency = load.motor?.nameplateFrequencyHz;
    if (Object.prototype.hasOwnProperty.call(load.motor || {}, 'nameplateFrequencyHz') && motorFrequency !== undefined
      && (!finite(motorFrequency) || motorFrequency !== 60)) {
      issues.push(issue('UNSUPPORTED_MOTOR_NAMEPLATE_FREQUENCY', 'Motor nameplate frequency must be the numeric supported value 60 Hz when supplied to the motor starting model.', `loads.${asId(load.id) || 'unknown'}.motor.nameplateFrequencyHz`));
    }
  }
  const sourceFaultConsistency = analyzeDesignSynthesisSourceFaultConsistency({ source });
  issues.push(...sourceFaultConsistency.issues);
  const impedance = source?.motorStartingImpedance;
  if (!source || !object(impedance) || !finite(impedance.rOhm) || !finite(impedance.xOhm) || impedance.rOhm < 0 || impedance.xOhm < 0 || !(impedance.rOhm > 0 || impedance.xOhm > 0) || !String(impedance.reference || '').trim()) issues.push(issue('MISSING_SOURCE_STARTING_IMPEDANCE', 'A source record with positive R/X phase ohms and a reference is required; available fault current alone does not establish source impedance.', 'equipment.source.motorStartingImpedance'));
  for (const load of motors) {
    const motor = load.motor;
    if (!asId(load.id)) issues.push(issue('MISSING_MOTOR_LOAD_ID', 'Motor load requires a stable id.', 'loads'));
    if (String(motor.starterType || '').toLowerCase() !== 'dol') issues.push(issue('UNSUPPORTED_MOTOR_STARTER', 'Only direct-on-line starter cases are supported.', `loads.${asId(load.id) || 'unknown'}.motor.starterType`));
    if (![motor.ratedVoltageV, motor.fullLoadCurrentA, motor.nameplateCurrentA, motor.lockedRotorCurrentA].every(value => finite(value) && value > 0)) issues.push(issue('INVALID_MOTOR_RATING', 'Motor rated voltage and full-load, nameplate, and locked-rotor currents must be finite and positive.', `loads.${asId(load.id) || 'unknown'}.motor`));
    if (!finite(motor.lockedRotorPowerFactor) || motor.lockedRotorPowerFactor <= 0 || motor.lockedRotorPowerFactor > 1) issues.push(issue('INVALID_LOCKED_ROTOR_POWER_FACTOR', 'Locked-rotor power factor must be finite, greater than zero, and no greater than 1.', `loads.${asId(load.id) || 'unknown'}.motor.lockedRotorPowerFactor`));
    if (!object(motor.fullLoadCurrentBasis) || !String(motor.fullLoadCurrentBasis.reference || '').trim()) issues.push(issue('MISSING_FULL_LOAD_CURRENT_BASIS', 'Full-load current requires a documented reference basis.', `loads.${asId(load.id) || 'unknown'}.motor.fullLoadCurrentBasis`));
    if (!finite(load.kw) || load.kw <= 0 || !finite(load.powerFactor) || load.powerFactor <= 0 || load.powerFactor > 1) issues.push(issue('MISSING_MOTOR_RUNNING_LOAD', 'Motor running load requires positive electrical-input kW and an explicit power factor.', `loads.${asId(load.id) || 'unknown'}`));
  }
  if (source && Number(source.phases) !== 3) issues.push(issue('UNSUPPORTED_MOTOR_START_PHASES', 'Balanced motor-starting screening requires a three-phase source.', `equipment.${asId(source.id)}.phases`));
  for (const load of loads) {
    if (Number(load.phases) !== 3) issues.push(issue('UNSUPPORTED_MOTOR_START_PHASES', 'Balanced motor-starting screening requires every canonical load to be three phase.', `loads.${asId(load.id) || 'unknown'}.phases`));
    if (!finite(load.kw) || load.kw <= 0 || !finite(load.powerFactor) || load.powerFactor <= 0 || load.powerFactor > 1) issues.push(issue('MISSING_CANONICAL_RUNNING_LOAD', 'Every canonical load requires positive electrical-input kW and an explicit power factor.', `loads.${asId(load.id) || 'unknown'}`));
  }
  const sourceComponent = components.find(component => asId(component.id) === asId(source?.id));
  const sourceModelIssue = (code, message, path) => {
    const diagnostic = issue(code, message, path);
    sourceFaultConsistency.status = 'blocked';
    sourceFaultConsistency.blockedReason ||= code;
    sourceFaultConsistency.issues.push(diagnostic);
    issues.push(diagnostic);
  };
  if (source && (!sourceComponent || sourceComponent.voltage !== source.voltage || sourceComponent.phases !== source.phases)) {
    sourceModelIssue('SOURCE_FAULT_MODEL_SOURCE_MISMATCH', 'The one-line source voltage and phase count must exactly match the canonical source record used for fault consistency.', `oneLine.components.${asId(source.id) || 'unknown'}`);
  }
  if (source) {
    try {
      const sourceModel = buildLoadFlowModel(structuredClone(proposal.oneLine));
      const modeledSlack = (sourceModel.buses || []).find(bus => asId(bus.id) === asId(source.id));
      const modeledVoltageV = finite(modeledSlack?.baseKV) ? modeledSlack.baseKV * 1000 : null;
      const voltageToleranceV = finite(source.voltage) ? 16 * Number.EPSILON * Math.max(Math.abs(source.voltage), Math.abs(modeledVoltageV || 0), Number.MIN_VALUE) : 0;
      if (!finite(modeledVoltageV) || !finite(source.voltage) || Math.abs(modeledVoltageV - source.voltage) > voltageToleranceV) {
        sourceModelIssue('SOURCE_FAULT_MODEL_BASE_MISMATCH', 'The modeled slack-bus line-to-line voltage base must match the canonical source voltage used for fault consistency.', `oneLine.buses.${asId(source.id) || 'unknown'}.baseKV`);
      }
    } catch (error) {
      sourceModelIssue('SOURCE_FAULT_MODEL_BASE_UNAVAILABLE', `The modeled slack-bus voltage base could not be confirmed: ${error.message || String(error)}`, `oneLine.buses.${asId(source.id) || 'unknown'}.baseKV`);
    }
  }
  if (source && Number(sourceComponent?.phases) !== 3) issues.push(issue('UNSUPPORTED_MOTOR_START_PHASES', 'The one-line source component must be three phase.', `oneLine.components.${asId(source.id)}.phases`));
  for (const load of loads) {
    const component = components.find(item => asId(item.id) === asId(load.id) && String(item.type || '').toLowerCase() === 'load');
    if (Number(component?.phases) !== 3) issues.push(issue('UNSUPPORTED_MOTOR_START_PHASES', 'The one-line load component must be three phase.', `oneLine.components.${asId(load.id) || 'unknown'}.phases`));
  }
  if (issues.length) return blocked(effectiveCriteria, fingerprint, issues, sourceFaultConsistency);
  if (validationOnly) {
    try {
      const baseModel = buildLoadFlowModel(structuredClone(proposal.oneLine));
      const topologyProblem = topologyIssue(baseModel);
      if (topologyProblem) issues.push(issue('UNSUPPORTED_NETWORK_TOPOLOGY', topologyProblem, 'oneLine'));
      validateBuiltModel(proposal, source, loads, baseModel, issues);
    } catch (error) {
      issues.push(issue('MOTOR_START_MODEL_INVALID', error.message || String(error), 'oneLine'));
    }
    if (issues.length) return blocked(effectiveCriteria, fingerprint, issues, sourceFaultConsistency);
    return { status: 'validated', method: METHOD_REVISION, criteria: effectiveCriteria, modelInputFingerprint: fingerprint, cases: [], issues: [], limitations: LIMITATIONS, sourceFaultConsistency };
  }
  const cases = [];
  for (const motorLoad of motors) {
    let built;
    try { built = buildMotorStartingCaseModel(proposal, motorLoad, source); }
    catch (error) { issues.push(issue('MOTOR_START_MODEL_INVALID', error.message || String(error), `loads.${asId(motorLoad.id) || 'unknown'}`)); continue; }
    const topologyProblem = topologyIssue(built.model);
    if (topologyProblem) { issues.push(issue('UNSUPPORTED_NETWORK_TOPOLOGY', topologyProblem, 'oneLine')); continue; }
    const structuralIssues = [];
    validateBuiltModel(proposal, source, loads, built.baseModel || buildLoadFlowModel(structuredClone(proposal.oneLine)), structuralIssues);
    if (structuralIssues.length) { issues.push(...structuralIssues); continue; }
    let result;
    try { result = runMotorStartingNetwork(built.model, { baseMVA: 1, balanced: true, maxIterations: effectiveCriteria.maxIterations }); }
    catch (error) { issues.push(issue('MOTOR_START_LOAD_FLOW_EXCEPTION', error.message || String(error), `loads.${asId(motorLoad.id)}`)); continue; }
    const buses = Array.isArray(result?.buses) ? result.buses : [];
    const lines = Array.isArray(result?.lines) ? result.lines : [];
    const converged = result?.converged === true && finite(result?.maxMismatch);
    const modeledBusIds = new Set(built.model.buses.filter(bus => asId(bus.id) !== built.syntheticId).map(bus => asId(bus.id)));
    const resultBusIds = buses.filter(bus => asId(bus.id) !== built.syntheticId).map(bus => asId(bus.id));
    const expectedLineIds = new Set(built.model.branches.map(branch => asId(branch.id)));
    const resultLineIds = lines.map(line => asId(line.id || line.componentId));
    const outputsCovered = resultBusIds.length === modeledBusIds.size && new Set(resultBusIds).size === modeledBusIds.size
      && resultBusIds.every(id => modeledBusIds.has(id)) && resultLineIds.length === expectedLineIds.size
      && new Set(resultLineIds).size === expectedLineIds.size && resultLineIds.every(id => expectedLineIds.has(id))
      && lines.every(line => (finite(line.fromCurrentA) || finite(line.amps)) && finite(line.toCurrentA))
      && buses.filter(bus => asId(bus.id) !== built.syntheticId).every(bus => finite(bus.Vm));
    const outputIssue = outputsCovered ? null : issue('MOTOR_START_SOLVER_COVERAGE', 'The load-flow result must include every modeled bus and circuit with finite bus voltages and circuit currents.', `loads.${asId(motorLoad.id)}`);
    const busResults = buses.filter(bus => asId(bus.id) !== built.syntheticId).map(bus => ({ id: asId(bus.id), voltagePu: finite(bus.Vm) ? bus.Vm : null, status: converged && outputsCovered && finite(bus.Vm) && bus.Vm >= effectiveCriteria.minimumVoltagePu ? 'pass' : 'fail' }));
    const minimumVoltagePu = outputsCovered && busResults.length === modeledBusIds.size ? Math.min(...busResults.map(bus => bus.voltagePu)) : null;
    const motorVoltagePu = busResults.find(bus => bus.id === built.motorBusId)?.voltagePu ?? null;
    const motorBusModel = built.model.buses.find(bus => asId(bus.id) === built.motorBusId);
    const motorCurrentA = finite(motorVoltagePu) ? motorVoltagePu * motorBusModel.baseKV * 1000 / Math.sqrt(3) * Math.sqrt(3) * motorLoad.motor.lockedRotorCurrentA / motorLoad.motor.ratedVoltageV : null;
    const circuits = lines.map(line => ({ id: asId(line.id || line.componentId), fromCurrentA: finite(line.fromCurrentA) ? line.fromCurrentA : finite(line.amps) ? line.amps : null, toCurrentA: finite(line.toCurrentA) ? line.toCurrentA : null }));
    const passed = converged && outputsCovered && finite(minimumVoltagePu) && minimumVoltagePu >= effectiveCriteria.minimumVoltagePu && finite(motorVoltagePu) && motorVoltagePu >= effectiveCriteria.minimumVoltagePu;
    const caseIssues = outputIssue ? [outputIssue] : !converged ? [issue('MOTOR_START_NONCONVERGENCE', 'The balanced load-flow did not converge within the bounded iteration budget; numeric screening outputs are not passing results.', `loads.${asId(motorLoad.id)}`)] : [];
    cases.push({ motorId: asId(motorLoad.id), status: !outputsCovered || !converged ? 'blocked' : passed ? 'pass' : 'fail', converged, iterations: Number.isInteger(result?.iterations) ? result.iterations : null,
      minimumVoltagePu, motorVoltagePu, motorCurrentA, idealTieReduction: result.idealTieReduction || null, sourceBusVoltagePu: busResults.find(bus => bus.id === built.originalSourceBusId)?.voltagePu ?? null,
      buses: busResults, circuits, sourceFaultConsistency, issues: caseIssues });
  }
  issues.push(...cases.flatMap(item => item.issues || []));
  if (issues.length) return { ...blocked(effectiveCriteria, fingerprint, issues, sourceFaultConsistency), cases };
  return { status: cases.length === motors.length && cases.every(item => item.status === 'pass') ? 'pass' : cases.some(item => item.status === 'blocked') ? 'blocked' : 'fail', method: METHOD_REVISION, criteria: effectiveCriteria, modelInputFingerprint: fingerprint, cases, issues: [], limitations: LIMITATIONS, sourceFaultConsistency };
}

export default { evaluateDesignSynthesisMotorStarting };
