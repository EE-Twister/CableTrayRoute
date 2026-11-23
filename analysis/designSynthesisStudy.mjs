import { buildLoadFlowModel } from './loadFlowModel.js';
import { runLoadFlow } from './loadFlow.js';
import { fingerprintStudyValue } from './studyLifecycle.mjs';

const DEFAULT_MAX_REVISIONS = 12;
const DEFAULT_MAX_ITERATIONS = 60;
const MAX_REVISIONS = 64;
const MAX_ITERATIONS = 200;
const STUDY_METHOD_REVISION = 'balanced-load-flow-screening-v6';
const LOAD_FLOW_SOLVER_REVISION = 'load-flow-v4-exact-ideal-cable-tie-contraction';
function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function id(value) { const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''; return text || null; }
function issue(code, message, path = 'studyValidation') { return { code, message, severity: 'blocking', path }; }
function criteriaFor(criteria = {}) {
  criteria = object(criteria) ? criteria : {};
  const requested = object(criteria.loadFlow) ? criteria.loadFlow : {};
  const drop = criteria.voltageDropLimitPct ?? 3;
  return {
    minimumVoltagePu: Object.prototype.hasOwnProperty.call(requested, 'minimumVoltagePu') ? requested.minimumVoltagePu : (finite(drop) && drop <= 100 ? 1 - drop / 100 : null),
    maxRevisions: Object.prototype.hasOwnProperty.call(requested, 'maxRevisions') ? requested.maxRevisions : DEFAULT_MAX_REVISIONS,
    maxIterations: Object.prototype.hasOwnProperty.call(requested, 'maxIterations') ? requested.maxIterations : DEFAULT_MAX_ITERATIONS,
  };
}

export function validateDesignSynthesisStudyCriteria(criteria = {}) {
  const issues = [];
  if (!object(criteria)) issues.push(issue('INVALID_STUDY_CRITERIA', 'Study criteria must be an object.', 'criteria'));
  const value = criteria?.loadFlow;
  if (value !== undefined && !object(value)) issues.push(issue('INVALID_LOAD_FLOW_CRITERIA', 'criteria.loadFlow must be an object when supplied.', 'criteria.loadFlow'));
  if (object(value)) for (const key of Object.keys(value)) if (!['minimumVoltagePu', 'maxRevisions', 'maxIterations'].includes(key)) issues.push(issue('UNKNOWN_LOAD_FLOW_CRITERION', `Unknown loadFlow criterion ${key}.`, `criteria.loadFlow.${key}`));
  const effective = criteriaFor(criteria);
  if (!finite(effective.minimumVoltagePu) || effective.minimumVoltagePu <= 0 || effective.minimumVoltagePu > 1) issues.push(issue('INVALID_LOAD_FLOW_MIN_VOLTAGE', 'minimumVoltagePu must be finite and greater than 0 and no greater than 1.', 'criteria.loadFlow.minimumVoltagePu'));
  const dropFloor = 1 - (criteria?.voltageDropLimitPct ?? 3) / 100;
  if (finite(effective.minimumVoltagePu) && finite(dropFloor) && effective.minimumVoltagePu < dropFloor - 1e-12) issues.push(issue('LOAD_FLOW_VOLTAGE_LIMIT_LOOSENS_DROP', 'minimumVoltagePu cannot loosen the explicit source-to-load voltage-drop criterion.', 'criteria.loadFlow.minimumVoltagePu'));
  if (!Number.isInteger(effective.maxRevisions) || effective.maxRevisions < 0 || effective.maxRevisions > MAX_REVISIONS) issues.push(issue('INVALID_LOAD_FLOW_REVISIONS', `maxRevisions must be an integer from 0 through ${MAX_REVISIONS}.`, 'criteria.loadFlow.maxRevisions'));
  if (!Number.isInteger(effective.maxIterations) || effective.maxIterations < 1 || effective.maxIterations > MAX_ITERATIONS) issues.push(issue('INVALID_LOAD_FLOW_ITERATIONS', `maxIterations must be an integer from 1 through ${MAX_ITERATIONS}.`, 'criteria.loadFlow.maxIterations'));
  return { ok: issues.length === 0, issues, criteria: effective };
}

function uniqueIds(records, path, issues) {
  if (!Array.isArray(records) || !records.length) { issues.push(issue('EMPTY_STUDY_COLLECTION', `${path} must be a non-empty array.`, path)); return []; }
  const seen = new Set();
  return records.map((record, index) => {
    const value = id(record?.id ?? record?.componentId);
    if (!value) issues.push(issue('MISSING_STUDY_ID', `${path}[${index}] requires an id.`, `${path}[${index}]`));
    else if (seen.has(value)) issues.push(issue('DUPLICATE_STUDY_ID', `${path} contains duplicate id ${value}.`, path));
    else seen.add(value);
    return value;
  });
}
function modelComponents(oneLine) {
  return (oneLine?.sheets || []).flatMap(sheet => Array.isArray(sheet?.components) ? sheet.components : []);
}
function expectedBusIds(oneLine) {
  return modelComponents(oneLine).filter(row => ['utility_source', 'source', 'panel', 'load', 'bus'].includes(String(row?.type || '').toLowerCase())).map(row => id(row.id)).filter(Boolean);
}
function coverageIssues(proposal, result, issues) {
  const equipmentIds = uniqueIds(proposal.equipment, 'equipment', issues); const loadIds = uniqueIds(proposal.loads, 'loads', issues); const cableIds = uniqueIds(proposal.cables, 'cables', issues); const busIds = uniqueIds(result?.buses, 'solver.buses', issues); const lineIds = uniqueIds(result?.lines, 'solver.lines', issues);
  const components = modelComponents(proposal.oneLine); uniqueIds(components, 'oneLine.components', issues);
  const modelLoadIds = components.filter(row => String(row?.type || '').toLowerCase() === 'load').map(row => id(row?.id)).filter(Boolean);
  const declaredLoads = new Set(loadIds); const modeledLoads = new Set(modelLoadIds);
  for (const value of declaredLoads) if (!modeledLoads.has(value)) issues.push(issue('LOAD_MODEL_COVERAGE', `Load ${value} is missing from the one-line model.`, `loads.${value}`));
  for (const value of modeledLoads) if (!declaredLoads.has(value)) issues.push(issue('LOAD_MODEL_COVERAGE', `One-line load ${value} is missing from load records.`, `loads.${value}`));
  const expectedBuses = new Set(expectedBusIds(proposal.oneLine)); const busEquipmentIds = new Set((proposal.equipment || []).filter(item => ['source', 'panel', 'load', 'bus'].includes(String(item?.type || '').toLowerCase())).map(item => id(item.id)).filter(Boolean)); const actualBuses = new Set(busIds);
  for (const value of busEquipmentIds) if (!expectedBuses.has(value)) issues.push(issue('EQUIPMENT_MODEL_COVERAGE', `Equipment bus ${value} is missing from the one-line model.`, `equipment.${value}`));
  for (const value of expectedBuses) if (!busEquipmentIds.has(value)) issues.push(issue('EQUIPMENT_MODEL_COVERAGE', `One-line bus ${value} is missing from equipment records.`, `equipment.${value}`));
  for (const value of expectedBuses) if (!actualBuses.has(value)) issues.push(issue('MISSING_SOLVER_BUS', `Solver omitted expected bus ${value}.`, `solver.buses.${value}`));
  for (const value of actualBuses) if (!expectedBuses.has(value)) issues.push(issue('UNEXPECTED_SOLVER_BUS', `Solver returned unexpected bus ${value}.`, `solver.buses.${value}`));
  const transformerIds = new Set((proposal.equipment || []).filter(item => String(item?.type || '').toLowerCase() === 'transformer').map(item => id(item.id)).filter(Boolean));
  for (const value of transformerIds) if (!components.some(row => id(row.id) === value && String(row.type).toLowerCase() === 'transformer')) issues.push(issue('TRANSFORMER_MODEL_COVERAGE', `Transformer ${value} is missing from the one-line model.`, `equipment.${value}`));
  const expectedLines = new Set([...cableIds, ...transformerIds]); const actualLines = new Set(lineIds);
  for (const value of expectedLines) if (!actualLines.has(value)) issues.push(issue('MISSING_SOLVER_CIRCUIT', `Solver omitted generated circuit ${value}.`, `solver.lines.${value}`));
  for (const value of actualLines) if (!expectedLines.has(value)) issues.push(issue('UNEXPECTED_SOLVER_CIRCUIT', `Solver returned unexpected circuit ${value}.`, `solver.lines.${value}`));
}
function dutyFor(load) { const duty = String(load?.duty || 'continuous').toLowerCase(); return { duty, dutyFactor: duty === 'intermittent' || duty === 'non-continuous' ? 1 : 1.25 }; }
function blocked(criteria, issues, extra = {}) { return { status: 'fail', method: 'balanced-load-flow-screening', criteria, issues, iterations: 0, history: [], ...extra }; }
function studyCheckerInputs(proposal, supply, loads) {
  return {
    supply: supply ? {
      id: id(supply.id), phases: supply.phases, voltage: supply.voltage, capacityKva: supply.capacityKva,
      availableFaultCurrentKA: supply.availableFaultCurrentKA,
    } : null,
    loads: loads.map(load => ({ id: id(load?.id), kw: load?.kw, kvar: load?.kvar, powerFactor: load?.powerFactor, duty: load?.duty, phases: load?.phases, designAmpacityA: load?.designAmpacityA, motor: load?.motor })),
    cables: (Array.isArray(proposal?.cables) ? proposal.cables : []).map(cable => ({
      id: id(cable?.id), loadId: id(cable?.loadId), ampacityA: cable?.ampacityA, designAmpacityA: cable?.designAmpacityA,
      branchProtectionMethod: cable?.branchProtectionMethod,
      protectiveRequirementStatus: cable?.protectiveRequirement?.status,
      motorResearchProtectionStatus: cable?.motor?.branchProtectionMethod === 'inverse-time-breaker'
        ? { method: cable.motor.branchProtectionMethod, overloadProtectionStatus: cable.motor.overloadProtectionStatus, shortCircuitAndGroundFaultCoordinationStatus: cable.motor.shortCircuitAndGroundFaultCoordinationStatus }
        : null,
      protectiveDevice: cable?.protectiveDevice ? {
        continuousCurrentA: cable.protectiveDevice.continuousCurrentA,
        tripRatingA: cable.protectiveDevice.tripRatingA,
        interruptingRatingKA: cable.protectiveDevice.interruptingRatingKA,
      } : null,
    })),
    transformers: (Array.isArray(proposal?.equipment) ? proposal.equipment : []).filter(item => String(item?.type || '').toLowerCase() === 'transformer').map(transformer => ({
      id: id(transformer?.id), profileId: id(transformer?.profileId), profileRevision: transformer?.profileRevision,
      ratedKVA: transformer?.ratedKVA, primaryRatedCurrentA: transformer?.primaryRatedCurrentA,
      secondaryRatedCurrentA: transformer?.secondaryRatedCurrentA, maximumLoadingPercent: transformer?.maximumLoadingPercent,
      primaryMaxOcpA: transformer?.primaryMaxOcpA, secondaryMaxOcpA: transformer?.secondaryMaxOcpA,
      primaryProtectiveDevice: transformer?.primaryProtectiveDevice ? {
        id: id(transformer.primaryProtectiveDevice.id), continuousCurrentA: transformer.primaryProtectiveDevice.continuousCurrentA,
        tripRatingA: transformer.primaryProtectiveDevice.tripRatingA,
      } : null,
      secondaryMainDevice: transformer?.secondaryMainDevice ? {
        id: id(transformer.secondaryMainDevice.id), continuousCurrentA: transformer.secondaryMainDevice.continuousCurrentA,
        tripRatingA: transformer.secondaryMainDevice.tripRatingA,
      } : null,
    })),
  };
}

export function evaluateDesignSynthesisStudy(proposal, criteria = {}) {
  const validation = validateDesignSynthesisStudyCriteria(criteria);
  const supply = proposal?.equipment?.find(item => item?.type === 'source') || proposal?.inputs?.supply;
  const loads = Array.isArray(proposal?.loads) ? proposal.loads : [];
  const transformers = (proposal?.equipment || []).filter(item => String(item?.type || '').toLowerCase() === 'transformer');
  const checkerInputs = studyCheckerInputs(proposal, supply, loads);
  const modelRevision = { method: STUDY_METHOD_REVISION, solver: LOAD_FLOW_SOLVER_REVISION, baseMVA: 1, balanced: true, maxIterations: validation.criteria.maxIterations, criteria: validation.criteria, transformerProfileRevisions: transformers.map(item => item.profileRevision) };
  const modelInputFingerprint = fingerprintStudyValue({ oneLine: proposal?.oneLine ?? null, checkerInputs, ...modelRevision });
  if (!validation.ok) return blocked(validation.criteria, validation.issues, { modelRevision, modelInputFingerprint });
  const structuralIssues = [];
  if (Number(supply?.phases) !== 3 || loads.some(load => Number(load?.phases) !== 3)) structuralIssues.push(issue('LOAD_FLOW_UNSUPPORTED_PHASES', 'Balanced screening requires a three-phase source and three-phase loads; single-phase circuits remain unevaluated.', 'equipment'));
  if (!Array.isArray(proposal?.oneLine?.sheets) || !proposal.oneLine.sheets.length) structuralIssues.push(issue('MISSING_STUDY_MODEL', 'A non-empty one-line model is required.', 'oneLine'));
  if (structuralIssues.length) return blocked(validation.criteria, structuralIssues, { modelRevision, modelInputFingerprint });
  let result;
  try { result = runLoadFlow(buildLoadFlowModel(structuredClone(proposal.oneLine)), { baseMVA: 1, balanced: true, maxIterations: validation.criteria.maxIterations }); } catch (error) { return blocked(validation.criteria, [issue('LOAD_FLOW_EXCEPTION', error.message || String(error))], { modelRevision, modelInputFingerprint }); }
  const issues = []; if (!result || result.converged !== true || !finite(result.maxMismatch)) issues.push(issue('LOAD_FLOW_NONCONVERGENCE', 'Balanced load-flow did not converge within the bounded iteration budget.'));
  if (!Array.isArray(result?.buses) || !Array.isArray(result?.lines)) issues.push(issue('INVALID_SOLVER_RESULT', 'Solver must return buses and lines arrays.'));
  coverageIssues(proposal, result, issues);
  const buses = Array.isArray(result?.buses) ? result.buses : []; const lines = Array.isArray(result?.lines) ? result.lines : [];
  const busResults = buses.map(bus => ({ id: id(bus.id), voltagePu: finite(bus.Vm) ? bus.Vm : null, status: finite(bus.Vm) && bus.Vm >= validation.criteria.minimumVoltagePu ? 'pass' : 'fail' }));
  const loadById = new Map(loads.map(load => [id(load.id), load])); const cableById = new Map((proposal.cables || []).map(cable => [id(cable.id), cable]));
  const transformerById = new Map(transformers.map(item => [id(item.id), item]));
  const circuitResults = lines.map(line => {
    const lineId = id(line.id || line.componentId); const transformer = transformerById.get(lineId); const cable = cableById.get(lineId); const load = cable?.loadId ? loadById.get(id(cable.loadId)) : null;
    if (transformer) {
      const primaryCurrentA = finite(line.fromCurrentA) ? line.fromCurrentA : finite(line.amps) ? line.amps : null;
      const secondaryCurrentA = finite(line.toCurrentA) ? line.toCurrentA : null;
      const primaryUtilization = finite(primaryCurrentA) && finite(transformer.primaryRatedCurrentA) ? primaryCurrentA / transformer.primaryRatedCurrentA : null;
      const secondaryUtilization = finite(secondaryCurrentA) && finite(transformer.secondaryRatedCurrentA) ? secondaryCurrentA / transformer.secondaryRatedCurrentA : null;
      const protectionPass = Boolean(transformer.primaryProtectiveDevice && transformer.secondaryMainDevice);
      const loadingPercent = finite(primaryUtilization) && finite(secondaryUtilization) ? Math.max(primaryUtilization, secondaryUtilization) * 100 : null;
      const loadingPass = finite(loadingPercent) && (!finite(transformer.maximumLoadingPercent) || loadingPercent <= Number(transformer.maximumLoadingPercent) + 1e-9);
      const secondaryMainRatingA = Number(transformer.secondaryMainDevice?.continuousCurrentA ?? transformer.secondaryMainDevice?.tripRatingA);
      const secondaryMainDutyFactor = 1.25;
      const secondaryMainDesignCurrentA = finite(secondaryCurrentA) ? secondaryCurrentA * secondaryMainDutyFactor : null;
      const secondaryMainDutyPass = finite(secondaryMainDesignCurrentA) && finite(secondaryMainRatingA) && secondaryMainRatingA + 1e-9 >= secondaryMainDesignCurrentA;
      const pass = finite(primaryUtilization) && finite(secondaryUtilization) && primaryUtilization <= 1 + 1e-9 && secondaryUtilization <= 1 + 1e-9 && loadingPass && secondaryMainDutyPass && protectionPass;
      return { id: lineId, type: 'transformer', currentA: primaryCurrentA, primaryCurrentA, secondaryCurrentA, secondaryMainDutyFactor, secondaryMainDesignCurrentA, secondaryMainRatingA: finite(secondaryMainRatingA) ? secondaryMainRatingA : null, secondaryMainDutyPass, primaryRatedCurrentA: transformer.primaryRatedCurrentA, secondaryRatedCurrentA: transformer.secondaryRatedCurrentA, primaryUtilization, secondaryUtilization, ratedKVA: transformer.ratedKVA, maximumLoadingPercent: transformer.maximumLoadingPercent ?? null, loadingPercent, primaryProtectiveDeviceId: transformer.primaryProtectiveDevice?.id || null, secondaryMainDeviceId: transformer.secondaryMainDevice?.id || null, groundFaultStatus: 'unevaluated', asymmetricalInterruptingDutyStatus: 'unevaluated', status: pass ? 'pass' : 'fail' };
    }
    const dutyInfo = cable?.loadId ? dutyFor(load) : { duty: 'continuous', dutyFactor: 1.25 }; const currentA = finite(line.amps) ? line.amps : null; const designCurrentA = finite(currentA) ? Math.max(currentA * dutyInfo.dutyFactor, cable?.designAmpacityA || 0, load?.designAmpacityA || 0) : null; const rating = finite(cable?.ampacityA) ? cable.ampacityA : finite(line.rating) ? line.rating : null; const protective = finite(cable?.protectiveDevice?.continuousCurrentA) ? cable.protectiveDevice.continuousCurrentA : finite(cable?.protectiveDevice?.tripRatingA) ? cable.protectiveDevice.tripRatingA : null;
    const researchProtectionUnresolved = Boolean(load?.motor && cable?.loadId && cable?.branchProtectionMethod === 'inverse-time-breaker' && cable?.motor?.branchProtectionMethod === 'inverse-time-breaker' && ['motor-branch-breaker-research-unresolved', 'branch-breaker-selection-unresolved'].includes(cable?.protectiveRequirement?.status) && cable?.motor?.overloadProtectionStatus === 'unresolved' && cable?.motor?.shortCircuitAndGroundFaultCoordinationStatus === 'unresolved');
    const conductorPass = finite(designCurrentA) && finite(rating) && designCurrentA <= rating + 1e-9;
    const protectionPass = finite(protective) && finite(designCurrentA) && designCurrentA <= protective + 1e-9;
    const protectionSizingPass = finite(protective) ? protectionPass : researchProtectionUnresolved && cable?.protectiveDevice == null;
    const operatingPass = conductorPass && protectionSizingPass;
    if (!cable) issues.push(issue('MISSING_CABLE_RECORD', `Solver circuit ${lineId || 'unknown'} has no generated cable record.`, `solver.lines.${lineId || 'unknown'}`)); if (!load && cable?.loadId) issues.push(issue('MISSING_LOAD_RECORD', `Generated circuit ${lineId} references missing load ${cable.loadId}.`, `cables.${lineId}.loadId`));
    return { id: lineId, currentA, designCurrentA, duty: dutyInfo.duty, dutyFactor: dutyInfo.dutyFactor, rating, cableAmpacityA: rating, protectiveContinuousA: protective, conductorStatus: conductorPass ? 'pass' : 'fail', operatingCurrentProtectionStatus: finite(protective) ? protectionPass ? 'pass' : 'fail' : researchProtectionUnresolved && cable?.protectiveDevice == null ? 'unevaluated' : 'fail', operatingStatus: operatingPass ? 'pass' : 'fail', protectionStatus: researchProtectionUnresolved ? 'unevaluated' : protectionPass ? 'pass' : 'fail', protectionReason: researchProtectionUnresolved ? 'Motor branch protection is a screening research candidate; overload, fault duty, and coordination remain unresolved.' : null, utilization: finite(designCurrentA) && finite(rating) && rating > 0 ? designCurrentA / rating : null, status: operatingPass ? 'pass' : 'fail' };
  });
  const slackSources = Array.isArray(result?.sources) ? result.sources.filter(sourceRow => String(sourceRow?.type || '').toLowerCase() === 'slack') : []; const supplyId = id(supply?.id); const source = slackSources.length === 1 && id(slackSources[0].id) === supplyId ? slackSources[0] : null;
  if (!source) issues.push(issue('INVALID_SLACK_SOURCE', 'Solver must return exactly one slack source matching the supplied source id.', 'solver.sources'));
  const apparentPowerKva = source && finite(source.Pg) && finite(source.Qg) ? Math.hypot(source.Pg, source.Qg) : null; const capacityKva = finite(supply?.capacityKva) ? supply.capacityKva : null; const sourcePass = finite(apparentPowerKva) && finite(capacityKva) && apparentPowerKva <= capacityKva + 1e-9;
  if (!sourcePass) issues.push(issue('SOURCE_OPERATING_CAPACITY_FAILED', 'Source operating apparent power is missing, nonfinite, or exceeds capacity.', 'supply.capacityKva'));
  const finiteBusVoltages = busResults.filter(item => finite(item.voltagePu)).map(item => item.voltagePu); const minimumVoltagePu = finiteBusVoltages.length === busResults.length && finiteBusVoltages.length > 0 ? Math.min(...finiteBusVoltages) : null; const warnings = Array.isArray(result?.warnings) ? [...result.warnings] : []; const losses = object(result?.losses) ? result.losses : {}; const lossKw = finite(losses.P) ? losses.P : finite(result?.summary?.totalLossKW) ? result.summary.totalLossKW : null;
  const pass = issues.length === 0 && busResults.length > 0 && circuitResults.length > 0 && busResults.every(item => item.status === 'pass') && circuitResults.every(item => item.status === 'pass') && sourcePass; if (!pass && !issues.some(item => item.code === 'LOAD_FLOW_NONCONVERGENCE')) issues.push(issue('LOAD_FLOW_LIMIT_FAILED', 'Balanced load-flow voltage, circuit current/protection, or source apparent-power screening failed.'));
  const final = { converged: result?.converged === true, maxMismatch: finite(result?.maxMismatch) ? result.maxMismatch : null, minimumVoltagePu, minVoltagePu: minimumVoltagePu, sourceKva: apparentPowerKva, sourceApparentPowerKva: apparentPowerKva, sourceCapacityKva: capacityKva, sourceStatus: sourcePass ? 'pass' : 'fail', lossKw, busResults, buses: busResults, circuitResults, circuits: circuitResults, warnings };
  const transformerAssumptions = transformers.length ? ['Balanced positive-sequence magnitude-only transformer model. No sourced vector-group/clock number is available; displayed phase angles are model coordinates, not a claim of physical phase displacement.', 'Published core loss is modeled as a primary shunt; magnetizing current is unavailable and excluded.', 'Fault screening is three-phase symmetrical only; ground-fault and asymmetrical interrupting duty are unevaluated.'] : [];
  return { status: pass ? 'pass' : 'fail', method: 'balanced-load-flow-screening', criteria: validation.criteria, assumptions: transformerAssumptions, iterations: Number.isInteger(result?.iterations) ? result.iterations : null, history: [{ revision: 0, status: pass ? 'pass' : 'fail', final }], final, warnings: [...warnings, ...transformerAssumptions], modelRevision, modelInputFingerprint, issues };
}

export default { evaluateDesignSynthesisStudy, validateDesignSynthesisStudyCriteria };
