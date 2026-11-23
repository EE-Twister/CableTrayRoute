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
    if (bytes(next) > budget || (rejectNamedSave && key === 'CTR_SAVED_PROJECTS_V1')) { const error = new Error('Device-fault storage acceptance budget exceeded'); error.name = 'QuotaExceededError'; throw error; }
    values.set(key, String(value));
  },
  removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};
const project = await import('../projectStorage.js');
await project.initializeProjectStorage();
const store = await import('../dataStore.mjs');
const { generateDesignProposal } = await import('../analysis/designSynthesis.mjs');
const applyModule = await import('../src/design-synthesis/applyProposal.mjs');

function fixture(count) {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-tray-congestion.json', import.meta.url), 'utf8'));
  input.equipment = Array.from({ length: count }, (_, index) => ({ ...input.equipment[0], id: `DEVICE-LOAD-${index}`, tag: `DEVICE-LOAD-${index}` }));
  input.faultStudy = {
    networkBaseMVA: 1,
    sourceInventory: { status: 'complete', reference: 'Synthetic device-storage fixture only' },
    sources: [{ equipmentId: 'S', emfPhaseV: { re: 480 / Math.sqrt(3), im: 0 }, impedance: { rOhm: 0.006, xOhm: 0.015 }, inService: true, reference: 'Synthetic utility equivalent only' }],
  };
  return input;
}

test('device-fault compact evidence round-trips exact currents and follows Apply undo, redo and omission', () => {
  store.setProjectMeta({ name: 'Device fault storage acceptance' });
  globalThis.window = { currentProjectId: 'Device fault storage acceptance', dispatchEvent() {} };
  try {
    const input = fixture(25);
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.deviceFaultValidation.status, 'evaluated');
    const preview = applyModule.previewDesignProposal(proposal);
    const applied = applyModule.applyDesignProposal(proposal, { previewContext: preview.context });
    assert.equal(applied.applied, true, JSON.stringify(applied.errors));
    const saved = structuredClone(store.getItem(applyModule.DEVICE_FAULT_VALIDATION_KEY, null));
    const faultStudy = store.getItem(applyModule.FAULT_STUDY_VALIDATION_KEY, null);
    const expanded = applyModule.resolveDesignSynthesisDeviceFaultValidation(saved, faultStudy);
    assert.ok(expanded);
    assert.equal(expanded.placements.length, proposal.deviceFaultValidation.placements.length);
    for (const actual of expanded.placements) {
      const expected = proposal.deviceFaultValidation.placements.find(item => item.id === actual.id);
      assert.ok(expected, `placement ${actual.id} must survive compact persistence`);
      for (const row of actual.cases) {
        const original = expected.cases.find(item => item.kind === row.kind && item.faultBusId === row.faultBusId);
        assert.ok(original, `${actual.id} case ${row.id} must survive compact persistence`);
        assert.equal(row.throughDeviceCurrentRmsKA, original.throughDeviceCurrentRmsKA);
      }
      assert.equal(actual.comparisons.lineTerminalAvailableInitialRms.valueKA, expected.comparisons.lineTerminalAvailableInitialRms.valueKA);
      assert.equal(actual.comparisons.maximumThroughDeviceInitialRms.valueKA, expected.comparisons.maximumThroughDeviceInitialRms.valueKA);
      assert.equal(actual.comparisons.maximumThroughDeviceInitialRms.faultBusId, expected.comparisons.maximumThroughDeviceInitialRms.faultBusId);
      assert.equal(actual.comparisons.protectionAdequacy, 'unevaluated');
      assert.ok(actual.deviceEvidenceRef);
      assert.ok(store.getItem(applyModule.DEVICE_EVIDENCE_KEY, {})[actual.deviceEvidenceRef]);
    }
    assert.ok(bytes(values) <= budget);
    const before = saved;
    project.undoProjectChange();
    assert.equal(store.getItem(applyModule.DEVICE_FAULT_VALIDATION_KEY, null), null);
    project.redoProjectChange();
    assert.deepEqual(store.getItem(applyModule.DEVICE_FAULT_VALIDATION_KEY, null), before);

    const withoutStudy = structuredClone(input);
    delete withoutStudy.faultStudy;
    const omitted = generateDesignProposal(withoutStudy);
    const omittedPreview = applyModule.previewDesignProposal(omitted);
    assert.equal(applyModule.applyDesignProposal(omitted, { previewContext: omittedPreview.context }).applied, true);
    assert.equal(store.getItem(applyModule.DEVICE_FAULT_VALIDATION_KEY, null), null);
    project.undoProjectChange();
    assert.deepEqual(store.getItem(applyModule.DEVICE_FAULT_VALIDATION_KEY, null), before);

    const changedInput = structuredClone(input);
    changedInput.faultStudy.sources[0].impedance.xOhm = 0.016;
    const changed = generateDesignProposal(changedInput);
    const changedPreview = applyModule.previewDesignProposal(changed);
    rejectNamedSave = true;
    const failed = applyModule.applyDesignProposal(changed, { previewContext: changedPreview.context });
    rejectNamedSave = false;
    assert.equal(failed.applied, false);
    assert.deepEqual(store.getItem(applyModule.DEVICE_FAULT_VALIDATION_KEY, null), before);

    store.setCables(store.getCables().map(cable => cable.protectiveDevice
      ? { ...cable, protectiveDevice: { ...cable.protectiveDevice, interruptingRatingKA: 1 } }
      : cable));
    const afterLiveEdit = applyModule.resolveDesignSynthesisDeviceFaultValidation(before, faultStudy);
    assert.ok(afterLiveEdit);
    assert.ok(afterLiveEdit.placements.every(item => item.rating.currentKA !== 1), 'Persisted rating evidence must come from the immutable saved device record.');
  } finally { rejectNamedSave = false; delete globalThis.window; }
});

test('malformed packed device-current data returns null instead of zero currents', () => {
  const saved = { encoding: 'device-fault-packed-reference-v1', status: 'evaluated', placementCount: 1,
    networkModelInputFingerprint: 'fingerprint', placementRefsBase64: 'AAAAAA==', placementKindsBase64: 'AA==',
    placementEvidenceRefsBase64: 'AAAAAA==', placementVirtualCurrentEncoding: 'float64-le-lz77-base64-v1',
    placementVirtualCurrentsBase64: 'AAAA', aggregateExceptionCount: 0, aggregateExceptionsBase64: '' };
  const faultStudy = { modelInputFingerprint: 'fingerprint', cases: [], branchIds: [] };
  assert.equal(applyModule.resolveDesignSynthesisDeviceFaultValidation(saved, faultStudy), null);
});
