import {
  runQuasiDynamic,
  parseProfileCsv,
  builtinDailyProfile,
  builtinAnnualProfile,
  VOLTAGE_HIGH_PU,
  VOLTAGE_LOW_PU,
} from './analysis/quasiDynamic.mjs';
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

  initStudyBasisPanel('quasiDynamic', {
    standard: 'IEEE Std 399-1997 §14 — Industrial and Commercial Power Systems Analysis',
    clause: 'Quasi-dynamic (time-series) load flow — uniform profile scaling over Newton-Raphson solver',
    formulas: [
      'Pd_t = Pd_base × loadScale_t  — bus real load at timestep t',
      'Pg_t = Pg_base × genScale_t  — bus generation at timestep t',
      'E_loss = Σ P_loss_t × Δt  — cumulative energy loss (kWh, Δt = 1 h per step)',
      'Load factor = P_avg / P_peak',
    ],
    assumptions: [
      'Each timestep solved independently (no ramp limits or inter-period dynamics)',
      'Uniform load scaling: all buses use the same loadScale multiplier',
      'Uniform gen scaling: all generators use the same genScale multiplier',
      'ANSI C84.1 Range A voltage limits: 0.95–1.05 pu',
    ],
    limitations: [
      'No economic dispatch or generator cost curves (see OPF study for that)',
      'No inertia or frequency response modelling',
      'Bus-by-bus load profiles require custom model input via the REST API',
    ],
    benchmarkId: 'quasi-dynamic-load-flow',
  });

  initStudyApprovalPanel('quasiDynamic');

  const form       = document.getElementById('qd-form');
  const resultsDiv = document.getElementById('results');
  const errorsDiv  = document.getElementById('calc-errors');
  const exportBtn  = document.getElementById('export-csv-btn');
  const presetSel  = document.getElementById('profile-preset');
  const fileInput  = document.getElementById('profile-file');
  const textArea   = document.getElementById('profile-text');

  // Preset selector
  presetSel.addEventListener('change', () => {
    const v = presetSel.value;
    if (v === 'daily') {
      textArea.value = profileToText(builtinDailyProfile());
    } else if (v === 'annual') {
      textArea.value = profileToText(builtinAnnualProfile());
    }
  });

  // CSV file upload
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      textArea.value = e.target.result;
      presetSel.value = 'none';
    };
    reader.readAsText(file);
  });

  // Restore saved result
  const saved = getStudies().quasiDynamic;
  if (saved && saved.inputs) {
    restoreForm(saved.inputs);
    renderResults(saved);
    exportBtn.hidden = false;
  } else {
    // Default: 24-hour commercial profile
    textArea.value = profileToText(builtinDailyProfile());
  }

  // Form submit
  form.addEventListener('submit', e => {
    e.preventDefault();
    const runBtn = document.getElementById('run-btn');
    runBtn.disabled = true;
    runBtn.textContent = 'Running…';

    let result;
    try {
      const inputs = readInputs();
      result = runQuasiDynamic(null, inputs.profiles, { baseMVA: inputs.baseMVA, balanced: inputs.balanced });
      result.inputs._formState = inputs;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to run quasi-dynamic study.';
      errorsDiv.hidden = false;
      errorsDiv.textContent = msg;
      showModal('Input Error', `<p>${escapeHtml(msg)}</p>`, 'error');
      runBtn.disabled = false;
      runBtn.textContent = 'Run Quasi-Dynamic Study';
      return;
    }

    errorsDiv.hidden = true;
    errorsDiv.textContent = '';

    const studies = getStudies();
    studies.quasiDynamic = result;
    setStudies(studies);

    renderResults(result);
    exportBtn.hidden = false;
    runBtn.disabled = false;
    runBtn.textContent = 'Run Quasi-Dynamic Study';
  });

  exportBtn.addEventListener('click', () => {
    const s = getStudies().quasiDynamic;
    if (s) exportCsv(s);
  });

  // ---------------------------------------------------------------------------
  // Form reading
  // ---------------------------------------------------------------------------
  function readInputs() {
    const baseMVA  = parseFloat(document.getElementById('base-mva').value) || 100;
    const balanced = document.getElementById('balanced-select').value !== 'unbalanced';
    const raw      = textArea.value.trim();
    if (!raw) throw new Error('Enter a load profile — either select a built-in preset or upload a CSV.');
    const profiles = parseProfileCsv(raw);
    if (profiles.length === 0) {
      throw new Error('No valid profile rows found. Check that the CSV uses numeric values for loadScale.');
    }
    return { baseMVA, balanced, profiles };
  }

  // ---------------------------------------------------------------------------
  // Form restoration
  // ---------------------------------------------------------------------------
  function restoreForm(inputs) {
    if (!inputs) return;
    const fs = inputs._formState;
    if (!fs) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    set('base-mva', fs.baseMVA);
    if (fs.balanced === false) document.getElementById('balanced-select').value = 'unbalanced';
    if (fs.profiles) textArea.value = profileToText(fs.profiles);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function profileToText(profiles) {
    const header = '# hour, loadScale, genScale';
    const rows = profiles.map(p => `${p.hour}, ${p.loadScale.toFixed(4)}, ${p.genScale.toFixed(4)}`);
    return [header, ...rows].join('\n');
  }

  // ---------------------------------------------------------------------------
  // Results rendering
  // ---------------------------------------------------------------------------
  function renderResults(result) {
    const {
      timeSeries, busEnvelope, peakStep, valleyStep,
      totalEnergyLossKwh, convergedCount, timestepCount,
      overVoltageCount, underVoltageCount, avgLoadKw, loadFactor, warnings,
    } = result;

    const riskClass = r => r === 'fail' ? 'result-fail' : r === 'warn' ? 'result-warn' : 'result-ok';
    const riskLabel = r => r === 'fail' ? 'FAIL' : r === 'warn' ? 'WARN' : 'PASS';

    const convergePct = timestepCount > 0 ? ((convergedCount / timestepCount) * 100).toFixed(1) : '—';

    const warningHtml = warnings.length
      ? `<ul class="drc-findings">${warnings.map(w =>
          `<li class="drc-finding drc-warn"><span class="drc-msg">${escapeHtml(w)}</span></li>`
        ).join('')}</ul>`
      : '<p class="field-hint">No warnings.</p>';

    // Envelope table rows
    const envelopeRows = busEnvelope.map(b => `
      <tr>
        <td>${escapeHtml(b.label)}</td>
        <td class="${riskClass(b.maxRisk)}">${b.maxVm.toFixed(4)}</td>
        <td class="${riskClass(b.minRisk)}">${b.minVm.toFixed(4)}</td>
        <td><span class="${riskClass(b.maxRisk)}">${riskLabel(b.maxRisk)}</span></td>
        <td><span class="${riskClass(b.minRisk)}">${riskLabel(b.minRisk)}</span></td>
      </tr>`).join('');

    // Peak/valley bus snapshots
    const snapshotTable = (step, label) => {
      if (!step) return `<p class="field-hint">No ${label} snapshot available.</p>`;
      const rows = step.buses.map(b => `
        <tr>
          <td>${escapeHtml(b.label)}</td>
          <td>${b.Vm.toFixed(4)}</td>
          <td>${(b.Pd ?? 0).toFixed(1)}</td>
          <td>${(b.Pg ?? 0).toFixed(1)}</td>
        </tr>`).join('');
      return `
        <p class="field-hint">Hour ${step.hour} — loadScale ${step.loadScale.toFixed(3)} — total load ${step.totalLoadKw.toFixed(1)} kW — loss ${step.totalLossKw.toFixed(2)} kW</p>
        <div class="table-scroll">
          <table class="data-table" aria-label="${escapeHtml(label)} bus snapshot">
            <thead><tr><th>Bus</th><th>Vm (pu)</th><th>Load (kW)</th><th>Gen (kW)</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    };

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-labelledby="results-heading">
        <h2 id="results-heading">Quasi-Dynamic Load Flow Results</h2>

        <div class="result-group">
          <h3>Summary</h3>
          <div class="result-cards">
            <div class="result-card">
              <div class="result-card-label">Convergence</div>
              <div class="result-card-value ${convergedCount < timestepCount ? 'result-warn' : 'result-ok'}">${convergedCount}/${timestepCount}</div>
              <div class="result-card-sub">${convergePct}% converged</div>
            </div>
            <div class="result-card">
              <div class="result-card-label">Voltage violations</div>
              <div class="result-card-value ${(overVoltageCount + underVoltageCount) > 0 ? 'result-fail' : 'result-ok'}">${overVoltageCount + underVoltageCount}</div>
              <div class="result-card-sub">${overVoltageCount} over · ${underVoltageCount} under</div>
            </div>
            <div class="result-card">
              <div class="result-card-label">Total energy loss</div>
              <div class="result-card-value">${totalEnergyLossKwh.toFixed(1)}</div>
              <div class="result-card-sub">kWh over ${convergedCount} timesteps</div>
            </div>
            <div class="result-card">
              <div class="result-card-label">Load factor</div>
              <div class="result-card-value">${loadFactor != null ? loadFactor.toFixed(3) : '—'}</div>
              <div class="result-card-sub">avg ${avgLoadKw.toFixed(1)} kW / peak ${peakStep ? peakStep.totalLoadKw.toFixed(1) : '—'} kW</div>
            </div>
          </div>
        </div>

        <div class="result-group">
          <h3>Load &amp; Voltage Profile</h3>
          <div id="qd-chart-container">
            <svg id="qd-chart" width="700" height="300" role="img" aria-label="Load and voltage envelope time-series chart">
              <title>Quasi-dynamic load profile and voltage envelope</title>
            </svg>
          </div>
        </div>

        <div class="result-group">
          <h3>Bus Voltage Envelope</h3>
          ${busEnvelope.length === 0
            ? '<p class="field-hint">No bus data — ensure the one-line diagram contains bus components.</p>'
            : `<div class="table-scroll">
                <table class="data-table" aria-label="Bus voltage envelope">
                  <thead>
                    <tr>
                      <th>Bus</th>
                      <th>Max Vm (pu)</th>
                      <th>Min Vm (pu)</th>
                      <th>Max result</th>
                      <th>Min result</th>
                    </tr>
                  </thead>
                  <tbody>${envelopeRows}</tbody>
                </table>
              </div>`}
        </div>

        <div class="result-group">
          <h3>Peak-Load Snapshot (Hour ${peakStep ? peakStep.hour : '—'})</h3>
          ${snapshotTable(peakStep, 'Peak')}
        </div>

        <div class="result-group">
          <h3>Valley-Load Snapshot (Hour ${valleyStep ? valleyStep.hour : '—'})</h3>
          ${snapshotTable(valleyStep, 'Valley')}
        </div>

        <div class="result-group">
          <h3>Warnings</h3>
          ${warningHtml}
        </div>
      </section>`;

    renderChart(timeSeries, busEnvelope);
  }

  // ---------------------------------------------------------------------------
  // SVG time-series chart
  // Dual Y-axis: left = load (kW), right = voltage envelope (pu)
  // ---------------------------------------------------------------------------
  function renderChart(timeSeries, busEnvelope) {
    const svg = document.getElementById('qd-chart');
    if (!svg || timeSeries.length === 0) return;
    while (svg.lastChild && svg.lastChild.nodeName !== 'title') svg.removeChild(svg.lastChild);

    const W = parseInt(svg.getAttribute('width'), 10)  || 700;
    const H = parseInt(svg.getAttribute('height'), 10) || 300;
    const m = { top: 20, right: 55, bottom: 50, left: 65 };
    const iW = W - m.left - m.right;
    const iH = H - m.top  - m.bottom;
    const ns = 'http://www.w3.org/2000/svg';

    const converged = timeSeries.filter(t => t.converged);
    if (converged.length === 0) return;

    const hours    = converged.map(t => t.hour);
    const loads    = converged.map(t => t.totalLoadKw);
    const hourMin  = Math.min(...hours);
    const hourMax  = Math.max(...hours);
    const loadMax  = Math.max(...loads, 1);

    // Per-timestep voltage max/min (across all buses)
    const vmMaxArr = converged.map(t =>
      t.buses.length > 0 ? Math.max(...t.buses.map(b => b.Vm)) : 1.0
    );
    const vmMinArr = converged.map(t =>
      t.buses.length > 0 ? Math.min(...t.buses.map(b => b.Vm)) : 1.0
    );
    const vmPlotMax = Math.max(Math.max(...vmMaxArr), VOLTAGE_HIGH_PU + 0.02);
    const vmPlotMin = Math.min(Math.min(...vmMinArr), VOLTAGE_LOW_PU  - 0.02);

    const xScale  = h => m.left + ((h - hourMin) / Math.max(hourMax - hourMin, 1)) * iW;
    const yLoad   = v => m.top + iH - (v / loadMax) * iH;
    const yVm     = v => m.top + iH - ((v - vmPlotMin) / Math.max(vmPlotMax - vmPlotMin, 0.01)) * iH;

    const el = (tag, attrs = {}) => {
      const e = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
      return e;
    };
    const g = el('g');

    // Grid + axis lines
    [0, 0.25, 0.5, 0.75, 1.0].forEach(frac => {
      const y = m.top + iH * (1 - frac);
      g.appendChild(el('line', { x1: m.left, x2: m.left + iW, y1: y, y2: y, stroke: 'currentColor', 'stroke-opacity': '0.1' }));
      const lbl = el('text', { x: m.left - 4, y: y + 4, 'text-anchor': 'end', 'font-size': '9', fill: 'currentColor' });
      lbl.textContent = (loadMax * frac).toFixed(0);
      g.appendChild(lbl);
    });

    // Voltage limit lines
    [[VOLTAGE_HIGH_PU, '#d9534f'], [VOLTAGE_LOW_PU, '#d9534f']].forEach(([v, color]) => {
      const y = yVm(v);
      g.appendChild(el('line', { x1: m.left, x2: m.left + iW, y1: y, y2: y, stroke: color, 'stroke-dasharray': '5,3', 'stroke-opacity': '0.7' }));
    });

    // Voltage envelope shaded band
    if (vmMaxArr.length > 1) {
      const topPts  = converged.map((t, i) => `${xScale(t.hour).toFixed(1)},${yVm(vmMaxArr[i]).toFixed(1)}`).join(' ');
      const botPts  = [...converged].reverse().map((t, i) => `${xScale(t.hour).toFixed(1)},${yVm(vmMinArr[converged.length - 1 - i]).toFixed(1)}`).join(' ');
      const band = el('polygon', { points: `${topPts} ${botPts}`, fill: '#5bc0de', 'fill-opacity': '0.25' });
      g.appendChild(band);

      // Envelope boundary lines
      const polyline = pts => el('polyline', { points: pts, fill: 'none', stroke: '#5bc0de', 'stroke-width': '1.5', 'stroke-opacity': '0.8' });
      g.appendChild(polyline(topPts));
      g.appendChild(polyline(converged.map((t, i) => `${xScale(t.hour).toFixed(1)},${yVm(vmMinArr[i]).toFixed(1)}`).join(' ')));
    }

    // Load profile line
    if (loads.length > 1) {
      const pts = converged.map(t => `${xScale(t.hour).toFixed(1)},${yLoad(t.totalLoadKw).toFixed(1)}`).join(' ');
      g.appendChild(el('polyline', { points: pts, fill: 'none', stroke: '#f0ad4e', 'stroke-width': '2' }));
    }

    // X axis labels (up to 12 ticks)
    const span = hourMax - hourMin;
    const step = Math.ceil(span / 12);
    for (let h = hourMin; h <= hourMax; h += Math.max(step, 1)) {
      const x = xScale(h);
      g.appendChild(el('line', { x1: x, x2: x, y1: m.top + iH, y2: m.top + iH + 4, stroke: 'currentColor', 'stroke-opacity': '0.4' }));
      const lbl = el('text', { x, y: m.top + iH + 16, 'text-anchor': 'middle', 'font-size': '9', fill: 'currentColor' });
      lbl.textContent = h;
      g.appendChild(lbl);
    }

    // Y-axis label (left — load)
    const yLblL = el('text', { x: -(m.top + iH / 2), y: 14, transform: 'rotate(-90)', 'text-anchor': 'middle', 'font-size': '10', fill: 'currentColor' });
    yLblL.textContent = 'Load (kW)';
    g.appendChild(yLblL);

    // Y-axis label (right — voltage)
    const yLblR = el('text', { x: m.top + iH / 2, y: -(W - 12), transform: 'rotate(90)', 'text-anchor': 'middle', 'font-size': '10', fill: '#5bc0de' });
    yLblR.textContent = 'Vm (pu)';
    g.appendChild(yLblR);

    // Right voltage axis ticks
    [vmPlotMin, VOLTAGE_LOW_PU, 1.0, VOLTAGE_HIGH_PU, vmPlotMax].forEach(v => {
      if (v < vmPlotMin - 0.001 || v > vmPlotMax + 0.001) return;
      const y = yVm(v);
      const lbl = el('text', { x: m.left + iW + 4, y: y + 4, 'text-anchor': 'start', 'font-size': '9', fill: '#5bc0de' });
      lbl.textContent = v.toFixed(2);
      g.appendChild(lbl);
    });

    // X axis title
    const xTitle = el('text', { x: m.left + iW / 2, y: H - 4, 'text-anchor': 'middle', 'font-size': '10', fill: 'currentColor' });
    xTitle.textContent = 'Hour';
    g.appendChild(xTitle);

    // Legend
    const legendY = m.top + iH + 36;
    [
      ['■ Load profile', '#f0ad4e', 0],
      ['■ Voltage envelope', '#5bc0de', 120],
      ['— 0.95/1.05 pu limits', '#d9534f', 250],
    ].forEach(([text, color, dx]) => {
      const t = el('text', { x: m.left + dx, y: legendY, 'font-size': '9', fill: color });
      t.textContent = text;
      g.appendChild(t);
    });

    // Border
    g.appendChild(el('rect', { x: m.left, y: m.top, width: iW, height: iH, fill: 'none', stroke: 'currentColor', 'stroke-opacity': '0.2' }));

    svg.appendChild(g);
  }

  // ---------------------------------------------------------------------------
  // CSV export
  // ---------------------------------------------------------------------------
  function exportCsv(result) {
    const rows = ['hour,loadScale,genScale,converged,totalLoadKw,totalLossKw'];
    for (const t of result.timeSeries) {
      rows.push(`${t.hour},${t.loadScale},${t.genScale},${t.converged},${(t.totalLoadKw ?? 0).toFixed(3)},${(t.totalLossKw ?? 0).toFixed(4)}`);
    }
    rows.push('');
    rows.push('Bus voltage envelope:');
    rows.push('busId,busLabel,maxVm_pu,minVm_pu,maxResult,minResult');
    for (const b of result.busEnvelope) {
      rows.push(`${b.id},${escapeHtml(b.label)},${b.maxVm.toFixed(4)},${b.minVm.toFixed(4)},${b.maxRisk},${b.minRisk}`);
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quasi-dynamic-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
});
