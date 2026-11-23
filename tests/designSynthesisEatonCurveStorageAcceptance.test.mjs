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

test('source-bound constant-current research survives compact Apply and fails closed for legacy or changed voltage', () => {
  store.setProjectMeta({ name: 'Plot research storage acceptance' });
  globalThis.window = { currentProjectId: 'Plot research storage acceptance', dispatchEvent() {} };
  try {
    const input = fixture(25);
    input.faultStudy.sources[0].impedance = { rOhm: 2.75, xOhm: 0.015 };
    const proposal = generateDesignProposal(input);
    const candidate = proposal.deviceFaultValidation.placements.find(row => row.device?.id === 'eaton_series_c_fd3020');
    const expected = candidate?.comparisons?.constantCurrentCurveResearch;
    assert.equal(expected?.status, 'evaluated-graphical-conservative-envelope');
    assert.ok(expected.plotUpperTimeSeconds > 8 && expected.plotUpperTimeSeconds < 12);
    assert.equal(proposal.deviceFaultValidation.status, 'evaluated');
    const preview = applyModule.previewDesignProposal(proposal);
    const applied = applyModule.applyDesignProposal(proposal, { previewContext: preview.context });
    assert.equal(applied.applied, true, JSON.stringify(applied.errors));
    const saved = store.getItem(applyModule.DEVICE_FAULT_VALIDATION_KEY, null);
    const faultStudy = store.getItem(applyModule.FAULT_STUDY_VALIDATION_KEY, null);
    const resolved = applyModule.resolveDesignSynthesisDeviceFaultValidation(saved, faultStudy);
    const restored = resolved.placements.find(row => row.id === candidate.id).comparisons.constantCurrentCurveResearch;
    assert.equal(restored.plotUpperTimeSeconds, expected.plotUpperTimeSeconds);
    assert.equal(restored.freshness, 'saved-study-not-verified-against-current-project');
    assert.equal(restored.source.sha256, expected.source.sha256);
    const legacy = { ...saved }; delete legacy.curveResearchDatasetFingerprint;
    assert.equal(applyModule.resolveDesignSynthesisDeviceFaultValidation(legacy, faultStudy).placements.find(row => row.id === candidate.id).comparisons.constantCurrentCurveResearch, undefined);
    const changedPin = { ...saved, curveResearchDatasetFingerprint: 'fnv1a-00000000' };
    const changed = applyModule.resolveDesignSynthesisDeviceFaultValidation(changedPin, faultStudy).placements.find(row => row.id === candidate.id).comparisons.constantCurrentCurveResearch;
    assert.equal(changed.status, 'source-dataset-changed-or-unavailable');
    assert.equal(changed.plotUpperTimeSeconds, null);
    const targetId = candidate.id.toLowerCase();
    const originalCables = store.getCables();
    store.setCables(originalCables.map(cable => `cable:${cable.id}`.toLowerCase() === targetId
      ? { ...cable, protectiveDevice: { ...cable.protectiveDevice, interruptingRatingKA: 1 } } : cable));
    const changedDevice = applyModule.resolveDesignSynthesisDeviceFaultValidation(saved, faultStudy).placements.find(row => row.id === candidate.id).comparisons.constantCurrentCurveResearch;
    assert.equal(changedDevice.status, 'saved-device-does-not-match-current-project');
    assert.equal(changedDevice.plotUpperTimeSeconds, null);
    store.setCables(originalCables);
    store.setCables(store.getCables().map(cable => `cable:${cable.id}`.toLowerCase() === targetId ? { ...cable, operating_voltage: 240 } : cable));
    assert.equal(store.getCables().find(cable => `cable:${cable.id}`.toLowerCase() === targetId)?.operating_voltage, 240);
    const stale = applyModule.resolveDesignSynthesisDeviceFaultValidation(saved, faultStudy).placements.find(row => row.id === candidate.id).comparisons.constantCurrentCurveResearch;
    assert.equal(stale.status, 'saved-voltage-does-not-match-current-project');
    assert.equal(stale.plotUpperTimeSeconds, null);
  } finally { delete globalThis.window; }
});
