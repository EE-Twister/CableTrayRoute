import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const values = new Map();
const budget = 5 * 1024 * 1024;
const bytes = entries => [...entries].reduce((sum, [key, value]) => sum + 2 * (key.length + value.length), 0);
let rejectNamedSave = false;
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem(key, value) {
    const next = new Map(values).set(key, String(value));
    if (bytes(next) > budget || (rejectNamedSave && key === 'CTR_SAVED_PROJECTS_V1')) {
      const error = new Error(`Acceptance storage quota failure: ${bytes(next)} bytes`);
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
const { applyDesignProposal, previewDesignProposal, FAULT_STUDY_VALIDATION_KEY, resolveDesignSynthesisFaultBranchCurrents, resolveDesignSynthesisFaultSourceTerminalCurrents } = await import('../src/design-synthesis/applyProposal.mjs');

function fixture(count) {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-tray-congestion.json', import.meta.url), 'utf8'));
  input.equipment = Array.from({ length: count }, (_, index) => ({ ...input.equipment[0], id: `LOAD-${index}`, tag: `LOAD-${index}` }));
  input.faultStudy = {
    networkBaseMVA: 1,
    sourceInventory: { status: 'complete', reference: 'Synthetic nonmotor fixture only' },
    sources: [{ equipmentId: 'S', emfPhaseV: { re: 480 / Math.sqrt(3), im: 0 }, impedance: { rOhm: 0.006, xOhm: 0.015 }, inService: true, reference: 'Synthetic utility equivalent only' }],
  };
  return input;
}
function view() { return JSON.parse(JSON.stringify({ equipment: store.getEquipment(), cables: store.getCables(), loads: store.getLoads(), panels: store.getPanels(), trays: store.getTrays(), conduits: store.getConduits(), oneLine: store.getOneLine(), study: store.getItem(FAULT_STUDY_VALIDATION_KEY, null) })); }
function apply(proposal) {
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  const preview = previewDesignProposal(proposal);
  return applyDesignProposal(proposal, { previewContext: preview.context });
}
function verifySaved(proposal) {
  const saved = JSON.parse(JSON.stringify(store.getItem(FAULT_STUDY_VALIDATION_KEY, null)));
  assert.equal(saved.status, 'evaluated');
  assert.equal(saved.modelInputFingerprint, proposal.faultStudyValidation.modelInputFingerprint);
  assert.equal(saved.sourceInventory.verificationStatus, 'not-verified');
  assert.deepEqual(saved.input, proposal.faultStudy);
  assert.equal(saved.cases.length, proposal.faultStudyValidation.cases.length);
  for (const row of saved.cases) {
    const original = proposal.faultStudyValidation.cases.find(item => item.busId === row.busId);
    assert.equal(row.totalFaultCurrentKA, original.fault.faultCurrentRmsKA);
    assert.equal(row.sourceContributionsKA[0].currentKA, original.sourceFaultContributions[0].currentKA.magnitude);
    assert.deepEqual(resolveDesignSynthesisFaultSourceTerminalCurrents(saved, row), original.sourceTerminalCurrents.map(item => ({ sourceId: item.sourceId, currentKA: item.currentKA.magnitude })));
    const currents = [...original.branchTerminalCurrents, ...original.zeroImpedanceTieCurrents];
    assert.equal(saved.branchIds.length, currents.length);
    const decoded = resolveDesignSynthesisFaultBranchCurrents(saved, row);
    assert.equal(decoded.length, currents.length);
    for (const branch of decoded) {
      const original = currents.find(item => item.branchId === branch.branchId);
      assert.ok(original, `Branch identity ${branch.branchId} must survive compaction`);
      assert.deepEqual([branch.fromCurrentKA, branch.toCurrentKA], [original.fromCurrentIntoBranchKA.magnitude, original.toCurrentIntoBranchKA.magnitude]);
    }
    assert.equal('busVoltages' in row, false);
  }
  assert.ok(values.get('CTR_SAVED_PROJECTS_V1').includes(saved.modelInputFingerprint));
  assert.ok(bytes(values) <= budget);
}

test('25 to 50 fault-study Apply retains evidence under 5 MiB with undo, redo, failed saves and omission', context => {
  store.setEquipment([{ id: 'manual', tag: 'MANUAL', description: 'Preserve unrelated work' }]);
  store.setProjectMeta({ name: 'Fault study storage acceptance' });
  globalThis.window = { currentProjectId: 'Fault study storage acceptance', dispatchEvent() {} };
  try {
    const first = generateDesignProposal(fixture(25));
    const before = view();
    let result = apply(first);
    assert.equal(result.applied, true, JSON.stringify(result.errors || result.conflicts));
    verifySaved(first);
    const after = view();
    project.undoProjectChange(); assert.deepEqual(view(), before);
    project.redoProjectChange(); assert.deepEqual(view(), after);
    const input = fixture(50);
    input.generationBaseline = first.distributionBaseline;
    const expanded = generateDesignProposal(input);
    result = apply(expanded);
    assert.equal(result.applied, true, JSON.stringify(result.errors || result.conflicts));
    verifySaved(expanded);
    context.diagnostic(`50-load named and canonical storage: ${bytes(values)} of ${budget} bytes`);
    assert.equal(store.getLoads().length, 50);
    assert.ok(store.getEquipment().some(item => item.id === 'manual'));
    const stable = view();
    input.generationBaseline = expanded.distributionBaseline;
    const withoutStudy = structuredClone(input);
    delete withoutStudy.faultStudy;
    result = apply(generateDesignProposal(withoutStudy));
    assert.equal(result.applied, true, JSON.stringify(result.errors || result.conflicts));
    assert.equal(store.getItem(FAULT_STUDY_VALIDATION_KEY, null), null);
    project.undoProjectChange(); assert.deepEqual(view(), stable);
    const named = values.get('CTR_SAVED_PROJECTS_V1');
    input.faultStudy.sources[0].impedance.xOhm = 0.016;
    const changed = generateDesignProposal(input);
    rejectNamedSave = true;
    result = apply(changed);
    rejectNamedSave = false;
    assert.equal(result.applied, false);
    assert.deepEqual(view(), stable);
    assert.equal(values.get('CTR_SAVED_PROJECTS_V1'), named);
  } finally { rejectNamedSave = false; delete globalThis.window; }
});
