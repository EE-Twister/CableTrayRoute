function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function provenanceRows(provenance = {}) {
  return (provenance.devices || []).map(device => `
    <tr>
      <td>${escapeHtml(device.name)}</td>
      <td>${escapeHtml(device.manufacturer)}</td>
      <td>${escapeHtml(device.identity)}</td>
      <td>${escapeHtml(device.readiness)}</td>
      <td>${escapeHtml(device.curveDomain)}</td>
      <td>${escapeHtml(device.curveSource)}</td>
      <td>${escapeHtml([device.revision, device.curveReference].filter(value => value && value !== 'Not recorded').join(' / ') || 'Not recorded')}</td>
    </tr>`).join('');
}

function provenanceMarkup(provenance = {}) {
  const faultCurrent = Number.isFinite(provenance.faultCurrentA)
    ? `${provenance.faultCurrentA.toLocaleString()} A`
    : 'Unavailable — automatic coordination withheld';
  return `<section class="provenance" data-readiness="${escapeHtml(provenance.status || 'unknown')}">
    <h2>Study Readiness and Provenance</h2>
    <div class="readiness-boundary"><strong>${escapeHtml(provenance.heading || 'Readiness not recorded')}</strong><br>${escapeHtml(provenance.summary || '')}<br><span>${escapeHtml(provenance.intendedUse || '')}</span></div>
    <dl class="basis-grid">
      <div><dt>Fault current</dt><dd>${escapeHtml(faultCurrent)}</dd></div>
      <div><dt>Fault-current source</dt><dd>${escapeHtml(provenance.faultCurrentSource || 'Not recorded')}</dd></div>
      <div><dt>Active component</dt><dd>${escapeHtml(provenance.componentId || 'Not recorded')}</dd></div>
      <div><dt>Input fingerprint</dt><dd>${escapeHtml(provenance.inputFingerprint || 'Not recorded')}</dd></div>
    </dl>
    <div class="table-scroll"><table><thead><tr><th>Device</th><th>Manufacturer</th><th>Exact identity</th><th>Readiness</th><th>Curve domain</th><th>Curve source</th><th>Revision / reference</th></tr></thead><tbody>${provenanceRows(provenance) || '<tr><td colspan="7">No protective-device provenance was available.</td></tr>'}</tbody></table></div>
  </section>`;
}

export function buildReviewExportMarkup({ chartMarkup, previewMarkup, metricsMarkup, coordinationMarkup, statusText, rangeLabel, provenance }) {
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
    .status, .readiness-boundary { margin: 12px 0; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; background: #f8fafc; font-weight: 600; }
    .provenance[data-readiness="screening"] .readiness-boundary, .provenance[data-readiness="review"] .readiness-boundary { border-color: #f59e0b; background: #fffbeb; }
    .readiness-boundary span { display: inline-block; margin-top: 5px; font-weight: 500; }
    .review-visuals { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
    .review-chart svg, .review-preview svg { width: 100%; height: auto; }
    .review-preview { padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; background: #f8fafc; }
    .basis-grid, .tcc-equipment-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
    .basis-grid > div, .tcc-equipment-card { padding: 10px; border: 1px solid #d1d5db; border-radius: 8px; }
    .tcc-equipment-card h3 { margin: 0 0 4px; font-size: 0.95rem; }
    .tcc-equipment-card p { margin: 0 0 8px; color: #4b5563; font-size: 0.82rem; }
    dl { display: grid; gap: 4px; margin: 0; }
    dl > div { display: grid; grid-template-columns: 46% 1fr; gap: 6px; }
    dt { color: #6b7280; font-size: 0.78rem; }
    dd { margin: 0; font-size: 0.82rem; font-weight: 600; overflow-wrap: anywhere; }
    .table-scroll { overflow-x: auto; margin-top: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
    th, td { padding: 7px; border: 1px solid #d1d5db; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; }
    .coord-status, .coord-ok-item, .coord-warn, .coord-violation-detail { margin: 6px 0; }
    .coord-warn, .coord-fail { color: #9a3412; }
    .coord-ok, .coord-ok-item { color: #166534; }
    @media print { body { margin: 12mm; } .review-visuals { grid-template-columns: minmax(0, 1fr) 260px; } }
    @media (max-width: 900px) { .review-visuals { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header><h1>Time-Current Curve Review</h1><div class="meta">Generated ${escapeHtml(generated)}${rangeLabel ? ` | Range: ${escapeHtml(rangeLabel)}` : ''}</div></header>
  <div class="status">${escapeHtml(statusText || 'No status available.')}</div>
  ${provenanceMarkup(provenance)}
  <section class="review-visuals"><div class="review-chart">${chartMarkup}</div><aside class="review-preview">${previewMarkup || '<p>No one-line preview available.</p>'}</aside></section>
  ${metricsMarkup ? `<section><h2>Equipment Reference Metrics</h2>${metricsMarkup}</section>` : ''}
  ${coordinationMarkup ? `<section><h2>Coordination Results</h2>${coordinationMarkup}</section>` : ''}
</body>
</html>`;
}
