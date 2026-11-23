import assert from 'node:assert/strict';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { distributionPartitionFixture, nonmotorDistributionPartitionFixture } from './helpers/distributionPartitionFixture.mjs';
import { faultEvolutionFixture } from './helpers/faultEvolutionFixture.mjs';

const copper75A = { '#14 AWG': 20, '#12 AWG': 25, '#10 AWG': 35, '#8 AWG': 50, '#6 AWG': 65, '#4 AWG': 85, '#3 AWG': 100, '#2 AWG': 115, '#1 AWG': 130, '1/0 AWG': 150, '2/0 AWG': 175, '3/0 AWG': 200, '4/0 AWG': 230, '250 kcmil': 255, '300 kcmil': 285, '350 kcmil': 310, '400 kcmil': 335, '500 kcmil': 380, '600 kcmil': 420, '750 kcmil': 475 };
const near = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${actual} versus ${expected}`);
const selectedRating = feeder => Number(feeder.protectiveDevice?.continuousCurrentA ?? feeder.protectiveDevice?.tripRatingA);
const assignment = proposal => proposal.panels.map(panel => ({ id: panel.id, loadIds: [...panel.loadIds].sort() }));

function assertSupportedDistribution(proposal, input) {
  assert.deepEqual(proposal.inputs.original.criteria, input.criteria);
  assert.equal(proposal.loads.length, input.equipment.length);
  assert.deepEqual(proposal.panels.flatMap(panel => panel.loadIds).sort(), input.equipment.map(load => load.id).sort());
  for (const panel of proposal.panels) {
    assert.ok(panel.loadIds.length > 0 && panel.loadIds.length <= input.criteria.maxLoadsPerPanel);
    assert.ok(panel.loadKva <= input.criteria.maxPanelLoadKva + 1e-9);
    const feeder = proposal.cables.find(cable => cable.to === panel.id);
    assert.ok(feeder);
    const expectedMotorFloor = panel.loadIds.reduce((sum, id) => sum + input.equipment.find(load => load.id === id).motor.fullLoadCurrentA * 1.25, 0);
    near(feeder.designAmpacityA, expectedMotorFloor);
    assert.equal(feeder.sizingStatus, 'screening-sized');
    assert.ok(feeder.ampacityA >= expectedMotorFloor - 1e-9);
    assert.ok(Number.isFinite(copper75A[feeder.conductor_size]), feeder.conductor_size);
    assert.ok(feeder.protectiveDevice?.catalogNumber);
    assert.ok(selectedRating(feeder) >= feeder.protectiveRequirement.ampereRatingA - 1e-9);
    assert.ok(selectedRating(feeder) <= feeder.ampacityA + 1e-9);
    assert.ok(Number.isFinite(feeder.r_ohm_per_kft) && Number.isFinite(feeder.x_ohm_per_kft));
    assert.equal(feeder.routingDecision.status, 'feasible');
    assert.equal(feeder.voltageDropStatus, 'evaluated');
  }
}

for (const count of [25, 50]) test(`${count} original default-limit motors get feasible feeders and exact load coverage without changing criteria`, () => {
  const input = distributionPartitionFixture(count);
  const unchanged = structuredClone(input);
  const proposal = generateDesignProposal(input);
  assert.deepEqual(input, unchanged);
  assertSupportedDistribution(proposal, input);
  assert.ok(proposal.panels.length > 1 && proposal.panels.length <= count);
  for (const panel of proposal.panels) {
    const feeder = proposal.cables.find(cable => cable.to === panel.id);
    near(feeder.ampacityA, copper75A[feeder.conductor_size]);
  }
  const partition = proposal.distributionPartitionValidation;
  assert.equal(partition.status, 'evaluated');
  assert.equal(partition.algorithm, 'deterministic-feasible-feeder-bisection-v1');
  assert.equal(partition.stoppingReason, 'all-feeders-feasible');
  assert.equal(partition.finalPanelCount, proposal.panels.length);
  assert.ok(partition.splitCount > 0 && partition.splitCount <= count - 1);
  assert.ok(partition.trialCount <= count);
  for (const decision of partition.decisions) if (decision.selectedConductorSize) assert.ok(decision.selectedAmpacityA >= decision.requiredDesignAmpacityA - 1e-9, JSON.stringify(decision));
  assert.equal(proposal.studyValidation.status, 'pass');
  assert.equal(proposal.motorStartingValidation.status, 'pass');
  assert.equal(proposal.faultStudyValidation.status, 'evaluated');
  assert.equal(proposal.deviceFaultValidation.status, 'evaluated');
  assert.equal(proposal.faultEvolutionValidation.status, 'evaluated');
  for (const load of proposal.loads) {
    const branch = proposal.cables.find(cable => cable.loadId === load.id);
    assert.equal(branch.motor.branchBreakerCandidate.catalogNumber, '3VA5125-6EC31-0AA0');
    assert.ok(branch.ampacityA >= branch.branchCircuitBreakerAmpacityFloorA);
    assert.ok(branch.ampacityA >= 1.25 * input.equipment.find(row => row.id === load.id).motor.fullLoadCurrentA);
  }
  assert.deepEqual([...new Set(proposal.issues.filter(row => row.severity === 'blocking').map(row => row.code))], ['MOTOR_PROTECTION_UNRESOLVED']);
  assert.equal(proposal.distributionBaseline, null);
});

test('an absent breaker catalog cannot erase the supplied motor feeder floor', () => {
  const input = distributionPartitionFixture(1);
  input.protectiveDevices = [];
  // Explicit synthetic arithmetic stress; no manufacturer performance is asserted.
  input.equipment[0].motor.fullLoadCurrentA = 100;
  input.equipment[0].motor.nameplateCurrentA = 100;
  const proposal = generateDesignProposal(input);
  const feeder = proposal.cables.find(cable => cable.to === proposal.panels[0]?.id);
  assert.ok(feeder);
  near(feeder.designAmpacityA, 125);
  if (feeder.sizingStatus === 'screening-sized') assert.ok(feeder.ampacityA >= 125);
  else assert.equal(feeder.sizingStatus, 'blocked');
  assert.equal(feeder.protectiveDevice, null);
  assert.equal(proposal.distributionPartitionValidation.status, 'blocked');
  assert.ok(proposal.issues.some(row => row.code === 'DISTRIBUTION_GROUP_GLOBAL_CONSTRAINT'));
  assert.equal(proposal.distributionPartitionValidation.stoppingReason, 'global-device-catalog-unavailable');
  assert.equal(proposal.distributionPartitionValidation.trialCount, 1);
  assert.equal(proposal.distributionBaseline, null);
});

test('a singleton beyond all sourced conductor ampacities blocks directly without invented parallel runs', () => {
  const input = distributionPartitionFixture(1);
  input.equipment[0].motor.fullLoadCurrentA = 1000;
  input.equipment[0].motor.nameplateCurrentA = 1000;
  const proposal = generateDesignProposal(input);
  const result = proposal.distributionPartitionValidation;
  assert.equal(result.status, 'blocked');
  assert.equal(result.splitCount, 0);
  assert.ok(result.trialCount <= 1);
  assert.ok(proposal.issues.some(row => row.code === 'DISTRIBUTION_GROUP_UNSERVABLE'));
  const feeder = proposal.cables.find(cable => cable.to === proposal.panels[0]?.id);
  assert.ok(feeder);
  assert.equal(feeder.sizingStatus, 'blocked');
  assert.ok(!feeder.conductor_size);
  assert.equal(feeder.protectiveDevice, null);
  assert.equal(proposal.distributionBaseline, null);
});

test('route derating participates in partition feasibility rather than only an unadjusted catalog ceiling', () => {
  const input = distributionPartitionFixture(25);
  input.criteria.ambientTempC = 50;
  const proposal = generateDesignProposal(input);
  assertSupportedDistribution(proposal, input);
  for (const panel of proposal.panels) {
    const feeder = proposal.cables.find(cable => cable.to === panel.id);
    assert.ok(feeder.thermalAssessment.adjustmentFactor < 1);
    near(feeder.ampacityA, copper75A[feeder.conductor_size] * feeder.thermalAssessment.adjustmentFactor);
  }
});

test('unchanged feasible nonmotor grouping remains a zero-split design', () => {
  const input = faultEvolutionFixture(25, false);
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'proposal');
  assert.equal(proposal.panels.length, 1);
  assert.equal(proposal.panels[0].id, 'DP-01');
  assert.deepEqual(proposal.panels[0].loadIds, input.equipment.map(load => load.id));
  assert.equal(Object.hasOwn(proposal, 'distributionPartitionValidation'), false, 'The existing feasible nonmotor generation path is preserved.');
});

test('baseline identity and its explicit location survive splitting and deterministic regeneration', () => {
  const baselineInput = faultEvolutionFixture(25, false);
  const baseline = generateDesignProposal(baselineInput);
  assert.ok(baseline.distributionBaseline);
  const input = distributionPartitionFixture(25);
  input.generationBaseline = baseline.distributionBaseline;
  const first = generateDesignProposal(input);
  const second = generateDesignProposal(input);
  assertSupportedDistribution(first, input);
  assert.deepEqual(assignment(first), assignment(second));
  const original = first.panels.find(panel => panel.id === 'DP-01');
  assert.ok(original);
  near(original.x, 10); near(original.y, 0); near(original.z, 0);
  assert.equal(first.panelLocationOverrides.filter(row => row.requestedLocation).length, 1);
  assert.equal(first.panelLocationOverrides.find(row => row.requestedLocation).panelId, 'DP-01');
  const newIds = first.panels.filter(panel => panel.id !== 'DP-01').map(panel => Number(panel.id.slice(3)));
  assert.ok(newIds.every(id => id >= baseline.distributionBaseline.nextPanelNumber));
});

test('partition trials do not reset or consume the explicit zero study revision budget', () => {
  const input = distributionPartitionFixture(25);
  input.criteria.loadFlow = { minimumVoltagePu: 0.999999, maxRevisions: 0 };
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.inputs.original.criteria.loadFlow.maxRevisions, 0);
  assert.ok(proposal.panels.length > 1);
  const histories = [proposal.studyValidation?.history, proposal.motorStartingValidation?.history, proposal.motorAccelerationValidation?.history].flatMap(rows => Array.isArray(rows) ? rows : []);
  assert.ok(histories.every(row => !row.revision || row.revision <= 0));
  assert.notEqual(proposal.studyValidation.status, 'pass');
  assert.equal(proposal.distributionBaseline, null);
});

test('identity exhaustion during a split cannot make empty groups appear feasible', () => {
  const input = distributionPartitionFixture(25);
  input.generationBaseline = { panels: [{ id: 'DP-01', loadIds: input.equipment.map(load => load.id) }], nextPanelNumber: Number.MAX_SAFE_INTEGER };
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.status, 'blocked');
  assert.equal(proposal.distributionPartitionValidation.status, 'blocked');
  assert.equal(proposal.distributionPartitionValidation.stoppingReason, 'input-invalid');
  assert.ok(proposal.issues.some(row => row.code === 'INVALID_PANEL_IDENTITY_BASELINE'));
  assert.equal(proposal.distributionBaseline, null);
});

test('a capacity-blocked fallback route cannot be called a feasible feeder partition', () => {
  const input = distributionPartitionFixture(1);
  for (const edge of input.corridors.edges) edge.widthIn = 0.01;
  const proposal = generateDesignProposal(input);
  const feeder = proposal.cables.find(cable => cable.to === proposal.panels[0]?.id);
  assert.ok(feeder);
  assert.notEqual(feeder.routingDecision.status, 'feasible');
  assert.equal(proposal.distributionPartitionValidation.status, 'blocked');
  assert.notEqual(proposal.distributionPartitionValidation.stoppingReason, 'all-feeders-feasible');
  assert.ok(proposal.issues.some(row => row.code === 'DISTRIBUTION_GROUP_UNSERVABLE'));
  assert.equal(proposal.distributionBaseline, null);
});

test('50 nonmotor industrial loads partition under the same ceilings into an applicable connected proposal', () => {
  const input = nonmotorDistributionPartitionFixture(50);
  const unchanged = structuredClone(input);
  const proposal = generateDesignProposal(input);
  assert.deepEqual(input, unchanged);
  assert.equal(proposal.status, 'proposal', JSON.stringify(proposal.issues));
  assert.ok(proposal.distributionBaseline);
  assert.equal(proposal.distributionPartitionValidation.status, 'evaluated');
  assert.equal(proposal.distributionPartitionValidation.stoppingReason, 'all-feeders-feasible');
  assert.ok(proposal.panels.length > 2);
  assert.deepEqual(proposal.panels.flatMap(panel => panel.loadIds).sort(), input.equipment.map(load => load.id).sort());
  assert.deepEqual(proposal.inputs.original.criteria, input.criteria);
  assert.equal(proposal.studyValidation.status, 'pass');
  assert.equal(proposal.faultStudyValidation.status, 'evaluated');
  assert.equal(proposal.deviceFaultValidation.status, 'evaluated');
  assert.equal(proposal.faultEvolutionValidation.status, 'evaluated');
  assert.equal(proposal.cables.length, 50 + proposal.panels.length);
  for (const panel of proposal.panels) {
    const feeder = proposal.cables.find(cable => cable.to === panel.id);
    const group = proposal.distributionPartitionValidation.groups.find(row => row.panelId === panel.id);
    const required = panel.loadIds.length * 9000 / (Math.sqrt(3) * 480 * 0.86) * 1.25;
    near(group.designAmpacityA, required);
    assert.ok(feeder.ampacityA >= required);
    assert.ok(selectedRating(feeder) >= required);
    assert.ok(selectedRating(feeder) <= feeder.ampacityA);
    assert.equal(feeder.routingDecision.status, 'feasible');
  }
  const regenerated = generateDesignProposal({ ...structuredClone(input), generationBaseline: proposal.distributionBaseline });
  assert.equal(regenerated.status, 'proposal');
  assert.deepEqual(assignment(regenerated), assignment(proposal));
});
