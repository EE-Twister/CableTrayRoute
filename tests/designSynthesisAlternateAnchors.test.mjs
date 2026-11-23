import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { buildAlternateAnchorPairs } from '../analysis/designSynthesisAlternateAnchors.mjs';
import { buildPreliminaryCableSchedule } from '../src/design-synthesis/preliminaryCableSchedule.mjs';
import Papa from 'papaparse';

function fixture(count, { destination = false } = {}) {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const base = input.equipment;
  input.equipment = Array.from({ length: count }, (_, index) => ({ ...base[index % base.length], id: `L-${index}`, tag: `L-${index}`, kw: 1, x: 20, y: 0, z: 0 }));
  Object.assign(input.supply, { id: 'S', x: 0, y: 0, z: 0 });
  input.criteria.maxEndpointAttachmentFt = 4;
  const nodes = destination
    ? [{ id: 'N0', x: 0, y: 0, z: 0 }, { id: 'NA', x: 17, y: 0, z: 0 }, { id: 'N1', x: 20, y: 0, z: 0 }]
    : [{ id: 'N0', x: 0, y: 0, z: 0 }, { id: 'NA', x: 3, y: 0, z: 0 }, { id: 'N1', x: 20, y: 0, z: 0 }];
  input.corridors = { nodes, edges: [{ id: 'A1', from: destination ? 'N0' : 'NA', to: destination ? 'NA' : 'N1', widthIn: 24, depthIn: 6, permitted: true }] };
  return input;
}

for (const count of [25, 50]) test(`${count} loads recover a permitted alternate source connection without changing criteria`, () => {
  const input = fixture(count);
  const defaultResult = generateDesignProposal(input);
  assert.equal(defaultResult.status, 'blocked');
  assert.ok(defaultResult.issues.some(item => item.code === 'NO_PERMITTED_ROUTE'));
  input.criteria.allowAlternateEndpointAttachments = true;
  const before = JSON.stringify(input);
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  assert.equal(proposal.loads.length, count);
  assert.equal(JSON.stringify(input), before);
  const feeders = proposal.cables.filter(cable => !cable.loadId);
  assert.ok(feeders.length > 0);
  for (const cable of feeders) {
    const evidence = cable.routingDecision.alternateEndpointAttachments;
    assert.equal(evidence.status, 'selected');
    assert.equal(evidence.nearestFailure, 'disconnected-permitted-corridors');
    assert.equal(evidence.nearestSourceNode, 'N0');
    assert.equal(evidence.sourceNode, 'NA');
    assert.equal(evidence.sourceAttachmentFt, 3);
    assert.equal(evidence.destinationAttachmentFt, 0);
    assert.deepEqual(cable.routingDecision.selectedPath, ['A1']);
    assert.equal(cable.lengthFt, 20, '3 ft field plus 17 ft tray');
    const route = proposal.routeResults.batchResults.find(row => row.cable === cable.id);
    assert.equal(route.total_length, 20);
    assert.deepEqual(route.route_segments.map(segment => [segment.type, segment.length]), [['conduit', 3], ['tray', 17]]);
    assert.equal(cable.installationCoverage.coverage, 'complete');
    const csv = Papa.parse(buildPreliminaryCableSchedule(proposal).csv, { header: true, skipEmptyLines: true });
    assert.deepEqual(csv.errors, []);
    const exported = csv.data.find(row => row['Cable ID'] === cable.id);
    assert.equal(exported['Alternative endpoint connection'], 'N0 to NA (3 ft); N1 to N1 (0 ft)');
    assert.equal(exported['Field connection review'], 'Field permission and obstacles require review');
  }
  assert.equal(proposal.inputs.original.criteria.maxEndpointAttachmentFt, 4);
  assert.equal(proposal.inputs.original.criteria.allowAlternateEndpointAttachments, true);
});

test('enabling alternatives leaves a feasible nearest-node route unchanged', () => {
  const input = fixture(25);
  input.corridors.edges.push({ id: 'N0-NA', from: 'N0', to: 'NA', widthIn: 24, depthIn: 6, permitted: true });
  const baseline = generateDesignProposal(input);
  input.criteria.allowAlternateEndpointAttachments = true;
  const allowed = generateDesignProposal(input);
  assert.equal(baseline.status, 'proposal');
  assert.equal(allowed.status, 'proposal');
  assert.deepEqual(allowed.cables.map(row => row.routingDecision), baseline.cables.map(row => row.routingDecision));
  assert.deepEqual(allowed.routeResults.batchResults.map(row => row.route_segments), baseline.routeResults.batchResults.map(row => row.route_segments));
});

test('the destination can use a separately allowed alternate node', () => {
  const input = fixture(25, { destination: true });
  input.criteria.allowAlternateEndpointAttachments = true;
  const result = generateDesignProposal(input);
  assert.equal(result.status, 'proposal', JSON.stringify(result.issues));
  const feeder = result.cables.find(cable => !cable.loadId);
  assert.equal(feeder.routingDecision.alternateEndpointAttachments.nearestDestinationNode, 'N1');
  assert.equal(feeder.routingDecision.alternateEndpointAttachments.destinationNode, 'NA');
  assert.equal(feeder.routingDecision.alternateEndpointAttachments.destinationAttachmentFt, 3);
  assert.equal(feeder.lengthFt, 20);
});

test('an explicitly allowed connection can avoid an infeasible hot nearest route without relaxing ampacity', () => {
  const input = fixture(1);
  input.equipment[0].kw = 260;
  input.equipment[0].powerFactor = 1;
  input.supply.capacityKva = 500;
  input.criteria.maxPanelLoadKva = 500;
  input.corridors.edges.push({ id: 'HOT', from: 'N0', to: 'N1', widthIn: 24, depthIn: 6, permitted: true, thermal: { ambientTempC: 45 } });
  const nearest = generateDesignProposal(input);
  assert.equal(nearest.status, 'blocked');
  input.criteria.allowAlternateEndpointAttachments = true;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  const feeder = proposal.cables.find(row => !row.loadId);
  assert.deepEqual(feeder.routingDecision.selectedPath, ['A1']);
  assert.equal(feeder.routingDecision.alternateEndpointAttachments.nearestFailure, 'no-feasible-conductor-route');
  assert.equal(feeder.conductor_size, '600 kcmil');
  assert.ok(feeder.ampacityA >= feeder.protectiveRequirement.ampereRatingA);
  assert.equal(feeder.lengthFt, 20);
  assert.equal(feeder.installationCoverage.coverage, 'complete');
});

test('invalid permission, closed edges, and connections beyond the attachment limit remain blocked', () => {
  for (const value of ['true', 1, null]) {
    const input = fixture(1); input.criteria.allowAlternateEndpointAttachments = value;
    const result = generateDesignProposal(input);
    assert.equal(result.status, 'blocked');
    assert.ok(result.issues.some(item => item.code === 'INVALID_ALTERNATE_ENDPOINT_PERMISSION'));
  }
  const closed = fixture(1); closed.criteria.allowAlternateEndpointAttachments = true; closed.corridors.edges[0].permitted = false;
  const closedResult = generateDesignProposal(closed);
  assert.equal(closedResult.status, 'blocked');
  assert.ok(closedResult.issues.some(item => item.code === 'NO_PERMITTED_ROUTE'));
  const tooFar = fixture(1); tooFar.criteria.allowAlternateEndpointAttachments = true; tooFar.criteria.maxEndpointAttachmentFt = 2;
  const distanceResult = generateDesignProposal(tooFar);
  assert.equal(distanceResult.status, 'blocked');
  assert.ok(distanceResult.issues.some(item => item.code === 'NO_PERMITTED_ROUTE'));
});

test('anchor enumeration is deterministic, bounded, and reports truncation', () => {
  const nodes = Array.from({ length: 12 }, (_, index) => ({ id: `N-${String(index).padStart(2, '0')}`, x: index, y: 0, z: 0 }));
  const run = order => buildAlternateAnchorPairs({ graph: { nodes: new Map(order.map(node => [node.id, node])) }, source: nodes[0], target: nodes[11], maxAttachment: 30,
    nearestFrom: { node: nodes[0] }, nearestTo: { node: nodes[11] }, distance: (a, b) => Math.abs(a.x - b.x) });
  const first = run(nodes); const reversed = run([...nodes].reverse());
  assert.equal(first.limitPerEndpoint, 8);
  assert.equal(first.truncated, true);
  assert.equal(first.sourceAnchorCount, 12);
  assert.equal(first.destinationAnchorCount, 12);
  assert.equal(first.pairs.length, 63);
  assert.deepEqual(first, reversed);
});
