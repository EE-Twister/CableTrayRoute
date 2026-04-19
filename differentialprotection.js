import { runDifferentialProtectionAnalysis, WINDING_CONNECTIONS } from './analysis/differentialProtection.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  initStudyApprovalPanel('differentialProtection');

  const form = document.getElementById('diffprot-form');
  const resultsDiv = document.getElementById('results');
  const elementTypeSelect = document.getElementById('element-type');
  const windingConnectionRow = document.getElementById('winding-connection-row');

  // Hide winding connection when not a transformer
  function updateWindingVisibility() {
    const isTransformer = elementTypeSelect.value === 'transformer';
    windingConnectionRow.style.display = isTransformer ? '' : 'none';
  }
  elementTypeSelect.addEventListener('change', updateWindingVisibility);
  updateWindingVisibility();

  // --- Restore previous results ---
  const saved = getStudies().differentialProtection;
  if (saved) {
    restoreForm(saved);
    renderResults(saved);
  }

  // --- Form submission ---
  form.addEventListener('submit', e => {
    e.preventDefault();
    const inputs = readFormInputs();
    if (!inputs) return;

    let result;
    try {
      result = runDifferentialProtectionAnalysis(inputs);
    } catch (err) {
      showModal('Analysis Error', `<p>${escHtml(err.message)}</p>`, 'error');
      return;
    }

    const studies = getStudies();
    studies.differentialProtection = result;
    setStudies(studies);

    renderResults(result);
  });

  // --------------------------------------------------------------------------

  function readFormInputs() {
    const getVal = id => document.getElementById(id).value.trim();
    const getFloat = id => parseFloat(document.getElementById(id).value);

    const elementType = getVal('element-type');
    const elementLabel = getVal('element-label');
    const ratingMva = getFloat('rating-mva');
    const voltageHvKv = getFloat('voltage-hv-kv');
    const voltageLvKv = getFloat('voltage-lv-kv');
    const windingConnection = getVal('winding-connection');
    const ctr1 = getFloat('ctr1');
    const ctr2 = getFloat('ctr2');
    const iMinPu = getFloat('i-min-pu');
    const slope1 = getFloat('slope1');
    const slope2 = getFloat('slope2');
    const iResBreakPu = getFloat('i-res-break-pu');
    const ihr2Threshold = getFloat('ihr2-threshold');
    const ihr5Threshold = getFloat('ihr5-threshold');

    if (!ratingMva || ratingMva <= 0) {
      showModal('Input Error', '<p>Rating MVA must be greater than zero.</p>', 'error');
      return null;
    }
    if (!voltageHvKv || voltageHvKv <= 0) {
      showModal('Input Error', '<p>HV voltage must be greater than zero.</p>', 'error');
      return null;
    }
    if (!voltageLvKv || voltageLvKv <= 0) {
      showModal('Input Error', '<p>LV voltage must be greater than zero.</p>', 'error');
      return null;
    }
    if (!ctr1 || ctr1 <= 0) {
      showModal('Input Error', '<p>Primary CT ratio (CTR₁) must be greater than zero.</p>', 'error');
      return null;
    }
    if (!ctr2 || ctr2 <= 0) {
      showModal('Input Error', '<p>Secondary CT ratio (CTR₂) must be greater than zero.</p>', 'error');
      return null;
    }
    if (slope2 < slope1) {
      showModal('Input Error', '<p>Slope 2 must be ≥ slope 1.</p>', 'error');
      return null;
    }

    const phaseLabels = ['A', 'B', 'C'];
    const phases = [];
    const rows = document.querySelectorAll('#phase-table tbody tr');
    rows.forEach((row, idx) => {
      const i1A = parseFloat(row.querySelector('.phase-i1').value) || 0;
      const i2A = parseFloat(row.querySelector('.phase-i2').value) || 0;
      const i2ndA = parseFloat(row.querySelector('.phase-i2nd').value) || 0;
      const i5thA = parseFloat(row.querySelector('.phase-i5th').value) || 0;
      phases.push({ label: phaseLabels[idx], i1A, i2A, i2ndA, i5thA });
    });

    return {
      elementLabel, elementType, ratingMva, voltageHvKv, voltageLvKv,
      windingConnection, ctr1, ctr2, iMinPu, slope1, slope2, iResBreakPu,
      ihr2Threshold, ihr5Threshold, phases,
    };
  }

  function restoreForm(r) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) el.value = val;
    };
    set('element-label', r.elementLabel);
    set('element-type', r.elementType);
    set('rating-mva', r.ratingMva);
    set('voltage-hv-kv', r.voltageHvKv);
    set('voltage-lv-kv', r.voltageLvKv);
    set('winding-connection', r.windingConnection);
    set('ctr1', r.ctr1);
    set('ctr2', r.ctr2);
    set('i-min-pu', r.iMinPu);
    set('slope1', r.slope1);
    set('slope2', r.slope2);
    set('i-res-break-pu', r.iResBreakPu);
    set('ihr2-threshold', r.ihr2Threshold);
    set('ihr5-threshold', r.ihr5Threshold);
    updateWindingVisibility();

    if (r.phaseResults) {
      const rows = document.querySelectorAll('#phase-table tbody tr');
      r.phases?.forEach((ph, idx) => {
        if (!rows[idx]) return;
        rows[idx].querySelector('.phase-i1').value = ph.i1A ?? '';
        rows[idx].querySelector('.phase-i2').value = ph.i2A ?? '';
        rows[idx].querySelector('.phase-i2nd').value = ph.i2ndA ?? 0;
        rows[idx].querySelector('.phase-i5th').value = ph.i5thA ?? 0;
      });
    }
  }

  function renderResults(r) {
    resultsDiv.innerHTML = '';

    const statusColors = {
      OPERATE: 'result-badge--fail',
      HARMONIC_BLOCKED: 'result-badge--warn',
      HARMONIC_BLOCKED_INRUSH: 'result-badge--warn',
      HARMONIC_BLOCKED_OVEREXC: 'result-badge--warn',
      RESTRAINED: 'result-badge--pass',
    };
    const statusIcons = {
      OPERATE: '✗',
      HARMONIC_BLOCKED: '⚠',
      HARMONIC_BLOCKED_INRUSH: '⚠',
      HARMONIC_BLOCKED_OVEREXC: '⚠',
      RESTRAINED: '✓',
    };
    const statusLabels = {
      OPERATE: 'OPERATE — internal fault detected, relay trips',
      HARMONIC_BLOCKED: 'HARMONIC BLOCKED — would operate but blocked',
      HARMONIC_BLOCKED_INRUSH: 'INRUSH BLOCKED — 2nd harmonic blocking active',
      HARMONIC_BLOCKED_OVEREXC: 'OVEREXCITATION BLOCKED — 5th harmonic blocking active',
      RESTRAINED: 'RESTRAINED — no operation, normal condition',
    };

    const warningsHtml = r.warnings.length
      ? `<ul class="drc-findings">${r.warnings.map(w =>
          `<li class="drc-finding drc-warn"><span class="drc-msg">${escHtml(w)}</span></li>`
        ).join('')}</ul>`
      : '';

    const phaseRowsHtml = r.phaseResults.map(ph => {
      const cls = statusColors[ph.status] || 'result-badge--pass';
      const icon = statusIcons[ph.status] || '✓';
      return `<tr>
        <td><strong>${escHtml(ph.label)}</strong></td>
        <td>${ph.i1Pu.toFixed(4)}</td>
        <td>${ph.i2Pu.toFixed(4)}</td>
        <td>${ph.iOpPu.toFixed(4)}</td>
        <td>${ph.iResPu.toFixed(4)}</td>
        <td>${ph.tripThresholdPu.toFixed(4)}</td>
        <td><span class="result-badge ${cls}" role="status">${icon} ${ph.status}</span></td>
      </tr>`;
    }).join('');

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-labelledby="results-heading">
        <h2 id="results-heading">Differential Protection Results</h2>
        ${r.elementLabel ? `<p class="field-hint">Element: <strong>${escHtml(r.elementLabel)}</strong></p>` : ''}

        <div class="result-group">
          <div class="result-row">
            <span class="result-label">Rated primary current</span>
            <span class="result-value">${r.iRatedPrimaryA} A</span>
          </div>
          <div class="result-row">
            <span class="result-label">Rated secondary current</span>
            <span class="result-value">${r.iRatedSecondaryA} A</span>
          </div>
          <div class="result-row">
            <span class="result-label">Minimum operate current (primary)</span>
            <span class="result-value">${r.iMinOperateA} A (${r.iMinPu} pu)</span>
          </div>
        </div>

        <div class="result-group">
          <div class="result-badge ${statusColors[r.overallStatus]}" role="status" style="font-size:1.1em;padding:.6em 1em;">
            ${statusIcons[r.overallStatus]} Overall relay status: <strong>${statusLabels[r.overallStatus] || r.overallStatus}</strong>
          </div>
        </div>

        <div class="result-group">
          <h3>Per-Phase Results</h3>
          <table class="data-table" aria-label="Per-phase differential protection results">
            <thead>
              <tr>
                <th>Phase</th>
                <th>I₁ (pu)</th>
                <th>I₂ (pu)</th>
                <th>I<sub>op</sub> (pu)</th>
                <th>I<sub>res</sub> (pu)</th>
                <th>Trip threshold (pu)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${phaseRowsHtml}</tbody>
          </table>
        </div>

        ${warningsHtml}

        <div class="result-group">
          <h3>I<sub>op</sub> vs I<sub>res</sub> Characteristic</h3>
          <div id="diffprot-chart" style="width:100%;height:400px;"></div>
        </div>

        <p class="field-hint result-timestamp">Analysis run: ${new Date(r.timestamp).toLocaleString()}</p>
      </section>`;

    renderChart(r);
  }

  function renderChart(r) {
    const Plotly = window.Plotly;
    if (!Plotly) return;

    const zone1X = r.curve.zone1.map(p => p.x);
    const zone1Y = r.curve.zone1.map(p => p.y);
    const zone2X = r.curve.zone2.map(p => p.x);
    const zone2Y = r.curve.zone2.map(p => p.y);

    const statusColorMap = {
      OPERATE: '#ef4444',
      HARMONIC_BLOCKED_INRUSH: '#f59e0b',
      HARMONIC_BLOCKED_OVEREXC: '#f59e0b',
      RESTRAINED: '#22c55e',
    };

    const phaseTraces = r.phaseResults.map(ph => ({
      x: [ph.iResPu],
      y: [ph.iOpPu],
      mode: 'markers+text',
      type: 'scatter',
      name: `Phase ${ph.label} (${ph.status})`,
      text: [ph.label],
      textposition: 'top center',
      marker: {
        size: 14,
        color: statusColorMap[ph.status] || '#22c55e',
        symbol: ph.status === 'OPERATE' ? 'x' : 'circle',
        line: { color: '#fff', width: 1.5 },
      },
    }));

    const traces = [
      {
        x: zone1X,
        y: zone1Y,
        mode: 'lines',
        name: `Slope 1 (${(r.slope1 * 100).toFixed(0)}%)`,
        line: { color: '#3b82f6', width: 2, dash: 'solid' },
      },
      {
        x: zone2X,
        y: zone2Y,
        mode: 'lines',
        name: `Slope 2 (${(r.slope2 * 100).toFixed(0)}%)`,
        line: { color: '#8b5cf6', width: 2, dash: 'dash' },
      },
      {
        x: [0, r.iResBreakPu],
        y: [r.iMinPu, r.iMinPu],
        mode: 'lines',
        name: `I_min (${r.iMinPu} pu)`,
        line: { color: '#94a3b8', width: 1.5, dash: 'dot' },
      },
      ...phaseTraces,
    ];

    const layout = {
      xaxis: { title: 'I<sub>res</sub> (pu of rated)', rangemode: 'tozero' },
      yaxis: { title: 'I<sub>op</sub> (pu of rated)', rangemode: 'tozero' },
      legend: { orientation: 'h', y: -0.15 },
      margin: { t: 20, r: 20, b: 60, l: 60 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { size: 12 },
    };

    Plotly.newPlot('diffprot-chart', traces, layout, { responsive: true, displayModeBar: false });
  }

  function escHtml(str) {
    return String(str).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
});
