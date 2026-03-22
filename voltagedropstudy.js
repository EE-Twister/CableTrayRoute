import { runVoltageDropStudy, NEC_LIMITS } from './analysis/voltageDropStudy.mjs';
import { getCables } from './dataStore.mjs';
import { downloadCSV } from './reports/reporting.mjs';
import { showAlertModal } from './src/components/modal.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const runBtn    = document.getElementById('run-btn');
  const exportBtn = document.getElementById('export-btn');
  const resultsEl = document.getElementById('results');
  const summaryEl = document.getElementById('summary');

  let lastStudy = null;

  runBtn.addEventListener('click', runStudy);
  exportBtn.addEventListener('click', exportCSV);

  function runStudy() {
    const cables = getCables();
    if (!cables || cables.length === 0) {
      showAlertModal('No Data', 'No cables found in the Cable Schedule. Add cables first.');
      return;
    }

    let study;
    try {
      study = runVoltageDropStudy(cables);
    } catch (err) {
      showAlertModal('Study Error', err.message);
      return;
    }

    lastStudy = study;
    exportBtn.disabled = false;
    renderSummary(study.summary);
    renderTable(study.results);
  }

  function renderSummary(s) {
    const totalWithData = s.pass + s.warn + s.fail;
    summaryEl.hidden = false;
    summaryEl.innerHTML = `
      <div class="result-grid">
        <div class="result-card">
          <span class="result-label">Total Cables</span>
          <span class="result-value">${s.total}</span>
        </div>
        <div class="result-card result-pass">
          <span class="result-label">Compliant</span>
          <span class="result-value">${s.pass}</span>
        </div>
        <div class="result-card result-warn">
          <span class="result-label">Near Limit</span>
          <span class="result-value">${s.warn}</span>
        </div>
        <div class="result-card result-fail">
          <span class="result-label">Exceeds Limit</span>
          <span class="result-value">${s.fail}</span>
        </div>
        <div class="result-card">
          <span class="result-label">Max Drop</span>
          <span class="result-value">${s.maxDropPct.toFixed(2)} %</span>
        </div>
        <div class="result-card">
          <span class="result-label">Avg Drop</span>
          <span class="result-value">${totalWithData ? s.avgDropPct.toFixed(2) : '—'} %</span>
        </div>
      </div>`;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function statusClass(status) {
    if (status === 'fail') return 'row-fail';
    if (status === 'warn') return 'row-warn';
    return '';
  }

  function renderTable(results) {
    if (!results.length) {
      resultsEl.innerHTML = '<p>No cables to display.</p>';
      return;
    }

    const rows = results
      .slice()
      .sort((a, b) => b.dropPct - a.dropPct)
      .map(r => `
        <tr class="${statusClass(r.status)}">
          <td>${esc(r.tag)}</td>
          <td>${esc(r.from)}</td>
          <td>${esc(r.to)}</td>
          <td>${esc(r.conductorSize)} ${esc(r.material)}</td>
          <td class="num">${r.lengthFt > 0 ? r.lengthFt.toFixed(0) : '—'}</td>
          <td class="num">${r.currentA > 0 ? r.currentA.toFixed(1) : '—'}</td>
          <td class="num">${r.voltageV > 0 ? r.voltageV.toFixed(0) : '—'}</td>
          <td class="num ${r.dropPct > r.limit ? 'fail-value' : ''}">${r.dropPct > 0 ? r.dropPct.toFixed(2) : '—'}</td>
          <td class="num">${r.limit}</td>
          <td>${esc(r.circuitType)}</td>
          <td class="status-cell status-${r.status}">${r.status.toUpperCase()}</td>
        </tr>`).join('');

    resultsEl.innerHTML = `
      <table class="results-table" aria-label="Voltage drop compliance results">
        <thead>
          <tr>
            <th scope="col">Cable Tag</th>
            <th scope="col">From</th>
            <th scope="col">To</th>
            <th scope="col">Conductor</th>
            <th scope="col" class="num">Length (ft)</th>
            <th scope="col" class="num">Load (A)</th>
            <th scope="col" class="num">Voltage (V)</th>
            <th scope="col" class="num">Drop (%)</th>
            <th scope="col" class="num">Limit (%)</th>
            <th scope="col">Type</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function exportCSV() {
    if (!lastStudy) return;
    const headers = ['Cable Tag','From','To','Conductor','Length (ft)','Load (A)','Voltage (V)','Drop (%)','Limit (%)','Circuit Type','Status'];
    const rows = lastStudy.results.map(r => [
      r.tag, r.from, r.to,
      `${r.conductorSize} ${r.material}`,
      r.lengthFt > 0 ? r.lengthFt.toFixed(0) : '',
      r.currentA > 0 ? r.currentA.toFixed(1) : '',
      r.voltageV > 0 ? r.voltageV.toFixed(0) : '',
      r.dropPct > 0 ? r.dropPct.toFixed(2) : '',
      r.limit,
      r.circuitType,
      r.status.toUpperCase(),
    ]);
    downloadCSV(headers, rows, 'voltage-drop-study.csv');
  }
});
