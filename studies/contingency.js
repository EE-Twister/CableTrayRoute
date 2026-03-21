import { runContingency } from '../analysis/contingency.mjs';
import { getStudies, setStudies } from '../dataStore.mjs';

/**
 * Run N-1 contingency analysis and store results.
 * @param {object} [opts]
 * @param {number} [opts.voltageMinPu=0.95]
 * @param {number} [opts.voltageMaxPu=1.05]
 * @param {number} [opts.overloadThresholdPct=100]
 * @param {number} [opts.baseMVA=100]
 * @returns {object} contingency results
 */
export function runContingencyStudy(opts = {}) {
  const results = runContingency(null, opts);
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

  if (form) {
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const baseMVA = Number(form.baseMVA?.value) || 100;
      const voltageMin = Number(form.voltageMin?.value) || 0.95;
      const voltageMax = Number(form.voltageMax?.value) || 1.05;
      const overloadPct = Number(form.overloadPct?.value) || 100;

      if (statusEl) statusEl.textContent = 'Running…';
      if (summaryEl) summaryEl.textContent = '';
      if (tableBody) tableBody.innerHTML = '';

      let results;
      try {
        results = runContingencyStudy({ baseMVA, voltageMinPu: voltageMin, voltageMaxPu: voltageMax, overloadThresholdPct: overloadPct });
      } catch (err) {
        if (statusEl) statusEl.textContent = `Error: ${err.message}`;
        return;
      }

      if (statusEl) statusEl.textContent = '';

      const { summary, contingencies } = results;
      if (summaryEl) {
        summaryEl.innerHTML = `
          <strong>Total branches checked:</strong> ${summary.totalBranches} &nbsp;|&nbsp;
          <strong>Critical contingencies:</strong> ${summary.criticalContingencies} &nbsp;|&nbsp;
          <strong>Total violations:</strong> ${summary.totalViolations}
        `;
      }

      if (tableBody) {
        if (!contingencies || contingencies.length === 0) {
          const tr = document.createElement('tr');
          const td = document.createElement('td');
          td.colSpan = 5;
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

            tr.appendChild(tdName);
            tr.appendChild(tdType);
            tr.appendChild(tdConverged);
            tr.appendChild(tdViolations);
            tr.appendChild(tdStatus);
            tableBody.appendChild(tr);
          }
        }
      }
    });
  }
}
