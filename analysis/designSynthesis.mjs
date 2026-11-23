import { NEC_AMPACITY_TABLE, ampacityColumn } from './autoSize.mjs';
import { selectProtectiveDevice } from './designSynthesisProtection.mjs';
import bundledDeviceSnapshot from '../data/designSynthesisDevices.json' with { type: 'json' };
import { validateDesignSynthesisInput } from './designSynthesisInput.mjs';
import { buildDesignSynthesisOneLine } from './designSynthesisOneLine.mjs';
import { evaluateCorridorTrayCapacity, evaluateDesignSynthesisRaceways } from './designSynthesisRaceways.mjs';
import { fingerprintStudyValue } from './studyLifecycle.mjs';
import { evaluateDesignSynthesisRouteThermal } from './designSynthesisThermal.mjs';
import { buildAlternateAnchorPairs, screenAlternateEndpointInstallation } from './designSynthesisAlternateAnchors.mjs';
import { SOUTHWIRE_MC_SOURCE, SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT, SOURCED_MC_R_X } from './designSynthesisCableCatalog.mjs';
import { buildDesignSynthesisInputEvidence } from './designSynthesisInputEvidence.mjs';
import { buildDesignSynthesisLoadDispositions } from './designSynthesisLoadDisposition.mjs';
import { applyPanelLocationOverride, validatePanelLocationOverrides } from './designSynthesisOverrides.mjs';
import { buildDesignSynthesisPanelIdentityPlan } from './designSynthesisPanelIdentity.mjs';
import { evaluateDesignSynthesisStudy } from './designSynthesisStudy.mjs';
import { selectTransformer, estimateTransformerSecondaryFault } from './designSynthesisTransformers.mjs';
import { buildSynthesisDeviceVoltageApplicability } from './designSynthesisVoltageApplicability.mjs';
import { isDesignSynthesisMotor, validateDesignSynthesisMotorInputs } from './designSynthesisMotors.mjs';
import { evaluateDesignSynthesisMotorStarting } from './designSynthesisMotorStarting.mjs';
import { analyzeDesignSynthesisSourceFaultConsistency } from './designSynthesisSourceFault.mjs';
import { evaluateDesignSynthesisFaultStudy } from './designSynthesisFaultStudy.mjs';
import { evaluateDesignSynthesisDeviceFaultScreen } from './designSynthesisDeviceFaultScreen.mjs';
import { evaluateDesignSynthesisFaultEvolution } from './designSynthesisFaultEvolution.mjs';
import { buildDesignSynthesisCableFaultWithstandRevisionBinding, evaluateDesignSynthesisCableFaultWithstand, summarizeDesignSynthesisCableFaultWorstCase } from './designSynthesisCableFaultWithstand.mjs';
import { evaluateDesignSynthesisFaultScenarios } from './designSynthesisFaultScenarios.mjs';
import { evaluateDesignSynthesisMotorAcceleration, validateDesignSynthesisMotorAccelerationInputs } from './designSynthesisMotorAcceleration.mjs';
import { evaluateDesignSynthesisMotorThermal } from './designSynthesisMotorThermal.mjs';
import { selectMotorOverloadCandidate } from './motorOverloadCandidates.mjs';
import { evaluateDesignSynthesisMotorProtectionTiming } from './designSynthesisMotorProtectionTiming.mjs';
import { evaluateMotorStarterCandidates } from './designSynthesisMotorStarters.mjs';
import { evaluateMotorBranchBreakerCandidate } from './designSynthesisMotorBranchBreakers.mjs';
import { applyDesignSynthesisPanelSchedule } from './designSynthesisPanelSchedule.mjs';
import { validateProjectTrayHandoff } from './designSynthesisProjectTrays.mjs';
import { validateProjectTrayReuseBinding } from './designSynthesisProjectTrayReuse.mjs';

const EPS = 1e-9;
function sourcedCableImpedance(size) {
  const source = SOURCED_MC_R_X[size];
  return source ? { r_ohm_per_kft: source.r, x_ohm_per_kft: source.x, impedanceBasis: source.source } : {};
}

function n(value) { return Number(value); }
function finite(value) { return value !== null && value !== undefined && value !== '' && (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(n(value)); }
function point(value) { return value && finite(value.x) && finite(value.y) && finite(value.z); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function kva(load) {
  const pf = finite(load.powerFactor) && n(load.powerFactor) > 0 ? n(load.powerFactor) : 1;
  return n(load.kw) / pf;
}
function current(kw, voltage, phases, pf = 1) {
  const divisor = phases === 3 ? Math.sqrt(3) * voltage : voltage;
  return (kw * 1000) / (divisor * (pf > 0 ? pf : 1));
}

function conductorSizing(load, criteria, lengthFt, thermalAssessment) {
  const continuous = load.duty !== 'intermittent' && load.duty !== 'non-continuous';
  const required = Math.max(load.current * (continuous ? 1.25 : 1), Number(load.designAmpacityA) || 0);
  const material = criteria.conductorMaterial || 'copper';
  if (material.toLowerCase().includes('al')) return { size: null, ampacity: null, voltageDrop: null, violation: 'Southwire MC R/X catalog evidence is copper-only; provide a matching aluminum catalog.' };
  const insulation = criteria.temperatureRatingC || 75; const terminal = criteria.terminalTempRatingC ?? criteria.terminalRatingC ?? 75;
  const factor = thermalAssessment?.adjustmentFactor ?? 1;
  if (!Number.isFinite(factor) || factor <= 0) return { size: null, ampacity: null, voltageDrop: null, violation: 'Thermal route conditions have no positive NEC tabulated ampacity factor.', requiredAmps: required, thermalAssessment };
  const col = ampacityColumn(material, insulation); const terminalCol = ampacityColumn(material, terminal);
  const minimumAmpacity = Number(criteria.minimumConductorAmpacity || 0);
  const floorIndex = criteria.minimumConductorSize ? NEC_AMPACITY_TABLE.findIndex(row => row.size === criteria.minimumConductorSize) : -1;
  for (const [rowIndex, row] of NEC_AMPACITY_TABLE.entries()) {
    if (floorIndex >= 0 && rowIndex < floorIndex) continue;
    const source = SOURCED_MC_R_X[row.size]; if (!source) continue;
    const tableAmpacity = row[col]; const terminalAmpacity = row[terminalCol];
    if (!finite(tableAmpacity) || !finite(terminalAmpacity) || tableAmpacity * factor < Math.max(required, minimumAmpacity) - EPS || terminalAmpacity < Math.max(required, minimumAmpacity) - EPS) continue;
    const candidateDrop = voltageDropPct(load, row.size, lengthFt, criteria);
    if (candidateDrop.status !== 'evaluated' || candidateDrop.value > (criteria.voltageDropLimitPct ?? Infinity) + EPS) continue;
    return { size: row.size, ampacity: Math.min(tableAmpacity * factor, terminalAmpacity), voltageDrop: candidateDrop.value, deratingFactor: factor, requiredAmps: required, continuous, limitingAmpacityA: tableAmpacity * factor, thermalAssessment: { ...thermalAssessment, limitingAmpacityA: Math.min(tableAmpacity * factor, terminalAmpacity) }, sizingBasis: 'NEC_AMPACITY_TABLE plus Southwire SPEC45301 sourced cable construction' };
  }
  return { size: null, ampacity: null, voltageDrop: null, violation: 'No sourced cable candidate satisfies ampacity, derating, and terminal limits.', requiredAmps: required };
}

function nextSourcedConductorSize(cable) {
  const index = NEC_AMPACITY_TABLE.findIndex(row => row.size === cable?.conductor_size);
  const material = String(cable?.conductorMaterial || 'copper');
  const column = ampacityColumn(material, cable?.temperatureRatingC || 75);
  for (let cursor = index + 1; cursor < NEC_AMPACITY_TABLE.length; cursor += 1) {
    const row = NEC_AMPACITY_TABLE[cursor];
    if (SOURCED_MC_R_X[row.size] && finite(row[column])) return row.size;
  }
  return null;
}

function revisionFloorsForStudy(proposal, study) {
  const failedIds = new Set((study?.final?.circuits || []).filter(item => item.status !== 'pass').map(item => String(item.id)));
  const failedBusIds = new Set((study?.final?.buses || []).filter(item => item.status !== 'pass').map(item => String(item.id)));
  const failedPathIds = new Set(failedIds);
  const cables = proposal.cables || [];
  for (const transformer of (proposal.equipment || []).filter(item => String(item.type || '').toLowerCase() === 'transformer')) {
    if (!failedIds.has(String(transformer.id))) continue;
    for (const cable of cables.filter(item => String(item.transformerId) === String(transformer.id) || String(item.from) === String(transformer.secondaryBusId))) failedPathIds.add(String(cable.id));
  }
  for (const failedBus of failedBusIds) {
    let cursor = failedBus;
    const visited = new Set();
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      const upstream = cables.find(cable => String(cable.to) === String(cursor));
      if (upstream) {
        failedPathIds.add(String(upstream.id));
        cursor = upstream.from;
        continue;
      }
      const transformer = (proposal.equipment || []).find(item => String(item.type || '').toLowerCase() === 'transformer' && String(item.secondaryBusId) === String(cursor));
      const primary = transformer && cables.find(cable => String(cable.transformerId) === String(transformer.id) && cable.transformerSide === 'primary');
      if (!primary) break;
      failedPathIds.add(String(primary.id));
      cursor = primary.from;
    }
  }
  const sourceFailed = study?.final?.sourceStatus === 'fail';
  const floors = {};
  const operatingCurrentFloors = {};
  for (const cable of proposal.cables || []) {
    const feedsFailedBus = failedBusIds.has(String(cable.to)) || failedBusIds.has(String(cable.loadId));
    if (!sourceFailed && !failedPathIds.has(String(cable.id)) && !feedsFailedBus) continue;
    const floor = nextSourcedConductorSize(cable);
    if (floor) floors[cable.id] = floor;
    const operating = study?.final?.circuits?.find(item => String(item.id) === String(cable.id))?.currentA;
    if (finite(operating)) operatingCurrentFloors[cable.id] = operating;
  }
  return { conductorSizeFloors: floors, operatingCurrentFloors };
}

function mergeConductorSizeFloors(...sources) {
  const rank = size => NEC_AMPACITY_TABLE.findIndex(row => row.size === size);
  const merged = {};
  for (const source of sources) {
    for (const [id, size] of Object.entries(source || {})) {
      if (!size) continue;
      if (!merged[id] || rank(size) > rank(merged[id])) merged[id] = size;
    }
  }
  return merged;
}

function mergeOperatingCurrentFloors(...sources) {
  const merged = {};
  for (const source of sources) {
    for (const [id, value] of Object.entries(source || {})) if (finite(value)) merged[id] = Math.max(Number(merged[id]) || 0, n(value));
  }
  return merged;
}

function retainedOperatingCurrentFloors(proposal, study = proposal?.studyValidation) {
  const floors = {};
  const circuits = study?.final?.circuitResults || study?.final?.circuits || [];
  const loads = new Map((proposal?.loads || []).map(load => [String(load.id), load]));
  for (const cable of proposal?.cables || []) {
    const load = cable.loadId ? loads.get(String(cable.loadId)) : null;
    const dutyFactor = load?.duty === 'continuous' || !load ? 1.25 : 1;
    const values = [
      circuits.find(item => String(item.id) === String(cable.id))?.currentA,
      cable.currentA, cable.est_load, cable.designCurrentA,
      finite(cable.designAmpacityA) ? cable.designAmpacityA / dutyFactor : null,
      finite(cable.protectiveRequirement?.ampereRatingA) ? cable.protectiveRequirement.ampereRatingA / dutyFactor : null,
      cable.motor?.branchBreakerOperatingCurrentA,
    ].filter(finite);
    if (values.length) floors[String(cable.id)] = Math.max(...values);
  }
  return floors;
}

function voltageDropPct(load, size, lengthFt, criteria) {
  const catalog = criteria.cableCatalog?.find(item => item.conductor_size === size || item.size === size) || SOURCED_MC_R_X[size];
  if (!catalog || !finite(catalog.r) || !finite(catalog.x) || !(lengthFt >= 0)) return { value: null, status: 'unevaluated', reason: 'Missing sourced cable R/X data.' };
  const pf = load.powerFactor || 1; const sin = Math.sqrt(Math.max(0, 1 - pf * pf));
  const phaseFactor = n(load.phases) === 3 ? Math.sqrt(3) : 2;
  const volts = load.current * phaseFactor * ((n(catalog.r) * pf) + (n(catalog.x) * sin)) * lengthFt / 1000;
  return { value: 100 * volts / load.voltage, status: 'evaluated', source: catalog.source || 'criteria.cableCatalog' };
}

export function calculateSourcedVoltageDrop({ current, voltage, phases, powerFactor = 1, conductorSize, lengthFt, cableCatalog } = {}) {
  return voltageDropPct({ current, voltage, phases, powerFactor }, conductorSize, lengthFt, { cableCatalog }).value;
}

function stableSignature(value) {
  return fingerprintStudyValue(value);
}

function motorBranchBreakerAdapter(candidate, motorId) {
  if (!candidate?.branchCircuitBreaker) return null;
  const breaker = candidate.branchCircuitBreaker;
  return {
    id: breaker.catalogNumber,
    manufacturer: candidate.manufacturer,
    catalogNumber: breaker.catalogNumber,
    deviceType: 'molded-case branch-circuit breaker',
    poles: breaker.poles,
    frequencyHz: [...breaker.ratedNetworkFrequencyHz],
    tripUnit: breaker.tripUnit,
    tripTechnology: breaker.tripTechnology,
    continuousCurrentA: breaker.fixedOverloadPickupA,
    tripRatingA: breaker.fixedOverloadPickupA,
    evaluatedVoltageVac: breaker.ratedVoltageV,
    ratedVoltageVac: breaker.ratedVoltageV,
    interruptingRatingKA: breaker.interruptingRatingKA,
    interruptingRatingVoltageVac: breaker.ratedVoltageV,
    researchStatus: 'candidate',
    libraryStatus: 'screening',
    selectionStatus: 'conditional-research-candidate',
    selectedForApply: false,
    protectionStatus: 'blocked',
    coordinationStatus: 'not-performed',
    proposedInstantaneousPickupA: breaker.instantaneousPickupA,
    proposedInstantaneousPickupBasis: breaker.instantaneousPickupBasis || 'unspecified',
    conditionalCombination: candidate.conditionalCombination,
    assemblyEvidenceRef: { section: 'motorStarterCandidates', motorId: String(motorId), candidateId: candidate.id },
    evidenceScope: 'Compact cable and one-line fields identify the screened breaker; fieldSources resolve against the referenced complete motorStarterCandidates case.',
    sourceIds: candidate.sources.map(source => source.id),
    fieldSources: candidate.fieldSources.filter(source => source.pointer.startsWith('/candidate/branchCircuitBreaker') || source.pointer.startsWith('/candidate/conditionalCombination')),
    note: 'Exact breaker identity shown for the conditional research combination; not an approved or installed protective device.'
  };
}

function minimumProtectedAmpacity(required, supply, devices, deviceVoltageApplicabilityById = {}, basis = undefined) {
  const selection = selectProtectiveDevice({ cable: { currentA: required, phases: supply?.phases, operating_voltage: supply?.voltage, ampacityA: Number.MAX_SAFE_INTEGER, protectiveRequirement: { ampereRatingA: required } }, supply, devices, deviceVoltageApplicabilityById, basis });
  return Number(selection.selected?.continuousCurrentA ?? selection.selected?.tripRatingA) || 0;
}

function issue(code, message, severity = 'blocking', path = null) {
  return { code, message, severity, path };
}

function attachFaultEvolutionValidation(proposal, input, { faultStudyValidation = proposal?.faultStudyValidation, deviceFaultValidation = proposal?.deviceFaultValidation, forcedIssue = null } = {}) {
  proposal.faultEvolution = structuredClone(input.faultEvolution);
  let validation = evaluateDesignSynthesisFaultEvolution({ proposal, faultStudy: input.faultStudy, faultEvolution: input.faultEvolution, faultStudyValidation, deviceFaultValidation });
  if (forcedIssue) validation = { ...validation, status: 'blocked', faultCases: [], deviceHistories: [], coverage: { ...(validation.coverage || {}), status: 'incomplete' }, issues: [...(validation.issues || []), forcedIssue] };
  proposal.faultEvolutionValidation = validation;
  proposal.inputSignature = stableSignature({ proposalInputSignature: proposal.inputSignature, faultEvolution: input.faultEvolution });
  proposal.checks = (proposal.checks || []).filter(item => item.id !== 'faultEvolution');
  proposal.checks.push({ id: 'faultEvolution', status: validation.status === 'blocked' ? 'fail' : 'unevaluated', evidence: validation });
  if (validation.status === 'blocked') {
    const validationIssues = [...(validation.issues || [])];
    if (!validationIssues.length) validationIssues.push({ code: 'FAULT_EVOLUTION_BLOCKED', path: 'faultEvolution', message: 'The supplied source-history comparison is blocked.' });
    proposal.issues.push(...validationIssues.map(item => issue(item.code || 'FAULT_EVOLUTION_BLOCKED', item.message || 'The supplied source-history comparison is blocked.', 'blocking', item.path || 'faultEvolution'))
      .filter(item => !proposal.issues.some(existing => existing.code === item.code && existing.path === item.path)));
    proposal.status = 'blocked';
    proposal.distributionBaseline = null;
    const disposition = buildDesignSynthesisLoadDispositions(input, { issues: proposal.issues });
    proposal.loadDispositions = disposition.loadDispositions;
    proposal.globalBlockingIssues = disposition.globalBlockingIssues;
    if (proposal.summary) {
      proposal.summary.generatedLoadCount = 0;
      proposal.summary.blockedCount = proposal.issues.filter(item => item.severity === 'blocking').length;
    }
    (proposal.panelLocationOverrides || []).forEach(row => { if (row.requestedLocation) row.status = 'blocked'; });
  }
  if (proposal.summary) proposal.summary.blockedCount = proposal.issues.filter(item => item.severity === 'blocking').length;
  return validation;
}

function attachCableFaultWithstandValidation(proposal, input) {
  proposal.cableFaultWithstand = structuredClone(input.cableFaultWithstand);
  const validation = evaluateDesignSynthesisCableFaultWithstand({ request: input.cableFaultWithstand, proposal, faultEvolutionValidation: proposal.faultEvolutionValidation });
  proposal.cableFaultWithstandValidation = validation;
  proposal.inputSignature = stableSignature({ proposalInputSignature: proposal.inputSignature, cableFaultWithstand: input.cableFaultWithstand });
  proposal.checks = (proposal.checks || []).filter(item => item.id !== 'cableFaultWithstand');
  proposal.checks.push({ id: 'cableFaultWithstand', status: validation.status === 'blocked' || validation.comparison === 'fail' ? 'fail' : 'unevaluated', evidence: validation });
  if (validation.status === 'blocked' || validation.comparison === 'fail') {
    const validationIssues = [...(validation.issues || [])];
    if (validation.comparison === 'fail') validationIssues.push({ code: 'CABLE_FAULT_WITHSTAND_LIMIT_EXCEEDED', path: 'cableFaultWithstand', message: 'At least one exposure in the requested fault-location scope exceeds the conditional single-event adiabatic conductor limit.' });
    if (!validationIssues.length) validationIssues.push({ code: 'CABLE_FAULT_WITHSTAND_BLOCKED', path: 'cableFaultWithstand', message: 'The requested cable fault-withstand comparison is blocked.' });
    proposal.issues.push(...validationIssues.map(item => issue(item.code || 'CABLE_FAULT_WITHSTAND_BLOCKED', item.message || 'The requested cable fault-withstand comparison is blocked.', 'blocking', item.path || 'cableFaultWithstand'))
      .filter(item => !proposal.issues.some(existing => existing.code === item.code && existing.path === item.path)));
    proposal.status = 'blocked';
    proposal.distributionBaseline = null;
    const disposition = buildDesignSynthesisLoadDispositions(input, { issues: proposal.issues });
    proposal.loadDispositions = disposition.loadDispositions;
    proposal.globalBlockingIssues = disposition.globalBlockingIssues;
    if (proposal.summary) {
      proposal.summary.generatedLoadCount = 0;
      proposal.summary.blockedCount = proposal.issues.filter(item => item.severity === 'blocking').length;
    }
    (proposal.panelLocationOverrides || []).forEach(row => { if (row.requestedLocation) row.status = 'blocked'; });
  }
  if (proposal.summary) proposal.summary.blockedCount = proposal.issues.filter(item => item.severity === 'blocking').length;
  return validation;
}

function validateInput(input) {
  const issues = [];
  const supply = input?.supply;
  if (!Array.isArray(input?.equipment)) issues.push(issue('INVALID_EQUIPMENT_ARRAY', 'equipment must be an array.', 'blocking', 'equipment'));
  if (!input?.corridors || !Array.isArray(input.corridors.nodes) || !Array.isArray(input.corridors.edges)) issues.push(issue('INVALID_CORRIDOR_GRAPH', 'corridors.nodes and corridors.edges must be arrays.', 'blocking', 'corridors'));
  if (!input?.criteria || typeof input.criteria !== 'object') issues.push(issue('MISSING_CRITERIA', 'criteria is required.', 'blocking', 'criteria'));
  if (!supply || !finite(supply.voltage) || n(supply.voltage) <= 0) issues.push(issue('MISSING_SOURCE_VOLTAGE', 'Supply voltage must be a positive number.', 'blocking', 'supply.voltage'));
  if (!supply || ![1, 3].includes(n(supply.phases))) issues.push(issue('UNSUPPORTED_SOURCE_PHASES', 'Supply phases must be 1 or 3; 2-phase topology is ambiguous.', 'blocking', 'supply.phases'));
  const effectiveFrequency = supply?.frequencyHz ?? supply?.frequency ?? input?.criteria?.frequencyHz ?? input?.criteria?.frequency ?? 60;
  if (effectiveFrequency !== 60) issues.push(issue('UNSUPPORTED_FREQUENCY', 'Only numeric 60 Hz synthesis is supported.', 'blocking', 'supply.frequencyHz'));
  if (!supply || !finite(supply.capacityKva) || n(supply.capacityKva) <= 0) issues.push(issue('MISSING_SOURCE_CAPACITY', 'Supply capacityKva must be a positive number.', 'blocking', 'supply.capacityKva'));
  if (!supply || !point(supply)) issues.push(issue('MISSING_SOURCE_LOCATION', 'Supply x, y, and z coordinates are required.', 'blocking', 'supply'));
  if (!Array.isArray(input?.equipment) || input.equipment.length === 0) issues.push(issue('MISSING_EQUIPMENT', 'At least one equipment load is required.', 'blocking', 'equipment'));
  const equipment = Array.isArray(input?.equipment) ? input.equipment : [];
  for (const [index, load] of equipment.entries()) {
    const path = `equipment[${index}]`;
    if (!load?.id || !load?.tag) issues.push(issue('MISSING_LOAD_ID', 'Each load requires id and tag.', 'blocking', path));
    if (!finite(load?.kw) || n(load.kw) <= 0) issues.push(issue('INVALID_LOAD_KW', 'Load kw must be a positive number.', 'blocking', `${path}.kw`));
    if (!finite(load?.voltage) || n(load.voltage) <= 0) issues.push(issue('INVALID_LOAD_VOLTAGE', 'Load voltage must be a positive number.', 'blocking', `${path}.voltage`));
    if (![1, 3].includes(n(load?.phases))) issues.push(issue('UNSUPPORTED_LOAD_PHASES', 'Only 1-phase and 3-phase loads are supported; 2-phase topology is ambiguous.', 'blocking', `${path}.phases`));
    if (load?.powerFactor !== undefined && (!finite(load.powerFactor) || n(load.powerFactor) <= 0 || n(load.powerFactor) > 1)) issues.push(issue('INVALID_POWER_FACTOR', 'powerFactor must be greater than 0 and no greater than 1.', 'blocking', `${path}.powerFactor`));
    if (!point(load)) issues.push(issue('MISSING_LOAD_LOCATION', 'Load x, y, and z coordinates are required.', 'blocking', path));
  }
  if (criteriaObject(input.criteria).maxPanelLoadKva !== undefined && (!finite(input.criteria.maxPanelLoadKva) || n(input.criteria.maxPanelLoadKva) <= 0)) issues.push(issue('INVALID_PANEL_CAPACITY', 'maxPanelLoadKva must be positive.', 'blocking', 'criteria.maxPanelLoadKva'));
  const ids = new Set(); const tags = new Set();
  for (const load of equipment) {
    if (load?.id && ids.has(String(load.id))) issues.push(issue('DUPLICATE_LOAD_ID', `Duplicate equipment id ${load.id}.`, 'blocking', 'equipment'));
    if (load?.tag && tags.has(String(load.tag))) issues.push(issue('DUPLICATE_LOAD_TAG', `Duplicate equipment tag ${load.tag}.`, 'blocking', 'equipment'));
    if (load?.id) ids.add(String(load.id)); if (load?.tag) tags.add(String(load.tag));
  }
  return issues;
}

function criteriaObject(criteria) { return criteria && typeof criteria === 'object' ? criteria : {}; }

function prepareGraph(corridors, issues) {
  const nodeList = Array.isArray(corridors?.nodes) ? corridors.nodes : [];
  const edgeList = Array.isArray(corridors?.edges) ? corridors.edges : [];
  const nodes = new Map(nodeList.filter(node => node?.id && point(node)).map(node => [String(node.id), node]));
  const nodesByKey = new Map([...nodes.values()].map(node => [String(node.id).trim().toLowerCase(), node]));
  if (nodeList.filter(node => node?.id).length !== nodes.size) issues.push(issue('DUPLICATE_CORRIDOR_NODE', 'Corridor node ids must be unique.', 'blocking', 'corridors.nodes'));
  if (!nodes.size) issues.push(issue('MISSING_CORRIDOR_NODES', 'Permitted routing corridors require nodes with id and x, y, z.', 'blocking', 'corridors.nodes'));
  const edges = [];
  for (const edge of edgeList) {
    const from = edge ? nodesByKey.get(String(edge.from ?? '').trim().toLowerCase()) : null; const to = edge ? nodesByKey.get(String(edge.to ?? '').trim().toLowerCase()) : null;
    if (!edge?.id || !from || !to) { issues.push(issue('INVALID_CORRIDOR_EDGE', 'Corridor edges must reference valid nodes.', 'blocking', 'corridors.edges')); continue; }
    if (edge.permitted === false || edge.allowed === false) continue;
    const widthIn = finite(edge.widthIn) ? n(edge.widthIn) : null;
    const depthIn = finite(edge.depthIn) ? n(edge.depthIn) : null;
    if ((widthIn !== null && widthIn <= 0) || (depthIn !== null && depthIn <= 0)) { issues.push(issue('INVALID_CORRIDOR_DIMENSION', 'Permitted corridor widthIn and depthIn must be positive.', 'blocking', `corridors.edges.${edge.id}`)); continue; }
    edges.push({ ...edge, id: String(edge.id), from: String(from.id), to: String(to.id), widthIn, depthIn, length: distance(from, to) });
  }
  const adjacency = new Map([...nodes.keys()].map(id => [id, []]));
  for (const edge of edges) { adjacency.get(edge.from).push({ node: edge.to, edge }); adjacency.get(edge.to).push({ node: edge.from, edge, reverse: true }); }
  return { nodes, edges, adjacency };
}

function nearestNode(graph, target, maxAttachment) {
  let best = null;
  for (const node of graph.nodes.values()) { const d = distance(node, target); if (!best || d < best.distance - EPS || (Math.abs(d - best.distance) <= EPS && String(node.id).localeCompare(String(best.node.id)) < 0)) best = { node, distance: d }; }
  return best && best.distance <= maxAttachment + EPS ? best : null;
}

function dijkstraPath(graph, start, end, allowedEdges = null) {
  const dist = new Map([...graph.nodes.keys()].map(id => [id, Infinity]));
  const previous = new Map(); const queue = [...graph.nodes.keys()]; const settled = new Set(); dist.set(start, 0);
  while (queue.length) {
    queue.sort((a, b) => dist.get(a) - dist.get(b) || a.localeCompare(b));
    const currentId = queue.shift(); if (settled.has(currentId)) continue; settled.add(currentId); if (currentId === end) break;
    const neighbors = [...(graph.adjacency.get(currentId) || [])].sort((a, b) => a.edge.id.localeCompare(b.edge.id) || a.node.localeCompare(b.node));
    for (const next of neighbors) {
      if (settled.has(next.node) || (allowedEdges && !allowedEdges.has(next.edge.id))) continue;
      const candidate = dist.get(currentId) + next.edge.length;
      if (candidate < dist.get(next.node) - EPS) { dist.set(next.node, candidate); previous.set(next.node, { node: currentId, edge: next.edge, reverse: next.reverse }); }
    }
  }
  if (!Number.isFinite(dist.get(end))) return null;
  const edgeIds = []; const nodeIds = [end]; let cursor = end;
  while (cursor !== start) { const step = previous.get(cursor); edgeIds.unshift(step.edge.id); cursor = step.node; nodeIds.unshift(cursor); }
  return { nodeIds, edgeIds, corridorLength: dist.get(end) };
}

function route(graph, start, end) { return dijkstraPath(graph, start, end); }
function shortestFilteredPath(graph, start, end, allowedEdges) { return dijkstraPath(graph, start, end, allowedEdges); }

function routeFromPath(path, from, to) {
  return { status: 'routed', fromNode: from.node.id, toNode: to.node.id, sourceAttachmentFt: from.distance, destinationAttachmentFt: to.distance, lengthFt: path.corridorLength + from.distance + to.distance, edgeIds: path.edgeIds, nodeIds: path.nodeIds };
}

function reserveCapacityRoute(reservations, selectedRoute, conductorSize, id) {
  if (selectedRoute?.status !== 'routed' || !conductorSize) return;
  for (const edgeId of new Set(selectedRoute.edgeIds || [])) {
    const cable = { id, conductor_size: conductorSize, conductor_count: 3, cable_rating: 600 };
    (reservations.get(edgeId) || reservations.set(edgeId, []).get(edgeId)).push(cable);
  }
}

function buildFeasibleRoute(graph, source, target, maxAttachment, issues, ref, load, criteria, minimumAmpacity, capacityReservations = new Map(), candidateAnchors = null) {
  const from = candidateAnchors?.from || nearestNode(graph, source, maxAttachment); const to = candidateAnchors?.to || nearestNode(graph, target, maxAttachment);
  if (!from || !to) { issues.push(issue('ENDPOINT_OUTSIDE_CORRIDOR', `${ref} is farther than the permitted endpoint attachment limit from a corridor node.`, 'blocking', ref)); return { route: { status: 'blocked', reason: 'endpoint_attachment_limit' }, decision: { status: 'blocked', reason: 'endpoint_attachment_limit', examinedAlternatives: 0 } }; }
  const candidateCriteria = { ...criteria, minimumConductorAmpacity: minimumAmpacity };
  const insulation = criteria.temperatureRatingC || 75; const terminal = criteria.terminalTempRatingC ?? criteria.terminalRatingC ?? 75;
  const required = Math.max(load.current * (load.duty !== 'intermittent' && load.duty !== 'non-continuous' ? 1.25 : 1), Number(load.designAmpacityA) || 0);
  const column = ampacityColumn(criteria.conductorMaterial || 'copper', insulation); const terminalColumn = ampacityColumn(criteria.conductorMaterial || 'copper', terminal);
  const examined = []; const feasible = []; const shortestPath = route(graph, from.node.id, to.node.id); const capacityExcludedEdgeIds = new Set(); let shortestCapacityBlocked = false;
  const floorIndex = criteria.minimumConductorSize ? NEC_AMPACITY_TABLE.findIndex(row => row.size === criteria.minimumConductorSize) : -1;
  for (const [rowIndex, row] of NEC_AMPACITY_TABLE.entries()) {
    if (floorIndex >= 0 && rowIndex < floorIndex) continue;
    const sourceData = SOURCED_MC_R_X[row.size]; if (!sourceData || criteria.conductorMaterial?.toLowerCase?.().includes('al')) continue;
    const tableAmpacity = row[column]; const terminalAmpacity = row[terminalColumn]; const needed = Math.max(required, minimumAmpacity);
    if (!finite(tableAmpacity) || !finite(terminalAmpacity) || terminalAmpacity < needed - EPS) continue;
    const thermalAllowedEdges = new Set(); const allowedEdges = new Set(); const rowCapacityExcludedEdgeIds = new Set();
    for (const edge of graph.edges) {
      const probe = routeFromPath({ nodeIds: [edge.from, edge.to], edgeIds: [edge.id], corridorLength: edge.length }, from, to);
      const thermal = evaluateDesignSynthesisRouteThermal({ route: probe, edges: graph.edges, criteria, temperatureRating: insulation });
      if (thermal.status !== 'evaluated' || tableAmpacity * thermal.adjustmentFactor < needed - EPS) continue;
      thermalAllowedEdges.add(edge.id);
      const capacity = evaluateCorridorTrayCapacity({ edge, cables: capacityReservations.get(edge.id) || [], candidateSize: row.size });
      if (capacity.status === 'pass') allowedEdges.add(edge.id);
      else { capacityExcludedEdgeIds.add(edge.id); rowCapacityExcludedEdgeIds.add(edge.id); }
    }
    const path = shortestFilteredPath(graph, from.node.id, to.node.id, allowedEdges);
    if (!path) {
      const thermalPath = shortestFilteredPath(graph, from.node.id, to.node.id, thermalAllowedEdges);
      if (shortestPath && thermalPath && shortestPath.edgeIds.every(edgeId => thermalAllowedEdges.has(edgeId)) && shortestPath.edgeIds.some(edgeId => rowCapacityExcludedEdgeIds.has(edgeId))) shortestCapacityBlocked = true;
      examined.push({ size: row.size, feasible: false, reason: thermalPath ? 'Shared tray capacity blocks every thermally feasible path.' : 'No permitted path meets this candidate thermal ampacity.', allowedEdgeCount: allowedEdges.size, capacityExcludedEdgeIds: [...rowCapacityExcludedEdgeIds].sort() });
      continue;
    }
    const candidateRoute = routeFromPath(path, from, to);
    const thermal = evaluateDesignSynthesisRouteThermal({ route: candidateRoute, edges: graph.edges, criteria, temperatureRating: insulation });
    const drop = voltageDropPct(load, row.size, candidateRoute.lengthFt, candidateCriteria);
    const passes = thermal.status === 'evaluated' && tableAmpacity * thermal.adjustmentFactor >= needed - EPS && drop.status === 'evaluated' && drop.value <= (criteria.voltageDropLimitPct ?? Infinity) + EPS;
    examined.push({ size: row.size, lengthFt: candidateRoute.lengthFt, limitingSegmentId: thermal.limitingSegmentId, adjustmentFactor: thermal.adjustmentFactor, feasible: passes, reason: passes ? null : (drop.value > (criteria.voltageDropLimitPct ?? Infinity) ? 'Voltage-drop limit' : 'Route thermal ampacity'), allowedEdgeCount: allowedEdges.size, capacityExcludedEdgeIds: [...rowCapacityExcludedEdgeIds].sort() });
    if (passes) feasible.push({ route: candidateRoute, size: row.size, thermal, drop, thermalAllowedEdges, capacityExcludedEdgeIds: [...rowCapacityExcludedEdgeIds] });
  }
  let nearestElectricalSelection = null;
  let nearestEndpointIssues = [];
  if (feasible.length) {
    feasible.sort((a, b) => a.route.lengthFt - b.route.lengthFt || NEC_AMPACITY_TABLE.findIndex(row => row.size === a.size) - NEC_AMPACITY_TABLE.findIndex(row => row.size === b.size) || a.route.edgeIds.join('|').localeCompare(b.route.edgeIds.join('|')));
    const selection = chosen => {
      const shortestCapacityBlocked = Boolean(shortestPath
        && shortestPath.edgeIds.every(edgeId => chosen.thermalAllowedEdges.has(edgeId))
        && shortestPath.edgeIds.some(edgeId => chosen.capacityExcludedEdgeIds.includes(edgeId)));
      const hasCapacityEvidence = chosen.capacityExcludedEdgeIds.length > 0;
      const decision = { status: 'feasible', ...(hasCapacityEvidence ? { capacityAwareMethod: 'deterministic-greedy-shared-tray-capacity-v1', capacityExcludedEdgeIds: chosen.capacityExcludedEdgeIds.sort() } : {}), selectedPath: chosen.route.edgeIds, selectedConductorSize: chosen.size, selectedLengthFt: chosen.route.lengthFt, shortestPath: shortestPath?.edgeIds || [], shortestLengthFt: shortestPath ? shortestPath.corridorLength + from.distance + to.distance : null, shortestRejectedReason: shortestPath && chosen.route.edgeIds.join('|') !== shortestPath.edgeIds.join('|') ? (shortestCapacityBlocked ? 'shared-tray-capacity' : 'selected-conductor-thermal-ampacity') : null, searchedCandidateCount: examined.length, examinedAlternatives: examined.length };
      return { route: { ...chosen.route, routingDecision: decision }, decision };
    };
    if (criteria.allowAlternateEndpointAttachments !== true) return selection(feasible[0]);
    const screened = feasible.map(candidate => ({ candidate, endpoint: screenAlternateEndpointInstallation({ route: candidate.route, size: candidate.size, criteria }) }));
    const firstSupported = screened.find(item => item.endpoint.ok);
    if (firstSupported) {
      const result = selection(firstSupported.candidate);
      if (firstSupported.candidate !== feasible[0]) {
        const endpointInstallationRetry = { status: 'selected', method: 'endpoint-installation-candidate-screen-v1', originalConductorSize: feasible[0].size, selectedConductorSize: firstSupported.candidate.size, originalIssueCodes: screened[0].endpoint.issueCodes, rejectedCandidateCount: screened.indexOf(firstSupported) };
        result.decision = { ...result.decision, endpointInstallationRetry };
        result.route.routingDecision = result.decision;
      }
      return result;
    }
    if (candidateAnchors) return { route: null, decision: { status: 'no-feasible-route', reason: 'endpoint-installation', endpointIssueCodes: [...new Set(screened.flatMap(item => item.endpoint.issueCodes))] } };
    nearestElectricalSelection = selection(feasible[0]);
    nearestEndpointIssues = [...new Set(screened.flatMap(item => item.endpoint.issueCodes))];
  }
  let alternateEvidence = null;
  if (!candidateAnchors && criteria.allowAlternateEndpointAttachments === true) {
    const choices = buildAlternateAnchorPairs({ graph, source, target, maxAttachment, nearestFrom: from, nearestTo: to, distance });
    let attempts = 0; let endpointRejectedPairs = 0; let prunedPairs = 0; let disconnectedPairs = 0; let best = null;
    for (const pair of choices.pairs) {
      const lowerPath = route(graph, pair.from.node.id, pair.to.node.id);
      if (!lowerPath) { disconnectedPairs += 1; continue; }
      const lowerBound = lowerPath.corridorLength + pair.from.distance + pair.to.distance;
      if (best && lowerBound > best.alternative.route.lengthFt + EPS * (graph.nodes.size + 1)) { prunedPairs += 1; continue; }
      attempts += 1;
      const alternative = buildFeasibleRoute(graph, source, target, maxAttachment, [], ref, load, criteria, minimumAmpacity, capacityReservations, pair);
      if (alternative.decision.reason === 'endpoint-installation') endpointRejectedPairs += 1;
      if (alternative.decision.status !== 'feasible') continue;
      const compare = other => alternative.route.lengthFt - other.alternative.route.lengthFt
        || NEC_AMPACITY_TABLE.findIndex(row => row.size === alternative.decision.selectedConductorSize) - NEC_AMPACITY_TABLE.findIndex(row => row.size === other.alternative.decision.selectedConductorSize)
        || alternative.route.edgeIds.join('|').localeCompare(other.alternative.route.edgeIds.join('|'))
        || String(pair.from.node.id).localeCompare(String(other.pair.from.node.id))
        || String(pair.to.node.id).localeCompare(String(other.pair.to.node.id));
      if (!best || compare(best) < 0) best = { pair, alternative };
    }
    const common = { method: 'explicit-alternate-attachments-v2', ...(nearestEndpointIssues.length ? { nearestEndpointIssueCodes: nearestEndpointIssues } : {}), nearestSourceNode: String(from.node.id), nearestDestinationNode: String(to.node.id), attemptedPairs: attempts, endpointRejectedPairs, prunedPairs, disconnectedPairs, sourceAnchorCount: choices.sourceAnchorCount, destinationAnchorCount: choices.destinationAnchorCount, limitPerEndpoint: choices.limitPerEndpoint, truncated: choices.truncated };
    if (best) {
      const { pair, alternative } = best;
      const anchorReview = { ...common, status: 'selected', nearestFailure: nearestElectricalSelection ? 'endpoint-installation-incomplete' : shortestPath ? 'no-feasible-conductor-route' : 'disconnected-permitted-corridors', sourceNode: String(pair.from.node.id), destinationNode: String(pair.to.node.id), sourceAttachmentFt: pair.from.distance, destinationAttachmentFt: pair.to.distance };
      const decision = { ...alternative.decision, alternateEndpointAttachments: anchorReview };
      return { route: { ...alternative.route, routingDecision: decision }, decision };
    }
    alternateEvidence = { ...common, status: 'no-feasible-alternative' };
  }
  if (nearestElectricalSelection) {
    nearestElectricalSelection.decision = { ...nearestElectricalSelection.decision, ...(alternateEvidence ? { alternateEndpointAttachments: alternateEvidence } : {}) };
    nearestElectricalSelection.route.routingDecision = nearestElectricalSelection.decision;
    return nearestElectricalSelection;
  }
  const shortest = route(graph, from.node.id, to.node.id);
  if (!shortest) { issues.push(issue('NO_PERMITTED_ROUTE', `${ref} has no connected route using permitted corridor edges.`, 'blocking', ref)); return { route: { status: 'blocked', reason: 'disconnected_permitted_corridor', fromNode: from.node.id, toNode: to.node.id }, decision: { status: 'blocked', reason: 'disconnected_permitted_corridor', searchedCandidateCount: examined.length, examinedAlternatives: examined.length, ...(alternateEvidence ? { alternateEndpointAttachments: alternateEvidence } : {}) } }; }
  const fallback = routeFromPath(shortest, from, to); const excluded = [...capacityExcludedEdgeIds].sort(); const decision = { status: 'no-feasible-route', ...(excluded.length ? { capacityAwareMethod: 'deterministic-greedy-shared-tray-capacity-v1', capacityExcludedEdgeIds: excluded } : {}), selectedPath: shortest.edgeIds, selectedLengthFt: fallback.lengthFt, shortestPath: shortest.edgeIds, shortestLengthFt: fallback.lengthFt, shortestRejectedReason: shortestCapacityBlocked ? 'shared-tray-capacity' : 'no-candidate-meets-thermal-ampacity-or-voltage-drop', searchedCandidateCount: examined.length, examinedAlternatives: examined.length, ...(alternateEvidence ? { alternateEndpointAttachments: alternateEvidence } : {}) };
  return { route: { ...fallback, routingDecision: decision }, decision };
}

function panelGroups(loads, criteria, source, distributionPartitionGroups = null) {
  if (Array.isArray(distributionPartitionGroups)) {
    const byId = new Map(loads.map(load => [String(load.id).toLowerCase(), load]));
    return distributionPartitionGroups.map(groupIds => {
      const groupLoads = groupIds.map(id => byId.get(String(id).toLowerCase())).filter(Boolean);
      const first = groupLoads[0];
      return { voltage: n(first?.voltage), phases: n(first?.phases), totalKva: groupLoads.reduce((sum, load) => sum + kva(load), 0), loads: groupLoads };
    });
  }
  const maxKva = finite(criteria.maxPanelLoadKva) && n(criteria.maxPanelLoadKva) > 0 ? n(criteria.maxPanelLoadKva) : n(source.capacityKva);
  const maxCount = Number.isInteger(n(criteria.maxLoadsPerPanel)) && n(criteria.maxLoadsPerPanel) > 0 ? n(criteria.maxLoadsPerPanel) : Infinity;
  const groups = [];
  for (const load of [...loads].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const compatible = groups.find(group => group.voltage === n(load.voltage) && group.phases === n(load.phases) && group.totalKva + kva(load) <= maxKva + EPS && group.loads.length < maxCount);
    if (compatible) { compatible.loads.push(load); compatible.totalKva += kva(load); } else groups.push({ voltage: n(load.voltage), phases: n(load.phases), totalKva: kva(load), loads: [load] });
  }
  return groups;
}

function generateDesignProposalInternal(input = {}, internalOptions = {}) {
  input = input || {};
  const originalInput = structuredClone(input);
  const inputEvidence = buildDesignSynthesisInputEvidence(input);
  const motorValidation = validateDesignSynthesisMotorInputs(input);
  const inputValidation = validateDesignSynthesisInput(input);
  if (!inputValidation.ok) {
    const hasMotorInput = Array.isArray(originalInput.equipment) && originalInput.equipment.some(isDesignSynthesisMotor);
    const sourceFaultConsistency = hasMotorInput ? analyzeDesignSynthesisSourceFaultConsistency({ source: originalInput.supply }) : null;
    const issues = [...inputValidation.issues, ...(sourceFaultConsistency?.issues || [])];
    const disposition = buildDesignSynthesisLoadDispositions(originalInput, { issues });
    const checks = [{ id: 'inputCompleteness', status: 'fail', evidence: { issueCount: inputValidation.issues.length } }];
    if (sourceFaultConsistency) checks.push({ id: 'sourceFaultConsistency', status: sourceFaultConsistency.status === 'pass' ? 'pass' : 'fail', evidence: sourceFaultConsistency });
    return { schemaVersion: '1.0.0', status: 'blocked', inputSignature: stableSignature(input), inputEvidence, ...(sourceFaultConsistency ? { sourceFaultConsistency } : {}), loadDispositions: disposition.loadDispositions, globalBlockingIssues: disposition.globalBlockingIssues, inputs: { original: input }, equipment: [], loads: [], panels: [], cables: [], trays: [], oneLine: { activeSheet: 0, sheets: [] }, routeResults: { batchResults: [] }, checks, issues, assumptions: [], decisions: [], summary: { loadCount: 0, suppliedLoadCount: Array.isArray(originalInput.equipment) ? originalInput.equipment.length : 0, generatedLoadCount: 0, cableCount: 0, routedCount: 0, blockedCount: issues.length }, report: { intendedUse: 'screening-only' } };
  }
  input = inputValidation.sanitized;
  const userCriteria = input.criteria || {};
  const criteria = { ...userCriteria };
  const conductorSizeFloors = internalOptions.conductorSizeFloors || {};
  const feederFloorByLoad = internalOptions.feederFloorByLoad || {};
  const operatingCurrentFloors = internalOptions.operatingCurrentFloors || {};
  const issues = validateInput(input); const source = input.supply || {};
  const graph = prepareGraph(input.corridors || {}, issues);
  const protectionDevices = input.protectiveDevices ?? bundledDeviceSnapshot.records;
  const deviceVoltageApplicabilityById = buildSynthesisDeviceVoltageApplicability(protectionDevices);
  const assumptions = ['Preliminary radial arrangement for screening only; qualified engineer review is required.', 'Protective device records are manufacturer sourced screening candidates; coordination and settings are not performed.', 'Source availableFaultCurrentKA is an explicit external-source bound; additional downstream motor/generator contribution is excluded from this screening bound and requires a separate fault study.', 'Equipment kw ratings are electrical-input values; motor conductor design uses the separately referenced full-load current, while motor overload protection and short-circuit/ground-fault coordination remain unresolved.', 'Default design basis: continuous duty when omitted, power factor 1 when omitted, 30 C ambient, and 75 C terminal/conductor rating when omitted.', 'Corridor endpoint attachment is straight-line distance bounded by criteria.maxEndpointAttachmentFt.'];
  const decisions = ['Loads are sorted by stable id and greedily grouped by voltage, phase count, panel capacity, and maximum loads per panel.', 'Permitted corridor edges are the only route segments considered.', 'Capacity-aware routing reserves selected feeders and branches in stable order; bounded retries may prioritize blocked branches and their panel groups after identities are assigned. It does not backtrack or prove global route feasibility.'];
  const motorById = new Map(motorValidation.motors.map(item => [item.id, item]));
  if (criteria.allowAlternateEndpointAttachments === true) assumptions.push('Alternative straight-line endpoint attachments are explicitly enabled; obstacle clearance and field-path permission require review.');
  const normalizedLoads = (Array.isArray(input.equipment) ? input.equipment : []).map(load => {
    const motor = motorById.get(String(load?.id));
    const runningCurrentA = finite(load?.kw) && finite(load?.voltage) && [1, 3].includes(n(load?.phases)) ? current(load.kw, load.voltage, load.phases, load.powerFactor || 1) : null;
    return { ...(load || {}), kva: kva(load || {}), powerFactor: finite(load?.powerFactor) && n(load.powerFactor) > 0 ? n(load.powerFactor) : 1, duty: String(load?.duty || 'continuous').toLowerCase(), ratingsBasis: load?.ratingsBasis || 'electrical-input-kW', description: load?.description || (motor ? 'Motor with separately supplied running, design and locked-rotor current bases; protection unresolved.' : 'Packaged electrical load; integral controller/overload assumptions retained for screening.'), currentA: runningCurrentA, ...(motor ? { runningCurrentA, designCurrentA: motor.designCurrentA, designAmpacityA: motor.designAmpacityA, motor: structuredClone(motor.motor) } : {}), source: load?.panelRef || null };
  });
  const motorBranchProtectionMethod = input.criteria?.motorStarter?.branchProtectionMethod || 'manual-controller';
  const motorBranchBreakerEvaluations = new Map();
  if (motorBranchProtectionMethod === 'inverse-time-breaker') {
    const effectiveSourceFrequency = input.supply?.frequencyHz ?? input.supply?.frequency ?? input.criteria?.frequencyHz ?? input.criteria?.frequency ?? 60;
    for (const load of normalizedLoads.filter(item => item.motor)) {
      const operatingCurrentA = Number(operatingCurrentFloors[`C-${load.id}`]);
      const operatingCurrentReference = finite(operatingCurrentA) && operatingCurrentA > 0
        ? 'Prior balanced load-flow circuit current retained as a monotonic operating-current floor during bounded design revision; it is not motor nameplate data.'
        : undefined;
      motorBranchBreakerEvaluations.set(String(load.id), evaluateMotorBranchBreakerCandidate({
        load: { ...load, frequencyHz: load.frequencyHz ?? load.frequency ?? effectiveSourceFrequency },
        supply: { ...input.supply, frequencyHz: effectiveSourceFrequency },
        criteria: input.criteria,
        ...(operatingCurrentReference ? { operatingCurrentA, operatingCurrentReference } : {}),
      }));
    }
  }
  if (normalizedLoads.reduce((sum, load) => sum + load.kva, 0) > n(source.capacityKva) + EPS) issues.push(issue('SOURCE_CAPACITY_EXCEEDED', 'Total connected load exceeds source capacity.', 'blocking', 'supply.capacityKva'));
  const incompatible = normalizedLoads.filter(load => source.voltage && (n(load.voltage) !== n(source.voltage) || n(load.phases) !== n(source.phases)));
  const transformerLoads = incompatible.filter(load => n(load.phases) === 3 && Number(load.voltage) === Number(criteria.transformer?.secondaryVoltageVac || 208));
  let transformer = null;
  if (incompatible.length) {
    const oneSupportedSecondary = transformerLoads.length === incompatible.length && transformerLoads.length > 0 && incompatible.every(load => n(load.phases) === 3);
    if (oneSupportedSecondary && Number(source.voltage) === 480 && Number(source.phases) === 3) {
      const requiredKVA = transformerLoads.reduce((sum, load) => sum + load.kva, 0);
      const transformerCriteria = criteria.transformer || {};
      const totalKW = transformerLoads.reduce((sum, load) => sum + load.kw, 0);
      const selection = selectTransformer({ requiredKVA, requiredPowerFactor: totalKW / requiredKVA, minimumRatedKVA: internalOptions.transformerMinimumKVA, primaryVoltageVac: Number(source.voltage), secondaryVoltageVac: Number(transformerCriteria.secondaryVoltageVac || 208), phases: 3, frequencyHz: Number(source.frequencyHz || criteria.frequencyHz || 60), maxLoadingPercent: Number(transformerCriteria.maxLoadingPercent || 100), allowedProfileIds: transformerCriteria.allowedProfileIds, windingMaterial: transformerCriteria.windingMaterial || 'copper' });
      if (selection.selected) {
        const targetLoads = transformerLoads;
        const transformerNode = [...graph.nodes.values()].sort((a, b) => {
          const score = node => distance(node, source) + targetLoads.reduce((sum, load) => sum + distance(node, load), 0);
          return score(a) - score(b) || String(a.id).localeCompare(String(b.id));
        })[0];
        const stableSystemId = String(source.id || source.tag || 'SOURCE').replace(/[^a-zA-Z0-9_-]+/g, '-');
        transformer = { ...selection.selected, id: `TX-${stableSystemId}-${selection.selected.primaryVoltageVac}-${selection.selected.secondaryVoltageVac}-3P`, tag: `TX-${selection.selected.catalogNumber}`, primaryBusId: `BUS-TX-${stableSystemId}-PRI`, secondaryBusId: `BUS-TX-${stableSystemId}-SEC`, routeNodeId: transformerNode?.id, x: transformerNode?.x, y: transformerNode?.y, z: transformerNode?.z, primaryProtectionLocation: 'source-end-of-transformer-primary-feeder', secondaryMainLocation: 'transformer-secondary-terminals', coreLossKw: selection.selected.losses.coreW / 1000, secondaryFault: estimateTransformerSecondaryFault({ transformer: selection.selected, primaryAvailableFaultCurrentKA: source.availableFaultCurrentKA }), groundFaultStatus: 'unevaluated', asymmetricalInterruptingDutyStatus: 'unevaluated' };
        transformer.selectionCandidates = selection.candidates;
        transformer.issues = selection.issues;
      } else issues.push(...selection.issues);
    } else {
      for (const load of incompatible) issues.push(issue('INCOMPATIBLE_LOAD', `${load.tag} voltage/phases are outside the supported 480 V three-phase source to 208 V three-phase screened transformer path.`, 'blocking', `equipment.${load.id}`));
    }
  }
  if (transformer) assumptions.push('Transformer selection defaults to the smallest eligible sourced 2020 copper profile at no more than 100% connected kVA loading; the connected-network load-flow checks the complete source-to-load voltage criterion, while criteria.transformer.maxLoadingPercent can lower the loading ceiling and allowedProfileIds can restrict profiles.');
  let distributionBaseline = null;
  const panels = []; const panelLocationOverrides = []; const cables = []; const capacityReservations = new Map(); const trays = graph.edges.map(edge => ({ id: edge.id, edgeId: edge.id, widthIn: edge.widthIn, depthIn: edge.depthIn, status: edge.widthIn && edge.depthIn ? 'screening-capacity-available' : 'capacity-incomplete' })); const routeResults = []; const oneLine = { sourceId: source.id || 'SOURCE', panels: [], feeders: [] };
  if (!issues.some(item => item.severity === 'blocking')) {
    const groupedLoads = panelGroups(normalizedLoads, criteria, source, internalOptions.distributionPartitionGroups);
    const identityPlan = buildDesignSynthesisPanelIdentityPlan(groupedLoads, input.generationBaseline);
    issues.push(...identityPlan.issues);
    if (identityPlan.ok) distributionBaseline = identityPlan.updatedBaseline;
    const groups = identityPlan.ok ? identityPlan.groups : [];
    // Route priority changes reservations only after stable panel identities and
    // memberships are assigned. Keep the canonical panel order for subsequent
    // distribution partitioning and regeneration.
    const routePriority = new Map((internalOptions.routePriorityIds || []).map((id, position) => [String(id), position]));
    const feederPriority = new Map((internalOptions.routePriorityPanelIds || []).map((id, position) => [String(id), position]));
    const groupPriority = group => feederPriority.has(group.id) ? feederPriority.get(group.id) : Math.min(Number.MAX_SAFE_INTEGER, ...group.loads.map(load => routePriority.has(String(load.id)) ? feederPriority.size + routePriority.get(String(load.id)) : Number.MAX_SAFE_INTEGER));
    const routeGroups = [...groups].sort((left, right) => groupPriority(left) - groupPriority(right));
    const generatedPanelIds = new Set(groups.map(group => group.id));
    const overrideValidation = validatePanelLocationOverrides(input.overrides, { knownPanelIds: generatedPanelIds });
    issues.push(...overrideValidation.issues);
    const panelLimit = finite(criteria.maxPanelLoadKva) ? n(criteria.maxPanelLoadKva) : n(source.capacityKva);
    for (const load of normalizedLoads) if (kva(load) > panelLimit + EPS) issues.push(issue('LOAD_EXCEEDS_PANEL_CAPACITY', `${load.tag} exceeds the maximum panel capacity and cannot be assigned safely.`, 'blocking', `equipment.${load.id}`));
    const reserveTransformerPrimary = () => {
      if (!transformer) return;
      const transformerNode = graph.nodes.get(transformer.routeNodeId);
      const primaryCableId = `F-${transformer.id}-PRI`;
      const primaryOperatingFloor = Number(operatingCurrentFloors[primaryCableId]) || 0;
      const primaryCurrent = Math.max(transformer.requiredKVA * 1000 / (Math.sqrt(3) * transformer.primaryVoltageVac), primaryOperatingFloor);
      const primaryDesignAmpacity = Math.max(primaryCurrent * 1.25, transformerLoads.reduce((sum, load) => sum + Math.max(load.currentA * 1.25, load.designAmpacityA || 0), 0) * transformer.secondaryVoltageVac / transformer.primaryVoltageVac);
      const primaryProtectionFloor = minimumProtectedAmpacity(primaryDesignAmpacity, source, protectionDevices, deviceVoltageApplicabilityById, { maximumRatingA: transformer.primaryMaxOcpA });
      const primarySizingCriteria = { ...criteria, minimumConductorSize: conductorSizeFloors[primaryCableId] || undefined, minimumConductorAmpacity: Math.max(primaryProtectionFloor, primaryOperatingFloor * 1.25) };
      const primaryRouteSelection = buildFeasibleRoute(graph, source, transformerNode, finite(criteria.maxEndpointAttachmentFt) ? n(criteria.maxEndpointAttachmentFt) : 25, issues, `transformer.${transformer.id}.primary`, { current: primaryCurrent, designAmpacityA: primaryDesignAmpacity, voltage: transformer.primaryVoltageVac, phases: 3, powerFactor: 1, duty: 'continuous' }, primarySizingCriteria, primarySizingCriteria.minimumConductorAmpacity, capacityReservations);
      const primaryRoute = primaryRouteSelection.route;
      routeResults.push({ id: `route-${transformer.primaryBusId}`, from: source.id || 'SOURCE', to: transformer.primaryBusId, ...primaryRoute });
      const primaryThermal = evaluateDesignSynthesisRouteThermal({ route: primaryRoute, edges: graph.edges, criteria, temperatureRating: criteria.temperatureRatingC || 75 });
      const selectedPrimaryCriteria = { ...primarySizingCriteria, minimumConductorSize: primaryRouteSelection.decision.selectedConductorSize || primarySizingCriteria.minimumConductorSize };
      const primarySize = primaryRoute.status === 'routed' ? conductorSizing({ current: primaryCurrent, designAmpacityA: primaryDesignAmpacity, voltage: transformer.primaryVoltageVac, phases: 3, powerFactor: 1, duty: 'continuous' }, selectedPrimaryCriteria, primaryRoute.lengthFt, primaryThermal) : { size: null, violation: 'Route unavailable', thermalAssessment: primaryThermal };
      const primaryCable = { id: primaryCableId, tag: primaryCableId, from: source.id || 'SOURCE', to: transformer.primaryBusId, from_tag: source.tag || source.id || 'SOURCE', to_tag: transformer.primaryBusId, transformerId: transformer.id, transformerSide: 'primary', currentA: primaryCurrent, est_load: primaryCurrent, ...(transformerLoads.some(load => load.motor) ? { designAmpacityA: primaryDesignAmpacity } : {}), length: primaryRoute.lengthFt ?? null, lengthFt: primaryRoute.lengthFt ?? null, operating_voltage: transformer.primaryVoltageVac, phases: 3, powerFactor: 1, conductorMaterial: criteria.conductorMaterial || 'copper', conductor_size: primarySize.size, conductorSize: primarySize.size, ampacityA: primarySize.ampacity || null, thermalAssessment: primarySize.thermalAssessment || primaryThermal, routingDecision: primaryRouteSelection.decision, sizingStatus: primarySize.size ? 'screening-sized' : 'blocked', sizingBasis: primarySize.sizingBasis || 'NEC_AMPACITY_TABLE', protectiveRequirement: { ampereRatingA: Math.max(primarySize.requiredAmps || primaryCurrent * 1.25, primaryOperatingFloor * 1.25), maximumTransformerPrimaryOcpA: transformer.primaryMaxOcpA, status: 'screening-requirement' }, ...sourcedCableImpedance(primarySize.size) };
      const primaryDrop = primarySize.size ? voltageDropPct({ current: primaryCurrent, voltage: transformer.primaryVoltageVac, phases: 3, powerFactor: 1 }, primarySize.size, primaryRoute.lengthFt, criteria) : { value: null, status: 'unevaluated' };
      primaryCable.voltageDropPct = primaryDrop.value; primaryCable.voltageDropStatus = primaryDrop.status; primaryCable.voltageDropSource = primaryDrop.source || null; primaryCable.routeThermalAmpacity = primarySize.limitingAmpacityA || null;
      if (!primarySize.size) issues.push(issue('TRANSFORMER_PRIMARY_FEEDER_BLOCKED', primarySize.violation || 'Transformer primary feeder could not be screened.', 'blocking', primaryCable.id));
      if (primaryRoute.status !== 'routed') issues.push(issue('TRANSFORMER_PRIMARY_ROUTE_BLOCKED', 'Transformer primary feeder has no permitted corridor route.', 'blocking', primaryCable.id));
      cables.push(primaryCable);
      reserveCapacityRoute(capacityReservations, primaryRoute, primarySize.size, primaryCableId);
      const primaryProtection = selectProtectiveDevice({ cable: primaryCable, supply: source, basis: { operatingVoltageVac: transformer.primaryVoltageVac, phases: 3, frequencyHz: Number(source.frequencyHz || 60), requiredCurrentA: primaryCable.protectiveRequirement.ampereRatingA, conductorAmpacityA: primaryCable.ampacityA, maximumRatingA: transformer.primaryMaxOcpA, availableFaultCurrentKA: source.availableFaultCurrentKA, faultBasis: 'externally supplied primary source three-phase symmetrical fault current', faultTypes: ['three-phase symmetrical'], provenance: { sourceId: source.id, availableFaultCurrentKA: source.availableFaultCurrentKA } }, deviceVoltageApplicabilityById, devices: protectionDevices });
      primaryCable.protectiveDevice = primaryProtection.selected; primaryCable.protectiveDeviceCandidates = primaryProtection.candidates;
      transformer.primaryProtectiveDevice = primaryProtection.selected;
      if (!primaryProtection.selected || Number(primaryProtection.selected.continuousCurrentA ?? primaryProtection.selected.tripRatingA) > transformer.primaryMaxOcpA + EPS) issues.push(issue('TRANSFORMER_PRIMARY_PROTECTION_BLOCKED', 'No selected primary device is demonstrated within the sourced transformer primary overcurrent ceiling.', 'blocking', primaryCable.id));
      if (primaryProtection.issues.length) issues.push(...primaryProtection.issues.map(item => ({ ...item, path: primaryCable.id })));
      const secondaryCurrent = transformer.requiredKVA * 1000 / (Math.sqrt(3) * transformer.secondaryVoltageVac);
      const secondaryMainCable = { id: `M-${transformer.id}-SEC`, phases: 3, operating_voltage: transformer.secondaryVoltageVac, currentA: secondaryCurrent, ampacityA: transformer.secondaryMaxOcpA, protectiveRequirement: { ampereRatingA: secondaryCurrent * 1.25 } };
      const secondarySupply = { ...source, voltage: transformer.secondaryVoltageVac, phases: 3, availableFaultCurrentKA: transformer.secondaryFault.availableFaultCurrentKA };
      const secondaryMain = selectProtectiveDevice({ cable: secondaryMainCable, supply: secondarySupply, basis: { operatingVoltageVac: transformer.secondaryVoltageVac, phases: 3, frequencyHz: Number(source.frequencyHz || 60), requiredCurrentA: secondaryCurrent * 1.25, conductorAmpacityA: transformer.secondaryMaxOcpA, maximumRatingA: transformer.secondaryMaxOcpA, availableFaultCurrentKA: secondarySupply.availableFaultCurrentKA, faultBasis: transformer.secondaryFault.method, faultTypes: transformer.secondaryFault.faultTypes, provenance: transformer.secondaryFault.provenance }, deviceVoltageApplicabilityById, devices: protectionDevices });
      transformer.secondaryMainRequirement = secondaryMainCable.protectiveRequirement; transformer.secondaryMainDevice = secondaryMain.selected; transformer.secondaryMainCandidates = secondaryMain.candidates;
      if (!secondaryMain.selected) issues.push(issue('TRANSFORMER_SECONDARY_MAIN_PROTECTION_BLOCKED', 'A single aggregate secondary main at transformer terminals is required; no screening device satisfies total design current, conductor limit, voltage and fault bound.', 'blocking', transformer.id));
      if (secondaryMain.issues.length) issues.push(...secondaryMain.issues.map(item => ({ ...item, path: transformer.id })));
    };
    if (internalOptions.prioritizeTransformerPrimary && !issues.some(item => item.severity === 'blocking')) reserveTransformerPrimary();
    if (!issues.some(item => item.severity === 'blocking')) routeGroups.forEach(group => {
      const location = [...graph.nodes.values()].sort((a, b) => {
        const score = node => group.loads.reduce((sum, load) => sum + distance(node, load), 0);
        return score(a) - score(b) || String(a.id).localeCompare(String(b.id));
      })[0] || group.loads[0];
      const panelId = group.id;
      const automaticLocation = { x: location.x, y: location.y, z: location.z };
      const override = overrideValidation.normalized[panelId.toLowerCase()];
      const locationDecision = applyPanelLocationOverride(null, automaticLocation, override);
      const panel = { id: panelId, tag: panelId, voltage: group.voltage, phases: group.phases, x: locationDecision.effectiveLocation.x, y: locationDecision.effectiveLocation.y, z: locationDecision.effectiveLocation.z, loadKva: group.totalKva, loadIds: group.loads.map(load => load.id), ...(locationDecision.metadata ? { locationOverride: locationDecision.metadata } : {}), protectiveRequirement: { type: 'main', minimumContinuousRatingA: null, status: 'screening-requirement' } };
      panelLocationOverrides.push({ panelId, requestedLocation: override ? { x: override.x, y: override.y, z: override.z } : null, automaticLocation, effectiveLocation: locationDecision.effectiveLocation, status: locationDecision.status, ...(override?.note === undefined ? {} : { note: override.note }) });
      for (const load of group.loads) load.panelRef = panel.id;
      const pf = group.loads.reduce((sum, load) => sum + load.kw, 0) / Math.max(group.loads.reduce((sum, load) => sum + load.kva, 0), EPS);
      const feederCurrent = current(group.loads.reduce((sum, load) => sum + load.kw, 0), group.voltage, group.phases, pf);
      const transformerFed = Boolean(transformer && group.voltage === transformer.secondaryVoltageVac);
      const groupSupply = transformerFed ? { ...source, voltage: group.voltage, phases: 3, availableFaultCurrentKA: transformer.secondaryFault.availableFaultCurrentKA } : source;
      const feederOperatingFloor = Number(operatingCurrentFloors[`F-${panel.id}`]) || 0;
      const feederDesignAmpacity = group.loads.reduce((sum, load) => {
        const currentFloor = (load.currentA || 0) * (load.duty === 'continuous' ? 1.25 : 1);
        return sum + Math.max(currentFloor, Number(load.designAmpacityA) || 0);
      }, 0);
      const feederRequiredAmpacity = Math.max(feederCurrent * 1.25, feederOperatingFloor * 1.25, feederDesignAmpacity);
      const inheritedFeederFloor = group.loads.map(load => feederFloorByLoad[String(load.id)]).filter(Boolean)
        .reduce((floor, candidate) => !floor || NEC_AMPACITY_TABLE.findIndex(row => row.size === candidate) > NEC_AMPACITY_TABLE.findIndex(row => row.size === floor) ? candidate : floor, null);
      const feederCriteria = { ...criteria, minimumConductorSize: conductorSizeFloors[`F-${panel.id}`] || inheritedFeederFloor || undefined, minimumConductorAmpacity: Math.max(feederRequiredAmpacity, minimumProtectedAmpacity(feederRequiredAmpacity, groupSupply, protectionDevices, deviceVoltageApplicabilityById)) };
      const transformerNode = transformerFed ? graph.nodes.get(transformer.routeNodeId) : null;
      const feederFrom = transformerFed ? { ...transformer, x: transformerNode.x, y: transformerNode.y, z: transformerNode.z, id: transformer.secondaryBusId, tag: transformer.tag } : source;
      const panelRouteSelection = buildFeasibleRoute(graph, feederFrom, locationDecision.effectiveLocation, finite(criteria.maxEndpointAttachmentFt) ? n(criteria.maxEndpointAttachmentFt) : 25, issues, `panel.${panel.id}`, { current: feederCurrent, designAmpacityA: feederDesignAmpacity, voltage: group.voltage, phases: group.phases, powerFactor: pf, duty: 'continuous' }, feederCriteria, feederCriteria.minimumConductorAmpacity, capacityReservations);
      const panelRoute = panelRouteSelection.route;
      panel.routingDecision = panelRouteSelection.decision;
      panel.routeResult = panelRoute; panels.push(panel); routeResults.push({ id: `route-${panel.id}`, from: feederFrom.id || 'SOURCE', to: panel.id, ...panelRoute });
      const feederThermal = evaluateDesignSynthesisRouteThermal({ route: panelRoute, edges: graph.edges, criteria, temperatureRating: criteria.temperatureRatingC || 75 });
      const selectedFeederCriteria = { ...feederCriteria, minimumConductorSize: panelRouteSelection.decision.selectedConductorSize || feederCriteria.minimumConductorSize };
      const selectedFeederSize = panelRoute.status === 'routed' ? conductorSizing({ current: feederCurrent, designAmpacityA: feederDesignAmpacity, voltage: group.voltage, phases: group.phases, powerFactor: pf, duty: 'continuous' }, selectedFeederCriteria, panelRoute.lengthFt, feederThermal) : { size: null, violation: 'Route unavailable', thermalAssessment: feederThermal };
      panelLocationOverrides[panelLocationOverrides.length - 1].status = panelRoute.status === 'routed' && Boolean(selectedFeederSize.size) ? 'evaluated' : 'blocked';
      const feeder = { id: `F-${panel.id}`, tag: `F-${panel.id}`, from_tag: feederFrom.tag || feederFrom.id || 'SOURCE', to_tag: panel.tag, from: feederFrom.id || 'SOURCE', to: panel.id, ...sourcedCableImpedance(selectedFeederSize.size), currentA: feederCurrent, est_load: feederCurrent, ...(group.loads.some(load => load.motor) ? { designAmpacityA: feederDesignAmpacity } : {}), length: panelRoute.lengthFt ?? null, lengthFt: panelRoute.lengthFt ?? null, operating_voltage: group.voltage, conductorMaterial: criteria.conductorMaterial || 'copper', conductor_size: selectedFeederSize.size, conductorSize: selectedFeederSize.size, ampacityA: selectedFeederSize.ampacity || null, voltageDropPct: selectedFeederSize.voltageDrop || null, thermalAssessment: selectedFeederSize.thermalAssessment || feederThermal, routingDecision: panelRouteSelection.decision, sizingStatus: selectedFeederSize.size ? 'screening-sized' : 'blocked', sizingBasis: selectedFeederSize.sizingBasis || 'NEC_AMPACITY_TABLE', transformerSide: transformerFed ? 'secondary' : undefined, protectiveRequirement: { minimumInterruptingRating: 'Verify from available fault current study', ampereRatingA: selectedFeederSize.requiredAmps || null, status: 'screening-requirement' } };
      if (group.loads.some(load => load.motor)) feeder.protectiveRequirement.ampereRatingA = Math.max(feeder.protectiveRequirement.ampereRatingA || 0, feederDesignAmpacity);
      feeder.routeThermalAmpacity = selectedFeederSize.limitingAmpacityA || null;
      if (feeder.thermalAssessment.status === 'blocked') issues.push(issue('ROUTE_THERMAL_BLOCKED', 'Feeder route has no valid positive thermal ampacity factor.', 'blocking', feeder.id));
      if (!selectedFeederSize.size) issues.push(issue('CABLE_AMPACITY_NOT_SATISFIED', `No feeder conductor satisfies route thermal ampacity, protective minimum, and voltage-drop limits: ${selectedFeederSize.violation || 'unspecified screening failure'}.`, 'blocking', feeder.id));
      const feederDrop = selectedFeederSize.size ? voltageDropPct({ current: feederCurrent, voltage: group.voltage, phases: group.phases, powerFactor: pf }, selectedFeederSize.size, panelRoute.lengthFt, criteria) : { value: null, status: 'unevaluated' };
      feeder.voltageDropPct = feederDrop.value; feeder.voltageDropStatus = feederDrop.status; feeder.voltageDropSource = feederDrop.source || null;
      cables.push(feeder); oneLine.panels.push(panel.id); oneLine.feeders.push(feeder.id);
      reserveCapacityRoute(capacityReservations, panelRoute, selectedFeederSize.size, feeder.id);
      if (Number(operatingCurrentFloors[feeder.id]) > 0) feeder.protectiveRequirement.ampereRatingA = Math.max(feeder.protectiveRequirement.ampereRatingA || 0, Number(operatingCurrentFloors[feeder.id]) * 1.25);
      { const protection = selectProtectiveDevice({ cable: feeder, supply: groupSupply, basis: transformerFed ? { operatingVoltageVac: group.voltage, phases: 3, frequencyHz: Number(source.frequencyHz || 60), requiredCurrentA: feeder.protectiveRequirement.ampereRatingA, conductorAmpacityA: feeder.ampacityA, availableFaultCurrentKA: groupSupply.availableFaultCurrentKA, faultBasis: transformer.secondaryFault.method, faultTypes: transformer.secondaryFault.faultTypes, provenance: transformer.secondaryFault.provenance } : undefined, deviceVoltageApplicabilityById, devices: protectionDevices }); feeder.protectiveDevice = protection.selected; feeder.protectiveDeviceCandidates = protection.candidates; if (protection.issues.length) issues.push(...protection.issues.map(item => ({ ...item, path: feeder.id }))); }
      const routeLoads = [...group.loads].sort((left, right) => (routePriority.get(String(left.id)) ?? Number.MAX_SAFE_INTEGER) - (routePriority.get(String(right.id)) ?? Number.MAX_SAFE_INTEGER));
      for (const load of routeLoads) {
        const loadCurrent = current(load.kw, load.voltage, load.phases, load.powerFactor);
        const usesBranchBreakerResearch = Boolean(load.motor && motorBranchProtectionMethod === 'inverse-time-breaker');
        const branchOperatingFloor = Number(operatingCurrentFloors[`C-${load.id}`]) || 0;
        const branchBreakerResult = motorBranchBreakerEvaluations.get(String(load.id));
        const branchBreakerCandidate = usesBranchBreakerResearch ? branchBreakerResult?.candidate : null;
        const branchBreakerFloorA = Number(branchBreakerCandidate?.branchCircuitBreaker?.fixedOverloadPickupA) || 0;
        const motorDesignAmpacityA = Number(load.designAmpacityA) || 0;
        const branchDesignAmpacity = Math.max(loadCurrent * (load.duty === 'continuous' ? 1.25 : 1), motorDesignAmpacityA, branchOperatingFloor * (load.duty === 'continuous' ? 1.25 : 1), branchBreakerFloorA);
        const branchProtectedAmpacityFloor = usesBranchBreakerResearch
          ? branchDesignAmpacity
          : minimumProtectedAmpacity(branchDesignAmpacity, groupSupply, protectionDevices, deviceVoltageApplicabilityById);
        const residualCriteria = { ...criteria, minimumConductorSize: conductorSizeFloors[`C-${load.id}`] || undefined, minimumConductorAmpacity: branchProtectedAmpacityFloor, voltageDropLimitPct: Math.max(0, ((criteria.voltageDropLimitPct ?? 3) - (Number.isFinite(feeder.voltageDropPct) ? feeder.voltageDropPct : 0)) / 2) };
        const loadRouteSelection = buildFeasibleRoute(graph, locationDecision.effectiveLocation, load, finite(criteria.maxEndpointAttachmentFt) ? n(criteria.maxEndpointAttachmentFt) : 25, issues, `load.${load.id}`, { current: loadCurrent, designAmpacityA: branchDesignAmpacity, voltage: load.voltage, phases: load.phases, powerFactor: load.powerFactor, duty: load.duty }, residualCriteria, residualCriteria.minimumConductorAmpacity, capacityReservations);
        const loadRoute = loadRouteSelection.route;
        const loadThermal = evaluateDesignSynthesisRouteThermal({ route: loadRoute, edges: graph.edges, criteria, temperatureRating: criteria.temperatureRatingC || 75 });
        const selectedRouteCriteria = { ...residualCriteria, minimumConductorSize: loadRouteSelection.decision.selectedConductorSize || residualCriteria.minimumConductorSize };
        const selectedSize = loadRoute.status === 'routed' ? conductorSizing({ current: loadCurrent, designAmpacityA: branchDesignAmpacity, voltage: load.voltage, phases: load.phases, powerFactor: load.powerFactor, duty: load.duty }, selectedRouteCriteria, loadRoute.lengthFt, loadThermal) : { size: null, violation: 'Route unavailable', thermalAssessment: loadThermal };
        const cable = { id: `C-${load.id}`, tag: `C-${load.id}`, from_tag: panel.tag, to_tag: load.tag, from: panel.id, to: load.id, loadId: load.id, ...sourcedCableImpedance(selectedSize.size), currentA: loadCurrent, est_load: loadCurrent, ...(load.motor ? { designCurrentA: load.designCurrentA, designAmpacityA: branchDesignAmpacity, motor: { id: load.id, fullLoadCurrentA: load.motor.fullLoadCurrentA, designAmpacityA: motorDesignAmpacityA, fullLoadCurrentBasis: structuredClone(load.motor.fullLoadCurrentBasis), nameplateCurrentA: load.motor.nameplateCurrentA, lockedRotorCurrentA: load.motor.lockedRotorCurrentA, lockedRotorPowerFactor: load.motor.lockedRotorPowerFactor, starterType: load.motor.starterType, rotorType: load.motor.rotorType, overloadProtectionStatus: 'unresolved', shortCircuitAndGroundFaultCoordinationStatus: 'unresolved', ...(motorBranchProtectionMethod === 'inverse-time-breaker' ? { branchProtectionMethod: motorBranchProtectionMethod, branchBreakerAmpacityFloorA: branchBreakerFloorA || null, ...(branchOperatingFloor > 0 ? { branchBreakerOperatingCurrentA: branchOperatingFloor, branchBreakerOperatingCurrentReference: 'Prior balanced load-flow circuit current retained as a monotonic operating-current floor during bounded design revision; it is not motor nameplate data.' } : {}), branchBreakerCandidate: branchBreakerCandidate ? { catalogNumber: branchBreakerCandidate.branchCircuitBreaker.catalogNumber, fixedIrA: branchBreakerCandidate.branchCircuitBreaker.fixedOverloadPickupA, researchStatus: 'candidate', libraryStatus: 'screening', selectedForApply: false } : null } : {}) } } : {}), length: loadRoute.lengthFt ?? null, lengthFt: loadRoute.lengthFt ?? null, operating_voltage: load.voltage, conductorMaterial: criteria.conductorMaterial || 'copper', conductor_size: selectedSize.size, conductorSize: selectedSize.size, ampacityA: selectedSize.ampacity || null, voltageDropPct: selectedSize.voltageDrop || null, thermalAssessment: selectedSize.thermalAssessment || loadThermal, routingDecision: loadRouteSelection.decision, sizingStatus: selectedSize.size ? 'screening-sized' : 'blocked', sizingBasis: load.motor ? (motorBranchProtectionMethod === 'inverse-time-breaker' ? 'NEC_AMPACITY_TABLE plus Southwire SPEC45301; retains 125% referenced motor FLC floor and also screens against the exact candidate breaker fixed Ir after route/terminal derating' : 'NEC_AMPACITY_TABLE plus Southwire SPEC45301; motor branch design current is 125% of referenced full-load current') : (selectedSize.sizingBasis || 'NEC_AMPACITY_TABLE'), protectiveRequirement: { ampereRatingA: selectedSize.requiredAmps || null, minimumInterruptingRating: 'Verify from available fault current study', status: load.motor ? (motorBranchProtectionMethod === 'inverse-time-breaker' ? 'motor-branch-breaker-research-unresolved' : 'motor-coordination-unresolved') : 'screening-requirement' } };
        cable.routeThermalAmpacity = selectedSize.limitingAmpacityA || null;
        if (cable.thermalAssessment.status === 'blocked') issues.push(issue('ROUTE_THERMAL_BLOCKED', 'Branch route has no valid positive thermal ampacity factor.', 'blocking', cable.id));
        if (!selectedSize.size) issues.push(issue('CABLE_AMPACITY_NOT_SATISFIED', `No branch conductor satisfies route thermal ampacity, protective minimum, and voltage-drop limits: ${selectedSize.violation || 'unspecified screening failure'}.`, 'blocking', cable.id));
        const branchDrop = selectedSize.size ? voltageDropPct({ current: loadCurrent, voltage: load.voltage, phases: load.phases, powerFactor: load.powerFactor }, selectedSize.size, loadRoute.lengthFt, criteria) : { value: null, status: 'unevaluated' };
        cable.voltageDropPct = branchDrop.value; cable.voltageDropStatus = branchDrop.status; cable.voltageDropSource = branchDrop.source || null;
        cables.push(cable); routeResults.push({ id: `route-${load.id}`, from: panel.id, to: load.id, ...loadRoute });
        reserveCapacityRoute(capacityReservations, loadRoute, selectedSize.size, cable.id);
        if (Number(operatingCurrentFloors[cable.id]) > 0) cable.protectiveRequirement.ampereRatingA = Math.max(cable.protectiveRequirement.ampereRatingA || 0, Number(operatingCurrentFloors[cable.id]) * (load.duty === 'continuous' ? 1.25 : 1));
        if (usesBranchBreakerResearch) {
          cable.branchProtectionMethod = motorBranchProtectionMethod;
          cable.branchCircuitBreakerAmpacityFloorA = branchBreakerFloorA || null;
          cable.protectiveDevice = motorBranchBreakerAdapter(branchBreakerCandidate, load.id);
          cable.protectiveDeviceCandidates = branchBreakerResult?.candidates?.map(item => ({ manufacturer: item.manufacturer, catalogNumber: item.branchCircuitBreaker?.catalogNumber, researchStatus: item.researchStatus, libraryStatus: item.libraryStatus, selectedForApply: false, checks: item.checks.filter(check => check.id === 'inverseTimeBreakerSizing' || check.id === 'certificateBreakerMaximum') })) || [];
          if (!branchBreakerCandidate) cable.protectiveRequirement.status = 'branch-breaker-selection-unresolved';
        } else {
          const protection = selectProtectiveDevice({ cable, supply: groupSupply, basis: transformerFed ? { operatingVoltageVac: load.voltage, phases: 3, frequencyHz: Number(source.frequencyHz || 60), requiredCurrentA: cable.protectiveRequirement.ampereRatingA, conductorAmpacityA: cable.ampacityA, availableFaultCurrentKA: groupSupply.availableFaultCurrentKA, faultBasis: transformer.secondaryFault.method, faultTypes: transformer.secondaryFault.faultTypes, provenance: transformer.secondaryFault.provenance } : undefined, deviceVoltageApplicabilityById, devices: protectionDevices });
          cable.protectiveDevice = protection.selected;
          cable.protectiveDeviceCandidates = protection.candidates;
          if (protection.issues.length) issues.push(...protection.issues.map(item => ({ ...item, path: cable.id })));
        }
      }
    });
    const panelOrder = new Map(groups.map((group, index) => [group.id, index]));
    panels.sort((left, right) => panelOrder.get(left.id) - panelOrder.get(right.id));
    panelLocationOverrides.sort((left, right) => panelOrder.get(left.panelId) - panelOrder.get(right.panelId));
    if (!internalOptions.prioritizeTransformerPrimary) reserveTransformerPrimary();
    const occupied = new Set([source.id, ...normalizedLoads.flatMap(load => [load.id, load.tag])].filter(Boolean).map(value => String(value).toLowerCase()));
    for (const panel of panels) if (occupied.has(String(panel.id).toLowerCase()) || occupied.has(String(panel.tag).toLowerCase())) issues.push(issue('GENERATED_ID_COLLISION', `Generated panel ${panel.id} collides with an input identity or tag.`, 'blocking', 'panels'));
    if (transformer) for (const generatedId of [transformer.id, transformer.primaryBusId, transformer.secondaryBusId, transformer.tag]) if (occupied.has(String(generatedId).toLowerCase())) issues.push(issue('GENERATED_ID_COLLISION', `Generated transformer identity ${generatedId} collides with an input identity or tag.`, 'blocking', 'transformer'));
    for (const branch of cables.filter(cable => cable.loadId)) {
      const feeder = cables.find(cable => cable.to === branch.from && !cable.loadId);
      branch.combinedVoltageDropPct = Number.isFinite(feeder?.voltageDropPct) && Number.isFinite(branch.voltageDropPct) ? feeder.voltageDropPct + branch.voltageDropPct : null;
      branch.combinedVoltageDropStatus = Number.isFinite(branch.combinedVoltageDropPct) ? (branch.combinedVoltageDropPct <= (criteria.voltageDropLimitPct ?? 3) + EPS ? 'pass' : 'fail') : 'unevaluated';
    }
  }
  // Rebuild reservations when a branch, panel feeder, or transformer primary needs a scarce corridor
  // already occupied by flexible circuits. Never reuse partial routes or relax
  // fill, conductor, voltage, or installation checks.
  if (!internalOptions.skipCapacityRetry) {
    const capacityBlockedIds = value => (value || []).filter(cable => cable.loadId && cable.routingDecision?.status === 'no-feasible-route' && cable.routingDecision?.capacityExcludedEdgeIds?.length).map(cable => String(cable.loadId));
    const capacityBlockedPanels = (value, panelRows) => {
      const panelIds = new Set((panelRows || []).map(panel => String(panel.id)));
      return (value || []).filter(cable => !cable.loadId && panelIds.has(String(cable.to)) && cable.routingDecision?.status === 'no-feasible-route' && cable.routingDecision?.capacityExcludedEdgeIds?.length).map(cable => String(cable.to));
    };
    const capacityBlockedPrimary = value => (value || []).some(cable => cable.transformerSide === 'primary' && cable.routingDecision?.status === 'no-feasible-route' && cable.routingDecision?.capacityExcludedEdgeIds?.length);
    const retryIsUsable = candidate => {
      if (!candidate?.cables?.length || !candidate.cables.every(cable => cable.routingDecision?.status === 'feasible')) return false;
      if (candidate.status === 'proposal') return true;
      const blockers = (candidate.issues || []).filter(item => item.severity === 'blocking');
      if (!blockers.length || blockers.some(item => item.code !== 'EXISTING_TRAY_RECONCILIATION_UNRESOLVED')) return false;
      // A missing reuse qualification must still block Apply, but it need not
      // suppress a complete physical screening route for the engineer to review.
      return ['routesPermitted', 'voltageDrop', 'racewayCapacity', 'installationCoverage', 'routeThermalAmpacity'].every(id => candidate.checks?.find(check => check.id === id)?.status === 'pass');
    };
    let pending = capacityBlockedIds(cables);
    let pendingPanels = capacityBlockedPanels(cables, panels);
    let pendingPrimary = capacityBlockedPrimary(cables);
    const priority = [];
    const priorityPanels = [];
    let prioritizePrimary = false;
    for (let attempt = 0; (pending.length || pendingPanels.length || pendingPrimary) && attempt < 8; attempt += 1) {
      const newIds = pending.filter(id => !priority.includes(id)).sort();
      const newPanels = pendingPanels.filter(id => !priorityPanels.includes(id)).sort();
      const newPrimary = pendingPrimary && !prioritizePrimary;
      if (!newIds.length && !newPanels.length && !newPrimary) break;
      priority.push(...newIds);
      priorityPanels.push(...newPanels);
      prioritizePrimary ||= newPrimary;
      const options = { ...internalOptions, routePriorityIds: priority, routePriorityPanelIds: priorityPanels, prioritizeTransformerPrimary: prioritizePrimary, skipCapacityRetry: true };
      const trial = generateDesignProposalInternal(originalInput, { ...options, skipStudy: true });
      pending = capacityBlockedIds(trial.cables);
      pendingPanels = capacityBlockedPanels(trial.cables, trial.panels);
      pendingPrimary = capacityBlockedPrimary(trial.cables);
      if (retryIsUsable(trial)) {
        const selected = internalOptions.skipStudy ? trial : generateDesignProposalInternal(originalInput, options);
        if (retryIsUsable(selected)) {
          const panelPriority = panel => {
            const feederPosition = priorityPanels.indexOf(String(panel.id));
            return feederPosition >= 0 ? feederPosition : Math.min(Number.MAX_SAFE_INTEGER, ...panel.loadIds.map(id => { const position = priority.indexOf(String(id)); return position < 0 ? Number.MAX_SAFE_INTEGER : priorityPanels.length + position; }));
          };
          const panelOrder = [...selected.panels].sort((left, right) => panelPriority(left) - panelPriority(right));
          const groupOrderChanged = panelOrder.some((panel, index) => panel.id !== selected.panels[index].id);
          const prioritizedPrimary = prioritizePrimary ? selected.cables.find(cable => cable.transformerSide === 'primary')?.id : null;
          selected.routingRetry = { method: prioritizedPrimary ? 'prioritize-capacity-blocked-transformer-primary-v4' : priorityPanels.length ? 'prioritize-capacity-blocked-feeders-v3' : groupOrderChanged ? 'prioritize-capacity-blocked-panel-groups-v2' : 'prioritize-capacity-blocked-branches-v1', attempts: attempt + 1, prioritizedLoadIds: [...priority], ...(prioritizedPrimary ? { prioritizedTransformerPrimaryId: prioritizedPrimary } : {}), ...(priorityPanels.length ? { prioritizedFeederPanelIds: [...priorityPanels] } : {}), ...(groupOrderChanged ? { prioritizedPanelIds: panelOrder.filter(panel => panelPriority(panel) < Number.MAX_SAFE_INTEGER).map(panel => panel.id) } : {}), limitation: 'Bounded deterministic reorder; not a proof of global routing feasibility.' };
          selected.decisions.push(`Capacity routing recovered after ${attempt + 1} bounded reservation-order trial(s); prioritized loads: ${priority.join(', ') || 'none'}; prioritized panel feeders: ${priorityPanels.join(', ') || 'none'}; prioritized transformer primary: ${prioritizedPrimary || 'none'}. The result does not prove global optimality.`);
          return selected;
        }
        break;
      }
    }
  }
  const blocking = issues.filter(item => item.severity === 'blocking');
  const checks = [
    { id: 'inputCompleteness', status: blocking.length === 0 ? 'pass' : 'fail', evidence: { blockingIssueCount: blocking.length } },
    { id: 'sourceCapacity', status: panels.length ? (panels.reduce((sum, panel) => sum + panel.loadKva, 0) <= n(source.capacityKva) + EPS ? 'pass' : 'fail') : 'unevaluated', evidence: { proposedKva: panels.reduce((sum, panel) => sum + panel.loadKva, 0), sourceKva: source.capacityKva } },
    { id: 'routesPermitted', status: routeResults.length ? (routeResults.every(result => result.status === 'routed') ? 'pass' : 'fail') : 'unevaluated', evidence: { routeCount: routeResults.length } },
    { id: 'voltageDrop', status: cables.length && cables.every(cable => cable.sizingStatus === 'screening-sized' && (cable.loadId ? cable.combinedVoltageDropStatus === 'pass' : Number.isFinite(cable.voltageDropPct) && cable.voltageDropPct <= (criteria.voltageDropLimitPct ?? 3) + EPS)) ? 'pass' : (cables.length ? 'fail' : 'unevaluated'), evidence: { limitPct: criteria.voltageDropLimitPct ?? 3, evaluatedCableCount: cables.filter(cable => cable.loadId ? cable.combinedVoltageDropStatus !== 'unevaluated' : Number.isFinite(cable.voltageDropPct)).length } },
  ];
  const check = id => checks.find(item => item.id === id)?.status;
  if (check('voltageDrop') !== 'pass') issues.push(issue('VOLTAGE_DROP_NOT_PASSED', 'Combined source-to-panel-to-load voltage drop is not fully evaluated and passing.', 'blocking', 'cables'));
  if (check('sourceCapacity') === 'fail') issues.push(issue('SOURCE_CAPACITY_EXCEEDED', 'Proposed panel load exceeds source capacity.', 'blocking', 'supply.capacityKva'));
  if (check('routesPermitted') === 'fail') issues.push(issue('ROUTE_CHECK_FAILED', 'One or more feeders could not be routed on permitted corridors.', 'blocking', 'corridors'));
  const terminalBuses = transformer ? [
    { id: transformer.primaryBusId, tag: transformer.primaryBusId, type: 'bus', voltage: transformer.primaryVoltageVac, phases: 3, x: transformer.x, y: transformer.y, z: transformer.z, transformerId: transformer.id, terminalSide: 'primary' },
    { id: transformer.secondaryBusId, tag: transformer.secondaryBusId, type: 'bus', voltage: transformer.secondaryVoltageVac, phases: 3, x: transformer.x, y: transformer.y, z: transformer.z, transformerId: transformer.id, terminalSide: 'secondary' },
  ] : [];
  const equipmentRecords = [{ ...source, id: source.id || 'SOURCE', tag: source.tag || source.id || 'SOURCE', type: 'source' }, ...terminalBuses, ...(transformer ? [{ ...transformer, type: 'transformer' }] : []), ...panels.map(panel => ({ ...panel, type: 'panel' })), ...normalizedLoads.map(load => ({ ...load, type: 'load' }))];
  const edgeById = new Map(graph.edges.map(edge => [edge.id, edge]));
  const canonicalRoutes = routeResults.map(result => {
    const cable = cables.find(item => item.from === result.from && item.to === result.to);
    const fromRecord = equipmentRecords.find(item => item.id === result.from) || source;
    const toRecord = equipmentRecords.find(item => item.id === result.to) || normalizedLoads.find(item => item.id === result.to);
    const segments = [];
    const firstNode = graph.nodes.get(result.nodeIds?.[0]); const lastNode = graph.nodes.get(result.nodeIds?.[result.nodeIds.length - 1]);
    if (firstNode && result.sourceAttachmentFt > 0) segments.push({ type: 'field', endpointRole: 'source', segmentId: 'field-source', tray_id: 'Field Route', raceway_id: null, start: [fromRecord.x, fromRecord.y, fromRecord.z], end: [firstNode.x, firstNode.y, firstNode.z], length: result.sourceAttachmentFt });
    for (const [index, edgeId] of (result.edgeIds || []).entries()) { const edge = edgeById.get(edgeId); const fromNode = graph.nodes.get(result.nodeIds[index]); const toNode = graph.nodes.get(result.nodeIds[index + 1]); segments.push({ type: 'tray', tray_id: edge.id, raceway_id: edge.id, start: [fromNode.x, fromNode.y, fromNode.z], end: [toNode.x, toNode.y, toNode.z], length: edge.length }); }
    if (lastNode && result.destinationAttachmentFt > 0) segments.push({ type: 'field', endpointRole: 'destination', segmentId: 'field-destination', tray_id: 'Field Route', raceway_id: null, start: [lastNode.x, lastNode.y, lastNode.z], end: [toRecord.x, toRecord.y, toRecord.z], length: result.destinationAttachmentFt });
    return { cable: cable?.tag || result.id, route_segments: segments, total_length: segments.reduce((sum, segment) => sum + segment.length, 0), status: result.status, from: result.from, to: result.to, thermalAssessment: cable?.thermalAssessment || null, routingDecision: cable?.routingDecision || null, installationCoverage: cable?.installationCoverage || null };
  });
  const racewayEvaluation = evaluateDesignSynthesisRaceways({ corridors: input.corridors, cables, routeResults: { batchResults: canonicalRoutes }, criteria });
  cables.splice(0, cables.length, ...racewayEvaluation.cables);
  trays.splice(0, trays.length, ...racewayEvaluation.trays);
  const conduits = racewayEvaluation.conduits || [];
  for (const routeResult of canonicalRoutes) {
    const generatedCable = cables.find(cable => cable.tag === routeResult.cable || cable.id === routeResult.cable);
    if (generatedCable) {
      routeResult.installationCoverage = generatedCable.installationCoverage ? { ...generatedCable.installationCoverage, segments: (generatedCable.installationCoverage.segments || []).map(segment => ({ ...segment })) } : null;
      const endpointBySegment = new Map((generatedCable.installationCoverage?.segments || []).filter(segment => segment.coverage === 'dedicated-emt' && segment.conduitId).map(segment => [segment.segmentId, segment.conduitId]));
      routeResult.route_segments = (routeResult.route_segments || []).map(segment => {
        const conduitId = endpointBySegment.get(segment.segmentId);
        return conduitId ? { ...segment, type: 'conduit', conduit_id: conduitId, raceway_id: conduitId, tray_id: undefined } : segment;
      });
    }
  }
  issues.push(...racewayEvaluation.issues);
  checks.push({ id: 'racewayCapacity', status: racewayEvaluation.issues.some(item => item.severity === 'blocking') ? 'fail' : (racewayEvaluation.installationComplete ? 'pass' : 'unevaluated'), evidence: { evaluationCount: racewayEvaluation.evaluations.length, assignedCableCount: racewayEvaluation.assignedCableCount } });
  checks.push({ id: 'installationCoverage', status: racewayEvaluation.installationComplete ? 'pass' : 'fail', evidence: { evaluatedCableCount: (racewayEvaluation.installationCoverage || []).filter(item => ['evaluated', 'not-needed'].includes(item.status)).length, cableCount: racewayEvaluation.installationCoverage?.length || 0 } });
  if (!racewayEvaluation.installationComplete) issues.push(issue('INSTALLATION_COVERAGE_NOT_PASSED', 'Every routed tray and endpoint segment requires evaluated installation coverage.', 'blocking', 'installationCoverage'));
  const thermalAmpacityEvaluated = cables.length > 0 && cables.every(cable => cable.sizingStatus === 'screening-sized' && Number.isFinite(cable.routeThermalAmpacity) && cable.routeThermalAmpacity > 0);
  checks.push({ id: 'routeThermalAmpacity', status: thermalAmpacityEvaluated ? 'pass' : (cables.length ? 'fail' : 'unevaluated'), evidence: { evaluatedCableCount: cables.filter(cable => Number.isFinite(cable.routeThermalAmpacity)).length, cableCount: cables.length, model: 'NEC-table-screening' } });
  if (!thermalAmpacityEvaluated && cables.length) issues.push(issue('ROUTE_THERMAL_AMPACITY_NOT_PASSED', 'Every routed feeder and branch must have a positive route-specific thermal ampacity.', 'blocking', 'cables'));
  for (const load of normalizedLoads) { const panel = panels.find(item => item.loadIds?.includes(load.id)); if (panel) { load.panelRef = panel.id; load.panelId = panel.id; load.source = panel.tag; } }
  const panelScheduleProjection = applyDesignSynthesisPanelSchedule({ loads: normalizedLoads, panels, cables });
  checks.push({ id: 'panelScheduleProjection', status: panelScheduleProjection.ok ? 'pass' : 'fail', evidence: panelScheduleProjection });
  if (!panelScheduleProjection.ok) {
    for (const projectionIssue of panelScheduleProjection.issues) {
      issues.push(issue(projectionIssue.code, `Panel ${projectionIssue.panelId || 'assignment'} could not receive a complete preliminary circuit-space assignment.`, 'blocking', `panels.${projectionIssue.panelId || 'unknown'}`, projectionIssue));
    }
  }
  for (const panel of panels) {
    const feeder = cables.find(cable => cable.to === panel.id);
    const mainRating = feeder?.protectiveDevice?.continuousCurrentA ?? feeder?.protectiveDevice?.tripRatingA ?? null;
    panel.fedFrom = feeder?.from_tag || feeder?.from || panel.fedFrom || '';
    panel.mainRating = mainRating == null ? '' : String(mainRating);
    panel.protectiveRequirement = {
      ...panel.protectiveRequirement,
      minimumContinuousRatingA: feeder?.protectiveRequirement?.ampereRatingA ?? null,
      mainRatingA: mainRating,
      busRatingA: mainRating,
      assemblySCCR: 'unevaluated',
      coordinationStatus: 'not-performed',
    };
  }
  for (const record of equipmentRecords) {
    const load = normalizedLoads.find(item => item.id === record.id);
    const panel = panels.find(item => item.id === record.id);
    if (load) {
      record.panelRef = load.panelRef;
      record.panelId = load.panelId;
      record.breaker = load.breaker;
      record.breakerPoles = load.breakerPoles;
      record.source = load.source;
      record.currentA = load.currentA;
    }
    if (panel) {
      // Panel Schedule's canonical panel collection owns the complete breaker
      // layout. Equipment stores the panel's shared identity/settings used by
      // project integration, avoiding a second copy of every circuit slot.
      for (const key of ['ref', 'fedFrom', 'mainRating', 'branchDeviceType', 'circuitCount', 'powerType', 'phases', 'poles', 'scheduleBasis', 'scheduleStatus']) {
        if (panel[key] !== undefined) record[key] = panel[key];
      }
      record.protectiveRequirement = panel.protectiveRequirement;
    }
  }
  const canonicalOneLine = buildDesignSynthesisOneLine({ supply: source, panels, loads: normalizedLoads, cables, transformers: transformer ? [transformer] : [], terminalBuses });
  const unresolvedResearchProtectionCount = cables.filter(cable => cable.branchProtectionMethod === 'inverse-time-breaker').length;
  checks.push({ id: 'protectiveDevices', status: unresolvedResearchProtectionCount === 0 && cables.every(cable => cable.protectiveDevice) ? 'pass' : 'fail', evidence: { evaluatedCount: cables.filter(cable => cable.protectiveDevice && cable.branchProtectionMethod !== 'inverse-time-breaker').length, researchCandidateCount: unresolvedResearchProtectionCount, circuitCount: cables.length, availableFaultCurrentKA: source.availableFaultCurrentKA ?? null } });
  let studyValidation = null;
  if (!internalOptions.skipStudy && !issues.some(item => item.severity === 'blocking')) {
    studyValidation = evaluateDesignSynthesisStudy({ equipment: equipmentRecords, loads: normalizedLoads, cables, inputs: { supply: source }, oneLine: canonicalOneLine }, criteria);
    const revisionOffset = Number.isSafeInteger(internalOptions.revisionOffset) && internalOptions.revisionOffset >= 0 ? internalOptions.revisionOffset : 0;
    if (revisionOffset && Array.isArray(studyValidation.history)) {
      studyValidation.history = studyValidation.history.map(item => ({ ...item, revision: (Number.isSafeInteger(item.revision) ? item.revision : 0) + revisionOffset }));
    }
    checks.push({ id: 'loadFlow', status: studyValidation.status === 'pass' ? 'pass' : 'fail', evidence: studyValidation.final || { status: studyValidation.status, issues: studyValidation.issues } });
    if (studyValidation.status !== 'pass') issues.push(...(studyValidation.issues || [{ code: 'LOAD_FLOW_LIMIT_FAILED', message: 'Automatic load-flow screening failed.', severity: 'blocking', path: 'studyValidation' }]));
  }
  if (!internalOptions.skipStudy && studyValidation && studyValidation.status === 'fail' && studyValidation.final?.converged === true && !studyValidation.issues?.some(item => ['LOAD_FLOW_NONCONVERGENCE', 'LOAD_FLOW_CIRCUIT_COVERAGE_FAILED'].includes(item.code)) && (criteria.loadFlow?.maxRevisions ?? 12) > 0) {
    const initialRevisionFloors = internalOptions.conductorSizeFloors || {};
    const initialOperatingFloors = internalOptions.operatingCurrentFloors || {};
    const initialRevisionOffset = Number.isSafeInteger(internalOptions.revisionOffset) && internalOptions.revisionOffset >= 0 ? internalOptions.revisionOffset : 0;
    const observedRevisionState = revisionFloorsForStudy({ cables, equipment: equipmentRecords }, studyValidation);
    let revisionState = {
      conductorSizeFloors: mergeConductorSizeFloors(initialRevisionFloors, observedRevisionState.conductorSizeFloors),
      operatingCurrentFloors: mergeOperatingCurrentFloors(initialOperatingFloors, observedRevisionState.operatingCurrentFloors),
    };
    const history = Array.isArray(studyValidation.history) && studyValidation.history.length
      ? [...studyValidation.history]
      : [{ revision: initialRevisionOffset, status: studyValidation.status, final: studyValidation.final }];
    let finalAttempt = null;
    let previousAttemptCables = cables;
    const initialCableSizes = new Map(cables.map(item => [String(item.id), item.conductor_size || null]));
    let stopReason = null;
    const maxRevisions = criteria.loadFlow?.maxRevisions ?? 12;
    let revision = initialRevisionOffset + 1;
    let transformerMinimumKVA = internalOptions.transformerMinimumKVA ?? transformer?.ratedKVA;
    const nonTransformerCircuitsPass = () => studyValidation.final?.circuits?.filter(circuit => circuit.type !== 'transformer').every(circuit => circuit.status === 'pass');
    const transformerCircuitFailed = studyValidation.final?.circuits?.some(circuit => circuit.type === 'transformer' && circuit.status === 'fail');
    if (transformer && (transformerCircuitFailed || (studyValidation.final?.buses?.some(bus => bus.status === 'fail') && nonTransformerCircuitsPass()))) {
      const currentCandidate = transformer.selectionCandidates?.find(candidate => candidate.profileId === transformer.profileId);
      let nextCandidate = transformer.selectionCandidates?.filter(candidate => candidate.eligible && candidate.ratedKVA > Number(currentCandidate?.ratedKVA || 0)).sort((a, b) => a.ratedKVA - b.ratedKVA)[0];
      if (!nextCandidate && transformerCircuitFailed) stopReason = 'no-eligible-transformer-profile';
      while (nextCandidate && revision <= maxRevisions) {
        const revised = generateDesignProposalInternal(originalInput, { ...internalOptions, skipStudy: true, transformerMinimumKVA: nextCandidate.ratedKVA });
        if (revised.status !== 'proposal') {
          history.push({ revision, status: 'blocked', transformerProfileId: nextCandidate.profileId, reason: 'transformer profile policy/selection prevented this network revision', selectionCandidates: transformer.selectionCandidates || [], issues: revised.issues });
          stopReason = 'transformer-profile-unavailable';
          finalAttempt = revised;
          break;
        }
        const revisedStudy = evaluateDesignSynthesisStudy(revised, userCriteria);
        history.push({ revision, status: revisedStudy.status, final: revisedStudy.final, transformerProfileId: revised.transformer?.profileId, selectionCandidates: revised.transformer?.selectionCandidates || [], reason: 'tested next eligible sourced transformer profile against the unchanged project study criteria' });
        revised.studyValidation = { ...revisedStudy, history };
        finalAttempt = revised;
        if (revisedStudy.status === 'pass') {
          revised.studyValidation.transformerProfileChanges = [{ from: transformer.profileId, to: revised.transformer.profileId }];
          const loadFlowCheck = revised.checks.find(checkItem => checkItem.id === 'loadFlow');
          if (loadFlowCheck) { loadFlowCheck.status = 'pass'; loadFlowCheck.evidence = revisedStudy.final; }
          else revised.checks.push({ id: 'loadFlow', status: 'pass', evidence: revisedStudy.final });
          return revised;
        }
        if (!revisedStudy.final?.converged || revisedStudy.issues?.some(item => ['LOAD_FLOW_NONCONVERGENCE', 'LOAD_FLOW_CIRCUIT_COVERAGE_FAILED'].includes(item.code))) {
          stopReason = revisedStudy.issues?.some(item => item.code === 'LOAD_FLOW_NONCONVERGENCE') ? 'nonconvergence' : 'coverage-failed';
          break;
        }
        revision += 1;
        transformerMinimumKVA = revised.transformer.ratedKVA;
        const observedRevisionState = revisionFloorsForStudy(revised, revisedStudy);
        revisionState = {
          conductorSizeFloors: mergeConductorSizeFloors(revisionState.conductorSizeFloors, observedRevisionState.conductorSizeFloors),
          operatingCurrentFloors: mergeOperatingCurrentFloors(revisionState.operatingCurrentFloors, observedRevisionState.operatingCurrentFloors),
        };
        const nextProfile = revised.transformer?.selectionCandidates?.filter(candidate => candidate.eligible && candidate.ratedKVA > revised.transformer.ratedKVA).sort((a, b) => a.ratedKVA - b.ratedKVA)[0];
        nextCandidate = nextProfile;
        previousAttemptCables = revised.cables;
        if (revision > maxRevisions) stopReason = 'revision-budget-exhausted';
      }
    }
    for (; !stopReason && revision <= maxRevisions && (Object.keys(revisionState.conductorSizeFloors).length || Object.keys(revisionState.operatingCurrentFloors).length); revision += 1) {
      const revised = generateDesignProposalInternal(originalInput, { ...internalOptions, skipStudy: true, transformerMinimumKVA, conductorSizeFloors: revisionState.conductorSizeFloors, operatingCurrentFloors: revisionState.operatingCurrentFloors });
      if (revised.status !== 'proposal') {
        const conductorChanges = revised.cables.map(nextCable => { const prior = previousAttemptCables.find(item => String(item.id) === String(nextCable.id)); return prior && prior.conductor_size !== nextCable.conductor_size ? { cableId: nextCable.id, from: prior.conductor_size || null, to: nextCable.conductor_size || null } : null; }).filter(Boolean);
        history.push({ revision, status: 'blocked', changedCircuitIds: conductorChanges.map(item => item.cableId), conductorChanges, reason: 'regenerated proposal became blocked', issues: revised.issues });
        stopReason = 'regeneration-blocked';
        revised.studyValidation = { status: 'unevaluated', method: 'balanced-load-flow-screening', history, stopReason: 'regeneration-blocked', issues: [{ code: 'LOAD_FLOW_REGENERATION_BLOCKED', message: 'A bounded revision could not regenerate an applicable design.', severity: 'blocking', path: 'studyValidation' }] };
        finalAttempt = revised;
        break;
      }
      const revisedStudy = evaluateDesignSynthesisStudy(revised, userCriteria);
      const conductorChanges = revised.cables.map(nextCable => {
        const prior = previousAttemptCables.find(item => String(item.id) === String(nextCable.id));
        return prior && prior.conductor_size !== nextCable.conductor_size ? { cableId: nextCable.id, from: prior.conductor_size || null, to: nextCable.conductor_size || null } : null;
      }).filter(Boolean);
      history.push({ revision, status: revisedStudy.status, final: revisedStudy.final, changedCircuitIds: conductorChanges.map(item => item.cableId), conductorChanges, reason: 'raised next sourced conductor candidate for operating study failure' });
      revised.studyValidation = { ...revisedStudy, history };
      const loadFlowCheck = revised.checks.find(checkItem => checkItem.id === 'loadFlow');
      if (loadFlowCheck) loadFlowCheck.status = revisedStudy.status === 'pass' ? 'pass' : 'fail';
      else revised.checks.push({ id: 'loadFlow', status: revisedStudy.status === 'pass' ? 'pass' : 'fail', evidence: revisedStudy.final || { status: revisedStudy.status, issues: revisedStudy.issues } });
      finalAttempt = revised;
      if (revisedStudy.status === 'pass') {
        revised.studyValidation.conductorChanges = revised.cables.map(cable => ({ cableId: cable.id, from: initialCableSizes.get(String(cable.id)) || null, to: cable.conductor_size || null })).filter(item => item.from !== item.to);
        return revised;
      }
      if (revisedStudy.status === 'unevaluated' || revisedStudy.issues?.some(item => item.code === 'LOAD_FLOW_NONCONVERGENCE' || item.code === 'LOAD_FLOW_CIRCUIT_COVERAGE_FAILED')) { stopReason = revisedStudy.issues?.some(item => item.code === 'LOAD_FLOW_NONCONVERGENCE') ? 'nonconvergence' : 'coverage-failed'; break; }
      const nextState = revisionFloorsForStudy(revised, revisedStudy);
      const merged = {
        conductorSizeFloors: mergeConductorSizeFloors(revisionState.conductorSizeFloors, nextState.conductorSizeFloors),
        operatingCurrentFloors: mergeOperatingCurrentFloors(revisionState.operatingCurrentFloors, nextState.operatingCurrentFloors),
      };
      if (JSON.stringify(merged) === JSON.stringify(revisionState)) break;
      revisionState = merged;
      previousAttemptCables = revised.cables;
    }
    studyValidation.history = history;
    studyValidation.conductorChanges = history.flatMap(item => Array.isArray(item.conductorChanges) ? item.conductorChanges : []);
    studyValidation.stopReason = stopReason || (finalAttempt?.status === 'blocked' ? 'regeneration-blocked' : history.length - 1 >= maxRevisions ? 'revision-budget-exhausted' : 'no-available-candidate');
    if (finalAttempt?.studyValidation) finalAttempt.studyValidation.stopReason = studyValidation.stopReason;
    issues.push(issue('LOAD_FLOW_REVISION_EXHAUSTED', `Automatic load-flow revision stopped: ${studyValidation.stopReason}.`, 'blocking', 'studyValidation'));
    if (finalAttempt && finalAttempt.studyValidation) {
      finalAttempt.studyValidation.conductorChanges = finalAttempt.cables.map(cable => ({ cableId: cable.id, from: initialCableSizes.get(String(cable.id)) || null, to: cable.conductor_size || null })).filter(item => item.from !== item.to);
      const finalIssues = [...(finalAttempt.issues || []), ...(finalAttempt.studyValidation.issues || []), issue('LOAD_FLOW_REVISION_EXHAUSTED', `Automatic load-flow revision stopped: ${studyValidation.stopReason}.`, 'blocking', 'studyValidation')];
      const finalDisposition = buildDesignSynthesisLoadDispositions(originalInput, { issues: finalIssues });
      finalAttempt.status = 'blocked';
      finalAttempt.issues = finalIssues;
      finalAttempt.globalBlockingIssues = finalDisposition.globalBlockingIssues;
      finalAttempt.loadDispositions = finalDisposition.loadDispositions;
      finalAttempt.distributionBaseline = null;
      finalAttempt.summary = { ...finalAttempt.summary, generatedLoadCount: 0, blockedCount: finalIssues.filter(item => item.severity === 'blocking').length };
      (finalAttempt.panelLocationOverrides || []).forEach(row => { if (row.requestedLocation) row.status = 'blocked'; });
      return finalAttempt;
    }
  }
  if (!internalOptions.skipStudy && studyValidation?.status && studyValidation.status !== 'pass' && !studyValidation.stopReason) {
    studyValidation.stopReason = studyValidation.issues?.some(item => item.code === 'LOAD_FLOW_NONCONVERGENCE') ? 'nonconvergence' : ((criteria.loadFlow?.maxRevisions ?? 12) === 0 ? 'revision-budget-exhausted' : 'no-available-candidate');
    issues.push(issue('LOAD_FLOW_REVISION_EXHAUSTED', `Automatic load-flow revision stopped: ${studyValidation.stopReason}.`, 'blocking', 'studyValidation'));
  }
  if (Array.isArray(input.corridors?.edges) && input.corridors.edges.some(edge => Object.prototype.hasOwnProperty.call(edge || {}, 'existingTray'))) {
    if (!internalOptions.projectTrayReuseEligible) issues.push(issue('EXISTING_TRAY_RECONCILIATION_UNRESOLVED', 'Existing tray occupancy is screened, but project tray identity or referenced thermal and installation evidence is incomplete; Apply is blocked.', 'blocking', 'corridors'));
    else assumptions.push('Existing-tray reuse relies on user-supplied, unverified thermal and installation references for both existing and proposed cables. The application does not independently establish existing-cable ampacity, field condition, supports, grounding, or segregation.');
  }
  const status = issues.some(item => item.severity === 'blocking') ? 'blocked' : 'proposal';
  if (status === 'blocked') {
    // An explicit panel location is only an evaluated decision when the full
    // dependent proposal remains applicable. Preserve its requested/effective
    // coordinates while making downstream route, sizing, protection, and
    // installation blockers visible at the placement decision itself.
    panelLocationOverrides.forEach(row => {
      if (row.requestedLocation) row.status = 'blocked';
    });
  }
  const disposition = buildDesignSynthesisLoadDispositions(originalInput, { issues, acceptedIds: status === 'proposal' ? normalizedLoads.map(load => load.id) : [] });
  const signature = stableSignature({ supply: input.supply, equipment: input.equipment, corridors: input.corridors, criteria: input.criteria, overrides: input.overrides, generationBaseline: input.generationBaseline, provenance: input.provenance, projectEquipmentAdoption: input.projectEquipmentAdoption?.bindingFingerprint || null, ...(input.projectTrayAdoption === undefined ? {} : { projectTrayAdoption: input.projectTrayAdoption?.bindingFingerprint || null }), ...(input.projectTrayReuseBinding === undefined ? {} : { projectTrayReuseBinding: input.projectTrayReuseBinding?.inputFingerprint || null }), cableCatalogFingerprint: SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT, transformerProfileRevision: transformer?.profileRevision || null, protectiveDevices: input.protectiveDevices ?? bundledDeviceSnapshot.records, distributionPartitionGroups: internalOptions.distributionPartitionGroups || null, ...(input.faultStudy === undefined ? {} : { faultStudy: input.faultStudy }), ...(input.faultScenarios === undefined ? {} : { faultScenarios: input.faultScenarios }), ...(input.faultEvolution === undefined ? {} : { faultEvolution: input.faultEvolution }), ...(input.cableFaultWithstand === undefined ? {} : { cableFaultWithstand: input.cableFaultWithstand }) });
  return { schemaVersion: '1.0.0', status, inputSignature: signature, distributionBaseline: status === 'proposal' ? distributionBaseline : null, studyValidation, inputEvidence, transformer, loadDispositions: disposition.loadDispositions, globalBlockingIssues: disposition.globalBlockingIssues, inputs: { supply: input.supply || null, criteria: userCriteria, corridorNodeCount: graph.nodes.size, corridorEdgeCount: graph.edges.length, original: input }, equipment: equipmentRecords, loads: normalizedLoads, panels, panelLocationOverrides, cables, trays, conduits, installationCoverage: racewayEvaluation.installationCoverage, racewayEvaluations: racewayEvaluation.evaluations, oneLine: canonicalOneLine, routeResults: { batchResults: canonicalRoutes }, checks, issues, assumptions: transformer ? [...assumptions, 'Mixed-voltage screening selects one 480 V delta to 208Y/120 V 3-phase transformer from the cited 2020 copper profile set. Positive-sequence magnitude only; catalog winding labels do not establish clock number or phase displacement. No-load core loss is included as a primary shunt using the published core-loss value; magnetizing current is unavailable and excluded.', 'Secondary symmetrical three-phase fault bound is an ideal nominal voltage-ratio transfer from the supplied primary source bound; transformer impedance is not credited. Ground-fault and asymmetrical interrupting duty are unevaluated.'] : assumptions, decisions, summary: { loadCount: normalizedLoads.length, suppliedLoadCount: originalInput.equipment.length, generatedLoadCount: status === 'proposal' ? normalizedLoads.length : 0, cableCount: cables.length, routedCount: routeResults.filter(result => result.status === 'routed').length, blockedCount: issues.filter(item => item.severity === 'blocking').length }, report: { intendedUse: 'screening-only', basis: transformer ? 'Mixed-voltage radial synthesis with sourced transformer profile, distinct primary/secondary feeder bases, permitted routing, and balanced positive-sequence magnitude-only load flow.' : 'Deterministic radial LV synthesis using NEC ampacity, sourced cable R/X data, governed screening-device records, and explicit endpoint installation coverage.', transformer, inputEvidence: 'Units and per-record provenance/default basis are retained in inputEvidence; source references are not independently verified.', endpointInstallationSource: ['https://www.wheatland.com/wp-content/uploads/2018/03/EMT-and-Conduit-Brochure.pdf', 'https://www.servicewire.com/ServiceWire/Resources/Customer-QA/Conduit-Fill.htm'], limitations: ['No short-circuit calculation, protection coordination, or device settings study are performed.', 'Endpoint screening excludes supports, bends, pulling tension, terminations, hazardous-location suitability, and installation clearances.', ...(motorValidation.motors.length ? ['Motor branch conductor design uses a referenced full-load current at 125%; DOL starting uses a balanced constant-impedance locked-rotor voltage screen. Acceleration, thermal starting withstand, overload coordination, and motor fault contribution are unevaluated.'] : []), ...(transformer ? ['Transformer fault basis is 3-phase symmetrical only with ground-fault and asymmetrical duty unevaluated; no vector-group phase displacement or magnetizing current is claimed.'] : [])] }, motorBranchBreakerEvaluationResults: [...motorBranchBreakerEvaluations.entries()].map(([motorId, result]) => ({ motorId, result })) };
}

function motorPathCableIds(proposal, motorId) {
  const cableRows = Array.isArray(proposal?.cables) ? proposal.cables : [];
  const transformers = (Array.isArray(proposal?.equipment) ? proposal.equipment : []).filter(item => String(item?.type || '').toLowerCase() === 'transformer');
  const sourceId = String((proposal?.equipment || []).find(item => String(item?.type || '').toLowerCase() === 'source')?.id || 'SOURCE');
  const ids = new Set(); const seen = new Set(); let cursor = String(motorId);
  while (cursor && cursor !== sourceId && !seen.has(cursor)) {
    seen.add(cursor);
    const transformer = transformers.find(item => String(item.secondaryBusId) === cursor);
    if (transformer) { cursor = String(transformer.primaryBusId); continue; }
    const cable = cableRows.find(item => String(item.to) === cursor || String(item.loadId) === cursor);
    if (!cable) break;
    ids.add(String(cable.id)); cursor = String(cable.from || '');
  }
  return [...ids];
}

function motorPathTransformerIds(proposal, motorId) {
  const transformers = (Array.isArray(proposal?.equipment) ? proposal.equipment : []).filter(item => String(item?.type || '').toLowerCase() === 'transformer');
  const cableRows = Array.isArray(proposal?.cables) ? proposal.cables : [];
  const sourceId = String((proposal?.equipment || []).find(item => String(item?.type || '').toLowerCase() === 'source')?.id || 'SOURCE');
  const ids = new Set(); const seen = new Set(); let cursor = String(motorId);
  while (cursor && cursor !== sourceId && !seen.has(cursor)) {
    seen.add(cursor);
    const transformer = transformers.find(item => String(item.secondaryBusId) === cursor);
    if (transformer) { ids.add(String(transformer.id)); cursor = String(transformer.primaryBusId); continue; }
    const cable = cableRows.find(item => String(item.to) === cursor || String(item.loadId) === cursor);
    if (!cable) break;
    cursor = String(cable.from || '');
  }
  return [...ids];
}

function accelerationNeedsRevision(result) {
  return (result?.cases || []).filter(item => item.status === 'fail' || item.criterionStatus === 'fail');
}

function summarizeAcceleration(result) {
  return (result?.cases || []).map(item => ({ motorId: item.motorId, status: item.status, timeS: item.timeS ?? null,
    criterionStatus: item.criterionStatus || 'not-evaluated', torqueStatus: item.status === 'fail' ? 'fail' : 'not-failed',
    failure: item.failure || item.reason || null }));
}

function mergeMotorBranchOperatingCurrentFloors(currentFloors, proposal, study) {
  const floors = { ...currentFloors };
  const circuitResults = study?.final?.circuitResults || study?.final?.circuits || [];
  for (const cable of proposal?.cables || []) {
    if (!cable?.loadId || cable?.branchProtectionMethod !== 'inverse-time-breaker' || cable?.motor?.branchProtectionMethod !== 'inverse-time-breaker') continue;
    const observed = circuitResults.find(item => String(item.id) === String(cable.id))?.currentA;
    const retained = Number(cable.motor.branchBreakerOperatingCurrentA);
    const floor = Math.max(Number(floors[cable.id]) || 0, Number.isFinite(retained) ? retained : 0, Number.isFinite(observed) ? observed : 0);
    if (floor > 0) floors[cable.id] = floor;
  }
  return floors;
}

function finalizeMotorRevision(proposal, input, study, startResult, history, stopReason = null, accelerationResult = null, accelerationHistory = [], accelerationStopReason = null) {
  proposal.studyValidation = study;
  proposal.motorStartingValidation = { ...startResult, history, stopReason };
  if (accelerationResult) {
    const combinedPass = study?.status === 'pass' && startResult.status === 'pass' && accelerationResult.status !== 'blocked' && !accelerationNeedsRevision(accelerationResult).length;
    const revisionComplete = combinedPass && !stopReason && !accelerationStopReason;
    const revisionStopReason = revisionComplete ? null : (accelerationStopReason || stopReason || (study?.status !== 'pass' ? 'operating-load-flow-failed' : (startResult.status !== 'pass' ? 'starting-study-blocked' : 'acceleration-constraints-unmet')));
    proposal.motorAccelerationValidation = { ...accelerationResult, revision: {
      status: accelerationResult.status === 'not-requested' ? 'not-needed' : (revisionComplete ? (accelerationHistory.length <= 1 ? 'not-needed' : 'complete') : 'stopped'),
      history: accelerationHistory, stopReason: revisionStopReason,
    } };
  }
  proposal.sourceFaultConsistency = startResult.sourceFaultConsistency || { status: 'blocked', blockedReason: 'source-fault-consistency-evidence-unavailable', issues: [] };
  const overloadCases = proposal.loads.filter(load => load.motor).map(load => ({
    motorId: String(load.id),
    ...selectMotorOverloadCandidate({ motor: load.motor, phases: load.phases }),
  }));
  proposal.motorOverloadCandidates = {
    status: overloadCases.every(item => item.candidate) ? 'screening_only' : 'blocked',
    cases: overloadCases,
    limitation: 'Nameplate-current range candidates only; complete motor protection and starter assembly remain unresolved.',
  };
  const sourceFrequencyHz = input.supply?.frequencyHz ?? input.supply?.frequency ?? input.criteria?.frequencyHz ?? input.criteria?.frequency ?? 60;
  const starterMethod = input.criteria?.motorStarter?.branchProtectionMethod || 'manual-controller';
  const starterEvaluator = starterMethod === 'inverse-time-breaker'
    ? evaluateMotorBranchBreakerCandidate
    : evaluateMotorStarterCandidates;
  const preservedBranchResults = new Map((proposal.motorBranchBreakerEvaluationResults || []).map(item => [String(item.motorId), item.result]));
  const starterCases = proposal.loads.filter(load => load.motor).map(load => {
    const motorId = String(load.id);
    if (starterMethod === 'inverse-time-breaker' && preservedBranchResults.has(motorId)) return { motorId, ...preservedBranchResults.get(motorId) };
    const branchCable = proposal.cables.find(cable => String(cable.loadId) === motorId);
    const operatingCurrentA = Number(branchCable?.motor?.branchBreakerOperatingCurrentA);
    const operatingCurrentReference = branchCable?.motor?.branchBreakerOperatingCurrentReference;
    return {
      motorId,
      ...starterEvaluator({
        load: { ...load, frequencyHz: load.frequencyHz ?? load.frequency ?? sourceFrequencyHz },
        supply: { ...input.supply, frequencyHz: sourceFrequencyHz },
        criteria: input.criteria,
        ...(Number.isFinite(operatingCurrentA) && operatingCurrentA > 0 && typeof operatingCurrentReference === 'string' && operatingCurrentReference.trim() ? { operatingCurrentA, operatingCurrentReference } : {}),
      }),
    };
  });
  delete proposal.motorBranchBreakerEvaluationResults;
  proposal.motorStarterCandidates = {
    status: 'blocked',
    method: starterMethod === 'inverse-time-breaker' ? 'siemens-dol-branch-breaker-research-v1' : 'siemens-dol-starter-research-v1',
    inputFingerprint: fingerprintStudyValue({ motors: proposal.loads.filter(load => load.motor), supply: input.supply, criteria: input.criteria?.motorStarter, operatingCurrentBases: starterCases.map(item => ({ motorId: item.motorId, operatingCurrentA: item.candidate?.sizing?.operatingCurrentA ?? item.rejectedCandidate?.sizing?.operatingCurrentA ?? null, operatingCurrentReference: item.candidate?.checks?.find(row => row.id === 'referencedOperatingCurrent')?.evidence?.reference ?? item.rejectedCandidate?.checks?.find(row => row.id === 'referencedOperatingCurrent')?.evidence?.reference ?? null })) }),
    cases: starterCases,
    limitation: starterMethod === 'inverse-time-breaker'
      ? 'The separate Siemens contactor/overload/3VA51 or 3VA52 breaker routes are research candidates only. Exact branch breaker identity affects conductor ampacity screening; the remaining motor fault, starting withstand, installation and coordination evidence is unresolved.'
      : 'Research alternative to the standalone overload-range candidates; no complete starter is selected for Apply. Complete branch protection, starting withstand, motor fault contributions and coordination remain unresolved.',
  };
  proposal.checks = proposal.checks.filter(item => !['loadFlow', 'motorStarting', 'sourceFaultConsistency', 'motorStarterAssembly', 'motorProtection'].includes(item.id));
  proposal.checks.push(
    { id: 'loadFlow', status: study?.status === 'pass' ? 'pass' : 'fail', evidence: study?.final || { status: study?.status || 'unevaluated', issues: study?.issues || [] } },
    { id: 'motorStarting', status: startResult.status === 'pass' ? 'pass' : 'fail', evidence: proposal.motorStartingValidation },
    { id: 'sourceFaultConsistency', status: proposal.sourceFaultConsistency.status === 'pass' ? 'pass' : 'fail', evidence: proposal.sourceFaultConsistency },
    { id: 'motorStarterAssembly', status: 'fail', evidence: { status: 'blocked', candidateCount: starterCases.filter(item => item.candidate).length, motorCount: starterCases.length, method: proposal.motorStarterCandidates.method, limitation: proposal.motorStarterCandidates.limitation } },
    { id: 'motorProtection', status: 'fail', evidence: { status: 'unresolved', motorCount: proposal.loads.filter(load => load.motor).length } },
  );
  const failures = [...validateDesignSynthesisMotorInputs(input).studyIssues, ...(startResult.issues || []), ...(startResult.cases || []).flatMap(item => item.issues || [])];
  for (const item of overloadCases) for (const diagnostic of item.issues) {
    const inputIndex = input.equipment.findIndex(load => String(load?.id) === item.motorId);
    const path = inputIndex < 0 ? 'motorProtection' : `equipment[${inputIndex}].motor`;
    failures.push(issue(diagnostic.code, `${item.motorId}: ${diagnostic.message}`, 'blocking', path));
  }
  if (startResult.status !== 'pass' && !failures.length) failures.push(issue('MOTOR_STARTING_LIMIT_FAILED', 'Motor starting voltage has not passed the supplied criterion.', 'blocking', 'motorStarting'));
  if (stopReason && startResult.status !== 'pass') failures.push(issue('MOTOR_STARTING_REVISION_EXHAUSTED', `Motor starting revision stopped: ${stopReason}.`, 'blocking', 'motorStarting'));
  if (study?.status !== 'pass') failures.push(issue('MOTOR_START_REVISION_OPERATING_STUDY_FAILED', 'The selected motor design has no passing operating load-flow study.', 'blocking', 'studyValidation'));
  failures.push(issue('MOTOR_PROTECTION_UNRESOLVED', 'Motor overload protection, short-circuit/ground-fault coordination, starting withstand and motor fault contributions remain unevaluated.', 'blocking', 'motorProtection'));
  proposal.issues.push(...failures.filter((item, index, all) => all.findIndex(other => other.code === item.code && other.path === item.path) === index));
  proposal.status = 'blocked';
  proposal.distributionBaseline = null;
  const disposition = buildDesignSynthesisLoadDispositions(input, { issues: proposal.issues });
  proposal.loadDispositions = disposition.loadDispositions; proposal.globalBlockingIssues = disposition.globalBlockingIssues;
  proposal.summary.generatedLoadCount = 0;
  proposal.summary.blockedCount = proposal.issues.filter(item => item.severity === 'blocking').length;
  (proposal.panelLocationOverrides || []).forEach(row => { if (row.requestedLocation) row.status = 'blocked'; });
  return proposal;
}

function generateDesignProposalWithMotorRevisions(input = {}, internalOptions = {}) {
  const proposal = generateDesignProposalInternal(input, internalOptions);
  if (!proposal.loads?.some(load => load.motor)) return proposal;
  const criteria = input?.criteria || {};
  const maxRevisions = Number.isInteger(criteria.loadFlow?.maxRevisions) ? criteria.loadFlow.maxRevisions : 12;
  const operatingHistory = proposal.studyValidation?.history || [];
  const usedRevisions = Math.max(0, ...operatingHistory.map(item => item.revision || 0));
  const accelerationShape = validateDesignSynthesisMotorAccelerationInputs({ equipment: input?.equipment, criteria });
  const accelerationRequested = accelerationShape.requested;
  let start = evaluateDesignSynthesisMotorStarting(proposal, criteria);
  let acceleration = evaluateDesignSynthesisMotorAcceleration(proposal, criteria);
  const accelerationHistory = [];
  const initialAccelerationFailures = accelerationNeedsRevision(acceleration);
  accelerationHistory.push({ revision: usedRevisions,
    status: proposal.studyValidation?.status === 'pass' && start.status === 'pass' && !initialAccelerationFailures.length && acceleration.status !== 'blocked' ? 'pass' : (acceleration.status === 'blocked' ? 'blocked' : 'fail'),
    accelerationCases: summarizeAcceleration(acceleration), operatingStatus: proposal.studyValidation?.status || 'unevaluated',
    startingStatus: start.status, changedCircuits: [], transformerProfileId: proposal.transformer?.profileId || null,
    reason: 'selected operating-study network' });
  const history = [{ revision: usedRevisions, status: start.status, cases: start.cases, reason: 'selected operating-study network' }];
  let current = proposal;
  let stopReason = null; let finalStudy = proposal.studyValidation;
  let conductorSizeFloors = Object.fromEntries(proposal.cables.filter(cable => cable.conductor_size).map(cable => [cable.id, cable.conductor_size]));
  const hasInverseTimeMotorBranch = proposal.cables.some(cable => cable.branchProtectionMethod === 'inverse-time-breaker' && cable.motor?.branchProtectionMethod === 'inverse-time-breaker');
  let operatingCurrentFloors = mergeOperatingCurrentFloors(internalOptions.operatingCurrentFloors || {}, retainedOperatingCurrentFloors(proposal, finalStudy));
  if (hasInverseTimeMotorBranch) operatingCurrentFloors = mergeMotorBranchOperatingCurrentFloors(operatingCurrentFloors, proposal, finalStudy);
  let operatingFloorNeedsRevision = false;
  let transformerMinimumKVA = proposal.transformer?.ratedKVA;
  const startCanRevise = start.status === 'fail' && !start.issues?.length && !start.cases.some(item => !item.converged);
  const accelerationBlocked = acceleration.status === 'blocked' || accelerationShape.issues.length > 0;
  const accelerationCanRevise = accelerationRequested && !accelerationBlocked && initialAccelerationFailures.length > 0;
  if (proposal.status !== 'proposal' || finalStudy?.status !== 'pass' || (accelerationRequested && accelerationBlocked) || (!startCanRevise && !accelerationCanRevise)) {
    const reason = accelerationRequested && accelerationBlocked ? 'acceleration-study-blocked' : (finalStudy?.status !== 'pass' ? 'operating-load-flow-failed' : (start.status === 'blocked' || (start.status === 'fail' && (start.issues?.length || start.cases.some(item => !item.converged))) ? 'starting-study-blocked' : null));
    return finalizeMotorRevision(proposal, input, finalStudy, start, history, reason, acceleration, accelerationHistory, accelerationRequested && (initialAccelerationFailures.length || accelerationBlocked) ? reason || 'revision-not-applicable' : null);
  }
  for (let revision = usedRevisions + 1; revision <= maxRevisions; revision += 1) {
    const nextFloors = { ...conductorSizeFloors };
    const failedBusIds = new Set(start.cases.flatMap(item => item.buses.filter(bus => bus.status !== 'pass').map(bus => bus.id)));
    const failedMotorIds = new Set(accelerationNeedsRevision(acceleration).map(item => String(item.motorId)));
    for (const busId of failedBusIds) for (const cableId of motorPathCableIds(current, busId)) {
      const cable = current.cables.find(item => String(item.id) === cableId);
      const nextSize = nextSourcedConductorSize(cable);
      if (nextSize) nextFloors[cableId] = nextSize;
    }
    for (const motorId of failedMotorIds) for (const cableId of motorPathCableIds(current, motorId)) {
      const cable = current.cables.find(item => String(item.id) === cableId);
      const nextSize = nextSourcedConductorSize(cable);
      if (nextSize) nextFloors[cableId] = nextSize;
    }
    if (JSON.stringify(nextFloors) === JSON.stringify(conductorSizeFloors) && !operatingFloorNeedsRevision) {
      const transformerRelevant = [...failedBusIds].some(id => motorPathTransformerIds(current, id).length) || [...failedMotorIds].some(id => motorPathTransformerIds(current, id).length);
      const nextTransformer = transformerRelevant ? current.transformer?.selectionCandidates?.filter(item => item.eligible && item.ratedKVA > Number(current.transformer.ratedKVA || 0)).sort((a, b) => a.ratedKVA - b.ratedKVA)[0] : null;
      if (!nextTransformer) { stopReason = 'no-larger-sourced-conductor-or-transformer-candidate'; break; }
      transformerMinimumKVA = nextTransformer.ratedKVA;
    }
    conductorSizeFloors = nextFloors;
    operatingFloorNeedsRevision = false;
    const revised = generateDesignProposalInternal(input, { ...internalOptions, skipStudy: true, conductorSizeFloors, transformerMinimumKVA, operatingCurrentFloors });
    const attemptedChanges = revised.cables.filter(cable => current.cables.find(old => old.id === cable.id)?.conductor_size !== cable.conductor_size).map(cable => ({ id: cable.id, size: cable.conductor_size }));
    if (revised.status !== 'proposal') {
      stopReason = 'regenerated-design-blocked';
      const blockedStudy = { status: 'blocked', final: null, history: operatingHistory, issues: [{ code: 'MOTOR_REVISION_REGENERATION_BLOCKED', path: 'studyValidation', message: 'The regenerated motor candidate violated routing, sizing, or installation constraints before network evaluation.' }], stopReason };
      const blockedStart = { status: 'blocked', cases: [], issues: [{ code: 'MOTOR_REVISION_REGENERATION_BLOCKED', path: 'motorStarting', message: 'No finalized network was available for a starting reevaluation.' }], sourceFaultConsistency: start.sourceFaultConsistency };
      const candidateAcceleration = evaluateDesignSynthesisMotorAcceleration(revised, criteria);
      const blockedAcceleration = { ...candidateAcceleration, status: accelerationRequested ? 'blocked' : candidateAcceleration.status,
        cases: accelerationRequested ? (candidateAcceleration.cases || []).map(item => ({ ...item, status: 'blocked', timeS: null, criterionStatus: 'not-evaluated', timeline: [], electricalExposureA2S: null })) : candidateAcceleration.cases,
        issues: accelerationRequested ? [...(candidateAcceleration.issues || []), { code: 'ACCELERATION_REGENERATION_BLOCKED', path: 'motorAcceleration', message: 'The regenerated candidate was rejected before its network could be evaluated.' }] : candidateAcceleration.issues };
      history.push({ revision, status: 'blocked', cases: [], operatingStatus: 'not-evaluated', changedCircuits: attemptedChanges, transformerProfileId: revised.transformer?.profileId || null, reason: stopReason });
      accelerationHistory.push({ revision, status: 'blocked', accelerationCases: summarizeAcceleration(blockedAcceleration), operatingStatus: 'not-evaluated', startingStatus: 'not-evaluated', changedCircuits: attemptedChanges, previousTransformerProfileId: current.transformer?.profileId || null, transformerProfileId: revised.transformer?.profileId || null, reason: stopReason });
      revised.studyValidation = blockedStudy;
      current = revised; finalStudy = blockedStudy; start = blockedStart; acceleration = blockedAcceleration;
      break;
    }
    const study = evaluateDesignSynthesisStudy(revised, criteria);
    const nextStart = evaluateDesignSynthesisMotorStarting(revised, criteria);
    const nextAcceleration = evaluateDesignSynthesisMotorAcceleration(revised, criteria);
    const changes = attemptedChanges;
    let observedOperatingFloors = mergeOperatingCurrentFloors(operatingCurrentFloors, retainedOperatingCurrentFloors(revised, study));
    if (hasInverseTimeMotorBranch) observedOperatingFloors = mergeMotorBranchOperatingCurrentFloors(observedOperatingFloors, revised, study);
    operatingFloorNeedsRevision = hasInverseTimeMotorBranch && Object.keys(observedOperatingFloors).some(id => Number(observedOperatingFloors[id]) > (Number(operatingCurrentFloors[id]) || 0) + 1e-9);
    operatingCurrentFloors = observedOperatingFloors;
    history.push({ revision, status: nextStart.status, cases: nextStart.cases, operatingStatus: study.status, changedCircuits: changes, operatingCurrentFloors: hasInverseTimeMotorBranch ? { ...operatingCurrentFloors } : undefined, operatingFloorNeedsRevision, transformerProfileId: revised.transformer?.profileId || null, reason: 'next sourced candidates on failed bus paths under unchanged criteria' });
    const nextAccelFailures = accelerationNeedsRevision(nextAcceleration);
    const previousTransformerProfileId = current.transformer?.profileId || null;
    const transformerProfileId = revised.transformer?.profileId || null;
    const transformerChanged = previousTransformerProfileId !== transformerProfileId;
    const revisionReason = transformerChanged && !changes.length
      ? `tested the next eligible sourced transformer profile from ${previousTransformerProfileId || 'none'} to ${transformerProfileId || 'none'} on an affected path and finalized the network`
      : (transformerChanged
        ? 're-evaluated sourced conductor candidates and a transformer profile on affected paths'
        : (changes.length ? 're-evaluated sourced conductor candidates on failed paths and finalized the network' : 're-evaluated the finalized network with retained operating-current floors'));
    accelerationHistory.push({ revision,
      status: nextAcceleration.status === 'blocked' ? 'blocked' : (study.status === 'pass' && nextStart.status === 'pass' && !nextAccelFailures.length && !operatingFloorNeedsRevision ? 'pass' : 'fail'),
      accelerationCases: summarizeAcceleration(nextAcceleration), operatingStatus: study.status, startingStatus: nextStart.status,
      changedCircuits: changes, previousTransformerProfileId, transformerProfileId,
      reason: revisionReason });
    current = revised; finalStudy = { ...study, history: operatingHistory }; start = nextStart; acceleration = nextAcceleration;
    if (study.status !== 'pass') { stopReason = 'operating-load-flow-failed'; break; }
    if (accelerationRequested && acceleration.status === 'blocked') { stopReason = 'acceleration-study-blocked'; break; }
    const accelerationPass = !accelerationRequested || (acceleration.status !== 'blocked' && !nextAccelFailures.length);
    if (start.status === 'pass' && accelerationPass && !operatingFloorNeedsRevision) return finalizeMotorRevision(current, input, finalStudy, start, history, null, acceleration, accelerationHistory, null);
    if (start.status === 'pass' && operatingFloorNeedsRevision) continue;
    if (start.status !== 'fail' && !nextAccelFailures.length) { stopReason = 'starting-study-blocked'; break; }
    if (start.issues?.length || start.cases.some(item => !item.converged)) { stopReason = 'starting-study-blocked'; break; }
  }
  const finalStopReason = stopReason || 'revision-budget-exhausted';
  return finalizeMotorRevision(current, input, finalStudy, start, history, finalStopReason, acceleration, accelerationHistory,
    accelerationRequested && (acceleration.status === 'blocked' || accelerationNeedsRevision(acceleration).length) ? finalStopReason : null);
}

function feederPartitionFailures(proposal) {
  const failures = [];
  for (const panel of proposal?.panels || []) {
    const feeder = (proposal.cables || []).find(cable => String(cable.id) === `F-${panel.id}`);
    if (!feeder) {
      failures.push({ panelId: panel.id, loadIds: [...(panel.loadIds || [])], feederId: `F-${panel.id}`, reason: 'missing-feeder', requiredDesignAmpacityA: 0, selectedConductorSize: null, selectedAmpacityA: null, protectiveDeviceStatus: 'missing' });
      continue;
    }
    const designAmpacityA = Math.max(Number(feeder.designAmpacityA) || 0, Number(feeder.protectiveRequirement?.ampereRatingA) || 0, (Number(feeder.currentA) || 0) * 1.25);
    const routeFeasible = panel.routeResult?.status === 'routed' && feeder.routingDecision?.status === 'feasible';
    const conductorFeasible = feeder.sizingStatus === 'screening-sized'
      && Number.isFinite(Number(feeder.ampacityA))
      && Number(feeder.ampacityA) + EPS >= designAmpacityA
      && Number.isFinite(Number(feeder.routeThermalAmpacity))
      && Number(feeder.routeThermalAmpacity) + EPS >= designAmpacityA;
    const voltageDropLimit = Number(proposal?.inputs?.original?.criteria?.voltageDropLimitPct ?? 3);
    const voltageDropFeasible = feeder.voltageDropStatus === 'evaluated'
      && Number.isFinite(Number(feeder.voltageDropPct))
      && Number(feeder.voltageDropPct) <= voltageDropLimit + EPS;
    const deviceFeasible = Boolean(feeder.protectiveDevice);
    if (routeFeasible && conductorFeasible && voltageDropFeasible && deviceFeasible) continue;
    const reason = !routeFeasible ? 'feeder-route' : (!conductorFeasible ? 'feeder-ampacity' : (!voltageDropFeasible ? 'voltage-drop' : 'no-applicable-protective-device'));
    failures.push({
      panelId: panel.id,
      loadIds: [...(panel.loadIds || [])],
      feederId: feeder.id,
      reason,
      requiredDesignAmpacityA: designAmpacityA,
      selectedConductorSize: feeder.conductor_size || null,
      selectedAmpacityA: feeder.ampacityA !== null && feeder.ampacityA !== undefined && Number.isFinite(Number(feeder.ampacityA)) ? Number(feeder.ampacityA) : null,
      protectiveDeviceStatus: deviceFeasible ? 'selected' : (feeder.protectiveRequirement?.status || 'unresolved')
    });
  }
  return failures;
}

function validatePartitionMembership(proposal, expectedIds) {
  const issues = [];
  const expected = new Set(expectedIds);
  const seen = new Set();
  const panels = proposal?.panels || [];
  for (const panel of panels) {
    const loadIds = Array.isArray(panel.loadIds) ? panel.loadIds : [];
    if (!loadIds.length) issues.push({ code: 'DISTRIBUTION_PARTITION_EMPTY_PANEL', path: `panels.${panel.id}`, message: 'A partition trial returned an empty panel.' });
    for (const rawId of loadIds) {
      const key = String(rawId).toLowerCase();
      if (!expected.has(key)) issues.push({ code: 'DISTRIBUTION_PARTITION_UNKNOWN_LOAD', path: `panels.${panel.id}`, message: `Partition trial returned unknown load ${rawId}.` });
      if (seen.has(key)) issues.push({ code: 'DISTRIBUTION_PARTITION_DUPLICATE_LOAD', path: `panels.${panel.id}`, message: `Partition trial assigned load ${rawId} more than once.` });
      seen.add(key);
    }
    if (!(proposal?.cables || []).some(cable => String(cable.id) === `F-${panel.id}`)) issues.push({ code: 'DISTRIBUTION_PARTITION_MISSING_FEEDER', path: `panels.${panel.id}`, message: 'Partition trial returned a panel without its feeder.' });
  }
  for (const id of expected) if (!seen.has(id)) issues.push({ code: 'DISTRIBUTION_PARTITION_MISSING_LOAD', path: 'panels', message: `Partition trial omitted load ${id}.` });
  if (!panels.length && expected.size) issues.push({ code: 'DISTRIBUTION_PARTITION_NO_PANELS', path: 'panels', message: 'Partition trial returned no panels for the normalized loads.' });
  const identityIssues = (proposal?.issues || []).filter(item => item.code === 'INVALID_PANEL_IDENTITY_BASELINE');
  issues.push(...identityIssues);
  return issues;
}

function deterministicBisect(loadIds, loadsById) {
  const ordered = [...loadIds].sort((a, b) => String(a).localeCompare(String(b)));
  if (ordered.length < 2) return null;
  const loadFloor = load => Math.max(0, Number(load?.designAmpacityA) || 0, (Number(load?.currentA) || 0) * (load?.duty === 'intermittent' || load?.duty === 'non-continuous' ? 1 : 1.25));
  const total = ordered.reduce((sum, id) => sum + loadFloor(loadsById.get(String(id).toLowerCase())), 0);
  let left = [];
  let right = [];
  if (total > 0) {
    let accumulated = 0;
    for (const id of ordered) {
      const current = loadFloor(loadsById.get(String(id).toLowerCase()));
      if (accumulated < total / 2 || left.length === 0) { left.push(id); accumulated += current; }
      else right.push(id);
    }
  }
  if (!left.length || !right.length) {
    const midpoint = Math.ceil(ordered.length / 2);
    left = ordered.slice(0, midpoint);
    right = ordered.slice(midpoint);
  }
  return [left, right];
}

function generateDesignProposalWithDistributionPartition(input = {}, internalOptions = {}) {
  if (!Array.isArray(input?.equipment)) {
    return { proposal: generateDesignProposalWithMotorRevisions(input, internalOptions), validation: null, unserviceable: [] };
  }
  let trial = generateDesignProposalInternal(input, { ...internalOptions, skipStudy: true });
  const hasMotors = (trial.loads || []).some(load => load.motor);
  const initialFailures = feederPartitionFailures(trial);
  if (!(trial.panels || []).length || (!hasMotors && !initialFailures.length)) {
    return { proposal: generateDesignProposalWithMotorRevisions(input, internalOptions), validation: null, unserviceable: [] };
  }

  const criteria = input?.criteria || {};
  const partitionGroups = (trial.panels || []).map(panel => [...(panel.loadIds || [])]);
  let lastValidGroups = partitionGroups.map(group => [...group]);
  const initialPanelCount = partitionGroups.length;
  const initialIds = new Set((trial.loads || []).map(load => String(load.id).toLowerCase()));
  const loadsById = new Map((trial.loads || []).map(load => [String(load.id).toLowerCase(), load]));
  const decisions = [];
  let partitionIssues = validatePartitionMembership(trial, initialIds);
  let splitCount = 0;
  let trialCount = 1;
  let stoppingReason = 'split-budget-exhausted';
  let failures = initialFailures;
  const configuredDevices = input?.protectiveDevices ?? bundledDeviceSnapshot.records;
  const structuralNoDeviceCatalog = Array.isArray(configuredDevices) && configuredDevices.length === 0;
  const structuralNoCorridors = Array.isArray(input?.corridors?.edges) && input.corridors.edges.length === 0;
  if (failures.length && (structuralNoDeviceCatalog || structuralNoCorridors)) {
    stoppingReason = structuralNoDeviceCatalog ? 'global-device-catalog-unavailable' : 'global-route-network-unavailable';
  }
  if (partitionIssues.length) stoppingReason = 'input-invalid';
  while (failures.length && !stoppingReason.startsWith('global-') && stoppingReason !== 'input-invalid' && splitCount < Math.max(0, initialIds.size - 1)) {
    const failingIds = new Set(failures.filter(item => item.loadIds.length > 1).map(item => String(item.panelId)));
    if (!failingIds.size) { stoppingReason = 'single-load-unservable'; break; }
    const nextGroups = [];
    let madeSplit = false;
    for (let index = 0; index < (trial.panels || []).length; index += 1) {
      const panel = trial.panels[index];
      const group = [...(panel.loadIds || [])];
      const failed = failures.find(item => String(item.panelId) === String(panel.id));
      if (!failed || !failingIds.has(String(panel.id))) { nextGroups.push(group); continue; }
      const children = deterministicBisect(group, loadsById);
      if (!children) { nextGroups.push(group); continue; }
      nextGroups.push(...children);
      decisions.push({ sourcePanelId: panel.id, sourceLoadIds: group, childLoadIds: children, reason: failed.reason, requiredDesignAmpacityA: failed.requiredDesignAmpacityA, selectedConductorSize: failed.selectedConductorSize, selectedAmpacityA: failed.selectedAmpacityA });
      splitCount += 1;
      madeSplit = true;
    }
    if (!madeSplit) { stoppingReason = 'single-load-unservable'; break; }
    if (nextGroups.flat().length !== initialIds.size || nextGroups.flat().some(id => !initialIds.has(String(id).toLowerCase())) || new Set(nextGroups.flat().map(id => String(id).toLowerCase())).size !== initialIds.size) {
      stoppingReason = 'input-invalid';
      break;
    }
    trial = generateDesignProposalInternal(input, { ...internalOptions, skipStudy: true, distributionPartitionGroups: nextGroups });
    trialCount += 1;
    partitionIssues = validatePartitionMembership(trial, initialIds);
    if (partitionIssues.length) { stoppingReason = 'input-invalid'; break; }
    lastValidGroups = (trial.panels || []).map(panel => [...(panel.loadIds || [])]);
    failures = feederPartitionFailures(trial);
    if (!failures.length) { stoppingReason = 'all-feeders-feasible'; break; }
  }
  if (!failures.length && stoppingReason !== 'input-invalid' && !stoppingReason.startsWith('global-')) stoppingReason = 'all-feeders-feasible';
  if (failures.length && failures.every(item => item.loadIds.length <= 1) && !stoppingReason.startsWith('global-') && stoppingReason !== 'input-invalid') stoppingReason = 'single-load-unservable';
  if (failures.length && stoppingReason === 'split-budget-exhausted' && splitCount >= Math.max(0, initialIds.size - 1)) stoppingReason = 'split-budget-exhausted';

  const selectedGroups = stoppingReason === 'input-invalid' ? lastValidGroups : (trial.panels || []).map(panel => [...(panel.loadIds || [])]);
  const partitioned = splitCount > 0;
  const proposal = generateDesignProposalWithMotorRevisions(input, { ...internalOptions, ...(partitioned && stoppingReason !== 'input-invalid' ? { distributionPartitionGroups: selectedGroups } : {}) });
  const finalPartitionIssues = validatePartitionMembership(proposal, initialIds);
  const finalFailures = feederPartitionFailures(proposal);
  const unserviceable = ['single-load-unservable', 'global-device-catalog-unavailable', 'global-route-network-unavailable'].includes(stoppingReason)
    ? finalFailures
    : [];
  const criteriaLimits = {
    maxPanelLoadKva: finite(criteria.maxPanelLoadKva) ? n(criteria.maxPanelLoadKva) : null,
    maxLoadsPerPanel: Number.isInteger(n(criteria.maxLoadsPerPanel)) ? n(criteria.maxLoadsPerPanel) : null
  };
  const validation = {
    status: finalFailures.length || unserviceable.length || stoppingReason === 'input-invalid' || finalPartitionIssues.length ? 'blocked' : 'evaluated',
    algorithm: 'deterministic-feasible-feeder-bisection-v1',
    initialPanelCount,
    finalPanelCount: (proposal.panels || []).length,
    trialCount,
    splitCount,
    criteria: criteriaLimits,
    groups: (proposal.panels || []).map(panel => {
      const feeder = (proposal.cables || []).find(cable => String(cable.id) === `F-${panel.id}`);
      return { panelId: panel.id, loadIds: [...(panel.loadIds || [])], feederId: feeder?.id || null, designAmpacityA: feeder ? Math.max(Number(feeder.designAmpacityA) || 0, Number(feeder.protectiveRequirement?.ampereRatingA) || 0, (Number(feeder.currentA) || 0) * 1.25) : 0, conductorSize: feeder?.conductor_size || null, ampacityA: feeder?.ampacityA !== null && feeder?.ampacityA !== undefined && Number.isFinite(Number(feeder.ampacityA)) ? Number(feeder.ampacityA) : null, sizingStatus: feeder?.sizingStatus || 'blocked', protectiveDeviceStatus: feeder?.protectiveDevice ? 'selected' : (feeder?.protectiveRequirement?.status || 'unresolved') };
    }),
    decisions,
    stoppingReason: finalPartitionIssues.length ? 'final-membership-invalid' : (finalFailures.length && stoppingReason === 'all-feeders-feasible' ? 'final-revision-feeder-infeasible' : stoppingReason),
    ...(partitionIssues.length || finalPartitionIssues.length ? { issues: [...partitionIssues, ...finalPartitionIssues] } : {}),
    limitations: ['Deterministic bisection is a bounded feasibility search, not a globally optimal panel assignment.', 'Feeder device selection remains a screening candidate and does not establish protection coordination or approval.']
  };
  proposal.distributionPartitionValidation = validation;
  proposal.checks = [...(proposal.checks || []).filter(item => item.id !== 'distributionPartition'), { id: 'distributionPartition', status: validation.status === 'evaluated' ? 'pass' : 'fail', evidence: validation }];
  if (unserviceable.length) {
    proposal.issues.push(...unserviceable.map(item => issue(stoppingReason.startsWith('global-') ? 'DISTRIBUTION_GROUP_GLOBAL_CONSTRAINT' : 'DISTRIBUTION_GROUP_UNSERVABLE', stoppingReason.startsWith('global-') ? `Distribution partition stopped because ${stoppingReason === 'global-device-catalog-unavailable' ? 'the selected protective-device catalog is empty' : 'the corridor route network has no edges'}.` : `Load ${item.loadIds[0]} cannot be assigned a supported feeder conductor and protective device under the unchanged criteria.`, 'blocking', item.feederId)));
    proposal.status = 'blocked';
    proposal.distributionBaseline = null;
  }
  if (stoppingReason === 'input-invalid') {
    for (const item of partitionIssues) if (item.code === 'INVALID_PANEL_IDENTITY_BASELINE' && !proposal.issues.some(existing => existing.code === item.code && existing.path === item.path)) proposal.issues.push(item);
    proposal.issues.push(issue('DISTRIBUTION_PARTITION_IDENTITY_BLOCKED', `A partition trial could not preserve complete panel/load identity. ${partitionIssues.map(item => `${item.code}: ${item.message}`).join(' ')}`, 'blocking', 'distributionPartitionValidation'));
    proposal.status = 'blocked';
    proposal.distributionBaseline = null;
  }
  if (finalPartitionIssues.length && stoppingReason !== 'input-invalid') {
    proposal.issues.push(issue('DISTRIBUTION_PARTITION_FINAL_INTEGRITY_BLOCKED', `The final motor revision did not preserve one feeder and exactly one panel assignment for every normalized load. ${finalPartitionIssues.map(item => `${item.code}: ${item.message}`).join(' ')}`, 'blocking', 'distributionPartitionValidation'));
    proposal.status = 'blocked';
    proposal.distributionBaseline = null;
  }
  if (finalFailures.length && !unserviceable.length && stoppingReason !== 'input-invalid') {
    const code = stoppingReason === 'all-feeders-feasible' ? 'DISTRIBUTION_FINAL_REVISION_INFEASIBLE' : (stoppingReason === 'split-budget-exhausted' ? 'DISTRIBUTION_PARTITION_BUDGET_EXHAUSTED' : 'DISTRIBUTION_PARTITION_INFEASIBLE');
    const message = code === 'DISTRIBUTION_FINAL_REVISION_INFEASIBLE'
      ? 'Final motor study revisions left the feeder below its supported route, conductor, voltage-drop, or protective-device feasibility boundary after design-only partition trials.'
      : 'Bounded feeder-aware partitioning stopped with one or more feeder groups still infeasible under the unchanged criteria.';
    proposal.issues.push(...finalFailures.map(item => issue(code, `${message} Feeder ${item.feederId}.`, 'blocking', item.feederId)));
    proposal.status = 'blocked';
    proposal.distributionBaseline = null;
  }
  if (unserviceable.length || (finalFailures.length && !unserviceable.length) || stoppingReason === 'input-invalid' || finalPartitionIssues.length) {
    const disposition = buildDesignSynthesisLoadDispositions(input, { issues: proposal.issues });
    proposal.loadDispositions = disposition.loadDispositions;
    proposal.globalBlockingIssues = disposition.globalBlockingIssues;
  }
  if (proposal.summary) proposal.summary.blockedCount = proposal.issues.filter(item => item.severity === 'blocking').length;
  return { proposal, validation, unserviceable };
}

function maxRevisionUsed(proposal, candidateRevision = 0) {
  const revisions = [candidateRevision];
  for (const row of proposal?.studyValidation?.history || []) if (Number.isSafeInteger(row?.revision)) revisions.push(row.revision);
  for (const row of proposal?.motorStartingValidation?.history || []) if (Number.isSafeInteger(row?.revision)) revisions.push(row.revision);
  for (const row of proposal?.motorAccelerationValidation?.revision?.history || []) if (Number.isSafeInteger(row?.revision)) revisions.push(row.revision);
  return Math.max(0, ...revisions);
}

function floorForEachFeederLoad(proposal) {
  const floors = {};
  for (const panel of proposal?.panels || []) {
    const feeder = proposal?.cables?.find(cable => String(cable.id) === `F-${panel.id}`);
    if (!feeder?.conductor_size) continue;
    for (const loadId of panel.loadIds || []) floors[String(loadId)] = feeder.conductor_size;
  }
  return floors;
}

function conductorChangesBetween(before, after) {
  const prior = new Map((before?.cables || []).map(cable => [String(cable.id), cable]));
  const current = new Map((after?.cables || []).map(cable => [String(cable.id), cable]));
  return [...new Set([...prior.keys(), ...current.keys()])].sort().flatMap(cableId => {
    const from = prior.get(cableId); const to = current.get(cableId);
    if (from?.conductor_size === to?.conductor_size && from?.cableStockId === to?.cableStockId && !!from === !!to) return [];
    return [{ cableId, fromSize: from?.conductor_size || null, toSize: to?.conductor_size || null,
      fromStockId: from?.cableStockId || null, toStockId: to?.cableStockId || null, identity: from && to ? 'retained' : from ? 'removed' : 'created' }];
  });
}

function keyedChanges(beforeRows, afterRows, keyOf, summarize) {
  const before = new Map((Array.isArray(beforeRows) ? beforeRows : []).map(row => [String(keyOf(row)), row]));
  const after = new Map((Array.isArray(afterRows) ? afterRows : []).map(row => [String(keyOf(row)), row]));
  return [...new Set([...before.keys(), ...after.keys()])].sort().flatMap(id => {
    const left = before.get(id); const right = after.get(id);
    const beforeValue = left ? summarize(left) : null; const afterValue = right ? summarize(right) : null;
    return JSON.stringify(beforeValue) === JSON.stringify(afterValue) ? [] : [{ id, before: beforeValue, after: afterValue }];
  });
}

function candidateRouteRows(proposal) {
  const cableByTag = new Map((proposal?.cables || []).map(cable => [String(cable.tag || cable.id), cable.id]));
  return (proposal?.routeResults?.batchResults || []).filter(row => cableByTag.has(String(row?.cable))).map(row => ({
    id: cableByTag.get(String(row.cable)), status: row.status || null, totalLength: row.total_length ?? null,
    segments: (row.route_segments || []).map(segment => ({ type: segment.type || null, tray: segment.tray_id || null, conduit: segment.conduit_id || null, raceway: segment.raceway_id || null, length: segment.length ?? null })),
  }));
}

function candidateRacewayRows(proposal) {
  const rows = (proposal?.racewayEvaluations || []).map(row => ({ ...row, kind: row.kind || 'raceway' }));
  const cablesById = new Map((proposal?.cables || []).map(cable => [String(cable.id), cable]));
  for (const conduit of proposal?.conduits || []) {
    const segments = (proposal.installationCoverage || []).flatMap(item => (item.segments || [])
      .filter(segment => segment.coverage === 'dedicated-emt' && String(segment.conduitId || '') === String(conduit.id))
      .map(segment => ({ cableId: String(item.cableId || ''), ...segment })));
    rows.push({
      id: String(conduit.id), kind: 'endpoint-conduit', status: segments.length && segments.every(row => row.installationStatus === 'evaluated') ? 'pass' : 'blocked',
      conduitType: conduit.conduit_type || null, tradeSize: conduit.trade_size || null,
      cableIds: [...new Set((conduit.cable_ids || segments.map(row => row.cableId)).map(String))].sort(),
      fillPercent: segments.length ? Math.max(...segments.map(row => Number(row.fillPercent) || 0)) : null,
      cableAreaIn2: segments.reduce((sum, row) => sum + (Number(row.cableAreaIn2) || 0), 0),
      internalAreaIn2: segments.length ? Math.min(...segments.map(row => Number(row.internalAreaIn2) || Infinity)) : null,
      fillLimit: segments.length ? Math.min(...segments.map(row => Number(row.fillLimit) || Infinity)) : null,
      conductorOdsIn: segments.map(row => ({ cableId: row.cableId, outsideDiameterIn: cablesById.get(row.cableId)?.cable_od ?? null })).sort((left, right) => left.cableId.localeCompare(right.cableId)),
    });
  }
  return rows;
}

function candidateProtectionRows(proposal) {
  return (proposal?.cables || []).map(cable => ({
    id: String(cable.id), method: cable.branchProtectionMethod || null,
    device: cable.protectiveDevice ? {
      catalogNumber: cable.protectiveDevice.catalogNumber || cable.protectiveDevice.catalog_number || cable.protectiveDevice.id || null,
      continuousCurrentA: cable.protectiveDevice.continuousCurrentA ?? null,
      tripRatingA: cable.protectiveDevice.tripRatingA ?? null,
    } : null,
    requirementA: cable.protectiveRequirement?.ampereRatingA ?? null,
  }));
}

function nestedRevisionRows(proposal) {
  const rows = [];
  for (const item of proposal?.studyValidation?.history || []) rows.push({
    stage: 'operating', revision: item.revision, status: item.status || 'unknown', reason: item.reason || null,
    changedCircuitIds: [...(item.changedCircuitIds || [])], conductorChanges: (item.conductorChanges || []).map(change => ({ cableId: change.cableId, from: change.from || null, to: change.to || null })),
    transformerProfileId: item.transformerProfileId || null, stopReason: item.stopReason || null,
  });
  for (const item of proposal?.motorStartingValidation?.history || []) rows.push({
    stage: 'motor-starting', revision: item.revision, status: item.status || 'unknown', reason: item.reason || null,
    changedCircuitIds: [...(item.changedCircuits || []).map(change => change?.id || change?.cableId || change).filter(Boolean)],
    conductorChanges: (item.changedCircuits || []).filter(change => change && typeof change === 'object').map(change => ({ cableId: change.id || change.cableId, from: change.from || null, to: change.to || change.size || null })),
    transformerProfileId: item.transformerProfileId || null, stopReason: item.stopReason || null,
  });
  for (const item of proposal?.motorAccelerationValidation?.revision?.history || []) rows.push({
    stage: 'motor-acceleration', revision: item.revision, status: item.status || 'unknown', reason: item.reason || null,
    changedCircuitIds: [...(item.changedCircuits || []).map(change => change?.id || change?.cableId || change).filter(Boolean)],
    conductorChanges: (item.changedCircuits || []).filter(change => change && typeof change === 'object').map(change => ({ cableId: change.id || change.cableId, from: change.from || null, to: change.to || change.size || null })),
    transformerProfileId: item.transformerProfileId || null, stopReason: item.stopReason || null,
  });
  return rows.map(row => ({ ...row, changedCircuitIds: row.changedCircuitIds.sort() }));
}

function revisionEntry({ kind, revision, previous, proposal, reason, requestedConductorFloors = {}, requestedFeederFloors = {} }) {
  const thermal = proposal?.cableFaultWithstandValidation;
  return {
    kind, revision, status: thermal?.status === 'evaluated' ? 'evaluated' : 'blocked', reason: reason || null,
    conductorChanges: conductorChangesBetween(previous, proposal),
    routeChanges: keyedChanges(candidateRouteRows(previous), candidateRouteRows(proposal), row => row.id, row => ({ status: row.status, totalLength: row.totalLength, segments: row.segments })),
    racewayChanges: keyedChanges(candidateRacewayRows(previous), candidateRacewayRows(proposal), row => row.racewayId || row.trayId || row.id, row => ({ kind: row.kind || null, status: row.status || null, conduitType: row.conduitType || null, tradeSize: row.tradeSize || null, cableIds: row.cableIds || null, utilizationPercent: row.utilizationPercent ?? null, fillPercent: row.fillPercent ?? null, cableAreaIn2: row.cableAreaIn2 ?? null, internalAreaIn2: row.internalAreaIn2 ?? null, fillLimit: row.fillLimit ?? null, conductorOdsIn: row.conductorOdsIn || null, used: row.used ?? null, allowable: row.allowable ?? null, cableCount: row.cableCount ?? null })),
    protectionChanges: keyedChanges(candidateProtectionRows(previous), candidateProtectionRows(proposal), row => row.id, row => ({ method: row.method, device: row.device, requirementA: row.requirementA })),
    nestedRevisions: nestedRevisionRows(proposal),
    requestedConductorFloors: Object.fromEntries(Object.entries(requestedConductorFloors || {}).sort(([left], [right]) => left.localeCompare(right))),
    requestedFeederFloors: Object.fromEntries(Object.entries(requestedFeederFloors || {}).sort(([left], [right]) => left.localeCompare(right))),
    feederLoadBindings: (proposal?.panels || []).map(panel => ({ feederCableId: `F-${panel.id}`, loadIds: [...new Set((panel.loadIds || []).map(id => String(id)))].sort() })).sort((left, right) => left.feederCableId.localeCompare(right.feederCableId)),
    thermalStatus: thermal?.status || 'blocked', thermalComparison: thermal?.comparison || 'not-evaluated',
    worstCase: summarizeDesignSynthesisCableFaultWorstCase(thermal?.worstCase),
  };
}

function proposalPhysicalReady(proposal, input) {
  if (proposal.studyValidation?.status !== 'pass') return false;
  if (proposal.loads?.some(load => load.motor) && proposal.motorStartingValidation?.status !== 'pass') return false;
  const acceleration = proposal.motorAccelerationValidation;
  if (acceleration && acceleration.status !== 'not-requested' && (acceleration.status === 'blocked' || accelerationNeedsRevision(acceleration).length)) return false;
  if (input?.faultStudy !== undefined && proposal.faultStudyValidation?.status !== 'evaluated') return false;
  if (input?.faultEvolution !== undefined && proposal.faultEvolutionValidation?.status !== 'evaluated') return false;
  return !(proposal.issues || []).some(item => item?.severity === 'blocking' && !['CABLE_FAULT_WITHSTAND_LIMIT_EXCEEDED', 'MOTOR_PROTECTION_UNRESOLVED'].includes(item.code));
}

function proposalIsTrialable(proposal, input) {
  return proposal?.cableFaultWithstandValidation?.status === 'evaluated'
    && proposal.cableFaultWithstandValidation.comparison === 'fail'
    && proposalPhysicalReady(proposal, input);
}

function generateDesignProposalCandidate(input = {}, internalOptions = {}) {
  const { proposal } = generateDesignProposalWithDistributionPartition(input, internalOptions);
  proposal.cableCatalogSource = structuredClone(SOUTHWIRE_MC_SOURCE);
  const accelerationShape = validateDesignSynthesisMotorAccelerationInputs({ equipment: input?.equipment, criteria: input?.criteria || {} });
  let motorAccelerationValidation = proposal.motorAccelerationValidation || evaluateDesignSynthesisMotorAcceleration(proposal, input?.criteria || {});
  if (accelerationShape.requested && !proposal.loads?.length) {
    motorAccelerationValidation = {
      ...motorAccelerationValidation,
      status: 'blocked',
      cases: [],
      issues: [
        ...accelerationShape.issues,
        { code: 'ACCELERATION_NETWORK_NOT_GENERATED', path: 'motorAcceleration', message: 'Acceleration was requested, but input validation or proposal generation did not produce a finalized network for numerical evaluation.', severity: 'blocking' },
      ],
      coverage: { status: 'incomplete', suppliedMotorCount: (input.equipment || []).filter(item => item?.motor && typeof item.motor === 'object').length, evaluatedMotorCount: 0 },
    };
  }
  if (!motorAccelerationValidation.revision) motorAccelerationValidation = { ...motorAccelerationValidation, revision: {
    status: accelerationShape.requested ? 'stopped' : 'not-needed', history: [],
    stopReason: accelerationShape.requested ? (motorAccelerationValidation.status === 'blocked' ? 'acceleration-study-blocked' : 'network-not-generated') : null,
  } };
  proposal.motorAccelerationValidation = motorAccelerationValidation;
  if (motorAccelerationValidation.status !== 'not-requested' && Array.isArray(proposal.report?.limitations)) {
    proposal.report.limitations = proposal.report.limitations.map(item => item.includes('Acceleration, thermal starting withstand, overload coordination, and motor fault contribution are unevaluated.')
      ? `Motor branch conductor design uses a referenced full-load current at 125%; DOL starting uses a balanced constant-impedance locked-rotor voltage screen. The optional supplied-curve acceleration screen is ${motorAccelerationValidation.status}; thermal starting withstand, overload coordination, and motor fault contribution remain unevaluated.`
      : item);
  }
  if (motorAccelerationValidation.status !== 'not-requested') {
    const durationFailed = (motorAccelerationValidation.cases || []).some(item => item.criterionStatus === 'fail');
    const caseFailed = (motorAccelerationValidation.cases || []).some(item => item.status === 'fail');
    const failed = motorAccelerationValidation.status === 'blocked' || durationFailed || caseFailed;
    const criterionApplied = motorAccelerationValidation.cases?.some(item => item.criterionStatus === 'pass' || item.criterionStatus === 'fail');
    proposal.checks = (proposal.checks || []).filter(item => item.id !== 'motorAcceleration');
    proposal.checks.push({ id: 'motorAcceleration', status: failed ? 'fail' : criterionApplied ? 'pass' : 'unevaluated', evidence: motorAccelerationValidation });
    const accelerationIssues = [...(motorAccelerationValidation.issues || [])];
    for (const item of motorAccelerationValidation.cases || []) {
      if (item.status === 'fail' && !item.issues?.length) accelerationIssues.push({ code: 'MOTOR_ACCELERATION_STALLED', path: `motorAcceleration.${item.motorId}`, message: `${item.motorId} did not reach the supplied target speed because available motor torque did not exceed load torque.` });
      if (item.criterionStatus === 'fail') accelerationIssues.push({ code: 'MOTOR_ACCELERATION_TIME_LIMIT_EXCEEDED', path: `motorAcceleration.${item.motorId}`, message: `${item.motorId} acceleration time ${item.timeS} s exceeds the supplied maximum ${motorAccelerationValidation.criteria?.maximumTimeS} s.` });
    }
    if (failed && !accelerationIssues.length) accelerationIssues.push({ code: 'MOTOR_ACCELERATION_BLOCKED', path: 'motorAcceleration', message: 'The requested motor acceleration evaluation is blocked or did not meet the supplied duration criterion.' });
    for (const item of accelerationIssues) {
      if (!proposal.issues.some(existing => existing.code === item.code && existing.path === item.path)) proposal.issues.push(issue(item.code, item.message, 'blocking', item.path || 'motorAcceleration'));
    }
    if (failed) {
      proposal.status = 'blocked';
      proposal.distributionBaseline = null;
      const disposition = buildDesignSynthesisLoadDispositions(input, { issues: proposal.issues });
      proposal.loadDispositions = disposition.loadDispositions;
      proposal.globalBlockingIssues = disposition.globalBlockingIssues;
    }
    if (proposal.summary) proposal.summary.blockedCount = proposal.issues.filter(item => item.severity === 'blocking').length;
  }
  const motorThermalValidation = evaluateDesignSynthesisMotorThermal(proposal, motorAccelerationValidation, { equipment: input?.equipment, criteria: input?.criteria || {} });
  proposal.motorThermalValidation = motorThermalValidation;
  if (motorThermalValidation.status !== 'not-requested') {
    const thermalFailed = motorThermalValidation.status === 'blocked' || motorThermalValidation.status === 'fail'
      || (motorThermalValidation.cases || []).some(item => item.status === 'blocked' || item.status === 'fail');
    proposal.checks = (proposal.checks || []).filter(item => item.id !== 'motorThermal');
    proposal.checks.push({ id: 'motorThermal', status: thermalFailed ? 'fail' : 'pass', evidence: motorThermalValidation });
    const thermalIssues = [...(motorThermalValidation.issues || [])];
    if (thermalFailed && !thermalIssues.length) thermalIssues.push({ code: 'REM610_SCREEN_FAILED', path: 'motorThermal', message: 'The requested REM610 DOL start-setting screen is blocked or has no tolerance-aware feasible setting.' });
    proposal.issues.push(...thermalIssues.map(item => issue(item.code || 'REM610_SCREEN_BLOCKED', item.message || 'REM610 thermal screen is blocked.', 'blocking', item.path || 'motorThermal'))
      .filter(item => !proposal.issues.some(existing => existing.code === item.code && existing.path === item.path)));
    if (thermalFailed) {
      proposal.status = 'blocked';
      proposal.distributionBaseline = null;
      const disposition = buildDesignSynthesisLoadDispositions(input, { issues: proposal.issues });
      proposal.loadDispositions = disposition.loadDispositions;
      proposal.globalBlockingIssues = disposition.globalBlockingIssues;
    }
    if (proposal.summary) proposal.summary.blockedCount = proposal.issues.filter(item => item.severity === 'blocking').length;
  }
  const motorProtectionTimingValidation = evaluateDesignSynthesisMotorProtectionTiming(proposal, motorAccelerationValidation, { equipment: input?.equipment || [], criteria: input?.criteria || {} });
  proposal.motorProtectionTimingValidation = motorProtectionTimingValidation;
  if (motorProtectionTimingValidation.status !== 'not-requested') {
    const failed = motorProtectionTimingValidation.status === 'blocked' || motorProtectionTimingValidation.status === 'fail';
    proposal.checks = (proposal.checks || []).filter(item => item.id !== 'motorProtectionTiming');
    proposal.checks.push({ id: 'motorProtectionTiming', status: failed ? 'fail' : 'pass', evidence: motorProtectionTimingValidation });
    const timingIssues = [...(motorProtectionTimingValidation.issues || []), ...(motorProtectionTimingValidation.cases || []).flatMap(item => item.issues || [])];
    if (motorProtectionTimingValidation.status === 'fail' && !timingIssues.length) timingIssues.push({ code: 'MOTOR_PROTECTION_TIMING_LIMIT_FAILED', path: 'motorProtectionTiming', message: 'The supplied reference-current startup or selected-state safe-stall comparison failed.' });
    proposal.issues.push(...timingIssues.map(item => issue(item.code || 'MOTOR_PROTECTION_TIMING_BLOCKED', item.message || 'Reference-current protection timing comparison is blocked.', 'blocking', item.path || 'motorProtectionTiming'))
      .filter(item => !proposal.issues.some(existing => existing.code === item.code && existing.path === item.path)));
    if (failed) {
      proposal.status = 'blocked'; proposal.distributionBaseline = null;
      const disposition = buildDesignSynthesisLoadDispositions(input, { issues: proposal.issues });
      proposal.loadDispositions = disposition.loadDispositions; proposal.globalBlockingIssues = disposition.globalBlockingIssues;
    }
    if (proposal.summary) proposal.summary.blockedCount = proposal.issues.filter(item => item.severity === 'blocking').length;
  }
  if (input?.faultScenarios !== undefined) {
    const faultScenarioValidation = evaluateDesignSynthesisFaultScenarios({ proposal, faultScenarios: input.faultScenarios });
    if (input.faultStudy !== undefined && !faultScenarioValidation.issues.some(item => item.code === 'FAULT_SCENARIO_LEGACY_CONFLICT')) {
      faultScenarioValidation.issues.push({ code: 'FAULT_SCENARIO_LEGACY_CONFLICT', path: 'faultScenarios', message: 'faultScenarios and the legacy faultStudy input are mutually exclusive.', severity: 'blocking' });
      faultScenarioValidation.status = 'blocked';
      faultScenarioValidation.busEnvelopes = [];
      faultScenarioValidation.deviceEnvelopes = [];
      faultScenarioValidation.coverage.status = 'incomplete';
    }
    proposal.faultScenarios = structuredClone(input.faultScenarios);
    proposal.faultScenarioValidation = faultScenarioValidation;
    proposal.inputSignature = stableSignature({ proposalInputSignature: proposal.inputSignature, faultScenarios: input.faultScenarios });
    const ratingIssueCodes = ['DEVICE_FAULT_SCREEN_RATING_EXCEEDED', 'DEVICE_FAULT_SCREEN_CITED_COMBINATION_VALUE_EXCEEDED'];
    const ratingExceeded = faultScenarioValidation.scenarios.some(row => row.deviceFaultValidation?.issues?.some(item => ratingIssueCodes.includes(item.code)));
    const failed = faultScenarioValidation.status !== 'evaluated' || ratingExceeded;
    proposal.checks = (proposal.checks || []).filter(item => item.id !== 'faultScenarios');
    proposal.checks.push({ id: 'faultScenarios', status: failed ? 'fail' : 'pass', evidence: faultScenarioValidation });
    if (failed) {
      const scenarioIssues = [...faultScenarioValidation.issues];
      for (const row of faultScenarioValidation.scenarios) {
        for (const item of row.deviceFaultValidation?.issues || []) if (ratingIssueCodes.includes(item.code)) scenarioIssues.push({ code: item.code, path: `faultScenarios.${row.id}.${item.path}`, message: item.message });
      }
      if (!scenarioIssues.length) scenarioIssues.push({ code: 'FAULT_SCENARIOS_BLOCKED', path: 'faultScenarios', message: 'The requested source scenario comparison is incomplete or exceeds a proposed breaker rating.' });
      proposal.issues.push(...scenarioIssues.map(item => issue(item.code || 'FAULT_SCENARIOS_BLOCKED', item.message || 'The source scenario comparison is blocked.', 'blocking', item.path || 'faultScenarios')).filter(item => !proposal.issues.some(existing => existing.code === item.code && existing.path === item.path)));
      proposal.status = 'blocked';
      proposal.distributionBaseline = null;
      const inputCompleteness = proposal.checks.find(item => item.id === 'inputCompleteness');
      if (inputCompleteness) { inputCompleteness.status = 'fail'; inputCompleteness.evidence = { ...(inputCompleteness.evidence || {}), blockingIssueCount: proposal.issues.filter(item => item.severity === 'blocking').length }; }
      const disposition = buildDesignSynthesisLoadDispositions(input, { issues: proposal.issues });
      proposal.loadDispositions = disposition.loadDispositions;
      proposal.globalBlockingIssues = disposition.globalBlockingIssues;
      if (proposal.summary) { proposal.summary.generatedLoadCount = 0; proposal.summary.blockedCount = proposal.issues.filter(item => item.severity === 'blocking').length; }
      (proposal.panelLocationOverrides || []).forEach(row => { if (row.requestedLocation) row.status = 'blocked'; });
    }
    if (proposal.report?.limitations && !proposal.report.limitations.some(item => item.includes('supplied operating scenarios'))) proposal.report.limitations.push('Supplied fault scenarios compare only the stated initial symmetrical RMS cases; their envelopes are not standards-derived maximum or minimum fault conditions, and protection adequacy remains unevaluated.');
    if (input?.faultEvolution !== undefined) attachFaultEvolutionValidation(proposal, input, { forcedIssue: { code: 'FAULT_EVOLUTION_SCENARIO_CONFLICT', path: 'faultEvolution', message: 'faultEvolution requires one explicit faultStudy and cannot be combined with faultScenarios.', severity: 'blocking' } });
    if (input?.cableFaultWithstand !== undefined) attachCableFaultWithstandValidation(proposal, input);
    return proposal;
  }
  if (input?.faultStudy === undefined) {
    if (input?.faultEvolution !== undefined) attachFaultEvolutionValidation(proposal, input);
    if (input?.cableFaultWithstand !== undefined) attachCableFaultWithstandValidation(proposal, input);
    return proposal;
  }
  const faultStudyValidation = evaluateDesignSynthesisFaultStudy({ proposal, faultStudy: input.faultStudy });
  proposal.faultStudy = structuredClone(input.faultStudy);
  proposal.faultStudyValidation = faultStudyValidation;
  proposal.inputSignature = stableSignature({ proposalInputSignature: proposal.inputSignature, faultStudy: input.faultStudy });
  proposal.checks = (proposal.checks || []).filter(item => item.id !== 'faultStudy');
  proposal.checks.push({ id: 'faultStudy', status: faultStudyValidation.status === 'evaluated' ? 'pass' : 'fail', evidence: faultStudyValidation });
  if (faultStudyValidation.status !== 'evaluated') {
    const faultIssues = (faultStudyValidation.issues || []).map(item => issue(item.code || 'FAULT_STUDY_BLOCKED', item.message || 'Explicit fault study is blocked.', 'blocking', item.path || 'faultStudy'));
    if (!faultIssues.length) faultIssues.push(issue('FAULT_STUDY_BLOCKED', 'The explicit initial symmetrical RMS fault study is blocked.', 'blocking', 'faultStudy'));
    proposal.issues.push(...faultIssues.filter(item => !proposal.issues.some(existing => existing.code === item.code && existing.path === item.path)));
    proposal.status = 'blocked';
    proposal.distributionBaseline = null;
    const disposition = buildDesignSynthesisLoadDispositions(input, { issues: proposal.issues });
    proposal.loadDispositions = disposition.loadDispositions;
    proposal.globalBlockingIssues = disposition.globalBlockingIssues;
    if (proposal.summary) {
      proposal.summary.generatedLoadCount = 0;
      proposal.summary.blockedCount = proposal.issues.filter(item => item.severity === 'blocking').length;
    }
    (proposal.panelLocationOverrides || []).forEach(row => { if (row.requestedLocation) row.status = 'blocked'; });
  }
  const deviceFaultValidation = evaluateDesignSynthesisDeviceFaultScreen({ proposal, faultStudyValidation });
  proposal.deviceFaultValidation = deviceFaultValidation;
  proposal.checks = (proposal.checks || []).filter(item => item.id !== 'deviceFaultScreen');
  const deviceRatingExceeded = deviceFaultValidation.placements.some(placement =>
    placement.comparisons?.lineTerminalAvailableInitialRms?.status === 'exceeds-rating' ||
    placement.comparisons?.maximumThroughDeviceInitialRms?.status === 'exceeds-rating' ||
    placement.comparisons?.citedMotorCombinationInitialRms?.status === 'above-cited-value');
  proposal.checks.push({ id: 'deviceFaultScreen', status: deviceRatingExceeded ? 'fail' : 'unevaluated', evidence: deviceFaultValidation });
  if (deviceRatingExceeded) {
    const exceededIssues = (deviceFaultValidation.issues || []).filter(item => ['DEVICE_FAULT_SCREEN_RATING_EXCEEDED', 'DEVICE_FAULT_SCREEN_CITED_COMBINATION_VALUE_EXCEEDED'].includes(item.code))
      .map(item => issue(item.code, item.message, 'blocking', item.path || 'deviceFaultValidation'));
    proposal.issues.push(...exceededIssues.filter(item => !proposal.issues.some(existing => existing.code === item.code && existing.path === item.path)));
    proposal.status = 'blocked';
    proposal.distributionBaseline = null;
    const inputCompleteness = proposal.checks.find(item => item.id === 'inputCompleteness');
    if (inputCompleteness) {
      inputCompleteness.status = 'fail';
      inputCompleteness.evidence = { ...(inputCompleteness.evidence || {}), blockingIssueCount: proposal.issues.filter(item => item.severity === 'blocking').length };
    }
    const disposition = buildDesignSynthesisLoadDispositions(input, { issues: proposal.issues });
    proposal.loadDispositions = disposition.loadDispositions;
    proposal.globalBlockingIssues = disposition.globalBlockingIssues;
    if (proposal.summary) {
      proposal.summary.generatedLoadCount = 0;
      proposal.summary.blockedCount = proposal.issues.filter(item => item.severity === 'blocking').length;
    }
    (proposal.panelLocationOverrides || []).forEach(row => { if (row.requestedLocation) row.status = 'blocked'; });
  }
  if (input?.faultEvolution !== undefined) attachFaultEvolutionValidation(proposal, input, { faultStudyValidation, deviceFaultValidation });
  if (input?.cableFaultWithstand !== undefined) attachCableFaultWithstandValidation(proposal, input);
  if (proposal.report?.limitations) {
    proposal.report.limitations = proposal.report.limitations.map(item => item === 'No short-circuit calculation, protection coordination, or device settings study are performed.'
      ? 'No complete short-circuit duty, protection coordination, protective clearing, or device settings study is performed; this initial symmetrical RMS screen does not satisfy protection requirements.'
      : item);
  }
  return proposal;
}

export function generateDesignProposal(input = {}, options = {}) {
  let projectTrayReuseEligible = false;
  if (input?.projectTrayAdoption && options?.projectTraySource) {
    try {
      projectTrayReuseEligible = validateProjectTrayHandoff({ ...options.projectTraySource, adoption: input.projectTrayAdoption, corridors: input.corridors }).ok
        && validateProjectTrayReuseBinding(input).ok;
    } catch { projectTrayReuseEligible = false; }
  }
  const original = generateDesignProposalCandidate(input, { revisionOffset: 0, projectTrayReuseEligible });
  if (input?.cableFaultWithstand === undefined) return original;

  const criteria = input?.criteria || {};
  const maxRevisions = Number.isInteger(criteria.loadFlow?.maxRevisions) ? criteria.loadFlow.maxRevisions : 12;
  let current = original;
  let used = maxRevisionUsed(current, 0);
  let outerOperatingCurrentFloors = retainedOperatingCurrentFloors(current);
  let stopReason = null;
  const history = [revisionEntry({ kind: 'baseline', revision: 0, previous: current, proposal: current,
    reason: current.cableFaultWithstandValidation?.comparison === 'pass' ? 'initial finalized candidate passes the requested cable screen' : 'initial finalized candidate evaluation' })];
  const initialCableSizes = (current.cables || []).map(cable => ({ cableId: String(cable.id), size: cable.conductor_size || null, stockId: cable.cableStockId || null })).sort((left, right) => left.cableId.localeCompare(right.cableId));

  if (current.cableFaultWithstandValidation?.status === 'evaluated' && current.cableFaultWithstandValidation.comparison === 'pass') stopReason = proposalPhysicalReady(current, input) ? 'thermal-limit-passed' : 'independent-study-or-design-constraint-blocked';
  else if (current.cableFaultWithstandValidation?.status !== 'evaluated') stopReason = 'thermal-evaluation-incomplete';
  else if (!proposalPhysicalReady(current, input)) stopReason = 'independent-study-or-design-constraint-blocked';

  while (!stopReason) {
    if (used >= maxRevisions) { stopReason = 'revision-budget-exhausted'; break; }
    if (!proposalIsTrialable(current, input)) { stopReason = 'independent-study-or-design-constraint-blocked'; break; }

    const failedCableIds = [...new Set((current.cableFaultWithstandValidation.cases || [])
      .filter(row => row.comparison === 'fail').map(row => String(row.cableId)))].sort();
    if (!failedCableIds.length) { stopReason = 'no-failed-cable-identity'; break; }
    const floors = Object.fromEntries((current.cables || []).filter(cable => cable?.conductor_size).map(cable => [String(cable.id), cable.conductor_size]));
    let unavailableId = null;
    for (const cableId of failedCableIds) {
      const cable = current.cables.find(row => String(row.id) === cableId);
      const nextSize = nextSourcedConductorSize(cable);
      if (!cable || !nextSize) { unavailableId = cableId; break; }
      floors[cableId] = nextSize;
    }
    if (unavailableId) { stopReason = `no-larger-sourced-conductor:${unavailableId}`; break; }

    const candidateRevision = used + 1;
    const previous = current;
    const feederFloors = floorForEachFeederLoad(previous);
    const candidate = generateDesignProposalCandidate(input, {
      revisionOffset: candidateRevision,
      projectTrayReuseEligible,
      conductorSizeFloors: floors,
      operatingCurrentFloors: mergeOperatingCurrentFloors(outerOperatingCurrentFloors, retainedOperatingCurrentFloors(previous)),
      feederFloorByLoad: feederFloors,
      transformerMinimumKVA: previous.transformer?.ratedKVA ?? undefined,
    });
    const entry = revisionEntry({ kind: 'conductor-candidate', revision: candidateRevision, previous, proposal: candidate,
      requestedConductorFloors: floors, requestedFeederFloors: feederFloors,
      reason: candidate.issues?.find(item => item.severity === 'blocking' && !['MOTOR_PROTECTION_UNRESOLVED', 'CABLE_FAULT_WITHSTAND_LIMIT_EXCEEDED'].includes(item.code))?.message || null });
    history.push(entry);
    current = candidate;
    outerOperatingCurrentFloors = mergeOperatingCurrentFloors(outerOperatingCurrentFloors, retainedOperatingCurrentFloors(current));
    used = maxRevisionUsed(current, candidateRevision);

    if (used > maxRevisions) {
      stopReason = 'revision-budget-exhausted';
      break;
    }
    if (current.cableFaultWithstandValidation?.status === 'evaluated' && current.cableFaultWithstandValidation.comparison === 'pass') {
      stopReason = proposalPhysicalReady(current, input) ? 'thermal-limit-passed' : 'candidate-design-constraint-blocked';
      break;
    }
    if (current.cableFaultWithstandValidation?.status !== 'evaluated') { stopReason = 'candidate-screen-incomplete'; break; }
    if (!proposalPhysicalReady(current, input)) { stopReason = 'candidate-design-constraint-blocked'; break; }
    if (maxRevisionUsed(current) >= maxRevisions) { stopReason = 'revision-budget-exhausted'; break; }
  }

  if (used > maxRevisions) stopReason = 'absolute-revision-budget-exceeded';
  current.cableFaultWithstandRevision = {
    schemaVersion: '1.0.0',
    status: stopReason === 'thermal-limit-passed' && current.cableFaultWithstandValidation?.status === 'evaluated' && current.cableFaultWithstandValidation.comparison === 'pass' ? 'complete' : 'stopped',
    revisionBudget: { maximum: maxRevisions, used, remaining: Math.max(0, maxRevisions - used) },
    stopReason,
    initialCableSizes,
    finalBinding: buildDesignSynthesisCableFaultWithstandRevisionBinding(current),
    history,
  };
  if (current.cableFaultWithstandRevision.status === 'stopped') {
    const message = `Automatic conductor trials stopped: ${stopReason}. The current candidate remains blocked if its requested thermal comparison or another required design constraint has not passed.`;
    if (!(current.issues || []).some(item => item.code === 'CABLE_FAULT_WITHSTAND_REVISION_STOPPED')) current.issues.push(issue('CABLE_FAULT_WITHSTAND_REVISION_STOPPED', message, 'blocking', 'cableFaultWithstandRevision'));
    if (used > maxRevisions && !(current.issues || []).some(item => item.code === 'CABLE_FAULT_WITHSTAND_REVISION_BUDGET_EXCEEDED')) current.issues.push(issue('CABLE_FAULT_WITHSTAND_REVISION_BUDGET_EXCEEDED', `Actual nested study revision ${used} exceeded the shared absolute limit ${maxRevisions}; no result may pass under the overrun.`, 'blocking', 'cableFaultWithstandRevision.revisionBudget'));
    current.status = 'blocked';
    current.distributionBaseline = null;
    const disposition = buildDesignSynthesisLoadDispositions(input, { issues: current.issues });
    current.loadDispositions = disposition.loadDispositions;
    current.globalBlockingIssues = disposition.globalBlockingIssues;
    if (current.summary) {
      current.summary.generatedLoadCount = 0;
      current.summary.blockedCount = current.issues.filter(item => item.severity === 'blocking').length;
    }
  }
  return current;
}


export default { generateDesignProposal };
