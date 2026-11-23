import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateDesignProposal } from '../analysis/designSynthesis.mjs';
import { evaluateDesignSynthesisRouteThermal } from '../analysis/designSynthesisThermal.mjs';

const sample = () => JSON.parse(fs.readFileSync(new URL('../samples/design-synthesis-industrial.json', import.meta.url), 'utf8'));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('published 40 C correction resizes all four affected feeders and their tray footprint', () => {
  const cold = generateDesignProposal(sample());
  const input = sample();
  input.corridors.edges[0].thermal = { ambientTempC: 40 };
  const hot = generateDesignProposal(input);
  assert.equal(hot.status, 'proposal', JSON.stringify(hot.issues));
  const feeders = hot.cables.filter(cable => !cable.loadId);
  assert.equal(feeders.length, 4);
  for (const feeder of feeders) {
    const original = cold.cables.find(cable => cable.id === feeder.id);
    assert.equal(original.conductor_size, '600 kcmil');
    assert.equal(feeder.conductor_size, '750 kcmil');
    // Independent Southwire table 6-8 values: 420*.88 < 400; 475*.88=418.
    close(original.ampacityA, 420);
    close(feeder.ampacityA, 418);
    close(feeder.thermalAssessment.adjustmentFactor, 0.88);
    assert.equal(feeder.thermalAssessment.limitingSegmentId, 'E01');
    assert.equal(feeder.protectiveDevice.continuousCurrentA, 400);
    assert.ok(feeder.voltageDropPct < original.voltageDropPct);
  }
  for (const branch of hot.cables.filter(cable => cable.loadId)) {
    const upstream = hot.cables.find(cable => cable.to === branch.from);
    close(branch.combinedVoltageDropPct, branch.voltageDropPct + upstream.voltageDropPct);
    assert.equal(branch.combinedVoltageDropStatus, 'pass');
  }
  const coldTray = cold.racewayEvaluations.find(row => row.racewayId === 'E01');
  const hotTray = hot.racewayEvaluations.find(row => row.racewayId === 'E01');
  // Four sourced MC cable ODs: 2.665 in before, 2.942 in after.
  assert.ok(JSON.stringify(coldTray.used).includes('10.66'));
  assert.ok(JSON.stringify(hotTray.used).includes('11.768'));
  assert.notEqual(cold.inputSignature, hot.inputSignature);
  const unaffected = hot.cables.find(cable => cable.id === 'C-M-01');
  assert.equal(unaffected.thermalAssessment.adjustmentFactor, 1);
});

test('45 C derating constrains feeder ampacity while feasible panel partitions use smaller devices', () => {
  const input = sample();
  input.corridors.edges[0].thermal = { ambientTempC: 45 };
  const result = generateDesignProposal(input);
  assert.equal(result.status, 'proposal', JSON.stringify(result.issues));
  assert.equal(result.distributionPartitionValidation.status, 'evaluated');
  assert.ok(result.distributionPartitionValidation.splitCount > 0);
  assert.equal(result.checks.find(check => check.id === 'routeThermalAmpacity').status, 'pass');
  const feeders = result.cables.filter(item => !item.loadId);
  assert.ok(feeders.length > 4);
  for (const cable of feeders) {
    assert.equal(cable.sizingStatus, 'screening-sized');
    close(cable.thermalAssessment.adjustmentFactor, 0.82);
    assert.ok(cable.ampacityA >= cable.protectiveRequirement.ampereRatingA);
  }
  // The source construction ceiling remains binding: the largest listed
  // 750 kcmil conductor derates from 475 A to 389.5 A, below a 400 A device.
  close(475 * 0.82, 389.5);
  assert.ok(389.5 < 400);
  const assignedLoadIds = result.distributionPartitionValidation.groups.flatMap(group => group.loadIds).sort();
  assert.deepEqual(assignedLoadIds, result.loads.map(load => load.id).sort());
});

test('route conditions stay paired and explicit cover threshold is strictly greater than six feet', () => {
  const route = { status: 'routed', edgeIds: ['HOT', 'GROUPED'], sourceAttachmentFt: 0, destinationAttachmentFt: 0 };
  const edges = [
    { id: 'HOT', thermal: { ambientTempC: 40, bundledConductors: 3 } },
    { id: 'GROUPED', thermal: { ambientTempC: 30, bundledConductors: 6 } },
  ];
  const paired = evaluateDesignSynthesisRouteThermal({ route, edges });
  close(paired.adjustmentFactor, 0.8); // min(.88, .80), not .88*.80.
  assert.equal(paired.limitingSegmentId, 'GROUPED');
  for (const [length, expected] of [[6, 1], [6.001, 0.95]]) {
    const result = evaluateDesignSynthesisRouteThermal({ route: { ...route, edgeIds: ['COVER'] }, edges: [{ id: 'COVER', thermal: { solidCoverContinuousLengthFt: length } }] });
    close(result.adjustmentFactor, expected);
  }
});

test('single-conductor touching multiplier is not applied to the multicore MC catalog', () => {
  const input = sample();
  input.criteria.installationType = 'tray_touching';
  const result = generateDesignProposal(input);
  assert.equal(result.status, 'proposal', JSON.stringify(result.issues));
  assert.equal(result.cables.find(cable => cable.id === 'F-DP-01').conductor_size, '600 kcmil');
  assert.equal(result.cables.find(cable => cable.id === 'F-DP-01').thermalAssessment.adjustmentFactor, 1);
});
