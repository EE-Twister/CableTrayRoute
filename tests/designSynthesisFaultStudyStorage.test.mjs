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
const { applyDesignProposal, previewDesignProposal, FAULT_STUDY_VALIDATION_KEY, resolveDesignSynthesisFaultBranchCurrents, resolveDesignSynthesisFaultSourceTerminalCurrents, compressFaultBytes, decompressFaultBytes, decodeDesignSynthesisFaultScenarioBytes, encodeDesignSynthesisFaultScenarioBytes } = await import('../src/design-synthesis/applyProposal.mjs');

test('valid fault-study evidence persists compactly in one undoable Apply mutation', () => {
  const caseResult = {
    busId: 'BUS-1', status: 'evaluated', fault: { busId: 'BUS-1', totalFaultCurrentKA: { re: 1, im: 2, magnitude: Math.sqrt(5) } },
    sourceFaultContributions: [{ sourceId: 'UTILITY', currentKA: { re: 1, im: 0, magnitude: 1 } }],
    sourceTerminalCurrents: [{ sourceId: 'UTILITY', currentKA: { re: 2, im: 0, magnitude: 2 } }],
    branchTerminalCurrents: [{ branchId: 'BR-1', fromCurrentIntoBranchKA: { magnitude: 1 }, toCurrentIntoBranchKA: { magnitude: 1 } }],
    busVoltages: Array.from({ length: 100 }, (_, index) => ({ busId: `BUS-${index}`, voltagePhasePu: { re: 1, im: 0 } })), issues: [],
  };
  const proposal = {
    schemaVersion: '1.0.0', status: 'proposal', inputSignature: 'fault-study-storage-test', inputs: {},
    equipment: [{ id: 'generated-eq', tag: 'GENERATED-EQ' }], loads: [], panels: [], cables: [], trays: [], conduits: [],
    faultStudy: { networkBaseMVA: 1, sourceInventory: { status: 'complete', reference: 'Inventory document' }, sources: [{ equipmentId: 'UTILITY', reference: 'Utility model reference' }] },
    faultStudyValidation: { status: 'evaluated', method: 'method-v1', scope: 'initial-symmetrical-rms-only', modelInputFingerprint: 'fingerprint-1', sourceInventory: { status: 'complete', verificationStatus: 'not-verified' }, coverage: { status: 'complete', modeledSourceCount: 1 }, cases: [caseResult], issues: [], limitations: ['Initial symmetrical RMS only'] },
  };
  const preview = previewDesignProposal(proposal);
  const result = applyDesignProposal(proposal, { previewContext: preview.context });
  assert.equal(result.applied, true, JSON.stringify(result.errors || result.conflicts));
  const saved = store.getItem(FAULT_STUDY_VALIDATION_KEY, null);
  assert.equal(saved.modelInputFingerprint, 'fingerprint-1');
  assert.equal(saved.branchDutyEncoding, 'uint16-index-lz77-float64-le-utf15-v1');
  assert.equal(saved.sourceTerminalEncoding, 'float64-le-utf15-v1');
  assert.equal(saved.input.sources[0].reference, 'Utility model reference');
  assert.deepEqual(saved.branchIds, ['BR-1']);
  assert.deepEqual(resolveDesignSynthesisFaultBranchCurrents(saved, saved.cases[0]), [{ branchId: 'BR-1', fromCurrentKA: 1, toCurrentKA: 1 }]);
  assert.deepEqual(resolveDesignSynthesisFaultSourceTerminalCurrents(saved, saved.cases[0]), [{ sourceId: 'UTILITY', currentKA: 2 }]);
  assert.equal(resolveDesignSynthesisFaultBranchCurrents({ ...saved, branchDutyCodesUtf15: `${saved.branchDutyCodesUtf15}x` }, saved.cases[0]), null, 'Invalid UTF15 length is rejected.');
  assert.equal(resolveDesignSynthesisFaultBranchCurrents({ ...saved, branchDutyCodeByteCount: saved.branchDutyCodeByteCount + 1 }, saved.cases[0]), null, 'Code byte count must match the packed stream.');
  assert.equal(resolveDesignSynthesisFaultBranchCurrents({ ...saved, branchDutyValueDictionaryCount: saved.branchDutyValueDictionaryCount + 1 }, saved.cases[0]), null, 'Dictionary count must match the packed stream.');
  assert.equal(resolveDesignSynthesisFaultSourceTerminalCurrents({ ...saved, sourceTerminalCurrentsUtf15: `${saved.sourceTerminalCurrentsUtf15}x` }, saved.cases[0]), null, 'Invalid source-current UTF15 length is rejected.');
  const dictionaryBytes = decodeDesignSynthesisFaultScenarioBytes(saved.branchDutyValueDictionaryUtf15, saved.branchDutyValueDictionaryCount * 8);
  const negativeDictionaryBytes = dictionaryBytes.slice();
  new DataView(negativeDictionaryBytes.buffer).setFloat64(0, -1, true);
  const negativeDictionary = encodeDesignSynthesisFaultScenarioBytes(negativeDictionaryBytes);
  assert.equal(resolveDesignSynthesisFaultBranchCurrents({ ...saved, branchDutyValueDictionaryUtf15: negativeDictionary }, saved.cases[0]), null);
  const legacy = {
    ...saved,
    branchDutyEncoding: 'uint16-index-lz77-float64-le-base64-v1',
    branchDutyValueDictionaryBase64: Buffer.from(dictionaryBytes).toString('base64'),
    branchDutyCodesBase64: Buffer.from(decodeDesignSynthesisFaultScenarioBytes(saved.branchDutyCodesUtf15, saved.branchDutyCodeByteCount)).toString('base64'),
    sourceTerminalEncoding: 'float64-le-base64-v1',
    sourceTerminalCurrentsBase64: Buffer.from(decodeDesignSynthesisFaultScenarioBytes(saved.sourceTerminalCurrentsUtf15, saved.sourceTerminalValueCount * 8)).toString('base64'),
  };
  delete legacy.branchDutyValueDictionaryUtf15; delete legacy.branchDutyValueDictionaryCount;
  delete legacy.branchDutyCodesUtf15; delete legacy.branchDutyCodeByteCount;
  delete legacy.sourceTerminalCurrentsUtf15;
  assert.deepEqual(resolveDesignSynthesisFaultBranchCurrents(legacy, legacy.cases[0]), [{ branchId: 'BR-1', fromCurrentKA: 1, toCurrentKA: 1 }]);
  assert.deepEqual(resolveDesignSynthesisFaultSourceTerminalCurrents(legacy, legacy.cases[0]), [{ sourceId: 'UTILITY', currentKA: 2 }]);
  assert.equal('busVoltages' in saved.cases[0], false, 'Persisted study excludes repeated complete solved network outputs.');
  assert.equal(project.canUndo(), true);
  project.undoProjectChange();
  assert.equal(store.getItem(FAULT_STUDY_VALIDATION_KEY, null), null);
  project.redoProjectChange();
  assert.equal(store.getItem(FAULT_STUDY_VALIDATION_KEY, null).modelInputFingerprint, 'fingerprint-1');
});

test('UTF15 resolver preserves 32-bit indexes and missing-current sentinels', () => {
  const dictionaryBytes = new Uint8Array(16);
  const dictionaryView = new DataView(dictionaryBytes.buffer);
  dictionaryView.setFloat64(0, 0.125, true);
  dictionaryView.setFloat64(8, 0.25, true);
  const codeBytes = new Uint8Array(16);
  const codeView = new DataView(codeBytes.buffer);
  [0, 0xffffffff, 1, 0].forEach((value, index) => codeView.setUint32(index * 4, value, true));
  const packed = compressFaultBytes(codeBytes);
  const encoded = {
    branchDutyEncoding: 'uint32-index-lz77-float64-le-utf15-v1',
    branchIds: ['BR-1', 'BR-2'],
    cases: [{ busId: 'BUS-1' }],
    branchDutyValueCount: 4,
    branchDutyValueDictionaryCount: 2,
    branchDutyValueDictionaryUtf15: encodeDesignSynthesisFaultScenarioBytes(dictionaryBytes),
    branchDutyCodeByteCount: packed.length,
    branchDutyCodesUtf15: encodeDesignSynthesisFaultScenarioBytes(packed),
  };
  assert.deepEqual(resolveDesignSynthesisFaultBranchCurrents(encoded, encoded.cases[0]), [
    { branchId: 'BR-1', fromCurrentKA: 0.125, toCurrentKA: null },
    { branchId: 'BR-2', fromCurrentKA: 0.25, toCurrentKA: 0.125 },
  ]);
});

test('fault branch byte codec round-trips streams beyond the 16-bit distance window', () => {
  let seed = 0x12345678;
  const prefix = new Uint8Array(70_000);
  for (let index = 0; index < prefix.length; index += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    prefix[index] = seed >>> 24;
  }
  const bytes = new Uint8Array(prefix.length + 256);
  bytes.set(prefix);
  bytes.set(prefix.subarray(0, 256), prefix.length);
  const compressed = compressFaultBytes(bytes);
  assert.ok(compressed.length > 65_535, 'Fixture crosses the codec distance window');
  assert.deepEqual(decompressFaultBytes(compressed, bytes.length), bytes);
});
