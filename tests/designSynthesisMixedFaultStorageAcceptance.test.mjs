import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const values = new Map();
const budget = 5 * 1024 * 1024;
const bytes = entries => [...entries].reduce((sum, [key, value]) => sum + 2 * (key.length + value.length), 0);
let peakBytes = 0;
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem(key, value) {
    const next = new Map(values).set(key, String(value));
    const attempted = bytes(next);
    peakBytes = Math.max(peakBytes, attempted);
    if (attempted > budget) {
      const error = new Error(`Mixed-voltage fault-study acceptance budget exceeded: ${attempted} bytes`);
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
const applyModule = await import('../src/design-synthesis/applyProposal.mjs');

test('valid short-match streams exceeding literal-only overhead still decode exactly', () => {
  const bytes = new Uint8Array(200_000);
  for (let word = 0; word < bytes.length / 4; word += 1) {
    const key = word % 1024;
    bytes[word * 4] = key & 255;
    bytes[word * 4 + 1] = key >>> 8;
    bytes[word * 4 + 2] = 0;
    bytes[word * 4 + 3] = Math.floor(word / 1024) % 256;
  }
  const packed = applyModule.compressFaultBytes(bytes);
  assert.ok(packed.length > bytes.length + Math.ceil(bytes.length / 128) + 3);
  const dictionaryBytes = new Uint8Array(13_000 * 8);
  const dictionary = new DataView(dictionaryBytes.buffer);
  for (let index = 0; index < 13_000; index += 1) dictionary.setFloat64(index * 8, index + 0.125, true);
  const saved = {
    branchDutyEncoding: 'uint16-index-lz77-float64-le-base64-v1',
    branchIds: Array.from({ length: 1000 }, (_, index) => `BRANCH-${index}`),
    cases: Array.from({ length: 50 }, (_, index) => ({ busId: `CASE-${index}` })),
    branchDutyValueCount: 100_000,
    branchDutyValueDictionaryBase64: Buffer.from(dictionaryBytes).toString('base64'),
    branchDutyCodesBase64: Buffer.from(packed).toString('base64'),
  };
  const codes = new DataView(bytes.buffer);
  saved.cases.forEach((row, caseIndex) => {
    const decoded = applyModule.resolveDesignSynthesisFaultBranchCurrents(saved, row);
    assert.ok(decoded, 'Valid expanded short-match stream must be accepted');
    assert.equal(decoded.length, 1000);
    decoded.forEach((branch, branchIndex) => {
      const offset = (caseIndex * 1000 + branchIndex) * 4;
      assert.equal(branch.branchId, saved.branchIds[branchIndex]);
      assert.equal(branch.fromCurrentKA, codes.getUint16(offset, true) + 0.125);
      assert.equal(branch.toCurrentKA, codes.getUint16(offset + 2, true) + 0.125);
    });
  });
});

test('50 mixed-voltage loads retain every explicit fault case and branch current within 5 MiB', context => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const rows = input.equipment;
  input.equipment = Array.from({ length: 50 }, (_, index) => ({ ...rows[index % rows.length], id: `MV-${index + 1}`, tag: `MV-${index + 1}`, voltage: index < 40 ? 208 : 480, kw: index < 40 ? 1 : 3, powerFactor: 0.9, phases: 3 }));
  input.faultStudy = {
    networkBaseMVA: 1,
    sourceInventory: { status: 'complete', reference: 'Synthetic mixed-voltage nonmotor storage fixture' },
    sources: [{ equipmentId: input.supply.id, emfPhaseV: { re: 480 / Math.sqrt(3), im: 0 }, impedance: { rOhm: 0.006, xOhm: 0.015 }, inService: true, reference: 'Synthetic utility equivalent only' }],
    transformerPhase: { degrees: 0, reference: 'Explicit synthetic zero-angle assumption' },
  };
  store.setProjectMeta({ name: 'Mixed fault storage acceptance' });
  globalThis.window = { currentProjectId: 'Mixed fault storage acceptance', dispatchEvent() {} };
  try {
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
    assert.equal(proposal.faultStudyValidation.status, 'evaluated');
    assert.ok(proposal.transformer);
    const preview = applyModule.previewDesignProposal(proposal);
    const result = applyModule.applyDesignProposal(proposal, { previewContext: preview.context });
    assert.equal(result.applied, true, JSON.stringify({ errors: result.errors, peakBytes }));
    const saved = JSON.parse(JSON.stringify(store.getItem(applyModule.FAULT_STUDY_VALIDATION_KEY, null)));
    assert.equal(saved.modelInputFingerprint, proposal.faultStudyValidation.modelInputFingerprint);
    assert.deepEqual(saved.input, proposal.faultStudy);
    assert.equal(saved.cases.length, 58, '50 loads, 5 panels, 2 transformer terminal buses and the utility');
    for (const row of saved.cases) {
      const full = proposal.faultStudyValidation.cases.find(item => item.busId === row.busId);
      assert.ok(full);
      assert.equal(row.totalFaultCurrentKA, full.fault.faultCurrentRmsKA);
      assert.equal(row.sourceContributionsKA[0].currentKA, full.sourceFaultContributions[0].currentKA.magnitude);
      assert.deepEqual(applyModule.resolveDesignSynthesisFaultSourceTerminalCurrents(saved, row), full.sourceTerminalCurrents.map(item => ({ sourceId: item.sourceId, currentKA: item.currentKA.magnitude })));
      const originalBranches = [...full.branchTerminalCurrents, ...full.zeroImpedanceTieCurrents];
      const decoded = applyModule.resolveDesignSynthesisFaultBranchCurrents(saved, row);
      assert.equal(decoded.length, originalBranches.length);
      for (const branch of decoded) {
        const original = originalBranches.find(item => item.branchId === branch.branchId);
        assert.ok(original);
        assert.equal(branch.fromCurrentKA, original.fromCurrentIntoBranchKA.magnitude);
        assert.equal(branch.toCurrentKA, original.toCurrentIntoBranchKA.magnitude);
      }
    }
    assert.equal(store.getLoads().length, 50);
    const savedDevice = JSON.parse(JSON.stringify(store.getItem(applyModule.DEVICE_FAULT_VALIDATION_KEY, null)));
    assert.ok(savedDevice, 'The evaluated device screen must survive canonical and named project persistence');
    const evidence = JSON.parse(JSON.stringify(store.getItem(applyModule.DEVICE_EVIDENCE_KEY, {})));
    const resolvedDevice = applyModule.resolveDesignSynthesisDeviceFaultValidation(savedDevice, saved, evidence);
    assert.ok(resolvedDevice);
    assert.equal(resolvedDevice.scope, proposal.deviceFaultValidation.scope);
    assert.equal(resolvedDevice.modelInputFingerprint, proposal.deviceFaultValidation.modelInputFingerprint);
    assert.equal(resolvedDevice.deviceInputFingerprint, proposal.deviceFaultValidation.deviceInputFingerprint);
    assert.equal(resolvedDevice.placements.length, proposal.deviceFaultValidation.placements.length);
    for (const row of resolvedDevice.placements) {
      const full = proposal.deviceFaultValidation.placements.find(item => item.id === row.id);
      assert.ok(full, row.id);
      assert.equal(row.proposedLocation.fromBusId, full.proposedLocation.fromBusId);
      assert.equal(row.cases.length, full.cases.length);
      for (const value of row.cases) {
        const expected = full.cases.find(item => item.id === value.id);
        assert.ok(expected, `Original device case identity ${value.id}`);
        assert.equal(value.throughDeviceCurrentRmsKA, expected.throughDeviceCurrentRmsKA, 'Every device current magnitude must round-trip bit-exactly');
        assert.equal(value.throughDeviceStatus, expected.throughDeviceStatus);
      }
      for (const field of ['lineTerminalAvailableInitialRms', 'maximumThroughDeviceInitialRms']) {
        assert.equal(row.comparisons[field].valueKA, full.comparisons[field].valueKA);
        assert.equal(row.comparisons[field].status, full.comparisons[field].status);
      }
      assert.equal(row.comparisons.protectionAdequacy, 'unevaluated');
      assert.equal(row.device.interruptingRatingKA, full.device.standaloneInterruptingRating.currentKA);
    }
    const wrongRefs = structuredClone(savedDevice);
    const badBytes = Buffer.from(wrongRefs.placementRefsBase64, 'base64');
    badBytes.writeUInt16LE(65535, 0);
    wrongRefs.placementRefsBase64 = badBytes.toString('base64');
    assert.equal(applyModule.resolveDesignSynthesisDeviceFaultValidation(wrongRefs, saved, evidence), null);
    const wrongKinds = structuredClone(savedDevice);
    const kinds = Buffer.from(wrongKinds.placementKindsBase64, 'base64');
    kinds[0] = 2;
    wrongKinds.placementKindsBase64 = kinds.toString('base64');
    assert.equal(applyModule.resolveDesignSynthesisDeviceFaultValidation(wrongKinds, saved, evidence), null);
    const wrongCount = { ...savedDevice, aggregateExceptionCount: 0, aggregateExceptionsBase64: '' };
    assert.equal(applyModule.resolveDesignSynthesisDeviceFaultValidation(wrongCount, saved, evidence), null);
    const changedEvidence = structuredClone(evidence);
    const firstRef = resolvedDevice.placements[0].deviceEvidenceRef;
    assert.ok(firstRef && changedEvidence[firstRef]);
    const unsupported = { encoding: 'design-synthesis-device-evidence-future-v2', [firstRef]: evidence[firstRef] };
    assert.equal(applyModule.resolveDesignSynthesisDeviceFaultValidation(savedDevice, saved, unsupported), null, 'Unreadable envelopes cannot impersonate rating evidence');
    changedEvidence[firstRef].interruptingRatingKA *= 2;
    assert.equal(applyModule.resolveDesignSynthesisDeviceFaultValidation(savedDevice, saved, changedEvidence), null, 'Changed rating evidence cannot be applied to historical fault currents');
    assert.ok(values.get('CTR_SAVED_PROJECTS_V1').includes(saved.modelInputFingerprint));
    assert.ok(peakBytes <= budget);
    context.diagnostic(`Mixed-voltage named and canonical storage: ${bytes(values)} bytes; peak ${peakBytes} of ${budget}`);
    project.undoProjectChange();
    assert.equal(store.getItem(applyModule.FAULT_STUDY_VALIDATION_KEY, null), null);
    assert.equal(store.getItem(applyModule.DEVICE_FAULT_VALIDATION_KEY, null), null);
    project.redoProjectChange();
    assert.deepEqual(store.getItem(applyModule.FAULT_STUDY_VALIDATION_KEY, null), saved);
    assert.deepEqual(store.getItem(applyModule.DEVICE_FAULT_VALIDATION_KEY, null), savedDevice);
  } finally { delete globalThis.window; }
});
