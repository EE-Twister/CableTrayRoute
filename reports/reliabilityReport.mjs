import { downloadCSV, downloadPDF, buildReliabilityRows } from './reporting.mjs';

export function generateReliabilityReport(results = {}) {
  const rows = buildReliabilityRows(results);
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  downloadCSV(headers, rows, 'reliability.csv');
  downloadPDF('Reliability Report', headers, rows, 'reliability.pdf');
}
