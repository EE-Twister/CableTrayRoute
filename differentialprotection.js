import { runDifferentialStudy, ZONE_TYPES } from './analysis/differentialProtection.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { downloadCSV } from './reports/reporting.mjs';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const form = document.getElementById('diff-form');
  const resultsDiv = document.getElementById('results');
  const exportBtn = document.getElementById('export-btn');
  const zoneTypeSelect = document.getElementById('zone-type');
  const harmonicFieldset = document.getElementById('harmonic-fieldset');
  const secondHarmRow = document.getElementById('second-harm-row');

  initStudyApprovalPanel('differentialProtection');

  // Restore previous results
  const saved = getStudies().differentialProtection;
  if (saved) {
    restoreForm(saved.inputs, saved.zoneType);
    renderResults(saved);
  }

  // Show/hide harmonic inputs based on zone type
  function updateHarmonicVisibility() {
    const zt = zoneTypeSelect.value;
    harmonicFieldset.hidden = (zt === '87B');
    secondHarmRow.hidden = (zt === '87G');
  }
  zoneTypeSelect.addEventListener('change', updateHarmonicVisibility);
  updateHarmonicVisibility();

  form.addEventListener('submit', e => {
    e.preventDefault();
    const inputs = readFormInputs();
    if (!inputs) return;

    let result;
    try {
      result = runDifferentialStudy(inputs);
    } catch (err) {
      showModal('Analysis Error', `<p>${err.message}</p>`, 'error');
      return;
    }

    const studies = getStudies();
    studies.differentialProtection = result;
    setStudies(studies);

    renderResults(result);
    exportBtn.disabled = false;
  });

  exportBtn.addEventListener('click', () => {
    const saved2 = getStudies().differentialProtection;
    if (!saved2) return;
    exportCSV(saved2);
  });

  // ---------------------------------------------------------------------------

  function readFormInputs() {
    const getF = id => parseFloat(document.getElementById(id).value);
    const getS = id => document.getElementById(id).value;

    const zoneType    = getS('zone-type');
    const ct1Ratio    = getF('ct1-ratio');
    const ct2Ratio    = getF('ct2-ratio');
    const ctSecondary = getF('ct-secondary');
    const tapSetting  = getF('tap-setting');
    const slope1Pct   = getF('slope1');
    const slope2Pct   = getF('slope2');
    const minPickupPu = getF('min-pickup');
    const breakpointPu = getF('breakpoint');
    const iaA         = getF('ia-amps');
    const ibA         = getF('ib-amps');
    const secondHarmPct = getF('second-harm-pct');
    const fifthHarmPct  = getF('fifth-harm-pct');
    const systemLabel = document.getElementById('system-label').value.trim();

    if (!ct1Ratio || ct1Ratio <= 0) {
      showModal('Input Error', '<p>CT₁ primary ratio must be greater than zero.</p>', 'error');
      return null;
    }
    if (!ct2Ratio || ct2Ratio <= 0) {
      showModal('Input Error', '<p>CT₂ primary ratio must be greater than zero.</p>', 'error');
      return null;
    }
    if (!tapSetting || tapSetting <= 0) {
      showModal('Input Error', '<p>Tap setting must be greater than zero.</p>', 'error');
      return null;
    }
    if (!slope1Pct || slope1Pct <= 0 || slope1Pct >= 100) {
      showModal('Input Error', '<p>Slope 1 must be between 0% and 100% (exclusive).</p>', 'error');
      return null;
    }
    if (!slope2Pct || slope2Pct <= slope1Pct) {
      showModal('Input Error', '<p>Slope 2 must be greater than Slope 1.</p>', 'error');
      return null;
    }
    if (!minPickupPu || minPickupPu <= 0) {
      showModal('Input Error', '<p>Minimum pickup must be greater than zero.</p>', 'error');
      return null;
    }
    if (!breakpointPu || breakpointPu <= 0) {
      showModal('Input Error', '<p>Breakpoint must be greater than zero.</p>', 'error');
      return null;
    }
    if (isNaN(iaA)) {
      showModal('Input Error', '<p>Terminal 1 current I<sub>A</sub> is required.</p>', 'error');
      return null;
    }
    if (isNaN(ibA)) {
      showModal('Input Error', '<p>Terminal 2 current I<sub>B</sub> is required.</p>', 'error');
      return null;
    }

    return {
      systemLabel,
      zoneType,
      ct1Ratio,
      ct2Ratio,
      ctSecondary,
      tapSetting,
      slope1: slope1Pct / 100,
      slope2: slope2Pct / 100,
      minPickupPu,
      breakpointPu,
      iaA,
      ibA,
      secondHarmPct: zoneType !== '87B' ? secondHarmPct : 0,
      fifthHarmPct:  zoneType !== '87B' ? fifthHarmPct  : 0,
    };
  }

  function restoreForm(inputs, zoneType) {
    if (!inputs) return;
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined && val !== null) el.value = val;
    };
    set('system-label', inputs.systemLabel);
    set('zone-type', zoneType || inputs.zoneType);
    set('ct1-ratio', inputs.ct1Ratio);
    set('ct2-ratio', inputs.ct2Ratio);
    set('ct-secondary', inputs.ctSecondary);
    set('tap-setting', inputs.tapSetting);
    set('slope1', inputs.slope1 !== undefined ? (inputs.slope1 * 100).toFixed(0) : 25);
    set('slope2', inputs.slope2 !== undefined ? (inputs.slope2 * 100).toFixed(0) : 65);
    set('min-pickup', inputs.minPickupPu);
    set('breakpoint', inputs.breakpointPu);
    set('ia-amps', inputs.iaA);
    set('ib-amps', inputs.ibA);
    set('second-harm-pct', inputs.secondHarmPct);
    set('fifth-harm-pct', inputs.fifthHarmPct);
    updateHarmonicVisibility();
  }

  function renderResults(r) {
    resultsDiv.innerHTML = '';
    exportBtn.disabled = false;

    const warningsHtml = r.warnings.length
      ? `<ul class="drc-findings">${r.warnings.map(w =>
          `<li class="drc-finding drc-warn"><span class="drc-msg">${w}</span></li>`
        ).join('')}</ul>`
      : '';

    const tripClass = r.tripResult.trip ? 'status-fail' : 'status-pass';
    const tripLabel = r.tripResult.trip ? '⚡ TRIP' : '✓ NO TRIP';
    const restrainHtml = r.harmonic.restrain
      ? `<p class="field-hint">${r.harmonic.reason}</p>`
      : '';

    const ctMismatchHtml = !r.ctMismatch.acceptable
      ? `<p class="drc-finding drc-warn">CT mismatch ${r.ctMismatch.mismatchPct.toFixed(1)}% — exceeds 5% limit. Nominal tap = ${r.ctMismatch.nominalTap.toFixed(4)}</p>`
      : `<p class="field-hint">CT mismatch: ${r.ctMismatch.mismatchPct.toFixed(1)}% ✓ (within 5% limit)</p>`;

    resultsDiv.innerHTML = `
      <section class="results-section" aria-label="Differential study results">
        <h2>Results — ${escHtml(r.systemLabel || r.zoneLabel)}</h2>
        ${warningsHtml}

        <div class="results-grid">
          <div class="result-card ${tripClass}">
            <span class="result-label">Trip Determination</span>
            <span class="result-value">${tripLabel}</span>
          </div>
          <div class="result-card">
            <span class="result-label">I<sub>op</sub> (operating current)</span>
            <span class="result-value">${r.currents.iOp.toFixed(4)} pu</span>
          </div>
          <div class="result-card">
            <span class="result-label">I<sub>rst</sub> (restraint current)</span>
            <span class="result-value">${r.currents.iRst.toFixed(4)} pu</span>
          </div>
          <div class="result-card">
            <span class="result-label">Threshold at I<sub>rst</sub></span>
            <span class="result-value">${r.tripResult.threshold.toFixed(4)} pu</span>
          </div>
          <div class="result-card">
            <span class="result-label">Security margin</span>
            <span class="result-value">${r.tripResult.marginPct.toFixed(1)}%</span>
          </div>
          <div class="result-card">
            <span class="result-label">Harmonic restraint</span>
            <span class="result-value">${r.harmonic.restrain ? 'ACTIVE — trip blocked' : 'Not active'}</span>
          </div>
        </div>

        ${restrainHtml}
        ${ctMismatchHtml}

        <h3>CT and Current Details</h3>
        <table class="results-table">
          <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>I₁ (CT₁ secondary normalised to tap, pu)</td><td>${r.currents.i1Pu.toFixed(4)}</td></tr>
            <tr><td>I₂ (CT₂ secondary normalised to tap, pu)</td><td>${r.currents.i2Pu.toFixed(4)}</td></tr>
            <tr><td>CT₁ / CT₂ nominal tap</td><td>${r.ctMismatch.nominalTap.toFixed(4)}</td></tr>
            <tr><td>Set tap</td><td>${r.inputs.tapSetting}</td></tr>
            <tr><td>CT mismatch</td><td>${r.ctMismatch.mismatchPct.toFixed(2)}%</td></tr>
            <tr><td>2nd harmonic</td><td>${r.harmonic.secondPct.toFixed(1)}%</td></tr>
            <tr><td>5th harmonic</td><td>${r.harmonic.fifthPct.toFixed(1)}%</td></tr>
          </tbody>
        </table>

        <h3>Dual-Slope Characteristic</h3>
        <p class="field-hint">
          Operating point: I<sub>rst</sub> = ${r.currents.iRst.toFixed(4)} pu,
          I<sub>op</sub> = ${r.currents.iOp.toFixed(4)} pu.
          ${r.tripResult.trip
            ? 'The operating point is <strong>above</strong> the characteristic boundary — relay trips.'
            : 'The operating point is <strong>below</strong> the characteristic boundary — relay does not trip.'
          }
        </p>
        <canvas id="diff-chart" width="600" height="340"
                aria-label="Differential protection dual-slope characteristic curve"
                role="img" style="max-width:100%;display:block;margin:1rem 0;"></canvas>
      </section>
    `;

    renderChart(r);
  }

  function renderChart(r) {
    const canvas = document.getElementById('diff-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const charLine = r.curve.charLine;
    if (!charLine || !charLine.length) return;

    const maxX = charLine[charLine.length - 1].irst;
    const maxY = charLine[charLine.length - 1].threshold * 1.2;

    const pad = { top: 30, right: 20, bottom: 50, left: 60 };
    const W = canvas.width - pad.left - pad.right;
    const H = canvas.height - pad.top - pad.bottom;

    const scaleX = v => pad.left + (v / maxX) * W;
    const scaleY = v => pad.top + H - (v / maxY) * H;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Detect dark mode
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
      || window.matchMedia('(prefers-color-scheme: dark)').matches;
    const textColor  = isDark ? '#e2e8f0' : '#1e293b';
    const gridColor  = isDark ? '#334155' : '#e2e8f0';
    const axisColor  = isDark ? '#64748b' : '#64748b';

    // Grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (let tick = 0; tick <= 4; tick++) {
      const y = pad.top + (tick / 4) * H;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + W, y);
      ctx.stroke();
    }
    for (let tick = 0; tick <= 4; tick++) {
      const x = pad.left + (tick / 4) * W;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + H);
      ctx.stroke();
    }

    // Operate (TRIP) region fill above characteristic
    ctx.beginPath();
    ctx.moveTo(scaleX(charLine[0].irst), scaleY(charLine[0].threshold));
    charLine.forEach(pt => ctx.lineTo(scaleX(pt.irst), scaleY(pt.threshold)));
    ctx.lineTo(scaleX(maxX), scaleY(maxY));
    ctx.lineTo(scaleX(0), scaleY(maxY));
    ctx.closePath();
    ctx.fillStyle = 'rgba(239,68,68,0.08)';
    ctx.fill();

    // Characteristic boundary (dual-slope)
    ctx.beginPath();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    charLine.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(scaleX(pt.irst), scaleY(pt.threshold));
      else ctx.lineTo(scaleX(pt.irst), scaleY(pt.threshold));
    });
    ctx.stroke();

    // Minimum pickup horizontal line
    const minPu = r.inputs.minPickupPu;
    const bpPu  = r.inputs.breakpointPu;
    ctx.beginPath();
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.moveTo(scaleX(0), scaleY(minPu));
    ctx.lineTo(scaleX(Math.min(bpPu, maxX)), scaleY(minPu));
    ctx.stroke();
    ctx.setLineDash([]);

    // Breakpoint vertical line
    ctx.beginPath();
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const bpX = scaleX(Math.min(bpPu, maxX));
    ctx.moveTo(bpX, pad.top);
    ctx.lineTo(bpX, pad.top + H);
    ctx.stroke();
    ctx.setLineDash([]);

    // Operating point
    const ptX = scaleX(r.currents.iRst);
    const ptY = scaleY(r.currents.iOp);
    const ptColor = r.tripResult.trip ? '#ef4444' : '#22c55e';
    ctx.beginPath();
    ctx.arc(ptX, ptY, 7, 0, Math.PI * 2);
    ctx.fillStyle = ptColor;
    ctx.fill();
    ctx.strokeStyle = isDark ? '#1e293b' : '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Operating point label
    ctx.fillStyle = textColor;
    ctx.font = '12px sans-serif';
    ctx.fillText(
      `Op. Point (${r.currents.iRst.toFixed(2)}, ${r.currents.iOp.toFixed(2)})`,
      Math.min(ptX + 10, canvas.width - 180),
      Math.max(ptY - 8, 20)
    );

    // Axis lines
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + H);
    ctx.lineTo(pad.left + W, pad.top + H);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = textColor;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';

    // X-axis ticks
    for (let tick = 0; tick <= 4; tick++) {
      const val = (tick / 4) * maxX;
      ctx.fillText(val.toFixed(1), scaleX(val), pad.top + H + 18);
    }
    ctx.fillText('I_rst (pu — restraint current)', pad.left + W / 2, pad.top + H + 42);

    // Y-axis ticks
    ctx.textAlign = 'right';
    for (let tick = 0; tick <= 4; tick++) {
      const val = (tick / 4) * maxY;
      ctx.fillText(val.toFixed(2), pad.left - 6, scaleY(val) + 4);
    }

    ctx.save();
    ctx.translate(14, pad.top + H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('I_op (pu — operating current)', 0, 0);
    ctx.restore();

    // Legend
    const legX = pad.left + W - 160;
    const legY = pad.top + 10;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(legX, legY, 18, 4);
    ctx.fillStyle = textColor;
    ctx.fillText('Trip boundary', legX + 24, legY + 7);

    ctx.fillStyle = ptColor;
    ctx.beginPath();
    ctx.arc(legX + 9, legY + 20, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = textColor;
    ctx.fillText(r.tripResult.trip ? 'Op. point (TRIP)' : 'Op. point (NO TRIP)', legX + 24, legY + 24);
  }

  function exportCSV(r) {
    const rows = [
      ['Parameter', 'Value'],
      ['Zone type', r.zoneType],
      ['Zone label', r.zoneLabel],
      ['System label', r.systemLabel || ''],
      ['CT1 ratio', r.inputs.ct1Ratio],
      ['CT2 ratio', r.inputs.ct2Ratio],
      ['Tap setting', r.inputs.tapSetting],
      ['Nominal tap', r.ctMismatch.nominalTap],
      ['CT mismatch (%)', r.ctMismatch.mismatchPct],
      ['Slope 1 (%)', (r.inputs.slope1 * 100).toFixed(0)],
      ['Slope 2 (%)', (r.inputs.slope2 * 100).toFixed(0)],
      ['Min pickup (pu)', r.inputs.minPickupPu],
      ['Breakpoint (pu)', r.inputs.breakpointPu],
      ['IA (A primary)', r.inputs.iaA],
      ['IB (A primary)', r.inputs.ibA],
      ['I_op (pu)', r.currents.iOp],
      ['I_rst (pu)', r.currents.iRst],
      ['Threshold at I_rst (pu)', r.tripResult.threshold],
      ['Security margin (%)', r.tripResult.marginPct],
      ['Harmonic restraint active', r.harmonic.restrain ? 'Yes' : 'No'],
      ['Trip determination', r.tripResult.trip ? 'TRIP' : 'NO TRIP'],
    ];
    downloadCSV(rows, 'differential-protection.csv');
  }

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
});
