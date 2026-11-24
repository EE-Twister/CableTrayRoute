import assert from 'node:assert/strict';
// tableUtils.mjs registers window.TableUtils when it loads.
globalThis.window ??= {};
const { tableExportCell, tableImportCell } = await import('../tableUtils.mjs');

// Raceway Schedule / Equipment List XLSX exports used `value || ''`, which
// blanked every zero (a tray from (0,0,10) exported as ["", "", 10]).
assert.equal(tableExportCell(0), 0, 'zero coordinates survive export');
assert.equal(tableExportCell(false), false);
assert.equal(tableExportCell(''), '');
assert.equal(tableExportCell(null), '');
assert.equal(tableExportCell(undefined), '');
assert.equal(tableExportCell(['TR-1', 'TR-2']), 'TR-1, TR-2');
assert.equal(tableExportCell({ 0: 'HV' }), '{"0":"HV"}');
assert.equal(tableExportCell('CBL-1'), 'CBL-1');

assert.equal(tableImportCell(0), 0, 'zero survives import');
assert.equal(tableImportCell(''), '');
assert.equal(tableImportCell(undefined), '');
assert.equal(tableImportCell(12.5), 12.5);

const row = { tray_id: 'TR-ORIGIN', start_x: 0, start_y: 0, start_z: 10, end_x: 20, end_y: 0, end_z: 10 };
assert.deepEqual(
  ['tray_id', 'start_x', 'start_y', 'start_z', 'end_x', 'end_y', 'end_z'].map(key => tableExportCell(row[key])),
  ['TR-ORIGIN', 0, 0, 10, 20, 0, 10],
);

console.log('table export cell tests passed');
