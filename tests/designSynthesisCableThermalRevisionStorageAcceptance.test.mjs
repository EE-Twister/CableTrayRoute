import assert from 'node:assert/strict';
import test from 'node:test';
import { cableThermalRevisionFixture, independentCableThermalRows } from './helpers/cableThermalRevisionFixture.mjs';
import { fingerprintStudyValue } from '../analysis/studyLifecycle.mjs';
import { compressFaultBytes, decompressFaultBytes, encodeDesignSynthesisFaultScenarioBytes, decodeDesignSynthesisFaultScenarioBytes } from '../src/design-synthesis/faultEvidenceCodec.mjs';

const values = new Map();
const quota = 5 * 1024 * 1024;
let peak = 0;
let rejectNamed = false;
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem(key, value) {
    const next = new Map(values).set(key, String(value));
    const bytes = [...next].reduce((sum, [name, text]) => sum + 2 * (name.length + text.length), 0);
    peak = Math.max(peak, bytes);
    if (bytes > quota || (rejectNamed && key === 'CTR_SAVED_PROJECTS_V1')) { const error = new Error(`Thermal revision storage rejected ${bytes} bytes`); error.name = 'QuotaExceededError'; throw error; }
    values.set(key, String(value));
  },
  removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};
const project = await import('../projectStorage.js');
await project.initializeProjectStorage();
const store = await import('../dataStore.mjs');
const { generateDesignProposal } = await import('../analysis/designSynthesis.mjs');
const apply = await import('../src/design-synthesis/applyProposal.mjs');
const emptySession = project.captureProjectTransactionSnapshot();
const saved = () => store.getItem(apply.FAULT_EVOLUTION_VALIDATION_KEY, null);
const resolveValue = value => apply.resolveDesignSynthesisFaultEvolutionValidation(value, apply.getDesignSynthesisFaultEvolutionContext(), {
  canonicalCables: store.getCables(), cableCatalogSource: store.getItem('designSynthesisCableCatalogSource', null), faultStudyValidation: store.getItem(apply.FAULT_STUDY_VALIDATION_KEY, null),
});
const resolve = () => resolveValue(saved());
const commit = proposal => apply.applyDesignProposal(proposal, { previewContext: apply.previewDesignProposal(proposal).context });

function legacyThermalWire(record) {
  const compressed = decodeDesignSynthesisFaultScenarioBytes(record.payloadBinaryString, record.lzByteLength);
  const bytes = decompressFaultBytes(compressed, record.uncompressedByteLength);
  const decoded = JSON.parse(new TextDecoder().decode(bytes), (_key, entry) => entry && typeof entry === 'object' && Object.keys(entry).length === 1 && entry.$faultEvolutionNegativeZero === true ? -0 : entry);
  // Exact optional-field set used by the verified pre-revision payload contract.
  const fields = ['encoding', 'context', 'faultStudy', 'faultEvolution', 'faultEvolutionValidation', 'cableFaultWithstand', 'cableFaultWithstandValidation', 'cableFaultWithstandBindings'];
  const payload = Object.fromEntries(fields.map(key => [key, decoded[key]]));
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload, (_key, entry) => Object.is(entry, -0) ? { $faultEvolutionNegativeZero: true } : entry));
  const packed = compressFaultBytes(jsonBytes);
  return { ...record, uncompressedByteLength: jsonBytes.length, lzByteLength: packed.length, payloadBinaryString: encodeDesignSynthesisFaultScenarioBytes(packed), payloadFingerprint: fingerprintStudyValue(payload) };
}

for (const [count, selected] of [[25, true], [50, false]]) {
  test(`${count}-load resized final model and complete trial trace survive atomic Apply, undo/redo and named reload within 5 MiB`, context => {
    values.clear(); peak = 0; rejectNamed = false;
    globalThis.window = { currentProjectId: `Thermal resized ${count}`, dispatchEvent() {} };
    project.restoreProjectTransactionSnapshot(emptySession);
    project.setProjectState(project.defaultProject(), { captureUndo: false });
    store.setProjectMeta({ name: window.currentProjectId });
    try {
      const input = cableThermalRevisionFixture({ count, selected, maxRevisions: 3, r: 0.004, x: 0.012 });
      input.supply.availableFaultCurrentKA = 25;
      input.criteria.loadFlow.minimumVoltagePu = 0.99;
      input.faultEvolution.profiles[0].points = [{ timeS: 0, emfMultiplier: 1 }, { timeS: 0.03, emfMultiplier: 0.4 }, { timeS: 0.1, emfMultiplier: 0 }];
      store.setItem('designSynthesisDraft', input);
      const proposal = generateDesignProposal(input);
      assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
      assert.equal(proposal.cableFaultWithstandRevision.status, 'complete');
      assert.deepEqual(proposal.cableFaultWithstandRevision.finalBinding.designCriteria, input.criteria);
      assert.ok(proposal.cableFaultWithstandRevision.revisionBudget.used >= 1);
      const persistentBefore = new Map(values);
      const badBudget = structuredClone(proposal);
      badBudget.cableFaultWithstandRevision.revisionBudget.maximum = 64;
      badBudget.cableFaultWithstandRevision.revisionBudget.remaining = 64 - badBudget.cableFaultWithstandRevision.revisionBudget.used;
      assert.ok(apply.previewDesignProposal(badBudget).errors.some(row => row.code === 'cable_fault_revision_trace_inconsistent'));
      assert.equal(commit(badBudget).applied, false, 'A trace cannot replace the actual three-revision criterion');
      assert.deepEqual(values, persistentBefore);
      const wrongCriterion = structuredClone(proposal);
      wrongCriterion.cableFaultWithstandRevision.finalBinding.designCriteria.loadFlow.minimumVoltagePu = 0.9;
      assert.ok(apply.previewDesignProposal(wrongCriterion).errors.some(row => row.code === 'cable_fault_revision_trace_inconsistent'));
      assert.equal(commit(wrongCriterion).applied, false, 'The saved criterion basis cannot silently loosen a supplied voltage constraint');
      assert.deepEqual(values, persistentBefore);
      const badDelta = structuredClone(proposal);
      badDelta.cableFaultWithstandRevision.history[1].conductorChanges[0].toSize = '#8 AWG';
      assert.ok(apply.previewDesignProposal(badDelta).errors.some(row => row.code === 'cable_fault_revision_trace_inconsistent'));
      assert.equal(commit(badDelta).applied, false, 'Nonshrinking sourced deltas must agree with the final trial model');
      assert.deepEqual(values, persistentBefore);
      const applied = commit(proposal);
      assert.equal(applied.applied, true, JSON.stringify(applied.errors));
      const decoded = resolve();
      assert.ok(decoded);
      assert.deepEqual(decoded.cableFaultWithstandRevision, proposal.cableFaultWithstandRevision);
      assert.deepEqual(decoded.cableFaultWithstandRevision.finalBinding.designCriteria, input.criteria);
      assert.deepEqual(decoded.cableFaultWithstandValidation, proposal.cableFaultWithstandValidation);
      if (selected) {
        const legacy = resolveValue(legacyThermalWire(saved()));
        assert.ok(legacy, 'Previously saved thermal evidence without trial metadata must remain readable');
        assert.equal(legacy.cableFaultWithstandRevision, undefined);
        assert.deepEqual(legacy.cableFaultWithstandValidation, decoded.cableFaultWithstandValidation);
      }
      const integral = 0.03 * (1 + 0.4 + 0.4 ** 2) / 3 + 0.07 * 0.4 ** 2 / 3;
      for (const row of independentCableThermalRows(proposal, input, integral)) assert.ok(Math.abs(row.currentSquaredExposureA2S - row.expectedExposure) <= 2e-9 * Math.max(1, row.expectedExposure));
      project.undoProjectChange();
      assert.equal(saved(), null);
      project.redoProjectChange();
      assert.deepEqual(resolve(), decoded);
      assert.equal(store.loadProject(window.currentProjectId), true);
      assert.deepEqual(resolve(), decoded);
      const beforeRetry = new Map(values);
      rejectNamed = true;
      assert.equal(commit(generateDesignProposal(input)).applied, false);
      assert.deepEqual(values, beforeRetry, 'Rejected named save must restore exact prior bytes and trace');
      rejectNamed = false;
      assert.equal(commit(generateDesignProposal(input)).applied, true);
      assert.deepEqual(resolve(), decoded);
      const cables = structuredClone(store.getCables());
      const edited = structuredClone(cables); edited[0].lengthFt += 1;
      store.setCables(edited);
      assert.equal(resolve(), null);
      store.setCables(cables);
      assert.deepEqual(resolve(), decoded);
      assert.ok(peak <= quota, `${peak}/${quota}`);
      context.diagnostic(`Thermal trial storage peak ${peak}/${quota} bytes`);
    } finally { delete globalThis.window; }
  });
}
