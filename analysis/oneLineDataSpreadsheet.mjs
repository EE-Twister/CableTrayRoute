export const ONE_LINE_DATA_WORKSHEET = 'One-Line Data';

export const ONE_LINE_DATA_HEADERS = Object.freeze([
  'Sheet',
  'Component ID',
  'Label',
  'Tag',
  'Type',
  'Subtype',
  'Rated Voltage (kV)',
  'Rated Current (A)',
  'Layer',
  'Position Locked',
]);

const MAX_WORKBOOK_SHEETS = 20;
const MAX_IMPORT_ROWS = 10000;

function getXlsx() {
  return globalThis.XLSX || null;
}

export function isOneLineDataXlsxImportAvailable() {
  const xlsx = getXlsx();
  return Boolean(xlsx && typeof xlsx.read === 'function' && typeof xlsx.utils?.sheet_to_json === 'function');
}

export function isOneLineDataXlsxExportAvailable() {
  const xlsx = getXlsx();
  return Boolean(
    xlsx
    && typeof xlsx.writeFile === 'function'
    && typeof xlsx.utils?.book_new === 'function'
    && typeof xlsx.utils?.aoa_to_sheet === 'function'
    && typeof xlsx.utils?.book_append_sheet === 'function'
  );
}

function preferredSheetName(sheetNames = []) {
  return sheetNames.find(name => String(name).trim().toLowerCase() === ONE_LINE_DATA_WORKSHEET.toLowerCase())
    || sheetNames[0]
    || '';
}

/**
 * Read a One-Line Data workbook into the same header-keyed row shape used for CSV imports.
 */
export function readOneLineDataWorkbook(buffer) {
  if (!isOneLineDataXlsxImportAvailable()) return { ok: false, code: 'unavailable' };
  try {
    const xlsx = getXlsx();
    const workbook = xlsx.read(buffer, { type: 'array' });
    const sheetNames = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
    if (!sheetNames.length) return { ok: false, code: 'no-sheets' };
    if (sheetNames.length > MAX_WORKBOOK_SHEETS) return { ok: false, code: 'too-many-sheets' };
    const sheetName = preferredSheetName(sheetNames);
    const sheet = workbook?.Sheets?.[sheetName];
    if (!sheet) return { ok: false, code: 'missing-sheet' };
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false });
    if (!Array.isArray(rows)) return { ok: false, code: 'invalid-rows' };
    if (rows.length > MAX_IMPORT_ROWS) return { ok: false, code: 'too-many-rows' };
    return { ok: true, rows, sheetName };
  } catch (error) {
    return { ok: false, code: 'read-error', error };
  }
}

/** Write displayed controlled One-Line data as a single portable workbook. */
export function writeOneLineDataWorkbook(rows = [], filename = 'one-line-data-manager.xlsx') {
  if (!isOneLineDataXlsxExportAvailable()) return { ok: false, code: 'unavailable' };
  try {
    const xlsx = getXlsx();
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.aoa_to_sheet([ONE_LINE_DATA_HEADERS, ...(Array.isArray(rows) ? rows : [])]);
    worksheet['!cols'] = [18, 20, 28, 20, 16, 22, 20, 20, 18, 18].map(wch => ({ wch }));
    xlsx.utils.book_append_sheet(workbook, worksheet, ONE_LINE_DATA_WORKSHEET);
    xlsx.writeFile(workbook, filename);
    return { ok: true };
  } catch (error) {
    return { ok: false, code: 'write-error', error };
  }
}

export const ONE_LINE_DATA_SPREADSHEET_LIMITS = Object.freeze({
  maxWorkbookSheets: MAX_WORKBOOK_SHEETS,
  maxImportRows: MAX_IMPORT_ROWS,
});
