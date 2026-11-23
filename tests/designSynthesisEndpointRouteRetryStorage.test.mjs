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

for (const count of [25, 50]) test(`${count}-load same-anchor conduit retry survives Apply, named reload, and regeneration`, () => {
  values.clear(); peakBytes = 0;
  project.restoreProjectTransactionSnapshot(empty);
  project.setProjectState(project.defaultProject(), { captureUndo: false });
  const name = `Conduit retry ${count}`;
  globalThis.window = { currentProjectId: name, dispatchEvent() {} };
  try {
    store.setProjectMeta({ id: name, name });
    assert.equal(store.saveProject(name), true);
    const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
    const original = input.equipment;
    input.equipment = Array.from({ length: count }, (_, i) => ({ ...original[i % original.length], id: `L-${i}`, tag: `L-${i}`, kw: 25 / count, powerFactor: 0.9, voltage: 480, phases: 3, x: 100, y: 0, z: 0 }));
    Object.assign(input.supply, { id: 'S', x: 0, y: 0, z: 0 });
    Object.assign(input.criteria, { maxEndpointAttachmentFt: 2.1, allowAlternateEndpointAttachments: true, maxLoadsPerPanel: 50, maxPanelLoadKva: 500, voltageDropLimitPct: 3, endpointInstallation: { method: 'dedicated-emt', maximumTradeSize: '1-1/2' } });
    input.corridors = { nodes: [{ id: 'A', x: 1, y: 0, z: 0 }, { id: 'C', x: 50, y: 70, z: 0 }, { id: 'X', x: 100, y: 0, z: 0 }], edges: [
      { id: 'HOT', from: 'A', to: 'X', widthIn: 24, depthIn: 6, permitted: true, thermal: { ambientTempC: 60 } },
      { id: 'AC', from: 'A', to: 'C', widthIn: 24, depthIn: 6, permitted: true }, { id: 'CX', from: 'C', to: 'X', widthIn: 24, depthIn: 6, permitted: true },
    ] };
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
    const cable = proposal.cables.find(row => !row.loadId);
    const expected = cable.routingDecision.endpointInstallationRetry;
    assert.ok(expected);
    const preview = previewDesignProposal(proposal);
    assert.equal(preview.ok, true, JSON.stringify(preview.errors || preview.conflicts));
    assert.equal(applyDesignProposal(proposal, { previewContext: preview.context }).applied, true);
    const verify = () => {
      const savedCable = store.getCables().find(row => row.tag === cable.id);
      assert.deepEqual(savedCable.routingDecision.endpointInstallationRetry, expected);
      const route = store.getItem('latestRouteResults').batchResults.find(row => row.cable === cable.id);
      assert.deepEqual(route.routingDecision.endpointInstallationRetry, expected);
    };
    verify();
    assert.equal(store.loadProject(name), true);
    verify();
    assert.deepEqual(generateDesignProposal(input).cables.find(row => row.id === cable.id).routingDecision.endpointInstallationRetry, expected);
    assert.ok(peakBytes <= 5 * 1024 * 1024);
  } finally { delete globalThis.window; }
});

for (const count of [25, 50]) test(`${count}-load shortest alternate selection survives Apply and named reload`, () => {
  values.clear(); peakBytes = 0;
  project.restoreProjectTransactionSnapshot(empty);
  project.setProjectState(project.defaultProject(), { captureUndo: false });
  const name = `Short alternate ${count}`;
  globalThis.window = { currentProjectId: name, dispatchEvent() {} };
  try {
    store.setProjectMeta({ id: name, name });
    assert.equal(store.saveProject(name), true);
    const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
    const original = input.equipment;
    input.equipment = Array.from({ length: count }, (_, i) => ({ ...original[i % original.length], id: `L-${i}`, tag: `L-${i}`, kw: 25 / count, powerFactor: 0.9, voltage: 480, phases: 3, x: 100, y: 0, z: 0 }));
    Object.assign(input.supply, { id: 'S', x: 0, y: 0, z: 0 });
    Object.assign(input.criteria, { maxEndpointAttachmentFt: 2.1, allowAlternateEndpointAttachments: true, maxLoadsPerPanel: 50, maxPanelLoadKva: 500, voltageDropLimitPct: 3, endpointInstallation: { method: 'dedicated-emt', maximumTradeSize: '2' } });
    input.corridors = { nodes: [{ id: 'N0', x: 0, y: 0, z: 0 }, { id: 'A', x: 1, y: 0, z: 0 }, { id: 'B', x: 0, y: 2, z: 0 }, { id: 'C', x: 1, y: 1000, z: 0 }, { id: 'X', x: 100, y: 0, z: 0 }], edges: [
      { id: 'AC', from: 'A', to: 'C', widthIn: 24, depthIn: 6, permitted: true }, { id: 'CX', from: 'C', to: 'X', widthIn: 24, depthIn: 6, permitted: true }, { id: 'BX', from: 'B', to: 'X', widthIn: 24, depthIn: 6, permitted: true },
    ] };
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
    const cable = proposal.cables.find(row => !row.loadId);
    const expected = cable.routingDecision.alternateEndpointAttachments;
    assert.equal(expected.sourceNode, 'B');
    const preview = previewDesignProposal(proposal);
    assert.equal(preview.ok, true, JSON.stringify(preview.errors || preview.conflicts));
    assert.equal(applyDesignProposal(proposal, { previewContext: preview.context }).applied, true);
    const verify = () => {
      assert.deepEqual(store.getCables().find(row => row.tag === cable.id).routingDecision.alternateEndpointAttachments, expected);
      assert.deepEqual(store.getItem('latestRouteResults').batchResults.find(row => row.cable === cable.id).routingDecision.alternateEndpointAttachments, expected);
    };
    verify();
    assert.equal(store.loadProject(name), true);
    verify();
    assert.deepEqual(generateDesignProposal(input).cables.find(row => row.id === cable.id).routingDecision.alternateEndpointAttachments, expected);
    assert.ok(peakBytes <= 5 * 1024 * 1024);
  } finally { delete globalThis.window; }
});
