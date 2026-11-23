import assert from 'node:assert/strict';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { distributionPartitionFixture } from './helpers/distributionPartitionFixture.mjs';
import { faultEvolutionFixture } from './helpers/faultEvolutionFixture.mjs';

test('default 25/50 motor groups split into supported feeder and device groups without changing criteria', () => {
  for (const count of [25, 50]) {
    const input = distributionPartitionFixture(count);
    const original = structuredClone(input);
    const proposal = generateDesignProposal(input);
    const validation = proposal.distributionPartitionValidation;

    assert.ok(validation, 'partition validation is retained on the proposal');
    assert.equal(validation.status, 'evaluated');
    assert.equal(validation.stoppingReason, 'all-feeders-feasible');
    assert.equal(validation.criteria.maxPanelLoadKva, 500);
    assert.equal(validation.criteria.maxLoadsPerPanel, 50);
    assert.ok(validation.splitCount > 0);
    assert.ok(validation.trialCount <= count);
    assert.equal(validation.groups.length, proposal.panels.length);
    assert.equal(proposal.cables.filter(cable => !cable.loadId).length, proposal.panels.length);

    const assigned = validation.groups.flatMap(group => group.loadIds);
    assert.equal(assigned.length, count);
    assert.equal(new Set(assigned.map(id => id.toLowerCase())).size, count);
    assert.deepEqual(assigned.sort(), input.equipment.map(row => row.id).sort());
    for (const group of validation.groups) {
      assert.equal(group.sizingStatus, 'screening-sized');
      assert.ok(group.ampacityA >= group.designAmpacityA, `${group.panelId} feeder must meet its retained design floor`);
      assert.equal(group.protectiveDeviceStatus, 'selected');
    }

    assert.ok(proposal.panelLocationOverrides.some(row => row.panelId === 'DP-01' && row.requestedLocation));
    assert.deepEqual(input, original, 'generation does not mutate supplied criteria, baseline, overrides, or equipment');
  }
});

test('an empty selected device catalog blocks in one trial without futile singleton retries', () => {
  const input = distributionPartitionFixture(1);
  input.protectiveDevices = [];
  const proposal = generateDesignProposal(input);
  assert.equal(proposal.distributionPartitionValidation.status, 'blocked');
  assert.equal(proposal.distributionPartitionValidation.stoppingReason, 'global-device-catalog-unavailable');
  assert.equal(proposal.distributionPartitionValidation.trialCount, 1);
  assert.ok(proposal.issues.some(row => row.code === 'DISTRIBUTION_GROUP_GLOBAL_CONSTRAINT'));
  assert.equal(proposal.status, 'blocked');
});

test('an infeasible 50-load nonmotor feeder partitions under the supplied default limits', () => {
  const input = faultEvolutionFixture(50, false);
  input.supply.capacityKva = 2000;
  for (const load of input.equipment) Object.assign(load, { kw: 9, powerFactor: 0.86, duty: 'continuous', ratingsBasis: 'electrical-input-kW' });
  const proposal = generateDesignProposal(input);
  const validation = proposal.distributionPartitionValidation;
  assert.equal(proposal.status, 'proposal');
  assert.equal(proposal.studyValidation.status, 'pass');
  assert.equal(proposal.faultStudyValidation.status, 'evaluated');
  assert.equal(proposal.deviceFaultValidation.status, 'evaluated');
  assert.equal(proposal.faultEvolutionValidation.status, 'evaluated');
  assert.equal(validation.status, 'evaluated');
  assert.equal(validation.criteria.maxPanelLoadKva, 500);
  assert.equal(validation.criteria.maxLoadsPerPanel, 50);
  assert.ok(validation.splitCount > 0);
  assert.equal(validation.groups.flatMap(group => group.loadIds).length, 50);
  for (const group of validation.groups) {
    assert.ok(group.ampacityA >= group.designAmpacityA);
    assert.equal(group.protectiveDeviceStatus, 'selected');
  }
});

