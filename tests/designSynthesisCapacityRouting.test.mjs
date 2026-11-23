import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { evaluateCorridorTrayCapacity } from '../analysis/designSynthesisRaceways.mjs';

function capacityFixture() {
  return JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-tray-congestion.json', import.meta.url), 'utf8'));
}

function constrainedBranchFixture(count) {
  const input = capacityFixture();
  const sourceRows = input.equipment;
  input.equipment = Array.from({ length: count }, (_, index) => ({ ...sourceRows[index % sourceRows.length], id: `L-${String(index + 1).padStart(2, '0')}`, tag: `L-${String(index + 1).padStart(2, '0')}` }));
  input.equipment[count - 1].x = 10;
  input.corridors.nodes.push({ id: 'R', x: 10, y: 0, z: 0 });
  input.corridors.edges = [
    { id: 'SCARCE', from: 'N0', to: 'R', widthIn: 6, depthIn: 6, permitted: true },
    { id: 'SHORT-END', from: 'R', to: 'N1', widthIn: 6, depthIn: 6, permitted: true },
    ...input.corridors.edges.filter(edge => edge.id.startsWith('BYPASS')),
  ];
  return input;
}

test('reorders a late constrained branch to recover a feasible 25/50-load shared-tray design', () => {
  for (const count of [25, 50]) {
    const input = constrainedBranchFixture(count);
    const original = structuredClone(input);
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
    assert.equal(proposal.routingRetry?.method, 'prioritize-capacity-blocked-branches-v1');
    assert.deepEqual(proposal.routingRetry.prioritizedLoadIds, [`L-${count}`]);
    const restricted = proposal.cables.find(cable => cable.loadId === `L-${count}`);
    assert.deepEqual(restricted.routingDecision.selectedPath, ['SCARCE']);
    const branches = proposal.cables.filter(cable => cable.loadId);
    assert.equal(branches.length, count);
    assert.equal(branches.filter(cable => cable.routingDecision.selectedPath.includes('SCARCE')).length, 12);
    assert.equal(branches.filter(cable => cable.routingDecision.selectedPath.includes('BYPASS-A')).length, count - 12);
    assert.ok(branches.every(cable => cable.routingDecision.status === 'feasible'));
    assert.equal(proposal.checks.find(row => row.id === 'racewayCapacity').status, 'pass');
    assert.equal(proposal.checks.find(row => row.id === 'loadFlow').status, 'pass');
    for (const cable of proposal.cables) {
      const route = proposal.routeResults.batchResults.find(row => row.cable === cable.tag);
      const connection = proposal.oneLine.sheets[0].connections.find(row => row.cableRef === cable.id);
      assert.deepEqual(route.route_segments.filter(segment => segment.type === 'tray').map(segment => segment.tray_id), cable.routingDecision.selectedPath);
      assert.ok(Math.abs(route.total_length - cable.lengthFt) < 1e-9);
      assert.equal(connection.cable.conductor_size, cable.conductor_size);
    }
    assert.deepEqual(input, original);
    assert.deepEqual(generateDesignProposal(structuredClone(input)), proposal, 'Retry remains deterministic.');
    input.equipment.reverse(); input.corridors.edges.reverse(); input.corridors.nodes.reverse();
    const reordered = generateDesignProposal(input);
    const routes = value => value.cables.map(cable => ({ id: cable.id, path: cable.routingDecision.selectedPath, size: cable.conductor_size })).sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(routes(reordered), routes(proposal), 'Input ordering cannot change the recovered routes.');
  }
});

test('existing-tray reconciliation blocks Apply without discarding a feasible capacity retry', () => {
  for (const count of [25, 50]) {
    const input = constrainedBranchFixture(count);
    const scarce = input.corridors.edges.find(edge => edge.id === 'SCARCE');
    scarce.existingTray = { trayId: 'EXISTING-01', construction: 'ladder', inventoryReference: 'Synthetic complete inventory', cables: [{ id: 'EXISTING-CABLE', use: 'power', conductorSize: '#8 AWG', conductorCount: 3, voltageRatingV: 600, outsideDiameterIn: 0.833, quantity: 5, reference: 'Synthetic cable dimensions' }] };
    input.corridors.edges.find(edge => edge.id === 'SHORT-END').existingTray = { ...structuredClone(scarce.existingTray), trayId: 'EXISTING-02' };
    const before = structuredClone(input);
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'blocked');
    assert.ok(proposal.issues.some(item => item.code === 'EXISTING_TRAY_RECONCILIATION_UNRESOLVED'));
    assert.deepEqual(proposal.routingRetry?.prioritizedLoadIds, [`L-${count}`]);
    assert.equal(proposal.cables.filter(cable => cable.loadId).length, count);
    assert.ok(proposal.cables.every(cable => cable.routingDecision.status === 'feasible'));
    assert.equal(proposal.cables.filter(cable => cable.loadId && cable.routingDecision.selectedPath.includes('SCARCE')).length, 7);
    assert.deepEqual(proposal.cables.find(cable => cable.loadId === `L-${count}`).routingDecision.selectedPath, ['SCARCE']);
    for (const id of ['routesPermitted', 'voltageDrop', 'racewayCapacity', 'installationCoverage', 'routeThermalAmpacity']) assert.equal(proposal.checks.find(check => check.id === id)?.status, 'pass', id);
    assert.equal(proposal.studyValidation?.status, 'pass');
    assert.equal(proposal.distributionBaseline, null);
    assert.deepEqual(input, before);
    const closed = structuredClone(before);
    closed.corridors.edges.filter(edge => edge.id.startsWith('BYPASS')).forEach(edge => { edge.permitted = false; });
    const blocked = generateDesignProposal(closed);
    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.routingRetry, undefined);
    assert.ok(blocked.cables.some(cable => cable.routingDecision?.status === 'no-feasible-route'));
  }
});

test('retry does not open closed routes or waive the voltage-drop criterion', () => {
  for (const change of ['closed', 'excessive-length']) {
    const input = constrainedBranchFixture(25);
    if (change === 'closed') input.corridors.edges.filter(edge => edge.id.startsWith('BYPASS')).forEach(edge => { edge.permitted = false; });
    else input.corridors.nodes.find(node => node.id === 'N9').y = 1000000;
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'blocked', change);
    assert.equal(proposal.routingRetry, undefined);
    assert.ok(proposal.cables.some(cable => cable.routingDecision?.status === 'no-feasible-route'));
  }
});

test('capacity retry prioritizes a constrained later panel without changing panel membership or identities', () => {
  for (const count of [25, 50]) {
    const input = constrainedBranchFixture(count);
    input.criteria.maxLoadsPerPanel = 12;
    const panelCount = Math.ceil(count / 12);
    input.overrides.panelLocations = Object.fromEntries(Array.from({ length: panelCount }, (_, index) => [`DP-${String(index + 1).padStart(2, '0')}`, { x: 0, y: 0, z: 0 }]));
    const before = structuredClone(input);
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
    assert.equal(proposal.panels.length, panelCount);
    const lastPanelId = `DP-${String(panelCount).padStart(2, '0')}`;
    assert.deepEqual(proposal.routingRetry.prioritizedPanelIds, [lastPanelId]);
    assert.equal(proposal.routingRetry.method, 'prioritize-capacity-blocked-panel-groups-v2');
    assert.equal(proposal.routingRetry.attempts, 1);
    for (const [index, panel] of proposal.panels.entries()) {
      assert.equal(panel.id, `DP-${String(index + 1).padStart(2, '0')}`);
      assert.deepEqual(panel.loadIds, input.equipment.slice(index * 12, (index + 1) * 12).map(load => load.id));
    }
    const constrained = proposal.cables.find(cable => cable.loadId === `L-${count}`);
    assert.deepEqual(constrained.routingDecision.selectedPath, ['SCARCE']);
    assert.equal(constrained.from, lastPanelId);
    const branches = proposal.cables.filter(cable => cable.loadId);
    const capacity = Math.floor(7 / (Math.PI * 0.833 ** 2 / 4));
    assert.equal(branches.filter(cable => cable.routingDecision.selectedPath.includes('SCARCE')).length, capacity);
    assert.equal(branches.filter(cable => cable.routingDecision.selectedPath.includes('BYPASS-A')).length, count - capacity);
    assert.equal(proposal.studyValidation.status, 'pass');
    assert.ok(proposal.racewayEvaluations.every(row => row.status === 'pass'));
    assert.deepEqual(input, before);
    input.generationBaseline = proposal.distributionBaseline;
    input.equipment.reverse(); input.corridors.nodes.reverse(); input.corridors.edges.reverse();
    const regenerated = generateDesignProposal(input);
    assert.equal(regenerated.status, 'proposal');
    assert.deepEqual(regenerated.panels.map(panel => [panel.id, panel.loadIds]), proposal.panels.map(panel => [panel.id, panel.loadIds]));
    const routes = value => value.cables.map(cable => [cable.id, cable.routingDecision.selectedPath, cable.conductor_size]).sort((a, b) => a[0].localeCompare(b[0]));
    assert.deepEqual(routes(regenerated), routes(proposal));
    for (const change of ['closed', 'hot']) {
      const blockedInput = structuredClone(before);
      for (const edge of blockedInput.corridors.edges.filter(edge => edge.id.startsWith('BYPASS'))) {
        if (change === 'closed') edge.permitted = false;
        else edge.thermal = { ambientTempC: 75 };
      }
      const blocked = generateDesignProposal(blockedInput);
      assert.equal(blocked.status, 'blocked', change);
      assert.equal(blocked.routingRetry, undefined);
    }
  }
});

test('capacity retry gives a constrained panel feeder space before flexible earlier branches', () => {
  for (const count of [25, 50]) {
    const input = constrainedBranchFixture(count);
    input.criteria.maxLoadsPerPanel = count - 1;
    input.overrides.panelLocations = { 'DP-01': { x: 0, y: 0, z: 0 }, 'DP-02': { x: 10, y: 0, z: 0 } };
    const original = structuredClone(input);
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
    assert.deepEqual(proposal.routingRetry.prioritizedFeederPanelIds, ['DP-02']);
    assert.deepEqual(proposal.routingRetry.prioritizedPanelIds, ['DP-02']);
    assert.deepEqual(proposal.routingRetry.prioritizedLoadIds, []);
    const feeder = proposal.cables.find(row => row.id === 'F-DP-02');
    assert.deepEqual(feeder.routingDecision.selectedPath, ['SCARCE']);
    assert.equal(feeder.lengthFt, 10);
    assert.deepEqual(proposal.panels.map(row => row.id), ['DP-01', 'DP-02']);
    assert.equal(proposal.panels[1].loadIds[0], `L-${count}`);
    assert.equal(proposal.cables.filter(row => row.loadId).length, count);
    assert.equal(proposal.studyValidation.status, 'pass');
    assert.ok(proposal.racewayEvaluations.every(row => row.status === 'pass'));
    assert.deepEqual(input, original);
    const baseline = proposal.distributionBaseline;
    input.generationBaseline = baseline;
    input.equipment.reverse(); input.corridors.nodes.reverse(); input.corridors.edges.reverse();
    const regenerated = generateDesignProposal(input);
    assert.equal(regenerated.status, 'proposal');
    assert.deepEqual(regenerated.panels.map(row => [row.id, row.loadIds]), proposal.panels.map(row => [row.id, row.loadIds]));
    assert.deepEqual(regenerated.cables.find(row => row.id === 'F-DP-02').routingDecision.selectedPath, ['SCARCE']);
    const closed = structuredClone(original);
    closed.corridors.edges.filter(edge => edge.id.startsWith('BYPASS')).forEach(edge => { edge.permitted = false; });
    assert.equal(generateDesignProposal(closed).status, 'blocked');
  }
});

test('greedy routing sends later cables to a larger permitted tray when shared capacity fills', () => {
  const input = capacityFixture();
  const original = structuredClone(input);
  const proposal = generateDesignProposal(input);

  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  assert.equal(proposal.loads.length, 25);
  assert.equal(proposal.cables.filter(cable => cable.loadId).length, 25);
  assert.deepEqual(input, original, 'Generation must leave the imported design unchanged.');
  assert.ok(proposal.checks.find(check => check.id === 'loadFlow')?.status === 'pass');

  const branchRoutes = proposal.routeResults.batchResults.filter(route => route.cable?.startsWith('C-'));
  const shortRoutes = branchRoutes.filter(route => route.route_segments.some(segment => segment.tray_id === 'SHORT'));
  const bypassRoutes = branchRoutes.filter(route => route.route_segments.some(segment => segment.tray_id === 'BYPASS-A'));
  assert.equal(shortRoutes.length, 12, 'Six-inch ladder width must be limited by the corrected archived-PDF #8 cable OD.');
  assert.equal(bypassRoutes.length, 13);
  assert.ok(bypassRoutes.every(route => route.route_segments.some(segment => segment.tray_id === 'BYPASS-B')));

  const firstBypassCable = proposal.cables.find(cable => cable.id === bypassRoutes[0].cable);
  assert.equal(firstBypassCable.routingDecision.capacityAwareMethod, 'deterministic-greedy-shared-tray-capacity-v1');
  assert.equal(firstBypassCable.routingDecision.shortestRejectedReason, 'shared-tray-capacity');
  assert.ok(firstBypassCable.routingDecision.capacityExcludedEdgeIds.includes('SHORT'));
  assert.ok(proposal.racewayEvaluations.every(row => row.status === 'pass'));
  assert.ok(proposal.routeResults.batchResults.every(route => route.status === 'routed'));
});

test('capacity probe uses the shared raceway fill evaluator and largest listed width', () => {
  const edge = { id: 'SHORT', widthIn: 6, depthIn: 6 };
  const one = evaluateCorridorTrayCapacity({ edge, cables: [], candidateSize: '#8 AWG' });
  const eleven = Array.from({ length: 11 }, (_, index) => ({ id: `C-${index}`, conductor_size: '#8 AWG', conductor_count: 3, cable_rating: 600 }));
  const atLimit = evaluateCorridorTrayCapacity({ edge, cables: eleven, candidateSize: '#8 AWG' });
  const overLimit = evaluateCorridorTrayCapacity({ edge, cables: [...eleven, { id: 'C-11', conductor_size: '#8 AWG', conductor_count: 3, cable_rating: 600 }], candidateSize: '#8 AWG' });
  assert.equal(one.status, 'pass');
  assert.equal(atLimit.status, 'pass');
  assert.equal(atLimit.widthIn, 6);
  assert.equal(overLimit.status, 'blocked');
  assert.equal(overLimit.reason, 'shared-tray-capacity');
});

test('mixed small and large cable fill can reject 3/0 while accepting 4/0', () => {
  const edge = { id: 'MIXED', widthIn: 12, depthIn: 6 };
  const cables = ['750 kcmil', '750 kcmil', '500 kcmil', '4/0 AWG'].map((size, index) => ({ id: `R-${index}`, conductor_size: size }));
  assert.equal(evaluateCorridorTrayCapacity({ edge, cables, candidateSize: '3/0 AWG' }).status, 'blocked');
  assert.equal(evaluateCorridorTrayCapacity({ edge, cables, candidateSize: '4/0 AWG' }).status, 'pass');
});

test('feeder reservations use actual selected conductors once per route edge', () => {
  const input = capacityFixture();
  input.criteria.maxLoadsPerPanel = 1;
  delete input.overrides;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  const feeders = proposal.cables.filter(cable => cable.id.startsWith('F-DP-'));
  assert.equal(feeders.length, 25);
  const shortFeeders = feeders.filter(cable => cable.routingDecision.selectedPath.includes('SHORT'));
  const bypassFeeders = feeders.filter(cable => cable.routingDecision.selectedPath.includes('BYPASS-A'));
  assert.equal(shortFeeders.length, 12);
  assert.equal(bypassFeeders.length, 13);
  assert.ok(feeders.every(cable => cable.conductor_size === cable.routingDecision.selectedConductorSize));
  assert.ok(proposal.cables.filter(cable => cable.loadId).every(cable => cable.routingDecision.selectedPath.length === 0), 'Point circuits must not reserve corridor space.');
  const shortFill = proposal.racewayEvaluations.find(row => row.racewayId === 'SHORT');
  const oneCableArea = Math.PI * 0.833 ** 2 / 4;
  assert.ok(Math.abs(shortFill.utilizationPercent - 12 * oneCableArea / 7 * 100) < 1e-10, 'A zero-edge branch cannot be counted as a tray cable.');
});

test('transformer primary reservations share capacity already occupied by branch feeders', () => {
  const input = capacityFixture();
  input.equipment = input.equipment.slice(0, 13).map((load, index) => ({ ...load, id: `D-${String(index + 1).padStart(2, '0')}`, tag: `D-${String(index + 1).padStart(2, '0')}` }));
  for (let index = 1; index <= 2; index += 1) input.equipment.push({ ...input.equipment[0], id: `T-${index}`, tag: `T-${index}`, voltage: 208, kw: 0.5 });
  input.criteria.maxLoadsPerPanel = 1;
  delete input.overrides;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  const primary = proposal.cables.find(cable => cable.transformerSide === 'primary');
  assert.ok(primary, 'The mixed-voltage design must include its transformer primary cable.');
  assert.deepEqual(primary.routingDecision.selectedPath, ['BYPASS-A', 'BYPASS-B']);
  assert.equal(primary.routingDecision.shortestRejectedReason, 'shared-tray-capacity');
  assert.ok(primary.routingDecision.capacityExcludedEdgeIds.includes('SHORT'));
  assert.equal(primary.conductor_size, primary.routingDecision.selectedConductorSize);
  assert.equal(proposal.checks.find(check => check.id === 'racewayCapacity').status, 'pass');
});

test('a constrained transformer primary can reserve shared tray space before flexible direct loads', () => {
  for (const count of [25, 50]) {
    const input = constrainedBranchFixture(count);
    input.equipment = input.equipment.slice(0, count - 2);
    for (let index = 1; index <= 2; index += 1) input.equipment.push({ ...input.equipment[0], id: `T-${index}`, tag: `T-${index}`, voltage: 208, kw: 0.5, x: 10 });
    input.overrides.panelLocations = { 'DP-01': { x: 0, y: 0, z: 0 }, 'DP-02': { x: 10, y: 0, z: 0 } };
    const original = structuredClone(input);
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
    const primary = proposal.cables.find(cable => cable.transformerSide === 'primary');
    assert.deepEqual(primary.routingDecision.selectedPath, ['SCARCE']);
    assert.equal(primary.lengthFt, 10);
    assert.equal(proposal.routingRetry?.prioritizedTransformerPrimaryId, primary.id);
    assert.equal(proposal.routingRetry?.method, 'prioritize-capacity-blocked-transformer-primary-v4');
    assert.ok(primary.protectiveDevice);
    assert.equal(proposal.transformer.primaryProtectiveDevice.catalogNumber, primary.protectiveDevice.catalogNumber);
    const connection = proposal.oneLine.sheets[0].connections.find(row => row.cableRef === primary.id);
    assert.ok(connection, 'The recovered primary remains connected in the one-line.');
    const recordedRoute = proposal.routeResults.batchResults.find(row => row.cable === primary.tag);
    assert.deepEqual(recordedRoute.route_segments.filter(segment => segment.type === 'tray').map(segment => segment.tray_id), ['SCARCE']);
    assert.equal(recordedRoute.total_length, 10);
    assert.equal(proposal.cables.filter(cable => cable.loadId).length, count);
    assert.equal(proposal.studyValidation.status, 'pass');
    assert.ok(proposal.racewayEvaluations.every(row => row.status === 'pass'));
    assert.deepEqual(input, original);
    input.generationBaseline = proposal.distributionBaseline;
    input.equipment.reverse(); input.corridors.nodes.reverse(); input.corridors.edges.reverse();
    const regenerated = generateDesignProposal(input);
    assert.equal(regenerated.status, 'proposal');
    assert.deepEqual(regenerated.panels.map(row => [row.id, row.loadIds]), proposal.panels.map(row => [row.id, row.loadIds]));
    assert.deepEqual(regenerated.cables.find(cable => cable.transformerSide === 'primary').routingDecision.selectedPath, ['SCARCE']);
    for (const change of ['closed', 'hot']) {
      const blocked = structuredClone(original);
      blocked.corridors.edges.filter(edge => edge.id.startsWith('BYPASS')).forEach(edge => { if (change === 'closed') edge.permitted = false; else edge.thermal = { ambientTempC: 75 }; });
      assert.equal(generateDesignProposal(blocked).status, 'blocked', change);
    }
  }
});

test('a no-feasible fallback stays blocked and identifies the capacity-limited shortest route', () => {
  const input = capacityFixture();
  for (const edge of input.corridors.edges.filter(row => row.id.startsWith('BYPASS'))) edge.permitted = false;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'blocked');
  assert.equal(proposal.checks.find(check => check.id === 'racewayCapacity').status, 'fail');
  const rejected = proposal.cables.find(cable => cable.loadId && cable.routingDecision.status === 'no-feasible-route');
  assert.ok(rejected);
  assert.equal(rejected.routingDecision.shortestRejectedReason, 'shared-tray-capacity');
});
