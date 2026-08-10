
import { getStudies, setStudies } from './dataStore.mjs';
import { escapeHtml } from './src/htmlUtils.mjs';
// Worker-routed entry points for user-initiated calculate / export actions.
// Hot paths (the corrosion-timeline slider's `input` handler and per-row
// renderMitigationComparison helpers inside renderResults) still call the
// sync exports above so per-event latency is not gated on postMessage.
import {
  estimateDissimilarMetalsRisk as estimateDissimilarMetalsRiskOffMain,
  buildResultSummary as buildResultSummaryOffMain,
  buildResultExportPayload as buildResultExportPayloadOffMain,
} from './src/workers/dissimilarMetalsClient.js';

import {
  ASSEMBLY_PRESETS,
  DEFAULT_EXPOSURE_DUTY,
  ENVIRONMENT_FACTORS,
  METAL_SERIES,
  buildAssumptionRows,
  buildCompatibilityWarning,
  buildCorrosionTimelineState,
  buildInspectionMilestones,
  buildMitigationComparisonRows,
  buildPotentialCompatibility,
  buildResultExportPayload,
  buildResultSummary,
  estimateDissimilarMetalsRisk,
  finiteNumber,
  formatLifeYears,
  formatMm,
  formatNumber,
  formatRateMmYear,
  formatRateMpy,
  formatTimestamp,
  formatYears,
  getAssemblyPreset,
  getExposureDutyProfile,
} from './analysis/dissimilarMetalsModel.mjs';

export {
  buildAssumptionRows,
  buildCompatibilityWarning,
  buildCorrosionTimelineState,
  buildInspectionMilestones,
  buildMitigationComparisonRows,
  buildResultExportPayload,
  buildResultSummary,
  estimateDissimilarMetalsRisk,
  getAssemblyPreset,
};

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initSettings();
    initDarkMode();
    initCompactMode();
    initHelpModal('help-btn', 'help-modal', 'close-help-btn');
    initNavToggle();

    const form = document.getElementById('dissimilar-metals-form');
    const assemblyPresetSelect = document.getElementById('assembly-preset');
    const primarySelect = document.getElementById('primary-metal');
    const secondarySelect = document.getElementById('secondary-metal');
    const resetButton = document.getElementById('reset-corrosion-form');
    const resultsEl = document.getElementById('results');
    const errorsEl = document.getElementById('calc-errors');
    const saved = getStudies().dissimilarMetals;

    populateMetalSelects(primarySelect, secondarySelect);
    populateAssemblyPresetSelect(assemblyPresetSelect);
    updateAssemblyPresetHint('');
    updateAreaRoleGuidance();
    primarySelect.addEventListener('change', updateAreaRoleGuidance);
    secondarySelect.addEventListener('change', updateAreaRoleGuidance);
    assemblyPresetSelect?.addEventListener('change', () => {
      applyAssemblyPreset(assemblyPresetSelect.value);
      updateAssemblyPresetHint(assemblyPresetSelect.value);
    });
    markPresetCustomOnManualEdit(form, assemblyPresetSelect);
    resetButton?.addEventListener('click', () => {
      form.reset();
      if (assemblyPresetSelect) {
        assemblyPresetSelect.value = '';
      }
      updateAssemblyPresetHint('');
      updateAreaRoleGuidance();
      errorsEl.hidden = true;
      errorsEl.textContent = '';
    });

    if (saved?.input) {
      const refreshedSavedResult = refreshSavedResult(saved);
      if (refreshedSavedResult) {
        applyInputValues(refreshedSavedResult.input);
        updateAreaRoleGuidance();
        const studies = getStudies();
        studies.dissimilarMetals = refreshedSavedResult;
        setStudies(studies);
        renderResults(refreshedSavedResult, resultsEl);
      }
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      runSubmitCalculation().catch(error => {
        const message = error instanceof Error ? error.message : 'Unable to evaluate galvanic corrosion risk.';
        errorsEl.hidden = false;
        errorsEl.textContent = message;
        showModal('Input Error', `<p>${escapeHtml(message)}</p>`, 'error');
      });
    });

    async function runSubmitCalculation() {
      const result = await estimateDissimilarMetalsRiskOffMain(readFormInput());
      const studies = getStudies();
      studies.dissimilarMetals = result;
      setStudies(studies);
      errorsEl.hidden = true;
      errorsEl.textContent = '';
      renderResults(result, resultsEl);
    }
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

function populateAssemblyPresetSelect(select) {
  if (!select) {
    return;
  }

  const options = [
    '<option value="">Custom material pair</option>',
    ...ASSEMBLY_PRESETS.map(preset => `<option value="${escapeHtml(preset.id)}">${escapeHtml(preset.label)}</option>`)
  ];

  select.innerHTML = options.join('');
}

function applyAssemblyPreset(presetId) {
  const preset = getAssemblyPreset(presetId);
  if (!preset) {
    return;
  }

  applyInputValues(preset.values);
  updateAreaRoleGuidance();
}

function applyInputValues(values = {}) {
  const setValue = (id, value) => {
    const element = document.getElementById(id);
    if (element) {
      element.value = String(value);
    }
  };

  setValue('primary-metal', values.primaryMetal);
  setValue('secondary-metal', values.secondaryMetal);
  setValue('environment-type', values.environment);
  setValue('exposure-duty', values.exposureDuty || DEFAULT_EXPOSURE_DUTY);
  setValue('isolation-quality', values.isolationQuality);
  setValue('anode-area', values.anodeArea);
  setValue('cathode-area', values.cathodeArea);
  setValue('corrosion-allowance', values.corrosionAllowanceMm);
  setValue('initial-thickness', values.initialThicknessMm ?? '');
  setValue('minimum-thickness', values.minimumThicknessMm ?? '');
  setValue('temperature-c', values.temperatureC);
}

function refreshSavedResult(saved) {
  try {
    const refreshed = estimateDissimilarMetalsRisk(saved.input);
    refreshed.timestamp = saved.timestamp || refreshed.timestamp;
    return refreshed;
  } catch {
    return null;
  }
}

function updateAssemblyPresetHint(presetId) {
  const hint = document.getElementById('assembly-preset-hint');
  if (!hint) {
    return;
  }

  const preset = getAssemblyPreset(presetId);
  hint.textContent = preset
    ? preset.description
    : 'Seeds typical materials and assumptions.';
}

function markPresetCustomOnManualEdit(form, assemblyPresetSelect) {
  if (!form || !assemblyPresetSelect) {
    return;
  }

  form.querySelectorAll('input, select').forEach(control => {
    if (control.id === 'assembly-preset') {
      return;
    }
    control.addEventListener('input', () => {
      assemblyPresetSelect.value = '';
      updateAssemblyPresetHint('');
    });
    control.addEventListener('change', () => {
      assemblyPresetSelect.value = '';
      updateAssemblyPresetHint('');
    });
  });
}

function readFormInput() {
  const getValue = id => document.getElementById(id).value;
  const getNumber = id => Number.parseFloat(getValue(id));
  const getOptionalNumber = (id) => {
    const value = getValue(id).trim();
    return value === '' ? null : Number.parseFloat(value);
  };

  return {
    primaryMetal: getValue('primary-metal'),
    secondaryMetal: getValue('secondary-metal'),
    environment: getValue('environment-type'),
    exposureDuty: getValue('exposure-duty'),
    isolationQuality: getValue('isolation-quality'),
    anodeArea: getNumber('anode-area'),
    cathodeArea: getNumber('cathode-area'),
    corrosionAllowanceMm: getNumber('corrosion-allowance'),
    initialThicknessMm: getOptionalNumber('initial-thickness'),
    minimumThicknessMm: getOptionalNumber('minimum-thickness'),
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
  const samePotentialGroup = Math.abs(primary.potentialV - secondary.potentialV) < 0.0005;
  const anodeLabel = document.getElementById('anode-area-label');
  const cathodeLabel = document.getElementById('cathode-area-label');
  const areaHint = document.getElementById('area-role-hint');

  if (anodeLabel) {
    anodeLabel.textContent = samePotentialGroup
      ? 'First material exposed area (cm²)'
      : 'Anodic area (cm²)';
  }
  if (cathodeLabel) {
    cathodeLabel.textContent = samePotentialGroup
      ? 'Second material exposed area (cm²)'
      : 'Cathodic area (cm²)';
  }
  if (areaHint) {
    areaHint.textContent = samePotentialGroup
      ? 'The selected materials share a representative potential group; specific alloy testing may be needed to assign roles.'
      : `${anodicMetal.label} corrodes first. ${cathodicMetal.label} is cathodic.`;
  }
}

function renderResults(result, container) {
  const estimatedLife = Number.isFinite(result.estimatedLifeYears)
    ? formatLifeYears(result.estimatedLifeYears)
    : 'No modeled galvanic consumption.';
  const environmentLabel = result.environmentLabel
    || ENVIRONMENT_FACTORS[result.input?.environment]?.label
    || 'Not specified';
  const exposureDuty = getExposureDutyProfile(result.input?.exposureDuty);
  const exposureDutyLabel = result.exposureDutyLabel || exposureDuty.label;
  const exposureDutyFactor = finiteNumber(result.exposureDutyFactor, exposureDuty.wetnessFactor);
  const resultActionsHtml = renderResultActions(result);
  const compatibilityWarningHtml = renderCompatibilityWarning(result);
  const overviewHtml = renderResultOverview(result, {
    estimatedLife
  });
  const assessmentDetailsHtml = renderAssessmentDetails(result, {
    estimatedLife,
    environmentLabel,
    exposureDutyLabel,
    exposureDutyFactor
  });
  const mitigationsHtml = renderRecommendedMitigations(result);
  const mitigationComparisonHtml = renderMitigationComparison(result);
  const assumptionsHtml = renderAssumptionReview(result);
  const timelineHtml = renderCorrosionTimeline(result);

  container.innerHTML = `
    <section class="results-card corrosion-results-card" aria-label="Dissimilar metal corrosion assessment">
      <div class="corrosion-section-heading corrosion-results-heading">
        <div>
          <p class="corrosion-timeline-kicker">Assessment output</p>
          <h2>Assessment Results</h2>
        </div>
        <span class="corrosion-severity-badge corrosion-severity-badge--${getSeverityClass(result.severity)}">${escapeHtml(result.severity)}</span>
      </div>
      ${overviewHtml}
      ${compatibilityWarningHtml}
      <div class="corrosion-result-body-grid">
        ${mitigationsHtml}
        ${resultActionsHtml}
      </div>
      ${timelineHtml}
      ${mitigationComparisonHtml}
      <section class="corrosion-details-card" aria-labelledby="corrosion-details-heading">
        <div class="corrosion-card-heading">
          <div>
            <p class="corrosion-timeline-kicker">Documentation</p>
            <h3 id="corrosion-details-heading">Basis</h3>
          </div>
        </div>
        ${assessmentDetailsHtml}
        <details class="corrosion-assumptions">
          <summary>Engineering note</summary>
          <p class="field-hint">The screening rate and interval are heuristic planning outputs, not measured corrosion rates or qualified replacement intervals. Confirm quantitative penetration using galvanic current-density or weight-loss data for the actual assembly and electrolyte.</p>
          <p class="field-hint">Potential groups follow NASA-STD-6012A Table 1 and are intended for seawater compatibility screening. Review MIL-STD-889D and ASTM G71/G82 when qualifying a final design.</p>
        </details>
        ${assumptionsHtml}
      </section>
    </section>
  `;

  initResultActions(container, result);
  initCorrosionTimeline(container, result);
}

function renderResultOverview(result, { estimatedLife }) {
  const potentialCompatibility = result.potentialCompatibility
    || buildPotentialCompatibility(result.drivingPotentialV);
  return `
    <div class="corrosion-result-summary-grid" aria-label="Assessment summary">
      <article class="corrosion-kpi-card corrosion-kpi-card--${getSeverityClass(result.severity)}">
        <span>Severity</span>
        <strong>${escapeHtml(result.severity)}</strong>
        <small>${escapeHtml(getSeverityDescription(result.severity))}</small>
      </article>
      <article class="corrosion-kpi-card">
        <span>Heuristic screening rate</span>
        <strong>${escapeHtml(formatRateMmYear(result))}</strong>
        <small>${escapeHtml(formatRateMpy(result))}</small>
      </article>
      <article class="corrosion-kpi-card">
        <span>Screening interval</span>
        <strong>${escapeHtml(estimatedLife)}</strong>
        <small>${escapeHtml(formatMm(result.input?.corrosionAllowanceMm))} allowance</small>
      </article>
      <article class="corrosion-kpi-card">
        <span>0.25 V compatibility screen</span>
        <strong>${escapeHtml(potentialCompatibility.exceedsLimit ? 'Exceeds limit' : 'Within limit')}</strong>
        <small>${result.drivingPotentialV.toFixed(3)} V representative separation</small>
      </article>
    </div>
  `;
}

function renderAssessmentDetails(result, {
  estimatedLife,
  environmentLabel,
  exposureDutyLabel,
  exposureDutyFactor
}) {
  return `
    <div class="corrosion-table-wrap">
      <table class="data-table corrosion-details-table">
        <tbody>
          <tr><th>Anodic (corroding) member</th><td>${escapeHtml(result.anodicMetal)}</td></tr>
          <tr><th>Cathodic member</th><td>${escapeHtml(result.cathodicMetal)}</td></tr>
          <tr><th>Primary component role</th><td>${escapeHtml(result.primaryRole)}</td></tr>
          <tr><th>Connected hardware role</th><td>${escapeHtml(result.secondaryRole)}</td></tr>
          <tr><th>Driving potential</th><td>${result.drivingPotentialV.toFixed(3)} V</td></tr>
          <tr><th>0.25 V compatibility screen</th><td>${escapeHtml(result.potentialCompatibility?.label || buildPotentialCompatibility(result.drivingPotentialV).label)}</td></tr>
          <tr><th>Cathode/Anode area ratio</th><td>${result.areaRatio.toFixed(2)} : 1</td></tr>
          <tr><th>Exposure environment</th><td>${escapeHtml(environmentLabel)}</td></tr>
          <tr><th>Electrolyte duty cycle</th><td>${escapeHtml(exposureDutyLabel)} (${exposureDutyFactor.toFixed(2)}x)</td></tr>
          <tr><th>Heuristic screening rate</th><td>${escapeHtml(formatRateMmYear(result))} (${escapeHtml(formatRateMpy(result))})</td></tr>
          <tr><th>Severity</th><td><strong>${escapeHtml(result.severity)}</strong></td></tr>
          <tr><th>Screening interval from allowance</th><td>${escapeHtml(estimatedLife)}</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderRecommendedMitigations(result) {
  const actionHtml = result.recommendation.map(item => `
    <li>
      <details class="corrosion-action-disclosure">
        <summary>${escapeHtml(summarizeMitigationAction(item))}</summary>
        <p>${escapeHtml(item)}</p>
      </details>
    </li>
  `).join('');

  return `
    <section class="corrosion-action-card" aria-labelledby="corrosion-actions-heading">
      <div class="corrosion-card-heading corrosion-card-heading--stacked">
        <p class="corrosion-timeline-kicker">Recommended actions</p>
        <h3 id="corrosion-actions-heading">Mitigation Plan</h3>
      </div>
      <ul class="corrosion-action-list">${actionHtml}</ul>
    </section>
  `;
}

function renderResultActions() {
  return `
    <div class="corrosion-result-actions" aria-label="Result sharing actions">
      <div>
        <p class="corrosion-timeline-kicker">Study handoff</p>
        <p class="field-hint">Copy or export this study.</p>
      </div>
      <div class="corrosion-result-action-buttons">
        <button type="button" class="secondary-btn" data-copy-corrosion-summary>Copy Summary</button>
        <button type="button" class="secondary-btn" data-download-corrosion-json>Download JSON</button>
      </div>
      <output class="corrosion-action-status" data-corrosion-action-status aria-live="polite"></output>
    </div>
  `;
}

function getSeverityClass(severity) {
  return String(severity || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function getSeverityDescription(severity) {
  const descriptions = {
    Negligible: 'Minimal galvanic impact expected',
    Low: 'Manage with routine detailing',
    Moderate: 'Plan isolation and inspection',
    High: 'Mitigation is typically required',
    Severe: 'Redesign or isolate before release'
  };

  return descriptions[severity] || 'Review project corrosion basis';
}

function summarizeMitigationAction(text) {
  const action = String(text || '').toLowerCase();
  if (action.includes('dielectric') || action.includes('bushing')) {
    return 'Add dielectric isolation';
  }
  if (action.includes('barrier coating') || action.includes('coating continuity')) {
    return 'Protect coating continuity';
  }
  if (action.includes('area ratio')) {
    return 'Reduce area ratio';
  }
  if (action.includes('chloride') || action.includes('inspections')) {
    return 'Increase inspection frequency';
  }
  if (action.includes('drainage') || action.includes('wetting')) {
    return 'Reduce wetting';
  }
  if (action.includes('planning guidance') || action.includes('corrosion engineering')) {
    return 'Verify with project standards';
  }
  if (action.includes('quantitative penetration rate') || action.includes('current-density')) {
    return 'Qualify the quantitative rate';
  }
  if (action.includes('anodic member') || action.includes('interface')) {
    return 'Protect anodic interface';
  }
  return text;
}

function renderAssumptionReview(result) {
  const rows = buildAssumptionRows(result);
  if (!rows.length) {
    return '';
  }

  const rowHtml = rows.map(row => `
    <tr>
      <th scope="row">${escapeHtml(row.label)}</th>
      <td>${escapeHtml(row.value)}</td>
    </tr>
  `).join('');

  return `
    <details class="corrosion-assumptions">
      <summary>Inputs and model assumptions</summary>
      <div class="corrosion-table-wrap">
        <table class="data-table">
          <tbody>${rowHtml}</tbody>
        </table>
      </div>
    </details>
  `;
}

function initResultActions(container, result) {
  const copyButton = container.querySelector('[data-copy-corrosion-summary]');
  const downloadButton = container.querySelector('[data-download-corrosion-json]');
  const status = container.querySelector('[data-corrosion-action-status]');

  copyButton?.addEventListener('click', async () => {
    try {
      const summary = await buildResultSummaryOffMain(result);
      await copyTextToClipboard(summary);
      setActionStatus(status, 'Summary copied.');
    } catch {
      setActionStatus(status, 'Copy failed. Download the JSON instead.');
    }
  });

  downloadButton?.addEventListener('click', () => {
    downloadResultJson(result)
      .then(() => setActionStatus(status, 'JSON downloaded.'))
      .catch(() => setActionStatus(status, 'Download failed.'));
  });
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) {
    throw new Error('Clipboard copy failed.');
  }
}

async function downloadResultJson(result) {
  const payload = await buildResultExportPayloadOffMain(result);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `dissimilar-metals-study-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function setActionStatus(status, message) {
  if (!status) {
    return;
  }
  status.textContent = message;
}

function renderCompatibilityWarning(result) {
  const warning = result.compatibilityWarning || buildCompatibilityWarning(result);
  if (!warning) {
    return '';
  }

  const driversHtml = warning.drivers.length
    ? `<ul class="corrosion-warning-drivers">${warning.drivers.map(driver => `<li>${escapeHtml(driver)}</li>`).join('')}</ul>`
    : '';

  return `
    <aside class="corrosion-compatibility-warning corrosion-compatibility-warning--${escapeHtml(warning.level)}" aria-label="Material compatibility warning">
      <div>
        <p class="corrosion-timeline-kicker">Material compatibility</p>
        <h3>${escapeHtml(warning.title)}</h3>
      </div>
      <p class="corrosion-compatibility-summary">${escapeHtml(result.samePotentialGroup
        ? 'No distinct anodic member is assigned by the representative potential groups.'
        : `${result.anodicMetal} corrodes first.`)}</p>
      ${driversHtml}
      <details class="corrosion-warning-detail">
        <summary>Details</summary>
        <p>${escapeHtml(warning.message)}</p>
      </details>
    </aside>
  `;
}

function renderMitigationComparison(result) {
  const rows = buildMitigationComparisonRows(result);
  if (!rows.length) {
    return '';
  }

  const rowHtml = rows.map(row => {
    const currentBadge = row.isCurrent ? '<span class="corrosion-current-badge">Current</span>' : '';
    const lifeText = formatLifeYears(row.estimatedLifeYears);
    const gainText = row.lifeGainYears === null
      ? 'No measurable baseline'
      : row.lifeGainYears <= 0
        ? 'Baseline'
        : `+${row.lifeGainYears.toFixed(1)} years`;

    return `
      <tr class="${row.isCurrent ? 'is-current' : ''}">
        <th scope="row">
          <span>${escapeHtml(row.label)}</span>
          ${currentBadge}
          <small>${escapeHtml(row.detail)}</small>
        </th>
        <td>${escapeHtml(formatRateMmYear(row))}</td>
        <td>${escapeHtml(lifeText)}</td>
        <td>${row.rateReductionPct}% lower rate<br><small>${escapeHtml(gainText)} vs no isolation</small></td>
        <td><strong>${escapeHtml(row.severity)}</strong></td>
      </tr>
    `;
  }).join('');

  return `
    <section class="corrosion-comparison-card" aria-labelledby="corrosion-comparison-heading">
      <div class="corrosion-card-heading">
        <div>
          <p class="corrosion-timeline-kicker">Mitigation comparison</p>
          <h3 id="corrosion-comparison-heading">Isolation Strategy Impact</h3>
        </div>
        <p class="field-hint">Same study, different isolation.</p>
      </div>
      <div class="corrosion-table-wrap">
        <table class="data-table corrosion-comparison-table">
          <thead>
            <tr>
              <th scope="col">Strategy</th>
              <th scope="col">Screening rate</th>
              <th scope="col">Screening interval</th>
              <th scope="col">Change vs no isolation</th>
              <th scope="col">Severity</th>
            </tr>
          </thead>
          <tbody>${rowHtml}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderCorrosionTimeline(result) {
  const config = getCorrosionTimelineConfig(result);
  const initialState = buildCorrosionTimelineState(result, 0);
  const maxYearsText = formatYears(config.maxYears);
  const allowanceText = formatMm(initialState.corrosionAllowanceMm);
  const thicknessProjectionHtml = renderThicknessProjection(initialState);
  const milestonesHtml = renderInspectionMilestones(result);

  return `
    <section class="corrosion-timeline-card" aria-labelledby="corrosion-timeline-heading">
      <div class="corrosion-timeline-header">
        <div>
          <p class="corrosion-timeline-kicker">Allowance timeline</p>
          <h3 id="corrosion-timeline-heading">Corrosion Over Time</h3>
          <p class="field-hint">Slide to project material loss over time.</p>
        </div>
        <output class="corrosion-status-pill corrosion-status-pill--${initialState.statusKey}" for="corrosion-years-slider" data-corrosion-status>${escapeHtml(initialState.statusLabel)}</output>
      </div>

      <div class="corrosion-timeline-grid">
        <div class="corrosion-visual-panel">
          <div class="corrosion-visual" data-corrosion-visual style="--corrosion-progress: 0%; --corrosion-pit-opacity: 0;">
            <div class="corrosion-visual-label">Impacted anodic component</div>
            <div class="corrosion-visual-member" aria-hidden="true">
              <svg class="corrosion-visual-svg" data-corrosion-svg viewBox="0 0 600 140" width="100%" height="150" role="img" aria-label="Corrosion allowance visual for ${escapeHtml(result.anodicMetal)}">
                <defs>
                  <linearGradient id="corrosion-metal-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#cbd5e1"></stop>
                    <stop offset="48%" stop-color="#f8fafc"></stop>
                    <stop offset="100%" stop-color="#94a3b8"></stop>
                  </linearGradient>
                  <linearGradient id="corrosion-attack-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#7f1d1d"></stop>
                    <stop offset="58%" stop-color="#c2410c"></stop>
                    <stop offset="100%" stop-color="#fb923c"></stop>
                  </linearGradient>
                </defs>
                <rect x="4" y="16" width="592" height="96" rx="8" fill="url(#corrosion-metal-gradient)" stroke="#64748b" stroke-width="1.5"></rect>
                <path data-corrosion-attack-shape d="${buildCorrosionAttackPath(0)}" fill="url(#corrosion-attack-gradient)" opacity="0"></path>
                <g data-corrosion-pits opacity="0">
                  <circle cx="92" cy="40" r="2.4" fill="#451a03"></circle>
                  <circle cx="170" cy="84" r="3.2" fill="#7c2d12"></circle>
                  <circle cx="276" cy="56" r="2.5" fill="#451a03"></circle>
                  <circle cx="390" cy="88" r="2.7" fill="#7c2d12"></circle>
                  <circle cx="496" cy="50" r="2.5" fill="#451a03"></circle>
                </g>
                <rect x="4" y="16" width="592" height="96" rx="8" fill="none" stroke="#334155" stroke-width="1"></rect>
                <rect x="432" y="76" width="148" height="26" rx="4" fill="rgba(255,255,255,.82)"></rect>
                <text x="570" y="94" text-anchor="end" fill="#0f172a" font-size="16" font-weight="700">${escapeHtml(result.anodicMetal)}</text>
              </svg>
            </div>
            <div class="corrosion-visual-legend" aria-hidden="true">
              <span><i class="corrosion-legend-swatch corrosion-legend-swatch--attack"></i>Modeled corrosion</span>
              <span><i class="corrosion-legend-swatch corrosion-legend-swatch--metal"></i>Remaining allowance</span>
            </div>
          </div>
        </div>

        <div class="corrosion-controls-panel">
          <label class="corrosion-slider-label" for="corrosion-years-slider">
            <span>Time in service</span>
            <strong data-corrosion-years>0.0 years</strong>
          </label>
          <input id="corrosion-years-slider" data-corrosion-slider type="range" min="0" max="${config.maxYears}" step="${config.step}" value="0">
          <div class="corrosion-slider-scale" aria-hidden="true">
            <span>0 years</span>
            <span>${escapeHtml(maxYearsText)}</span>
          </div>
          <p class="field-hint">Heuristic projection based on the screening rate and ${escapeHtml(allowanceText)} allowance.</p>

          <div class="corrosion-metrics-grid" aria-live="polite">
            <div class="corrosion-metric">
              <span>Material loss</span>
              <strong data-corrosion-loss>0.000 mm</strong>
            </div>
            <div class="corrosion-metric">
              <span>Allowance remaining</span>
              <strong data-corrosion-remaining>${escapeHtml(allowanceText)}</strong>
            </div>
            <div class="corrosion-metric">
              <span>Allowance consumed</span>
              <strong data-corrosion-consumed>0.0%</strong>
            </div>
            <div class="corrosion-metric">
              <span>Planning status</span>
              <strong data-corrosion-status-detail>${escapeHtml(initialState.statusDetail)}</strong>
            </div>
          </div>
          ${thicknessProjectionHtml}
        </div>
      </div>
      ${milestonesHtml}
    </section>
  `;
}

function renderThicknessProjection(state) {
  if (!state.hasThicknessProjection) {
    return '';
  }

  const minimumText = Number.isFinite(state.minimumThicknessMm)
    ? formatMm(state.minimumThicknessMm)
    : 'Not specified';
  const marginText = Number.isFinite(state.thicknessMarginMm)
    ? formatMm(state.thicknessMarginMm)
    : 'Not calculated';

  return `
    <div class="corrosion-thickness-panel corrosion-thickness-panel--${state.thicknessStatusKey}" data-corrosion-thickness-panel aria-label="Component thickness projection">
      <div class="corrosion-thickness-heading">
        <span>Component thickness</span>
        <strong data-corrosion-thickness-status>${escapeHtml(state.thicknessStatusLabel)}</strong>
      </div>
      <div class="corrosion-thickness-bar" aria-hidden="true">
        <i data-corrosion-thickness-bar style="width: ${state.visualRemainingThicknessPct}%;"></i>
      </div>
      <div class="corrosion-thickness-grid">
        <div>
          <span>Initial</span>
          <strong>${escapeHtml(formatMm(state.initialThicknessMm))}</strong>
        </div>
        <div>
          <span>Remaining</span>
          <strong data-corrosion-thickness-remaining>${escapeHtml(formatMm(state.remainingThicknessMm))}</strong>
        </div>
        <div>
          <span>Minimum</span>
          <strong>${escapeHtml(minimumText)}</strong>
        </div>
        <div>
          <span>Margin</span>
          <strong data-corrosion-thickness-margin>${escapeHtml(marginText)}</strong>
        </div>
      </div>
      <p data-corrosion-thickness-detail>${escapeHtml(state.thicknessStatusDetail)}</p>
    </div>
  `;
}

function renderInspectionMilestones(result) {
  const milestones = buildInspectionMilestones(result);
  const milestoneHtml = milestones.map(milestone => `
    <article class="corrosion-milestone corrosion-milestone--${escapeHtml(milestone.key)}">
      <span>${milestone.percent}% allowance</span>
      <strong>${escapeHtml(milestone.yearLabel)}</strong>
      <h4>${escapeHtml(milestone.label)}</h4>
      <p>${escapeHtml(milestone.action)}</p>
    </article>
  `).join('');

  return `
    <section class="corrosion-milestones" aria-labelledby="corrosion-milestones-heading">
      <div class="corrosion-card-heading">
        <div>
          <p class="corrosion-timeline-kicker">Action milestones</p>
          <h3 id="corrosion-milestones-heading">Inspection Plan</h3>
        </div>
        <p class="field-hint">Planning milestones derived from the heuristic screening rate and allowance.</p>
      </div>
      <div class="corrosion-milestone-grid">${milestoneHtml}</div>
    </section>
  `;
}

function getCorrosionTimelineConfig(result) {
  const estimatedLifeYears = finiteNumber(result?.estimatedLifeYears, NaN);
  const maxYears = Number.isFinite(estimatedLifeYears) && estimatedLifeYears > 0
    ? round(Math.max(0.1, estimatedLifeYears), 2)
    : 30;
  const step = maxYears <= 1
    ? 0.01
    : maxYears <= 10
      ? 0.1
      : maxYears <= 50
        ? 0.5
        : 1;

  return { maxYears, step };
}

function initCorrosionTimeline(container, result) {
  const slider = container.querySelector('[data-corrosion-slider]');
  if (!slider) {
    return;
  }

  const updateTimeline = () => {
    updateCorrosionTimeline(container, result, Number.parseFloat(slider.value));
  };

  slider.addEventListener('input', updateTimeline);
  updateTimeline();
}

function updateCorrosionTimeline(container, result, years) {
  const state = buildCorrosionTimelineState(result, years);
  const visual = container.querySelector('[data-corrosion-visual]');
  const attackShape = container.querySelector('[data-corrosion-attack-shape]');
  const pits = container.querySelector('[data-corrosion-pits]');
  const status = container.querySelector('[data-corrosion-status]');
  const yearsEl = container.querySelector('[data-corrosion-years]');
  const lossEl = container.querySelector('[data-corrosion-loss]');
  const remainingEl = container.querySelector('[data-corrosion-remaining]');
  const consumedEl = container.querySelector('[data-corrosion-consumed]');
  const detailEl = container.querySelector('[data-corrosion-status-detail]');
  const thicknessPanel = container.querySelector('[data-corrosion-thickness-panel]');
  const thicknessStatusEl = container.querySelector('[data-corrosion-thickness-status]');
  const thicknessBar = container.querySelector('[data-corrosion-thickness-bar]');
  const thicknessRemainingEl = container.querySelector('[data-corrosion-thickness-remaining]');
  const thicknessMarginEl = container.querySelector('[data-corrosion-thickness-margin]');
  const thicknessDetailEl = container.querySelector('[data-corrosion-thickness-detail]');

  if (visual) {
    const pitOpacity = state.visualConsumedPct <= 0
      ? 0
      : Math.max(0.12, Math.min(0.72, state.visualConsumedPct / 100));
    visual.style.setProperty('--corrosion-progress', `${state.visualConsumedPct}%`);
    visual.style.setProperty('--corrosion-pit-opacity', pitOpacity.toFixed(2));
    visual.dataset.status = state.statusKey;
    if (attackShape) {
      attackShape.setAttribute('d', buildCorrosionAttackPath(state.visualConsumedPct));
      attackShape.setAttribute('opacity', state.visualConsumedPct > 0 ? '1' : '0');
    }
    if (pits) {
      pits.setAttribute('opacity', pitOpacity.toFixed(2));
    }
  }
  if (status) {
    status.textContent = state.statusLabel;
    status.className = `corrosion-status-pill corrosion-status-pill--${state.statusKey}`;
  }
  if (yearsEl) {
    yearsEl.textContent = formatYears(state.elapsedYears);
  }
  if (lossEl) {
    const overage = state.overAllowanceMm > 0 ? ` (+${formatMm(state.overAllowanceMm)} over)` : '';
    lossEl.textContent = `${formatMm(state.materialLossMm)}${overage}`;
  }
  if (remainingEl) {
    remainingEl.textContent = formatMm(state.remainingAllowanceMm);
  }
  if (consumedEl) {
    consumedEl.textContent = `${state.allowanceConsumedPct.toFixed(1)}%`;
  }
  if (detailEl) {
    detailEl.textContent = state.statusDetail;
  }
  if (thicknessPanel && state.hasThicknessProjection) {
    thicknessPanel.className = `corrosion-thickness-panel corrosion-thickness-panel--${state.thicknessStatusKey}`;
  }
  if (thicknessStatusEl && state.hasThicknessProjection) {
    thicknessStatusEl.textContent = state.thicknessStatusLabel;
  }
  if (thicknessBar && state.hasThicknessProjection) {
    thicknessBar.style.width = `${state.visualRemainingThicknessPct}%`;
  }
  if (thicknessRemainingEl && state.hasThicknessProjection) {
    thicknessRemainingEl.textContent = formatMm(state.remainingThicknessMm);
  }
  if (thicknessMarginEl && state.hasThicknessProjection) {
    thicknessMarginEl.textContent = Number.isFinite(state.thicknessMarginMm)
      ? formatMm(state.thicknessMarginMm)
      : 'Not calculated';
  }
  if (thicknessDetailEl && state.hasThicknessProjection) {
    thicknessDetailEl.textContent = state.thicknessStatusDetail;
  }
}

function buildCorrosionAttackPath(progressPct) {
  const progress = Math.min(100, Math.max(0, finiteNumber(progressPct, 0))) / 100;
  const left = 4;
  const top = 16;
  const bottom = 112;
  const fullWidth = 592;
  const front = left + (fullWidth * progress);

  if (progress <= 0) {
    return `M ${left} ${top} L ${left} ${bottom} L ${left} ${bottom} L ${left} ${top} Z`;
  }

  const notch = Math.min(28, Math.max(10, fullWidth * 0.05));
  const inset = Math.max(left, front - notch);

  return [
    `M ${left} ${top}`,
    `L ${front.toFixed(2)} ${top}`,
    `L ${inset.toFixed(2)} 28`,
    `L ${front.toFixed(2)} 41`,
    `L ${inset.toFixed(2)} 54`,
    `L ${front.toFixed(2)} 68`,
    `L ${inset.toFixed(2)} 82`,
    `L ${front.toFixed(2)} 96`,
    `L ${inset.toFixed(2)} ${bottom}`,
    `L ${left} ${bottom}`,
    'Z'
  ].join(' ');
}
