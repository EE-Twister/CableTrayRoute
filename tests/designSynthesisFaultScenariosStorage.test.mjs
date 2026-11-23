import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const values = new Map();
const budget = 5 * 1024 * 1024;
const bytes = entries => [...entries].reduce((sum, [key, value]) => sum + 2 * (key.length + value.length), 0);
let peakBytes = 0;
let rejectNamedSave = false;
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem(key, value) {
    const next = new Map(values).set(key, String(value));
    const attempted = bytes(next);
    peakBytes = Math.max(peakBytes, attempted);
    if (attempted > budget || (rejectNamedSave && key === 'CTR_SAVED_PROJECTS_V1')) { const error = new Error(`Fault-scenario budget exceeded: ${attempted}`); error.name = 'QuotaExceededError'; throw error; }
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
const { fingerprintStudyValue } = await import('../analysis/studyLifecycle.mjs');

test('15-bit Unicode packing round-trips every byte, odd lengths, and long streams exactly', () => {
  const source = Uint8Array.from({ length: 256 }, (_, index) => index);
  for (let length = 0; length <= source.length; length += 1) {
    const bytes = source.subarray(0, length);
    const encoded = applyModule.encodeDesignSynthesisFaultScenarioBytes(bytes);
    assert.deepEqual(applyModule.decodeDesignSynthesisFaultScenarioBytes(encoded, length), bytes);
  }
  const long = new Uint8Array(70_003);
  for (let index = 0; index < long.length; index += 1) long[index] = (index * 197 + (index >>> 7)) & 0xff;
  const encoded = applyModule.encodeDesignSynthesisFaultScenarioBytes(long);
  assert.deepEqual(applyModule.decodeDesignSynthesisFaultScenarioBytes(encoded, long.length), long);
  assert.equal(applyModule.decodeDesignSynthesisFaultScenarioBytes(encoded.slice(0, -1), long.length), null);
  assert.equal(applyModule.decodeDesignSynthesisFaultScenarioBytes(`${encoded.slice(0, -1)}\u80ff`, long.length), null);
  assert.equal(applyModule.decodeDesignSynthesisFaultScenarioBytes('\u00ff', 1), null);
  const padded = applyModule.encodeDesignSynthesisFaultScenarioBytes(Uint8Array.of(0xff));
  assert.equal(applyModule.decodeDesignSynthesisFaultScenarioBytes(`${padded.slice(0, -1)}\u0200`, 1), null, 'Nonzero padding bits must be rejected');
});

function inputFixture(count = 50) {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const rows = input.equipment;
  input.equipment = Array.from({ length: count }, (_, index) => ({ ...rows[index % rows.length], id: `MV-${index + 1}`, tag: `MV-${index + 1}`, voltage: count <= 25 ? 480 : index < 40 ? 208 : 480, kw: count <= 25 ? 3 : index < 40 ? 1 : 3, powerFactor: 0.9, phases: 3 }));
  const study = {
    networkBaseMVA: 1,
    sourceInventory: { status: 'complete', reference: 'Synthetic mixed-voltage scenario storage fixture' },
    sources: [{ equipmentId: input.supply.id, emfPhaseV: { re: 480 / Math.sqrt(3), im: 0 }, impedance: { rOhm: 0.006, xOhm: 0.015 }, inService: true, reference: 'Synthetic utility equivalent only' }],
    transformerPhase: { degrees: 0, reference: 'Explicit synthetic zero-angle assumption' },
  };
  input.faultScenarios = [
    { id: 'base', reference: 'Synthetic base equivalent', study },
    { id: 'alternate', reference: 'Synthetic alternate equivalent', study: { ...structuredClone(study), sources: [{ ...study.sources[0], impedance: { rOhm: 0.007, xOhm: 0.016 } }] } },
  ];
  return input;
}

test('25-to-50 mixed-voltage growth persists exact two-scenario evidence within 5 MiB and rolls back failed named save', async () => {
  store.setProjectMeta({ name: 'Fault scenario storage acceptance' });
  globalThis.window = { currentProjectId: 'Fault scenario storage acceptance', dispatchEvent() {} };
  try {
    const smaller = generateDesignProposal(inputFixture(25));
    assert.equal(smaller.faultScenarioValidation.status, 'evaluated', JSON.stringify(smaller.faultScenarioValidation.issues));
    const smallerPreview = applyModule.previewDesignProposal(smaller);
    const smallerResult = applyModule.applyDesignProposal(smaller, { previewContext: smallerPreview.context });
    assert.equal(smallerResult.applied, true, JSON.stringify(smallerResult.errors));
    const smallerSaved = structuredClone(store.getItem(applyModule.FAULT_SCENARIO_VALIDATION_KEY, null));
    assert.equal(smallerSaved.scenarioCount, 2);

    const input = inputFixture();
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.faultScenarioValidation?.status, 'evaluated', JSON.stringify(proposal.issues));
    const preview = applyModule.previewDesignProposal(proposal);
    const result = applyModule.applyDesignProposal(proposal, { previewContext: preview.context });
    assert.equal(result.applied, true, JSON.stringify({ errors: result.errors, peakBytes }));
    const saved = structuredClone(store.getItem(applyModule.FAULT_SCENARIO_VALIDATION_KEY, null));
    assert.equal(saved.encoding, 'fault-scenarios-json-lz77-utf15-v1');
    assert.ok([...saved.payloadBinaryString].every(character => character.charCodeAt(0) >= 0x100 && character.charCodeAt(0) <= 0x80ff));
    assert.equal(saved.scenarioCount, 2);
    assert.equal(saved.coverage.verifiedAsExtrema, false);
    assert.equal(store.getItem(applyModule.FAULT_STUDY_VALIDATION_KEY, null), null);
    assert.ok(bytes(values) <= budget);
    const expanded = applyModule.resolveDesignSynthesisFaultScenarioValidation(saved, proposal.faultScenarios);
    assert.ok(expanded);
    assert.deepEqual(expanded.busEnvelopes, proposal.faultScenarioValidation.busEnvelopes);
    assert.deepEqual(expanded.deviceEnvelopes, proposal.faultScenarioValidation.deviceEnvelopes);
    for (const row of expanded.scenarios) {
      const original = proposal.faultScenarioValidation.scenarios.find(item => item.id === row.id);
      assert.deepEqual(row.study, proposal.faultScenarios.find(item => item.id === row.id).study);
      assert.equal(row.faultStudyValidation.modelInputFingerprint, original.faultStudyValidation.modelInputFingerprint);
      assert.equal(row.faultStudyValidation.cases.length, original.faultStudyValidation.cases.length);
      for (const item of row.faultStudyValidation.cases) {
        const expected = original.faultStudyValidation.cases.find(candidate => candidate.busId === item.busId);
        assert.deepEqual(item.sourceTerminalCurrents.map(value => [value.sourceId, value.currentKA.magnitude]), expected.sourceTerminalCurrents.map(value => [value.sourceId, value.currentKA.magnitude]));
        const expectedBranches = [...expected.branchTerminalCurrents, ...expected.zeroImpedanceTieCurrents];
        assert.deepEqual(item.branchTerminalCurrents.map(value => [value.branchId, value.fromCurrentIntoBranchKA.magnitude, value.toCurrentIntoBranchKA.magnitude]).sort((a, b) => a[0].localeCompare(b[0])), expectedBranches.map(value => [value.branchId, value.fromCurrentIntoBranchKA.magnitude, value.toCurrentIntoBranchKA.magnitude]).sort((a, b) => a[0].localeCompare(b[0])));
      }
      assert.equal(row.deviceFaultValidation.placements.length, original.deviceFaultValidation.placements.length);
      for (const placement of row.deviceFaultValidation.placements) {
        const expected = original.deviceFaultValidation.placements.find(item => item.id === placement.id);
        assert.ok(expected, `Device placement ${placement.id} must survive scenario persistence`);
        assert.equal(placement.cases.length, expected.cases.length);
        for (const item of placement.cases) {
          const expectedCase = expected.cases.find(candidate => candidate.id === item.id);
          assert.ok(expectedCase, `Device case ${item.id} must survive scenario persistence`);
          assert.equal(item.throughDeviceCurrentRmsKA, expectedCase.throughDeviceCurrentRmsKA);
        }
        assert.equal(placement.comparisons.lineTerminalAvailableInitialRms.valueKA, expected.comparisons.lineTerminalAvailableInitialRms.valueKA);
        assert.equal(placement.comparisons.maximumThroughDeviceInitialRms.valueKA, expected.comparisons.maximumThroughDeviceInitialRms.valueKA);
        assert.equal(placement.comparisons.protectionAdequacy, 'unevaluated');
      }
    }
    const changed = structuredClone(proposal.faultScenarios);
    changed[0].reference = 'incorrect';
    assert.equal(applyModule.resolveDesignSynthesisFaultScenarioValidation(saved, changed), null);
    assert.equal(applyModule.resolveDesignSynthesisFaultScenarioValidation({ ...saved, modelInputFingerprint: 'wrong' }), null);
    assert.equal(applyModule.resolveDesignSynthesisFaultScenarioValidation({ ...saved, payloadBinaryString: `${saved.payloadBinaryString}\u0000` }), null);
    const badPadding = { ...saved, payloadBinaryString: `${saved.payloadBinaryString.slice(0, -1)}\u80ff` };
    assert.equal(applyModule.resolveDesignSynthesisFaultScenarioValidation(badPadding), null);
    const packedJson = applyModule.decompressFaultBytes(
      applyModule.decodeDesignSynthesisFaultScenarioBytes(saved.payloadBinaryString, saved.lzByteLength), saved.uncompressedByteLength,
    );
    const changedPayload = JSON.parse(new TextDecoder().decode(packedJson));
    changedPayload.issues.push({ code: 'corrupted-valid-json' });
    const changedPayloadBytes = new TextEncoder().encode(JSON.stringify(changedPayload));
    const changedLz = applyModule.compressFaultBytes(changedPayloadBytes);
    const changedPacked = { ...saved, uncompressedByteLength: changedPayloadBytes.length, lzByteLength: changedLz.length, payloadBinaryString: applyModule.encodeDesignSynthesisFaultScenarioBytes(changedLz) };
    assert.equal(applyModule.resolveDesignSynthesisFaultScenarioValidation(changedPacked, proposal.faultScenarios), null, 'Valid JSON changes fail the outer payload fingerprint');
    changedPayload.scenarios[0].faultStudyValidation.modelInputFingerprint = 'wrong-network-fingerprint';
    const mismatchedPayloadBytes = new TextEncoder().encode(JSON.stringify(changedPayload));
    const mismatchedLz = applyModule.compressFaultBytes(mismatchedPayloadBytes);
    const mismatchedPacked = {
      ...saved,
      uncompressedByteLength: mismatchedPayloadBytes.length,
      lzByteLength: mismatchedLz.length,
      payloadBinaryString: applyModule.encodeDesignSynthesisFaultScenarioBytes(mismatchedLz),
      payloadFingerprint: fingerprintStudyValue(changedPayload),
    };
    assert.equal(applyModule.resolveDesignSynthesisFaultScenarioValidation(mismatchedPacked, proposal.faultScenarios), null, 'Scenario fingerprints are cross-checked inside valid packed JSON');
    project.undoProjectChange();
    assert.ok(JSON.stringify(store.getItem(applyModule.FAULT_SCENARIO_VALIDATION_KEY, null)) === JSON.stringify(smallerSaved), 'Undo restores the prior 25-load scenario summary byte for byte');
    project.redoProjectChange();
    assert.ok(JSON.stringify(store.getItem(applyModule.FAULT_SCENARIO_VALIDATION_KEY, null)) === JSON.stringify(saved), 'Redo restores the 50-load scenario summary byte for byte');
    assert.equal(store.loadProject('Fault scenario storage acceptance'), true, 'Named project reload restores the packed scenario summary');
    assert.ok(JSON.stringify(store.getItem(applyModule.FAULT_SCENARIO_VALIDATION_KEY, null)) === JSON.stringify(saved), 'Named project reload preserves the packed summary byte for byte');

    const omittedInput = structuredClone(input);
    delete omittedInput.faultScenarios;
    const omitted = generateDesignProposal(omittedInput);
    const omittedPreview = applyModule.previewDesignProposal(omitted);
    assert.equal(applyModule.applyDesignProposal(omitted, { previewContext: omittedPreview.context }).applied, true);
    assert.equal(store.getItem(applyModule.FAULT_SCENARIO_VALIDATION_KEY, null), null);
    project.undoProjectChange();
    assert.ok(JSON.stringify(store.getItem(applyModule.FAULT_SCENARIO_VALIDATION_KEY, null)) === JSON.stringify(saved), 'Undo after omission restores the scenario summary byte for byte');

    const changedInput = structuredClone(input);
    changedInput.faultScenarios[0].study.sources[0].impedance.xOhm += 0.001;
    const changedProposal = generateDesignProposal(changedInput);
    const changedPreview = applyModule.previewDesignProposal(changedProposal);
    rejectNamedSave = true;
    const failed = applyModule.applyDesignProposal(changedProposal, { previewContext: changedPreview.context });
    rejectNamedSave = false;
    assert.equal(failed.applied, false);
    assert.ok(JSON.stringify(store.getItem(applyModule.FAULT_SCENARIO_VALIDATION_KEY, null)) === JSON.stringify(saved), 'A failed named save restores the previous scenario record byte for byte');
    console.log(`ℹ Fault-scenario canonical and named storage: ${bytes(values)} bytes; peak ${peakBytes} of ${budget}`);
  } finally { rejectNamedSave = false; delete globalThis.window; }
});
