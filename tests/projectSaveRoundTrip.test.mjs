import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  get length() {
    return this.values.size;
  }

  key(index) {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

const localStorageMock = new MemoryStorage();
globalThis.localStorage = localStorageMock;
globalThis.sessionStorage = new MemoryStorage();
globalThis.window = {
  currentProjectId: 'Round Trip Project',
  location: { href: 'http://localhost/equipmentlist.html', search: '' },
  navigator: { userAgent: 'node-test' },
  addEventListener() {},
  dispatchEvent() {}
};

const dataStore = await import(`../dataStore.mjs?project-roundtrip=${Date.now()}`);
const projectStorage = await import('../projectStorage.js');

dataStore.setEquipment([{
  id: 'eq-main',
  tag: 'SWBD-1',
  description: 'Main switchboard',
  voltage: '480/277'
}]);
dataStore.setOneLine({
  activeSheet: 0,
  sheets: [{
    id: 'sheet-main',
    name: 'Main',
    components: [{
      id: 'comp-main',
      type: 'bus',
      ref: 'SWBD-1',
      entityId: 'eq-main',
      x: 100,
      y: 120
    }],
    connections: []
  }]
}, 'base', { captureRevision: false });
dataStore.setItem('activeSampleWorkflow', { id: 'round-trip', title: 'Round Trip' });

assert.equal(dataStore.saveProject('Round Trip Project'), true);

const savedBlob = JSON.parse(localStorageMock.getItem('CTR_SAVED_PROJECTS_V1'));
const saved = savedBlob['Round Trip Project'];
assert.equal(saved.schemaVersion, 1);
assert.equal(saved.oneLine.sheets[0].id, 'sheet-main');
assert.equal(saved.oneLine.sheets[0].components[0].description, undefined);
assert.equal(saved.oneLine.sheets[0].components[0].projectEntity, undefined);
assert.deepEqual(saved.settings.activeSampleWorkflow, { id: 'round-trip', title: 'Round Trip' });

window.currentProjectId = 'Other Project';
dataStore.setEquipment([{ id: 'eq-other', tag: 'OTHER-1' }]);
dataStore.setItem('otherProjectOnly', { shouldDisappear: true });

assert.equal(
  dataStore.loadProject('Round Trip Project'),
  true,
  dataStore.getLastProjectImportError()
);
assert.deepEqual(dataStore.getEquipment().map(item => item.tag), ['SWBD-1']);
assert.deepEqual(dataStore.getItem('activeSampleWorkflow'), { id: 'round-trip', title: 'Round Trip' });
assert.equal(dataStore.getItem('otherProjectOnly', null), null);
assert.equal(window.currentProjectId, 'Round Trip Project');
assert.equal(projectStorage.getProjectState().name, 'Round Trip Project');

const loadedOneLine = projectStorage.readScenarioValue('oneLineDiagram', null, 'base');
assert.equal(loadedOneLine.sheets[0].id, 'sheet-main');
assert.equal(loadedOneLine.sheets[0].components[0].description, undefined);

console.log('✓ saved project roundtrip preserves raw One-Line data and isolates project settings');
