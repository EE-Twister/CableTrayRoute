import { runHeatTraceSizingAnalysis } from './analysis/heatTraceSizing.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const form = document.getElementById('heat-trace-form');
  const resultsDiv = document.getElementById('results');

  initStudyApprovalPanel('heatTraceSizing');

  const saved = getStudies().heatTraceSizing;
  if (saved) {
    renderResults(saved);
  }

  form.addEventListener('submit', e => {
    e.preventDefault();

    let result;
    try {
      result = runHeatTraceSizingAnalysis(readInputs());
    } catch (err) {
      showModal('Input Error', `<p>${escHtml(err.message)}</p>`, 'error');
      return;
    }

    const studies = getStudies();
    studies.heatTraceSizing = result;
    setStudies(studies);

    renderResults(result);
  });

  function readInputs() {
    const get = id => document.getElementById(id);
    const getFloat = id => parseFloat(get(id).value);

    return {
      pipeNps: get('pipe-nps').value,
      insulationThicknessIn: getFloat('insulation-thickness-in'),
      lineLengthFt: getFloat('line-length-ft'),
      pipeMaterial: get('pipe-material').value,
      environment: get('environment').value,
      ambientTempC: getFloat('ambient-temp-c'),
      maintainTempC: getFloat('maintain-temp-c'),
      windSpeedMph: getFloat('wind-speed-mph') || 0,
      safetyMarginPct: getFloat('design-margin-pct'),
      voltageV: getFloat('voltage-v') || 0,
      maxCircuitLengthFt: getFloat('max-circuit-length-ft') || 0,
    };
  }

  function renderResults(result) {
    const warningItems = result.warnings.length
      ? `<ul class="drc-findings">${result.warnings.map((w) =>
          `<li class="drc-finding drc-warn"><span class="drc-msg">${escHtml(w)}</span></li>`
        ).join('')}</ul>`
      : '<p class="field-hint">No warnings detected for the current assumptions.</p>';

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-labelledby="results-heading">
        <h2 id="results-heading">Heat Trace Sizing Results</h2>

        <div class="result-group">
          <div class="result-row">
            <span class="result-label">Temperature differential (ΔT)</span>
            <span class="result-value">${result.deltaT.toFixed(1)} &deg;C</span>
          </div>
          <div class="result-row">
            <span class="result-label">Required heat output</span>
            <span class="result-value"><strong>${result.requiredWPerFt.toFixed(2)} W/ft</strong></span>
          </div>
          <div class="result-row">
            <span class="result-label">Selected standard cable rating</span>
            <span class="result-value"><strong>${result.recommendedCableRatingWPerFt} W/ft</strong></span>
          </div>
          <div class="result-row">
            <span class="result-label">Total estimated circuit load</span>
            <span class="result-value">${result.totalCircuitWatts.toFixed(0)} W</span>
          </div>
        </div>

        <div class="result-group">
          <h3>Warnings</h3>
          ${warningItems}
        </div>
      </section>`;
  }
});
