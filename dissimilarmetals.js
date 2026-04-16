import { getStudies, setStudies } from './dataStore.mjs';
import { initStudyApprovalPanel } from './src/components/studyApproval.js';
import { escapeHtml } from './src/htmlUtils.mjs';

const MM_PER_YEAR_TO_MPY = 39.3701;

const METAL_SERIES = {
  magnesium: { label: 'Magnesium alloy', potentialV: -1.6, family: 'active' },
  zinc: { label: 'Zinc / galvanized steel (hot-dip)', potentialV: -1.03, family: 'active' },
  zincElectroplate: { label: 'Zinc electroplate (clear/yellow chromate)', potentialV: -0.98, family: 'active' },
  aluminum: { label: 'Aluminum alloy', potentialV: -0.8, family: 'active' },
  aluminumMetallized: { label: 'Aluminum metallized coating', potentialV: -0.78, family: 'active' },
  carbonSteel: { label: 'Carbon steel', potentialV: -0.6, family: 'active' },
  castIron: { label: 'Cast iron', potentialV: -0.61, family: 'active' },
  cadmium: { label: 'Cadmium-plated steel', potentialV: -0.75, family: 'active' },
  lead: { label: 'Lead', potentialV: -0.5, family: 'intermediate' },
  tin: { label: 'Tin / tin-plated copper', potentialV: -0.49, family: 'intermediate' },
  stainless410Active: { label: 'Stainless steel 410/430 (active)', potentialV: -0.56, family: 'active' },
  stainlessActive: { label: 'Stainless steel (active)', potentialV: -0.5, family: 'intermediate' },
  copper: { label: 'Copper', potentialV: -0.34, family: 'noble' },
  brass: { label: 'Brass', potentialV: -0.36, family: 'noble' },
  bronze: { label: 'Bronze / silicon bronze', potentialV: -0.33, family: 'noble' },
  copperNickel: { label: 'Copper-nickel alloy', potentialV: -0.3, family: 'noble' },
  nickelPlatedCopper: { label: 'Nickel-plated copper lug/barrel', potentialV: -0.22, family: 'noble' },
  stainless304Passive: { label: 'Stainless steel 304 (passive)', potentialV: -0.1, family: 'noble' },
  stainless316Passive: { label: 'Stainless steel 316 (passive)', potentialV: -0.05, family: 'noble' },
  stainlessDuplexPassive: { label: 'Stainless steel duplex (passive)', potentialV: -0.04, family: 'noble' },
  nickel200: { label: 'Nickel alloy (Ni 200)', potentialV: -0.18, family: 'noble' },
  titanium: { label: 'Titanium', potentialV: -0.03, family: 'noble' }
};

const ENVIRONMENT_FACTORS = {
  indoorDry: { label: 'Indoor conditioned / dry', conductivityFactor: 0.06, chlorideFactor: 0.8, moistureFactor: 0.7 },
  indoorHumid: { label: 'Indoor humid / washdown', conductivityFactor: 0.2, chlorideFactor: 1.0, moistureFactor: 1.0 },
  industrialOutdoor: { label: 'Industrial outdoor (rain + pollutants)', conductivityFactor: 0.45, chlorideFactor: 1.15, moistureFactor: 1.15 },
  coastalAtmosphere: { label: 'Coastal atmosphere / salt fog', conductivityFactor: 0.75, chlorideFactor: 1.4, moistureFactor: 1.25 },
  marineSplash: { label: 'Marine splash / tidal', conductivityFactor: 1.2, chlorideFactor: 1.6, moistureFactor: 1.35 },
  submergedSeawater: { label: 'Submerged seawater', conductivityFactor: 1.45, chlorideFactor: 1.75, moistureFactor: 1.4 },
  freshwaterSubmerged: { label: 'Freshwater submerged', conductivityFactor: 0.5, chlorideFactor: 0.9, moistureFactor: 1.2 }
};

export function estimateDissimilarMetalsRisk(input) {
  validateInputs(input);

  const primary = METAL_SERIES[input.primaryMetal];
  const secondary = METAL_SERIES[input.secondaryMetal];
  const environment = ENVIRONMENT_FACTORS[input.environment];

  const anodicMetal = primary.potentialV <= secondary.potentialV ? primary : secondary;
  const cathodicMetal = anodicMetal === primary ? secondary : primary;

  const drivingPotentialV = Math.max(0, cathodicMetal.potentialV - anodicMetal.potentialV);
  const areaRatio = Math.max(0.1, input.cathodeArea / input.anodeArea);
  const areaRatioFactor = areaRatio <= 1 ? (0.75 + 0.25 * areaRatio) : (1 + 0.28 * Math.log(areaRatio));
  const temperatureFactor = 1 + Math.max(-20, Math.min(60, input.temperatureC - 20)) * 0.015;
  const coatingFactor = input.isolationQuality === 'none'
    ? 1.35
    : input.isolationQuality === 'basic'
      ? 1.0
      : 0.55;

  const rawRate = Math.max(0, (drivingPotentialV - 0.05))
    * environment.conductivityFactor
    * environment.chlorideFactor
    * environment.moistureFactor
    * areaRatioFactor
    * temperatureFactor
    * coatingFactor
    * 0.7;

  const corrosionRateMmYear = round(rawRate, 3);
  const corrosionRateMpy = round(corrosionRateMmYear * MM_PER_YEAR_TO_MPY, 2);
  const severity = severityFromRate(corrosionRateMmYear);
  const estimatedLifeYears = corrosionRateMmYear > 0
    ? round(input.corrosionAllowanceMm / corrosionRateMmYear, 1)
    : Infinity;

  return {
    input,
    timestamp: new Date().toISOString(),
    primaryRole: anodicMetal === primary ? 'Anodic' : 'Cathodic',
    secondaryRole: anodicMetal === secondary ? 'Anodic' : 'Cathodic',
    anodicMetal: anodicMetal.label,
    cathodicMetal: cathodicMetal.label,
    drivingPotentialV: round(drivingPotentialV, 3),
    areaRatio: round(areaRatio, 2),
    corrosionRateMmYear,
    corrosionRateMpy,
    severity,
    estimatedLifeYears,
    recommendation: buildRecommendation({ anodicMetal, cathodicMetal, severity, environment: environment.label, areaRatio })
  };
}

function buildRecommendation({ anodicMetal, cathodicMetal, severity, environment, areaRatio }) {
  const recommendations = [];
  recommendations.push(`Protect ${anodicMetal.label} at the interface with ${cathodicMetal.label}; it is the anodic member in this pair.`);
  if (severity === 'Severe' || severity === 'High') {
    recommendations.push('Use dielectric isolation kits or non-conductive bushings at every hardware interface.');
    recommendations.push('Apply a robust barrier coating system and maintain coating continuity after installation.');
  }
  if (areaRatio > 2) {
    recommendations.push('Reduce cathode-to-anode area ratio (use larger anodic contact area or smaller noble fasteners) to slow galvanic attack.');
  }
  if (environment.includes('Marine') || environment.includes('coastal') || environment.includes('seawater')) {
    recommendations.push('In chloride-rich service, schedule frequent inspections and plan hardware replacement intervals.');
  }
  recommendations.push('Treat this output as planning guidance; verify final material compatibility with project corrosion engineering standards.');
  return recommendations;
}

function severityFromRate(rateMmYear) {
  if (rateMmYear < 0.01) return 'Negligible';
  if (rateMmYear < 0.05) return 'Low';
  if (rateMmYear < 0.2) return 'Moderate';
  if (rateMmYear < 0.5) return 'High';
  return 'Severe';
}

function round(value, decimals) {
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
}

function validateInputs(input) {
  if (!METAL_SERIES[input.primaryMetal]) {
    throw new Error('primaryMetal must be selected from the galvanic series list.');
  }
  if (!METAL_SERIES[input.secondaryMetal]) {
    throw new Error('secondaryMetal must be selected from the galvanic series list.');
  }
  if (!ENVIRONMENT_FACTORS[input.environment]) {
    throw new Error('environment must be selected from the supported environment list.');
  }
  ['anodeArea', 'cathodeArea', 'corrosionAllowanceMm'].forEach((field) => {
    if (!Number.isFinite(input[field]) || input[field] <= 0) {
      throw new Error(`${field} must be greater than zero.`);
    }
  });
  if (!Number.isFinite(input.temperatureC) || input.temperatureC < -40 || input.temperatureC > 120) {
    throw new Error('temperatureC must be between -40 and 120 °C.');
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initSettings();
    initDarkMode();
    initCompactMode();
    initHelpModal('help-btn', 'help-modal', 'close-help-btn');
    initNavToggle();
    initStudyApprovalPanel('dissimilarMetals');

    const form = document.getElementById('dissimilar-metals-form');
    const primarySelect = document.getElementById('primary-metal');
    const secondarySelect = document.getElementById('secondary-metal');
    const resultsEl = document.getElementById('results');
    const errorsEl = document.getElementById('calc-errors');
    const saved = getStudies().dissimilarMetals;

    populateMetalSelects(primarySelect, secondarySelect);
    updateAreaRoleGuidance();
    primarySelect.addEventListener('change', updateAreaRoleGuidance);
    secondarySelect.addEventListener('change', updateAreaRoleGuidance);

    if (saved) {
      renderResults(saved, resultsEl);
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const result = estimateDissimilarMetalsRisk(readFormInput());
        const studies = getStudies();
        studies.dissimilarMetals = result;
        setStudies(studies);
        errorsEl.hidden = true;
        errorsEl.textContent = '';
        renderResults(result, resultsEl);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to evaluate galvanic corrosion risk.';
        errorsEl.hidden = false;
        errorsEl.textContent = message;
        showModal('Input Error', `<p>${escapeHtml(message)}</p>`, 'error');
      }
    });
  });
}

function populateMetalSelects(primarySelect, secondarySelect) {
  if (!primarySelect || !secondarySelect) {
    return;
  }

  const defaultPrimary = primarySelect.dataset.defaultValue || 'aluminum';
  const defaultSecondary = secondarySelect.dataset.defaultValue || 'stainless304Passive';
  const metalEntries = Object.entries(METAL_SERIES)
    .sort(([, a], [, b]) => a.potentialV - b.potentialV);

  const buildOptions = (selectedValue) => metalEntries.map(([key, metal]) => {
    const selected = key === selectedValue ? ' selected' : '';
    return `<option value="${key}"${selected}>${metal.label}</option>`;
  }).join('');

  const selectedPrimary = METAL_SERIES[primarySelect.value] ? primarySelect.value : defaultPrimary;
  const selectedSecondary = METAL_SERIES[secondarySelect.value] ? secondarySelect.value : defaultSecondary;

  primarySelect.innerHTML = buildOptions(selectedPrimary);
  secondarySelect.innerHTML = buildOptions(selectedSecondary);
}

function readFormInput() {
  const getValue = id => document.getElementById(id).value;
  const getNumber = id => Number.parseFloat(getValue(id));

  return {
    primaryMetal: getValue('primary-metal'),
    secondaryMetal: getValue('secondary-metal'),
    environment: getValue('environment-type'),
    isolationQuality: getValue('isolation-quality'),
    anodeArea: getNumber('anode-area'),
    cathodeArea: getNumber('cathode-area'),
    corrosionAllowanceMm: getNumber('corrosion-allowance'),
    temperatureC: getNumber('temperature-c')
  };
}

function updateAreaRoleGuidance() {
  const primaryKey = document.getElementById('primary-metal')?.value;
  const secondaryKey = document.getElementById('secondary-metal')?.value;
  const primary = METAL_SERIES[primaryKey];
  const secondary = METAL_SERIES[secondaryKey];

  if (!primary || !secondary) {
    return;
  }

  const anodicMetal = primary.potentialV <= secondary.potentialV ? primary : secondary;
  const cathodicMetal = anodicMetal === primary ? secondary : primary;
  const anodicRole = anodicMetal === primary ? 'Primary component' : 'Connected hardware';
  const cathodicRole = cathodicMetal === primary ? 'Primary component' : 'Connected hardware';

  const anodeLabel = document.getElementById('anode-area-label');
  const cathodeLabel = document.getElementById('cathode-area-label');
  const areaHint = document.getElementById('area-role-hint');

  if (anodeLabel) {
    anodeLabel.textContent = `Estimated anodic exposed area (cm²) — ${anodicMetal.label} (${anodicRole})`;
  }
  if (cathodeLabel) {
    cathodeLabel.textContent = `Estimated cathodic exposed area (cm²) — ${cathodicMetal.label} (${cathodicRole})`;
  }
  if (areaHint) {
    areaHint.textContent = `For this pair, ${anodicMetal.label} is anodic (corrodes first) and ${cathodicMetal.label} is cathodic. The primary component is currently ${anodicRole.toLowerCase()}.`;
  }
}

function renderResults(result, container) {
  const estimatedLife = Number.isFinite(result.estimatedLifeYears)
    ? `${result.estimatedLifeYears.toFixed(1)} years`
    : 'No measurable galvanic consumption (model lower bound).';

  container.innerHTML = `
    <section class="results-card" aria-label="Dissimilar metal corrosion assessment">
      <h2>Assessment Results</h2>
      <table class="data-table">
        <tbody>
          <tr><th>Anodic (corroding) member</th><td>${escapeHtml(result.anodicMetal)}</td></tr>
          <tr><th>Cathodic member</th><td>${escapeHtml(result.cathodicMetal)}</td></tr>
          <tr><th>Primary component role</th><td>${escapeHtml(result.primaryRole)}</td></tr>
          <tr><th>Connected hardware role</th><td>${escapeHtml(result.secondaryRole)}</td></tr>
          <tr><th>Driving potential</th><td>${result.drivingPotentialV.toFixed(3)} V</td></tr>
          <tr><th>Cathode/Anode area ratio</th><td>${result.areaRatio.toFixed(2)} : 1</td></tr>
          <tr><th>Estimated corrosion rate</th><td>${result.corrosionRateMmYear.toFixed(3)} mm/year (${result.corrosionRateMpy.toFixed(2)} mpy)</td></tr>
          <tr><th>Severity</th><td><strong>${result.severity}</strong></td></tr>
          <tr><th>Estimated life from allowance</th><td>${estimatedLife}</td></tr>
        </tbody>
      </table>
      <h3>Recommended Mitigations</h3>
      <ul>
        ${result.recommendation.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
      <p class="field-hint">Engineering reference note: rates are planning-level galvanic estimates synthesized from galvanic potential separation,
      relative wetted area ratio, and electrolyte severity. Validate with your project corrosion engineer and applicable owner standards.</p>
    </section>
  `;
}
