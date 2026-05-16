import assert from 'node:assert/strict';
import {
  applyBulkEquipmentUpdate,
  inferEquipmentMapping,
  mapRowsToEquipment,
  mergeEquipmentRows,
  previewEquipmentImport,
  summarizeEquipment,
  validateEquipmentRows
} from '../analysis/equipmentWorkflow.mjs';

const equipment = [
  { tag: 'SWBD-101', voltage: '480', manufacturer: 'Square D', arrangement: 'Room A' },
  { tag: 'SWBD-101', voltage: '', manufacturer: '', arrangement: 'Room A' },
  { tag: '', voltage: '13.8kV', manufacturer: 'Eaton' }
];

const summary = summarizeEquipment(equipment);
assert.equal(summary.total, 3);
assert.equal(summary.missingTags, 1);
assert.equal(summary.duplicateTags, 2);
assert.equal(summary.missingVoltage, 1);
assert.equal(summary.missingManufacturer, 1);
assert.equal(summary.assignedArrangements, 1);

const issues = validateEquipmentRows(equipment);
assert(issues.some(issue => issue.code === 'duplicate-tag'));
assert(issues.some(issue => issue.code === 'missing-tag'));
assert(issues.some(issue => issue.code === 'missing-voltage'));

const headers = ['EquipmentID', 'Description', 'Voltage', 'Manufacturer'];
const mapping = inferEquipmentMapping(headers);
assert.equal(mapping.EquipmentID, 'id');
assert.equal(mapping.Description, 'description');
assert.equal(mapping.Voltage, 'voltage');

const incoming = mapRowsToEquipment([
  ['MCC-101', 'Motor control center', '480', 'Allen-Bradley']
], headers, mapping);
assert.deepEqual(incoming[0], {
  id: 'MCC-101',
  description: 'Motor control center',
  voltage: '480',
  manufacturer: 'Allen-Bradley'
});

const preview = previewEquipmentImport(
  [{ tag: 'MCC-101', description: 'Existing MCC', voltage: '' }, { tag: 'KEEP-1' }],
  [{ tag: 'MCC-101', voltage: '480' }, { tag: 'PMP-101' }]
);
assert.equal(preview.mergeCreates, 1);
assert.equal(preview.mergeUpdates, 1);
assert.equal(preview.replaceCount, 2);

const merged = mergeEquipmentRows(
  [{ tag: 'MCC-101', description: 'Existing MCC', voltage: '' }, { tag: 'KEEP-1' }],
  [{ tag: 'MCC-101', voltage: '480' }, { tag: 'PMP-101' }]
);
assert.equal(merged.length, 3, 'merge must not delete absent existing equipment');
assert.equal(merged[0].description, 'Existing MCC');
assert.equal(merged[0].voltage, '480');

const bulk = applyBulkEquipmentUpdate([{ tag: 'A' }, { tag: 'B' }], [1], 'arrangement', 'Room B');
assert.equal(bulk[0].arrangement, undefined);
assert.equal(bulk[1].arrangement, 'Room B');

console.log('✓ equipment workflow core');
