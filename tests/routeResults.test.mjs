import assert from 'node:assert/strict';
import {
  normalizeRouteResultState,
  normalizeRouteResults,
  routedCableNamesFromResults
} from '../analysis/routeResults.mjs';

const cables = [
  { tag: 'CBL-1', name: 'CBL-1', diameter: 0.75, cable_type: 'Power' },
  { tag: 'CBL-2', name: 'CBL-2', diameter: 0.5, cable_type: 'Control' }
];

const legacy = {
  source: 'sample',
  batchResults: [
    {
      cable: 'CBL-1',
      status: 'Routed',
      total_length: 100,
      breakdown: [{ raceway_id: 'TR-1', length: 100, start: [0, 0, 10], end: [100, 0, 10] }],
      route_segments: [{ type: 'raceway', raceway_id: 'TR-1', length: 100, start: [0, 0, 10], end: [100, 0, 10] }]
    },
    {
      cable: 'CBL-2',
      status: 'Routed',
      total_length: 40,
      route_segments: [{ type: 'field', length: 40, start: [0, 0, 0], end: [40, 0, 0] }]
    }
  ]
};

const rows = normalizeRouteResults(legacy);
assert.equal(rows.length, 2);
assert.equal(rows[0].mode, 'Saved');
assert.equal(rows[0].segments_count, 1);
assert.equal(rows[0].tray_segments_count, 1);
assert.equal(rows[0].breakdown[0].tray_id, 'TR-1');
assert.equal(rows[0].breakdown[0].type, 'raceway');
assert.equal(rows[0].breakdown[0].from, '(0, 0, 10)');
assert.equal(rows[1].tray_segments_count, 0);
assert.deepEqual([...routedCableNamesFromResults(legacy)], ['CBL-1', 'CBL-2']);

const state = normalizeRouteResultState(legacy, { cables });
assert.deepEqual(state.routedCableNames, ['CBL-1', 'CBL-2']);
assert.equal(state.trayCableMap['TR-1'].length, 1);
assert.equal(state.trayCableMap['TR-1'][0].diameter, 0.75);

console.log('route result normalization');
