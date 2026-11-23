import assert from 'node:assert/strict';

const entries = new Map();
let failProjectWrite = false;
globalThis.localStorage = {
  get length() { return entries.size; },
  key(index) { return [...entries.keys()][index] ?? null; },
  getItem(key) { return entries.get(key) ?? null; },
  setItem(key, value) {
    if (failProjectWrite && key === 'CTR_PROJECT_V1') {
      const error = new Error('injected final project quota failure');
      error.name = 'QuotaExceededError';
      throw error;
    }
    entries.set(key, String(value));
  },
  removeItem(key) { entries.delete(key); },
};

const storage = await import('../projectStorage.js?recovery-durability');
const data = await import('../dataStore.mjs?recovery-durability');

data.setCables([{ id: 'old', tag: 'OLD' }]);
assert.equal(data.saveProject('recovery'), true);
const metadataOnlyStatus = storage.getProjectSaveStatusPresentation('recovery');
assert.match(metadataOnlyStatus.label, /^(Saved locally|Local changes)/);
assert.match(metadataOnlyStatus.detail, /Last local save:/);
const before = new Map(entries);
const importable = data.exportProject();
importable.cables = [{ id: 'new', tag: 'NEW' }];
importable.scenarioData.base.cables = importable.cables;

failProjectWrite = true;
assert.equal(data.importProject(importable), false);
assert.equal(data.getCables()[0].tag, 'OLD');
assert.deepEqual(entries, before, 'final PROJECT_KEY failure must preserve the durable project and derived keys');
assert.match(data.getLastProjectImportError(), /durably saved|persistent storage/i);

const now = Date.now();
storage.writeProjectSaveStatus('recovery', {
  localSavedAt: new Date(now).toISOString(),
  cloudSavedAt: new Date(now - 60_000).toISOString(),
});
const status = storage.getProjectSaveStatusPresentation('recovery');
assert.equal(status.hasNewerLocal, true);
assert.match(status.label, /^Local changes/);
assert.match(status.detail, /Last local save:/);

console.log('✓ project recovery reports final-write failure and identifies a newer local copy');
