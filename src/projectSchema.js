export const PROJECT_SCHEMA_VERSION = 1;

const STORAGE_REQUIRED_FIELDS = [
  'schemaVersion',
  'name',
  'ductbanks',
  'conduits',
  'trays',
  'cables',
  'cableTypicals',
  'settings'
];

const INTERCHANGE_REQUIRED_FIELDS = [
  'schemaVersion',
  'ductbanks',
  'conduits',
  'trays',
  'cables',
  'cableTypicals',
  'panels',
  'equipment',
  'loads',
  'settings'
];

const STORAGE_FIELDS = new Set(STORAGE_REQUIRED_FIELDS);
const INTERCHANGE_FIELDS = new Set([
  ...INTERCHANGE_REQUIRED_FIELDS,
  'meta',
  'oneLine',
  'mccLineups'
]);
const ROW_ARRAY_FIELDS = [
  'ductbanks',
  'conduits',
  'trays',
  'cables',
  'cableTypicals',
  'panels',
  'equipment',
  'loads',
  'mccLineups'
];
const VALID_UNITS = new Set(['imperial', 'metric']);
const VALID_THEMES = new Set(['system', 'light', 'dark', 'high-contrast']);

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function addError(errors, path, message, keyword = 'type') {
  errors.push({ path, message, keyword });
}

function validateSchemaVersion(value, errors) {
  if (!Number.isInteger(value)) {
    addError(errors, '/schemaVersion', 'must be an integer', 'type');
  } else if (value !== PROJECT_SCHEMA_VERSION) {
    addError(errors, '/schemaVersion', `must equal ${PROJECT_SCHEMA_VERSION}`, 'const');
  }
}

function validateRequiredFields(value, required, errors) {
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      addError(errors, '/', `must have required property '${key}'`, 'required');
    }
  }
}

function validateAdditionalFields(value, allowed, errors, basePath = '') {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      addError(errors, `${basePath}/${key}`, 'is not a recognized project field', 'additionalProperties');
    }
  }
}

function validateRowArray(value, path, errors) {
  if (!Array.isArray(value)) {
    addError(errors, path, 'must be an array');
    return;
  }
  value.forEach((row, index) => {
    if (!isPlainObject(row)) addError(errors, `${path}/${index}`, 'must be an object');
  });
}

function validateSettings(settings, errors, { canonical = false } = {}) {
  if (!isPlainObject(settings)) {
    addError(errors, '/settings', 'must be an object');
    return;
  }
  if (!canonical) return;

  if (!isPlainObject(settings.session)) addError(errors, '/settings/session', 'must be an object');
  if (!isPlainObject(settings.collapsedGroups)) addError(errors, '/settings/collapsedGroups', 'must be an object');
  if (!VALID_UNITS.has(settings.units)) addError(errors, '/settings/units', 'must be imperial or metric', 'enum');
  if (!VALID_THEMES.has(settings.theme)) {
    addError(errors, '/settings/theme', 'must be system, light, dark, or high-contrast', 'enum');
  }
}

function validationResult(errors) {
  return { valid: errors.length === 0, errors };
}

export class ProjectSchemaValidationError extends Error {
  constructor(context, errors) {
    super(`${context} is invalid: ${formatProjectSchemaErrors(errors)}`);
    this.name = 'ProjectSchemaValidationError';
    this.code = 'PROJECT_SCHEMA_INVALID';
    this.errors = errors;
  }
}

export class UnsupportedProjectSchemaVersionError extends Error {
  constructor(version) {
    super(`Project schema version ${version} is newer than the supported version ${PROJECT_SCHEMA_VERSION}. Update CableTrayRoute before opening this project.`);
    this.name = 'UnsupportedProjectSchemaVersionError';
    this.code = 'PROJECT_SCHEMA_UNSUPPORTED';
    this.schemaVersion = version;
    this.supportedVersion = PROJECT_SCHEMA_VERSION;
  }
}

export function readProjectSchemaVersion(value) {
  if (!isPlainObject(value)) {
    throw new ProjectSchemaValidationError('Project document', [
      { path: '/', message: 'must be an object', keyword: 'type' }
    ]);
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'schemaVersion')) return 0;
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) {
    throw new ProjectSchemaValidationError('Project document', [
      { path: '/schemaVersion', message: 'must be a positive integer', keyword: 'type' }
    ]);
  }
  if (value.schemaVersion > PROJECT_SCHEMA_VERSION) {
    throw new UnsupportedProjectSchemaVersionError(value.schemaVersion);
  }
  return value.schemaVersion;
}

export function validateStoredProject(value) {
  const errors = [];
  if (!isPlainObject(value)) {
    addError(errors, '/', 'must be an object');
    return validationResult(errors);
  }

  validateRequiredFields(value, STORAGE_REQUIRED_FIELDS, errors);
  validateAdditionalFields(value, STORAGE_FIELDS, errors);
  validateSchemaVersion(value.schemaVersion, errors);
  if (typeof value.name !== 'string') addError(errors, '/name', 'must be a string');
  for (const key of ROW_ARRAY_FIELDS.slice(0, 5)) {
    validateRowArray(value[key], `/${key}`, errors);
  }
  validateSettings(value.settings, errors, { canonical: true });
  return validationResult(errors);
}

export function assertValidStoredProject(value) {
  const result = validateStoredProject(value);
  if (!result.valid) throw new ProjectSchemaValidationError('Stored project', result.errors);
  return value;
}

export function validateProjectImport(value) {
  const errors = [];
  if (!isPlainObject(value)) {
    addError(errors, '/', 'must be an object');
    return validationResult(errors);
  }

  validateRequiredFields(value, INTERCHANGE_REQUIRED_FIELDS, errors);
  validateAdditionalFields(value, INTERCHANGE_FIELDS, errors);
  validateSchemaVersion(value.schemaVersion, errors);
  for (const key of ROW_ARRAY_FIELDS) {
    if (key === 'mccLineups' && value[key] === undefined) continue;
    validateRowArray(value[key], `/${key}`, errors);
  }
  validateSettings(value.settings, errors);

  if (value.meta !== undefined) {
    if (!isPlainObject(value.meta)) {
      addError(errors, '/meta', 'must be an object');
    } else {
      const allowedMetaFields = new Set(['version', 'scenario', 'scenarios']);
      validateAdditionalFields(value.meta, allowedMetaFields, errors, '/meta');
      if (value.meta.version !== undefined && !Number.isInteger(value.meta.version)) {
        addError(errors, '/meta/version', 'must be an integer');
      }
      if (value.meta.scenario !== undefined && typeof value.meta.scenario !== 'string') {
        addError(errors, '/meta/scenario', 'must be a string');
      }
      if (value.meta.scenarios !== undefined) {
        if (!Array.isArray(value.meta.scenarios)) {
          addError(errors, '/meta/scenarios', 'must be an array');
        } else {
          value.meta.scenarios.forEach((scenario, index) => {
            if (typeof scenario !== 'string') addError(errors, `/meta/scenarios/${index}`, 'must be a string');
          });
        }
      }
    }
  }

  if (value.oneLine !== undefined) {
    const isLegacyArray = Array.isArray(value.oneLine);
    const isSheetEnvelope = isPlainObject(value.oneLine) && Array.isArray(value.oneLine.sheets);
    if (!isLegacyArray && !isSheetEnvelope) {
      addError(errors, '/oneLine', 'must be an array or an object with a sheets array');
    } else if (isLegacyArray) {
      validateRowArray(value.oneLine, '/oneLine', errors);
    } else {
      validateRowArray(value.oneLine.sheets, '/oneLine/sheets', errors);
      if (value.oneLine.activeSheet !== undefined
        && (!Number.isInteger(value.oneLine.activeSheet) || value.oneLine.activeSheet < 0)) {
        addError(errors, '/oneLine/activeSheet', 'must be a non-negative integer');
      }
    }
  }
  return validationResult(errors);
}

export function assertValidProjectImport(value) {
  const result = validateProjectImport(value);
  if (!result.valid) throw new ProjectSchemaValidationError('Project import', result.errors);
  return value;
}

const PROJECT_IMPORT_MIGRATIONS = new Map([
  [0, (legacy) => ({ ...legacy, schemaVersion: 1 })]
]);

export function upgradeProjectImport(value) {
  let version = readProjectSchemaVersion(value);
  let upgraded = { ...value };
  while (version < PROJECT_SCHEMA_VERSION) {
    const migrate = PROJECT_IMPORT_MIGRATIONS.get(version);
    if (!migrate) throw new Error(`No project import migration exists for schema version ${version}.`);
    upgraded = migrate(upgraded);
    const nextVersion = readProjectSchemaVersion(upgraded);
    if (nextVersion <= version) throw new Error(`Project import migration ${version} did not advance the schema version.`);
    version = nextVersion;
  }
  return assertValidProjectImport(upgraded);
}

export function formatProjectSchemaErrors(errors, { limit = 6 } = {}) {
  if (!Array.isArray(errors) || !errors.length) return 'Unknown schema error.';
  const visible = errors.slice(0, limit).map(error => `${error.path || '/'} ${error.message}`);
  const remaining = errors.length - visible.length;
  if (remaining > 0) visible.push(`and ${remaining} more error${remaining === 1 ? '' : 's'}`);
  return visible.join('; ');
}
