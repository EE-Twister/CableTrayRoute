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

for (const count of [25, 50]) test(`${count}-load alternate connections survive Apply, named reload, and regeneration`, () => {
  values.clear(); peakBytes = 0;
  project.restoreProjectTransactionSnapshot(empty);
  project.setProjectState(project.defaultProject(), { captureUndo: false });
  const name = `Alternate routes ${count}`;
  globalThis.window = { currentProjectId: name, dispatchEvent() {} };
  try {
    store.setProjectMeta({ id: name, name });
    assert.equal(store.saveProject(name), true);
    const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
    const base = input.equipment;
    input.equipment = Array.from({ length: count }, (_, i) => ({ ...base[i % base.length], id: `L-${i}`, tag: `L-${i}`, kw: 1, x: 20, y: 0, z: 0 }));
    Object.assign(input.supply, { id: 'S', x: 0, y: 0, z: 0 });
    Object.assign(input.criteria, { maxEndpointAttachmentFt: 4, allowAlternateEndpointAttachments: true });
    input.corridors = { nodes: [{ id: 'N0', x: 0, y: 0, z: 0 }, { id: 'NA', x: 3, y: 0, z: 0 }, { id: 'N1', x: 20, y: 0, z: 0 }], edges: [{ id: 'A1', from: 'NA', to: 'N1', widthIn: 24, depthIn: 6, permitted: true }] };
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
    const selected = proposal.cables.find(row => !row.loadId);
    const expected = selected.routingDecision.alternateEndpointAttachments;
    const preview = previewDesignProposal(proposal);
    assert.equal(preview.ok, true, JSON.stringify(preview.errors || preview.conflicts));
    assert.equal(applyDesignProposal(proposal, { previewContext: preview.context }).applied, true);
    const verify = () => {
      const cable = store.getCables().find(row => row.tag === selected.id);
      assert.deepEqual(cable.routingDecision.alternateEndpointAttachments, expected);
      const routes = store.getItem('latestRouteResults').batchResults;
      assert.deepEqual(routes.find(row => row.cable === selected.id).routingDecision.alternateEndpointAttachments, expected);
    };
    verify();
    assert.equal(store.loadProject(name), true);
    verify();
    const regenerated = generateDesignProposal(input);
    assert.deepEqual(regenerated.cables.find(row => row.id === selected.id).routingDecision.alternateEndpointAttachments, expected);
    assert.ok(peakBytes <= 5 * 1024 * 1024);
  } finally { delete globalThis.window; }
});
