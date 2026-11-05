/**
 * The header save badge reports whether the working copy matches the active
 * project's last saved version — the version that reloading or opening a
 * project link restores.
 */
import assert from 'node:assert/strict';

const store = {};
globalThis.localStorage = {
  getItem: key => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: key => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(key => delete store[key]); },
  key: index => Object.keys(store)[index] ?? null,
  get length() { return Object.keys(store).length; },
};

const dataStore = await import('../dataStore.mjs');
const projectStorage = await import('../projectStorage.js');
const {
  describeProjectSaveState,
  saveProjectOnChange,
  startProjectSaveStateTracking
} = await import('../src/projectSaveState.js');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log('  ✓', name);
  } catch (error) {
    failures += 1;
    console.log('  ✗', name);
    console.error(error);
  }
}

console.log('project save state');

await check('reports no project until one is named', () => {
  assert.deepEqual(dataStore.getProjectSaveState(), { state: 'unnamed', projectName: '', hasSavedVersion: false });
});

projectStorage.setProjectState({ ...projectStorage.getProjectState(), name: 'Plant A' });

await check('a named project that was never saved is unsaved with no saved version', () => {
  dataStore.setCables([{ tag: 'C-1', from_tag: 'A', to_tag: 'B', conductor_size: '#10 AWG', length: 100 }]);
  assert.deepEqual(dataStore.getProjectSaveState(), { state: 'unsaved', projectName: 'Plant A', hasSavedVersion: false });
});

await check('saving makes it saved; an edit makes it unsaved; saving again clears it', () => {
  assert.equal(dataStore.saveProject('Plant A'), true);
  assert.equal(dataStore.getProjectSaveState().state, 'saved');
  dataStore.setCables([...dataStore.getCables(), { tag: 'C-2', from_tag: 'A', to_tag: 'C', conductor_size: '#12 AWG', length: 40 }]);
  assert.equal(dataStore.getProjectSaveState().state, 'unsaved');
  dataStore.saveProject('Plant A');
  assert.equal(dataStore.getProjectSaveState().state, 'saved');
});

await check('study results and project settings count as project changes', () => {
  dataStore.setStudies({ voltageDrop: { results: [] } });
  assert.equal(dataStore.getProjectSaveState().state, 'unsaved');
  dataStore.saveProject('Plant A');
  dataStore.setItem('designBasisNotes', 'revised');
  assert.equal(dataStore.getProjectSaveState().state, 'unsaved');
  dataStore.saveProject('Plant A');
});

await check('reverting an edit to the saved content reports saved again', () => {
  const saved = dataStore.getCables();
  dataStore.setCables([]);
  assert.equal(dataStore.getProjectSaveState().state, 'unsaved');
  dataStore.setCables(saved);
  assert.equal(dataStore.getProjectSaveState().state, 'saved');
});

await check('loading the saved version (what a project link does) reports saved', () => {
  dataStore.setCables([]);
  assert.equal(dataStore.getProjectSaveState().state, 'unsaved');
  assert.equal(dataStore.loadProject('Plant A'), true);
  assert.equal(dataStore.getCables().length, 2, 'loading restores the saved version');
  assert.equal(dataStore.getProjectSaveState().state, 'saved');
});

await check('describes each state for the badge', () => {
  assert.equal(describeProjectSaveState({ state: 'saved' }).label, 'Saved');
  assert.equal(describeProjectSaveState({ state: 'unsaved', hasSavedVersion: true }).label, 'Unsaved changes');
  assert.match(describeProjectSaveState({ state: 'unsaved', hasSavedVersion: true }).detail, /restores the last saved version/);
  assert.equal(describeProjectSaveState({ state: 'unsaved', hasSavedVersion: false }).label, 'Not saved yet');
  assert.equal(describeProjectSaveState({ state: 'unnamed' }).label, 'No project');
});

await check('the tracker broadcasts only when the state changes and keeps the latest', () => {
  const events = [];
  const win = {
    dispatchEvent: event => { events.push(event.detail); return true; },
    addEventListener() {},
  };
  let current = { state: 'saved', projectName: 'Plant A', hasSavedVersion: true };
  const tracker = startProjectSaveStateTracking({ evaluate: () => current, win, doc: null });
  tracker.flush();
  tracker.flush();
  current = { state: 'unsaved', projectName: 'Plant A', hasSavedVersion: true };
  tracker.flush();
  assert.deepEqual(events.map(event => event.label), ['Saved', 'Unsaved changes']);
  assert.equal(win.__ctrProjectSaveState.label, 'Unsaved changes');
});

await check('saveProjectOnChange saves the active project after a watched write', async () => {
  globalThis.window = { currentProjectId: 'Plant A', addEventListener() {}, dispatchEvent() { return true; } };
  try {
    saveProjectOnChange(['equipmentArrangements'], { delayMs: 5 });
    dataStore.setItem('equipmentArrangements', { arrangements: [{ id: 'arr-1' }] });
    assert.equal(dataStore.getProjectSaveState().state, 'unsaved');
    await wait(30);
    assert.equal(dataStore.getProjectSaveState().state, 'saved');
    assert.deepEqual(projectStorage.readSavedProject('Plant A').settings.equipmentArrangements, { arrangements: [{ id: 'arr-1' }] });
  } finally {
    delete globalThis.window;
  }
});

if (failures) process.exitCode = 1;
