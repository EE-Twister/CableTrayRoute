import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createConnectionProtectionOverlay, resolveConnectionProtection } from '../src/one-line/connectionProtection.mjs';

const local = new Map();
const session = new Map();
function storage(values) {
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
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
const { previewDesignProposal, applyDesignProposal } = await import('../src/design-synthesis/applyProposal.mjs');

function fixture(count) {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const originals = input.equipment;
  input.equipment = Array.from({ length: count }, (_, index) => ({ ...originals[index % originals.length], id: `LOAD-${index}`, tag: `LOAD-${index}`, kw: 1 }));
  return input;
}

function applied(count) {
  store.setProjectMeta({ name: `One-line protection ${count}` });
  const proposal = generateDesignProposal(fixture(count));
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  const preview = previewDesignProposal(proposal);
  const result = applyDesignProposal(proposal, { previewContext: preview.context });
  assert.equal(result.applied, true, JSON.stringify(result.errors));
  const sheet = store.getOneLine().sheets[0];
  const cables = store.getCables();
  const evidence = store.getItem('designSynthesisDeviceEvidence', {});
  const connections = sheet.components.flatMap(source => (source.connections || []).map(connection => ({ source, connection, target: sheet.components.find(row => row.id === connection.target) })));
  return { proposal, cables, evidence, connections };
}

for (const count of [25, 50]) test(`${count}-load applied drawing resolves every candidate from its current cable and evidence`, () => {
  const snapshot = project.captureProjectTransactionSnapshot();
  try {
    const { proposal, cables, evidence, connections } = applied(count);
    assert.equal(connections.length, proposal.cables.length);
    const before = JSON.stringify({ cables, evidence, connections });
    for (const row of connections) {
      const result = resolveConnectionProtection({ ...row, cables, evidence });
      assert.equal(result?.status, 'candidate', JSON.stringify({ source: row.source.id, connection: row.connection, result }));
      const original = proposal.cables.find(cable => cable.id.toLowerCase() === String(row.connection.cableId).toLowerCase());
      assert.deepEqual(result.device, original.protectiveDevice);
      assert.equal(result.device.libraryStatus, 'screening');
    }
    assert.equal(JSON.stringify({ cables, evidence, connections }), before, 'Reading the evidence must not mutate project data');
  } finally { project.restoreProjectTransactionSnapshot(snapshot); }
});

test('unresolved, ambiguous, reconnected and tampered project records cannot present an old candidate', () => {
  const snapshot = project.captureProjectTransactionSnapshot();
  try {
    const { cables, evidence, connections } = applied(25);
    const original = connections.find(row => row.connection.cableId && row.target);
    const resolve = (row = original, cableRows = cables, map = evidence) => resolveConnectionProtection({ ...row, cables: cableRows, evidence: map });
    assert.equal(resolve().status, 'candidate');
    const wrongReference = structuredClone(original);
    wrongReference.connection.cableId = 'WRONG-CIRCUIT';
    assert.equal(resolve(wrongReference).status, 'cable-unresolved');
    assert.equal(resolve(original, [...cables, structuredClone(cables.find(row => row.tag === original.connection.cableId))]).status, 'cable-unresolved');
    const wrongEndpoint = structuredClone(original);
    wrongEndpoint.connection.cable.to = 'OTHER-LOAD';
    assert.equal(resolve(wrongEndpoint).status, 'endpoint-mismatch');
    const changedCable = structuredClone(cables);
    const target = changedCable.find(row => row.tag === original.connection.cableId);
    target.protectiveDevice.interruptingRatingKA += 1;
    assert.equal(resolve(original, changedCable).status, 'evidence-unavailable');
    assert.equal(resolve(original, cables, {}).status, 'evidence-unavailable');
    const noRef = structuredClone(cables);
    delete noRef.find(row => row.tag === original.connection.cableId).protectiveDeviceEvidenceRef;
    assert.equal(resolve(original, noRef).status, 'evidence-unavailable');
    const unrelated = { source: { id: 'S' }, target: { id: 'L' }, connection: { target: 'L' } };
    assert.equal(resolve(unrelated), null);
  } finally { project.restoreProjectTransactionSnapshot(snapshot); }
});

test('optional drawing labels use current evidence and never treat a missing candidate as a selected device', () => {
  const snapshot = project.captureProjectTransactionSnapshot();
  try {
    const { cables, evidence, connections } = applied(25);
    const row = connections[0];
    const handlers = new Map();
    const toggle = { checked: false, addEventListener: (type, callback) => handlers.set(type, callback) };
    let currentCables = cables;
    let currentEvidence = evidence;
    let renders = 0;
    let reads = 0;
    const overlay = createConnectionProtectionOverlay({
      toggle, on: (event, callback) => handlers.set(event, callback), cableEvent: 'cables',
      getCables: () => { reads++; return currentCables; }, getEvidence: () => currentEvidence,
      render: () => { renders++; },
    });
    const label = () => overlay.forRender()(row.source, row.target, row.connection);
    assert.equal(label(), '');
    assert.equal(reads, 0);
    handlers.get('cables')();
    assert.equal(renders, 0);
    toggle.checked = true;
    handlers.get('change')();
    assert.equal(renders, 1);
    assert.match(label(), /^\[PROPOSED DEVICE: .+\]$/);
    currentEvidence = {};
    handlers.get('designSynthesisDeviceEvidence')();
    assert.equal(renders, 2);
    assert.equal(label(), '[DEVICE CANDIDATE UNAVAILABLE]');
    currentEvidence = evidence;
    currentCables = [];
    handlers.get('cables')();
    assert.equal(label(), '[DEVICE CANDIDATE UNAVAILABLE]');
    toggle.checked = false;
    assert.equal(label(), '');
  } finally { project.restoreProjectTransactionSnapshot(snapshot); }
});
