import assert from 'node:assert/strict';

function createStorage() {
  const values = new Map([['base:cacheProbe', JSON.stringify({ value: 42 })]]);
  let reads = 0;
  return {
    get reads() { return reads; },
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) {
      reads += 1;
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

const local = createStorage();
const session = createStorage();
globalThis.localStorage = local;
globalThis.sessionStorage = session;
globalThis.window = {
  location: { search: '', hostname: 'example.test' },
  addEventListener() {},
};

const storage = await import(`../projectStorage.js?performance=${Date.now()}`);

const readsBefore = local.reads;
assert.deepEqual(storage.readScenarioValue('cacheProbe', null, 'base'), { value: 42 });
assert.deepEqual(storage.readScenarioValue('cacheProbe', null, 'base'), { value: 42 });
assert.equal(local.reads - readsBefore, 0, 'startup cache warmup should cover persisted scenario values');
const missingReadsBefore = local.reads + session.reads;
assert.equal(storage.readScenarioValue('missingProbe', null, 'base'), null);
assert.equal(storage.readScenarioValue('missingProbe', null, 'base'), null);
assert.equal(local.reads + session.reads - missingReadsBefore, 0,
  'a complete startup cache scan should make absent values free to query');
storage.writeScenarioValue('missingProbe', { value: 'created' }, 'base');
assert.deepEqual(storage.readScenarioValue('missingProbe', null, 'base'), { value: 'created' },
  'writes should invalidate the missing-value cache');

const secondStorageModule = await import(`../projectStorage.js?performance-shared=${Date.now()}`);
storage.writeScenarioValue('sharedCacheProbe', { value: 1 }, 'base');
assert.deepEqual(secondStorageModule.readScenarioValue('sharedCacheProbe', null, 'base'), { value: 1 });
secondStorageModule.writeScenarioValue('sharedCacheProbe', { value: 2 }, 'base');
assert.deepEqual(storage.readScenarioValue('sharedCacheProbe', null, 'base'), { value: 2 });

await storage.initializeProjectStorage();
let projectChangeCount = 0;
storage.onProjectChange(() => { projectChangeCount += 1; });
assert.equal(storage.writeScenarioValue('noOpProbe', { value: 1 }, 'base'), true);
const historyAfterInitialWrite = storage.getProjectStorageDiagnostics();
const changesAfterInitialWrite = projectChangeCount;
assert.equal(storage.writeScenarioValue('noOpProbe', { value: 1 }, 'base'), false);
const historyAfterNoOpWrite = storage.getProjectStorageDiagnostics();
assert.equal(projectChangeCount, changesAfterInitialWrite,
  'identical scenario writes should not broadcast project changes');
assert.equal(historyAfterNoOpWrite.undoEntries, historyAfterInitialWrite.undoEntries,
  'identical scenario writes should not create undo entries');
assert.equal(historyAfterNoOpWrite.undoBytes, historyAfterInitialWrite.undoBytes,
  'identical scenario writes should not consume undo memory');
const historyBeforeSessionWrite = storage.getProjectStorageDiagnostics();
storage.writeScenarioSessionValue('transientRouteResults', {
  routes: Array.from({ length: 200 }, (_, index) => ({
    cable: `C-${index}`,
    segments: Array.from({ length: 20 }, (__, segmentIndex) => ({
      start: [segmentIndex, 0, 0],
      end: [segmentIndex + 1, 0, 0],
    })),
  })),
}, 'base');
const historyAfterSessionWrite = storage.getProjectStorageDiagnostics();
assert.equal(historyAfterSessionWrite.undoEntries, historyBeforeSessionWrite.undoEntries,
  'session-only performance payloads should not create undo entries');
assert.equal(historyAfterSessionWrite.undoBytes, historyBeforeSessionWrite.undoBytes,
  'session-only performance payloads should not consume undo memory');
const historyBeforeDerivedWrite = storage.getProjectStorageDiagnostics();
storage.writeScenarioValue('cableSchedule', [{
  name: 'C-DERIVED',
  route_segments: Array.from({ length: 100 }, (_, index) => ({
    start: [index, 0, 0],
    end: [index + 1, 0, 0],
  })),
}], 'base', { captureUndo: false });
const historyAfterDerivedWrite = storage.getProjectStorageDiagnostics();
assert.equal(historyAfterDerivedWrite.undoEntries, historyBeforeDerivedWrite.undoEntries,
  'derived schedule writes should be able to bypass undo capture');
assert.equal(historyAfterDerivedWrite.undoBytes, historyBeforeDerivedWrite.undoBytes,
  'derived schedule writes should not retain previous calculation payloads');
for (let index = 0; index < 70; index += 1) {
  storage.setProjectKey(`performanceSetting${index}`, JSON.stringify({ index }));
}
const diagnostics = storage.getProjectStorageDiagnostics();
assert.ok(diagnostics.undoEntries <= diagnostics.maxUndoEntries);
assert.equal(diagnostics.maxUndoEntries, 50);
assert.ok(diagnostics.undoBytes > 0);

console.log('project storage read-through cache and bounded undo history verified');
