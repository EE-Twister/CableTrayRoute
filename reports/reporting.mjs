const { jsPDF } = window.jspdf || await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.es.min.js');

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

/**
 * Build rows for reliability study results.
 * @param {Object} result
 * @returns {Array<Object>}
 */
export function buildReliabilityRows(result = {}) {
  const rows = [];
  const stats = result.componentStats || {};
  Object.entries(stats).forEach(([id, s]) => {
    rows.push({ id, availability: s.availability, downtime_hours: s.downtime });
  });
  return rows;
}

/** Build rows for harmonic analysis */
export function buildHarmonicsRows(result = {}) {
  const rows = [];
  Object.entries(result).forEach(([id, r]) => {
    rows.push({ id, ithd: r.ithd, vthd: r.vthd, limit: r.limit, warning: r.warning });
  });
  return rows;
}

/** Build rows for motor starting study */
export function buildMotorStartRows(result = {}) {
  const rows = [];
  Object.entries(result).forEach(([id, r]) => {
    rows.push({ id, inrushKA: r.inrushKA, voltageSagPct: r.voltageSagPct, accelTime: r.accelTime });
  });
  return rows;
}

/**
 * Render a Handlebars template into a PDF document using PDFKit. This is a
 * lightweight helper intended for server-side or Node based generation of
 * richer reports where jsPDF is not available. The function lazily imports the
 * `handlebars` and `pdfkit` packages so they remain optional dependencies for
 * environments that do not need template rendering.
 *
 * @param {string|Function} template - Handlebars template string or precompiled
 *   function. When a string is provided it will be compiled with Handlebars.
 * @param {Object} context - Data passed to the template.
 * @returns {Promise<ArrayBuffer>} - Resolves with the generated PDF bytes.
 */
export async function renderTemplatePDF(template = '', context = {}) {
  const [HandlebarsMod, PDFKitMod] = await Promise.all([
    import('handlebars').catch(() => null),
    import('pdfkit').catch(() => null)
  ]);
  if (!HandlebarsMod || !PDFKitMod) {
    throw new Error('handlebars and pdfkit are required for template based PDF generation');
  }
  const Handlebars = HandlebarsMod.default || HandlebarsMod;
  const PDFDocument = PDFKitMod.default || PDFKitMod;
  const compile = typeof template === 'function' ? template : Handlebars.compile(template);
  const doc = new PDFDocument();
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  doc.on('end', () => {});
  doc.text(compile(context));
  doc.end();
  await new Promise(res => doc.on('end', res));
  return Buffer.concat(chunks).buffer;
}
