import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import Papa from 'papaparse';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { buildPreliminaryCableSchedule } from '../src/design-synthesis/preliminaryCableSchedule.mjs';
import { screenAlternateEndpointInstallation } from '../analysis/designSynthesisAlternateAnchors.mjs';

function fixture(count, { nearestConnected = false, sameAnchors = false } = {}) {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
  const original = input.equipment;
  input.equipment = Array.from({ length: count }, (_, i) => ({ ...original[i % original.length], id: `L-${i}`, tag: `L-${i}`, kw: 25 / count, powerFactor: 0.9, voltage: 480, phases: 3, x: 100, y: 0, z: 0 }));
  Object.assign(input.supply, { id: 'S', x: 0, y: 0, z: 0 });
  Object.assign(input.criteria, { maxEndpointAttachmentFt: 2.1, allowAlternateEndpointAttachments: true, maxLoadsPerPanel: 50, maxPanelLoadKva: 500, voltageDropLimitPct: 3, endpointInstallation: { method: 'dedicated-emt', maximumTradeSize: '1-1/2' } });
  if (sameAnchors) {
    input.corridors = { nodes: [{ id: 'A', x: 1, y: 0, z: 0 }, { id: 'C', x: 50, y: 70, z: 0 }, { id: 'X', x: 100, y: 0, z: 0 }], edges: [
      { id: 'HOT', from: 'A', to: 'X', widthIn: 24, depthIn: 6, permitted: true, thermal: { ambientTempC: 60 } },
      { id: 'AC', from: 'A', to: 'C', widthIn: 24, depthIn: 6, permitted: true }, { id: 'CX', from: 'C', to: 'X', widthIn: 24, depthIn: 6, permitted: true },
    ] };
  } else {
    input.corridors = { nodes: [...(nearestConnected ? [] : [{ id: 'N0', x: 0, y: 0, z: 0 }]), { id: 'A', x: 1, y: 0, z: 0 }, { id: 'B', x: 0, y: 2, z: 0 }, { id: 'C', x: 1, y: 1000, z: 0 }, { id: 'X', x: 100, y: 0, z: 0 }], edges: [
      { id: 'AC', from: 'A', to: 'C', widthIn: 24, depthIn: 6, permitted: true }, { id: 'CX', from: 'C', to: 'X', widthIn: 24, depthIn: 6, permitted: true }, { id: 'BX', from: 'B', to: 'X', widthIn: 24, depthIn: 6, permitted: true },
    ] };
  }
  return input;
}

for (const count of [25, 50]) test(`${count} loads skip an earlier alternate whose endpoint conduit cannot fit`, () => {
  const input = fixture(count);
  const before = JSON.stringify(input);
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  assert.equal(JSON.stringify(input), before);
  const cable = proposal.cables.find(row => !row.loadId);
  const evidence = cable.routingDecision.alternateEndpointAttachments;
  assert.equal(evidence.sourceNode, 'B');
  assert.equal(evidence.attemptedPairs, 2);
  assert.equal(evidence.endpointRejectedPairs, 1);
  assert.equal(cable.conductor_size, '#4 AWG');
  assert.ok(Math.abs(cable.lengthFt - (2 + Math.hypot(100, 2))) < 1e-9);
  const endpoint = proposal.installationCoverage.find(row => row.cableId === cable.id).segments.find(row => row.conduitId);
  assert.equal(endpoint.tradeSize, '1-1/2');
  const independentFill = 100 * Math.PI * (1.012 / 2) ** 2 / 2.036;
  assert.ok(Math.abs(endpoint.fillPercent - independentFill) < 1e-10);
  assert.ok(independentFill < 53);
  assert.ok(100 * Math.PI * (1.459 / 2) ** 2 / 2.036 > 53, 'The earlier 2/0 cable does not fit the allowed EMT.');
  assert.equal(proposal.inputs.original.criteria.endpointInstallation.maximumTradeSize, '1-1/2');
});

for (const count of [25, 50]) test(`${count} loads prefer a substantially shorter feasible alternate route`, () => {
  const input = fixture(count);
  input.criteria.endpointInstallation.maximumTradeSize = '2';
  const selected = generateDesignProposal(input);
  assert.equal(selected.status, 'proposal', JSON.stringify(selected.issues));
  const feeder = selected.cables.find(row => !row.loadId);
  assert.equal(feeder.routingDecision.alternateEndpointAttachments.method, 'explicit-alternate-attachments-v2');
  assert.equal(feeder.routingDecision.alternateEndpointAttachments.sourceNode, 'B');
  assert.deepEqual(feeder.routingDecision.selectedPath, ['BX']);
  assert.equal(feeder.conductor_size, '#4 AWG');
  assert.ok(Math.abs(feeder.lengthFt - (2 + Math.hypot(100, 2))) < 1e-9);
  const reversedInput = structuredClone(input);
  reversedInput.corridors.nodes.reverse(); reversedInput.corridors.edges.reverse();
  const reversed = generateDesignProposal(reversedInput);
  assert.deepEqual(reversed.cables.find(row => !row.loadId).routingDecision, feeder.routingDecision);
  const longerOnly = structuredClone(input);
  longerOnly.corridors.edges.find(row => row.id === 'BX').permitted = false;
  const longer = generateDesignProposal(longerOnly);
  assert.equal(longer.status, 'proposal');
  const alternative = longer.cables.find(row => !row.loadId);
  assert.equal(alternative.routingDecision.alternateEndpointAttachments.sourceNode, 'A');
  assert.ok(alternative.lengthFt > feeder.lengthFt * 19);
});

test('a longer unfiltered corridor path can be skipped without hiding a shorter feasible candidate', () => {
  const input = fixture(25);
  input.criteria.endpointInstallation.maximumTradeSize = '2';
  input.corridors.edges = [
    { id: 'AX', from: 'A', to: 'X', widthIn: 24, depthIn: 6, permitted: true },
    { id: 'BC', from: 'B', to: 'C', widthIn: 24, depthIn: 6, permitted: true },
    { id: 'CX', from: 'C', to: 'X', widthIn: 24, depthIn: 6, permitted: true },
  ];
  const result = generateDesignProposal(input);
  assert.equal(result.status, 'proposal', JSON.stringify(result.issues));
  const feeder = result.cables.find(row => !row.loadId);
  assert.equal(feeder.routingDecision.alternateEndpointAttachments.sourceNode, 'A');
  assert.deepEqual(feeder.routingDecision.selectedPath, ['AX']);
  assert.equal(feeder.lengthFt, 100);
  assert.ok(feeder.routingDecision.alternateEndpointAttachments.prunedPairs >= 1);
  assert.equal(feeder.routingDecision.alternateEndpointAttachments.attemptedPairs, 1);
});

test('equal-length alternatives prefer the smaller feasible conductor', () => {
  const input = fixture(25);
  input.criteria.endpointInstallation.maximumTradeSize = '2';
  input.corridors.nodes.find(node => node.id === 'B').x = 2;
  input.corridors.nodes.find(node => node.id === 'B').y = 0;
  input.corridors.edges = [
    { id: 'AX-HOT', from: 'A', to: 'X', widthIn: 24, depthIn: 6, permitted: true, thermal: { ambientTempC: 60 } },
    { id: 'BX-COOL', from: 'B', to: 'X', widthIn: 24, depthIn: 6, permitted: true },
  ];
  const result = generateDesignProposal(input);
  assert.equal(result.status, 'proposal', JSON.stringify(result.issues));
  const feeder = result.cables.find(row => !row.loadId);
  assert.equal(feeder.lengthFt, 100);
  assert.equal(feeder.routingDecision.alternateEndpointAttachments.sourceNode, 'B');
  assert.equal(feeder.conductor_size, '#4 AWG');
  const hotOnly = structuredClone(input);
  hotOnly.corridors.edges.find(edge => edge.id === 'BX-COOL').permitted = false;
  const hotFeeder = generateDesignProposal(hotOnly).cables.find(row => !row.loadId);
  assert.equal(hotFeeder.lengthFt, 100);
  assert.equal(hotFeeder.conductor_size, '1/0 AWG');
});

test('50 loads can search the full eight-by-eight anchor bound without expanding longer candidates', () => {
  const input = fixture(50);
  input.criteria.endpointInstallation.maximumTradeSize = '2';
  const nodes = [{ id: 'S0', x: 0, y: 0, z: 0 }, { id: 'T0', x: 100, y: 0, z: 0 }];
  const edges = [];
  for (let index = 1; index <= 7; index += 1) nodes.push({ id: `S${index}`, x: 0, y: index / 10, z: 0 }, { id: `T${index}`, x: 100, y: index / 10, z: 0 });
  for (let source = 1; source <= 7; source += 1) for (let target = 1; target <= 7; target += 1) edges.push({ id: `E${source}-${target}`, from: `S${source}`, to: `T${target}`, widthIn: 36, depthIn: 6, permitted: true });
  input.corridors = { nodes, edges };
  const result = generateDesignProposal(input);
  assert.equal(result.status, 'proposal', JSON.stringify(result.issues));
  const feeder = result.cables.find(row => !row.loadId);
  const evidence = feeder.routingDecision.alternateEndpointAttachments;
  assert.equal(evidence.sourceAnchorCount, 8);
  assert.equal(evidence.destinationAnchorCount, 8);
  assert.equal(evidence.truncated, false);
  assert.equal(evidence.attemptedPairs + evidence.prunedPairs + evidence.disconnectedPairs, 63);
  assert.ok(evidence.prunedPairs > 0);
  assert.ok(Math.abs(feeder.lengthFt - 100.2) < 1e-9);
});

test('an electrically feasible nearest route retries when its endpoint conduit is undersized', () => {
  const input = fixture(25, { nearestConnected: true });
  input.criteria.allowAlternateEndpointAttachments = false;
  const initial = generateDesignProposal(input);
  assert.equal(initial.status, 'blocked');
  assert.ok(initial.issues.some(item => item.code === 'ENDPOINT_CONDUIT_CAPACITY_BLOCKED'));
  input.criteria.allowAlternateEndpointAttachments = true;
  const revised = generateDesignProposal(input);
  assert.equal(revised.status, 'proposal', JSON.stringify(revised.issues));
  const selected = revised.cables.find(row => !row.loadId);
  assert.equal(selected.routingDecision.alternateEndpointAttachments.nearestFailure, 'endpoint-installation-incomplete');
  assert.deepEqual(selected.routingDecision.alternateEndpointAttachments.nearestEndpointIssueCodes, ['ENDPOINT_CONDUIT_CAPACITY_BLOCKED']);
  assert.equal(selected.routingDecision.alternateEndpointAttachments.sourceNode, 'B');
});

test('the same anchors can retain a smaller conductor on a longer cooler route', () => {
  const input = fixture(25, { sameAnchors: true });
  input.criteria.allowAlternateEndpointAttachments = false;
  const first = generateDesignProposal(input);
  assert.equal(first.status, 'blocked');
  assert.ok(first.issues.some(item => item.code === 'ENDPOINT_CONDUIT_CAPACITY_BLOCKED'));
  input.criteria.allowAlternateEndpointAttachments = true;
  const revised = generateDesignProposal(input);
  assert.equal(revised.status, 'proposal', JSON.stringify(revised.issues));
  const selected = revised.cables.find(row => !row.loadId);
  assert.deepEqual(selected.routingDecision.selectedPath, ['AC', 'CX']);
  assert.equal(selected.conductor_size, '#4 AWG');
  const retry = selected.routingDecision.endpointInstallationRetry;
  assert.equal(retry.originalConductorSize, '1/0 AWG');
  assert.equal(retry.selectedConductorSize, '#4 AWG');
  assert.deepEqual(retry.originalIssueCodes, ['ENDPOINT_CONDUIT_CAPACITY_BLOCKED']);
  const csv = Papa.parse(buildPreliminaryCableSchedule(revised).csv, { header: true, skipEmptyLines: true });
  assert.deepEqual(csv.errors, []);
  assert.match(csv.data.find(row => row['Cable ID'] === selected.id)['Endpoint conduit retry'], /1\/0 AWG to #4 AWG/);
});

test('an exhausted retry preserves the actual endpoint capacity blocker', () => {
  const input = fixture(25, { nearestConnected: true });
  input.criteria.endpointInstallation.maximumTradeSize = '1';
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(item => item.code === 'ENDPOINT_CONDUIT_CAPACITY_BLOCKED'));
  assert.ok(proposal.issues.some(item => item.code === 'INSTALLATION_COVERAGE_NOT_PASSED'));
  const cable = proposal.cables.find(row => !row.loadId);
  assert.equal(cable.routingDecision.alternateEndpointAttachments.status, 'no-feasible-alternative');
  assert.ok(cable.routingDecision.alternateEndpointAttachments.endpointRejectedPairs > 0);
});

test('missing or malformed endpoint lengths and unknown cable sizes do not become a no-conduit pass', () => {
  for (const route of [undefined, {}, { sourceAttachmentFt: 0, destinationAttachmentFt: -1 }, { sourceAttachmentFt: NaN, destinationAttachmentFt: 0 }]) {
    const screen = screenAlternateEndpointInstallation({ route, size: '#4 AWG', criteria: {} });
    assert.equal(screen.ok, false);
    assert.deepEqual(screen.issueCodes, ['ENDPOINT_CANDIDATE_INPUT_INVALID']);
  }
  const unknown = screenAlternateEndpointInstallation({ route: { sourceAttachmentFt: 0, destinationAttachmentFt: 0 }, size: 'unknown', criteria: {} });
  assert.equal(unknown.ok, false);
  const coLocated = screenAlternateEndpointInstallation({ route: { sourceAttachmentFt: 0, destinationAttachmentFt: 0 }, size: '#4 AWG', criteria: {} });
  assert.equal(coLocated.ok, true);
  assert.equal(coLocated.status, 'not-needed');
});
