function text(value) {
  return String(value ?? '').trim();
}

function token(value) {
  return text(value).toLowerCase();
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function finite(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
}

function firstValue(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (hasValue(value)) return value;
  }
  return '';
}

function firstEntry(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (hasValue(value)) return { key, value };
  }
  return null;
}

function componentValues(component = {}) {
  return {
    ...(component.props && typeof component.props === 'object' ? component.props : {}),
    ...component
  };
}

function componentIdentities(component = {}) {
  const values = componentValues(component);
  return [
    component.id,
    component.ref,
    component.label,
    component.equipmentRef,
    component.scheduleLinks?.equipment,
    values.tag,
    values.equipmentTag
  ].map(token).filter(Boolean);
}

function recordIdentities(record = {}) {
  return [record.id, record.ref, record.tag, record.name, record.lineup].map(token).filter(Boolean);
}

function voltageLabel(value) {
  const raw = text(value);
  if (!raw) return '';
  if (/[a-z]/i.test(raw)) return raw;
  const numeric = finite(raw);
  if (numeric === null) return raw;
  return numeric > 0 && numeric < 100 ? `${numeric * 1000}V` : `${numeric}V`;
}

function yesNoValue(value) {
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  const normalized = token(value);
  if (['yes', 'y', 'true', 'required', 'service-entrance'].includes(normalized)) return 'yes';
  if (['no', 'n', 'false', 'not-required'].includes(normalized)) return 'no';
  return '';
}

function requiredValue(value) {
  if (typeof value === 'boolean') return value ? 'required' : 'not-required';
  const normalized = token(value);
  if (['required', 'yes', 'y', 'true'].includes(normalized)) return 'required';
  if (['not-required', 'not required', 'no', 'n', 'false'].includes(normalized)) return 'not-required';
  return text(value);
}

function listValue(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[,;|]/).map(part => part.trim()).filter(Boolean);
}

function cableEndpointMatches(cable, targetTokens, direction, equipmentId) {
  const fields = direction === 'incoming'
    ? [cable.to_tag, cable.to, cable.target, cable.destination]
    : [cable.from_tag, cable.from, cable.source, cable.origin];
  const stableId = direction === 'incoming' ? cable.targetEquipmentId : cable.sourceEquipmentId;
  if (equipmentId && token(stableId) === token(equipmentId)) return true;
  return fields.some(value => targetTokens.has(token(value)));
}

function cableDescription(cable = {}, direction = 'incoming') {
  const tag = text(cable.tag || cable.name || cable.id) || 'Untagged cable';
  const endpoint = direction === 'incoming'
    ? text(cable.from_tag || cable.from || cable.source || cable.origin)
    : text(cable.to_tag || cable.to || cable.target || cable.destination);
  const parallel = Math.max(1, finite(cable.parallel_count || cable.parallelCount || cable.runs) || 1);
  const conductorCount = finite(cable.conductors || cable.conductor_count || cable.cores);
  const conductorSize = text(cable.conductor_size || cable.conductorSize || cable.size);
  const material = text(cable.conductor_material || cable.conductorMaterial || cable.material);
  const insulation = text(cable.insulation_type || cable.insulation || cable.insulationType);
  const groundSize = text(cable.ground_size || cable.groundSize || cable.egc_size);
  const groundMaterial = text(cable.ground_material || cable.groundMaterial || cable.egc_material);
  const construction = [
    parallel > 1 ? `${parallel} parallel runs` : '',
    conductorCount ? `${conductorCount} conductors` : '',
    conductorSize,
    material,
    insulation
  ].filter(Boolean).join(', ');
  const ground = [groundSize, groundMaterial].filter(Boolean).join(' ');
  return [
    tag,
    endpoint ? `${direction === 'incoming' ? 'from' : 'to'} ${endpoint}` : '',
    construction,
    ground ? `EGC ${ground}` : ''
  ].filter(Boolean).join(' - ');
}

function getPath(source, path) {
  return path.split('.').reduce((value, key) => value?.[key], source);
}

function setPath(target, path, value) {
  const keys = path.split('.');
  let current = target;
  keys.slice(0, -1).forEach(key => {
    if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) current[key] = {};
    current = current[key];
  });
  current[keys.at(-1)] = Array.isArray(value) ? [...value] : value;
}

function sourceEntry(sourcePath, sourceLabel) {
  return { sourcePath, sourceLabel };
}

const REPLACEABLE_MCC_DEFAULTS = Object.freeze({
  voltage: '480V',
  'specRequirements.shortCircuitRatingKa': 65,
  'reportTitleBlock.revision': 'A'
});

function valuesEqual(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) return JSON.stringify(left) === JSON.stringify(right);
  return String(left ?? '') === String(right ?? '');
}

export function buildMccProjectInputSuggestions({
  lineup = {},
  projectMeta = {},
  designBasis = null,
  equipment = [],
  oneLine = {},
  studies = {},
  cables = []
} = {}) {
  const values = {};
  const bindings = {};
  const add = (path, value, sourcePath, sourceLabel) => {
    if (!hasValue(value)) return;
    values[path] = Array.isArray(value) ? [...value] : value;
    bindings[path] = sourceEntry(sourcePath, sourceLabel);
  };

  const targetValues = [lineup.equipmentTag, lineup.tag].map(token).filter(Boolean);
  const targetTokens = new Set(targetValues);
  const equipmentRows = Array.isArray(equipment) ? equipment : [];
  const equipmentRecord = equipmentRows.find(record => recordIdentities(record).some(identity => targetTokens.has(identity))) || null;
  if (equipmentRecord?.id) targetTokens.add(token(equipmentRecord.id));

  const components = Array.isArray(oneLine?.sheets)
    ? oneLine.sheets.flatMap(sheet => Array.isArray(sheet?.components) ? sheet.components : [])
    : [];
  const oneLineComponent = components.find(component => componentIdentities(component).some(identity => targetTokens.has(identity))) || null;
  const component = componentValues(oneLineComponent || {});
  const equipmentSourceId = equipmentRecord?.id || lineup.equipmentTag || lineup.tag || 'matched-mcc';
  const oneLineSourceId = oneLineComponent?.id || lineup.equipmentTag || lineup.tag || 'matched-mcc';
  const preferredEntry = (equipmentKeys, componentKeys = equipmentKeys) => {
    const equipmentEntry = firstEntry(equipmentRecord, equipmentKeys);
    if (equipmentEntry) return { ...equipmentEntry, sourcePath: `equipment.${equipmentSourceId}.${equipmentEntry.key}`, sourceLabel: 'Equipment List' };
    const componentEntry = firstEntry(component, componentKeys);
    if (componentEntry) return { ...componentEntry, sourcePath: `oneLine.${oneLineSourceId}.${componentEntry.key}`, sourceLabel: 'One-Line' };
    return null;
  };
  const addPreferred = (path, equipmentKeys, componentKeys = equipmentKeys, transform = value => value) => {
    const entry = preferredEntry(equipmentKeys, componentKeys);
    if (!entry) return null;
    add(path, transform(entry.value), entry.sourcePath, entry.sourceLabel);
    return entry;
  };

  const metaName = firstValue(projectMeta, ['name', 'projectName']);
  add('reportTitleBlock.projectName', metaName, 'projectMeta.name', 'Project Metadata');
  add('reportTitleBlock.client', firstValue(projectMeta, ['client', 'owner']), 'projectMeta.client', 'Project Metadata');
  add('reportTitleBlock.revision', firstValue(projectMeta, ['revision', 'revisionNumber']), 'projectMeta.revision', 'Project Metadata');
  add('reportTitleBlock.preparedBy', firstValue(projectMeta, ['preparedBy', 'engineer', 'responsibleEngineer']), 'projectMeta.preparedBy', 'Project Metadata');
  add('reportTitleBlock.reportDate', firstValue(projectMeta, ['issueDate', 'date']), 'projectMeta.issueDate', 'Project Metadata');

  addPreferred('voltage', ['voltage', 'ratedVoltage', 'rated_voltage'], ['voltage', 'rated_voltage', 'rated_voltage_kv', 'nominalVoltage'], voltageLabel);
  addPreferred('systemRequirements.phases', ['phases', 'phase']);
  addPreferred('systemRequirements.wires', ['wires', 'wireCount', 'wire_count']);
  addPreferred('systemRequirements.frequencyHz', ['frequencyHz', 'frequency_hz', 'frequency']);
  addPreferred('systemRequirements.groundingConfiguration', ['groundingConfiguration', 'grounding_type', 'grounding']);
  addPreferred('systemRequirements.neutralRequirement', ['neutralRequirement', 'neutral_rating', 'neutral']);
  addPreferred('specRequirements.shortCircuitRatingKa', ['sccrKa', 'sccr_ka', 'shortCircuitRatingKa']);
  addPreferred('systemRequirements.serviceEntrance', ['serviceEntrance', 'service_entrance'], ['serviceEntrance', 'service_entrance'], yesNoValue);
  addPreferred('systemRequirements.certifications', ['certifications', 'standards'], ['certifications', 'standards'], listValue);
  addPreferred('systemRequirements.arcResistantRequirement', ['arcResistantRequirement', 'arc_resistant'], ['arcResistantRequirement', 'arc_resistant'], requiredValue);
  addPreferred('systemRequirements.seismicQualification', ['seismicQualification', 'seismic_qualification']);

  const codeBasis = designBasis?.codeBasis || {};
  add('systemRequirements.codeBasis', [codeBasis.primaryCode, codeBasis.edition].map(text).filter(Boolean).join(' '), 'designBasis.codeBasis', 'Design Basis');
  add('systemRequirements.jurisdiction', codeBasis.jurisdiction, 'designBasis.codeBasis.jurisdiction', 'Design Basis');
  add('systemRequirements.ahj', codeBasis.ahj, 'designBasis.codeBasis.ahj', 'Design Basis');

  const { shortCircuit: rawShortCircuit } = studies && typeof studies === 'object' ? studies : {};
  const shortCircuit = rawShortCircuit && typeof rawShortCircuit === 'object' ? rawShortCircuit : {};
  const locationResult = Object.entries(shortCircuit).find(([id, result]) => {
    if (!result || typeof result !== 'object' || finite(result.threePhaseKA) === null) return false;
    return targetTokens.has(token(id))
      || targetTokens.has(token(result.equipmentTag))
      || (oneLineComponent?.id && token(id) === token(oneLineComponent.id));
  });
  if (locationResult) {
    add('systemRequirements.availableFaultCurrentKa', finite(locationResult[1].threePhaseKA), `studyResults.shortCircuit.${locationResult[0]}.threePhaseKA`, 'Short Circuit');
    add('systemRequirements.faultCurrentMethod', locationResult[1].method || shortCircuit._meta?.method, `studyResults.shortCircuit.${locationResult[0]}.method`, 'Short Circuit');
    add('systemRequirements.faultCurrentBasis', `Location-specific result for ${locationResult[1].equipmentTag || lineup.equipmentTag || lineup.tag}`, `studyResults.shortCircuit.${locationResult[0]}`, 'Short Circuit');
  } else {
    const summaryFault = finite(firstValue(shortCircuit, ['availableFaultKa', 'availableFaultKA', 'faultCurrentKA', 'faultKa']));
    if (summaryFault !== null) {
      add('systemRequirements.availableFaultCurrentKa', summaryFault, 'studyResults.shortCircuit.availableFaultKa', 'Short Circuit summary');
      add('systemRequirements.faultCurrentMethod', shortCircuit._meta?.method, 'studyResults.shortCircuit._meta.method', 'Short Circuit summary');
      add('systemRequirements.faultCurrentBasis', 'Project summary value; confirm the available fault current at this MCC location.', 'studyResults.shortCircuit.availableFaultKa', 'Short Circuit summary');
    }
  }

  const equipmentLocation = firstEntry(equipmentRecord, ['arrangement', 'location', 'area']);
  const projectLocation = [firstValue(projectMeta, ['site']), firstValue(projectMeta, ['location'])].filter(Boolean).join(' / ');
  add(
    'installationRequirements.installationLocation',
    equipmentLocation?.value || projectLocation,
    equipmentLocation ? `equipment.${equipmentSourceId}.${equipmentLocation.key}` : 'projectMeta.site',
    equipmentLocation ? 'Equipment List' : 'Project Metadata'
  );
  const coordinates = ['x', 'y', 'z'].map(axis => firstValue(equipmentRecord, [axis])).filter(hasValue);
  if (coordinates.length === 3) add('installationRequirements.equipmentCoordinates', `X ${coordinates[0]}, Y ${coordinates[1]}, Z ${coordinates[2]}`, `equipment.${equipmentRecord?.id || lineup.equipmentTag}.coordinates`, 'Equipment List');
  if (Object.prototype.hasOwnProperty.call(projectMeta, 'altitudeFt')) add('installationRequirements.altitudeFt', finite(projectMeta.altitudeFt), 'projectMeta.altitudeFt', 'Project Metadata');
  if (Object.prototype.hasOwnProperty.call(projectMeta, 'minAmbientTempC')) add('installationRequirements.minAmbientTempC', finite(projectMeta.minAmbientTempC), 'projectMeta.minAmbientTempC', 'Project Metadata');
  if (Object.prototype.hasOwnProperty.call(projectMeta, 'maxAmbientTempC')) add('installationRequirements.maxAmbientTempC', finite(projectMeta.maxAmbientTempC), 'projectMeta.maxAmbientTempC', 'Project Metadata');
  add('installationRequirements.environmentClassification', firstValue(equipmentRecord, ['environmentClassification', 'environment', 'environmentalRating']), `equipment.${equipmentRecord?.id || lineup.equipmentTag}.environmentClassification`, 'Equipment List');
  add('installationRequirements.hazardousAreaClassification', firstValue(equipmentRecord, ['hazardousAreaClassification', 'hazardous_classification', 'areaClassification']), `equipment.${equipmentRecord?.id || lineup.equipmentTag}.hazardousAreaClassification`, 'Equipment List');

  const cableRows = Array.isArray(cables) ? cables : [];
  const incomingCables = cableRows.filter(cable => cableEndpointMatches(cable, targetTokens, 'incoming', equipmentRecord?.id));
  const outgoingCables = cableRows.filter(cable => cableEndpointMatches(cable, targetTokens, 'outgoing', equipmentRecord?.id));
  if (incomingCables.length) add('installationRequirements.incomingCableSummary', incomingCables.map(cable => cableDescription(cable, 'incoming')).join('\n'), 'cableSchedule.incoming', 'Cable Schedule');
  if (outgoingCables.length) add('installationRequirements.outgoingCableSummary', outgoingCables.map(cable => cableDescription(cable, 'outgoing')).join('\n'), 'cableSchedule.outgoing', 'Cable Schedule');

  const missing = [];
  if (!equipmentRecord && !oneLineComponent) missing.push(`No Equipment List or One-Line record matches ${lineup.equipmentTag || lineup.tag || 'this lineup'}.`);
  if (!locationResult) missing.push('No location-specific Short Circuit result was found; any project summary duty must be confirmed at the MCC bus.');
  if (!incomingCables.length) missing.push('No incoming Cable Schedule record terminates at this MCC.');

  return {
    values,
    bindings,
    missing,
    sources: [...new Set(Object.values(bindings).map(binding => binding.sourceLabel))]
  };
}

export function applyMccProjectInputSuggestions(lineup = {}, suggestions = {}, { force = false, replaceDefaults = false } = {}) {
  const next = JSON.parse(JSON.stringify(lineup || {}));
  const overrides = new Set(Array.isArray(next.projectDataOverrides) ? next.projectDataOverrides : []);
  const linkedFields = new Set(Array.isArray(next.projectDataLinkedFields) ? next.projectDataLinkedFields : []);
  const sourceBindings = next.projectDataSources && typeof next.projectDataSources === 'object'
    ? { ...next.projectDataSources }
    : {};
  let applied = 0;

  Object.entries(suggestions.values || {}).forEach(([path, value]) => {
    const targetValue = getPath(next, path);
    const linked = linkedFields.has(path);
    const overridden = overrides.has(path);
    const replaceableDefault = replaceDefaults
      && Object.prototype.hasOwnProperty.call(REPLACEABLE_MCC_DEFAULTS, path)
      && valuesEqual(targetValue, REPLACEABLE_MCC_DEFAULTS[path]);
    const shouldApply = force || (!overridden && (linked || !hasValue(targetValue) || replaceableDefault));
    if (!shouldApply) return;
    setPath(next, path, value);
    linkedFields.add(path);
    sourceBindings[path] = suggestions.bindings?.[path] || sourceEntry('', 'Project data');
    if (force) overrides.delete(path);
    applied += 1;
  });

  next.projectDataOverrides = [...overrides].sort();
  next.projectDataLinkedFields = [...linkedFields].sort();
  next.projectDataSources = sourceBindings;
  return { lineup: next, applied };
}

export function markMccProjectFieldOverride(lineup = {}, path = '') {
  const normalizedPath = text(path);
  if (!normalizedPath) return lineup;
  const overrides = new Set(Array.isArray(lineup.projectDataOverrides) ? lineup.projectDataOverrides : []);
  overrides.add(normalizedPath);
  lineup.projectDataOverrides = [...overrides].sort();
  return lineup;
}

export function mccProjectFieldSource(lineup = {}, path = '') {
  const linked = new Set(Array.isArray(lineup.projectDataLinkedFields) ? lineup.projectDataLinkedFields : []);
  const overrides = new Set(Array.isArray(lineup.projectDataOverrides) ? lineup.projectDataOverrides : []);
  if (!linked.has(path)) return { state: 'manual', sourceLabel: 'MCC entry / profile default', sourcePath: '' };
  const binding = lineup.projectDataSources?.[path] || {};
  return {
    state: overrides.has(path) ? 'override' : 'linked',
    sourceLabel: overrides.has(path) ? `Manual MCC override${binding.sourceLabel ? ` of ${binding.sourceLabel}` : ''}` : (binding.sourceLabel || 'Project data'),
    sourcePath: binding.sourcePath || ''
  };
}
