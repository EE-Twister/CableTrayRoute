import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { validatePanelLocationOverrides } from '../analysis/designSynthesisOverrides.mjs';

const sample = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));

test('panel location override is applied before dependent routing and retained as evidence', () => {
  const input = structuredClone(sample);
  input.overrides = { panelLocations: { 'dp-01': { x: 120, y: 10, z: 12, note: 'coordination layout' } } };
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal');
  const panel = proposal.panels.find(item => item.id === 'DP-01');
  assert.deepEqual({ x: panel.x, y: panel.y, z: panel.z }, { x: 120, y: 10, z: 12 });
  assert.deepEqual(panel.locationOverride, { x: 120, y: 10, z: 12, note: 'coordination layout' });
  const evidence = proposal.panelLocationOverrides.find(item => item.panelId === 'DP-01');
  assert.deepEqual(evidence.requestedLocation, { x: 120, y: 10, z: 12 });
  assert.deepEqual(evidence.effectiveLocation, { x: 120, y: 10, z: 12 });
  assert.equal(evidence.status, 'evaluated');
  assert.ok(proposal.inputs.original.overrides.panelLocations['dp-01']);
  assert.ok(panel.routeResult.lengthFt > 60);
  assert.equal(proposal.cables.some(cable => cable.sizingStatus === 'screening-sized'), true);
});

test('automatic panel locations remain explicitly evidenced when no override is supplied', () => {
  const proposal = generateDesignProposal(sample);
  assert.equal(proposal.status, 'proposal');
  assert.ok(proposal.panelLocationOverrides.length > 0);
  for (const row of proposal.panelLocationOverrides) {
    assert.deepEqual(row.requestedLocation, null);
    assert.deepEqual(row.effectiveLocation, row.automaticLocation);
    assert.equal(row.status, 'evaluated');
  }
});

test('panel location overrides reject unknown fields, duplicate casing, unknown ids, and malformed coordinates', () => {
  const malformed = validatePanelLocationOverrides({
    extra: true,
    panelLocations: {
      'DP-01': { x: 1, y: 2, z: 3, unexpected: 4 },
      'dp-01': { x: Infinity, y: 2, z: 3 },
      'DP-99': { x: 1, y: 2, z: 3, note: 4 },
    },
  }, { knownPanelIds: new Set(['DP-01']) });
  assert.equal(malformed.ok, false);
  assert.ok(malformed.issues.some(issue => issue.code === 'UNKNOWN_OVERRIDE_FIELD'));
  assert.ok(malformed.issues.some(issue => issue.code === 'DUPLICATE_PANEL_OVERRIDE_ID'));
  assert.ok(malformed.issues.some(issue => issue.code === 'UNKNOWN_PANEL_OVERRIDE_ID'));
  assert.ok(malformed.issues.some(issue => issue.code === 'INVALID_PANEL_LOCATION_COORDINATE'));
  assert.ok(malformed.issues.some(issue => issue.code === 'UNKNOWN_PANEL_LOCATION_FIELD'));
  assert.ok(malformed.issues.some(issue => issue.code === 'INVALID_PANEL_LOCATION_NOTE'));
});

test('unknown generated panel override blocks proposal before route or sizing output is claimed', () => {
  const input = structuredClone(sample);
  input.overrides = { panelLocations: { 'DP-99': { x: 1, y: 2, z: 3 } } };
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(issue => issue.code === 'UNKNOWN_PANEL_OVERRIDE_ID'));
  assert.equal(proposal.panels.length, 0);
  assert.equal(proposal.cables.length, 0);
});

test('out-of-corridor panel placement preserves requested coordinates and reports blocked decision', () => {
  const input = structuredClone(sample);
  input.overrides = { panelLocations: { 'DP-01': { x: 10000, y: 10000, z: 0, note: 'invalid placement' } } };
  const proposal = generateDesignProposal(input);
  const row = proposal.panelLocationOverrides.find(item => item.panelId === 'DP-01');
  assert.equal(proposal.status, 'blocked');
  assert.equal(row.status, 'blocked');
  assert.deepEqual(row.requestedLocation, { x: 10000, y: 10000, z: 0 });
  assert.deepEqual(row.effectiveLocation, { x: 10000, y: 10000, z: 0 });
  assert.deepEqual(proposal.panels[0].locationOverride, { x: 10000, y: 10000, z: 0, note: 'invalid placement' });
});

test('dependent endpoint failure blocks an otherwise routed explicit panel decision', () => {
  const input = structuredClone(sample);
  input.criteria.endpointInstallation.maximumTradeSize = '1/2';
  input.overrides = { panelLocations: { 'DP-01': { x: 120, y: 10, z: 0 } } };
  const proposal = generateDesignProposal(input);
  const row = proposal.panelLocationOverrides.find(item => item.panelId === 'DP-01');
  assert.equal(proposal.status, 'blocked');
  assert.equal(proposal.panels[0].routeResult.status, 'routed');
  assert.equal(row.status, 'blocked');
  assert.deepEqual(row.effectiveLocation, { x: 120, y: 10, z: 0 });
  assert.ok(proposal.issues.some(issue => issue.code === 'ENDPOINT_CONDUIT_CAPACITY_BLOCKED'));
});
