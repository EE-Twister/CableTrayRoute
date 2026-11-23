import assert from 'node:assert/strict';

const values = new Map();
let failWrites = false;
globalThis.localStorage = {
  get length() { return values.size; },
  key(index) { return [...values.keys()][index] ?? null; },
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) {
    if (failWrites) {
      const error = new Error('quota exceeded');
      error.name = 'QuotaExceededError';
      throw error;
    }
    values.set(key, String(value));
  },
  removeItem(key) { values.delete(key); },
};

const storage = await import(`../projectStorage.js?durable-failure=${Date.now()}`);
storage.writeSavedProject('durable', { cables: [{ id: 'old' }] });
const before = values.get('CTR_SAVED_PROJECTS_V1');
failWrites = true;
assert.throws(
  () => storage.writeSavedProject('durable', { cables: [{ id: 'new' }] }, { replace: true }),
  /could not be written|rejected/i,
);
assert.deepEqual(storage.readSavedProject('durable').cables, [{ id: 'old' }]);
assert.equal(values.get('CTR_SAVED_PROJECTS_V1'), before);
console.log('durable saved-project failure preserves prior cache and backup');
