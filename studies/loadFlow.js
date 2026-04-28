import { buildLoadFlowModel } from '../analysis/loadFlowModel.js';
import { getOneLine, getStudies, setStudies } from '../dataStore.mjs';
import { downloadPDF } from '../reports/reporting.mjs';
import {
  buildLoadFlowStudyPackage,
  buildLoadFlowStudyRows,
  normalizeLoadFlowStudyCase,
  renderLoadFlowStudyHTML,
  runLoadFlowStudyCase,
} from '../analysis/loadFlowStudyCase.mjs';

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

function downloadText(filename, mimeType, text) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function buildModel() {
  return buildLoadFlowModel(getOneLine());
}

function studyCaseFromForm(form) {
  const data = new FormData(form);
  return normalizeLoadFlowStudyCase({
    baseMVA: data.get('baseMVA'),
    mode: data.get('mode'),
    loadModel: data.get('loadModel'),
    reportPreset: data.get('reportPreset'),
    voltageLimits: {
      minPu: data.get('minVoltagePu'),
      maxPu: data.get('maxVoltagePu'),
      warningMarginPu: data.get('warningMarginPu'),
    },
    openPhase: {
      enabled: data.get('openPhaseEnabled') === 'on',
      phases: data.getAll('openPhasePhases'),
    },
    includeControls: {
      transformerTaps: data.get('transformerTaps') === 'on',
      regulators: data.get('regulators') === 'on',
      capacitorSteps: data.get('capacitorSteps') === 'on',
      ibrVoltVar: data.get('ibrVoltVar') === 'on',
    },
    notes: data.get('notes'),
  });
}

function renderBusRows(container, rows) {
  if (!container) return;
  const busRows = rows.filter(row => row.rowType === 'bus');
  container.innerHTML = `
    <table class="data-table" id="loadflow-bus-table">
      <thead><tr><th>Enable</th><th>Bus</th><th>Type</th><th>Phases</th><th>Base kV</th><th>Vm set</th><th>A kW/kvar</th><th>B kW/kvar</th><th>C kW/kvar</th><th>Cap kvar</th><th>Control</th><th>Defaulted</th><th>Notes</th></tr></thead>
      <tbody>${busRows.length ? busRows.map(row => `<tr data-row-id="${escapeHtml(row.elementId)}">
        <td><input type="checkbox" data-field="enabled" ${row.enabled !== false ? 'checked' : ''}></td>
        <td><input data-field="elementTag" value="${escapeHtml(row.elementTag)}"></td>
        <td><select data-field="busType">${['slack', 'PV', 'PQ'].map(type => `<option value="${type}" ${row.busType === type ? 'selected' : ''}>${type}</option>`).join('')}</select></td>
        <td><input data-field="phases" value="${escapeHtml(row.phases.join(','))}"></td>
        <td><input type="number" step="0.001" data-field="baseKV" value="${escapeHtml(row.baseKV)}"></td>
        <td><input type="number" step="0.001" data-field="voltageSetpointPu" value="${escapeHtml(row.voltageSetpointPu)}"></td>
        ${['A', 'B', 'C'].map(phase => `<td class="inline-fields">
          <input type="number" step="0.001" data-field="${phase}LoadKw" value="${escapeHtml(row.perPhase?.[phase]?.loadKw || 0)}" aria-label="${phase} load kW">
          <input type="number" step="0.001" data-field="${phase}LoadKvar" value="${escapeHtml(row.perPhase?.[phase]?.loadKvar || 0)}" aria-label="${phase} load kvar">
        </td>`).join('')}
        <td><input type="number" step="0.001" data-field="capacitorKvar" value="${escapeHtml(row.capacitorKvar || 0)}"></td>
        <td><input data-field="controlMode" value="${escapeHtml(row.controlMode || 'none')}"></td>
        <td>${escapeHtml((row.defaultedFields || []).join(', ') || 'none')}</td>
        <td><input data-field="notes" value="${escapeHtml(row.notes || '')}"></td>
      </tr>`).join('') : '<tr><td colspan="13">No load-flow bus rows were found.</td></tr>'}</tbody>
    </table>`;
}

function renderBranchRows(container, rows) {
  if (!container) return;
  const branchRows = rows.filter(row => row.rowType === 'branch');
  container.innerHTML = `
    <table class="data-table" id="loadflow-branch-table">
      <thead><tr><th>Enable</th><th>Branch</th><th>From</th><th>To</th><th>Phases</th><th>Tap ratio</th><th>Control</th><th>Defaulted</th><th>Notes</th></tr></thead>
      <tbody>${branchRows.length ? branchRows.map(row => `<tr data-row-id="${escapeHtml(row.elementId)}">
        <td><input type="checkbox" data-field="enabled" ${row.enabled !== false ? 'checked' : ''}></td>
        <td><input data-field="elementTag" value="${escapeHtml(row.elementTag)}"></td>
        <td>${escapeHtml(row.fromBus)}</td>
        <td>${escapeHtml(row.toBus)}</td>
        <td><input data-field="phases" value="${escapeHtml(row.phases.join(','))}"></td>
        <td><input type="number" step="0.0001" data-field="tapRatio" value="${escapeHtml(row.tapRatio)}"></td>
        <td><input data-field="controlMode" value="${escapeHtml(row.controlMode || 'none')}"></td>
        <td>${escapeHtml((row.defaultedFields || []).join(', ') || 'none')}</td>
        <td><input data-field="notes" value="${escapeHtml(row.notes || '')}"></td>
      </tr>`).join('') : '<tr><td colspan="9">No branch/control rows were found.</td></tr>'}</tbody>
    </table>`;
}

function collectBusRows() {
  return Array.from(document.querySelectorAll('#loadflow-bus-table tbody tr[data-row-id]')).map(row => {
    const read = field => row.querySelector(`[data-field="${field}"]`);
    const perPhase = {};
    ['A', 'B', 'C'].forEach(phase => {
      perPhase[phase] = {
        loadKw: read(`${phase}LoadKw`)?.value,
        loadKvar: read(`${phase}LoadKvar`)?.value,
        generationKw: 0,
        generationKvar: 0,
      };
    });
    return {
      rowType: 'bus',
      elementId: row.dataset.rowId,
      enabled: read('enabled')?.checked !== false,
      elementTag: read('elementTag')?.value,
      busType: read('busType')?.value,
      phases: read('phases')?.value,
      baseKV: read('baseKV')?.value,
      voltageSetpointPu: read('voltageSetpointPu')?.value,
      capacitorKvar: read('capacitorKvar')?.value,
      controlMode: read('controlMode')?.value,
      perPhase,
      notes: read('notes')?.value,
    };
  });
}

function collectBranchRows() {
  return Array.from(document.querySelectorAll('#loadflow-branch-table tbody tr[data-row-id]')).map(row => {
    const read = field => row.querySelector(`[data-field="${field}"]`);
    return {
      rowType: 'branch',
      elementId: row.dataset.rowId,
      enabled: read('enabled')?.checked !== false,
      elementTag: read('elementTag')?.value,
      phases: read('phases')?.value,
      tapRatio: read('tapRatio')?.value,
      controlMode: read('controlMode')?.value,
      notes: read('notes')?.value,
    };
  });
}

function renderResults(container, pkg) {
  if (!container) return;
  const rows = Array.isArray(pkg.phaseRows) ? pkg.phaseRows : [];
  container.innerHTML = `
    <h2>Study Results</h2>
    <p class="field-hint">${escapeHtml(pkg.summary?.phaseRowCount || 0)} voltage row(s), ${escapeHtml(pkg.summary?.voltageViolationCount || 0)} voltage violation(s), ${escapeHtml((pkg.summary?.unbalanceFailCount || 0) + (pkg.summary?.unbalanceWarnCount || 0))} unbalance issue(s).</p>
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr><th>Bus</th><th>Phase</th><th>Vm</th><th>Angle</th><th>Voltage kV</th><th>Load kW</th><th>Generation kW</th><th>Status</th></tr></thead>
        <tbody>${rows.length ? rows.map(row => `<tr>
          <td>${escapeHtml(row.busTag || row.busId)}</td>
          <td>${escapeHtml(row.phase)}</td>
          <td>${escapeHtml(row.Vm)}</td>
          <td>${escapeHtml(row.Va)}</td>
          <td>${escapeHtml(row.voltageKV)}</td>
          <td>${escapeHtml(row.loadKw)}</td>
          <td>${escapeHtml(row.generationKw)}</td>
          <td>${escapeHtml(row.status)}</td>
        </tr>`).join('') : '<tr><td colspan="8">No rows were produced.</td></tr>'}</tbody>
      </table>
    </div>
    ${(pkg.warnings || []).length ? `<div class="alert warning"><strong>Warnings:</strong><ul>${pkg.warnings.map(w => `<li>${escapeHtml(w.message || w)}</li>`).join('')}</ul></div>` : ''}`;
}

export function runLoadFlowStudy(opts = {}) {
  const oneLine = opts.oneLine || getOneLine();
  const execution = runLoadFlowStudyCase({
    oneLine,
    studyCase: opts.studyCase || opts,
    rows: opts.rows || [],
  });
  const pkg = buildLoadFlowStudyPackage({
    projectName: opts.projectName || getProjectName(),
    ...execution,
  });
  const studies = getStudies();
  studies.loadFlow = pkg;
  setStudies(studies);
  const pdfRows = pkg.phaseRows.map(row => ({
    bus: row.busTag || row.busId,
    phase: row.phase,
    Vm: row.Vm,
    Va: row.Va,
    status: row.status,
  }));
  if (pdfRows.length) {
    downloadPDF('Load Flow Study Case Report', ['bus', 'phase', 'Vm', 'Va', 'status'], pdfRows, 'loadflow.pdf');
  }
  return pkg;
}

if (typeof document !== 'undefined') {
  const form = document.getElementById('loadflow-form');
  const out = document.getElementById('loadflow-output');
  const results = document.getElementById('loadflow-results');
  const rowEditor = document.getElementById('loadflow-row-editor');
  const branchEditor = document.getElementById('loadflow-branch-editor');
  let latestPackage = null;
  const initialRows = buildLoadFlowStudyRows({ oneLine: getOneLine() });
  renderBusRows(rowEditor, initialRows);
  renderBranchRows(branchEditor, initialRows);

  document.getElementById('loadflow-export-json')?.addEventListener('click', () => {
    if (!latestPackage) return;
    downloadText('load-flow-study-package.json', 'application/json', JSON.stringify(latestPackage, null, 2));
  });

  document.getElementById('loadflow-export-html')?.addEventListener('click', () => {
    if (!latestPackage) return;
    downloadText('load-flow-study-package.html', 'text/html', renderLoadFlowStudyHTML(latestPackage));
  });

  if (form && out) {
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      try {
        const pkg = runLoadFlowStudy({
          studyCase: studyCaseFromForm(form),
          rows: [...collectBusRows(), ...collectBranchRows()],
        });
        latestPackage = pkg;
        renderResults(results, pkg);
        out.textContent = JSON.stringify(pkg, null, 2);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (results) results.innerHTML = `<div class="alert error">${escapeHtml(message)}</div>`;
        out.textContent = message;
      }
    });
  }
}
