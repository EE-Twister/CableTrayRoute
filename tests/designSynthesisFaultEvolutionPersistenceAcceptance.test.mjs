import assert from 'node:assert/strict';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { faultEvolutionFixture, add, divide, cableOhms, squaredMagnitude } from './helpers/faultEvolutionFixture.mjs';

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
    if (attempted > budget || (rejectNamedSave && key === 'CTR_SAVED_PROJECTS_V1')) {
      const error = new Error(`Source-history named storage write rejected: ${attempted} bytes`);
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
const apply = await import('../src/design-synthesis/applyProposal.mjs');
const emptySession = project.captureProjectTransactionSnapshot();
const json = value => JSON.parse(JSON.stringify(value));
const near = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 2e-9 * Math.max(1, Math.abs(expected)), `${actual} versus ${expected}`);
const savedRecord = () => json(store.getItem(apply.FAULT_EVOLUTION_VALIDATION_KEY, null));
const resolve = saved => apply.resolveDesignSynthesisFaultEvolutionValidation(saved, apply.getDesignSynthesisFaultEvolutionContext());
const applyProposal = proposal => apply.applyDesignProposal(proposal, { previewContext: apply.previewDesignProposal(proposal).context });

function setup(count) {
  values.clear(); peakBytes = 0; rejectNamedSave = false;
  globalThis.window = { currentProjectId: `Source history ${count}`, dispatchEvent() {} };
  project.restoreProjectTransactionSnapshot(emptySession);
  project.setProjectState(project.defaultProject(), { captureUndo: false });
  store.setProjectMeta({ name: `Source history ${count}` });
  const input = faultEvolutionFixture(count, false);
  input.faultEvolution.reference = 'Synthetic source history — Ω, 漢字 and emoji ⚡; not field evidence.';
  input.faultEvolution.profiles[0].points = [{ timeS: 0, emfMultiplier: 1 }, { timeS: 0.03, emfMultiplier: 0.4 }, { timeS: 0.1, emfMultiplier: 0 }];
  store.setItem('designSynthesisDraft', input);
  return input;
}

for (const count of [25, 50]) test(`${count} loads retain exact signed source histories, independent exposure and named reload within 5 MiB`, context => {
  const input = setup(count);
  try {
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
    const result = applyProposal(proposal);
    assert.equal(result.applied, true, JSON.stringify(result.errors));
    const saved = savedRecord();
    assert.ok(saved);
    const decoded = resolve(saved);
    assert.ok(decoded);
    assert.deepEqual(decoded.faultEvolution, json(proposal.faultEvolution));
    assert.deepEqual(decoded.faultEvolutionValidation, proposal.faultEvolutionValidation);
    const branch = proposal.cables.find(row => row.to === 'L-01');
    const feeder = proposal.cables.find(row => row.to === 'DP-01');
    const source = input.faultStudy.sources[0];
    const series = add(add({ re: source.impedance.rOhm, im: source.impedance.xOhm }, cableOhms(feeder)), cableOhms(branch));
    const expectedA = divide(source.emfPhaseV, series);
    const history = decoded.faultEvolutionValidation.deviceHistories.find(row => row.placementId === `cable:${branch.id}` && row.caseId === 'bus-fault:L-01');
    assert.ok(history);
    near(history.timeRows[0].currentKA.re * 1000, expectedA.re);
    near(history.timeRows[0].currentKA.im * 1000, expectedA.im);
    const integralFactorS = 0.03 * (1 + 0.4 + 0.4 ** 2) / 3 + 0.07 * 0.4 ** 2 / 3;
    near(history.currentSquaredExposureA2S, squaredMagnitude(expectedA) * integralFactorS);
    near(history.timeRows.at(-1).currentRmsA, 0);
    assert.equal(decoded.faultEvolutionValidation.protectionAdequacy, 'unevaluated');
    assert.equal(decoded.faultEvolutionValidation.evidenceStatus, 'supplied-unverified');
    assert.ok(peakBytes <= budget, `${peakBytes} versus ${budget}`);
    context.diagnostic(`All canonical, derived and named storage: ${bytes(values)} bytes; peak ${peakBytes}/${budget}`);
    project.undoProjectChange();
    assert.equal(store.getItem(apply.FAULT_EVOLUTION_VALIDATION_KEY, null), null);
    project.redoProjectChange();
    assert.deepEqual(savedRecord(), saved);
    assert.deepEqual(resolve(savedRecord()), decoded);
    assert.equal(store.loadProject(`Source history ${count}`), true);
    assert.deepEqual(savedRecord(), saved);
    assert.deepEqual(resolve(savedRecord()), decoded);
    const counts = [store.getEquipment().length, store.getCables().length, store.getPanels().length];
    assert.equal(applyProposal(generateDesignProposal(input)).applied, true);
    assert.deepEqual([store.getEquipment().length, store.getCables().length, store.getPanels().length], counts);
    assert.deepEqual(resolve(savedRecord()).faultEvolutionValidation, proposal.faultEvolutionValidation);
  } finally { delete globalThis.window; }
});

test('canonical engineering edits, project identity and changed initial/device evidence invalidate saved history', () => {
  const input = setup(25);
  try {
    assert.equal(applyProposal(generateDesignProposal(input)).applied, true);
    const saved = savedRecord();
    assert.ok(resolve(saved));
    const original = store.getCables();
    const changed = json(original);
    changed[0].r_ohm_per_kft *= 1.01;
    store.setCables(changed);
    assert.equal(Boolean(resolve(saved)), false, 'Changed context must hide saved numeric evidence');
    store.setCables(original);
    assert.ok(resolve(saved));
    globalThis.window.currentProjectId = 'Different named project';
    assert.equal(Boolean(resolve(saved)), false, 'Changed context must hide saved numeric evidence');
    globalThis.window.currentProjectId = 'Source history 25';
    for (const key of [apply.FAULT_STUDY_VALIDATION_KEY, apply.DEVICE_FAULT_VALIDATION_KEY, apply.DEVICE_EVIDENCE_KEY]) {
      const originalEvidence = json(store.getItem(key, null));
      const changedEvidence = { ...originalEvidence, modelInputFingerprint: 'changed-context' };
      store.setItem(key, changedEvidence);
      assert.equal(Boolean(resolve(saved)), false, 'Changed context must hide saved numeric evidence');
      store.setItem(key, originalEvidence);
      assert.ok(resolve(saved));
    }
  } finally { delete globalThis.window; }
});

test('a regenerated design without source history removes only the old history and undo restores it', () => {
  const input = setup(25);
  try {
    assert.equal(applyProposal(generateDesignProposal(input)).applied, true);
    const before = savedRecord();
    delete input.faultEvolution;
    assert.equal(applyProposal(generateDesignProposal(input)).applied, true);
    assert.equal(store.getItem(apply.FAULT_EVOLUTION_VALIDATION_KEY, null), null);
    assert.equal(store.getItem(apply.FAULT_STUDY_VALIDATION_KEY, null)?.status, 'evaluated');
    project.undoProjectChange();
    assert.ok(isDeepStrictEqual(savedRecord(), before), 'One undo must restore the exact packed source-history record');
    assert.ok(resolve(savedRecord()));
  } finally { delete globalThis.window; }
});

test('tampered evaluated histories and failed named saves roll back the whole canonical mutation', () => {
  const input = setup(25);
  try {
    const proposal = generateDesignProposal(input);
    assert.equal(applyProposal(proposal).applied, true);
    const before = json(project.getProjectState());
    const namedBefore = values.get('CTR_SAVED_PROJECTS_V1');
    const tampered = json(proposal);
    tampered.faultEvolutionValidation.deviceHistories[0].currentSquaredExposureA2S += 1;
    assert.equal(applyProposal(tampered).applied, false);
    assert.deepEqual(json(project.getProjectState()), before);
    assert.equal(values.get('CTR_SAVED_PROJECTS_V1'), namedBefore);
    for (const status of [null, 'blocked', 'not-requested']) {
      const incomplete = json(proposal);
      if (status === null) delete incomplete.faultEvolutionValidation;
      else incomplete.faultEvolutionValidation.status = status;
      assert.equal(applyProposal(incomplete).applied, false, 'Requested source history must never be silently discarded');
      assert.deepEqual(json(project.getProjectState()), before);
      assert.equal(values.get('CTR_SAVED_PROJECTS_V1'), namedBefore);
    }
    const changedInput = json(input);
    changedInput.faultEvolution.reference += ' replacement';
    rejectNamedSave = true;
    const rejected = applyProposal(generateDesignProposal(changedInput));
    rejectNamedSave = false;
    assert.equal(rejected.applied, false);
    assert.deepEqual(json(project.getProjectState()), before);
    assert.equal(values.get('CTR_SAVED_PROJECTS_V1'), namedBefore);
    assert.ok(resolve(savedRecord()));
  } finally { rejectNamedSave = false; delete globalThis.window; }
});

