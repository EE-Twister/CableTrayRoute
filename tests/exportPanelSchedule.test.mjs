import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { setPanels, setLoads } from '../dataStore.mjs';
import { exportPanelSchedule, getDemandKva, toExcelSheetName } from '../exportPanelSchedule.js';
let workbook;
let fileName;
globalThis.XLSX = { ...XLSX, writeFile: (wb, name) => { workbook = wb; fileName = name; } };
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
assert.equal(rows[start + 1][14], 0.5, 'demand kVA is written as a number');
assert.equal(rows[start + 2][1], 'B');
assert.equal(rows[start + 2][2], 'Tied to Circuit 1 — Workshop outlets');
assert.doesNotMatch(JSON.stringify(rows), /�/, 'no replacement characters in the workbook');
assert.equal(rows[start + 2][8], 800);
assert.equal(rows.find(row => row[0] === 'Connected Load (kVA)')[1], 2.5, 'totals are numeric');
assert.equal(rows.some(row => row[0] === 'Notes'), false);
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

// kW is never exported under the "Demand (kVA)" header.
assert.equal(getDemandKva({ kw: 12 }), null);
assert.equal(getDemandKva({ kw: 12, kva: 15 }), 15);
assert.equal(getDemandKva({ demandKva: 9, kva: 15, kw: 12 }), 9);
assert.equal(getDemandKva({ demandKva: 0, kva: 15 }), 15, 'matches the totals fallback from demand kVA to kVA');
assert.equal(getDemandKva({ kva: '0' }), 0);
setPanels([{ id: 'P2', phases: 1, circuitCount: 2 }]);
setLoads([{ id: 'L1', ref: 'Heater', panelId: 'P2', breaker: 1, kw: 12 }]);
exportPanelSchedule('P2');
const kwRows = XLSX.utils.sheet_to_json(workbook.Sheets.P2, { header: 1, defval: '' });
const kwStart = kwRows.findIndex(row => row[0] === 'Circuit');
assert.equal(kwRows[kwStart][4], 'Demand (kVA)');
assert.equal(kwRows[kwStart + 1][2], 'Heater');
assert.equal(kwRows[kwStart + 1][4], '', 'a kW-only load leaves Demand (kVA) blank');
assert.equal(kwRows.find(row => row[0] === 'Connected Load (kVA)')[1], 0);
assert.equal(kwRows.find(row => row[0] === 'Connected Load (kW)')[1], 12);
const notesAt = kwRows.findIndex(row => row[0] === 'Notes');
assert.ok(notesAt > 0, 'kW-only loads are flagged in a notes row');
assert.match(kwRows[notesAt + 1][0], /Circuit 1 \(Heater\): the load records 12\.00 kW but no kVA/);

// Sheet names that Excel rejects are sanitized instead of throwing.
assert.equal(toExcelSheetName('P1'), 'P1');
assert.equal(toExcelSheetName('MCC/1:A?*[B]\\'), 'MCC-1-A---B--');
assert.equal(toExcelSheetName("'Quoted'"), 'Quoted');
assert.equal(toExcelSheetName("A' "), 'A', 'a trailing space cannot hide a trailing apostrophe');
assert.equal(toExcelSheetName(` ${'C'.repeat(29)}' x`), `${'C'.repeat(29)}`, 'truncation cannot leave a trailing apostrophe');
assert.equal(toExcelSheetName(''), 'Sheet');
assert.equal(toExcelSheetName('History'), 'History-2');
assert.equal(toExcelSheetName('A'.repeat(40)).length, 31);
assert.equal(toExcelSheetName('LP-1', ['lp-1']), 'LP-1-2', 'duplicates are compared case-insensitively');
assert.equal(toExcelSheetName('B'.repeat(40), ['B'.repeat(31)]), `${'B'.repeat(29)}-2`);
assert.equal(toExcelSheetName('LP-1', ['LP-1', 'LP-1-2']), 'LP-1-3');
const awkwardId = 'Bldg 2/Level 3: MCC [north] riser panel?';
setPanels([{ id: awkwardId, phases: 1, circuitCount: 2 }]);
setLoads([{ id: 'L9', ref: 'Fan', panelId: awkwardId, breaker: 1, kva: 1 }]);
workbook = null;
exportPanelSchedule(awkwardId);
assert.ok(workbook, 'an id with invalid sheet characters still downloads');
assert.equal(workbook.SheetNames.length, 1);
assert.equal(workbook.SheetNames[0], 'Bldg 2-Level 3- MCC -north- ris');
assert.ok(workbook.SheetNames[0].length <= 31);
assert.equal(fileName, 'Bldg 2_Level 3_ MCC [north] riser panel__panel_schedule.xlsx');
assert.ok(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }).length > 0, 'workbook passes SheetJS name validation');
delete globalThis.XLSX;
console.log('Panel Excel export includes manual details and assigned loads.');
