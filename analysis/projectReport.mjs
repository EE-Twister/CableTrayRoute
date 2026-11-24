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
import {
  assessStudyResult,
  buildStudyContextIndex,
  decorateStudyRows,
} from './studyResultContext.mjs';
import { buildConduitCableMap, evaluateConduitFill, recordId as conduitRecordId } from './conduitFill.mjs';
import { cablesAssignedToTray, evaluateTrayFillWithCompartments, summarizeTrayFillResult } from './trayFill.mjs';
import { assessArcFlashResultPlausibility } from './arcFlashResultUnits.mjs';
import { parseTradeSize } from './pullBoxSizing.mjs';


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

const round2 = value => (Number.isFinite(value) ? +value.toFixed(2) : null);

/**
 * Report row for one tray, from the same compartment-aware NEC 392.22(A)
 * evaluation used by the Raceway Schedule. Values that cannot be evaluated are
 * reported as incomplete with the reason — never as 0 % "ok".
 */
function buildTrayFillRow(tray, cables) {
  const id = tray.tray_id || tray.id || '—';
  const type = tray.tray_type || '—';
  const widthIn = parseFloat(tray.inside_width ?? tray.width) || null;
  const assigned = cablesAssignedToTray(tray, cables);
  if (!assigned.length) {
    return { id, type, widthIn, areaIn2: null, fillIn2: null, usedPct: 0, limitPct: 100, status: 'ok', basis: 'No cables assigned', note: '' };
  }
  const evaluation = evaluateTrayFillWithCompartments(tray, assigned);
  const compartmentNote = evaluation.compartmented && evaluation.governingCompartment
    ? ` · governing: ${evaluation.governingCompartment}`
    : '';
  if (evaluation.evaluable !== true) {
    return {
      id, type, widthIn, areaIn2: null, fillIn2: null, usedPct: null, limitPct: 100,
      status: 'incomplete',
      basis: evaluation.clause || '392.22',
      note: summarizeTrayFillResult(evaluation),
    };
  }
  const usedPct = evaluation.utilizationPercent;
  const status = usedPct > 100 ? 'over' : usedPct > 90 ? 'near' : 'ok';
  // 392.22(A)(1)(a)/(A)(3)(a) limit the sum of cable diameters, not an area.
  const diameterBasis = evaluation.allowable?.smallCableAreaIn2 === undefined
    && evaluation.allowable?.cableAreaIn2 === undefined
    && Number.isFinite(evaluation.allowable?.largeCableDiameterIn);
  const note = diameterBasis
    ? `Sum of diameters ${round2(evaluation.used?.largeCableDiameterIn)} in of ${round2(evaluation.allowable?.largeCableDiameterIn)} in allowed`
    : '';
  return {
    id, type, widthIn,
    areaIn2: round2(evaluation.allowable?.smallCableAreaIn2 ?? evaluation.allowable?.cableAreaIn2),
    fillIn2: round2(evaluation.used?.smallCableAreaIn2 ?? evaluation.used?.cableAreaIn2),
    usedPct: +usedPct.toFixed(1),
    limitPct: 100,
    status,
    basis: `${evaluation.clause}${compartmentNote}`,
    note,
  };
}

function buildFillSection(trays, conduits, cables) {
  const trayRows = trays.map(tray => buildTrayFillRow(tray, cables));

  // Same NEC Chapter 9 area table and 53/31/40 % limits the Conduit Fill page uses,
  // so the report cannot disagree with the page it summarizes.
  // The cable schedule names the assigned raceway in route_preference or raceway.
  const conduitCableMap = buildConduitCableMap(
    conduits,
    cables.map(c => ({ ...c, raceway: c.raceway || c.route_preference }))
  );
  const conduitRows = conduits.map(c => {
    const id       = c.conduit_id || c.id || '—';
    const evaluation = evaluateConduitFill(c, conduitCableMap.get(conduitRecordId(c)) || []);
    const parsedTrade = parseTradeSize(c.trade_size);
    const trade    = Number.isFinite(parsedTrade) ? parsedTrade : null;
    const type     = c.type || c.conduit_type || 'Conduit';
    const limitPct = (evaluation.fillLimit ?? 0.40) * 100;
    const basis    = 'NEC Chapter 9, Table 1';
    const areaIn2  = evaluation.internalAreaIn2;
    // An unlisted type/size or a cable without a diameter leaves the fill unknown;
    // report that instead of a percentage computed from partial data.
    const missing = [];
    if (!Number.isFinite(areaIn2) || areaIn2 <= 0) missing.push('listed conduit type and trade size');
    if (evaluation.missingAreaCables?.length) missing.push(`cable diameter for ${evaluation.missingAreaCables.join(', ')}`);
    if (missing.length && evaluation.cableCount > 0) {
      return {
        id, type, tradeSizeIn: trade, areaIn2: round2(areaIn2), fillIn2: null, usedPct: null, limitPct,
        status: 'incomplete', basis, note: `Fill cannot be evaluated: missing ${missing.join('; ')}.`,
      };
    }
    const fillIn2  = evaluation.cableAreaTotalIn2 || 0;
    const usedPct  = areaIn2 > 0 ? (fillIn2 / areaIn2) * 100 : 0;
    const status   = usedPct > limitPct ? 'over' : usedPct > limitPct * 0.9 ? 'near' : 'ok';
    return { id, type, tradeSizeIn: trade, areaIn2: round2(areaIn2), fillIn2: round2(fillIn2), usedPct: +usedPct.toFixed(1), limitPct, status, basis, note: evaluation.cableCount ? '' : 'No cables assigned' };
  });

  const overCount  = [...trayRows, ...conduitRows].filter(r => r.status === 'over').length;
  const nearCount  = [...trayRows, ...conduitRows].filter(r => r.status === 'near').length;
  const incompleteCount = [...trayRows, ...conduitRows].filter(r => r.status === 'incomplete').length;

  return {
    title: 'Raceway Fill Analysis',
    trays: trayRows,
    conduits: conduitRows,
    summary: { overCount, nearCount, incompleteCount, totalRaceways: trayRows.length + conduitRows.length },
  };
}

/** Shared Raceway Fill table for both report renderers. */
function fillTableHTML(fill, { esc, fmt, statusBadge }) {
  const row = r => `<tr>
      <td>${esc(r.id)}</td><td>${esc(r.type)}</td>
      <td>${fmt(r.areaIn2)}</td><td>${fmt(r.fillIn2)}</td>
      <td>${fmt(r.usedPct)}</td><td>${fmt(r.limitPct)}</td>
      <td>${statusBadge(r.status)}</td>
      <td>${esc(r.basis)}${r.note ? `<br><span class="report-note">${esc(r.note)}</span>` : ''}</td>
    </tr>`;
  return `<p class="report-note">${fmt(fill.summary.overCount)} over limit &nbsp;·&nbsp; ${fmt(fill.summary.nearCount)} near limit &nbsp;·&nbsp; ${fmt(fill.summary.incompleteCount ?? 0)} incomplete</p>
  <div class="report-scroll"><table class="report-table">
    <thead><tr><th>Raceway</th><th>Type</th><th>Allowable (in²)</th><th>Used (in²)</th><th>Used %</th><th>Limit %</th><th>Status</th><th>Basis</th></tr></thead>
    <tbody>
    ${[...fill.trays, ...fill.conduits].map(row).join('')}
    </tbody>
  </table></div>`;
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

const HEAT_TRACE_CASE_NOT_ASSESSED = Object.freeze({
  studyKey: 'heatTraceSizing',
  validity: { state: 'unknown' },
  freshness: 'unknown',
  eligible: false,
  reasons: ['freshness_not_assessed'],
});

/**
 * Attach a lifecycle assessment to every saved branch so buildHeatTraceReport
 * withholds stale or unassessed branches from the schedule totals. When the
 * caller supplies an assessor (the browser report page does), every case is
 * re-assessed against current inputs; a previously attached assessment is only
 * trusted when no assessor is available.
 */
function assessHeatTraceCases(circuitCases, assessCase) {
  return circuitCases.map(caseItem => {
    if (!caseItem || typeof caseItem !== 'object') return caseItem;
    if (assessCase) return { ...caseItem, _lifecycleAssessment: assessCase(caseItem) || HEAT_TRACE_CASE_NOT_ASSESSED };
    if (caseItem._lifecycleAssessment) return caseItem;
    return { ...caseItem, _lifecycleAssessment: HEAT_TRACE_CASE_NOT_ASSESSED };
  });
}

function buildHeatTraceSection(studies = {}, projectName = '', approval = null, options = {}) {
  const activeResult = studies.heatTraceSizing || null;
  const savedCases = Array.isArray(studies.heatTraceSizingCircuits) ? studies.heatTraceSizingCircuits : [];
  if (!activeResult && savedCases.length === 0) return null;
  const assessCase = typeof options.assessHeatTraceCase === 'function' ? options.assessHeatTraceCase : null;
  const circuitCases = assessHeatTraceCases(savedCases, assessCase);

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
  assessHeatTraceCase = null,
} = {}) {
  return {
    generatedAt: new Date().toISOString(),
    summary:    buildSummarySection(cables, trays, conduits, ductbanks, projectName),
    cables:     buildCableSection(cables),
    fill:       buildFillSection(trays, conduits, cables),
    clashes:    buildClashSection(trays),
    spools:     buildSpoolSection(trays, cables),
    heatTrace:  buildHeatTraceSection(studies, projectName, approvals.heatTraceSizing || null, { assessHeatTraceCase }),
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
      incomplete: 'badge-warn',
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
  ${fillTableHTML(fill, { esc, fmt, statusBadge })}
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
export function buildArcFlashSection(studies = {}, approvals = {}, options = {}) {
  const data = studies.arcFlash || null;
  const approval = approvals.arcFlash || null;
  if (!data) return { key: 'arcFlash', title: 'Arc Flash Study', empty: true };
  const assessment = assessStudyResult('arcFlash', data, options.studyProvenance?.arcFlash, options);

  // data may be a flat results object keyed by bus/component ID
  const entries = Array.isArray(data)
    ? data
    : Object.entries(data)
        .filter(([k]) => !k.startsWith('_'))
        .map(([id, v]) => (typeof v === 'object' && v !== null ? { id, ...v } : { id, value: v }));

  const rows = entries.map(e => {
    // A boundary that contradicts its incident energy (typically inches read as
    // mm) is withheld as invalid rather than issued in the report.
    const plausibility = assessArcFlashResultPlausibility(e);
    if (!plausibility.plausible) {
      return {
        id:             e.equipmentTag || e.id || e.busId || '—',
        incidentEnergy: '—',
        ppeSelection:   '—',
        boundary:       '—',
        clearingTime:   '—',
        voltage:        e.voltage ?? e.nominalVoltage ?? '—',
        validity:       'invalid',
        warnings:       [...(Array.isArray(e.warnings) ? e.warnings : []), plausibility.reason],
      };
    }
    const incidentEnergy = e.incidentEnergy ?? e.incident_energy;
    const incidentEnergyNumber = Number(incidentEnergy);
    const rowEvaluated = e.validity === undefined
      ? assessment.validity === 'evaluated'
      : e.validity === 'evaluated';
    const ppeRating = Number(e.minimumArcRatingCalCm2);
    return {
      id:             e.equipmentTag || e.id || e.busId || '—',
      incidentEnergy: incidentEnergy ?? '—',
      ppeSelection:   rowEvaluated && Number.isFinite(ppeRating) && ppeRating > 0
        ? `Arc rating ≥ ${ppeRating} cal/cm²`
        : (rowEvaluated && Number.isFinite(incidentEnergyNumber) && incidentEnergyNumber <= 1.2
          ? 'Below 1.2 cal/cm² threshold' : '—'),
      boundary:       e.boundary       ?? e.arc_flash_boundary ?? '—',
      clearingTime:   e.clearingTime   ?? e.clearing_time   ?? '—',
      voltage:        e.voltage        ?? e.nominalVoltage   ?? '—',
      ...(e.validity !== undefined ? { validity: e.validity } : {}),
      ...(Array.isArray(e.warnings) ? { warnings: e.warnings } : {}),
      ...(e.assumptions !== undefined ? { assumptions: e.assumptions } : {}),
      ...(e.inputSources !== undefined ? { inputSources: e.inputSources } : {}),
    };
  });
  const metadata = {
    ...assessment,
    warnings: [...new Set([
      ...(Array.isArray(assessment.warnings) ? assessment.warnings : []),
      ...rows.flatMap(row => Array.isArray(row.warnings) ? row.warnings : []),
    ])],
  };

  return {
    key: 'arcFlash',
    title: 'Arc Flash Study',
    rows: decorateStudyRows(rows, assessment, options),
    studyMetadata: metadata,
    approval,
  };
}

/**
 * Build a short circuit section from study results.
 */
function savedProjectFingerprint(inputFingerprint) {
  const saved = String(inputFingerprint || '').trim();
  if (!saved) return null;
  const separator = saved.indexOf('|iec60909:');
  return separator >= 0 ? saved.slice(0, separator) : saved;
}

function resultFreshness(inputFingerprint, currentInputFingerprint) {
  const savedProject = savedProjectFingerprint(inputFingerprint);
  const current = String(currentInputFingerprint || '').trim();
  if (!savedProject || !current) return 'unknown';
  return savedProject === current ? 'current' : 'stale';
}

export function buildShortCircuitSection(studies = {}, approvals = {}, options = undefined) {
  options = options || {};
  const approval = approvals.shortCircuit || null;
  const rowFields = [
    'threePhaseKA', 'i3ph_kA', 'threePhase', 'symmetrical',
    'lineToGroundKA', 'iSlg_kA', 'slg',
    'lineToLineKA', 'iLL_kA', 'll',
    'doubleLineGroundKA', 'doubleLineGroundPhaseBKA', 'doubleLineGroundPhaseCKA', 'doubleLineGroundEarthKA', 'iDLG_kA', 'dlg'
  ];
  const datasets = [
    { key: 'shortCircuit', data: studies.shortCircuit, defaultMethod: null },
    { key: 'iec60909', data: studies.iec60909, defaultMethod: 'IEC 60909-0:2016' }
  ].filter(dataset => dataset.data && typeof dataset.data === 'object');
  if (!datasets.length) return { key: 'shortCircuit', title: 'Short Circuit Analysis', empty: true };

  const rows = [];
  const summaries = [];
  for (const { data, defaultMethod, key } of datasets) {
    const assessment = assessStudyResult(key, data, options.studyProvenance?.[key], options);
    const arrays = [data.results, data.buses, data.busResults].find(Array.isArray);
    let raw = Array.isArray(data) ? data : (arrays || []);
    if (!raw.length && typeof data === 'object') {
      if (rowFields.some(field => Object.prototype.hasOwnProperty.call(data, field))) {
        raw = [data];
      } else {
        raw = Object.entries(data)
          .filter(([id, value]) => !id.startsWith('_')
            && value
            && typeof value === 'object'
            && (rowFields.some(field => Object.prototype.hasOwnProperty.call(value, field))
              || value.validity !== undefined || value.calculationStatus !== undefined
              || Array.isArray(value.warnings)))
          .map(([id, value]) => ({ id, ...value }));
      }
    }
    const datasetFingerprint = data._meta?.inputFingerprint ?? null;
    const datasetCalculatedAt = data._meta?.updatedAt ?? data.updatedAt ?? data.generatedAt ?? null;
    raw.forEach(entry => {
      const e = entry && typeof entry === 'object' ? entry : { value: entry };
      const row = {
        id: e.equipmentTag || e.id || e.busId || '—',
        i3ph_kA: e.threePhaseKA ?? e.i3ph_kA ?? e.threePhase ?? e.symmetrical ?? null,
        iSlg_kA: e.lineToGroundKA ?? e.iSlg_kA ?? e.slg ?? null,
        iLL_kA: e.lineToLineKA ?? e.iLL_kA ?? e.ll ?? null,
        iDLG_kA: e.doubleLineGroundKA ?? e.iDLG_kA ?? e.dlg ?? null,
        voltage: e.prefaultKV ?? e.voltage ?? e.nominalVoltage ?? null,
      };
      if (Object.prototype.hasOwnProperty.call(e, 'doubleLineGroundPhaseBKA')) row.iDLGPhaseB_kA = e.doubleLineGroundPhaseBKA;
      if (Object.prototype.hasOwnProperty.call(e, 'doubleLineGroundPhaseCKA')) row.iDLGPhaseC_kA = e.doubleLineGroundPhaseCKA;
      if (Object.prototype.hasOwnProperty.call(e, 'doubleLineGroundEarthKA')) row.iDLGEarth_kA = e.doubleLineGroundEarthKA;
      if (Object.prototype.hasOwnProperty.call(e, 'validity')) row.validity = e.validity;
      if (Object.prototype.hasOwnProperty.call(e, 'calculationStatus')) row.calculationStatus = e.calculationStatus;
      if (Array.isArray(e.requiredInputs)) row.requiredInputs = e.requiredInputs;
      if (Array.isArray(e.warnings)) row.warnings = e.warnings;
      if (Object.prototype.hasOwnProperty.call(e, 'provenance')) row.provenance = e.provenance;
      if (Object.prototype.hasOwnProperty.call(e, 'modelLimits')) row.modelLimits = e.modelLimits;
      if (Object.prototype.hasOwnProperty.call(e, 'studyOptions')) row.studyOptions = e.studyOptions;
      if (Object.prototype.hasOwnProperty.call(e, 'inputFingerprint') || datasetFingerprint) {
        row.inputFingerprint = e.inputFingerprint ?? datasetFingerprint;
      }
      if (options !== undefined) {
        row.currentInputFingerprint = options?.currentInputFingerprint || null;
        row.freshness = resultFreshness(row.inputFingerprint, row.currentInputFingerprint);
      }
      if (Object.prototype.hasOwnProperty.call(e, 'calculatedAt') || datasetCalculatedAt) {
        row.calculatedAt = e.calculatedAt ?? datasetCalculatedAt;
      }
      if (Object.prototype.hasOwnProperty.call(e, 'method') || defaultMethod) row.method = e.method ?? defaultMethod;
      if (datasets.length > 1) row.studySource = key;
      rows.push(...decorateStudyRows([row], assessment, options));
    });
    const summary = {
      status: data.status ?? null,
      availableFaultKa: data.availableFaultKa ?? data.availableFaultKA ?? data.faultCurrentKA ?? data.faultKa ?? null,
      updatedAt: data.updatedAt ?? data.generatedAt ?? data._meta?.updatedAt ?? null,
      inputFingerprint: datasetFingerprint,
      method: data._meta?.method ?? defaultMethod
    };
    if (options !== undefined) {
      summary.currentInputFingerprint = options?.currentInputFingerprint || null;
      summary.freshness = resultFreshness(datasetFingerprint, summary.currentInputFingerprint);
    }
    if (!assessment.eligible) {
      summary.status = assessment.label;
      delete summary.availableFaultKa;
    }
    Object.keys(summary).forEach(field => {
      if (summary[field] == null || summary[field] === '') delete summary[field];
    });
    if (Object.values(summary).some(value => value != null && value !== '')) summaries.push(summary);
  }
  const summary = summaries.length === 1
    ? summaries[0]
    : summaries.length > 1
      ? {
        status: 'Multiple short-circuit study results',
        updatedAt: summaries.map(item => item.updatedAt).filter(Boolean).sort().at(-1) ?? null,
        ...(options !== undefined ? {
          currentInputFingerprint: options?.currentInputFingerprint || null,
          freshness: rows.some(row => row.freshness === 'stale')
            ? 'stale'
            : rows.some(row => row.freshness === 'unknown') ? 'unknown' : 'current'
        } : {})
      }
      : null;
  const hasSummary = Boolean(summary);

  return {
    key: 'shortCircuit',
    title: 'Short Circuit Analysis',
    rows,
    summary: hasSummary ? summary : null,
    empty: rows.length === 0 && !hasSummary,
    approval,
    studyMetadata: buildStudyContextIndex(studies, options.studyProvenance, options),
  };
}

/**
 * Build a load flow section from study results.
 */
export function buildLoadFlowSection(studies = {}, approvals = {}, options = {}) {
  const data = studies.loadFlow || null;
  const approval = approvals.loadFlow || null;
  if (!data) return { key: 'loadFlow', title: 'Load Flow Analysis', empty: true };
  const assessment = assessStudyResult('loadFlow', data, options.studyProvenance?.loadFlow, options);

  const busResults = Array.isArray(data.buses) ? data.buses
    : Array.isArray(data) ? data
    : [];

  // runLoadFlow() saves Vm/Va/voltageKV/Pd/Qd per bus and `lines` for branch
  // flows; unbalanced runs repeat each bus/line once per phase. Older
  // interchange shapes used the descriptive names, so both are accepted.
  const withPhase = (label, record) => (record?.phase && record.phase !== 'balanced' ? `${label} (${record.phase})` : label);
  const busRows = busResults.map(b => ({
    id:        withPhase(b.displayLabel || b.label || b.name || b.id || b.busId || '—', b),
    voltagePu: b.voltagePu ?? b.voltage_pu ?? b.Vm ?? '—',
    voltageKv: b.voltageKv ?? b.voltage_kv ?? b.voltageKV ?? '—',
    angleDeg:  b.angleDeg  ?? b.angle_deg  ?? b.Va ?? '—',
    loadKW:    b.loadKW    ?? b.load_kw    ?? b.Pd ?? '—',
    loadKVAR:  b.loadKVAR  ?? b.load_kvar  ?? b.Qd ?? '—',
  }));

  const branchResults = Array.isArray(data.branches) ? data.branches
    : Array.isArray(data.lines) ? data.lines
    : [];
  // Flow records carry the component id; the solver's connection summary has its tag.
  const branchLabels = new Map((data.summary?.branchConnections || [])
    .filter(conn => conn?.componentId)
    .map(conn => [conn.componentId, conn.componentLabel || conn.componentName || conn.componentRef]));
  const branchRows = branchResults.map(br => ({
    id:          withPhase(br.componentLabel || br.componentName || branchLabels.get(br.componentId ?? br.id) || br.id || br.branchId || '—', br),
    fromBus:     br.fromBus  ?? br.fromLabel ?? br.from ?? '—',
    toBus:       br.toBus    ?? br.toLabel   ?? br.to   ?? '—',
    flowKW:      br.flowKW   ?? br.flow_kw   ?? br.fromPowerKW   ?? br.P ?? '—',
    flowKVAR:    br.flowKVAR ?? br.flow_kvar ?? br.fromPowerKvar ?? br.Q ?? '—',
    loading_pct: br.loading_pct ?? br.loadingPct ?? '—',
  }));

  return {
    key: 'loadFlow',
    title: 'Load Flow Analysis',
    busRows: decorateStudyRows(busRows, assessment, options),
    branchRows: decorateStudyRows(branchRows, assessment, options),
    studyMetadata: assessment,
    approval,
  };
}

/**
 * Build a harmonics section from study results.
 */
export function buildHarmonicsSection(studies = {}, approvals = {}, options = {}) {
  const data = studies.harmonics || null;
  const approval = approvals.harmonics || null;
  if (!data) return { key: 'harmonics', title: 'Harmonics Analysis', empty: true };
  const assessment = assessStudyResult('harmonics', data, options.studyProvenance?.harmonics, options);

  const entries = Array.isArray(data?.results)
    ? data.results
    : typeof data === 'object' && !Array.isArray(data)
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

  return {
    key: 'harmonics',
    title: 'Harmonics Analysis',
    rows: decorateStudyRows(rows, assessment, options),
    studyMetadata: assessment,
    approval,
  };
}

/**
 * Build a motor starting section from study results.
 */
export function buildMotorStartSection(studies = {}, approvals = {}, options = {}) {
  const data = studies.motorStart || null;
  const approval = approvals.motorStart || null;
  if (!data) return { key: 'motorStart', title: 'Motor Starting Study', empty: true };
  const assessment = assessStudyResult('motorStart', data, options.studyProvenance?.motorStart, options);

  // The Motor Starting page saves { runAt, method, criteria, cases, results: [...] };
  // the One-Line study button saves a map of motor id -> result.
  const entries = Array.isArray(data?.results)
    ? data.results
    : Array.isArray(data)
    ? data
    : typeof data === 'object'
    ? Object.entries(data)
        .filter(([k, v]) => !k.startsWith('_') && v && typeof v === 'object' && !Array.isArray(v))
        .map(([id, v]) => ({ id, ...v }))
    : [];

  const rows = entries.map(e => ({
    id:           e.label || e.tag || e.name || e.id || '—',
    inrushKA:     e.inrushKA     ?? e.inrush_kA    ?? '—',
    voltageSagPct: e.voltageSagPct ?? e.voltage_sag_pct ?? '—',
    accelTime:    e.accelTime    ?? e.accel_time   ?? '—',
    method:       e.starterType  ?? e.method       ?? e.startMethod  ?? '—',
    status:       e.status ?? (e.ready === false ? 'inputs required' : '—'),
  }));

  return {
    key: 'motorStart',
    title: 'Motor Starting Study',
    rows: decorateStudyRows(rows, assessment, options),
    studyMetadata: assessment,
    approval,
  };
}

/**
 * Build a voltage drop section from study results.
 */
export function buildVoltageDropSection(studies = {}, approvals = {}, options = {}) {
  const data = studies.voltageDropStudy || null;
  const approval = approvals.voltageDropStudy || null;
  if (!data) return { key: 'voltageDrop', title: 'Voltage Drop Study', empty: true };
  const assessment = assessStudyResult('voltageDropStudy', data, options.studyProvenance?.voltageDropStudy, options);

  const results = Array.isArray(data.results) ? data.results
    : Array.isArray(data) ? data
    : Object.entries(data)
        .filter(([k]) => !k.startsWith('_'))
        .map(([id, v]) => (typeof v === 'object' ? { id, ...v } : { id }));

  const rows = results.map(r => {
    // The study stores the combined-path contract in `resultContract`, and the
    // row's result* metadata describes that path. Only the cable's own drop
    // columns are gated on its individual contract, so an evaluated branch is
    // not hidden just because an upstream feeder lacks inputs. Older saves
    // without `individualResultContract` fall back to the `evaluated` flag.
    const contract = r.resultContract || {};
    const legacyEvaluated = r.evaluated === true || r.validity === 'evaluated';
    const individualContract = r.individualResultContract
      || (r.pathEvaluated === false ? null : r.resultContract)
      || null;
    const evaluated = individualContract ? individualContract.validity === 'evaluated' : legacyEvaluated;
    const historicalValues = {
      dropPct: r.dropPct ?? r.drop_pct ?? null,
      dropV: r.dropV ?? r.drop_v ?? null,
      combinedDropPct: r.combinedDropPct ?? null,
      recommendation: r.recommendation?.conductorSize ?? null,
    };
    return {
    id:         r.tag      || r.id        || r.cableId || '—',
    from:       r.from     || r.source    || '—',
    to:         r.to       || r.load      || '—',
    inputSource: r.inputSource?.current || r.input_source || '—',
    path:       Array.isArray(r.pathTags) ? r.pathTags.join(' → ') : '—',
    dropPct:    evaluated ? (r.dropPct  ?? r.drop_pct  ?? '—') : '—',
    dropV:      evaluated ? (r.dropV    ?? r.drop_v    ?? '—') : '—',
    limitPct:   r.limitPct ?? r.limit_pct ?? r.limit ?? '—',
    status:     !evaluated ? 'not evaluated' : (r.status ?? (parseFloat(r.dropPct) > parseFloat(r.limitPct) ? 'fail' : 'pass')),
    combinedDropPct: r.pathEvaluated === false ? '—' : (r.combinedDropPct ?? '—'),
    combinedLimitPct: r.combinedLimitPct ?? '—',
    combinedStatus: r.pathEvaluated === false ? 'not evaluated' : (r.combinedStatus || '—'),
    recommendation: evaluated ? (r.recommendation?.conductorSize || '—') : '—',
    resultValidity: contract.validity || (r.evaluated === false ? 'unevaluated' : 'unknown'),
    resultUnits: contract.units || '%',
    resultInputSources: contract.inputSources || {},
    resultAssumptions: contract.assumptions || {},
    resultModelLimits: contract.modelLimits || {},
    resultWarnings: contract.warnings || [],
    inputFingerprint: contract.inputFingerprint || '',
    historicalValues,
    historicalValuesLabel: 'Saved values retained for audit; eligibility controls display',
  }; });

  return {
    key: 'voltageDrop',
    title: 'Voltage Drop Study',
    rows: decorateStudyRows(rows, assessment, options),
    approval,
    studyMetadata: assessment,
    readiness: advancedStudyStatus(data, 'voltageDropStudy', options),
    summary: assessment.eligible ? {
      'Evaluated cables': `${data.summary?.evaluated ?? rows.length} / ${data.summary?.total ?? rows.length}`,
      'Individual failures': data.summary?.fail ?? '—',
      'Combined path failures': data.summary?.combinedFail ?? '—',
      'Maximum individual drop (%)': data.summary?.maxDropPct ?? '—',
      'Maximum combined drop (%)': data.summary?.maxCombinedDropPct ?? '—',
      'Sizing recommendations': data.summary?.recommendations ?? '—',
    } : {
      'Result summary': assessment.label,
      'Historical summary (withheld)': JSON.stringify(data.summary || {}),
    },
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
  };
}

/**
 * Build a load-weighted reliability and minimal-cut-set section.
 */
export function buildReliabilitySection(studies = {}, approvals = {}, options = {}) {
  const data = studies.reliability || null;
  if (!data) return { key: 'reliability', title: 'Reliability Analysis', empty: true };
  const assessment = assessStudyResult('reliability', data, options.studyProvenance?.reliability, options);
  const rows = (data.servicePoints || []).map(point => ({
    id: point.label || point.id || '—',
    kw: point.kw ?? '—',
    critical: point.critical === true ? 'yes' : 'no',
    availabilityPct: Number.isFinite(Number(point.availability))
      ? Number(point.availability) * 100
      : '—',
    outageHours: point.expectedOutageHours ?? '—',
    interruptionsPerYear: point.interruptionFrequencyPerYear ?? '—',
    eensKwh: point.eensKwh ?? '—',
  }));
  const cutSets = [...(data.n1Impacts || []), ...(data.n2Impacts || [])].map(impact => ({
    order: `N-${impact.failed?.length || 0}`,
    failed: (impact.failed || []).join(' + ') || '—',
    impacted: (impact.impactedServicePoints || [])
      .map(point => point.label || point.id)
      .join('; ') || (impact.impacted || []).join('; ') || '—',
    impactedKw: impact.impactedKw ?? '—',
    criticalKw: impact.criticalKw ?? '—',
    probability: impact.probability ?? '—',
  }));
  const reliabilitySummary = {
    'System availability (%)': data.systemAvailability != null && Number.isFinite(Number(data.systemAvailability))
      ? Number(data.systemAvailability) * 100
      : '—',
    'Load-weighted service availability (%)': data.serviceAvailability != null && Number.isFinite(Number(data.serviceAvailability))
      ? Number(data.serviceAvailability) * 100
      : '—',
    'Served load (kW)': data.totalServedKw ?? '—',
    'EENS (kWh/yr)': data.eensKwh ?? '—',
    'Critical-load EENS (kWh/yr)': data.criticalLoadEensKwh ?? '—',
    'Load-weighted outage (hr/yr)': data.serviceInterruptionHours ?? '—',
    'Reliability source coverage (%)': data.sourceCoveragePct ?? '—',
  };
  return {
    key: 'reliability',
    title: 'Reliability Analysis',
    headers: [
      { key: 'id', label: 'Service Point' },
      { key: 'kw', label: 'Load (kW)' },
      { key: 'critical', label: 'Critical' },
      { key: 'availabilityPct', label: 'Availability (%)' },
      { key: 'outageHours', label: 'Outage (hr/yr)' },
      { key: 'interruptionsPerYear', label: 'Interruptions/yr' },
      { key: 'eensKwh', label: 'EENS (kWh/yr)' },
    ],
    rows: decorateStudyRows(rows, assessment, options),
    // Cut sets are results of the same study, so they are withheld with it.
    cutSets: decorateStudyRows(cutSets, assessment, { ...options, preserve: ['order', 'failed'] }),
    summary: assessment.eligible ? reliabilitySummary : {
      'Result summary': assessment.label,
      'Historical summary (withheld)': JSON.stringify(reliabilitySummary),
    },
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
    readiness: advancedStudyStatus(data, 'reliability', options),
    studyMetadata: assessment,
    approval: approvals.reliability || null,
  };
}

function advancedStudyStatus(data, studyKey = '', options = {}) {
  const metadata = data?.runMetadata || {};
  const assessment = assessStudyResult(
    studyKey,
    data,
    options.studyProvenance?.[studyKey],
    options,
  );
  return {
    ...assessment,
    valid: assessment.eligible,
    validityLabel: assessment.label,
    source: metadata.source || assessment.provenance?.source || 'not recorded',
    runAt: assessment.runAt,
    convergence: metadata.convergence?.message || null,
  };
}

function advancedSection({ key, title, data, approvals, headers, rows, summary = {}, warnings = [], options = {} }) {
  if (!data) return { key, title, empty: true };
  const assessment = assessStudyResult(key, data, options.studyProvenance?.[key], options);
  const visibleSummary = assessment.eligible
    ? summary
    : {
      'Result summary': assessment.label,
      'Historical summary (withheld)': JSON.stringify(summary),
    };
  return {
    key,
    title,
    headers,
    rows: decorateStudyRows(rows, assessment, options),
    summary: visibleSummary,
    warnings: Array.isArray(warnings) ? warnings : [],
    readiness: advancedStudyStatus(data, key, options),
    studyMetadata: assessment,
    approval: approvals[key] || null,
  };
}

export function buildAdvancedStudySections(studies = {}, approvals = {}, options = {}) {
  const qd = studies.quasiDynamic;
  const probabilistic = studies.probabilisticLoadFlow;
  const contingency = studies.contingency;
  const voltage = studies.voltageStability;
  const frequency = studies.frequencyScan;
  const transient = studies.transientStability;
  const opf = studies.optimalPowerFlow;
  const cyber = studies.cyberCompliance;

  const withOptions = value => ({ ...value, options });

  return {
    quasiDynamic: advancedSection(withOptions({
      key: 'quasiDynamic',
      title: 'Quasi-Dynamic Load Flow',
      data: qd,
      approvals,
      headers: [
        { key: 'bus', label: 'Bus' }, { key: 'minVm', label: 'Min V (pu)' },
        { key: 'maxVm', label: 'Max V (pu)' }, { key: 'risk', label: 'Envelope Status' },
      ],
      rows: (qd?.busEnvelope || []).map(row => ({
        bus: row.label || row.id || 'â€”',
        minVm: row.minVm,
        maxVm: row.maxVm,
        risk: [row.minRisk, row.maxRisk].includes('fail') ? 'fail'
          : ([row.minRisk, row.maxRisk].includes('warn') ? 'warning' : 'pass'),
      })),
      summary: qd ? {
        'Converged timesteps': `${qd.convergedCount ?? 0} / ${qd.timestepCount ?? 0}`,
        'Voltage violations': (qd.overVoltageCount || 0) + (qd.underVoltageCount || 0),
        'Energy loss (kWh)': qd.totalEnergyLossKwh,
        'Load factor': qd.loadFactor,
      } : {},
      warnings: qd?.warnings,
    })),
    probabilisticLoadFlow: advancedSection(withOptions({
      key: 'probabilisticLoadFlow',
      title: 'Probabilistic Load Flow',
      data: probabilistic,
      approvals,
      headers: [
        { key: 'bus', label: 'Bus' }, { key: 'mean', label: 'Mean V (pu)' },
        { key: 'p05', label: 'P5 V (pu)' }, { key: 'min', label: 'Minimum V (pu)' },
        { key: 'pUnder', label: 'P(V < 0.95)' }, { key: 'pOver', label: 'P(V > 1.05)' },
      ],
      rows: (probabilistic?.busStats || []).map(row => ({
        bus: row.label || row.id || 'â€”',
        mean: row.mean,
        p05: row.p05,
        min: row.min,
        pUnder: row.pUnder,
        pOver: row.pOver,
      })),
      summary: probabilistic ? {
        'Converged scenarios': `${probabilistic.convergedCount ?? 0} / ${probabilistic.sampleCount ?? 0}`,
        'Probability of voltage violation': probabilistic.probabilityOfViolation,
        'Mean loss (kW)': probabilistic.lossStats?.mean,
        'P95 loss (kW)': probabilistic.lossStats?.p95,
      } : {},
      warnings: probabilistic?.warnings,
    })),
    contingency: advancedSection(withOptions({
      key: 'contingency',
      title: 'N-1 Contingency',
      data: contingency,
      approvals,
      headers: [
        { key: 'branch', label: 'Outaged Branch' }, { key: 'type', label: 'Type' },
        { key: 'converged', label: 'Converged' }, { key: 'violations', label: 'Violations' },
        { key: 'status', label: 'Status' }, { key: 'transient', label: 'Transient Screen' },
      ],
      rows: (contingency?.contingencies || []).map(row => ({
        branch: row.branchName || row.branchId || 'â€”',
        type: row.branchType || 'â€”',
        converged: row.converged ? 'Yes' : 'No',
        violations: (row.violations || []).length,
        status: row.critical ? 'critical' : 'pass',
        transient: row.transientStability?.checked
          ? (row.transientStability.stable ? 'stable' : 'unstable') : 'not checked',
      })),
      summary: contingency?.summary || {},
      warnings: contingency?.warnings,
    })),
    voltageStability: advancedSection(withOptions({
      key: 'voltageStability',
      title: 'Voltage Stability',
      data: voltage,
      approvals,
      headers: [
        { key: 'targetBus', label: 'Target Bus' }, { key: 'operatingLoadMw', label: 'Operating Load (MW)' },
        { key: 'maxLoadMw', label: 'Max Converged Load (MW)' }, { key: 'marginMw', label: 'Margin (MW)' },
        { key: 'marginPct', label: 'Margin (%)' }, { key: 'reactiveMargin', label: 'Reactive Margin (MVAR)' },
      ],
      rows: voltage ? [{
        targetBus: voltage.summary?.targetBusId || 'â€”',
        operatingLoadMw: voltage.summary?.operatingLoadMW,
        maxLoadMw: voltage.summary?.maxLoadMW,
        marginMw: voltage.summary?.loadabilityMarginMW,
        marginPct: voltage.summary?.loadabilityMarginPct,
        reactiveMargin: voltage.summary?.reactiveMarginMvar,
      }] : [],
      summary: voltage ? {
        'P-V converged points': voltage.summary?.pvPointCount,
        'Q-V converged points': voltage.summary?.qvPointCount,
        'Solver boundary encountered': voltage.summary?.solverLimitEncountered ? 'Yes' : 'No',
      } : {},
      warnings: voltage?.warnings,
    })),
    frequencyScan: advancedSection(withOptions({
      key: 'frequencyScan',
      title: 'Frequency Scan',
      data: frequency,
      approvals,
      headers: [
        { key: 'order', label: 'Harmonic Order' }, { key: 'frequencyHz', label: 'Frequency (Hz)' },
        { key: 'impedance', label: 'Impedance (ohm)' }, { key: 'type', label: 'Type' },
        { key: 'risk', label: 'Risk' },
      ],
      rows: (frequency?.resonances || []).map(row => ({
        order: row.h,
        frequencyHz: row.freqHz,
        impedance: row.zMagOhm,
        type: row.type,
        risk: row.risk,
      })),
      summary: frequency ? {
        'Scan points': frequency.points?.length || 0,
        'Detected resonances': frequency.resonances?.length || 0,
        'System voltage (kV)': frequency.inputs?.systemKv,
        'Short-circuit MVA': frequency.inputs?.scMva,
      } : {},
      warnings: frequency?.warnings,
    })),
    transientStability: advancedSection(withOptions({
      key: 'transientStability',
      title: 'Transient Stability',
      data: transient,
      approvals,
      headers: [
        { key: 'status', label: 'Stability' }, { key: 'clearingTime', label: 'Clearing Time (s)' },
        { key: 'maxAngle', label: 'Max Rotor Angle (deg)' }, { key: 'cct', label: 'Numerical CCT (s)' },
        { key: 'cctCycles', label: 'CCT (cycles)' },
      ],
      rows: transient ? [{
        status: transient.simulation?.stable ? 'stable' : 'unstable',
        clearingTime: transient.inputs?.t_clear,
        maxAngle: transient.simulation?.deltaMax_deg,
        cct: transient.cct?.cct_s,
        cctCycles: transient.cct?.cct_cycles,
      }] : [],
      summary: transient ? {
        'Inertia H (s)': transient.inputs?.H,
        'Mechanical power (pu)': transient.inputs?.Pm,
        'Pre-fault Pmax (pu)': transient.inputs?.Pmax_pre,
        'Post-fault Pmax (pu)': transient.inputs?.Pmax_post,
      } : {},
      warnings: transient?.warnings,
    })),
    optimalPowerFlow: advancedSection(withOptions({
      key: 'optimalPowerFlow',
      title: 'Optimal Power Flow',
      data: opf,
      approvals,
      headers: [
        { key: 'unit', label: 'Unit' }, { key: 'output', label: 'Output (MW)' },
        { key: 'loading', label: 'Loading (%)' }, { key: 'incrementalCost', label: 'Incremental Cost ($/MWh)' },
        { key: 'cost', label: 'Cost ($/h)' }, { key: 'limit', label: 'Limit Status' },
      ],
      rows: (opf?.dispatch || []).map(row => ({
        unit: row.name || row.id || 'â€”',
        output: row.output,
        loading: row.loadingPct,
        incrementalCost: row.incrementalCost,
        cost: row.cost,
        limit: row.atLimit || 'marginal',
      })),
      summary: opf ? {
        'Demand (MW)': opf.demandMW,
        'Required generation (MW)': opf.requiredGenMW,
        'Total cost ($/h)': opf.totalCostPerHr,
        'System lambda ($/MWh)': opf.systemLambda,
        'Feasible': opf.feasible ? 'Yes' : 'No',
      } : {},
      warnings: opf?.warnings,
    })),
    cyberCompliance: advancedSection(withOptions({
      key: 'cyberCompliance',
      title: 'Cyber Compliance Evidence Matrix',
      data: cyber,
      approvals,
      headers: [
        { key: 'asset', label: 'Asset' }, { key: 'standard', label: 'Standard' },
        { key: 'control', label: 'Control' }, { key: 'status', label: 'Status' }, { key: 'detail', label: 'Evidence / Action' },
      ],
      rows: (cyber?.assessments || []).flatMap(assessment => (assessment.checks || []).map(item => ({
        asset: assessment.asset?.id || '—', standard: item.standard, control: item.title, status: item.status, detail: item.detail,
      }))),
      summary: cyber?.summary || {},
    })),
  };
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
      info: 'badge-info', error: 'badge-error', 'not evaluated': 'badge-info', incomplete: 'badge-warn',
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

  const jsonText = value => {
    if (value == null || value === '') return 'Not recorded';
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch (_) { return String(value); }
  };
  const listText = value => Array.isArray(value)
    ? (value.join('; ') || 'None recorded')
    : jsonText(value);
  const studyMetadataHTML = metadata => {
    if (!metadata) return '';
    const warnings = Array.isArray(metadata.warnings)
      ? metadata.warnings.join('; ')
      : jsonText(metadata.warnings);
    return `<div class="report-study-metadata">
      <strong>Result status:</strong> ${esc(metadata.label || 'Freshness unknown')}
      &nbsp;·&nbsp; <strong>Validity:</strong> ${esc(metadata.validity || 'unevaluated')}
      &nbsp;·&nbsp; <strong>Freshness:</strong> ${esc(metadata.freshness || 'unknown')}
      &nbsp;·&nbsp; <strong>Eligibility:</strong> ${esc(metadata.eligible ? 'eligible' : 'withheld')}
      <details class="report-detail"><summary>Saved result context</summary><dl class="report-summary-list">
        <div><dt>Input fingerprint</dt><dd>${esc(metadata.sourceFingerprint || 'Not recorded')}</dd></div>
        <div><dt>Current input fingerprint</dt><dd>${esc(metadata.currentInputFingerprint || 'Not recorded')}</dd></div>
        <div><dt>Calculation version</dt><dd>${esc(metadata.calculationVersion || 'Not recorded')} (${esc(metadata.calculationVersionStatus || 'unknown')})</dd></div>
        <div><dt>Calculated at</dt><dd>${esc(metadata.runAt || 'Not recorded')}</dd></div>
        <div><dt>Input sources</dt><dd>${esc(jsonText(metadata.inputSources))}</dd></div>
        <div><dt>Source record</dt><dd>${esc(jsonText(metadata.source))}</dd></div>
        <div><dt>Input source</dt><dd>${esc(jsonText(metadata.inputSource))}</dd></div>
        <div><dt>Assumptions</dt><dd>${esc(jsonText(metadata.assumptions))}</dd></div>
        <div><dt>Model limits</dt><dd>${esc(jsonText(metadata.modelLimits))}</dd></div>
        <div><dt>Limitations</dt><dd>${esc(jsonText(metadata.limitations))}</dd></div>
        <div><dt>Expected units</dt><dd>${esc(jsonText(metadata.units))}</dd></div>
        <div><dt>Evidence class</dt><dd>${esc(metadata.evidenceClass || 'Not recorded')}</dd></div>
        <div><dt>Independent derivation</dt><dd>${esc(jsonText(metadata.independentDerivation))}</dd></div>
        <div><dt>Warnings</dt><dd>${esc(warnings || 'None recorded')}</dd></div>
        <div><dt>Study options</dt><dd>${esc(jsonText(metadata.studyOptions))}</dd></div>
        <div><dt>Provenance</dt><dd>${esc(jsonText(metadata.provenance))}</dd></div>
      </dl></details>
    </div>`;
  };

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

  const studyIndexRows = Object.values(pkg.studyContextIndex || {});
  if (studyIndexRows.length) {
    html += `
<section class="report-section" id="rpt-study-index">
  <h2>Study Result Lifecycle Index</h2>
  <p class="report-note">Every stored study key is listed with its validity and source freshness. Ineligible values remain withheld in the detailed sections.</p>
  <div class="report-scroll"><table class="report-table">
    <thead><tr><th>Study</th><th>Present</th><th>Validity</th><th>Freshness</th><th>Eligibility</th><th>Status</th><th>Calculation Version</th><th>Calculated At</th><th>Source</th><th>Input Sources</th><th>Assumptions</th><th>Limitations</th><th>Expected Units</th><th>Study Options</th><th>Warnings</th></tr></thead>
    <tbody>${studyIndexRows.map(row => `<tr>
      <td>${esc(row.studyKey)}</td><td>${esc(row.present ? 'Yes' : 'No')}</td><td>${esc(row.validity || 'unevaluated')}</td>
      <td>${esc(row.freshness || 'unknown')}</td><td>${esc(row.eligible ? 'eligible' : 'withheld')}</td>
      <td>${esc(row.label || 'Freshness unknown')}</td><td>${esc(row.calculationVersion || 'Not recorded')}</td>
      <td>${esc(row.runAt || 'Not recorded')}</td><td>${esc(jsonText(row.source))}</td>
      <td>${esc(jsonText(row.inputSources))}</td><td>${esc(jsonText(row.assumptions))}</td>
      <td>${esc(jsonText(row.limitations))}</td><td>${esc(jsonText(row.units))}</td>
      <td>${esc(jsonText(row.studyOptions))}</td><td>${esc(jsonText(row.warnings))}</td>
    </tr>`).join('')}</tbody>
  </table></div>
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
  ${fillTableHTML(fill, { esc, fmt, statusBadge })}
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
  ${studyMetadataHTML(s.studyMetadata)}
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
  ${studyMetadataHTML(s.studyMetadata?.shortCircuit || s.studyMetadata?.iec60909)}
  ${s.empty ? emptySection('Short Circuit') : `${summaryHtml}
  ${(s.rows || []).length ? `
   <div class="report-scroll"><table class="report-table">
     <thead><tr><th>Bus</th><th>Method</th><th>3-Phase (kA)</th><th>SLG (kA)</th><th>L-L (kA)</th><th>DLG max (kA)</th><th>DLG phase B (kA)</th><th>DLG phase C (kA)</th><th>DLG earth (kA)</th><th>Voltage (kV)</th><th>Validity</th><th>Calculation status</th></tr></thead>
     <tbody>${(s.rows || []).map(r => `<tr>
       <td>${esc(r.id)}</td><td>${esc(r.method || '')}</td><td>${fmt(r.i3ph_kA)}</td><td>${fmt(r.iSlg_kA)}</td>
       <td>${fmt(r.iLL_kA)}</td><td>${fmt(r.iDLG_kA)}</td><td>${fmt(r.iDLGPhaseB_kA)}</td><td>${fmt(r.iDLGPhaseC_kA)}</td><td>${fmt(r.iDLGEarth_kA)}</td><td>${fmt(r.voltage)}</td>
       <td>${esc(r.validity || '')}</td><td>${esc(r.calculationStatus || '')}</td>
     </tr>`).join('')}</tbody>
   </table></div>
   ${(s.rows || []).map(r => `<details class="report-detail"><summary>${esc(r.id)} calculation contract</summary><dl class="report-summary-list">
     <div><dt>Required inputs</dt><dd>${esc(listText(r.requiredInputs))}</dd></div>
     <div><dt>Warnings</dt><dd>${esc(listText(r.warnings))}</dd></div>
     <div><dt>Input provenance</dt><dd>${esc(JSON.stringify(r.provenance || {}))}</dd></div>
     <div><dt>Model limits</dt><dd>${esc(JSON.stringify(r.modelLimits || {}))}</dd></div>
     <div><dt>Study options</dt><dd>${esc(JSON.stringify(r.studyOptions || {}))}</dd></div>
     <div><dt>Input fingerprint</dt><dd>${esc(r.inputFingerprint || 'Not recorded')}</dd></div>
     <div><dt>Current input fingerprint</dt><dd>${esc(r.currentInputFingerprint || 'Not recorded')}</dd></div>
     <div><dt>Freshness</dt><dd>${esc(r.freshness || 'unknown')}</dd></div>
     <div><dt>Calculated at</dt><dd>${esc(r.calculatedAt || 'Not recorded')}</dd></div>
   </dl></details>`).join('')}` : ''}`}
</section>`;
  }

  if (sections.loadFlow) {
    const s = sections.loadFlow;
    html += `
<section class="report-section" id="rpt-loadFlow">
  <h2>Load Flow Analysis</h2>
  ${approvalBadgeHTML(s.approval)}
  ${studyMetadataHTML(s.studyMetadata)}
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
  ${studyMetadataHTML(s.studyMetadata)}
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
  ${studyMetadataHTML(s.studyMetadata)}
  ${s.empty ? emptySection('Motor Starting') : `
  <div class="report-scroll"><table class="report-table">
    <thead><tr><th>Motor</th><th>Inrush (kA)</th><th>Voltage Sag (%)</th><th>Accel Time (s)</th><th>Start Method</th><th>Status</th></tr></thead>
    <tbody>${(s.rows || []).map(r => `<tr>
      <td>${esc(r.id)}</td><td>${fmt(r.inrushKA)}</td><td>${fmt(r.voltageSagPct)}</td>
      <td>${fmt(r.accelTime)}</td><td>${esc(r.method)}</td><td>${esc(r.status ?? '—')}</td>
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
  ${studyMetadataHTML(s.studyMetadata)}
  ${s.empty ? emptySection('Voltage Drop') : `
  <p class="report-readiness-note ${s.readiness?.valid ? 'report-readiness-note--ready' : 'report-readiness-note--warning'}">
    ${esc(s.readiness?.validityLabel || 'Validity not recorded')}
    &nbsp;·&nbsp; Source: ${esc(s.readiness?.source || 'not recorded')}
  </p>
  <dl class="report-summary-list">${Object.entries(s.summary || {}).map(([label, value]) =>
    `<div><dt>${esc(label)}</dt><dd>${typeof value === 'number' ? fmt(value) : esc(value)}</dd></div>`
  ).join('')}</dl>
  <div class="report-scroll"><table class="report-table">
     <thead><tr><th>Cable / Circuit</th><th>From</th><th>To</th><th>Current Source</th><th>Path</th><th>Drop (%)</th><th>Limit (%)</th><th>Status</th><th>Combined Drop (%)</th><th>Combined Limit (%)</th><th>Combined Status</th><th>Recommended Size</th><th>Result Validity</th><th>Result Sources</th><th>Diagnostics</th></tr></thead>
    <tbody>${(s.rows || []).map(r => `<tr>
      <td>${esc(r.id)}</td><td>${esc(r.from)}</td><td>${esc(r.to)}</td>
      <td>${esc(r.inputSource)}</td><td>${esc(r.path)}</td>
      <td>${fmt(r.dropPct)}</td><td>${fmt(r.limitPct)}</td><td>${statusBadge(r.status)}</td>
      <td>${fmt(r.combinedDropPct)}</td><td>${fmt(r.combinedLimitPct)}</td>
       <td>${statusBadge(r.combinedStatus)}</td><td>${esc(r.recommendation)}</td>
       <td>${esc(r.resultValidity)}</td><td>${esc(JSON.stringify(r.resultInputSources))}</td>
       <td>${esc(JSON.stringify({ assumptions: r.resultAssumptions, limits: r.resultModelLimits, warnings: r.resultWarnings, fingerprint: r.inputFingerprint }))}</td>
    </tr>`).join('')}</tbody>
  </table></div>
  ${(s.warnings || []).length ? `<div class="report-alert report-alert--warning"><strong>Study warnings:</strong><ul>${s.warnings.map(warning => `<li>${esc(warning)}</li>`).join('')}</ul></div>` : ''}`}
</section>`;
  }

  const advancedStudyKeys = [
    'quasiDynamic', 'probabilisticLoadFlow', 'contingency', 'voltageStability',
    'frequencyScan', 'transientStability', 'optimalPowerFlow', 'reliability',
  ];
  for (const key of advancedStudyKeys) {
    const s = sections[key];
    if (!s) continue;
    const readinessClass = s.readiness?.valid ? 'report-readiness-note--ready' : 'report-readiness-note--warning';
    const summaryEntries = Object.entries(s.summary || {}).filter(([, value]) => value != null && value !== '');
    html += `
<section class="report-section" id="rpt-${esc(key)}">
  <h2>${esc(s.title || key)}</h2>
  ${approvalBadgeHTML(s.approval)}
  ${studyMetadataHTML(s.studyMetadata)}
  ${s.empty ? emptySection(s.title || key) : `
  <p class="report-readiness-note ${readinessClass}">
    ${esc(s.readiness?.validityLabel || 'Validity not recorded')}
    &nbsp;Â·&nbsp; Source: ${esc(s.readiness?.source || 'not recorded')}
    ${s.readiness?.runAt ? ` &nbsp;Â·&nbsp; Run: ${esc(s.readiness.runAt)}` : ''}
  </p>
  ${s.readiness?.convergence ? `<p class="report-note">${esc(s.readiness.convergence)}</p>` : ''}
  ${summaryEntries.length ? `<dl class="report-summary-list">${summaryEntries.map(([label, value]) =>
    `<div><dt>${esc(label)}</dt><dd>${typeof value === 'number' ? fmt(value) : esc(value)}</dd></div>`
  ).join('')}</dl>` : ''}
  ${(s.rows || []).length ? `
  <div class="report-scroll"><table class="report-table">
    <thead><tr>${(s.headers || []).map(header => `<th>${esc(header.label)}</th>`).join('')}</tr></thead>
    <tbody>${s.rows.map(row => `<tr>${(s.headers || []).map(header => {
      const value = row[header.key];
      return `<td>${typeof value === 'number' ? fmt(value) : esc(value ?? 'â€”')}</td>`;
    }).join('')}</tr>`).join('')}</tbody>
  </table></div>` : '<p class="report-empty">No detailed rows were produced.</p>'}
  ${(s.cutSets || []).length ? `
  <h3>Minimal Cut-Set Screening</h3>
  <div class="report-scroll"><table class="report-table">
    <thead><tr><th>Order</th><th>Failed Components</th><th>Affected Service Points</th><th>Interrupted kW</th><th>Critical kW</th><th>Probability</th></tr></thead>
    <tbody>${s.cutSets.map(row => `<tr>
      <td>${esc(row.order)}</td><td>${esc(row.failed)}</td><td>${esc(row.impacted)}</td>
      <td>${fmt(row.impactedKw)}</td><td>${fmt(row.criticalKw)}</td><td>${fmt(row.probability)}</td>
    </tr>`).join('')}</tbody>
  </table></div>` : ''}
  ${(s.warnings || []).length ? `<div class="report-alert report-alert--warning"><strong>Study warnings:</strong><ul>${s.warnings.map(warning => `<li>${esc(warning)}</li>`).join('')}</ul></div>` : ''}`}
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
    ...advancedStudyKeys,
  ]);
  for (const key of orderedKeys) {
    const section = sections[key];
    if (!section || dedicatedKeys.has(key)) continue;
    if (section.unavailable) {
      html += unavailableSection(key, section.title || key);
      continue;
    }
    const rows = Array.isArray(section.rows) ? section.rows : [];
    const headers = Array.isArray(section.headers) && section.headers.length
      ? section.headers
      : (rows.length ? Object.keys(rows[0]).map(field => ({ key: field, label: field })) : []);
    html += `
<section class="report-section" id="rpt-${esc(key)}">
  <h2>${esc(section.title || key)}</h2>
  ${section.summary ? `<dl class="report-summary-list">${Object.entries(section.summary).map(([label, value]) =>
    `<div><dt>${esc(label)}</dt><dd>${typeof value === 'number' ? fmt(value) : esc(value)}</dd></div>`
  ).join('')}</dl>` : ''}
  ${rows.length && headers.length ? `
  <div class="report-scroll"><table class="report-table">
    <thead><tr>${headers.map(header => `<th>${esc(header.label || header.key)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => `<tr>${headers.map(header => {
      const value = row[header.key];
      return `<td>${typeof value === 'number' ? fmt(value) : esc(value ?? '—')}</td>`;
    }).join('')}</tr>`).join('')}</tbody>
  </table></div>` : '<p class="report-empty">No detailed rows were produced.</p>'}
</section>`;
  }

  return html;
}
