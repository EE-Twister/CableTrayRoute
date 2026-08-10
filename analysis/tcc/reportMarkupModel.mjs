
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


export function buildPrintMarkup(svgMarkup, headerText, footerText, { previewMarkup = '' } = {}) {
  const header = headerText || 'Time-Current Curves';
  const footer = footerText || `Generated ${new Date().toLocaleString()}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Time-Current Curve Plot</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 24px; color: #111; }
    .print-header { text-align: center; font-size: 1.5rem; font-weight: 600; margin-bottom: 16px; }
    .print-chart { display: flex; justify-content: center; align-items: center; margin: 16px 0; }
    .print-chart svg { max-width: 100%; height: auto; }
    .print-preview { margin-top: 24px; }
    .print-preview h2 { font-size: 1.1rem; margin: 0 0 12px; text-align: left; }
    .print-preview-graphic { display: flex; justify-content: center; align-items: center; padding: 12px; border: 1px solid #ccc; border-radius: 8px; background: #f8f9fb; }
    .print-preview-graphic svg { max-width: 100%; height: auto; }
    .print-preview-empty { margin: 0; font-size: 0.95rem; color: #555; text-align: center; }
    .print-footer { text-align: center; font-size: 0.85rem; color: #555; margin-top: 24px; }
    @page { size: landscape; margin: 15mm; }
  </style>
</head>
<body>
  <div class="print-header">${escapeHtml(header)}</div>
  <div class="print-chart">${svgMarkup}</div>
  ${previewMarkup ? `<div class="print-preview"><h2>One-Line Preview</h2><div class="print-preview-graphic">${previewMarkup}</div></div>` : ''}
  <div class="print-footer">${escapeHtml(footer)}</div>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.print();
        window.addEventListener('afterprint', () => window.close());
      }, 50);
    });
  </script>
</body>
</html>`;
}


export function buildReviewExportMarkup({ chartMarkup, previewMarkup, metricsMarkup, coordinationMarkup, statusText, rangeLabel }) {
  const generated = new Date().toLocaleString();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>TCC Review Package</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: "Segoe UI", Arial, sans-serif; margin: 24px; color: #111827; background: #fff; }
    header { margin-bottom: 18px; border-bottom: 1px solid #d1d5db; padding-bottom: 12px; }
    h1 { margin: 0 0 6px; font-size: 1.45rem; }
    h2 { margin: 22px 0 10px; font-size: 1.05rem; color: #1d4ed8; }
    .meta { color: #4b5563; font-size: 0.9rem; }
    .status { margin: 12px 0; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; background: #f8fafc; font-weight: 600; }
    .review-visuals { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
    .review-chart svg, .review-preview svg { width: 100%; height: auto; }
    .review-preview { padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; background: #f8fafc; }
    .tcc-equipment-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
    .tcc-equipment-card { padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; }
    .tcc-equipment-card h3 { margin: 0 0 4px; font-size: 0.95rem; }
    .tcc-equipment-card p { margin: 0 0 8px; color: #4b5563; font-size: 0.82rem; }
    dl { display: grid; gap: 4px; margin: 0; }
    dl > div { display: grid; grid-template-columns: 46% 1fr; gap: 6px; }
    dt { color: #6b7280; font-size: 0.78rem; }
    dd { margin: 0; font-size: 0.82rem; font-weight: 600; }
    .coord-status, .coord-ok-item, .coord-warn, .coord-violation-detail { margin: 6px 0; }
    .coord-warn, .coord-fail { color: #9a3412; }
    .coord-ok, .coord-ok-item { color: #166534; }
    @media print {
      body { margin: 12mm; }
      .review-visuals { grid-template-columns: minmax(0, 1fr) 260px; }
    }
    @media (max-width: 900px) {
      .review-visuals { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Time-Current Curve Review</h1>
    <div class="meta">Generated ${escapeHtml(generated)}${rangeLabel ? ` | Range: ${escapeHtml(rangeLabel)}` : ''}</div>
  </header>
  <div class="status">${escapeHtml(statusText || 'No status available.')}</div>
  <section class="review-visuals">
    <div class="review-chart">${chartMarkup}</div>
    <aside class="review-preview">${previewMarkup || '<p>No one-line preview available.</p>'}</aside>
  </section>
  ${metricsMarkup ? `<section><h2>Equipment Reference Metrics</h2>${metricsMarkup}</section>` : ''}
  ${coordinationMarkup ? `<section><h2>Coordination Results</h2>${coordinationMarkup}</section>` : ''}
</body>
</html>`;
}
