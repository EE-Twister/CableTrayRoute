import { runVoltageStabilityStudy } from './analysis/voltageStability.mjs';
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

  const form = document.getElementById('vs-form');
  const resultsDiv = document.getElementById('results');
  const errorsDiv = document.getElementById('calc-errors');
  const exportBtn = document.getElementById('export-csv-btn');

  document.getElementById('add-bus-btn').addEventListener('click', () => addBusRow());
  document.getElementById('add-branch-btn').addEventListener('click', () => addBranchRow());

  const saved = getStudies().voltageStability;
  if (saved && saved.inputs) {
    restoreForm(saved.inputs);
    renderResults(saved);
    exportBtn.hidden = false;
  } else {
    addDefaultSystem();
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    let inputs, result;
    try {
      inputs = readInputs();
      result = runVoltageStabilityStudy(inputs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to run voltage stability study.';
      errorsDiv.hidden = false;
      errorsDiv.textContent = msg;
      showModal('Input Error', `<p>${escapeHtml(msg)}</p>`, 'error');
      return;
    }
    errorsDiv.hidden = true;
    errorsDiv.textContent = '';

    const studies = getStudies();
    studies.voltageStability = result;
    setStudies(studies);

    renderResults(result);
    exportBtn.hidden = false;
  });

  exportBtn.addEventListener('click', () => {
    const saved = getStudies().voltageStability;
    if (saved) exportCSV(saved);
  });

  // ---------------------------------------------------------------------------
  // Bus rows
  // ---------------------------------------------------------------------------
  let busCounter = 0;

  function addBusRow(defaults = {}) {
    busCounter++;
    const id = defaults.id || `B${busCounter}`;
    const type = defaults.type || (busCounter === 1 ? 'slack' : 'PQ');
    const baseKV = defaults.baseKV ?? 13.8;
    const Pd = defaults.Pd ?? 0;
    const Qd = defaults.Qd ?? 0;
    const Pg = defaults.Pg ?? 0;

    const row = document.createElement('div');
    row.className = 'dynamic-row';
    row.setAttribute('role', 'listitem');
    row.innerHTML = `
      <label class="sr-only">Bus ID</label>
      <input type="text" class="bus-id" value="${escapeHtml(String(id))}" placeholder="ID" aria-label="Bus ID" required style="width:5rem">
      <label class="sr-only">Bus type</label>
      <select class="bus-type" aria-label="Bus type">
        <option value="slack"${type === 'slack' ? ' selected' : ''}>Slack</option>
        <option value="PQ"${type === 'PQ' ? ' selected' : ''}>PQ</option>
        <option value="PV"${type === 'PV' ? ' selected' : ''}>PV</option>
      </select>
      <label class="sr-only">Base kV</label>
      <input type="number" class="bus-kv" value="${baseKV}" min="0.1" step="0.01" aria-label="Base kV" title="Base kV" style="width:5rem">
      <label class="sr-only">Load Pd (kW)</label>
      <input type="number" class="bus-pd" value="${Pd}" min="0" step="1" aria-label="Active load Pd (kW)" title="Active load Pd (kW)" style="width:6rem">
      <label class="sr-only">Load Qd (kVAR)</label>
      <input type="number" class="bus-qd" value="${Qd}" min="0" step="1" aria-label="Reactive load Qd (kVAR)" title="Reactive load Qd (kVAR)" style="width:6rem">
      <label class="sr-only">Generation Pg (kW)</label>
      <input type="number" class="bus-pg" value="${Pg}" min="0" step="1" aria-label="Generation Pg (kW)" title="Generation Pg (kW)" style="width:6rem">
      <button type="button" class="btn btn-sm remove-row-btn" aria-label="Remove bus">✕</button>`;
    row.querySelector('.remove-row-btn').addEventListener('click', () => row.remove());

    const labels = document.createElement('div');
    labels.className = 'dynamic-row-labels';
    labels.innerHTML = '<span style="width:5rem">ID</span><span style="width:5rem">Type</span><span style="width:5rem">Base kV</span><span style="width:6rem">Pd (kW)</span><span style="width:6rem">Qd (kVAR)</span><span style="width:6rem">Pg (kW)</span>';

    const list = document.getElementById('bus-list');
    if (list.children.length === 0) list.appendChild(labels);
    list.appendChild(row);
  }

  // ---------------------------------------------------------------------------
  // Branch rows
  // ---------------------------------------------------------------------------
  let branchCounter = 0;

  function addBranchRow(defaults = {}) {
    branchCounter++;
    const from = defaults.from || '';
    const to = defaults.to || '';
    const r = defaults.r ?? 0.3;
    const x = defaults.x ?? 1.0;

    const row = document.createElement('div');
    row.className = 'dynamic-row';
    row.setAttribute('role', 'listitem');
    row.innerHTML = `
      <label class="sr-only">From bus</label>
      <input type="text" class="branch-from" value="${escapeHtml(from)}" placeholder="From bus ID" aria-label="From bus ID" style="width:6rem">
      <label class="sr-only">To bus</label>
      <input type="text" class="branch-to" value="${escapeHtml(to)}" placeholder="To bus ID" aria-label="To bus ID" style="width:6rem">
      <label class="sr-only">R (ohms)</label>
      <input type="number" class="branch-r" value="${r}" min="0" step="0.001" aria-label="R (ohms)" title="Resistance (Ω)" style="width:6rem">
      <label class="sr-only">X (ohms)</label>
      <input type="number" class="branch-x" value="${x}" min="0.001" step="0.001" aria-label="X (ohms)" title="Reactance (Ω)" style="width:6rem">
      <button type="button" class="btn btn-sm remove-row-btn" aria-label="Remove branch">✕</button>`;
    row.querySelector('.remove-row-btn').addEventListener('click', () => row.remove());

    const list = document.getElementById('branch-list');
    if (list.children.length === 0) {
      const labels = document.createElement('div');
      labels.className = 'dynamic-row-labels';
      labels.innerHTML = '<span style="width:6rem">From</span><span style="width:6rem">To</span><span style="width:6rem">R (Ω)</span><span style="width:6rem">X (Ω)</span>';
      list.appendChild(labels);
    }
    list.appendChild(row);
  }

  // ---------------------------------------------------------------------------
  // Default 3-bus 13.8 kV system
  // ---------------------------------------------------------------------------
  function addDefaultSystem() {
    busCounter = 0;
    branchCounter = 0;
    addBusRow({ id: 'B1', type: 'slack', baseKV: 13.8, Pd: 0, Qd: 0, Pg: 0 });
    addBusRow({ id: 'B2', type: 'PQ', baseKV: 13.8, Pd: 2000, Qd: 800, Pg: 0 });
    addBusRow({ id: 'B3', type: 'PQ', baseKV: 13.8, Pd: 1500, Qd: 600, Pg: 0 });
    addBranchRow({ from: 'B1', to: 'B2', r: 0.3, x: 1.0 });
    addBranchRow({ from: 'B2', to: 'B3', r: 0.4, x: 1.2 });
  }

  // ---------------------------------------------------------------------------
  // Read inputs from form
  // ---------------------------------------------------------------------------
  function readInputs() {
    const flt = id => parseFloat(document.getElementById(id).value);

    const busRows = [...document.querySelectorAll('#bus-list .dynamic-row')];
    const branchRows = [...document.querySelectorAll('#branch-list .dynamic-row')];

    if (busRows.length === 0) throw new Error('Add at least one bus before running.');

    const buses = busRows.map(row => ({
      id: row.querySelector('.bus-id').value.trim(),
      type: row.querySelector('.bus-type').value,
      baseKV: parseFloat(row.querySelector('.bus-kv').value) || 13.8,
      Pd: parseFloat(row.querySelector('.bus-pd').value) || 0,
      Qd: parseFloat(row.querySelector('.bus-qd').value) || 0,
      Pg: parseFloat(row.querySelector('.bus-pg').value) || 0,
      Vm: 1.0,
      Va: 0,
      connections: [],
    }));

    const busMap = new Map(buses.map(b => [b.id, b]));

    branchRows.forEach(row => {
      const from = row.querySelector('.branch-from').value.trim();
      const to = row.querySelector('.branch-to').value.trim();
      const r = parseFloat(row.querySelector('.branch-r').value) || 0;
      const x = parseFloat(row.querySelector('.branch-x').value) || 0;
      if (from && to && busMap.has(from)) {
        busMap.get(from).connections.push({ target: to, r, x });
      }
    });

    const targetId = document.getElementById('target-bus-id').value.trim() || undefined;

    return {
      buses,
      baseMVA: flt('base-mva') || 100,
      lambdaMax: flt('lambda-max') || 3.0,
      lambdaStep: flt('lambda-step') || 0.05,
      targetBusId: targetId,
      qMinMvar: flt('q-min') || -50,
      qMaxMvar: flt('q-max') || 50,
      qStepMvar: flt('q-step') || 2,
      systemLabel: document.getElementById('system-label').value.trim(),
    };
  }

  // ---------------------------------------------------------------------------
  // Restore saved form state
  // ---------------------------------------------------------------------------
  function restoreForm(inputs) {
    if (!inputs) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('base-mva', inputs.baseMVA ?? 100);
    set('system-label', inputs.systemLabel ?? '');
    set('lambda-max', inputs.lambdaMax ?? 3.0);
    set('lambda-step', inputs.lambdaStep ?? 0.05);
    set('target-bus-id', inputs.targetBusId ?? '');
    set('q-min', inputs.qMinMvar ?? -50);
    set('q-max', inputs.qMaxMvar ?? 50);
    set('q-step', inputs.qStepMvar ?? 2);

    busCounter = 0;
    branchCounter = 0;
    document.getElementById('bus-list').innerHTML = '';
    document.getElementById('branch-list').innerHTML = '';

    if (Array.isArray(inputs.buses)) {
      const seenBranches = new Set();
      inputs.buses.forEach(b => {
        addBusRow(b);
        (b.connections || []).forEach(conn => {
          const key = `${b.id}:${conn.target}`;
          if (!seenBranches.has(key)) {
            seenBranches.add(key);
            addBranchRow({ from: b.id, to: conn.target, r: conn.r, x: conn.x });
          }
        });
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Render results
  // ---------------------------------------------------------------------------
  function renderResults(result) {
    const { summary, pvCurve, qvCurve, warnings } = result;

    const convergedPoints = pvCurve.points.filter(p => p.converged);
    const collapseFound = pvCurve.collapseFound;

    const marginClass = summary.loadabilityMarginPct >= 5 ? 'result-ok' : 'result-fail';
    const marginIcon = summary.loadabilityMarginPct >= 5 ? 'PASS' : 'CAUTION';

    let html = `
      <section class="result-section" aria-label="Voltage Stability Results">
        <h2>Results${summary.systemLabel ? ` — ${escapeHtml(summary.systemLabel)}` : ''}</h2>

        <table class="results-table" aria-label="Stability summary">
          <thead><tr><th>Parameter</th><th>Value</th><th>Status</th></tr></thead>
          <tbody>
            <tr>
              <td>Operating Load</td>
              <td>${summary.operatingLoadMW.toFixed(3)} MW</td>
              <td>—</td>
            </tr>
            <tr>
              <td>Maximum Loadability</td>
              <td>${summary.maxLoadMW.toFixed(3)} MW</td>
              <td>${collapseFound ? 'Nose found' : 'Not found (increase λ<sub>max</sub>)'}</td>
            </tr>
            <tr>
              <td>Loadability Margin</td>
              <td>${summary.loadabilityMarginMW.toFixed(3)} MW (${summary.loadabilityMarginPct.toFixed(1)}%)</td>
              <td class="${marginClass}">${marginIcon}</td>
            </tr>
            <tr>
              <td>Critical Bus</td>
              <td>${escapeHtml(summary.criticalBusId || '—')}</td>
              <td>—</td>
            </tr>
            <tr>
              <td>Reactive Margin (${escapeHtml(String(summary.targetBusId))})</td>
              <td>${summary.reactiveMarginMvar != null ? summary.reactiveMarginMvar.toFixed(2) + ' MVAR' : '—'}</td>
              <td>—</td>
            </tr>
            <tr>
              <td>Collapse at λ</td>
              <td>${summary.collapseLambda != null ? summary.collapseLambda.toFixed(3) : 'Not reached'}</td>
              <td>—</td>
            </tr>
          </tbody>
        </table>`;

    if (warnings && warnings.length > 0) {
      html += `<div class="result-warn" role="alert"><strong>Warnings:</strong><ul>${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div>`;
    }

    // Voltage profile at operating point
    const opPt = pvCurve.points.find(p => Math.abs(p.lambda - 1.0) < 1e-6 && p.converged);
    if (opPt) {
      html += `<h3>Voltage Profile (Operating Point)</h3>
        <table class="results-table" aria-label="Voltage profile">
          <thead><tr><th>Bus</th><th>|V| (pu)</th><th>Angle (°)</th></tr></thead>
          <tbody>${opPt.buses.map(b => `<tr><td>${escapeHtml(b.id)}</td><td>${b.Vm.toFixed(4)}</td><td>${b.Va.toFixed(3)}</td></tr>`).join('')}</tbody>
        </table>`;
    }

    html += '</section>';
    html += `<section class="result-section" aria-label="P-V Curve">
      <h2>P-V Curve (Nose Curve)</h2>
      ${renderPVChart(pvCurve)}
    </section>`;

    html += `<section class="result-section" aria-label="Q-V Curve">
      <h2>Q-V Curve — Bus ${escapeHtml(String(summary.targetBusId))}</h2>
      ${renderQVChart(qvCurve)}
    </section>`;

    resultsDiv.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // SVG chart helpers
  // ---------------------------------------------------------------------------
  const SVG_W = 480, SVG_H = 280, PAD = { t: 20, r: 20, b: 50, l: 55 };
  const CW = SVG_W - PAD.l - PAD.r;
  const CH = SVG_H - PAD.t - PAD.b;

  function mapX(v, min, max) { return PAD.l + ((v - min) / (max - min || 1)) * CW; }
  function mapY(v, min, max) { return PAD.t + CH - ((v - min) / (max - min || 1)) * CH; }

  function renderPVChart(pvCurve) {
    const pts = pvCurve.points.filter(p => p.converged);
    if (pts.length === 0) return '<p class="result-fail">No converged points — check bus/branch data.</p>';

    const busIds = pts[0].buses.map(b => b.id);
    const xVals = pts.map(p => p.totalLoadMW);
    const xMin = 0, xMax = Math.max(...xVals) * 1.05;

    const allVm = pts.flatMap(p => p.buses.map(b => b.Vm));
    const yMin = Math.max(0, Math.min(...allVm) - 0.05);
    const yMax = Math.min(1.1, Math.max(...allVm) + 0.05);

    const colors = ['#2196f3', '#ff5722', '#4caf50', '#9c27b0', '#ff9800'];

    let paths = '';
    busIds.forEach((id, bi) => {
      const d = pts.map((p, i) => {
        const bv = p.buses.find(b => b.id === id);
        if (!bv) return '';
        const cx = mapX(p.totalLoadMW, xMin, xMax);
        const cy = mapY(bv.Vm, yMin, yMax);
        return `${i === 0 ? 'M' : 'L'}${cx.toFixed(1)},${cy.toFixed(1)}`;
      }).join(' ');
      paths += `<path d="${d}" fill="none" stroke="${colors[bi % colors.length]}" stroke-width="2"/>`;
    });

    // Collapse marker
    let collapseMarker = '';
    if (pvCurve.collapseFound && xVals.length > 0) {
      const lastX = mapX(xVals[xVals.length - 1], xMin, xMax);
      collapseMarker = `<line x1="${lastX.toFixed(1)}" y1="${PAD.t}" x2="${lastX.toFixed(1)}" y2="${PAD.t + CH}" stroke="#f44336" stroke-dasharray="4,3" stroke-width="1.5"/>
        <text x="${(lastX + 3).toFixed(1)}" y="${(PAD.t + 10).toFixed(1)}" font-size="10" fill="#f44336">nose</text>`;
    }

    // Axes
    const xTicks = 5;
    let xAxis = '', yAxis = '';
    for (let i = 0; i <= xTicks; i++) {
      const v = xMin + (i / xTicks) * (xMax - xMin);
      const cx = mapX(v, xMin, xMax);
      xAxis += `<line x1="${cx.toFixed(1)}" y1="${PAD.t + CH}" x2="${cx.toFixed(1)}" y2="${PAD.t + CH + 4}" stroke="currentColor" stroke-width="1"/>
        <text x="${cx.toFixed(1)}" y="${PAD.t + CH + 16}" text-anchor="middle" font-size="10">${v.toFixed(1)}</text>`;
    }
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const v = yMin + (i / yTicks) * (yMax - yMin);
      const cy = mapY(v, yMin, yMax);
      yAxis += `<line x1="${PAD.l - 4}" y1="${cy.toFixed(1)}" x2="${PAD.l}" y2="${cy.toFixed(1)}" stroke="currentColor" stroke-width="1"/>
        <text x="${PAD.l - 6}" y="${cy.toFixed(1)}" dominant-baseline="middle" text-anchor="end" font-size="10">${v.toFixed(2)}</text>`;
    }

    // Legend
    const legend = busIds.map((id, i) => `<g transform="translate(${PAD.l + i * 80},${SVG_H - 10})">
      <line x1="0" y1="0" x2="20" y2="0" stroke="${colors[i % colors.length]}" stroke-width="2"/>
      <text x="24" y="4" font-size="10">${escapeHtml(id)}</text></g>`).join('');

    return `<svg viewBox="0 0 ${SVG_W} ${SVG_H}" width="100%" style="max-width:${SVG_W}px;font-family:inherit" aria-label="P-V nose curve">
      <rect x="${PAD.l}" y="${PAD.t}" width="${CW}" height="${CH}" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"/>
      ${paths}${collapseMarker}${xAxis}${yAxis}
      <text x="${PAD.l + CW / 2}" y="${SVG_H - 2}" text-anchor="middle" font-size="11">Total Load (MW)</text>
      <text transform="rotate(-90)" x="${-(PAD.t + CH / 2)}" y="14" text-anchor="middle" font-size="11">Voltage (pu)</text>
      ${legend}
    </svg>`;
  }

  function renderQVChart(qvCurve) {
    const pts = qvCurve.points.filter(p => p.converged);
    if (pts.length === 0) return '<p class="result-fail">No converged Q-V points.</p>';

    const xVals = pts.map(p => p.qInjMvar);
    const yVals = pts.map(p => p.voltage);
    const xMin = Math.min(...xVals) - 1, xMax = Math.max(...xVals) + 1;
    const yMin = Math.max(0, Math.min(...yVals) - 0.05), yMax = Math.min(1.2, Math.max(...yVals) + 0.05);

    const d = pts.map((p, i) => {
      const cx = mapX(p.qInjMvar, xMin, xMax);
      const cy = mapY(p.voltage, yMin, yMax);
      return `${i === 0 ? 'M' : 'L'}${cx.toFixed(1)},${cy.toFixed(1)}`;
    }).join(' ');

    // Axes
    const xTicks = 6;
    let xAxis = '', yAxis = '';
    for (let i = 0; i <= xTicks; i++) {
      const v = xMin + (i / xTicks) * (xMax - xMin);
      const cx = mapX(v, xMin, xMax);
      xAxis += `<line x1="${cx.toFixed(1)}" y1="${PAD.t + CH}" x2="${cx.toFixed(1)}" y2="${PAD.t + CH + 4}" stroke="currentColor" stroke-width="1"/>
        <text x="${cx.toFixed(1)}" y="${PAD.t + CH + 16}" text-anchor="middle" font-size="10">${v.toFixed(0)}</text>`;
    }
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const v = yMin + (i / yTicks) * (yMax - yMin);
      const cy = mapY(v, yMin, yMax);
      yAxis += `<line x1="${PAD.l - 4}" y1="${cy.toFixed(1)}" x2="${PAD.l}" y2="${cy.toFixed(1)}" stroke="currentColor" stroke-width="1"/>
        <text x="${PAD.l - 6}" y="${cy.toFixed(1)}" dominant-baseline="middle" text-anchor="end" font-size="10">${v.toFixed(2)}</text>`;
    }

    // Reactive margin annotation
    let marginNote = '';
    if (qvCurve.reactiveMarginMvar != null) {
      marginNote = `<text x="${PAD.l + 5}" y="${PAD.t + 14}" font-size="10" fill="#2196f3">Reactive margin: ${qvCurve.reactiveMarginMvar.toFixed(2)} MVAR</text>`;
    }

    return `<svg viewBox="0 0 ${SVG_W} ${SVG_H}" width="100%" style="max-width:${SVG_W}px;font-family:inherit" aria-label="Q-V curve">
      <rect x="${PAD.l}" y="${PAD.t}" width="${CW}" height="${CH}" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"/>
      <path d="${d}" fill="none" stroke="#2196f3" stroke-width="2"/>
      ${marginNote}${xAxis}${yAxis}
      <text x="${PAD.l + CW / 2}" y="${SVG_H - 2}" text-anchor="middle" font-size="11">Q Injection (MVAR)</text>
      <text transform="rotate(-90)" x="${-(PAD.t + CH / 2)}" y="14" text-anchor="middle" font-size="11">Voltage (pu)</text>
    </svg>`;
  }

  // ---------------------------------------------------------------------------
  // CSV export
  // ---------------------------------------------------------------------------
  function exportCSV(result) {
    const rows = [['Type', 'Lambda', 'Total Load MW', 'Bus ID', 'Vm (pu)', 'Va (deg)', 'Converged']];
    result.pvCurve.points.forEach(p => {
      p.buses.forEach(b => {
        rows.push(['PV', p.lambda, p.totalLoadMW.toFixed(4), b.id, b.Vm.toFixed(6), b.Va.toFixed(4), p.converged]);
      });
    });
    rows.push([]);
    rows.push(['Q-V Curve — Bus', result.summary.targetBusId]);
    rows.push(['Q Inj (MVAR)', 'Voltage (pu)', 'Converged']);
    result.qvCurve.points.forEach(p => {
      rows.push([p.qInjMvar.toFixed(2), p.voltage.toFixed(6), p.converged]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'voltage_stability.csv';
    a.click();
  }
});
