/**
 * importProject must not report success when it cannot write the project's
 * collections. Outside a named project (a fresh production browser), the
 * data store rejects named-project writes, so the import fails visibly and
 * leaves existing state untouched.
 */
import assert from 'node:assert/strict';

const store = {};
globalThis.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(key => delete store[key]); },
  key: index => Object.keys(store)[index] ?? null,
  get length() { return Object.keys(store).length; },
};

const dataStore = await import('../dataStore.mjs');

// Build a valid export while running as a plain Node caller (no window).
dataStore.setCables([{ tag: 'IMP-1', from_tag: 'A', to_tag: 'B', conductor_size: '#10 AWG', length: 100 }]);
const exported = JSON.parse(JSON.stringify(dataStore.exportProject()));
dataStore.setCables([]);
dataStore.setItem('keepMe', 'unchanged');

// Now behave like a production page with no active project.
globalThis.window = {
  location: { href: 'https://example.test/cableschedule.html', search: '', hash: '' },
  navigator: { userAgent: 'Mozilla/5.0 Chrome/140' },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true; },
};

assert.equal(dataStore.importProject(exported), false, 'import must fail without a named project');
assert.match(dataStore.getLastProjectImportError(), /Open or create a project/);
assert.equal(dataStore.getItem('keepMe'), 'unchanged', 'a refused import must not clear existing settings');

globalThis.window.currentProjectId = 'Imported Plant';
assert.equal(dataStore.importProject(exported), true, 'import succeeds once a project is named');
assert.deepEqual(dataStore.getCables().map(cable => cable.tag), ['IMP-1']);
assert.equal(dataStore.getLastProjectImportError(), '');

console.log('✓ importProject fails visibly outside a named project and succeeds inside one');
