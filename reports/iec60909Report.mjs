let loader;
async function getPdf() {
  const scope = typeof window === 'undefined' ? globalThis : window;
  if (scope.jspdf?.jsPDF) return scope.jspdf.jsPDF;
  loader ||= (typeof document === 'undefined'
    ? Function('return import(\'jspdf\')')().then(m => m.jsPDF || m.default)
    : new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = 'dist/vendor/jspdf.umd.min.js'; s.onload = () => resolve(scope.jspdf.jsPDF); s.onerror = reject; document.head.appendChild(s); }));
  return loader;
}

export async function toIEC60909PDF(results = {}) {
  const jsPDF = await getPdf();
  const doc = new jsPDF();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  let y = 16;
  let activeBus = '';
  const normalizePdfText = value => String(value ?? '')
    .replaceAll('″', '"')
    .replaceAll('²', '^2')
    .replaceAll('κ', 'kappa')
    .replaceAll('μ', 'mu')
    .replaceAll('≥', '>=')
    .replaceAll('≤', '<=')
    .replaceAll('→', '->')
    .replaceAll('×', 'x')
    .replace(/[–—]/g, '-');
  const jsonText = value => {
    if (value == null || value === '') return '';
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch (_) { return String(value); }
  };
  const listText = value => Array.isArray(value) ? value.join('; ') : jsonText(value);
  const continuationHeader = () => {
    if (!activeBus) return;
    doc.setFontSize(8);
    doc.text(`Bus / component: ${normalizePdfText(activeBus)} (continued)`, 10, y);
    y += 6;
  };
  const write = (text, size = 9) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(normalizePdfText(text), width - 20);
    lines.forEach(line => {
      if (y + 5 > height - 12) {
        doc.addPage();
        y = 16;
        continuationHeader();
      }
      doc.text(line, 10, y);
      y += 5;
    });
    y += 2;
  };
  write('IEC 60909-0:2016 Short-Circuit Report', 15);
  for (const [bus, result] of Object.entries(results).filter(([id, r]) => !id.startsWith('_') && r && typeof r === 'object')) {
    if (y > height - 35) { doc.addPage(); y = 16; }
    activeBus = bus;
    write(`Bus / component: ${bus}`, 11);
    const fields = [
      ['Validity', result.validity], ['Calculation status', result.calculationStatus],
      ['Prefault voltage (kV)', result.prefaultKV], ['Voltage factor c', result.cFactor], ['Kappa', result.kappa],
      ['3-phase current (kA)', result.threePhaseKA], ['SLG current (kA)', result.lineToGroundKA],
      ['L-L current (kA)', result.lineToLineKA], ['DLG maximum (kA)', result.doubleLineGroundKA],
      ['DLG phase B (kA)', result.doubleLineGroundPhaseBKA], ['DLG phase C (kA)', result.doubleLineGroundPhaseCKA],
      ['DLG earth (kA)', result.doubleLineGroundEarthKA], ['Required inputs', listText(result.requiredInputs)],
      ['Peak current ip (kA)', result.ip], ['Decay factor mu', result.mu], ['Breaking current Ib (kA)', result.Ib], ['Thermal current Ith (kA)', result.Ith],
      ['Warnings', listText(result.warnings)], ['Input provenance', jsonText(result.provenance || result.inputSources || {})],
      ['Source record', jsonText(result.source)], ['Input source', jsonText(result.inputSource)],
      ['Assumptions', jsonText(result.assumptions)], ['Limitations', jsonText(result.limitations)],
      ['Expected units', jsonText(result.units)], ['Evidence class', result.evidenceClass],
      ['Independent derivation', jsonText(result.independentDerivation)],
      ['Model limits', jsonText(result.modelLimits || {})], ['Study options', jsonText(result.studyOptions || {})],
      ['Saved fingerprint', result.inputFingerprint], ['Current fingerprint', result.currentInputFingerprint], ['Freshness', result.freshness], ['Calculated at', result.calculatedAt],
    ];
    fields.forEach(([label, value]) => write(`${label}: ${value == null ? '' : value}`));
  }
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.text(`Page ${page} of ${pageCount}`, width - 35, height - 6);
  }
  return doc.output('arraybuffer');
}

export async function downloadIEC60909PDF(results, filename = 'iec60909.pdf') {
  const pdf = await toIEC60909PDF(results);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
  a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 0);
}
