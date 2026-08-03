import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import {
  PROJECT_SCHEMA_VERSION,
  defaultProject,
  migrateProject
} from '../projectStorage.js';
import {
  exportProject,
  getLastProjectImportError,
  importProject
} from '../dataStore.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(fs.readFileSync(path.join(dirname, '..', 'schemas', 'project.schema.json'), 'utf8'));
const validateJsonSchema = new Ajv({ allErrors: true }).compile(schema);

const legacyStoredProject = {
  name: 'Legacy storage project',
  cableSchedule: [{ name: 'C-1' }],
  traySchedule: [{ id: 'T-1' }],
  settings: { units: 'metric' }
};
const migratedStoredProject = migrateProject(legacyStoredProject);

assert.equal(PROJECT_SCHEMA_VERSION, 1);
assert.equal(migratedStoredProject.schemaVersion, PROJECT_SCHEMA_VERSION);
assert.deepEqual(migratedStoredProject.cables, legacyStoredProject.cableSchedule);
assert.deepEqual(migratedStoredProject.trays, legacyStoredProject.traySchedule);
assert.deepEqual(migratedStoredProject.settings.session, {});
assert.deepEqual(migratedStoredProject.settings.collapsedGroups, {});
assert.equal(migratedStoredProject.settings.theme, 'system');
assert.equal(legacyStoredProject.schemaVersion, undefined, 'migration must not mutate its input');
assert.equal(validateJsonSchema(migratedStoredProject), true, JSON.stringify(validateJsonSchema.errors));
assert.equal(validateJsonSchema(defaultProject()), true, JSON.stringify(validateJsonSchema.errors));

assert.throws(
  () => migrateProject({ ...defaultProject(), cables: {} }),
  error => error?.code === 'PROJECT_SCHEMA_INVALID' && error.errors.some(item => item.path === '/cables')
);
assert.throws(
  () => migrateProject({ ...defaultProject(), schemaVersion: PROJECT_SCHEMA_VERSION + 1 }),
  error => error?.code === 'PROJECT_SCHEMA_UNSUPPORTED'
);

const exported = exportProject();
assert.equal(exported.schemaVersion, PROJECT_SCHEMA_VERSION);
assert.equal(validateJsonSchema(exported), true, JSON.stringify(validateJsonSchema.errors));

const legacyImport = { ...exported };
delete legacyImport.schemaVersion;
assert.equal(importProject(legacyImport), true, getLastProjectImportError());
assert.equal(exportProject().schemaVersion, PROJECT_SCHEMA_VERSION);

const beforeInvalidImport = exportProject();
assert.equal(importProject({ ...beforeInvalidImport, cables: {} }), false);
assert.match(getLastProjectImportError(), /\/cables must be an array/);
assert.deepEqual(exportProject(), beforeInvalidImport, 'invalid imports must not partially replace project data');

assert.equal(importProject({ ...beforeInvalidImport, schemaVersion: PROJECT_SCHEMA_VERSION + 1 }), false);
assert.match(getLastProjectImportError(), /newer than the supported version/);
assert.deepEqual(exportProject(), beforeInvalidImport, 'future-version imports must not change project data');

assert.equal(validateJsonSchema({ ...beforeInvalidImport, schemaVersion: PROJECT_SCHEMA_VERSION + 1 }), false);

console.log('✓ versioned project schemas migrate legacy data and reject invalid or future documents atomically');
