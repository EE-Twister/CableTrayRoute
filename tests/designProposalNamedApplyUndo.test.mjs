import assert from 'node:assert/strict';
import test from 'node:test';

const values = new Map();
const storage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key),
  key: index => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};
globalThis.localStorage = storage;
globalThis.sessionStorage = storage;

const project = await import('../projectStorage.js');
await project.initializeProjectStorage();
const store = await import('../dataStore.mjs');
const { applyDesignProposal, previewDesignProposal, resolveDesignSynthesisInputEvidence } = await import('../src/design-synthesis/applyProposal.mjs');

test('named Apply keeps project-name synchronization in the same undo and redo entry', () => {
  const projectName = 'Named apply undo regression';
  store.setEquipment([{ id: 'manual-equipment', tag: 'MANUAL' }]);
  store.setProjectMeta({ name: projectName });
  globalThis.window = { currentProjectId: projectName, dispatchEvent() {} };
  try {
    const before = project.getProjectState();
    const proposal = {
      schemaVersion: '1.0.0',
      status: 'proposal',
      inputSignature: 'named-apply-undo-regression',
      inputs: {},
      inputEvidence: {
        units: { voltage: 'V' },
        records: {
          supply: { id: 'source', classification: 'user-supplied', values: { voltage: { value: 480, basis: 'provided' } } },
          equipment: [
            { id: 'generated-equipment', classification: 'synthetic', values: { kw: { value: 5, basis: 'provided' }, frequencyHz: { value: 60, basis: 'default', source: 'screening model' }, legacyPrimitive: 'retained', nullable: null }, note: 'Evidence retained for review.', references: [{ title: 'Input reference' }] },
            { id: 'equipment-two', classification: 'synthetic', values: { kw: { value: 7, basis: 'provided' } }, note: 'Evidence retained for review.' },
            { id: 'equipment-three', values: { kw: null, powerFactor: { value: null, basis: null, source: null } } },
          ],
        },
      },
      equipment: [{ id: 'generated-equipment', tag: 'GENERATED', type: 'load', kw: 5, voltage: 480, phases: 3 }],
      loads: [], panels: [], cables: [], trays: [], conduits: [],
    };
    const preview = previewDesignProposal(proposal);
    const result = applyDesignProposal(proposal, { previewContext: preview.context });
    assert.equal(result.applied, true, JSON.stringify(result.errors || result.conflicts));
    const after = project.getProjectState();
    assert.equal(after.name, projectName);
    assert.ok(store.getEquipment().some(row => row.id === 'generated-equipment'));
    assert.deepEqual(resolveDesignSynthesisInputEvidence(JSON.parse(JSON.stringify(store.getItem('designSynthesisInputEvidence', null)))), proposal.inputEvidence);

    project.undoProjectChange();
    assert.deepEqual(project.getProjectState(), before);
    assert.equal(store.getEquipment().some(row => row.id === 'generated-equipment'), false);

    project.redoProjectChange();
    assert.deepEqual(project.getProjectState(), after);
    assert.equal(store.getEquipment().some(row => row.id === 'generated-equipment'), true);
  } finally {
    delete globalThis.window;
  }
});
