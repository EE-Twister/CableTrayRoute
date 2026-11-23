import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const values = new Map();
let rejectNamedSave = false;
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem(key, value) {
    if (rejectNamedSave && key === 'CTR_SAVED_PROJECTS_V1') {
      const error = new Error('Intentional named-save rejection'); error.name = 'QuotaExceededError'; throw error;
    }
    values.set(key, String(value));
  },
  removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null,
  get length() { return values.size; }
};
const project = await import('../projectStorage.js');
await project.initializeProjectStorage();
const store = await import('../dataStore.mjs');
const { generateDesignProposal } = await import('../analysis/designSynthesis.mjs');
const applyModule = await import('../src/design-synthesis/applyProposal.mjs');
const key = applyModule.FAULT_STUDY_VALIDATION_KEY;
const read = () => structuredClone(store.getItem(key, null));
const rawState = () => [...values].sort(([left], [right]) => left.localeCompare(right));
function expand(saved) {
  return saved.cases.map(row => ({
    busId: row.busId,
    branches: applyModule.resolveDesignSynthesisFaultBranchCurrents(saved, row),
    sources: applyModule.resolveDesignSynthesisFaultSourceTerminalCurrents(saved, row)
  }));
}
function apply(proposal) {
  const preview = applyModule.previewDesignProposal(proposal);
  assert.equal(preview.ok, true, JSON.stringify(preview.errors || preview.conflicts));
  return applyModule.applyDesignProposal(proposal, { previewContext: preview.context });
}

test('legacy fault evidence survives named reload, rejected migration, one-step undo/redo and new-format reload', () => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-tray-congestion.json', import.meta.url), 'utf8'));
  input.equipment = input.equipment.slice(0, 2);
  input.faultStudy = {
    networkBaseMVA: 1,
    sourceInventory: { status: 'complete', reference: 'Synthetic legacy wire-format acceptance only' },
    sources: [{ equipmentId: 'S', emfPhaseV: { re: 480 / Math.sqrt(3), im: 0 }, impedance: { rOhm: 0.006, xOhm: 0.015 }, inService: true, reference: 'Synthetic source equivalent' }]
  };
  const name = 'Legacy fault wire-format acceptance';
  store.setProjectMeta({ name });
  globalThis.window = { currentProjectId: name, dispatchEvent() {} };
  try {
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
    assert.equal(apply(proposal).applied, true);
    const original = read();
    const expected = expand(original);
    assert.ok(expected.length > 0);
    assert.ok(expected.every(row => row.branches?.length && row.sources?.length));
    const decode = applyModule.decodeDesignSynthesisFaultScenarioBytes;
    const legacy = {
      ...original,
      branchDutyEncoding: original.branchDutyEncoding.replace('utf15', 'base64'),
      branchDutyValueDictionaryBase64: Buffer.from(decode(original.branchDutyValueDictionaryUtf15, original.branchDutyValueDictionaryCount * 8)).toString('base64'),
      branchDutyCodesBase64: Buffer.from(decode(original.branchDutyCodesUtf15, original.branchDutyCodeByteCount)).toString('base64'),
      sourceTerminalEncoding: 'float64-le-base64-v1',
      sourceTerminalCurrentsBase64: Buffer.from(decode(original.sourceTerminalCurrentsUtf15, original.sourceTerminalValueCount * 8)).toString('base64')
    };
    for (const field of ['branchDutyValueDictionaryCount', 'branchDutyValueDictionaryUtf15', 'branchDutyCodeByteCount', 'branchDutyCodesUtf15', 'sourceTerminalCurrentsUtf15']) delete legacy[field];
    assert.deepEqual(expand(legacy), expected);
    store.setItem(key, legacy);
    assert.equal(store.saveProject(name), true);
    assert.equal(store.loadProject(name), true);
    assert.deepEqual(read(), legacy, 'Loading an old record does not rewrite its wire format');
    const before = rawState();
    rejectNamedSave = true;
    const failed = apply(proposal);
    rejectNamedSave = false;
    assert.equal(failed.applied, false);
    const previousValues = new Map(before);
    const currentValues = new Map(rawState());
    const changedKeys = [...new Set([...previousValues.keys(), ...currentValues.keys()])]
      .filter(name => previousValues.get(name) !== currentValues.get(name));
    assert.deepEqual(changedKeys, [], 'Rejected named save restores every legacy/raw storage key');
    assert.deepEqual(read(), legacy);
    assert.equal(apply(proposal).applied, true);
    const upgraded = read();
    assert.equal(upgraded.branchDutyEncoding, 'uint16-index-lz77-float64-le-utf15-v1');
    assert.deepEqual(expand(upgraded), expected);
    project.undoProjectChange();
    assert.deepEqual(read(), legacy, 'One undo restores the exact legacy object');
    project.redoProjectChange();
    assert.deepEqual(read(), upgraded, 'One redo restores the exact new object');
    assert.equal(store.loadProject(name), true);
    assert.deepEqual(read(), upgraded);
    assert.deepEqual(expand(read()), expected);
  } finally { rejectNamedSave = false; delete globalThis.window; }
});
