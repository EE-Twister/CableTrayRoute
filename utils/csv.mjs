const PLAIN_NUMBER = /^\s*[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?\s*$/i;

/**
 * Format one value as a CSV cell.
 *
 * - Text starting with =, +, -, @, tab or CR would run as a spreadsheet formula when the
 *   file is opened in Excel, so it is prefixed with an apostrophe. Plain numbers
 *   ("-5") are left alone.
 * - Anything containing a comma, quote or line break is quoted so the row cannot split.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function csvCell(value) {
  const raw = value ?? '';
  let cell = String(raw);
  if (typeof raw === 'string' && /^[\s]*[=+\-@\t\r]/.test(cell) && !PLAIN_NUMBER.test(cell)) {
    cell = `'${cell}`;
  }
  if (/[",\r\n]/.test(cell)) {
    cell = `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

/**
 * Undo the apostrophe `csvCell` adds in front of formula-like text, so a file the
 * app exported imports back to the original value. Other values pass through.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function stripCsvFormulaGuard(value) {
  if (typeof value !== 'string') return value;
  return /^'[\s]*[=+\-@\t\r]/.test(value) && !PLAIN_NUMBER.test(value.slice(1)) ? value.slice(1) : value;
}
