import { runReliability } from './analysis/reliability.js';
import { getOneLine, getStudies, setStudies } from './dataStore.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const runBtn = document.getElementById('run-btn');
  const resultsDiv = document.getElementById('results');
  const chartContainer = document.getElementById('chart-container');
  const overrideArea = document.getElementById('component-override-area');

  // Component overrides: id → { mtbf, mttr }
  let overrides = {};
  let loadedComponents = [];

  runBtn.addEventListener('click', () => {
    const { sheets } = getOneLine();
    const allComps = Array.isArray(sheets[0]?.components)
      ? sheets.flatMap(s => s.components || [])
      : (Array.isArray(sheets) ? sheets : []);

    if (!allComps.length) {
      showAlertModal('No Components', 'No components found in the One-Line Diagram. Please create a one-line diagram first.');
      return;
    }

    // Apply overrides to components
    const components = allComps.map(c => {
      const ov = overrides[c.id];
      if (ov) {
        return { ...c, mtbf: ov.mtbf ?? c.mtbf, mttr: ov.mttr ?? c.mttr };
      }
      return c;
    });

    loadedComponents = components;
    buildOverrideTable(allComps);

    let result;
    try {
      result = runReliability(components);
    } catch (err) {
      resultsDiv.innerHTML = `<p class="result-fail">Analysis error: ${esc(err.message)}</p>`;
      return;
    }

    const studies = getStudies();
    studies.reliability = result;
    setStudies(studies);

    renderResults(result);
    renderChart(result);
  });

  function buildOverrideTable(comps) {
    // Filter to eligible (non-visual, non-connector) components
    const VISUAL_TYPES = new Set(['dimension', 'annotation']);
    const eligible = comps.filter(c => {
      if (!c) return false;
      if (VISUAL_TYPES.has(c.type)) return false;
      const t = (c.type || '').toLowerCase();
      return !['link', 'cable', 'feeder', 'conductor', 'tap', 'splice'].some(k => t.includes(k));
    });

    if (!eligible.length) {
      overrideArea.innerHTML = '<p class="field-hint">No eligible components found for override.</p>';
      return;
    }

    const rows = eligible.map(c => {
      const ov = overrides[c.id] || {};
      return `<tr>
        <td>${esc(c.id || c.tag || '—')}</td>
        <td>${esc(c.type || '—')}</td>
        <td><input type="number" class="ov-mtbf" data-id="${esc(c.id)}"
            min="1" step="1" value="${ov.mtbf ?? (c.mtbf || '')}"
            placeholder="${c.mtbf || 'e.g. 8760'}" aria-label="MTBF hours for ${esc(c.id)}"></td>
        <td><input type="number" class="ov-mttr" data-id="${esc(c.id)}"
            min="0" step="0.5" value="${ov.mttr ?? (c.mttr || '')}"
            placeholder="${c.mttr || 'e.g. 4'}" aria-label="MTTR hours for ${esc(c.id)}"></td>
      </tr>`;
    }).join('');

    overrideArea.innerHTML = `
      <table class="result-table" aria-label="Component MTBF/MTTR overrides">
        <thead>
          <tr>
            <th scope="col">Component ID</th>
            <th scope="col">Type</th>
            <th scope="col">MTBF (hr)</th>
            <th scope="col">MTTR (hr)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;

    overrideArea.querySelectorAll('.ov-mtbf, .ov-mttr').forEach(input => {
      input.addEventListener('change', () => {
        const id = input.dataset.id;
        if (!overrides[id]) overrides[id] = {};
        const val = parseFloat(input.value);
        if (input.classList.contains('ov-mtbf')) {
          overrides[id].mtbf = Number.isFinite(val) ? val : undefined;
        } else {
          overrides[id].mttr = Number.isFinite(val) ? val : undefined;
        }
      });
    });
  }

  function renderResults(result) {
    const availPct = (result.systemAvailability * 100).toFixed(4);
    const outage = result.expectedOutage.toFixed(1);
    const compCount = Object.keys(result.componentStats).length;

    let html = `
      <div class="result-card ${result.systemAvailability >= 0.999 ? 'result-ok' : 'result-warn'}">
        <h2>System Reliability Summary</h2>
        <table class="result-table" aria-label="System reliability metrics">
          <tbody>
            <tr><th scope="row">System Availability</th>
                <td><strong>${availPct}%</strong></td></tr>
            <tr><th scope="row">Expected Annual Outage</th>
                <td>${outage} hours / year</td></tr>
            <tr><th scope="row">Components Analysed</th>
                <td>${compCount}</td></tr>
          </tbody>
        </table>
      </div>`;

    // Component table
    if (compCount > 0) {
      const compRows = Object.entries(result.componentStats).map(([id, s]) => {
        const avPct = (s.availability * 100).toFixed(4);
        const dt = s.downtime.toFixed(2);
        const cls = s.availability >= 0.999 ? 'result-ok' : s.availability >= 0.99 ? 'result-warn' : 'result-fail';
        return `<tr class="${cls}">
          <td>${esc(id)}</td>
          <td>${avPct}%</td>
          <td>${dt} hr/yr</td>
        </tr>`;
      }).join('');

      html += `
        <h2>Component Availability</h2>
        <table class="result-table" aria-label="Component availability">
          <thead>
            <tr>
              <th scope="col">Component ID</th>
              <th scope="col">Availability</th>
              <th scope="col">Expected Downtime (hr/yr)</th>
            </tr>
          </thead>
          <tbody>${compRows}</tbody>
        </table>`;
    }

    // N-1 impacts
    if (result.n1Impacts && result.n1Impacts.length) {
      const n1Rows = result.n1Impacts.map(i => `
        <tr>
          <td>${esc(i.id)}</td>
          <td>${(i.probability * 100).toFixed(6)}%</td>
        </tr>`).join('');
      html += `
        <h2>N-1 Contingency Analysis</h2>
        <p class="field-hint">Single-component failure scenarios with the highest impact.</p>
        <table class="result-table" aria-label="N-1 contingency impacts">
          <thead>
            <tr>
              <th scope="col">Component</th>
              <th scope="col">System Unavailability Contribution</th>
            </tr>
          </thead>
          <tbody>${n1Rows}</tbody>
        </table>`;
    } else if (compCount > 0) {
      html += `<p class="field-hint">N-1 analysis: no individual component failures contribute to system unavailability beyond the component itself. System redundancy is adequate.</p>`;
    }

    resultsDiv.innerHTML = html;
    chartContainer.hidden = compCount === 0;
  }

  function renderChart(result) {
    const data = Object.entries(result.componentStats).map(([id, s]) => ({ id, avail: s.availability }));
    if (!data.length) return;

    const svg = document.getElementById('reliability-chart');
    while (svg.firstChild && svg.firstChild.nodeName !== 'title') svg.removeChild(svg.firstChild);

    const W = parseInt(svg.getAttribute('width'), 10) || 700;
    const H = parseInt(svg.getAttribute('height'), 10) || 350;
    const margin = { top: 20, right: 20, bottom: 60, left: 60 };
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;
    const barW = Math.max(4, Math.floor(innerW / data.length) - 2);
    const ns = 'http://www.w3.org/2000/svg';

    const g = document.createElementNS(ns, 'g');
    g.setAttribute('transform', `translate(${margin.left},${margin.top})`);

    // Y axis label
    const yLabel = document.createElementNS(ns, 'text');
    yLabel.setAttribute('x', -innerH / 2);
    yLabel.setAttribute('y', -45);
    yLabel.setAttribute('transform', 'rotate(-90)');
    yLabel.setAttribute('text-anchor', 'middle');
    yLabel.setAttribute('font-size', '12');
    yLabel.setAttribute('fill', 'currentColor');
    yLabel.textContent = 'Availability';
    g.appendChild(yLabel);

    // Y axis ticks
    [0, 0.25, 0.5, 0.75, 1.0].forEach(v => {
      const y = innerH - v * innerH;
      const tick = document.createElementNS(ns, 'line');
      tick.setAttribute('x1', -5); tick.setAttribute('x2', innerW);
      tick.setAttribute('y1', y); tick.setAttribute('y2', y);
      tick.setAttribute('stroke', 'currentColor');
      tick.setAttribute('stroke-opacity', v === 1 ? '0.3' : '0.15');
      g.appendChild(tick);

      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x', -8); label.setAttribute('y', y + 4);
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('font-size', '11');
      label.setAttribute('fill', 'currentColor');
      label.textContent = (v * 100).toFixed(0) + '%';
      g.appendChild(label);
    });

    // Bars
    data.forEach((d, i) => {
      const x = i * (barW + 2);
      const barH = d.avail * innerH;
      const y = innerH - barH;
      const color = d.avail >= 0.999 ? '#4caf50' : d.avail >= 0.99 ? '#ff9800' : '#f44336';

      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', barW);
      rect.setAttribute('height', barH);
      rect.setAttribute('fill', color);
      rect.setAttribute('role', 'img');
      rect.setAttribute('aria-label', `${d.id}: ${(d.avail * 100).toFixed(4)}%`);
      g.appendChild(rect);

      // X label (rotate if many bars)
      const xLabel = document.createElementNS(ns, 'text');
      xLabel.setAttribute('x', x + barW / 2);
      xLabel.setAttribute('y', innerH + 14);
      xLabel.setAttribute('text-anchor', data.length > 8 ? 'end' : 'middle');
      xLabel.setAttribute('font-size', '10');
      xLabel.setAttribute('fill', 'currentColor');
      if (data.length > 8) {
        xLabel.setAttribute('transform', `rotate(-40, ${x + barW / 2}, ${innerH + 14})`);
      }
      xLabel.textContent = d.id.length > 12 ? d.id.slice(0, 12) + '…' : d.id;
      g.appendChild(xLabel);
    });

    svg.appendChild(g);
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
});
