import assert from 'node:assert/strict';
import test from 'node:test';

function memoryStore() {
  const entries = new Map();
  let rejectedKey = null;
  return {
    get length() { return entries.size; },
    key: index => [...entries.keys()][index] ?? null,
    getItem: key => entries.get(key) ?? null,
    setItem(key, value) {
      if (key === rejectedKey) throw new Error('Intentional rollback storage rejection');
      entries.set(key, String(value));
    },
    removeItem: key => entries.delete(key),
    rejectWritesTo(key) { rejectedKey = key; },
  };
}

test('failed transaction snapshot restore remains fail-closed when a raw setting cannot be restored', async () => {
  globalThis.localStorage = memoryStore();
  globalThis.sessionStorage = memoryStore();
  const project = await import('../projectStorage.js');

  project.setProjectKey('transactionRollbackProbe', 'original');
  const snapshot = project.captureProjectTransactionSnapshot();
  project.setProjectKey('transactionRollbackProbe', 'changed');
  globalThis.localStorage.rejectWritesTo('transactionRollbackProbe');

  assert.equal(project.restoreProjectTransactionSnapshot(snapshot), false);
  assert.equal(project.getProjectStorageDiagnostics().storageWriteBlocked, true);
  assert.equal(globalThis.localStorage.getItem('transactionRollbackProbe'), '"changed"');
});
