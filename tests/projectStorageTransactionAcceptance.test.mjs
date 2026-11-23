import assert from 'node:assert/strict';
import test from 'node:test';

let sequence = 0;
async function harness() {
  const local = new Map();
  const session = new Map();
  const failures = { write: false, remove: false };
  const backend = (values, controlled) => ({
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { if (controlled && failures.write) throw new Error('Intentional rollback write rejection'); values.set(key, String(value)); },
    removeItem(key) { if (controlled && failures.remove) throw new Error('Intentional rollback removal rejection'); values.delete(key); },
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; }
  });
  globalThis.localStorage = backend(local, true);
  globalThis.sessionStorage = backend(session, false);
  const storage = await import(`../projectStorage.js?root-transaction-acceptance=${++sequence}`);
  await storage.initializeProjectStorage();
  storage.setProjectKey('transactionFixture', JSON.stringify({ value: 'canonical before' }));
  return { storage, local, session, failures };
}

test('transaction rollback restores tracked unprefixed settings with distinct backend bytes and removes new settings', async () => {
  const { storage, local, session } = await harness();
  local.set('transactionFixture', '{"value":"local before"}');
  session.set('transactionFixture', '{"value":"session before"}');
  const snapshot = storage.captureProjectTransactionSnapshot();
  storage.setProjectKey('transactionFixture', '{"value":"after"}');
  storage.setProjectKey('introducedFixture', '{"new":true}');
  session.set('introducedFixture', '{"sessionNew":true}');
  assert.equal(storage.restoreProjectTransactionSnapshot(snapshot), true);
  assert.equal(local.get('transactionFixture'), '{"value":"local before"}');
  assert.equal(session.get('transactionFixture'), '{"value":"session before"}');
  assert.equal(local.has('introducedFixture'), false);
  assert.equal(session.has('introducedFixture'), false);
  assert.deepEqual(storage.getProjectState().settings.transactionFixture, { value: 'canonical before' });
});

for (const kind of ['write', 'remove']) test(`a persistent ${kind} rejection during rollback keeps storage unhealthy`, async () => {
  const { storage, local, failures } = await harness();
  const snapshot = storage.captureProjectTransactionSnapshot();
  storage.setProjectKey('transactionFixture', '{"value":"after"}');
  storage.setProjectKey('introducedFixture', '{"new":true}');
  failures[kind] = true;
  assert.equal(storage.restoreProjectTransactionSnapshot(snapshot), false);
  const diagnostic = storage.getProjectStorageDiagnostics();
  assert.equal(diagnostic.storageWriteBlocked, true, 'Failed rollback cannot report healthy persistence');
  assert.equal(diagnostic.persistentStorageAvailable, false);
  if (kind === 'write') assert.equal(local.get('transactionFixture'), '{"value":"after"}', 'The rejected backend really retained its changed bytes');
  else assert.equal(local.has('introducedFixture'), true, 'The rejected backend really retained the new key');
});
