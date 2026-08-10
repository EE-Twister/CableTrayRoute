import assert from 'node:assert/strict';
import {
  previewReconcileRecords,
  previewScheduleReconcile,
  applyScheduleReconcilePreview,
  synchronizeCanonicalSchedules
} from '../analysis/scheduleReconcile.mjs';

const current = [
  { id: 'EQ-1', tag: 'EQ-1', description: 'Existing description', voltage: '' },
  { id: 'KEEP-1', tag: 'KEEP-1', description: 'Do not delete' }
];
const incoming = [
  { ref: 'EQ-1', tag: 'EQ-1', description: 'One-line description', voltage: '480V', manufacturer: 'ACME' },
  { id: 'EQ-2', tag: 'EQ-2', description: 'New equipment' }
];

const preview = previewReconcileRecords(current, incoming);
assert.equal(preview.counts.creates, 1);
assert.equal(preview.counts.updates, 1);
assert.equal(preview.counts.conflicts, 1);
assert.equal(preview.result.length, 3, 'unmatched schedule rows must not be deleted');
assert.equal(preview.result[0].description, 'Existing description', 'conflicting non-empty value is preserved');
assert.equal(preview.result[0].voltage, '480V', 'missing schedule field is updated');
assert.equal(preview.result[0].manufacturer, 'ACME', 'new missing field is added');
assert.equal(preview.result[1].id, 'KEEP-1', 'unmatched row remains in place');
assert.equal(preview.result[2].id, 'EQ-2', 'new incoming row is appended');

const schedulePreview = previewScheduleReconcile(
  {
    equipment: current,
    panels: [],
    loads: [{ id: 'L-1', tag: 'L-1', kw: '' }],
    cables: [{ id: 'C-1', tag: 'C-1', from: 'MCC-1' }]
  },
  {
    equipment: incoming,
    panels: [{ id: 'P-1', tag: 'P-1' }],
    loads: [{ ref: 'L-1', tag: 'L-1', kw: 25 }],
    cables: [{ tag: 'C-1', from: 'MCC-1', to: 'P-1', conductor_size: '2/0', length: 50 }]
  }
);

assert.equal(schedulePreview.totals.creates, 2);
assert.equal(schedulePreview.totals.updates, 3);
assert.equal(schedulePreview.totals.conflicts, 1);

const applied = applyScheduleReconcilePreview(schedulePreview);
assert.equal(applied.equipment.length, 3);
assert.equal(applied.panels.length, 1);
assert.equal(applied.loads[0].kw, 25);
assert.equal(applied.cables[0].to, 'P-1');

const normalizedPreview = previewScheduleReconcile(
  { equipment: [{ id: 'MCC-01', tag: 'MCC-01', description: 'Main MCC' }] },
  { equipment: [{ id: 'mcc-01', tag: 'mcc-01', description: 'Main MCC', x: 240, y: 180 }] }
);
assert.equal(normalizedPreview.totals.creates, 0, 'identity matching is case-insensitive');
assert.equal(normalizedPreview.totals.conflicts, 0, 'case-only identities and canvas coordinates are ignored');
assert.equal(normalizedPreview.totals.unchanged, 1);

const synchronized = synchronizeCanonicalSchedules({
  equipment: [
    { id: 'mcc-01', ref: 'MCC-01', tag: 'MCC-01', description: 'Old description', voltage: '480V' },
    { id: 'keep-01', tag: 'KEEP-01', description: 'Not on the one-line' }
  ],
  panels: [{ id: 'lp-01', tag: 'LP-01', description: 'Lighting panel' }],
  loads: [],
  cables: [{ id: 'cbl-01', tag: 'CBL-01', length: 50 }]
}, {
  equipment: [{ entityId: 'mcc-01', id: 'visual-mcc', ref: 'visual-mcc', tag: 'MCC-01', description: 'Updated on one-line', voltage: '', x: 300 }],
  panels: [{ entityId: 'lp-01', id: 'visual-panel', tag: 'LP-01', manufacturer: 'Square D' }],
  loads: [{ entityId: '', id: 'load-01', tag: 'PMP-01', description: 'New pump', kw: 25 }],
  cables: [{ circuitId: 'cbl-01', id: 'visual-cable', tag: 'CBL-01', length: 75, y: 100 }]
});
assert.equal(synchronized.totals.creates, 1, 'new one-line entities become canonical schedule records');
assert.equal(synchronized.totals.updates, 3, 'linked shared records are updated from the editing page');
assert.equal(synchronized.collections.equipment[0].id, 'mcc-01', 'stable canonical IDs are preserved');
assert.equal(synchronized.collections.equipment[0].ref, 'MCC-01', 'visual IDs do not replace canonical references');
assert.equal(synchronized.collections.equipment[0].description, 'Updated on one-line');
assert.equal(synchronized.collections.equipment[0].voltage, '480V', 'blank projections do not erase populated canonical values');
assert.equal(synchronized.collections.equipment[0].x, undefined, 'canvas-only fields never enter schedules');
assert.equal(synchronized.collections.equipment[1].id, 'keep-01', 'records absent from the diagram are preserved');
assert.equal(synchronized.collections.panels[0].manufacturer, 'Square D');
assert.equal(synchronized.collections.cables[0].length, 75);
assert.equal(synchronized.collections.cables[0].circuitId, undefined, 'view link fields are not persisted in schedule records');

console.log('✓ schedule reconcile');
