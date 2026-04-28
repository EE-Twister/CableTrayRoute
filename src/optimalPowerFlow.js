import './workflowStatus.js';
import '../site.js';
import { buildLoadFlowModel } from '../analysis/loadFlowModel.js';
import {
  buildOptimalPowerFlowPackage,
  normalizeOptimalPowerFlowCase,
  renderOptimalPowerFlowHTML,
} from '../analysis/optimalPowerFlow.mjs';
import { getOneLine, getStudies, setStudies } from '../dataStore.mjs';
import { getProjectState } from '../projectStorage.js';

let generatorRows = [];
let latestPackage = null;

function esc(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function numberInputValue(id, fallback) {
  const value = Number.parseFloat(document.getElementById(id)?.value);
  return Number.isFinite(value) ? value : fallback;
}

function setStatus(message, variant = 'info') {
  const el = document.getElementById('opf-status');
  if (!el) return;
  el.textContent = message;
  el.className = `report-status report-status--${variant}`;
}

function downloadText(filename, content, mediaType = 'application/json') {
  const blob = new Blob([content], { type: mediaType });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

function currentProjectName() {
  return getProjectState()?.name || 'Untitled Project';
}

function currentModel() {
  return buildLoadFlowModel(getOneLine());
}

function loadGeneratorsFromOneLine() {
  const normalized = normalizeOptimalPowerFlowCase({
    projectName: currentProjectName(),
    model: currentModel(),
  });
  generatorRows = normalized.generators.length ? normalized.generators : [{
    id: 'GEN-1',
    tag: 'Manual Generator 1',
    busId: normalized.model.buses?.[0]?.id || 'source',
    enabled: true,
    pMinKw: 0,
    pMaxKw: Math.max(0, normalized.totalDemandKw),
    qMinKvar: 0,
    qMaxKvar: 0,
    costNoLoad: 0,
    costPerKwh: 0,
    costQuadratic: 0,
    source: 'manual',
  }];
}

function updateGeneratorRow(index, key, value) {
  const row = generatorRows[index];
  if (!row) return;
  if (key === 'enabled') {
    row.enabled = Boolean(value);
  } else if (['pMinKw', 'pMaxKw', 'qMinKvar', 'qMaxKvar', 'costNoLoad', 'costPerKwh', 'costQuadratic', 'rampLimitKw'].includes(key)) {
    const parsed = Number.parseFloat(value);
    row[key] = Number.isFinite(parsed) ? parsed : 0;
  } else {
    row[key] = value;
  }
}

function renderGeneratorTable() {
  const container = document.getElementById('opf-generator-table');
  if (!container) return;
  container.innerHTML = `<table class="report-table opf-table">
    <thead><tr><th>Use</th><th>ID</th><th>Tag</th><th>Bus</th><th>Min kW</th><th>Max kW</th><th>Min kVAR</th><th>Max kVAR</th><th>No-load Cost</th><th>Cost/kWh</th><th>Quad Cost</th><th>Ramp kW</th><th></th></tr></thead>
    <tbody>${generatorRows.map((row, index) => `<tr>
      <td><input type="checkbox" data-opf-gen="${index}" data-key="enabled" ${row.enabled !== false ? 'checked' : ''} aria-label="Enable generator ${esc(row.id)}"></td>
      <td><input class="opf-generator-input" data-opf-gen="${index}" data-key="id" value="${esc(row.id)}"></td>
      <td><input class="opf-generator-input" data-opf-gen="${index}" data-key="tag" value="${esc(row.tag || row.id)}"></td>
      <td><input class="opf-generator-input" data-opf-gen="${index}" data-key="busId" value="${esc(row.busId)}"></td>
      <td><input class="opf-generator-input" type="number" step="1" data-opf-gen="${index}" data-key="pMinKw" value="${esc(row.pMinKw ?? 0)}"></td>
      <td><input class="opf-generator-input" type="number" step="1" data-opf-gen="${index}" data-key="pMaxKw" value="${esc(row.pMaxKw ?? 0)}"></td>
      <td><input class="opf-generator-input" type="number" step="1" data-opf-gen="${index}" data-key="qMinKvar" value="${esc(row.qMinKvar ?? 0)}"></td>
      <td><input class="opf-generator-input" type="number" step="1" data-opf-gen="${index}" data-key="qMaxKvar" value="${esc(row.qMaxKvar ?? 0)}"></td>
      <td><input class="opf-generator-input" type="number" step="0.01" data-opf-gen="${index}" data-key="costNoLoad" value="${esc(row.costNoLoad ?? 0)}"></td>
      <td><input class="opf-generator-input" type="number" step="0.001" data-opf-gen="${index}" data-key="costPerKwh" value="${esc(row.costPerKwh ?? 0)}"></td>
      <td><input class="opf-generator-input" type="number" step="0.0001" data-opf-gen="${index}" data-key="costQuadratic" value="${esc(row.costQuadratic ?? 0)}"></td>
      <td><input class="opf-generator-input" type="number" step="1" data-opf-gen="${index}" data-key="rampLimitKw" value="${esc(row.rampLimitKw ?? 0)}"></td>
      <td><button type="button" class="btn secondary-btn" data-opf-remove="${index}">Remove</button></td>
    </tr>`).join('')}</tbody>
  </table>`;
  container.querySelectorAll('[data-opf-gen]').forEach(input => {
    input.addEventListener('input', () => updateGeneratorRow(Number(input.dataset.opfGen), input.dataset.key, input.type === 'checkbox' ? input.checked : input.value));
    input.addEventListener('change', () => updateGeneratorRow(Number(input.dataset.opfGen), input.dataset.key, input.type === 'checkbox' ? input.checked : input.value));
  });
  container.querySelectorAll('[data-opf-remove]').forEach(button => {
    button.addEventListener('click', () => {
      generatorRows.splice(Number(button.dataset.opfRemove), 1);
      renderGeneratorTable();
    });
  });
}

function buildContext() {
  return {
    projectName: currentProjectName(),
    model: currentModel(),
    generators: generatorRows,
    constraints: {
      objectiveMode: document.getElementById('opf-objective')?.value || 'cost',
      reserveMarginPct: numberInputValue('opf-reserve', 0),
      voltageMinPu: numberInputValue('opf-voltage-min', 0.95),
      voltageMaxPu: numberInputValue('opf-voltage-max', 1.05),
      branchLoadingMaxPct: numberInputValue('opf-branch-max', 100),
    },
  };
}

function renderSummary(pkg) {
  const container = document.getElementById('opf-summary');
  if (!container) return;
  const s = pkg.summary || {};
  const status = s.feasible ? 'Feasible' : 'Action Required';
  container.innerHTML = [
    ['Status', status, `${s.fail || 0} fail, ${s.warn || 0} warning`],
    ['Dispatched', `${s.totalDispatchedKw ?? 0} kW`, `${s.dispatchedCount || 0} generator(s)`],
    ['Objective', s.objectiveMode || 'cost', `Score ${s.objectiveScore ?? '--'}`],
    ['Generation Cost', s.generationCost ?? 0, 'Economic dispatch objective component'],
    ['Losses', `${s.lossKw ?? 0} kW`, 'Load-flow feasibility result'],
    ['Missing Data', s.missingData || 0, 'Cost, limit, or branch rating warnings'],
  ].map(([label, value, helper]) => `<article class="opf-stat">
    <strong>${esc(value)}</strong>
    <span>${esc(label)}</span>
    <small>${esc(helper)}</small>
  </article>`).join('');
}

function renderDispatch(pkg) {
  const container = document.getElementById('opf-dispatch');
  if (!container) return;
  const rows = pkg.dispatchRows || [];
  container.innerHTML = `<table class="report-table opf-table">
    <thead><tr><th>Generator</th><th>Bus</th><th>Min kW</th><th>Max kW</th><th>Dispatch kW</th><th>Dispatch kVAR</th><th>Marginal Cost</th><th>Status</th><th>Binding</th></tr></thead>
    <tbody>${rows.length ? rows.map(row => `<tr>
      <td>${esc(row.generatorTag || row.generatorId)}</td>
      <td>${esc(row.busId)}</td>
      <td>${esc(row.pMinKw)}</td>
      <td>${esc(row.pMaxKw)}</td>
      <td>${esc(row.dispatchedKw)}</td>
      <td>${esc(row.dispatchedKvar)}</td>
      <td>${esc(row.marginalCost)}</td>
      <td>${esc(row.status)}</td>
      <td>${esc((row.bindingConstraints || []).join(', '))}</td>
    </tr>`).join('') : '<tr><td colspan="9">No dispatch rows.</td></tr>'}</tbody>
  </table>`;
}

function renderConstraints(pkg) {
  const container = document.getElementById('opf-constraints');
  if (!container) return;
  const rows = pkg.constraintRows || [];
  container.innerHTML = `<table class="report-table opf-table">
    <thead><tr><th>Target</th><th>Metric</th><th>Limit</th><th>Actual</th><th>Margin</th><th>Status</th><th>Recommendation</th></tr></thead>
    <tbody>${rows.length ? rows.map(row => `<tr>
      <td>${esc(row.targetId)}</td>
      <td>${esc(row.metric)}</td>
      <td>${esc(row.limit)}</td>
      <td>${esc(row.actualValue ?? '')}</td>
      <td>${esc(row.margin ?? '')}</td>
      <td>${esc(row.status)}</td>
      <td>${esc(row.recommendation)}</td>
    </tr>`).join('') : '<tr><td colspan="7">No constraints evaluated.</td></tr>'}</tbody>
  </table>
  ${(pkg.warnings || []).length ? `<h3>Warnings</h3><ul>${pkg.warnings.map(warning => `<li>${esc(warning.message || warning)}</li>`).join('')}</ul>` : ''}`;
}

function renderPackage(pkg) {
  renderSummary(pkg);
  renderDispatch(pkg);
  renderConstraints(pkg);
}

function runStudy() {
  latestPackage = buildOptimalPowerFlowPackage({
    ...buildContext(),
    options: { baseMVA: numberInputValue('opf-base-mva', 100), balanced: true },
  });
  renderPackage(latestPackage);
  setStatus(latestPackage.summary?.feasible ? 'OPF screening completed with no failing constraints.' : 'OPF screening completed with action-required constraints or missing data.', latestPackage.summary?.feasible ? 'success' : 'warn');
}

function saveStudy() {
  if (!latestPackage) runStudy();
  const studies = getStudies();
  studies.optimalPowerFlow = latestPackage;
  setStudies(studies);
  setStatus('Optimal Power Flow result saved to study results.', 'success');
}

function wireControls() {
  document.getElementById('opf-form')?.addEventListener('submit', event => {
    event.preventDefault();
    runStudy();
  });
  document.getElementById('opf-save')?.addEventListener('click', saveStudy);
  document.getElementById('opf-add-generator')?.addEventListener('click', () => {
    const next = generatorRows.length + 1;
    generatorRows.push({
      id: `GEN-${next}`,
      tag: `Manual Generator ${next}`,
      busId: currentModel().buses?.[0]?.id || 'source',
      enabled: true,
      pMinKw: 0,
      pMaxKw: 0,
      qMinKvar: 0,
      qMaxKvar: 0,
      costNoLoad: 0,
      costPerKwh: 0,
      costQuadratic: 0,
      source: 'manual',
    });
    renderGeneratorTable();
  });
  document.getElementById('opf-reload-oneline')?.addEventListener('click', () => {
    loadGeneratorsFromOneLine();
    renderGeneratorTable();
    setStatus('Generator rows reloaded from the current one-line load-flow model.', 'info');
  });
  document.getElementById('opf-export-json')?.addEventListener('click', () => {
    if (!latestPackage) runStudy();
    downloadText('optimal-power-flow-package.json', JSON.stringify(latestPackage, null, 2), 'application/json');
  });
  document.getElementById('opf-export-html')?.addEventListener('click', () => {
    if (!latestPackage) runStudy();
    downloadText('optimal-power-flow-package.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Optimal Power Flow</title></head><body>${renderOptimalPowerFlowHTML(latestPackage)}</body></html>`, 'text/html');
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();
  loadGeneratorsFromOneLine();
  const saved = getStudies().optimalPowerFlow;
  if (saved?.dispatchRows) {
    latestPackage = saved;
    generatorRows = saved.dispatchRows.map(row => ({
      id: row.generatorId,
      tag: row.generatorTag,
      busId: row.busId,
      enabled: row.enabled !== false,
      pMinKw: row.pMinKw,
      pMaxKw: row.pMaxKw,
      qMinKvar: row.qMinKvar,
      qMaxKvar: row.qMaxKvar,
      costNoLoad: 0,
      costPerKwh: row.marginalCost || 0,
      costQuadratic: 0,
      source: row.source || 'savedStudy',
    }));
    renderPackage(saved);
  }
  renderGeneratorTable();
  wireControls();
});
