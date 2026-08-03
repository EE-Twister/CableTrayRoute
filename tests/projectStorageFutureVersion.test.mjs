import assert from 'node:assert/strict';

const values = new Map();
const futureProject = {
  schemaVersion: 2,
  name: 'Created by a newer app',
  ductbanks: [],
  conduits: [],
  trays: [],
  cables: [{ name: 'DO-NOT-DELETE' }],
  cableTypicals: [],
  settings: {
    session: {},
    collapsedGroups: {},
    units: 'imperial',
    theme: 'system'
  }
};
const futureRaw = JSON.stringify(futureProject);
values.set('CTR_PROJECT_V1', futureRaw);

globalThis.localStorage = {
  getItem(key) {
    return values.has(key) ? values.get(key) : null;
  },
  setItem(key, value) {
    values.set(key, String(value));
  },
  removeItem(key) {
    values.delete(key);
  }
};

const originalConsoleError = console.error;
console.error = () => {};
const storage = await import(`../projectStorage.js?future-version=${Date.now()}`);
console.error = originalConsoleError;

assert.equal(storage.getProjectSchemaLoadError()?.code, 'PROJECT_SCHEMA_UNSUPPORTED');
assert.equal(storage.getProjectState().schemaVersion, storage.PROJECT_SCHEMA_VERSION);
assert.equal(values.get(storage.PROJECT_KEY), futureRaw, 'startup must not overwrite a future-version project');

storage.setProjectState({ ...storage.getProjectState(), name: 'Session-only edit' });
assert.equal(values.get(storage.PROJECT_KEY), futureRaw, 'ordinary edits must not overwrite a refused project');

storage.removeProjectKey(storage.PROJECT_KEY);
assert.equal(storage.getProjectSchemaLoadError(), null);
assert.equal(values.has(storage.PROJECT_KEY), false);

console.log('✓ future stored projects are refused without overwriting their data');
