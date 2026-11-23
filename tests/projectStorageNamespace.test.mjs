import assert from 'node:assert/strict';

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

const local = memoryStorage();
const session = memoryStorage();
globalThis.localStorage = local;
globalThis.sessionStorage = session;
const windowListeners = new Map();
globalThis.window = {
  currentProjectId: 'Namespace regression',
  addEventListener(name, listener) { windowListeners.set(name, listener); },
  dispatchEvent() {},
};

const blockedKeys = [
  'CTR_SAVED_PROJECTS_V1', 'CTR_CONDUITS', 'CTR_CHECKPOINT', 'CTR_SUPABASE_URL',
  'CTR_PROJECT_V1', 'ctrEnableCollaboration', 'ctr_scenarios_v1',
  'ctr_current_scenario_v1', 'authToken', 'authCsrfToken', 'authExpiresAt',
  'authUser', 'ctr-auth-provider', 'ctr-supabase-access-token', 'gistToken',
  'future:equipment', 'unrelated:equipment', 'Saved:loads', 'ctrProjectSaveStatus:Saved',
  'ctr:table:view:equipment', 'tour_done_index', 'onelineTourDone',
  '__proto__', 'constructor', 'prototype',
];
const importedSettings = Object.fromEntries(blockedKeys.map(key => [key, { replaced: true }]));
Object.assign(importedSettings, {
  ctrEnableCollaboration: true,
  CTR_SAVED_PROJECTS_V1: {},
  cableSchedule: [{ id: 'shadow-cable' }],
  cableTypicals: [{ id: 'shadow-typical' }],
  ctrSession: { shadow: true },
  customSetting: { kept: true },
  onboarding: { complete: true },
});
function projectDocument(settings = importedSettings) {
  return {
    schemaVersion: 1, name: 'Namespace regression',
    cables: [], trays: [], conduits: [], ductbanks: [], cableTypicals: [],
    settings: { session: {}, collapsedGroups: {}, units: 'imperial', theme: 'system', ...settings },
  };
}

local.setItem('CTR_SAVED_PROJECTS_V1', JSON.stringify({ Kept: { loads: [] } }));
local.setItem('ctrEnableCollaboration', 'false');
local.setItem('authToken', 'existing-token');
local.setItem('authCsrfToken', 'existing-csrf');
local.setItem('unrelated:equipment', JSON.stringify([{ id: 'unrelated-equipment' }]));
local.setItem('Saved:loads', JSON.stringify([{ id: 'saved-load' }]));
local.setItem('CTR_PROJECT_V1', JSON.stringify(projectDocument()));
const protectedKeys = ['CTR_SAVED_PROJECTS_V1', 'ctrEnableCollaboration', 'authToken', 'authCsrfToken', 'unrelated:equipment', 'Saved:loads'];
const protectedValues = new Map(protectedKeys.map(key => [key, local.getItem(key)]));
function assertProtectedState() {
  for (const [key, value] of protectedValues) assert.equal(local.getItem(key), value, `protected ${key}`);
}
function assertCleanSettings(settings) {
  for (const key of [...blockedKeys, 'cableSchedule', 'cableTypicals', 'ctrSession']) {
    assert.equal(Object.hasOwn(settings, key), false, `settings excludes ${key}`);
  }
  assert.deepEqual(settings.customSetting, { kept: true });
}

const storage = await import('../projectStorage.js');
await storage.initializeProjectStorage();
assertCleanSettings(storage.getProjectState().settings);
assertCleanSettings(storage.migrateProject(projectDocument()).settings);
const legacy = projectDocument();
delete legacy.schemaVersion;
assertCleanSettings(storage.migrateProject(legacy).settings);
assertProtectedState();

// Exercise the direct share-link path and make an ordinary subsequent change:
// poisoned keys loaded into tracked settings must neither be mirrored nor removed.
storage.setProjectState(projectDocument());
storage.setProjectKey('ordinaryAfterLoad', JSON.stringify({ durable: true }));
assertCleanSettings(JSON.parse(local.getItem('CTR_PROJECT_V1')).settings);
assertProtectedState();
storage.undoProjectChange();
storage.redoProjectChange();
assertCleanSettings(storage.getProjectState().settings);
assertProtectedState();

// A cross-tab authoritative record passes through the same sanitation boundary.
windowListeners.get('storage')({ key: 'CTR_PROJECT_V1', newValue: JSON.stringify(projectDocument()) });
assertCleanSettings(storage.getProjectState().settings);
assertProtectedState();

// Reject before touching any raw local/session entry, including removals and
// inactive scenarios. PROJECT_KEY and gistToken retain separate trusted APIs.
for (const key of blockedKeys) {
  for (const scenario of ['base', 'future']) {
    const rawKey = `${scenario}:${key}`;
    local.setItem(rawKey, 'existing-local');
    session.setItem(rawKey, 'existing-session');
    assert.equal(storage.writeScenarioValue(key, { injected: true }, scenario), false);
    storage.writeScenarioSessionValue(key, { injected: true }, scenario);
    storage.removeScenarioValue(key, scenario);
    assert.equal(local.getItem(rawKey), 'existing-local', rawKey);
    assert.equal(session.getItem(rawKey), 'existing-session', rawKey);
    assert.equal(storage.readScenarioValue(key, 'missing', scenario), 'missing');
    assert.equal(storage.listScenarioKeysState(scenario).includes(key), false);
  }
  if (key !== 'CTR_PROJECT_V1' && key !== 'gistToken') {
    const localBefore = local.getItem(key);
    const sessionBefore = session.getItem(key);
    storage.setProjectKey(key, JSON.stringify({ injected: true }));
    storage.removeProjectKey(key);
    assert.equal(local.getItem(key), localBefore, key);
    assert.equal(session.getItem(key), sessionBefore, key);
  }
}
storage.cloneScenarioStorage('future', 'clean-clone');
for (const key of blockedKeys) assert.equal(local.getItem(`clean-clone:${key}`), null);
assertProtectedState();

const data = await import('../dataStore.mjs');
for (const schemaVersion of [undefined, 1]) {
  const imported = {
    ...(schemaVersion === undefined ? {} : { schemaVersion }),
    ductbanks: [], conduits: [], trays: [], cables: [], cableTypicals: [],
    settings: importedSettings,
  };
  assert.equal(data.importProject(imported), true, data.getLastProjectImportError());
  assertCleanSettings(storage.getProjectState().settings);
  assertCleanSettings(data.exportProject().settings);
  assertProtectedState();
}
assert.equal(data.importProject({
  schemaVersion: 1, ductbanks: [], conduits: [], trays: [], cables: [],
  settings: importedSettings,
  scenarioData: {
    future: { schemaVersion: 1, ductbanks: [], conduits: [], trays: [], cables: [], settings: importedSettings },
  },
}), true, data.getLastProjectImportError());
assertCleanSettings(data.exportProject('future').settings);
assertProtectedState();

// Ordinary extensible settings, collection aliases and per-tab values continue
// to work with the same durable and history behavior.
storage.setCurrentScenarioNameState('base');
storage.setProjectState(projectDocument({}));
storage.writeScenarioValue('customHistory', { step: 1 });
storage.undoProjectChange();
assert.equal(storage.readScenarioValue('customHistory', null), null);
storage.redoProjectChange();
assert.deepEqual(storage.readScenarioValue('customHistory', null), { step: 1 });
storage.writeScenarioValue('cableSchedule', [{ id: 'allowed-cable' }]);
storage.writeScenarioValue('ctrSession', { compactMode: true });
assert.equal(storage.getProjectState().cables[0].id, 'allowed-cable');
assert.deepEqual(storage.getProjectState().settings.session, { compactMode: true });
storage.writeScenarioSessionValue('customTabOnly', { kept: true });
assert.deepEqual(storage.readScenarioValue('customTabOnly', null), { kept: true });
assert.equal(Object.hasOwn(JSON.parse(local.getItem('CTR_PROJECT_V1')).settings, 'customTabOnly'), false);
assert.ok(session.getItem('base:customTabOnly'));
assertProtectedState();

// Read the persisted collection using a fresh module after clearing the shared
// raw cache. This catches overwrites that cached reads could hide until reload.
for (const name of ['rawStorageCache', 'missingStorageCache', 'storageScanState']) {
  delete globalThis[Symbol.for(`cabletrayroute.${name}`)];
}
const reloaded = await import('../projectStorage.js?namespace-reload');
assert.equal(reloaded.readAppSetting('CTR_SAVED_PROJECTS_V1'), protectedValues.get('CTR_SAVED_PROJECTS_V1'));
assert.equal(reloaded.readAppSetting('ctrEnableCollaboration'), 'false');
assertProtectedState();
console.log('✓ project settings cannot overwrite application or other project storage');
