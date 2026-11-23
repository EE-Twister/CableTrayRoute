import test from 'node:test';
import assert from 'node:assert/strict';
import { corridorPermission, editCorridorGraph, renderCorridorEditor } from '../src/design-synthesis/corridorEditor.js';

test('corridor table edits preserve unrelated graph and edge data without guessing permissions', () => {
  const original = { coordinateUnit: 'ft', nodes: [{ id: 'A', x: 0, y: 0, z: 0, note: 'owner' }, { id: 'B', x: 10, y: 0, z: 0 }], edges: [{ id: 'E', from: 'A', to: 'B', widthIn: 12, depthIn: 6, allowed: true, thermal: { ambientTempC: 40 } }] };
  const renamed = editCorridorGraph(original, { action: 'edit', kind: 'nodes', index: 0, field: 'id', value: 'A2' });
  assert.equal(renamed.nodes[0].note, 'owner');
  assert.equal(renamed.edges[0].from, 'A', 'Changing a node does not silently rewrite edge references');
  assert.equal(original.nodes[0].id, 'A');
  const edited = editCorridorGraph(renamed, { action: 'edit', kind: 'edges', index: 0, field: 'widthIn', value: '18' });
  assert.equal(edited.edges[0].widthIn, 18);
  assert.deepEqual(edited.edges[0].thermal, { ambientTempC: 40 });
  assert.equal(edited.edges[0].allowed, true);
  const added = editCorridorGraph(edited, { action: 'add', kind: 'edges' });
  assert.deepEqual(added.edges.at(-1), { id: '', from: '', to: '', widthIn: '', depthIn: '', permitted: false });
  const allowed = editCorridorGraph(added, { action: 'edit', kind: 'edges', index: 0, field: 'permission', value: 'closed' });
  assert.equal(allowed.edges[0].permitted, false);
  assert.equal('allowed' in allowed.edges[0], false);
  assert.equal(editCorridorGraph(allowed, { action: 'remove', kind: 'nodes', index: 0 }).edges.length, 2);
  assert.equal(editCorridorGraph(original, { action: 'edit', kind: 'edges', index: 4, field: 'id', value: 'x' }), null);
});

test('invalid permission data stays invalid until an explicit correction', () => {
  for (const edge of [{ permitted: 'false' }, { permitted: true, allowed: false }, { allowed: null }]) assert.equal(corridorPermission(edge), 'invalid');
  assert.equal(corridorPermission({}), 'unspecified');
  assert.equal(corridorPermission({ allowed: false }), 'closed');
  const graph = { nodes: [], edges: [{ id: 'x', permitted: 'false', allowed: true }] };
  assert.match(renderCorridorEditor(graph), /Invalid or conflicting/);
  const corrected = editCorridorGraph(graph, { action: 'edit', kind: 'edges', index: 0, field: 'permission', value: 'allowed' });
  assert.deepEqual(corrected.edges[0], { id: 'x', permitted: true });
  assert.deepEqual(graph.edges[0], { id: 'x', permitted: 'false', allowed: true });
});

test('the table escapes project text and does not replace malformed graphs', () => {
  assert.match(renderCorridorEditor({ nodes: [{ id: '<img src=x>', x: 0, y: 0, z: 0 }], edges: [] }), /&lt;img src=x&gt;/);
  assert.match(renderCorridorEditor({ nodes: 'bad', edges: [] }), /must be arrays/);
  assert.equal(editCorridorGraph({ nodes: 'bad', edges: [] }, { action: 'add', kind: 'nodes' }), null);
  assert.deepEqual(editCorridorGraph({ note: 'owner' }, { action: 'initialize' }), { note: 'owner', nodes: [], edges: [] });
  assert.equal(editCorridorGraph({ nodes: [], edges: 'bad' }, { action: 'initialize' }), null);
  const graph = { nodes: [{ id: 'A', x: 1, y: 2, z: 3 }], edges: [] };
  assert.equal(editCorridorGraph(graph, { action: 'edit', kind: 'nodes', index: 0, field: 'x', value: '' }).nodes[0].x, '');
});
