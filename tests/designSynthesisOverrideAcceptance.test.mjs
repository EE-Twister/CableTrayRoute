import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';

const sample = () => JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
const point = row => ({ x: row.x, y: row.y, z: row.z });
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('an explicit panel location regenerates geometry, thermal sizing, and electrical checks', () => {
  const input = sample();
  input.corridors.edges.find(edge => edge.id === 'E25').thermal = { ambientTempC: 40 };
  const automatic = generateDesignProposal(input);
  assert.equal(automatic.status, 'proposal');
  assert.deepEqual(point(automatic.panels.find(panel => panel.id === 'DP-01')), { x: 60, y: 0, z: 0 });
  input.overrides = { panelLocations: { 'DP-01': { x: 120, y: 50, z: 0, note: 'Use the designated electrical room.' } } };
  const before = structuredClone(input);
  const revised = generateDesignProposal(input);
  assert.deepEqual(input, before, 'Generation must not rewrite user override input');
  assert.equal(revised.status, 'proposal', JSON.stringify(revised.issues));
  assert.notEqual(revised.inputSignature, automatic.inputSignature);
  const selected = { x: 120, y: 50, z: 0 };
  assert.deepEqual(point(revised.panels.find(panel => panel.id === 'DP-01')), selected);
  assert.deepEqual(point(revised.equipment.find(item => item.tag === 'DP-01')), selected);
  const drawn = revised.oneLine.sheets.flatMap(sheet => sheet.components).find(item => item.id === 'DP-01');
  assert.deepEqual(point(drawn.physical), selected);
  assert.notDeepEqual({ x: drawn.x, y: drawn.y }, { x: selected.x, y: selected.y }, 'Drawing layout is distinct from physical placement');
  const decision = revised.panelLocationOverrides.find(row => row.panelId === 'DP-01');
  assert.deepEqual(decision.automaticLocation, { x: 60, y: 0, z: 0 });
  assert.deepEqual(decision.requestedLocation, selected);
  assert.deepEqual(decision.effectiveLocation, selected);
  assert.equal(decision.status, 'evaluated');
  const feeder = revised.cables.find(cable => cable.id === 'F-DP-01');
  const branch = revised.cables.find(cable => cable.id === 'C-M-01');
  assert.equal(automatic.cables.find(cable => cable.id === feeder.id).conductor_size, '600 kcmil');
  assert.equal(feeder.conductor_size, '750 kcmil', 'The newly traversed 40 C segment must drive feeder resizing');
  assert.deepEqual(feeder.routingDecision.selectedPath, ['E01', 'E12', 'E25']);
  near(feeder.length, 170);
  near(branch.length, 110 + Math.hypot(20, 20));
  const pf = revised.loads.filter(load => load.panelRef === 'DP-01').reduce((sum, load) => sum + load.kw, 0)
    / revised.panels.find(panel => panel.id === 'DP-01').loadKva;
  // Independent manufacturer R/X transcription for 750 kcmil, ohm/1000 ft.
  const expectedDrop = 100 * Math.sqrt(3) * feeder.currentA * 0.170
    * (0.019 * pf + 0.038 * Math.sqrt(1 - pf ** 2)) / 480;
  near(feeder.voltageDropPct, expectedDrop);
  assert.equal(feeder.thermalAssessment.limitingSegmentId, 'E25');
  assert.ok(branch.combinedVoltageDropPct <= input.criteria.voltageDropLimitPct);
  for (const route of revised.routeResults.batchResults) {
    const cable = revised.cables.find(item => item.tag === route.cable);
    near(route.total_length, cable.length);
  }
  delete input.overrides;
  const restored = generateDesignProposal(input);
  assert.equal(restored.inputSignature, automatic.inputSignature);
  assert.deepEqual(restored.panels, automatic.panels);
  assert.deepEqual(restored.cables, automatic.cables);
});

test('malformed, unsupported, and unknown panel overrides block rather than disappearing', () => {
  const invalid = [
    null,
    [],
    { routeLocks: {} },
    { panelLocations: [] },
    { panelLocations: { 'DP-01': null } },
    { panelLocations: { 'DP-01': { x: 0, y: 0 } } },
    { panelLocations: { 'DP-01': { x: '', y: 0, z: 0 } } },
    { panelLocations: { 'DP-01': { x: Infinity, y: 0, z: 0 } } },
    { panelLocations: { 'DP-01': { x: 0, y: 0, z: 0, note: {} } } },
    { panelLocations: { 'DP-01': { x: 0, y: 0, z: 0, approved: true } } },
    { panelLocations: { 'DP-99': { x: 0, y: 0, z: 0 } } },
    { panelLocations: { 'DP-01': { x: 0, y: 0, z: 0 }, 'dp-01': { x: 0, y: 0, z: 0 } } },
  ];
  for (const overrides of invalid) {
    const proposal = generateDesignProposal({ ...sample(), overrides });
    assert.equal(proposal.status, 'blocked', JSON.stringify(overrides));
    assert.ok(proposal.issues.some(issue => issue.severity === 'blocking' && String(issue.path).startsWith('overrides')));
    assert.ok(proposal.loadDispositions.every(row => row.status !== 'accepted'));
  }
});

test('a location outside the permitted corridor attachment distance is not silently replaced', () => {
  const input = sample();
  input.overrides = { panelLocations: { 'DP-01': { x: 10000, y: 10000, z: 0 } } };
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(issue => issue.code === 'ENDPOINT_OUTSIDE_CORRIDOR'));
  assert.deepEqual(point(proposal.panels.find(panel => panel.id === 'DP-01')), input.overrides.panelLocations['DP-01']);
  assert.ok(!proposal.loadDispositions.some(row => row.status === 'accepted'));
});
