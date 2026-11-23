import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const stores = { local: new Map(), session: new Map() };
function storage(map) {
  return { getItem: key => map.has(key) ? map.get(key) : null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key), key: index => [...map.keys()][index] || null, get length() { return map.size; } };
}
globalThis.localStorage = storage(stores.local);
globalThis.sessionStorage = storage(stores.session);

const dataStore = await import('../dataStore.mjs');
const { applyDesignProposal, previewDesignProposal } = await import('../src/design-synthesis/applyProposal.mjs');
const { initializeProjectStorage, undoProjectChange, redoProjectChange, canUndo, canRedo } = await import('../projectStorage.js');
await initializeProjectStorage();

function projectView() {
  return {
    equipment: dataStore.getEquipment(),
    loads: dataStore.getLoads(),
    panels: dataStore.getPanels(),
    cables: dataStore.getCables(),
    trays: dataStore.getTrays(),
    oneLine: dataStore.getOneLine(),
    routes: dataStore.getItem('latestRouteResults', {}),
    lastApplied: dataStore.getItem('designSynthesisLastApplied', {}),
  };
}

describe('design proposal canonical apply', () => {
  it('applies and reapplies a 30-load proposal as one operation', () => {
    dataStore.setProjectMeta({ name: 'design-apply-test' });
    dataStore.setEquipment([{ id: 'manual-eq', tag: 'MANUAL' }]);
    dataStore.setOneLine({ activeSheet: 0, sheets: [{ name: 'Manual', components: [{ id: 'manual-component', label: 'keep' }], connections: [] }] });
    dataStore.setItem('latestRouteResults', { batchResults: [{ id: 'unrelated-route', status: 'manual' }] });
    const loads = Array.from({ length: 30 }, (_, index) => ({ id: `L-${index}`, tag: `L-${index}`, kw: 10, voltage: 480, phases: 3 }));
    const proposal = { schemaVersion: '1.0.0', status: 'proposal', inputSignature: 'draft-30', inputs: {}, equipment: [], loads, panels: [{ id: 'P-1', tag: 'P-1' }], cables: [], trays: [], oneLine: { activeSheet: 0, sheets: [{ name: 'Generated', components: [{ id: 'generated-component' }], connections: [] }] }, routeResults: { batchResults: [{ id: 'generated-route', status: 'routed' }] } };
    const context = previewDesignProposal(proposal).context;
    const applied = applyDesignProposal(proposal, { previewContext: context });
    assert.equal(applied.applied, true, JSON.stringify(applied.errors || applied.conflicts));
    assert.equal(dataStore.getLoads().length, 30);
    assert.equal(dataStore.getOneLine().sheets.some(sheet => sheet.name === 'Manual'), true);
    assert.equal(dataStore.getItem('latestRouteResults', {}).batchResults.some(row => row.id === 'unrelated-route'), true);
    const second = applyDesignProposal(proposal, { previewContext: previewDesignProposal(proposal).context });
    assert.equal(second.applied, true, JSON.stringify(second.errors || second.conflicts));
  });

  it('retains connections, removes obsolete generated graph items, and rejects edits', () => {
    const proposal = { schemaVersion: '1.0.0', status: 'proposal', inputSignature: 'graph-draft', inputs: {}, equipment: [], loads: [], panels: [], cables: [], trays: [], oneLine: { activeSheet: 0, sheets: [{ name: 'Graph', components: [{ id: 'node-a' }, { id: 'node-b' }], connections: [{ id: 'edge-ab', source: 'node-a', target: 'node-b' }] }] } };
    let result = applyDesignProposal(proposal, { previewContext: previewDesignProposal(proposal).context });
    assert.equal(result.applied, true, JSON.stringify(result.errors || result.conflicts));
    assert.equal(dataStore.getOneLine().sheets.find(sheet => sheet.name === 'Graph').connections.length, 1);
    assert.equal(dataStore.getItem('designSynthesisLastApplied', {}).oneLine.Graph.components['node-b'].label, undefined);
    const currentLine = dataStore.getOneLine();
    currentLine.sheets.find(sheet => sheet.name === 'Graph').components.find(item => item.id === 'node-b').label = 'edited';
    dataStore.setOneLine(currentLine);
    result = applyDesignProposal(proposal, { previewContext: previewDesignProposal(proposal).context });
    assert.equal(result.applied, false, JSON.stringify({ result, oneLine: dataStore.getOneLine() }));
    assert.equal(result.errors.some(error => error.code === 'derived_record_conflict'), true);
    assert.equal(dataStore.getOneLine().sheets.find(sheet => sheet.name === 'Graph').components.find(item => item.id === 'node-b').label, 'edited');
  });

  it('rejects ambiguous normalized one-line sheet identities without mutation', () => {
    const before = dataStore.getOneLine();
    const proposal = {
      schemaVersion: '1.0.0', status: 'proposal', inputSignature: 'ambiguous-sheet', inputs: {},
      equipment: [], loads: [], panels: [], cables: [], trays: [],
      oneLine: { activeSheet: 0, sheets: [
        { name: 'Manual A', components: [], connections: [] },
        { name: 'Manual-A', components: [], connections: [] },
      ] },
    };
    const preview = previewDesignProposal(proposal);
    assert.equal(preview.ok, false);
    assert.ok(preview.errors.some(error => error.code === 'derived_record_conflict'));
    assert.deepEqual(dataStore.getOneLine(), before);
  });

  it('rejects missing signatures and changed preview context without mutation', () => {
    const missing = { schemaVersion: '1.0.0', status: 'proposal', inputs: {}, equipment: [], loads: [], panels: [], cables: [], trays: [] };
    const before = dataStore.getEquipment();
    const preview = previewDesignProposal(missing);
    assert.equal(preview.ok, false);
    assert.equal(applyDesignProposal(missing, { previewContext: preview.context }).applied, false);
    const proposal = { ...missing, inputSignature: 'context-draft' };
    const context = previewDesignProposal(proposal).context;
    const changed = applyDesignProposal(proposal, { previewContext: { ...context, projectFingerprint: 'changed' } });
    assert.equal(changed.applied, false);
    assert.deepEqual(dataStore.getEquipment(), before);
  });

  it('records apply as one undo and redo operation across all domains', () => {
    const proposal = { schemaVersion: '1.0.0', status: 'proposal', inputSignature: 'undo-draft', inputs: {},
      equipment: [{ id: 'undo-eq', tag: 'UNDO-EQ' }], loads: [{ id: 'undo-load', tag: 'UNDO-L', kw: 5, voltage: 480, phases: 3 }],
      panels: [{ id: 'undo-panel', tag: 'UNDO-P' }], cables: [{ id: 'undo-cable', tag: 'UNDO-C', from: 'undo-panel', to: 'undo-load' }],
      trays: [{ id: 'undo-tray', tray_id: 'undo-tray', width: 12 }],
      oneLine: { activeSheet: 0, sheets: [{ name: 'Undo graph', components: [{ id: 'undo-node' }], connections: [{ id: 'undo-edge', source: 'undo-node', target: 'undo-load' }] }] },
      routeResults: { batchResults: [{ id: 'undo-route', status: 'routed' }] } };
    const before = projectView();
    const preview = previewDesignProposal(proposal);
    const applied = applyDesignProposal(proposal, { previewContext: preview.context });
    assert.equal(applied.applied, true, JSON.stringify(applied.errors || applied.conflicts));
    const after = projectView();
    assert.equal(after.equipment.some(item => item.id === 'undo-eq'), true);
    assert.equal(after.routes.batchResults.some(item => item.id === 'undo-route'), true);
    assert.equal(canUndo(), true);
    undoProjectChange();
    assert.equal(canRedo(), true);
    assert.deepEqual(projectView(), before);
    redoProjectChange();
    assert.deepEqual(projectView(), after);
  });

  it('rejects a scenario change after preview', () => {
    const proposal = { schemaVersion: '1.0.0', status: 'proposal', inputSignature: 'scenario-draft', inputs: {}, equipment: [], loads: [], panels: [], cables: [], trays: [] };
    const preview = previewDesignProposal(proposal);
    dataStore.switchScenario('design-apply-other');
    const result = applyDesignProposal(proposal, { previewContext: preview.context });
    dataStore.switchScenario('base');
    assert.equal(result.applied, false);
    assert.equal(result.errors.some(error => error.code === 'stale_project_context'), true);
  });
});
