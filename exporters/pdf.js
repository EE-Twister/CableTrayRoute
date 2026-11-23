async function loadScript(url, isLoaded) {
  if (isLoaded()) return;
  await new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      if (existing.dataset.ctrPdfLoaded === 'true' && !isLoaded()) { reject(new Error(`PDF dependency did not initialize: ${url}`)); return; }
      existing.addEventListener('load', () => isLoaded() ? resolve() : reject(new Error(`PDF dependency did not initialize: ${url}`)), { once: true });
      existing.addEventListener('error', () => { existing.remove(); reject(new Error(`PDF dependency failed to load: ${url}`)); }, { once: true });
      if (isLoaded()) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => { script.dataset.ctrPdfLoaded = 'true'; if (isLoaded()) resolve(); else reject(new Error(`PDF dependency did not initialize: ${url}`)); };
    script.onerror = () => { script.remove(); reject(new Error(`PDF dependency failed to load: ${url}`)); };
    document.head.appendChild(script);
  });
}

let pdfDependenciesPromise = null;

async function loadPdfDependencies() {
  if (!pdfDependenciesPromise) {
    pdfDependenciesPromise = (async () => {
      if (!window.jspdf?.jsPDF) {
        await loadScript('dist/vendor/jspdf.umd.min.js', () => typeof window.jspdf?.jsPDF === 'function');
      }
      const { jsPDF } = window.jspdf || {};
      if (typeof jsPDF !== 'function') {
        throw new Error('jsPDF library is not loaded');
      }

      await loadScript('dist/vendor/svg2pdf.umd.min.js', () => typeof window.svg2pdf?.svg2pdf === 'function');
      const svg2pdf = window.svg2pdf?.svg2pdf;
      if (typeof svg2pdf !== 'function') {
        throw new Error('svg2pdf module failed to load');
      }
      return { jsPDF, svg2pdf };
    })().catch(err => {
      pdfDependenciesPromise = null;
      throw err;
    });
  }
  return pdfDependenciesPromise;
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
export async function exportPDF({ svgEl, sheets, loadSheet, serializeDiagram, activeSheet, reviewNotice = '' }) {
  const { jsPDF, svg2pdf } = await loadPdfDependencies();
  const width = svgEl.viewBox.baseVal?.width || svgEl.width.baseVal.value;
  const height = svgEl.viewBox.baseVal?.height || svgEl.height.baseVal.value;
  const noticeHeight = reviewNotice ? 24 : 0;
  const pdf = new jsPDF({ orientation: width > height + noticeHeight ? 'landscape' : 'portrait', unit: 'pt', format: [width, height + noticeHeight] });
  const original = activeSheet;
  for (let i = 0; i < sheets.length; i++) {
    loadSheet(i);
    const svgString = serializeDiagram();
    const svg = new DOMParser().parseFromString(svgString, 'image/svg+xml').documentElement;
    await inlineSvgImages(svg);
    await svg2pdf(svg, pdf, { x: 0, y: noticeHeight, width, height });
    if (reviewNotice) {
      pdf.setTextColor(180, 0, 0);
      pdf.setFontSize(9);
      pdf.text(reviewNotice, width / 2, 12, { align: 'center', maxWidth: Math.max(1, width - 20) });
    }
    if (i < sheets.length - 1) pdf.addPage([width, height + noticeHeight]);
  }
  loadSheet(original);
  pdf.save('oneline.pdf');
}
