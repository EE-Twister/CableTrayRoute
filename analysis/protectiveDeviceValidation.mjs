import {
  assessProtectiveDeviceLibraryEntry,
  PROTECTIVE_DEVICE_LIBRARY_STATUS
} from './protectiveDeviceLibrary.mjs';

export const PROTECTIVE_DEVICE_TYPES = Object.freeze([
  'breaker',
  'fuse',
  'relay',
  'relay_87',
  'recloser',
  'contactor',
  'switch'
]);

export const PROTECTIVE_DEVICE_FIELD_STATUSES = Object.freeze([
  'verified',
  'derived',
  'not_found',
  'not_applicable',
  'conflicting'
]);

export const PROTECTIVE_DEVICE_SOURCE_TYPES = Object.freeze([
  'manufacturer',
  'standards_body',
  'regulator',
  'nrtl',
  'utility',
  'distributor',
  'industry_publication'
]);

const OFFICIAL_TECHNICAL_SOURCE_TYPES = new Set([
  'manufacturer',
  'standards_body',
  'regulator',
  'nrtl'
]);
const NON_INTERRUPTING_TYPES = new Set(['relay', 'relay_87']);
const LIBRARY_STATUSES = new Set(Object.values(PROTECTIVE_DEVICE_LIBRARY_STATUS));
const FIELD_STATUSES = new Set(PROTECTIVE_DEVICE_FIELD_STATUSES);
const SOURCE_TYPES = new Set(PROTECTIVE_DEVICE_SOURCE_TYPES);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TECHNICAL_FIELD_PATHS = new Set([
  '/standards',
  '/frequencyHz',
  '/poles',
  '/ratedVoltageVac',
  '/ratedVoltageVdc',
  '/continuousCurrentA',
  '/frameA',
  '/sensorA',
  '/tripRatingA',
  '/interruptingRatings',
  '/makingCapacityKApeak',
  '/shortTimeWithstand',
  '/settings',
  '/settingOptions',
  '/protectionSettings',
  '/curve',
  '/curveProfiles',
  '/curveEvidence',
  '/curveValidation',
  '/openingTime'
]);

export const PROTECTIVE_DEVICE_RESEARCH_REQUIRED_FIELDS = Object.freeze([
  'id',
  'type',
  'subtype',
  'vendor',
  'series',
  'name',
  'catalogNumber',
  'tripUnitModel',
  'lifecycleStatus',
  'region',
  'standards',
  'frequencyHz',
  'poles',
  'ratedVoltageVac',
  'ratedVoltageVdc',
  'continuousCurrentA',
  'frameA',
  'sensorA',
  'tripRatingA',
  'interruptingRatings',
  'makingCapacityKApeak',
  'shortTimeWithstand',
  'settings',
  'settingOptions',
  'protectionSettings',
  'curve',
  'curveProfiles',
  'curveEvidence',
  'curveValidation',
  'openingTime',
  'sourceDocuments',
  'fieldSources',
  'fieldStatus',
  'missingForProduction',
  'lastVerified',
  'researchStatus',
  'libraryStatus',
  'review'
]);

const RESEARCH_STATUS_PATHS = Object.freeze([
  '/type',
  '/vendor',
  '/series',
  '/catalogNumber',
  '/tripUnitModel',
  '/lifecycleStatus',
  '/region',
  '/standards',
  '/frequencyHz',
  '/poles',
  '/ratedVoltageVac',
  '/ratedVoltageVdc',
  '/continuousCurrentA',
  '/frameA',
  '/sensorA',
  '/tripRatingA',
  '/interruptingRatings',
  '/makingCapacityKApeak',
  '/shortTimeWithstand',
  '/settings',
  '/settingOptions',
  '/protectionSettings',
  '/curve',
  '/curveProfiles',
  '/curveEvidence',
  '/curveValidation',
  '/openingTime'
]);

function own(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function issue(list, path, message) {
  list.push({ path, message });
}

function effectiveType(record) {
  return record?.type === 'relay_87' || record?.subtype === 'relay_87'
    ? 'relay_87'
    : record?.type;
}

function hasCurve(record) {
  if (Array.isArray(record?.curve) && record.curve.length >= 2) return true;
  return Array.isArray(record?.curveProfiles)
    && record.curveProfiles.some(profile => Array.isArray(profile?.curve) && profile.curve.length >= 2);
}

function hasDifferentialCharacteristic(record) {
  const settings = record?.settings;
  return effectiveType(record) === 'relay_87'
    && Number(settings?.slope1) > 0
    && Number(settings?.slope2) > 0
    && Number(settings?.minPickupPu) > 0
    && Number(settings?.breakpointPu) > 0;
}

function hasFormula(record) {
  return record?.iec60255 === true || (record?.formula && typeof record.formula === 'object');
}

function validSourceDocument(source) {
  return source
    && typeof source === 'object'
    && text(source.id)
    && SOURCE_TYPES.has(source.sourceType)
    && text(source.publisher)
    && text(source.title)
    && /^https?:\/\//i.test(text(source.url))
    && Array.isArray(source.purposes)
    && source.purposes.length > 0
    && ISO_DATE_RE.test(text(source.accessedOn));
}

function productionMissing(record) {
  const missing = [];
  const type = effectiveType(record);
  if (!text(record.catalogNumber) && !text(record.tripUnitModel)) missing.push('exact catalog number or trip-unit model');
  if (!text(record.series)) missing.push('series');
  if (!text(record.lifecycleStatus)) missing.push('lifecycle status');
  if (!Array.isArray(record.region) || !record.region.length) missing.push('region applicability');
  if (!Array.isArray(record.standards) || !record.standards.length) missing.push('standards and editions');
  if (!Array.isArray(record.frequencyHz) || !record.frequencyHz.some(value => Number(value) > 0)) missing.push('frequency applicability');
  if (!Array.isArray(record.poles) || !record.poles.some(value => Number(value) > 0)) missing.push('pole configuration');
  if (!(Number(record.ratedVoltageVac) > 0) && !(Number(record.ratedVoltageVdc) > 0)) missing.push('rated AC or DC voltage');
  if (!NON_INTERRUPTING_TYPES.has(type) && !(Number(record.continuousCurrentA) > 0)) missing.push('continuous current rating');
  if (NON_INTERRUPTING_TYPES.has(type)) {
    if (record.interruptRating !== null && record.interruptRating !== undefined) missing.push('relay interrupting rating must be null or omitted');
  } else if (!Array.isArray(record.interruptingRatings) || !record.interruptingRatings.length) {
    missing.push('voltage-specific interrupting ratings');
  }
  if (type === 'relay_87') {
    if (!hasDifferentialCharacteristic(record)) missing.push('differential restraint characteristic');
  } else if (!hasCurve(record) && !hasFormula(record)) {
    missing.push('curve points, curve profiles, or published formula');
  }
  if (type === 'fuse') {
    const roles = new Set((record.curveProfiles || []).map(profile => profile?.role));
    if (!roles.has('melting')) missing.push('minimum-melt curve profile');
    if (!roles.has('clearing')) missing.push('total-clearing curve profile');
  }
  if (!record.curveEvidence && !(record.curveProfiles || []).some(profile => profile?.curveEvidence)) {
    missing.push('curve or characteristic evidence');
  }
  if (type !== 'relay_87' && (!Array.isArray(record?.curveValidation?.spotChecks) || record.curveValidation.spotChecks.length < 3)) {
    missing.push('three official curve spot checks');
  }
  if (!Array.isArray(record.sourceDocuments) || !record.sourceDocuments.some(validSourceDocument)) {
    missing.push('traceable source document');
  }
  if (!record.fieldSources || typeof record.fieldSources !== 'object' || !Object.keys(record.fieldSources).length) {
    missing.push('field-level source mapping');
  }
  if (!record.fieldStatus || typeof record.fieldStatus !== 'object' || !Object.keys(record.fieldStatus).length) {
    missing.push('field verification statuses');
  }
  if (!ISO_DATE_RE.test(text(record.lastVerified))) missing.push('last verified date');
  if (!text(record?.review?.reviewer) || !ISO_DATE_RE.test(text(record?.review?.reviewedOn))) {
    missing.push('independent engineering review');
  }
  return missing;
}

function validateResearchRecord(record, errors, warnings) {
  PROTECTIVE_DEVICE_RESEARCH_REQUIRED_FIELDS.forEach((field) => {
    if (!own(record, field)) issue(errors, `/${field}`, 'Research records must include this field; use null, [], or {} when it is unknown or not applicable.');
  });
  if (record.researchStatus !== 'candidate') {
    issue(errors, '/researchStatus', 'Research agents must write candidate records only.');
  }
  if (record.libraryStatus !== PROTECTIVE_DEVICE_LIBRARY_STATUS.SCREENING) {
    issue(errors, '/libraryStatus', 'Research agents must leave libraryStatus as screening; promotion requires engineering review.');
  }
  if (!ISO_DATE_RE.test(text(record.lastVerified))) {
    issue(errors, '/lastVerified', 'lastVerified must use YYYY-MM-DD.');
  }
  const reviewer = text(record?.review?.reviewer);
  const reviewedOn = text(record?.review?.reviewedOn);
  if (reviewer || reviewedOn) {
    issue(errors, '/review', 'A research agent cannot claim an independent reviewer or review date.');
  }

  const sources = Array.isArray(record.sourceDocuments) ? record.sourceDocuments : [];
  if (!sources.length) issue(errors, '/sourceDocuments', 'At least one traceable online source is required.');
  sources.forEach((source, index) => {
    if (!validSourceDocument(source)) {
      issue(errors, `/sourceDocuments/${index}`, 'Sources require id, sourceType, publisher, title, HTTP(S) URL, and accessedOn date.');
    }
  });
  if (!sources.some(source => OFFICIAL_TECHNICAL_SOURCE_TYPES.has(source?.sourceType))) {
    issue(errors, '/sourceDocuments', 'At least one manufacturer, standards-body, regulator, or NRTL source is required for technical data.');
  }
  if (!sources.some(source => Array.isArray(source?.purposes) && source.purposes.includes('market_prevalence'))) {
    issue(errors, '/sourceDocuments', 'At least one source must support US market prevalence.');
  }

  const sourceIds = new Set(sources.map(source => text(source?.id)).filter(Boolean));
  const sourcesById = new Map(sources.map(source => [text(source?.id), source]));
  const fieldSources = record.fieldSources && typeof record.fieldSources === 'object' ? record.fieldSources : {};
  const fieldStatus = record.fieldStatus && typeof record.fieldStatus === 'object' ? record.fieldStatus : {};
  RESEARCH_STATUS_PATHS.forEach((path) => {
    if (!FIELD_STATUSES.has(fieldStatus[path])) {
      issue(errors, `/fieldStatus${path}`, `Set a field status: ${PROTECTIVE_DEVICE_FIELD_STATUSES.join(', ')}.`);
      return;
    }
    const refs = Array.isArray(fieldSources[path]) ? fieldSources[path] : [];
    if (['verified', 'derived', 'conflicting'].includes(fieldStatus[path]) && !refs.length) {
      issue(errors, `/fieldSources${path}`, `${fieldStatus[path]} fields require at least one source ID.`);
    }
    if (TECHNICAL_FIELD_PATHS.has(path) && ['verified', 'derived'].includes(fieldStatus[path]) && refs.length
      && !refs.some(sourceId => OFFICIAL_TECHNICAL_SOURCE_TYPES.has(sourcesById.get(sourceId)?.sourceType))) {
      issue(errors, `/fieldSources${path}`, 'Verified technical fields require a manufacturer, standards-body, regulator, or NRTL source.');
    }
  });
  Object.entries(fieldSources).forEach(([path, refs]) => {
    if (!path.startsWith('/')) issue(errors, '/fieldSources', `Field source key ${path} must be a JSON Pointer beginning with '/'.`);
    if (!Array.isArray(refs) || !refs.length) {
      issue(errors, `/fieldSources${path}`, 'Field source mappings must contain at least one source ID.');
      return;
    }
    refs.forEach((sourceId) => {
      if (!sourceIds.has(sourceId)) issue(errors, `/fieldSources${path}`, `Unknown source ID: ${sourceId}`);
    });
  });

  const calculatedMissing = productionMissing(record);
  const declaredMissing = new Set(Array.isArray(record.missingForProduction) ? record.missingForProduction : []);
  calculatedMissing.forEach((item) => {
    if (!declaredMissing.has(item)) {
      issue(warnings, '/missingForProduction', `Add the unresolved production item: ${item}`);
    }
  });
}

export function validateProtectiveDeviceRecord(record, { mode = 'library' } = {}) {
  const errors = [];
  const warnings = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    issue(errors, '/', 'Protective-device records must be objects.');
    return { valid: false, errors, warnings };
  }

  ['id', 'type', 'vendor', 'name'].forEach((field) => {
    if (!text(record[field])) issue(errors, `/${field}`, `${field} is required.`);
  });
  if (!PROTECTIVE_DEVICE_TYPES.includes(record.type)) {
    issue(errors, '/type', `type must be one of: ${PROTECTIVE_DEVICE_TYPES.join(', ')}.`);
  }
  if (record.libraryStatus !== undefined && !LIBRARY_STATUSES.has(record.libraryStatus)) {
    issue(errors, '/libraryStatus', 'Unknown protective-device library status.');
  }
  if (NON_INTERRUPTING_TYPES.has(effectiveType(record)) && record.interruptRating !== null && record.interruptRating !== undefined) {
    issue(errors, '/interruptRating', 'Relays do not interrupt fault current; use null or omit this legacy field.');
  }

  if ([PROTECTIVE_DEVICE_LIBRARY_STATUS.SOURCE_VERIFIED, PROTECTIVE_DEVICE_LIBRARY_STATUS.CALCULATION_READY].includes(record.libraryStatus)) {
    const assessment = assessProtectiveDeviceLibraryEntry(record);
    if (assessment.status !== record.libraryStatus) {
      assessment.missing.forEach(item => issue(errors, '/libraryStatus', `Declared ${record.libraryStatus} record is missing ${item}.`));
    }
  }
  if (mode === 'research') validateResearchRecord(record, errors, warnings);
  if (mode === 'promotion') {
    if (record.researchStatus !== 'reviewed') {
      issue(errors, '/researchStatus', 'Promotion validation requires researchStatus reviewed.');
    }
    if (record.libraryStatus !== PROTECTIVE_DEVICE_LIBRARY_STATUS.CALCULATION_READY) {
      issue(errors, '/libraryStatus', 'Promotion validation requires libraryStatus calculation_ready.');
    }
    productionMissing(record).forEach(item => issue(errors, '/', `Calculation-ready record is missing ${item}.`));
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function validateProtectiveDeviceCollection(payload, { mode = 'library' } = {}) {
  const records = Array.isArray(payload) ? payload : payload?.records;
  const errors = [];
  const warnings = [];
  if (!Array.isArray(records)) {
    issue(errors, '/', 'Expected an array of devices or an object with a records array.');
    return { valid: false, errors, warnings, records: [] };
  }
  if (mode === 'research') {
    if (Array.isArray(payload) || payload?.schemaVersion !== 1 || payload?.purpose !== 'protective_device_research_candidates') {
      issue(errors, '/', 'Research output must use schemaVersion 1 and purpose protective_device_research_candidates.');
    }
  }

  const ids = new Set();
  records.forEach((record, index) => {
    const result = validateProtectiveDeviceRecord(record, { mode });
    result.errors.forEach(item => issue(errors, `/records/${index}${item.path === '/' ? '' : item.path}`, item.message));
    result.warnings.forEach(item => issue(warnings, `/records/${index}${item.path === '/' ? '' : item.path}`, item.message));
    if (text(record?.id)) {
      if (ids.has(record.id)) issue(errors, `/records/${index}/id`, `Duplicate device id: ${record.id}`);
      ids.add(record.id);
    }
  });
  return { valid: errors.length === 0, errors, warnings, records };
}

export function getProtectiveDeviceProductionMissing(record) {
  return productionMissing(record);
}
