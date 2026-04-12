import { runBatterySizingAnalysis } from './analysis/batterySizing.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const form = document.getElementById('battery-form');
  const resultsDiv = document.getElementById('results');

  initStudyApprovalPanel('batterySizing');

  // --- Restore previous results from project store ---
  const saved = getStudies().batterySizing;
  if (saved) {
    renderResults(saved);
  }

  // --- Form submission ---
  form.addEventListener('submit', e => {
    e.preventDefault();
    const inputs = readFormInputs();
    if (!inputs) return;

    let result;
    try {
      result = runBatterySizingAnalysis(inputs);
    } catch (err) {
      showModal('Analysis Error', `<p>${err.message}</p>`, 'error');
      return;
    }

    // Persist
    const studies = getStudies();
    studies.batterySizing = result;
    setStudies(studies);

    renderResults(result);
  });

  // --------------------------------------------------------------------------

  function readFormInputs() {
    const get = id => document.getElementById(id);
    const getFloat = id => parseFloat(get(id).value);

    const averageLoadKw   = getFloat('avg-load-kw');
    const peakLoadKw      = getFloat('peak-load-kw');
    const runtimeHours    = getFloat('runtime-hours');
    const chemistry       = get('chemistry').value;
    const ambientTempC    = getFloat('ambient-temp-c');
    const designMarginPct = getFloat('design-margin-pct');
    const upsPowerFactor  = getFloat('ups-pf');
    const systemLabel     = get('system-label').value.trim();

    if (!averageLoadKw || averageLoadKw <= 0) {
      showModal('Input Error', '<p>Average load P<sub>avg</sub> (kW) must be greater than zero.</p>', 'error');
      return null;
    }
    if (!peakLoadKw || peakLoadKw <= 0) {
      showModal('Input Error', '<p>Peak load P<sub>peak</sub> (kW) must be greater than zero.</p>', 'error');
      return null;
    }
    if (!runtimeHours || runtimeHours <= 0) {
      showModal('Input Error', '<p>Required runtime must be greater than zero.</p>', 'error');
      return null;
    }
    if (isNaN(designMarginPct) || designMarginPct < 0) {
      showModal('Input Error', '<p>Design margin must be ≥ 0%.</p>', 'error');
      return null;
    }
    if (!upsPowerFactor || upsPowerFactor <= 0 || upsPowerFactor > 1) {
      showModal('Input Error', '<p>UPS power factor must be between 0 (exclusive) and 1.0.</p>', 'error');
      return null;
    }

    return {
      systemLabel,
      averageLoadKw,
      peakLoadKw,
      runtimeHours,
      chemistry,
      ambientTempC,
      designMarginPct,
      upsPowerFactor,
    };
  }

  function renderResults(r) {
    resultsDiv.innerHTML = '';

    const warningsHtml = r.warnings.length
      ? `<ul class="drc-findings">${r.warnings.map(w =>
          `<li class="drc-finding drc-warn"><span class="drc-msg">${w}</span></li>`
        ).join('')}</ul>`
      : '';

    // Runtime curve table rows
    const runtimeRows = r.runtimeCurvePoints.map(pt => {
      const highlight = pt.loadFraction === 1.00 ? ' style="font-weight:600"' : '';
      return `<tr${highlight}>
        <td>${Math.round(pt.loadFraction * 100)}%</td>
        <td>${pt.loadKw.toFixed(1)} kW</td>
        <td>${pt.runtimeHours.toFixed(2)} h</td>
      </tr>`;
    }).join('');

    // Bank options tags
    const bankOptionsHtml = r.bankOptions.map(s =>
      `<span class="tag${s === r.selectedBankKwh ? ' tag--primary' : ''}">${s} kWh</span>`
    ).join(' ');

    // K_temp status colour
    const tempClass = r.kTempFactor < 0.85
      ? 'result-badge--fail'
      : r.kTempFactor < 0.95
        ? 'result-badge--warn'
        : 'result-badge--pass';

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-labelledby="results-heading">
        <h2 id="results-heading">Battery / UPS Sizing Results</h2>
        ${r.systemLabel ? `<p class="field-hint">System: <strong>${escHtml(r.systemLabel)}</strong></p>` : ''}
        <p class="field-hint">Chemistry: <strong>${escHtml(r.chemistryLabel)}</strong>
          &nbsp;|&nbsp; DoD: ${r.dod * 100}%
          &nbsp;|&nbsp; &eta;: ${r.eta * 100}%
          &nbsp;|&nbsp; Aging factor: ${r.agingFactor}&times;</p>

        <!-- Energy chain -->
        <div class="result-group">
          <h3>Energy Requirement (IEEE 485)</h3>
          <div class="result-row">
            <span class="result-label">Net energy required</span>
            <span class="result-value">${r.kwhNet.toFixed(1)} kWh</span>
          </div>
          <p class="field-hint result-formula">
            kWh<sub>net</sub> = ${r.averageLoadKw} kW &times; ${r.runtimeHours} h = ${r.kwhNet.toFixed(1)} kWh
          </p>

          <div class="result-row">
            <span class="result-label">Design capacity (&div; &eta; &times; DoD)</span>
            <span class="result-value">${r.kwhDesign.toFixed(1)} kWh</span>
          </div>
          <p class="field-hint result-formula">
            ${r.kwhNet.toFixed(1)} / (${r.eta} &times; ${r.dod}) = ${r.kwhDesign.toFixed(1)} kWh
          </p>

          <div class="result-row">
            <span class="result-label">Temperature correction
              (K<sub>temp</sub>&nbsp;=&nbsp;${r.kTempFactor})</span>
            <span class="result-value">${r.kwhTempCorrected.toFixed(1)} kWh</span>
          </div>
          <div class="result-badge ${tempClass}" role="status">
            ${r.ambientTempC} &deg;C ambient &rarr; K<sub>temp</sub> = ${r.kTempFactor}
            ${r.kTempFactor < 1.0
              ? ` (capacity de-rated by ${Math.round((1 / r.kTempFactor - 1) * 100)}%)`
              : ' (no de-rating at 25 &deg;C)'}
          </div>

          <div class="result-row">
            <span class="result-label">With aging factor (&times;&nbsp;${r.agingFactor})</span>
            <span class="result-value">${r.kwhWithAging.toFixed(1)} kWh</span>
          </div>

          <div class="result-row">
            <span class="result-label">Final with design margin
              (&times;&nbsp;${(1 + r.designMarginPct / 100).toFixed(2)})</span>
            <span class="result-value"><strong>${r.kwhFinal.toFixed(1)} kWh</strong></span>
          </div>
        </div>

        <!-- Bank selection -->
        <div class="result-group">
          <h3>Battery Bank Selection</h3>
          <div class="result-row">
            <span class="result-label">Recommended bank size</span>
            <span class="result-value"><strong>${r.selectedBankKwh} kWh</strong></span>
          </div>
          ${r.nextLargerKwh
            ? `<div class="result-row">
                <span class="result-label">Next larger standard size</span>
                <span class="result-value">${r.nextLargerKwh} kWh</span>
               </div>`
            : ''}
          <p class="field-hint">Nearby standard sizes: ${bankOptionsHtml}</p>
          ${r.exceedsStandard
            ? `<div class="alert-warn" role="note">
                <strong>Requirement exceeds largest standard size.</strong>
                Multiple parallel battery strings will be required.
               </div>`
            : ''}
        </div>

        <!-- Runtime curve -->
        <div class="result-group">
          <h3>Runtime Curve (${r.selectedBankKwh} kWh bank)</h3>
          <table class="results-table" aria-label="Runtime at various load levels">
            <thead>
              <tr>
                <th scope="col">Load</th>
                <th scope="col">Power (kW)</th>
                <th scope="col">Runtime (h)</th>
              </tr>
            </thead>
            <tbody>
              ${runtimeRows}
            </tbody>
          </table>
          <p class="field-hint">
            Usable energy = ${r.selectedBankKwh} kWh &times; ${r.dod} DoD &times;
            ${r.eta} &eta; = ${(r.selectedBankKwh * r.dod * r.eta).toFixed(1)} kWh
          </p>
        </div>

        <!-- UPS sizing -->
        <div class="result-group">
          <h3>UPS Sizing</h3>
          <div class="result-row">
            <span class="result-label">Required UPS kVA</span>
            <span class="result-value">${r.kvaRequired.toFixed(1)} kVA</span>
          </div>
          <p class="field-hint result-formula">
            kVA = ${r.peakLoadKw} kW / ${r.upsPowerFactor} PF = ${r.kvaRequired.toFixed(1)} kVA
          </p>
          <div class="result-row">
            <span class="result-label">Recommended standard UPS size</span>
            <span class="result-value"><strong>${r.standardKva} kVA</strong></span>
          </div>
        </div>

        ${warningsHtml}

        <p class="field-hint result-timestamp">Analysis run: ${new Date(r.timestamp).toLocaleString()}</p>
      </section>`;
  }

  function escHtml(str) {
    return str.replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
});
