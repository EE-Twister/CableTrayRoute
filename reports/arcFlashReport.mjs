import { downloadCSV, downloadPDF } from './reporting.mjs';

/**
 * Generate CSV and PDF reports from arc flash analysis results.
 * @param {Object<string, {incidentEnergy:number, ppeCategory:number, boundary:number}>} results
 */
export function generateArcFlashReport(results = {}) {
  const headers = ['bus', 'incidentEnergy', 'ppeCategory', 'boundary'];
  const rows = Object.entries(results).map(([id, data]) => ({
    bus: id,
    incidentEnergy: data.incidentEnergy,
    ppeCategory: data.ppeCategory,
    boundary: data.boundary
  }));
  if (!rows.length) return;
  downloadCSV(headers, rows, 'arcflash.csv');
  downloadPDF('Arc Flash Report', headers, rows, 'arcflash.pdf');
}
