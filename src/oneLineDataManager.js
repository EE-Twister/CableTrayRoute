import { getOneLine, setOneLine } from '../dataStore.mjs';
import {
  DATA_MANAGER_FIELDS,
  applyOneLineDataEdit,
  applyOneLineDataImport,
  filterOneLineDataRows,
  listOneLineDataRows,
  parseOneLineDataCsv,
  planOneLineDataImport,
} from '../analysis/oneLineDataManager.mjs';
import {
  ONE_LINE_DATA_HEADERS,
  readOneLineDataWorkbook,
  writeOneLineDataWorkbook,
} from '../analysis/oneLineDataSpreadsheet.mjs';
import { downloadCSV } from '../reports/reporting.mjs';
import { mountPersistentNavigation } from './components/navigation.js';
import '../site.js';

const state = {
  selected: new Set(),
  importPlan: null,
  importRows: null,
  importModel: null,
  importSource: 'CSV',
};

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function valueForInput(value) {
  return value === null || value === undefined ? '' : String(value);
}

function currentFilters() {
  return {
    query: document.getElementById('dm-search')?.value || '',
    sheet: document.getElementById('dm-sheet-filter')?.value || '',
    type: document.getElementById('dm-type-filter')?.value || '',
  };
}

function visibleRows() {
  return filterOneLineDataRows(listOneLineDataRows(getOneLine()), currentFilters());
}

function setStatus(message, kind = '') {
  const status = document.getElementById('dm-status');
  if (!status) return;
  status.textContent = message;
  status.className = `field-hint${kind ? ` ${kind}` : ''}`;
}

function populateFilters(rows) {
  const sheetSelect = document.getElementById('dm-sheet-filter');
  const typeSelect = document.getElementById('dm-type-filter');
  if (!sheetSelect || !typeSelect) return;
  const selectedSheet = sheetSelect.value;
  const selectedType = typeSelect.value;
  const sheets = [...new Map(rows.map(row => [row.sheetId, row.sheet])).entries()];
  const types = [...new Set(rows.map(row => row.type))].sort();
  sheetSelect.innerHTML = `<option value="">All sheets</option>${sheets
    .map(([id, label]) => `<option value="${esc(id)}">${esc(label)}</option>`)
    .join('')}`;
  typeSelect.innerHTML = `<option value="">All types</option>${types
    .map(type => `<option value="${esc(type)}">${esc(type)}</option>`)
    .join('')}`;
  sheetSelect.value = sheets.some(([id]) => id === selectedSheet) ? selectedSheet : '';
  typeSelect.value = types.includes(selectedType) ? selectedType : '';
}

function renderRows() {
  const allRows = listOneLineDataRows(getOneLine());
  populateFilters(allRows);
  const rows = filterOneLineDataRows(allRows, currentFilters());
  const body = document.getElementById('dm-table-body');
  const count = document.getElementById('dm-row-count');
  const applyButton = document.getElementById('dm-apply-batch');
  const visibleIds = new Set(rows.map(row => row.componentId));
  const selectedVisible = rows.filter(row => state.selected.has(row.componentId));
  if (count) count.textContent = `${rows.length} displayed · ${state.selected.size} selected`;
  if (applyButton) applyButton.disabled = state.selected.size === 0;
  const selectAll = document.getElementById('dm-select-visible');
  if (selectAll) {
    selectAll.checked = rows.length > 0 && selectedVisible.length === rows.length;
    selectAll.indeterminate = selectedVisible.length > 0 && selectedVisible.length < rows.length;
  }
  if (!body) return;
  body.innerHTML = rows.length
    ? rows.map(row => `
      <tr data-component-id="${esc(row.componentId)}">
        <td><input type="checkbox" data-dm-select="${esc(row.componentId)}" aria-label="Select ${esc(row.label || row.componentId)}" ${state.selected.has(row.componentId) ? 'checked' : ''}></td>
        <td>${esc(row.sheet)}</td>
        <td class="dm-id">${esc(row.componentId)}</td>
        <td><input data-dm-field="label" value="${esc(row.label)}" aria-label="Label for ${esc(row.componentId)}"></td>
        <td><input data-dm-field="tag" value="${esc(row.tag)}" aria-label="Tag for ${esc(row.componentId)}"></td>
        <td>${esc(row.type)}${row.subtype ? `<span class="dm-subtype">${esc(row.subtype)}</span>` : ''}</td>
        <td><input data-dm-field="voltageKv" type="number" min="0.001" step="any" value="${esc(valueForInput(row.voltageKv))}" aria-label="Rated voltage for ${esc(row.componentId)}"></td>
        <td><input data-dm-field="currentA" type="number" min="0.001" step="any" value="${esc(valueForInput(row.currentA))}" aria-label="Rated current for ${esc(row.componentId)}"></td>
        <td><input data-dm-field="layer" value="${esc(row.layer)}" aria-label="Layer for ${esc(row.componentId)}"></td>
        <td><input data-dm-field="locked" type="checkbox" aria-label="Position locked for ${esc(row.componentId)}" ${row.locked ? 'checked' : ''}></td>
      </tr>`).join('')
    : '<tr><td colspan="10" class="dm-empty">No One-Line components match the current filters.</td></tr>';
  state.selected.forEach(id => {
    if (!visibleIds.has(id) && !allRows.some(row => row.componentId === id)) state.selected.delete(id);
  });
}

function saveEdit(componentId, field, value) {
  const model = getOneLine();
  const result = applyOneLineDataEdit(model, [componentId], field, value);
  if (!result.changed) {
    setStatus('No valid data change was applied. Numeric voltage and current values must be greater than zero.', 'warn');
    renderRows();
    return;
  }
  setOneLine(result.oneLine);
  setStatus(`Updated ${componentId}. The prior One-Line state is retained in revisions.`, 'success');
  renderRows();
}

function setVisibleSelection(checked) {
  visibleRows().forEach(row => {
    if (checked) state.selected.add(row.componentId);
    else state.selected.delete(row.componentId);
  });
  renderRows();
}

function syncBatchControl() {
  const field = document.getElementById('dm-batch-field')?.value || 'voltageKv';
  const definition = DATA_MANAGER_FIELDS[field];
  const textWrap = document.getElementById('dm-batch-text-wrap');
  const booleanWrap = document.getElementById('dm-batch-boolean-wrap');
  const textInput = document.getElementById('dm-batch-value');
  if (!definition || !textWrap || !booleanWrap || !textInput) return;
  const isBoolean = definition.kind === 'boolean';
  textWrap.hidden = isBoolean;
  booleanWrap.hidden = !isBoolean;
  textInput.type = definition.kind === 'number' ? 'number' : 'text';
  textInput.min = definition.kind === 'number' ? '0.001' : '';
  textInput.step = definition.kind === 'number' ? 'any' : '';
  textInput.value = '';
}

function applyBatchEdit() {
  const field = document.getElementById('dm-batch-field')?.value;
  const definition = DATA_MANAGER_FIELDS[field];
  if (!definition || !state.selected.size) return;
  const value = definition.kind === 'boolean'
    ? document.getElementById('dm-batch-boolean-value')?.value === 'true'
    : document.getElementById('dm-batch-value')?.value;
  const result = applyOneLineDataEdit(getOneLine(), [...state.selected], field, value);
  if (!result.changed) {
    setStatus('No valid batch change was applied. Numeric voltage and current values must be greater than zero.', 'warn');
    return;
  }
  setOneLine(result.oneLine);
  setStatus(`Updated ${result.changed} selected component${result.changed === 1 ? '' : 's'}. The prior One-Line state is retained in revisions.`, 'success');
  renderRows();
}

function spreadsheetValues(row) {
  return [row.sheet, row.componentId, row.label, row.tag, row.type, row.subtype, row.voltageKv ?? '', row.currentA ?? '', row.layer, row.locked ? 'Yes' : 'No'];
}

function exportVisibleCsvRows() {
  const rows = visibleRows();
  downloadCSV(
    ONE_LINE_DATA_HEADERS,
    rows.map(spreadsheetValues),
    'one-line-data-manager.csv',
  );
  setStatus(`Exported ${rows.length} displayed component${rows.length === 1 ? '' : 's'} to CSV.`, 'success');
}

function exportVisibleXlsxRows() {
  const rows = visibleRows();
  const result = writeOneLineDataWorkbook(rows.map(spreadsheetValues));
  if (!result.ok) {
    setStatus('XLSX export is unavailable. Check that the spreadsheet runtime loaded, or export CSV instead.', 'warn');
    return;
  }
  setStatus(`Exported ${rows.length} displayed component${rows.length === 1 ? '' : 's'} to XLSX.`, 'success');
}

function formatImportValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Locked' : 'Unlocked';
  return String(value);
}

function renderImportPlan() {
  const section = document.getElementById('dm-import-review');
  const summary = document.getElementById('dm-import-summary');
  const changes = document.getElementById('dm-import-changes');
  const warnings = document.getElementById('dm-import-warnings');
  const applyButton = document.getElementById('dm-apply-import');
  const plan = state.importPlan;
  if (!section || !summary || !changes || !warnings || !applyButton) return;
  if (!plan) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  summary.textContent = `${plan.totalRows} ${state.importSource} row${plan.totalRows === 1 ? '' : 's'} read; ${plan.matchedRows} matched, ${plan.unmatchedRows} unmatched, ${plan.updates.length} controlled field change${plan.updates.length === 1 ? '' : 's'} proposed.`;
  changes.innerHTML = plan.updates.length
    ? plan.updates.map(change => `
      <tr>
        <td>${esc(change.componentId)}</td>
        <td>${esc(DATA_MANAGER_FIELDS[change.field]?.label || change.field)}</td>
        <td>${esc(formatImportValue(change.before))}</td>
        <td>${esc(formatImportValue(change.after))}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="dm-empty">No controlled field values would change.</td></tr>';
  warnings.innerHTML = plan.warnings.length
    ? `<h3>Skipped rows and values</h3><ul>${plan.warnings.map(warning => `<li>Row ${warning.row}: ${esc(warning.message)}</li>`).join('')}</ul>`
    : '';
  applyButton.disabled = plan.updates.length === 0;
}

async function previewImport(file) {
  if (!file) return;
  try {
    const filename = String(file.name || '').toLowerCase();
    let rows;
    let source = 'CSV';
    if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
      const imported = readOneLineDataWorkbook(await file.arrayBuffer());
      if (!imported.ok) {
        const reasons = {
          unavailable: 'Spreadsheet runtime unavailable. Import CSV instead.',
          'no-sheets': 'The workbook has no worksheets.',
          'too-many-sheets': 'The workbook has too many worksheets (maximum 20).',
          'missing-sheet': 'The selected worksheet could not be read.',
          'invalid-rows': 'The worksheet did not contain readable rows.',
          'too-many-rows': 'The selected worksheet has more than 10,000 rows.',
          'read-error': imported.error?.message || 'The workbook could not be read.',
        };
        throw new Error(reasons[imported.code] || 'The workbook could not be read.');
      }
      rows = imported.rows;
      source = `XLSX (${imported.sheetName})`;
    } else {
      rows = parseOneLineDataCsv(await file.text());
    }
    state.importRows = rows;
    state.importModel = JSON.stringify(getOneLine());
    state.importSource = source;
    state.importPlan = planOneLineDataImport(getOneLine(), rows);
    renderImportPlan();
    setStatus(`${source} update preview prepared for ${file.name}. Review proposed changes before applying.`);
  } catch (error) {
    state.importPlan = null;
    state.importRows = null;
    state.importModel = null;
    state.importSource = 'CSV';
    renderImportPlan();
    setStatus(`Could not read update file: ${error.message || error}`, 'warn');
  }
}

function applyImportedPlan() {
  if (!state.importPlan || !state.importRows) return;
  const currentModel = getOneLine();
  if (JSON.stringify(currentModel) !== state.importModel) {
    state.importPlan = planOneLineDataImport(currentModel, state.importRows);
    state.importModel = JSON.stringify(currentModel);
    renderImportPlan();
    setStatus('The One-Line changed after this CSV was previewed. The preview has been refreshed; review it again before applying.', 'warn');
    return;
  }
  const result = applyOneLineDataImport(currentModel, state.importPlan.updates);
  if (!result.changed) {
    setStatus('No imported values changed the current One-Line.', 'warn');
    return;
  }
  setOneLine(result.oneLine);
  state.importPlan = null;
  state.importRows = null;
  state.importModel = null;
  state.importSource = 'CSV';
  const input = document.getElementById('dm-import-input');
  if (input) input.value = '';
  renderImportPlan();
  renderRows();
  setStatus(`Applied ${result.changed} reviewed spreadsheet update${result.changed === 1 ? '' : 's'}. The prior One-Line state is retained in revisions.`, 'success');
}

function bindEvents() {
  document.getElementById('dm-table-body')?.addEventListener('change', event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const selectedId = target.dataset.dmSelect;
    if (selectedId) {
      if (target.checked) state.selected.add(selectedId);
      else state.selected.delete(selectedId);
      renderRows();
      return;
    }
    const field = target.dataset.dmField;
    const componentId = target.closest('tr')?.dataset.componentId;
    if (field && componentId) saveEdit(componentId, field, target.type === 'checkbox' ? target.checked : target.value);
  });
  ['dm-search', 'dm-sheet-filter', 'dm-type-filter'].forEach(id => {
    const eventName = id === 'dm-search' ? 'input' : 'change';
    document.getElementById(id)?.addEventListener(eventName, renderRows);
  });
  document.getElementById('dm-select-visible')?.addEventListener('change', event => setVisibleSelection(event.target.checked));
  document.getElementById('dm-refresh')?.addEventListener('click', () => {
    renderRows();
    setStatus('Data Manager refreshed from the current One-Line project model.');
  });
  document.getElementById('dm-batch-field')?.addEventListener('change', syncBatchControl);
  document.getElementById('dm-apply-batch')?.addEventListener('click', applyBatchEdit);
  document.getElementById('dm-export-csv')?.addEventListener('click', exportVisibleCsvRows);
  document.getElementById('dm-export-xlsx')?.addEventListener('click', exportVisibleXlsxRows);
  document.getElementById('dm-import-btn')?.addEventListener('click', () => document.getElementById('dm-import-input')?.click());
  document.getElementById('dm-import-input')?.addEventListener('change', event => previewImport(event.target.files?.[0]));
  document.getElementById('dm-apply-import')?.addEventListener('click', applyImportedPlan);
}

window.addEventListener('DOMContentLoaded', () => {
  mountPersistentNavigation();
  renderRows();
  syncBatchControl();
  bindEvents();
});
