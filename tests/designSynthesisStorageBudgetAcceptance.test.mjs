import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const values = new Map();
const limitBytes = 5 * 1024 * 1024;
const bytes = entries => [...entries].reduce((total, [key, value]) => total + 2 * (key.length + value.length), 0);
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem(key, value) {
    const next = new Map(values);
    next.set(key, String(value));
    if (bytes(next) > limitBytes) {
      const error = new Error(`Project exceeds the 5 MiB acceptance budget: ${bytes(next)} bytes; ${JSON.stringify([...next].map(([name, item]) => [name, 2 * item.length]).sort((a, b) => b[1] - a[1]).slice(0, 6))}`);
      error.name = 'QuotaExceededError';
      throw error;
    }
    values.set(key, String(value));
  },
  removeItem: key => values.delete(key),
  key: index => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};
const project = await import('../projectStorage.js');
await project.initializeProjectStorage();
const store = await import('../dataStore.mjs');
const { generateDesignProposal } = await import('../analysis/designSynthesis.mjs');
const { applyDesignProposal, previewDesignProposal, resolveDesignSynthesisDeviceEvidence, resolveDesignSynthesisInputEvidence } = await import('../src/design-synthesis/applyProposal.mjs');

test('50-load canonical and named project saves fit a bounded browser storage budget', () => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const original = input.equipment;
  input.equipment = Array.from({ length: 50 }, (_, index) => ({
    ...original[index % original.length], id: `BUDGET-${index}`, tag: `BUDGET-${index}`,
  }));
  input.supply.capacityKva = 10000;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal');
  store.setProjectMeta({ name: 'Storage budget acceptance' });
  globalThis.window = { currentProjectId: 'Storage budget acceptance', dispatchEvent() {} };
  try {
    const preview = previewDesignProposal(proposal);
    const result = applyDesignProposal(proposal, { previewContext: preview.context });
    assert.equal(result.applied, true, JSON.stringify(result.errors));
    assert.ok(values.has('CTR_SAVED_PROJECTS_V1'), 'Named project snapshot must be saved too');
    assert.equal(store.getLoads().length, 50);
    assert.ok(proposal.conduits.length > 0, 'The sample must exercise endpoint installation storage');
    assert.equal(store.getConduits().length, proposal.conduits.length, 'Storage-budget success must retain the generated endpoint conduits');
    assert.deepEqual(resolveDesignSynthesisInputEvidence(JSON.parse(JSON.stringify(store.getItem('designSynthesisInputEvidence', null)))), proposal.inputEvidence, 'Storage compaction must preserve complete input evidence after JSON serialization');
    assert.ok(bytes(values) <= limitBytes);
    const evidence = store.getItem('designSynthesisDeviceEvidence', {});
    for (const cable of store.getCables()) {
      const generated = proposal.cables.find(item => item.tag === cable.tag);
      assert.ok(generated, `Unexpected persisted circuit ${cable.tag}`);
      const selected = generated.protectiveDevice;
      assert.ok(cable.protectiveDeviceEvidenceRef);
      assert.deepEqual(resolveDesignSynthesisDeviceEvidence(cable, evidence), selected, 'Full selected-device evidence must resolve after compact persistence');
      assert.ok(resolveDesignSynthesisDeviceEvidence(cable, evidence).curveSourceResearch?.source?.sha256, 'Curve-source evidence must survive compact project persistence');
      assert.equal(cable.protectiveDevice.continuousCurrentA, selected.continuousCurrentA);
      assert.equal(cable.protectiveDevice.evaluatedVoltageVac, selected.evaluatedVoltageVac);
      assert.equal(cable.protectiveDevice.interruptingRatingKA, selected.interruptingRatingKA);
    }
  } finally {
    delete globalThis.window;
  }
});
