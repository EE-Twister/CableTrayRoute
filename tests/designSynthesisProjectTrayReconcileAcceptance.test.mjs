import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildProjectTrayHandoff } from '../analysis/designSynthesisProjectTrays.mjs';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { buildProjectTrayReuseBinding } from '../analysis/designSynthesisProjectTrayReuse.mjs';
import { distributionPartitionFixture } from './helpers/distributionPartitionFixture.mjs';

const values = new Map();
const maximumBytes = 5 * 1024 * 1024;
let peakBytes = 0;
let rejectNextNamedSave = false;
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem(key, value) {
    if (rejectNextNamedSave && key === 'CTR_SAVED_PROJECTS_V1') {
      rejectNextNamedSave = false;
      const error = new Error('Synthetic named-project write failure'); error.name = 'QuotaExceededError'; throw error;
    }
    const next = new Map(values).set(key, String(value));
    const size = [...next].reduce((sum, [name, item]) => sum + 2 * (name.length + item.length), 0);
    peakBytes = Math.max(peakBytes, size);
    if (size > maximumBytes) { const error = new Error('Project exceeds the existing 5 MiB limit'); error.name = 'QuotaExceededError'; throw error; }
    values.set(key, String(value));
  },
  removeItem: key => values.delete(key),
  key: index => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};
const project = await import('../projectStorage.js');
await project.initializeProjectStorage();
const store = await import('../dataStore.mjs');
const { previewDesignProposal, applyDesignProposal } = await import('../src/design-synthesis/applyProposal.mjs');
const empty = project.captureProjectTransactionSnapshot();

for (const count of [25, 50]) test(`${count} loads apply a referenced owner-tray proposal and regenerate without double counting`, context => {
  values.clear();
  peakBytes = 0;
  rejectNextNamedSave = false;
  project.restoreProjectTransactionSnapshot(empty);
  project.setProjectState(project.defaultProject(), { captureUndo: false });
  const name = `Referenced owner trays ${count}`;
  globalThis.window = { currentProjectId: name, dispatchEvent() {} };
  try {
    store.setProjectMeta({ id: name, name });
    store.setTrays([
      { tray_id: 'SHORT', tray_type: 'Ladder', start_x: 0, start_y: 0, start_z: 0, end_x: 20, end_y: 0, end_z: 0, inside_width: 6, tray_depth: 6, ownerNote: 'Keep field asset' },
      { tray_id: 'BYPASS-A', tray_type: 'Ladder', start_x: 0, start_y: 0, start_z: 0, end_x: 0, end_y: 50, end_z: 0, inside_width: 24, tray_depth: 6 },
      { tray_id: 'BYPASS-B', tray_type: 'Ladder', start_x: 0, start_y: 50, start_z: 0, end_x: 20, end_y: 0, end_z: 0, inside_width: 24, tray_depth: 6 },
    ]);
    store.setCables([{ id: 'owner-cable', tag: 'OWNER-CABLE', cable_type: 'Power', conductor_size: '#8 AWG', conductors: 3, cable_rating: 600, diameter: 0.833, quantity: 5, raceway_ids: ['SHORT'] }]);
    store.setItem('latestRouteResults', { batchResults: [{ cable: 'OWNER-CABLE', route_segments: [{ type: 'tray', tray_id: 'SHORT' }] }] });
    assert.equal(store.saveProject(name), true);
    const source = () => ({ projectId: name, scenario: store.getCurrentScenario(), trays: store.getTrays(), cables: store.getCables(), routeResults: store.getItem('latestRouteResults', null), lastApplied: store.getItem('designSynthesisLastApplied', {}) });
    const reviewed = buildProjectTrayHandoff({ ...source(), selectedTrayIds: count === 50 ? ['SHORT'] : ['SHORT', 'BYPASS-A', 'BYPASS-B'], inventoryReference: 'Synthetic owner inventory', acknowledgements: { units: true, inventory: true, permission: true, replaceGenerated: true }, reuseEvidence: { thermalReference: 'Synthetic external thermal review', installationReference: 'Synthetic installation review', coverageConfirmed: true } });
    assert.equal(reviewed.ok, true, JSON.stringify(reviewed.issues));
    const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-tray-congestion.json', import.meta.url), 'utf8'));
    input.equipment = Array.from({ length: count }, (_, index) => ({ ...input.equipment[0], id: `L-${index + 1}`, tag: `L-${index + 1}` }));
    input.corridors = reviewed.corridors;
    input.corridors.edges.forEach(edge => { edge.permitted = true; edge.thermal = { ambientTempC: 30, bundledConductors: 3, solidCoverContinuousLengthFt: 0 }; });
    if (count === 50) {
      const short = input.corridors.edges[0];
      input.corridors.nodes.push({ id: 'NEW-BYPASS-NODE', x: 0, y: 50, z: 0 });
      input.corridors.edges.push(
        { id: 'NEW-BYPASS-A', from: short.from, to: 'NEW-BYPASS-NODE', widthIn: 24, depthIn: 6, permitted: true },
        { id: 'NEW-BYPASS-B', from: 'NEW-BYPASS-NODE', to: short.to, widthIn: 24, depthIn: 6, permitted: true },
      );
    }
    input.projectTrayAdoption = reviewed.adoption;
    const reuse = buildProjectTrayReuseBinding(input);
    assert.equal(reuse.ok, true, JSON.stringify(reuse.issues));
    input.projectTrayReuseBinding = reuse.binding;
    const ownerTrays = structuredClone(store.getTrays());
    const ownerCable = structuredClone(store.getCables()[0]);
    const before = structuredClone(project.getProjectState());
    const proposal = generateDesignProposal(input, { projectTraySource: source() });
    assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
    assert.equal(generateDesignProposal(input).status, 'blocked', 'A draft alone cannot establish current project records');
    if (count === 25) {
      const motorFixture = distributionPartitionFixture(25);
      const motorInput = structuredClone(input);
      motorInput.equipment[0].motor = structuredClone(motorFixture.equipment[0].motor);
      motorInput.equipment[0].ratingsBasis = 'electrical-input-kW';
      motorInput.equipment[0].duty = 'continuous';
      motorInput.supply.motorStartingImpedance = motorFixture.supply.motorStartingImpedance;
      motorInput.criteria.motorStarting = motorFixture.criteria.motorStarting;
      motorInput.criteria.motorStarter = motorFixture.criteria.motorStarter;
      motorInput.projectTrayReuseBinding = buildProjectTrayReuseBinding(motorInput).binding;
      const motorProposal = generateDesignProposal(motorInput, { projectTraySource: source() });
      assert.ok(motorProposal.issues.some(item => item.code === 'MOTOR_PROTECTION_UNRESOLVED'), JSON.stringify(motorProposal.issues));
      assert.equal(applyDesignProposal(motorProposal).applied, false);
    }
    const preview = previewDesignProposal(proposal);
    assert.equal(preview.ok, true, JSON.stringify({ errors: preview.errors, conflicts: preview.conflicts }));
    for (const change of [
      p => { p.cables[0].ampacityA += 1; },
      p => { p.routeResults.batchResults.find(row => row.route_segments.some(segment => segment.type === 'tray')).route_segments[0].start[0] += 1; },
      p => { p.inputs.original.corridors.edges.find(row => row.existingTray).thermal.ambientTempC += 1; },
    ]) {
      const altered = structuredClone(proposal); change(altered);
      assert.equal(applyDesignProposal(altered).applied, false);
      assert.deepEqual(project.getProjectState(), before);
    }
    rejectNextNamedSave = true;
    const failedSave = applyDesignProposal(proposal, { previewContext: preview.context });
    assert.equal(failedSave.applied, false);
    assert.deepEqual(project.getProjectState(), before, 'A failed named save rolls back the entire tray and cable merge');
    assert.equal(applyDesignProposal(proposal, { previewContext: preview.context }).applied, true);
    const retainedBasis = store.getItem('designSynthesisLastApplied', null).projectTrayReuse;
    assert.equal(retainedBasis.status, 'preliminary-user-references-not-independently-verified');
    assert.deepEqual(retainedBasis.adoption.reuseEvidence, reviewed.adoption.reuseEvidence);
    assert.deepEqual(retainedBasis.binding, input.projectTrayReuseBinding);
    assert.deepEqual(store.getTrays().filter(row => !row._designSynthesis), ownerTrays);
    assert.equal(store.getTrays().filter(row => row._designSynthesis).length, count === 50 ? 2 : 0);
    assert.deepEqual(store.getCables().find(row => row.tag === 'OWNER-CABLE'), ownerCable);
    const applied = structuredClone(project.getProjectState());
    project.undoProjectChange();
    assert.deepEqual(project.getProjectState(), before);
    project.redoProjectChange();
    assert.deepEqual(project.getProjectState(), applied);
    assert.equal(store.loadProject(name), true);
    assert.deepEqual(store.getItem('designSynthesisLastApplied', null).projectTrayReuse, retainedBasis);
    const repeated = generateDesignProposal(input, { projectTraySource: source() });
    assert.equal(repeated.status, 'proposal', JSON.stringify(repeated.issues));
    const second = previewDesignProposal(repeated);
    assert.equal(second.ok, true, JSON.stringify({ errors: second.errors, conflicts: second.conflicts }));
    assert.equal(applyDesignProposal(repeated, { previewContext: second.context }).applied, true);
    assert.deepEqual(store.getTrays().filter(row => !row._designSynthesis), ownerTrays);
    assert.equal(store.getTrays().filter(row => row._designSynthesis).length, count === 50 ? 2 : 0);
    assert.deepEqual(store.getCables().find(row => row.tag === 'OWNER-CABLE'), ownerCable);
    assert.equal(store.getCables().filter(row => row._designSynthesis).length, proposal.cables.length);
    assert.ok(peakBytes <= maximumBytes);
    context.diagnostic(`Peak project storage: ${peakBytes}/${maximumBytes} bytes`);
    const saved = project.captureProjectTransactionSnapshot();
    const changedOwner = store.getCables();
    changedOwner.find(row => row.tag === 'OWNER-CABLE').diameter = 1;
    store.setCables(changedOwner);
    assert.equal(generateDesignProposal(input, { projectTraySource: source() }).status, 'blocked');
    const editedState = structuredClone(project.getProjectState());
    assert.equal(applyDesignProposal(repeated).applied, false);
    assert.deepEqual(project.getProjectState(), editedState);
    project.restoreProjectTransactionSnapshot(saved);
    const changedGenerated = store.getCables();
    changedGenerated.find(row => row._designSynthesis).ownerNote = 'modified after Apply';
    store.setCables(changedGenerated);
    assert.equal(generateDesignProposal(input, { projectTraySource: source() }).status, 'blocked');
    assert.equal(applyDesignProposal(repeated).applied, false);
  } finally { delete globalThis.window; }
});

for (const count of [25, 50]) test(`${count} loads preview a merge that retains owner trays while Apply remains blocked`, () => {
  values.clear();
  project.restoreProjectTransactionSnapshot(empty);
  project.setProjectState(project.defaultProject(), { captureUndo: false });
  const name = `Owner tray reconciliation ${count}`;
  globalThis.window = { currentProjectId: name, dispatchEvent() {} };
  try {
    store.setProjectMeta({ id: name, name });
    store.setTrays([
      { tray_id: 'SHORT', tray_type: 'Ladder', start_x: 0, start_y: 0, start_z: 0, end_x: 20, end_y: 0, end_z: 0, inside_width: 6, tray_depth: 6, ownerNote: 'Keep field asset' },
      { tray_id: 'BYPASS-A', tray_type: 'Ladder', start_x: 0, start_y: 0, start_z: 0, end_x: 0, end_y: 50, end_z: 0, inside_width: 24, tray_depth: 6 },
      { tray_id: 'BYPASS-B', tray_type: 'Ladder', start_x: 0, start_y: 50, start_z: 0, end_x: 20, end_y: 0, end_z: 0, inside_width: 24, tray_depth: 6 },
    ]);
    store.setCables([{ id: 'owner-cable', tag: 'OWNER-CABLE', cable_type: 'Power', conductor_size: '#8 AWG', conductors: 3, cable_rating: 600, diameter: 0.833, quantity: 5, raceway_ids: ['SHORT'] }]);
    store.setItem('latestRouteResults', { batchResults: [{ cable: 'OWNER-CABLE', route_segments: [{ type: 'tray', tray_id: 'SHORT' }] }] });
    const source = { projectId: name, scenario: store.getCurrentScenario(), trays: store.getTrays(), cables: store.getCables(), routeResults: store.getItem('latestRouteResults', null), selectedTrayIds: ['SHORT', 'BYPASS-A', 'BYPASS-B'], inventoryReference: 'Synthetic owner inventory', acknowledgements: { units: true, inventory: true, permission: true } };
    const reviewed = buildProjectTrayHandoff(source);
    assert.equal(reviewed.ok, true, JSON.stringify(reviewed.issues));
    const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-tray-congestion.json', import.meta.url), 'utf8'));
    input.equipment = Array.from({ length: count }, (_, index) => ({ ...input.equipment[0], id: `L-${index + 1}`, tag: `L-${index + 1}` }));
    input.corridors = reviewed.corridors;
    input.corridors.edges.forEach(edge => { edge.permitted = true; });
    input.projectTrayAdoption = reviewed.adoption;
    const before = structuredClone(project.getProjectState());
    const proposal = generateDesignProposal(input);
    const preview = previewDesignProposal(proposal);
    assert.equal(preview.projectTrayReconciliation.ok, true, JSON.stringify(preview.projectTrayReconciliation.issues));
    assert.deepEqual(preview.next.trays, source.trays);
    assert.deepEqual(preview.proposal.trays, []);
    assert.equal(preview.ok, false);
    assert.ok(preview.errors.some(row => row.code === 'existing_tray_reconciliation_unresolved'));
    assert.equal(applyDesignProposal(proposal).applied, false);
    const forged = structuredClone(proposal); forged.status = 'proposal'; forged.issues = [];
    assert.equal(applyDesignProposal(forged).applied, false);
    assert.deepEqual(project.getProjectState(), before);
  } finally { delete globalThis.window; }
});
