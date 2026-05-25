// CSV/XLSX I/O helpers for the Cable Schedule.
//
// These helpers wrap the SheetJS (XLSX) global in a way that is testable
// outside the cableschedule.js initialization closure. Callers handle the
// user-facing alerts; this module just returns success/failure results.

function getXlsx() {
  return typeof globalThis !== 'undefined' && globalThis.XLSX ? globalThis.XLSX : null;
}

/**
 * Returns true when the SheetJS library exposes the export-side APIs we use.
 */
export function isXlsxExportAvailable() {
  const xlsx = getXlsx();
  return Boolean(xlsx && xlsx.utils && typeof xlsx.utils.aoa_to_sheet === 'function');
}

/**
 * Returns true when the SheetJS library exposes the import-side APIs we use.
 */
export function isXlsxImportAvailable() {
  const xlsx = getXlsx();
  return Boolean(
    xlsx
      && typeof xlsx.read === 'function'
      && xlsx.utils
      && typeof xlsx.utils.sheet_to_json === 'function'
  );
}

/**
 * Read the first worksheet from an XLSX file buffer and return its rows.
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {{ ok: true, rows: Array<object>, sheetName: string }
 *          | { ok: false, code: 'unavailable' | 'no-sheets' | 'read-error',
 *              error?: Error }}
 */
export function readFirstSheet(buffer) {
  const xlsx = getXlsx();
  if (!isXlsxImportAvailable()) return { ok: false, code: 'unavailable' };
  let workbook;
  try {
    workbook = xlsx.read(buffer, { type: 'array' });
  } catch (error) {
    return { ok: false, code: 'read-error', error };
  }
  const sheetName = workbook.SheetNames && workbook.SheetNames[0];
  if (!sheetName) return { ok: false, code: 'no-sheets' };
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: '',
    raw: true
  });
  return { ok: true, rows: Array.isArray(rows) ? rows : [], sheetName };
}

/**
 * Build and download a workbook from a sheet of rows-of-arrays data.
 *
 * @param {Array<Array<*>>} aoa - Rows-of-arrays (first row typically headers).
 * @param {object} [options]
 * @param {string} [options.sheetName] - Defaults to "Sheet1"; truncated to 31 chars.
 * @param {string} [options.filename] - Output filename.
 * @returns {{ ok: true } | { ok: false, code: 'unavailable' | 'write-error',
 *           error?: Error }}
 */
export function writeAoaWorkbook(aoa, { sheetName = 'Sheet1', filename = 'export.xlsx' } = {}) {
  const xlsx = getXlsx();
  if (!isXlsxExportAvailable()) return { ok: false, code: 'unavailable' };
  try {
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet(aoa);
    xlsx.utils.book_append_sheet(workbook, sheet, String(sheetName).slice(0, 31));
    xlsx.writeFile(workbook, filename);
    return { ok: true };
  } catch (error) {
    return { ok: false, code: 'write-error', error };
  }
}

/**
 * Build a date-stamped filename suffix, e.g. "2026-05-25".
 */
export function todayStamp(date = new Date()) {
  return date.toISOString().split('T')[0];
}
