import assert from 'node:assert/strict';
import {
  getProjectEntityDeletionImpact,
  getProjectReferenceDiagnostics,
  propagateProjectEntityLifecycle
} from '../analysis/projectEntityLifecycle.mjs';

const equipmentRename = propagateProjectEntityLifecycle({
  collection: 'equipment',
  previousRecords: [{ id: 'eq-stable', tag: 'MCC-101', ref: 'MCC-101' }],
  nextRecords: [{ id: 'eq-stable', tag: 'MCC-201', ref: 'MCC-101' }],
  loads: [{ id: 'load-1', tag: 'PMP-1', source: 'MCC-101', equipmentId: 'eq-stable' }],
  cables: [{ id: 'cable-1', tag: 'CBL-1', from_tag: 'MCC-101', to_tag: 'PMP-1', sourceEquipmentId: 'eq-stable' }],
  oneLine: {
    activeSheet: 0,
    sheets: [{
      components: [{
        id: 'visual-mcc',
        entityId: 'eq-stable',
        label: 'MCC-101',
        equipmentRef: 'eq-stable',
        scheduleLinks: { equipment: 'eq-stable' }
      }],
      connections: []
    }]
  }
});
assert.equal(equipmentRename.changes.renames.length, 1);
assert.equal(equipmentRename.loads.value[0].source, 'MCC-201');
assert.equal(equipmentRename.loads.value[0].equipmentId, 'eq-stable', 'stable links survive display-tag renames');
assert.equal(equipmentRename.cables.value[0].from_tag, 'MCC-201');
assert.equal(equipmentRename.cables.value[0].sourceEquipmentId, 'eq-stable');
assert.equal(equipmentRename.oneLine.value.sheets[0].components[0].label, 'MCC-201');
assert.equal(equipmentRename.oneLine.value.sheets[0].components[0].equipmentRef, 'eq-stable');

const panelRename = propagateProjectEntityLifecycle({
  collection: 'panels',
  previousRecords: [{ id: 'panel-stable', tag: 'LP-101' }],
  nextRecords: [{ id: 'panel-stable', tag: 'LP-201' }],
  loads: [{ id: 'load-2', tag: 'LTG-1', panelId: 'LP-101', source: 'LP-101' }],
  cables: [{ id: 'cable-2', tag: 'CBL-2', from: 'LP-101', to: 'LTG-1' }]
});
assert.equal(panelRename.loads.value[0].panelId, 'LP-201');
assert.equal(panelRename.loads.value[0].source, 'LP-201');
assert.equal(panelRename.cables.value[0].from, 'LP-201');

const loadRename = propagateProjectEntityLifecycle({
  collection: 'loads',
  previousRecords: [{ id: 'load-stable', tag: 'PMP-101' }],
  nextRecords: [{ id: 'load-stable', tag: 'PMP-201' }],
  cables: [{ id: 'cable-3', tag: 'CBL-3', from: 'MCC-1', to: 'PMP-101', targetEquipmentId: 'load-stable' }]
});
assert.equal(loadRename.cables.value[0].to, 'PMP-201');
assert.equal(loadRename.cables.value[0].targetEquipmentId, 'load-stable');

const cableRename = propagateProjectEntityLifecycle({
  collection: 'cables',
  previousRecords: [{ id: 'cable-stable', tag: 'CBL-101' }],
  nextRecords: [{ id: 'cable-stable', tag: 'CBL-201' }],
  oneLine: {
    activeSheet: 0,
    sheets: [{
      components: [],
      connections: [{ circuitId: 'cable-stable', cable: { tag: 'CBL-101' } }]
    }]
  }
});
assert.equal(cableRename.oneLine.value.sheets[0].connections[0].circuitId, 'cable-stable');
assert.equal(cableRename.oneLine.value.sheets[0].connections[0].cable.tag, 'CBL-201');

const equipmentImpact = getProjectEntityDeletionImpact({
  collection: 'equipment',
  records: [{ id: 'eq-stable', tag: 'MCC-201' }],
  loads: [{ id: 'load-1', tag: 'PMP-1', source: 'MCC-201', equipmentId: 'eq-stable' }],
  cables: [{ id: 'cable-1', tag: 'CBL-1', from_tag: 'MCC-201', sourceEquipmentId: 'eq-stable' }],
  oneLine: {
    activeSheet: 0,
    sheets: [{ components: [{ id: 'visual-mcc', entityId: 'eq-stable' }], connections: [] }]
  }
});
assert.deepEqual(equipmentImpact.counts, { total: 3, loads: 1, cables: 1, oneLine: 1 });
assert.ok(equipmentImpact.dependencies.some(item => item.href === 'loadlist.html'));
assert.ok(equipmentImpact.dependencies.some(item => item.href === 'cableschedule.html'));

const cableImpact = getProjectEntityDeletionImpact({
  collection: 'cables',
  records: [{ id: 'cable-stable', tag: 'CBL-201' }],
  oneLine: {
    activeSheet: 0,
    sheets: [{ components: [], connections: [{ id: 'visual-cable', circuitId: 'cable-stable' }] }]
  }
});
assert.equal(cableImpact.counts.oneLine, 1);
assert.match(cableImpact.dependencies[0].href, /^oneline\.html\?probe=/);

const equipmentDelete = propagateProjectEntityLifecycle({
  collection: 'equipment',
  previousRecords: [{ id: 'eq-stable', tag: 'MCC-201' }],
  nextRecords: [],
  loads: [{ id: 'load-1', tag: 'PMP-1', source: 'MCC-201', equipmentId: 'eq-stable' }],
  cables: [{ id: 'cable-1', tag: 'CBL-1', sourceEquipmentId: 'eq-stable' }],
  oneLine: {
    activeSheet: 0,
    sheets: [{ components: [{ id: 'visual-mcc', entityId: 'eq-stable' }], connections: [] }]
  }
});
const detached = equipmentDelete.oneLine.value.sheets[0].components[0];
assert.equal(detached.entityId, undefined, 'deleting a canonical entity detaches the visual projection');
assert.equal(detached.orphanedEntityId, 'eq-stable');
assert.equal(equipmentDelete.loads.value[0].equipmentId, 'eq-stable', 'dependent engineering records are retained for review');
assert.equal(equipmentDelete.cables.value[0].sourceEquipmentId, 'eq-stable');

const diagnostics = getProjectReferenceDiagnostics({
  equipment: [],
  panels: [],
  loads: equipmentDelete.loads.value,
  cables: equipmentDelete.cables.value,
  oneLine: equipmentDelete.oneLine.value
});
assert.deepEqual(
  diagnostics.map(issue => issue.code).sort(),
  ['orphan-cable-endpoint', 'orphan-load-equipment', 'orphan-oneline-entity']
);
assert.ok(diagnostics.every(issue => issue.href && issue.actionLabel));

console.log('✓ canonical entity lifecycle propagation and orphan diagnostics');
