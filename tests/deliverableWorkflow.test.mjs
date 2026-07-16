import assert from 'node:assert/strict';
import {
  buildDeliverableReadinessDiagnostics,
  normalizeRouteResults,
  routedCableNamesFromResults
} from '../analysis/deliverableWorkflow.mjs';

const cables = [
  {
    tag: 'CBL-101',
    from: 'SWBD-101',
    to: 'MCC-101',
    conductor_size: '3-500 kcmil CU',
    length: 120,
    route_preference: 'TR-101',
    raceway_ids: ['TR-101'],
    cable_type: 'Power',
    diameter: 1.2,
    weight: 3.1,
  },
  {
    tag: 'CBL-102',
    from: 'MCC-101',
    to: 'PMP-101',
    conductor_size: '3-#4 CU',
    length: 80,
    route_preference: 'TR-102',
    raceway_ids: ['TR-102'],
    cable_type: 'Power',
    diameter: 0.55,
    weight: 1.1,
  },
];

const trays = [
  {
    tray_id: 'TR-101',
    start_x: 0,
    start_y: 0,
    start_z: 10,
    end_x: 40,
    end_y: 0,
    end_z: 10,
    inside_width: 24,
    tray_depth: 6,
  },
  {
    tray_id: 'TR-102',
    start_x: 40,
    start_y: 0,
    start_z: 10,
    end_x: 70,
    end_y: 10,
    end_z: 10,
    inside_width: 18,
    tray_depth: 4,
  },
];

const routeResults = {
  batchResults: [
    {
      cable: 'CBL-101',
      status: 'Routed',
      total_length: 120,
      breakdown: [
        { tray_id: 'TR-101', length: 40, start: [0, 0, 10], end: [40, 0, 10] },
      ],
      route_segments: [
        { type: 'straight', tray_id: 'TR-101', length: 40, start: [0, 0, 10], end: [40, 0, 10] },
      ],
    },
  ],
};

assert.equal(normalizeRouteResults(routeResults).length, 1);
assert.deepEqual(Array.from(routedCableNamesFromResults(routeResults)), ['CBL-101']);


const forged = buildDeliverableReadinessDiagnostics({
  cables,
  trays,
  routeResults: {
    batchResults: [
      {
        cable: 'CBL-999',
        status: 'Routed',
        total_length: 20,
        breakdown: [{ tray_id: 'TR-HIDDEN', length: 20 }],
        route_segments: [{ tray_id: 'TR-HIDDEN', length: 20 }],
      },
    ],
  },
});

assert.equal(forged.health.routeResults, 0);
assert.deepEqual(forged.missingRouteResultTags, ['CBL-101', 'CBL-102']);


const partial = buildDeliverableReadinessDiagnostics({
  cables,
  trays,
  routeResults,
  studies: {},
  reportSnapshots: {},
  lifecyclePackages: [],
});

assert.equal(partial.health.scheduleReady, 2);
assert.equal(partial.health.routeResults, 1);
assert.deepEqual(partial.missingRouteResultTags, ['CBL-102']);
assert(partial.actions.some(action => action.label === 'Refresh route results'));
assert.equal(partial.ready.pullCards, true);
assert.equal(partial.ready.spoolSheets, true);
assert.equal(partial.ready.reportSnapshot, false);

const complete = buildDeliverableReadinessDiagnostics({
  cables,
  trays,
  routeResults: [
    ...routeResults.batchResults,
    {
      cable: 'CBL-102',
      status: 'Routed',
      total_length: 80,
      breakdown: [
        { tray_id: 'TR-102', length: 32, start: [40, 0, 10], end: [70, 10, 10] },
      ],
      route_segments: [
        { type: 'straight', tray_id: 'TR-102', length: 32, start: [40, 0, 10], end: [70, 10, 10] },
      ],
    },
  ],
  studies: { shortCircuit: { status: 'Run' } },
  reportSnapshots: { 'snapshot-1': { id: 'snapshot-1' } },
  lifecyclePackages: [{ id: 'pkg-1' }],
});

assert.equal(complete.health.routeCoverage, 100);
assert.equal(complete.health.reportSnapshots, 1);
assert.equal(complete.health.lifecyclePackages, 1);
assert.equal(complete.ready.releasePackage, true);
assert.equal(complete.nextAction.href, 'projectreport.html');
assert.equal(complete.actions.filter(action => action.severity === 'warning').length, 0);

console.log('deliverable workflow');
