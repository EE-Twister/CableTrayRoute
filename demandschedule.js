import { buildDemandSchedule, NEC_CATEGORIES, iecDiversityFactor } from './analysis/demandSchedule.mjs';
import { getLoads } from './dataStore.mjs';
import { downloadCSV } from './reports/reporting.mjs';
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
  const summaryEl  = document.getElementById('summary');
  const resultsEl  = document.getElementById('results');
  const breakdownEl = document.getElementById('source-breakdown');

  let lastResult = null;

  runBtn.addEventListener('click', runStudy);
  exportBtn.addEventListener('click', exportCSV);

  function runStudy() {
    const loads = getLoads ? getLoads() : (typeof window !== 'undefined' && window._loads) || [];
    if (!loads || loads.length === 0) {
      showAlertModal('No Data', 'No loads found in the Load List. Add loads first, then run the demand schedule.');
      return;
    }
    const mode = modeSelect ? modeSelect.value : 'nec';
    let result;
    try {
      result = buildDemandSchedule(loads, { mode });
    } catch (err) {
      showAlertModal('Calculation Error', err.message);
      return;
    }
    lastResult = result;
    exportBtn.disabled = false;
    renderSummary(result);
    renderTable(result.rows);
    renderBreakdown(result.sourceBreakdown);
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
    summaryEl.hidden = false;
    summaryEl.innerHTML = `
      <div class="result-grid">
        <div class="result-card">
          <span class="result-label">Standard</span>
          <span class="result-value">${esc(modeLabel)}</span>
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
    const csvRows = lastResult.rows.map(r => [
      r.source, r.tag, r.description, r.loadType, r.categoryLabel,
      r.quantity,
      r.connectedKw, r.connectedKva,
      (r.demandFactor * 100).toFixed(1),
      r.demandKw, r.demandKva,
      r.note,
    ]);
    downloadCSV(headers, csvRows, 'demand-schedule.csv');
  }
});
