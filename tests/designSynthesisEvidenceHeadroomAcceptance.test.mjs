import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DEVICE_EVIDENCE_STORAGE_KEY as KEY } from '../utils/designSynthesisDeviceEvidenceCodec.mjs';

const values = new Map();
const budget = 5 * 1024 * 1024;
const bytes = entries => [...entries].reduce((total, [key, value]) => total + 2 * (key.length + value.length), 0);
let rejectEvidenceWrite = false;
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem(key, value) {
    const next = new Map(values).set(key, String(value));
    if (bytes(next) > budget || (rejectEvidenceWrite && key === `base:${KEY}`)) {
      const error = new Error(`Rejected ${key} at ${bytes(next)} bytes`); error.name = 'QuotaExceededError'; throw error;
    }
    values.set(key, String(value));
  },
  removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};
const project = await import('../projectStorage.js');
await project.initializeProjectStorage();
const store = await import('../dataStore.mjs');
const { generateDesignProposal } = await import('../analysis/designSynthesis.mjs');
const { applyDesignProposal, previewDesignProposal, resolveDesignSynthesisDeviceEvidence } = await import('../src/design-synthesis/applyProposal.mjs');

function fixture(count) {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const rows = input.equipment;
  input.equipment = Array.from({ length: count }, (_, i) => ({ ...rows[i % rows.length], id: `HEADROOM-${i + 1}`, tag: `HEADROOM-${i + 1}`,
    voltage: i < count * 0.8 ? 208 : 480, kw: i < count * 0.8 ? 1 : 3, powerFactor: 0.9, phases: 3 }));
  return input;
}
function apply(proposal) {
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  const preview = previewDesignProposal(proposal);
  return applyDesignProposal(proposal, { previewContext: preview.context });
}

test('25-to-50 mixed-voltage expansion keeps owner data, evidence, history, reload and rollback within 5 MiB', () => {
  const owner = { notes: 'User-owned project notes: ' + 'N'.repeat(25_000) };
  store.setItem('ownerEngineeringNotes', owner);
  store.setProjectMeta({ name: 'Evidence headroom acceptance' });
  globalThis.window = { currentProjectId: 'Evidence headroom acceptance', dispatchEvent() {} };
  try {
    const first = generateDesignProposal(fixture(25));
    assert.equal(apply(first).applied, true);
    const input = fixture(50); input.generationBaseline = first.distributionBaseline;
    const expanded = generateDesignProposal(input);
    const result = apply(expanded);
    assert.equal(result.applied, true, JSON.stringify(result.errors || result.conflicts));
    assert.equal(store.getLoads().length, 50);
    assert.deepEqual(store.getItem('ownerEngineeringNotes'), owner);
    assert.ok(bytes(values) <= budget, `Active and named project used ${bytes(values)} bytes`);
    const map = store.getItem(KEY, {});
    for (const cable of store.getCables()) {
      const selected = expanded.cables.find(row => row.tag === cable.tag)?.protectiveDevice;
      assert.deepEqual(resolveDesignSynthesisDeviceEvidence(cable, map), selected);
    }
    assert.deepEqual(project.getProjectState().settings[KEY], map);
    assert.deepEqual(store.exportProject().settings[KEY], map);
    assert.deepEqual(project.readSavedProject('Evidence headroom acceptance').settings[KEY], map);
    assert.deepEqual(JSON.parse(values.get('CTR_SAVED_PROJECTS_V1'))['Evidence headroom acceptance'].settings[KEY], map);
    project.undoProjectChange(); assert.equal(store.getLoads().length, 25); assert.deepEqual(store.getItem('ownerEngineeringNotes'), owner);
    project.redoProjectChange(); assert.equal(store.getLoads().length, 50); assert.deepEqual(store.getItem(KEY), map);
    assert.equal(store.loadProject('Evidence headroom acceptance'), true);
    assert.equal(store.getLoads().length, 50); assert.deepEqual(store.getItem(KEY), map);
    assert.deepEqual(store.getItem('ownerEngineeringNotes'), owner);
    console.log(`Mixed-voltage owner-data storage ${bytes(values)}/${budget} bytes`);

    const changedInput = fixture(50); changedInput.generationBaseline = expanded.distributionBaseline;
    const catalog = JSON.parse(fs.readFileSync(new URL('../data/designSynthesisDevices.json', import.meta.url), 'utf8'));
    changedInput.protectiveDevices = catalog.records.map(record => ({ ...record, ownerSpecificEvidence: 'Changed catalog basis' }));
    const changed = generateDesignProposal(changedInput);
    const previousState = project.getProjectState();
    const previousRaw = new Map(values);
    rejectEvidenceWrite = true;
    const rejected = apply(changed);
    rejectEvidenceWrite = false;
    assert.equal(rejected.applied, false);
    assert.deepEqual(project.getProjectState(), previousState);
    assert.deepEqual(values, previousRaw, 'Rejected evidence write must restore exact durable bytes');

    const unsupported = { encoding: 'design-synthesis-device-evidence-future-v2', payload: 'preserve future data' };
    project.writeScenarioValue(KEY, unsupported, 'base');
    const preserved = new Map(values);
    const invalidResult = apply(expanded);
    assert.equal(invalidResult.applied, false);
    assert.match(JSON.stringify(invalidResult.errors), /corrupted or uses an unsupported encoding/);
    assert.deepEqual(values, preserved, 'Unsupported future evidence must remain byte-for-byte unchanged');
    assert.deepEqual(store.getItem(KEY), unsupported);
  } finally {
    rejectEvidenceWrite = false;
    delete globalThis.window;
  }
});
