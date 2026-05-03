/**
 * Equipment Duty Evaluation — Page orchestration (Gap #80)
 *
 * Loads one-line components, cable schedule, and study results, then runs
 * the equipment evaluation engine and renders pass/fail/incomplete results.
 */
import './workflowStatus.js';
import '../site.js';

import {
  evaluateEquipment,
  buildEquipmentReport,
  summariseEvaluation,
  REPORT_HEADERS,
} from '../analysis/equipmentEvaluation.mjs';
import {
  getCables,
  getStudies,
  getOneLine,
} from '../dataStore.mjs';
import protectiveDevices from '../data/protectiveDevices.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const runBtn         = document.getElementById('equip-run-btn');
  const filterStatus   = document.getElementById('equip-filter-status');
  const filterType     = document.getElementById('equip-filter-type');
  const exportCsvBtn   = document.getElementById('equip-export-csv-btn');
  const tableWrap      = document.getElementById('equip-table-wrap');
  const table          = document.getElementById('equip-table');
  const tbody          = document.getElementById('equip-table-body');
  const emptyMsg       = document.getElementById('equip-empty-msg');

  let lastEvaluations = null;

  runBtn.addEventListener('click', runAndRender);
  filterStatus.addEventListener('change', () => { if (lastEvaluations) renderTable(lastEvaluations); });
  filterType.addEventListener('change',   () => { if (lastEvaluations) renderTable(lastEvaluations); });

  exportCsvBtn.addEventListener('click', () => {
    if (!lastEvaluations) return;
    const rows  = buildEquipmentReport(lastEvaluations);
    const lines = [REPORT_HEADERS, ...rows]
      .map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([lines], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'equipment-evaluation.csv' });
    a.click();
    URL.revokeObjectURL(url);
  });

  function runAndRender() {
    runBtn.disabled = true;
    runBtn.textContent = 'Running…';
    try {
      const components = flattenComponents(getOneLine());
      const cables     = getCables() || [];
      const studies    = getStudies() || {};

      lastEvaluations = evaluateEquipment(components, cables, studies, protectiveDevices);
      renderKpis(lastEvaluations);
      renderTable(lastEvaluations);
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = 'Run Evaluation';
    }
  }

  function renderKpis(evals) {
    const { total, pass, fail, incomplete } = summariseEvaluation(evals);
    document.getElementById('kpi-total').textContent      = total;
    document.getElementById('kpi-pass').textContent       = pass;
    document.getElementById('kpi-fail').textContent       = fail;
    document.getElementById('kpi-incomplete').textContent = incomplete;
  }

  function renderTable(evals) {
    const statusFilter = filterStatus.value;
    const typeFilter   = filterType.value;

    // Expand evaluations to per-check rows for filtering
    const rows = [];
    for (const entry of evals) {
      for (const [checkName, result] of Object.entries(entry.checks)) {
        if (!result) continue;
        const typeGroup = entryTypeGroup(entry.type);
        if (statusFilter !== 'all' && result.status !== statusFilter) continue;
        if (typeFilter   !== 'all' && typeGroup  !== typeFilter)       continue;
        rows.push({ entry, checkName, result });
      }
    }

    tbody.innerHTML = '';

    if (rows.length === 0) {
      table.hidden = true;
      emptyMsg.hidden = false;
      emptyMsg.textContent = evals.length === 0
        ? 'No equipment found. Add components to the one-line diagram and run studies first.'
        : 'No items match the current filter.';
      return;
    }

    table.hidden  = false;
    emptyMsg.hidden = true;

    for (const { entry, checkName, result } of rows) {
      const tr  = document.createElement('tr');
      const aic = checkName === 'aic'      ? result.ratingKA      : null;
      const wst = checkName === 'withstand' ? result.ratingKA     : null;
      const scc = checkName === 'sccr'     ? result.sccrKA        : null;
      const thm = checkName === 'thermal'  ? result.actualMm2     : null;

      const ratingStr  = aic  != null ? `${aic} kA`
                       : wst  != null ? `${wst} kA`
                       : scc  != null ? `${scc} kA`
                       : thm  != null ? `${thm} mm²`
                       : '—';
      const faultStr   = result.faultKA  != null ? `${result.faultKA}` : '—';
      const marginStr  = result.marginKA != null ? `${result.marginKA}` : '—';
      const notes      = _checkNoteUI(checkName, result);

      tr.innerHTML = `
        <td>${esc(entry.label)}</td>
        <td>${esc(entry.type)}${entry.subtype ? ` / ${esc(entry.subtype)}` : ''}</td>
        <td>${esc(checkLabel(checkName))}</td>
        <td><span class="status-badge status-badge--${result.status}">${esc(result.status)}</span></td>
        <td>${esc(ratingStr)}</td>
        <td>${esc(faultStr)}</td>
        <td>${esc(marginStr)}</td>
        <td class="equip-notes">${esc(notes)}</td>
      `;
      tbody.appendChild(tr);
    }
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flattenComponents(oneLine) {
  if (!oneLine) return [];
  const sheets = Array.isArray(oneLine.sheets) ? oneLine.sheets : [];
  return sheets.flatMap(s => Array.isArray(s.components) ? s.components : []);
}

function entryTypeGroup(type) {
  if (type === 'breaker' || type === 'fuse' || type === 'relay' || type === 'disconnect' || type === 'recloser') return 'breaker';
  if (type === 'switchboard' || type === 'panel' || type === 'mcc' || type === 'busway' || type === 'dc_bus') return 'switchboard';
  if (type === 'cable') return 'cable';
  return 'other';
}

function checkLabel(name) {
  const LABELS = {
    aic:      'AIC (Interrupting)',
    withstand: 'Withstand (I²t)',
    sccr:     'SCCR',
    thermal:  'Cable I²t Duty',
  };
  return LABELS[name] ?? name;
}

function _checkNoteUI(checkName, result) {
  if (result.status === 'incomplete') {
    if (checkName === 'aic' && result.ratingKA == null)       return 'Enter interrupt rating in one-line properties.';
    if (checkName === 'aic' && result.faultKA == null)        return 'Run Short Circuit study first.';
    if (checkName === 'withstand' && result.ratingKA == null) return 'Enter withstand rating in one-line properties.';
    if (checkName === 'sccr' && result.sccrKA == null)        return 'Enter SCCR in one-line properties.';
    if (checkName === 'thermal' && result.actualMm2 == null)  return 'Specify conductor size in one-line properties.';
    if (checkName === 'thermal' && result.faultKA == null)    return 'No short-circuit data for this cable.';
    return 'Missing data.';
  }
  if (result.status === 'fail') {
    if (checkName === 'aic')       return `Fault ${result.faultKA} kA > rating ${result.ratingKA} kA.`;
    if (checkName === 'withstand') return `Fault ${result.faultKA} kA > adj. withstand ${result.adjustedRatingKA} kA.`;
    if (checkName === 'sccr')      return `Fault ${result.faultKA} kA > SCCR ${result.sccrKA} kA.`;
    if (checkName === 'thermal')   return `Min ${result.minMm2} mm² > actual ${result.actualMm2} mm².`;
  }
  return '';
}

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
