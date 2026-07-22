import assert from 'node:assert/strict';

function makeStorage({ limit = Number.POSITIVE_INFINITY } = {}) {
  const values = new Map();
  const attempts = [];
  return {
    attempts,
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      const serialized = String(value);
      attempts.push({ key, length: serialized.length });
      const nextSize = [...values.entries()].reduce((total, [storedKey, storedValue]) => (
        total + (storedKey === key ? 0 : storedValue.length)
      ), 0) + serialized.length;
      if (nextSize > limit) {
        const error = new Error('Storage quota exceeded');
        error.name = 'QuotaExceededError';
        throw error;
      }
      values.set(key, serialized);
    },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); }
  };
}

const local = makeStorage({ limit: 12_000 });
const session = makeStorage();
local.setItem('existing-project-data', 'x'.repeat(10_000));

globalThis.localStorage = local;
globalThis.sessionStorage = session;
globalThis.document = { baseURI: 'http://localhost/optimalRoute.html' };
globalThis.location = { href: 'http://localhost/optimalRoute.html' };
globalThis.window = { dispatchEvent() {} };

const storage = await import(`../projectStorage.js?large-session=${Date.now()}`);
const routeState = {
  batchResults: Array.from({ length: 200 }, (_, index) => ({
    cable: `CABLE-${index + 1}`,
    status: 'Routed',
    route_segments: [{ type: 'tray', tray_id: 'TR-1', length: 100 }]
  }))
};
const serializedLength = JSON.stringify(routeState).length;
assert.ok(serializedLength > 20_000);

const attemptsBefore = local.attempts.length;
storage.writeScenarioSessionValue('latestRouteResults', routeState, 'base');
const routeWriteAttempts = local.attempts.slice(attemptsBefore).filter(attempt => (
  attempt.key === 'latestRouteResults' || attempt.key === 'base:latestRouteResults'
));

assert.deepEqual(routeWriteAttempts, []);
assert.equal(local.getItem('latestRouteResults'), null);
assert.equal(local.getItem('base:latestRouteResults'), null);
assert.equal(session.getItem('latestRouteResults')?.length, serializedLength);
assert.equal(session.getItem('base:latestRouteResults')?.length, serializedLength);
assert.deepEqual(storage.readScenarioValue('latestRouteResults', null, 'base'), routeState);

storage.setProjectKey('smallSetting', JSON.stringify({ saved: true }));
const persistedProject = JSON.parse(local.getItem('CTR_PROJECT_V1'));
assert.equal(persistedProject.settings.latestRouteResults, undefined);
assert.deepEqual(persistedProject.settings.smallSetting, { saved: true });

console.log('large route results remain session-backed under local-storage quota pressure');
