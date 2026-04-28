import {
  buildVoltageDropStudyPackage,
  renderVoltageDropStudyHTML,
} from './analysis/voltageDropStudy.mjs';
import { getCables, getStudies, setStudies } from './dataStore.mjs';
import { downloadCSV } from './reports/reporting.mjs';
import { showAlertModal } from './src/components/modal.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const runBtn = document.getElementById('run-btn');
  const exportBtn = document.getElementById('export-btn');
  const saveBtn = document.getElementById('save-btn');
  const exportJsonBtn = document.getElementById('export-json-btn');
  const exportHtmlBtn = document.getElementById('export-html-btn');
  const resultsEl = document.getElementById('results');
  const summaryEl = document.getElementById('summary');

  let lastStudy = null;

  runBtn.addEventListener('click', runStudy);
  exportBtn.addEventListener('click', exportCSV);
  saveBtn.addEventListener('click', saveStudy);
  exportJsonBtn.addEventListener('click', exportJSON);
  exportHtmlBtn.addEventListener('click', exportHTML);

  function numericValue(id, fallback) {
    const input = document.getElementById(id);
    const value = Number(input?.value);
    return Number.isFinite(value) ? value : fallback;
  }

  function textValue(id) {
    return String(document.getElementById(id)?.value || '').trim();
  }

  function readCriteria() {
    return {
      feederLimitPct: numericValue('feeder-limit-pct', 3),
      branchLimitPct: numericValue('branch-limit-pct', 3),
      totalLimitPct: numericValue('total-limit-pct', 5),
      normalLimitPct: numericValue('normal-limit-pct', 3),
      emergencyLimitPct: numericValue('emergency-limit-pct', 5),
      startingLimitPct: numericValue('starting-limit-pct', 10),
      warningMarginPct: numericValue('warning-margin-pct', 80),
      reportPreset: textValue('report-preset') || 'fullStudy',
    };
  }

  function readOperatingCase() {
    return {
      caseType: textValue('case-type') || 'normal',
      sourceVoltagePct: numericValue('source-voltage-pct', 100),
      transformerTapPct: numericValue('transformer-tap-pct', 0),
      loadPowerFactor: numericValue('load-power-factor', 0.9),
      conductorTemperatureC: numericValue('conductor-temperature-c', 75),
      conductorMaterialBasis: textValue('conductor-material-basis'),
      motorMinimumStartingVoltagePu: numericValue('motor-min-start-pu', 0.8),
      segmentChainBasisNote: textValue('segment-chain-basis-note'),
    };
  }

  function runStudy() {
    const cables = getCables();
    if (!cables || cables.length === 0) {
      showAlertModal('No Data', 'No cables found in the Cable Schedule. Add cables first.');
      return;
    }

    try {
      const studies = getStudies();
      lastStudy = buildVoltageDropStudyPackage({
        projectName: document.body.dataset.reportTitle || 'Voltage Drop Study',
        cables,
        criteria: readCriteria(),
        operatingCase: readOperatingCase(),
        motorStart: studies.motorStart,
      });
    } catch (err) {
      showAlertModal('Study Error', err.message);
      return;
    }

    setButtonsEnabled(true);
    renderSummary(lastStudy.summary);
    renderTable(lastStudy.rows, lastStudy.warningRows);
  }

  function setButtonsEnabled(enabled) {
    [exportBtn, saveBtn, exportJsonBtn, exportHtmlBtn].forEach(button => {
      if (button) button.disabled = !enabled;
    });
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
          <span class="result-label">Pass</span>
          <span class="result-value">${s.pass}</span>
        </div>
        <div class="result-card result-warn">
          <span class="result-label">Warn</span>
          <span class="result-value">${s.warn}</span>
        </div>
        <div class="result-card result-fail">
          <span class="result-label">Fail</span>
          <span class="result-value">${s.fail}</span>
        </div>
        <div class="result-card">
          <span class="result-label">Missing Data</span>
          <span class="result-value">${s.missingData || 0}</span>
        </div>
        <div class="result-card">
          <span class="result-label">Max Drop</span>
          <span class="result-value">${Number(s.maxDropPct || 0).toFixed(2)} %</span>
        </div>
        <div class="result-card">
          <span class="result-label">Avg Drop</span>
          <span class="result-value">${totalWithData ? Number(s.avgDropPct || 0).toFixed(2) : '-'} %</span>
        </div>
      </div>`;
  }

  function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function statusClass(status) {
    if (status === 'fail') return 'row-fail';
    if (status === 'warn') return 'row-warn';
    if (status === 'missingData') return 'row-warn';
    return '';
  }

  function formatNumber(value, digits = 2) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '-';
  }

  function renderTable(results, warningRows = []) {
    if (!results.length) {
      resultsEl.innerHTML = '<p>No cables to display.</p>';
      return;
    }

    const rows = results
      .slice()
      .sort((a, b) => Number(b.dropPct || 0) - Number(a.dropPct || 0))
      .map(r => `
        <tr class="${statusClass(r.status)}">
          <td>${esc(r.tag)}</td>
          <td>${esc(r.from)}</td>
          <td>${esc(r.to)}</td>
          <td>${esc(r.conductorSize)} ${esc(r.material)}</td>
          <td class="num">${formatNumber(r.lengthFt, 0)}</td>
          <td class="num">${formatNumber(r.currentA, 1)}</td>
          <td class="num">${formatNumber(r.voltageV, 0)}</td>
          <td class="num ${r.status === 'fail' ? 'fail-value' : ''}">${formatNumber(r.dropPct)}</td>
          <td class="num">${formatNumber(r.applicableLimitPct ?? r.limit)}</td>
          <td class="num">${formatNumber(r.totalChainDropPct)}</td>
          <td class="num">${r.startVoltagePu == null ? '-' : formatNumber(r.startVoltagePu, 3)}</td>
          <td>${esc(r.caseType || '')}</td>
          <td>${esc(r.circuitType)}</td>
          <td class="status-cell status-${esc(r.status)}">${esc(String(r.status || '').toUpperCase())}</td>
          <td>${esc(r.reason)}</td>
        </tr>`).join('');

    const warnings = warningRows.length
      ? `<h2>Warnings</h2><ul>${warningRows.map(row => `<li><strong>${esc(row.severity)}:</strong> ${esc(row.message)}</li>`).join('')}</ul>`
      : '';

    resultsEl.innerHTML = `
      <table class="results-table" aria-label="Voltage drop criteria results">
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
            <th scope="col" class="num">Total (%)</th>
            <th scope="col" class="num">Start V (pu)</th>
            <th scope="col">Case</th>
            <th scope="col">Type</th>
            <th scope="col">Status</th>
            <th scope="col">Reason</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${warnings}
      <details class="method-panel"><summary>Raw package JSON</summary><pre>${esc(JSON.stringify(lastStudy, null, 2))}</pre></details>`;
  }

  function exportCSV() {
    if (!lastStudy) return;
    const headers = [
      'Cable Tag', 'From', 'To', 'Conductor', 'Length (ft)', 'Load (A)', 'Voltage (V)',
      'Drop (%)', 'Limit (%)', 'Total Drop (%)', 'Start Voltage (pu)', 'Case', 'Circuit Type', 'Status', 'Reason',
    ];
    const rows = lastStudy.rows.map(r => [
      r.tag,
      r.from,
      r.to,
      `${r.conductorSize || ''} ${r.material || ''}`.trim(),
      Number.isFinite(Number(r.lengthFt)) ? Number(r.lengthFt).toFixed(0) : '',
      Number.isFinite(Number(r.currentA)) ? Number(r.currentA).toFixed(1) : '',
      Number.isFinite(Number(r.voltageV)) ? Number(r.voltageV).toFixed(0) : '',
      Number.isFinite(Number(r.dropPct)) ? Number(r.dropPct).toFixed(2) : '',
      Number.isFinite(Number(r.applicableLimitPct)) ? Number(r.applicableLimitPct).toFixed(2) : '',
      Number.isFinite(Number(r.totalChainDropPct)) ? Number(r.totalChainDropPct).toFixed(2) : '',
      r.startVoltagePu == null ? '' : Number(r.startVoltagePu).toFixed(3),
      r.caseType,
      r.circuitType,
      String(r.status || '').toUpperCase(),
      r.reason,
    ]);
    downloadCSV(headers, rows, 'voltage-drop-study.csv');
  }

  function saveStudy() {
    if (!lastStudy) return;
    setStudies({ ...getStudies(), voltageDropStudy: lastStudy });
    showAlertModal('Study Saved', 'Voltage drop study package saved to project studies.');
  }

  function downloadText(fileName, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportJSON() {
    if (!lastStudy) return;
    downloadText('voltage-drop-study-package.json', JSON.stringify(lastStudy, null, 2), 'application/json');
  }

  function exportHTML() {
    if (!lastStudy) return;
    downloadText('voltage-drop-study-package.html', renderVoltageDropStudyHTML(lastStudy), 'text/html');
  }
});
