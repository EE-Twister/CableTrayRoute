import { downloadCSV, downloadPDF } from './reporting.mjs';
import { generateArcFlashLabel } from './labels.mjs';

/**
 * Generate CSV and PDF reports from arc flash analysis results.
 * @param {Object<string, {incidentEnergy:number, ppeCategory:number, boundary:number, clearingTime:number}>} results
 */
export function generateArcFlashReport(results = {}) {
  const headers = ['bus', 'incidentEnergy', 'ppeCategory', 'boundary', 'clearingTime'];
  const rows = Object.entries(results).map(([id, data]) => ({
    bus: id,
    incidentEnergy: data.incidentEnergy,
    ppeCategory: data.ppeCategory,
    boundary: data.boundary,
    clearingTime: data.clearingTime
  }));
  if (!rows.length) return;
  downloadCSV(headers, rows, 'arcflash.csv');
  downloadPDF('Arc Flash Report', headers, rows, 'arcflash.pdf');
  // export individual labels
  Object.entries(results).forEach(([id, info]) => {
    const svg = generateArcFlashLabel({
      equipment: id,
      incidentEnergy: info.incidentEnergy,
      boundary: info.boundary
    });
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${id}_label.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
  });
}
