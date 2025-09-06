import { downloadCSV, downloadPDF, buildHarmonicsRows } from './reporting.mjs';

export function generateHarmonicsReport(results = {}) {
  const rows = buildHarmonicsRows(results);
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  downloadCSV(headers, rows, 'harmonics.csv');
  downloadPDF('Harmonics Report', headers, rows, 'harmonics.pdf');
}
