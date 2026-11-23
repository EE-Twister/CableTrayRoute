import assert from 'node:assert/strict';
import {
  applyBulkEquipmentUpdate,
  inferEquipmentMapping,
  mapRowsToEquipment,
  mergeEquipmentRows,
  previewEquipmentImport,
  removeLegacyCableEndpointEquipment,
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

const ratingHeaders = ['EquipmentID', 'Electrical Input (kW)', 'Power Factor', 'Duty', 'Rating Basis'];
const ratingMapping = inferEquipmentMapping(ratingHeaders);
assert.deepEqual(mapRowsToEquipment([['P-101', '12.5', '0.85', 'continuous', 'electrical-input-kW']], ratingHeaders, ratingMapping)[0], {
  id: 'P-101', kw: '12.5', powerFactor: '0.85', duty: 'continuous', ratingsBasis: 'electrical-input-kW'
});
const motorHeaders = ['Motor Rated Voltage (V)', 'Motor Design FLC (A)', 'Motor Design FLC Reference', 'Motor Nameplate Current (A)', 'Motor Nameplate Horsepower', 'Motor Nameplate Frequency (Hz)', 'Motor Locked Rotor Current (A)', 'Motor Locked Rotor Power Factor', 'Motor Starter Type', 'Motor Rotor Type'];
assert.deepEqual(mapRowsToEquipment([['460', '14', 'Design reference', '12.8', '10', '60', '90', '0.3', 'dol', 'squirrel-cage']], motorHeaders, inferEquipmentMapping(motorHeaders))[0], {
  motorRatedVoltageV: '460', motorFullLoadCurrentA: '14', motorFullLoadCurrentReference: 'Design reference', motorNameplateCurrentA: '12.8', motorNameplateHorsepower: '10', motorNameplateFrequencyHz: '60', motorLockedRotorCurrentA: '90', motorLockedRotorPowerFactor: '0.3', motorStarterType: 'dol', motorRotorType: 'squirrel-cage'
});

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

const generatedIdMerge = mergeEquipmentRows(
  [{ id: 'generated-row-id', tag: 'SWBD-101', voltage: '480' }],
  [{ tag: 'SWBD-101', description: 'Main switchboard' }]
);
assert.equal(generatedIdMerge.length, 1, 'ID-less starter rows should merge into an existing same-tag row');
assert.equal(generatedIdMerge[0].id, 'generated-row-id', 'merging a starter row must preserve the existing row identity');
assert.equal(generatedIdMerge[0].description, 'Main switchboard');

const sameTagDistinctIds = mergeEquipmentRows(
  [{ id: 'equipment-a', tag: 'DUP-101' }],
  [{ id: 'equipment-b', tag: 'DUP-101', description: 'Separate record' }]
);
assert.equal(sameTagDistinctIds.length, 2, 'explicitly different IDs must remain distinct even when tags match');
assert.equal(sameTagDistinctIds[1].id, 'equipment-b');

const sequentialIdentityMerge = mergeEquipmentRows(
  [{ id: 'equipment-a', tag: 'OLD-101' }],
  [{ id: 'equipment-a', tag: 'NEW-101' }, { tag: 'NEW-101', description: 'Updated record' }]
);
assert.equal(sequentialIdentityMerge.length, 1, 'the merge index should follow identity fields updated earlier in the same batch');
assert.equal(sequentialIdentityMerge[0].description, 'Updated record');

const staleTagMerge = mergeEquipmentRows(
  [{ id: 'equipment-a', tag: 'OLD-101' }],
  [{ id: 'equipment-a', tag: 'NEW-101' }, { tag: 'OLD-101', description: 'Different record' }]
);
assert.equal(staleTagMerge.length, 2, 'a retagged row must not retain its old tag as a merge alias');
assert.equal(staleTagMerge[1].description, 'Different record');

const sequentialPreview = previewEquipmentImport(
  [{ id: 'equipment-a', tag: 'OLD-101' }],
  [{ id: 'equipment-a', tag: 'NEW-101' }, { id: 'equipment-a', tag: 'NEW-101' }]
);
assert.equal(sequentialPreview.mergeUpdates, 1, 'preview should count the first sequential identity update once');
assert.equal(sequentialPreview.mergeUnchanged, 1, 'preview should recognize a repeated sequential update as unchanged');

const staleTagPreview = previewEquipmentImport(
  [{ id: 'equipment-a', tag: 'OLD-101' }],
  [{ id: 'equipment-a', tag: 'NEW-101' }, { tag: 'OLD-101', description: 'Different record' }]
);
assert.equal(staleTagPreview.mergeUpdates, 1);
assert.equal(staleTagPreview.mergeCreates, 1, 'preview must create a row for a tag released by a retag');

const legacyEndpoint = {
  tag: 'MTR-101',
  description: 'MTR-101 cable endpoint',
  category: 'Cable endpoint',
  subCategory: 'Referenced equipment',
  arrangement: 'Sample project',
  lineup: 'MTR-101',
  manufacturer: 'Sample basis',
  model: 'Demonstration record'
};
const intentionalEndpointEquipment = {
  ...legacyEndpoint,
  tag: 'JB-101',
  description: 'Field junction box',
  lineup: 'JB-101',
  manufacturer: 'Acme'
};
const legacyCleanup = removeLegacyCableEndpointEquipment([legacyEndpoint, intentionalEndpointEquipment]);
assert.deepEqual(legacyCleanup.removed, [legacyEndpoint]);
assert.deepEqual(legacyCleanup.equipment, [intentionalEndpointEquipment]);

const bulk = applyBulkEquipmentUpdate([{ tag: 'A' }, { tag: 'B' }], [1], 'arrangement', 'Room B');
assert.equal(bulk[0].arrangement, undefined);
assert.equal(bulk[1].arrangement, 'Room B');

console.log('✓ equipment workflow core');
