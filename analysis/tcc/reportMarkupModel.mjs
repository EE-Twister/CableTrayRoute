
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export { buildReviewExportMarkup } from './reviewExportMarkupModel.mjs';


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
