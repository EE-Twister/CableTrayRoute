import { buildDemandSchedule, NEC_CATEGORIES, DEMAND_PROFILES, iecDiversityFactor } from './analysis/demandSchedule.mjs';
import {
  getLoads,
  captureStudyRunContext,
  on as onDataStoreChange,
  STORAGE_KEYS,
} from './dataStore.mjs';
import { downloadCSV } from './reports/reporting.mjs';
import { studyExportMetadata } from './analysis/studyExportMetadata.mjs';
import {
  assessStudyResult,
  buildStudyProvenance,
} from './analysis/studyLifecycle.mjs';
import { showAlertModal } from './src/components/modal.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const runBtn     = document.getElementById('run-btn');
  const exportBtn  = document.getElementById('export-btn');
  const modeSelect = document.getElementById('mode-select');
  const profileSelect = document.getElementById('profile-select');
  const summaryEl  = document.getElementById('summary');
  const reviewEl   = document.getElementById('review-notes');
  const resultsEl  = document.getElementById('results');
  const breakdownEl = document.getElementById('source-breakdown');

  let lastResult = null;
  let lastRunContext = null;
  let lastRunProvenance = null;

  runBtn.addEventListener('click', runStudy);
  exportBtn.addEventListener('click', exportCSV);

  const watchedProjectKeys = [
    STORAGE_KEYS.equipment,
    STORAGE_KEYS.loads,
    STORAGE_KEYS.panels,
    STORAGE_KEYS.cables,
    STORAGE_KEYS.trays,
    STORAGE_KEYS.conduits,
    STORAGE_KEYS.ductbanks,
    STORAGE_KEYS.oneLine,
    STORAGE_KEYS.projectMeta,
    STORAGE_KEYS.designBasis,
  ];

  function clearEphemeralResult() {
    lastResult = null;
    lastRunContext = null;
    lastRunProvenance = null;
    exportBtn.disabled = true;
    if (summaryEl) {
      summaryEl.hidden = true;
      summaryEl.innerHTML = '';
    }
    if (reviewEl) {
      reviewEl.hidden = true;
      reviewEl.innerHTML = '';
    }
    if (resultsEl) resultsEl.innerHTML = '';
    if (breakdownEl) breakdownEl.innerHTML = '';
  }

  watchedProjectKeys.forEach(key => onDataStoreChange(key, clearEphemeralResult));
  onDataStoreChange('scenario', clearEphemeralResult);
  modeSelect?.addEventListener('change', clearEphemeralResult);
  profileSelect?.addEventListener('change', clearEphemeralResult);

  function runStudy() {
    const loads = getLoads ? getLoads() : (typeof window !== 'undefined' && window._loads) || [];
    if (!loads || loads.length === 0) {
      showAlertModal('No Data', 'No loads found in the Load List. Add loads first, then run the demand schedule.');
      return;
    }
    const mode = modeSelect ? modeSelect.value : 'nec';
    const profile = profileSelect ? profileSelect.value : 'commercial';
    const runContext = captureStudyRunContext('demandSchedule', {
      inputs: loads,
      options: { mode, profile },
      inputSources: {
        loads: 'dataStore.loadList',
        standard: mode === 'iec' ? 'IEC 60439-1' : 'NEC 220',
      },
    });
    let result;
    try {
      result = buildDemandSchedule(loads, { mode, profile });
    } catch (err) {
      showAlertModal('Calculation Error', err.message);
      return;
    }
    lastResult = result;
    lastRunContext = runContext;
    lastRunProvenance = buildStudyProvenance('demandSchedule', result, {
      ...runContext,
      assumptions: result.reviewNotes || [],
    }, {
      validity: 'evaluated',
    });
    exportBtn.disabled = false;
    renderSummary(result);
    renderReviewNotes(result.reviewNotes || []);
    renderTable(result.rows);
    renderBreakdown(result.sourceBreakdown);
    document.dispatchEvent(new CustomEvent('ctr:study-ephemeral-complete', {
      detail: { href: 'demandschedule.html' },
    }));
  }

  function fmt(n) {
    return typeof n === 'number' ? n.toFixed(2) : '—';
  }

  function pct(n) {
    return typeof n === 'number' ? (n * 100).toFixed(1) + ' %' : '—';
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderSummary(result) {
    const { summary, mode } = result;
    const overallDf = summary.totalConnectedKw > 0
      ? (summary.totalDemandKw / summary.totalConnectedKw)
      : 1;
    const modeLabel = mode === 'iec' ? 'IEC 60439-1' : 'NEC 220';
    const profileLabel = mode === 'iec' ? 'Consumer Count' : result.profileLabel || DEMAND_PROFILES.commercial.label;
    summaryEl.hidden = false;
    summaryEl.innerHTML = `
      <div class="result-grid">
        <div class="result-card">
          <span class="result-label">Standard</span>
          <span class="result-value">${esc(modeLabel)}</span>
        </div>
        <div class="result-card">
          <span class="result-label">Demand Profile</span>
          <span class="result-value">${esc(profileLabel)}</span>
        </div>
        <div class="result-card">
          <span class="result-label">Connected Load (kW)</span>
          <span class="result-value">${fmt(summary.totalConnectedKw)}</span>
        </div>
        <div class="result-card">
          <span class="result-label">Connected Load (kVA)</span>
          <span class="result-value">${fmt(summary.totalConnectedKva)}</span>
        </div>
        <div class="result-card result-pass">
          <span class="result-label">Demand Load (kW)</span>
          <span class="result-value">${fmt(summary.totalDemandKw)}</span>
        </div>
        <div class="result-card result-pass">
          <span class="result-label">Demand Load (kVA)</span>
          <span class="result-value">${fmt(summary.totalDemandKva)}</span>
        </div>
        <div class="result-card">
          <span class="result-label">Overall Demand Factor</span>
          <span class="result-value">${pct(overallDf)}</span>
        </div>
      </div>`;
  }

  function renderReviewNotes(notes) {
    if (!reviewEl) return;
    if (!notes.length) {
      reviewEl.hidden = true;
      reviewEl.innerHTML = '';
      return;
    }
    const items = notes.map(note => `
      <li class="demand-review-note demand-review-note-${esc(note.severity || 'info')}">
        <strong>${esc(note.label || note.category)}</strong>
        <span>${esc(note.message)}</span>
        <small>${esc(note.reference || '')}${note.remediation ? ' - ' + esc(note.remediation) : ''}</small>
      </li>`).join('');
    reviewEl.hidden = false;
    reviewEl.innerHTML = `
      <h2 class="section-heading">Demand Profile Review</h2>
      <ul class="demand-review-list">${items}</ul>`;
  }

  function renderTable(rows) {
    if (!rows.length) {
      resultsEl.innerHTML = '<p>No loads to display.</p>';
      return;
    }
    const rowsHtml = rows.map(r => `
      <tr>
        <td>${esc(r.source)}</td>
        <td>${esc(r.tag)}</td>
        <td>${esc(r.description)}</td>
        <td>${esc(r.loadType)}</td>
        <td>${esc(r.categoryLabel)}</td>
        <td class="num">${r.quantity}</td>
        <td class="num">${fmt(r.connectedKw)}</td>
        <td class="num">${fmt(r.connectedKva)}</td>
        <td class="num">${pct(r.demandFactor)}</td>
        <td class="num"><strong>${fmt(r.demandKw)}</strong></td>
        <td class="num"><strong>${fmt(r.demandKva)}</strong></td>
        <td class="note-cell">${esc(r.note)}</td>
      </tr>`).join('');

    resultsEl.innerHTML = `
      <table class="results-table" aria-label="Demand schedule results">
        <thead>
          <tr>
            <th scope="col">Source / Panel</th>
            <th scope="col">Tag</th>
            <th scope="col">Description</th>
            <th scope="col">Load Type</th>
            <th scope="col">NEC Category</th>
            <th scope="col" class="num">Qty</th>
            <th scope="col" class="num">Connected (kW)</th>
            <th scope="col" class="num">Connected (kVA)</th>
            <th scope="col" class="num">Demand Factor</th>
            <th scope="col" class="num">Demand (kW)</th>
            <th scope="col" class="num">Demand (kVA)</th>
            <th scope="col">Code Note</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>`;
  }

  function renderBreakdown(breakdown) {
    if (!breakdown.length) {
      breakdownEl.innerHTML = '';
      return;
    }
    const rowsHtml = breakdown.map(b => `
      <tr>
        <td>${esc(b.source)}</td>
        <td class="num">${fmt(b.connectedKw)}</td>
        <td class="num">${fmt(b.connectedKva)}</td>
        <td class="num"><strong>${fmt(b.demandKw)}</strong></td>
        <td class="num"><strong>${fmt(b.demandKva)}</strong></td>
      </tr>`).join('');

    breakdownEl.innerHTML = `
      <h2 class="section-heading">Service Entrance Summary by Panel</h2>
      <table class="results-table" aria-label="Service entrance summary by panel">
        <thead>
          <tr>
            <th scope="col">Panel / Source</th>
            <th scope="col" class="num">Connected (kW)</th>
            <th scope="col" class="num">Connected (kVA)</th>
            <th scope="col" class="num">Demand (kW)</th>
            <th scope="col" class="num">Demand (kVA)</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>`;
  }

  function exportCSV() {
    if (!lastResult) return;
    const headers = [
      'Source/Panel', 'Tag', 'Description', 'Load Type', 'NEC Category',
      'Qty', 'Connected kW', 'Connected kVA', 'Demand Factor (%)',
      'Demand kW', 'Demand kVA', 'Code Note'
    ];
    const csvRows = lastResult.rows.map(r => ({
      'Source/Panel': r.source,
      Tag: r.tag,
      Description: r.description,
      'Load Type': r.loadType,
      'NEC Category': r.categoryLabel,
      Qty: r.quantity,
      'Connected kW': r.connectedKw,
      'Connected kVA': r.connectedKva,
      'Demand Factor (%)': (r.demandFactor * 100).toFixed(1),
      'Demand kW': r.demandKw,
      'Demand kVA': r.demandKva,
      'Code Note': r.note,
    }));
    const resultAtExport = lastResult;
    const contextAtExport = lastRunContext;
    const provenanceAtExport = lastRunProvenance;
    const currentLoads = getLoads ? getLoads() : [];
    const currentMode = modeSelect ? modeSelect.value : 'nec';
    const currentProfile = profileSelect ? profileSelect.value : 'commercial';
    const currentContext = captureStudyRunContext('demandSchedule', {
      inputs: currentLoads,
      options: { mode: currentMode, profile: currentProfile },
      inputSources: {
        loads: 'dataStore.loadList',
        standard: currentMode === 'iec' ? 'IEC 60439-1' : 'NEC 220',
      },
    });
    const assessedRun = contextAtExport && provenanceAtExport
      ? assessStudyResult('demandSchedule', resultAtExport, provenanceAtExport, currentContext)
      : null;
    const assessment = assessedRun ? {
      ...assessedRun,
      label: assessedRun.eligible
        ? 'Current in-memory run'
        : `In-memory run withheld (${assessedRun.reasons.join(', ') || 'freshness not verified'})`,
    } : {
        validity: { state: 'unevaluated' },
        freshness: 'unknown',
        eligible: false,
        label: 'In-memory run withheld (missing run context)',
        reasons: ['missing_run_context'],
      };
    const lifecycle = studyExportMetadata(resultAtExport, { assessment });
    csvRows.push({
      'Source/Panel': 'Lifecycle',
      Tag: 'resultStatus',
      Description: lifecycle.resultStatus,
      'Code Note': JSON.stringify(lifecycle),
    });
    downloadCSV(headers, csvRows, 'demand-schedule.csv');
  }
});
