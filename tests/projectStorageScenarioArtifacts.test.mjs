import assert from 'node:assert/strict';

const values = new Map([
  ['CTR_SAVED_PROJECTS_V1', JSON.stringify({
    future: { cables: [{ tag: 'SCENARIO-CABLE' }], oneLine: { sheets: [] } },
    emergency: { cables: [], oneLine: { sheets: [] } },
    'Actual Project': {
      __meta: { createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z' },
      cables: [{ tag: 'CBL-1' }]
    }
  })]
]);

globalThis.localStorage = {
  get length() { return values.size; },
  key(index) { return [...values.keys()][index] ?? null; },
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); }
};

const storage = await import(`../projectStorage.js?scenario-artifacts=${Date.now()}`);
assert.deepEqual(storage.listSavedProjects(), ['Actual Project']);

storage.writeSavedProject('future', {
  __meta: { createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z' },
  cables: [{ tag: 'REAL-PROJECT-CABLE' }]
});
assert.deepEqual(storage.listSavedProjects(), ['Actual Project', 'future']);

console.log('project storage scenario artifacts');
