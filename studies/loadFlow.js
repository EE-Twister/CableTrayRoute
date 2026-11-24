import { buildLoadFlowModel } from '../analysis/loadFlowModel.js';
import { runLoadFlow } from '../analysis/loadFlow.js';
import { renderLoadFlowResultsHtml } from '../analysis/loadFlowResultsRenderer.js';
import { getOneLine, getStudies, getStudyAssessments, getStudyProvenance, captureStudyRunContext, saveStudyResult } from '../dataStore.mjs';
import { downloadPDF } from '../reports/reporting.mjs';
import { studyLifecycleMetadataRows } from '../analysis/studyExportMetadata.mjs';

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

  const slackBuses = buses.filter(bus => `${bus?.busType || bus?.type || ''}`.toLowerCase() === 'slack');
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

  const hasPositiveLoad = value => {
    if (Array.isArray(value)) return value.some(hasPositiveLoad);
    if (!value || typeof value !== 'object') return false;
    if (Number(value.kw ?? value.kW ?? value.P ?? 0) > 0) return true;
    return hasPositiveLoad(value.phases);
  };
  const hasLoad = buses.some(bus => hasPositiveLoad(bus?.load) || Number(bus?.Pd ?? 0) > 0);
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
  let model;
  let inputReadiness;
  try {
    model = buildModel();
    inputReadiness = validateLoadFlowModel(model);
  } catch (error) {
    return { blocked: true, converged: false, persisted: false, calculationStatus: 'unevaluated', validity: 'unevaluated', valid: false, errors: [error?.message || String(error)], warnings: [], buses: [], lines: [], inputReadiness: { ready: false, errors: [error?.message || String(error)], warnings: [], counts: {} } };
  }
  const requestedIterations = Number(opts.maxIterations);
  const effectiveOptions = {
    ...opts,
    // The ordinary study form does not expose an iteration field. Keep its
    // explicit solver tolerance and raise only the bounded radial iteration
    // budget needed by generated 30/50-load cases.
    maxIterations: Number.isFinite(requestedIterations) && requestedIterations > 0 ? Math.max(1, Math.floor(requestedIterations)) : 60,
  };
  const runContext = captureStudyRunContext('loadFlow', {
    inputs: effectiveOptions,
    options: effectiveOptions,
    assumptions: ['Balanced positive-sequence load-flow model when the balanced option is selected.'],
    warnings: inputReadiness.warnings,
  });
  const baseMVA = Number(effectiveOptions.baseMVA);
  if (!inputReadiness.ready || !Number.isFinite(baseMVA) || baseMVA <= 0) {
    const result = {
      blocked: true,
      converged: false,
      persisted: false,
      calculationStatus: 'unevaluated',
      validity: 'unevaluated',
      valid: false,
      errors: inputReadiness.errors,
      warnings: inputReadiness.warnings,
      buses: [],
      lines: [],
      inputReadiness: {
        ...inputReadiness,
        ready: false,
        errors: !Number.isFinite(baseMVA) || baseMVA <= 0
          ? [...inputReadiness.errors, 'Base MVA is required and must be greater than zero.']
          : inputReadiness.errors,
      },
    };
    try {
      saveStudyResult('loadFlow', result, runContext);
    } catch (error) {
      result.persistenceWarning = `Study was not saved: ${error.message || error}`;
      result.warnings = [...result.warnings, result.persistenceWarning];
    }
    return result;
  }
  const rawResult = runLoadFlow(model, effectiveOptions);
  const usable = isUsableLoadFlowResult(rawResult);
  const result = {
    ...rawResult,
    inputReadiness,
    persisted: usable
  };
  if (usable) {
    try {
      // The study store persists JSON. Canonicalize before hashing and saving
      // so properties whose value is undefined (and non-finite numbers) have
      // the same representation in provenance as they do after a reload.
      const storedResult = JSON.parse(JSON.stringify(result));
      saveStudyResult('loadFlow', storedResult, runContext);
    } catch (error) {
      result.persisted = false;
      result.persistenceWarning = `Study was calculated but not saved: ${error.message || error}`;
      result.warnings = [...(Array.isArray(result.warnings) ? result.warnings : []), result.persistenceWarning];
    }
  }
  return result;
}

export function exportLoadFlowResult(result) {
  if (!isUsableLoadFlowResult(result) || result.persisted !== true) return false;
  const assessment = getStudyAssessments().loadFlow;
  if (assessment && assessment.eligible !== true) return false;
  const headers = ['bus', 'Vm', 'Va', 'details'];
  const rows = result.buses.map(bus => ({
    bus: bus.displayLabel || bus.id,
    Vm: Number(bus.Vm.toFixed(4)),
    Va: Number(bus.Va.toFixed(2)),
    details: ''
  }));
  (result.lines || []).forEach(line => rows.push({
    bus: `Branch: ${line.from || ''} -> ${line.to || ''}`,
    Vm: '',
    Va: '',
    details: Number.isFinite(line.fromCurrentA) && Number.isFinite(line.toCurrentA)
      ? `From ${line.fromCurrentA.toFixed(1)} A / To ${line.toCurrentA.toFixed(1)} A; Voltage drop ${Number.isFinite(line.dropPct) ? line.dropPct.toFixed(2) : '--'}%${Number.isFinite(line.dropKV) ? ` (${Math.abs(line.dropKV) < 0.001 ? `${(line.dropKV * 1000).toFixed(1)} V` : `${line.dropKV.toFixed(3)} kV`})` : ''}; rated-voltage terminal bases`
      : `Current ${Number.isFinite(line.amps) ? line.amps.toFixed(1) : '--'} A; Voltage drop ${Number.isFinite(line.dropPct) ? line.dropPct.toFixed(2) : '--'}%`
  }));
  studyLifecycleMetadataRows(result, { assessment: getStudyAssessments().loadFlow })
    .forEach(([key, value]) => rows.push({ bus: `Lifecycle: ${key}`, Vm: value, Va: '' }));
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
    const saved = getStudies()?.loadFlow;
    const savedOptions = getStudyProvenance()?.loadFlow?.optionsSnapshot;
    if (savedOptions && typeof savedOptions === 'object') {
      if (savedOptions.baseMVA != null && form.baseMVA) form.baseMVA.value = savedOptions.baseMVA;
      if (savedOptions.balanced != null && form.balanced) form.balanced.checked = savedOptions.balanced === true;
    }
    let initialReadiness = null;
    try {
      initialReadiness = validateLoadFlowModel(buildModel());
      renderReadiness(initialReadiness);
    } catch (error) {
      initialReadiness = { ready: false, errors: [error?.message || String(error)], warnings: [], counts: {} };
      renderReadiness(initialReadiness);
    }
    if (initialReadiness?.ready !== false && isUsableLoadFlowResult(saved)) {
      lastValidResult = saved;
      const assessment = getStudyAssessments().loadFlow;
      output.innerHTML = renderLoadFlowResultsHtml(saved, { stale: assessment?.freshness !== 'current' || assessment?.eligible !== true });
      if (exportBtn) exportBtn.disabled = false;
    }
    form.addEventListener('submit', event => {
      event.preventDefault();
      const rawBaseMVA = String(form.baseMVA?.value ?? '').trim();
      const baseMVA = Number(rawBaseMVA);
      const balanced = form.balanced.checked;
      if (!rawBaseMVA || !Number.isFinite(baseMVA) || baseMVA <= 0) {
        const invalidResult = runLoadFlowStudy({ baseMVA: null, balanced });
        const invalid = invalidResult.inputReadiness;
        renderReadiness(invalid);
        output.innerHTML = '<div class="result-card result-warn"><strong>Input review required.</strong><p>Enter a valid positive base MVA before running the study.</p></div>';
        lastValidResult = null;
        if (exportBtn) exportBtn.disabled = true;
        return;
      }
      let result;
      try {
        result = runLoadFlowStudy({ baseMVA, balanced });
      } catch (error) {
        renderReadiness({ ready: false, errors: [error?.message || String(error)], warnings: [], counts: {} });
        output.innerHTML = '<div class="result-card result-fail"><strong>Study input error.</strong><p>Correct the highlighted model input before running the study.</p></div>';
        lastValidResult = null;
        if (exportBtn) exportBtn.disabled = true;
        return;
      }
      renderReadiness(result.inputReadiness);
      output.innerHTML = renderLoadFlowResultsHtml(result);
      lastValidResult = result.persisted === true && isUsableLoadFlowResult(result) ? result : null;
      if (exportBtn) exportBtn.disabled = !lastValidResult;
    });
    exportBtn?.addEventListener('click', () => exportLoadFlowResult(lastValidResult));
  }
}
