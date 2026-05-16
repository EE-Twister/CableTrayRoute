import assert from 'node:assert/strict';
import {
  applyCableImport,
  applyRecordImport,
  buildRoutingReadinessDiagnostics,
  cableHasRoutingCoordinates,
  getCableEndpointOptions,
  getCableAssignedRacewayIds,
  previewCableImport,
  previewRecordImport,
  summarizeCableWorkflow,
  summarizeRacewayWorkflow
} from '../analysis/scheduleWorkflow.mjs';

const endpoints = getCableEndpointOptions({
  equipment: [{ tag: 'SWBD-101' }, { ref: 'MCC-101' }],
  loads: [{ tag: 'PMP-101' }],
  panels: [{ panel_id: 'PNL-L1' }]
});
assert.deepEqual(endpoints, ['MCC-101', 'PMP-101', 'PNL-L1', 'SWBD-101']);

const cableSummary = summarizeCableWorkflow([
  { tag: 'CBL-1', from_tag: 'SWBD-101', to_tag: 'PMP-101', conductor_size: '#4 AWG', length: 80, raceway_ids: ['TR-1'] },
  { tag: 'CBL-2', from_tag: 'SWBD-101', to_tag: 'PMP-102', conductor_size: '#8 AWG', length: 60 },
  { tag: 'CBL-2', from_tag: '', to_tag: 'PMP-103', conductor_size: '', length: 0 }
]);
assert.equal(cableSummary.total, 3);
assert.equal(cableSummary.scheduleReady, 2);
assert.equal(cableSummary.routingReady, 1);
assert.equal(cableSummary.missingRaceway, 1);
assert.equal(cableSummary.missingFromTo, 1);
assert.equal(cableSummary.missingSize, 1);
assert.equal(cableSummary.duplicateTags, 2);

const currentCables = [
  { tag: 'CBL-1', from_tag: 'SWBD-101', to_tag: 'PMP-101', conductor_size: '#4 AWG', length: 80 },
  { tag: 'CBL-2', from_tag: 'SWBD-101' }
];
const incomingCables = [
  { tag: 'CBL-1', conductor_size: '#2 AWG', length: 80 },
  { tag: 'CBL-2', to_tag: 'PMP-102', conductor_size: '#8 AWG', length: 60 },
  { tag: 'CBL-3', from_tag: 'SWBD-101', to_tag: 'PMP-103' }
];
const cablePreview = previewCableImport(currentCables, incomingCables, { mode: 'merge' });
assert.equal(cablePreview.creates, 1);
assert.equal(cablePreview.updates, 1);
assert.equal(cablePreview.conflicts, 1);
assert.equal(cablePreview.preserved, 0);

const mergedCables = applyCableImport(currentCables, incomingCables, { mode: 'merge' });
assert.equal(mergedCables.length, 3);
assert.equal(mergedCables[0].conductor_size, '#4 AWG');
assert.equal(mergedCables[1].to_tag, 'PMP-102');

const racewaySummary = summarizeRacewayWorkflow({
  trays: [
    { tray_id: 'TR-1', start_x: 0, start_y: 0, start_z: 0, end_x: 10, end_y: 0, end_z: 0, inside_width: 12, tray_depth: 4 },
    { tray_id: 'TR-1', start_x: '', inside_width: '', tray_depth: 4 }
  ],
  conduits: [
    { conduit_id: 'C-1', type: 'RMC', trade_size: '2', start_x: 0, start_y: 0, start_z: 0, end_x: 5, end_y: 0, end_z: 0 }
  ],
  ductbanks: [
    { tag: '', start_x: 0, start_y: 0, start_z: 0, end_x: 1, end_y: 0, end_z: 0 }
  ],
  assignedIds: new Set(['TR-1'])
});
assert.equal(racewaySummary.total, 4);
assert.equal(racewaySummary.assignedRaceways, 2);
assert.equal(racewaySummary.missingIds, 1);
assert.equal(racewaySummary.duplicateIds, 2);
assert.equal(racewaySummary.missingGeometry, 1);
assert.equal(racewaySummary.missingDimensions, 1);

assert.deepEqual(getCableAssignedRacewayIds({ raceway_ids: ['TR-1', 'DB-1-C1'] }), ['TR-1', 'DB-1-C1']);
assert.deepEqual(getCableAssignedRacewayIds({ manual_path: '0,0,0;10,0,0' }), []);
assert.equal(cableHasRoutingCoordinates({ start: [0, 0, 0], end: [10, 0, 0] }), true);
assert.equal(cableHasRoutingCoordinates({ start_x: 0, start_y: 0, start_z: 0, end_x: '', end_y: 0, end_z: 0 }), false);

const routeDiagnostics = buildRoutingReadinessDiagnostics({
  cables: [
    { name: 'CBL-1', start_tag: 'SWBD-101', end_tag: 'MCC-101', conductor_size: '#4 AWG', length: 80, raceway_ids: ['TR-1'], start: [0, 0, 0], end: [10, 0, 0] },
    { name: 'CBL-2', start_tag: 'SWBD-101', end_tag: 'MCC-102', conductor_size: '#8 AWG', length: 55, raceway_ids: ['MISSING'], start: [0, 0, 0], end: [20, 0, 0] }
  ],
  trays: [
    { tray_id: 'TR-1', start_x: 0, start_y: 0, start_z: 0, end_x: 10, end_y: 0, end_z: 0, width: 12, height: 4 }
  ],
  conduits: [],
  ductbanks: []
});
assert.equal(routeDiagnostics.cableSummary.scheduleReady, 2);
assert.equal(routeDiagnostics.cableSummary.routingReady, 2);
assert.equal(routeDiagnostics.coordinateReady, 2);
assert.equal(routeDiagnostics.invalidAssignedRefs.length, 1);
assert.equal(routeDiagnostics.readyToRoute, false);
assert.equal(routeDiagnostics.nextAction.label, 'Resolve missing raceway references');

const preview = previewRecordImport(
  [{ tray_id: 'TR-1', inside_width: 12 }, { tray_id: 'TR-2', inside_width: 24 }],
  [{ tray_id: 'TR-1', tray_depth: 4 }, { tray_id: 'TR-3', inside_width: 18 }],
  { mode: 'replace', identityFields: ['tray_id'] }
);
assert.equal(preview.updates, 1);
assert.equal(preview.creates, 1);
assert.equal(preview.removed, 1);

const replaced = applyRecordImport(
  [{ tray_id: 'TR-1' }, { tray_id: 'TR-2' }],
  [{ tray_id: 'TR-3' }],
  { mode: 'replace', identityFields: ['tray_id'] }
);
assert.deepEqual(replaced, [{ tray_id: 'TR-3' }]);

console.log('✓ schedule workflow');
