import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { calculateSourcedVoltageDrop, generateDesignProposal } from '../analysis/designSynthesis.mjs';

const sample = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));

test('independent sourced voltage-drop fixture matches 10 kW benchmark', () => {
  const amps = (10000 / (Math.sqrt(3) * 480 * 0.9));
  assert.ok(Math.abs(amps - 13.364589564574672) < 1e-12);
  const drop = calculateSourcedVoltageDrop({ current: amps, voltage: 480, phases: 3, powerFactor: 0.9, conductorSize: '#8 AWG', lengthFt: 150 });
  // Independent benchmark uses the archived source PDF's #8 R75C = 0.810.
  assert.ok(Math.abs(drop - 0.5437400712575315) < 1e-12);
});

test('industrial sample produces a deterministic radial proposal', () => {
  const first = generateDesignProposal(sample);
  const second = generateDesignProposal(sample);
  assert.ok(['proposal', 'blocked'].includes(first.status));
  assert.equal(first.summary.loadCount, 30);
  assert.ok(first.panels.length > 1);
  assert.ok(first.cables.every(cable => cable.from && cable.to));
  assert.deepEqual(first.panels, second.panels);
  assert.deepEqual(first.routeResults, second.routeResults);
});

test('movement beyond the bounded endpoint attachment is an explicit blocker', () => {
  const input = structuredClone(sample);
  input.criteria.maxEndpointAttachmentFt = 10;
  input.equipment[0].x = 999;
  const result = generateDesignProposal(input);
  assert.equal(result.status, 'blocked');
  assert.ok(result.issues.some(issue => issue.code === 'ENDPOINT_OUTSIDE_CORRIDOR'));
});

test('load increase can exceed source capacity visibly', () => {
  const input = structuredClone(sample);
  input.equipment[0].kw = 5000;
  const result = generateDesignProposal(input);
  assert.equal(result.status, 'blocked');
  assert.ok(result.issues.some(issue => issue.code === 'SOURCE_CAPACITY_EXCEEDED'));
});

test('removing a permitted corridor component blocks affected loads without a straight fallback', () => {
  const input = structuredClone(sample);
  input.corridors.edges = input.corridors.edges.filter(edge => edge.id !== 'E78');
  input.equipment[29].x = 180;
  input.equipment[29].y = 100;
  input.criteria.maxEndpointAttachmentFt = 0;
  const result = generateDesignProposal(input);
  assert.equal(result.status, 'blocked');
  assert.ok(result.issues.some(issue => issue.code === 'NO_PERMITTED_ROUTE' || issue.code === 'ENDPOINT_OUTSIDE_CORRIDOR'));
  assert.ok(result.routeResults.batchResults.some(route => route.status === 'blocked'));
});
