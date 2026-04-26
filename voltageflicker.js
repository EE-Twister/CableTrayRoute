import {
  runVoltageFlickerStudy,
  PST_LIMIT,
  PST_PASS_THRESHOLD,
} from './analysis/voltageFlicker.mjs';
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

  initStudyBasisPanel('voltageFlicker', {
    standard: 'IEC 61000-4-15:2010+AMD1:2023',
    clause: 'Annex A — Simplified rectangular voltage-change method',
    formulas: [
      'ΔV% = ΔP_kW / S_sc_kVA × 100 — voltage dip at PCC (IEC 61000-3-3 §4)',
      'Pst = f(ΔV%, r) — bilinear log-log interpolation on iso-Pst contours',
      'Plt = (1/N × Σ Pst_i³)^(1/3) — long-term flicker over N = 12 periods',
    ],
    assumptions: [
      'Thevenin short-circuit equivalence at PCC: S_sc = Un² / Zsc',
      'Rectangular voltage step model (not sinusoidal or ramp changes)',
      'Pst look-up from IEC 61000-4-15 Figure A.1 via bilinear interpolation',
    ],
    limitations: [
      'Full time-domain flickermeter waveform simulation (IEC §4) not implemented',
      'Ramp and sinusoidal voltage change profiles not modeled',
      'IEEE 1453 North American 120 V / 60 Hz weighting not separately validated',
    ],
    benchmarkId: 'iec61000-4-15',
  });
  initStudyApprovalPanel('voltageFlicker');

  const form = document.getElementById('flicker-form');
  const resultsDiv = document.getElementById('results');
  const errorsDiv = document.getElementById('calc-errors');

  document.getElementById('add-load-step-btn').addEventListener('click', () => addLoadStepRow());

  // Restore saved result or add a default row
  const saved = getStudies().voltageFlicker;
  if (saved) {
    restoreForm(saved.inputs);
    renderResults(saved);
  } else {
    addLoadStepRow('Arc Furnace', 5000, 120, 'Arc Furnace');
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    let result;
    try {
      result = runVoltageFlickerStudy(readInputs());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to run flicker study.';
      errorsDiv.hidden = false;
      errorsDiv.textContent = msg;
      showModal('Input Error', `<p>${escapeHtml(msg)}</p>`, 'error');
      return;
    }
    errorsDiv.hidden = true;
    errorsDiv.textContent = '';

    const studies = getStudies();
    studies.voltageFlicker = result;
    setStudies(studies);

    renderResults(result);
  });

  // -----------------------------------------------------------------------
  // Form reading
  // -----------------------------------------------------------------------
  function readInputs() {
    const flt = id => parseFloat(document.getElementById(id).value);

    const loadStepsContainer = document.getElementById('load-steps-list');
    const rows = loadStepsContainer.querySelectorAll('.dynamic-row');
    const loadSteps = [];
    rows.forEach(row => {
      try {
        loadSteps.push({
          label: row.querySelector('.load-label').value.trim() || 'Load Step',
          loadKw: parseFloat(row.querySelector('.load-kw').value),
          repetitionsPerHour: parseFloat(row.querySelector('.load-rph').value),
        });
      } catch (_) { /* skip malformed row */ }
    });

    const pstSeriesRaw = document.getElementById('pst-series').value.trim();
    let pstSeriesForPlt = null;
    if (pstSeriesRaw) {
      const parsed = pstSeriesRaw.split(/[\s,]+/).map(Number).filter(v => Number.isFinite(v) && v >= 0);
      if (parsed.length > 0) pstSeriesForPlt = parsed.slice(0, 12);
    }

    return {
      studyLabel: '',
      nominalVoltageKv: flt('nominal-kv'),
      systemKva: flt('system-kva'),
      xrRatio: flt('xr-ratio'),
      loadSteps,
      pstSeriesForPlt,
    };
  }

  // -----------------------------------------------------------------------
  // Dynamic row builder
  // -----------------------------------------------------------------------
  function addLoadStepRow(label = '', kw = 1000, rph = 10, type = 'Other') {
    const container = document.getElementById('load-steps-list');
    const row = document.createElement('div');
    row.className = 'dynamic-row field-row-inline';
    row.innerHTML = `
      <input type="text" class="load-label" value="${escapeHtml(label)}" placeholder="Label" aria-label="Load step label">
      <input type="number" class="load-kw" min="0.1" step="1" value="${kw}" aria-label="Step load (kW)" required>
      <span class="field-unit">kW</span>
      <input type="number" class="load-rph" min="0.001" step="0.1" value="${rph}" aria-label="Repetitions per hour" required>
      <span class="field-unit">events/hr</span>
      <select class="load-type-select" aria-label="Load type">
        <option${type === 'Arc Furnace'   ? ' selected' : ''}>Arc Furnace</option>
        <option${type === 'Motor Start'   ? ' selected' : ''}>Motor Start</option>
        <option${type === 'Welder'        ? ' selected' : ''}>Welder</option>
        <option${type === 'Wind Turbine'  ? ' selected' : ''}>Wind Turbine</option>
        <option${type === 'Other'         ? ' selected' : ''}>Other</option>
      </select>
      <button type="button" class="btn btn-icon remove-row-btn" aria-label="Remove this load step">×</button>
    `;
    row.querySelector('.remove-row-btn').addEventListener('click', () => row.remove());
    container.appendChild(row);
  }

  // -----------------------------------------------------------------------
  // Form restoration from saved result
  // -----------------------------------------------------------------------
  function restoreForm(inputs) {
    if (!inputs) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    set('system-kva', inputs.systemKva);
    set('xr-ratio', inputs.xrRatio);
    set('nominal-kv', inputs.nominalVoltageKv);
    if (Array.isArray(inputs.pstSeriesForPlt) && inputs.pstSeriesForPlt.length > 0) {
      set('pst-series', inputs.pstSeriesForPlt.join(', '));
    }
    document.getElementById('load-steps-list').innerHTML = '';
    (inputs.loadSteps || []).forEach(s => addLoadStepRow(s.label, s.loadKw, s.repetitionsPerHour));
  }

  // -----------------------------------------------------------------------
  // Results rendering
  // -----------------------------------------------------------------------
  function renderResults(result) {
    const { loadStepResults, worstPst, worstPstRisk, plt, pltRisk, pltSource, warnings } = result;

    const riskClass = r => r === 'fail' ? 'result-fail' : r === 'marginal' ? 'result-warn' : 'result-ok';
    const riskLabel = r => r === 'fail' ? 'FAIL' : r === 'marginal' ? 'MARGINAL' : 'PASS';

    const warningHtml = warnings.length
      ? `<ul class="drc-findings">${warnings.map(w =>
          `<li class="drc-finding drc-warn"><span class="drc-msg">${escapeHtml(w)}</span></li>`
        ).join('')}</ul>`
      : '<p class="field-hint">No warnings.</p>';

    const stepRows = loadStepResults.map(r => `
      <tr>
        <td>${escapeHtml(r.label)}</td>
        <td>${r.loadKw.toLocaleString()}</td>
        <td>${r.repetitionsPerHour}</td>
        <td>${r.deltaVPercent.toFixed(3)}</td>
        <td><strong>${r.pst.toFixed(3)}</strong></td>
        <td>${r.pstLimitPct}%</td>
        <td><span class="${riskClass(r.pstRisk)}">${riskLabel(r.pstRisk)}</span></td>
      </tr>`).join('');

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-labelledby="results-heading">
        <h2 id="results-heading">Flicker Study Results</h2>

        <div class="result-group">
          <h3>Summary</h3>
          <div class="result-cards">
            <div class="result-card">
              <div class="result-card-label">Worst-case Pst</div>
              <div class="result-card-value ${riskClass(worstPstRisk)}">${worstPst.toFixed(3)}</div>
              <div class="result-card-sub"><span class="${riskClass(worstPstRisk)}">${riskLabel(worstPstRisk)}</span> (limit = ${PST_LIMIT})</div>
            </div>
            <div class="result-card">
              <div class="result-card-label">Plt (2-hour)</div>
              <div class="result-card-value ${riskClass(pltRisk)}">${plt.toFixed(3)}</div>
              <div class="result-card-sub"><span class="${riskClass(pltRisk)}">${riskLabel(pltRisk)}</span> — ${pltSource === 'measured' ? 'from measured series' : 'conservative estimate'}</div>
            </div>
          </div>
        </div>

        <div class="result-group">
          <h3>Pst Bar Chart</h3>
          <div id="flicker-chart-container">
            <svg id="flicker-chart" width="680" height="280" role="img" aria-label="Pst severity bar chart">
              <title>Pst severity index per load step</title>
            </svg>
          </div>
        </div>

        <div class="result-group">
          <h3>Per-Load-Step Results</h3>
          <div class="table-scroll">
            <table class="data-table" aria-label="Flicker results by load step">
              <thead>
                <tr>
                  <th>Load Step</th>
                  <th>ΔP (kW)</th>
                  <th>Events/hr</th>
                  <th>ΔV/V (%)</th>
                  <th>Pst</th>
                  <th>% of limit</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>${stepRows}</tbody>
            </table>
          </div>
        </div>

        <div class="result-group">
          <h3>Warnings</h3>
          ${warningHtml}
        </div>
      </section>`;

    renderChart(loadStepResults);
  }

  // -----------------------------------------------------------------------
  // SVG bar chart — Pst per load step
  // -----------------------------------------------------------------------
  function renderChart(loadStepResults) {
    const svg = document.getElementById('flicker-chart');
    if (!svg) return;

    while (svg.firstChild && svg.firstChild.nodeName !== 'title') svg.removeChild(svg.firstChild);

    const W = parseInt(svg.getAttribute('width'), 10) || 680;
    const H = parseInt(svg.getAttribute('height'), 10) || 280;
    const m = { top: 20, right: 30, bottom: 50, left: 60 };
    const iW = W - m.left - m.right;
    const iH = H - m.top - m.bottom;
    const ns = 'http://www.w3.org/2000/svg';
    const n = loadStepResults.length;
    if (n === 0) return;

    const pstMax = Math.max(...loadStepResults.map(r => r.pst), PST_LIMIT * 1.2);
    const yScale = v => m.top + iH - Math.min((v / pstMax) * iH, iH);
    const barW = Math.max(20, Math.min(80, (iW / n) * 0.6));
    const slotW = iW / n;

    const g = document.createElementNS(ns, 'g');

    // Y-axis grid lines
    const yTicks = [0, PST_PASS_THRESHOLD, PST_LIMIT, pstMax];
    yTicks.forEach(v => {
      const y = yScale(v);
      const gl = document.createElementNS(ns, 'line');
      gl.setAttribute('x1', m.left); gl.setAttribute('x2', m.left + iW);
      gl.setAttribute('y1', y); gl.setAttribute('y2', y);
      gl.setAttribute('stroke', 'currentColor'); gl.setAttribute('stroke-opacity', '0.12');
      if (v === PST_PASS_THRESHOLD) { gl.setAttribute('stroke', '#f0ad4e'); gl.setAttribute('stroke-dasharray', '5,3'); gl.setAttribute('stroke-opacity', '0.7'); }
      if (v === PST_LIMIT)         { gl.setAttribute('stroke', '#d9534f'); gl.setAttribute('stroke-dasharray', '5,3'); gl.setAttribute('stroke-opacity', '0.8'); }
      g.appendChild(gl);
      if (v <= pstMax) {
        const lbl = document.createElementNS(ns, 'text');
        lbl.setAttribute('x', m.left - 5); lbl.setAttribute('y', y + 4);
        lbl.setAttribute('text-anchor', 'end'); lbl.setAttribute('font-size', '10');
        lbl.setAttribute('fill', v === PST_PASS_THRESHOLD ? '#f0ad4e' : v === PST_LIMIT ? '#d9534f' : 'currentColor');
        lbl.textContent = v === PST_PASS_THRESHOLD ? '0.8' : v === PST_LIMIT ? '1.0' : v.toFixed(1);
        g.appendChild(lbl);
      }
    });

    // Bars
    loadStepResults.forEach((r, i) => {
      const cx = m.left + slotW * i + slotW / 2;
      const barX = cx - barW / 2;
      const barH = Math.max(1, (r.pst / pstMax) * iH);
      const barY = m.top + iH - barH;

      const color = r.pstRisk === 'fail' ? '#d9534f' : r.pstRisk === 'marginal' ? '#f0ad4e' : '#5cb85c';

      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', barX); rect.setAttribute('y', barY);
      rect.setAttribute('width', barW); rect.setAttribute('height', barH);
      rect.setAttribute('fill', color); rect.setAttribute('opacity', '0.85');
      g.appendChild(rect);

      // Value label above bar
      const vLbl = document.createElementNS(ns, 'text');
      vLbl.setAttribute('x', cx); vLbl.setAttribute('y', barY - 4);
      vLbl.setAttribute('text-anchor', 'middle'); vLbl.setAttribute('font-size', '10');
      vLbl.setAttribute('fill', 'currentColor');
      vLbl.textContent = r.pst.toFixed(2);
      g.appendChild(vLbl);

      // X-axis label
      const xLbl = document.createElementNS(ns, 'text');
      const shortLabel = r.label.length > 10 ? r.label.slice(0, 9) + '…' : r.label;
      xLbl.setAttribute('x', cx); xLbl.setAttribute('y', m.top + iH + 16);
      xLbl.setAttribute('text-anchor', 'middle'); xLbl.setAttribute('font-size', '10');
      xLbl.setAttribute('fill', 'currentColor');
      xLbl.textContent = shortLabel;
      g.appendChild(xLbl);
    });

    // Legend
    const legendY = m.top + iH + 36;
    [['\u25A0 ≤ 0.8 Pass', '#5cb85c', 0], ['\u25A0 0.8–1.0 Marginal', '#f0ad4e', 130], ['\u25A0 > 1.0 Fail', '#d9534f', 280]].forEach(([text, color, dx]) => {
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', m.left + dx); t.setAttribute('y', legendY);
      t.setAttribute('font-size', '10'); t.setAttribute('fill', color);
      t.textContent = text;
      g.appendChild(t);
    });

    // Y-axis label
    const yLbl = document.createElementNS(ns, 'text');
    yLbl.setAttribute('x', -(m.top + iH / 2)); yLbl.setAttribute('y', 14);
    yLbl.setAttribute('transform', 'rotate(-90)'); yLbl.setAttribute('text-anchor', 'middle');
    yLbl.setAttribute('font-size', '11'); yLbl.setAttribute('fill', 'currentColor');
    yLbl.textContent = 'Pst';
    g.appendChild(yLbl);

    // Border
    const border = document.createElementNS(ns, 'rect');
    border.setAttribute('x', m.left); border.setAttribute('y', m.top);
    border.setAttribute('width', iW); border.setAttribute('height', iH);
    border.setAttribute('fill', 'none'); border.setAttribute('stroke', 'currentColor');
    border.setAttribute('stroke-opacity', '0.2');
    g.appendChild(border);

    svg.appendChild(g);
  }
});
