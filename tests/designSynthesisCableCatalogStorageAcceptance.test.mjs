import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const values = new Map();
const limitBytes = 5 * 1024 * 1024;
const storageBytes = entries => [...entries].reduce((total, [key, value]) => total + 2 * (key.length + value.length), 0);
let peakBytes = 0;
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem(key, value) {
    const next = new Map(values);
    next.set(key, String(value));
    const size = storageBytes(next);
    if (size > limitBytes) {
      const error = new Error('The existing 5 MiB project storage limit was exceeded.');
      error.name = 'QuotaExceededError';
      throw error;
    }
    peakBytes = Math.max(peakBytes, size);
    values.set(key, String(value));
  },
  removeItem: key => values.delete(key),
  key: index => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};
const project = await import('../projectStorage.js');
await project.initializeProjectStorage();
const store = await import('../dataStore.mjs');
const { generateDesignProposal } = await import('../analysis/designSynthesis.mjs');
const { previewDesignProposal, applyDesignProposal } = await import('../src/design-synthesis/applyProposal.mjs');
const { SOUTHWIRE_MC_SOURCE, SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT } = await import('../analysis/designSynthesisCableCatalog.mjs');
const { buildLoadFlowModel } = await import('../analysis/loadFlowModel.js');
const { runLoadFlow } = await import('../analysis/loadFlow.js');
const { buildProjectTrayHandoff } = await import('../analysis/designSynthesisProjectTrays.mjs');
const empty = project.captureProjectTransactionSnapshot();
const sourceKey = 'designSynthesisCableCatalogSource';
const canonical = () => ({
  cables: store.getCables(),
  equipment: store.getEquipment(),
  loads: store.getLoads(),
  panels: store.getPanels(),
  trays: store.getTrays(),
  conduits: store.getConduits(),
  oneLine: store.getOneLine(),
  catalogSource: store.getItem(sourceKey, null),
});
function apply(proposal) {
  const preview = previewDesignProposal(proposal);
  assert.equal(preview.ok, true, JSON.stringify(preview));
  const result = applyDesignProposal(proposal, { previewContext: preview.context });
  assert.equal(result.applied, true, JSON.stringify(result));
}

for (const count of [25, 50]) test(`${count}-load catalog source survives canonical Apply, one undo/redo, named reload and regeneration`, async context => {
  delete globalThis.window;
  project.restoreProjectTransactionSnapshot(empty);
  project.setProjectState(project.defaultProject(), { captureUndo: false });
  peakBytes = 0;
  const projectName = `Catalog source acceptance ${count}`;
  store.setProjectMeta({ name: projectName });
  globalThis.window = { currentProjectId: projectName, dispatchEvent() {} };
  try {
    const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
    const original = input.equipment;
    input.equipment = Array.from({ length: count }, (_, index) => ({ ...original[index % original.length], id: `CAT-${index}`, tag: `CAT-${index}` }));
    input.supply.capacityKva = 10000;
    // This owner record represents a previously supplied model, not a new
    // manufacturer claim. Reading/loading must not rewrite it to the new table.
    store.setCables([{ id: 'OWNER-CABLE', tag: 'OWNER-CABLE', r_ohm_per_kft: 0.786, x_ohm_per_kft: 0.052, cable_od: 0.821, ownerNote: 'Retain the original supplied model' }]);
    const owner = structuredClone(store.getCables().find(cable => cable.tag === 'OWNER-CABLE'));
    assert.equal(store.saveProject(projectName), true);
    assert.equal(store.loadProject(projectName), true);
    assert.deepEqual(store.getCables().find(cable => cable.tag === 'OWNER-CABLE'), owner);
    assert.equal(store.getItem(sourceKey, null), null, 'Catalog metadata must not be written by loading an old project.');
    const before = canonical();
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
    assert.equal(store.getItem(sourceKey, null), null, 'Generation is read-only.');
    apply(proposal);
    const after = canonical();
    const trayReview = {
      projectId: projectName, scenario: store.getCurrentScenario(),
      trays: [{ tray_id: 'OWNER-TRAY', tray_type: 'Ladder', start_x: 0, start_y: 0, start_z: 0, end_x: 10, end_y: 0, end_z: 0, inside_width: 6, tray_depth: 6 }],
      cables: after.cables, routeResults: store.getItem('latestRouteResults', null),
      selectedTrayIds: ['OWNER-TRAY'], inventoryReference: 'Synthetic owner inventory',
      acknowledgements: { units: true, inventory: true, permission: true, replaceGenerated: true },
      lastApplied: store.getItem('designSynthesisLastApplied', null),
    };
    const reviewed = await buildProjectTrayHandoff(trayReview);
    assert.equal(reviewed.ok, true, JSON.stringify(reviewed.issues));
    assert.equal(reviewed.corridors.edges[0].existingTray.cables.length, 0);
    const editedReview = structuredClone(trayReview);
    editedReview.cables.find(row => row._designSynthesis).ownerNote = 'modified after Apply';
    assert.ok((await buildProjectTrayHandoff(editedReview)).issues.some(row => row.code === 'PROJECT_TRAY_GENERATED_OWNERSHIP_UNPROVEN'));
    assert.deepEqual(after.catalogSource, SOUTHWIRE_MC_SOURCE);
    assert.equal(after.catalogSource.sha256, 'd01fb6ec8ab42ea8b6144ea982ccf23ee662190c818621ea9d1d16f7735d3341');
    assert.deepEqual(after.cables.find(cable => cable.tag === 'OWNER-CABLE'), owner);
    for (const generated of proposal.cables) {
      const persisted = after.cables.find(cable => cable.tag === generated.tag);
      assert.ok(persisted, generated.tag);
      assert.equal(persisted.cableStockId, generated.cableStockId);
      assert.ok(/^\d{6}$/.test(persisted.cableStockId));
      assert.equal(persisted.cableCatalogFingerprint, SOUTHWIRE_SPEC45301_CATALOG_FINGERPRINT);
      assert.equal(persisted.r_ohm_per_kft, generated.r_ohm_per_kft);
      assert.equal(persisted.x_ohm_per_kft, generated.x_ohm_per_kft);
      assert.equal(persisted.cable_od, generated.cable_od);
    }
    for (const connection of after.oneLine.sheets.flatMap(sheet => sheet.connections)) {
      const generated = proposal.cables.find(cable => cable.id.toLowerCase() === String(connection.cableRef || connection.cableId || connection.cable?.id).toLowerCase());
      assert.ok(generated, `Drawing connection ${connection.id} retains its schedule linkage`);
      for (const field of ['cableStockId', 'cableCatalogFingerprint', 'r_ohm_per_kft', 'x_ohm_per_kft', 'impedance']) {
        assert.deepEqual(connection.cable[field], generated[field], `${connection.id}: complete electrical/source model after hydration`);
      }
    }
    const solve = oneLine => runLoadFlow(buildLoadFlowModel(oneLine), { baseMVA: 1, balanced: true, maxIterations: 60 });
    const originalFlow = solve(proposal.oneLine);
    const persistedFlow = solve(after.oneLine);
    assert.equal(originalFlow.converged, true);
    assert.equal(persistedFlow.converged, true);
    assert.equal(persistedFlow.buses.length, originalFlow.buses.length);
    for (const persisted of after.cables.filter(cable => cable._designSynthesis)) {
      const circuit = persistedFlow.lines.find(line => line.id === persisted.id);
      assert.ok(circuit, `${persisted.id}: saved circuit identity exactly matches the canonical schedule`);
      assert.equal(circuit.rating, persisted.ampacityA);
    }
    for (const originalBus of originalFlow.buses) {
      const savedBus = persistedFlow.buses.find(row => row.id.toLowerCase() === originalBus.id.toLowerCase());
      assert.ok(savedBus, originalBus.id);
      assert.ok(Math.abs(savedBus.Vm - originalBus.Vm) < 1e-9, `${originalBus.id}: saved drawing retains solved voltage`);
    }
    assert.equal(project.canUndo(), true);
    project.undoProjectChange();
    assert.deepEqual(canonical(), before, 'The source record belongs to the same undo transaction as the generated records.');
    assert.equal(project.canRedo(), true);
    project.redoProjectChange();
    assert.deepEqual(canonical(), after);
    assert.equal(store.loadProject(projectName), true);
    assert.deepEqual(canonical(), after);
    const afterReload = await buildProjectTrayHandoff({ ...trayReview, cables: store.getCables(), routeResults: store.getItem('latestRouteResults', null), lastApplied: store.getItem('designSynthesisLastApplied', null) });
    assert.equal(afterReload.ok, true, JSON.stringify(afterReload.issues));
    assert.equal(afterReload.adoption.sourceFingerprint, reviewed.adoption.sourceFingerprint);
    apply(generateDesignProposal(input));
    assert.deepEqual(canonical(), after, 'Regeneration must preserve canonical identity and source provenance.');
    assert.equal(store.loadProject(projectName), true);
    assert.deepEqual(canonical(), after);
    assert.ok(values.has('CTR_SAVED_PROJECTS_V1'));
    assert.ok(peakBytes <= limitBytes);
    context.diagnostic(JSON.stringify({ count, peakBytes, limitBytes }));
  } finally {
    delete globalThis.window;
  }
});

test('conflicting source, diameter, stock and drawing claims are rejected without canonical changes', () => {
  delete globalThis.window;
  project.restoreProjectTransactionSnapshot(empty);
  project.setProjectState(project.defaultProject(), { captureUndo: false });
  const projectName = 'Catalog consistency acceptance';
  store.setProjectMeta({ name: projectName });
  globalThis.window = { currentProjectId: projectName, dispatchEvent() {} };
  try {
    const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
    input.equipment = input.equipment.slice(0, 2);
    const valid = generateDesignProposal(input);
    assert.equal(valid.status, 'proposal', JSON.stringify(valid.issues));
    const cases = [
      ['source hash', proposal => { proposal.cableCatalogSource.sha256 = '0'.repeat(64); }],
      ['stock identity', proposal => { proposal.cables[0].cableStockId = 'not-the-selected-stock'; }],
      ['cable diameter', proposal => { proposal.cables[0].cable_od *= 0.5; }],
      ['diameter alias', proposal => { proposal.cables[0].outerDiameterIn *= 0.5; }],
      ['missing physical dimensions', proposal => { delete proposal.cables[0].outerDiameterIn; delete proposal.cables[0].cable_od; }],
      ['conductor count', proposal => { proposal.cables[0].conductor_count = 1; }],
      ['voltage rating', proposal => { proposal.cables[0].cable_rating = 300; }],
      ['conflicting conductor-size alias', proposal => {
        const cable = proposal.cables[0];
        cable.conductorSize = cable.conductor_size === '#8 AWG' ? '#6 AWG' : '#8 AWG';
      }],
      ['conflicting conductor material', proposal => { proposal.cables[0].conductorMaterial = 'aluminum'; }],
      ['conflicting conductor material alias', proposal => { proposal.cables[0].conductor_material = 'al'; }],
      ['conflicting impedance source alias', proposal => {
        proposal.cables[0].source = SOUTHWIRE_MC_SOURCE.revision;
        proposal.cables[0].impedanceBasis = 'a different cable source';
      }],
      ['connection electrical model', proposal => {
        const connection = proposal.oneLine.sheets[0].connections[0];
        connection.cable = { ...connection.cable, r_ohm_per_kft: 0.001 };
      }],
      ['component connection stock', proposal => {
        const component = proposal.oneLine.sheets[0].components.find(row => row.connections?.length);
        const connection = component.connections[0];
        connection.cable = { ...connection.cable, cableStockId: 'another-stock' };
      }],
      ['connection conductor-size alias', proposal => {
        const connection = proposal.oneLine.sheets[0].connections[0];
        connection.cable = { ...connection.cable, conductorSize: connection.cable.conductor_size === '#8 AWG' ? '#6 AWG' : '#8 AWG' };
      }],
      ['omitted source record with current catalog claims', proposal => { delete proposal.cableCatalogSource; }],
      ['malformed cable collection', proposal => { proposal.cables = {}; }],
      ['malformed drawing sheets', proposal => { proposal.oneLine.sheets = {}; }],
      ['malformed drawing connections', proposal => { proposal.oneLine.sheets[0].connections = {}; }],
      ['malformed drawing components', proposal => { proposal.oneLine.sheets[0].components = {}; }],
    ];
    for (const [label, mutate] of cases) {
      const proposal = structuredClone(valid);
      mutate(proposal);
      const before = project.captureProjectTransactionSnapshot();
      const preview = previewDesignProposal(proposal);
      assert.equal(preview.ok, false, `${label}: preview must identify the inconsistent source claim.`);
      assert.ok(preview.errors.some(error => /cable_catalog/.test(error.code)), `${label}: expected a cable-catalog diagnostic.`);
      const applied = applyDesignProposal(proposal, { previewContext: preview.context });
      assert.equal(applied.applied, false, label);
      assert.deepEqual(project.captureProjectTransactionSnapshot(), before, `${label}: validation must leave the complete transaction unchanged.`);
    }
  } finally {
    delete globalThis.window;
  }
});
