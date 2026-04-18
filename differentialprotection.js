import { runDifferentialProtectionStudy, buildCharacteristicCurve } from './analysis/differentialProtection.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { openModal, showAlertModal } from './src/components/modal.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const form = document.getElementById('diff-prot-form');
  const resultsDiv = document.getElementById('results');
  const diffTypeSelect = document.getElementById('diff-type');
  const harmonicFieldset = document.getElementById('harmonic-fieldset');

  initStudyApprovalPanel('differentialProtection');

  function updateHarmonicVisibility() {
    const is87T = diffTypeSelect.value === '87T';
    harmonicFieldset.style.display = is87T ? '' : 'none';
  }
  diffTypeSelect.addEventListener('change', updateHarmonicVisibility);
  updateHarmonicVisibility();

  // Restore previous results
  const saved = getStudies().differentialProtection;
  if (saved) renderResults(saved);

  document.getElementById('reset-btn').addEventListener('click', () => {
    form.reset();
    updateHarmonicVisibility();
    resultsDiv.innerHTML = '';
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const inputs = readFormInputs();
    if (!inputs) return;

    let result;
    try {
      result = runDifferentialProtectionStudy(inputs);
    } catch (err) {
      showAlertModal('Analysis Error', `<p>${err.message}</p>`, 'error');
      return;
    }

    const studies = getStudies();
    studies.differentialProtection = result;
    setStudies(studies);

    renderResults(result);
  });

  function readFormInputs() {
    const flt = id => parseFloat(document.getElementById(id).value);
    const str = id => document.getElementById(id).value.trim();

    const diffType = str('diff-type');
    const zoneLabel = str('zone-label');
    const slope1Pct = flt('slope1-pct');
    const slope2Pct = flt('slope2-pct');
    const minPickupMultiple = flt('min-pickup');
    const breakpointMultiple = flt('breakpoint');
    const iDiffPu = flt('i-diff');
    const iRestraintPu = flt('i-restraint');
    const restraint2ndPct = flt('restraint-2nd');
    const restraint5thPct = flt('restraint-5th');
    const i2ndPu = flt('i-2nd');
    const i5thPu = flt('i-5th');

    const primaryCTVal = document.getElementById('primary-ct').value;
    const secondaryCTVal = document.getElementById('secondary-ct').value;
    const primaryCTRatio = primaryCTVal !== '' ? parseFloat(primaryCTVal) : undefined;
    const secondaryCTRatio = secondaryCTVal !== '' ? parseFloat(secondaryCTVal) : undefined;
    const xfmrTurnsRatio = flt('xfmr-turns') || 1;

    if (!isFinite(slope1Pct) || slope1Pct <= 0) {
      showAlertModal('Input Error', '<p>Slope 1 must be a positive percentage.</p>', 'error');
      return null;
    }
    if (!isFinite(slope2Pct) || slope2Pct <= 0 || slope2Pct < slope1Pct) {
      showAlertModal('Input Error', '<p>Slope 2 must be greater than Slope 1.</p>', 'error');
      return null;
    }
    if (!isFinite(minPickupMultiple) || minPickupMultiple <= 0) {
      showAlertModal('Input Error', '<p>Minimum pickup must be a positive per-unit value.</p>', 'error');
      return null;
    }
    if (!isFinite(breakpointMultiple) || breakpointMultiple <= minPickupMultiple) {
      showAlertModal('Input Error', '<p>Breakpoint must be greater than the minimum pickup.</p>', 'error');
      return null;
    }
    if (!isFinite(iDiffPu) || iDiffPu < 0) {
      showAlertModal('Input Error', '<p>Differential current I_diff must be ≥ 0 per-unit.</p>', 'error');
      return null;
    }
    if (!isFinite(iRestraintPu) || iRestraintPu < 0) {
      showAlertModal('Input Error', '<p>Restraint current I_rest must be ≥ 0 per-unit.</p>', 'error');
      return null;
    }

    return {
      diffType, zoneLabel,
      slope1Pct, slope2Pct, minPickupMultiple, breakpointMultiple,
      primaryCTRatio, secondaryCTRatio, xfmrTurnsRatio,
      iDiffPu, iRestraintPu,
      restraint2ndPct, restraint5thPct, i2ndPu, i5thPu,
    };
  }

  function renderResults(r) {
    const { zoneCheck, ctMismatch, characteristicCurve, diffType, zoneLabel } = r;
    const { decision, reason, thresholdPu, margin } = zoneCheck;

    const decisionClass = decision === 'OPERATE' ? 'result-fail' : decision === 'BLOCKED' ? 'result-warn' : 'result-ok';
    const decisionIcon = decision === 'OPERATE' ? '⚡ OPERATE (TRIP)' : decision === 'BLOCKED' ? '⛔ BLOCKED' : '✓ RESTRAIN';

    let html = `
      <h2>Results${zoneLabel ? ` — ${zoneLabel}` : ''} (${diffType})</h2>

      <div class="result-card">
        <h3>Zone Decision</h3>
        <p class="result-badge ${decisionClass}">${decisionIcon}</p>
        <p>${reason}</p>
        <table class="result-table">
          <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>Relay type</td><td>${diffType}</td></tr>
            <tr><td>I_diff (operating)</td><td>${r.iDiffPu.toFixed(3)} pu</td></tr>
            <tr><td>I_rest (restraint)</td><td>${r.iRestraintPu.toFixed(3)} pu</td></tr>
            <tr><td>Characteristic threshold</td><td>${thresholdPu.toFixed(3)} pu</td></tr>
            <tr><td>Margin (I_diff − threshold)</td><td class="${margin >= 0 ? 'result-fail' : 'result-ok'}">${margin.toFixed(3)} pu</td></tr>
            <tr><td>Region</td><td>${zoneCheck.characteristic.region} (Slope ${zoneCheck.characteristic.slope})</td></tr>
          </tbody>
        </table>
      </div>`;

    if (zoneCheck.harmonicCheck && diffType === '87T') {
      const hc = zoneCheck.harmonicCheck;
      html += `
      <div class="result-card">
        <h3>Harmonic Restraint (87T)</h3>
        <table class="result-table">
          <thead><tr><th>Check</th><th>Ratio</th><th>Threshold</th><th>Status</th></tr></thead>
          <tbody>
            <tr>
              <td>2nd harmonic (inrush block)</td>
              <td>${hc.ratio2ndPct.toFixed(1)}%</td>
              <td>${r.settings.restraint2ndPct}%</td>
              <td class="${hc.inrushBlocked ? 'result-warn' : 'result-ok'}">${hc.inrushBlocked ? 'BLOCKED' : 'Not active'}</td>
            </tr>
            <tr>
              <td>5th harmonic (overexcitation)</td>
              <td>${hc.ratio5thPct.toFixed(1)}%</td>
              <td>${r.settings.restraint5thPct}%</td>
              <td class="${hc.overexcitationBlocked ? 'result-warn' : 'result-ok'}">${hc.overexcitationBlocked ? 'RESTRAINED' : 'Not active'}</td>
            </tr>
          </tbody>
        </table>
        ${hc.reason ? `<p class="result-warn-text">${hc.reason}</p>` : ''}
      </div>`;
    }

    if (ctMismatch) {
      const limitClass = ctMismatch.withinLimit ? 'result-ok' : 'result-fail';
      html += `
      <div class="result-card">
        <h3>CT Ratio Mismatch</h3>
        <table class="result-table">
          <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>Tap factor</td><td>${ctMismatch.tapFactor.toFixed(4)}</td></tr>
            <tr><td>Mismatch</td><td class="${limitClass}">${ctMismatch.mismatchPct.toFixed(1)}%</td></tr>
            <tr><td>IEEE C37.91 limit (10%)</td><td class="${limitClass}">${ctMismatch.withinLimit ? 'PASS' : 'FAIL'}</td></tr>
          </tbody>
        </table>
        <p>${ctMismatch.correction}</p>
      </div>`;
    }

    html += `
      <div class="result-card">
        <h3>Characteristic Curve Data</h3>
        <p>Slope 1: ${r.settings.slope1Pct}% &nbsp;|&nbsp; Slope 2: ${r.settings.slope2Pct}% &nbsp;|&nbsp;
           Min pickup: ${r.settings.minPickupMultiple} pu &nbsp;|&nbsp; Breakpoint: ${r.settings.breakpointMultiple} pu</p>
        <canvas id="char-canvas" width="500" height="320" aria-label="Differential characteristic curve"></canvas>
        <table class="result-table">
          <thead><tr><th>I_rest (pu)</th><th>Threshold (pu)</th></tr></thead>
          <tbody>
            ${characteristicCurve.map(p => `<tr><td>${p.restraint.toFixed(2)}</td><td>${p.threshold.toFixed(4)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    resultsDiv.innerHTML = html;
    drawCharacteristicCanvas(r);
  }

  function drawCharacteristicCanvas(r) {
    const canvas = document.getElementById('char-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const PAD = { top: 20, right: 20, bottom: 50, left: 60 };
    const pw = W - PAD.left - PAD.right;
    const ph = H - PAD.top - PAD.bottom;

    const maxR = Math.max(r.iRestraintPu * 1.3, r.settings.breakpointMultiple * 1.5, 5);
    const pts = buildCharacteristicCurve(r.settings, maxR);
    const maxT = Math.max(...pts.map(p => p.threshold), r.iDiffPu) * 1.3;

    const sx = v => PAD.left + (v / maxR) * pw;
    const sy = v => PAD.top + ph - (v / maxT) * ph;

    ctx.clearRect(0, 0, W, H);

    // Axes
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--color-border') || '#ccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top);
    ctx.lineTo(PAD.left, PAD.top + ph);
    ctx.lineTo(PAD.left + pw, PAD.top + ph);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--color-text') || '#333';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Restraint Current I_rest (pu)', PAD.left + pw / 2, H - 6);
    ctx.save();
    ctx.translate(14, PAD.top + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Differential Current I_diff (pu)', 0, 0);
    ctx.restore();

    // Axis tick labels
    ctx.textAlign = 'center';
    ctx.font = '10px sans-serif';
    for (let i = 0; i <= 5; i++) {
      const v = (maxR * i / 5);
      const x = sx(v);
      ctx.fillText(v.toFixed(1), x, PAD.top + ph + 14);
    }
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const v = (maxT * i / 5);
      const y = sy(v);
      ctx.fillText(v.toFixed(2), PAD.left - 4, y + 4);
    }

    // Operate region fill
    ctx.fillStyle = 'rgba(220,38,38,0.08)';
    ctx.beginPath();
    ctx.moveTo(sx(pts[0].restraint), sy(pts[0].threshold));
    pts.forEach(p => ctx.lineTo(sx(p.restraint), sy(p.threshold)));
    ctx.lineTo(sx(pts[pts.length - 1].restraint), sy(maxT));
    ctx.lineTo(sx(0), sy(maxT));
    ctx.closePath();
    ctx.fill();

    // Characteristic curve
    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 3]);
    ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(sx(p.restraint), sy(p.threshold));
      else ctx.lineTo(sx(p.restraint), sy(p.threshold));
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Region labels
    ctx.fillStyle = 'rgba(220,38,38,0.6)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OPERATE', sx(maxR * 0.65), sy(maxT * 0.85));
    ctx.fillStyle = 'rgba(34,197,94,0.7)';
    ctx.fillText('RESTRAIN', sx(maxR * 0.35), sy(maxT * 0.15));

    // Operating point dot
    const px2 = sx(r.iRestraintPu);
    const py2 = sy(r.iDiffPu);
    const dotColor = r.zoneCheck.decision === 'OPERATE' ? '#dc2626' :
                     r.zoneCheck.decision === 'BLOCKED' ? '#d97706' : '#16a34a';
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(px2, py2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = dotColor;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`(${r.iRestraintPu.toFixed(2)}, ${r.iDiffPu.toFixed(2)})`, px2 + 8, py2 - 4);
  }
});
