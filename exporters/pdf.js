async function loadScript(url) {
  await new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      if (window.jspdf?.jsPDF) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

if (!window.jspdf?.jsPDF) {
  await loadScript('dist/vendor/jspdf.umd.min.js');
}
const { jsPDF } = window.jspdf || {};
if (typeof jsPDF !== 'function') {
  throw new Error('jsPDF library is not loaded');
}

const svg2pdfUrl = new URL('dist/vendor/svg2pdf.es.min.js', document.baseURI).href;
const svg2pdfModule = await import(svg2pdfUrl);
const svg2pdf = svg2pdfModule?.default || svg2pdfModule?.svg2pdf;
if (typeof svg2pdf !== 'function') {
  throw new Error('svg2pdf module failed to load');
}

const XLINK_NS = 'http://www.w3.org/1999/xlink';
const imageCache = new Map();

async function fetchAsDataUrl(url) {
  if (imageCache.has(url)) return imageCache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load resource ${url}`);
  const blob = await res.blob();
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Failed to read image data'));
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  imageCache.set(url, dataUrl);
  return dataUrl;
}

async function inlineSvgImages(svg) {
  const images = Array.from(svg.querySelectorAll('image'));
  await Promise.all(images.map(async img => {
    const href = img.getAttributeNS(XLINK_NS, 'href') || img.getAttribute('href');
    if (!href || href.startsWith('data:')) return;
    try {
      const dataUrl = await fetchAsDataUrl(href);
      img.setAttributeNS(XLINK_NS, 'href', dataUrl);
      img.setAttribute('href', dataUrl);
    } catch (err) {
      console.warn('Failed to inline image for PDF export', href, err);
    }
  }));
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
    await inlineSvgImages(svg);
    await svg2pdf(svg, pdf, { x: 0, y: 0, width, height });
    if (i < sheets.length - 1) pdf.addPage([width, height]);
  }
  loadSheet(original);
  pdf.save('oneline.pdf');
}
