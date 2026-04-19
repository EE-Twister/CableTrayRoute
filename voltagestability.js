import { runPVCurve, runQVCurve } from './analysis/voltageStability.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { escapeHtml } from './src/htmlUtils.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  initStudyApprovalPanel('voltageStability');

  const form       = document.getElementById('vs-form');
  const resultsDiv = document.getElementById('results');
  const errorsDiv  = document.getElementById('calc-errors');

  // Restore saved result
  const saved = getStudies().voltageStability;
  if (saved) {
    restoreForm(saved.inputs);
    renderResults(saved);
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    errorsDiv.hidden = true;
    errorsDiv.textContent = '';

    let result;
    try {
      result = runStudy(readInputs());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to run voltage stability study.';
      errorsDiv.hidden = false;
      errorsDiv.textContent = msg;
      showModal('Input Error', `<p>${escapeHtml(msg)}</p>`, 'error');
      return;
    }

    const studies = getStudies();
    studies.voltageStability = result;
    setStudies(studies);

    renderResults(result);
  });

  // -------------------------------------------------------------------------
  // Input reading
  // -------------------------------------------------------------------------
  function readInputs() {
    const flt = id => parseFloat(document.getElementById(id).value);
    const curveType = document.querySelector('input[name="curve-type"]:checked')?.value ?? 'pv';
    return {
      scMva:        flt('sc-mva'),
      xrRatio:      flt('xr-ratio'),
      baseMva:      flt('base-mva'),
      systemKv:     flt('system-kv'),
      loadMw:       flt('load-mw'),
      powerFactor:  flt('power-factor'),
      curveType,
      steps: 120,
    };
  }

  // -------------------------------------------------------------------------
  // Study runner
  // -------------------------------------------------------------------------
  function runStudy(inputs) {
    const { curveType, ...opts } = inputs;
    const result = { curveType, inputs };
    if (curveType === 'pv' || curveType === 'both') {
      result.pv = runPVCurve({ ...opts });
    }
    if (curveType === 'qv' || curveType === 'both') {
      result.qv = runQVCurve({ ...opts });
    }
    result.timestamp = new Date().toISOString();
    return result;
  }

  // -------------------------------------------------------------------------
  // Form restoration
  // -------------------------------------------------------------------------
  function restoreForm(inputs) {
    if (!inputs) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    set('sc-mva',       inputs.scMva);
    set('xr-ratio',     inputs.xrRatio);
    set('base-mva',     inputs.baseMva);
    set('system-kv',    inputs.systemKv);
    set('load-mw',      inputs.loadMw);
    set('power-factor', inputs.powerFactor);
    if (inputs.curveType) {
      const radio = document.querySelector(`input[name="curve-type"][value="${inputs.curveType}"]`);
      if (radio) radio.checked = true;
    }
  }

  // -------------------------------------------------------------------------
  // Results rendering
  // -------------------------------------------------------------------------
  function renderResults(result) {
    const sections = [];

    if (result.pv) {
      sections.push(renderPVSection(result.pv));
    }
    if (result.qv) {
      sections.push(renderQVSection(result.qv));
    }

    const allWarnings = [
      ...(result.pv?.warnings ?? []),
      ...(result.qv?.warnings ?? []),
    ];

    const warningsHtml = allWarnings.length
      ? `<div class="result-group">
           <h3>Warnings</h3>
           <ul class="drc-findings">
             ${allWarnings.map(w =>
               `<li class="drc-finding drc-warn"><span class="drc-msg">${escapeHtml(w)}</span></li>`
             ).join('')}
           </ul>
         </div>`
      : '';

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-labelledby="results-heading">
        <h2 id="results-heading">Voltage Stability Results</h2>
        ${sections.join('')}
        ${warningsHtml}
      </section>`;

    if (result.pv) renderPVChart(result.pv);
    if (result.qv) renderQVChart(result.qv);
    renderExportButtons(result);
  }

  // -------------------------------------------------------------------------
  // P-V section HTML
  // -------------------------------------------------------------------------
  function renderPVSection(pv) {
    const marginClass = pv.loadMarginPct >= 20 ? 'result-ok'
      : pv.loadMarginPct >= 10 ? 'result-warn' : 'result-fail';

    return `
      <div class="result-group">
        <h3>P-V Curve</h3>
        <table class="data-table" aria-label="P-V summary">
          <tbody>
            <tr><th scope="row">Base-case active load</th><td>${pv.baseCasePMw} MW</td></tr>
            <tr><th scope="row">Base-case voltage</th><td>${(pv.baseCaseVPu * 100).toFixed(2)}%</td></tr>
            <tr><th scope="row">Nose-point power</th><td>${pv.nosePoint.pMw} MW</td></tr>
            <tr><th scope="row">Nose-point voltage</th><td>${(pv.nosePoint.vPu * 100).toFixed(2)}%</td></tr>
            <tr><th scope="row">MW stability margin</th>
              <td><span class="${marginClass}">${pv.loadMarginMW} MW (${pv.loadMarginPct}%)</span></td></tr>
            <tr><th scope="row">Thevenin impedance (pu)</th>
              <td>R = ${pv.impedance.r}, X = ${pv.impedance.x}</td></tr>
          </tbody>
        </table>
        <div id="pv-chart-container" style="margin-top:1rem">
          <svg id="pv-chart" width="640" height="320" role="img" aria-label="P-V nose curve chart">
            <title>Voltage magnitude vs. active power loading (P-V curve)</title>
          </svg>
        </div>
        <details>
          <summary>Show P-V data table (${pv.upperPoints.length} upper + ${pv.lowerPoints.length} lower points)</summary>
          <div class="table-scroll">
            <table class="data-table compact-table" aria-label="P-V curve data">
              <thead><tr>
                <th>λ (pu)</th>
                <th>P (MW)</th>
                <th>V upper (pu)</th>
                <th>V lower (pu)</th>
              </tr></thead>
              <tbody>
                ${buildPVTableRows(pv)}
              </tbody>
            </table>
          </div>
        </details>
      </div>`;
  }

  function buildPVTableRows(pv) {
    const lowerMap = new Map(pv.lowerPoints.map(p => [p.lambdaPu, p.vPu]));
    return pv.upperPoints.map(p =>
      `<tr>
         <td>${p.lambdaPu}</td>
         <td>${p.pMw}</td>
         <td>${p.vPu}</td>
         <td>${lowerMap.has(p.lambdaPu) ? lowerMap.get(p.lambdaPu) : '—'}</td>
       </tr>`
    ).join('');
  }

  // -------------------------------------------------------------------------
  // Q-V section HTML
  // -------------------------------------------------------------------------
  function renderQVSection(qv) {
    const marginClass = qv.qMarginMvar > 0 ? 'result-ok' : 'result-fail';

    return `
      <div class="result-group">
        <h3>Q-V Curve</h3>
        <table class="data-table" aria-label="Q-V summary">
          <tbody>
            <tr><th scope="row">Operating voltage</th><td>${(qv.vOperating * 100).toFixed(2)}%</td></tr>
            <tr><th scope="row">Q-margin (reactive reserve)</th>
              <td><span class="${marginClass}">${qv.qMarginMvar} MVAr</span></td></tr>
            <tr><th scope="row">Thevenin impedance (pu)</th>
              <td>R = ${qv.impedance.r}, X = ${qv.impedance.x}</td></tr>
          </tbody>
        </table>
        <div id="qv-chart-container" style="margin-top:1rem">
          <svg id="qv-chart" width="640" height="320" role="img" aria-label="Q-V curve chart">
            <title>Reactive compensation vs. bus voltage (Q-V curve)</title>
          </svg>
        </div>
        <details>
          <summary>Show Q-V data table (${qv.upperPoints.length} upper + ${qv.lowerPoints.length} lower points)</summary>
          <div class="table-scroll">
            <table class="data-table compact-table" aria-label="Q-V curve data">
              <thead><tr><th>V (pu)</th><th>Q_comp upper (MVAr)</th><th>Q_comp lower (MVAr)</th></tr></thead>
              <tbody>
                ${buildQVTableRows(qv)}
              </tbody>
            </table>
          </div>
        </details>
      </div>`;
  }

  function buildQVTableRows(qv) {
    const lowerMap = new Map(qv.lowerPoints.map(p => [p.vPu, p.qCompMvar]));
    return qv.upperPoints.map(p =>
      `<tr>
         <td>${p.vPu}</td>
         <td>${p.qCompMvar}</td>
         <td>${lowerMap.has(p.vPu) ? lowerMap.get(p.vPu) : '—'}</td>
       </tr>`
    ).join('');
  }

  // -------------------------------------------------------------------------
  // Export buttons
  // -------------------------------------------------------------------------
  function renderExportButtons(result) {
    const container = document.createElement('div');
    container.className = 'result-group form-actions';

    const csvBtn = document.createElement('button');
    csvBtn.className = 'btn';
    csvBtn.textContent = 'Export CSV';
    csvBtn.addEventListener('click', () => exportCSV(result));
    container.appendChild(csvBtn);

    resultsDiv.appendChild(container);
  }

  function exportCSV(result) {
    const lines = ['Type,Lambda (pu),P (MW),V (pu),Q_comp (MVAr),Branch'];
    if (result.pv) {
      result.pv.upperPoints.forEach(p =>
        lines.push(`PV,${p.lambdaPu},${p.pMw},${p.vPu},,upper`)
      );
      result.pv.lowerPoints.forEach(p =>
        lines.push(`PV,${p.lambdaPu},${p.pMw},${p.vPu},,lower`)
      );
    }
    if (result.qv) {
      result.qv.upperPoints.forEach(p =>
        lines.push(`QV,,,${p.vPu},${p.qCompMvar},upper`)
      );
      result.qv.lowerPoints.forEach(p =>
        lines.push(`QV,,,${p.vPu},${p.qCompMvar},lower`)
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'voltage_stability.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // -------------------------------------------------------------------------
  // SVG chart helpers
  // -------------------------------------------------------------------------
  function makeSVGPath(points, xFn, yFn, stroke) {
    if (points.length < 2) return null;
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFn(p)},${yFn(p)}`).join(' ');
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', d);
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', stroke);
    el.setAttribute('stroke-width', '2');
    return el;
  }

  function makeSVGGrid(svg, m, iW, iH, yTicks, yMin, yMax, yFmt) {
    const ns = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(ns, 'g');
    for (let i = 0; i <= yTicks; i++) {
      const v = yMin + (i / yTicks) * (yMax - yMin);
      const y = m.top + iH - (i / yTicks) * iH;
      const gl = document.createElementNS(ns, 'line');
      gl.setAttribute('x1', m.left); gl.setAttribute('x2', m.left + iW);
      gl.setAttribute('y1', y);      gl.setAttribute('y2', y);
      gl.setAttribute('stroke', 'currentColor'); gl.setAttribute('stroke-opacity', '0.12');
      g.appendChild(gl);
      const lbl = document.createElementNS(ns, 'text');
      lbl.setAttribute('x', m.left - 5); lbl.setAttribute('y', y + 4);
      lbl.setAttribute('text-anchor', 'end'); lbl.setAttribute('font-size', '10');
      lbl.setAttribute('fill', 'currentColor');
      lbl.textContent = yFmt(v);
      g.appendChild(lbl);
    }
    const border = document.createElementNS(ns, 'rect');
    border.setAttribute('x', m.left); border.setAttribute('y', m.top);
    border.setAttribute('width', iW); border.setAttribute('height', iH);
    border.setAttribute('fill', 'none'); border.setAttribute('stroke', 'currentColor');
    border.setAttribute('stroke-opacity', '0.2');
    g.appendChild(border);
    return g;
  }

  function addAxisLabel(svg, text, isY, m, iW, iH) {
    const ns = 'http://www.w3.org/2000/svg';
    const lbl = document.createElementNS(ns, 'text');
    lbl.setAttribute('font-size', '11');
    lbl.setAttribute('fill', 'currentColor');
    if (isY) {
      lbl.setAttribute('x', -(m.top + iH / 2));
      lbl.setAttribute('y', 14);
      lbl.setAttribute('transform', 'rotate(-90)');
      lbl.setAttribute('text-anchor', 'middle');
    } else {
      const W = m.left + iW + m.right;
      const H = m.top + iH + m.bottom;
      lbl.setAttribute('x', m.left + iW / 2);
      lbl.setAttribute('y', H - 4);
      lbl.setAttribute('text-anchor', 'middle');
    }
    lbl.textContent = text;
    svg.appendChild(lbl);
  }

  function addNoseMarker(g, x, yTop, yBottom, label, ns) {
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', x); line.setAttribute('x2', x);
    line.setAttribute('y1', yTop); line.setAttribute('y2', yBottom);
    line.setAttribute('stroke', '#e88'); line.setAttribute('stroke-dasharray', '4,3');
    line.setAttribute('stroke-opacity', '0.7');
    g.appendChild(line);
    const txt = document.createElementNS(ns, 'text');
    txt.setAttribute('x', x + 4); txt.setAttribute('y', yTop + 14);
    txt.setAttribute('font-size', '9'); txt.setAttribute('fill', '#e88');
    txt.textContent = label;
    g.appendChild(txt);
  }

  // -------------------------------------------------------------------------
  // P-V SVG chart
  // -------------------------------------------------------------------------
  function renderPVChart(pv) {
    const svg = document.getElementById('pv-chart');
    if (!svg) return;
    const ns = 'http://www.w3.org/2000/svg';
    while (svg.firstChild && svg.firstChild.nodeName !== 'title') svg.removeChild(svg.firstChild);

    const W = 640, H = 320;
    const m = { top: 20, right: 30, bottom: 40, left: 60 };
    const iW = W - m.left - m.right;
    const iH = H - m.top - m.bottom;

    const allPts = [...pv.upperPoints, ...pv.lowerPoints];
    const pMax = Math.max(...allPts.map(p => p.pMw)) * 1.05 || 1;
    const vMin = 0, vMax = 1.1;

    const xS = p => m.left + (p / pMax) * iW;
    const yS = v => m.top + iH - ((v - vMin) / (vMax - vMin)) * iH;

    const g = makeSVGGrid(svg, m, iW, iH, 5, vMin, vMax, v => v.toFixed(2));
    svg.appendChild(g);

    // X ticks
    const xTicks = 5;
    for (let i = 0; i <= xTicks; i++) {
      const p = (i / xTicks) * pMax;
      const x = xS(p);
      const tl = document.createElementNS(ns, 'line');
      tl.setAttribute('x1', x); tl.setAttribute('x2', x);
      tl.setAttribute('y1', m.top + iH); tl.setAttribute('y2', m.top + iH + 4);
      tl.setAttribute('stroke', 'currentColor');
      g.appendChild(tl);
      const lbl = document.createElementNS(ns, 'text');
      lbl.setAttribute('x', x); lbl.setAttribute('y', m.top + iH + 15);
      lbl.setAttribute('text-anchor', 'middle'); lbl.setAttribute('font-size', '10');
      lbl.setAttribute('fill', 'currentColor');
      lbl.textContent = Math.round(p);
      g.appendChild(lbl);
    }

    // Upper branch
    const upper = makeSVGPath(pv.upperPoints, p => xS(p.pMw), p => yS(p.vPu), 'var(--accent, #4a90d9)');
    if (upper) svg.appendChild(upper);

    // Lower branch (dashed)
    if (pv.lowerPoints.length > 1) {
      const lower = makeSVGPath(pv.lowerPoints, p => xS(p.pMw), p => yS(p.vPu), 'var(--accent, #4a90d9)');
      if (lower) {
        lower.setAttribute('stroke-dasharray', '5,4');
        lower.setAttribute('stroke-opacity', '0.6');
        svg.appendChild(lower);
      }
    }

    // Nose marker
    addNoseMarker(g, xS(pv.nosePoint.pMw), m.top, m.top + iH,
      `Nose ${pv.nosePoint.pMw} MW`, ns);

    // Base-case operating point
    const bx = xS(pv.baseCasePMw);
    const by = yS(pv.baseCaseVPu);
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', bx); dot.setAttribute('cy', by);
    dot.setAttribute('r', '5'); dot.setAttribute('fill', '#5cb85c');
    svg.appendChild(dot);

    // Collapse voltage line
    const vcLine = document.createElementNS(ns, 'line');
    vcLine.setAttribute('x1', m.left); vcLine.setAttribute('x2', m.left + iW);
    vcLine.setAttribute('y1', yS(0.5)); vcLine.setAttribute('y2', yS(0.5));
    vcLine.setAttribute('stroke', '#d9534f'); vcLine.setAttribute('stroke-dasharray', '3,3');
    vcLine.setAttribute('stroke-opacity', '0.5');
    svg.appendChild(vcLine);

    addAxisLabel(svg, 'V (pu)', true, m, iW, iH);
    addAxisLabel(svg, 'Active Power (MW)', false, m, iW, iH);
  }

  // -------------------------------------------------------------------------
  // Q-V SVG chart
  // -------------------------------------------------------------------------
  function renderQVChart(qv) {
    const svg = document.getElementById('qv-chart');
    if (!svg) return;
    const ns = 'http://www.w3.org/2000/svg';
    while (svg.firstChild && svg.firstChild.nodeName !== 'title') svg.removeChild(svg.firstChild);

    const W = 640, H = 320;
    const m = { top: 20, right: 30, bottom: 40, left: 75 };
    const iW = W - m.left - m.right;
    const iH = H - m.top - m.bottom;

    const allPts = [...qv.upperPoints, ...qv.lowerPoints];
    const qMin = Math.min(...allPts.map(p => p.qCompMvar)) * 1.1;
    const qMax = Math.max(...allPts.map(p => p.qCompMvar)) * 1.1;
    const vMin = 0.2, vMax = 1.15;

    const xS = v => m.left + ((v - vMin) / (vMax - vMin)) * iW;
    const yS = q => m.top + iH - ((q - qMin) / (qMax - qMin)) * iH;

    const g = makeSVGGrid(svg, m, iW, iH, 5, qMin, qMax, q => Math.round(q));
    svg.appendChild(g);

    // X ticks (voltage)
    const vSteps = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1];
    vSteps.filter(v => v >= vMin && v <= vMax).forEach(v => {
      const x = xS(v);
      const tl = document.createElementNS(ns, 'line');
      tl.setAttribute('x1', x); tl.setAttribute('x2', x);
      tl.setAttribute('y1', m.top + iH); tl.setAttribute('y2', m.top + iH + 4);
      tl.setAttribute('stroke', 'currentColor');
      g.appendChild(tl);
      const lbl = document.createElementNS(ns, 'text');
      lbl.setAttribute('x', x); lbl.setAttribute('y', m.top + iH + 15);
      lbl.setAttribute('text-anchor', 'middle'); lbl.setAttribute('font-size', '10');
      lbl.setAttribute('fill', 'currentColor');
      lbl.textContent = v.toFixed(1);
      g.appendChild(lbl);
    });

    // Q=0 reference line (operating point)
    if (qMin < 0 && qMax > 0) {
      const zLine = document.createElementNS(ns, 'line');
      zLine.setAttribute('x1', m.left); zLine.setAttribute('x2', m.left + iW);
      zLine.setAttribute('y1', yS(0)); zLine.setAttribute('y2', yS(0));
      zLine.setAttribute('stroke', 'currentColor'); zLine.setAttribute('stroke-opacity', '0.3');
      svg.appendChild(zLine);
    }

    // Upper branch
    const upper = makeSVGPath(qv.upperPoints, p => xS(p.vPu), p => yS(p.qCompMvar), 'var(--accent, #4a90d9)');
    if (upper) svg.appendChild(upper);

    // Lower branch (dashed)
    if (qv.lowerPoints.length > 1) {
      const lower = makeSVGPath(qv.lowerPoints, p => xS(p.vPu), p => yS(p.qCompMvar), 'var(--accent, #4a90d9)');
      if (lower) {
        lower.setAttribute('stroke-dasharray', '5,4');
        lower.setAttribute('stroke-opacity', '0.6');
        svg.appendChild(lower);
      }
    }

    // Operating point marker (Q_comp = 0)
    const opX = xS(qv.vOperating);
    const opY = yS(0);
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', opX); dot.setAttribute('cy', opY);
    dot.setAttribute('r', '5'); dot.setAttribute('fill', '#5cb85c');
    svg.appendChild(dot);

    addAxisLabel(svg, 'Q compensation (MVAr)', true, m, iW, iH);
    addAxisLabel(svg, 'Bus Voltage (pu)', false, m, iW, iH);
  }
});
