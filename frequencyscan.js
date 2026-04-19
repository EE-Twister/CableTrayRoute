import { runFrequencyScan } from './analysis/frequencyScan.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { escapeHtml } from './src/htmlUtils.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  initStudyApprovalPanel('frequencyScan');

  const form = document.getElementById('freq-scan-form');
  const resultsDiv = document.getElementById('results');
  const errorsDiv = document.getElementById('calc-errors');

  // Dynamic row buttons
  document.getElementById('add-cap-bank-btn').addEventListener('click', () => addCapBankRow());
  document.getElementById('add-filter-btn').addEventListener('click', () => addFilterRow());
  document.getElementById('add-cable-btn').addEventListener('click', () => addCableRow());

  // Restore saved result
  const saved = getStudies().frequencyScan;
  if (saved) {
    restoreForm(saved.inputs);
    renderResults(saved);
  } else {
    // Default one cap bank row
    addCapBankRow(600, 'Cap Bank 1');
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    let result;
    try {
      result = runFrequencyScan(readInputs());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to run frequency scan.';
      errorsDiv.hidden = false;
      errorsDiv.textContent = msg;
      showModal('Input Error', `<p>${escapeHtml(msg)}</p>`, 'error');
      return;
    }
    errorsDiv.hidden = true;
    errorsDiv.textContent = '';

    const studies = getStudies();
    studies.frequencyScan = result;
    setStudies(studies);

    renderResults(result);
  });

  // -----------------------------------------------------------------------
  // Form reading
  // -----------------------------------------------------------------------
  function readInputs() {
    const flt = id => parseFloat(document.getElementById(id).value);
    const int = id => parseInt(document.getElementById(id).value, 10);

    const capacitorBanks = readRowGroup('cap-banks-list', row => {
      const kvar = parseFloat(row.querySelector('.cap-kvar').value);
      const label = row.querySelector('.cap-label').value.trim();
      return { kvar, label: label || 'Cap Bank' };
    });

    const filters = readRowGroup('filters-list', row => {
      const reactorPct = parseFloat(row.querySelector('.filter-reactor-pct').value);
      const kvar = parseFloat(row.querySelector('.filter-kvar').value);
      const label = row.querySelector('.filter-label').value.trim();
      return { reactorPct, kvar, label: label || 'Filter' };
    });

    const cables = readRowGroup('cables-list', row => {
      const rOhmPerKft = parseFloat(row.querySelector('.cable-r').value);
      const xOhmPerKft = parseFloat(row.querySelector('.cable-x').value);
      const lengthKft = parseFloat(row.querySelector('.cable-length').value);
      const label = row.querySelector('.cable-label').value.trim();
      return { rOhmPerKft, xOhmPerKft, lengthKft, label: label || 'Cable' };
    });

    return {
      baseFreqHz: int('base-freq'),
      systemKv: flt('system-kv'),
      scMva: flt('sc-mva'),
      xrRatio: flt('xr-ratio'),
      capacitorBanks,
      filters,
      cables,
      harmonicRange: {
        min: Math.max(1, int('h-min') || 1),
        max: Math.min(50, int('h-max') || 50),
      },
    };
  }

  function readRowGroup(containerId, extractor) {
    const container = document.getElementById(containerId);
    const rows = container.querySelectorAll('.dynamic-row');
    const results = [];
    rows.forEach(row => {
      try {
        results.push(extractor(row));
      } catch (_) { /* skip malformed row */ }
    });
    return results;
  }

  // -----------------------------------------------------------------------
  // Dynamic row builders
  // -----------------------------------------------------------------------
  function addCapBankRow(kvar = 600, label = '') {
    const container = document.getElementById('cap-banks-list');
    const row = document.createElement('div');
    row.className = 'dynamic-row field-row-inline';
    row.innerHTML = `
      <input type="number" class="cap-kvar" min="1" step="50" value="${kvar}" aria-label="Capacitor bank kVAR" required>
      <span class="field-unit">kVAR</span>
      <input type="text" class="cap-label" value="${escapeHtml(label)}" placeholder="Label (optional)" aria-label="Cap bank label">
      <button type="button" class="btn btn-icon remove-row-btn" aria-label="Remove this capacitor bank">×</button>
    `;
    row.querySelector('.remove-row-btn').addEventListener('click', () => row.remove());
    container.appendChild(row);
  }

  function addFilterRow(reactorPct = 5.67, kvar = 600, label = '') {
    const container = document.getElementById('filters-list');
    const row = document.createElement('div');
    row.className = 'dynamic-row field-row-inline';
    row.innerHTML = `
      <input type="number" class="filter-reactor-pct" min="0.1" max="99" step="0.01" value="${reactorPct}" aria-label="Reactor %" required>
      <span class="field-unit">% reactor</span>
      <input type="number" class="filter-kvar" min="1" step="50" value="${kvar}" aria-label="Filter kVAR" required>
      <span class="field-unit">kVAR</span>
      <input type="text" class="filter-label" value="${escapeHtml(label)}" placeholder="Label" aria-label="Filter label">
      <button type="button" class="btn btn-icon remove-row-btn" aria-label="Remove this filter">×</button>
    `;
    row.querySelector('.remove-row-btn').addEventListener('click', () => row.remove());
    container.appendChild(row);
  }

  function addCableRow(rOhmPerKft = 0.05, xOhmPerKft = 0.04, lengthKft = 0.5, label = '') {
    const container = document.getElementById('cables-list');
    const row = document.createElement('div');
    row.className = 'dynamic-row field-row-inline';
    row.innerHTML = `
      <input type="number" class="cable-r" min="0" step="0.001" value="${rOhmPerKft}" aria-label="R (Ω/kft)" required>
      <span class="field-unit">Ω/kft R</span>
      <input type="number" class="cable-x" min="0" step="0.001" value="${xOhmPerKft}" aria-label="X (Ω/kft)">
      <span class="field-unit">Ω/kft X</span>
      <input type="number" class="cable-length" min="0.001" step="0.1" value="${lengthKft}" aria-label="Length (kft)" required>
      <span class="field-unit">kft</span>
      <input type="text" class="cable-label" value="${escapeHtml(label)}" placeholder="Label" aria-label="Cable label">
      <button type="button" class="btn btn-icon remove-row-btn" aria-label="Remove this cable">×</button>
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
    set('base-freq', inputs.baseFreqHz);
    set('system-kv', inputs.systemKv);
    set('sc-mva', inputs.scMva);
    set('xr-ratio', inputs.xrRatio);
    if (inputs.harmonicRange) {
      set('h-min', inputs.harmonicRange.min);
      set('h-max', inputs.harmonicRange.max);
    }
    // Clear defaults and restore dynamic rows
    document.getElementById('cap-banks-list').innerHTML = '';
    (inputs.capacitorBanks || []).forEach(cb => addCapBankRow(cb.kvar, cb.label));
    document.getElementById('filters-list').innerHTML = '';
    (inputs.filters || []).forEach(f => addFilterRow(f.reactorPct, f.kvar, f.label));
    document.getElementById('cables-list').innerHTML = '';
    (inputs.cables || []).forEach(c => addCableRow(c.rOhmPerKft, c.xOhmPerKft, c.lengthKft, c.label));
  }

  // -----------------------------------------------------------------------
  // Results rendering
  // -----------------------------------------------------------------------
  function renderResults(result) {
    const { points, resonances, warnings } = result;

    const warningHtml = warnings.length
      ? `<ul class="drc-findings">${warnings.map(w =>
          `<li class="drc-finding drc-warn"><span class="drc-msg">${escapeHtml(w)}</span></li>`
        ).join('')}</ul>`
      : '<p class="field-hint">No warnings.</p>';

    const resonanceHtml = resonances.length
      ? `<table class="data-table" aria-label="Resonance summary">
          <thead><tr>
            <th>Harmonic order (h)</th>
            <th>Frequency (Hz)</th>
            <th>Z magnitude (Ω)</th>
            <th>Type</th>
            <th>Risk</th>
          </tr></thead>
          <tbody>
            ${resonances.map(r => {
              const riskClass = r.risk === 'danger' ? 'result-fail'
                : r.risk === 'caution' ? 'result-warn' : 'result-ok';
              return `<tr>
                <td>${r.h}</td>
                <td>${r.freqHz}</td>
                <td>${r.zMagOhm.toFixed(3)}</td>
                <td>${escapeHtml(r.type === 'parallel' ? 'Parallel (peak)' : 'Series (trough)')}</td>
                <td><span class="${riskClass}">${escapeHtml(r.risk.toUpperCase())}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`
      : '<p class="field-hint">No resonances detected in the scanned range.</p>';

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-labelledby="results-heading">
        <h2 id="results-heading">Frequency Scan Results</h2>

        <div class="result-group">
          <h3>Resonance Summary</h3>
          ${resonanceHtml}
        </div>

        <div class="result-group">
          <h3>Impedance Profile</h3>
          <div id="scan-chart-container">
            <svg id="freq-scan-chart" width="680" height="300" role="img" aria-label="Impedance vs harmonic order chart">
              <title>Driving-point impedance magnitude vs. harmonic order</title>
            </svg>
          </div>
        </div>

        <div class="result-group">
          <h3>Scan Data</h3>
          <details>
            <summary>Show full scan table (${points.length} points)</summary>
            <div class="table-scroll">
              <table class="data-table compact-table" aria-label="Full frequency scan data">
                <thead><tr>
                  <th>h</th>
                  <th>Freq (Hz)</th>
                  <th>|Z| (Ω)</th>
                  <th>Phase (°)</th>
                  <th>R (Ω)</th>
                  <th>X (Ω)</th>
                </tr></thead>
                <tbody>
                  ${points.map(p => `<tr>
                    <td>${p.h}</td>
                    <td>${p.freqHz}</td>
                    <td>${p.zMagOhm}</td>
                    <td>${p.zPhaseDeg}</td>
                    <td>${p.zRealOhm}</td>
                    <td>${p.zImagOhm}</td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </details>
        </div>

        <div class="result-group">
          <h3>Warnings</h3>
          ${warningHtml}
        </div>
      </section>`;

    renderChart(points, resonances);
  }

  // -----------------------------------------------------------------------
  // SVG chart — impedance magnitude vs. harmonic order
  // -----------------------------------------------------------------------
  function renderChart(points, resonances) {
    const svg = document.getElementById('freq-scan-chart');
    if (!svg) return;

    while (svg.firstChild && svg.firstChild.nodeName !== 'title') svg.removeChild(svg.firstChild);

    const W = parseInt(svg.getAttribute('width'), 10) || 680;
    const H = parseInt(svg.getAttribute('height'), 10) || 300;
    const m = { top: 20, right: 30, bottom: 40, left: 70 };
    const iW = W - m.left - m.right;
    const iH = H - m.top - m.bottom;
    const ns = 'http://www.w3.org/2000/svg';

    const zValues = points.map(p => p.zMagOhm);
    const hValues = points.map(p => p.h);
    const zMax = Math.max(...zValues) * 1.1 || 1;
    const hMin = hValues[0];
    const hMax = hValues[hValues.length - 1];

    function xS(h) { return m.left + ((h - hMin) / (hMax - hMin)) * iW; }
    function yS(z) { return m.top + iH - Math.min((z / zMax) * iH, iH); }

    const g = document.createElementNS(ns, 'g');

    // Grid lines (Y axis)
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const frac = i / yTicks;
      const zVal = frac * zMax;
      const y = yS(zVal);
      const gl = document.createElementNS(ns, 'line');
      gl.setAttribute('x1', m.left); gl.setAttribute('x2', m.left + iW);
      gl.setAttribute('y1', y); gl.setAttribute('y2', y);
      gl.setAttribute('stroke', 'currentColor'); gl.setAttribute('stroke-opacity', '0.12');
      g.appendChild(gl);
      const lbl = document.createElementNS(ns, 'text');
      lbl.setAttribute('x', m.left - 5); lbl.setAttribute('y', y + 4);
      lbl.setAttribute('text-anchor', 'end'); lbl.setAttribute('font-size', '10');
      lbl.setAttribute('fill', 'currentColor');
      lbl.textContent = zVal < 10 ? zVal.toFixed(2) : zVal.toFixed(1);
      g.appendChild(lbl);
    }

    // X axis ticks (every 5 harmonic orders)
    for (let h = Math.ceil(hMin / 5) * 5; h <= hMax; h += 5) {
      const x = xS(h);
      const tl = document.createElementNS(ns, 'line');
      tl.setAttribute('x1', x); tl.setAttribute('x2', x);
      tl.setAttribute('y1', m.top + iH); tl.setAttribute('y2', m.top + iH + 4);
      tl.setAttribute('stroke', 'currentColor');
      g.appendChild(tl);
      const tLabel = document.createElementNS(ns, 'text');
      tLabel.setAttribute('x', x); tLabel.setAttribute('y', m.top + iH + 15);
      tLabel.setAttribute('text-anchor', 'middle'); tLabel.setAttribute('font-size', '10');
      tLabel.setAttribute('fill', 'currentColor');
      tLabel.textContent = `h=${h}`;
      g.appendChild(tLabel);
    }

    // Dominant harmonic markers (vertical dashed lines at 5, 7, 11, 13...)
    [5, 7, 11, 13, 17, 19, 23, 25].filter(h => h >= hMin && h <= hMax).forEach(h => {
      const x = xS(h);
      const dl = document.createElementNS(ns, 'line');
      dl.setAttribute('x1', x); dl.setAttribute('x2', x);
      dl.setAttribute('y1', m.top); dl.setAttribute('y2', m.top + iH);
      dl.setAttribute('stroke', '#e88'); dl.setAttribute('stroke-opacity', '0.5');
      dl.setAttribute('stroke-dasharray', '3,3');
      g.appendChild(dl);
    });

    // Impedance curve
    if (points.length > 1) {
      const pathPoints = points.map(p => `${xS(p.h)},${yS(p.zMagOhm)}`).join(' L ');
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', `M ${pathPoints}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'var(--accent, #4a90d9)');
      path.setAttribute('stroke-width', '2');
      g.appendChild(path);
    }

    // Resonance markers
    resonances.forEach(r => {
      const x = xS(r.h);
      const y = yS(r.zMagOhm);
      const color = r.risk === 'danger' ? '#d9534f'
        : r.risk === 'caution' ? '#f0ad4e' : '#5cb85c';
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', x); circle.setAttribute('cy', y);
      circle.setAttribute('r', '5');
      circle.setAttribute('fill', color);
      g.appendChild(circle);
    });

    // Axis labels
    const yLbl = document.createElementNS(ns, 'text');
    yLbl.setAttribute('x', -(m.top + iH / 2)); yLbl.setAttribute('y', 14);
    yLbl.setAttribute('transform', 'rotate(-90)'); yLbl.setAttribute('text-anchor', 'middle');
    yLbl.setAttribute('font-size', '11'); yLbl.setAttribute('fill', 'currentColor');
    yLbl.textContent = '|Z| (Ω)';
    g.appendChild(yLbl);

    const xLbl = document.createElementNS(ns, 'text');
    xLbl.setAttribute('x', m.left + iW / 2); xLbl.setAttribute('y', H - 4);
    xLbl.setAttribute('text-anchor', 'middle'); xLbl.setAttribute('font-size', '11');
    xLbl.setAttribute('fill', 'currentColor');
    xLbl.textContent = 'Harmonic Order (h)';
    g.appendChild(xLbl);

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
