import { fingerprintStudyValue } from './studyLifecycle.mjs';
import { validateDesignSynthesisMotorInputs } from './designSynthesisMotors.mjs';
import { indicatesDesignSynthesisMotor, hasUnsupportedDesignSynthesisStarter } from './designSynthesisMotorClassification.mjs';

export const PROJECT_EQUIPMENT_ADOPTION_SCHEMA = 'design-synthesis-project-equipment-v1';

const clean = value => String(value ?? '').trim();
function numericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}
const finite = value => numericValue(value) !== null;
const comparable = value => JSON.stringify(value ?? null);

function issue(code, message, identity = null) {
  return { code, message, ...(identity ? { identity } : {}) };
}

function isGenerated(record) {
  return Boolean(record?._designSynthesis?.identity || record?._designSynthesis?.source === 'design-synthesis');
}

export function isExcludedProjectEquipmentClass(value) {
  const words = clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  return words.some(word => ['source', 'utilitysource', 'mainsource', 'panel', 'distributionpanel', 'panelboard', 'bus', 'busbar', 'transformer'].includes(word));
}

function declaredElectricalBases(record) {
  return ['ratingsBasis', 'ratingBasis', 'powerBasis'].map(key => clean(record?.[key]).toLowerCase()).filter(Boolean);
}

function declaredVoltageBases(record) {
  return ['voltageBasis', 'voltageReference', 'voltageType'].map(key => clean(record?.[key]).toLowerCase().replace(/[\s_-]+/g, '')).filter(Boolean);
}

function declaredCoordinateUnits(record) {
  return ['coordinatesUnit', 'coordinateUnits', 'coordinateUnit'].map(key => clean(record?.[key]).toLowerCase().replace(/[\s_-]+/g, '')).filter(Boolean);
}

function meaningful(value) {
  return value !== undefined && value !== null && !(typeof value === 'string' && !value.trim());
}

const MOTOR_EQUIPMENT_FIELDS = {
  motorRatedVoltageV: 'ratedVoltageV',
  motorFullLoadCurrentA: 'fullLoadCurrentA',
  motorNameplateCurrentA: 'nameplateCurrentA',
  motorNameplateHorsepower: 'nameplateHorsepower',
  motorNameplateFrequencyHz: 'nameplateFrequencyHz',
  motorLockedRotorCurrentA: 'lockedRotorCurrentA',
  motorLockedRotorPowerFactor: 'lockedRotorPowerFactor',
  motorStarterType: 'starterType',
  motorRotorType: 'rotorType',
  motorInstantaneousPickupA: 'instantaneousPickupA',
  motorBreakerAmbientTemperatureC: 'breakerAmbientTemperatureC',
  motorBreakerAmbientReference: 'breakerAmbientReference',
};
function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function indicatesMotor(equipment, load) {
  return indicatesDesignSynthesisMotor(equipment) || indicatesDesignSynthesisMotor(load);
}
function hasUnsupportedMotorStarter(equipment, load, motor) {
  return hasUnsupportedDesignSynthesisStarter(equipment) || hasUnsupportedDesignSynthesisStarter(load)
    || hasUnsupportedDesignSynthesisStarter({ motor });
}

function fieldConflict(key, left, right) {
  if (!meaningful(left) || !meaningful(right)) return false;
  if (['kw', 'voltage', 'phases', 'powerFactor'].includes(key)) {
    const leftNumber = numericValue(left);
    const rightNumber = numericValue(right);
    return leftNumber === null || rightNumber === null || leftNumber !== rightNumber;
  }
  return String(left).trim().toLowerCase() !== String(right).trim().toLowerCase();
}

function generatedLoadId(equipmentId) { return `DS-LOAD-${equipmentId}`; }

function ownedGeneratedLoad(load, pair, lastApplied) {
  const marker = load?._designSynthesis;
  const snapshot = lastApplied?.records?.loads?.[pair?.loadId];
  if (!marker || marker.source !== 'design-synthesis' || marker.collection !== 'loads'
    || String(marker.identity) !== String(pair?.loadId) || !snapshot?.fingerprint) return false;
  const source = { ...load };
  delete source._designSynthesis;
  return fingerprintStudyValue(source) === snapshot.fingerprint;
}

function pairFor(equipment, loads, selectedEquipmentId, acknowledgements, options = {}) {
  const identity = clean(selectedEquipmentId);
  const equipmentMatches = equipment.filter(record => clean(record?.id) === identity);
  if (equipmentMatches.length !== 1) return { issue: issue(equipmentMatches.length ? 'project_equipment_duplicate_id' : 'project_equipment_missing', equipmentMatches.length ? `Equipment identity ${identity} is ambiguous in the current project.` : `Equipment identity ${identity} no longer exists in the current project.`, identity) };
  const sourceEquipment = equipmentMatches[0];
  const equipmentTag = clean(sourceEquipment.tag || identity);
  if (equipment.filter(record => clean(record?.tag || record?.id).toLowerCase() === equipmentTag.toLowerCase()).length > 1) {
    return { issue: issue('project_equipment_tag_ambiguous', `Equipment tag ${equipmentTag} identifies more than one project record.`, identity) };
  }
  if (isGenerated(sourceEquipment)) return { issue: issue('project_equipment_generated_record', `Generated equipment ${identity} cannot be adopted as an input source.`, identity) };
  const classification = [sourceEquipment.type, sourceEquipment.category, sourceEquipment.subCategory].map(value => clean(value).toLowerCase()).filter(Boolean);
  if (classification.some(isExcludedProjectEquipmentClass)) {
    return { issue: issue('project_equipment_not_load', `Project record ${identity} is a source, panel, bus, or transformer, not an eligible equipment load.`, identity) };
  }

  let linkedLoads = loads.filter(record => clean(record?.equipmentId) === identity);
  if (options.equipmentOnlyPair && linkedLoads.length === 1 && ownedGeneratedLoad(linkedLoads[0], options.equipmentOnlyPair, options.lastApplied)) linkedLoads = [];
  const equipmentOnly = linkedLoads.length === 0 && meaningful(sourceEquipment.kw);
  if (linkedLoads.length !== 1 && !equipmentOnly) return { issue: issue(linkedLoads.length ? 'project_load_link_ambiguous' : 'project_load_link_missing', linkedLoads.length ? `Equipment ${identity} has ${linkedLoads.length} linked load records; select a uniquely linked equipment/load pair.` : `Equipment ${identity} needs a uniquely linked load or an explicit equipment kW rating.`, identity) };
  if (options.equipmentOnlyPair && !equipmentOnly) return { issue: issue('project_equipment_load_changed', `Equipment ${identity} acquired a different or modified linked load after review.`, identity) };
  const sourceLoad = equipmentOnly ? { id: generatedLoadId(identity), equipmentId: identity, tag: equipmentTag, kw: sourceEquipment.kw } : linkedLoads[0];
  if (equipmentOnly && loads.some(record => clean(record?.id).toLowerCase() === sourceLoad.id.toLowerCase() && !ownedGeneratedLoad(record, options.equipmentOnlyPair, options.lastApplied))) {
    return { issue: issue('project_generated_load_identity_collision', `Proposed load identity ${sourceLoad.id} is already used by another project record.`, identity) };
  }
  if (!clean(sourceLoad.id)) return { issue: issue('project_load_missing_id', `The linked load for equipment ${identity} has no stable load ID.`, identity) };
  const loadTag = clean(sourceLoad.tag || sourceLoad.ref || sourceLoad.id);
  const matchingLoadTags = loads.filter(record => clean(record?.tag || record?.ref || record?.id).toLowerCase() === loadTag.toLowerCase()
    && !(equipmentOnly && ownedGeneratedLoad(record, options.equipmentOnlyPair, options.lastApplied)));
  if (matchingLoadTags.length > (equipmentOnly ? 0 : 1)) {
    return { issue: issue('project_load_tag_ambiguous', `Load tag ${loadTag} identifies more than one project load record.`, identity) };
  }
  if (isGenerated(sourceLoad)) return { issue: issue('project_load_generated_record', `Linked load ${sourceLoad.id} is already a generated record and cannot be adopted as an input source.`, identity) };

  const conflicts = [];
  for (const key of ['kw', 'voltage', 'phases', 'powerFactor', 'duty']) {
    if (fieldConflict(key, sourceEquipment[key], sourceLoad[key])) conflicts.push(issue('project_equipment_load_conflict', `Equipment ${identity} and linked load ${sourceLoad.id} disagree on ${key}. Resolve the canonical records before adoption.`, identity));
  }
  const frequencies = [sourceEquipment, sourceLoad].flatMap(record => ['frequencyHz', 'frequency']
    .filter(key => Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined)
    .map(key => ({ key, value: numericValue(record[key]) })));
  if (frequencies.some(item => item.value === null || item.value <= 0)) conflicts.push(issue('project_equipment_frequency_invalid', `Equipment ${identity} or linked load ${sourceLoad.id} contains an invalid frequency.`, identity));
  else if (new Set(frequencies.map(item => item.value)).size > 1) conflicts.push(issue('project_equipment_frequency_conflict', `Equipment ${identity} and linked load ${sourceLoad.id} contain conflicting frequency values.`, identity));
  const explicitBases = [...declaredElectricalBases(sourceEquipment), ...declaredElectricalBases(sourceLoad)].map(value => value.replace(/[\s_-]+/g, ''));
  if (explicitBases.some(value => !['electrical-input-kw', 'electricalinputkw'].includes(value))) {
    conflicts.push(issue('project_load_rating_basis_unsupported', `Equipment ${identity} declares a non-electrical-input kW basis; Design Synthesis will not reinterpret it.`, identity));
  }
  if (new Set(explicitBases).size > 1) conflicts.push(issue('project_load_rating_basis_conflict', `Equipment ${identity} and linked load ${sourceLoad.id} declare conflicting rating bases.`, identity));
  if (!explicitBases.length && acknowledgements?.electricalInputKW !== true) conflicts.push(issue('project_load_rating_basis_unconfirmed', `Confirm that linked load ${sourceLoad.id} kW is electrical input power before adopting equipment ${identity}.`, identity));

  const voltageBases = [...declaredVoltageBases(sourceEquipment), ...declaredVoltageBases(sourceLoad)];
  if (voltageBases.some(basis => !['linetoline', 'll', 'linevoltage'].includes(basis))) {
    conflicts.push(issue('project_load_voltage_basis_unsupported', `Equipment ${identity} voltage is not explicitly identified as line-to-line.`, identity));
  } else if (!voltageBases.length && acknowledgements?.voltageLineToLine !== true) {
    conflicts.push(issue('project_load_voltage_basis_unconfirmed', `Confirm linked load ${sourceLoad.id} voltage is line-to-line before adoption.`, identity));
  }

  const coordinateUnits = declaredCoordinateUnits(sourceEquipment);
  if (coordinateUnits.some(units => !['ft', 'feet', 'foot'].includes(units)) || new Set(coordinateUnits).size > 1) {
    conflicts.push(issue('project_equipment_coordinate_units_unsupported', `Equipment ${identity} coordinates are not in feet.`, identity));
  } else if (!coordinateUnits.length && acknowledgements?.coordinatesFeet !== true) {
    conflicts.push(issue('project_equipment_coordinate_units_unconfirmed', `Confirm equipment ${identity} x/y/z coordinates are in feet before adoption.`, identity));
  }

  const row = {
    id: identity,
    tag: clean(sourceEquipment.tag || sourceLoad.tag || sourceLoad.ref || identity),
    kw: sourceLoad.kw,
    voltage: meaningful(sourceLoad.voltage) ? sourceLoad.voltage : sourceEquipment.voltage,
    phases: meaningful(sourceLoad.phases) ? sourceLoad.phases : sourceEquipment.phases,
    ...(meaningful(sourceLoad.powerFactor) ? { powerFactor: numericValue(sourceLoad.powerFactor) } : meaningful(sourceEquipment.powerFactor) ? { powerFactor: numericValue(sourceEquipment.powerFactor) } : {}),
    ...(meaningful(sourceLoad.duty) ? { duty: sourceLoad.duty } : meaningful(sourceEquipment.duty) ? { duty: sourceEquipment.duty } : {}),
    x: sourceEquipment.x,
    y: sourceEquipment.y,
    z: sourceEquipment.z,
    ratingsBasis: 'electrical-input-kW',
    voltageBasis: 'line-to-line',
    coordinatesUnit: 'ft',
    projectEquipmentId: identity,
    projectLoadId: clean(sourceLoad.id),
    ...(frequencies.length && frequencies[0].value !== null ? { frequencyHz: frequencies[0].value } : {}),
  };
  for (const key of ['kw', 'voltage', 'phases', 'x', 'y', 'z']) {
    const parsed = numericValue(row[key]);
    if (parsed === null) conflicts.push(issue('project_equipment_load_value_missing', `Selected equipment ${identity} is missing a finite ${key} value from its canonical source records.`, identity));
    else row[key] = parsed;
  }
  if (row.powerFactor !== undefined && (!finite(row.powerFactor) || Number(row.powerFactor) <= 0 || Number(row.powerFactor) > 1)) conflicts.push(issue('project_equipment_load_value_invalid', `Selected equipment ${identity} has an invalid power factor.`, identity));
  if (conflicts.length) return { issue: conflicts[0], issues: conflicts };

  const motorClassification = indicatesMotor(sourceEquipment, sourceLoad);
  if (sourceLoad.motor !== undefined && !isPlainObject(sourceLoad.motor)) {
    return { issue: issue('project_motor_record_malformed', `Linked load ${sourceLoad.id} contains an explicitly present but malformed motor record.`, identity) };
  }
  if (sourceEquipment.motor !== undefined && !isPlainObject(sourceEquipment.motor)) {
    return { issue: issue('project_motor_record_malformed', `Equipment ${identity} contains an explicitly present but malformed motor record.`, identity) };
  }
  const sourceMotorRecord = sourceLoad.motor !== undefined ? sourceLoad.motor : sourceEquipment.motor;
  const hasFlatMotor = [...Object.keys(MOTOR_EQUIPMENT_FIELDS), 'motorFullLoadCurrentReference'].some(key => meaningful(sourceEquipment[key]));
  const resolvedMotor = isPlainObject(sourceMotorRecord) ? structuredClone(sourceMotorRecord) : {};
  if (hasFlatMotor) {
    for (const [field, target] of Object.entries(MOTOR_EQUIPMENT_FIELDS)) {
      if (!meaningful(sourceEquipment[field])) continue;
      if (field === 'motorInstantaneousPickupA') {
        const raw = clean(sourceEquipment[field]).toLowerCase();
        const value = raw === 'none' ? null : numericValue(sourceEquipment[field]);
        if (value === null && raw !== 'none') return { issue: issue('project_motor_value_invalid', `Equipment ${identity} has an invalid ${field}; enter a supported numeric pickup or none.`, identity) };
        if (Object.prototype.hasOwnProperty.call(resolvedMotor, target) && resolvedMotor[target] !== value) return { issue: issue('project_motor_record_conflict', `Equipment ${identity} has conflicting flat and nested motor values for ${target}.`, identity) };
        resolvedMotor[target] = value;
        continue;
      }
      if (field === 'motorBreakerAmbientTemperatureC' && clean(sourceEquipment[field]).toLowerCase() === 'none') {
        if ((Object.prototype.hasOwnProperty.call(resolvedMotor, target) && resolvedMotor[target] !== null) || (Object.prototype.hasOwnProperty.call(resolvedMotor, 'breakerAmbientReference') && resolvedMotor.breakerAmbientReference !== null) || meaningful(sourceEquipment.motorBreakerAmbientReference)) return { issue: issue('project_motor_record_conflict', `Equipment ${identity} has conflicting motor breaker enclosure basis fields.`, identity) };
        resolvedMotor.breakerAmbientTemperatureC = null;
        resolvedMotor.breakerAmbientReference = null;
        continue;
      }
      if (field === 'motorBreakerAmbientReference') {
        const value = clean(sourceEquipment[field]);
        if (resolvedMotor[target] !== undefined && resolvedMotor[target] !== value) return { issue: issue('project_motor_record_conflict', `Equipment ${identity} has conflicting flat and nested motor values for ${target}.`, identity) };
        resolvedMotor[target] = value;
        continue;
      }
      if (field === 'motorBreakerAmbientTemperatureC') {
        const value = numericValue(sourceEquipment[field]);
        if (value === null) return { issue: issue('project_motor_value_invalid', `Equipment ${identity} has an invalid ${field}; enter a supported temperature or none.`, identity) };
        if (Object.prototype.hasOwnProperty.call(resolvedMotor, target) && resolvedMotor[target] !== value) return { issue: issue('project_motor_record_conflict', `Equipment ${identity} has conflicting flat and nested motor values for ${target}.`, identity) };
        resolvedMotor[target] = value;
        continue;
      }
      const textField = target === 'starterType' || target === 'rotorType';
      const value = textField ? clean(sourceEquipment[field]).toLowerCase() : numericValue(sourceEquipment[field]);
      if (value === null) return { issue: issue('project_motor_value_invalid', `Equipment ${identity} has an invalid ${field}; provide a finite numeric value.`, identity) };
      if (meaningful(resolvedMotor[target]) && (textField ? clean(resolvedMotor[target]).toLowerCase() !== value : numericValue(resolvedMotor[target]) !== value)) {
        return { issue: issue('project_motor_record_conflict', `Equipment ${identity} has conflicting flat and nested motor values for ${target}.`, identity) };
      }
      resolvedMotor[target] = value;
    }
    if (meaningful(sourceEquipment.motorFullLoadCurrentReference)) {
      const reference = clean(sourceEquipment.motorFullLoadCurrentReference);
      if (resolvedMotor.fullLoadCurrentBasis !== undefined && !isPlainObject(resolvedMotor.fullLoadCurrentBasis)) return { issue: issue('project_motor_record_malformed', `Equipment ${identity} has a malformed motor full-load current basis.`, identity) };
      if (meaningful(resolvedMotor.fullLoadCurrentBasis?.reference) && clean(resolvedMotor.fullLoadCurrentBasis.reference) !== reference) return { issue: issue('project_motor_record_conflict', `Equipment ${identity} has conflicting motor design-current references.`, identity) };
      resolvedMotor.fullLoadCurrentBasis = { ...(resolvedMotor.fullLoadCurrentBasis || {}), reference };
    }
  }
  if (motorClassification && hasUnsupportedMotorStarter(sourceEquipment, sourceLoad, resolvedMotor)) {
    return { issue: issue('project_motor_starter_unsupported', `Selected motor ${identity} is classified as VFD or soft-starter equipment; this workflow will not reinterpret it as direct-on-line starting.`, identity) };
  }
  if (isPlainObject(sourceMotorRecord) || hasFlatMotor) row.motor = resolvedMotor;
  else if (motorClassification) {
    conflicts.push(issue('project_motor_basis_incomplete', `Selected motor ${identity} has no explicit motor nameplate record linked from the canonical load or equipment.`, identity));
    return { issue: conflicts[0], issues: conflicts };
  }
  if (sourceLoad.motor !== undefined && sourceEquipment.motor !== undefined && isPlainObject(sourceLoad.motor) && isPlainObject(sourceEquipment.motor)
    && fingerprintStudyValue(sourceLoad.motor) !== fingerprintStudyValue(sourceEquipment.motor)) {
    conflicts.push(issue('project_motor_record_conflict', `Equipment ${identity} and linked load ${sourceLoad.id} contain different motor nameplate records. Resolve the canonical records before adoption.`, identity));
    return { issue: conflicts[0], issues: conflicts };
  }
  if (sourceEquipment.motorOperatingBasis !== undefined && sourceLoad.motorOperatingBasis !== undefined
    && fingerprintStudyValue(sourceEquipment.motorOperatingBasis) !== fingerprintStudyValue(sourceLoad.motorOperatingBasis)) {
    return { issue: issue('project_motor_operating_reference_conflict', `Equipment ${identity} and linked load ${sourceLoad.id} contain different motor operating references.`, identity) };
  }
  const operatingBasis = sourceEquipment.motorOperatingBasis !== undefined ? sourceEquipment.motorOperatingBasis : sourceLoad.motorOperatingBasis;
  if (operatingBasis !== undefined) {
    for (const key of ['model', 'manufacturer']) {
      const normalizeIdentity = value => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
      const aliases = ['abb', 'baldor', 'abbbaldor', 'baldorreliance', 'abbbaldorreliance'];
      const left = normalizeIdentity(sourceEquipment[key]);
      const right = normalizeIdentity(sourceLoad[key]);
      const equivalent = left === right || (key === 'manufacturer' && aliases.includes(left) && aliases.includes(right));
      if (meaningful(sourceEquipment[key]) && meaningful(sourceLoad[key]) && !equivalent) return { issue: issue('project_motor_operating_reference_conflict', `Equipment ${identity} and linked load ${sourceLoad.id} disagree on ${key}.`, identity) };
      if (meaningful(sourceEquipment[key]) || meaningful(sourceLoad[key])) row[key] = meaningful(sourceEquipment[key]) ? sourceEquipment[key] : sourceLoad[key];
    }
    row.motorOperatingBasis = structuredClone(operatingBasis);
  }
  if (hasFlatMotor || operatingBasis !== undefined) {
    const motorValidation = validateDesignSynthesisMotorInputs({ equipment: [row] });
    if (motorValidation.inputIssues.length) return { issues: motorValidation.inputIssues.map(item => issue(item.code, `Equipment ${identity}: ${item.message}`, identity)) };
  }
  if ([sourceEquipment.motorDataReference, sourceLoad.motorDataReference].some(value => meaningful(value) && typeof value !== 'string')) return { issue: issue('project_motor_reference_invalid', `Equipment ${identity} motor data reference must be text.`, identity) };
  const references = [sourceEquipment.sourceDocuments, sourceEquipment.references, sourceEquipment.motorDataReference, sourceLoad.sourceDocuments, sourceLoad.references, sourceLoad.motorDataReference]
    .flatMap(value => Array.isArray(value) ? value : value ? [value] : []);
  if (references.length) row.sourceDocuments = structuredClone(references);
  const pair = {
    equipmentId: identity,
    loadId: clean(sourceLoad.id),
    equipmentTag,
    loadTag,
    equipmentFingerprint: fingerprintStudyValue(sourceEquipment),
    loadFingerprint: equipmentOnly ? null : fingerprintStudyValue(sourceLoad),
    ...(equipmentOnly ? { sourceKind: 'equipment-only' } : {}),
    mappedRowFingerprint: fingerprintStudyValue(row),
  };
  return { row, pair, sourceEquipment, sourceLoad };
}

export function buildDesignSynthesisProjectEquipmentAdoption({
  equipment = [],
  loads = [],
  selectedEquipmentIds = [],
  projectId = null,
  scenario = null,
  projectFingerprint = null,
  acknowledgements = {},
  lastApplied = null,
} = {}) {
  const selected = [...new Set((Array.isArray(selectedEquipmentIds) ? selectedEquipmentIds : []).map(clean).filter(Boolean))];
  const issues = [];
  const selectedRows = [];
  const pairs = [];
  for (const equipmentId of selected) {
    const previousPair = lastApplied?.projectEquipmentAdoption?.pairs?.find(pair => pair.sourceKind === 'equipment-only' && clean(pair.equipmentId) === equipmentId);
    const result = pairFor(equipment, loads, equipmentId, acknowledgements, { equipmentOnlyPair: previousPair || null, lastApplied });
    if (result.issues) issues.push(...result.issues);
    else if (result.issue) issues.push(result.issue);
    else { selectedRows.push(result.row); pairs.push(result.pair); }
  }
  if (!selected.length) issues.push(issue('project_equipment_none_selected', 'Select one or more eligible project equipment records before transfer.'));
  const duplicateLoadIds = new Set();
  const counts = new Map();
  pairs.forEach(pair => counts.set(pair.loadId, (counts.get(pair.loadId) || 0) + 1));
  counts.forEach((count, loadId) => { if (count > 1) duplicateLoadIds.add(loadId); });
  for (const loadId of duplicateLoadIds) issues.push(issue('project_load_selected_twice', `Canonical load ${loadId} is linked to more than one selected equipment record.`, loadId));
  for (const [field, label] of [['equipmentTag', 'equipment tag'], ['loadTag', 'load tag']]) {
    const tagCounts = new Map();
    pairs.forEach(pair => { const value = clean(pair[field]).toLowerCase(); if (value) tagCounts.set(value, (tagCounts.get(value) || 0) + 1); });
    for (const [tag, count] of tagCounts) if (count > 1) issues.push(issue('project_equipment_adoption_tag_ambiguous', `Selected project records share the ${label} ${tag}; canonical schedule references would be ambiguous.`, tag));
  }
  if (!clean(projectId) || !clean(scenario) || !clean(projectFingerprint)) {
    issues.push(issue('project_equipment_adoption_context_missing', 'A named project, active scenario, and project input fingerprint are required before adopting project equipment.'));
  }
  const adoption = {
    schemaVersion: PROJECT_EQUIPMENT_ADOPTION_SCHEMA,
    projectId: projectId == null ? null : String(projectId),
    scenario: scenario == null ? null : String(scenario),
    projectFingerprint: projectFingerprint == null ? null : String(projectFingerprint),
    acknowledgements: {
      electricalInputKW: acknowledgements.electricalInputKW === true,
      voltageLineToLine: acknowledgements.voltageLineToLine === true,
      coordinatesFeet: acknowledgements.coordinatesFeet === true,
    },
    pairs,
  };
  adoption.bindingFingerprint = fingerprintStudyValue(adoption);
  return { ok: issues.length === 0, issues, selectedRows, adoption };
}

export function validateDesignSynthesisProjectEquipmentAdoption({
  adoption,
  rows = [],
  equipment = [],
  loads = [],
  projectId = null,
  scenario = null,
  projectFingerprint = null,
  lastApplied = null,
} = {}) {
  const issues = [];
  if (!adoption || adoption.schemaVersion !== PROJECT_EQUIPMENT_ADOPTION_SCHEMA || !Array.isArray(adoption.pairs)) {
    return { ok: false, issues: [issue('project_equipment_adoption_invalid', 'Project equipment adoption context is missing or unsupported.')] };
  }
  if (!clean(adoption.projectId) || !clean(adoption.scenario) || !clean(adoption.projectFingerprint)
    || !clean(projectId) || !clean(scenario) || !clean(projectFingerprint)) {
    issues.push(issue('project_equipment_adoption_context_missing', 'A named project, active scenario, and project input fingerprint are required to validate adopted equipment.'));
  }
  if (adoption.projectId !== String(projectId ?? '') || adoption.scenario !== String(scenario ?? '')) {
    issues.push(issue('project_equipment_adoption_context_stale', 'The active named project or scenario changed after equipment adoption review.'));
  }
  if (adoption.projectFingerprint !== projectFingerprint) {
    const previouslyApplied = lastApplied?.projectEquipmentAdoption?.bindingFingerprint === adoption.bindingFingerprint;
    if (!previouslyApplied) issues.push(issue('project_equipment_adoption_snapshot_stale', 'Project engineering inputs changed after equipment adoption review; review the selected project equipment again.'));
  }
  const expectedBinding = { ...adoption };
  delete expectedBinding.bindingFingerprint;
  if (adoption.bindingFingerprint !== fingerprintStudyValue(expectedBinding)) issues.push(issue('project_equipment_adoption_binding_invalid', 'Project equipment adoption binding does not match its reviewed contents.'));
  if (adoption.acknowledgements?.electricalInputKW !== true
    || adoption.acknowledgements?.voltageLineToLine !== true
    || adoption.acknowledgements?.coordinatesFeet !== true) {
    issues.push(issue('project_equipment_adoption_basis_unconfirmed', 'Electrical input kW, line-to-line voltage, and feet coordinate bases require explicit review acknowledgements.'));
  }
  const rowById = new Map();
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const id = clean(row?.id);
    if (!id || rowById.has(id)) issues.push(issue('project_equipment_adoption_duplicate_draft_row', `Draft contains a missing or duplicate adopted equipment identity ${id || '(missing)'}.`, id || null));
    else rowById.set(id, row);
  }
  const pairIds = new Set();
  for (const pair of adoption.pairs) {
    const id = clean(pair?.equipmentId);
    if (!id || pairIds.has(id)) { issues.push(issue('project_equipment_adoption_duplicate', `Adoption contains a missing or duplicate equipment identity ${id || '(missing)'}.`, id || null)); continue; }
    pairIds.add(id);
    const result = pairFor(equipment, loads, id, adoption.acknowledgements, {
      equipmentOnlyPair: pair.sourceKind === 'equipment-only' ? pair : null,
      lastApplied,
    });
    if (result.issues) { issues.push(...result.issues); continue; }
    if (result.issue) { issues.push(result.issue); continue; }
    if (result.pair.loadId !== clean(pair.loadId)
      || result.pair.equipmentFingerprint !== pair.equipmentFingerprint
      || result.pair.loadFingerprint !== pair.loadFingerprint) {
      const previouslyAppliedPair = lastApplied?.projectEquipmentAdoption?.bindingFingerprint === adoption.bindingFingerprint
        && lastApplied.projectEquipmentAdoption?.pairs?.some(saved => saved.equipmentId === id && saved.loadId === pair.loadId);
      if (!previouslyAppliedPair) issues.push(issue('project_equipment_adoption_source_changed', `Equipment ${id} or linked load ${pair.loadId} changed after review.`, id));
    }
    if (result.pair.mappedRowFingerprint !== pair.mappedRowFingerprint) {
      issues.push(issue('project_equipment_adoption_values_changed', `Equipment ${id} rating, voltage, phase, duty, or physical coordinates no longer match the reviewed draft.`, id));
    }
    const row = rowById.get(id);
    if (row && (clean(row.projectEquipmentId) !== id || clean(row.projectLoadId) !== clean(pair.loadId)
      || fingerprintStudyValue(row) !== pair.mappedRowFingerprint)) {
      issues.push(issue('project_equipment_adoption_row_changed', `Draft row ${id} no longer matches its reviewed equipment/load mapping.`, id));
    }
  }
  for (const [id, row] of rowById) {
    if (!pairIds.has(id)) issues.push(issue('project_equipment_adoption_selection_changed', `Draft row ${id} is not part of the reviewed project equipment selection.`, id));
  }
  return { ok: issues.length === 0, issues };
}

export function bindDesignSynthesisProjectEquipmentProposal(proposal, adoption) {
  const bound = structuredClone(proposal);
  bound.projectEquipmentAdoption = structuredClone(adoption);
  bound.inputSignature = fingerprintStudyValue({
    engineSignature: proposal?.inputSignature || proposal?.inputs?.signature || null,
    projectEquipmentAdoption: adoption?.bindingFingerprint || null,
  });
  return bound;
}

export function applyProjectEquipmentIdentityMap(proposal, adoption) {
  const next = structuredClone(proposal);
  const byEquipmentId = new Map((adoption?.pairs || []).map(pair => [String(pair.equipmentId), String(pair.loadId)]));
  if (!byEquipmentId.size) return next;
  const equipmentTagToLoadTag = new Map((adoption?.pairs || []).map(pair => [String(pair.equipmentTag || '').toLowerCase(), String(pair.loadTag || '')]));
  next.projectEquipmentAdoption = structuredClone(adoption);
  next.loads = (next.loads || []).map(load => {
    const equipmentId = String(load.id);
    const loadId = byEquipmentId.get(equipmentId);
    const pair = adoption.pairs.find(item => String(item.equipmentId) === equipmentId);
    return loadId ? { ...load, id: loadId, tag: pair?.loadTag || load.tag, equipmentId, projectEquipmentId: equipmentId } : load;
  });
  next.panels = (next.panels || []).map(panel => ({
    ...panel,
    loadIds: (panel.loadIds || []).map(id => byEquipmentId.get(String(id)) || String(id)),
    breakers: Array.isArray(panel.breakers) ? panel.breakers.map(tag => equipmentTagToLoadTag.get(String(tag || '').toLowerCase()) || tag) : panel.breakers,
  }));
  next.cables = (next.cables || []).map(cable => {
    const equipmentId = String(cable.loadId || cable.to || '');
    const loadId = byEquipmentId.get(equipmentId);
    return loadId ? { ...cable, loadId, targetLoadId: loadId, targetEquipmentId: equipmentId } : cable;
  });
  next.routeResults = Array.isArray(next.routeResults?.batchResults)
    ? { ...next.routeResults, batchResults: next.routeResults.batchResults.map(route => {
      const equipmentId = String(route.to || '');
      const loadId = byEquipmentId.get(equipmentId);
      return loadId ? { ...route, loadId, targetEquipmentId: equipmentId } : route;
    }) }
    : next.routeResults;
  next.oneLine = next.oneLine && Array.isArray(next.oneLine.sheets) ? {
    ...next.oneLine,
    sheets: next.oneLine.sheets.map(sheet => ({
      ...sheet,
      components: (sheet.components || []).map(component => {
        const equipmentId = String(component.id || component.entityId || '');
        const loadId = byEquipmentId.get(equipmentId);
        if (!loadId || component.type !== 'load') return component;
        const scheduleLinks = { ...(component.scheduleLinks || {}), equipmentRef: equipmentId, load: loadId, loadRef: loadId };
        return { ...component, equipmentRef: equipmentId, loadRef: loadId, scheduleLinks };
      }),
    })),
  } : next.oneLine;
  return next;
}

export const PROJECT_EQUIPMENT_SELECTIVE_FIELDS = {
  equipment: ['panelRef', 'panelId'],
  loads: ['panelRef', 'panelId', 'source', 'breaker', 'breakerPoles', 'circuit', 'kva', 'currentA', 'runningCurrentA', 'designCurrentA', 'designAmpacityA'],
};

export function mergeAdoptedProjectRecord({ current, generated, collection, priorAdoption = null }) {
  const fields = PROJECT_EQUIPMENT_SELECTIVE_FIELDS[collection];
  if (!fields) return { ok: false, issue: issue('project_equipment_adoption_collection_invalid', `Cannot selectively adopt ${collection}.`) };
  const next = structuredClone(current);
  const previous = priorAdoption?.fields || {};
  const baseline = {};
  for (const field of fields) {
    const beforePresent = Object.prototype.hasOwnProperty.call(current, field);
    const beforeValue = current[field];
    const wasOwned = Object.prototype.hasOwnProperty.call(previous, field);
    const expectedCurrent = wasOwned ? previous[field].generatedValue : beforeValue;
    if (wasOwned && comparable(current[field]) !== comparable(expectedCurrent)) {
      return { ok: false, issue: issue('adopted_generated_field_modified', `Adopted ${collection} record ${current.id} has a manual change to generated field ${field}.`, String(current.id)) };
    }
    if (Object.prototype.hasOwnProperty.call(generated, field)) {
      next[field] = structuredClone(generated[field]);
      baseline[field] = {
        originallyPresent: wasOwned ? previous[field].originallyPresent : beforePresent,
        ...(wasOwned ? (previous[field].originallyPresent ? { originalValue: structuredClone(previous[field].originalValue) } : {}) : beforePresent ? { originalValue: structuredClone(beforeValue) } : {}),
        generatedValue: structuredClone(generated[field]),
      };
    } else if (wasOwned) {
      if (previous[field].originallyPresent) next[field] = structuredClone(previous[field].originalValue);
      else delete next[field];
    }
  }
  return { ok: true, record: next, adoption: { fields: baseline } };
}

