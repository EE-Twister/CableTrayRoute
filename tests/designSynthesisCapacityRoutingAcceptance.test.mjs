import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { evaluateCorridorTrayCapacity } from '../analysis/designSynthesisRaceways.mjs';

function fixture(count = 25) {
  const input = JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-tray-congestion.json', import.meta.url), 'utf8'));
  input.equipment = Array.from({ length: count }, (_, index) => ({ ...input.equipment[0], id: `L-${String(index + 1).padStart(2, '0')}`, tag: `L-${String(index + 1).padStart(2, '0')}` }));
  return input;
}

function assertCoherentRoutes(proposal) {
  for (const cable of proposal.cables) {
    const route = proposal.routeResults.batchResults.find(row => row.cable === cable.tag);
    assert.ok(route, cable.id);
    const edges = route.route_segments.filter(segment => segment.type === 'tray').map(segment => segment.tray_id);
    assert.deepEqual(edges, cable.routingDecision.selectedPath);
    assert.deepEqual(route.routingDecision, cable.routingDecision);
    if (cable.routingDecision.status === 'feasible') assert.equal(cable.routingDecision.selectedConductorSize, cable.conductor_size);
    assert.ok(Math.abs(route.total_length - cable.lengthFt) < 1e-9);
    const connection = proposal.oneLine.sheets[0].connections.find(row => row.cableRef === cable.id);
    assert.equal(connection.cable.conductor_size, cable.conductor_size);
    assert.equal(connection.cable.lengthFt, cable.lengthFt);
  }
}

test('mixed cable fill does not assume a smaller conductor always fits where a larger one fits', () => {
  const edge = { id: 'MIXED', widthIn: 12, depthIn: 6 };
  const cables = ['750 kcmil', '750 kcmil', '500 kcmil', '4/0 AWG'].map((size, index) => ({ id: `R-${index}`, conductor_size: size }));
  // Independent archived-PDF category boundary: mixed small-cable area
  // allowance is 14 - 1.2 * (2.942 + 2.942 + 2.432 + 1.783) = 1.8812 in².
  assert.ok(Math.PI * 1.567 ** 2 / 4 > 1.8812);
  assert.ok(2.942 + 2.942 + 2.432 + 1.783 + 1.783 < 12);
  assert.equal(evaluateCorridorTrayCapacity({ edge, cables, candidateSize: '3/0 AWG' }).status, 'blocked');
  assert.equal(evaluateCorridorTrayCapacity({ edge, cables, candidateSize: '4/0 AWG' }).status, 'pass');
});

test('generator retains the capacity-qualified larger conductor across the mixed-fill boundary', () => {
  const input = fixture(5);
  input.supply.capacityKva = 3000;
  // Remove catalog device floors to isolate physical routing from device availability.
  input.protectiveDevices = [];
  input.criteria.maxLoadsPerPanel = 1;
  input.criteria.maxPanelLoadKva = 1000;
  input.corridors.edges.find(edge => edge.id === 'SHORT').widthIn = 12;
  input.equipment.forEach((load, index) => { load.kw = [379, 379, 300, 170, 150][index] * Math.sqrt(3) * 480 / 1000; });
  input.overrides.panelLocations = Object.fromEntries(input.equipment.map((load, index) => [`DP-${String(index + 1).padStart(2, '0')}`, { x: 20, y: 0, z: 0 }]));
  const proposal = generateDesignProposal(input);
  const feeders = proposal.cables.filter(cable => !cable.loadId);
  assert.deepEqual(feeders.map(cable => cable.conductor_size), ['750 kcmil', '750 kcmil', '500 kcmil', '4/0 AWG', '4/0 AWG']);
  assert.ok(feeders.every(cable => cable.routingDecision.selectedPath.join() === 'SHORT'));
  // The last feeder needs only 187.5 A electrically (3/0 is 200 A), but the
  // independent mixed-fill geometry above requires crossing to the 4/0 category.
  assert.ok(Math.abs(feeders[4].currentA * 1.25 - 187.5) < 1e-9);
  const fill = proposal.racewayEvaluations.find(row => row.racewayId === 'SHORT');
  assert.equal(fill.status, 'pass');
  assert.ok(Math.abs(fill.utilizationPercent - 11.882 / 12 * 100) < 1e-9);
  assert.equal(proposal.status, 'blocked', 'Missing protection candidates must remain unresolved');
  assertCoherentRoutes(proposal);
});

test('route search and final sizing agree at a floating-point ampacity boundary without accepting a real overload', () => {
  const input = fixture(1);
  input.supply.capacityKva = 1000;
  input.protectiveDevices = [];
  input.equipment[0].kw = 380 * Math.sqrt(3) * 480 / 1000;
  // One-way conversion back to amperes can produce 475.00000000000006 A
  // after the continuous-duty multiplier; 750 kcmil has a 475 A table limit.
  const exact = generateDesignProposal(input);
  const branch = exact.cables.find(cable => cable.loadId);
  assert.equal(branch.conductor_size, '750 kcmil');
  assert.equal(branch.routingDecision.status, 'feasible');
  assertCoherentRoutes(exact);
  input.equipment[0].kw = (380 + 1e-5) * Math.sqrt(3) * 480 / 1000;
  const overloaded = generateDesignProposal(input);
  assert.ok(!overloaded.cables.find(cable => cable.loadId).conductor_size);
  assert.equal(overloaded.status, 'blocked');
});

test('25/50 loads reserve real cable space and use a permitted bypass rather than rejecting a feasible shared tray layout', () => {
  for (const count of [25, 50]) {
    const input = fixture(count);
    const snapshot = structuredClone(input);
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
    assert.equal(proposal.loads.length, count);
    assert.equal(proposal.studyValidation.status, 'pass');
    assert.equal(proposal.checks.find(row => row.id === 'racewayCapacity').status, 'pass');
    assert.equal(proposal.installationCoverage.every(row => row.status === 'evaluated'), true);
    const branches = proposal.cables.filter(row => row.loadId);
    const short = branches.filter(row => row.routingDecision.selectedPath.includes('SHORT'));
    const bypass = branches.filter(row => row.routingDecision.selectedPath.includes('BYPASS-A'));
    // Independent NEC ladder-table and archived-PDF cable geometry, not production lookup:
    // width 6 in allows 7 in²; each #8 MC cable occupies pi * .833² / 4 in².
    const cableArea = Math.PI * 0.833 ** 2 / 4;
    assert.equal(short.length, Math.floor(7 / cableArea));
    assert.equal(short.length, 12);
    assert.equal(bypass.length, count - 12);
    assert.ok(short.every(row => row.conductor_size === '#8 AWG' && row.lengthFt === 20));
    const bypassLength = 50 + Math.hypot(20, 50);
    for (const row of bypass) {
      assert.deepEqual(row.routingDecision.selectedPath, ['BYPASS-A', 'BYPASS-B']);
      assert.ok(Math.abs(row.lengthFt - bypassLength) < 1e-10);
      assert.equal(row.conductor_size, '#8 AWG');
      assert.equal(row.routingDecision.shortestRejectedReason, 'shared-tray-capacity');
      assert.ok(row.routingDecision.capacityExcludedEdgeIds.includes('SHORT'));
      const currentA = 2000 / (Math.sqrt(3) * 480);
      const expectedDrop = 100 * Math.sqrt(3) * currentA * 0.810 * bypassLength / (1000 * 480);
      assert.ok(Math.abs(row.voltageDropPct - expectedDrop) < 1e-12);
      assert.ok(row.combinedVoltageDropPct <= input.criteria.voltageDropLimitPct);
    }
    for (const row of proposal.cables) assert.ok(row.routingDecision.searchedCandidateCount <= 15);
    const shortEvaluation = proposal.racewayEvaluations.find(row => row.racewayId === 'SHORT');
    assert.ok(Math.abs(shortEvaluation.utilizationPercent - 12 * cableArea / 7 * 100) < 1e-10);
    assert.equal(proposal.trays.find(row => row.id === 'SHORT').width, 6);
    assertCoherentRoutes(proposal);
    assert.deepEqual(input, snapshot, 'The generator cannot widen the corridor or change permission/criteria to fit');
  }
});

test('capacity-aware routing stays deterministic across equipment and graph input ordering', () => {
  const input = fixture(50);
  const first = generateDesignProposal(input);
  input.equipment.reverse();
  input.corridors.nodes.reverse();
  input.corridors.edges.reverse();
  const second = generateDesignProposal(input);
  const decisions = proposal => proposal.cables.map(row => ({ id: row.id, size: row.conductor_size, path: row.routingDecision.selectedPath, length: row.lengthFt })).sort((a, b) => a.id.localeCompare(b.id));
  assert.equal(first.status, 'proposal');
  assert.equal(second.status, 'proposal');
  assert.deepEqual(decisions(second), decisions(first));
});

test('closing or thermally disqualifying the bypass cannot bypass the shared capacity constraint', () => {
  for (const reason of ['prohibited', 'thermal']) {
    const input = fixture();
    for (const edge of input.corridors.edges.filter(row => row.id.startsWith('BYPASS'))) {
      if (reason === 'prohibited') edge.permitted = false;
      else edge.thermal = { ambientTempC: 75 };
    }
    const snapshot = structuredClone(input);
    const proposal = generateDesignProposal(input);
    assert.equal(proposal.status, 'blocked', reason);
    assert.equal(proposal.checks.find(row => row.id === 'racewayCapacity').status, 'fail');
    assert.ok(proposal.issues.some(row => row.code === 'RACEWAY-CAPACITY-BLOCKED'));
    assert.ok(proposal.cables.filter(row => row.loadId).some(row => row.routingDecision.status !== 'feasible'));
    assert.deepEqual(input, snapshot);
  }
});

test('a longer capacity bypass still has to satisfy unchanged voltage-drop and terminal criteria', () => {
  const input = fixture();
  input.corridors.nodes.find(row => row.id === 'N9').y = 1000000;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.cables.filter(row => row.loadId).some(row => row.routingDecision.status !== 'feasible'));
  assert.equal(proposal.inputs.original.criteria.voltageDropLimitPct, 3);
});

test('regeneration clears old reservations and revises fill instead of accumulating phantom cables', () => {
  const input = fixture(50);
  const first = generateDesignProposal(input);
  input.equipment = input.equipment.slice(0, 5);
  const smaller = generateDesignProposal(input);
  assert.equal(first.status, 'proposal');
  assert.equal(smaller.status, 'proposal');
  assert.equal(smaller.cables.filter(row => row.loadId && row.routingDecision.selectedPath.includes('SHORT')).length, 5);
  assert.ok(smaller.cables.every(row => !row.routingDecision.selectedPath.includes('BYPASS-A')));
  assert.ok(smaller.trays.every(row => row.id === 'SHORT'));
  assert.notEqual(smaller.inputSignature, first.inputSignature);
  assertCoherentRoutes(smaller);
});

test('motor branches retain candidate, thermal and starting evidence when shared capacity changes their paths', () => {
  const input = fixture();
  Object.assign(input.equipment[24], { kw: 9, powerFactor: 0.86, duty: 'continuous', ratingsBasis: 'electrical-input-kW', motor: {
    ratedVoltageV: 460, fullLoadCurrentA: 14, fullLoadCurrentBasis: { reference: 'Synthetic acceptance design current' },
    nameplateCurrentA: 12.8, nameplateHorsepower: 10, nameplateFrequencyHz: 60,
    lockedRotorCurrentA: 90, lockedRotorPowerFactor: 0.3, starterType: 'dol', rotorType: 'squirrel-cage',
  } });
  input.supply.motorStartingImpedance = { rOhm: 0.006, xOhm: 0.015, reference: 'Synthetic source impedance within 20 kA external bound' };
  input.criteria.motorStarting = { minimumVoltagePu: 0.8 };
  input.criteria.motorStarter = { controlVoltageV: 24, controlCurrentType: 'DC', branchProtectionMethod: 'inverse-time-breaker', instantaneousPickupA: 150 };
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.checks.find(row => row.id === 'racewayCapacity').status, 'pass');
  assert.equal(proposal.studyValidation.status, 'pass');
  assert.equal(proposal.motorStartingValidation.status, 'pass');
  const cable = proposal.cables.find(row => row.loadId === 'L-25');
  assert.deepEqual(cable.routingDecision.selectedPath, ['BYPASS-A', 'BYPASS-B']);
  assert.equal(cable.protectiveDevice.catalogNumber, '3VA5125-6EC31-0AA0');
  assert.equal(cable.motor.designAmpacityA, 17.5);
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(row => row.code === 'MOTOR_PROTECTION_UNRESOLVED'));
  assertCoherentRoutes(proposal);
});
