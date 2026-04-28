import { getOneLine, getStudies, setStudies } from '../dataStore.mjs';
import {
  buildShortCircuitStudyPackage,
  normalizeShortCircuitStudyCase,
} from '../analysis/shortCircuitStudyCase.mjs';
import { downloadPDF } from '../reports/reporting.mjs';

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getProjectName() {
  return typeof document !== 'undefined' && document.body?.dataset?.projectName
    ? document.body.dataset.projectName
    : 'Untitled Project';
}

function studyCaseFromForm(form) {
  const data = new FormData(form);
  return normalizeShortCircuitStudyCase({
    method: data.get('method'),
    dutyBasis: data.get('dutyBasis'),
    voltageCase: data.get('voltageCase'),
    voltageSensitivityPct: data.get('voltageSensitivityPct'),
    equipmentDutySide: data.get('equipmentDutySide'),
    reportPreset: data.get('reportPreset'),
    faultTypes: data.getAll('faultTypes'),
    includeDcShortCircuit: data.get('includeDcShortCircuit') === 'on',
    notes: data.get('notes'),
    scope: {
      area: data.get('scopeArea'),
      zone: data.get('scopeZone'),
      minKv: data.get('scopeMinKv'),
      maxKv: data.get('scopeMaxKv'),
      includeText: data.get('scopeIncludeText'),
      excludeText: data.get('scopeExcludeText'),
    },
  });
}

function renderResults(container, pkg) {
  if (!container) return;
  const rows = Array.isArray(pkg.dutyRows) ? pkg.dutyRows : [];
  container.innerHTML = `
    <h2>Study Results</h2>
    <p class="field-hint">${escapeHtml(rows.length)} duty row(s), ${escapeHtml(pkg.summary?.review || 0)} review row(s), max duty ${escapeHtml(pkg.summary?.maxDutyKA || 0)} kA.</p>
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr><th>Bus</th><th>Method</th><th>Voltage Case</th><th>Prefault kV</th><th>3P kA</th><th>LG kA</th><th>LL kA</th><th>DLG kA</th><th>Duty Basis</th><th>Duty kA</th><th>Side</th><th>Status</th><th>Warnings</th></tr></thead>
        <tbody>${rows.length ? rows.map(row => `<tr>
          <td>${escapeHtml(row.busTag || row.busId)}</td>
          <td>${escapeHtml(row.method)}</td>
          <td>${escapeHtml(row.voltageCase)}</td>
          <td>${escapeHtml(row.prefaultKV ?? '')}</td>
          <td>${escapeHtml(row.threePhaseKA ?? '')}</td>
          <td>${escapeHtml(row.lineToGroundKA ?? '')}</td>
          <td>${escapeHtml(row.lineToLineKA ?? '')}</td>
          <td>${escapeHtml(row.doubleLineGroundKA ?? '')}</td>
          <td>${escapeHtml(row.dutyBasis)}</td>
          <td>${escapeHtml(row.dutyValueKA ?? '')}</td>
          <td>${escapeHtml(row.equipmentDutySide)}</td>
          <td>${escapeHtml(row.status)}</td>
          <td>${escapeHtml((row.warnings || []).join(' | ') || 'None')}</td>
        </tr>`).join('') : '<tr><td colspan="13">No buses matched the selected study scope.</td></tr>'}</tbody>
      </table>
    </div>
    ${(pkg.warnings || []).length ? `<div class="alert warning"><strong>Warnings:</strong><ul>${pkg.warnings.map(w => `<li>${escapeHtml(w.message || w)}</li>`).join('')}</ul></div>` : ''}
  `;
}

export function runShortCircuitStudy(opts = {}) {
  const pkg = buildShortCircuitStudyPackage({
    projectName: opts.projectName || getProjectName(),
    oneLine: getOneLine(),
    studyCase: opts.studyCase || opts,
  });
  const studies = getStudies();
  studies.shortCircuit = pkg;
  setStudies(studies);
  const rows = pkg.dutyRows.map(row => ({
    bus: row.busId,
    method: row.method,
    voltageCase: row.voltageCase,
    prefaultKV: row.prefaultKV,
    threePhaseKA: row.threePhaseKA,
    lineToGroundKA: row.lineToGroundKA,
    lineToLineKA: row.lineToLineKA,
    doubleLineGroundKA: row.doubleLineGroundKA,
    dutyBasis: row.dutyBasis,
    dutyValueKA: row.dutyValueKA,
    equipmentDutySide: row.equipmentDutySide,
    status: row.status,
  }));
  if (rows.length) {
    downloadPDF('Short-Circuit Study Case Report', Object.keys(rows[0]), rows, 'shortcircuit.pdf');
  }
  return pkg;
}

if (typeof document !== 'undefined') {
  const form = document.getElementById('shortcircuit-form');
  const out = document.getElementById('shortcircuit-output');
  const results = document.getElementById('shortcircuit-results');
  if (form && out) {
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      try {
        const studyCase = studyCaseFromForm(form);
        const res = runShortCircuitStudy({ studyCase });
        renderResults(results, res);
        out.textContent = JSON.stringify(res, null, 2);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (results) results.innerHTML = `<div class="alert error">${escapeHtml(message)}</div>`;
        out.textContent = message;
      }
    });
  }
}
