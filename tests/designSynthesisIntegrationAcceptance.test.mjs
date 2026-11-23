import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';

const local = new Map();
const session = new Map();
let rejectProjectWrite = false;
function storage(values) {
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => {
      if (rejectProjectWrite && key === 'CTR_PROJECT_V1') {
        const error = new Error('Project storage quota exceeded');
        error.name = 'QuotaExceededError';
        throw error;
      }
      values.set(key, String(value));
    },
    removeItem: key => values.delete(key),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}
globalThis.localStorage = storage(local);
globalThis.sessionStorage = storage(session);

const project = await import('../projectStorage.js');
await project.initializeProjectStorage();
const store = await import('../dataStore.mjs');
const { generateDesignProposal } = await import('../analysis/designSynthesis.mjs');
const { previewDesignProposal, applyDesignProposal, getPanelLocationOverrideCandidates, resolveDesignSynthesisInputEvidence, resolveDesignSynthesisDeviceEvidence } = await import('../src/design-synthesis/applyProposal.mjs');
const { buildLoadFlowModel } = await import('../analysis/loadFlowModel.js');
const { runLoadFlow } = await import('../analysis/loadFlow.js');
const input = () => JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));

function assertSingleGeneratedDrawing() {
  const sheets = store.getOneLine().sheets;
  assert.equal(sheets.length, 1, 'Regeneration must update the existing drawing, not append another sheet');
  assert.equal(sheets[0].components.length, 35);
  assert.equal(new Set(sheets[0].components.map(item => item.id)).size, 35);
  assert.equal(sheets[0].connections.length, 34);
  assert.equal(sheets[0].components.filter(item => item.type === 'utility_source').length, 1);
}

function assertSavedLoadFlow() {
  const model = buildLoadFlowModel(store.getOneLine());
  assert.equal(model.buses.length, 35);
  assert.equal(model.branches.length, 34, 'Saved drawing must retain one physical branch per circuit');
  assert.equal(new Set(model.branches.map(branch => branch.id)).size, 34);
  const result = runLoadFlow(model, { baseMVA: 1, balanced: true, maxIterations: 60 });
  assert.equal(result.converged, true);
  assert.equal(result.lines.length, 34, 'Saved graph must not create duplicate case-variant circuit connections');
  assert.equal(new Set(result.lines.map(line => line.id.toLowerCase())).size, 34);
  const kw = store.getLoads().reduce((sum, load) => sum + Number(load.kw), 0);
  assert.ok(Math.abs(result.summary.totalLoadKW - kw) < 1e-7, 'Saved loads must enter the study exactly once');
  assert.ok(result.losses.P > 0.1, 'Canonical save must retain positive cable impedance');
  assert.ok(Math.min(...result.buses.map(bus => bus.Vm)) < 0.999);
  for (const cable of store.getCables()) {
    const branch = model.branches.find(branch => branch.id === cable.id);
    assert.ok(branch, `Missing saved circuit ${cable.id}`);
    assert.equal(branch.rating, cable.ampacityA);
    assert.ok(Math.abs(branch.impedance.r - cable.r_ohm_per_kft * cable.length / 1000) < 1e-10);
    assert.ok(Math.abs(branch.impedance.x - cable.x_ohm_per_kft * cable.length / 1000) < 1e-10);
    assert.equal(result.lines.find(line => line.id === cable.id)?.rating, cable.ampacityA);
  }
}

function visibleState() {
  return {
    equipment: store.getEquipment(), loads: store.getLoads(), panels: store.getPanels(),
    cables: store.getCables(), trays: store.getTrays(), conduits: store.getConduits(), oneLine: store.getOneLine(),
    routes: store.getItem('latestRouteResults', null),
    applied: store.getItem('designSynthesisLastApplied', null),
    signature: store.getItem('designSynthesisInputSignature', null),
    deviceEvidence: store.getItem('designSynthesisDeviceEvidence', null),
    inputEvidence: resolveDesignSynthesisInputEvidence(store.getItem('designSynthesisInputEvidence', null)),
    studyValidation: store.getItem('designSynthesisLoadFlowValidation', null),
  };
}

test('existing tray occupancy cannot bypass reconciliation by changing proposal status or issues', () => {
  const original = project.captureProjectTransactionSnapshot();
  try {
    const draft = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-tray-congestion.json', import.meta.url), 'utf8'));
    draft.corridors.edges[0].existingTray = { trayId: 'OWNER-TRAY', construction: 'ladder', inventoryReference: 'Synthetic inventory', cables: [] };
    const generated = generateDesignProposal(draft);
    const tampered = { ...generated, status: 'proposal', issues: generated.issues.filter(item => item.code !== 'EXISTING_TRAY_RECONCILIATION_UNRESOLVED') };
    const before = project.captureProjectTransactionSnapshot();
    const preview = previewDesignProposal(tampered);
    assert.ok(preview.errors.some(item => item.code === 'existing_tray_reconciliation_unresolved'));
    assert.equal(applyDesignProposal(tampered, { previewContext: preview.context }).applied, false);
    assert.deepEqual(project.captureProjectTransactionSnapshot(), before);
  } finally { project.restoreProjectTransactionSnapshot(original); }
});

test('first real generated proposal applies and history removes newly introduced derived settings', () => {
  store.setProjectMeta({ name: 'Equipment-first acceptance' });
  store.setEquipment([{ id: 'MANUAL-KEEP', tag: 'MANUAL-KEEP' }]);
  store.setConduits([{ id: 'MANUAL-CONDUIT', conduit_id: 'MANUAL-CONDUIT', conduit_type: 'EMT', trade_size: '2' }]);
  const before = visibleState();
  assert.equal(before.applied, null);
  assert.equal(before.signature, null);
  const enrichedInput = input();
  enrichedInput.equipment[0].sourceDocuments = [{ id: 'load-rating-sheet', revision: 'A' }];
  enrichedInput.corridors.edges[0].thermal = { ambientTempC: 40 };
  const proposal = generateDesignProposal(enrichedInput);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  const preview = previewDesignProposal(proposal);
  assert.equal(preview.ok, true, JSON.stringify(preview));
  const result = applyDesignProposal(proposal, { previewContext: preview.context });
  assert.equal(result.applied, true, JSON.stringify(result.errors || result.conflicts));
  const after = visibleState();
  assert.deepEqual(after.applied.distributionBaseline, proposal.distributionBaseline,
    'Applied identity history must survive canonical storage, undo, redo, and export');
  assert.ok(after.studyValidation, 'Apply must retain the current operating study evidence');
  assert.deepEqual(after.inputEvidence, proposal.inputEvidence, 'Apply must retain complete input evidence and units');
  assert.equal(after.loads.length, 30);
  assert.equal(after.cables.length, proposal.cables.length);
  assert.equal(after.conduits.length, proposal.conduits.length + 1);
  assert.ok(after.conduits.some(row => row.conduit_id === 'MANUAL-CONDUIT' && row.trade_size === '2'));
  for (const conduit of proposal.conduits) {
    assert.ok(after.conduits.some(row => row.conduit_id === conduit.conduit_id && row.trade_size === conduit.trade_size));
  }
  assert.ok(after.equipment.some(row => row.tag === 'MANUAL-KEEP'));
  assert.equal(after.routes.batchResults.length, proposal.cables.length);
  assertSavedLoadFlow();
  assert.deepEqual(after.equipment.find(row => row.tag === enrichedInput.equipment[0].tag).sourceDocuments,
    enrichedInput.equipment[0].sourceDocuments);
  for (const cable of after.cables) {
    assert.ok(after.equipment.some(row => row.tag === cable.from_tag));
    assert.ok(after.equipment.some(row => row.tag === cable.to_tag));
    const selected = proposal.cables.find(row => row.tag === cable.tag).protectiveDevice;
    assert.ok(cable.protectiveDeviceEvidenceRef, 'Persisted candidates must resolve to a full evidence record');
    assert.deepEqual(resolveDesignSynthesisDeviceEvidence(cable, after.deviceEvidence), selected,
      'Apply must retain the full selected evidence record once and resolve it without loss');
    assert.equal(cable.protectiveDevice.continuousCurrentA, selected.continuousCurrentA);
    assert.equal(cable.protectiveDevice.evaluatedVoltageVac, selected.evaluatedVoltageVac);
    assert.equal(cable.protectiveDevice.interruptingRatingKA, selected.interruptingRatingKA);
    assert.equal(cable.protectiveDevice.libraryStatus, selected.libraryStatus);
    assert.deepEqual(cable.thermalAssessment,
      proposal.cables.find(row => row.tag === cable.tag).thermalAssessment,
      'Apply must preserve the route-specific thermal conditions and governing segment');
    assert.deepEqual(cable.routingDecision,
      proposal.cables.find(row => row.tag === cable.tag).routingDecision,
      'Apply must preserve the chosen route and the reason for its selection');
    assert.deepEqual(after.routes.batchResults.find(row => row.cable === cable.tag).routingDecision,
      cable.routingDecision, 'Canonical route and cable decisions must agree');
    assert.deepEqual(cable.installationCoverage,
      proposal.cables.find(row => row.tag === cable.tag).installationCoverage);
  }
  project.undoProjectChange();
  const undone = visibleState();
  for (const key of Object.keys(before)) {
    assert.ok(isDeepStrictEqual(undone[key], before[key]), `Undo failed to restore ${key}, including removing newly introduced settings`);
  }
  project.redoProjectChange();
  assert.deepEqual(visibleState(), after);
  const again = applyDesignProposal(proposal, { previewContext: previewDesignProposal(proposal).context });
  assert.equal(again.applied, true, JSON.stringify(again.errors || again.conflicts));
  assert.equal(store.getCables().length, proposal.cables.length, 'Reapply must not duplicate circuits');
  assertSingleGeneratedDrawing();
});

test('apply rejects incomplete context, a null identity mismatch, and blocking findings without mutation', () => {
  const proposal = generateDesignProposal(input());
  const before = visibleState();
  const context = previewDesignProposal(proposal).context;
  for (const captured of [{}, { scenario: context.scenario }, { ...context, projectId: null }]) {
    const result = applyDesignProposal(proposal, { previewContext: captured });
    assert.equal(result.applied, false, JSON.stringify(captured));
    assert.deepEqual(visibleState(), before);
  }
  const contradictory = { ...proposal, issues: [...proposal.issues, { code: 'FAILED_CHECK', severity: 'blocking' }] };
  const result = applyDesignProposal(contradictory, { previewContext: context });
  assert.equal(result.applied, false);
  assert.ok(result.errors.some(error => error.code === 'proposal_has_blocking_issues'));
  assert.deepEqual(visibleState(), before);
});

test('a saved project round trip retains synthesis ownership and can regenerate', () => {
  const saved = store.exportProject();
  const before = visibleState();
  assert.equal(store.importProject(saved), true);
  const after = visibleState();
  assert.equal(after.cables.length, before.cables.length);
  assert.deepEqual(after.applied, before.applied, 'Saved projects must retain regeneration ownership');
  assert.deepEqual(after.deviceEvidence, before.deviceEvidence, 'Saved project must retain referenced manufacturer evidence');
  assert.deepEqual(after.inputEvidence, before.inputEvidence, 'Saved project must retain source classifications and effective assumptions');
  assert.deepEqual(after.studyValidation, before.studyValidation, 'Saved project must retain operating study evidence');
  assert.deepEqual(after.conduits, before.conduits, 'Saved project must retain endpoint conduits and ownership');
  assertSavedLoadFlow();
  const revisedInput = input();
  revisedInput.equipment[0].kw += 1;
  const proposal = generateDesignProposal(revisedInput);
  const preview = previewDesignProposal(proposal);
  assert.equal(preview.ok, true, JSON.stringify({ errors: preview.errors, conflicts: preview.conflicts }));
  const result = applyDesignProposal(proposal, { previewContext: preview.context });
  assert.equal(result.applied, true, JSON.stringify({ errors: result.errors, conflicts: result.conflicts }));
  assertSingleGeneratedDrawing();
});

test('regeneration refuses to overwrite a manually edited generated endpoint conduit', () => {
  const original = store.getConduits();
  const owned = original.find(row => row._designSynthesis);
  assert.ok(owned, 'Acceptance project must contain generated endpoint conduits');
  store.setConduits(original.map(row => row.conduit_id === owned.conduit_id ? { ...row, trade_size: '4' } : row));
  const before = visibleState();
  try {
    const revised = input();
    revised.equipment[0].kw += 3;
    const proposal = generateDesignProposal(revised);
    const preview = previewDesignProposal(proposal);
    assert.equal(preview.ok, false);
    assert.ok(preview.conflicts.some(conflict => conflict.collection === 'conduits'));
    const result = applyDesignProposal(proposal, { previewContext: preview.context });
    assert.equal(result.applied, false);
    assert.deepEqual(visibleState(), before);
  } finally {
    store.setConduits(original);
  }
});

test('a tray alias cannot collide with a generated endpoint conduit identity', () => {
  const original = store.getTrays();
  const conduit = store.getConduits().find(row => row._designSynthesis);
  assert.ok(conduit);
  store.setTrays([...original, { id: 'manual-tray-alias', tray_id: conduit.conduit_id, width: 12, depth: 6 }]);
  try {
    const revised = input();
    revised.equipment[0].kw += 3;
    const before = visibleState();
    const proposal = generateDesignProposal(revised);
    const preview = previewDesignProposal(proposal);
    assert.equal(preview.ok, false, 'Raceway assignments share one identity namespace across trays and conduits');
    const result = applyDesignProposal(proposal, { previewContext: preview.context });
    assert.equal(result.applied, false);
    assert.deepEqual(visibleState(), before);
  } finally {
    store.setTrays(original);
  }
});

test('an accepted manual panel location survives canonical apply, history, import, and removal', () => {
  const baseline = generateDesignProposal(input());
  const initial = applyDesignProposal(baseline, { previewContext: previewDesignProposal(baseline).context });
  assert.equal(initial.applied, true, JSON.stringify(initial.errors || initial.conflicts));
  const position = { x: 120, y: 50, z: 0 };
  const point = row => ({ x: row.x, y: row.y, z: row.z });
  store.setPanels(store.getPanels().map(panel => panel._designSynthesis?.identity === 'DP-01' ? { ...panel, ...position } : panel));
  assert.equal(previewDesignProposal(baseline).ok, false, 'A manual location requires an explicit override');
  assert.ok(getPanelLocationOverrideCandidates().some(row => row.panelId === 'DP-01'
    && isDeepStrictEqual(row.location, position)), 'Runtime helper must find the canonical manual change');
  const overridden = input();
  overridden.overrides = { panelLocations: { 'DP-01': { ...position, note: 'Electrical room' } } };
  store.setItem('designSynthesisDraft', overridden);
  const proposal = generateDesignProposal(overridden);
  const before = visibleState();
  const preview = previewDesignProposal(proposal);
  assert.equal(preview.ok, true, JSON.stringify(preview.conflicts));
  const result = applyDesignProposal(proposal, { previewContext: preview.context });
  assert.equal(result.applied, true, JSON.stringify(result.errors || result.conflicts));
  const after = visibleState();
  assert.deepEqual(point(after.panels.find(row => (row._designSynthesis?.identity || row.id) === 'DP-01')), position);
  assert.deepEqual(point(after.equipment.find(row => row.tag === 'DP-01')), position);
  assert.deepEqual(point(after.oneLine.sheets[0].components.find(row => (row._designSynthesis?.identity || row.id) === 'DP-01').physical), position);
  const feeder = after.cables.find(row => row.tag === 'F-DP-01');
  assert.equal(feeder.length, 170);
  assert.equal(after.routes.batchResults.find(row => row.cable === feeder.tag).total_length, 170);
  assert.ok(after.equipment.some(row => row.tag === 'MANUAL-KEEP'));
  assertSingleGeneratedDrawing();
  assertSavedLoadFlow();
  project.undoProjectChange();
  assert.deepEqual(visibleState(), before);
  project.redoProjectChange();
  assert.deepEqual(visibleState(), after);
  assert.equal(store.importProject(store.exportProject()), true);
  assert.deepEqual(store.getItem('designSynthesisDraft'), overridden);
  const regenerated = generateDesignProposal(store.getItem('designSynthesisDraft'));
  assert.equal(regenerated.inputSignature, proposal.inputSignature);
  assert.equal(previewDesignProposal(regenerated).ok, true);
  assertSavedLoadFlow();
  const restored = applyDesignProposal(baseline, { previewContext: previewDesignProposal(baseline).context });
  assert.equal(restored.applied, true, JSON.stringify(restored.errors || restored.conflicts));
  assert.deepEqual(point(store.getPanels().find(row => (row._designSynthesis?.identity || row.id) === 'DP-01')), { x: 60, y: 0, z: 0 });
  assert.equal(store.getCables().find(row => row.tag === 'F-DP-01').length, 60);
  assertSingleGeneratedDrawing();
});

test('a matching override cannot erase unrelated panel edits or inconsistent equipment edits', () => {
  const panels = store.getPanels();
  const equipment = store.getEquipment();
  const location = { x: 120, y: 50, z: 0 };
  const overridden = { ...input(), overrides: { panelLocations: { 'DP-01': location } } };
  const proposal = generateDesignProposal(overridden);
  for (const unrelated of [{ loadKva: 999 }, { fieldNote: 'Do not remove' }]) {
    store.setPanels(panels.map(row => (row._designSynthesis?.identity || row.id) === 'DP-01' ? { ...row, ...location, ...unrelated } : row));
    const before = visibleState();
    const preview = previewDesignProposal(proposal);
    assert.equal(preview.ok, false);
    assert.equal(applyDesignProposal(proposal, { previewContext: preview.context }).applied, false);
    assert.deepEqual(visibleState(), before);
    store.setPanels(panels);
  }
  try {
    store.setPanels(panels.map(row => (row._designSynthesis?.identity || row.id) === 'DP-01' ? { ...row, ...location } : row));
    store.setEquipment(equipment.map(row => row.tag === 'DP-01' ? { ...row, x: 180, y: 50, z: 0 } : row));
    const before = visibleState();
    const preview = previewDesignProposal(proposal);
    assert.equal(preview.ok, false);
    assert.equal(applyDesignProposal(proposal, { previewContext: preview.context }).applied, false);
    assert.deepEqual(visibleState(), before);
  } finally {
    store.setPanels(panels);
    store.setEquipment(equipment);
  }
});

test('a rejected durable write rolls back apply and never reports success', () => {
  const revisedInput = input();
  revisedInput.equipment[0].kw += 2;
  const proposal = generateDesignProposal(revisedInput);
  assert.equal(proposal.status, 'proposal');
  const before = visibleState();
  const persisted = local.get('CTR_PROJECT_V1');
  const context = previewDesignProposal(proposal).context;
  rejectProjectWrite = true;
  try {
    const result = applyDesignProposal(proposal, { previewContext: context });
    assert.equal(result.applied, false, 'Memory-only writes cannot be advertised as a durable apply');
    assert.deepEqual(visibleState(), before);
    assert.equal(local.get('CTR_PROJECT_V1'), persisted);
  } finally {
    rejectProjectWrite = false;
  }
});
