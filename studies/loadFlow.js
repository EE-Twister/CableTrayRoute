import { buildLoadFlowModel } from '../analysis/loadFlowModel.js';
import { runLoadFlow } from '../analysis/loadFlow.js';
import { renderLoadFlowResultsHtml } from '../analysis/loadFlowResultsRenderer.js';
import { getOneLine, getStudies, setStudies } from '../dataStore.mjs';
import { downloadPDF } from '../reports/reporting.mjs';

export function buildModel() {
  return buildLoadFlowModel(getOneLine());
}

export function validateLoadFlowModel(model) {
  const buses = Array.isArray(model?.buses) ? model.buses : [];
  const branches = Array.isArray(model?.branches) ? model.branches : [];
  const errors = [];
  const warnings = [];

  if (buses.length < 2) errors.push('At least two connected buses are required.');
  if (!branches.length) errors.push('At least one branch is required.');

  const slackBuses = buses.filter(bus => `${bus?.type || ''}`.toLowerCase() === 'slack');
  if (!slackBuses.length) errors.push('A source or slack bus is required.');
  if (slackBuses.length > 1) warnings.push('Multiple slack buses were found; confirm the intended source configuration.');

  buses.forEach(bus => {
    if (!(Number(bus?.baseKV) > 0)) {
      errors.push(`Bus ${bus?.displayLabel || bus?.label || bus?.id || 'unknown'} needs a valid base voltage.`);
    }
  });

  const connected = new Set();
  branches.forEach(branch => {
    if (branch?.from) connected.add(branch.from);
    if (branch?.to) connected.add(branch.to);
  });
  buses.filter(bus => bus?.id && !connected.has(bus.id)).forEach(bus => {
    errors.push(`Bus ${bus.displayLabel || bus.label || bus.id} is isolated.`);
  });

  const hasLoad = buses.some(bus => Number(bus?.load?.kw ?? bus?.Pd ?? 0) > 0);
  if (!hasLoad) warnings.push('No positive load was found; the study may only verify the unloaded network.');

  return {
    ready: errors.length === 0,
    errors,
    warnings,
    counts: {
      buses: buses.length,
      branches: branches.length,
      slackBuses: slackBuses.length
    }
  };
}

export function isUsableLoadFlowResult(result) {
  const buses = Array.isArray(result?.buses) ? result.buses : [];
  return result?.converged === true
    && buses.length > 0
    && buses.every(bus => Number.isFinite(bus?.Vm) && bus.Vm > 0 && bus.Vm < 2);
}

export function runLoadFlowStudy(opts = {}) {
  const model = buildModel();
  const inputReadiness = validateLoadFlowModel(model);
  if (!inputReadiness.ready) {
    return {
      blocked: true,
      converged: false,
      persisted: false,
      errors: inputReadiness.errors,
      warnings: inputReadiness.warnings,
      buses: [],
      lines: [],
      inputReadiness
    };
  }

  const rawResult = runLoadFlow(model, opts);
  const usable = isUsableLoadFlowResult(rawResult);
  const result = {
    ...rawResult,
    inputReadiness,
    persisted: usable
  };
  if (usable) {
    const studies = getStudies();
    studies.loadFlow = result;
    setStudies(studies);
  }
  return result;
}

export function exportLoadFlowResult(result) {
  if (!isUsableLoadFlowResult(result)) return false;
  const headers = ['bus', 'Vm', 'Va'];
  const rows = result.buses.map(bus => ({
    bus: bus.displayLabel || bus.id,
    Vm: Number(bus.Vm.toFixed(4)),
    Va: Number(bus.Va.toFixed(2))
  }));
  downloadPDF('Load Flow Report', headers, rows, 'loadflow.pdf');
  return true;
}

if (typeof document !== 'undefined') {
  const form = document.getElementById('loadflow-form');
  const output = document.getElementById('loadflow-output');
  const readiness = document.getElementById('loadflow-readiness');
  const exportBtn = document.getElementById('export-loadflow-btn');
  let lastValidResult = null;

  const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const renderReadiness = status => {
    if (!readiness) return;
    const errors = status?.errors || [];
    const warnings = status?.warnings || [];
    const counts = status?.counts || {};
    const stateClass = status?.ready ? 'result-ok' : 'result-warn';
    let html = `<div class="result-card ${stateClass}"><strong>${status?.ready ? 'Ready to solve' : 'Input review required'}</strong>`;
    if (Number.isFinite(counts.buses)) {
      html += `<p>${counts.buses} buses, ${counts.branches} branches, ${counts.slackBuses} source buses.</p>`;
    }
    if (errors.length) html += `<ul>${errors.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    if (warnings.length) html += `<ul>${warnings.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    readiness.innerHTML = `${html}</div>`;
  };

  if (form && output) {
    renderReadiness(validateLoadFlowModel(buildModel()));
    form.addEventListener('submit', event => {
      event.preventDefault();
      const baseMVA = Number(form.baseMVA.value) || 100;
      const balanced = form.balanced.checked;
      const result = runLoadFlowStudy({ baseMVA, balanced });
      renderReadiness(result.inputReadiness);
      output.innerHTML = renderLoadFlowResultsHtml(result);
      lastValidResult = isUsableLoadFlowResult(result) ? result : null;
      if (exportBtn) exportBtn.disabled = !lastValidResult;
    });
    exportBtn?.addEventListener('click', () => exportLoadFlowResult(lastValidResult));
  }
}
