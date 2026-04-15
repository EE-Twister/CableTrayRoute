import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';

const SQFT_TO_SQM = 0.09290304;
const LB_TO_KG = 0.45359237;

const TABLE_CURRENT_DENSITY_MA_M2 = {
  pipe: { low: 5, moderate: 10, high: 20 },
  tank: { low: 8, moderate: 15, high: 25 },
  other: { low: 6, moderate: 12, high: 22 }
};

export const CP_STANDARD_BASIS = {
  currentDensitySelection: {
    id: 'current-density-selection',
    label: 'Current density selection ranges',
    standards: ['AMPP SP21424', 'NACE SP0169'],
    summary: 'Table-range style current demand selection by structure condition and environment severity.'
  },
  polarizationCriteria: {
    id: 'polarization-criteria',
    label: 'Polarization / protection criteria assumptions',
    standards: ['NACE SP0169', 'ISO 15589-1'],
    summary: 'Protection assumptions align with conventional on/off potential and polarization criteria used for buried steel CP design.'
  },
  anodeCapacityUtilization: {
    id: 'anode-capacity-utilization',
    label: 'Anode capacity and utilization values',
    standards: ['DNV-RP-B401', 'ISO 15589-1'],
    summary: 'Galvanic anode ampere-hour capacity and utilization factors follow published anode design guidance.'
  },
  engineeringJudgmentAssumptions: {
    id: 'engineering-judgment',
    label: 'Engineering judgment assumptions',
    standards: ['Project-specific engineering judgment'],
    summary: 'Coating breakdown factor, design factor, and optional temperature correction require project-specific engineering validation.',
    assumptions: [
      'Coating breakdown factor is selected by expected coating quality, age, and defect distribution.',
      'Design factor is selected as a reliability margin for uncertainty and lifecycle variability.',
      'Temperature correction is not explicitly modeled in this tool and should be applied by engineering review when needed.'
    ]
  }
};

export function calculateRequiredCurrent(areaExposedM2, currentDensityAperM2) {
  return areaExposedM2 * currentDensityAperM2;
}

export function calculateRequiredAnodeMass(requiredCurrentA, designHours, anodeCapacityAhPerKg, utilizationFactor, designFactor) {
  return (requiredCurrentA * designHours) / (anodeCapacityAhPerKg * utilizationFactor * designFactor);
}

export function calculatePredictedDesignLife(installedMassKg, anodeCapacityAhPerKg, utilizationFactor, designFactor, requiredCurrentA) {
  return (installedMassKg * anodeCapacityAhPerKg * utilizationFactor * designFactor) / (requiredCurrentA * 8760);
}

export function runCathodicProtectionAnalysis(input) {
  const validationErrors = validateInputs(input);
  if (validationErrors.length) {
    throw new Error(validationErrors.join(' '));
  }

  const designCurrentDensityMaM2 = input.currentDensityMethod === 'manual'
    ? input.manualCurrentDensityMaM2
    : lookupCurrentDensity(input.assetType, input.moistureCategory, input.soilResistivityOhmM, input.soilPh);

  const designCurrentDensityAperM2 = designCurrentDensityMaM2 / 1000;
  const exposedAreaM2 = input.surfaceAreaM2 * input.coatingBreakdownFactor;
  const requiredCurrentA = calculateRequiredCurrent(exposedAreaM2, designCurrentDensityAperM2);
  const adjustedRequiredCurrentA = requiredCurrentA / input.availabilityFactor;
  const designHours = input.targetLifeYears * 8760;

  const minimumAnodeMassKg = calculateRequiredAnodeMass(
    adjustedRequiredCurrentA,
    designHours,
    input.anodeCapacityAhPerKg,
    input.anodeUtilization,
    input.designFactor
  );

  const predictedLifeYears = calculatePredictedDesignLife(
    input.installedMassKg,
    input.anodeCapacityAhPerKg,
    input.anodeUtilization,
    input.designFactor,
    adjustedRequiredCurrentA
  );

  return {
    ...input,
    timestamp: new Date().toISOString(),
    standardsBasis: CP_STANDARD_BASIS,
    outputBasis: {
      requiredCurrentA: 'Uses exposed-area current demand relation with current density selected per current-density standards basis.',
      minimumAnodeMassKg: 'Uses anode mass sizing equation with anode capacity/utilization values from anode-capacity standards basis.',
      predictedLifeYears: 'Uses installed mass life relation with anode capacity/utilization basis and protection criteria assumptions.',
      safetyMargin: 'Compares predicted life versus target design life using the same protection and anode basis assumptions.'
    },
    designCurrentDensityMaM2: roundTo(designCurrentDensityMaM2, 3),
    exposedAreaM2: roundTo(exposedAreaM2, 3),
    requiredCurrentA: roundTo(adjustedRequiredCurrentA, 4),
    minimumAnodeMassKg: roundTo(minimumAnodeMassKg, 3),
    minimumAnodeMassLb: roundTo(minimumAnodeMassKg / LB_TO_KG, 3),
    predictedLifeYears: roundTo(predictedLifeYears, 2),
    safetyMarginYears: roundTo(predictedLifeYears - input.targetLifeYears, 2),
    safetyMarginPercent: roundTo(((predictedLifeYears - input.targetLifeYears) / input.targetLifeYears) * 100, 1)
  };
}

function validateInputs(input) {
  const errors = [];
  const positiveChecks = [
    ['soilResistivityOhmM', input.soilResistivityOhmM],
    ['surfaceAreaM2', input.surfaceAreaM2],
    ['anodeCapacityAhPerKg', input.anodeCapacityAhPerKg],
    ['targetLifeYears', input.targetLifeYears],
    ['installedMassKg', input.installedMassKg],
    ['designFactor', input.designFactor],
    ['availabilityFactor', input.availabilityFactor],
    ['anodeUtilization', input.anodeUtilization]
  ];

  positiveChecks.forEach(([name, value]) => {
    if (!Number.isFinite(value) || value <= 0) {
      errors.push(`${name} must be greater than zero.`);
    }
  });

  if (!Number.isFinite(input.coatingBreakdownFactor) || input.coatingBreakdownFactor <= 0 || input.coatingBreakdownFactor > 1) {
    errors.push('coatingBreakdownFactor must be between 0 and 1, exclusive of zero.');
  }

  if (!Number.isFinite(input.soilPh) || input.soilPh < 0 || input.soilPh > 14) {
    errors.push('soilPh must be between 0 and 14.');
  }

  if (!['pipe', 'tank', 'other'].includes(input.assetType)) {
    errors.push('assetType must be pipe, tank, or other.');
  }

  if (!['low', 'moderate', 'high'].includes(input.moistureCategory)) {
    errors.push('moistureCategory must be low, moderate, or high.');
  }

  if (!['table', 'manual'].includes(input.currentDensityMethod)) {
    errors.push('currentDensityMethod must be table or manual.');
  }

  if (input.currentDensityMethod === 'manual' && (!Number.isFinite(input.manualCurrentDensityMaM2) || input.manualCurrentDensityMaM2 <= 0)) {
    errors.push('manualCurrentDensityMaM2 must be greater than zero when manual mode is selected.');
  }

  return errors;
}

function lookupCurrentDensity(assetType, moistureCategory, soilResistivityOhmM, soilPh) {
  const base = TABLE_CURRENT_DENSITY_MA_M2[assetType]?.[moistureCategory] ?? 10;
  const resistivityFactor = soilResistivityOhmM < 50 ? 1.2 : (soilResistivityOhmM > 200 ? 0.85 : 1.0);
  const phFactor = soilPh < 5.5 || soilPh > 9 ? 1.15 : 1.0;
  return base * resistivityFactor * phFactor;
}

function roundTo(value, decimals) {
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();
  initStudyApprovalPanel('cathodicProtection');

  const form = document.getElementById('cp-form');
  const resultsDiv = document.getElementById('results');
  const errorsDiv = document.getElementById('cp-errors');
  const densityMethodEl = document.getElementById('density-method');
  const manualRow = document.getElementById('manual-density-row');
  const tableDensityEl = document.getElementById('table-density');
  const basisPanel = document.getElementById('calculation-basis-content');

  const saved = getStudies().cathodicProtection;
  renderCalculationBasis(basisPanel, CP_STANDARD_BASIS);
  if (saved) {
    renderResults(saved, resultsDiv);
  }

  function refreshTableDensity() {
    const input = readFormInputs();
    if (!input) return;
    const tableDensity = lookupCurrentDensity(input.assetType, input.moistureCategory, input.soilResistivityOhmM, input.soilPh);
    tableDensityEl.value = roundTo(tableDensity, 3);
  }

  function toggleDensityMode() {
    const manual = densityMethodEl.value === 'manual';
    manualRow.hidden = !manual;
    tableDensityEl.closest('.field-row').hidden = manual;
  }

  toggleDensityMode();
  refreshTableDensity();

  ['asset-type', 'soil-resistivity', 'soil-ph', 'moisture-category', 'density-method'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      toggleDensityMode();
      refreshTableDensity();
    });
    document.getElementById(id).addEventListener('change', () => {
      toggleDensityMode();
      refreshTableDensity();
    });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = readFormInputs();
    if (!input) return;

    try {
      const result = runCathodicProtectionAnalysis(input);
      errorsDiv.hidden = true;
      errorsDiv.textContent = '';
      const studies = getStudies();
      studies.cathodicProtection = result;
      setStudies(studies);
      renderResults(result, resultsDiv);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid cathodic protection inputs.';
      errorsDiv.hidden = false;
      errorsDiv.innerHTML = `<strong>Input validation error:</strong> ${escapeHtml(message)}`;
      showModal('Input Error', `<p>${escapeHtml(message)}</p>`, 'error');
    }
  });
  });
}

function readFormInputs() {
  const getValue = id => document.getElementById(id).value;
  const getNumber = id => Number.parseFloat(getValue(id));
  const isMetric = document.getElementById('unit-select')?.value === 'metric';

  const surfaceAreaInput = getNumber('surface-area');
  const installedMassInput = getNumber('installed-mass');

  return {
    assetType: getValue('asset-type'),
    soilResistivityOhmM: getNumber('soil-resistivity'),
    soilPh: getNumber('soil-ph'),
    moistureCategory: getValue('moisture-category'),
    coatingBreakdownFactor: getNumber('coating-breakdown'),
    surfaceAreaM2: isMetric ? surfaceAreaInput : surfaceAreaInput * SQFT_TO_SQM,
    currentDensityMethod: getValue('density-method'),
    manualCurrentDensityMaM2: getNumber('manual-density'),
    anodeCapacityAhPerKg: getNumber('anode-capacity'),
    anodeUtilization: getNumber('anode-utilization'),
    designFactor: getNumber('design-factor'),
    availabilityFactor: getNumber('availability-factor'),
    targetLifeYears: getNumber('design-life-years'),
    installedMassKg: isMetric ? installedMassInput : installedMassInput * LB_TO_KG,
    units: isMetric ? 'metric' : 'imperial'
  };
}

function renderResults(result, root) {
  const lifeBadgeClass = result.safetyMarginYears >= 0 ? 'result-badge--pass' : 'result-badge--fail';
  const lifeBadgeIcon = result.safetyMarginYears >= 0 ? '✓' : '✗';
  const outputBasis = result.outputBasis || {};

  root.innerHTML = `
    <section class="results-panel" aria-labelledby="cp-results-heading">
      <h2 id="cp-results-heading">Cathodic Protection Sizing Results</h2>

      <div class="result-group">
        <div class="result-row">
          <span class="result-label">Required CP current</span>
          <span class="result-value">${result.requiredCurrentA} A</span>
        </div>
        <p class="field-hint result-formula">I<sub>req</sub> = A<sub>exposed</sub> × i<sub>d</sub> = ${result.exposedAreaM2} × ${(result.designCurrentDensityMaM2 / 1000).toFixed(4)} = ${result.requiredCurrentA} A</p>
        <p class="field-hint result-basis">Basis: ${escapeHtml(outputBasis.requiredCurrentA || 'See Calculation Basis section for standards mapping.')}</p>
      </div>

      <div class="result-group">
        <div class="result-row">
          <span class="result-label">Minimum anode mass</span>
          <span class="result-value">${result.minimumAnodeMassKg} kg (${result.minimumAnodeMassLb} lb)</span>
        </div>
        <p class="field-hint result-basis">Basis: ${escapeHtml(outputBasis.minimumAnodeMassKg || 'See Calculation Basis section for standards mapping.')}</p>
      </div>

      <div class="result-group">
        <div class="result-row">
          <span class="result-label">Predicted design life from installed mass</span>
          <span class="result-value">${result.predictedLifeYears} years</span>
        </div>
        <div class="result-badge ${lifeBadgeClass}">${lifeBadgeIcon} Safety margin: ${result.safetyMarginYears} years (${result.safetyMarginPercent}%) vs target ${result.targetLifeYears} years</div>
        <p class="field-hint result-basis">Basis: ${escapeHtml(outputBasis.predictedLifeYears || 'See Calculation Basis section for standards mapping.')}</p>
        <p class="field-hint result-basis">Safety margin basis: ${escapeHtml(outputBasis.safetyMargin || 'See Calculation Basis section for standards mapping.')}</p>
      </div>

      <div class="table-wrap">
        <table class="data-table" aria-label="Cathodic protection summary table">
          <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>Asset type</td><td>${escapeHtml(result.assetType)}</td></tr>
            <tr><td>Soil resistivity</td><td>${result.soilResistivityOhmM} Ω·m</td></tr>
            <tr><td>Soil pH</td><td>${result.soilPh}</td></tr>
            <tr><td>Moisture / corrosivity category</td><td>${escapeHtml(result.moistureCategory)}</td></tr>
            <tr><td>Design current density i<sub>d</sub></td><td>${result.designCurrentDensityMaM2} mA/m²</td></tr>
            <tr><td>Coating breakdown factor</td><td>${result.coatingBreakdownFactor}</td></tr>
            <tr><td>Exposed area</td><td>${result.exposedAreaM2} m²</td></tr>
            <tr><td>Anode capacity</td><td>${result.anodeCapacityAhPerKg} Ah/kg</td></tr>
            <tr><td>Anode utilization factor U</td><td>${result.anodeUtilization}</td></tr>
            <tr><td>Design factor F<sub>design</sub></td><td>${result.designFactor}</td></tr>
            <tr><td>Availability factor</td><td>${result.availabilityFactor}</td></tr>
          </tbody>
        </table>
      </div>

      <p class="field-hint result-timestamp">Analysis run: ${new Date(result.timestamp).toLocaleString()}</p>
    </section>`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function renderCalculationBasis(root, basis) {
  if (!root || !basis) return;

  const sections = [
    basis.currentDensitySelection,
    basis.polarizationCriteria,
    basis.anodeCapacityUtilization,
    basis.engineeringJudgmentAssumptions
  ].filter(Boolean);

  root.innerHTML = `
    <ul class="basis-list">
      ${sections.map((section) => `
        <li id="${escapeHtml(section.id)}">
          <strong>${escapeHtml(section.label)}:</strong>
          <span>${escapeHtml(section.summary)}</span>
          <div class="field-hint">Standards: ${escapeHtml(section.standards.join(', '))}</div>
          ${Array.isArray(section.assumptions) && section.assumptions.length
            ? `<ul>${section.assumptions.map((assumption) => `<li>${escapeHtml(assumption)}</li>`).join('')}</ul>`
            : ''}
        </li>
      `).join('')}
    </ul>
  `;
}
