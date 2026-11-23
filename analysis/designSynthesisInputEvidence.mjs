import { validateMotorOperatingReference } from './motorReferenceProfiles.mjs';
import { validateStartingSourceBasis } from './designSynthesisStartingSourceBasis.mjs';

const KINDS = new Set(['synthetic', 'user-supplied', 'document-referenced']);

const UNITS = Object.freeze({
  coordinate: 'ft',
  corridor: 'in',
  voltage: 'V',
  power: 'kW',
  capacity: 'kVA',
  frequency: 'Hz',
  motorVoltage: 'V',
  motorCurrent: 'A',
  motorPowerFactor: 'per-unit',
  impedance: 'ohm per phase',
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function issue(path, message) {
  return { code: 'INVALID_PROVENANCE', path, message, severity: 'blocking' };
}

function validateFrequency(record, path, issues) {
  if (!isObject(record)) return undefined;
  const entries = ['frequencyHz', 'frequency']
    .filter(key => Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined)
    .map(key => ({ key, value: record[key] }));
  for (const entry of entries) {
    if (typeof entry.value !== 'number' || !Number.isFinite(entry.value) || entry.value <= 0) issues.push(issue(`${path}.${entry.key}`, 'frequency must be a positive finite number.'));
  }
  if (entries.length === 2 && entries[0].value !== entries[1].value) issues.push(issue(path, 'frequencyHz and frequency must agree.'));
  return entries[0]?.value;
}

function meaningfulReference(value) {
  if (typeof value === 'string') return value.trim().length > 0;
  if (!isObject(value)) return false;
  return ['id', 'title', 'url', 'reference'].some(key => typeof value[key] === 'string' && value[key].trim().length > 0);
}

function evidenceArray(value, path, issues) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(item => !meaningfulReference(item))) {
    issues.push(issue(path, 'Evidence must be an array of non-blank strings or identifiable objects (id, title, url, or reference).'));
    return [];
  }
  return value;
}

function provenanceValue(value, path, issues) {
  if (value === undefined) return null;
  if (typeof value === 'string') {
    if (!KINDS.has(value)) issues.push(issue(path, `provenance kind must be one of ${[...KINDS].join(', ')}.`));
    return { kind: value };
  }
  if (!isObject(value)) {
    issues.push(issue(path, 'provenance must be a kind string or object.'));
    return null;
  }
  for (const key of Object.keys(value)) if (!['kind', 'note', 'sourceDocuments', 'references'].includes(key)) issues.push(issue(`${path}.${key}`, 'Unknown provenance field.'));
  if (typeof value.kind !== 'string' || !KINDS.has(value.kind)) issues.push(issue(`${path}.kind`, `provenance kind must be one of ${[...KINDS].join(', ')}.`));
  if (value.note !== undefined && typeof value.note !== 'string') issues.push(issue(`${path}.note`, 'provenance note must be a string.'));
  for (const key of ['sourceDocuments', 'references']) {
    if (value[key] !== undefined) evidenceArray(value[key], `${path}.${key}`, issues);
  }
  return { ...clone(value), kind: value.kind };
}

function recordEvidence(record, fallback, path, issues, options = {}) {
  const explicit = record?.provenance !== undefined ? record.provenance : fallback;
  const provenance = provenanceValue(explicit, `${path}.provenance`, issues);
  const documents = record?.sourceDocuments !== undefined
    ? evidenceArray(record.sourceDocuments, `${path}.sourceDocuments`, issues)
    : (provenance?.sourceDocuments ? provenance.sourceDocuments : []);
  if (record?.references !== undefined) evidenceArray(record.references, `${path}.references`, issues);
  const kind = provenance?.kind || (documents.length ? 'document-referenced' : 'user-supplied');
  if (kind === 'document-referenced' && documents.length === 0) issues.push(issue(`${path}.sourceDocuments`, 'document-referenced records require sourceDocuments.'));
  const values = {};
  const fields = options.supply
    ? ['voltage', 'phases', 'capacityKva', 'availableFaultCurrentKA', 'x', 'y', 'z']
    : ['kw', 'voltage', 'phases', 'x', 'y', 'z'];
  for (const field of fields) if (Object.prototype.hasOwnProperty.call(record || {}, field)) values[field] = { value: record[field], basis: 'provided' };
  if (options.supply && record?.motorStartingImpedance !== undefined) values.motorStartingImpedance = { value: clone(record.motorStartingImpedance), basis: record?.motorStartingImpedanceBasis && !validateStartingSourceBasis(record) ? 'source-case-derived' : 'provided' };
  if (options.supply && record?.motorStartingImpedanceBasis !== undefined) values.motorStartingImpedanceBasis = { value: clone(record.motorStartingImpedanceBasis), basis: 'provided' };
  if (options.supply && record?.voltageSystem !== undefined) values.voltageSystem = { value: clone(record.voltageSystem), basis: 'provided' };
  if (options.ratings && record && Object.prototype.hasOwnProperty.call(record, 'powerFactor')) values.powerFactor = { value: record.powerFactor, basis: 'provided' };
  else if (options.ratings) values.powerFactor = { value: 1, basis: 'default' };
  if (options.ratings && record && Object.prototype.hasOwnProperty.call(record, 'duty')) values.duty = { value: record.duty, basis: 'provided' };
  else if (options.ratings) values.duty = { value: 'continuous', basis: 'default' };
  const effectiveFrequency = options.effectiveFrequency ?? 60;
  const recordFrequency = record && (record.frequencyHz ?? record.frequency);
  if (recordFrequency !== undefined) values.frequencyHz = { value: recordFrequency, basis: 'provided' };
  else if (options.frequencySource) values.frequencyHz = { value: effectiveFrequency, basis: 'inherited', source: options.frequencySource };
  else values.frequencyHz = { value: effectiveFrequency, basis: 'default' };
  if (options.ratings) {
    values.ratingsBasis = { value: record?.ratingsBasis || 'electrical-input-kW', basis: record?.ratingsBasis ? 'provided' : 'default' };
    if (record?.motor && typeof record.motor === 'object') values.motor = { value: clone(record.motor), basis: 'provided' };
    if (record?.motorOperatingBasis && typeof record.motorOperatingBasis === 'object') {
      values.motorOperatingBasis = { value: clone(record.motorOperatingBasis), basis: 'provided' };
      if (!validateMotorOperatingReference(record)) {
        if (values.kw) values.kw.basis = 'manufacturer-reference-derived';
        if (values.powerFactor) values.powerFactor.basis = 'manufacturer-reference-derived';
      }
    }
  }
  const result = { id: record?.id ?? null, classification: kind, values };
  if (provenance?.note !== undefined) result.note = provenance.note;
  if (documents.length) result.sourceDocuments = clone(documents);
  if (Array.isArray(record?.references)) result.references = clone(record.references);
  else if (Array.isArray(provenance?.references)) result.references = clone(provenance.references);
  return result;
}

export function validateDesignSynthesisInputEvidence(input = {}) {
  const issues = [];
  if (!isObject(input)) return { ok: false, issues: [issue('input', 'input must be an object.')] };
  provenanceValue(input.provenance, 'provenance', issues);
  if (input.supply !== undefined && !isObject(input.supply)) issues.push(issue('supply', 'supply must be an object when provided.'));
  if (Array.isArray(input.equipment)) input.equipment.forEach((record, index) => { if (!isObject(record)) issues.push(issue(`equipment[${index}]`, 'equipment records must be objects.')); });
  else if (input.equipment !== undefined) issues.push(issue('equipment', 'equipment must be an array when provided.'));
  const sourceFrequency = validateFrequency(input.supply, 'supply', issues);
  const sourceBasisIssue = validateStartingSourceBasis(input.supply);
  if (sourceBasisIssue) issues.push({ code: 'SOURCE_STARTING_BASIS_STALE', path: 'supply.motorStartingImpedanceBasis', message: sourceBasisIssue, severity: 'blocking' });
  const criteriaFrequency = validateFrequency(input.criteria, 'criteria', issues);
  const effectiveFrequency = sourceFrequency ?? criteriaFrequency ?? 60;
  if (sourceFrequency !== undefined && criteriaFrequency !== undefined && sourceFrequency !== criteriaFrequency) issues.push(issue('criteria.frequencyHz', 'Criteria frequency conflicts with the supplied source frequency.'));
  if (isObject(input.supply)) recordEvidence(input.supply, input.provenance, 'supply', issues, { supply: true, effectiveFrequency, frequencySource: sourceFrequency !== undefined ? 'supply.frequencyHz' : (criteriaFrequency !== undefined ? 'criteria.frequencyHz' : null) });
  if (Array.isArray(input.equipment)) input.equipment.forEach((record, index) => {
    if (!isObject(record)) return;
    const loadFrequency = validateFrequency(record, `equipment[${index}]`, issues);
    if (loadFrequency !== undefined && loadFrequency !== effectiveFrequency) issues.push(issue(`equipment[${index}].frequencyHz`, `Equipment frequency ${loadFrequency} conflicts with effective system frequency ${effectiveFrequency}.`));
    recordEvidence(record, input.provenance, `equipment[${index}]`, issues, { ratings: true, effectiveFrequency, frequencySource: sourceFrequency !== undefined ? 'supply.frequencyHz' : (criteriaFrequency !== undefined ? 'criteria.frequencyHz' : null) });
  });
  return { ok: issues.length === 0, issues };
}

export function buildDesignSynthesisInputEvidence(input = {}) {
  const validation = validateDesignSynthesisInputEvidence(input);
  if (!validation.ok) return { units: clone(UNITS), records: {}, issues: validation.issues, valid: false };
  const fallback = input.provenance;
  return {
    units: clone(UNITS),
    records: {
      supply: isObject(input.supply) ? recordEvidence(input.supply, fallback, 'supply', [], { supply: true, effectiveFrequency: input.supply.frequencyHz ?? input.supply.frequency ?? input.criteria?.frequencyHz ?? input.criteria?.frequency ?? 60, frequencySource: input.supply.frequencyHz !== undefined || input.supply.frequency !== undefined ? 'supply.frequencyHz' : (input.criteria?.frequencyHz !== undefined || input.criteria?.frequency !== undefined ? 'criteria.frequencyHz' : null) }) : null,
      equipment: (Array.isArray(input.equipment) ? input.equipment : []).filter(isObject).map((record, index) => recordEvidence(record, fallback, `equipment[${index}]`, [], { ratings: true, effectiveFrequency: input.supply?.frequencyHz ?? input.supply?.frequency ?? input.criteria?.frequencyHz ?? input.criteria?.frequency ?? 60, frequencySource: input.supply?.frequencyHz !== undefined || input.supply?.frequency !== undefined ? 'supply.frequencyHz' : (input.criteria?.frequencyHz !== undefined || input.criteria?.frequency !== undefined ? 'criteria.frequencyHz' : null) })),
    },
    valid: true,
  };
}

export default { buildDesignSynthesisInputEvidence, validateDesignSynthesisInputEvidence };
