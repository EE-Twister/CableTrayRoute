import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { setPanels, setLoads } from '../dataStore.mjs';
import { exportPanelSchedule } from '../exportPanelSchedule.js';
let workbook;
globalThis.XLSX = { ...XLSX, writeFile: wb => { workbook = wb; } };
setPanels([{ id: 'P1', phases: 1, circuitCount: 4,
  breakerLayout: [{ start: 1, size: 2, position: 0 }, null, { start: 1, size: 2, position: 1 }, null],
  breakerDetails: { '1': { customLoad: 'Workshop outlets', rating: 30, cableTag: 'CBL-1', loadVaPerPhase: { A: 1200, B: 800 } } }
}]);
setLoads([{ id: 'L2', ref: 'Lighting', panelId: 'P1', breaker: 2, kva: 0.5 }]);
exportPanelSchedule('P1');
const rows = XLSX.utils.sheet_to_json(workbook.Sheets.P1, { header: 1 });
const start = rows.findIndex(row => row[0] === 'Circuit');
assert.deepEqual(rows[start + 1].slice(0, 4), [1, 'A', 'Workshop outlets', '2']);
assert.deepEqual(rows[start + 1].slice(5, 9), [30, 'breaker', 'CBL-1', 1200]);
assert.equal(rows[start + 1][12], 'Lighting');
assert.equal(rows[start + 2][1], 'B');
assert.match(rows[start + 2][2], /Tied to Circuit 1.*Workshop outlets/);
assert.equal(rows[start + 2][8], 800);
assert.equal(rows.find(row => row[0] === 'Connected Load (kVA)')[1], '2.50');
setPanels([{ id: 'DC1', powerType: 'dc', circuitCount: 2,
  breakerLayout: [{ start: 1, size: 1, position: 0 }, null],
  breakerDetails: { '1': { customLoad: 'Controls', rating: 10, deviceType: 'fuse', loadVaPerPhase: { '+': 0 } } }
}]);
setLoads([]);
exportPanelSchedule('DC1');
const dcRows = XLSX.utils.sheet_to_json(workbook.Sheets.DC1, { header: 1 });
const dcStart = dcRows.findIndex(row => row[0] === 'Circuit');
assert.equal(dcRows[dcStart][8], 'Phase Load (W)');
assert.equal(dcRows[dcStart + 1][2], 'Controls');
assert.equal(dcRows[dcStart + 1][6], 'fuse');
assert.equal(dcRows[dcStart + 1][8], 0);
assert.equal(dcRows[dcStart + 1][12], '');
delete globalThis.XLSX;
console.log('Panel Excel export includes manual details and assigned loads.');
