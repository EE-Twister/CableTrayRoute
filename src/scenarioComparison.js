import {
  getScenarioSnapshot,
  listScenarios,
} from '../dataStore.mjs';
import {
  compareProjectScenarios,
} from '../analysis/scenarioComparison.mjs';
import { downloadCSV } from '../reports/reporting.mjs';
import { mountPersistentNavigation } from './components/navigation.js';
import '../site.js';

const STUDY_PAGE_LINKS = {
  arcFlash: 'arcFlash.html',
  batterySizing: 'battery.html',
  bessHazard: 'bessHazard.html',
  busDuctSizing: 'busdust.html',
  cableThermalEnvironment: 'cablethermalenv.html',
  capacitorBank: 'capacitorbank.html',
  cathodicProtection: 'cathodicprotection.html',
  contingency: 'contingency.html',
  dcShortCircuit: 'dcshortcircuit.html',
  derInterconnect: 'derinterconnect.html',
  differentialProtection: 'differentialprotection.html',
  dissimilarMetals: 'dissimilarmetals.html',
  frequencyScan: 'frequencyscan.html',
  generatorSizing: 'generatorsizing.html',
  groundGrid: 'groundgrid.html',
  harmonics: 'harmonics.html',
  hazAreaClassification: 'hazareaclassification.html',
  heatTraceSizing: 'heattracesizing.html',
  iec60287: 'iec60287.html',
  iec60909: 'iec60909.html',
  ibr: 'ibr.html',
  insulationCoordination: 'insulationcoordination.html',
  lighting: 'lighting.html',
  lightningProtection: 'lightningprotection.html',
  loadFlow: 'loadFlow.html',
  motorStart: 'motorStart.html',
  optimalPowerFlow: 'optimalpowerflow.html',
  probabilisticLoadFlow: 'probabilisticloadflow.html',
  quasiDynamic: 'quasidynamic.html',
  reliability: 'reliability.html',
  sagTension: 'sagtension.html',
  shortCircuit: 'shortCircuit.html',
  substationLayout: 'substationlayout.html',
  transientStability: 'transientstability.html',
  voltageDropStudy: 'voltagedropstudy.html',
  voltageFlicker: 'voltageflicker.html',
  voltageStability: 'voltagestability.html',
  windLoad: 'windload.html',
};

let lastComparison = null;

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatValue(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—';
    if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
    return Number(value.toFixed(4)).toString();
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value ?? '—');
}

function populateSelects() {
  const selectA = document.getElementById('sc-select-a');
  const selectB = document.getElementById('sc-select-b');
  if (!selectA || !selectB) return;
  const scenarios = listScenarios();
  for (const select of [selectA, selectB]) {
    select.innerHTML = scenarios
      .map(name => `<option value="${esc(name)}">${esc(name)}</option>`)
      .join('');
  }
  if (scenarios.length >= 2) {
    selectA.value = scenarios[0];
    selectB.value = scenarios[1];
  }
}

function renderSummaryBadges(result) {
  const container = document.getElementById('sc-summary-badges');
  if (!container) return;
  const totals = result.totals;
  if (!totals.totalChanges) {
    container.innerHTML = '<span class="sc-badge sc-badge--unchanged">No project differences</span>';
    return;
  }
  container.innerHTML = [
    `<span class="sc-badge sc-badge--added">${totals.added} records added</span>`,
    `<span class="sc-badge sc-badge--removed">${totals.removed} records removed</span>`,
    `<span class="sc-badge sc-badge--changed">${totals.changed} records changed</span>`,
    `<span class="sc-badge sc-badge--changed">${totals.changedStudies} study results changed</span>`,
  ].join('');
}

function renderDomainSummary(result) {
  const container = document.getElementById('sc-domain-summary-content');
  if (!container) return;
  const rows = result.domains.map(domain => `
    <tr${domain.counts.totalChanges ? ' class="cmp-changed"' : ''}>
      <td>${esc(domain.label)}</td>
      <td class="num">${domain.counts.before}</td>
      <td class="num">${domain.counts.after}</td>
      <td class="num">${domain.counts.added}</td>
      <td class="num">${domain.counts.removed}</td>
      <td class="num">${domain.counts.changed}</td>
    </tr>`).join('');

  container.innerHTML = `
    <div class="sc-diff-scroll">
      <table class="sc-diff-table" aria-label="Project domain comparison">
        <thead><tr>
          <th scope="col">Project Domain</th>
          <th scope="col" class="num">${esc(result.beforeScenario)}</th>
          <th scope="col" class="num">${esc(result.afterScenario)}</th>
          <th scope="col" class="num">Added</th>
          <th scope="col" class="num">Removed</th>
          <th scope="col" class="num">Changed</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderDomainChanges(result) {
  const container = document.getElementById('sc-domain-diff-content');
  if (!container) return;
  const rows = result.domains.flatMap(domain => (
    domain.changes.map(change => `
      <tr class="cmp-${change.status}">
        <td>${esc(change.status.toUpperCase())}</td>
        <td>${esc(domain.label)}</td>
        <td>${esc(change.label)}</td>
        <td>${change.fields.length ? esc(change.fields.join(', ')) : '—'}</td>
      </tr>`)
  ));

  container.innerHTML = rows.length
    ? `<div class="sc-diff-scroll">
        <table class="sc-diff-table" aria-label="Changed project records">
          <thead><tr>
            <th scope="col">Status</th>
            <th scope="col">Domain</th>
            <th scope="col">Record</th>
            <th scope="col">Changed Fields</th>
          </tr></thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>`
    : '<p class="sc-empty-note">No schedule, model, or arrangement records differ.</p>';
}

function studyState(study, side) {
  const summary = study[side];
  const approval = study[`${side}Approval`];
  if (!summary.present) return 'Not run';
  const validity = summary.valid === true
    ? 'valid'
    : (summary.valid === false ? 'invalid / incomplete' : 'legacy / unverified');
  const approvalText = approval?.status
    || approval?.decision
    || (approval?.approved === true ? 'approved' : 'not approved');
  return `${validity}; ${approvalText}`;
}

function metricText(summary) {
  if (!summary?.metrics?.length) return '—';
  return summary.metrics
    .slice(0, 4)
    .map(metric => `${metric.key}: ${formatValue(metric.value)}`)
    .join(' · ');
}

function renderStudies(result) {
  const container = document.getElementById('sc-study-diff-content');
  if (!container) return;
  const rows = result.studies.map(study => {
    const href = STUDY_PAGE_LINKS[study.key];
    const name = href
      ? `<a href="${href}">${esc(study.label)}</a>`
      : esc(study.label);
    return `
      <tr class="${study.status === 'unchanged' ? '' : `cmp-${study.status}`}">
        <td>${name}</td>
        <td>${esc(study.status)}</td>
        <td>${esc(studyState(study, 'before'))}</td>
        <td>${esc(metricText(study.before))}</td>
        <td>${esc(studyState(study, 'after'))}</td>
        <td>${esc(metricText(study.after))}</td>
      </tr>`;
  }).join('');

  container.innerHTML = rows
    ? `<div class="sc-diff-scroll">
        <table class="sc-diff-table" aria-label="Electrical study result comparison">
          <thead><tr>
            <th scope="col">Study</th>
            <th scope="col">Result Delta</th>
            <th scope="col">${esc(result.beforeScenario)} State</th>
            <th scope="col">${esc(result.beforeScenario)} Metrics</th>
            <th scope="col">${esc(result.afterScenario)} State</th>
            <th scope="col">${esc(result.afterScenario)} Metrics</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
    : '<p class="sc-empty-note">Neither scenario contains saved study results.</p>';
}

function renderImpact(result) {
  const container = document.getElementById('sc-impact-content');
  if (!container) return;
  const rows = result.impact.map(impact => {
    const href = STUDY_PAGE_LINKS[impact.key];
    const name = href
      ? `<a href="${href}">${esc(impact.label)}</a>`
      : esc(impact.label);
    const action = impact.action === 'rerun' ? 'Rerun recommended' : 'Consider running';
    return `
      <tr class="sc-impact--${esc(impact.priority)}">
        <td>${name}</td>
        <td><span class="sc-impact-priority">${esc(impact.priority.toUpperCase())}</span></td>
        <td>${esc(action)}</td>
        <td>${esc(impact.targetState)}</td>
        <td>${esc(impact.domains.join(', '))}</td>
      </tr>`;
  }).join('');
  container.innerHTML = rows
    ? `<div class="sc-diff-scroll">
        <table class="sc-diff-table" aria-label="Study-impact rerun checklist">
          <thead><tr>
            <th scope="col">Study</th>
            <th scope="col">Priority</th>
            <th scope="col">Suggested action</th>
            <th scope="col">Comparison-scenario state</th>
            <th scope="col">Changed model domains</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
    : '<p class="sc-empty-note">No model changes mapped to study rerun recommendations.</p>';
}

function runComparison() {
  const scenarioA = document.getElementById('sc-select-a')?.value;
  const scenarioB = document.getElementById('sc-select-b')?.value;
  const status = document.getElementById('sc-status');
  if (!scenarioA || !scenarioB) return;
  if (scenarioA === scenarioB) {
    if (status) status.textContent = 'Choose two different scenarios.';
    return;
  }
  lastComparison = compareProjectScenarios(
    getScenarioSnapshot(scenarioA),
    getScenarioSnapshot(scenarioB),
  );
  renderSummaryBadges(lastComparison);
  renderDomainSummary(lastComparison);
  renderDomainChanges(lastComparison);
  renderStudies(lastComparison);
  renderImpact(lastComparison);
  const results = document.getElementById('sc-results');
  if (results) results.hidden = false;
  const exportBtn = document.getElementById('sc-export-btn');
  if (exportBtn) exportBtn.disabled = false;
  if (status) {
    status.textContent = `${lastComparison.totals.totalChanges} material difference(s) found across project records and studies.`;
  }
}

function exportComparison() {
  if (!lastComparison) return;
  const rows = [];
  lastComparison.domains.forEach(domain => {
    domain.changes.forEach(change => {
      rows.push([
        'project-record',
        domain.label,
        change.status,
        change.label,
        change.fields.join('; '),
        lastComparison.beforeScenario,
        lastComparison.afterScenario,
      ]);
    });
  });
  lastComparison.studies
    .filter(study => study.status !== 'unchanged')
    .forEach(study => {
      rows.push([
        'study-result',
        study.label,
        study.status,
        '',
        `${studyState(study, 'before')} -> ${studyState(study, 'after')}`,
        lastComparison.beforeScenario,
        lastComparison.afterScenario,
      ]);
    });
  lastComparison.impact.forEach(impact => {
    rows.push([
      'study-impact',
      impact.label,
      impact.action,
      impact.priority,
      `${impact.targetState}; changed domains: ${impact.domains.join('; ')}`,
      lastComparison.beforeScenario,
      lastComparison.afterScenario,
    ]);
  });
  downloadCSV(
    ['Type', 'Domain / Study', 'Status', 'Record', 'Details', 'Scenario A', 'Scenario B'],
    rows,
    `scenario-comparison-${lastComparison.beforeScenario}-vs-${lastComparison.afterScenario}.csv`,
  );
}

window.addEventListener('DOMContentLoaded', () => {
  mountPersistentNavigation();
  populateSelects();
  document.getElementById('sc-compare-btn')?.addEventListener('click', runComparison);
  document.getElementById('sc-export-btn')?.addEventListener('click', exportComparison);
  if (listScenarios().length >= 2) runComparison();
});
