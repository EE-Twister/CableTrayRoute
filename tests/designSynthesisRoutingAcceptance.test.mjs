import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';

const sample = () => JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
function bypassSample(temperature = 45) {
  const input = sample();
  input.corridors.edges[0].thermal = { ambientTempC: temperature };
  input.corridors.nodes.push({ id: 'N9', x: 0, y: 50, z: 0 });
  input.corridors.edges.push(
    { id: 'BYPASS-A', from: 'N0', to: 'N9', widthIn: 24, depthIn: 6 },
    { id: 'BYPASS-B', from: 'N9', to: 'N1', widthIn: 24, depthIn: 6 },
  );
  return input;
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('a cooler permitted bypass yields a coherent complete 30-load proposal', () => {
  const input = bypassSample();
  const result = generateDesignProposal(input);
  assert.equal(result.status, 'proposal', JSON.stringify(result.issues));
  assert.equal(result.loads.length, 30);
  assert.equal(result.panels.length, 4);
  assert.equal(result.cables.length, 34);
  const first = result.cables.find(cable => cable.id === 'F-DP-01');
  // Independent geometry: 50 ft + sqrt(60² + 50²).
  close(first.length, 50 + Math.sqrt(6100));
  assert.equal(first.conductor_size, '600 kcmil');
  assert.deepEqual(first.routingDecision.shortestPath, ['E01']);
  assert.equal(first.routingDecision.shortestLengthFt, 60);
  assert.match(first.routingDecision.shortestRejectedReason, /thermal/);
  for (const cable of result.cables) {
    assert.equal(cable.routingDecision.selectedConductorSize, cable.conductor_size);
  }
  for (const feeder of result.cables.filter(cable => !cable.loadId)) {
    const path = result.routeResults.batchResults.find(route => route.cable === feeder.tag);
    const edgeIds = path.route_segments.filter(segment => segment.type === 'tray').map(segment => segment.tray_id);
    assert.ok(edgeIds.includes('BYPASS-A'));
    assert.ok(edgeIds.includes('BYPASS-B'));
    assert.ok(!edgeIds.includes('E01'));
    close(feeder.length, path.total_length);
    assert.equal(feeder.thermalAssessment.adjustmentFactor, 1);
    assert.ok(feeder.ampacityA >= feeder.protectiveDevice.continuousCurrentA);
  }
  for (const branch of result.cables.filter(cable => cable.loadId)) {
    const feeder = result.cables.find(cable => cable.to === branch.from);
    close(branch.combinedVoltageDropPct, feeder.voltageDropPct + branch.voltageDropPct);
    assert.equal(branch.combinedVoltageDropStatus, 'pass');
  }
  assert.equal(result.oneLine.sheets[0].connections.length, 34);
  assert.ok(result.racewayEvaluations.every(row => row.status !== 'fail' && row.status !== 'blocked'));
});

test('a feasible shorter hot route remains preferred and prohibitions remain binding', () => {
  const hot = generateDesignProposal(bypassSample(40));
  assert.equal(hot.status, 'proposal');
  const first = hot.cables.find(cable => cable.id === 'F-DP-01');
  close(first.length, 60);
  assert.equal(first.conductor_size, '750 kcmil');
  assert.deepEqual(first.routingDecision.selectedPath, ['E01']);
  assert.equal(first.routingDecision.shortestRejectedReason, null);
  const blockedInput = bypassSample();
  blockedInput.corridors.edges.find(edge => edge.id === 'BYPASS-A').permitted = false;
  const blocked = generateDesignProposal(blockedInput);
  // Feeder-aware partitioning can split the original panels until the allowed
  // hot route is feasible. Prohibiting the bypass must still bind every route.
  assert.equal(blocked.status, 'proposal', JSON.stringify(blocked.issues));
  assert.equal(blocked.distributionPartitionValidation.status, 'evaluated');
  assert.ok(blocked.distributionPartitionValidation.splitCount > 0);
  assert.deepEqual(blocked.distributionPartitionValidation.criteria, {
    maxPanelLoadKva: blockedInput.criteria.maxPanelLoadKva,
    maxLoadsPerPanel: blockedInput.criteria.maxLoadsPerPanel,
  });
  const assigned = blocked.distributionPartitionValidation.groups.flatMap(group => group.loadIds).sort();
  assert.deepEqual(assigned, blocked.loads.map(load => load.id).sort());
  assert.ok(blocked.routeResults.batchResults.every(route => route.status === 'routed'));
  assert.ok(blocked.routeResults.batchResults.every(route => route.route_segments.every(segment => segment.tray_id !== 'BYPASS-A')));

  const disconnectedInput = bypassSample();
  disconnectedInput.corridors.edges.find(edge => edge.id === 'BYPASS-A').permitted = false;
  disconnectedInput.corridors.edges.find(edge => edge.id === 'E01').permitted = false;
  const disconnected = generateDesignProposal(disconnectedInput);
  assert.equal(disconnected.status, 'blocked');
  assert.notEqual(disconnected.distributionPartitionValidation?.status, 'evaluated');
  assert.ok(disconnected.issues.some(issue => issue.code === 'NO_PERMITTED_ROUTE'));
  assert.ok(disconnected.routeResults.batchResults.every(route => route.route_segments.every(segment => segment.tray_id !== 'BYPASS-A' && segment.tray_id !== 'E01')));
  assert.ok(disconnected.routeResults.batchResults.some(route => route.cable.startsWith('F-') && route.status === 'blocked'));
});

test('routing output is stable when graph input order changes', () => {
  const input = bypassSample();
  const original = generateDesignProposal(input);
  input.corridors.nodes.reverse();
  input.corridors.edges.reverse();
  const reordered = generateDesignProposal(input);
  assert.equal(reordered.status, 'proposal');
  const routes = proposal => proposal.routeResults.batchResults.map(route => ({ cable: route.cable, segments: route.route_segments, length: route.total_length }));
  assert.deepEqual(routes(reordered), routes(original));
});

test('device fault-duty applicability informs conductor selection before a circuit is rejected', () => {
  const input = sample();
  input.equipment = input.equipment.slice(0, 1);
  input.equipment[0].kw = 10;
  input.supply.availableFaultCurrentKA = 50;
  const result = generateDesignProposal(input);
  assert.equal(result.status, 'proposal', JSON.stringify(result.issues));
  assert.equal(result.cables.length, 2);
  for (const cable of result.cables) {
    // The 20 A FD device is limited to 35 kA at 480 V. The 80 A HFD
    // candidate carries 65 kA, requiring >=80 A conductor ampacity.
    assert.equal(cable.protectiveDevice.catalogNumber, 'HFD3080');
    assert.equal(cable.protectiveDevice.interruptingRatingKA, 65);
    assert.equal(cable.conductor_size, '#4 AWG');
    close(cable.ampacityA, 85);
  }
});

test('equal parallel edges and coincident alternative anchors do not depend on input order', () => {
  const input = sample();
  input.corridors.nodes.push({ ...input.corridors.nodes.find(node => node.id === 'N1'), id: 'ZN1' });
  input.corridors.edges.push(
    { ...input.corridors.edges[0], id: 'E01-B' },
    { ...input.corridors.edges[0], id: 'E01-C', to: 'ZN1' },
  );
  const first = generateDesignProposal(input);
  input.corridors.nodes.reverse();
  input.corridors.edges.reverse();
  const second = generateDesignProposal(input);
  assert.equal(first.status, 'proposal');
  assert.equal(second.status, 'proposal');
  assert.deepEqual(second.routeResults, first.routeResults);
  const feeder = second.cables.find(cable => cable.id === 'F-DP-01');
  assert.deepEqual(feeder.routingDecision.selectedPath, ['E01']);
  assert.equal(feeder.routingDecision.selectedConductorSize, '600 kcmil');
});
