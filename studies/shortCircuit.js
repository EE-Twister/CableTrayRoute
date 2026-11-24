import { runShortCircuit } from '../analysis/shortCircuit.mjs';
import { getOneLine, getCables, getStudies, getStudyAssessments, captureStudyRunContext, assertStudyRunContextCurrent, saveStudyResult, getProjectInputFingerprint } from '../dataStore.mjs';
import { getProjectState } from '../projectStorage.js';
import { downloadPDF } from '../reports/reporting.mjs';
import { barChartHtml, kpiStripHtml, shortCircuitBarRows, statusLegendHtml } from '../src/components/resultViz.mjs';
import { loadReferencedProtectiveDevices } from '../src/protectiveDevices/calculationCatalog.mjs';
import { studyExportMetadata } from '../analysis/studyExportMetadata.mjs';
import { isStudyResultCurrent } from '../analysis/studyResultContext.mjs';
import { buildShortCircuitExportTable, shortCircuitInputQuality as inputQuality } from './shortCircuitExportTable.mjs';

function projectComponents() {
  const sheets = getOneLine()?.sheets;
  return Array.isArray(sheets) ? sheets.flatMap(sheet => Array.isArray(sheet?.components) ? sheet.components : []) : [];
}

function buildModel() {
  return { buses: projectComponents(), cables: getCables() };
}

function resultEntries(results = {}, scope = 'project') {
  if (!results || typeof results !== 'object' || Array.isArray(results)) return [];
  return Object.entries(results).filter(([id, result]) => {
    if (!result || typeof result !== 'object' || !Object.prototype.hasOwnProperty.call(result, 'threePhaseKA')) return false;
    return scope === 'project' || id === scope;
  });
}

function summaryResult(results = {}) {
  if (!results || typeof results !== 'object' || Array.isArray(results)) return null;
  const availableRaw = results.availableFaultKa ?? results.availableFaultKA ?? results.faultCurrentKA ?? results.faultKa;
  const availableFaultKa = availableRaw === null || availableRaw === undefined || availableRaw === '' ? NaN : Number(availableRaw);
  const status = String(results.status || '').trim();
  const updatedAt = results.updatedAt || results.generatedAt || results._meta?.updatedAt || null;
  if (!Number.isFinite(availableFaultKa) && !status && !updatedAt) return null;
  return {
    status: status || 'Saved',
    availableFaultKa: Number.isFinite(availableFaultKa) ? availableFaultKa : null,
    updatedAt
  };
}

function resultTimestamp(results = {}) {
  return results?.updatedAt || results?.generatedAt || results?._meta?.updatedAt || null;
}

function reviewableResults(results = {}) {
  return resultEntries(results).length > 0 || Boolean(summaryResult(results));
}

function resultHistory(results = {}) {
  return Array.isArray(results?._meta?.history) ? results._meta.history : [];
}

function summarizeForHistory(results = {}) {
  const entries = resultEntries(results);
  const summary = summaryResult(results);
  if (!entries.length && !summary) return null;
  const evaluatedThreePhase = entries
    .map(([, result]) => result.threePhaseKA === null || result.threePhaseKA === undefined || result.threePhaseKA === ''
      ? NaN
      : Number(result.threePhaseKA))
    .filter(value => Number.isFinite(value));
  return {
    updatedAt: resultTimestamp(results),
    method: entries[0]?.[1]?.method || results?._meta?.method || null,
    locations: entries.length,
    availableFaultKa: summary?.availableFaultKa ?? (evaluatedThreePhase.length ? Math.max(...evaluatedThreePhase) : null),
    inputFingerprint: results?._meta?.inputFingerprint || null,
    buses: entries.map(([id, result]) => ({
      id,
      equipmentTag: result.equipmentTag || id,
      threePhaseKA: finiteNullableNumber(result.threePhaseKA),
      lineToGroundKA: finiteNullableNumber(result.lineToGroundKA),
      lineToLineKA: finiteNullableNumber(result.lineToLineKA)
    }))
  };
}

export function getShortCircuitFreshness(results = {}, currentFingerprint = '') {
  const savedFingerprint = String(results?._meta?.inputFingerprint || '').trim();
  const activeFingerprint = String(currentFingerprint || '').trim();
  if (!savedFingerprint || !activeFingerprint) {
    return {
      status: 'unknown',
      stale: false,
      savedFingerprint,
      currentFingerprint: activeFingerprint,
      label: 'Input freshness is unknown'
    };
  }
  const stale = savedFingerprint !== activeFingerprint;
  return {
    status: stale ? 'stale' : 'current',
    stale,
    savedFingerprint,
    currentFingerprint: activeFingerprint,
    label: stale ? 'Results are stale' : 'Results match current inputs'
  };
}

export function buildShortCircuitComparison(results = {}) {
  const previous = resultHistory(results)[0] || null;
  const currentEntries = resultEntries(results);
  const previousBuses = Array.isArray(previous?.buses) ? previous.buses : [];
  const currentByTag = new Map(currentEntries.map(([id, result]) => [String(result.equipmentTag || id), result]));
  const previousByTag = new Map(previousBuses.map(result => [String(result.equipmentTag || result.id), result]));
  const tags = [...new Set([...currentByTag.keys(), ...previousByTag.keys()])];
  return {
    previous,
    rows: tags.map(tag => {
      const current = currentByTag.get(tag);
      const prior = previousByTag.get(tag);
      const currentKa = current ? finiteNullableNumber(current.threePhaseKA) : null;
      const previousKa = prior ? finiteNullableNumber(prior.threePhaseKA) : null;
      return {
        tag,
        currentKa: Number.isFinite(currentKa) ? currentKa : null,
        previousKa: Number.isFinite(previousKa) ? previousKa : null,
        deltaKa: Number.isFinite(currentKa) && Number.isFinite(previousKa) ? currentKa - previousKa : null
      };
    })
  };
}

export function formatKA(value) {
  const number = finiteNullableNumber(value);
  return Number.isFinite(number) ? number.toFixed(2) : 'Unevaluated';
}

function finiteNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function runShortCircuitStudy(opts = {}) {
  const model = buildModel();
  if (!model.buses.length) throw new Error('The active project One-Line has no components to analyze.');
  const runContext = captureStudyRunContext('shortCircuit', {
    inputs: opts,
    options: opts,
    assumptions: ['The selected short-circuit method and protective-device catalog are evaluated against the active One-Line model.'],
  });
  const deviceCatalog = await loadReferencedProtectiveDevices(model);
  assertStudyRunContextCurrent(runContext);
  const results = runShortCircuit(model, { ...opts, deviceCatalog });
  const studies = getStudies();
  const previous = summarizeForHistory(studies.shortCircuit);
  const existingHistory = resultHistory(studies.shortCircuit);
  results._meta = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    method: opts.method || 'ANSI',
    inputFingerprint: getProjectInputFingerprint(),
    modelCounts: { components: model.buses.length, cables: model.cables.length },
    history: [previous, ...existingHistory].filter(Boolean).slice(0, 5)
  };
  saveStudyResult('shortCircuit', results, runContext);
  return results;
}

/**
 * Export the saved short-circuit study as a PDF. Resolves true only after the
 * PDF was generated and handed to the browser, false otherwise.
 */
export async function exportShortCircuitReport(results = {}) {
  const lifecycle = studyExportMetadata(results, { assessment: getStudyAssessments().shortCircuit });
  const entries = resultEntries(results);
  const summary = summaryResult(results);
  if (!entries.length && !summary) return false;
  if (!entries.length) {
    return downloadPDF('Short Circuit Saved Result', ['status', 'availableFaultKa', 'updatedAt', 'freshness', 'eligibility', 'calculationVersion', 'calculatedAt', 'provenance'], [{
      status: summary.status,
      availableFaultKa: summary.availableFaultKa,
      updatedAt: summary.updatedAt || '',
      freshness: lifecycle.freshness,
      eligibility: lifecycle.resultEligibility,
      calculationVersion: lifecycle.calculationVersion,
      calculatedAt: lifecycle.calculatedAt,
      provenance: lifecycle.provenance,
    }], 'shortcircuit.pdf');
  }
  const { title, headers, rows } = buildShortCircuitExportTable(entries, lifecycle);
  return downloadPDF(title, headers, rows, 'shortcircuit.pdf');
}

// A bar only carries a pass/review/fail verdict when its result is current and
// its inputs are complete; otherwise it shows why not.
function shortCircuitChartReadiness(result, { stale = false } = {}) {
  if (stale) return { ready: false, badge: 'Stale', reason: 'Saved result is not current; rerun before relying on it' };
  if (result?.calculationStatus === 'incomplete' || (Array.isArray(result?.requiredInputs) && result.requiredInputs.length)) {
    return { ready: false, badge: 'Incomplete', reason: 'Required inputs are missing for this location' };
  }
  return { ready: true };
}

function renderShortCircuitChart(entries, assumedCount, { stale = false } = {}) {
  const chart = document.getElementById('shortcircuit-chart');
  if (!chart) return;
  const ratings = {};
  projectComponents().forEach(component => {
    const rating = Number(component?.props?.interruptRatingKA);
    if (component?.id && Number.isFinite(rating) && rating > 0) ratings[component.id] = rating;
  });
  const rows = shortCircuitBarRows(entries, ratings, { readiness: (id, result) => shortCircuitChartReadiness(result, { stale }) });
  if (!rows.length) {
    chart.innerHTML = '';
    return;
  }
  const highest = rows.reduce((best, row) => (row.value > best.value ? row : best), rows[0]);
  const verdictRows = rows.filter(row => !row.notReady);
  const notReadyCount = rows.length - verdictRows.length;
  const overRated = verdictRows.filter(row => row.limit && row.value > row.limit).length;
  const rated = verdictRows.filter(row => row.limit).length;
  chart.innerHTML = `${kpiStripHtml([
    { label: 'Highest 3-phase fault', value: `${highest.value.toFixed(1)} kA`, hint: highest.label, status: highest.notReady ? 'info' : highest.status },
    { label: 'Locations calculated', value: String(rows.length), status: 'info' },
    { label: 'Need input review', value: String(assumedCount), status: assumedCount ? 'warn' : 'pass' },
    ...(notReadyCount ? [{ label: 'Not evaluated', value: String(notReadyCount), status: 'info', hint: stale ? 'Result is stale' : 'Required inputs missing' }] : []),
    ...(rated ? [{ label: 'Over entered rating', value: String(overRated), status: overRated ? 'fail' : 'pass', hint: `${rated} of ${rows.length} have a rating` }] : [])
  ])}
  <h3 class="study-chart__title">3-phase fault current by location</h3>
  ${barChartHtml(rows, { unit: 'kA', ariaLabel: '3-phase fault current by location' })}
  ${rated || notReadyCount ? statusLegendHtml(notReadyCount ? ['pass', 'warn', 'fail', 'na'] : undefined) : ''}
  <p class="field-hint">Bars are colored by magnitude (under 22 kA, 22–65 kA, 65 kA and above); a tick marks the interrupting rating entered on the One-Line, where there is one. Without a rating, high values are not failures: they set the equipment rating you need. Each note shows the smallest standard interrupting rating that covers the fault current.</p>`;
}

function renderResults(results, scope = 'project', { stale = false } = {}) {
  const entries = resultEntries(results, scope);
  const savedSummary = summaryResult(results);
  const table = document.getElementById('shortcircuit-results-table');
  const tbody = table?.querySelector('tbody');
  const summary = document.getElementById('shortcircuit-summary');
  const details = document.getElementById('shortcircuit-details');
  const output = document.getElementById('shortcircuit-output');
  const freshnessEl = document.getElementById('shortcircuit-freshness');
  const historyDetails = document.getElementById('shortcircuit-history');
  const historySummary = document.getElementById('shortcircuit-history-summary');
  const historyBody = document.getElementById('shortcircuit-history-tbody');
  if (!table || !tbody || !summary || !details || !output) return;

  tbody.innerHTML = '';
  entries.forEach(([id, result]) => {
    const row = document.createElement('tr');
    [
      result.equipmentTag || id,
      result.method || 'ANSI',
      formatKA(result.threePhaseKA),
      formatKA(result.lineToGroundKA),
      formatKA(result.lineToLineKA),
      inputQuality(result)
    ].forEach(value => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  });
  const assumedCount = entries.filter(([, result]) => inputQuality(result) !== 'Complete').length;
  const updatedAt = resultTimestamp(results);
  const updatedLabel = updatedAt ? new Date(updatedAt).toLocaleString() : 'date not recorded';
  const history = resultHistory(results);
  const freshness = getShortCircuitFreshness(results, getProjectInputFingerprint());
  summary.textContent = entries.length
    ? `${entries.length} location(s) calculated; ${assumedCount} location(s) use assumptions or need additional input. Saved ${updatedLabel}.${history.length ? ` ${history.length} previous run(s) retained.` : ''}`
    : `Saved study summary: ${savedSummary?.availableFaultKa != null ? `${savedSummary.availableFaultKa.toFixed(2)} kA available fault current` : savedSummary?.status || 'result available'}; updated ${updatedLabel}. Rerun the study to create bus-by-bus comparison results.`;
  summary.hidden = false;
  if (freshnessEl) {
    freshnessEl.hidden = false;
    freshnessEl.className = `study-freshness study-freshness--${freshness.status}`;
    freshnessEl.innerHTML = freshness.stale
      ? `<strong>${freshness.label}</strong><span>The active project model changed after this run. Rerun the study before relying on these values.</span>`
      : `<strong>${freshness.label}</strong><span>${freshness.status === 'current' ? 'The saved input fingerprint matches the active project model.' : 'This saved result predates input fingerprint tracking; rerun it to establish a baseline.'}</span>`;
  }
  const comparison = buildShortCircuitComparison(results);
  if (historyDetails && historySummary && historyBody) {
    historyDetails.hidden = !comparison.previous;
    historySummary.textContent = comparison.previous
      ? `Previous run: ${comparison.previous.updatedAt ? new Date(comparison.previous.updatedAt).toLocaleString() : 'date not recorded'}${comparison.previous.method ? ` · ${comparison.previous.method}` : ''}`
      : '';
    historyBody.innerHTML = comparison.rows.length
      ? comparison.rows.map(row => `<tr>
          <td>${escapeHtml(row.tag)}</td>
          <td>${row.previousKa == null ? 'Not recorded' : row.previousKa.toFixed(2)}</td>
          <td>${row.currentKa == null ? 'Removed' : row.currentKa.toFixed(2)}</td>
          <td class="${row.deltaKa == null ? '' : row.deltaKa > 0 ? 'study-delta-up' : row.deltaKa < 0 ? 'study-delta-down' : ''}">${row.deltaKa == null ? '—' : `${row.deltaKa > 0 ? '+' : ''}${row.deltaKa.toFixed(2)}`}</td>
        </tr>`).join('')
      : '<tr><td colspan="4">The previous run contains a summary only. Run the study again to begin bus-by-bus comparisons.</td></tr>';
  }
  renderShortCircuitChart(entries, assumedCount, { stale });
  table.hidden = entries.length === 0;
  details.hidden = entries.length === 0;
  if (!entries.length) {
    output.textContent = '';
    return;
  }
  output.textContent = entries.map(([id, result]) => {
    const provenance = result.impedanceProvenance || {};
    const segments = Array.isArray(provenance.segments) ? provenance.segments : [];
    const lines = [
      `${result.equipmentTag || id}`,
      `  Method: ${result.method || 'ANSI'} · Status=${result.calculationStatus || 'unknown'} · 3-phase=${formatKA(result.threePhaseKA)} kA · line-ground=${formatKA(result.lineToGroundKA)} kA · line-line=${formatKA(result.lineToLineKA)} kA`,
      `  Total positive-sequence impedance: R=${Number(provenance.totalR || 0).toFixed(6)} Ω, X=${Number(provenance.totalX || 0).toFixed(6)} Ω`
    ];
    segments.forEach((segment, index) => {
      const source = segment.source ? ` · ${segment.source}` : '';
      const details = [
        segment.conductorSize,
        segment.conductorMaterial,
        segment.lengthFt ? `${segment.lengthFt} ft` : '',
        segment.parallelCount > 1 ? `${segment.parallelCount} parallel` : ''
      ].filter(Boolean).join(' · ');
      lines.push(
        `  ${index + 1}. ${segment.type}: ${segment.tag || 'Unnamed'}${source}`,
        `     R=${Number(segment.rOhm || 0).toFixed(6)} Ω, X=${Number(segment.xOhm || 0).toFixed(6)} Ω${details ? ` · ${details}` : ''}`
      );
    });
    (result.requiredInputs || []).forEach(message => lines.push(`  Required: ${message}`));
    (result.warnings || []).forEach(message => lines.push(`  Assumption: ${message}`));
    return lines.join('\n');
  }).join('\n\n');
}

function populateScope() {
  const select = document.getElementById('shortcircuit-scope');
  if (!select) return;
  projectComponents().forEach(component => {
    const option = document.createElement('option');
    option.value = component.id;
    option.textContent = component.label || component.ref || component.id;
    select.appendChild(option);
  });
}

function initializeShortCircuitPage() {
    const form = document.getElementById('shortcircuit-form');
    const scope = document.getElementById('shortcircuit-scope');
    const status = document.getElementById('shortcircuit-status');
    const exportButton = document.getElementById('shortcircuit-export-btn');
    const projectContext = document.getElementById('study-project-context');
    let latestResults = getStudies()?.shortCircuit || null;

    populateScope();
    const componentCount = projectComponents().length;
    const projectName = String(getProjectState()?.name || 'Untitled').trim() || 'Untitled';
    if (projectContext) projectContext.textContent = `Project: ${projectName}. ${componentCount} One-Line component(s) available.`;
    let latestStale = false;
    if (reviewableResults(latestResults)) {
      const assessment = getStudyAssessments().shortCircuit;
      latestStale = !isStudyResultCurrent(assessment);
      renderResults(latestResults, scope?.value || 'project', { stale: latestStale });
      if (exportButton) exportButton.disabled = false;
      const timestamp = resultTimestamp(latestResults);
      const freshness = getShortCircuitFreshness(latestResults, getProjectInputFingerprint());
      if (status) status.textContent = `Saved study result loaded${timestamp ? ` from ${new Date(timestamp).toLocaleString()}` : ''}. ${freshness.label}.`;
      const savedMethod = resultEntries(latestResults)[0]?.[1]?.method || latestResults?._meta?.method;
      if (savedMethod && form?.method) form.method.value = savedMethod;
    }

    form?.addEventListener('submit', async event => {
      event.preventDefault();
      if (status) status.textContent = 'Loading referenced protection data...';
      if (form) form.setAttribute('aria-busy', 'true');
      try {
        latestResults = await runShortCircuitStudy({ method: form.method.value });
        latestStale = false;
        renderResults(latestResults, scope?.value || 'project');
        if (exportButton) exportButton.disabled = !reviewableResults(latestResults);
        if (status) status.textContent = 'Study complete and saved to the active project. Results now match the current project inputs.';
      } catch (error) {
        if (status) status.textContent = `Study blocked: ${error.message}`;
        const output = document.getElementById('shortcircuit-output');
        if (output) output.textContent = JSON.stringify({ error: error.message }, null, 2);
      } finally {
        if (form) form.removeAttribute('aria-busy');
      }
    });
    scope?.addEventListener('change', () => {
      if (latestResults) renderResults(latestResults, scope.value, { stale: latestStale });
    });
    exportButton?.addEventListener('click', async () => {
      if (!latestResults) return;
      const exported = await exportShortCircuitReport(latestResults);
      if (status) status.textContent = exported ? 'Short-circuit report exported.' : 'Short-circuit report could not be exported.';
    });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeShortCircuitPage, { once: true });
  } else {
    initializeShortCircuitPage();
  }
}
