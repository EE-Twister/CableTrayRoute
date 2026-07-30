import { runReliability } from './analysis/reliability.js';
import {
  getItem,
  getLoads,
  getOneLine,
  getStudies,
  setItem,
  setStudies,
} from './dataStore.mjs';
import {
  createStudyRunMetadata,
  fingerprintStudySource,
  isStudyResultStale,
} from './analysis/studyResultReadiness.mjs';
import { downloadCSV } from './reports/reporting.mjs';
import { showAlertModal } from './src/components/modal.js';

const INPUT_KEY = 'reliabilityInputs';
const VISUAL_TYPES = new Set(['dimension', 'annotation']);
const CONNECTOR_KEYWORDS = ['link', 'cable', 'feeder', 'conductor', 'tap', 'splice'];

document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();

  const runBtn = document.getElementById('run-btn');
  const exportBtn = document.getElementById('reliability-export-btn');
  const resultsDiv = document.getElementById('results');
  const chartContainer = document.getElementById('chart-container');
  const overrideArea = document.getElementById('component-override-area');
  const readinessDiv = document.getElementById('reliability-readiness');
  const sourceInput = document.getElementById('reliability-source');
  const sourceDateInput = document.getElementById('reliability-source-date');
  const notesInput = document.getElementById('reliability-notes');
  const applySourceBtn = document.getElementById('apply-source-btn');

  const saved = getStudies().reliability;
  const storedInputs = getItem(INPUT_KEY, null);
  let inputState = normalizeInputs(storedInputs || saved?.inputs || {});
  let loadedComponents = [];
  let lastResult = null;
  let lastResultStale = false;

  if (!storedInputs && saved?.inputs) setItem(INPUT_KEY, inputState);
  sourceInput.value = inputState.defaultSource;
  sourceDateInput.value = inputState.defaultSourceDate;
  notesInput.value = inputState.notes;

  function normalizeInputs(value) {
    return {
      overrides: value?.overrides && typeof value.overrides === 'object' ? value.overrides : {},
      defaultSource: String(value?.defaultSource || ''),
      defaultSourceDate: String(value?.defaultSourceDate || ''),
      notes: String(value?.notes || ''),
    };
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function componentValue(component, key) {
    if (component?.[key] != null) return component[key];
    return component?.props?.[key];
  }

  function eligibleComponents(components) {
    return components.filter(component => {
      if (!component || VISUAL_TYPES.has(component.type)) return false;
      const type = `${component.type || ''}`.toLowerCase();
      return !CONNECTOR_KEYWORDS.some(keyword => type.includes(keyword));
    });
  }

  function getDiagramComponents() {
    const oneLine = getOneLine();
    const sheets = Array.isArray(oneLine?.sheets)
      ? oneLine.sheets
      : (Array.isArray(oneLine) ? oneLine : []);
    return sheets.flatMap(sheet => sheet?.components || []);
  }

  function persistInputs() {
    inputState = {
      ...inputState,
      defaultSource: sourceInput.value.trim(),
      defaultSourceDate: sourceDateInput.value,
      notes: notesInput.value.trim(),
    };
    setItem(INPUT_KEY, inputState);
  }

  function currentSourceFingerprint() {
    return fingerprintStudySource({
      oneLine: getOneLine(),
      loads: getLoads(),
      inputs: inputState,
    });
  }

  function setReadiness(kind, title, message, detail = '') {
    readinessDiv.innerHTML = `
      <div class="result-card result-${kind}">
        <strong>${esc(title)}</strong>
        <p>${esc(message)}</p>
        ${detail ? `<p class="field-hint">${esc(detail)}</p>` : ''}
      </div>`;
  }

  function buildOverrideTable(components) {
    const eligible = eligibleComponents(components);
    if (!eligible.length) {
      overrideArea.innerHTML = '<p class="field-hint">No eligible components found for override.</p>';
      return;
    }
    const rows = eligible.map(component => {
      const override = inputState.overrides[component.id] || {};
      const mtbf = override.mtbf ?? componentValue(component, 'mtbf') ?? '';
      const mttr = override.mttr ?? componentValue(component, 'mttr') ?? '';
      const source = override.source
        ?? componentValue(component, 'reliabilitySource')
        ?? componentValue(component, 'reliability_source')
        ?? '';
      const sourceDate = override.sourceDate
        ?? componentValue(component, 'reliabilitySourceDate')
        ?? componentValue(component, 'reliability_source_date')
        ?? '';
      return `
        <tr>
          <td>${esc(component.tag || component.name || component.label || component.id || '—')}</td>
          <td>${esc(component.type || '—')}</td>
          <td><input type="number" class="ov-mtbf" data-id="${esc(component.id)}" min="1" step="1" value="${esc(mtbf)}" aria-label="MTBF hours for ${esc(component.id)}"></td>
          <td><input type="number" class="ov-mttr" data-id="${esc(component.id)}" min="0" step="0.1" value="${esc(mttr)}" aria-label="MTTR hours for ${esc(component.id)}"></td>
          <td><input type="text" class="ov-source" data-id="${esc(component.id)}" value="${esc(source)}" aria-label="Reliability source for ${esc(component.id)}"></td>
          <td><input type="date" class="ov-source-date" data-id="${esc(component.id)}" value="${esc(sourceDate)}" aria-label="Reliability source date for ${esc(component.id)}"></td>
        </tr>`;
    }).join('');
    overrideArea.innerHTML = `
      <div class="table-scroll">
        <table class="result-table" aria-label="Component reliability inputs">
          <thead><tr>
            <th scope="col">Component</th>
            <th scope="col">Type</th>
            <th scope="col">MTBF (hr)</th>
            <th scope="col">MTTR (hr)</th>
            <th scope="col">Source</th>
            <th scope="col">Source Date</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    overrideArea.querySelectorAll('input[data-id]').forEach(input => {
      input.addEventListener('change', () => {
        const id = input.dataset.id;
        const next = { ...(inputState.overrides[id] || {}) };
        if (input.classList.contains('ov-mtbf')) {
          const value = Number(input.value);
          next.mtbf = Number.isFinite(value) && value > 0 ? value : undefined;
        } else if (input.classList.contains('ov-mttr')) {
          const value = Number(input.value);
          next.mttr = Number.isFinite(value) && value >= 0 ? value : undefined;
        } else if (input.classList.contains('ov-source')) {
          next.source = input.value.trim();
        } else if (input.classList.contains('ov-source-date')) {
          next.sourceDate = input.value;
        }
        inputState.overrides[id] = next;
        persistInputs();
      });
    });
  }

  function applyInputsToComponents(components) {
    return components.map(component => {
      const override = inputState.overrides[component.id] || {};
      return {
        ...component,
        mtbf: override.mtbf ?? componentValue(component, 'mtbf'),
        mttr: override.mttr ?? componentValue(component, 'mttr'),
        reliabilitySource: override.source
          || componentValue(component, 'reliabilitySource')
          || componentValue(component, 'reliability_source')
          || inputState.defaultSource,
        reliabilitySourceDate: override.sourceDate
          || componentValue(component, 'reliabilitySourceDate')
          || componentValue(component, 'reliability_source_date')
          || inputState.defaultSourceDate,
      };
    });
  }

  function formatNumber(value, digits = 2) {
    if (value === null || value === undefined || value === '') return '—';
    return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';
  }

  function formatPercent(value, digits = 4) {
    if (value === null || value === undefined || value === '') return '—';
    return `${formatNumber(Number(value) * 100, digits)}%`;
  }

  function renderResults(result) {
    if (!result.ready) {
      const missingRows = (result.missingData || []).map(item => `
        <li><strong>${esc(item.label)}</strong>: ${item.missing.map(esc).join(' and ')}</li>`).join('');
      resultsDiv.innerHTML = missingRows
        ? `<div class="result-card result-warn"><h2>Missing Reliability Inputs</h2><ul>${missingRows}</ul></div>`
        : '';
      chartContainer.hidden = true;
      return;
    }

    const n1Impacts = Array.isArray(result.n1Impacts) ? result.n1Impacts : [];
    const n2Impacts = Array.isArray(result.n2Impacts) ? result.n2Impacts : [];
    const summary = `
      <div class="result-grid">
        <div class="result-card"><span class="result-label">System Availability</span><span class="result-value">${formatPercent(result.systemAvailability)}</span></div>
        <div class="result-card"><span class="result-label">Service Availability</span><span class="result-value">${formatPercent(result.serviceAvailability)}</span></div>
        <div class="result-card"><span class="result-label">Load-Weighted Outage</span><span class="result-value">${formatNumber(result.serviceInterruptionHours, 2)} hr/yr</span></div>
        <div class="result-card"><span class="result-label">EENS</span><span class="result-value">${formatNumber(result.eensKwh, 1)} kWh/yr</span></div>
        <div class="result-card"><span class="result-label">Critical-Load EENS</span><span class="result-value">${formatNumber(result.criticalLoadEensKwh, 1)} kWh/yr</span></div>
        <div class="result-card"><span class="result-label">Interruptions</span><span class="result-value">${formatNumber(result.expectedInterruptionsPerYear, 3)} /yr</span></div>
        <div class="result-card"><span class="result-label">Average Duration</span><span class="result-value">${formatNumber(result.averageInterruptionDurationHours, 2)} hr</span></div>
        <div class="result-card"><span class="result-label">Minimal Cut Sets</span><span class="result-value">N-1 ${n1Impacts.length} · N-2 ${n2Impacts.length}</span></div>
        <div class="result-card"><span class="result-label">Source Coverage</span><span class="result-value">${formatNumber(result.sourceCoveragePct, 0)}%</span></div>
      </div>`;

    const componentRows = Object.entries(result.componentStats).map(([id, stat]) => `
      <tr>
        <td>${esc(id)}</td>
        <td class="num">${formatNumber(stat.mtbf, 0)}</td>
        <td class="num">${formatNumber(stat.mttr, 1)}</td>
        <td class="num">${formatPercent(stat.availability)}</td>
        <td class="num">${formatNumber(stat.downtime, 2)}</td>
        <td>${esc(stat.source || 'unrecorded')}</td>
        <td>${esc(stat.sourceDate || '—')}</td>
      </tr>`).join('');

    const serviceRows = (result.servicePoints || []).map(point => `
      <tr>
        <td>${esc(point.label)}</td>
        <td>${esc(point.nodeId)}</td>
        <td class="num">${formatNumber(point.kw, 1)}</td>
        <td>${point.critical ? 'Critical' : 'Normal'}</td>
        <td class="num">${formatPercent(point.availability)}</td>
        <td class="num">${formatNumber(point.expectedOutageHours, 2)}</td>
        <td class="num">${formatNumber(point.eensKwh, 1)}</td>
      </tr>`).join('');

    const impactRows = [...n1Impacts, ...n2Impacts]
      .sort((a, b) => b.impactedKw - a.impactedKw)
      .map(impact => `
        <tr>
          <td>N-${impact.failed.length}</td>
          <td>${esc(impact.failed.join(' + '))}</td>
          <td>${impact.impacted.map(esc).join(', ')}</td>
          <td class="num">${formatNumber(impact.impactedKw, 1)}</td>
          <td class="num">${formatNumber(impact.probability * 100, 6)}%</td>
        </tr>`).join('');

    const warningHtml = result.warnings?.length
      ? `<div class="result-card result-warn"><h2>Input Governance Warnings</h2><ul>${result.warnings.map(warning => `<li>${esc(warning)}</li>`).join('')}</ul></div>`
      : '';

    resultsDiv.innerHTML = `
      ${summary}
      ${warningHtml}
      <h2>Service Points</h2>
      <div class="table-scroll"><table class="result-table" aria-label="Reliability service points">
        <thead><tr><th>Load</th><th>One-Line Node</th><th>kW</th><th>Priority</th><th>Availability</th><th>Outage hr/yr</th><th>EENS kWh/yr</th></tr></thead>
        <tbody>${serviceRows || '<tr><td colspan="7">No matched Load List service points; One-Line bus fallback used.</td></tr>'}</tbody>
      </table></div>
      <h2>Minimal Cut-Set Impacts</h2>
      <div class="table-scroll"><table class="result-table" aria-label="Reliability cut-set impacts">
        <thead><tr><th>Order</th><th>Failed Components</th><th>Affected Loads</th><th>Interrupted kW</th><th>State Probability</th></tr></thead>
        <tbody>${impactRows || '<tr><td colspan="5">No N-1 or minimal N-2 interruption cut sets identified.</td></tr>'}</tbody>
      </table></div>
      <h2>Component Input Basis</h2>
      <div class="table-scroll"><table class="result-table" aria-label="Component reliability metrics">
        <thead><tr><th>Component</th><th>MTBF (hr)</th><th>MTTR (hr)</th><th>Availability</th><th>Downtime hr/yr</th><th>Source</th><th>Source Date</th></tr></thead>
        <tbody>${componentRows}</tbody>
      </table></div>`;
  }

  function renderChart(result) {
    const data = Object.entries(result.componentStats || {});
    const svg = document.getElementById('reliability-chart');
    [...svg.children].forEach(child => {
      if (child.nodeName.toLowerCase() !== 'title') child.remove();
    });
    if (!data.length) {
      chartContainer.hidden = true;
      return;
    }
    chartContainer.hidden = false;
    const width = Number(svg.getAttribute('width')) || 700;
    const height = Number(svg.getAttribute('height')) || 350;
    const margin = { top: 20, right: 20, bottom: 70, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const barWidth = Math.max(4, innerWidth / data.length - 4);
    const namespace = 'http://www.w3.org/2000/svg';
    const group = document.createElementNS(namespace, 'g');
    group.setAttribute('transform', `translate(${margin.left},${margin.top})`);
    data.forEach(([id, stat], index) => {
      const barHeight = stat.availability * innerHeight;
      const rect = document.createElementNS(namespace, 'rect');
      rect.setAttribute('x', String(index * (barWidth + 4)));
      rect.setAttribute('y', String(innerHeight - barHeight));
      rect.setAttribute('width', String(barWidth));
      rect.setAttribute('height', String(barHeight));
      rect.setAttribute('fill', stat.availability >= 0.999 ? '#4caf50' : '#ff9800');
      rect.setAttribute('aria-label', `${id}: ${(stat.availability * 100).toFixed(4)}%`);
      group.appendChild(rect);
      const label = document.createElementNS(namespace, 'text');
      label.setAttribute('x', String(index * (barWidth + 4) + barWidth / 2));
      label.setAttribute('y', String(innerHeight + 14));
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('transform', `rotate(-45 ${index * (barWidth + 4) + barWidth / 2} ${innerHeight + 14})`);
      label.setAttribute('font-size', '10');
      label.textContent = id;
      group.appendChild(label);
    });
    svg.appendChild(group);
  }

  function resultUsable() {
    return lastResult?.runMetadata?.valid === true && !lastResultStale;
  }

  function updateExportState() {
    exportBtn.disabled = !resultUsable();
  }

  function renderSavedOrRunResult(result, stale = false) {
    lastResult = result;
    lastResultStale = stale;
    renderResults(result);
    renderChart(result);
    if (stale) {
      setReadiness('warn', 'Saved reliability result is stale', 'One-Line, Load List, or governed reliability inputs changed after the saved run.', 'Rerun before export or report use.');
    } else if (result.runMetadata?.valid === true) {
      setReadiness('ok', 'Complete governed result', `${result.analyzedCount} components and ${result.servicePoints?.length || 0} service points were evaluated.`, 'Result saved to this project.');
    } else if (!result.ready) {
      setReadiness('warn', 'Reliability inputs incomplete', `${result.analyzedCount} of ${result.eligibleCount} eligible components have MTBF/MTTR data.`, 'No reliability result was saved.');
    } else {
      setReadiness('warn', 'Source evidence incomplete', `${result.governedCount} of ${result.analyzedCount} component inputs have a source and source date.`, 'Complete the input basis before the result can be saved.');
    }
    updateExportState();
  }

  function runAnalysis() {
    persistInputs();
    loadedComponents = getDiagramComponents();
    if (!loadedComponents.length) {
      showAlertModal('No Components', 'No components found in the One-Line Diagram. Create a one-line diagram first.');
      return;
    }
    buildOverrideTable(loadedComponents);
    const components = applyInputsToComponents(loadedComponents);
    const result = runReliability(components, {
      loads: getLoads(),
      inputSource: inputState.defaultSource,
      inputDate: inputState.defaultSourceDate,
      notes: inputState.notes,
    });
    const governed = result.ready && result.sourceCoveragePct === 100;
    const coverage = {
      valid: governed,
      status: governed ? 'valid' : (result.ready ? 'source-incomplete' : 'input-incomplete'),
      convergedCount: result.analyzedCount,
      totalCount: result.eligibleCount,
      coveragePct: result.coveragePct,
      message: `${result.analyzedCount} of ${result.eligibleCount} components evaluated; ${result.sourceCoveragePct.toFixed(0)}% source coverage.`,
    };
    const completedResult = {
      ...result,
      inputs: inputState,
      generatedAt: new Date().toISOString(),
      runMetadata: createStudyRunMetadata(
        'reliability',
        {
          ready: governed,
          sourceFingerprint: currentSourceFingerprint(),
          counts: {
            components: result.eligibleCount,
            servicePoints: result.servicePoints.length,
            loads: getLoads().length,
          },
        },
        coverage,
        {
          source: 'One-Line + Load List + governed MTBF/MTTR inputs',
          method: result.method,
        },
      ),
    };
    if (governed) {
      setStudies({ ...getStudies(), reliability: completedResult });
    }
    renderSavedOrRunResult(completedResult);
    runBtn.textContent = 'Recheck & Analyse';
  }

  function applyDefaultSource() {
    persistInputs();
    if (!loadedComponents.length) loadedComponents = getDiagramComponents();
    eligibleComponents(loadedComponents).forEach(component => {
      const override = { ...(inputState.overrides[component.id] || {}) };
      if (!override.source) override.source = inputState.defaultSource;
      if (!override.sourceDate) override.sourceDate = inputState.defaultSourceDate;
      inputState.overrides[component.id] = override;
    });
    persistInputs();
    buildOverrideTable(loadedComponents);
  }

  function exportResult() {
    if (!resultUsable()) return;
    const rows = [
      ['summary', 'System availability (%)', (lastResult.systemAvailability * 100).toFixed(6), '', '', ''],
      ['summary', 'Service availability (%)', (lastResult.serviceAvailability * 100).toFixed(6), '', '', ''],
      ['summary', 'EENS (kWh/yr)', lastResult.eensKwh.toFixed(3), '', '', ''],
      ['summary', 'Load-weighted outage (hr/yr)', lastResult.serviceInterruptionHours.toFixed(3), '', '', ''],
      ...lastResult.servicePoints.map(point => [
        'service-point', point.label, point.kw, point.availability, point.expectedOutageHours, point.eensKwh,
      ]),
      ...[...lastResult.n1Impacts, ...lastResult.n2Impacts].map(impact => [
        `N-${impact.failed.length}`, impact.failed.join(' + '), impact.impactedKw, impact.probability, impact.impacted.join('; '), '',
      ]),
    ];
    downloadCSV(
      ['Record Type', 'Name / Failed Components', 'Value / Interrupted kW', 'Availability / Probability', 'Outage / Affected Loads', 'EENS'],
      rows,
      'reliability-analysis.csv',
    );
  }

  [sourceInput, sourceDateInput, notesInput].forEach(input => input.addEventListener('change', persistInputs));
  applySourceBtn.addEventListener('click', applyDefaultSource);
  runBtn.addEventListener('click', runAnalysis);
  exportBtn.addEventListener('click', exportResult);

  loadedComponents = getDiagramComponents();
  if (loadedComponents.length) buildOverrideTable(loadedComponents);
  if (saved?.componentStats) {
    renderSavedOrRunResult(saved, isStudyResultStale(saved, currentSourceFingerprint()));
  } else {
    setReadiness('info', 'Ready to load project data', 'Complete MTBF/MTTR values and source evidence, then run the reliability study.');
  }
});
