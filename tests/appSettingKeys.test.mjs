import assert from 'node:assert/strict';

// Storage mock implementing the parts of the Web Storage API that
// projectStorage enumerates (length / key) plus the usual accessors.
function makeStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(i) { return [...map.keys()][i] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    clear() { map.clear(); },
  };
}

globalThis.localStorage = makeStorage();
globalThis.sessionStorage = makeStorage();
// Raw storage assertions in this file intentionally inspect the injected test
// doubles to verify that projectStorage removes redundant persisted copies.
const localStorageTestDouble = globalThis.localStorage;
const sessionStorageTestDouble = globalThis.sessionStorage;
globalThis.document = { baseURI: 'http://localhost/index.html' };
globalThis.location = { href: 'http://localhost/index.html' };
globalThis.window = {};

const {
  getProjectState,
  listAppSettingKeys,
  readAppSetting,
  readScenarioValue,
  setProjectKey,
  writeAppSetting,
  writeScenarioSessionValue,
  writeScenarioValue
} = await import('../projectStorage.js');

function check(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('listAppSettingKeys / readAppSetting fallback');

localStorageTestDouble.setItem('base:routeCache', JSON.stringify({ batchResults: [{ cable: 'C1' }] }));
sessionStorageTestDouble.setItem('future:routeCache', JSON.stringify({ batchResults: [{ cable: 'C2' }] }));

check('lists keys from both session and local storage', () => {
  const keys = listAppSettingKeys();
  assert.ok(keys.includes('base:routeCache'), 'localStorage key present');
  assert.ok(keys.includes('future:routeCache'), 'sessionStorage key present');
});

check('filters keys by prefix', () => {
  const keys = listAppSettingKeys('future:');
  assert.ok(keys.includes('future:routeCache'));
  assert.ok(!keys.includes('base:routeCache'));
});

check('lists session keys before local keys', () => {
  const keys = listAppSettingKeys().filter(k => k.endsWith(':routeCache'));
  assert.deepEqual(keys, ['future:routeCache', 'base:routeCache']);
});

check('dedupes keys present in more than one storage', () => {
  localStorageTestDouble.setItem('dup:key', 'a');
  sessionStorageTestDouble.setItem('dup:key', 'b');
  const keys = listAppSettingKeys('dup:');
  assert.equal(keys.filter(k => k === 'dup:key').length, 1);
});

check('readAppSetting falls back to sessionStorage', () => {
  const cached = JSON.parse(readAppSetting('future:routeCache'));
  assert.equal(cached.batchResults[0].cable, 'C2');
});

check('readAppSetting prefers localStorage over sessionStorage', () => {
  writeAppSetting('pref:key', 'local-value');
  sessionStorageTestDouble.setItem('pref:key', 'session-value');
  assert.equal(readAppSetting('pref:key'), 'local-value');
});

check('readAppSetting returns null for missing keys', () => {
  assert.equal(readAppSetting('does-not-exist'), null);
});

check('session-backed scenario values avoid duplicate local-storage copies', () => {
  localStorageTestDouble.setItem('base:latestRouteResults', JSON.stringify({ stale: true }));
  localStorageTestDouble.setItem('latestRouteResults', JSON.stringify({ stale: true }));
  const routeState = { batchResults: [{ cable: 'C-200', status: 'Routed' }] };

  writeScenarioSessionValue('latestRouteResults', routeState, 'base');

  assert.equal(localStorageTestDouble.getItem('base:latestRouteResults'), null);
  assert.equal(localStorageTestDouble.getItem('latestRouteResults'), null);
  assert.deepEqual(readScenarioValue('latestRouteResults', null, 'base'), routeState);
  assert.deepEqual(getProjectState().settings.latestRouteResults, routeState);
  assert.ok(sessionStorageTestDouble.getItem('base:latestRouteResults'));
  assert.ok(sessionStorageTestDouble.getItem('latestRouteResults'));

  setProjectKey('smallSetting', JSON.stringify({ saved: true }));
  const persistedProject = JSON.parse(localStorageTestDouble.getItem('CTR_PROJECT_V1'));
  assert.equal(persistedProject.settings.latestRouteResults, undefined);
  assert.deepEqual(persistedProject.settings.smallSetting, { saved: true });

  const compactRouteState = { batchResults: [{ cable: 'C-1', status: 'Routed' }] };
  writeScenarioValue('latestRouteResults', compactRouteState, 'base');
  assert.equal(sessionStorageTestDouble.getItem('base:latestRouteResults'), null);
  assert.equal(sessionStorageTestDouble.getItem('latestRouteResults'), null);
  assert.deepEqual(readScenarioValue('latestRouteResults', null, 'base'), compactRouteState);
});

console.log('✓ listAppSettingKeys helper exposed from projectStorage');
