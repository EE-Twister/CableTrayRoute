import {
  runMonteCarloLoadFlow,
  defaultLoadDist,
  defaultGenDist,
  DEFAULT_SAMPLES,
  DEFAULT_SEED,
  MAX_SAMPLES,
  VOLTAGE_HIGH_PU,
  VOLTAGE_LOW_PU,
} from './analysis/probabilisticLoadFlow.mjs';
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

  initStudyBasisPanel('probabilisticLoadFlow', {
    standard: 'IEEE Std 399-1997 §14 (Load Flow); Borkowska (1974) Probabilistic Load Flow',
    clause: 'Monte Carlo sampling of stochastic load / generation multipliers over the AC load-flow solver',
    formulas: [
      'loadScale ~ loadDist, genScale ~ genDist  — per-scenario multipliers',
      'Pd = Pd_base × loadScale, Pg = Pg_base × genScale',
      'P(violation) = scenarios with any bus outside 0.95–1.05 pu ÷ converged scenarios',
      'Percentiles via linear interpolation on the sorted scenario results',
    ],
    assumptions: [
      'Each scenario solved independently as a single deterministic load flow',
      'Uniform scaling: all loads share loadScale, all generators share genScale',
      'Seeded RNG (mulberry32) — identical seed reproduces identical results',
      'ANSI C84.1 Range A voltage limits: 0.95–1.05 pu',
    ],
    limitations: [
      'No per-bus input distributions (system-wide multipliers only)',
      'No correlation between load and generation distributions',
      'Convergence assumed per scenario; diverged scenarios are excluded from statistics',
    ],
  });

  initStudyApprovalPanel('probabilisticLoadFlow');

  const form        = document.getElementById('mc-form');
  const resultsDiv  = document.getElementById('results');
  const errorsDiv   = document.getElementById('calc-errors');
  const exportBtn   = document.getElementById('export-csv-btn');

  // Show/hide distribution parameter fields based on the selected type.
  function wireDistType(prefix) {
    const sel = document.getElementById(`${prefix}-type`);
    const update = () => {
      const t = sel.value;
      document.querySelectorAll(`[data-dist="${prefix}"]`).forEach(group => {
        const forTypes = group.getAttribute('data-for').split(' ');
        group.hidden = !forTypes.includes(t);
      });
    };
    sel.addEventListener('change', update);
    update();
  }
  wireDistType('load');
  wireDistType('gen');

  function readDist(prefix) {
    const num = id => parseFloat(document.getElementById(`${prefix}-${id}`)?.value);
    const type = document.getElementById(`${prefix}-type`).value;
    const dist = { type };
    if (type === 'constant') dist.value = num('mean');
    if (type === 'normal') { dist.mean = num('mean'); dist.sd = num('sd'); }
    if (type === 'uniform') { dist.min = num('min'); dist.max = num('max'); }
    if (type === 'triangular') { dist.min = num('min'); dist.mode = num('mode'); dist.max = num('max'); }
    if (type === 'beta') { dist.alpha = num('alpha'); dist.beta = num('beta'); }
    if (type === 'empirical') {
      dist.values = (document.getElementById(`${prefix}-values`)?.value || '')
        .split(/[,\s]+/).map(Number).filter(Number.isFinite);
    }
    const cmin = num('clampmin');
    const cmax = num('clampmax');
    if (Number.isFinite(cmin)) dist.clampMin = cmin;
    if (Number.isFinite(cmax)) dist.clampMax = cmax;
    return dist;
  }

  // Restore a saved run, or leave defaults from the HTML.
  const saved = getStudies().probabilisticLoadFlow;
  if (saved && saved.inputs) {
    renderResults(saved);
    exportBtn.hidden = false;
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const runBtn = document.getElementById('run-btn');
    runBtn.disabled = true;
    runBtn.textContent = 'Sampling…';

    let result;
    try {
      const samples = Math.floor(parseFloat(document.getElementById('samples').value));
      const seed = Math.floor(parseFloat(document.getElementById('seed').value));
      const baseMVA = parseFloat(document.getElementById('base-mva').value) || 100;
      if (!Number.isFinite(samples) || samples < 1) throw new Error('Enter a positive number of scenarios.');
      if (samples > MAX_SAMPLES) throw new Error(`Scenario count is capped at ${MAX_SAMPLES}.`);
      if (!Number.isFinite(seed)) throw new Error('Enter an integer random seed.');
      const config = { samples, seed, loadDist: readDist('load'), genDist: readDist('gen') };
      result = runMonteCarloLoadFlow(null, config, { baseMVA, balanced: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to run the Monte Carlo study.';
      errorsDiv.hidden = false;
      errorsDiv.textContent = msg;
      showModal('Input Error', `<p>${escapeHtml(msg)}</p>`, 'error');
      runBtn.disabled = false;
      runBtn.textContent = 'Run Monte Carlo';
      return;
    }

    errorsDiv.hidden = true;
    errorsDiv.textContent = '';

    const studies = getStudies();
    studies.probabilisticLoadFlow = result;
    setStudies(studies);

    renderResults(result);
    exportBtn.hidden = false;
    runBtn.disabled = false;
    runBtn.textContent = 'Run Monte Carlo';
  });

  exportBtn.addEventListener('click', () => {
    const s = getStudies().probabilisticLoadFlow;
    if (s) download('probabilistic-load-flow.csv', resultToCsv(s), 'text/csv');
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  function renderResults(result) {
    const {
      sampleCount, convergedCount, lossStats, minVoltageStats, maxVoltageStats,
      busStats, probabilityOfViolation, lossHistogram, minVoltageHistogram, warnings,
    } = result;

    const pct = x => `${(x * 100).toFixed(1)}%`;
    const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '—');
    const pviolClass = probabilityOfViolation > 0.05 ? 'result-fail'
      : probabilityOfViolation > 0 ? 'result-warn' : 'result-ok';

    const busRows = busStats.map(b => {
      const risk = Math.max(b.pUnder, b.pOver);
      const cls = risk > 0.05 ? 'result-fail' : risk > 0 ? 'result-warn' : 'result-ok';
      return `<tr>
        <td>${escapeHtml(b.label)}</td>
        <td>${f(b.mean, 4)}</td>
        <td>${f(b.std, 4)}</td>
        <td>${f(b.min, 4)}</td>
        <td>${f(b.p05, 4)}</td>
        <td>${f(b.max, 4)}</td>
        <td class="${b.pUnder > 0 ? 'result-warn' : ''}">${pct(b.pUnder)}</td>
        <td class="${b.pOver > 0 ? 'result-warn' : ''}">${pct(b.pOver)}</td>
        <td><span class="${cls}">${risk > 0 ? pct(risk) : 'OK'}</span></td>
      </tr>`;
    }).join('');

    const warningHtml = warnings.length
      ? `<ul class="drc-findings">${warnings.map(w =>
          `<li class="drc-finding drc-warn"><span class="drc-msg">${escapeHtml(w)}</span></li>`).join('')}</ul>`
      : '<p class="field-hint">No warnings — all converged scenarios stayed within voltage limits.</p>';

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-labelledby="results-heading">
        <h2 id="results-heading">Probabilistic Load Flow Results</h2>

        <div class="result-group">
          <h3>Summary</h3>
          <div class="result-cards">
            <div class="result-card">
              <div class="result-card-label">P(voltage violation)</div>
              <div class="result-card-value ${pviolClass}">${pct(probabilityOfViolation)}</div>
              <div class="result-card-sub">any bus outside ${VOLTAGE_LOW_PU}–${VOLTAGE_HIGH_PU} pu</div>
            </div>
            <div class="result-card">
              <div class="result-card-label">System loss</div>
              <div class="result-card-value">${f(lossStats.mean, 1)}</div>
              <div class="result-card-sub">kW mean · P95 ${f(lossStats.p95, 1)} kW</div>
            </div>
            <div class="result-card">
              <div class="result-card-label">Min bus voltage</div>
              <div class="result-card-value ${minVoltageStats.p05 < VOLTAGE_LOW_PU ? 'result-warn' : ''}">${f(minVoltageStats.mean, 3)}</div>
              <div class="result-card-sub">pu mean · P5 ${f(minVoltageStats.p05, 3)} pu</div>
            </div>
            <div class="result-card">
              <div class="result-card-label">Scenarios</div>
              <div class="result-card-value ${convergedCount < sampleCount ? 'result-warn' : 'result-ok'}">${convergedCount}/${sampleCount}</div>
              <div class="result-card-sub">converged</div>
            </div>
          </div>
        </div>

        <div class="result-group">
          <h3>System Loss Distribution (kW)</h3>
          ${histogramSvg(lossHistogram, '#3a7bd5', 1)}
        </div>

        <div class="result-group">
          <h3>Minimum Bus Voltage Distribution (pu)</h3>
          ${histogramSvg(minVoltageHistogram, '#5aa469', 3, VOLTAGE_LOW_PU)}
        </div>

        <div class="result-group">
          <h3>Per-Bus Voltage Statistics</h3>
          <div class="table-scroll">
            <table class="data-table" aria-label="Per-bus voltage statistics">
              <thead>
                <tr>
                  <th>Bus</th><th>Mean (pu)</th><th>Std</th><th>Min</th><th>P5</th><th>Max</th>
                  <th>P(V&lt;0.95)</th><th>P(V&gt;1.05)</th><th>Risk</th>
                </tr>
              </thead>
              <tbody>${busRows}</tbody>
            </table>
          </div>
        </div>

        <div class="result-group">
          <h3>Warnings</h3>
          ${warningHtml}
        </div>
      </section>`;
  }

  // Simple SVG histogram. Optional markerX draws a reference line (e.g. limit).
  function histogramSvg(bins, fill, decimals, markerX) {
    if (!bins || bins.length === 0) return '<p class="field-hint">No data to plot.</p>';
    const W = 700, H = 240, padL = 40, padR = 12, padT = 10, padB = 34;
    const maxCount = Math.max(...bins.map(b => b.count)) || 1;
    const xMin = bins[0].x0, xMax = bins[bins.length - 1].x1;
    const span = xMax - xMin || 1;
    const sx = x => padL + ((x - xMin) / span) * (W - padL - padR);
    const sy = c => H - padB - (c / maxCount) * (H - padT - padB);

    const bars = bins.map(b => {
      const x0 = sx(b.x0), x1 = sx(b.x1);
      const y = sy(b.count);
      return `<rect x="${x0 + 0.5}" y="${y}" width="${Math.max(0, x1 - x0 - 1)}" height="${H - padB - y}" fill="${fill}" opacity="0.85"></rect>`;
    }).join('');

    const marker = Number.isFinite(markerX) && markerX >= xMin && markerX <= xMax
      ? `<line x1="${sx(markerX)}" y1="${padT}" x2="${sx(markerX)}" y2="${H - padB}" stroke="#c0392b" stroke-width="1.5" stroke-dasharray="4 3"></line>
         <text x="${sx(markerX)}" y="${padT + 10}" font-size="10" fill="#c0392b" text-anchor="middle">limit</text>`
      : '';

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"
        aria-label="Histogram of Monte Carlo scenario outcomes">
        <title>Probability distribution across ${bins.reduce((s, b) => s + b.count, 0)} converged scenarios</title>
        ${bars}
        ${marker}
        <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="currentColor"></line>
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="currentColor"></line>
        <text x="${padL}" y="${H - 8}" font-size="11" fill="currentColor">${xMin.toFixed(decimals)}</text>
        <text x="${W - padR}" y="${H - 8}" text-anchor="end" font-size="11" fill="currentColor">${xMax.toFixed(decimals)}</text>
        <text x="${padL - 6}" y="${padT + 8}" text-anchor="end" font-size="11" fill="currentColor">${maxCount}</text>
      </svg>`;
  }

  // -------------------------------------------------------------------------
  // CSV export
  // -------------------------------------------------------------------------
  function resultToCsv(r) {
    const lines = [];
    lines.push('# Probabilistic Load Flow Results');
    lines.push(`# Scenarios,${r.sampleCount},Converged,${r.convergedCount},Seed,${r.inputs.seed}`);
    lines.push(`# P(violation),${(r.probabilityOfViolation * 100).toFixed(2)}%`);
    lines.push(`# Loss kW (mean/p05/p50/p95),${r.lossStats.mean.toFixed(2)},${r.lossStats.p05.toFixed(2)},${r.lossStats.p50.toFixed(2)},${r.lossStats.p95.toFixed(2)}`);
    lines.push('Bus,MeanVm,StdVm,MinVm,P5Vm,MaxVm,P_under_0.95,P_over_1.05');
    r.busStats.forEach(b => {
      lines.push([
        b.label, b.mean.toFixed(5), b.std.toFixed(5), b.min.toFixed(5),
        b.p05.toFixed(5), b.max.toFixed(5),
        (b.pUnder * 100).toFixed(2) + '%', (b.pOver * 100).toFixed(2) + '%',
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

  // Expose defaults referenced by inline HTML hints (avoids magic numbers drift).
  void [defaultLoadDist, defaultGenDist, DEFAULT_SAMPLES, DEFAULT_SEED];
});
