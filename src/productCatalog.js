import './workflowStatus.js';
import '../site.js';
import {
  addBimObjectFamilies,
  addProductCatalogRows,
  getBimObjectFamilies,
  getProductCatalogRows,
} from '../dataStore.mjs';
import {
  PRODUCT_CATALOG_TYPES,
  buildProductCatalogGovernancePackage,
  buildProductCatalogImportTemplate,
  filterApprovedCatalogRows,
  mergeProductCatalogRows,
  normalizeProductCatalog,
  normalizeProductCatalogRow,
  renderProductCatalogGovernanceHTML,
} from '../analysis/productCatalog.mjs';
import {
  BIM_OBJECT_NATIVE_FORMATS,
  BIM_OBJECT_PRODUCT_CLASSES,
  buildBimObjectLibraryPackage,
  normalizeBimObjectFamily,
  renderBimObjectLibraryHTML,
} from '../analysis/bimObjectLibrary.mjs';

const BASE_CATALOG_URL = 'data/manufacturer_catalog.json';

let baseRows = [];
let selectedRow = null;

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadText(filename, content, mediaType = 'application/json') {
  const blob = new Blob([content], { type: mediaType });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

function parseCsv(text = '') {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];
  const split = line => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''));
  const headers = split(lines[0]);
  return lines.slice(1).map(line => {
    const cells = split(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  });
}

function setStatus(message, variant = 'info') {
  const el = document.getElementById('catalog-status');
  if (!el) return;
  el.textContent = message;
  el.className = `report-status report-status--${variant}`;
}

async function loadBaseRows() {
  try {
    const res = await fetch(BASE_CATALOG_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    baseRows = normalizeProductCatalog(await res.json()).rows;
  } catch (err) {
    console.warn('[productCatalog] Failed to load base catalog', err);
    baseRows = [];
  }
}

function allRows() {
  return mergeProductCatalogRows(baseRows, getProductCatalogRows()).rows;
}

function currentFilters() {
  return {
    category: document.getElementById('catalog-category-filter')?.value || '',
    manufacturer: document.getElementById('catalog-manufacturer-filter')?.value || '',
    standard: document.getElementById('catalog-standard-filter')?.value || '',
    source: document.getElementById('catalog-source-filter')?.value || '',
    approvedOnly: Boolean(document.getElementById('catalog-approved-filter')?.checked),
    staleOnly: Boolean(document.getElementById('catalog-stale-filter')?.checked),
  };
}

function currentBimFamilyFilters() {
  return {
    category: document.getElementById('bim-family-category-filter')?.value || '',
    manufacturer: document.getElementById('bim-family-manufacturer-filter')?.value || '',
    nativeFormat: document.getElementById('bim-family-format-filter')?.value || '',
    approvedOnly: Boolean(document.getElementById('bim-family-approved-filter')?.checked),
  };
}

function filteredRows() {
  const filters = currentFilters();
  const rows = allRows();
  if (filters.approvedOnly || filters.category || filters.manufacturer || filters.standard || filters.source || filters.staleOnly) {
    return filterApprovedCatalogRows(rows, filters);
  }
  return rows;
}

function filteredBimFamilyRows() {
  const filters = currentBimFamilyFilters();
  return getBimObjectFamilies().filter(row => {
    if (filters.approvedOnly && !row.approved) return false;
    if (filters.category && row.category !== filters.category) return false;
    if (filters.nativeFormat && row.nativeFormat !== filters.nativeFormat) return false;
    if (filters.manufacturer && !row.manufacturer.toLowerCase().includes(filters.manufacturer.toLowerCase())) return false;
    return true;
  });
}

function renderSummary(pkg) {
  const container = document.getElementById('catalog-summary');
  if (!container) return;
  const metrics = [
    ['Rows', pkg.summary.total],
    ['Approved', pkg.summary.approved],
    ['Unapproved', pkg.summary.unapproved],
    ['Stale', pkg.summary.stale],
    ['Duplicates', pkg.summary.duplicates],
    ['Usage warnings', pkg.summary.unapprovedUsage],
  ];
  container.innerHTML = metrics.map(([label, value]) => `
    <div class="catalog-stat">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>`).join('');
}

function renderDetail(row) {
  const detail = document.getElementById('catalog-detail');
  if (!detail) return;
  selectedRow = row;
  if (!row) {
    detail.hidden = true;
    detail.innerHTML = '';
    return;
  }
  detail.hidden = false;
  detail.innerHTML = `
    <h3>${escapeHtml(row.manufacturer)} ${escapeHtml(row.catalogNumber)}</h3>
    <p>${escapeHtml(row.description)}</p>
    <dl class="report-dl">
      <dt>Category</dt><dd>${escapeHtml(row.category)}</dd>
      <dt>Approval</dt><dd>${escapeHtml(row.approvalStatus)}</dd>
      <dt>Approved By</dt><dd>${escapeHtml(row.approvedBy || 'n/a')}</dd>
      <dt>Last Verified</dt><dd>${escapeHtml(row.lastVerified || 'not verified')}</dd>
      <dt>Standards</dt><dd>${escapeHtml(row.standards.join(', ') || 'n/a')}</dd>
      <dt>Datasheet</dt><dd>${row.datasheetUrl ? `<a href="${escapeHtml(row.datasheetUrl)}">${escapeHtml(row.datasheetUrl)}</a>` : 'n/a'}</dd>
      <dt>BIM Ref</dt><dd>${escapeHtml(row.bimRef || 'n/a')}</dd>
      <dt>Notes</dt><dd>${escapeHtml(row.verificationNotes || 'n/a')}</dd>
    </dl>
    <div class="catalog-actions">
      <button id="catalog-approve-row" type="button" class="btn primary-btn">Approve</button>
      <button id="catalog-revoke-row" type="button" class="btn secondary-btn">Revoke Approval</button>
    </div>`;
  document.getElementById('catalog-approve-row')?.addEventListener('click', () => approveSelected(true));
  document.getElementById('catalog-revoke-row')?.addEventListener('click', () => approveSelected(false));
}

function renderTable() {
  const container = document.getElementById('catalog-table');
  if (!container) return;
  const rows = filteredRows();
  if (!rows.length) {
    container.innerHTML = '<p class="report-empty">No catalog rows match the current filters.</p>';
    renderDetail(null);
    return;
  }
  container.innerHTML = `<table class="report-table catalog-table">
    <thead><tr><th>Catalog #</th><th>Manufacturer</th><th>Category</th><th>Description</th><th>Approval</th><th>Verified</th><th>Source</th><th></th></tr></thead>
    <tbody>${rows.map((row, index) => `<tr>
      <td>${escapeHtml(row.catalogNumber)}</td>
      <td>${escapeHtml(row.manufacturer)}</td>
      <td>${escapeHtml(row.category)}</td>
      <td>${escapeHtml(row.description)}</td>
      <td>${escapeHtml(row.approvalStatus)}</td>
      <td>${escapeHtml(row.lastVerified || 'not verified')}</td>
      <td>${escapeHtml(row.source)}</td>
      <td><button type="button" class="btn secondary-btn" data-catalog-index="${index}">Review</button></td>
    </tr>`).join('')}</tbody>
  </table>`;
  container.querySelectorAll('[data-catalog-index]').forEach(button => {
    button.addEventListener('click', () => renderDetail(rows[Number(button.dataset.catalogIndex)]));
  });
}

function renderAll() {
  const pkg = buildProductCatalogGovernancePackage({ catalog: allRows(), projectUsage: [] });
  renderSummary(pkg);
  renderTable();
  renderBimObjectLibrary();
}

function renderBimObjectLibrary() {
  const pkg = buildBimObjectLibraryPackage({
    catalogRows: allRows(),
    familyRows: getBimObjectFamilies(),
  });
  const summary = document.getElementById('bim-family-summary');
  const table = document.getElementById('bim-family-table');
  if (summary) {
    const metrics = [
      ['Families', pkg.summary.familyCount],
      ['Approved', pkg.summary.approvedFamilyCount],
      ['Missing catalog coverage', pkg.summary.missingFamilyCount],
      ['Conflicts', pkg.summary.conflictCount],
      ['Generic hints', pkg.summary.genericPlaceholderCount],
      ['Status', pkg.summary.status],
    ];
    summary.innerHTML = metrics.map(([label, value]) => `
      <div class="catalog-stat">
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(label)}</span>
      </div>`).join('');
  }
  if (!table) return;
  const rows = filteredBimFamilyRows();
  table.innerHTML = `<table class="report-table catalog-table">
    <thead><tr><th>Family</th><th>Manufacturer</th><th>Catalog #</th><th>Category</th><th>Format</th><th>IFC Class</th><th>Connectors</th><th>Approval</th></tr></thead>
    <tbody>${rows.length ? rows.map(row => `<tr>
      <td>${escapeHtml(row.familyName)}</td>
      <td>${escapeHtml(row.manufacturer)}</td>
      <td>${escapeHtml(row.catalogNumber)}</td>
      <td>${escapeHtml(row.category)}</td>
      <td>${escapeHtml(row.nativeFormat)}</td>
      <td>${escapeHtml(row.ifcClass || 'n/a')}</td>
      <td>${escapeHtml(row.connectorTypes.join(', ') || 'n/a')}</td>
      <td>${escapeHtml(row.approvalStatus)}</td>
    </tr>`).join('') : '<tr><td colspan="8">No BIM object family metadata rows match the current filters.</td></tr>'}</tbody>
  </table>
  ${pkg.catalogCoverage?.missingFamilies?.length ? `<p class="report-note">${escapeHtml(pkg.catalogCoverage.missingFamilies.length)} catalog row(s) need BIM family metadata before native BIM handoff.</p>` : ''}`;
}

function approveSelected(approved) {
  if (!selectedRow) return;
  const reviewer = window.prompt?.('Reviewer name for local catalog approval', selectedRow.approvedBy || '') || selectedRow.approvedBy || '';
  const next = normalizeProductCatalogRow({
    ...selectedRow,
    approved,
    approvalStatus: approved ? 'approved' : 'unreviewed',
    approvedBy: approved ? reviewer : '',
    approvedAt: approved ? new Date().toISOString().slice(0, 10) : '',
    lastVerified: approved ? new Date().toISOString().slice(0, 10) : selectedRow.lastVerified,
    source: selectedRow.source || 'local-catalog',
  });
  addProductCatalogRows([next]);
  setStatus(`${next.catalogNumber} ${approved ? 'approved' : 'approval revoked'} in the local catalog.`, 'success');
  renderDetail(next);
  renderAll();
}

async function importFile(file) {
  if (!file) return;
  const text = await file.text();
  let rows;
  if (/\.csv$/i.test(file.name)) {
    rows = parseCsv(text);
  } else {
    const parsed = JSON.parse(text);
    rows = Array.isArray(parsed) ? parsed : parsed.rows || parsed.products || [];
  }
  const normalized = rows.map(row => normalizeProductCatalogRow(row));
  const result = addProductCatalogRows(normalized);
  setStatus(`Imported ${normalized.length} row(s); ${result.duplicates.length} duplicate key(s) merged.`, result.warnings.length ? 'warn' : 'success');
  renderAll();
}

async function importBimFamilyFile(file) {
  if (!file) return;
  const text = await file.text();
  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed) ? parsed : parsed.familyRows || parsed.rows || parsed.families || [];
  const normalized = rows.map(row => normalizeBimObjectFamily(row));
  addBimObjectFamilies(normalized);
  setStatus(`Imported ${normalized.length} BIM object family metadata row(s).`, 'success');
  renderAll();
}

function initControls() {
  const category = document.getElementById('catalog-category-filter');
  const template = document.getElementById('catalog-template-type');
  if (category) {
    category.innerHTML = [''].concat(PRODUCT_CATALOG_TYPES)
      .map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type || 'All categories')}</option>`)
      .join('');
  }
  if (template) {
    template.innerHTML = PRODUCT_CATALOG_TYPES
      .map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
      .join('');
  }
  const familyCategory = document.getElementById('bim-family-category-filter');
  if (familyCategory) {
    familyCategory.innerHTML = [''].concat(BIM_OBJECT_PRODUCT_CLASSES)
      .map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type || 'All categories')}</option>`)
      .join('');
  }
  const familyFormat = document.getElementById('bim-family-format-filter');
  if (familyFormat) {
    familyFormat.innerHTML = [''].concat(BIM_OBJECT_NATIVE_FORMATS)
      .map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type || 'All formats')}</option>`)
      .join('');
  }
  ['catalog-category-filter', 'catalog-manufacturer-filter', 'catalog-standard-filter', 'catalog-source-filter', 'catalog-approved-filter', 'catalog-stale-filter']
    .forEach(id => document.getElementById(id)?.addEventListener('input', renderAll));
  ['bim-family-category-filter', 'bim-family-manufacturer-filter', 'bim-family-format-filter', 'bim-family-approved-filter']
    .forEach(id => document.getElementById(id)?.addEventListener('input', renderAll));
  document.getElementById('catalog-import-file')?.addEventListener('change', event => importFile(event.target.files?.[0]));
  document.getElementById('bim-family-import-file')?.addEventListener('change', event => importBimFamilyFile(event.target.files?.[0]));
  document.getElementById('catalog-download-template')?.addEventListener('click', () => {
    const type = template?.value || 'tray';
    const tpl = buildProductCatalogImportTemplate(type);
    downloadText(`product-catalog-${type}-template.csv`, tpl.csv, 'text/csv');
  });
  document.getElementById('catalog-export-json')?.addEventListener('click', () => {
    const rows = getProductCatalogRows();
    downloadText('product-catalog-governance.json', JSON.stringify({ rows }, null, 2));
  });
  document.getElementById('catalog-export-html')?.addEventListener('click', () => {
    const html = renderProductCatalogGovernanceHTML(buildProductCatalogGovernancePackage({ catalog: allRows(), projectUsage: [] }));
    downloadText('product-catalog-governance.html', `<!doctype html><html><body>${html}</body></html>`, 'text/html');
  });
  document.getElementById('bim-family-export-json')?.addEventListener('click', () => {
    downloadText('bim-object-family-library.json', JSON.stringify({ version: 'bim-object-library-v1', familyRows: getBimObjectFamilies() }, null, 2));
  });
  document.getElementById('bim-family-export-html')?.addEventListener('click', () => {
    const html = renderBimObjectLibraryHTML(buildBimObjectLibraryPackage({ catalogRows: allRows(), familyRows: getBimObjectFamilies() }));
    downloadText('bim-object-family-library.html', `<!doctype html><html><body>${html}</body></html>`, 'text/html');
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initHelpModal('help-btn', 'help-modal', 'close-help-btn');
  initNavToggle();
  initControls();
  await loadBaseRows();
  renderAll();
});
