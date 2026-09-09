import assert from 'node:assert/strict';

import { buildCablePullPlan } from '../analysis/cablePullPlan.mjs';
import { buildPullConstructabilityAssurance } from '../analysis/pullConstructability.mjs';

const cable = {
  tag: 'CBL-PULL-1',
  weight: 1,
  diameter: 1,
  max_tension: 10000,
  max_sidewall_pressure: 10000,
  min_bend_radius_ft: 2,
};

const completeBasis = {
  maxPullLengthFt: 500,
  defaultBendRadiusFt: 3,
  allowableTension: 10000,
  allowableSidewallPressure: 10000,
  pullerCapacityLbf: 10000,
  ropeCapacityLbf: 10000,
  gripCapacityLbf: 10000,
  anchorageCapacityLbf: 10000,
  sheaveCapacityLbf: 10000,
  cableLimitSource: 'Manufacturer pull sheet MPS-101 Rev 2',
  equipmentRatingsSource: 'Pull setup schedule PSE-101 Rev 1',
  bendGeometryConfirmed: true,
  bendGeometrySource: 'Raceway fitting schedule RFS-101 Rev 3',
  pullPointAccessSource: 'Field access plan FAP-101 Rev 1',
};

const straightRoute = [
  { type: 'conduit', start: [0, 0, 0], end: [100, 0, 0], length: 100 },
];

const bendRoute = [
  { type: 'conduit', start: [0, 0, 0], end: [50, 0, 0], length: 50 },
  { type: 'conduit', start: [50, 0, 0], end: [50, 50, 0], length: 50 },
];

const buildConfirmedPlan = (route, options = {}) => {
  const basis = { ...completeBasis, ...options };
  const draft = buildCablePullPlan(route, cable, basis);
  const pullPointAccessRecords = draft.constructability.pullPoints.records.map(record => ({
    id: record.id,
    status: 'confirmed',
    source: basis.pullPointAccessSource,
    notes: `${record.label} checked`,
  }));
  return buildCablePullPlan(route, cable, { ...basis, pullPointAccessRecords });
};

{
  const plan = buildConfirmedPlan(straightRoute);
  assert.equal(plan.constructability.status, 'pass');
  assert.match(plan.constructability.signature, /^[0-9a-f]{8}$/);
  assert.equal(plan.constructability.pullPoints.confirmed, true);
  assert.equal(plan.constructability.pullPoints.requiredCount, 2);
  assert.equal(plan.constructability.pullPoints.confirmedCount, 2);
}

{
  const plan = buildConfirmedPlan(bendRoute, {
    bendGeometryConfirmed: false,
    bendGeometrySource: '',
  });
  assert.equal(plan.constructability.status, 'blocked');
  assert(plan.constructability.blockingIssues.some(item => item.code === 'PULL-BEND-GEOMETRY-UNCONFIRMED'));
}

{
  const route = [
    { ...bendRoute[0], radius: 1, bend_radius_source: 'Modeled elbow E-1' },
    bendRoute[1],
  ];
  const plan = buildConfirmedPlan(route);
  assert(plan.constructability.blockingIssues.some(item => item.code === 'PULL-BEND-RADIUS-BELOW-MINIMUM'));
}

{
  const plan = buildConfirmedPlan(bendRoute);
  assert.equal(plan.constructability.status, 'pass');
  assert.equal(plan.constructability.bends[0].angleDeg, 90);
  assert.equal(plan.constructability.bends[0].radiusFt, 3);
  assert.equal(plan.constructability.bends[0].minimumRadiusFt, 2);
}

{
  const base = buildConfirmedPlan(bendRoute);
  const changed = buildConfirmedPlan(bendRoute, { defaultBendRadiusFt: 4 });
  assert.notEqual(base.constructability.signature, changed.constructability.signature);
}

{
  const plan = buildCablePullPlan(straightRoute, cable, {
    ...completeBasis,
    maxPullLengthFt: 40,
    pullPointAccessRecords: [],
  });
  assert.equal(plan.sections.length, 3);
  assert.equal(plan.constructability.pullPoints.requiredCount, 4);
  assert.equal(plan.constructability.pullPoints.pendingCount, 4);
  assert(plan.constructability.blockingIssues.some(item => item.code === 'PULL-POINT-ACCESS-PENDING'));
}

{
  const plan = buildConfirmedPlan(straightRoute);
  const assurance = buildPullConstructabilityAssurance({
    routeResults: [{
      cable: cable.tag,
      status: 'Routed',
      total_length: 100,
      route_segments: straightRoute,
      pull_check: plan,
    }],
  });
  assert.equal(assurance.applicable, true);
  assert.equal(assurance.status, 'pass');
  assert.equal(assurance.summary.ready, 1);
}

{
  const draft = buildCablePullPlan(straightRoute, cable, completeBasis);
  const plan = buildCablePullPlan(straightRoute, cable, {
    ...completeBasis,
    pullPointAccessRecords: draft.constructability.pullPoints.records.map((record, index) => ({
      id: record.id,
      status: index === 0 ? 'blocked' : 'confirmed',
      source: 'Field access plan FAP-101 Rev 1',
      notes: index === 0 ? 'Reel truck cannot reach setup pad' : '',
    })),
  });
  assert.equal(plan.constructability.pullPoints.blockedCount, 1);
  assert(plan.constructability.blockingIssues.some(item => item.code === 'PULL-POINT-ACCESS-BLOCKED'));
  assert.match(plan.constructability.blockingIssues.find(item => item.code === 'PULL-POINT-ACCESS-BLOCKED').message, /Reel truck/);
}

{
  const assurance = buildPullConstructabilityAssurance({
    routeResults: [{
      cable: cable.tag,
      status: 'Routed',
      total_length: 100,
      route_segments: straightRoute,
      pull_check: { status: 'pass' },
    }],
  });
  assert.equal(assurance.status, 'blocked');
  assert(assurance.blockingIssues.some(item => item.code === 'PULL-CONSTRUCTABILITY-EVIDENCE-MISSING'));
}

console.log('pull constructability assurance verified');
