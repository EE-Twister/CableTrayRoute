import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';

const values = new Map();
let peakBytes = 0;
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem(key, value) {
    const next = new Map(values).set(key, String(value));
    const bytes = [...next].reduce((sum, [name, item]) => sum + 2 * (name.length + item.length), 0);
    peakBytes = Math.max(peakBytes, bytes);
    if (bytes > 5 * 1024 * 1024) { const error = new Error('Synthetic storage quota exceeded'); error.name = 'QuotaExceededError'; throw error; }
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

function fixture(count, mode) {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-tray-congestion.json', import.meta.url), 'utf8'));
  input.equipment = Array.from({ length: count }, (_, index) => ({ ...input.equipment[0], id: `L-${String(index + 1).padStart(2, '0')}`, tag: `L-${String(index + 1).padStart(2, '0')}` }));
  input.equipment[count - 1].x = 10;
  input.corridors.nodes.push({ id: 'R', x: 10, y: 0, z: 0 });
  input.corridors.edges = [{ id: 'SCARCE', from: 'N0', to: 'R', widthIn: 6, depthIn: 6, permitted: true }, { id: 'SHORT-END', from: 'R', to: 'N1', widthIn: 6, depthIn: 6, permitted: true }, ...input.corridors.edges.filter(edge => edge.id.startsWith('BYPASS'))];
  if (mode === 'cross-panel') {
    input.criteria.maxLoadsPerPanel = 12;
    input.overrides.panelLocations = Object.fromEntries(Array.from({ length: Math.ceil(count / 12) }, (_, index) => [`DP-${String(index + 1).padStart(2, '0')}`, { x: 0, y: 0, z: 0 }]));
  }
  if (mode === 'feeder') {
    input.criteria.maxLoadsPerPanel = count - 1;
    input.overrides.panelLocations = { 'DP-01': { x: 0, y: 0, z: 0 }, 'DP-02': { x: 10, y: 0, z: 0 } };
  }
  if (mode === 'transformer-primary') {
    input.equipment = input.equipment.slice(0, count - 2);
    for (let index = 1; index <= 2; index += 1) input.equipment.push({ ...input.equipment[0], id: `T-${index}`, tag: `T-${index}`, voltage: 208, kw: 0.5, x: 10 });
    input.overrides.panelLocations = { 'DP-01': { x: 0, y: 0, z: 0 }, 'DP-02': { x: 10, y: 0, z: 0 } };
  }
  return input;
}

for (const count of [25, 50]) for (const mode of ['single-panel', 'cross-panel', 'feeder', 'transformer-primary']) test(`${count}-load ${mode} recovered routing applies, reloads and regenerates with its retry evidence`, () => {
  values.clear(); peakBytes = 0;
  project.restoreProjectTransactionSnapshot(empty);
  project.setProjectState(project.defaultProject(), { captureUndo: false });
  const name = `Capacity retry ${count}`;
  globalThis.window = { currentProjectId: name, dispatchEvent() {} };
  try {
    store.setProjectMeta({ id: name, name });
    assert.equal(store.saveProject(name), true);
    const input = fixture(count, mode);
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
    if (mode === 'cross-panel') assert.deepEqual(proposal.routingRetry.prioritizedPanelIds, [`DP-${String(Math.ceil(count / 12)).padStart(2, '0')}`]);
    if (mode === 'feeder') assert.deepEqual(proposal.routingRetry.prioritizedFeederPanelIds, ['DP-02']);
    if (mode === 'transformer-primary') assert.equal(proposal.routingRetry.prioritizedTransformerPrimaryId, proposal.cables.find(cable => cable.transformerSide === 'primary').id);
    const preview = previewDesignProposal(proposal);
    assert.equal(preview.ok, true, JSON.stringify(preview.errors || preview.conflicts));
    const result = applyDesignProposal(proposal, { previewContext: preview.context });
    assert.equal(result.applied, true, JSON.stringify(result.errors));
    assert.deepEqual(store.getItem('designSynthesisLastApplied').routingRetry, proposal.routingRetry);
    assert.equal(store.getCables().filter(cable => cable.loadId).length, count);
    assert.equal(store.loadProject(name), true);
    assert.deepEqual(store.getItem('designSynthesisLastApplied').routingRetry, proposal.routingRetry);
    const regenerated = generateDesignProposal(input);
    assert.deepEqual(regenerated.routingRetry, proposal.routingRetry);
    assert.deepEqual(regenerated.cables.map(row => [row.id, row.routingDecision.selectedPath]), proposal.cables.map(row => [row.id, row.routingDecision.selectedPath]));
    assert.ok(peakBytes <= 5 * 1024 * 1024);
  } finally { delete globalThis.window; }
});
