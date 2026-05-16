import assert from 'node:assert/strict';
import {
  previewReconcileRecords,
  previewScheduleReconcile,
  applyScheduleReconcilePreview
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

console.log('✓ schedule reconcile');
