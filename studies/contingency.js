import { runContingency } from '../analysis/contingency.mjs';
import { buildLoadFlowModel } from '../analysis/loadFlowModel.js';
import {
  createStudyRunMetadata,
  evaluateConvergenceCoverage,
  isStudyResultStale,
  validatePowerFlowStudyModel
} from '../analysis/studyResultReadiness.mjs';
import { getOneLine, getStudies, setStudies } from '../dataStore.mjs';

/**
 * Run N-1 contingency analysis and store results.
 * @param {object} [opts]
 * @param {number} [opts.voltageMinPu=0.95]
 * @param {number} [opts.voltageMaxPu=1.05]
 * @param {number} [opts.overloadThresholdPct=100]
 * @param {number} [opts.baseMVA=100]
 * @returns {object} contingency results
 */
export function runContingencyStudy(opts = {}, inputModel = null, inputReadiness = null) {
  const model = inputModel || buildLoadFlowModel(getOneLine());
  const readiness = inputReadiness || validatePowerFlowStudyModel(model);
  if (!readiness.ready) {
    return {
      persisted: false,
      valid: false,
      errors: readiness.errors,
      baseCase: { converged: false },
      contingencies: [],
      summary: { totalBranches: 0, criticalContingencies: 0, totalViolations: 0, transientlyUnstable: 0 },
      runMetadata: createStudyRunMetadata(
        'contingency',
        readiness,
        evaluateConvergenceCoverage(0, 1, { minimumRatio: 1 })
      )
    };
  }

  const results = runContingency(model, opts);
  const baseCoverage = evaluateConvergenceCoverage(results.baseCase?.converged ? 1 : 0, 1, { minimumRatio: 1 });
  const valid = baseCoverage.valid && results.contingencies.length > 0;
  results.runMetadata = createStudyRunMetadata('contingency', readiness, baseCoverage, {
    source: 'One-Line Diagram',
    contingencyCount: results.contingencies.length,
    valid
  });
  results.persisted = valid;
  if (!valid) return results;
  const studies = getStudies();
  studies.contingency = results;
  setStudies(studies);
  return results;
}

// Browser hook: wire up the form and render results table
if (typeof document !== 'undefined') {
  const form = document.getElementById('contingency-form');
  const summaryEl = document.getElementById('contingency-summary');
  const tableBody = document.getElementById('contingency-tbody');
  const statusEl = document.getElementById('contingency-status');
  const readinessEl = document.getElementById('contingency-readiness');
  const exportBtn = document.getElementById('export-contingency-btn');
  let lastValidResult = null;

  const renderReadiness = (readiness, options = {}) => {
    const errors = readiness?.errors || [];
    const warnings = readiness?.warnings || [];
    const counts = readiness?.counts || {};
    const stale = options.stale === true;
    const cls = readiness?.ready && !stale ? 'result-ok' : 'result-warn';
    let html = `<div class="result-card ${cls}"><strong>${stale ? 'Saved result is stale' : readiness?.ready ? 'Base network ready' : 'Base network review required'}</strong>`;
    if (Number.isFinite(counts.buses)) html += `<p>${counts.buses} buses and ${counts.branches} removable branches detected.</p>`;
    if (stale) html += '<p>The One-Line model changed after this result was run. Re-run before exporting or relying on it.</p>';
    if (errors.length) html += `<ul>${errors.map(error => `<li>${escapeHtml(error)}</li>`).join('')}</ul>`;
    if (warnings.length) html += `<ul>${warnings.map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>`;
    readinessEl.innerHTML = `${html}</div>`;
  };

  const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const initialModel = buildLoadFlowModel(getOneLine());
  const initialReadiness = validatePowerFlowStudyModel(initialModel);
  const saved = getStudies().contingency;
  const stale = isStudyResultStale(saved, initialReadiness.sourceFingerprint);
  lastValidResult = saved?.persisted && !stale ? saved : null;
  exportBtn.disabled = !lastValidResult;
  renderReadiness(initialReadiness, { stale });

  if (form) {
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const baseMVA = Number(form.baseMVA?.value) || 100;
      const voltageMin = Number(form.voltageMin?.value) || 0.95;
      const voltageMax = Number(form.voltageMax?.value) || 1.05;
      const overloadPct = Number(form.overloadPct?.value) || 100;
      const checkTransientStability = !!form.checkTransientStability?.checked;
      const generatorInertiaH = Number(form.generatorInertiaH?.value) || 5.0;
      const faultClearingTime_s = Number(form.faultClearingTime_s?.value) || 0.1;

      if (statusEl) statusEl.textContent = 'Running…';
      if (summaryEl) summaryEl.textContent = '';
      if (tableBody) tableBody.innerHTML = '';

      let results;
      try {
        const model = buildLoadFlowModel(getOneLine());
        const readiness = validatePowerFlowStudyModel(model);
        renderReadiness(readiness);
        results = runContingencyStudy({
          baseMVA,
          voltageMinPu: voltageMin,
          voltageMaxPu: voltageMax,
          overloadThresholdPct: overloadPct,
          checkTransientStability,
          generatorInertiaH,
          faultClearingTime_s,
        }, model, readiness);
      } catch (err) {
        if (statusEl) statusEl.textContent = `Error: ${err.message}`;
        return;
      }

      if (!results.persisted) {
        if (statusEl) {
          const detail = results.errors?.join(' ')
            || (!results.baseCase?.converged
              ? 'The base load flow did not converge.'
              : 'No removable branch contingencies were found.');
          statusEl.textContent = `${detail} No result was saved or enabled for export.`;
        }
        if (summaryEl) summaryEl.innerHTML = '<div class="result-card result-fail"><strong>No valid contingency result.</strong></div>';
        exportBtn.disabled = true;
        lastValidResult = null;
        return;
      }

      lastValidResult = results;
      exportBtn.disabled = false;
      if (statusEl) statusEl.textContent = 'Valid result saved to this project.';

      const { summary, contingencies } = results;
      if (summaryEl) {
        const tsCount = summary.transientlyUnstable ?? 0;
        summaryEl.innerHTML = `
          <strong>Total branches checked:</strong> ${summary.totalBranches} &nbsp;|&nbsp;
          <strong>Critical contingencies:</strong> ${summary.criticalContingencies} &nbsp;|&nbsp;
          <strong>Total violations:</strong> ${summary.totalViolations}${
            checkTransientStability
              ? ` &nbsp;|&nbsp; <strong${tsCount > 0 ? ' class="contingency-fail"' : ''}>Transient instabilities: ${tsCount}</strong>`
              : ''}
        `;
      }

      if (tableBody) {
        if (!contingencies || contingencies.length === 0) {
          const tr = document.createElement('tr');
          const td = document.createElement('td');
          td.colSpan = 6;
          td.textContent = 'No branches found in the one-line diagram. Add buses and branches in the One-Line editor first.';
          tr.appendChild(td);
          tableBody.appendChild(tr);
        } else {
          for (const c of contingencies) {
            const tr = document.createElement('tr');
            if (c.critical) tr.classList.add('contingency-critical');

            const tdName = document.createElement('td');
            tdName.textContent = c.branchName;

            const tdType = document.createElement('td');
            tdType.textContent = c.branchType;

            const tdConverged = document.createElement('td');
            tdConverged.textContent = c.converged ? 'Yes' : 'No';
            if (!c.converged) tdConverged.classList.add('contingency-fail');

            const tdViolations = document.createElement('td');
            tdViolations.textContent = c.violations.length > 0
              ? c.violations.map(v => `${v.type}: ${v.element} (${v.value})`).join('; ')
              : 'None';
            if (c.violations.length > 0) tdViolations.classList.add('contingency-fail');

            const tdStatus = document.createElement('td');
            tdStatus.textContent = c.critical ? 'Critical' : 'OK';
            tdStatus.className = c.critical ? 'contingency-fail' : 'contingency-ok';

            const tdTs = document.createElement('td');
            const ts = c.transientStability;
            if (!ts || !ts.checked) {
              tdTs.textContent = 'N/A';
              tdTs.className = 'contingency-ts-na';
            } else if (ts.stable === false) {
              tdTs.textContent = `Unstable (δ_max ${ts.deltaMax_deg != null ? ts.deltaMax_deg.toFixed(1) : '?'}°)`;
              tdTs.className = 'contingency-ts-unstable';
            } else {
              tdTs.textContent = `Stable (δ_max ${ts.deltaMax_deg != null ? ts.deltaMax_deg.toFixed(1) : '?'}°)`;
              tdTs.className = 'contingency-ts-stable';
            }

            tr.appendChild(tdName);
            tr.appendChild(tdType);
            tr.appendChild(tdConverged);
            tr.appendChild(tdViolations);
            tr.appendChild(tdStatus);
            tr.appendChild(tdTs);
            tableBody.appendChild(tr);
          }
        }
      }
    });

    exportBtn.addEventListener('click', () => {
      if (!lastValidResult) return;
      const rows = ['branch,type,converged,critical,violations'];
      lastValidResult.contingencies.forEach(item => {
        const violations = item.violations.map(entry => `${entry.type}: ${entry.element} ${entry.value}`).join('; ');
        const values = [item.branchName, item.branchType, item.converged, item.critical, violations]
          .map(value => `"${String(value ?? '').replace(/"/g, '""')}"`);
        rows.push(values.join(','));
      });
      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
      anchor.download = 'contingency-results.csv';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(anchor.href), 0);
    });
  }
}
