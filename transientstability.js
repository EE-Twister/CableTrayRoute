import {
  simulateSwingEquation,
  findCriticalClearingTime,
  equalAreaCriterion,
  initialRotorAngle,
} from './analysis/transientStability.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const calcBtn   = document.getElementById('calc-btn');
  const cctBtn    = document.getElementById('cct-btn');
  const resultsDiv = document.getElementById('results');

  calcBtn.addEventListener('click', () => runSimulation(false));
  cctBtn.addEventListener('click',  () => runSimulation(true));

  function getInputs() {
    return {
      H:            parseFloat(document.getElementById('inertia').value),
      f:            parseFloat(document.getElementById('frequency').value) || 60,
      Pm:           parseFloat(document.getElementById('mech-power').value),
      Pmax_pre:     parseFloat(document.getElementById('pmax-pre').value),
      Pmax_fault:   parseFloat(document.getElementById('pmax-fault').value),
      Pmax_post:    parseFloat(document.getElementById('pmax-post').value),
      t_clear:      parseFloat(document.getElementById('t-clear').value),
      t_end:        parseFloat(document.getElementById('t-end').value) || 2.0,
    };
  }

  function validate(inp) {
    if (!Number.isFinite(inp.H) || inp.H <= 0) {
      showAlertModal('Input Error', 'Inertia constant H must be a positive number (MW·s/MVA).');
      return false;
    }
    if (!Number.isFinite(inp.Pm) || inp.Pm <= 0) {
      showAlertModal('Input Error', 'Mechanical power Pm must be positive (pu).');
      return false;
    }
    if (!Number.isFinite(inp.Pmax_pre) || inp.Pmax_pre <= 0) {
      showAlertModal('Input Error', 'Pre-fault Pmax must be positive (pu).');
      return false;
    }
    if (!Number.isFinite(inp.Pmax_fault) || inp.Pmax_fault < 0) {
      showAlertModal('Input Error', 'During-fault Pmax must be ≥ 0 (pu).');
      return false;
    }
    if (!Number.isFinite(inp.Pmax_post) || inp.Pmax_post <= 0) {
      showAlertModal('Input Error', 'Post-fault Pmax must be positive (pu).');
      return false;
    }
    if (!Number.isFinite(inp.t_clear) || inp.t_clear <= 0) {
      showAlertModal('Input Error', 'Fault clearing time must be positive (s).');
      return false;
    }
    return true;
  }

  function runSimulation(findCCT) {
    const inp = getInputs();
    if (!validate(inp)) return;

    // EAC analytical estimate
    let eac;
    try {
      eac = equalAreaCriterion(inp);
    } catch (err) {
      eac = null;
    }

    // Numerical simulation
    let simResult;
    let delta0;
    try {
      delta0 = initialRotorAngle(inp.Pm, inp.Pmax_pre);
      simResult = simulateSwingEquation({ ...inp, delta0, t_fault: 0 });
    } catch (err) {
      showAlertModal('Simulation Error', err.message);
      return;
    }

    // Optional CCT search
    let cctResult = null;
    if (findCCT) {
      try {
        cctResult = findCriticalClearingTime(
          { ...inp, delta0, t_fault: 0, t_end: inp.t_end },
          { tMax: Math.min(inp.t_end * 0.9, 2.0) }
        );
      } catch (err) {
        cctResult = { cct_s: NaN, cct_cycles: NaN, converged: false };
      }
    }

    renderResults(inp, simResult, eac, cctResult, delta0);
    renderPlot(simResult, inp);
  }

  function renderResults(inp, sim, eac, cct, delta0) {
    const statusClass = sim.stable ? 'result-ok' : 'result-fail';
    const statusLabel = sim.stable ? 'Stable' : 'Unstable';

    const eacRows = eac && eac.feasible ? `
      <tr><th scope="row">Initial Rotor Angle δ₀</th><td>${eac.delta0_deg.toFixed(2)}°</td></tr>
      <tr><th scope="row">Critical Clearing Angle δ<sub>cr</sub></th><td>${eac.deltaCr_deg.toFixed(2)}°</td></tr>
      <tr><th scope="row">Max Stable Angle δ<sub>max</sub></th><td>${eac.deltaMax_deg.toFixed(2)}°</td></tr>
      <tr><th scope="row">EAC Estimated CCT</th><td>${
        isFinite(eac.eac_cct_s) ? `${eac.eac_cct_s.toFixed(4)} s (${eac.eac_cct_cycles.toFixed(1)} cycles)`
        : 'Stable regardless of clearing time'}</td></tr>` : '';

    const cctRow = cct ? `
      <tr><th scope="row">Numerical CCT</th>
          <td class="status-badge ${cct.cct_s > 0 ? 'result-ok' : 'result-fail'}">
            ${Number.isFinite(cct.cct_s) ? `${cct.cct_s.toFixed(4)} s (${cct.cct_cycles.toFixed(1)} cycles)` : '—'}
            ${!cct.converged ? ' (did not converge)' : ''}
          </td></tr>` : '';

    resultsDiv.innerHTML = `
      <div class="result-card ${statusClass}" role="status" aria-live="polite">
        <h2>Simulation Results</h2>
        <table class="result-table" aria-label="Transient stability results">
          <tbody>
            <tr><th scope="row">Stability Status</th>
                <td class="status-badge ${statusClass}">${statusLabel}</td></tr>
            <tr><th scope="row">Applied Clearing Time</th>
                <td>${inp.t_clear.toFixed(4)} s (${(inp.t_clear * inp.f).toFixed(1)} cycles)</td></tr>
            <tr><th scope="row">Max Rotor Angle</th>
                <td>${sim.deltaMax_deg.toFixed(2)}°
                    ${sim.deltaMax_deg >= 90 ? ' <span class="status-badge result-fail">ALERT: &gt;90°</span>' : ''}</td></tr>
            ${sim.t_unstable != null
              ? `<tr><th scope="row">Instability Detected At</th><td>${sim.t_unstable.toFixed(4)} s</td></tr>` : ''}
            ${eacRows}
            ${cctRow}
          </tbody>
        </table>
        ${eac && !eac.feasible ? `<div class="result-recommendation">${esc(eac.note)}</div>` : ''}
        ${eac && eac.feasible ? `<div class="result-recommendation">${esc(eac.note)}</div>` : ''}
        <details class="method-note">
          <summary>How this was calculated</summary>
          <p>Swing equation: M = 2H/ωs = 2×${inp.H}/(2π×${inp.f}) = ${(2*inp.H/(2*Math.PI*inp.f)).toFixed(5)} s²/rad</p>
          <p>Initial rotor angle: δ₀ = arcsin(Pm/Pmax_pre) = arcsin(${inp.Pm}/${inp.Pmax_pre}) = ${(delta0 * 180 / Math.PI).toFixed(2)}°</p>
          <p>Integration by 4th-order Runge-Kutta, dt = 1 ms. Fault inception at t=0.</p>
          <p>Instability criterion: δ ≥ 180° (pole slip).</p>
        </details>
      </div>`;
  }

  function renderPlot(sim, inp) {
    const container = document.getElementById('plot-container');
    if (!container || typeof Plotly === 'undefined') return;
    container.hidden = false;

    // Downsample for large arrays
    const stride = Math.max(1, Math.floor(sim.time.length / 1000));
    const t = [], d_deg = [];
    for (let i = 0; i < sim.time.length; i += stride) {
      t.push(sim.time[i]);
      d_deg.push(sim.delta[i] * 180 / Math.PI);
    }

    const traces = [
      {
        x: t, y: d_deg,
        type: 'scatter', mode: 'lines',
        name: 'Rotor Angle δ (deg)',
        line: { color: '#2563eb', width: 2 },
      },
      {
        x: [inp.t_clear, inp.t_clear],
        y: [Math.min(...d_deg) - 5, Math.max(...d_deg) + 5],
        type: 'scatter', mode: 'lines',
        name: `Fault Cleared (t=${inp.t_clear}s)`,
        line: { color: '#dc2626', width: 1, dash: 'dash' },
      },
      {
        x: [t[0], t[t.length - 1]],
        y: [180, 180],
        type: 'scatter', mode: 'lines',
        name: 'Stability Limit (180°)',
        line: { color: '#f59e0b', width: 1, dash: 'dot' },
      },
    ];

    const layout = {
      title: 'Rotor Angle vs Time',
      xaxis: { title: 'Time (s)', zeroline: false },
      yaxis: { title: 'Rotor Angle (degrees)', zeroline: false },
      legend: { orientation: 'h', y: -0.2 },
      margin: { t: 40, b: 80, l: 60, r: 20 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { color: getComputedStyle(document.documentElement).getPropertyValue('--color-text') || '#1e293b' },
    };

    Plotly.newPlot('plot-div', traces, layout, { responsive: true, displayModeBar: false });
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
});
