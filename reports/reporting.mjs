import { jsPDF } from 'jspdf';

/**
 * Convert array of objects to CSV string.
 * @param {string[]} headers - column headers / keys
 * @param {Array<Object>} rows
 * @returns {string}
 */
export function toCSV(headers = [], rows = []) {
  const lines = [headers.join(',')];
  rows.forEach(r => {
    const line = headers.map(h => {
      const val = r[h] ?? '';
      let cell = String(val);
      if (cell.includes(',') || cell.includes('"')) {
        cell = '"' + cell.replace(/"/g, '""') + '"';
      }
      return cell;
    }).join(',');
    lines.push(line);
  });
  return lines.join('\n');
}

/**
 * Build a simple PDF from tabular data.
 * @param {string} title
 * @param {string[]} headers
 * @param {Array<Object>} rows
 * @returns {ArrayBuffer}
 */
export function toPDF(title = 'Report', headers = [], rows = []) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(title, 10, 10);
  let y = 20;
  doc.setFontSize(10);
  doc.text(headers.join(' | '), 10, y);
  y += 10;
  rows.forEach(r => {
    const line = headers.map(h => r[h] ?? '').join(' | ');
    doc.text(String(line), 10, y);
    y += 10;
  });
  return doc.output('arraybuffer');
}

/**
 * Convenience helper to export data as CSV file in browser.
 */
export function downloadCSV(headers, rows, filename = 'report.csv') {
  const csv = toCSV(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

/**
 * Convenience helper to export data as PDF file in browser.
 */
export function downloadPDF(title, headers, rows, filename = 'report.pdf') {
  const pdf = toPDF(title, headers, rows);
  const blob = new Blob([pdf], { type: 'application/pdf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}
