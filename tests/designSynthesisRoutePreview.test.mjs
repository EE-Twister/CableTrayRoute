import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { renderDesignSynthesisRoutePreview } from '../src/design-synthesis/routePreview.mjs';

const physicalFixture = () => ({
  inputs: { original: { corridors: { nodes: [
    { id: 'A', x: 0, y: 0, z: 0 }, { id: 'B', x: 100, y: 0, z: 0 }, { id: 'C', x: 0, y: 100, z: 0 },
  ], edges: [
    { id: 'X', from: 'A', to: 'B', permitted: true }, { id: 'Y', from: 'A', to: 'C', permitted: true }, { id: 'CLOSED', from: 'B', to: 'C', permitted: false },
  ] } } },
  equipment: [{ id: 'S', x: 0, y: 0, z: 0 }, { id: 'L', x: 100, y: 0, z: 0 }],
  cables: [{ id: 'C-1', from: 'S', to: 'L', lengthFt: 100 }],
  routeResults: { batchResults: [{ cable: 'C-1', from: 'S', to: 'L', status: 'routed', total_length: 100, route_segments: [
    { type: 'tray', raceway_id: 'X', start: [0, 0, 0], end: [100, 0, 0], length: 100 },
  ] }] },
});

function corridorLine(markup, name) {
  const match = [...markup.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"[^>]*><title>Permitted corridor ([^<]+)<\/title><\/line>/g)].find(item => item[5] === name);
  assert.ok(match, name);
  return match.slice(1, 5).map(Number);
}

test('100-foot horizontal and vertical corridors have identical displayed lengths', () => {
  const markup = renderDesignSynthesisRoutePreview(physicalFixture());
  const x = corridorLine(markup, 'X');
  const y = corridorLine(markup, 'Y');
  assert.equal(Math.hypot(x[2] - x[0], x[3] - x[1]), 150);
  assert.equal(Math.hypot(y[2] - y[0], y[3] - y[1]), 150);
  assert.doesNotMatch(markup, /Permitted corridor CLOSED/);
  assert.match(markup, /elevation is not visible/);
});

test('route selection displays only the chosen circuit, with ordered three-dimensional segment data', () => {
  const proposal = physicalFixture();
  proposal.cables.push({ id: 'C-2', from: 'S', to: 'L', lengthFt: 120 });
  proposal.routeResults.batchResults.push({ cable: 'C-2', from: 'S', to: 'L', status: 'routed', total_length: 120, route_segments: [
    { type: 'conduit', raceway_id: 'R-1', start: [0, 0, 0], end: [0, 0, 10], length: 10 },
    { type: 'conduit', raceway_id: 'R-2', start: [0, 0, 10], end: [100, 0, 10], length: 100 },
    { type: 'conduit', raceway_id: 'R-3', start: [100, 0, 10], end: [100, 0, 0], length: 10 },
  ] });
  const selected = renderDesignSynthesisRoutePreview(proposal, 'C-2');
  assert.doesNotMatch(selected, /data-route-cable="C-1"/);
  assert.equal((selected.match(/data-route-cable="C-2"/g) || []).length, 3);
  assert.ok(selected.indexOf('R-1') < selected.indexOf('R-2'));
  assert.match(selected, /0 \/ 0 \/ 10/);
  assert.match(selected, /<circle[^>]+data-route-cable="C-2"/);
});

test('missing, ambiguous, mismatched, invalid, and disconnected routes cannot appear as routed geometry', () => {
  for (const mutation of [
    p => { p.routeResults.batchResults = []; },
    p => { p.routeResults.batchResults.push(structuredClone(p.routeResults.batchResults[0])); },
    p => { p.routeResults.batchResults[0].to = 'OTHER'; },
    p => { p.routeResults.batchResults[0].route_segments[0].end[0] = '100'; },
    p => { p.routeResults.batchResults[0].route_segments.push({ type: 'tray', start: [101, 0, 0], end: [200, 0, 0], length: 99 }); },
    p => { p.routeResults.batchResults[0].status = 'blocked'; },
    p => { p.equipment[1].x = 99; },
    p => { p.routeResults.batchResults[0].route_segments[0].length = 99; },
    p => { p.inputs.original.corridors.edges[0].permitted = false; },
    p => { p.routeResults.batchResults[0].total_length = 99; },
  ]) {
    const proposal = physicalFixture(); mutation(proposal);
    const output = renderDesignSynthesisRoutePreview(proposal, 'C-1');
    assert.doesNotMatch(output, /data-route-cable="C-1"/);
    assert.match(output, /1 circuit\(s\) have missing, blocked, ambiguous, or invalid route geometry/);
    assert.match(output, /Route geometry is unavailable/);
  }
});

test('co-located endpoints get a visible point without inventing a route segment', () => {
  const proposal = physicalFixture();
  proposal.equipment[1].x = 0; proposal.cables[0].lengthFt = 0;
  proposal.routeResults.batchResults[0].total_length = 0; proposal.routeResults.batchResults[0].route_segments = [];
  const output = renderDesignSynthesisRoutePreview(proposal, 'C-1');
  assert.match(output, /routed \(co-located\)/);
  assert.match(output, /no route segments were generated/);
  assert.match(output, /<circle[^>]+data-route-cable="C-1"/);
  assert.match(output, /0 circuit\(s\)/);
});

test('extreme finite coordinates do not produce invalid SVG geometry', () => {
  const proposal = physicalFixture();
  proposal.inputs.original.corridors.nodes[0].x = -1e308;
  proposal.inputs.original.corridors.nodes[1].x = 1e308;
  const output = renderDesignSynthesisRoutePreview(proposal);
  assert.match(output, /Coordinate range is too large/);
  assert.doesNotMatch(output, /NaN|Infinity/);
});

for (const count of [25, 50]) test(`${count} generated loads retain individual route identities in the plan`, () => {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const base = input.equipment;
  input.equipment = Array.from({ length: count }, (_, index) => ({ ...base[index % base.length], id: `L-${index}`, tag: `L-${index}`, kw: 1 }));
  const proposal = generateDesignProposal(input);
  const before = JSON.stringify(proposal);
  const all = renderDesignSynthesisRoutePreview(proposal);
  assert.equal((all.match(/<option value=/g) || []).length, proposal.cables.length + 1);
  assert.match(all, /0 circuit\(s\) have missing/);
  for (const cable of proposal.cables) {
    const one = renderDesignSynthesisRoutePreview(proposal, cable.id);
    assert.match(one, new RegExp(`data-route-cable="${cable.id}"`));
    assert.match(one, /routed/);
  }
  assert.equal(JSON.stringify(proposal), before);
});
