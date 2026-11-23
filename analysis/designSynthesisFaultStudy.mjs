import { solvePositiveSequenceBoltedFault } from './faultNetwork.mjs';
import { sourcedCableImpedance } from './designSynthesisCableCatalog.mjs';
import { listTransformerProfiles } from './designSynthesisTransformers.mjs';
import { fingerprintStudyValue } from './studyLifecycle.mjs';

const METHOD = 'design-synthesis-explicit-positive-sequence-network-v1';
const SCOPE = 'initial-symmetrical-rms-only';
const SQRT3 = Math.sqrt(3);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(1e-12, Math.max(Math.abs(a), Math.abs(b)) * 1e-9);

function issue(code, path, message) { return { code, path, message, severity: 'blocking' }; }
function rejectUnknownKeys(value, allowed, path, issues) {
  if (!object(value)) return;
  for (const key of Object.keys(value)) if (!allowed.includes(key)) issues.push(issue('FAULT_STUDY_UNKNOWN_FIELD', `${path}.${key}`, 'Field is not part of the explicit fault-study input contract.'));
}

function proposalFingerprintContext(proposal) {
  const equipment = Array.isArray(proposal?.equipment) ? proposal.equipment : [];
  const cables = Array.isArray(proposal?.cables) ? proposal.cables : [];
  return {
    equipment: equipment.map(item => ({ id: item?.id, type: item?.type, voltage: item?.voltage, phases: item?.phases, profileId: item?.profileId, profileRevision: item?.profileRevision, ratedKVA: item?.ratedKVA, primaryBusId: item?.primaryBusId, secondaryBusId: item?.secondaryBusId, seriesModel: item?.seriesModel })),
    cables: cables.map(item => ({ id: item?.id, from: item?.from, to: item?.to, conductor_size: item?.conductor_size, lengthFt: item?.lengthFt, r_ohm_per_kft: item?.r_ohm_per_kft, x_ohm_per_kft: item?.x_ohm_per_kft, impedanceBasis: item?.impedanceBasis })),
    transformer: proposal?.transformer || null,
    oneLine: proposal?.oneLine || null,
  };
}

function blocked(faultStudy, issues, proposal, extra = {}) {
  return {
    status: 'blocked', method: METHOD, scope: SCOPE,
    modelInputFingerprint: fingerprintStudyValue({ faultStudy, proposalContext: proposalFingerprintContext(proposal) }),
    sourceInventory: object(faultStudy?.sourceInventory) ? { ...faultStudy.sourceInventory, verificationStatus: 'not-verified' } : null,
    coverage: extra.coverage || { status: 'incomplete', expectedEquipmentIds: [], suppliedEquipmentIds: [], missingEquipmentIds: [], extraEquipmentIds: [] },
    cases: [], issues,
    limitations: [
      'This explicit initial symmetrical RMS study does not establish protection coordination, peak or interrupting duty, thermal duty, or code compliance.',
      'Source inventory metadata is supplied by the user and is not independently verified; missing source contributions are not modeled as zero.',
    ],
  };
}

function oneLineIndex(proposal, issues) {
  const sheets = proposal?.oneLine?.sheets;
  if (!Array.isArray(sheets) || sheets.length !== 1 || !Array.isArray(sheets[0]?.components) || !Array.isArray(sheets[0]?.connections)) {
    issues.push(issue('FAULT_STUDY_ONELINE_COVERAGE', 'oneLine', 'The finalized proposal must contain one canonical one-line sheet with components and connections.'));
    return { components: new Map(), connections: [] };
  }
  const components = new Map();
  for (const component of sheets[0].components) {
    if (!text(component?.id) || components.has(component.id)) {
      issues.push(issue('FAULT_STUDY_ONELINE_IDENTITY', 'oneLine.sheets[0].components', 'One-line component identities must be non-empty and unique.'));
      continue;
    }
    components.set(component.id, component);
  }
  const equipmentIds = new Set((Array.isArray(proposal?.equipment) ? proposal.equipment : []).map(item => String(item?.id || '')).filter(Boolean));
  for (const id of components.keys()) if (!equipmentIds.has(id)) issues.push(issue('FAULT_STUDY_ONELINE_EXTRA_COMPONENT', `oneLine.${id}`, 'One-line components must map to generated canonical equipment records.'));
  for (const id of equipmentIds) if (!components.has(id)) issues.push(issue('FAULT_STUDY_ONELINE_COMPONENT_MISSING', `oneLine.${id}`, 'Every generated canonical equipment record must be represented by a one-line component.'));
  if (components.size !== equipmentIds.size) issues.push(issue('FAULT_STUDY_ONELINE_COMPONENT_COVERAGE', 'oneLine.sheets[0].components', 'One-line and generated equipment component counts must match exactly.'));
  return { components, connections: sheets[0].connections };
}

/** Build the strict canonical network once so initial and temporal studies share identical topology checks. */
export function buildDesignSynthesisFaultNetwork({ proposal, faultStudy } = {}) {
  const issues = [];
  const original = proposal?.inputs?.original;
  const supply = original?.supply;
  if (!object(faultStudy)) return blocked(faultStudy, [issue('FAULT_STUDY_MISSING', 'faultStudy', 'An explicit faultStudy object is required.')], proposal);
  rejectUnknownKeys(faultStudy, ['networkBaseMVA', 'sourceInventory', 'sources', 'faultBusIds', 'transformerPhase'], 'faultStudy', issues);
  if (!finite(faultStudy.networkBaseMVA) || faultStudy.networkBaseMVA <= 0) issues.push(issue('FAULT_STUDY_INVALID_BASE', 'faultStudy.networkBaseMVA', 'networkBaseMVA must be a positive finite number.'));
  if (!object(faultStudy.sourceInventory) || faultStudy.sourceInventory.status !== 'complete' || !text(faultStudy.sourceInventory.reference)) issues.push(issue('FAULT_STUDY_SOURCE_INVENTORY_INCOMPLETE', 'faultStudy.sourceInventory', 'A complete source inventory with a non-empty reference is required; inventory verification remains not verified.'));
  rejectUnknownKeys(faultStudy.sourceInventory, ['status', 'reference'], 'faultStudy.sourceInventory', issues);
  if (!Array.isArray(faultStudy.sources)) issues.push(issue('FAULT_STUDY_SOURCE_ARRAY', 'faultStudy.sources', 'sources must be an explicit array of source equivalents.'));
  if (!Array.isArray(proposal?.equipment) || !Array.isArray(proposal?.loads) || !Array.isArray(proposal?.cables)) issues.push(issue('FAULT_STUDY_PROPOSAL_COVERAGE', 'proposal', 'Finalized equipment, loads, and cables are required.'));
  if (!object(supply) || !finite(supply.voltage) || supply.voltage <= 0 || !finite(supply.phases)) issues.push(issue('FAULT_STUDY_CANONICAL_SUPPLY', 'inputs.original.supply', 'Canonical input supply must contain positive numeric voltage and numeric phases.'));
  if (supply?.phases === 1) issues.push(issue('FAULT_STUDY_UNSUPPORTED_SINGLE_PHASE', 'inputs.original.supply.phases', 'Single-phase fault networks are not supported by the positive-sequence three-phase solver.'));
  else if (supply && supply.phases !== 3) issues.push(issue('FAULT_STUDY_INVALID_SOURCE_PHASES', 'inputs.original.supply.phases', 'The canonical source must be three-phase.'));
  if (!finite(supply?.availableFaultCurrentKA) || supply.availableFaultCurrentKA <= 0) issues.push(issue('FAULT_STUDY_UTILITY_BOUND_MISSING', 'inputs.original.supply.availableFaultCurrentKA', 'The canonical utility availableFaultCurrentKA upper bound must be positive and numeric.'));
  if (!text(supply?.id) && supply?.id !== undefined) issues.push(issue('FAULT_STUDY_UTILITY_ID', 'inputs.original.supply.id', 'The canonical utility equipment id must be a non-empty string when supplied.'));

  const equipment = Array.isArray(proposal?.equipment) ? proposal.equipment : [];
  const loads = Array.isArray(proposal?.loads) ? proposal.loads : [];
  const cables = Array.isArray(proposal?.cables) ? proposal.cables : [];
  const sourceId = String(supply?.id || 'SOURCE');
  const sourceEquipment = equipment.filter(item => item?.type === 'source');
  if (sourceEquipment.length !== 1 || String(sourceEquipment[0]?.id) !== sourceId) issues.push(issue('FAULT_STUDY_UTILITY_EQUIPMENT_MISMATCH', 'equipment', 'Exactly one generated utility source must match the canonical supply id.'));
  const motorIds = loads.filter(load => load?.motor).map(load => String(load.id));
  if (new Set(motorIds).size !== motorIds.length) issues.push(issue('FAULT_STUDY_DUPLICATE_MOTOR_ID', 'loads', 'Generated motor load ids must be unique.'));
  const expectedIds = [sourceId, ...motorIds];
  const supplied = Array.isArray(faultStudy.sources) ? faultStudy.sources : [];
  const suppliedIds = supplied.map(record => String(record?.equipmentId ?? ''));
  const expectedSet = new Set(expectedIds);
  const suppliedSet = new Set(suppliedIds);
  const missingEquipmentIds = expectedIds.filter(id => !suppliedSet.has(id));
  const extraEquipmentIds = suppliedIds.filter(id => !expectedSet.has(id));
  const coverage = { status: missingEquipmentIds.length || extraEquipmentIds.length || suppliedSet.size !== suppliedIds.length ? 'incomplete' : 'complete', expectedEquipmentIds: expectedIds, suppliedEquipmentIds: suppliedIds, missingEquipmentIds, extraEquipmentIds };
  if (missingEquipmentIds.length) issues.push(issue('FAULT_STUDY_SOURCE_COVERAGE_MISSING', 'faultStudy.sources', `Explicit source equivalents are missing for: ${missingEquipmentIds.join(', ')}.`));
  if (extraEquipmentIds.length) issues.push(issue('FAULT_STUDY_SOURCE_COVERAGE_EXTRA', 'faultStudy.sources', `Source equivalents do not map to a utility or generated motor load: ${extraEquipmentIds.join(', ')}.`));
  if (new Set(suppliedIds).size !== suppliedIds.length) issues.push(issue('FAULT_STUDY_SOURCE_DUPLICATE', 'faultStudy.sources', 'Exactly one source equivalent per equipment id is allowed.'));

  const line = oneLineIndex(proposal, issues);
  const buses = [];
  const busById = new Map();
  const busRecords = equipment.filter(item => ['source', 'panel', 'load', 'bus'].includes(item?.type));
  for (const record of busRecords) {
    const id = String(record?.id || '');
    if (!id || busById.has(id)) { issues.push(issue('FAULT_STUDY_BUS_IDENTITY', `equipment.${id}`, 'Generated bus equipment ids must be non-empty and unique.')); continue; }
    const voltage = record.type === 'source' ? supply?.voltage : record.voltage;
    const phases = record.type === 'source' ? supply?.phases : record.phases;
    if (!finite(voltage) || voltage <= 0 || !finite(phases) || phases !== 3) {
      issues.push(issue('FAULT_STUDY_UNSUPPORTED_BUS', `equipment.${id}`, 'Every modeled bus requires positive numeric line-to-line voltage and three phases.'));
      continue;
    }
    const component = line.components.get(id);
    const componentVoltage = component?.physical?.voltage ?? component?.voltage;
    const componentPhases = component?.physical?.phases ?? component?.phases;
    if (!component || !near(componentVoltage, voltage) || componentPhases !== phases) issues.push(issue('FAULT_STUDY_ONELINE_BUS_MISMATCH', `oneLine.${id}`, 'One-line bus voltage/phases must match the finalized canonical equipment record.'));
    const bus = { id, voltageLLV: voltage };
    busById.set(id, bus); buses.push(bus);
  }
  const busIds = new Set(busById.keys());
  if (!busIds.has(sourceId)) issues.push(issue('FAULT_STUDY_UTILITY_BUS_MISSING', 'equipment', 'Canonical utility bus is not present in the finalized bus model.'));

  const connectionByCable = new Map();
  for (const connection of line.connections) {
    const cable = connection?.cable;
    const id = String(cable?.id || connection?.cableId || connection?.id || '');
    if (id && connectionByCable.has(id)) issues.push(issue('FAULT_STUDY_ONELINE_CABLE_DUPLICATE', `oneLine.${id}`, 'One-line cable identities must be unique.'));
    else if (id) connectionByCable.set(id, connection);
  }
  const branches = [];
  for (const [index, cable] of cables.entries()) {
    const id = String(cable?.id || '');
    const path = `cables[${index}]`;
    const from = String(cable?.from || ''); const to = String(cable?.to || '');
    if (!id || !busIds.has(from) || !busIds.has(to)) { issues.push(issue('FAULT_STUDY_CABLE_ENDPOINT', path, 'Every finalized cable must have an identity and connect two modeled buses.')); continue; }
    const lengthFt = cable.lengthFt;
    const catalog = sourcedCableImpedance(cable.conductor_size, lengthFt);
    if (!finite(lengthFt) || lengthFt < 0 || !catalog || !finite(cable.r_ohm_per_kft) || !finite(cable.x_ohm_per_kft) || !near(catalog.r_ohm_per_kft, cable.r_ohm_per_kft) || !near(catalog.x_ohm_per_kft, cable.x_ohm_per_kft) || cable.impedanceBasis !== catalog.source || (cable.length !== undefined && !near(cable.length, lengthFt)) || (cable.conductorSize !== undefined && cable.conductorSize !== cable.conductor_size)) {
      issues.push(issue('FAULT_STUDY_CABLE_IMPEDANCE_UNSUPPORTED', path, 'Cable length and per-kft R/X must match the supported sourced conductor catalog.'));
      continue;
    }
    const fromBus = busById.get(from); const toBus = busById.get(to);
    if (!near(fromBus.voltageLLV, toBus.voltageLLV)) { issues.push(issue('FAULT_STUDY_CABLE_VOLTAGE_BASE_MISMATCH', path, 'Cable endpoints must have the same nominal voltage base.')); continue; }
    const link = connectionByCable.get(id);
    if (!link || String(link.from || link.source || '') !== from || String(link.to || link.target || '') !== to || !link.cable || !near(link.cable.lengthFt, lengthFt) || link.cable.conductor_size !== cable.conductor_size || !near(link.cable.r_ohm_per_kft, cable.r_ohm_per_kft) || !near(link.cable.x_ohm_per_kft, cable.x_ohm_per_kft) || link.cable.impedanceBasis !== cable.impedanceBasis) {
      issues.push(issue('FAULT_STUDY_ONELINE_CABLE_MISMATCH', `${path}.oneLine`, 'One-line connection endpoints and cable R/X/length must match the finalized cable record.'));
      continue;
    }
    branches.push({ id, fromBusId: from, toBusId: to, impedance: { rOhm: catalog.r, xOhm: catalog.x, referenceBusId: from }, tapPu: { re: 1, im: 0 } });
  }
  const expectedCableIds = new Set(cables.map(item => String(item?.id || '')).filter(Boolean));
  for (const id of connectionByCable.keys()) if (!expectedCableIds.has(id)) issues.push(issue('FAULT_STUDY_ONELINE_EXTRA_CABLE', `oneLine.${id}`, 'Every one-line cable connection must map to a finalized generated cable.'));
  for (const id of expectedCableIds) if (!connectionByCable.has(id)) issues.push(issue('FAULT_STUDY_ONELINE_CABLE_MISSING', `oneLine.${id}`, 'Every finalized generated cable must be represented by a one-line connection.'));

  const transformers = equipment.filter(item => item?.type === 'transformer');
  if (transformers.length > 1) issues.push(issue('FAULT_STUDY_TRANSFORMER_COUNT', 'equipment', 'Only the single generated radial transformer is supported.'));
  if (transformers.length && (!object(faultStudy.transformerPhase) || !finite(faultStudy.transformerPhase.degrees) || !text(faultStudy.transformerPhase.reference))) issues.push(issue('FAULT_STUDY_TRANSFORMER_PHASE_REQUIRED', 'faultStudy.transformerPhase', 'A transformer phase angle assumption and non-empty reference are required even when degrees is zero.'));
  rejectUnknownKeys(faultStudy.transformerPhase, ['degrees', 'reference'], 'faultStudy.transformerPhase', issues);
  for (const transformer of transformers) {
    const profile = transformer.seriesModel;
    const proposalTransformer = proposal?.transformer;
    const sourcedProfile = listTransformerProfiles().find(item => item.profileId === transformer.profileId);
    const pri = String(transformer.primaryBusId || ''); const sec = String(transformer.secondaryBusId || '');
    const phase = faultStudy.transformerPhase;
    if (!object(profile) || !sourcedProfile || transformer.profileRevision !== sourcedProfile.profileRevision || !near(profile.rPercent, sourcedProfile.seriesModel.rPercent) || !near(profile.xPercent, sourcedProfile.seriesModel.xPercent) || !near(profile.zPercent, sourcedProfile.seriesModel.zPercent) || !near(profile.xr, sourcedProfile.seriesModel.xr) || !near(profile.sourceBasisKVA, sourcedProfile.seriesModel.sourceBasisKVA) || transformer.ratedKVA !== sourcedProfile.ratedKVA || transformer.primaryVoltageVac !== sourcedProfile.primaryVoltageVac || transformer.secondaryVoltageVac !== sourcedProfile.secondaryVoltageVac || !proposalTransformer || proposalTransformer.id !== transformer.id || proposalTransformer.profileId !== transformer.profileId || proposalTransformer.profileRevision !== transformer.profileRevision || proposalTransformer.ratedKVA !== transformer.ratedKVA || proposalTransformer.primaryVoltageVac !== transformer.primaryVoltageVac || proposalTransformer.secondaryVoltageVac !== transformer.secondaryVoltageVac || proposalTransformer.primaryBusId !== transformer.primaryBusId || proposalTransformer.secondaryBusId !== transformer.secondaryBusId || !near(proposalTransformer.seriesModel?.rPercent, profile.rPercent) || !near(proposalTransformer.seriesModel?.xPercent, profile.xPercent) || !near(proposalTransformer.seriesModel?.zPercent, profile.zPercent) || !near(proposalTransformer.seriesModel?.xr, profile.xr) || !near(proposalTransformer.seriesModel?.sourceBasisKVA, profile.sourceBasisKVA) || !finite(profile.rPercent) || profile.rPercent < 0 || !finite(profile.xPercent) || profile.xPercent < 0 || profile.rPercent + profile.xPercent <= 0 || !finite(profile.sourceBasisKVA) || profile.sourceBasisKVA <= 0 || !finite(transformer.ratedKVA) || transformer.ratedKVA <= 0 || !near(profile.sourceBasisKVA, transformer.ratedKVA) || !finite(transformer.primaryVoltageVac) || !finite(transformer.secondaryVoltageVac) || !busIds.has(pri) || !busIds.has(sec) || !near(busById.get(pri)?.voltageLLV, transformer.primaryVoltageVac) || !near(busById.get(sec)?.voltageLLV, transformer.secondaryVoltageVac)) {
      issues.push(issue('FAULT_STUDY_TRANSFORMER_MODEL_UNSUPPORTED', `equipment.${transformer.id}`, 'Transformer must have a sourced positive-sequence series R/X, matching source basis and rating, and matching primary/secondary nominal bus bases.'));
      continue;
    }
    const component = line.components.get(String(transformer.id));
    const componentModel = component?.physical?.seriesModel;
    const transformerLinks = (component?.connections || []).map(link => String(link?.target || ''));
    if (!component || !componentModel || !near(componentModel.rPercent, profile.rPercent) || !near(componentModel.xPercent, profile.xPercent) || !near(componentModel.zPercent, profile.zPercent) || !near(componentModel.xr, profile.xr) || !near(componentModel.sourceBasisKVA, profile.sourceBasisKVA) || !transformerLinks.includes(pri) || !transformerLinks.includes(sec)) {
      issues.push(issue('FAULT_STUDY_ONELINE_TRANSFORMER_MISMATCH', `oneLine.${transformer.id}`, 'One-line transformer series model and terminal connections must match the finalized transformer record.'));
      continue;
    }
    if (!object(phase) || !finite(phase.degrees) || !text(phase.reference)) continue;
    if (Math.abs(phase.degrees) > 360) {
      issues.push(issue('FAULT_STUDY_TRANSFORMER_PHASE_RANGE', 'faultStudy.transformerPhase.degrees', 'Transformer phase assumption must be within -360 to +360 degrees.'));
      continue;
    }
    const radians = phase.degrees * Math.PI / 180;
    const tapPu = { re: Math.cos(radians), im: Math.sin(radians) };
    const zBase = transformer.primaryVoltageVac ** 2 / (profile.sourceBasisKVA * 1000);
    const rOhm = profile.rPercent / 100 * zBase; const xOhm = profile.xPercent / 100 * zBase;
    if (![zBase, rOhm, xOhm].every(Number.isFinite) || Math.hypot(rOhm, xOhm) <= 0) {
      issues.push(issue('FAULT_STUDY_TRANSFORMER_NUMERIC_RANGE', `equipment.${transformer.id}.seriesModel`, 'Transformer primary-referred impedance is outside the representable positive range.'));
      continue;
    }
    branches.push({ id: String(transformer.id), fromBusId: pri, toBusId: sec, impedance: { rOhm, xOhm, referenceBusId: pri }, tapPu });
  }

  const selectedFaultBuses = faultStudy.faultBusIds === undefined ? [...busIds] : faultStudy.faultBusIds;
  if (!Array.isArray(selectedFaultBuses) || selectedFaultBuses.some(id => !text(id))) issues.push(issue('FAULT_STUDY_FAULT_BUS_LIST', 'faultStudy.faultBusIds', 'faultBusIds must be an array of non-empty bus ids when supplied.'));
  if (Array.isArray(selectedFaultBuses)) {
    if (selectedFaultBuses.length === 0) issues.push(issue('FAULT_STUDY_NO_FAULT_BUSES', 'faultStudy.faultBusIds', 'At least one generated bus fault location is required.'));
    if (new Set(selectedFaultBuses).size !== selectedFaultBuses.length) issues.push(issue('FAULT_STUDY_FAULT_BUS_DUPLICATE', 'faultStudy.faultBusIds', 'faultBusIds must not contain duplicates.'));
    for (const id of selectedFaultBuses) if (!busIds.has(id)) issues.push(issue('FAULT_STUDY_FAULT_BUS_UNKNOWN', 'faultStudy.faultBusIds', `Unknown generated fault bus ${id}.`));
  }

  const sourceRows = [];
  for (const [index, row] of supplied.entries()) {
    const id = text(row?.equipmentId) ? row.equipmentId : '';
    const path = `faultStudy.sources[${index}]`;
    rejectUnknownKeys(row, ['equipmentId', 'emfPhaseV', 'impedance', 'inService', 'reference'], path, issues);
    rejectUnknownKeys(row?.emfPhaseV, ['re', 'im'], `${path}.emfPhaseV`, issues);
    rejectUnknownKeys(row?.impedance, ['rOhm', 'xOhm'], `${path}.impedance`, issues);
    if (!object(row) || !text(id) || !object(row.emfPhaseV) || !finite(row.emfPhaseV.re) || !finite(row.emfPhaseV.im) || Math.hypot(row.emfPhaseV.re, row.emfPhaseV.im) <= 0 || !object(row.impedance) || !finite(row.impedance.rOhm) || row.impedance.rOhm < 0 || !finite(row.impedance.xOhm) || row.impedance.xOhm < 0 || Math.hypot(row.impedance.rOhm, row.impedance.xOhm) <= 0 || typeof row.inService !== 'boolean' || !text(row.reference)) {
      issues.push(issue('FAULT_STUDY_SOURCE_MODEL_INVALID', path, 'Source equivalent requires explicit finite positive EMF, passive nonzero R/X, boolean inService, and a reference.'));
      continue;
    }
    const bus = busById.get(id);
    if (!bus) { issues.push(issue('FAULT_STUDY_SOURCE_BUS_MISMATCH', `${path}.equipmentId`, 'Source equipment id must map directly to an existing generated bus.')); continue; }
    const nominalPhaseV = id === sourceId ? supply.voltage / SQRT3 : Number(loads.find(load => String(load.id) === id)?.motor?.ratedVoltageV) / SQRT3;
    if (!Number.isFinite(nominalPhaseV) || nominalPhaseV <= 0 || !near(Math.hypot(row.emfPhaseV.re, row.emfPhaseV.im), nominalPhaseV)) {
      issues.push(issue('FAULT_STUDY_SOURCE_EMF_BASE_MISMATCH', `${path}.emfPhaseV`, 'Source phase-voltage magnitude must match the canonical utility or motor rated-voltage basis.'));
    }
    if (id === sourceId && row.inService && finite(supply?.availableFaultCurrentKA)) {
      const emf = Math.hypot(row.emfPhaseV.re, row.emfPhaseV.im);
      const z = Math.hypot(row.impedance.rOhm, row.impedance.xOhm);
      const impliedKA = (emf / z) / 1000;
      if (!Number.isFinite(impliedKA) || impliedKA <= 0) issues.push(issue('FAULT_STUDY_UTILITY_IMPLIED_CURRENT_RANGE', path, 'Utility source-only implied current is outside the representable positive range.'));
      else if (impliedKA > supply.availableFaultCurrentKA * (1 + 1e-9)) issues.push(issue('FAULT_STUDY_UTILITY_BOUND_EXCEEDED', path, `Utility source-only implied current ${impliedKA} kA exceeds the declared ${supply.availableFaultCurrentKA} kA upper bound.`));
    }
    sourceRows.push({ id, busId: id, emfPhaseV: { re: row.emfPhaseV.re, im: row.emfPhaseV.im }, impedance: { rOhm: row.impedance.rOhm, xOhm: row.impedance.xOhm }, inService: row.inService, reference: row.reference });
  }
  const coverageIssue = issues.some(item => item.code.startsWith('FAULT_STUDY_SOURCE_COVERAGE') || item.code === 'FAULT_STUDY_SOURCE_DUPLICATE' || item.code === 'FAULT_STUDY_SOURCE_INVENTORY_INCOMPLETE');
  if (issues.length) return blocked(faultStudy, issues, proposal, { coverage: { ...coverage, status: coverageIssue ? 'incomplete' : coverage.status } });

  const modelInputFingerprint = fingerprintStudyValue({ faultStudy, proposalContext: proposalFingerprintContext(proposal), buses, branches, sources: sourceRows, faultBusIds: selectedFaultBuses });
  return {
    status: 'ready', method: METHOD, scope: SCOPE, modelInputFingerprint,
    sourceInventory: { ...faultStudy.sourceInventory, verificationStatus: 'not-verified' },
    coverage: { ...coverage, status: coverage.status === 'complete' ? 'complete' : 'incomplete', modeledBusCount: buses.length, modeledBranchCount: branches.length, modeledSourceCount: sourceRows.length },
    network: { networkBaseMVA: faultStudy.networkBaseMVA, buses, branches, sources: sourceRows, faultBusIds: selectedFaultBuses,
      sourceInventory: { status: faultStudy.sourceInventory.status, reference: faultStudy.sourceInventory.reference } },
    issues: [],
  };
}

/** Adapt the finalized synthesis proposal and explicit study inputs to the strict network solver. */
export function evaluateDesignSynthesisFaultStudy({ proposal, faultStudy } = {}) {
  const built = buildDesignSynthesisFaultNetwork({ proposal, faultStudy });
  if (built.status !== 'ready') return built;
  const { network } = built;
  const cases = network.faultBusIds.map(busId => ({ busId, ...solvePositiveSequenceBoltedFault({ networkBaseMVA: network.networkBaseMVA, buses: network.buses, branches: network.branches, sources: network.sources, fault: { busId, type: 'three-phase-bolted' }, sourceInventory: network.sourceInventory }) }));
  const solverIssues = cases.flatMap(item => item.issues || []);
  const status = cases.length > 0 && cases.every(item => item.status === 'evaluated') ? 'evaluated' : 'blocked';
  return {
    status, method: METHOD, scope: SCOPE,
    modelInputFingerprint: built.modelInputFingerprint,
    sourceInventory: built.sourceInventory,
    coverage: built.coverage,
    cases, issues: solverIssues.map(item => ({ ...item, severity: 'blocking' })),
    limitations: [
      'Balanced positive-sequence, three-phase bolted fault; results are initial symmetrical RMS values for the explicitly modeled network only.',
      'Does not calculate minimum or maximum studies, peak or interrupting duty, thermal duty, protective clearing, motor decay, or code compliance.',
      'Source inventory status and reference are supplied metadata and have not been independently verified.',
      ...((proposal?.equipment || []).some(item => item?.type === 'transformer') ? ['Transformer clock displacement was not inferred; the supplied referenced phase assumption is applied as an ideal complex tap. Magnetizing current and phase-sensitive duties are not evaluated.'] : []),
      'External utility fault-current bound applies only to the utility equivalent and is not compared with total motor-plus-utility fault contribution.',
    ],
  };
}

export default { buildDesignSynthesisFaultNetwork, evaluateDesignSynthesisFaultStudy };
