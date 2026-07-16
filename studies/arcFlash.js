import { runArcFlash } from '../analysis/arcFlash.mjs';
import { getOneLine, getStudies, setStudies } from '../dataStore.mjs';
import { getProjectState } from '../projectStorage.js';
import { generateArcFlashReport } from '../reports/arcFlashReport.mjs';

function projectComponents() {
  const sheets = getOneLine()?.sheets;
  return Array.isArray(sheets) ? sheets.flatMap(sheet => Array.isArray(sheet?.components) ? sheet.components : []) : [];
}

function resultEntries(results = {}, scope = 'project') {
  return Object.entries(results).filter(([id, result]) => {
    if (!result || typeof result !== 'object' || !Number.isFinite(Number(result.incidentEnergy))) return false;
    return scope === 'project' || id === scope;
  });
}

function inputQuality(result = {}) {
  const required = Array.isArray(result.requiredInputs) ? result.requiredInputs : [];
  const notes = Array.isArray(result.notes) ? result.notes : [];
  return required.length ? `${required.length} required input(s)` : notes.length ? `${notes.length} note(s)` : 'Complete';
}

export async function runArcFlashStudy() {
  if (!projectComponents().length) throw new Error('The active project One-Line has no components to analyze.');
  const results = await runArcFlash();
  const studies = getStudies();
  studies.arcFlash = results;
  setStudies(studies);
  return results;
}

function renderResults(results, scope = 'project') {
  const entries = resultEntries(results, scope);
  const table = document.getElementById('arcflash-results-table');
  const tbody = table?.querySelector('tbody');
  const summary = document.getElementById('arcflash-summary');
  const details = document.getElementById('arcflash-details');
  const output = document.getElementById('arcflash-output');
  if (!table || !tbody || !summary || !details || !output) return;
  tbody.innerHTML = '';
  entries.forEach(([id, result]) => {
    const row = document.createElement('tr');
    [
      result.equipmentTag || id,
      `${Number(result.incidentEnergy).toFixed(2)} cal/cm2`,
      result.minimumArcRatingCalCm2 > 0
        ? `Arc rating ≥ ${Number(result.minimumArcRatingCalCm2).toFixed(2)} cal/cm²`
        : 'Below 1.2 cal/cm²',
      `${Number(result.boundary || 0).toFixed(0)} mm`,
      `${Number(result.clearingTime || 0).toFixed(3)} s`,
      inputQuality(result)
    ].forEach(value => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  });
  const incompleteCount = entries.filter(([, result]) => (result.requiredInputs || []).length > 0).length;
  summary.textContent = `${entries.length} location(s) calculated; ${incompleteCount} location(s) require input confirmation before issue.`;
  summary.hidden = false;
  table.hidden = false;
  details.hidden = false;
  output.textContent = JSON.stringify(Object.fromEntries(entries), null, 2);
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
    let latestResults = null;

    populateScope();
    const componentCount = projectComponents().length;
    const projectName = String(getProjectState()?.name || 'Untitled').trim() || 'Untitled';
    if (projectContext) projectContext.textContent = `Project: ${projectName}. ${componentCount} One-Line component(s) available.`;

    form?.addEventListener('submit', async event => {
      event.preventDefault();
      if (status) status.textContent = 'Running IEEE 1584 analysis...';
      try {
        latestResults = await runArcFlashStudy();
        renderResults(latestResults, scope?.value || 'project');
        if (exportButton) exportButton.disabled = resultEntries(latestResults).length === 0;
        if (status) status.textContent = 'Study complete and saved to the active project. Review required inputs before exporting.';
      } catch (error) {
        if (status) status.textContent = `Study blocked: ${error.message}`;
        const output = document.getElementById('arcflash-output');
        if (output) output.textContent = JSON.stringify({ error: error.message }, null, 2);
      }
    });
    scope?.addEventListener('change', () => {
      if (latestResults) renderResults(latestResults, scope.value);
    });
    exportButton?.addEventListener('click', () => {
      if (!latestResults) return;
      const exportSummary = generateArcFlashReport(latestResults);
      if (status) {
        status.textContent = exportSummary?.omittedLabelCount
          ? `Arc-flash report exported; ${exportSummary.omittedLabelCount} incomplete label(s) were withheld.`
          : 'Arc-flash report and issue-ready labels exported.';
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
