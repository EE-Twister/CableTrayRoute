const { jsPDF } = window.jspdf || await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm');
// Use ESM build of svg2pdf from jsDelivr. Previous URL pointed to a
// non-existent file and caused a 404 in the browser. The `+esm` suffix
// ensures the module entry in the package is used, which serves
// `dist/svg2pdf.es.min.js` for version 2.5.0.
const svg2pdfModule = await import('https://cdn.jsdelivr.net/npm/svg2pdf.js@2.5.0/+esm');
const svg2pdf = svg2pdfModule?.default || svg2pdfModule?.svg2pdf;
if (typeof svg2pdf !== 'function') {
  throw new Error('svg2pdf module failed to load');
}

/**
 * Export the current set of sheets to a PDF document.
 * @param {Object} opts
 * @param {SVGSVGElement} opts.svgEl The SVG element containing the diagram.
 * @param {Array} opts.sheets All sheets in the diagram.
 * @param {Function} opts.loadSheet Function to load a sheet by index.
 * @param {Function} opts.serializeDiagram Function that serializes the current diagram to an SVG string.
 * @param {number} opts.activeSheet Index of the currently active sheet.
 */
export async function exportPDF({ svgEl, sheets, loadSheet, serializeDiagram, activeSheet }) {
  const width = svgEl.viewBox.baseVal?.width || svgEl.width.baseVal.value;
  const height = svgEl.viewBox.baseVal?.height || svgEl.height.baseVal.value;
  const pdf = new jsPDF({ orientation: width > height ? 'landscape' : 'portrait', unit: 'pt', format: [width, height] });
  const original = activeSheet;
  for (let i = 0; i < sheets.length; i++) {
    loadSheet(i);
    const svgString = serializeDiagram();
    const svg = new DOMParser().parseFromString(svgString, 'image/svg+xml').documentElement;
    await svg2pdf(svg, pdf, { x: 0, y: 0, width, height });
    if (i < sheets.length - 1) pdf.addPage([width, height]);
  }
  loadSheet(original);
  pdf.save('oneline.pdf');
}
