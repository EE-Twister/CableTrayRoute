import { runShortCircuit } from '../analysis/shortCircuit.mjs';
import { getOneLine, getCables, getStudies, setStudies, getProjectInputFingerprint } from '../dataStore.mjs';
import { getProjectState } from '../projectStorage.js';
import { downloadPDF } from '../reports/reporting.mjs';

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
    if (!result || typeof result !== 'object' || !Number.isFinite(Number(result.threePhaseKA))) return false;
    return scope === 'project' || id === scope;
  });
}

function summaryResult(results = {}) {
  if (!results || typeof results !== 'object' || Array.isArray(results)) return null;
  const availableFaultKa = Number(results.availableFaultKa ?? results.availableFaultKA ?? results.faultCurrentKA ?? results.faultKa);
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
  return {
    updatedAt: resultTimestamp(results),
    method: entries[0]?.[1]?.method || results?._meta?.method || null,
    locations: entries.length,
    availableFaultKa: summary?.availableFaultKa ?? (entries.length ? Math.max(...entries.map(([, result]) => Number(result.threePhaseKA) || 0)) : null),
    inputFingerprint: results?._meta?.inputFingerprint || null,
    buses: entries.map(([id, result]) => ({
      id,
      equipmentTag: result.equipmentTag || id,
      threePhaseKA: Number(result.threePhaseKA) || 0,
      lineToGroundKA: Number(result.lineToGroundKA) || 0,
      lineToLineKA: Number(result.lineToLineKA) || 0
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
      const currentKa = current ? Number(current.threePhaseKA) : null;
      const previousKa = prior ? Number(prior.threePhaseKA) : null;
      return {
        tag,
        currentKa: Number.isFinite(currentKa) ? currentKa : null,
        previousKa: Number.isFinite(previousKa) ? previousKa : null,
        deltaKa: Number.isFinite(currentKa) && Number.isFinite(previousKa) ? currentKa - previousKa : null
      };
    })
  };
}

function inputQuality(result = {}) {
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const required = Array.isArray(result.requiredInputs) ? result.requiredInputs : [];
  return required.length ? `${required.length} required input(s)` : warnings.length ? `${warnings.length} assumption(s)` : 'Complete';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function runShortCircuitStudy(opts = {}) {
  const model = buildModel();
  if (!model.buses.length) throw new Error('The active project One-Line has no components to analyze.');
  const results = runShortCircuit(model, opts);
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
  studies.shortCircuit = results;
  setStudies(studies);
  return results;
}

export function exportShortCircuitReport(results = {}) {
  const entries = resultEntries(results);
  const summary = summaryResult(results);
  if (!entries.length && !summary) return false;
  if (!entries.length) {
    downloadPDF('Short Circuit Saved Result', ['status', 'availableFaultKa', 'updatedAt'], [{
      status: summary.status,
      availableFaultKa: summary.availableFaultKa,
      updatedAt: summary.updatedAt || ''
    }], 'shortcircuit.pdf');
    return true;
  }
  const isIEC = entries.some(([, result]) => result.method === 'IEC');
  const headers = isIEC
    ? ['bus', 'prefaultKV', 'threePhaseKA', 'lineToGroundKA', 'lineToLineKA', 'ip', 'Ib', 'Ith', 'kappa', 'inputQuality']
    : ['bus', 'threePhaseKA', 'lineToGroundKA', 'lineToLineKA', 'doubleLineGroundKA', 'inputQuality'];
  const rows = entries.map(([bus, result]) => ({
    bus: result.equipmentTag || bus,
    ...result,
    inputQuality: inputQuality(result)
  }));
  downloadPDF(isIEC ? 'IEC 60909 Short-Circuit Report' : 'Short Circuit Report', headers, rows, 'shortcircuit.pdf');
  return true;
}

function renderResults(results, scope = 'project') {
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
      Number(result.threePhaseKA).toFixed(2),
      Number(result.lineToGroundKA || 0).toFixed(2),
      Number(result.lineToLineKA || 0).toFixed(2),
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
      `  Method: ${result.method || 'ANSI'} · 3-phase=${Number(result.threePhaseKA || 0).toFixed(2)} kA · line-ground=${Number(result.lineToGroundKA || 0).toFixed(2)} kA · line-line=${Number(result.lineToLineKA || 0).toFixed(2)} kA`,
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
    if (reviewableResults(latestResults)) {
      renderResults(latestResults, scope?.value || 'project');
      if (exportButton) exportButton.disabled = false;
      const timestamp = resultTimestamp(latestResults);
      const freshness = getShortCircuitFreshness(latestResults, getProjectInputFingerprint());
      if (status) status.textContent = `Saved study result loaded${timestamp ? ` from ${new Date(timestamp).toLocaleString()}` : ''}. ${freshness.label}.`;
      const savedMethod = resultEntries(latestResults)[0]?.[1]?.method || latestResults?._meta?.method;
      if (savedMethod && form?.method) form.method.value = savedMethod;
    }

    form?.addEventListener('submit', event => {
      event.preventDefault();
      try {
        latestResults = runShortCircuitStudy({ method: form.method.value });
        renderResults(latestResults, scope?.value || 'project');
        if (exportButton) exportButton.disabled = !reviewableResults(latestResults);
        if (status) status.textContent = 'Study complete and saved to the active project. Results now match the current project inputs.';
      } catch (error) {
        if (status) status.textContent = `Study blocked: ${error.message}`;
        const output = document.getElementById('shortcircuit-output');
        if (output) output.textContent = JSON.stringify({ error: error.message }, null, 2);
      }
    });
    scope?.addEventListener('change', () => {
      if (latestResults) renderResults(latestResults, scope.value);
    });
    exportButton?.addEventListener('click', () => {
      if (latestResults && exportShortCircuitReport(latestResults) && status) status.textContent = 'Short-circuit report exported.';
    });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeShortCircuitPage, { once: true });
  } else {
    initializeShortCircuitPage();
  }
}
