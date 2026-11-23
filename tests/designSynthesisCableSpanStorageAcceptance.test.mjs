import assert from 'node:assert/strict';
import test from 'node:test';
import { cableThermalRevisionFixture } from './helpers/cableThermalRevisionFixture.mjs';
import { fingerprintStudyValue } from '../analysis/studyLifecycle.mjs';
import { compressFaultBytes, decompressFaultBytes, encodeDesignSynthesisFaultScenarioBytes, decodeDesignSynthesisFaultScenarioBytes } from '../src/design-synthesis/faultEvidenceCodec.mjs';

const values = new Map(), quota = 5 * 1024 * 1024;
let peak = 0, rejectNamed = false;
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem(key, value) {
    const next = new Map(values).set(key, String(value));
    const bytes = [...next].reduce((sum, [name, text]) => sum + 2 * (name.length + text.length), 0);
    peak = Math.max(peak, bytes);
    if (bytes > quota || (rejectNamed && key === 'CTR_SAVED_PROJECTS_V1')) { const error = new Error(`Continuous span evidence rejected ${bytes} bytes`); error.name = 'QuotaExceededError'; throw error; }
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
const commit = proposal => apply.applyDesignProposal(proposal, { previewContext: apply.previewDesignProposal(proposal).context });
function rewritePayload(record, change) {
  const compressed = decodeDesignSynthesisFaultScenarioBytes(record.payloadBinaryString, record.lzByteLength);
  const bytes = decompressFaultBytes(compressed, record.uncompressedByteLength);
  const payload = JSON.parse(new TextDecoder().decode(bytes), (_key, entry) => entry && typeof entry === 'object' && Object.keys(entry).length === 1 && entry.$faultEvolutionNegativeZero === true ? -0 : entry);
  change(payload);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload, (_key, entry) => Object.is(entry, -0) ? { $faultEvolutionNegativeZero: true } : entry));
  const packed = compressFaultBytes(jsonBytes);
  return { ...record, uncompressedByteLength: jsonBytes.length, lzByteLength: packed.length, payloadBinaryString: encodeDesignSynthesisFaultScenarioBytes(packed), payloadFingerprint: fingerprintStudyValue(payload) };
}

for (const [count, selected] of [[25, true], [50, false]]) {
  test(`${count}-load continuous-span evidence survives atomic Apply and named reload inside 5 MiB`, context => {
    values.clear(); peak = 0; rejectNamed = false;
    globalThis.window = { currentProjectId: `Continuous span ${count}`, dispatchEvent() {} };
    project.restoreProjectTransactionSnapshot(emptySession);
    project.setProjectState(project.defaultProject(), { captureUndo: false });
    store.setProjectMeta({ name: window.currentProjectId });
    try {
      const input = cableThermalRevisionFixture({ count, selected, maxRevisions: 3, r: 0.004, x: 0.012 });
      input.supply.availableFaultCurrentKA = 25;
      input.criteria.loadFlow.minimumVoltagePu = 0.99;
      input.cableFaultWithstand.faultSelection.mode = 'all-generated-bus-and-cable-span-faults';
      input.faultEvolution.profiles[0].points = [{ timeS: 0, emfMultiplier: 1 }, { timeS: 0.03, emfMultiplier: 0.4 }, { timeS: 0.1, emfMultiplier: 0 }];
      store.setItem('designSynthesisDraft', input);
      const proposal = generateDesignProposal(input);
      assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
      assert.equal(proposal.cableFaultWithstandRevision.status, 'complete');
      const firstApply = commit(proposal);
      assert.equal(firstApply.applied, true, JSON.stringify(firstApply.errors));
      const decoded = resolveValue(saved());
      assert.ok(decoded, 'Fresh full-network reconstruction and result recomputation must match');
      assert.deepEqual(decoded.cableFaultWithstandValidation, proposal.cableFaultWithstandValidation);
      assert.deepEqual(decoded.cableFaultWithstandRevision, proposal.cableFaultWithstandRevision);
      assert.equal(decoded.cableFaultWithstandValidation.spanValidation.coverage.evaluatedPairCount, proposal.cables.length * (selected ? 1 : proposal.cables.length));
      const alteredContext = rewritePayload(saved(), payload => { payload.cableSpanProposalContext.value.oneLine.sheets[0].connections[0].cable.lengthFt += 1; });
      assert.equal(resolveValue(alteredContext), null, 'Repacked context cannot change the network bound to the current initial-study fingerprint');
      const alteredCount = rewritePayload(saved(), payload => { payload.cableFaultWithstandValidation.spanValidation.coverage.evaluatedPairCount -= 1; });
      assert.equal(resolveValue(alteredCount), null, 'Partial pair coverage cannot survive exact fresh-result comparison');
      project.undoProjectChange(); assert.equal(saved(), null);
      project.redoProjectChange(); assert.deepEqual(resolveValue(saved()), decoded);
      assert.equal(store.loadProject(window.currentProjectId), true);
      assert.deepEqual(resolveValue(saved()), decoded);
      const beforeFailure = new Map(values);
      rejectNamed = true;
      assert.equal(commit(proposal).applied, false);
      assert.deepEqual(values, beforeFailure, 'A rejected durable write must restore exact prior bytes');
      rejectNamed = false;
      assert.equal(commit(proposal).applied, true);
      const cables = structuredClone(store.getCables());
      const edited = structuredClone(cables); edited[0].lengthFt += 1;
      store.setCables(edited); assert.equal(resolveValue(saved()), null);
      store.setCables(cables); assert.deepEqual(resolveValue(saved()), decoded);
      assert.ok(peak <= quota, `${peak}/${quota}`);
      context.diagnostic(`Continuous span storage peak ${peak}/${quota} bytes`);
    } finally { delete globalThis.window; }
  });
}
