import { runHeatTraceSizingAnalysis } from './analysis/heatTraceSizing.mjs';
import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();
  initAnalysisTabs();
  initSaveAction();

  const form = document.getElementById('heat-trace-form');
  const resultsDiv = document.getElementById('results');
  const unitSystemSelect = document.getElementById('unit-system');
  let activeUnitSystem = unitSystemSelect?.value || 'imperial';

  initStudyApprovalPanel('heatTraceSizing');

  const saved = getStudies().heatTraceSizing;
  if (saved) {
    const savedUnitSystem = saved.unitSystem || 'imperial';
    if (unitSystemSelect) {
      unitSystemSelect.value = savedUnitSystem;
      activeUnitSystem = savedUnitSystem;
    }
    applyUnitSystem(activeUnitSystem, { convertExistingValues: false });
    renderResults(saved);
  } else {
    applyUnitSystem(activeUnitSystem, { convertExistingValues: false });
  }

  unitSystemSelect?.addEventListener('change', () => {
    const nextUnitSystem = unitSystemSelect.value;
    if (nextUnitSystem === activeUnitSystem) return;
    applyUnitSystem(nextUnitSystem, { convertExistingValues: true });
    activeUnitSystem = nextUnitSystem;
  });

  form.addEventListener('submit', e => {
    e.preventDefault();

    let result;
    try {
      result = runHeatTraceSizingAnalysis(readInputs());
    } catch (err) {
      showModal('Input Error', `<p>${escHtml(err.message)}</p>`, 'error');
      return;
    }
    result.unitSystem = activeUnitSystem;

    const studies = getStudies();
    studies.heatTraceSizing = result;
    setStudies(studies);

    renderResults(result);
  });

  function readInputs() {
    const get = id => document.getElementById(id);
    const getFloat = id => parseFloat(get(id).value);

    const ambientValue = getFloat('ambient-temp-c');
    const maintainValue = getFloat('maintain-temp-c');
    const insulationThicknessValue = getFloat('insulation-thickness-in');
    const lineLengthValue = getFloat('line-length-ft');
    const windSpeedValue = getFloat('wind-speed-mph') || 0;
    const maxCircuitLengthValue = getFloat('max-circuit-length-ft') || 0;

    const inputs = {
      pipeNps: get('pipe-nps').value,
      insulationThicknessIn: insulationThicknessValue,
      insulationType: get('insulation-type').value,
      lineLengthFt: lineLengthValue,
      pipeMaterial: get('pipe-material').value,
      environment: get('environment').value,
      ambientTempC: ambientValue,
      maintainTempC: maintainValue,
      windSpeedMph: windSpeedValue,
      safetyMarginPct: getFloat('design-margin-pct'),
      voltageV: getFloat('voltage-v') || 0,
      maxCircuitLengthFt: maxCircuitLengthValue,
    };

    if (activeUnitSystem === 'metric') {
      inputs.insulationThicknessIn = metricToImperial.insulationThicknessIn(insulationThicknessValue);
      inputs.lineLengthFt = metricToImperial.lineLengthFt(lineLengthValue);
      inputs.ambientTempC = ambientValue;
      inputs.maintainTempC = maintainValue;
      inputs.windSpeedMph = metricToImperial.windSpeedMph(windSpeedValue);
      inputs.maxCircuitLengthFt = metricToImperial.maxCircuitLengthFt(maxCircuitLengthValue);
    } else {
      inputs.ambientTempC = imperialToMetric.ambientTempC(ambientValue);
      inputs.maintainTempC = imperialToMetric.maintainTempC(maintainValue);
    }

    return inputs;
  }

  function renderResults(result) {
    const displayDeltaT = result.unitSystem === 'metric'
      ? `${result.deltaT.toFixed(1)} &deg;C`
      : `${cToFDelta(result.deltaT).toFixed(1)} &deg;F`;
    const displayRequiredOutput = result.unitSystem === 'metric'
      ? `${result.requiredWPerM.toFixed(2)} W/m`
      : `${result.requiredWPerFt.toFixed(2)} W/ft`;
    const displaySelectedRating = result.unitSystem === 'metric'
      ? `${wPerFtToWPerM(result.recommendedCableRatingWPerFt).toFixed(2)} W/m`
      : `${result.recommendedCableRatingWPerFt} W/ft`;

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
            <span class="result-value">${displayDeltaT}</span>
          </div>
          <div class="result-row">
            <span class="result-label">Required heat output</span>
            <span class="result-value"><strong>${displayRequiredOutput}</strong></span>
          </div>
          <div class="result-row">
            <span class="result-label">Selected standard cable rating</span>
            <span class="result-value"><strong>${displaySelectedRating}</strong></span>
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

  function applyUnitSystem(unitSystem, { convertExistingValues = true } = {}) {
    const fieldConfigs = [
      {
        id: 'insulation-thickness-in',
        labelId: 'insulation-thickness-label',
        imperialLabel: 'Insulation thickness (in)',
        metricLabel: 'Insulation thickness (mm)',
        imperialMin: 0.25,
        imperialMax: null,
        imperialStep: 0.25,
        metricMin: 6.35,
        metricMax: null,
        metricStep: 1,
        toMetric: imperialToMetric.insulationThicknessIn,
        toImperial: metricToImperial.insulationThicknessIn,
      },
      {
        id: 'line-length-ft',
        labelId: 'line-length-label',
        imperialLabel: 'Circuit length (ft)',
        metricLabel: 'Circuit length (m)',
        imperialMin: 1,
        imperialMax: null,
        imperialStep: 1,
        metricMin: 0.3,
        metricMax: null,
        metricStep: 0.1,
        toMetric: imperialToMetric.lineLengthFt,
        toImperial: metricToImperial.lineLengthFt,
      },
      {
        id: 'ambient-temp-c',
        labelId: 'ambient-temp-label',
        imperialLabel: 'Ambient temperature (&deg;F)',
        metricLabel: 'Ambient temperature (&deg;C)',
        imperialMin: -76,
        imperialMax: 140,
        imperialStep: 1,
        metricMin: -60,
        metricMax: 60,
        metricStep: 1,
        toMetric: imperialToMetric.ambientTempC,
        toImperial: metricToImperial.ambientTempC,
      },
      {
        id: 'wind-speed-mph',
        labelId: 'wind-speed-label',
        imperialLabel: 'Wind speed (mph)',
        metricLabel: 'Wind speed (km/h)',
        imperialMin: 0,
        imperialMax: 100,
        imperialStep: 1,
        metricMin: 0,
        metricMax: 161,
        metricStep: 1,
        toMetric: imperialToMetric.windSpeedMph,
        toImperial: metricToImperial.windSpeedMph,
      },
      {
        id: 'maintain-temp-c',
        labelId: 'maintain-temp-label',
        imperialLabel: 'Maintain temperature (&deg;F)',
        metricLabel: 'Maintain temperature (&deg;C)',
        imperialMin: -4,
        imperialMax: 482,
        imperialStep: 1,
        metricMin: -20,
        metricMax: 250,
        metricStep: 1,
        toMetric: imperialToMetric.maintainTempC,
        toImperial: metricToImperial.maintainTempC,
      },
      {
        id: 'max-circuit-length-ft',
        labelId: 'max-circuit-length-label',
        imperialLabel: 'Maximum allowable circuit length (ft)',
        metricLabel: 'Maximum allowable circuit length (m)',
        imperialMin: 10,
        imperialMax: null,
        imperialStep: 10,
        metricMin: 3,
        metricMax: null,
        metricStep: 1,
        toMetric: imperialToMetric.maxCircuitLengthFt,
        toImperial: metricToImperial.maxCircuitLengthFt,
      },
    ];

    fieldConfigs.forEach(config => {
      const input = document.getElementById(config.id);
      const label = document.getElementById(config.labelId);
      if (!input || !label) return;

      const currentValue = parseFloat(input.value);
      const convertedValue = convertExistingValues && Number.isFinite(currentValue)
        ? (unitSystem === 'metric' ? config.toMetric(currentValue) : config.toImperial(currentValue))
        : currentValue;

      if (unitSystem === 'metric') {
        setLabelText(label, config.metricLabel);
        input.min = String(config.metricMin);
        input.step = String(config.metricStep);
        if (config.metricMax == null) {
          input.removeAttribute('max');
        } else {
          input.max = String(config.metricMax);
        }
      } else {
        setLabelText(label, config.imperialLabel);
        input.min = String(config.imperialMin);
        input.step = String(config.imperialStep);
        if (config.imperialMax == null) {
          input.removeAttribute('max');
        } else {
          input.max = String(config.imperialMax);
        }
      }

      if (convertExistingValues && Number.isFinite(convertedValue)) {
        input.value = roundForDisplay(convertedValue, config.id);
      }
    });
  }
});

function initAnalysisTabs() {
  const tabs = Array.from(document.querySelectorAll('.heattrace-tab[role="tab"]'));
  const panels = Array.from(document.querySelectorAll('.heattrace-panel[role="tabpanel"]'));
  if (!tabs.length || !panels.length) return;

  const activateTab = nextTab => {
    tabs.forEach(tab => {
      const isActive = tab === nextTab;
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      tab.tabIndex = isActive ? 0 : -1;
    });

    panels.forEach(panel => {
      const showPanel = panel.id === nextTab.getAttribute('aria-controls');
      panel.hidden = !showPanel;
    });
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', event => {
      let nextIndex = index;
      if (event.key === 'ArrowRight') {
        nextIndex = (index + 1) % tabs.length;
      } else if (event.key === 'ArrowLeft') {
        nextIndex = (index - 1 + tabs.length) % tabs.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = tabs.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      const nextTab = tabs[nextIndex];
      activateTab(nextTab);
      nextTab.focus();
    });
  });
}

function initSaveAction() {
  const saveActionButton = document.getElementById('heattrace-save-action');
  const primarySaveButton = document.getElementById('save-project-btn');
  if (!saveActionButton || !primarySaveButton) return;

  saveActionButton.addEventListener('click', () => {
    primarySaveButton.click();
  });
}

function roundForDisplay(value, fieldId) {
  const precisionByField = {
    'insulation-thickness-in': 1,
    'line-length-ft': 1,
    'ambient-temp-c': 0,
    'wind-speed-mph': 0,
    'maintain-temp-c': 0,
    'max-circuit-length-ft': 0,
  };
  const decimals = precisionByField[fieldId] ?? 2;
  return value.toFixed(decimals);
}

function setLabelText(label, text) {
  const helpButton = label.querySelector('.helpBtn');
  if (helpButton) {
    const existingTextNode = Array.from(label.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
    if (existingTextNode) {
      existingTextNode.textContent = `${text} `;
    } else {
      label.insertBefore(document.createTextNode(`${text} `), helpButton);
    }
    return;
  }
  label.innerHTML = text;
}

function cToF(tempC) {
  return (tempC * 9 / 5) + 32;
}

function fToC(tempF) {
  return (tempF - 32) * 5 / 9;
}

function cToFDelta(deltaC) {
  return deltaC * 9 / 5;
}

function wPerFtToWPerM(wPerFt) {
  return wPerFt / 0.3048;
}

function escHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

const imperialToMetric = {
  ambientTempC: fToC,
  maintainTempC: fToC,
  insulationThicknessIn: inches => inches * 25.4,
  lineLengthFt: feet => feet * 0.3048,
  windSpeedMph: mph => mph * 1.60934,
  maxCircuitLengthFt: feet => feet * 0.3048,
};

const metricToImperial = {
  ambientTempC: cToF,
  maintainTempC: cToF,
  insulationThicknessIn: mm => mm / 25.4,
  lineLengthFt: meters => meters / 0.3048,
  windSpeedMph: kmh => kmh / 1.60934,
  maxCircuitLengthFt: meters => meters / 0.3048,
};
