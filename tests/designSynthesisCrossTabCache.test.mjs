import assert from 'node:assert/strict';
import { packDeviceEvidence } from '../utils/designSynthesisDeviceEvidenceCodec.mjs';
const listeners = [];
const values = new Map();
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key),
  key: index => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};
globalThis.window = { addEventListener(type, listener) { if (type === 'storage') listeners.push(listener); } };
const project = await import('../projectStorage.js');
await project.initializeProjectStorage();
const store = await import('../dataStore.mjs');
const dataStoreListener = listeners.at(-1);
for (const key of ['designSynthesisDeviceEvidence', 'designSynthesisLastApplied', 'designSynthesisInputEvidence']) {
  const original = { text: 'old' };
  store.setItem(key, original);
  assert.deepEqual(store.getItem(key), original);
  const changed = { text: 'new record '.repeat(80), key };
  const raw = JSON.stringify(packDeviceEvidence(changed));
  values.set(`base:${key}`, raw);
  let eventValue;
  let readInCallback;
  const listener = value => { eventValue = value; readInCallback = store.getItem(key); };
  store.on(key, listener);
  // Fire the data-store listener before projectStorage's listener, as a real
  // browser may do when separately bundled modules register in that order.
  dataStoreListener({ key: `base:${key}`, newValue: raw });
  assert.deepEqual(eventValue, changed);
  assert.deepEqual(readInCallback, changed);
  store.off(key, listener);
}
console.log('cross-tab compact-record cache tests passed');
