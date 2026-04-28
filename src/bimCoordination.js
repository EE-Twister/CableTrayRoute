import './workflowStatus.js';
import '../site.js';
import {
  addBimIssue,
  addBimConnectorPackage,
  getActiveBimConnectorPackageId,
  getBimElements,
  getBimConnectorPackages,
  getBimIssues,
  getCables,
  getConduits,
  getEquipment,
  getTrays,
  setActiveBimConnectorPackageId,
  setBimElements,
  updateBimIssue,
} from '../dataStore.mjs';
import {
  buildBimRoundTripPackage,
  createBimIssue,
  parseBimImportPayload,
  renderBimRoundTripHTML,
} from '../analysis/bimRoundTrip.mjs';
import {
  applyConnectorImportPreview,
  buildConnectorExportPackage,
  buildConnectorReadinessPackage,
  validateConnectorImportPackage,
} from '../analysis/bimConnectorContract.mjs';

let pendingConnectorPreview = null;
let pendingConnectorPackage = null;

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

function setStatus(message, variant = 'info') {
  const el = document.getElementById('bim-status');
  if (!el) return;
  el.textContent = message;
  el.className = `report-status report-status--${variant}`;
}

function currentPackage() {
  return buildBimRoundTripPackage({
    bimElements: getBimElements(),
    bimIssues: getBimIssues(),
    cables: getCables(),
    trays: getTrays(),
    conduits: getConduits(),
    equipment: getEquipment(),
  });
}

function currentProjectState() {
  return {
    bimElements: getBimElements(),
    bimIssues: getBimIssues(),
    cables: getCables(),
    trays: getTrays(),
    conduits: getConduits(),
    equipment: getEquipment(),
  };
}

function renderSummary(pkg) {
  const container = document.getElementById('bim-summary');
  if (!container) return;
  const metrics = [
    ['Elements', pkg.summary.elementCount],
    ['Mapped', pkg.summary.mappedCount],
    ['Unmapped', pkg.summary.unmappedCount],
    ['Changed groups', pkg.summary.changedGroups],
    ['Open issues', pkg.summary.openIssues],
    ['High priority issues', pkg.summary.highPriorityIssues],
  ];
  container.innerHTML = metrics.map(([label, value]) => `
    <div class="bim-stat">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>`).join('');
}

function populateFilters(pkg) {
  const typeFilter = document.getElementById('bim-type-filter');
  if (!typeFilter) return;
  const current = typeFilter.value;
  const types = [...new Set(pkg.elements.map(row => row.elementType))].sort();
  typeFilter.innerHTML = [''].concat(types).map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type || 'All types')}</option>`).join('');
  typeFilter.value = types.includes(current) ? current : '';
}

function renderElements(pkg) {
  const container = document.getElementById('bim-elements-table');
  if (!container) return;
  const type = document.getElementById('bim-type-filter')?.value || '';
  const mapping = document.getElementById('bim-mapping-filter')?.value || '';
  const mappingById = new Map(pkg.mappings.map(row => [row.elementId, row]));
  const rows = pkg.elements
    .filter(row => !type || row.elementType === type)
    .filter(row => !mapping || mappingById.get(row.id)?.status === mapping);
  container.innerHTML = `<table class="report-table bim-table">
    <thead><tr><th>Type</th><th>Tag</th><th>Name</th><th>GUID</th><th>System</th><th>Level</th><th>Area</th><th>Qty</th><th>Mapping</th></tr></thead>
    <tbody>${rows.length ? rows.map(row => {
      const map = mappingById.get(row.id) || {};
      return `<tr>
        <td>${escapeHtml(row.elementType)}</td>
        <td>${escapeHtml(row.tag)}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.guid || row.sourceId)}</td>
        <td>${escapeHtml(row.system || 'Unassigned')}</td>
        <td>${escapeHtml(row.level || 'Unassigned')}</td>
        <td>${escapeHtml(row.area || 'Unassigned')}</td>
        <td>${escapeHtml(row.lengthFt ?? row.quantity ?? '')}</td>
        <td>${escapeHtml(map.status || 'unmapped')} ${map.projectTag ? `(${escapeHtml(map.projectTag)})` : ''}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="9">No imported BIM elements match the current filters.</td></tr>'}</tbody>
  </table>`;
}

function renderReconciliation(pkg) {
  const container = document.getElementById('bim-reconciliation-table');
  if (!container) return;
  const rows = pkg.quantityReconciliation.rows;
  container.innerHTML = `<table class="report-table bim-table">
    <thead><tr><th>Type</th><th>System</th><th>Voltage</th><th>Level</th><th>Area</th><th>Project</th><th>BIM</th><th>Delta</th><th>Status</th></tr></thead>
    <tbody>${rows.length ? rows.map(row => `<tr>
      <td>${escapeHtml(row.elementType)}</td>
      <td>${escapeHtml(row.system)}</td>
      <td>${escapeHtml(row.voltageClass)}</td>
      <td>${escapeHtml(row.level)}</td>
      <td>${escapeHtml(row.area)}</td>
      <td>${escapeHtml(row.projectQuantity)}</td>
      <td>${escapeHtml(row.bimQuantity)}</td>
      <td>${escapeHtml(row.delta)} (${escapeHtml(row.deltaPct)}%)</td>
      <td>${escapeHtml(row.status)}</td>
    </tr>`).join('') : '<tr><td colspan="9">No reconciliation rows are available.</td></tr>'}</tbody>
  </table>`;
}

function renderIssues() {
  const container = document.getElementById('bim-issues-table');
  if (!container) return;
  const rows = getBimIssues();
  container.innerHTML = `<table class="report-table bim-table">
    <thead><tr><th>Title</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Elements</th><th>Description</th><th>Action</th></tr></thead>
    <tbody>${rows.length ? rows.map(row => `<tr>
      <td>${escapeHtml(row.title)}</td>
      <td>${escapeHtml(row.status)}</td>
      <td>${escapeHtml(row.priority)}</td>
      <td>${escapeHtml(row.assignee || 'Unassigned')}</td>
      <td>${escapeHtml(row.elementIds.join(', '))}</td>
      <td>${escapeHtml(row.description)}</td>
      <td>${row.status === 'resolved' || row.status === 'closed' ? '' : `<button type="button" class="btn secondary-btn" data-resolve-issue="${escapeHtml(row.id)}">Resolve</button>`}</td>
    </tr>`).join('') : '<tr><td colspan="7">No BIM issues captured.</td></tr>'}</tbody>
  </table>`;
  container.querySelectorAll('[data-resolve-issue]').forEach(button => {
    button.addEventListener('click', () => {
      updateBimIssue(button.dataset.resolveIssue, { status: 'resolved' });
      setStatus('BIM issue marked resolved.', 'success');
      renderAll();
    });
  });
}

function renderConnectorReadiness() {
  const container = document.getElementById('bim-connector-readiness');
  if (!container) return;
  const pkg = buildConnectorReadinessPackage({
    packages: getBimConnectorPackages(),
    activePackageId: getActiveBimConnectorPackageId(),
    projectState: currentProjectState(),
  });
  const metrics = [
    ['Packages', pkg.summary.packageCount],
    ['Active elements', pkg.summary.elementCount],
    ['Issues', pkg.summary.issueCount],
    ['Validation', pkg.summary.valid ? 'valid' : 'review'],
    ['Quantity deltas', pkg.summary.quantityDeltas],
    ['Mapping deltas', pkg.summary.mappingDeltas],
  ];
  container.innerHTML = metrics.map(([label, value]) => `
    <div class="bim-stat">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>`).join('');
}

function renderConnectorPreview(validation = null, preview = null) {
  const container = document.getElementById('bim-connector-preview');
  const acceptBtn = document.getElementById('bim-connector-accept');
  if (!container) return;
  if (acceptBtn) acceptBtn.disabled = !preview || !preview.acceptedElements.length;
  if (!validation && !preview) {
    container.innerHTML = '';
    return;
  }
  const errors = validation?.errors || [];
  const warnings = preview?.warnings || validation?.warnings || [];
  container.innerHTML = `
    <table class="report-table bim-table">
      <thead><tr><th>Validation</th><th>Accepted</th><th>Rejected</th><th>Quantity Deltas</th><th>Mapping Deltas</th></tr></thead>
      <tbody><tr>
        <td>${escapeHtml(validation?.valid ? 'valid' : 'review')}</td>
        <td>${escapeHtml(preview?.acceptedElements?.length || 0)}</td>
        <td>${escapeHtml(preview?.rejectedElements?.length || 0)}</td>
        <td>${escapeHtml(preview?.quantityDeltas?.length || 0)}</td>
        <td>${escapeHtml(preview?.mappingDeltas?.length || 0)}</td>
      </tr></tbody>
    </table>
    ${errors.length ? `<p class="text-danger">${escapeHtml(errors.join(' '))}</p>` : ''}
    ${warnings.length ? `<p class="text-muted">${escapeHtml(warnings.slice(0, 5).join(' | '))}</p>` : ''}
    <table class="report-table bim-table">
      <thead><tr><th>Type</th><th>Tag</th><th>GUID/Source</th><th>Status</th></tr></thead>
      <tbody>${preview?.acceptedElements?.length || preview?.rejectedElements?.length ? [
        ...(preview?.acceptedElements || []).slice(0, 20).map(row => `<tr><td>${escapeHtml(row.elementType)}</td><td>${escapeHtml(row.tag || row.name)}</td><td>${escapeHtml(row.guid || row.sourceId || row.id)}</td><td>accepted</td></tr>`),
        ...(preview?.rejectedElements || []).slice(0, 20).map(({ element, errors: rowErrors }) => `<tr><td>${escapeHtml(element.elementType)}</td><td>${escapeHtml(element.tag || element.name)}</td><td>${escapeHtml(element.guid || element.sourceId || element.id)}</td><td>${escapeHtml(rowErrors.join('; '))}</td></tr>`),
      ].join('') : '<tr><td colspan="4">Select a connector return package to preview rows.</td></tr>'}</tbody>
    </table>`;
}

function exportConnectorPackage(connectorType) {
  const pkg = buildConnectorExportPackage(currentProjectState(), { connectorType });
  const stored = addBimConnectorPackage(pkg);
  setActiveBimConnectorPackageId(stored.id);
  downloadText(`${connectorType}-connector-package.json`, JSON.stringify(stored, null, 2));
  setStatus(`${connectorType} connector package exported and registered.`, 'success');
  renderAll();
}

async function previewConnectorFile(file) {
  if (!file) return;
  const text = await file.text();
  const validation = validateConnectorImportPackage(text);
  const preview = applyConnectorImportPreview({ payload: text, projectState: currentProjectState() });
  pendingConnectorPackage = validation.package;
  pendingConnectorPreview = preview;
  renderConnectorPreview(validation, preview);
  setStatus(`Previewed connector package: ${preview.acceptedElements.length} accepted, ${preview.rejectedElements.length} rejected.`, validation.valid ? 'success' : 'warn');
}

function acceptConnectorPreview() {
  if (!pendingConnectorPreview || !pendingConnectorPackage) return;
  const byKey = new Map(getBimElements().map(row => [row.guid || row.sourceId || row.id || row.tag, row]));
  pendingConnectorPreview.acceptedElements.forEach(row => {
    byKey.set(row.guid || row.sourceId || row.id || row.tag, row);
  });
  setBimElements([...byKey.values()]);
  pendingConnectorPreview.newIssues.forEach(issue => addBimIssue(issue));
  const stored = addBimConnectorPackage(pendingConnectorPackage);
  setActiveBimConnectorPackageId(stored.id);
  setStatus(`Accepted ${pendingConnectorPreview.acceptedElements.length} connector element(s) and ${pendingConnectorPreview.newIssues.length} issue record(s).`, 'success');
  pendingConnectorPreview = null;
  pendingConnectorPackage = null;
  renderConnectorPreview();
  renderAll();
}

function renderAll() {
  const pkg = currentPackage();
  populateFilters(pkg);
  renderSummary(pkg);
  renderElements(pkg);
  renderReconciliation(pkg);
  renderIssues();
  renderConnectorReadiness();
}

async function importBimFile(file) {
  if (!file) return;
  const text = await file.text();
  const parsed = parseBimImportPayload(text, { sourceFile: file.name });
  setBimElements(parsed.elements);
  setStatus(`Imported ${parsed.elements.length} BIM element(s) from ${file.name}.`, parsed.elements.length ? 'success' : 'warn');
  renderAll();
}

function wireControls() {
  document.getElementById('bim-import-file')?.addEventListener('change', event => importBimFile(event.target.files?.[0]));
  document.getElementById('bim-clear-elements')?.addEventListener('click', () => {
    if (window.confirm?.('Clear imported BIM elements for this scenario?') === false) return;
    setBimElements([]);
    setStatus('Imported BIM elements cleared.', 'success');
    renderAll();
  });
  document.getElementById('bim-type-filter')?.addEventListener('input', () => renderElements(currentPackage()));
  document.getElementById('bim-mapping-filter')?.addEventListener('input', () => renderElements(currentPackage()));
  document.getElementById('bim-export-json')?.addEventListener('click', () => {
    downloadText('bim-coordination-package.json', JSON.stringify(currentPackage(), null, 2));
  });
  document.getElementById('bim-export-html')?.addEventListener('click', () => {
    downloadText('bim-coordination-package.html', `<!doctype html><html><body>${renderBimRoundTripHTML(currentPackage())}</body></html>`, 'text/html');
  });
  document.getElementById('bim-export-issues')?.addEventListener('click', () => {
    downloadText('bim-issues-bcf-like.json', JSON.stringify(currentPackage().exports.bcfJson, null, 2));
  });
  document.getElementById('bim-export-revit-connector')?.addEventListener('click', () => exportConnectorPackage('revit'));
  document.getElementById('bim-export-autocad-connector')?.addEventListener('click', () => exportConnectorPackage('autocad'));
  document.getElementById('bim-export-generic-connector')?.addEventListener('click', () => exportConnectorPackage('generic'));
  document.getElementById('bim-connector-file')?.addEventListener('change', event => previewConnectorFile(event.target.files?.[0]));
  document.getElementById('bim-connector-accept')?.addEventListener('click', acceptConnectorPreview);
  document.getElementById('bim-issue-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const issue = createBimIssue({
      title: formData.get('title') || '',
      elementIds: String(formData.get('elementIds') || '').split(',').map(value => value.trim()).filter(Boolean),
      status: formData.get('status') || 'open',
      priority: formData.get('priority') || 'medium',
      assignee: formData.get('assignee') || '',
      description: formData.get('description') || '',
    });
    addBimIssue(issue);
    event.target.reset();
    setStatus(`BIM issue ${issue.id} added.`, 'success');
    renderAll();
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initSettings();
  initDarkMode();
  initCompactMode();
  initNavToggle();
  wireControls();
  renderAll();
});
