import assert from 'node:assert/strict';
import { buildCablePullPlan } from '../analysis/cablePullPlan.mjs';

const cable = {
  weight: 10,
  diameter: 1,
  max_tension: 1000,
  max_sidewall_pressure: 500,
  start_tag: 'A',
  end_tag: 'B'
};

{
  const plan = buildCablePullPlan([
    { start: [0, 0, 0], end: [100, 0, 0], length: 100, type: 'tray' }
  ], cable, { maxPullLengthFt: 500, defaultBendRadiusFt: 3, coeffFriction: 0.35 });
  assert.equal(plan.status, 'pass');
  assert.equal(plan.sections.length, 1);
  assert.equal(plan.setupPoints.length, 1);
  assert.ok(Math.abs(plan.maxTension - 722.5) < 0.001);
  assert.equal(plan.assumptions.incomingTensionLbf, 250);
  assert.deepEqual(plan.equipment.counts, { reels: 1, tuggers: 1, handPulls: 0, sheaves: 0, rollers: 9 });
  assert.equal(plan.equipment.weakestLink.key, 'cable');
}

{
  const plan = buildCablePullPlan([
    { start: [0, 0, 0], end: [15, 0, 0], length: 15, type: 'tray' }
  ], { ...cable, weight: 2 }, {
    allowHandPulls: true,
    maxHandPullLengthFt: 25,
    maxHandPullTensionLbf: 200,
    pullDirection: 'forward'
  });
  assert.equal(plan.sections[0].pullMethod, 'hand');
  assert.equal(plan.equipment.tuggers.length, 0);
  assert.equal(plan.equipment.handPulls.length, 1);
  assert.equal(plan.equipment.handPulls[0].sectionLengthFt, 15);
  assert.ok(plan.equipment.handPulls[0].requiredForceLbf < 200);
}

{
  const plan = buildCablePullPlan([
    { start: [0, 0, 0], end: [15, 0, 0], length: 15, type: 'tray' }
  ], { ...cable, weight: 2 }, {
    allowHandPulls: false,
    maxHandPullLengthFt: 25,
    maxHandPullTensionLbf: 200,
    pullDirection: 'forward'
  });
  assert.equal(plan.sections[0].pullMethod, 'tugger');
  assert.equal(plan.equipment.tuggers.length, 1);
  assert.equal(plan.equipment.handPulls.length, 0);
}

{
  const plan = buildCablePullPlan([
    { start: [0, 0, 0], end: [15, 0, 0], length: 15, type: 'tray' }
  ], cable, {
    allowHandPulls: true,
    maxHandPullLengthFt: 25,
    maxHandPullTensionLbf: 200,
    pullDirection: 'forward'
  });
  assert.equal(plan.sections[0].pullMethod, 'tugger');
  assert.ok(plan.sections[0].maxTension > 200);
}

{
  const plan = buildCablePullPlan([
    { start: [0, 0, 0], end: [400, 0, 0], length: 400, type: 'tray' }
  ], cable, { maxPullLengthFt: 150, defaultBendRadiusFt: 3, coeffFriction: 0.35 });
  assert.equal(plan.status, 'setups-required');
  assert.equal(plan.sections.length, 3);
  assert.deepEqual(plan.setupPoints.map(point => Math.round(point.distanceFromStart)), [0, 150, 300]);
  assert.ok(plan.sections.every(section => section.length <= 150.01));
  assert.equal(plan.equipment.reels.length, 3);
  assert.equal(plan.equipment.tuggers.length, 3);
  assert.deepEqual(plan.equipment.tuggers.map(item => Math.round(item.distanceFromPullStart)), [150, 300, 400]);
}

{
  const plan = buildCablePullPlan([
    { start: [0, 0, 0], end: [20, 0, 0], length: 20, type: 'tray' },
    { start: [20, 0, 0], end: [20, 20, 0], length: 20, type: 'tray' }
  ], { ...cable, max_sidewall_pressure: 10 }, {
    maxPullLengthFt: 500,
    defaultBendRadiusFt: 1,
    coeffFriction: 0.35
  });
  assert.equal(plan.status, 'setups-required');
  assert.equal(plan.sections.length, 2);
  assert.deepEqual(plan.setupPoints[1].point, [20, 0, 0]);
  assert.match(plan.setupPoints[1].reason, /sidewall pressure/);
  assert.equal(plan.equipment.sheaves.length, 1);
  assert.equal(plan.equipment.sheaves[0].angleDeg, 90);
}

{
  const plan = buildCablePullPlan([
    { start: [0, 0, 0], end: [10, 0, 0], length: 10 }
  ], { diameter: 1 }, { allowableTension: 1000, allowableSidewallPressure: 500 });
  assert.equal(plan.status, 'inputs-required');
  assert.ok(plan.missingInputs.includes('Cable weight (lb/ft)'));
}

{
  const plan = buildCablePullPlan([
    { start: [0, 0, 0], end: [100, 0, 0], length: 100, type: 'tray' }
  ], { ...cable, max_tension: 5000 }, {
    gripCapacityLbf: 800,
    pullerCapacityLbf: 3000,
    ropeCapacityLbf: 5000,
    anchorageCapacityLbf: 2500
  });
  assert.equal(plan.allowableTension, 800);
  assert.equal(plan.equipment.weakestLink.key, 'grip');
  assert.equal(plan.equipment.weakestLink.label, 'Grip / pulling eye');
}

{
  const plan = buildCablePullPlan([
    { start: [0, 0, 0], end: [100, 0, 0], length: 100, type: 'conduit' },
    { start: [100, 0, 0], end: [100, 10, 0], length: 10, type: 'tray' }
  ], { ...cable, max_tension: 10000, max_sidewall_pressure: 10000 }, {
    allowableTension: 10000,
    gripCapacityLbf: 10000,
    pullerCapacityLbf: 10000,
    ropeCapacityLbf: 10000,
    anchorageCapacityLbf: 10000,
    pullDirection: 'auto'
  });
  assert.equal(plan.direction, 'reverse');
  assert.equal(plan.directionLabel, 'B → A');
  assert.ok(plan.directionComparison.reverse.maxTension < plan.directionComparison.forward.maxTension);
  assert.equal(plan.equipment.sheaves[0].transition, 'tray to conduit');
}

{
  const plan = buildCablePullPlan([
    { start: [0, 0, 0], end: [25, 0, 0], type: 'tray' },
    { start: [25, 0, 0], end: [25, 25, 0], type: 'tray' }
  ], { ...cable, max_tension: 10000, max_sidewall_pressure: 10000 }, {
    gripCapacityLbf: 10000,
    pullerCapacityLbf: 10000,
    ropeCapacityLbf: 10000,
    anchorageCapacityLbf: 10000,
    sheaveCapacityLbf: 100
  });
  assert.equal(plan.status, 'review-required');
  assert.equal(plan.equipment.sheaves[0].pass, false);
  assert.ok(plan.equipment.sheaves[0].reactionLbf > 100);
}

{
  const plan = buildCablePullPlan([
    { start: [0, 0, 0], end: [30, 0, 0], type: 'conduit' },
    { start: [30, 0, 0], end: [60, 0, 0], type: 'tray' }
  ], cable, { pullDirection: 'forward', maxRollerSpacingFt: 10 });
  assert.equal(plan.equipment.rollers.length, 2);
  assert.ok(plan.equipment.rollers.every(roller => roller.racewayId === ''));
}

console.log('cable pull planning verified');
