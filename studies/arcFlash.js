import { runArcFlash } from '../analysis/arcFlash.mjs';
import { getOneLine, getStudies, getStudyAssessments, captureStudyRunContext, assertStudyRunContextCurrent, saveStudyResult } from '../dataStore.mjs';
import { getProjectState } from '../projectStorage.js';
import { generateArcFlashReport } from '../reports/arcFlashReport.mjs';
import { arcFlashBarRows, barChartHtml, kpiStripHtml, ppeCategoryForEnergy, statusLegendHtml } from '../src/components/resultViz.mjs';
import { assessArcFlashResultPlausibility } from '../analysis/arcFlashResultUnits.mjs';
import {
  arcFlashReadinessLabel,
  arcFlashResultEntries,
  formatArcFlashClearingBasis,
  isArcFlashLabelEligible,
  summarizeArcFlashResults,
} from './arcFlashReadiness.mjs';

function projectComponents() {
  const sheets = getOneLine()?.sheets;
  return Array.isArray(sheets)
    ? sheets.flatMap(sheet => Array.isArray(sheet?.components) ? sheet.components : [])
      .filter(component => component && component.type !== 'annotation' && component.type !== 'dimension')
    : [];
}

export async function runArcFlashStudy() {
  if (!projectComponents().length) throw new Error('The active project One-Line has no components to analyze.');
  const runContext = captureStudyRunContext('arcFlash', {
    inputs: { oneLine: projectComponents() },
    options: {},
    assumptions: ['Arc-flash incident energy is evaluated from the active One-Line fault and protective-device inputs.'],
  });
  const results = await runArcFlash();
  assertStudyRunContextCurrent(runContext);
  try {
    saveStudyResult('arcFlash', results, runContext);
    return { ...results, persisted: true };
  } catch (error) {
    return {
      ...results,
      persisted: false,
      persistenceWarning: `Study was calculated but not saved: ${error.message || error}`,
    };
  }
}

/**
 * Chart readiness for one location. A bar only carries a PPE pass/review/fail
 * badge when its result is current and label-ready; otherwise it shows why not.
 * A boundary that contradicts the incident energy is marked invalid and is
 * excluded from the headline KPIs.
 */
function arcFlashChartReadiness(result, { stale = false } = {}) {
  const plausibility = assessArcFlashResultPlausibility(result);
  if (!plausibility.plausible) return { ready: false, badge: 'Invalid', reason: plausibility.reason, invalid: true };
  if (stale) return { ready: false, badge: 'Stale', reason: 'Saved result is not current; rerun before relying on it' };
  if (!isArcFlashLabelEligible(result)) return { ready: false, badge: 'Not label-ready', reason: arcFlashReadinessLabel(result) };
  return { ready: true };
}

function renderArcFlashChart(entries, { stale = false } = {}) {
  const chart = document.getElementById('arcflash-chart');
  if (!chart) return;
  const states = new Map(entries.map(([id, result]) => [id, arcFlashChartReadiness(result, { stale })]));
  const rows = arcFlashBarRows(entries, { readiness: id => states.get(id) }).map(row => {
    const state = states.get(row.id);
    return state?.invalid
      ? { ...row, valueLabel: `${row.value.toFixed(2)} cal/cm² · Invalid result`, note: state.reason, invalid: true }
      : row;
  });
  if (!rows.length) {
    chart.innerHTML = '';
    return;
  }
  const validRows = rows.filter(row => !row.invalid);
  const invalidCount = rows.length - validRows.length;
  const kpis = [];
  if (validRows.length) {
    const worst = validRows.reduce((best, row) => (row.value > best.value ? row : best), validRows[0]);
    const worstCategory = ppeCategoryForEnergy(worst.value);
    const dangerous = validRows.filter(row => row.value > 40).length;
    // Headline cards only carry a verdict colour when every location is current
    // and label-ready; otherwise they are informational, like the bars.
    const allReady = validRows.every(row => !row.notReady);
    const verdict = status => (allReady ? status : 'info');
    kpis.push(
      { label: 'Highest incident energy', value: `${worst.value.toFixed(1)} cal/cm²`, hint: worst.label, status: verdict(worstCategory.status) },
      { label: 'Worst PPE category', value: worstCategory.label.replace(/ cal\/cm².*/, ''), status: verdict(worstCategory.status) },
      { label: 'Over 40 cal/cm²', value: String(dangerous), status: dangerous ? 'fail' : verdict('pass') }
    );
  }
  if (invalidCount) {
    kpis.push({ label: 'Invalid results', value: String(invalidCount), hint: 'Check boundary units', status: 'fail' });
  }
  chart.innerHTML = `${kpiStripHtml(kpis)}
  <h3 class="study-chart__title">Incident energy by equipment</h3>
  ${barChartHtml(rows, { unit: 'cal/cm²', ariaLabel: 'Incident energy by equipment' })}
  ${statusLegendHtml()}
  <p class="field-hint">PPE categories follow NFPA 70E thresholds: 1.2, 4, 8, 25 and 40 cal/cm². The tick marks 40 cal/cm², above which energized work is generally not permitted. Confirm against your site arc-flash program.</p>`;
}

function renderResults(results, scope = 'project', { stale = false } = {}) {
  const entries = arcFlashResultEntries(results, scope);
  const table = document.getElementById('arcflash-results-table');
  const tbody = table?.querySelector('tbody');
  const summary = document.getElementById('arcflash-summary');
  const details = document.getElementById('arcflash-details');
  const output = document.getElementById('arcflash-output');
  if (!table || !tbody || !summary || !details || !output) return;
  tbody.innerHTML = '';
  entries.forEach(([id, result]) => {
    const row = document.createElement('tr');
    const finite = value => typeof value === 'number' && Number.isFinite(value);
    const plausibility = assessArcFlashResultPlausibility(result);
    const incidentEnergy = finite(result.incidentEnergy) ? `${result.incidentEnergy.toFixed(2)} cal/cm²` : 'Not evaluated';
    const minimumRating = finite(result.minimumArcRatingCalCm2) ? result.minimumArcRatingCalCm2 : null;
    const boundary = !plausibility.plausible
      ? 'Invalid - check boundary units'
      : finite(result.boundary) ? `${result.boundary.toFixed(0)} mm` : 'Not evaluated';
    const clearingTimeText = finite(result.clearingTime) ? `${result.clearingTime.toFixed(3)} s` : 'Not evaluated';
    [
      result.equipmentTag || id,
      incidentEnergy,
      minimumRating == null ? 'Not evaluated' : minimumRating > 0 ? `≥ ${minimumRating.toFixed(2)} cal/cm²` : 'Below 1.2 cal/cm² threshold',
      boundary,
    ].forEach(value => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(cell);
    });
    const clearingCell = document.createElement('td');
    clearingCell.className = 'arcflash-clearing-basis';
    const clearingTime = document.createElement('span');
    clearingTime.textContent = clearingTimeText;
    const clearingBasis = document.createElement('small');
    clearingBasis.textContent = formatArcFlashClearingBasis(result);
    clearingCell.append(clearingTime, clearingBasis);
    row.appendChild(clearingCell);

    const readinessCell = document.createElement('td');
    const readiness = document.createElement('span');
    readiness.className = `arcflash-readiness-pill${isArcFlashLabelEligible(result) ? ' arcflash-readiness-pill--ready' : ''}`;
    readiness.textContent = arcFlashReadinessLabel(result);
    readinessCell.appendChild(readiness);
    if (!plausibility.plausible) {
      const note = document.createElement('div');
      note.className = 'arcflash-readiness-note';
      note.textContent = plausibility.reason;
      readinessCell.appendChild(note);
    }
    if (Array.isArray(result.requiredInputs) && result.requiredInputs.length) {
      const note = document.createElement('div');
      note.className = 'arcflash-readiness-note';
      note.textContent = `${result.requiredInputs.length} required input(s)`;
      readinessCell.appendChild(note);
    }
    row.appendChild(readinessCell);
    tbody.appendChild(row);
  });
  const readiness = summarizeArcFlashResults(results, scope);
  summary.textContent = readiness.summary;
  summary.hidden = false;
  renderArcFlashChart(entries, { stale });
  table.hidden = entries.length === 0;
  details.hidden = false;
  output.textContent = JSON.stringify(Object.fromEntries(entries), null, 2);
}

function renderReadiness(results = null, options = {}) {
  const readiness = summarizeArcFlashResults(results || {});
  const panel = document.getElementById('arcflash-readiness');
  const title = document.getElementById('arcflash-readiness-title');
  const summary = document.getElementById('arcflash-readiness-summary');
  if (!panel || !title || !summary) return readiness;

  const status = options.stale ? 'stale' : readiness.status;
  panel.dataset.status = status;
  title.textContent = options.title || (options.stale ? 'Saved results are stale' : readiness.title);
  summary.textContent = options.summary || (options.stale
    ? 'The active One-Line has changed since these results were calculated. Rerun before relying on the draft report or labels.'
    : readiness.summary);
  const metrics = {
    'arcflash-metric-locations': readiness.total,
    'arcflash-metric-eligible': readiness.labelEligible,
    'arcflash-metric-incomplete': readiness.incomplete,
    'arcflash-metric-range': readiness.outsideModelRange,
  };
  Object.entries(metrics).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  });
  return readiness;
}

function populateScope() {
  const select = document.getElementById('arcflash-scope');
  if (!select) return;
  projectComponents().forEach(component => {
    const option = document.createElement('option');
    option.value = component.id;
    option.textContent = component.label || component.ref || component.id;
    select.appendChild(option);
  });
}

function initializeArcFlashPage() {
    const form = document.getElementById('arcflash-form');
    const scope = document.getElementById('arcflash-scope');
    const status = document.getElementById('arcflash-status');
    const exportButton = document.getElementById('arcflash-export-btn');
    const projectContext = document.getElementById('study-project-context');
    const runButton = form?.querySelector('button[type="submit"]');
    let latestResults = getStudies()?.arcFlash || null;
    let latestStale = false;

    populateScope();
    const componentCount = projectComponents().length;
    const projectName = String(getProjectState()?.name || 'Untitled').trim() || 'Untitled';
    if (projectContext) projectContext.textContent = `Project: ${projectName}. ${componentCount} One-Line component(s) available.`;
    if (runButton) runButton.disabled = componentCount === 0;

    if (!componentCount) {
      renderReadiness(null, {
        title: 'Add equipment to the One-Line to begin',
        summary: 'Arc Flash needs connected project equipment and source/impedance data before it can calculate fault current and incident energy.',
      });
      if (status) status.textContent = 'Study blocked: the active project One-Line has no components to analyze.';
    } else if (latestResults && arcFlashResultEntries(latestResults).length) {
      const assessment = getStudyAssessments().arcFlash;
      const stale = assessment?.freshness !== 'current' || assessment?.eligible !== true;
      latestStale = stale;
      renderResults(latestResults, scope?.value || 'project', { stale });
      renderReadiness(latestResults, { stale });
      if (exportButton) exportButton.disabled = stale;
      if (status) {
        status.textContent = stale
          ? assessment?.freshness === 'stale'
            ? 'Saved results loaded, but the One-Line has changed. Rerun before export.'
            : 'Saved results loaded. Source freshness was not recorded or required inputs remain incomplete; rerun before relying on export.'
          : 'Current saved results loaded. Review required inputs and engineer-review status before export.';
      }
    } else {
      renderReadiness();
    }

    form?.addEventListener('submit', async event => {
      event.preventDefault();
      if (status) status.textContent = 'Running IEEE 1584 analysis...';
      try {
        latestResults = await runArcFlashStudy();
        latestStale = false;
        renderResults(latestResults, scope?.value || 'project');
        const readiness = renderReadiness(latestResults);
        if (exportButton) exportButton.disabled = readiness.total === 0;
        if (status) {
          status.textContent = latestResults.persisted === false
            ? latestResults.persistenceWarning
            : readiness.incomplete
            ? `Study saved. ${readiness.incomplete} location(s) need input confirmation; only eligible label drafts will export.`
            : 'Study saved. Results are calculation-complete; engineer review is still required before field use.';
        }
      } catch (error) {
        if (status) status.textContent = `Study blocked: ${error.message}`;
        const output = document.getElementById('arcflash-output');
        if (output) output.textContent = JSON.stringify({ error: error.message }, null, 2);
      }
    });
    scope?.addEventListener('change', () => {
      if (latestResults) renderResults(latestResults, scope.value, { stale: latestStale });
    });
    exportButton?.addEventListener('click', () => {
      if (!latestResults) return;
      const exportSummary = generateArcFlashReport(latestResults, { assessment: getStudyAssessments().arcFlash, scope: scope?.value || 'project' });
      if (status) {
        status.textContent = exportSummary?.omittedLabelCount
          ? `Draft report exported; ${exportSummary.omittedLabelCount} incomplete label draft(s) were withheld.`
          : 'Draft report and calculation-complete label drafts exported. Engineer review is required before field use.';
      }
    });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeArcFlashPage, { once: true });
  } else {
    initializeArcFlashPage();
  }
}
