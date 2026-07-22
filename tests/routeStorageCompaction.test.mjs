import assert from 'node:assert/strict';
import {
    compactRouteResultForStorage,
    compactRouteResultStateForStorage,
    compactTrayCableMapForStorage
} from '../analysis/routeStorageCompaction.mjs';
import { normalizeRouteResultState } from '../analysis/routeResults.mjs';

const cable = {
    name: 'HV-CABLE-001',
    diameter: 0.65,
    allowed_cable_group: 'HV',
    route_segments: Array.from({ length: 20 }, (_, index) => ({ index }))
};
const result = {
    cable: cable.name,
    status: 'Routed',
    tray_segments: ['T-01'],
    route_segments: [{
        type: 'tray',
        start: [0, 0, 10],
        end: [50, 0, 10],
        length: 50,
        tray_id: 'T-01',
        from: '(0, 0, 10)',
        to: '(50, 0, 10)',
        raceway_id: 'T-01'
    }],
    breakdown: [{ segment: 1, tray_id: 'T-01', length: '50.00' }],
    exclusions: [
        { tray_id: 'T-02', reason: 'group_mismatch', cable_id: cable.name, filter: 'racewayschedule.html?tray=T-02', message: 'Rejected T-02: group mismatch' },
        { tray_id: 'T-02', reason: 'group_mismatch', cable_id: cable.name }
    ],
    mismatched_records: [{ tray_id: 'T-02', reason: 'group_mismatch' }]
};

const compactResult = compactRouteResultForStorage(result);
assert.equal(compactResult.breakdown, undefined);
assert.equal(compactResult.tray_segments, undefined);
assert.equal(compactResult.mismatched_records, undefined);
assert.deepEqual(compactResult.exclusions, [{ tray_id: 'T-02', reason: 'group_mismatch' }]);
assert.deepEqual(compactResult.route_segments[0], {
    type: 'tray',
    start: [0, 0, 10],
    end: [50, 0, 10],
    length: 50,
    tray_id: 'T-01'
});

const compactMap = compactTrayCableMapForStorage({
    'T-01': [cable, cable, { ...cable, conduit_id: 'C-01' }]
});
assert.equal(compactMap['T-01'].length, 2);
assert.equal(compactMap['T-01'][0].route_segments, undefined);

const originalState = {
    batchResults: Array.from({ length: 200 }, () => result),
    trayCableMap: { 'T-01': Array.from({ length: 200 }, (_, index) => ({ ...cable, name: `Cable ${index + 1}` })) }
};
const compactState = compactRouteResultStateForStorage(originalState);
assert.ok(JSON.stringify(compactState).length < JSON.stringify(originalState).length * 0.35);
assert.equal(Object.keys(compactState.screeningCatalog).length, 1);
assert.equal(Object.keys(compactState.screeningRecords).length, 1);
assert.deepEqual(compactState.screeningCatalog['screening-1'], ['record-1']);
assert.deepEqual(compactState.trayCableMap, {});
assert.equal(compactState.batchResults[0].exclusions, undefined);
assert.equal(compactState.batchResults[0].screening_ref, 'screening-1');

const hydratedState = normalizeRouteResultState(compactState);
assert.equal(hydratedState.batchResults.length, 200);
assert.deepEqual(hydratedState.batchResults[0].exclusions, [{ tray_id: 'T-02', reason: 'group_mismatch' }]);

console.log('route storage compaction verified');
