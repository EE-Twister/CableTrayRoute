import assert from 'node:assert/strict';

function memoryStore() {
  const entries = new Map();
  return {
    get length() { return entries.size; },
    key: index => [...entries.keys()][index] ?? null,
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: key => entries.delete(key),
  };
}

globalThis.localStorage = memoryStore();
globalThis.sessionStorage = memoryStore();
const storage = await import('../projectStorage.js');
const data = await import('../dataStore.mjs');

storage.setProjectState({ ...storage.getProjectState(), name: 'Rollback source' });
data.setCables([{ tag: 'ORIGINAL', conductor_size: '#10 AWG', length: 100 }]);
data.setEquipment([{ id: 'EQ-ORIGINAL', tag: 'EQ-ORIGINAL' }]);
data.setOneLine({ activeSheet: 0, sheets: [{ name: 'Original', components: [], connections: [] }] });
data.setStudies({ voltageDrop: { marker: 'original-study' } });
data.cloneScenario('future');
data.switchScenario('future');
data.setCables([{ tag: 'FUTURE', conductor_size: '#8 AWG', length: 150 }]);
data.saveProject('Rollback source');
const before = {
  state: storage.getProjectState(),
  cables: data.getCables(),
  equipment: data.getEquipment(),
  oneLine: data.getOneLine(),
  studies: data.getStudies(),
  scenarios: storage.getScenarioListState(),
  saved: storage.readSavedProject('Rollback source'),
  undo: storage.getProjectStorageDiagnostics().undoEntries,
  redo: storage.getProjectStorageDiagnostics().redoEntries,
};
const snapshot = storage.captureProjectTransactionSnapshot();

// Changes outside the import's project scope must survive a failed import.
storage.writeAppSetting('review-unrelated-preference', 'keep-latest');
storage.setAuthContextState({ provider: 'server', user: 'new-account', csrfToken: 'new-csrf', expiresAt: Date.now() + 60_000 });
storage.setProjectState({ ...storage.getProjectState(), name: 'Failed import' });
data.switchScenario('imported-scenario');
data.setCables([{ tag: 'IMPORTED', conductor_size: '#4 AWG', length: 10 }]);
data.setEquipment([{ id: 'IMPORTED-EQ', tag: 'IMPORTED-EQ' }]);
data.setOneLine({ activeSheet: 0, sheets: [{ name: 'Imported', components: [], connections: [] }] });
data.setStudies({ voltageDrop: { marker: 'imported-study' } });
data.saveProject('Failed import');
assert.equal(storage.restoreProjectTransactionSnapshot(snapshot), true);

assert.deepEqual(storage.getProjectState(), before.state, 'canonical snapshot restored');
assert.equal(data.getCurrentScenario(), 'future');
assert.deepEqual(storage.getScenarioListState(), before.scenarios);
assert.deepEqual(data.getCables(), before.cables);
assert.deepEqual(data.getEquipment(), before.equipment);
assert.deepEqual(data.getOneLine(), before.oneLine);
assert.deepEqual(data.getStudies(), before.studies);
assert.deepEqual(storage.readSavedProject('Rollback source'), before.saved);
assert.equal(storage.readSavedProject('Failed import'), null);
assert.equal(storage.getProjectStorageDiagnostics().undoEntries, before.undo);
assert.equal(storage.getProjectStorageDiagnostics().redoEntries, before.redo);
assert.equal(storage.readAppSetting('review-unrelated-preference'), 'keep-latest');
assert.equal(storage.getAuthContextState().user, 'new-account');
assert.equal(storage.getAuthContextState().csrfToken, 'new-csrf');
assert.equal(globalThis.localStorage.getItem('imported-scenario:cableSchedule'), null);

storage.writeProjectSessionValue('ctr-review-token', { version: '1' });
assert.deepEqual(storage.readProjectSessionValue('ctr-review-token'), { version: '1' });
assert.equal(globalThis.localStorage.getItem('ctr-review-token'), null);
storage.removeProjectSessionValue('ctr-review-token');
assert.equal(storage.readProjectSessionValue('ctr-review-token'), null);

console.log('review correction state rollback and per-tab session tests passed');
