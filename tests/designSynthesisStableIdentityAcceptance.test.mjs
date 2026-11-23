import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';

function initialInput() {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  input.equipment = Array.from({ length: 25 }, (_, index) => ({
    ...input.equipment[0], id: `M-${String(index + 1).padStart(2, '0')}`, tag: `LOAD-${index + 1}`, kw: 10,
  }));
  input.criteria.maxLoadsPerPanel = 5;
  return input;
}

test('adding an earlier-sorted group retains every existing panel and its location override', () => {
  const input = initialInput();
  input.overrides = { panelLocations: { 'DP-01': { x: 120, y: 50, z: 0, note: 'Existing panel room' } } };
  const original = generateDesignProposal(input);
  assert.equal(original.status, 'proposal', JSON.stringify(original.issues));
  assert.equal(original.panels.length, 5);
  assert.equal(original.distributionBaseline.nextPanelNumber, 6);
  input.generationBaseline = original.distributionBaseline;
  input.equipment.unshift(...Array.from({ length: 5 }, (_, index) => ({
    ...input.equipment[0], id: `A-${index + 1}`, tag: `NEW-${index + 1}`,
  })));
  const before = structuredClone(input);
  const expanded = generateDesignProposal(input);
  assert.deepEqual(input, before);
  assert.equal(expanded.status, 'proposal', JSON.stringify(expanded.issues));
  assert.equal(expanded.panels.length, 6);
  assert.equal(expanded.cables.length, 36);
  for (const panel of original.panels) {
    const retained = expanded.panels.find(row => row.id === panel.id);
    assert.deepEqual(retained.loadIds, panel.loadIds);
    assert.deepEqual([retained.x, retained.y, retained.z], [panel.x, panel.y, panel.z]);
    for (const loadId of panel.loadIds) {
      assert.equal(expanded.loads.find(load => load.id === loadId).panelRef, panel.id);
      assert.equal(expanded.cables.find(cable => cable.loadId === loadId).from, panel.id);
    }
  }
  const newPanel = expanded.panels.find(panel => panel.loadIds.includes('A-1'));
  assert.equal(newPanel.id, 'DP-06');
  assert.equal(expanded.distributionBaseline.nextPanelNumber, 7);
  assert.equal(expanded.oneLine.sheets[0].connections.length, 36);
  assert.deepEqual(expanded.inputs.original.generationBaseline, original.distributionBaseline);
  const replay = generateDesignProposal(JSON.parse(JSON.stringify(expanded.inputs.original)));
  assert.equal(replay.inputSignature, expanded.inputSignature);
  assert.deepEqual(replay.panels, expanded.panels);
  const reordered = { ...input, equipment: [...input.equipment].reverse() };
  assert.deepEqual(generateDesignProposal(reordered).panels, expanded.panels);
});

test('removed identities are not reused and baseline affects proposal identity', () => {
  const input = initialInput();
  const original = generateDesignProposal(input);
  input.generationBaseline = original.distributionBaseline;
  input.equipment = input.equipment.filter(load => !original.panels[0].loadIds.includes(load.id));
  const reduced = generateDesignProposal(input);
  assert.equal(reduced.status, 'proposal');
  assert.ok(!reduced.panels.some(panel => panel.id === 'DP-01'));
  assert.equal(reduced.distributionBaseline.nextPanelNumber, 6);
  input.generationBaseline = reduced.distributionBaseline;
  input.equipment.push(...Array.from({ length: 5 }, (_, index) => ({
    ...input.equipment[0], id: `Z-${index + 1}`, tag: `LATER-${index + 1}`,
  })));
  const replacement = generateDesignProposal(input);
  assert.equal(replacement.status, 'proposal');
  assert.equal(replacement.panels.find(panel => panel.loadIds.includes('Z-1')).id, 'DP-06');
  const noHistory = structuredClone(input);
  delete noHistory.generationBaseline;
  assert.notEqual(replacement.inputSignature, generateDesignProposal(noHistory).inputSignature);
});

test('malformed identity history blocks before generation and cannot redirect overrides', () => {
  const malformed = [null, [], {}, { panels: [], nextPanelNumber: 0 },
    { panels: [{ id: 'DP-01', loadIds: ['M-01'] }, { id: 'dp-1', loadIds: ['M-02'] }], nextPanelNumber: 2 },
    { panels: [{ id: 'DP-01', loadIds: ['M-01'] }], nextPanelNumber: 1 },
    { panels: [{ id: 'DP-01', loadIds: [{}] }], nextPanelNumber: 2 },
  ];
  for (const generationBaseline of malformed) {
    const proposal = generateDesignProposal({ ...initialInput(), generationBaseline });
    assert.equal(proposal.status, 'blocked', JSON.stringify(generationBaseline));
    assert.equal(proposal.cables.length, 0);
    assert.ok(proposal.issues.some(issue => issue.severity === 'blocking' && issue.path.startsWith('generationBaseline')));
  }
});
