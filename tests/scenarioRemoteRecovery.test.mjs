import assert from 'node:assert/strict';

const entries = new Map();
globalThis.localStorage = { get length() { return entries.size; }, key: index => [...entries.keys()][index] ?? null,
  getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, String(value)), removeItem: key => entries.delete(key) };
const data = await import('../dataStore.mjs');
const storage = await import('../projectStorage.js');
await storage.initializeProjectStorage();
const before = storage.getProjectState();
const undoBefore = storage.getProjectStorageDiagnostics().undoEntries;
assert.equal(data.importProject({ meta: { scenario: 'future', scenarios: ['base', 'future'] },
  cables: [{ id: 'future', tag: 'FUTURE' }], trays: [{ id: 'future-tray' }],
  cableTypicals: [{ id: 'future-typical' }], mccLineups: [{ id: 'future-mcc' }],
  settings: { scenarioMarker: 'future-setting' },
  scenarioData: { base: { cables: [{ id: 'base' }], settings: { inactiveOnly: true } } } }), true);
const active = storage.getProjectState();
assert.deepEqual(active.cables, data.getCables());
assert.equal(active.cables[0]?.id, 'future'); assert.equal(active.cables[0]?.tag, 'FUTURE');
assert.deepEqual(active.trays, data.getTrays());
assert.equal(active.trays[0]?.id, 'future-tray');
assert.deepEqual(active.cableTypicals, data.getCableTypicals());
assert.equal(active.cableTypicals[0]?.id, 'future-typical');
assert.deepEqual(active.settings.mccLineups, data.getMccLineups());
assert.equal(active.settings.mccLineups[0]?.id, 'future-mcc');
assert.equal(active.settings.scenarioMarker, 'future-setting');
assert.equal(active.settings.inactiveOnly, undefined);
assert.deepEqual(JSON.parse(entries.get('CTR_PROJECT_V1')).cables, data.getCables());
assert.equal(storage.getProjectStorageDiagnostics().undoEntries, undoBefore + 1);
storage.undoProjectChange(); assert.deepEqual(storage.getProjectState(), before);
storage.redoProjectChange(); assert.deepEqual(storage.getProjectState(), active);
data.applyRemoteSnapshot({ cables: [{ tag: 'REMOTE' }], cableTemplates: [{ id: 'T-REMOTE' }],
  workflowArtifacts: { latestRouteResults: { marker: 'remote-route' } }, settings: { customSetting: 'remote-setting' } }, 'legacy-remote-test');
assert.equal(data.getCables()[0]?.tag, 'REMOTE');
assert.equal(data.getCableTemplates()[0]?.id, 'T-REMOTE');
assert.equal(data.loadProject('legacy-remote-test'), true);
assert.equal(data.getCables()[0]?.tag, 'REMOTE');
assert.equal(data.getCableTemplates()[0]?.id, 'T-REMOTE');
assert.equal(data.getItem('latestRouteResults')?.marker, 'remote-route');
assert.equal(data.getItem('customSetting'), 'remote-setting');
// Named saves keep the active scenario at the top level and retain every
// inactive scenario once. Verify both survive a save/load/switch round trip.
data.switchScenario('base');
data.setCables([{ id: 'saved-base', tag: 'SAVED-BASE' }]);
data.setItem('scenarioMarker', 'base-marker');
data.switchScenario('future');
data.setCables([{ id: 'saved-future', tag: 'SAVED-FUTURE' }]);
data.setItem('scenarioMarker', 'future-marker');
assert.equal(data.saveProject('scenario-save-roundtrip'), true);
const saved = storage.readSavedProject('scenario-save-roundtrip');
assert.equal(saved.scenarioData?.future, undefined, 'Active scenario must not be duplicated');
assert.equal(saved.scenarioData?.base?.cables[0]?.tag, 'SAVED-BASE');
data.setCables([{ id: 'temporary', tag: 'TEMPORARY' }]);
assert.equal(data.loadProject('scenario-save-roundtrip'), true);
assert.equal(data.getCurrentScenario(), 'future');
assert.equal(data.getCables()[0]?.tag, 'SAVED-FUTURE');
assert.equal(data.getItem('scenarioMarker'), 'future-marker');
data.switchScenario('base');
assert.equal(data.getCables()[0]?.tag, 'SAVED-BASE');
assert.equal(data.getItem('scenarioMarker'), 'base-marker');
console.log('✓ active scenario, named save round trip, and legacy remote recovery');
