import assert from 'node:assert/strict';
import test from 'node:test';
import { faultEvolutionFixture, add, divide, cableOhms, squaredMagnitude } from './helpers/faultEvolutionFixture.mjs';
import { evaluateDesignSynthesisCableFaultWithstand } from '../analysis/designSynthesisCableFaultWithstand.mjs';

const values = new Map();
const limit = 5 * 1024 * 1024;
let peak = 0;
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem(key, value) {
    const next = new Map(values).set(key, String(value));
    const bytes = [...next].reduce((sum, [name, text]) => sum + 2 * (name.length + text.length), 0);
    peak = Math.max(peak, bytes);
    if (bytes > limit) { const error = new Error(`Quota exceeded: ${bytes}`); error.name = 'QuotaExceededError'; throw error; }
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
const clone = value => structuredClone(value);
const sourceKey = 'designSynthesisCableCatalogSource';
const saved = () => store.getItem(apply.FAULT_EVOLUTION_VALIDATION_KEY, null);
const resolve = () => apply.resolveDesignSynthesisFaultEvolutionValidation(saved(), apply.getDesignSynthesisFaultEvolutionContext(), {
  canonicalCables: store.getCables(), cableCatalogSource: store.getItem(sourceKey, null), faultStudyValidation: store.getItem(apply.FAULT_STUDY_VALIDATION_KEY, null),
});
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 2e-9 * Math.max(1, Math.abs(expected)), `${actual} versus ${expected}`);

for (const [count, mode] of [[25, 'all-modeled'], [25, 'selected'], [50, 'all-modeled']]) {
  test(`${count} loads / ${mode}: exact cable exposure survives named reload and undo/redo within the unchanged quota`, context => {
    values.clear(); peak = 0;
    globalThis.window = { currentProjectId: `Thermal acceptance ${count} ${mode}`, dispatchEvent() {} };
    project.restoreProjectTransactionSnapshot(emptySession);
    project.setProjectState(project.defaultProject(), { captureUndo: false });
    store.setProjectMeta({ name: window.currentProjectId });
    try {
      const input = faultEvolutionFixture(count, false);
      input.faultStudy.sources[0].impedance = { rOhm: 1, xOhm: 3 };
      input.faultEvolution.profiles[0].points = [{ timeS: 0, emfMultiplier: 1 }, { timeS: 0.03, emfMultiplier: 0.4 }, { timeS: 0.1, emfMultiplier: 0 }];
      const base = generateDesignProposal(input);
      const branch = base.cables.find(row => row.to === 'L-01');
      input.cableFaultWithstand = {
        schemaVersion: '1.0.0', cableSelection: mode === 'selected' ? { mode, cableIds: [branch.id] } : { mode },
        faultSelection: { mode: 'all-generated-bus-fault-cases' },
        clearing: { maximumTotalClearingTimeS: 0.1, reference: 'Synthetic math endpoint, not a device clearing claim', applicabilityReference: 'Synthetic complete-source test applicability', appliesToAllModeledSources: true },
        thermal: { conductorMaterial: 'copper', maximumInitialTemperatureC: 90, finalTemperatureC: 250, singleEvent: true, adequateRecoveryBeforeEvent: true, reference: 'Synthetic recovered single-event state' },
      };
      store.setItem('designSynthesisDraft', input);
      const proposal = generateDesignProposal(input);
      assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
      assert.equal(proposal.cableFaultWithstandValidation.comparison, 'pass');
      const beforeRejected = new Map(values);
      const forged = clone(proposal);
      forged.cableFaultWithstandValidation.cases[0].allowableCurrentSquaredExposureA2S *= 2;
      assert.equal(apply.previewDesignProposal(forged).ok, false, 'A changed material allowance must fail fresh comparison');
      const rejected = apply.applyDesignProposal(forged, { previewContext: apply.previewDesignProposal(forged).context });
      assert.equal(rejected.applied, false);
      assert.deepEqual(values, beforeRejected, 'Rejected evidence must leave persistent bytes unchanged');
      const forgedHistory = clone(proposal);
      const forgedBranch = forgedHistory.faultEvolutionValidation.faultCases[0].timeRows[0].branchCurrents[0];
      forgedBranch.fromCurrentIntoBranchKA.re += 0.1;
      forgedBranch.toCurrentIntoBranchKA.re -= 0.1;
      forgedHistory.cableFaultWithstandValidation = evaluateDesignSynthesisCableFaultWithstand({ request: forgedHistory.cableFaultWithstand, proposal: forgedHistory });
      assert.equal(forgedHistory.cableFaultWithstandValidation.status, 'evaluated');
      const forgedPreview = apply.previewDesignProposal(forgedHistory);
      const rejectedHistory = apply.applyDesignProposal(forgedHistory, { previewContext: forgedPreview.context });
      assert.equal(rejectedHistory.applied, false, 'A self-consistent thermal result cannot authorize altered network histories');
      assert.deepEqual(values, beforeRejected, 'Fresh network validation must precede persistent mutation');
      const preview = apply.previewDesignProposal(proposal);
      const result = apply.applyDesignProposal(proposal, { previewContext: preview.context });
      assert.equal(result.applied, true, JSON.stringify(result.errors));
      const decoded = resolve();
      assert.ok(decoded, 'Fresh saved thermal evidence must resolve');
      assert.deepEqual(decoded.cableFaultWithstandValidation, proposal.cableFaultWithstandValidation);
      const feeder = proposal.cables.find(row => row.to === 'DP-01');
      const source = input.faultStudy.sources[0];
      const currentA = divide(source.emfPhaseV, add(add({ re: 1, im: 3 }, cableOhms(feeder)), cableOhms(branch)));
      const row = decoded.cableFaultWithstandValidation.cases.find(item => item.cableId === branch.id && item.faultBusId === 'L-01');
      assert.ok(row);
      const integralSeconds = 0.03 * (1 + 0.4 + 0.4 ** 2) / 3 + 0.07 * 0.4 ** 2 / 3;
      near(row.currentSquaredExposureA2S, squaredMagnitude(currentA) * integralSeconds);
      assert.equal(decoded.cableFaultWithstandValidation.qualificationStatus, 'unevaluated');
      project.undoProjectChange();
      assert.equal(saved(), null);
      project.redoProjectChange();
      assert.deepEqual(resolve(), decoded);
      assert.equal(store.loadProject(window.currentProjectId), true);
      assert.deepEqual(resolve(), decoded);
      const catalog = clone(store.getItem(sourceKey, null));
      store.setItem(sourceKey, { ...catalog, sourceId: 'stale source' });
      assert.equal(resolve(), null, 'Actual catalog metadata must bind saved evidence');
      store.setItem(sourceKey, catalog);
      assert.deepEqual(resolve(), decoded);
      const original = clone(store.getCables());
      const changed = clone(original); changed.at(-1).lengthFt += 1;
      store.setCables(changed);
      assert.equal(resolve(), null, 'Any current cable engineering edit invalidates saved context');
      store.setCables(original);
      assert.deepEqual(resolve(), decoded);
      assert.ok(peak <= limit, `${peak}/${limit}`);
      context.diagnostic(`Peak quota use ${peak}/${limit} bytes`);
    } finally { delete globalThis.window; }
  });
}
