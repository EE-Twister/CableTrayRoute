import { runHeatTraceSizingAnalysis } from './analysis/heatTraceSizing.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';

const FT_TO_M = 0.3048;
const IN_TO_MM = 25.4;
const MPH_TO_MPS = 0.44704;

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const form = document.getElementById('heat-trace-form');
  const resultsDiv = document.getElementById('results');
  const unitSelect = document.getElementById('unit-select');

  initStudyApprovalPanel('heatTraceSizing');
  bindUnitDisplay(unitSelect);

  const saved = getStudies().heatTraceSizing;
  if (saved) {
    restoreForm(saved);
    renderResults(saved, getUnitSystem(unitSelect));
  }

  form.addEventListener('submit', event => {
    event.preventDefault();

    const parsedInputs = parseAndValidateInputs(getUnitSystem(unitSelect));
    if (!parsedInputs) return;

    let result;
    try {
      result = runHeatTraceSizingAnalysis(parsedInputs);
    } catch (err) {
      showModal('Input Error', `<p>${escHtml(err.message)}</p>`, 'error');
      return;
    }

    const studies = getStudies();
    studies.heatTraceSizing = result;
    setStudies(studies);

    renderResults(result, getUnitSystem(unitSelect));
  });

  function getValue(id) {
    return document.getElementById(id).value;
  }

  function setValue(id, value) {
    const el = document.getElementById(id);
    if (!el || value == null) return;
    el.value = String(value);
  }

  function getUnitSystem(selectEl) {
    if (selectEl?.value === 'metric') return 'metric';
    return 'imperial';
  }

  function convertToCanonical(id, value, unitSystem) {
    if (unitSystem !== 'metric') return value;
    if (id === 'insulation-thickness-in') return value / IN_TO_MM;
    if (id === 'line-length-ft' || id === 'max-circuit-length-ft') return value / FT_TO_M;
    if (id === 'wind-speed-mph') return value / MPH_TO_MPS;
    return value;
  }

  function convertFromCanonical(id, value, unitSystem) {
    if (unitSystem !== 'metric') return value;
    if (id === 'insulation-thickness-in') return value * IN_TO_MM;
    if (id === 'line-length-ft' || id === 'max-circuit-length-ft') return value * FT_TO_M;
    if (id === 'wind-speed-mph') return value * MPH_TO_MPS;
    return value;
  }

  function parseNumberField(id, label, unitSystem, options = {}) {
    const raw = getValue(id);
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) {
      showModal('Input Error', `<p>${escHtml(label)} is required.</p>`, 'error');
      return null;
    }

    const canonical = convertToCanonical(id, parsed, unitSystem);
    if (options.min != null && canonical < options.min) {
      showModal('Input Error', `<p>${escHtml(label)} must be at least ${options.min}.</p>`, 'error');
      return null;
    }
    if (options.max != null && canonical > options.max) {
      showModal('Input Error', `<p>${escHtml(label)} must be at most ${options.max}.</p>`, 'error');
      return null;
    }
    return canonical;
  }

  function parseAndValidateInputs(unitSystem) {
    const insulationThicknessIn = parseNumberField('insulation-thickness-in', 'Insulation thickness', unitSystem, { min: 0.01 });
    if (insulationThicknessIn == null) return null;

    const lineLengthFt = parseNumberField('line-length-ft', 'Circuit length', unitSystem, { min: 1 });
    if (lineLengthFt == null) return null;

    const ambientTempC = parseNumberField('ambient-temp-c', 'Ambient temperature', unitSystem);
    if (ambientTempC == null) return null;

    const maintainTempC = parseNumberField('maintain-temp-c', 'Maintain temperature', unitSystem);
    if (maintainTempC == null) return null;

    if (maintainTempC <= ambientTempC) {
      showModal('Input Error', '<p>Maintain temperature must be greater than ambient temperature.</p>', 'error');
      return null;
    }

    const safetyMarginPct = parseNumberField('design-margin-pct', 'Design margin', unitSystem, { min: 0, max: 100 });
    if (safetyMarginPct == null) return null;

    const windRaw = Number.parseFloat(getValue('wind-speed-mph'));
    const windSpeedMph = Number.isFinite(windRaw)
      ? convertToCanonical('wind-speed-mph', windRaw, unitSystem)
      : 0;

    const voltageRaw = Number.parseFloat(getValue('voltage-v'));
    const maxLengthRaw = Number.parseFloat(getValue('max-circuit-length-ft'));

    return {
      pipeNps: getValue('pipe-nps'),
      insulationThicknessIn,
      lineLengthFt,
      pipeMaterial: getValue('pipe-material'),
      environment: getValue('environment'),
      ambientTempC,
      maintainTempC,
      windSpeedMph,
      safetyMarginPct,
      voltageV: Number.isFinite(voltageRaw) ? voltageRaw : 0,
      maxCircuitLengthFt: Number.isFinite(maxLengthRaw)
        ? convertToCanonical('max-circuit-length-ft', maxLengthRaw, unitSystem)
        : 0,
    };
  }

  function restoreForm(result) {
    setValue('pipe-nps', result.pipeNps);
    setValue('insulation-thickness-in', result.insulationThicknessIn);
    setValue('line-length-ft', result.lineLengthFt);
    setValue('pipe-material', result.pipeMaterial);
    setValue('environment', result.environment);
    setValue('ambient-temp-c', result.ambientTempC);
    setValue('maintain-temp-c', result.maintainTempC);
    setValue('wind-speed-mph', result.windSpeedMph ?? 0);
    setValue('design-margin-pct', result.safetyMarginPct);
    setValue('voltage-v', result.voltageV);
    setValue('max-circuit-length-ft', result.maxCircuitLengthFt);
  }

  function bindUnitDisplay(selectEl) {
    if (!selectEl) return;

    const unitLabels = {
      imperial: {
        insulation: 'in',
        length: 'ft',
        speed: 'mph',
      },
      metric: {
        insulation: 'mm',
        length: 'm',
        speed: 'm/s',
      },
    };

    function updateLabels(unitSystem) {
      const insLabel = document.querySelector('label[for="insulation-thickness-in"]');
      const lengthLabel = document.querySelector('label[for="line-length-ft"]');
      const maxLenLabel = document.querySelector('label[for="max-circuit-length-ft"]');
      const windLabel = document.querySelector('label[for="wind-speed-mph"]');

      if (insLabel) insLabel.childNodes[0].textContent = `Insulation thickness (${unitLabels[unitSystem].insulation}) `;
      if (lengthLabel) lengthLabel.textContent = `Circuit length (${unitLabels[unitSystem].length})`;
      if (maxLenLabel) maxLenLabel.textContent = `Maximum allowable circuit length (${unitLabels[unitSystem].length})`;
      if (windLabel) windLabel.textContent = `Wind speed (${unitLabels[unitSystem].speed})`;
    }

    function convertVisibleValues(fromUnit, toUnit) {
      if (fromUnit === toUnit) return;

      ['insulation-thickness-in', 'line-length-ft', 'max-circuit-length-ft', 'wind-speed-mph'].forEach(id => {
        const el = document.getElementById(id);
        if (!el || el.value === '') return;
        const current = Number.parseFloat(el.value);
        if (!Number.isFinite(current)) return;
        const canonical = convertToCanonical(id, current, fromUnit);
        const converted = convertFromCanonical(id, canonical, toUnit);
        const decimals = id === 'insulation-thickness-in' ? 1 : 2;
        el.value = String(Number(converted.toFixed(decimals)));
      });
    }

    let priorUnit = getUnitSystem(selectEl);
    updateLabels(priorUnit);

    selectEl.addEventListener('change', () => {
      const nextUnit = getUnitSystem(selectEl);
      convertVisibleValues(priorUnit, nextUnit);
      updateLabels(nextUnit);
      const saved = getStudies().heatTraceSizing;
      if (saved) renderResults(saved, nextUnit);
      priorUnit = nextUnit;
    });
  }

  function renderResults(result, unitSystem) {
    const warningItems = result.warnings.length
      ? `<ul class="drc-findings">${result.warnings.map((warning) =>
          `<li class="drc-finding drc-warn"><span class="drc-msg">${escHtml(warning)}</span></li>`
        ).join('')}</ul>`
      : '<p class="field-hint">No warnings detected for the current assumptions.</p>';

    const requiredOutput = unitSystem === 'metric'
      ? `${result.requiredWPerM.toFixed(2)} W/m`
      : `${result.requiredWPerFt.toFixed(2)} W/ft`;

    const selectedRating = unitSystem === 'metric'
      ? `${(result.recommendedCableRatingWPerFt / FT_TO_M).toFixed(2)} W/m`
      : `${result.recommendedCableRatingWPerFt} W/ft`;

    const totalCircuitLength = unitSystem === 'metric'
      ? `${(result.lineLengthFt * FT_TO_M).toFixed(1)} m`
      : `${result.lineLengthFt.toFixed(1)} ft`;

    resultsDiv.innerHTML = `
      <section class="results-panel" aria-labelledby="results-heading">
        <h2 id="results-heading">Heat Trace Sizing Results</h2>

        <div class="result-group">
          <div class="result-row">
            <span class="result-label">Temperature differential (ΔT)</span>
            <span class="result-value">${result.deltaT.toFixed(1)} &deg;C</span>
          </div>
          <div class="result-row">
            <span class="result-label">Circuit length used</span>
            <span class="result-value">${totalCircuitLength}</span>
          </div>
          <div class="result-row">
            <span class="result-label">Required heat output</span>
            <span class="result-value"><strong>${requiredOutput}</strong></span>
          </div>
          <div class="result-row">
            <span class="result-label">Selected standard cable rating</span>
            <span class="result-value"><strong>${selectedRating}</strong></span>
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
