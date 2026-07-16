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
import { buildHeatTraceReport } from './heatTraceReport.mjs';
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
    from:           c.from || c.from_tag || c.source || '—',
    to:             c.to || c.to_tag || c.destination || '—',
    size:           c.conductor_size || c.size || '—',
    insulation:     c.insulation_type || c.insulation || c.insulation_material || '—',
    voltage:        c.voltage_rating || c.cable_rating || c.operating_voltage || c.voltage || c.rated_voltage || '—',
    lengthFt:       parseFloat(c.length || c.length_ft || 0),
    raceway:        c.route_preference || c.raceway || (Array.isArray(c.raceway_ids) ? c.raceway_ids.join(', ') : c.raceway_ids) || '—',
    routed:         Boolean(c.route_preference || c.raceway || (Array.isArray(c.raceway_ids) ? c.raceway_ids.length : c.raceway_ids)),
  }));

  const routed   = rows.filter(r => r.routed).length;
  const unrouted = rows.length - routed;
  const totalFt  = rows.reduce((s, r) => s + r.lengthFt, 0);

  return {
    title: 'Cable Schedule',
    rows,
    summary: {
      total: rows.length,
      routed,
      unrouted,
      totalLengthFt: +totalFt.toFixed(1),
      missingInsulation: rows.filter(row => row.insulation === '—').length,
      missingVoltage: rows.filter(row => row.voltage === '—').length,
      issueReady: rows.every(row => row.insulation !== '—' && row.voltage !== '—')
    },
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

function buildHeatTraceSection(studies = {}, projectName = '', approval = null) {
  const activeResult = studies.heatTraceSizing || null;
  const circuitCases = Array.isArray(studies.heatTraceSizingCircuits) ? studies.heatTraceSizingCircuits : [];
  if (!activeResult && circuitCases.length === 0) return null;

  const report = buildHeatTraceReport({
    activeResult,
    activeInputs: activeResult || null,
    circuitCases,
    approval,
    projectName: projectName || 'Untitled Project',
  });

  return {
    title: 'Heat Trace Branch Circuit Schedule',
    report,
    summary: report.summary,
    branchSchedule: report.branchSchedule,
    warnings: report.warnings,
    approval: report.approval,
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
 *   heatTrace:  object | null,
 *   generatedAt: string,
 * }} ProjectReport
 */
export function generateProjectReport({
  cables = [],
  trays = [],
  conduits = [],
  ductbanks = [],
  projectName = '',
  studies = {},
  approvals = {},
} = {}) {
  return {
    generatedAt: new Date().toISOString(),
    summary:    buildSummarySection(cables, trays, conduits, ductbanks, projectName),
    cables:     buildCableSection(cables),
    fill:       buildFillSection(trays, conduits, cables),
    clashes:    buildClashSection(trays),
    spools:     buildSpoolSection(trays, cables),
    heatTrace:  buildHeatTraceSection(studies, projectName, approvals.heatTraceSizing || null),
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
    const map = {
      ok: 'badge-ok',
      near: 'badge-warn',
      over: 'badge-error',
      pass: 'badge-ok',
      warning: 'badge-warn',
      fail: 'badge-error',
      info: 'badge-info',
      withinLimit: 'badge-ok',
      overLimit: 'badge-error',
      invalid: 'badge-error',
      notRun: 'badge-info',
    };
    return `<span class="badge ${map[s] || ''}">${esc(s)}</span>`;
  };

  const { summary, cables, fill, clashes, spools, heatTrace, validation } = report;

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
  ${cables.summary.issueReady ? '<p class="report-readiness-note report-readiness-note--ready">Issue-ready fields complete.</p>' : `<p class="report-readiness-note report-readiness-note--warning">Not issue-ready: ${fmt(cables.summary.missingInsulation)} cable(s) need insulation type and ${fmt(cables.summary.missingVoltage)} cable(s) need voltage rating.</p>`}
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

${heatTrace ? `<section class="report-section" id="rpt-heat-trace">
  <h2>Heat Trace Branch Circuit Schedule</h2>
  <p class="report-note">This section rolls up heat-trace branch/load circuits from the controller or heat-trace panel output to each traced run. Upstream feeder, transformer, panel bus, and breaker coordination are excluded.</p>
  <dl class="report-dl">
    <dt>Saved Branches</dt><dd>${fmt(heatTrace.branchSchedule.summary.branchCount)}</dd>
    <dt>Total Installed Connected Load</dt><dd>${fmt(heatTrace.branchSchedule.summary.totalConnectedKw)} kW</dd>
    <dt>Total Required Heat Load</dt><dd>${fmt(heatTrace.branchSchedule.summary.totalRequiredKw)} kW</dd>
    <dt>Total Branch Current</dt><dd>${fmt(heatTrace.branchSchedule.summary.totalLoadAmps)} A</dd>
    <dt>Approval Status</dt><dd>${esc(heatTrace.approval?.status || 'pending')}</dd>
    <dt>Branches Over Limit</dt><dd>${fmt(heatTrace.branchSchedule.summary.overLimitCount)}</dd>
    <dt>Branches With Warnings</dt><dd>${fmt(heatTrace.branchSchedule.summary.warningCount)}</dd>
  </dl>
  <div class="report-scroll">
  <table class="report-table">
    <thead><tr><th>Branch</th><th>Status</th><th>Cable Type</th><th>Effective Length (ft)</th><th>Max (ft)</th><th>Selected W/ft x Runs</th><th>Installed W</th><th>Required W</th><th>Voltage</th><th>Amps</th><th>Warnings</th></tr></thead>
    <tbody>${heatTrace.branchSchedule.rows.length ? heatTrace.branchSchedule.rows.map(r => `<tr>
      <td>${esc(r.name)}</td>
      <td>${statusBadge(r.status)}</td>
      <td>${esc(r.heatTraceCableTypeLabel)}</td>
      <td>${fmt(r.effectiveTraceLengthFt)}</td>
      <td>${fmt(r.maxCircuitLengthFt)}</td>
      <td>${fmt(r.selectedWPerFt)} x ${fmt(r.traceRunCount)}</td>
      <td>${fmt(r.totalWatts)}</td>
      <td>${fmt(r.requiredWatts)}</td>
      <td>${fmt(r.voltageV)}</td>
      <td>${fmt(r.loadAmps)}</td>
      <td>${esc(r.warnings.join(' | ') || 'None')}</td>
    </tr>`).join('') : '<tr><td colspan="11">No saved heat trace branches.</td></tr>'}</tbody>
  </table>
  </div>
  ${heatTrace.warnings.length
    ? `<div class="report-alert report-alert--warning"><strong>Heat trace warnings:</strong><ul>${heatTrace.warnings.map(w => `<li>${esc(w.source)}: ${esc(w.message)}</li>`).join('')}</ul></div>`
    : '<p class="report-empty">No heat trace warnings detected.</p>'}
</section>` : ''}

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

// ---------------------------------------------------------------------------
// Study section builders (added for report package builder)
// ---------------------------------------------------------------------------

/**
 * Build an arc flash section from study results.
 * @param {object} studies
 * @param {object} approvals
 */
export function buildArcFlashSection(studies = {}, approvals = {}) {
  const data = studies.arcFlash || null;
  const approval = approvals.arcFlash || null;
  if (!data) return { key: 'arcFlash', title: 'Arc Flash Study', empty: true };

  // data may be a flat results object keyed by bus/component ID
  const entries = Array.isArray(data)
    ? data
    : Object.entries(data)
        .filter(([k]) => !k.startsWith('_'))
        .map(([id, v]) => (typeof v === 'object' && v !== null ? { id, ...v } : { id, value: v }));

  const rows = entries.map(e => ({
    id:             e.id || e.busId || '—',
    incidentEnergy: e.incidentEnergy ?? e.incident_energy ?? '—',
    ppeSelection:   Number(e.minimumArcRatingCalCm2) > 0
      ? `Arc rating ≥ ${e.minimumArcRatingCalCm2} cal/cm²`
      : (Number(e.incidentEnergy ?? e.incident_energy) <= 1.2 ? 'Below 1.2 cal/cm² threshold' : '—'),
    boundary:       e.boundary       ?? e.arc_flash_boundary ?? '—',
    clearingTime:   e.clearingTime   ?? e.clearing_time   ?? '—',
    voltage:        e.voltage        ?? e.nominalVoltage   ?? '—',
  }));

  return { key: 'arcFlash', title: 'Arc Flash Study', rows, approval };
}

/**
 * Build a short circuit section from study results.
 */
export function buildShortCircuitSection(studies = {}, approvals = {}) {
  const data = studies.shortCircuit || null;
  const approval = approvals.shortCircuit || null;
  if (!data) return { key: 'shortCircuit', title: 'Short Circuit Analysis', empty: true };

  const rowFields = [
    'threePhaseKA', 'i3ph_kA', 'threePhase', 'symmetrical',
    'lineToGroundKA', 'iSlg_kA', 'slg',
    'lineToLineKA', 'iLL_kA', 'll',
    'doubleLineGroundKA', 'iDLG_kA', 'dlg'
  ];
  const arrays = [data.results, data.buses, data.busResults].find(Array.isArray);
  let raw = Array.isArray(data) ? data : (arrays || []);

  if (!raw.length && typeof data === 'object') {
    if (rowFields.some(field => data[field] != null)) {
      raw = [data];
    } else {
      raw = Object.entries(data)
        .filter(([key, value]) => !key.startsWith('_')
          && value
          && typeof value === 'object'
          && rowFields.some(field => value[field] != null))
        .map(([id, value]) => ({ id, ...value }));
    }
  }

  const rows = raw.map(e => ({
    id:       e.equipmentTag || e.id || e.busId || '—',
    i3ph_kA:  e.threePhaseKA ?? e.i3ph_kA ?? e.threePhase ?? e.symmetrical ?? '—',
    iSlg_kA:  e.lineToGroundKA ?? e.iSlg_kA ?? e.slg ?? '—',
    iLL_kA:   e.lineToLineKA ?? e.iLL_kA ?? e.ll ?? '—',
    iDLG_kA:  e.doubleLineGroundKA ?? e.iDLG_kA ?? e.dlg ?? '—',
    voltage:  e.prefaultKV ?? e.voltage ?? e.nominalVoltage ?? '—',
  }));

  const summary = {
    status: data.status ?? null,
    availableFaultKa: data.availableFaultKa ?? data.availableFaultKA ?? data.faultCurrentKA ?? data.faultKa ?? null,
    updatedAt: data.updatedAt ?? data.generatedAt ?? null,
  };
  const hasSummary = Object.values(summary).some(value => value != null && value !== '');

  return {
    key: 'shortCircuit',
    title: 'Short Circuit Analysis',
    rows,
    summary: hasSummary ? summary : null,
    empty: rows.length === 0 && !hasSummary,
    approval
  };
}

/**
 * Build a load flow section from study results.
 */
export function buildLoadFlowSection(studies = {}, approvals = {}) {
  const data = studies.loadFlow || null;
  const approval = approvals.loadFlow || null;
  if (!data) return { key: 'loadFlow', title: 'Load Flow Analysis', empty: true };

  const busResults = Array.isArray(data.buses) ? data.buses
    : Array.isArray(data) ? data
    : [];

  const busRows = busResults.map(b => ({
    id:       b.id || b.busId || '—',
    voltagePu: b.voltagePu ?? b.voltage_pu ?? '—',
    voltageKv: b.voltageKv ?? b.voltage_kv ?? '—',
    angleDeg:  b.angleDeg  ?? b.angle_deg  ?? '—',
    loadKW:    b.loadKW    ?? b.load_kw    ?? '—',
    loadKVAR:  b.loadKVAR  ?? b.load_kvar  ?? '—',
  }));

  const branchResults = Array.isArray(data.branches) ? data.branches : [];
  const branchRows = branchResults.map(br => ({
    id:          br.id || br.branchId || '—',
    fromBus:     br.fromBus  ?? '—',
    toBus:       br.toBus    ?? '—',
    flowKW:      br.flowKW   ?? br.flow_kw   ?? '—',
    flowKVAR:    br.flowKVAR ?? br.flow_kvar ?? '—',
    loading_pct: br.loading_pct ?? br.loadingPct ?? '—',
  }));

  return { key: 'loadFlow', title: 'Load Flow Analysis', busRows, branchRows, approval };
}

/**
 * Build a harmonics section from study results.
 */
export function buildHarmonicsSection(studies = {}, approvals = {}) {
  const data = studies.harmonics || null;
  const approval = approvals.harmonics || null;
  if (!data) return { key: 'harmonics', title: 'Harmonics Analysis', empty: true };

  const entries = typeof data === 'object' && !Array.isArray(data)
    ? Object.entries(data)
        .filter(([k]) => !k.startsWith('_'))
        .map(([id, v]) => (typeof v === 'object' ? { id, ...v } : { id }))
    : (Array.isArray(data) ? data : []);

  const rows = entries.map(e => ({
    id:      e.id || '—',
    ithd:    e.ithd    ?? e.ITHD    ?? '—',
    vthd:    e.vthd    ?? e.VTHD    ?? '—',
    limit:   e.limit   ?? '—',
    warning: e.warning === true
      ? 'Above screening threshold — PCC study required'
      : (e.warning === false ? 'Within screening threshold — not a compliance result' : 'Not evaluated'),
    calculationStatus: e.calculationStatus ?? 'screening-only',
  }));

  return { key: 'harmonics', title: 'Harmonics Analysis', rows, approval };
}

/**
 * Build a motor starting section from study results.
 */
export function buildMotorStartSection(studies = {}, approvals = {}) {
  const data = studies.motorStart || null;
  const approval = approvals.motorStart || null;
  if (!data) return { key: 'motorStart', title: 'Motor Starting Study', empty: true };

  const entries = typeof data === 'object' && !Array.isArray(data)
    ? Object.entries(data)
        .filter(([k]) => !k.startsWith('_'))
        .map(([id, v]) => (typeof v === 'object' ? { id, ...v } : { id }))
    : (Array.isArray(data) ? data : []);

  const rows = entries.map(e => ({
    id:           e.id || '—',
    inrushKA:     e.inrushKA     ?? e.inrush_kA    ?? '—',
    voltageSagPct: e.voltageSagPct ?? e.voltage_sag_pct ?? '—',
    accelTime:    e.accelTime    ?? e.accel_time   ?? '—',
    method:       e.method       ?? e.startMethod  ?? '—',
  }));

  return { key: 'motorStart', title: 'Motor Starting Study', rows, approval };
}

/**
 * Build a voltage drop section from study results.
 */
export function buildVoltageDropSection(studies = {}, approvals = {}) {
  const data = studies.voltageDropStudy || null;
  const approval = approvals.voltageDropStudy || null;
  if (!data) return { key: 'voltageDrop', title: 'Voltage Drop Study', empty: true };

  const results = Array.isArray(data.results) ? data.results
    : Array.isArray(data) ? data
    : Object.entries(data)
        .filter(([k]) => !k.startsWith('_'))
        .map(([id, v]) => (typeof v === 'object' ? { id, ...v } : { id }));

  const rows = results.map(r => ({
    id:         r.id       || r.cableId   || '—',
    from:       r.from     || r.source    || '—',
    to:         r.to       || r.load      || '—',
    dropPct:    r.dropPct  ?? r.drop_pct  ?? '—',
    dropV:      r.dropV    ?? r.drop_v    ?? '—',
    limitPct:   r.limitPct ?? r.limit_pct ?? r.limit ?? '—',
    status:     r.evaluated === false ? 'not evaluated' : (r.status ?? (parseFloat(r.dropPct) > parseFloat(r.limitPct) ? 'fail' : 'pass')),
  }));

  return { key: 'voltageDrop', title: 'Voltage Drop Study', rows, approval };
}

/**
 * Build a DRC section from design rule check results.
 * @param {Array} drcResults - array of DRC finding objects from designRuleChecker
 */
export function buildDRCSection(drcResults = []) {
  if (!Array.isArray(drcResults) || drcResults.length === 0) {
    return { key: 'drc', title: 'Design Rule Check', rows: [], pass: true };
  }

  const rows = drcResults.map(f => ({
    rule:        f.rule        || f.ruleId     || '—',
    severity:    f.severity    || '—',
    component:   f.component   || f.location   || f.trayId || f.id || '—',
    message:     f.message     || '—',
    remediation: f.remediation || '—',
    accepted:    f.accepted    ? 'Yes' : 'No',
  }));

  const errors   = rows.filter(r => r.severity === 'error').length;
  const warnings = rows.filter(r => r.severity === 'warning').length;

  return { key: 'drc', title: 'Design Rule Check', rows, pass: errors === 0, errors, warnings };
}

/**
 * Build a BESS hazard-screening section from study results.
 * @param {object} studies
 * @param {object} approvals
 */
export function buildBessHazardSection(studies = {}, approvals = {}) {
  const data = studies.bessHazard || null;
  const approval = approvals.bessHazard || null;
  if (!data || !data.valid) return { key: 'bessHazard', title: 'BESS Hazard / Thermal Runaway Screening', empty: true };

  const { separationChecks = [], propagation = {}, ventArea = {}, summary = {}, providedVentAreaM2 } = data;

  const separationRows = separationChecks.map(c => ({
    label:       c.label,
    type:        c.type,
    actualDistM: c.actualDistM,
    minDistM:    c.minDistM,
    status:      (c.meetsScreeningDistance ?? c.actualDistM >= c.minDistM) ? 'review' : 'screening-alert',
  }));

  return {
    key:      'bessHazard',
    title:    'BESS Hazard / Thermal Runaway Screening',
    summary:  {
      overallStatus:         summary.status,
      ratedKwh:              data.ratedKwh,
      chemistryName:         data.chemistryName,
      cellToCell_min:        propagation.cellToCell_min,
      cellToModule_min:      propagation.cellToModule_min,
      moduleToRack_min:      propagation.moduleToRack_min,
      screeningVentAreaM2:   ventArea.ventAreaM2,
      providedVentAreaM2,
      meetsScreeningVentArea: summary.meetsScreeningVentArea,
      requiresEngineeringReview: true,
      issues:                summary.issues || [],
    },
    separationRows,
    approval,
  };
}

// ---------------------------------------------------------------------------
// Full package HTML renderer
// ---------------------------------------------------------------------------

/**
 * Render a ReportPackage to an HTML string for preview or export.
 * Handles all section types including the new Meta and Study sections.
 *
 * @param {import('./reportPackage.mjs').ReportPackage} pkg
 * @param {object} baseReport - the object returned by generateProjectReport(), used for construction sections
 * @returns {string}
 */
export function renderPackageHTML(pkg, baseReport = {}) {
  if (!pkg || !pkg.sections) return '';

  const esc = s => String(s ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = n => typeof n === 'number' ? n.toLocaleString() : esc(n);

  const statusBadge = s => {
    const map = {
      ok: 'badge-ok', near: 'badge-warn', over: 'badge-error',
      pass: 'badge-ok', warning: 'badge-warn', fail: 'badge-error',
      info: 'badge-info', error: 'badge-error', 'not evaluated': 'badge-info',
    };
    return `<span class="badge ${map[String(s).toLowerCase()] || ''}">${esc(s)}</span>`;
  };

  const emptySection = (title) =>
    `<p class="report-empty">No ${title.toLowerCase()} results available for this project.</p>`;

  const unavailableSection = (key, title) => `
<section class="report-section" id="rpt-${esc(key)}">
  <h2>${esc(title)}</h2>
  <p class="report-empty">This section is not available from the current project data.</p>
</section>`;

  const approvalBadgeHTML = (approval) => {
    if (!approval || !approval.status) return '';
    const cls = approval.status === 'approved' ? 'badge-ok' : approval.status === 'flagged' ? 'badge-error' : 'badge-warn';
    return `<p class="report-approval">
      <span class="badge ${cls}">${esc(approval.status.toUpperCase())}</span>
      ${approval.reviewedBy ? ` &nbsp; Reviewed by: <strong>${esc(approval.reviewedBy)}</strong>` : ''}
      ${approval.approvedAt ? ` &nbsp; Date: ${esc(approval.approvedAt)}` : ''}
      ${approval.note ? `<br><em>${esc(approval.note)}</em>` : ''}
    </p>`;
  };

  const assumptionsHTML = text => String(text || '')
    .split(/\n{2,}/)
    .map(block => block.split(/\r?\n/).map(line => line.trim()).filter(Boolean))
    .filter(lines => lines.length)
    .map(lines => {
      if (lines.length === 1) return `<p>${esc(lines[0].replace(/^[-*]\s*/, ''))}</p>`;
      const heading = lines[0].endsWith(':') ? lines.shift().slice(0, -1) : '';
      return `<div class="report-assumption-group">
        ${heading ? `<h3>${esc(heading)}</h3>` : ''}
        <ul>${lines.map(line => `<li>${esc(line.replace(/^[-*]\s*/, ''))}</li>`).join('')}</ul>
      </div>`;
    })
    .join('');

  const sections = pkg.sections;
  const cover    = sections.cover?.data || pkg.config?.coverSheet || {};
  const orderedKeys = pkg.config?.sections || Object.keys(sections);

  let html = '';

  // ── Cover sheet ───────────────────────────────────────────────────────────
  if (sections.cover) {
    html += `
<header class="report-cover report-section" id="rpt-cover">
  <h1 class="report-title">${esc(cover.projectName)}</h1>
  ${cover.client   ? `<p class="report-cover-field"><strong>Client:</strong> ${esc(cover.client)}</p>` : ''}
  ${cover.engineer ? `<p class="report-cover-field"><strong>Engineer:</strong> ${esc(cover.engineer)}${cover.license ? ` &nbsp;·&nbsp; License: ${esc(cover.license)}` : ''}</p>` : ''}
  <p class="report-cover-field"><strong>Date:</strong> ${esc(cover.date)} &nbsp;·&nbsp; <strong>Rev:</strong> ${esc(cover.revisionNumber)}</p>
  ${cover.notes    ? `<p class="report-cover-notes">${esc(cover.notes)}</p>` : ''}
  <p class="report-meta">Generated ${new Date(pkg.generatedAt).toLocaleString()}</p>
</header>`;
  }

  // ── Table of contents ─────────────────────────────────────────────────────
  if (sections.toc) {
    const entries = sections.toc.entries || [];
    html += `
<nav class="report-section report-toc-section" id="rpt-toc" aria-label="Table of contents">
  <h2>Table of Contents</h2>
  <ol class="report-toc-list">
    ${entries.map(e => `<li><a href="#rpt-${esc(e.key)}">${esc(e.label)}</a></li>`).join('\n    ')}
  </ol>
</nav>`;
  }

  // ── Revision history ──────────────────────────────────────────────────────
  if (sections.revisions) {
    const rows = sections.revisions.rows || [];
    html += `
<section class="report-section" id="rpt-revisions">
  <h2>Revision History</h2>
  ${rows.length === 0 ? '<p class="report-empty">No revisions recorded.</p>' : `
  <table class="report-table">
    <thead><tr><th>Rev</th><th>Date</th><th>Description</th><th>By</th></tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td>${esc(r.rev)}</td><td>${esc(r.date)}</td><td>${esc(r.description)}</td><td>${esc(r.by)}</td>
    </tr>`).join('')}</tbody>
  </table>`}
</section>`;
  }

  // ── Assumptions ───────────────────────────────────────────────────────────
  if (sections.assumptions) {
    const text = sections.assumptions.text || '';
    html += `
<section class="report-section" id="rpt-assumptions">
  <h2>Assumptions / Basis of Design</h2>
  ${text ? `<div class="report-assumptions">${assumptionsHTML(text)}</div>` : '<p class="report-empty">No assumptions recorded.</p>'}
</section>`;
  }

  // ── Construction sections (delegate to existing baseReport data) ──────────
  const br = baseReport;

  if (sections.cables && br.cables) {
    const { cables } = br;
    html += `
<section class="report-section" id="rpt-cables">
  <h2>Cable Schedule</h2>
  ${cables.summary.issueReady ? '<p class="report-readiness-note report-readiness-note--ready">Issue-ready fields complete.</p>' : `<p class="report-readiness-note report-readiness-note--warning">Not issue-ready: ${fmt(cables.summary.missingInsulation)} cable(s) need insulation type and ${fmt(cables.summary.missingVoltage)} cable(s) need voltage rating.</p>`}
  <p class="report-note">${fmt(cables.summary.routed)} routed &nbsp;·&nbsp; ${fmt(cables.summary.unrouted)} unrouted &nbsp;·&nbsp; ${fmt(cables.summary.totalLengthFt)} ft total</p>
  <div class="report-scroll"><table class="report-table">
    <thead><tr><th>ID</th><th>From</th><th>To</th><th>Size</th><th>Insulation</th><th>Voltage</th><th>Length (ft)</th><th>Raceway</th></tr></thead>
    <tbody>${cables.rows.map(r => `<tr>
      <td>${esc(r.id)}</td><td>${esc(r.from)}</td><td>${esc(r.to)}</td>
      <td>${esc(r.size)}</td><td>${esc(r.insulation)}</td><td>${esc(r.voltage)}</td>
      <td>${fmt(r.lengthFt)}</td><td>${esc(r.raceway)}</td>
    </tr>`).join('')}</tbody>
  </table></div>
</section>`;
  } else if (sections.cables) {
    html += unavailableSection('cables', sections.cables.title || 'Cable Schedule');
  }

  if (sections.fill && br.fill) {
    const { fill } = br;
    html += `
<section class="report-section" id="rpt-fill">
  <h2>Raceway Fill Analysis</h2>
  <p class="report-note">${fmt(fill.summary.overCount)} over limit &nbsp;·&nbsp; ${fmt(fill.summary.nearCount)} near limit</p>
  <div class="report-scroll"><table class="report-table">
    <thead><tr><th>Raceway</th><th>Type</th><th>Area (in²)</th><th>Fill (in²)</th><th>Used %</th><th>Limit %</th><th>Status</th></tr></thead>
    <tbody>
    ${[...fill.trays, ...fill.conduits].map(r => `<tr>
      <td>${esc(r.id)}</td><td>${esc(r.type)}</td>
      <td>${fmt(r.areaIn2)}</td><td>${fmt(r.fillIn2)}</td>
      <td>${fmt(r.usedPct)}</td><td>${fmt(r.limitPct)}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>`).join('')}
    </tbody>
  </table></div>
</section>`;
  } else if (sections.fill) {
    html += unavailableSection('fill', sections.fill.title || 'Raceway Fill');
  }

  if (sections.clashes && br.clashes) {
    const { clashes } = br;
    html += `
<section class="report-section" id="rpt-clashes">
  <h2>Clash Detection</h2>
  <p class="report-note">Overall severity: ${statusBadge(clashes.severity)} &nbsp;·&nbsp; ${fmt(clashes.stats.hardClashes)} hard &nbsp;·&nbsp; ${fmt(clashes.stats.softClashes)} soft</p>
  ${clashes.clashes.length === 0 ? '<p class="report-empty">No clashes detected.</p>' : `
  <div class="report-scroll"><table class="report-table">
    <thead><tr><th>Tray A</th><th>Tray B</th><th>Severity</th><th>Min Gap (ft)</th><th>Description</th></tr></thead>
    <tbody>${clashes.clashes.map(c => `<tr>
      <td>${esc(c.trayA)}</td><td>${esc(c.trayB)}</td>
      <td>${statusBadge(c.severity)}</td><td>${fmt(c.minGapFt)}</td><td>${esc(c.description)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`}
</section>`;
  } else if (sections.clashes) {
    html += unavailableSection('clashes', sections.clashes.title || 'Clash Detection');
  }

  if (sections.spools && br.spools) {
    const { spools } = br;
    html += `
<section class="report-section" id="rpt-spools">
  <h2>Spool Sheets Summary</h2>
  <p class="report-note">${fmt(spools.summary.spoolCount)} spools &nbsp;·&nbsp; ${fmt(spools.summary.totalLengthFt)} ft total</p>
  <div class="report-scroll"><table class="report-table">
    <thead><tr><th>Spool</th><th>Trays</th><th>Length (ft)</th><th>Width (in)</th><th>Sections</th><th>Brackets</th><th>Weight (lbs)</th><th>Cables</th></tr></thead>
    <tbody>${spools.spools.map(s => `<tr>
      <td>${esc(s.spoolId)}</td><td>${fmt(s.trayCount)}</td>
      <td>${fmt(s.totalLengthFt)}</td><td>${fmt(s.width_in)}</td>
      <td>${fmt(s.straightSections)}</td><td>${fmt(s.bracketCount)}</td>
      <td>${fmt(s.estimatedWeight)}</td><td>${fmt(s.cables.length)}</td>
    </tr>`).join('')}</tbody>
  </table></div>
</section>`;
  } else if (sections.spools) {
    html += unavailableSection('spools', sections.spools.title || 'Spool Sheets');
  }

  if (sections.drc && !sections.drc.unavailable) {
    const { drc } = sections;
    html += `
<section class="report-section" id="rpt-drc">
  <h2>Design Rule Check</h2>
  ${drc.pass ? '<p class="report-empty">No DRC errors — all rules passed.</p>' : `<p class="report-note">${fmt(drc.errors)} error(s) &nbsp;·&nbsp; ${fmt(drc.warnings)} warning(s)</p>`}
  ${drc.rows && drc.rows.length ? `
  <div class="report-finding-list">
    ${drc.rows.map(r => `<article class="report-finding report-finding--${esc(r.severity)}">
      <header><strong>${esc(r.rule)}</strong>${statusBadge(r.severity)}<span>${esc(r.component)}</span></header>
      <p>${esc(r.message)}</p>
      <dl><div><dt>Remediation</dt><dd>${esc(r.remediation)}</dd></div><div><dt>Accepted</dt><dd>${esc(r.accepted)}</dd></div></dl>
    </article>`).join('')}
  </div>` : ''}
</section>`;
  } else if (sections.drc) {
    html += unavailableSection('drc', sections.drc.title || 'Design Rule Check');
  }

  // ── Study sections ────────────────────────────────────────────────────────

  if (sections.arcFlash) {
    const s = sections.arcFlash;
    html += `
<section class="report-section" id="rpt-arcFlash">
  <h2>Arc Flash Study</h2>
  ${approvalBadgeHTML(s.approval)}
  ${s.empty ? emptySection('Arc Flash') : `
  <div class="report-scroll"><table class="report-table">
    <thead><tr><th>Bus / Component</th><th>Incident Energy (cal/cm²)</th><th>PPE Selection</th><th>Boundary (mm)</th><th>Clearing Time (s)</th><th>Voltage</th></tr></thead>
    <tbody>${(s.rows || []).map(r => `<tr>
      <td>${esc(r.id)}</td><td>${fmt(r.incidentEnergy)}</td><td>${esc(r.ppeSelection)}</td>
      <td>${fmt(r.boundary)}</td><td>${fmt(r.clearingTime)}</td><td>${fmt(r.voltage)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`}
</section>`;
  }

  if (sections.shortCircuit) {
    const s = sections.shortCircuit;
    const summaryHtml = s.summary ? `
  <dl class="report-summary-list">
    ${s.summary.status != null ? `<div><dt>Status</dt><dd>${esc(s.summary.status)}</dd></div>` : ''}
    ${s.summary.availableFaultKa != null ? `<div><dt>Available fault current</dt><dd>${fmt(s.summary.availableFaultKa)} kA</dd></div>` : ''}
    ${s.summary.updatedAt != null ? `<div><dt>Updated</dt><dd>${esc(s.summary.updatedAt)}</dd></div>` : ''}
  </dl>` : '';
    html += `
<section class="report-section" id="rpt-shortCircuit">
  <h2>Short Circuit Analysis</h2>
  ${approvalBadgeHTML(s.approval)}
  ${s.empty ? emptySection('Short Circuit') : `${summaryHtml}
  ${(s.rows || []).length ? `
  <div class="report-scroll"><table class="report-table">
    <thead><tr><th>Bus</th><th>3-Phase (kA)</th><th>SLG (kA)</th><th>L-L (kA)</th><th>DLG (kA)</th><th>Voltage</th></tr></thead>
    <tbody>${(s.rows || []).map(r => `<tr>
      <td>${esc(r.id)}</td><td>${fmt(r.i3ph_kA)}</td><td>${fmt(r.iSlg_kA)}</td>
      <td>${fmt(r.iLL_kA)}</td><td>${fmt(r.iDLG_kA)}</td><td>${fmt(r.voltage)}</td>
    </tr>`).join('')}</tbody>
  </table></div>` : ''}`}
</section>`;
  }

  if (sections.loadFlow) {
    const s = sections.loadFlow;
    html += `
<section class="report-section" id="rpt-loadFlow">
  <h2>Load Flow Analysis</h2>
  ${approvalBadgeHTML(s.approval)}
  ${s.empty ? emptySection('Load Flow') : `
  <h3>Bus Results</h3>
  <div class="report-scroll"><table class="report-table">
    <thead><tr><th>Bus</th><th>Voltage (pu)</th><th>Voltage (kV)</th><th>Angle (°)</th><th>Load (kW)</th><th>Load (kVAR)</th></tr></thead>
    <tbody>${(s.busRows || []).map(r => `<tr>
      <td>${esc(r.id)}</td><td>${fmt(r.voltagePu)}</td><td>${fmt(r.voltageKv)}</td>
      <td>${fmt(r.angleDeg)}</td><td>${fmt(r.loadKW)}</td><td>${fmt(r.loadKVAR)}</td>
    </tr>`).join('')}</tbody>
  </table></div>
  ${(s.branchRows || []).length ? `
  <h3>Branch Flows</h3>
  <div class="report-scroll"><table class="report-table">
    <thead><tr><th>Branch</th><th>From Bus</th><th>To Bus</th><th>Flow (kW)</th><th>Flow (kVAR)</th><th>Loading (%)</th></tr></thead>
    <tbody>${s.branchRows.map(r => `<tr>
      <td>${esc(r.id)}</td><td>${esc(r.fromBus)}</td><td>${esc(r.toBus)}</td>
      <td>${fmt(r.flowKW)}</td><td>${fmt(r.flowKVAR)}</td><td>${fmt(r.loading_pct)}</td>
    </tr>`).join('')}</tbody>
  </table></div>` : ''}`}
</section>`;
  }

  if (sections.harmonics) {
    const s = sections.harmonics;
    html += `
<section class="report-section" id="rpt-harmonics">
  <h2>Harmonics Analysis</h2>
  ${approvalBadgeHTML(s.approval)}
  ${s.empty ? emptySection('Harmonics') : `
  <div class="report-scroll"><table class="report-table">
    <thead><tr><th>Component</th><th>ITHD (%)</th><th>VTHD (%)</th><th>Reference threshold (%)</th><th>Status</th><th>Basis</th></tr></thead>
    <tbody>${(s.rows || []).map(r => `<tr>
      <td>${esc(r.id)}</td><td>${fmt(r.ithd)}</td><td>${fmt(r.vthd)}</td>
      <td>${fmt(r.limit)}</td><td>${esc(r.warning)}</td><td>${esc(r.calculationStatus)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`}
</section>`;
  }

  if (sections.motorStart) {
    const s = sections.motorStart;
    html += `
<section class="report-section" id="rpt-motorStart">
  <h2>Motor Starting Study</h2>
  ${approvalBadgeHTML(s.approval)}
  ${s.empty ? emptySection('Motor Starting') : `
  <div class="report-scroll"><table class="report-table">
    <thead><tr><th>Motor</th><th>Inrush (kA)</th><th>Voltage Sag (%)</th><th>Accel Time (s)</th><th>Start Method</th></tr></thead>
    <tbody>${(s.rows || []).map(r => `<tr>
      <td>${esc(r.id)}</td><td>${fmt(r.inrushKA)}</td><td>${fmt(r.voltageSagPct)}</td>
      <td>${fmt(r.accelTime)}</td><td>${esc(r.method)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`}
</section>`;
  }

  if (sections.voltageDrop) {
    const s = sections.voltageDrop;
    html += `
<section class="report-section" id="rpt-voltageDrop">
  <h2>Voltage Drop Study</h2>
  ${approvalBadgeHTML(s.approval)}
  ${s.empty ? emptySection('Voltage Drop') : `
  <div class="report-scroll"><table class="report-table">
    <thead><tr><th>Cable / Circuit</th><th>From</th><th>To</th><th>Drop (%)</th><th>Drop (V)</th><th>Recommendation (%)</th><th>Status</th></tr></thead>
    <tbody>${(s.rows || []).map(r => `<tr>
      <td>${esc(r.id)}</td><td>${esc(r.from)}</td><td>${esc(r.to)}</td>
      <td>${fmt(r.dropPct)}</td><td>${fmt(r.dropV)}</td><td>${fmt(r.limitPct)}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`}
</section>`;
  }

  if (sections.heatTrace && br.heatTrace) {
    const ht = br.heatTrace;
    html += `
<section class="report-section" id="rpt-heatTrace">
  <h2>Heat Trace Branch Circuit Schedule</h2>
  ${approvalBadgeHTML(ht.approval)}
  <dl class="report-dl">
    <dt>Saved Branches</dt><dd>${fmt(ht.branchSchedule.summary.branchCount)}</dd>
    <dt>Total Required Heat Load</dt><dd>${fmt(ht.branchSchedule.summary.totalRequiredKw)} kW</dd>
    <dt>Branches Over Limit</dt><dd>${fmt(ht.branchSchedule.summary.overLimitCount)}</dd>
  </dl>
  <div class="report-scroll"><table class="report-table">
    <thead><tr><th>Branch</th><th>Status</th><th>Cable Type</th><th>Length (ft)</th><th>W/ft</th><th>Required W</th><th>Voltage</th><th>Amps</th></tr></thead>
    <tbody>${(ht.branchSchedule.rows || []).map(r => `<tr>
      <td>${esc(r.name)}</td><td>${statusBadge(r.status)}</td><td>${esc(r.heatTraceCableTypeLabel)}</td>
      <td>${fmt(r.effectiveTraceLengthFt)}</td><td>${fmt(r.selectedWPerFt)}</td>
      <td>${fmt(r.requiredWatts)}</td><td>${fmt(r.voltageV)}</td><td>${fmt(r.loadAmps)}</td>
    </tr>`).join('')}</tbody>
  </table></div>
</section>`;
  } else if (sections.heatTrace) {
    html += unavailableSection('heatTrace', sections.heatTrace.title || 'Heat Trace');
  }

  const dedicatedKeys = new Set([
    'cover', 'toc', 'revisions', 'assumptions',
    'cables', 'fill', 'clashes', 'spools', 'drc',
    'arcFlash', 'shortCircuit', 'loadFlow', 'harmonics', 'motorStart', 'voltageDrop', 'heatTrace',
  ]);
  for (const key of orderedKeys) {
    const section = sections[key];
    if (!section || dedicatedKeys.has(key)) continue;
    html += unavailableSection(key, section.title || key);
  }

  return html;
}
