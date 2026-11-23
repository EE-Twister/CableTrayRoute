import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const values = new Map();
const budget = 5 * 1024 * 1024;
const bytes = entries => [...entries].reduce((total, [key, value]) => total + 2 * (key.length + value.length), 0);
let rejectNamedSave = false;
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem(key, value) {
    const next = new Map(values).set(key, String(value));
    if (bytes(next) > budget || (rejectNamedSave && key === 'CTR_SAVED_PROJECTS_V1')) {
      const error = new Error(`Acceptance storage quota failure: ${bytes(next)} bytes, limit ${budget}; forced rejection ${rejectNamedSave}`);
      error.name = 'QuotaExceededError'; throw error;
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
const { applyDesignProposal, previewDesignProposal, resolveDesignSynthesisInputEvidence, resolveDesignSynthesisTransformerDeviceEvidence } = await import('../src/design-synthesis/applyProposal.mjs');

function fixture(count) {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const rows = input.equipment;
  input.equipment = Array.from({ length: count }, (_, i) => ({
    ...rows[i % rows.length], id: `STORE-MV-${i + 1}`, tag: `STORE-MV-${i + 1}`,
    voltage: i < count * 0.8 ? 208 : 480, kw: i < count * 0.8 ? 1 : 3, powerFactor: 0.9, phases: 3,
  }));
  return input;
}
function view() {
  return JSON.parse(JSON.stringify({ equipment: store.getEquipment(), cables: store.getCables(),
    loads: store.getLoads(), panels: store.getPanels(), trays: store.getTrays(),
    conduits: store.getConduits(), oneLine: store.getOneLine(),
    evidence: store.getItem('designSynthesisDeviceEvidence', {}),
    inputEvidence: resolveDesignSynthesisInputEvidence(store.getItem('designSynthesisInputEvidence', null)),
    validation: store.getItem('designSynthesisLoadFlowValidation', null),
  }));
}
function apply(proposal) {
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  const preview = previewDesignProposal(proposal);
  return applyDesignProposal(proposal, { previewContext: preview.context });
}

test('mixed-voltage Apply preserves transformer identity through expansion, undo/redo and failed named save', () => {
  store.setEquipment([{ id: 'manual-equipment', tag: 'MANUAL', description: 'Preserve unrelated engineering work' }]);
  store.setProjectMeta({ name: 'Mixed voltage storage acceptance' });
  globalThis.window = { currentProjectId: 'Mixed voltage storage acceptance', dispatchEvent() {} };
  try {
    const first = generateDesignProposal(fixture(25));
    const before = view();
    const applied = apply(first);
    assert.equal(applied.applied, true, JSON.stringify(applied.errors || applied.conflicts));
    const after = view();
    assert.ok(after.equipment.some(row => row.id === 'manual-equipment'));
    assert.equal(after.equipment.filter(row => row.type === 'transformer').length, 1);
    assert.ok(values.has('CTR_SAVED_PROJECTS_V1'));
    assert.ok(values.get('CTR_SAVED_PROJECTS_V1').includes(first.transformer.id));
    project.undoProjectChange(); assert.deepEqual(view(), before);
    project.redoProjectChange(); assert.deepEqual(view(), after);

    const expandedInput = fixture(50);
    expandedInput.generationBaseline = first.distributionBaseline;
    const expanded = generateDesignProposal(expandedInput);
    assert.equal(expanded.transformer.id, first.transformer.id);
    assert.equal(expanded.transformer.primaryBusId, first.transformer.primaryBusId);
    assert.equal(expanded.transformer.secondaryBusId, first.transformer.secondaryBusId);
    assert.equal(expanded.transformer.catalogNumber, 'EXN150T3HCU');
    const reapplied = apply(expanded);
    assert.equal(reapplied.applied, true, JSON.stringify(reapplied.errors || reapplied.conflicts));
    assert.equal(store.getLoads().length, 50);
    const storedTx = store.getEquipment().filter(row => row.type === 'transformer');
    assert.equal(storedTx.length, 1);
    assert.equal(storedTx[0].catalogNumber, 'EXN150T3HCU');
    assert.deepEqual(resolveDesignSynthesisInputEvidence(store.getItem('designSynthesisInputEvidence', null)), expanded.inputEvidence,
      'All 50 inputs and their source/default basis must survive storage compaction');
    assert.deepEqual(storedTx[0].sourceDocuments, expanded.transformer.sourceDocuments);
    for (const side of ['primary', 'secondary']) {
      const field = side === 'primary' ? 'primaryProtectiveDevice' : 'secondaryMainDevice';
      assert.deepEqual(resolveDesignSynthesisTransformerDeviceEvidence(storedTx[0], side), expanded.transformer[field],
        `Selected ${side} device evidence must retain the complete evaluated record`);
    }
    assert.equal(store.getCables().length, expanded.cables.length);
    assert.equal(store.getConduits().length, expanded.conduits.length);
    assert.ok(bytes(values) <= budget, `Stored project used ${bytes(values)} bytes`);

    const unchanged = view();
    const namedSnapshot = values.get('CTR_SAVED_PROJECTS_V1');
    expandedInput.generationBaseline = expanded.distributionBaseline;
    expandedInput.equipment[0].kw += 0.1;
    const changed = generateDesignProposal(expandedInput);
    rejectNamedSave = true;
    const rejected = apply(changed);
    rejectNamedSave = false;
    assert.equal(rejected.applied, false, 'Durable-save failure cannot report Apply success');
    assert.deepEqual(view(), unchanged, 'Failed Apply must restore all generated domains');
    assert.equal(values.get('CTR_SAVED_PROJECTS_V1'), namedSnapshot);
  } finally {
    rejectNamedSave = false;
    delete globalThis.window;
  }
});
