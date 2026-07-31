import assert from 'node:assert';
import {
  ONE_LINE_DATA_HEADERS,
  ONE_LINE_DATA_WORKSHEET,
  isOneLineDataXlsxExportAvailable,
  isOneLineDataXlsxImportAvailable,
  readOneLineDataWorkbook,
  writeOneLineDataWorkbook,
} from './oneLineDataSpreadsheet.mjs';

const originalXlsx = globalThis.XLSX;
const calls = [];

globalThis.XLSX = {
  read(buffer, options) {
    calls.push(['read', buffer, options]);
    return {
      SheetNames: ['Notes', ONE_LINE_DATA_WORKSHEET],
      Sheets: { Notes: {}, [ONE_LINE_DATA_WORKSHEET]: { id: 'data-sheet' } },
    };
  },
  writeFile(workbook, filename) {
    calls.push(['writeFile', workbook, filename]);
  },
  utils: {
    sheet_to_json(sheet, options) {
      calls.push(['sheet_to_json', sheet, options]);
      return [{ 'Component ID': 'CB-1', 'Rated Voltage (kV)': '0.6' }];
    },
    book_new() {
      return { sheets: [] };
    },
    aoa_to_sheet(aoa) {
      calls.push(['aoa_to_sheet', aoa]);
      return {};
    },
    book_append_sheet(workbook, sheet, name) {
      workbook.sheets.push({ sheet, name });
    },
  },
};

try {
  assert.strictEqual(isOneLineDataXlsxImportAvailable(), true);
  assert.strictEqual(isOneLineDataXlsxExportAvailable(), true);

  const imported = readOneLineDataWorkbook(new Uint8Array([1, 2, 3]));
  assert.strictEqual(imported.ok, true);
  assert.strictEqual(imported.sheetName, ONE_LINE_DATA_WORKSHEET, 'prefers the dedicated exchange worksheet');
  assert.deepStrictEqual(imported.rows, [{ 'Component ID': 'CB-1', 'Rated Voltage (kV)': '0.6' }]);
  assert.deepStrictEqual(calls.find(call => call[0] === 'sheet_to_json')?.[2], { defval: '', raw: false });

  const exported = writeOneLineDataWorkbook([['Main', 'CB-1', 'Main Breaker']]);
  assert.strictEqual(exported.ok, true);
  const aoa = calls.find(call => call[0] === 'aoa_to_sheet')?.[1];
  assert.deepStrictEqual(aoa[0], ONE_LINE_DATA_HEADERS);
  assert.deepStrictEqual(aoa[1], ['Main', 'CB-1', 'Main Breaker']);
  const write = calls.find(call => call[0] === 'writeFile');
  assert.strictEqual(write?.[1].sheets[0].name, ONE_LINE_DATA_WORKSHEET);
  assert.strictEqual(write?.[2], 'one-line-data-manager.xlsx');
} finally {
  if (originalXlsx === undefined) delete globalThis.XLSX;
  else globalThis.XLSX = originalXlsx;
}

console.log('one-line data spreadsheet tests passed');
