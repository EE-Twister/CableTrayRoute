/**
 * Report Package Builder — page script.
 *
 * Orchestrates the UI for building, previewing, and exporting commercial-grade
 * engineering report packages.  Delegates pure computation to:
 *   - analysis/reportPackage.mjs  (section registry, presets, package assembly)
 *   - analysis/projectReport.mjs  (section builders, renderPackageHTML)
 */

import {
  READINESS_VOCABULARY,
  getContractReadinessCopy
} from './workflowStatus.js';
import '../site.js';
import {
  getCables, getTrays, getConduits, getDuctbanks,
  getStudies, getStudyApprovals, getEquipment, getOneLine,
  getReportSnapshots, setReportSnapshot, deleteReportSnapshot,
  getLifecyclePackages,
  getDesignBasis, getDesignGateApprovals, getItem,
} from '../dataStore.mjs';
import { getProjectState } from '../projectStorage.js';
import { buildDesignBasisReview } from '../analysis/designBasis.mjs';
import { buildDeliverableReadinessDiagnostics } from '../analysis/deliverableWorkflow.mjs';
import { runDRC } from '../analysis/designRuleChecker.mjs';
import { generateProjectReport } from '../analysis/projectReport.mjs';
import {
  renderPackageHTML,
  buildArcFlashSection,
  buildShortCircuitSection,
  buildLoadFlowSection,
  buildHarmonicsSection,
  buildMotorStartSection,
  buildVoltageDropSection,
  buildDRCSection,
} from '../analysis/projectReport.mjs';
import {
  SECTION_REGISTRY,
  PRESET_CONFIGS,
  buildReportPackage,
  buildCoverSheet,
  buildRevisionTable,
  snapshotPackage,
  getAvailableSections,
} from '../analysis/reportPackage.mjs';

// ---------------------------------------------------------------------------
// DOM references (resolved after DOMContentLoaded)
// ---------------------------------------------------------------------------

const REPORT_READINESS_COPY = getContractReadinessCopy('projectreport.html');

let previewEl, statusEl;

function setStatus(msg, type = 'info') {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.className = `report-status report-status--${type}`;
}

// ---------------------------------------------------------------------------
// Section selector UI
// ---------------------------------------------------------------------------

function buildSectionChecks(availableSections) {
  const container = document.getElementById('rpt-section-checks');
  if (!container) return;
  container.innerHTML = '';

  const groups = [...new Set(SECTION_REGISTRY.map(s => s.group))];
  for (const group of groups) {
    const groupEl = document.createElement('div');
    groupEl.className = 'rpt-section-group';

    const label = document.createElement('div');
    label.className = 'rpt-section-group-label';
    label.textContent = group;
    groupEl.appendChild(label);

    const checks = document.createElement('div');
    checks.className = 'rpt-section-checks';

    for (const def of SECTION_REGISTRY.filter(s => s.group === group)) {
      const lbl = document.createElement('label');
      const cb  = document.createElement('input');
      cb.type  = 'checkbox';
      cb.id    = `rpt-sec-${def.key}`;
      cb.name  = 'rpt-section';
      cb.value = def.key;
      // Default: check sections that have data; uncheck those without
      cb.checked = availableSections.has(def.key);
      if (!availableSections.has(def.key)) {
        cb.title = 'No data available for this section';
      }
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(' ' + def.label));
      checks.appendChild(lbl);
    }
    groupEl.appendChild(checks);
    container.appendChild(groupEl);
  }
}

function getSelectedSections() {
  const checked = document.querySelectorAll('input[name="rpt-section"]:checked');
  return Array.from(checked).map(cb => cb.value);
}

// ---------------------------------------------------------------------------
// Preset application
// ---------------------------------------------------------------------------

function applyPreset(presetId) {
  const cfg = PRESET_CONFIGS[presetId];
  if (!cfg) return;

  // Uncheck all first
  document.querySelectorAll('input[name="rpt-section"]').forEach(cb => { cb.checked = false; });

  // Check preset sections
  for (const key of cfg.sections) {
    const cb = document.getElementById(`rpt-sec-${key}`);
    if (cb) cb.checked = true;
  }

  setStatus(`Preset applied: ${cfg.label}`, 'info');
}

// ---------------------------------------------------------------------------
// Cover sheet reading
// ---------------------------------------------------------------------------

function readCoverFields() {
  const state = getProjectState();
  return {
    projectName:    document.getElementById('rpt-project-name')?.value?.trim() || (state && state.name) || 'Untitled Project',
    client:         document.getElementById('rpt-client')?.value?.trim()      || '',
    engineer:       document.getElementById('rpt-engineer')?.value?.trim()    || '',
    license:        document.getElementById('rpt-license')?.value?.trim()     || '',
    date:           document.getElementById('rpt-date')?.value                || new Date().toISOString().slice(0, 10),
    revisionNumber: document.getElementById('rpt-rev-number')?.value?.trim()  || '0',
    notes:          document.getElementById('rpt-notes')?.value?.trim()       || '',
  };
}

// ---------------------------------------------------------------------------
// Revision history table
// ---------------------------------------------------------------------------

function addRevisionRow(rev = '', date = '', description = '', by = '') {
  const tbody = document.getElementById('rpt-rev-tbody');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" aria-label="Rev" value="${escAttr(rev)}" placeholder="1"></td>
    <td><input type="date" aria-label="Date" value="${escAttr(date)}"></td>
    <td><input type="text" aria-label="Description" value="${escAttr(description)}" placeholder="Initial issue"></td>
    <td><input type="text" aria-label="By" value="${escAttr(by)}" placeholder="JD"></td>
    <td><button type="button" aria-label="Remove row" style="padding:.1rem .4rem;font-size:.75rem;">&times;</button></td>
  `;
  tr.querySelector('button').addEventListener('click', () => tr.remove());
  tbody.appendChild(tr);
}

function readRevisionRows() {
  const rows = [];
  document.querySelectorAll('#rpt-rev-tbody tr').forEach(tr => {
    const inputs = tr.querySelectorAll('input');
    rows.push({
      rev:         inputs[0]?.value?.trim() || '',
      date:        inputs[1]?.value?.trim() || '',
      description: inputs[2]?.value?.trim() || '',
      by:          inputs[3]?.value?.trim() || '',
    });
  });
  return rows;
}

function buildDesignBasisAssumptionText(review) {
  if (!review) return '';
  const lines = [
    'Project Design Basis:',
    ...review.assumptions.map(item => `- ${item.label}: ${item.detail}`)
  ];
  if (review.gates.length) {
    lines.push('Review Gates:');
    review.gates.forEach(gate => {
      lines.push(`- [${gate.status}] ${gate.label}: ${gate.detail}`);
    });
  }
  return lines.join('\n');
}

function escAttr(s) {
  return String(s ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Project data assembly
// ---------------------------------------------------------------------------

function getLatestRouteCacheState() {
  const latestState = getItem('latestRouteResults', {}) || {};

  const trayCableMap = latestState && typeof latestState === 'object'
    ? latestState.trayCableMap
    : null;

  if (!trayCableMap || typeof trayCableMap !== 'object' || Array.isArray(trayCableMap)) {
    return {};
  }

  const entries = Object.entries(trayCableMap);
  if (!entries.length) return {};
  if (!entries.every(([, cables]) => Array.isArray(cables))) return {};

  return latestState;
}

function loadProjectData() {
  const cables = getCables();
  const trays = getTrays();
  const conduits = getConduits();
  const routeState = getLatestRouteCacheState();
  const routedCableNames = Array.isArray(routeState.routedCableNames)
    ? routeState.routedCableNames
    : (routeState.batchResults || [])
    .filter(r => r.cable && r.status && r.status.includes('Routed'))
    .map(r => r.cable);
  const drcRun = runDRC({
    trays,
    conduits,
    cables,
    trayCableMap: routeState.trayCableMap || {},
    routedCableNames,
  });

  return {
    cables,
    trays,
    conduits,
    ductbanks: getDuctbanks(),
    equipment: getEquipment(),
    oneLine: getOneLine(),
    studies:   getStudies(),
    approvals: getStudyApprovals(),
    designBasis: getDesignBasis(),
    designGateApprovals: getDesignGateApprovals(),
    tccSettings: getItem('tccSettings', null),
    drcResults: Array.isArray(drcRun?.findings) ? drcRun.findings : [],
  };
}

// ---------------------------------------------------------------------------
// Package assembly
// ---------------------------------------------------------------------------

function buildPackageConfig() {
  const manualAssumptions = document.getElementById('rpt-assumptions')?.value?.trim() || '';
  const designBasisAssumptions = buildDesignBasisAssumptionText(currentDesignBasisReview());
  return {
    sections:       getSelectedSections(),
    coverSheet:     readCoverFields(),
    revisions:      readRevisionRows(),
    assumptions:    [manualAssumptions, designBasisAssumptions].filter(Boolean).join('\n\n'),
  };
}

function assemblePackage(config, projectData) {
  const { studies, approvals, trays, cables, drcResults } = projectData;

  // Build per-section data for study and DRC sections
  const sectionData = {
    arcFlash:     buildArcFlashSection(studies, approvals),
    shortCircuit: buildShortCircuitSection(studies, approvals),
    loadFlow:     buildLoadFlowSection(studies, approvals),
    harmonics:    buildHarmonicsSection(studies, approvals),
    motorStart:   buildMotorStartSection(studies, approvals),
    voltageDrop:  buildVoltageDropSection(studies, approvals),
    drc:          buildDRCSection(Array.isArray(drcResults) ? drcResults : []),
  };

  return buildReportPackage(config, sectionData);
}

// ---------------------------------------------------------------------------
// Base report (construction sections)
// ---------------------------------------------------------------------------

function buildBaseReport(projectData) {
  const state = getProjectState();
  const projectName = document.getElementById('rpt-project-name')?.value?.trim()
    || (state && state.name) || 'Untitled Project';
  return generateProjectReport({
    cables:      projectData.cables,
    trays:       projectData.trays,
    conduits:    projectData.conduits,
    ductbanks:   projectData.ductbanks,
    projectName,
    studies:     projectData.studies,
    approvals:   projectData.approvals,
  });
}

// ---------------------------------------------------------------------------
// Export: XLSX
// ---------------------------------------------------------------------------

function exportXLSX(pkg, baseReport) {
  if (typeof XLSX === 'undefined') {
    setStatus('XLSX library not loaded — cannot export.', 'error');
    return;
  }

  const wb = XLSX.utils.book_new();
  const sections = pkg.sections || {};

  // Cover sheet as a simple key-value sheet
  if (sections.cover) {
    const cover = sections.cover.data || {};
    const aoa = [['Field', 'Value'], ...Object.entries(cover).map(([k, v]) => [k, v])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Cover');
  }

  // Revision history
  if (sections.revisions) {
    const rows = sections.revisions.rows || [];
    const aoa = [['Rev', 'Date', 'Description', 'By'], ...rows.map(r => [r.rev, r.date, r.description, r.by])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Revisions');
  }

  // Assumptions
  if (sections.assumptions) {
    const aoa = [['Assumptions / Basis of Design'], [sections.assumptions.text || '']];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Assumptions');
  }

  // Cable schedule
  if (sections.cables && baseReport.cables) {
    const rows = baseReport.cables.rows || [];
    const headers = ['id', 'from', 'to', 'size', 'insulation', 'voltage', 'lengthFt', 'raceway'];
    const aoa = [headers, ...rows.map(r => headers.map(h => r[h] ?? ''))];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Cables');
  }

  // Raceway fill
  if (sections.fill && baseReport.fill) {
    const { trays, conduits } = baseReport.fill;
    const headers = ['id', 'type', 'areaIn2', 'fillIn2', 'usedPct', 'limitPct', 'status'];
    const aoa = [headers, ...[...trays, ...conduits].map(r => headers.map(h => r[h] ?? ''))];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Fill');
  }

  // DRC
  if (sections.drc && sections.drc.rows) {
    const headers = ['rule', 'severity', 'component', 'message', 'remediation', 'accepted'];
    const aoa = [headers, ...(sections.drc.rows || []).map(r => headers.map(h => r[h] ?? ''))];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'DRC');
  }

  // Study sections
  const studySections = [
    { key: 'arcFlash',     headers: ['id', 'incidentEnergy', 'ppeCategory', 'boundary', 'clearingTime', 'voltage'],    sheetName: 'ArcFlash' },
    { key: 'shortCircuit', headers: ['id', 'i3ph_kA', 'iSlg_kA', 'iLL_kA', 'iDLG_kA', 'voltage'],                    sheetName: 'ShortCircuit' },
    { key: 'loadFlow',     headers: ['id', 'voltagePu', 'voltageKv', 'angleDeg', 'loadKW', 'loadKVAR'],               sheetName: 'LoadFlow-Buses', rowKey: 'busRows' },
    { key: 'harmonics',    headers: ['id', 'ithd', 'vthd', 'limit', 'warning'],                                        sheetName: 'Harmonics' },
    { key: 'motorStart',   headers: ['id', 'inrushKA', 'voltageSagPct', 'accelTime', 'method'],                        sheetName: 'MotorStart' },
    { key: 'voltageDrop',  headers: ['id', 'from', 'to', 'dropPct', 'dropV', 'limitPct', 'status'],                   sheetName: 'VoltageDrop' },
  ];

  for (const { key, headers, sheetName, rowKey } of studySections) {
    const sec = sections[key];
    if (!sec || sec.empty) continue;
    const rows = sec[rowKey || 'rows'] || [];
    if (!rows.length) continue;
    const aoa = [headers, ...rows.map(r => headers.map(h => r[h] ?? ''))];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName);
  }

  // Heat trace branches
  if (sections.heatTrace && baseReport.heatTrace) {
    const branchRows = baseReport.heatTrace.branchSchedule?.rows || [];
    const headers = ['name', 'status', 'heatTraceCableTypeLabel', 'effectiveTraceLengthFt', 'maxCircuitLengthFt', 'selectedWPerFt', 'requiredWatts', 'voltageV', 'loadAmps'];
    const aoa = [headers, ...branchRows.map(r => headers.map(h => r[h] ?? ''))];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'HeatTrace');
  }

  if (wb.SheetNames.length === 0) {
    setStatus('No tabular sections selected — XLSX would be empty.', 'warn');
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  const cover = pkg.config?.coverSheet || {};
  const name  = (cover.projectName || 'report').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  XLSX.writeFile(wb, `${name}-report-${date}.xlsx`);
  setStatus('XLSX exported.', 'success');
}

// ---------------------------------------------------------------------------
// Export: self-contained HTML
// ---------------------------------------------------------------------------

function exportHTML(pkg, baseReport) {
  const html = renderPackageHTML(pkg, baseReport);
  if (!html) {
    setStatus('Generate the preview first.', 'warn');
    return;
  }

  const doc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escAttr(pkg.config?.coverSheet?.projectName || 'Project Report')}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 1100px; margin: 2rem auto; padding: 0 1rem; color: #111; }
  h1 { font-size: 1.6rem; } h2 { font-size: 1.2rem; border-bottom: 1px solid #ddd; padding-bottom: .25rem; }
  h3 { font-size: 1rem; }
  table { border-collapse: collapse; width: 100%; font-size: .85rem; }
  th, td { border: 1px solid #ccc; padding: .3rem .5rem; text-align: left; }
  th { background: #f0f0f0; font-weight: 600; }
  .badge { display: inline-block; padding: .1rem .4rem; border-radius: 3px; font-size: .75rem; font-weight: 700; }
  .badge-ok { background: #d4edda; color: #155724; }
  .badge-warn { background: #fff3cd; color: #856404; }
  .badge-error { background: #f8d7da; color: #721c24; }
  .badge-info { background: #d1ecf1; color: #0c5460; }
  .report-section { margin-bottom: 2rem; }
  .report-cover { border-bottom: 3px solid #333; padding-bottom: 1rem; margin-bottom: 2rem; }
  .report-toc-list { columns: 2; }
  .report-dl { display: grid; grid-template-columns: max-content 1fr; gap: .2rem .75rem; }
  dt { font-weight: 600; }
  .report-scroll { overflow-x: auto; }
  pre { white-space: pre-wrap; background: #f8f8f8; padding: .5rem; border-radius: 4px; }
  .report-approval { font-size: .85rem; margin: .5rem 0; }
  @media print { .report-cover { page-break-after: always; } .report-section { page-break-inside: avoid; } }
</style>
</head>
<body>
${html}
</body>
</html>`;

  const blob = new Blob([doc], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const name = (pkg.config?.coverSheet?.projectName || 'report').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  a.download = `${name}-report-${date}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
  setStatus('HTML exported.', 'success');
}

// ---------------------------------------------------------------------------
// Export: JSON
// ---------------------------------------------------------------------------

function exportJSON(pkg) {
  const blob = new Blob([JSON.stringify(snapshotPackage(pkg), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  a.download = `report-package-${date}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
  setStatus('JSON exported.', 'success');
}

// ---------------------------------------------------------------------------
// Snapshot management
// ---------------------------------------------------------------------------

function renderSnapshotList() {
  const listEl = document.getElementById('rpt-snapshot-list');
  if (!listEl) return;

  const snaps = getReportSnapshots();
  const ids = Object.keys(snaps).sort().reverse();

  if (ids.length === 0) {
    listEl.innerHTML = '<p class="field-hint" style="font-size:.8rem;">No snapshots saved yet.</p>';
    return;
  }

  listEl.innerHTML = '';
  for (const id of ids) {
    const snap = snaps[id];
    const date = snap.generatedAt ? new Date(snap.generatedAt).toLocaleString() : id;
    const name = snap.config?.coverSheet?.projectName || 'Untitled';

    const item = document.createElement('div');
    item.className = 'rpt-snapshot-item';
    item.innerHTML = `
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escAttr(id)}">
        <strong>${escAttr(name)}</strong><br><small>${escAttr(date)}</small>
      </span>
      <button type="button" class="btn" data-action="load" data-id="${escAttr(id)}" title="Load snapshot">Load</button>
      <button type="button" class="btn secondary-btn" data-action="delete" data-id="${escAttr(id)}" title="Delete snapshot">&times;</button>
    `;
    listEl.appendChild(item);
  }

  listEl.querySelectorAll('button[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteReportSnapshot(btn.dataset.id);
      renderSnapshotList();
    });
  });

  listEl.querySelectorAll('button[data-action="load"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const snap = getReportSnapshots()[btn.dataset.id];
      if (!snap) return;
      loadSnapshotIntoUI(snap);
    });
  });
}

function loadSnapshotIntoUI(snap) {
  const cfg = snap.config || {};

  // Apply section checkboxes
  document.querySelectorAll('input[name="rpt-section"]').forEach(cb => { cb.checked = false; });
  (cfg.sections || []).forEach(key => {
    const cb = document.getElementById(`rpt-sec-${key}`);
    if (cb) cb.checked = true;
  });

  // Fill cover fields
  const cover = cfg.coverSheet || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('rpt-project-name', cover.projectName);
  set('rpt-client',       cover.client);
  set('rpt-engineer',     cover.engineer);
  set('rpt-license',      cover.license);
  set('rpt-date',         cover.date);
  set('rpt-rev-number',   cover.revisionNumber);
  set('rpt-notes',        cover.notes);

  // Revision rows
  const tbody = document.getElementById('rpt-rev-tbody');
  if (tbody) tbody.innerHTML = '';
  (cfg.revisions || []).forEach(r => addRevisionRow(r.rev, r.date, r.description, r.by));

  // Assumptions
  const assump = document.getElementById('rpt-assumptions');
  if (assump) assump.value = cfg.assumptions || '';

  setStatus('Snapshot loaded.', 'success');
}

// ---------------------------------------------------------------------------
// Main logic
// ---------------------------------------------------------------------------

let lastPkg = null;
let lastBaseReport = null;

// ---------------------------------------------------------------------------
// Lifecycle package source (Gap #71)
// ---------------------------------------------------------------------------

/** The lifecycle package whose snapshot is used as the report data source, or null for live data. */
let activeLifecyclePkg = null;

function renderLifecyclePkgSelector() {
  const select = document.getElementById('rpt-lifecycle-pkg-select');
  if (!select) return;
  const packages = getLifecyclePackages();
  select.innerHTML = '<option value="">— Live project data —</option>';
  for (const pkg of packages) {
    const date = pkg.createdAt ? pkg.createdAt.slice(0, 10) : '';
    const opt = document.createElement('option');
    opt.value = pkg.id;
    opt.textContent = `${pkg.revisionLabel} — ${pkg.status} — ${date}`;
    if (activeLifecyclePkg && activeLifecyclePkg.id === pkg.id) opt.selected = true;
    select.appendChild(opt);
  }
}

function updateLifecycleBanner() {
  const banner = document.getElementById('rpt-lifecycle-banner');
  if (!banner) return;
  if (activeLifecyclePkg) {
    const date = activeLifecyclePkg.createdAt ? activeLifecyclePkg.createdAt.slice(0, 10) : '';
    banner.textContent = `Data source: Package "${activeLifecyclePkg.revisionLabel}" — ${activeLifecyclePkg.status} — ${date}`;
    banner.hidden = false;
  } else {
    banner.textContent = '';
    banner.hidden = true;
  }
}

/** Override loadProjectData() with snapshot data when a package is selected. */
function loadProjectDataWithPackage() {
  if (!activeLifecyclePkg) return loadProjectData();
  const snap = activeLifecyclePkg.projectSnapshot || {};
  return {
    cables:    Array.isArray(snap.cables)  ? snap.cables  : [],
    trays:     Array.isArray(snap.trays)   ? snap.trays   : [],
    conduits:  [],
    ductbanks: [],
    equipment: Array.isArray(snap.equipment) ? snap.equipment : getEquipment(),
    oneLine: snap.oneLine || getOneLine(),
    studies:   snap.studies   || {},
    approvals: snap.approvals || {},
    designBasis: snap.designBasis || getDesignBasis(),
    designGateApprovals: snap.designGateApprovals || getDesignGateApprovals(),
    tccSettings: snap.tccSettings || getItem('tccSettings', null),
    drcResults: [],
  };
}

function currentReportReadinessDiagnostics() {
  const projectData = loadProjectDataWithPackage();
  const snap = activeLifecyclePkg?.projectSnapshot || {};
  return buildDeliverableReadinessDiagnostics({
    equipment: projectData.equipment,
    oneLine: projectData.oneLine,
    cables: projectData.cables,
    trays: projectData.trays,
    conduits: projectData.conduits,
    ductbanks: projectData.ductbanks,
    studies: projectData.studies,
    studyApprovals: projectData.approvals,
    drcResults: projectData.drcResults,
    routeResults: activeLifecyclePkg
      ? snap.latestRouteResults || snap.routeResults || []
      : getItem('latestRouteResults', null),
    reportSnapshots: activeLifecyclePkg ? snap.reportSnapshots || {} : getReportSnapshots(),
    lifecyclePackages: getLifecyclePackages(),
    designBasis: projectData.designBasis,
    designGateApprovals: projectData.designGateApprovals,
    tccSettings: projectData.tccSettings,
    enforceDesignBasis: true,
  });
}

function currentDesignBasisReview() {
  const projectData = loadProjectDataWithPackage();
  const snap = activeLifecyclePkg?.projectSnapshot || {};
  return buildDesignBasisReview({
    designBasis: projectData.designBasis,
    designGateApprovals: projectData.designGateApprovals,
    equipment: projectData.equipment,
    oneLine: projectData.oneLine,
    cables: projectData.cables,
    trays: projectData.trays,
    conduits: projectData.conduits,
    ductbanks: projectData.ductbanks,
    studies: projectData.studies,
    studyApprovals: projectData.approvals,
    routeResults: activeLifecyclePkg ? snap.latestRouteResults || snap.routeResults || [] : getItem('latestRouteResults', null),
    tccSettings: projectData.tccSettings,
  });
}

function ensureDeliverableGates(actionLabel) {
  const review = currentDesignBasisReview();
  if (!review.deliverableBlockers.length) return true;
  const gate = review.deliverableBlockers[0];
  setStatus(`${actionLabel} blocked: ${gate.label}. Resolve ${review.deliverableBlockers.length} design basis gate(s) before issuing deliverables.`, 'warn');
  renderReportReadiness();
  return false;
}

function renderReportReadiness() {
  const el = document.getElementById('rpt-deliverable-readiness');
  if (!el) return;
  const diagnostics = currentReportReadinessDiagnostics();
  const action = diagnostics.nextAction;
  const designReview = diagnostics.designReview || currentDesignBasisReview();
  const routeCount = diagnostics.health.routeResults;
  const snapshotCount = diagnostics.health.reportSnapshots;
  const packageCount = diagnostics.health.lifecyclePackages;
  const readinessLabel = diagnostics.ready.projectReport && routeCount > 0
    ? READINESS_VOCABULARY.ready
    : READINESS_VOCABULARY.missingInputs;
  const actionLabel = action.severity === 'warning' || action.severity === 'critical'
    ? `${READINESS_VOCABULARY.missingInputs}: ${action.label}`
    : `${READINESS_VOCABULARY.downstreamHandoff}: ${action.label}`;
  el.classList.toggle('is-warning', action.severity === 'warning' || action.severity === 'critical');
  el.classList.toggle('is-ready', diagnostics.ready.projectReport && routeCount > 0);
  el.innerHTML = `
    <div>
      <strong>${readinessLabel}: Report readiness: ${diagnostics.health.reportSections} section(s) available.</strong>
      <p>${REPORT_READINESS_COPY?.readyWhen || 'Ready when selected report sections have source data and required review gates are complete.'}</p>
      <p>${routeCount} route result(s), ${diagnostics.health.pullGroups} pull group(s), ${diagnostics.health.spoolCount} spool(s), ${snapshotCount} saved snapshot(s), and ${packageCount} release package(s).</p>
      <p>${designReview.openGateCount} design basis gate(s) open; ${designReview.deliverableBlockers.length} block issuing exports or snapshots.</p>
    </div>
    <span class="workflow-next-action__meta">${escAttr(actionLabel)}</span>
    <div class="workflow-next-action__actions">
      <button type="button" class="btn primary-btn" data-action="generate-report-preview">Generate Preview</button>
      <a class="btn secondary-btn" href="pullcards.html">Pull Cards</a>
      <a class="btn secondary-btn" href="spoolsheets.html">Spool Sheets</a>
      <a class="btn secondary-btn" href="workflowdashboard.html">Dashboard</a>
    </div>`;
  el.querySelector('[data-action="generate-report-preview"]')?.addEventListener('click', generatePreview);
}

function generatePreview() {
  try {
    setStatus('Generating…', 'info');
    const projectData = loadProjectDataWithPackage();
    const config      = buildPackageConfig();
    const pkg         = assemblePackage(config, projectData);
    const baseReport  = buildBaseReport(projectData);

    lastPkg        = pkg;
    lastBaseReport = baseReport;

    const html = renderPackageHTML(pkg, baseReport);
    if (previewEl) {
      previewEl.innerHTML = html || '<p class="field-hint">No sections selected.</p>';
    }

    const sectionCount = Object.keys(pkg.sections).length;
    setStatus(`Preview built — ${sectionCount} section(s) included.`, 'success');
    renderReportReadiness();
  } catch (err) {
    console.error('[projectreport] Generation failed:', err);
    setStatus('Generation failed: ' + err.message, 'error');
  }
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  previewEl = document.getElementById('report-preview');
  statusEl  = document.getElementById('report-status');

  // Set default date
  const dateEl = document.getElementById('rpt-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);

  // ── Lifecycle package selector (Gap #71) ──
  renderLifecyclePkgSelector();
  updateLifecycleBanner();

  // Pre-select a package if ?pkg=<id> is in the URL
  const urlPkgId = new URLSearchParams(window.location.search).get('pkg');
  if (urlPkgId) {
    const found = getLifecyclePackages().find(p => p.id === urlPkgId);
    if (found) {
      activeLifecyclePkg = found;
      const select = document.getElementById('rpt-lifecycle-pkg-select');
      if (select) select.value = urlPkgId;
      updateLifecycleBanner();
    }
  }

  document.getElementById('rpt-lifecycle-pkg-select')?.addEventListener('change', e => {
    const id = e.target.value;
    if (!id) {
      activeLifecyclePkg = null;
    } else {
      activeLifecyclePkg = getLifecyclePackages().find(p => p.id === id) || null;
    }
    updateLifecycleBanner();
    // Rebuild section availability for the chosen source
    const pd = loadProjectDataWithPackage();
    const avail = getAvailableSections({ studies: pd.studies, cables: pd.cables, trays: pd.trays, drcResults: pd.drcResults });
    buildSectionChecks(avail);
    renderReportReadiness();
  });

  // Build section checkboxes based on available data
  const projectData = loadProjectData();
  const available   = getAvailableSections({
    studies:    projectData.studies,
    cables:     projectData.cables,
    trays:      projectData.trays,
    drcResults: projectData.drcResults,
  });
  buildSectionChecks(available);
  renderReportReadiness();

  // Default preset: ownerTurnover (all sections, scoped to available)
  applyPreset('ownerTurnover');

  // Render snapshot list
  renderSnapshotList();

  // ── Preset buttons ──
  document.getElementById('rpt-presets-row')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-preset]');
    if (btn) applyPreset(btn.dataset.preset);
  });

  // ── Add revision row ──
  document.getElementById('rpt-add-rev-btn')?.addEventListener('click', () => {
    const rev  = (document.querySelectorAll('#rpt-rev-tbody tr').length + 1).toString();
    const date = new Date().toISOString().slice(0, 10);
    addRevisionRow(rev, date, '', '');
  });

  // ── Generate preview ──
  document.getElementById('rpt-generate-btn')?.addEventListener('click', generatePreview);

  // ── Print / PDF ──
  document.getElementById('rpt-print-btn')?.addEventListener('click', () => {
    if (!ensureDeliverableGates('Print / PDF')) return;
    generatePreview();
    setTimeout(() => window.print(), 300);
  });

  // ── Export XLSX ──
  document.getElementById('rpt-xlsx-btn')?.addEventListener('click', () => {
    if (!ensureDeliverableGates('XLSX export')) return;
    if (!lastPkg) { generatePreview(); }
    if (lastPkg) exportXLSX(lastPkg, lastBaseReport);
  });

  // ── Export HTML ──
  document.getElementById('rpt-html-btn')?.addEventListener('click', () => {
    if (!ensureDeliverableGates('HTML export')) return;
    if (!lastPkg) { generatePreview(); }
    if (lastPkg) exportHTML(lastPkg, lastBaseReport);
  });

  // ── Export JSON ──
  document.getElementById('rpt-json-btn')?.addEventListener('click', () => {
    if (!ensureDeliverableGates('JSON export')) return;
    if (!lastPkg) { generatePreview(); }
    if (lastPkg) exportJSON(lastPkg);
  });

  // ── Save snapshot ──
  document.getElementById('rpt-snapshot-btn')?.addEventListener('click', () => {
    if (!ensureDeliverableGates('Snapshot')) return;
    if (!lastPkg) generatePreview();
    if (!lastPkg) return;
    const snap = snapshotPackage(lastPkg);
    setReportSnapshot(snap.id, snap);
    renderSnapshotList();
    renderReportReadiness();
    // Open the snapshots panel
    const panel = document.getElementById('rpt-snapshots-panel');
    if (panel) panel.open = true;
    setStatus('Snapshot saved.', 'success');
  });
});
