import { validateDesignSynthesisThermalInput } from './designSynthesisThermal.mjs';
import { validateDesignSynthesisInputEvidence } from './designSynthesisInputEvidence.mjs';
import { validateEndpointInstallation } from './designSynthesisEndpointInstallation.mjs';
import { validatePanelLocationOverrides } from './designSynthesisOverrides.mjs';
import { buildDesignSynthesisPanelIdentityPlan } from './designSynthesisPanelIdentity.mjs';
import { validateDesignSynthesisStudyCriteria } from './designSynthesisStudy.mjs';
import { isDesignSynthesisMotor, validateDesignSynthesisMotorInputs } from './designSynthesisMotors.mjs';
import { validateDesignSynthesisMotorAccelerationInputs } from './designSynthesisMotorAcceleration.mjs';
import { validateExistingTray } from './designSynthesisExistingTray.mjs';

const SUPPORTED_UNITS = new Set(['ft', 'feet', 'in', 'inch', 'inches', 'm', 'meter', 'meters']);
const SUPPORTED_DUTY = new Set(['continuous', 'intermittent', 'non-continuous']);
const SUPPORTED_FREQUENCY = new Set([50, 60]);
const SUPPORTED_CRITERIA_KEYS = new Set([
  'cableCatalog', 'coordinateUnit', 'corridorUnit', 'maxPanelLoadKva', 'maxLoadsPerPanel',
  'voltageDropLimitPct', 'temperatureRatingC', 'terminalRatingC', 'terminalTempRatingC',
  'frequencyHz', 'frequency', 'ambientTempC', 'bundledConductors', 'maxEndpointAttachmentFt', 'allowAlternateEndpointAttachments',
  'installationType', 'conductorMaterial', 'code', 'thermal', 'endpointInstallation', 'loadFlow',
  'minimumConductorAmpacity',
  'transformer',
  'motorStarting',
  'motorStarter',
  'motorAcceleration',
]);

function issue(code, message, path, severity = 'blocking') {
  return { code, message, path, severity };
}
function numeric(value) { return typeof value === 'number' && Number.isFinite(value); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function positive(value) { return numeric(value) && value > 0; }
function point(value) { return object(value) && numeric(value.x) && numeric(value.y) && numeric(value.z); }
function nodeKey(value) { return String(value ?? '').trim().toLowerCase(); }
function addIdentity(map, value, path, issues, kind) {
  const id = value?.id == null ? '' : String(value.id).trim();
  if (!id) { issues.push(issue('MISSING_ID', `${kind} requires a non-empty id.`, `${path}.id`)); return; }
  const key = id.toLowerCase();
  if (map.has(key)) issues.push(issue('DUPLICATE_ID', `Duplicate id ${id}; already used at ${map.get(key)}.`, `${path}.id`));
  else map.set(key, path);
}
function addTag(tags, value, path, issues, kind) {
  if (value?.tag == null || String(value.tag).trim() === '') return;
  const tag = String(value.tag).trim(); const key = tag.toLowerCase();
  if (tags.has(key)) issues.push(issue('DUPLICATE_TAG', `Duplicate tag ${tag}; already used at ${tags.get(key)}.`, `${path}.tag`));
  else tags.set(key, path);
}
function validateFrequencyAliases(record, path, issues) {
  if (!object(record)) return;
  const hasHz = Object.prototype.hasOwnProperty.call(record, 'frequencyHz');
  const hasAlias = Object.prototype.hasOwnProperty.call(record, 'frequency');
  for (const [field, present] of [['frequencyHz', hasHz], ['frequency', hasAlias]]) {
    if (present && (!numeric(record[field]) || record[field] !== 60)) issues.push(issue('UNSUPPORTED_FREQUENCY', `${field} must be the finite supported value 60 Hz.`, `${path}.${field}`));
  }
  if (hasHz && hasAlias && numeric(record.frequencyHz) && numeric(record.frequency) && record.frequencyHz !== record.frequency) issues.push(issue('CONFLICTING_FREQUENCY_ALIASES', 'frequencyHz and frequency must agree when both are supplied.', path));
}

/**
 * Validate and lightly sanitize a design-synthesis input without performing
 * electrical sizing. The generator should call this before normalization.
 */
export function validateDesignSynthesisInput(input = {}) {
  const issues = [];
  if (!object(input)) return { ok: false, issues: [issue('INVALID_INPUT', 'Design-synthesis input must be an object.', '')], sanitized: {} };
  issues.push(...validateDesignSynthesisInputEvidence(input).issues);
  const sanitized = structuredClone(input);
  const supply = sanitized.supply;
  if (!object(supply)) issues.push(issue('MISSING_SUPPLY', 'Supply must be an object.', 'supply'));
  else {
    addIdentity(new Map(), supply, 'supply', issues, 'Supply');
    if (!positive(supply.voltage)) issues.push(issue('INVALID_SUPPLY_VOLTAGE', 'Supply voltage must be positive.', 'supply.voltage'));
    if (![1, 3].includes(supply.phases)) issues.push(issue('INVALID_SUPPLY_PHASES', 'Supply phases must be 1 or 3 for this synthesis scope.', 'supply.phases'));
    if (!positive(supply.capacityKva)) issues.push(issue('INVALID_SUPPLY_CAPACITY', 'Supply capacityKva must be positive.', 'supply.capacityKva'));
    if (Object.prototype.hasOwnProperty.call(supply, 'availableFaultCurrentKA') && !positive(supply.availableFaultCurrentKA)) issues.push(issue('INVALID_AVAILABLE_FAULT_CURRENT', 'availableFaultCurrentKA must be a finite positive number when supplied.', 'supply.availableFaultCurrentKA'));
    if (!point(supply)) issues.push(issue('INVALID_SUPPLY_LOCATION', 'Supply x, y, and z coordinates are required.', 'supply'));
    validateFrequencyAliases(supply, 'supply', issues);
  }
  const ids = new Map(); const tags = new Map();
  if (supply) { addIdentity(ids, supply, 'supply', issues, 'Supply'); addTag(tags, supply, 'supply', issues, 'Supply'); }
  if (!Array.isArray(sanitized.equipment) || !sanitized.equipment.length) issues.push(issue('MISSING_EQUIPMENT', 'At least one equipment item is required.', 'equipment'));
  for (const [index, item] of (Array.isArray(sanitized.equipment) ? sanitized.equipment : []).entries()) {
    const path = `equipment[${index}]`;
    if (!object(item)) { issues.push(issue('INVALID_EQUIPMENT', 'Equipment item must be an object.', path)); continue; }
    addIdentity(ids, item, path, issues, 'Equipment'); addTag(tags, item, path, issues, 'Equipment');
    if (!positive(item.kw)) issues.push(issue('INVALID_LOAD_KW', 'Equipment kw must be positive.', `${path}.kw`));
    if (!positive(item.voltage)) issues.push(issue('INVALID_LOAD_VOLTAGE', 'Equipment voltage must be positive.', `${path}.voltage`));
    if (![1, 3].includes(item.phases)) issues.push(issue('INVALID_LOAD_PHASES', 'Equipment phases must be 1 or 3 for this synthesis scope.', `${path}.phases`));
    if (item.powerFactor !== undefined && (!numeric(item.powerFactor) || item.powerFactor <= 0 || item.powerFactor > 1)) issues.push(issue('INVALID_POWER_FACTOR', 'Equipment powerFactor must be greater than 0 and no greater than 1.', `${path}.powerFactor`));
    if (item.duty !== undefined && !SUPPORTED_DUTY.has(String(item.duty).toLowerCase())) issues.push(issue('UNSUPPORTED_DUTY', `Equipment duty must be one of ${[...SUPPORTED_DUTY].join(', ')}.`, `${path}.duty`));
    if (item.ratingsBasis !== undefined && item.ratingsBasis !== 'electrical-input-kW') issues.push(issue('UNSUPPORTED_RATINGS_BASIS', 'Only electrical-input-kW ratings are supported; motor shaft-output conversion is not modeled.', `${path}.ratingsBasis`));
    if (isDesignSynthesisMotor(item)
      && item.ratingsBasis !== 'electrical-input-kW') issues.push(issue('MOTOR_INPUT_KW_BASIS_REQUIRED', 'Motor equipment kw must explicitly use ratingsBasis electrical-input-kW.', `${path}.ratingsBasis`));
    validateFrequencyAliases(item, path, issues);
    if (!point(item)) issues.push(issue('INVALID_LOAD_LOCATION', 'Equipment x, y, and z coordinates are required.', path));
  }
  const criteria = sanitized.criteria;
  if (!object(criteria)) issues.push(issue('MISSING_CRITERIA', 'Criteria must be an object; omitted limits are not treated as passed.', 'criteria'));
  else {
    for (const key of Object.keys(criteria)) if (!SUPPORTED_CRITERIA_KEYS.has(key)) issues.push(issue('UNKNOWN_DESIGN_CRITERION', `Unknown design criterion ${key}; it is not used by the synthesis model.`, `criteria.${key}`));
    if (criteria.allowAlternateEndpointAttachments !== undefined && typeof criteria.allowAlternateEndpointAttachments !== 'boolean') issues.push(issue('INVALID_ALTERNATE_ENDPOINT_PERMISSION', 'allowAlternateEndpointAttachments must be a boolean.', 'criteria.allowAlternateEndpointAttachments'));
    if (criteria.transformer !== undefined) {
      if (!object(criteria.transformer)) issues.push(issue('INVALID_TRANSFORMER_CRITERIA', 'criteria.transformer must be an object.', 'criteria.transformer'));
      else {
        const allowed = new Set(['secondaryVoltageVac', 'maxLoadingPercent', 'allowedProfileIds', 'windingMaterial']);
        for (const key of Object.keys(criteria.transformer)) if (!allowed.has(key)) issues.push(issue('UNKNOWN_TRANSFORMER_CRITERION', `Unknown transformer criterion ${key}.`, `criteria.transformer.${key}`));
        const config = criteria.transformer;
        if (config.secondaryVoltageVac !== undefined && !positive(config.secondaryVoltageVac)) issues.push(issue('INVALID_TRANSFORMER_SECONDARY_VOLTAGE', 'secondaryVoltageVac must be positive.', 'criteria.transformer.secondaryVoltageVac'));
        if (config.maxLoadingPercent !== undefined && (!positive(config.maxLoadingPercent) || config.maxLoadingPercent > 100)) issues.push(issue('INVALID_TRANSFORMER_LOADING_LIMIT', 'maxLoadingPercent must be greater than zero and no greater than 100 for this screening profile.', 'criteria.transformer.maxLoadingPercent'));
        if (config.allowedProfileIds !== undefined && (!Array.isArray(config.allowedProfileIds) || !config.allowedProfileIds.length || config.allowedProfileIds.some(value => typeof value !== 'string' || !value.trim()))) issues.push(issue('INVALID_TRANSFORMER_PROFILE_ALLOWLIST', 'allowedProfileIds must be a non-empty array of profile IDs.', 'criteria.transformer.allowedProfileIds'));
        if (config.windingMaterial !== undefined && String(config.windingMaterial).toLowerCase() !== 'copper') issues.push(issue('UNSUPPORTED_TRANSFORMER_WINDING', 'Only the sourced copper transformer profiles are supported.', 'criteria.transformer.windingMaterial'));
      }
    }
    if (criteria.cableCatalog !== undefined && (!Array.isArray(criteria.cableCatalog) || criteria.cableCatalog.length)) issues.push(issue('UNSUPPORTED_CABLE_CATALOG_OVERRIDE', 'Custom cable catalogs are not supported by this sourced Southwire construction model.', 'criteria.cableCatalog'));
    if (criteria.coordinateUnit !== undefined && String(criteria.coordinateUnit).toLowerCase() !== 'ft') issues.push(issue('UNSUPPORTED_UNIT', 'Coordinate units must be ft; metric conversion is not implicit.', 'criteria.coordinateUnit'));
    if (criteria.corridorUnit !== undefined && String(criteria.corridorUnit).toLowerCase() !== 'in') issues.push(issue('UNSUPPORTED_UNIT', 'Corridor dimensions must be inches; conversion is not implicit.', 'criteria.corridorUnit'));
    if (criteria.maxPanelLoadKva !== undefined && !positive(criteria.maxPanelLoadKva)) issues.push(issue('INVALID_PANEL_LIMIT', 'maxPanelLoadKva must be positive.', 'criteria.maxPanelLoadKva'));
    if (criteria.maxLoadsPerPanel !== undefined && (!Number.isInteger(criteria.maxLoadsPerPanel) || criteria.maxLoadsPerPanel < 1)) issues.push(issue('INVALID_PANEL_COUNT_LIMIT', 'maxLoadsPerPanel must be a positive integer.', 'criteria.maxLoadsPerPanel'));
    if (criteria.voltageDropLimitPct !== undefined && (!numeric(criteria.voltageDropLimitPct) || criteria.voltageDropLimitPct <= 0)) issues.push(issue('INVALID_VOLTAGE_DROP_LIMIT', 'voltageDropLimitPct must be positive.', 'criteria.voltageDropLimitPct'));
    if (criteria.temperatureRatingC !== undefined && ![60, 75].includes(criteria.temperatureRatingC)) issues.push(issue('INVALID_TEMPERATURE_RATING', 'temperatureRatingC must be 60 or 75 C for the sourced 75 C impedance model.', 'criteria.temperatureRatingC'));
    const terminal = criteria.terminalRatingC;
    if (terminal !== undefined && ![60, 75].includes(terminal)) issues.push(issue('INVALID_TERMINAL_RATING', 'terminalRatingC must be 60 or 75 C.', 'criteria.terminalRatingC'));
    validateFrequencyAliases(criteria, 'criteria', issues);
    if (Object.prototype.hasOwnProperty.call(criteria, 'minimumConductorAmpacity')) issues.push(issue('UNSUPPORTED_EXTERNAL_AMPACITY', 'criteria.minimumConductorAmpacity is reserved for internally derived protection requirements and cannot be supplied as an external override.', 'criteria.minimumConductorAmpacity'));
    issues.push(...validateDesignSynthesisStudyCriteria(criteria).issues);
    if (criteria.ambientTempC !== undefined && (!numeric(criteria.ambientTempC) || criteria.ambientTempC < 0 || criteria.ambientTempC > 60)) issues.push(issue('INVALID_AMBIENT', 'ambientTempC must be between 0 and 60 C.', 'criteria.ambientTempC'));
    if (criteria.bundledConductors !== undefined && (!Number.isInteger(criteria.bundledConductors) || criteria.bundledConductors < 1)) issues.push(issue('INVALID_BUNDLING', 'bundledConductors must be a positive integer.', 'criteria.bundledConductors'));
    if (criteria.maxEndpointAttachmentFt !== undefined && (!numeric(criteria.maxEndpointAttachmentFt) || criteria.maxEndpointAttachmentFt < 0)) issues.push(issue('INVALID_ENDPOINT_ATTACHMENT', 'maxEndpointAttachmentFt must be nonnegative.', 'criteria.maxEndpointAttachmentFt'));
    if (criteria.installationType !== undefined && !['conduit', 'tray_spaced', 'tray_touching'].includes(criteria.installationType)) issues.push(issue('INVALID_INSTALLATION_TYPE', 'installationType must be conduit, tray_spaced, or tray_touching.', 'criteria.installationType'));
    if (criteria.conductorMaterial !== undefined && !['cu', 'copper'].includes(String(criteria.conductorMaterial).toLowerCase())) issues.push(issue('UNSUPPORTED_CONDUCTOR_MATERIAL', 'Only the sourced copper construction is supported.', 'criteria.conductorMaterial'));
    if (criteria.code !== undefined && String(criteria.code).toUpperCase() !== 'NEC') issues.push(issue('UNSUPPORTED_CODE', 'Only NEC screening tables are supported.', 'criteria.code'));
    if (criteria.terminalTempRatingC !== undefined && ![60, 75].includes(criteria.terminalTempRatingC)) issues.push(issue('INVALID_TERMINAL_RATING', 'terminalTempRatingC must be 60 or 75 C.', 'criteria.terminalTempRatingC'));
    if (criteria.terminalRatingC !== undefined && criteria.terminalTempRatingC !== undefined && criteria.terminalRatingC !== criteria.terminalTempRatingC) issues.push(issue('CONFLICTING_TERMINAL_RATING_ALIASES', 'terminalRatingC and terminalTempRatingC must agree when both are supplied.', 'criteria'));
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'protectiveDevices') && (!Array.isArray(sanitized.protectiveDevices) || sanitized.protectiveDevices.some(item => !object(item)))) issues.push(issue('INVALID_PROTECTIVE_DEVICE_INPUT', 'protectiveDevices must be an array of non-null records.', 'protectiveDevices'));
  const graph = sanitized.corridors;
  if (!object(graph)) issues.push(issue('MISSING_CORRIDORS', 'Corridors must contain nodes and edges.', 'corridors'));
  else {
    const nodeIds = new Map();
    if (!Array.isArray(graph.nodes) || !graph.nodes.length) issues.push(issue('MISSING_CORRIDOR_NODES', 'At least one corridor node is required.', 'corridors.nodes'));
    for (const [index, node] of (Array.isArray(graph.nodes) ? graph.nodes : []).entries()) { const path = `corridors.nodes[${index}]`; addIdentity(nodeIds, node, path, issues, 'Corridor node'); if (!point(node)) issues.push(issue('INVALID_CORRIDOR_NODE', 'Corridor node x, y, and z coordinates are required.', path)); }
    const edgeIds = new Map();
    if (!Array.isArray(graph.edges) || !graph.edges.length) issues.push(issue('MISSING_CORRIDOR_EDGES', 'At least one permitted corridor edge is required.', 'corridors.edges'));
    for (const [index, edge] of (Array.isArray(graph.edges) ? graph.edges : []).entries()) {
      const path = `corridors.edges[${index}]`; addIdentity(edgeIds, edge, path, issues, 'Corridor edge');
      for (const field of ['permitted', 'allowed']) if (Object.prototype.hasOwnProperty.call(edge || {}, field) && typeof edge[field] !== 'boolean') issues.push(issue('INVALID_CORRIDOR_PERMISSION', `${field} must be a boolean when supplied.`, `${path}.${field}`));
      if (Object.prototype.hasOwnProperty.call(edge || {}, 'permitted') && Object.prototype.hasOwnProperty.call(edge || {}, 'allowed') && typeof edge.permitted === 'boolean' && typeof edge.allowed === 'boolean' && edge.permitted !== edge.allowed) issues.push(issue('CONFLICTING_CORRIDOR_PERMISSION', 'permitted and allowed must agree when both are supplied.', path));
      if (!nodeIds.has(nodeKey(edge?.from)) || !nodeIds.has(nodeKey(edge?.to))) issues.push(issue('INVALID_CORRIDOR_ENDPOINT', 'Corridor edge endpoints must reference valid nodes.', path));
      const fromNode = (Array.isArray(graph.nodes) ? graph.nodes : []).find(node => nodeKey(node?.id) === nodeKey(edge?.from));
      const toNode = (Array.isArray(graph.nodes) ? graph.nodes : []).find(node => nodeKey(node?.id) === nodeKey(edge?.to));
      if (nodeKey(edge?.from) === nodeKey(edge?.to) || (fromNode && toNode && fromNode.x === toNode.x && fromNode.y === toNode.y && fromNode.z === toNode.z)) issues.push(issue('ZERO_LENGTH_CORRIDOR', 'Corridor edges cannot have coincident endpoints.', path));
      if (!positive(edge?.widthIn) || !positive(edge?.depthIn)) issues.push(issue('INVALID_CORRIDOR_DIMENSIONS', 'Permitted corridor widthIn and depthIn must be positive.', path));
      issues.push(...validateExistingTray(edge, path).issues.map(item => issue(item.code, item.message, item.path)));
    }
  }
  const thermalValidation = validateDesignSynthesisThermalInput(sanitized);
  issues.push(...thermalValidation.issues);
  issues.push(...validateDesignSynthesisMotorInputs(sanitized).inputIssues);
  issues.push(...validateDesignSynthesisMotorAccelerationInputs({ loads: sanitized.equipment, criteria }).issues);
  issues.push(...validateEndpointInstallation(criteria || {}).issues);
  issues.push(...validatePanelLocationOverrides(sanitized.overrides).issues);
  issues.push(...buildDesignSynthesisPanelIdentityPlan([], sanitized.generationBaseline).issues);
  const maxPanel = criteria?.maxPanelLoadKva;
  if (positive(supply?.capacityKva)) {
    const totalKva = (Array.isArray(sanitized.equipment) ? sanitized.equipment : []).reduce((sum, item) => sum + (positive(item?.kw) ? item.kw / (positive(item?.powerFactor) ? item.powerFactor : 1) : 0), 0);
    if (totalKva > supply.capacityKva) issues.push(issue('SOURCE_CAPACITY_EXCEEDED', 'Total connected load exceeds source capacity.', 'supply.capacityKva'));
  }
  if (positive(maxPanel)) for (const [index, item] of (Array.isArray(sanitized.equipment) ? sanitized.equipment : []).entries()) { const pf = positive(item?.powerFactor) ? item.powerFactor : 1; const kva = numeric(item?.kw) ? item.kw / pf : 0; if (kva > maxPanel) issues.push(issue('LOAD_EXCEEDS_PANEL_LIMIT', `Equipment ${item?.id || index} exceeds maxPanelLoadKva.`, `equipment[${index}]`)); }
  for (const prefix of ['dp-', 'f-', 'c-']) for (const [id, path] of ids) if (id.startsWith(prefix)) issues.push(issue('RESERVED_GENERATED_ID', `Input id ${id} uses a reserved generated prefix.`, `${path}.id`));
  for (const [id, path] of ids) if (tags.has(id) && tags.get(id) !== path) issues.push(issue('ID_TAG_ALIAS_COLLISION', `Input id aliases another record tag (${id}).`, path));
  return { ok: issues.length === 0, issues, sanitized };
}

export default { validateDesignSynthesisInput };
