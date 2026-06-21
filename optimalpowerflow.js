import {
  runOptimalPowerFlow,
  parseFleetCsv,
  fleetToCsv,
  DEFAULT_FLEET,
} from './analysis/optimalPowerFlow.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { initStudyBasisPanel } from './src/components/studyBasis.js';
import { escapeHtml } from './src/htmlUtils.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  initStudyBasisPanel('optimalPowerFlow', {
    standard: 'Wood, Wollenberg & Sheblé §3 — Economic Dispatch of Thermal Units; IEEE Std 399-1997 §3',
    clause: 'Equal-incremental-cost (lambda) dispatch with generator min/max limits',
    formulas: [
      'C_i(P) = a_i + b_i·P + c_i·P²  — unit fuel cost ($/h)',
      'IC_i(P) = b_i + 2·c_i·P  — incremental (marginal) cost ($/MWh)',
      'At optimum: IC_i = λ for every unit between its limits',
      'P_i(λ) = (λ − b_i) / (2·c_i), clamped to [Pmin_i, Pmax_i]',
      'Σ P_i = demand + losses',
    ],
    assumptions: [
      'Convex quadratic cost curves (c ≥ 0) per unit',
      'Single-period, deterministic dispatch (no ramp limits or unit commitment)',
      'Losses modelled as a flat percentage of demand (screening level)',
    ],
    limitations: [
      'No transmission line limits, security (N-1), or DC/AC network constraints',
      'No reactive-power / voltage optimisation — real-power dispatch only',
      'For a full AC-OPF couple this with the Load Flow and Contingency studies',
    ],
  });

  initStudyApprovalPanel('optimalPowerFlow');

  const form        = document.getElementById('opf-form');
  const fleetBody    = document.getElementById('fleet-rows');
  const addRowBtn    = document.getElementById('add-unit-btn');
  const loadDefBtn   = document.getElementById('load-default-btn');
  const importInput  = document.getElementById('fleet-file');
  const exportFleetBtn = document.getElementById('export-fleet-btn');
  const demandInput  = document.getElementById('demand-mw');
  const lossInput    = document.getElementById('loss-pct');
  const resultsDiv   = document.getElementById('results');
  const errorsDiv    = document.getElementById('calc-errors');
  const exportBtn    = document.getElementById('export-csv-btn');

  // -------------------------------------------------------------------------
  // Fleet table editing
  // -------------------------------------------------------------------------
  function unitRowHtml(u = {}) {
    const v = (x, d = '') => (x == null ? d : x);
    return `<tr class="fleet-row">
      <td><input type="text"   class="u-name" value="${escapeHtml(String(v(u.name, '')))}" aria-label="Unit name" placeholder="Unit"></td>
      <td><input type="number" class="u-pmin" value="${v(u.pmin, '')}" step="any" min="0" aria-label="Minimum output MW"></td>
      <td><input type="number" class="u-pmax" value="${v(u.pmax, '')}" step="any" min="0" aria-label="Maximum output MW"></td>
      <td><input type="number" class="u-a"    value="${v(u.a, 0)}"     step="any" aria-label="Fixed cost a"></td>
      <td><input type="number" class="u-b"    value="${v(u.b, '')}"    step="any" aria-label="Linear cost b"></td>
      <td><input type="number" class="u-c"    value="${v(u.c, '')}"    step="any" min="0" aria-label="Quadratic cost c"></td>
      <td><button type="button" class="btn btn-small remove-unit" aria-label="Remove unit">✕</button></td>
    </tr>`;
  }

  function setFleet(units) {
    fleetBody.innerHTML = units.map(unitRowHtml).join('');
  }

  function readFleet() {
    const rows = Array.from(fleetBody.querySelectorAll('.fleet-row'));
    const units = [];
    rows.forEach((row, i) => {
      const num = sel => parseFloat(row.querySelector(sel)?.value);
      const name = row.querySelector('.u-name')?.value.trim() || `Unit ${i + 1}`;
      const pmin = num('.u-pmin');
      const pmax = num('.u-pmax');
      // Skip fully-blank rows so a stray empty row doesn't fail the run.
      if (!Number.isFinite(pmax) && !Number.isFinite(pmin)) return;
      units.push({
        id: name,
        name,
        pmin: Number.isFinite(pmin) ? pmin : 0,
        pmax,
        a: num('.u-a') || 0,
        b: num('.u-b') || 0,
        c: num('.u-c') || 0,
      });
    });
    return units;
  }

  fleetBody.addEventListener('click', e => {
    if (e.target.closest('.remove-unit')) {
      e.target.closest('.fleet-row').remove();
    }
  });

  addRowBtn.addEventListener('click', () => {
    fleetBody.insertAdjacentHTML('beforeend', unitRowHtml());
  });

  loadDefBtn.addEventListener('click', () => {
    setFleet(DEFAULT_FLEET);
    demandInput.value = 850;
    lossInput.value = 0;
  });

  importInput.addEventListener('change', () => {
    const file = importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const units = parseFleetCsv(String(ev.target.result));
        if (units.length === 0) throw new Error('No valid generator rows found in the file.');
        setFleet(units);
      } catch (err) {
        showModal('Import Error', `<p>${escapeHtml(err.message)}</p>`, 'error');
      }
      importInput.value = '';
    };
    reader.readAsText(file);
  });

  exportFleetBtn.addEventListener('click', () => {
    download('generator-fleet.csv', fleetToCsv(readFleet()), 'text/csv');
  });

  // -------------------------------------------------------------------------
  // Restore saved result, or seed the default fleet
  // -------------------------------------------------------------------------
  const saved = getStudies().optimalPowerFlow;
  if (saved && saved.inputs && Array.isArray(saved.inputs.units)) {
    setFleet(saved.inputs.units);
    demandInput.value = saved.inputs.demandMW;
    lossInput.value = saved.inputs.lossPercent ?? 0;
    renderResults(saved);
    exportBtn.hidden = false;
  } else {
    setFleet(DEFAULT_FLEET);
    demandInput.value = 850;
    lossInput.value = 0;
  }

  // -------------------------------------------------------------------------
  // Run
  // -------------------------------------------------------------------------
  form.addEventListener('submit', e => {
    e.preventDefault();
    const runBtn = document.getElementById('run-btn');
    runBtn.disabled = true;
    runBtn.textContent = 'Solving…';

    let result;
    try {
      const units = readFleet();
      const demand = parseFloat(demandInput.value);
      const lossPercent = parseFloat(lossInput.value) || 0;
      if (units.length === 0) throw new Error('Add at least one generator to the fleet.');
      result = runOptimalPowerFlow(units, demand, { lossPercent });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to run economic dispatch.';
      errorsDiv.hidden = false;
      errorsDiv.textContent = msg;
      showModal('Input Error', `<p>${escapeHtml(msg)}</p>`, 'error');
      runBtn.disabled = false;
      runBtn.textContent = 'Run Economic Dispatch';
      return;
    }

    errorsDiv.hidden = true;
    errorsDiv.textContent = '';

    const studies = getStudies();
    studies.optimalPowerFlow = result;
    setStudies(studies);

    renderResults(result);
    exportBtn.hidden = false;
    runBtn.disabled = false;
    runBtn.textContent = 'Run Economic Dispatch';
  });

  exportBtn.addEventListener('click', () => {
    const s = getStudies().optimalPowerFlow;
    if (s) download('economic-dispatch.csv', resultToCsv(s), 'text/csv');
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  function renderResults(result) {
    const {
      dispatch, systemLambda, demandMW, lossesMW, requiredGenMW, totalGenMW,
      totalCostPerHr, avgSystemCost, feasible, naiveCostPerHr, savingsPerHr,
      savingsPct, warnings,
    } = result;

    const money = x => x == null ? '—' : `$${x.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    const money2 = x => x == null ? '—' : `$${x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const statusCell = d => {
      if (d.atLimit === 'max') return '<span class="result-warn">At max</span>';
      if (d.atLimit === 'min') return '<span class="result-warn">At min</span>';
      return '<span class="result-ok">Marginal</span>';
    };

    const dispatchRows = dispatch.map(d => `
      <tr>
        <td>${escapeHtml(d.name)}</td>
        <td>${d.pmin.toFixed(1)}</td>
        <td>${d.pmax.toFixed(1)}</td>
        <td><strong>${d.output.toFixed(1)}</strong></td>
        <td>${d.loadingPct.toFixed(1)}%</td>
        <td>${money2(d.incrementalCost)}/MWh</td>
        <td>${money2(d.cost)}/h</td>
        <td>${statusCell(d)}</td>
      </tr>`).join('');

    const warningHtml = warnings.length
      ? `<ul class="drc-findings">${warnings.map(w =>
          `<li class="drc-finding ${feasible ? 'drc-warn' : 'drc-fail'}"><span class="drc-msg">${escapeHtml(w)}</span></li>`
        ).join('')}</ul>`
      : '<p class="field-hint">No warnings — dispatch is feasible with reserve on the marginal unit(s).</p>';

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-labelledby="results-heading">
        <h2 id="results-heading">Economic Dispatch Results</h2>

        <div class="result-group">
          <h3>Summary</h3>
          <div class="result-cards">
            <div class="result-card">
              <div class="result-card-label">System lambda</div>
              <div class="result-card-value ${feasible ? 'result-ok' : 'result-fail'}">${money2(systemLambda)}</div>
              <div class="result-card-sub">marginal cost ($/MWh)</div>
            </div>
            <div class="result-card">
              <div class="result-card-label">Total cost</div>
              <div class="result-card-value">${money(totalCostPerHr)}</div>
              <div class="result-card-sub">/ hour · avg ${money2(avgSystemCost)}/MWh</div>
            </div>
            <div class="result-card">
              <div class="result-card-label">Generation</div>
              <div class="result-card-value ${feasible ? '' : 'result-fail'}">${totalGenMW.toFixed(1)}</div>
              <div class="result-card-sub">MW of ${requiredGenMW.toFixed(1)} required (${demandMW.toFixed(0)} load + ${lossesMW.toFixed(1)} loss)</div>
            </div>
            <div class="result-card">
              <div class="result-card-label">Savings vs. naive</div>
              <div class="result-card-value ${savingsPerHr > 0 ? 'result-ok' : ''}">${money(savingsPerHr)}</div>
              <div class="result-card-sub">${savingsPct.toFixed(2)}% below proportional dispatch (${money(naiveCostPerHr)}/h)</div>
            </div>
          </div>
        </div>

        <div class="result-group">
          <h3>Dispatch by Unit</h3>
          <div id="opf-chart-container">${dispatchChartSvg(dispatch, systemLambda)}</div>
        </div>

        <div class="result-group">
          <div class="table-scroll">
            <table class="data-table" aria-label="Economic dispatch by unit">
              <thead>
                <tr>
                  <th>Unit</th><th>Pmin (MW)</th><th>Pmax (MW)</th><th>Output (MW)</th>
                  <th>Loading</th><th>Incr. cost</th><th>Cost</th><th>Status</th>
                </tr>
              </thead>
              <tbody>${dispatchRows}</tbody>
            </table>
          </div>
        </div>

        <div class="result-group">
          <h3>Warnings</h3>
          ${warningHtml}
        </div>
      </section>`;
  }

  // Horizontal bar chart: each unit's output within its [Pmin, Pmax] envelope.
  function dispatchChartSvg(dispatch, lambda) {
    if (!dispatch.length) return '';
    const W = 700, rowH = 34, padL = 110, padR = 70, padT = 10, padB = 24;
    const H = padT + padB + dispatch.length * rowH;
    const maxP = Math.max(...dispatch.map(d => d.pmax)) || 1;
    const x = p => padL + (p / maxP) * (W - padL - padR);

    const rows = dispatch.map((d, i) => {
      const y = padT + i * rowH + 6;
      const barH = rowH - 16;
      const envX = x(d.pmin), envW = x(d.pmax) - x(d.pmin);
      const outW = x(d.output) - padL;
      const fill = d.atLimit ? '#d9822b' : '#3a7bd5';
      return `
        <g>
          <text x="${padL - 8}" y="${y + barH - 1}" text-anchor="end" font-size="12" fill="currentColor">${escapeHtml(d.name)}</text>
          <rect x="${padL}" y="${y}" width="${x(d.output) - padL}" height="${barH}" fill="${fill}" rx="2"></rect>
          <rect x="${envX}" y="${y - 2}" width="${envW}" height="${barH + 4}" fill="none" stroke="#888" stroke-dasharray="3 2" rx="2"></rect>
          <text x="${x(d.output) + 4}" y="${y + barH - 1}" font-size="11" fill="currentColor">${d.output.toFixed(0)}</text>
        </g>`;
    }).join('');

    return `<svg id="opf-chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"
        aria-label="Generator dispatch bar chart showing each unit output within its min/max envelope">
        <title>Economic dispatch — unit outputs (solid) within Pmin–Pmax envelope (dashed). System lambda ${lambda.toFixed(2)} $/MWh.</title>
        ${rows}
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="currentColor" stroke-width="1"></line>
        <text x="${padL}" y="${H - 6}" font-size="11" fill="currentColor">0 MW</text>
        <text x="${W - padR}" y="${H - 6}" text-anchor="end" font-size="11" fill="currentColor">${maxP.toFixed(0)} MW</text>
      </svg>`;
  }

  // -------------------------------------------------------------------------
  // CSV export of results
  // -------------------------------------------------------------------------
  function resultToCsv(r) {
    const lines = [];
    lines.push('# Economic Dispatch Results');
    lines.push(`# System lambda ($/MWh),${r.systemLambda.toFixed(4)}`);
    lines.push(`# Demand (MW),${r.demandMW}`);
    lines.push(`# Losses (MW),${r.lossesMW.toFixed(2)}`);
    lines.push(`# Total cost ($/h),${r.totalCostPerHr.toFixed(2)}`);
    lines.push(`# Savings vs naive ($/h),${r.savingsPerHr.toFixed(2)}`);
    lines.push('Unit,Pmin_MW,Pmax_MW,Output_MW,Loading_pct,IncrCost_$/MWh,Cost_$/h,Status');
    r.dispatch.forEach(d => {
      lines.push([
        d.name, d.pmin, d.pmax, d.output.toFixed(2), d.loadingPct.toFixed(1),
        d.incrementalCost.toFixed(4), d.cost.toFixed(2), d.atLimit || 'marginal',
      ].join(','));
    });
    return lines.join('\n');
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
});
