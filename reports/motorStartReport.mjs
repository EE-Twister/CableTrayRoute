import { downloadCSV, downloadPDF, buildMotorStartRows } from './reporting.mjs';

export function generateMotorStartReport(results = {}) {
  const rows = buildMotorStartRows(results);
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  downloadCSV(headers, rows, 'motorstart.csv');
  downloadPDF('Motor Start Report', headers, rows, 'motorstart.pdf');
}
