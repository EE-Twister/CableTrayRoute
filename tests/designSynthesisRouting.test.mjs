import assert from 'node:assert/strict';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import bundledDeviceSnapshot from '../data/designSynthesisDevices.json' with { type: 'json' };

function inputWithAlternateRoute() {
  return {
    supply: { id: 'S', tag: 'S', voltage: 480, phases: 3, capacityKva: 500, availableFaultCurrentKA: 20, x: 0, y: 0, z: 0 },
    // 260 kW requires 390.91 A at continuous duty: above the hot-route
    // 389.5 A limit, with headroom below the 400 A protective rating for losses.
    equipment: [{ id: 'L1', tag: 'L1', kw: 260, voltage: 480, phases: 3, x: 20, y: 0, z: 0 }],
    criteria: { ambientTempC: 30, bundledConductors: 3, maxEndpointAttachmentFt: 1, voltageDropLimitPct: 3 },
    protectiveDevices: bundledDeviceSnapshot.records,
    corridors: {
      nodes: [{ id: 'N0', x: 0, y: 0, z: 0 }, { id: 'N1', x: 20, y: 0, z: 0 }, { id: 'N9', x: 0, y: 50, z: 0 }],
      edges: [
        { id: 'E01', from: 'N0', to: 'N1', widthIn: 24, depthIn: 6, permitted: true, thermal: { ambientTempC: 45 } },
        { id: 'BYPASS-A', from: 'N0', to: 'N9', widthIn: 24, depthIn: 6, permitted: true },
        { id: 'BYPASS-B', from: 'N9', to: 'N1', widthIn: 24, depthIn: 6, permitted: true },
      ],
    },
  };
}

test('routes around a shorter thermally infeasible corridor edge', () => {
  const proposal = generateDesignProposal(inputWithAlternateRoute());
  assert.equal(proposal.status, 'proposal');
  assert.deepEqual(proposal.panels[0].routingDecision.selectedPath, ['BYPASS-A', 'BYPASS-B']);
  assert.equal(proposal.panels[0].routingDecision.status, 'feasible');
  assert.ok(proposal.cables.every(cable => cable.sizingStatus === 'screening-sized'));
});

test('disconnected permitted corridors remain blocked', () => {
  const input = inputWithAlternateRoute();
  input.corridors.edges = [{ id: 'DISCONNECTED', from: 'N0', to: 'N9', widthIn: 24, depthIn: 6, permitted: true }];
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'blocked');
  assert.ok(proposal.issues.some(issue => issue.code === 'NO_PERMITTED_ROUTE'));
});

test('routing cannot hide an operating-current protection failure at the catalog boundary', () => {
  const input = inputWithAlternateRoute();
  input.equipment[0].kw = 266;
  const proposal = generateDesignProposal(input);
  // Nominal continuous design current is 399.942 A. Cable losses push it
  // above 400 A; the available catalog cannot select an applicable larger device.
  assert.equal(proposal.status, 'blocked');
  assert.equal(proposal.studyValidation.stopReason, 'regeneration-blocked');
  assert.ok(proposal.studyValidation.history[0].final.circuits.some(row => row.designCurrentA > 400));
  assert.ok(proposal.issues.some(issue => issue.code === 'NO_APPLICABLE_PROTECTIVE_DEVICE'), JSON.stringify(proposal.issues));
});

test('parallel equal edges and tied endpoint anchors remain deterministic', () => {
  const input = inputWithAlternateRoute();
  input.corridors.nodes.push({ id: 'N1B', x: 20, y: 0, z: 0 });
  input.corridors.edges.push({ id: 'PARALLEL-B', from: 'N0', to: 'N1B', widthIn: 24, depthIn: 6, permitted: true });
  input.equipment[0].x = 20; input.equipment[0].y = 0;
  const first = generateDesignProposal(input); const second = generateDesignProposal(input);
  assert.deepEqual(first.panels[0].routingDecision.selectedPath, second.panels[0].routingDecision.selectedPath);
});

test('candidate routing remains polynomial on a twenty-stage diamond mesh', () => {
  const input = inputWithAlternateRoute();
  const nodes = [{ id: 'N0', x: 0, y: 0, z: 0 }]; const edges = [];
  let previous = ['N0'];
  for (let stage = 1; stage <= 20; stage += 1) {
    const next = [`D${stage}A`, `D${stage}B`];
    next.forEach((id, index) => nodes.push({ id, x: stage * 10, y: index * 10, z: 0 }));
    for (const from of previous) for (const to of next) edges.push({ id: `${from}-${to}`, from, to, widthIn: 24, depthIn: 6, permitted: true });
    previous = next;
  }
  nodes.push({ id: 'N1', x: 210, y: 0, z: 0 });
  for (const from of previous) edges.push({ id: `${from}-N1`, from, to: 'N1', widthIn: 24, depthIn: 6, permitted: true });
  input.corridors = { nodes, edges };
  input.equipment[0].x = 210; input.equipment[0].y = 0;
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal');
  assert.ok(proposal.panels[0].routingDecision.selectedLengthFt >= 200);
  assert.ok(proposal.panels[0].routingDecision.searchedCandidateCount <= 15);
});
