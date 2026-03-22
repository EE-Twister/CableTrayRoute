/**
 * Unified Project Report Generator
 *
 * Aggregates results from every major CableTrayRoute analysis module into a
 * single structured report object that can be rendered as HTML, exported to
 * PDF (via window.print()), or downloaded as JSON.
 *
 * Sections generated:
 *   1. Project Summary       — counts, name, date
 *   2. Cable Schedule        — all cables with routing status
 *   3. Raceway Fill          — tray/conduit utilisation vs NEC limits
 *   4. Clash Detection       — hard & soft clashes (via clashDetect.mjs)
 *   5. Spool Sheets Summary  — prefab groups and material totals
 *   6. Validation            — any project-level warnings / errors
 *
 * References:
 *   NEC 2023 §392.22 — Cable tray fill limits
 *   NEMA VE 2-2013 §8.4 — Tray clearances
 */

import { detectClashes, overallSeverity } from './clashDetect.mjs';
import { generateSpoolSheets } from './spoolSheets.mjs';

// ---------------------------------------------------------------------------
// Fill helpers
// ---------------------------------------------------------------------------

/** NEC §392.22 fill limit (%) by tray type. */
const NEC_FILL_LIMIT_PCT = {
  'Ladder (50 % fill)': 50,
  'Solid Bottom (40 % fill)': 40,
  'Ventilated (50 % fill)': 50,
};

function fillLimitPct(trayType = '') {
  for (const [key, limit] of Object.entries(NEC_FILL_LIMIT_PCT)) {
    if (trayType.toLowerCase().includes(key.split(' ')[0].toLowerCase())) return limit;
  }
  return 50; // default
}

/**
 * Compute total cable cross-section (in²) for cables assigned to a tray.
 */
function cableFillIn2(cables, trayId) {
  return cables
    .filter(c => c.route_preference === trayId || c.raceway === trayId)
    .reduce((sum, c) => {
      const od = parseFloat(c.od) || 0;
      return sum + Math.PI * (od / 2) ** 2;
    }, 0);
}

/**
 * Compute tray cross-section available area (in²).
 */
function trayAreaIn2(tray) {
  const w = parseFloat(tray.inside_width) || 12;  // inches
  const d = parseFloat(tray.tray_depth)   || 4;   // inches
  return w * d;
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildSummarySection(cables, trays, conduits, ductbanks, projectName) {
  return {
    title: 'Project Summary',
    projectName: projectName || 'Untitled Project',
    generatedAt: new Date().toISOString(),
    counts: {
      cables:    cables.length,
      trays:     trays.length,
      conduits:  conduits.length,
      ductbanks: ductbanks.length,
    },
    totalCableLengthFt: cables.reduce((s, c) => s + (parseFloat(c.length) || parseFloat(c.length_ft) || 0), 0),
  };
}

function buildCableSection(cables) {
  const rows = cables.map(c => ({
    id:             c.id || c.tag || c.cable_id || '—',
    from:           c.from || c.source || '—',
    to:             c.to   || c.destination || '—',
    size:           c.conductor_size || c.size || '—',
    insulation:     c.insulation_type || '—',
    voltage:        c.voltage_rating || '—',
    lengthFt:       parseFloat(c.length || c.length_ft || 0),
    raceway:        c.route_preference || c.raceway || '—',
    routed:         Boolean(c.route_preference || c.raceway),
  }));

  const routed   = rows.filter(r => r.routed).length;
  const unrouted = rows.length - routed;
  const totalFt  = rows.reduce((s, r) => s + r.lengthFt, 0);

  return {
    title: 'Cable Schedule',
    rows,
    summary: { total: rows.length, routed, unrouted, totalLengthFt: +totalFt.toFixed(1) },
  };
}

function buildFillSection(trays, conduits, cables) {
  const trayRows = trays.map(tray => {
    const id       = tray.tray_id || tray.id || '—';
    const areaIn2  = trayAreaIn2(tray);
    const fillIn2  = cableFillIn2(cables, id);
    const limitPct = fillLimitPct(tray.tray_type || '');
    const usedPct  = areaIn2 > 0 ? (fillIn2 / areaIn2) * 100 : 0;
    const status   = usedPct > limitPct ? 'over' : usedPct > limitPct * 0.9 ? 'near' : 'ok';
    return { id, type: tray.tray_type || '—', widthIn: parseFloat(tray.inside_width) || 12, areaIn2: +areaIn2.toFixed(2), fillIn2: +fillIn2.toFixed(2), usedPct: +usedPct.toFixed(1), limitPct, status };
  });

  const conduitRows = conduits.map(c => {
    const id       = c.conduit_id || c.id || '—';
    const trade    = parseFloat(c.trade_size) || 1;
    // NEC Table 1 inside diameter approximation
    const idApprox = trade * 0.88;
    const areaIn2  = Math.PI * (idApprox / 2) ** 2;
    const fillIn2  = cableFillIn2(cables, id);
    const limitPct = 40;
    const usedPct  = areaIn2 > 0 ? (fillIn2 / areaIn2) * 100 : 0;
    const status   = usedPct > limitPct ? 'over' : usedPct > limitPct * 0.9 ? 'near' : 'ok';
    return { id, type: c.type || 'Conduit', tradeSizeIn: trade, areaIn2: +areaIn2.toFixed(2), fillIn2: +fillIn2.toFixed(2), usedPct: +usedPct.toFixed(1), limitPct, status };
  });

  const overCount  = [...trayRows, ...conduitRows].filter(r => r.status === 'over').length;
  const nearCount  = [...trayRows, ...conduitRows].filter(r => r.status === 'near').length;

  return {
    title: 'Raceway Fill Analysis',
    trays: trayRows,
    conduits: conduitRows,
    summary: { overCount, nearCount, totalRaceways: trayRows.length + conduitRows.length },
  };
}

function buildClashSection(trays) {
  const { clashes, stats } = detectClashes(trays);
  return {
    title: 'Clash Detection',
    clashes,
    stats,
    severity: overallSeverity(clashes),
  };
}

function buildSpoolSection(trays, cables) {
  const { spools, summary } = generateSpoolSheets(trays, cables);
  return {
    title: 'Spool Sheets Summary',
    spools,
    summary,
  };
}

function buildValidationSection(cables, trays, conduits) {
  const warnings = [];

  // Cables with no raceway assigned
  const unrouted = cables.filter(c => !c.route_preference && !c.raceway);
  if (unrouted.length > 0) {
    warnings.push({ severity: 'warning', message: `${unrouted.length} cable(s) have no raceway assigned.`, items: unrouted.map(c => c.id || c.tag || '?') });
  }

  // Trays with no cables
  const trayIds = new Set(cables.map(c => c.route_preference || c.raceway).filter(Boolean));
  const emptyTrays = trays.filter(t => !trayIds.has(t.tray_id));
  if (emptyTrays.length > 0) {
    warnings.push({ severity: 'info', message: `${emptyTrays.length} tray(s) have no cables assigned.`, items: emptyTrays.map(t => t.tray_id || t.id || '?') });
  }

  // Cables with missing length
  const noLength = cables.filter(c => !parseFloat(c.length || c.length_ft || 0));
  if (noLength.length > 0) {
    warnings.push({ severity: 'warning', message: `${noLength.length} cable(s) have no length specified.`, items: noLength.map(c => c.id || c.tag || '?') });
  }

  return {
    title: 'Validation',
    warnings,
    pass: warnings.filter(w => w.severity !== 'info').length === 0,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a unified project report from project data.
 *
 * @param {object}   data
 * @param {object[]} data.cables
 * @param {object[]} data.trays
 * @param {object[]} data.conduits
 * @param {object[]} data.ductbanks
 * @param {string}   [data.projectName]
 * @returns {ProjectReport}
 *
 * @typedef {{
 *   summary:    object,
 *   cables:     object,
 *   fill:       object,
 *   clashes:    object,
 *   spools:     object,
 *   validation: object,
 *   generatedAt: string,
 * }} ProjectReport
 */
export function generateProjectReport({ cables = [], trays = [], conduits = [], ductbanks = [], projectName = '' } = {}) {
  return {
    generatedAt: new Date().toISOString(),
    summary:    buildSummarySection(cables, trays, conduits, ductbanks, projectName),
    cables:     buildCableSection(cables),
    fill:       buildFillSection(trays, conduits, cables),
    clashes:    buildClashSection(trays),
    spools:     buildSpoolSection(trays, cables),
    validation: buildValidationSection(cables, trays, conduits),
  };
}

/**
 * Render a project report to an HTML string suitable for print or preview.
 *
 * @param {ProjectReport} report
 * @returns {string} HTML fragment (no <html>/<body> wrappers)
 */
export function renderReportHTML(report) {
  const esc = s => String(s ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = n => typeof n === 'number' ? n.toLocaleString() : esc(n);

  const statusBadge = s => {
    const map = { ok: 'badge-ok', near: 'badge-warn', over: 'badge-error', pass: 'badge-ok', warning: 'badge-warn', fail: 'badge-error', info: 'badge-info' };
    return `<span class="badge ${map[s] || ''}">${esc(s)}</span>`;
  };

  const { summary, cables, fill, clashes, spools, validation } = report;

  let html = `
<header class="report-header">
  <h1 class="report-title">${esc(summary.projectName)}</h1>
  <p class="report-meta">Project Report &nbsp;·&nbsp; Generated ${new Date(report.generatedAt).toLocaleString()}</p>
</header>

<section class="report-section" id="rpt-summary">
  <h2>Project Summary</h2>
  <dl class="report-dl">
    <dt>Cables</dt><dd>${fmt(summary.counts.cables)}</dd>
    <dt>Trays</dt><dd>${fmt(summary.counts.trays)}</dd>
    <dt>Conduits</dt><dd>${fmt(summary.counts.conduits)}</dd>
    <dt>Ductbanks</dt><dd>${fmt(summary.counts.ductbanks)}</dd>
    <dt>Total Cable Length</dt><dd>${fmt(summary.totalCableLengthFt.toFixed(1))} ft</dd>
  </dl>
</section>

<section class="report-section" id="rpt-cables">
  <h2>Cable Schedule</h2>
  <p class="report-note">${fmt(cables.summary.routed)} routed &nbsp;·&nbsp; ${fmt(cables.summary.unrouted)} unrouted &nbsp;·&nbsp; ${fmt(cables.summary.totalLengthFt)} ft total</p>
  <div class="report-scroll">
  <table class="report-table">
    <thead><tr><th>ID</th><th>From</th><th>To</th><th>Size</th><th>Insulation</th><th>Voltage</th><th>Length (ft)</th><th>Raceway</th></tr></thead>
    <tbody>${cables.rows.map(r => `<tr>
      <td>${esc(r.id)}</td><td>${esc(r.from)}</td><td>${esc(r.to)}</td>
      <td>${esc(r.size)}</td><td>${esc(r.insulation)}</td><td>${esc(r.voltage)}</td>
      <td>${fmt(r.lengthFt)}</td><td>${esc(r.raceway)}</td>
    </tr>`).join('')}</tbody>
  </table>
  </div>
</section>

<section class="report-section" id="rpt-fill">
  <h2>Raceway Fill Analysis</h2>
  <p class="report-note">${fmt(fill.summary.overCount)} over limit &nbsp;·&nbsp; ${fmt(fill.summary.nearCount)} near limit</p>
  <div class="report-scroll">
  <table class="report-table">
    <thead><tr><th>Raceway</th><th>Type</th><th>Area (in²)</th><th>Fill (in²)</th><th>Used %</th><th>Limit %</th><th>Status</th></tr></thead>
    <tbody>
    ${fill.trays.map(r => `<tr>
      <td>${esc(r.id)}</td><td>${esc(r.type)}</td>
      <td>${fmt(r.areaIn2)}</td><td>${fmt(r.fillIn2)}</td>
      <td>${fmt(r.usedPct)}</td><td>${fmt(r.limitPct)}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>`).join('')}
    ${fill.conduits.map(r => `<tr>
      <td>${esc(r.id)}</td><td>${esc(r.type)}</td>
      <td>${fmt(r.areaIn2)}</td><td>${fmt(r.fillIn2)}</td>
      <td>${fmt(r.usedPct)}</td><td>${fmt(r.limitPct)}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>`).join('')}
    </tbody>
  </table>
  </div>
</section>

<section class="report-section" id="rpt-clashes">
  <h2>Clash Detection</h2>
  <p class="report-note">Overall severity: ${statusBadge(clashes.severity)} &nbsp;·&nbsp;
    ${fmt(clashes.stats.hardClashes)} hard &nbsp;·&nbsp; ${fmt(clashes.stats.softClashes)} soft</p>
  ${clashes.clashes.length === 0
    ? '<p class="report-empty">No clashes detected.</p>'
    : `<div class="report-scroll"><table class="report-table">
    <thead><tr><th>Tray A</th><th>Tray B</th><th>Severity</th><th>Min Gap (ft)</th><th>Description</th></tr></thead>
    <tbody>${clashes.clashes.map(c => `<tr>
      <td>${esc(c.trayA)}</td><td>${esc(c.trayB)}</td>
      <td>${statusBadge(c.severity)}</td>
      <td>${fmt(c.minGapFt)}</td>
      <td>${esc(c.description)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`}
</section>

<section class="report-section" id="rpt-spools">
  <h2>Spool Sheets Summary</h2>
  <p class="report-note">${fmt(spools.summary.spoolCount)} spools &nbsp;·&nbsp;
    ${fmt(spools.summary.totalLengthFt)} ft total &nbsp;·&nbsp;
    ${fmt(spools.summary.totalSections)} sections &nbsp;·&nbsp;
    ${fmt(spools.summary.totalBrackets)} brackets</p>
  <div class="report-scroll">
  <table class="report-table">
    <thead><tr><th>Spool</th><th>Trays</th><th>Length (ft)</th><th>Width (in)</th><th>Sections</th><th>Brackets</th><th>Weight (lbs)</th><th>Cables</th></tr></thead>
    <tbody>${spools.spools.map(s => `<tr>
      <td>${esc(s.spoolId)}</td><td>${fmt(s.trayCount)}</td>
      <td>${fmt(s.totalLengthFt)}</td><td>${fmt(s.width_in)}</td>
      <td>${fmt(s.straightSections)}</td><td>${fmt(s.bracketCount)}</td>
      <td>${fmt(s.estimatedWeight)}</td><td>${fmt(s.cables.length)}</td>
    </tr>`).join('')}</tbody>
  </table>
  </div>
</section>

<section class="report-section" id="rpt-validation">
  <h2>Validation</h2>
  ${validation.warnings.length === 0
    ? '<p class="report-empty">No issues found.</p>'
    : validation.warnings.map(w => `
  <div class="report-alert report-alert--${w.severity}">
    <strong>${esc(w.severity.toUpperCase())}:</strong> ${esc(w.message)}
    ${w.items && w.items.length ? `<ul>${w.items.slice(0, 10).map(i => `<li>${esc(i)}</li>`).join('')}${w.items.length > 10 ? `<li>…and ${w.items.length - 10} more</li>` : ''}</ul>` : ''}
  </div>`).join('')}
</section>`;

  return html;
}
