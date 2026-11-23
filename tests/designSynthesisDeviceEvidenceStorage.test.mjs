import assert from 'node:assert/strict';
import test from 'node:test';
import { DEVICE_EVIDENCE_ENCODING, DEVICE_EVIDENCE_STORAGE_KEY as KEY, packDeviceEvidence } from '../utils/designSynthesisDeviceEvidenceCodec.mjs';

const values = new Map();
let rejectWriteKey = null;
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => {
    if (key === rejectWriteKey) {
      rejectWriteKey = null;
      throw new Error('Injected scenario clone failure');
    }
    values.set(key, String(value));
  },
  removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};
const project = await import('../projectStorage.js');
await project.initializeProjectStorage();
const store = await import('../dataStore.mjs');
const evidence = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`fnv1a-${String(i).padStart(8, '0')}`, {
  id: `device-${i}`, source: 'A documented manufacturer source and conditions. '.repeat(80), currentA: i + 1,
}]));

test('packed active storage keeps public state, events, snapshots, history and scenarios lossless', () => {
  let eventValue;
  let projectEventValue;
  store.on(KEY, value => { eventValue = value; });
  const unsubscribe = project.onProjectChange(value => { projectEventValue = value.settings[KEY]; });
  const before = project.getProjectState();
  assert.equal(store.setItem(KEY, evidence), true);
  const after = project.getProjectState();
  assert.deepEqual(eventValue, evidence);
  assert.deepEqual(projectEventValue, evidence);
  unsubscribe();
  assert.deepEqual(store.getItem(KEY), evidence);
  assert.deepEqual(after.settings[KEY], evidence);
  assert.deepEqual(store.exportProject().settings[KEY], evidence);
  const scoped = JSON.parse(values.get(`base:${KEY}`));
  const unscoped = JSON.parse(values.get(KEY));
  const canonical = JSON.parse(values.get('CTR_PROJECT_V1'));
  assert.equal(scoped.encoding, DEVICE_EVIDENCE_ENCODING);
  assert.deepEqual(unscoped, scoped);
  assert.deepEqual(canonical.settings[KEY], scoped);

  project.undoProjectChange();
  assert.deepEqual(project.getProjectState(), before);
  assert.equal(store.getItem(KEY, null), null);
  project.redoProjectChange();
  assert.deepEqual(project.getProjectState(), after);
  assert.deepEqual(store.getItem(KEY), evidence);

  const alternate = { ...evidence, extra: { id: 'alternate', source: 'separate scenario' } };
  store.switchScenario('evidence-alternate');
  assert.equal(store.getItem(KEY, null), null);
  assert.equal(store.setItem(KEY, alternate), true);
  assert.deepEqual(store.getItem(KEY), alternate);
  store.switchScenario('base');
  assert.deepEqual(store.getItem(KEY), evidence);
  const exported = store.exportProject();
  assert.deepEqual(exported.settings[KEY], evidence);
  assert.deepEqual(exported.scenarioData['evidence-alternate'].settings[KEY], alternate);

  assert.equal(store.saveProject('Evidence storage test'), true);
  const savedRaw = JSON.parse(values.get('CTR_SAVED_PROJECTS_V1'))['Evidence storage test'];
  assert.deepEqual(savedRaw.settings[KEY], evidence, 'Named snapshot remains plain and portable');
  assert.deepEqual(savedRaw.scenarioData['evidence-alternate'].settings[KEY], alternate);
  assert.deepEqual(project.readSavedProject('Evidence storage test').settings[KEY], evidence);

  const sourceText = { ...evidence, textSource: { original: 'cafÃ© as supplied' } };
  assert.equal(store.setItem(KEY, sourceText), true);
  const state = project.getProjectState();
  project.setProjectState({ ...state, name: 'Unrelated project-name change' });
  assert.deepEqual(project.getProjectState().settings[KEY], sourceText, 'Unrelated state updates must not repair manufacturer-source text');
});

test('scenario cloning protects unreadable evidence and rolls back partial writes', () => {
  const future = { encoding: 'design-synthesis-device-evidence-future-v2', payload: 'opaque data' };
  assert.equal(project.writeScenarioValue(KEY, future, 'protected-clone-target'), true);
  assert.equal(project.writeScenarioValue(KEY, evidence, 'clone-source'), true);
  assert.equal(project.writeScenarioValue('studySettings', { marker: 'source' }, 'clone-source'), true);
  const beforeProtected = new Map(values);
  assert.throws(() => store.cloneScenario('protected-clone-target', 'clone-source'), /cannot be cloned automatically/);
  assert.deepEqual(values, beforeProtected);
  assert.equal(project.writeScenarioValue(KEY, future, 'invalid-clone-source'), true);
  const beforeSource = new Map(values);
  assert.throws(() => store.cloneScenario('valid-clone-target', 'invalid-clone-source'), /cannot be cloned automatically/);
  assert.deepEqual(values, beforeSource);

  rejectWriteKey = 'clone-failure:studySettings';
  const beforeFailure = new Map(values);
  assert.throws(() => store.cloneScenario('clone-failure', 'clone-source'), /could not be written to storage/);
  assert.deepEqual(values, beforeFailure, 'A rejected later write restores every previous storage entry');
  assert.equal(store.listScenarios().includes('clone-failure'), false);
});

test('legacy maps remain readable and corrupted or future envelopes cannot be overwritten', () => {
  const legacy = { legacy: { source: 'Old exact record' } };
  assert.equal(project.writeScenarioValue(KEY, legacy, 'base'), true);
  assert.deepEqual(store.getItem(KEY), legacy);
  const packed = packDeviceEvidence(evidence);
  const damaged = { ...packed, payload: packed.payload.slice(1) };
  for (const invalid of [damaged, { ...packed, encoding: 'design-synthesis-device-evidence-future-v2', payload: 'cafÃ© opaque future bytes' }]) {
    assert.equal(project.writeScenarioValue(KEY, invalid, 'base', { allowUnsupportedDeviceEvidenceReplacement: true }), true);
    const beforeRaw = values.get(`base:${KEY}`);
    assert.deepEqual(store.getItem(KEY), invalid);
    assert.equal(store.setItem(KEY, evidence), false);
    assert.equal(values.get(`base:${KEY}`), beforeRaw);
    const input = store.exportProject();
    input.settings[KEY] = evidence;
    assert.equal(store.importProject(input), false);
    assert.match(store.getLastProjectImportError(), /Device evidence could not be imported without loss/);
    assert.equal(values.get(`base:${KEY}`), beforeRaw);
    assert.deepEqual(store.getItem(KEY), invalid);
    store.removeItem(KEY);
    assert.equal(values.get(`base:${KEY}`), beforeRaw);
    assert.throws(() => project.removeProjectKey(KEY), /cannot be removed automatically/);
    assert.throws(() => project.removeScenarioValue(KEY, 'base'), /cannot be removed automatically/);
    assert.throws(() => project.setProjectKey(KEY, JSON.stringify(legacy)), /cannot be replaced automatically/);
    const beforeCanonical = values.get('CTR_PROJECT_V1');
    assert.throws(() => project.setProjectKey('CTR_PROJECT_V1', JSON.stringify(project.defaultProject())), /cannot be replaced automatically/);
    assert.equal(values.get('CTR_PROJECT_V1'), beforeCanonical);
    const current = project.getProjectState();
    project.setProjectState({ ...current, name: 'Safe unrelated change' });
    assert.deepEqual(project.getProjectState().settings[KEY], invalid);
    assert.throws(() => project.setProjectState({ ...current, settings: { ...current.settings, [KEY]: legacy } }), /cannot be replaced automatically/);
    assert.throws(() => project.setProjectState({ ...current, settings: {} }), /cannot be replaced automatically/);
    assert.equal(project.writeScenarioValue(KEY, legacy, 'base'), false);
    assert.equal(store.setSessionItem(KEY, legacy, 'base'), false);
    assert.equal(values.get(`base:${KEY}`), beforeRaw);
    const omitted = store.exportProject();
    delete omitted.settings[KEY];
    const beforeImport = new Map(values);
    assert.equal(store.importProject(omitted), false);
    assert.match(store.getLastProjectImportError(), /cannot be removed by import/);
    assert.equal(values.get(`base:${KEY}`), beforeRaw);
    assert.deepEqual(values, beforeImport, 'Rejected import restores every durable storage entry');
    const base = project.defaultProject();
    const migrated = project.migrateProject({ ...base, settings: { ...base.settings, [KEY]: invalid } });
    assert.deepEqual(migrated.settings[KEY], invalid, 'Unknown encoded payloads must not be text-repaired');
  }
  project.removeScenarioValue(KEY, 'base', { allowUnsupportedDeviceEvidenceDeletion: true });
  assert.equal(store.getItem(KEY, null), null, 'An explicit recovery action can remove the unsupported record');
  assert.equal(store.setItem(KEY, legacy), true);
  const incoming = store.exportProject();
  incoming.settings[KEY] = { encoding: 'design-synthesis-device-evidence-future-v2', payload: 'unreadable future data' };
  const beforeIncoming = new Map(values);
  assert.equal(store.importProject(incoming), false);
  assert.deepEqual(values, beforeIncoming, 'Unsupported incoming data cannot replace the prior project');
  assert.deepEqual(store.getItem(KEY), legacy);
});

test('generated review and input evidence remain complete and protected in compact storage', () => {
  for (const key of ['designSynthesisLastApplied', 'designSynthesisInputEvidence']) {
    const value = { text: 'cafÃ© source as supplied', records: Array.from({ length: 40 }, (_, i) => ({ id: i, source: 'Original design record. '.repeat(35) })) };
    assert.equal(store.setItem(key, value), true);
    assert.equal(JSON.parse(values.get(`base:${key}`)).encoding, DEVICE_EVIDENCE_ENCODING);
    assert.deepEqual(store.getItem(key), value);
    assert.deepEqual(project.getProjectState().settings[key], value);
    assert.deepEqual(store.exportProject().settings[key], value);
    assert.equal(store.saveProject(`Compact ${key}`), true);
    assert.deepEqual(JSON.parse(values.get('CTR_SAVED_PROJECTS_V1'))[`Compact ${key}`].settings[key], value);
    project.setProjectState({ ...project.getProjectState(), name: `Unrelated ${key}` });
    assert.deepEqual(store.getItem(key), value);
    const future = { encoding: 'design-synthesis-device-evidence-future-v2', payload: 'opaque record' };
    assert.equal(project.writeScenarioValue(key, future, 'base', { allowUnsupportedDeviceEvidenceReplacement: true }), true);
    const before = new Map(values);
    assert.equal(store.setItem(key, value), false);
    assert.throws(() => project.removeScenarioValue(key, 'base'), /cannot be removed automatically/);
    assert.throws(() => store.cloneScenario(`protected-${key}`, 'base'), /cannot be cloned automatically/);
    assert.deepEqual(values, before);
    const incoming = store.exportProject();
    delete incoming.settings[key];
    assert.equal(store.importProject(incoming), false);
    assert.deepEqual(values, before);
    project.removeScenarioValue(key, 'base', { allowUnsupportedDeviceEvidenceDeletion: true });
  }
});

test('direct project-key APIs protect a divergent active scenario envelope', () => {
  const key = 'designSynthesisInputEvidence';
  const future = { encoding: 'design-synthesis-device-evidence-future-v2', payload: 'inactive scenario record' };
  assert.equal(project.writeScenarioValue(key, future, 'divergent-scenario'), true);
  store.switchScenario('divergent-scenario');
  const before = new Map(values);
  assert.throws(() => project.setProjectKey(key, JSON.stringify({ replacement: true })), /cannot be replaced automatically/);
  assert.throws(() => project.removeProjectKey(key), /cannot be removed automatically/);
  assert.throws(() => project.setProjectState(project.getProjectState()), /cannot be replaced automatically/);
  const hadUndo = project.canUndo();
  project.undoProjectChange();
  assert.equal(project.canUndo(), hadUndo);
  assert.deepEqual(values, before);
  assert.deepEqual(store.getItem(key), future);
  assert.equal(store.setItem('unrelatedDivergenceCheck', { changed: true }), true);
  assert.equal(values.get(`divergent-scenario:${key}`), JSON.stringify(future));
  assert.deepEqual(store.getItem(key), future, 'Unrelated setting updates preserve the active opaque mirror');
  store.switchScenario('base');
});
