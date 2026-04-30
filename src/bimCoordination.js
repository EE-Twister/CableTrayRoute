import './workflowStatus.js';
import '../site.js';
import {
  addBimIssue,
  addBimConnectorPackage,
  getActiveBimConnectorPackageId,
  getBimElements,
  getBimConnectorPackages,
  getBimIssues,
  getBimObjectFamilies,
  getCables,
  getConduits,
  getEquipment,
  getProductCatalogRows,
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
import {
  buildNativeConnectorKitPackage,
  renderNativeConnectorKitHTML,
} from '../analysis/nativeBimConnectorKit.mjs';
import {
  buildBimObjectLibraryPackage,
  renderBimObjectLibraryHTML,
} from '../analysis/bimObjectLibrary.mjs';
import {
  buildRevitExportRequest,
  buildRevitNativeSyncPackage,
  buildRevitSyncReadinessPackage,
  renderRevitNativeSyncHTML,
  renderRevitSyncReadinessHTML,
  validateRevitConnectorPayload,
  buildRevitRoundTripPreview,
} from '../analysis/revitConnectorBridge.mjs';
import {
  buildAutoCadExportRequest,
  buildAutoCadNativeSyncPackage,
  buildAutoCadSyncReadinessPackage,
  renderAutoCadNativeSyncHTML,
  renderAutoCadSyncReadinessHTML,
  validateAutoCadConnectorPayload,
  buildAutoCadRoundTripPreview,
} from '../analysis/autocadConnectorBridge.mjs';
import {
  buildPlantCadExportRequest,
  buildPlantCadNativeSyncPackage,
  buildPlantCadSyncReadinessPackage,
  renderPlantCadNativeSyncHTML,
  renderPlantCadSyncReadinessHTML,
  validatePlantCadConnectorPayload,
  buildPlantCadRoundTripPreview,
} from '../analysis/plantCadConnectorBridge.mjs';

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
    productCatalog: getProductCatalogRows(),
    bimObjectFamilies: getBimObjectFamilies(),
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

function currentNativeConnectorKit() {
  return buildNativeConnectorKitPackage({
    projectState: currentProjectState(),
    connectorPackages: getBimConnectorPackages(),
    activeConnectorPackageId: getActiveBimConnectorPackageId(),
    bimObjectFamilies: getBimObjectFamilies(),
  });
}

function renderNativeConnectorKit() {
  const summaryContainer = document.getElementById('bim-native-kit-readiness');
  const tableContainer = document.getElementById('bim-native-kit-table');
  if (!summaryContainer || !tableContainer) return;
  const pkg = currentNativeConnectorKit();
  const metrics = [
    ['Descriptors', pkg.summary.descriptorCount],
    ['Valid', pkg.summary.validDescriptorCount],
    ['Checklist gaps', pkg.summary.missingChecklistItems],
    ['Samples', pkg.summary.samplePayloadCount],
    ['Contract', pkg.summary.contractVersion],
    ['Status', pkg.summary.status],
  ];
  summaryContainer.innerHTML = metrics.map(([label, value]) => `
    <div class="bim-stat">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>`).join('');
  tableContainer.innerHTML = `
    <table class="report-table bim-table">
      <thead><tr><th>Connector</th><th>Target</th><th>Version</th><th>Commands</th><th>Templates</th></tr></thead>
      <tbody>${pkg.descriptors.map(row => `<tr>
        <td>${escapeHtml(row.connectorType)}</td>
        <td>${escapeHtml(row.targetApplication)}</td>
        <td>${escapeHtml(row.targetVersion)}</td>
        <td>${escapeHtml(row.commands.map(command => command.name).join(', '))}</td>
        <td>${escapeHtml(row.templateFiles.length)}</td>
      </tr>`).join('')}</tbody>
    </table>
    <table class="report-table bim-table">
      <thead><tr><th>Connector</th><th>Checklist Item</th><th>Status</th><th>Recommendation</th></tr></thead>
      <tbody>${pkg.installChecklist.map(row => `<tr>
        <td>${escapeHtml(row.connectorType)}</td>
        <td>${escapeHtml(row.item)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.recommendation)}</td>
      </tr>`).join('')}</tbody>
    </table>`;
}

function currentBimObjectLibrary() {
  return buildBimObjectLibraryPackage({
    catalogRows: getProductCatalogRows(),
    familyRows: getBimObjectFamilies(),
    projectState: currentProjectState(),
  });
}

function renderBimObjectLibrary() {
  const summaryContainer = document.getElementById('bim-object-library-readiness');
  const tableContainer = document.getElementById('bim-object-library-table');
  if (!summaryContainer || !tableContainer) return;
  const pkg = currentBimObjectLibrary();
  const metrics = [
    ['Families', pkg.summary.familyCount],
    ['Approved', pkg.summary.approvedFamilyCount],
    ['Ready catalog rows', `${pkg.summary.readyCatalogRows}/${pkg.summary.catalogRows}`],
    ['Missing families', pkg.summary.missingFamilyCount],
    ['Generic hints', pkg.summary.genericPlaceholderCount],
    ['Status', pkg.summary.status],
  ];
  summaryContainer.innerHTML = metrics.map(([label, value]) => `
    <div class="bim-stat">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>`).join('');
  tableContainer.innerHTML = `<table class="report-table bim-table">
    <thead><tr><th>Catalog Row</th><th>Category</th><th>Family</th><th>Format</th><th>Status</th><th>Warnings</th></tr></thead>
    <tbody>${pkg.catalogCoverage.rows.length ? pkg.catalogCoverage.rows.slice(0, 50).map(row => `<tr>
      <td>${escapeHtml(`${row.manufacturer} ${row.catalogNumber}`)}</td>
      <td>${escapeHtml(row.category)}</td>
      <td>${escapeHtml(row.familyName || 'n/a')}</td>
      <td>${escapeHtml(row.nativeFormat || 'generic')}</td>
      <td>${escapeHtml(row.status)}</td>
      <td>${escapeHtml(row.warnings.join('; '))}</td>
    </tr>`).join('') : '<tr><td colspan="6">No governed catalog rows are available for BIM family coverage.</td></tr>'}</tbody>
  </table>`;
}

function currentRevitSyncReadiness(payload = null) {
  return buildRevitSyncReadinessPackage({
    projectState: currentProjectState(),
    payload,
    bimObjectFamilies: getBimObjectFamilies(),
    productCatalog: getProductCatalogRows(),
  });
}

function renderRevitSyncReadiness(pkg = currentRevitSyncReadiness()) {
  const summaryContainer = document.getElementById('bim-revit-sync-readiness');
  const tableContainer = document.getElementById('bim-revit-sync-table');
  if (!summaryContainer || !tableContainer) return;
  const metrics = [
    ['Target', `Revit ${pkg.summary.targetVersion}`],
    ['Contract', pkg.summary.contractVersion],
    ['Status', pkg.summary.validationStatus],
    ['Commands', pkg.summary.commandCount],
    ['Preview', `${pkg.summary.acceptedPreviewRows}/${pkg.summary.rejectedPreviewRows}`],
    ['Warnings', pkg.summary.warningCount],
  ];
  summaryContainer.innerHTML = metrics.map(([label, value]) => `
    <div class="bim-stat">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>`).join('');
  tableContainer.innerHTML = `
    <table class="report-table bim-table">
      <thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>${pkg.validationRows.map(row => `<tr>
        <td>${escapeHtml(row.check)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.detail)}</td>
      </tr>`).join('')}</tbody>
    </table>
    <table class="report-table bim-table">
      <thead><tr><th>Revit Element</th><th>Type</th><th>GUID</th><th>Status</th><th>Recommendation</th></tr></thead>
      <tbody>${pkg.syncPreviewRows.length ? pkg.syncPreviewRows.slice(0, 25).map(row => `<tr>
        <td>${escapeHtml(row.tag || row.id)}</td>
        <td>${escapeHtml(row.elementType)}</td>
        <td>${escapeHtml(row.guid)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.recommendation)}</td>
      </tr>`).join('') : '<tr><td colspan="5">No Revit sync preview rows are loaded.</td></tr>'}</tbody>
    </table>`;
}

function currentRevitNativeSync(payload = null) {
  return buildRevitNativeSyncPackage({
    projectState: currentProjectState(),
    payload,
    bimObjectFamilies: getBimObjectFamilies(),
    productCatalog: getProductCatalogRows(),
  });
}

function renderRevitNativeSync(pkg = currentRevitNativeSync()) {
  const summaryContainer = document.getElementById('bim-revit-native-readiness');
  const tableContainer = document.getElementById('bim-revit-native-table');
  if (!summaryContainer || !tableContainer) return;
  const metrics = [
    ['Target', `Revit ${pkg.summary.targetVersion}`],
    ['Contract', pkg.summary.contractVersion],
    ['Status', pkg.summary.status],
    ['Commands', `${pkg.summary.commandReadyCount}/${pkg.summary.commandCount}`],
    ['Mappings', `${pkg.summary.readyMappingCount}/${pkg.summary.exportMappingCount}`],
    ['Preview', `${pkg.summary.acceptedPreviewRows}/${pkg.summary.rejectedPreviewRows}`],
    ['Warnings', pkg.summary.warningCount],
  ];
  summaryContainer.innerHTML = metrics.map(([label, value]) => `
    <div class="bim-stat">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>`).join('');
  tableContainer.innerHTML = `
    <table class="report-table bim-table">
      <thead><tr><th>Command</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>${pkg.commandRows.map(row => `<tr>
        <td>${escapeHtml(row.commandClass || row.commandName)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.detail)}</td>
      </tr>`).join('')}</tbody>
    </table>
    <table class="report-table bim-table">
      <thead><tr><th>Revit Category</th><th>Element Type</th><th>Project Type</th><th>Quantity</th><th>Status</th><th>Warnings</th></tr></thead>
      <tbody>${pkg.exportMappingRows.length ? pkg.exportMappingRows.map(row => `<tr>
        <td>${escapeHtml(row.revitCategory)}</td>
        <td>${escapeHtml(row.elementType)}</td>
        <td>${escapeHtml(row.mappedProjectType)}</td>
        <td>${escapeHtml(row.quantityBasis)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.warnings.join('; '))}</td>
      </tr>`).join('') : '<tr><td colspan="6">No native Revit export mapping rows.</td></tr>'}</tbody>
    </table>
    <table class="report-table bim-table">
      <thead><tr><th>Validation</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>${pkg.validationRows.map(row => `<tr>
        <td>${escapeHtml(row.check)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.detail)}</td>
      </tr>`).join('')}</tbody>
    </table>`;
}

function currentAutoCadSyncReadiness(payload = null) {
  return buildAutoCadSyncReadinessPackage({
    projectState: currentProjectState(),
    payload,
    bimObjectFamilies: getBimObjectFamilies(),
    productCatalog: getProductCatalogRows(),
  });
}

function renderAutoCadSyncReadiness(pkg = currentAutoCadSyncReadiness()) {
  const summaryContainer = document.getElementById('bim-autocad-sync-readiness');
  const tableContainer = document.getElementById('bim-autocad-sync-table');
  if (!summaryContainer || !tableContainer) return;
  const metrics = [
    ['Target', `${pkg.summary.targetApplication || 'AutoCAD'} ${pkg.summary.targetVersion}`],
    ['Contract', pkg.summary.contractVersion],
    ['Status', pkg.summary.validationStatus],
    ['Commands', pkg.summary.commandCount],
    ['Preview', `${pkg.summary.acceptedPreviewRows}/${pkg.summary.rejectedPreviewRows}`],
    ['Warnings', pkg.summary.warningCount],
  ];
  summaryContainer.innerHTML = metrics.map(([label, value]) => `
    <div class="bim-stat">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>`).join('');
  tableContainer.innerHTML = `
    <table class="report-table bim-table">
      <thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>${pkg.validationRows.map(row => `<tr>
        <td>${escapeHtml(row.check)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.detail)}</td>
      </tr>`).join('')}</tbody>
    </table>
    <table class="report-table bim-table">
      <thead><tr><th>CAD Element</th><th>Type</th><th>GUID/Handle</th><th>Status</th><th>Recommendation</th></tr></thead>
      <tbody>${pkg.syncPreviewRows.length ? pkg.syncPreviewRows.slice(0, 25).map(row => `<tr>
        <td>${escapeHtml(row.tag || row.id)}</td>
        <td>${escapeHtml(row.elementType)}</td>
        <td>${escapeHtml(row.guid)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.recommendation)}</td>
      </tr>`).join('') : '<tr><td colspan="5">No AutoCAD sync preview rows are loaded.</td></tr>'}</tbody>
    </table>`;
}

function currentAutoCadNativeSync(payload = null) {
  return buildAutoCadNativeSyncPackage({
    projectState: currentProjectState(),
    payload,
    bimObjectFamilies: getBimObjectFamilies(),
    productCatalog: getProductCatalogRows(),
  });
}

function renderAutoCadNativeSync(pkg = currentAutoCadNativeSync()) {
  const summaryContainer = document.getElementById('bim-autocad-native-readiness');
  const tableContainer = document.getElementById('bim-autocad-native-table');
  if (!summaryContainer || !tableContainer) return;
  const metrics = [
    ['Target', `${pkg.summary.targetApplication || 'AutoCAD'} ${pkg.summary.targetVersion}`],
    ['Contract', pkg.summary.contractVersion],
    ['Status', pkg.summary.status],
    ['Commands', `${pkg.summary.commandReadyCount}/${pkg.summary.commandCount}`],
    ['Mappings', `${pkg.summary.readyMappingCount}/${pkg.summary.exportMappingCount}`],
    ['Preview', `${pkg.summary.acceptedPreviewRows}/${pkg.summary.rejectedPreviewRows}`],
    ['Warnings', pkg.summary.warningCount],
  ];
  summaryContainer.innerHTML = metrics.map(([label, value]) => `
    <div class="bim-stat">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>`).join('');
  tableContainer.innerHTML = `
    <table class="report-table bim-table">
      <thead><tr><th>Command</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>${pkg.commandRows.map(row => `<tr>
        <td>${escapeHtml(row.commandClass || row.commandName)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.detail)}</td>
      </tr>`).join('')}</tbody>
    </table>
    <table class="report-table bim-table">
      <thead><tr><th>AutoCAD Object</th><th>Type</th><th>Layer / Block</th><th>Quantity</th><th>Status</th><th>Warnings</th></tr></thead>
      <tbody>${pkg.exportMappingRows.length ? pkg.exportMappingRows.map(row => `<tr>
        <td>${escapeHtml(row.autocadObjectType)}</td>
        <td>${escapeHtml(row.elementType)}</td>
        <td>${escapeHtml(`${row.layerPattern || ''} ${row.blockNamePattern || ''}`)}</td>
        <td>${escapeHtml(row.quantityBasis)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.warnings.join('; '))}</td>
      </tr>`).join('') : '<tr><td colspan="6">No AutoCAD native export mapping rows.</td></tr>'}</tbody>
    </table>
    <table class="report-table bim-table">
      <thead><tr><th>Validation</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>${pkg.validationRows.map(row => `<tr>
        <td>${escapeHtml(row.check)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.detail)}</td>
      </tr>`).join('')}</tbody>
    </table>`;
}

function currentPlantCadSyncReadiness(payload = null) {
  return buildPlantCadSyncReadinessPackage({
    projectState: currentProjectState(),
    payload,
    bimObjectFamilies: getBimObjectFamilies(),
    productCatalog: getProductCatalogRows(),
  });
}

function renderPlantCadSyncReadiness(pkg = currentPlantCadSyncReadiness()) {
  const summaryContainer = document.getElementById('bim-plantcad-sync-readiness');
  const tableContainer = document.getElementById('bim-plantcad-sync-table');
  if (!summaryContainer || !tableContainer) return;
  const metrics = [
    ['Connectors', pkg.summary.connectorTypes],
    ['Contract', pkg.summary.contractVersion],
    ['Status', pkg.summary.validationStatus],
    ['Descriptors', `${pkg.summary.descriptorValidCount}/${pkg.summary.descriptorCount}`],
    ['Preview', `${pkg.summary.acceptedPreviewRows}/${pkg.summary.rejectedPreviewRows}`],
    ['Warnings', pkg.summary.warningCount],
  ];
  summaryContainer.innerHTML = metrics.map(([label, value]) => `
    <div class="bim-stat">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>`).join('');
  tableContainer.innerHTML = `
    <table class="report-table bim-table">
      <thead><tr><th>Connector</th><th>Target</th><th>Version</th><th>Templates</th><th>Warnings</th></tr></thead>
      <tbody>${pkg.descriptors.map(row => `<tr>
        <td>${escapeHtml(row.connectorType)}</td>
        <td>${escapeHtml(row.targetApplication)}</td>
        <td>${escapeHtml(row.targetVersion)}</td>
        <td>${escapeHtml(row.templateFiles.length)}</td>
        <td>${escapeHtml(row.warnings.join('; '))}</td>
      </tr>`).join('')}</tbody>
    </table>
    <table class="report-table bim-table">
      <thead><tr><th>Check</th><th>Connector</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>${pkg.validationRows.map(row => `<tr>
        <td>${escapeHtml(row.check)}</td>
        <td>${escapeHtml(row.connectorType)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.detail)}</td>
      </tr>`).join('')}</tbody>
    </table>
    <table class="report-table bim-table">
      <thead><tr><th>Plant Element</th><th>Connector</th><th>Type</th><th>GUID/Source</th><th>Status</th><th>Recommendation</th></tr></thead>
      <tbody>${pkg.syncPreviewRows.length ? pkg.syncPreviewRows.slice(0, 25).map(row => `<tr>
        <td>${escapeHtml(row.tag || row.id)}</td>
        <td>${escapeHtml(row.connectorType)}</td>
        <td>${escapeHtml(row.elementType)}</td>
        <td>${escapeHtml(row.guid)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.recommendation)}</td>
      </tr>`).join('') : '<tr><td colspan="6">No plant-CAD sync preview rows are loaded.</td></tr>'}</tbody>
    </table>`;
}

function currentPlantCadNativeSync(payload = null) {
  return buildPlantCadNativeSyncPackage({
    projectState: currentProjectState(),
    payload,
    bimObjectFamilies: getBimObjectFamilies(),
    productCatalog: getProductCatalogRows(),
  });
}

function renderPlantCadNativeSync(pkg = currentPlantCadNativeSync()) {
  const summaryContainer = document.getElementById('bim-plantcad-native-readiness');
  const tableContainer = document.getElementById('bim-plantcad-native-table');
  if (!summaryContainer || !tableContainer) return;
  const metrics = [
    ['Connectors', pkg.summary.connectorTypes],
    ['Contract', pkg.summary.contractVersion],
    ['Status', pkg.summary.status],
    ['Commands', `${pkg.summary.commandReadyCount}/${pkg.summary.commandCount}`],
    ['Mappings', `${pkg.summary.readyMappingCount}/${pkg.summary.exportMappingCount}`],
    ['Preview', `${pkg.summary.acceptedPreviewRows}/${pkg.summary.rejectedPreviewRows}`],
    ['Warnings', pkg.summary.warningCount],
  ];
  summaryContainer.innerHTML = metrics.map(([label, value]) => `
    <div class="bim-stat">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>`).join('');
  tableContainer.innerHTML = `
    <table class="report-table bim-table">
      <thead><tr><th>Connector</th><th>Command</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>${pkg.commandRows.map(row => `<tr>
        <td>${escapeHtml(row.connectorType)}</td>
        <td>${escapeHtml(row.commandName)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.detail)}</td>
      </tr>`).join('')}</tbody>
    </table>
    <table class="report-table bim-table">
      <thead><tr><th>Plant Object</th><th>Element Type</th><th>Native Classes</th><th>Quantity</th><th>Status</th><th>Warnings</th></tr></thead>
      <tbody>${pkg.exportMappingRows.map(row => `<tr>
        <td>${escapeHtml(row.plantObjectType)}</td>
        <td>${escapeHtml(row.elementType)}</td>
        <td>${escapeHtml(row.nativeClasses)}</td>
        <td>${escapeHtml(row.quantityBasis)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.warnings.join('; '))}</td>
      </tr>`).join('')}</tbody>
    </table>
    <table class="report-table bim-table">
      <thead><tr><th>Validation</th><th>Connector</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>${pkg.validationRows.map(row => `<tr>
        <td>${escapeHtml(row.check)}</td>
        <td>${escapeHtml(row.connectorType || '')}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.detail)}</td>
      </tr>`).join('')}</tbody>
    </table>`;
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
  const pkg = buildConnectorExportPackage(currentProjectState(), {
    connectorType,
    bimObjectFamilies: getBimObjectFamilies(),
    productCatalog: getProductCatalogRows(),
  });
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
  renderNativeConnectorKit();
  renderBimObjectLibrary();
  renderRevitSyncReadiness();
  renderRevitNativeSync();
  renderAutoCadSyncReadiness();
  renderAutoCadNativeSync();
  renderPlantCadSyncReadiness();
  renderPlantCadNativeSync();
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
  document.getElementById('bim-export-aveva-connector')?.addEventListener('click', () => exportConnectorPackage('aveva'));
  document.getElementById('bim-export-smartplant-connector')?.addEventListener('click', () => exportConnectorPackage('smartplant'));
  document.getElementById('bim-export-generic-connector')?.addEventListener('click', () => exportConnectorPackage('generic'));
  document.getElementById('bim-connector-file')?.addEventListener('change', event => previewConnectorFile(event.target.files?.[0]));
  document.getElementById('bim-connector-accept')?.addEventListener('click', acceptConnectorPreview);
  document.getElementById('bim-native-export-descriptor')?.addEventListener('click', () => {
    const pkg = currentNativeConnectorKit();
    downloadText('native-bim-connector-descriptors.json', JSON.stringify({
      version: pkg.version,
      descriptors: pkg.descriptors,
      manifests: pkg.manifests,
      installChecklist: pkg.installChecklist,
    }, null, 2));
  });
  document.getElementById('bim-native-export-revit-sample')?.addEventListener('click', () => {
    const sample = currentNativeConnectorKit().samplePayloads.find(row => row.connectorType === 'revit');
    downloadText('revit-native-connector-sample.json', JSON.stringify(sample, null, 2));
  });
  document.getElementById('bim-native-export-autocad-sample')?.addEventListener('click', () => {
    const sample = currentNativeConnectorKit().samplePayloads.find(row => row.connectorType === 'autocad');
    downloadText('autocad-native-connector-sample.json', JSON.stringify(sample, null, 2));
  });
  document.getElementById('bim-native-export-plantcad-sample')?.addEventListener('click', () => {
    const samples = currentNativeConnectorKit().samplePayloads.filter(row => row.connectorType === 'aveva' || row.connectorType === 'smartplant');
    downloadText('plantcad-native-connector-samples.json', JSON.stringify(samples, null, 2));
  });
  document.getElementById('bim-native-export-html')?.addEventListener('click', () => {
    const pkg = currentNativeConnectorKit();
    downloadText('native-bim-connector-kit.html', `<!doctype html><html><body>${renderNativeConnectorKitHTML(pkg)}</body></html>`, 'text/html');
  });
  document.getElementById('bim-revit-export-descriptor')?.addEventListener('click', () => {
    const pkg = currentRevitSyncReadiness();
    downloadText('revit-bridge-descriptor.json', JSON.stringify({
      version: pkg.version,
      descriptor: pkg.descriptor,
      validationRows: pkg.validationRows,
    }, null, 2));
  });
  document.getElementById('bim-revit-export-sample')?.addEventListener('click', () => {
    const request = buildRevitExportRequest(currentProjectState(), {
      bimObjectFamilies: getBimObjectFamilies(),
      productCatalog: getProductCatalogRows(),
    });
    downloadText('revit-bridge-sample-payload.json', JSON.stringify(request.connectorPackage, null, 2));
  });
  document.getElementById('bim-revit-export-addin')?.addEventListener('click', () => {
    const pkg = currentRevitSyncReadiness();
    downloadText('CableTrayRoute.RevitConnector.addin', pkg.descriptor.addinManifest || '', 'application/xml');
  });
  document.getElementById('bim-revit-export-html')?.addEventListener('click', () => {
    const pkg = currentRevitSyncReadiness();
    downloadText('revit-sync-readiness.html', `<!doctype html><html><body>${renderRevitSyncReadinessHTML(pkg)}</body></html>`, 'text/html');
  });
  document.getElementById('bim-revit-file')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const validation = validateRevitConnectorPayload(text);
    const preview = buildRevitRoundTripPreview({ payload: text, projectState: currentProjectState() });
    const pkg = currentRevitSyncReadiness(validation.package);
    renderRevitSyncReadiness(pkg);
    renderConnectorPreview(validation, preview);
    pendingConnectorPackage = validation.package;
    pendingConnectorPreview = preview;
    setStatus(`Previewed Revit bridge package: ${preview.acceptedElements.length} accepted, ${preview.rejectedElements.length} rejected.`, validation.valid ? 'success' : 'warn');
  });
  document.getElementById('bim-revit-native-export-manifest')?.addEventListener('click', () => {
    const pkg = currentRevitNativeSync();
    downloadText('revit-native-source-manifest.json', JSON.stringify({
      version: pkg.version,
      nativeSyncCase: pkg.nativeSyncCase,
      sourceManifest: pkg.sourceManifest,
      commandRows: pkg.commandRows,
      exportMappingRows: pkg.exportMappingRows,
      validationRows: pkg.validationRows,
    }, null, 2));
  });
  document.getElementById('bim-revit-native-export-sample')?.addEventListener('click', () => {
    const pkg = currentRevitNativeSync();
    downloadText('revit-native-sync-sample-payload.json', JSON.stringify(pkg.samplePayload, null, 2));
  });
  document.getElementById('bim-revit-native-export-addin')?.addEventListener('click', () => {
    const pkg = currentRevitNativeSync();
    downloadText('CableTrayRoute.RevitConnector.addin', pkg.nativeSyncCase?.descriptor?.addinManifest || '', 'application/xml');
  });
  document.getElementById('bim-revit-native-export-validation')?.addEventListener('click', () => {
    const pkg = currentRevitNativeSync();
    downloadText('revit-native-sync-bridge-validation.json', JSON.stringify({
      summary: pkg.summary,
      validationRows: pkg.validationRows,
      syncPreviewRows: pkg.syncPreviewRows,
      warningRows: pkg.warningRows,
    }, null, 2));
  });
  document.getElementById('bim-revit-native-export-html')?.addEventListener('click', () => {
    const pkg = currentRevitNativeSync();
    downloadText('revit-native-sync-readiness.html', `<!doctype html><html><body>${renderRevitNativeSyncHTML(pkg)}</body></html>`, 'text/html');
  });
  document.getElementById('bim-revit-native-file')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const validation = validateRevitConnectorPayload(text);
    const preview = buildRevitRoundTripPreview({ payload: text, projectState: currentProjectState() });
    const pkg = currentRevitNativeSync(validation.package);
    renderRevitNativeSync(pkg);
    renderConnectorPreview(validation, preview);
    pendingConnectorPackage = validation.package;
    pendingConnectorPreview = preview;
    setStatus(`Previewed functional Revit add-in return package: ${preview.acceptedElements.length} accepted, ${preview.rejectedElements.length} rejected.`, validation.valid ? 'success' : 'warn');
  });
  document.getElementById('bim-autocad-export-descriptor')?.addEventListener('click', () => {
    const pkg = currentAutoCadSyncReadiness();
    downloadText('autocad-bridge-descriptor.json', JSON.stringify({
      version: pkg.version,
      descriptor: pkg.descriptor,
      validationRows: pkg.validationRows,
    }, null, 2));
  });
  document.getElementById('bim-autocad-export-sample')?.addEventListener('click', () => {
    const request = buildAutoCadExportRequest(currentProjectState(), {
      bimObjectFamilies: getBimObjectFamilies(),
      productCatalog: getProductCatalogRows(),
    });
    downloadText('autocad-bridge-sample-payload.json', JSON.stringify(request.connectorPackage, null, 2));
  });
  document.getElementById('bim-autocad-export-packagecontents')?.addEventListener('click', () => {
    const pkg = currentAutoCadSyncReadiness();
    downloadText('PackageContents.xml', pkg.descriptor.packageContentsXml || '', 'application/xml');
  });
  document.getElementById('bim-autocad-export-html')?.addEventListener('click', () => {
    const pkg = currentAutoCadSyncReadiness();
    downloadText('autocad-sync-readiness.html', `<!doctype html><html><body>${renderAutoCadSyncReadinessHTML(pkg)}</body></html>`, 'text/html');
  });
  document.getElementById('bim-autocad-file')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const validation = validateAutoCadConnectorPayload(text);
    const preview = buildAutoCadRoundTripPreview({ payload: text, projectState: currentProjectState() });
    const pkg = currentAutoCadSyncReadiness(validation.package);
    renderAutoCadSyncReadiness(pkg);
    renderConnectorPreview(validation, preview);
    pendingConnectorPackage = validation.package;
    pendingConnectorPreview = preview;
    setStatus(`Previewed AutoCAD bridge package: ${preview.acceptedElements.length} accepted, ${preview.rejectedElements.length} rejected.`, validation.valid ? 'success' : 'warn');
  });
  document.getElementById('bim-autocad-native-export-manifest')?.addEventListener('click', () => {
    const pkg = currentAutoCadNativeSync();
    downloadText('autocad-native-source-manifest.json', JSON.stringify({
      version: pkg.version,
      nativeSyncCase: pkg.nativeSyncCase,
      sourceManifest: pkg.sourceManifest,
      commandRows: pkg.commandRows,
      exportMappingRows: pkg.exportMappingRows,
      validationRows: pkg.validationRows,
    }, null, 2));
  });
  document.getElementById('bim-autocad-native-export-sample')?.addEventListener('click', () => {
    const pkg = currentAutoCadNativeSync();
    downloadText('autocad-native-sync-sample-payload.json', JSON.stringify(pkg.samplePayload, null, 2));
  });
  document.getElementById('bim-autocad-native-export-packagecontents')?.addEventListener('click', () => {
    const pkg = currentAutoCadNativeSync();
    downloadText('PackageContents.xml', pkg.nativeSyncCase?.descriptor?.packageContentsXml || '', 'application/xml');
  });
  document.getElementById('bim-autocad-native-export-validation')?.addEventListener('click', () => {
    const pkg = currentAutoCadNativeSync();
    downloadText('autocad-native-sync-bridge-validation.json', JSON.stringify({
      summary: pkg.summary,
      validationRows: pkg.validationRows,
      syncPreviewRows: pkg.syncPreviewRows,
      warningRows: pkg.warningRows,
    }, null, 2));
  });
  document.getElementById('bim-autocad-native-export-html')?.addEventListener('click', () => {
    const pkg = currentAutoCadNativeSync();
    downloadText('autocad-native-sync-readiness.html', `<!doctype html><html><body>${renderAutoCadNativeSyncHTML(pkg)}</body></html>`, 'text/html');
  });
  document.getElementById('bim-autocad-native-file')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const validation = validateAutoCadConnectorPayload(text);
    const preview = buildAutoCadRoundTripPreview({ payload: text, projectState: currentProjectState() });
    const pkg = currentAutoCadNativeSync(validation.package);
    renderAutoCadNativeSync(pkg);
    renderConnectorPreview(validation, preview);
    pendingConnectorPackage = validation.package;
    pendingConnectorPreview = preview;
    setStatus(`Previewed functional AutoCAD add-in return package: ${preview.acceptedElements.length} accepted, ${preview.rejectedElements.length} rejected.`, validation.valid ? 'success' : 'warn');
  });
  document.getElementById('bim-plantcad-export-descriptors')?.addEventListener('click', () => {
    const pkg = currentPlantCadSyncReadiness();
    downloadText('plantcad-bridge-descriptors.json', JSON.stringify({
      version: pkg.version,
      descriptors: pkg.descriptors,
      validationRows: pkg.validationRows,
    }, null, 2));
  });
  document.getElementById('bim-plantcad-export-aveva')?.addEventListener('click', () => {
    const request = buildPlantCadExportRequest(currentProjectState(), {
      descriptor: { connectorType: 'aveva' },
      bimObjectFamilies: getBimObjectFamilies(),
      productCatalog: getProductCatalogRows(),
    });
    downloadText('aveva-bridge-sample-payload.json', JSON.stringify(request.connectorPackage, null, 2));
  });
  document.getElementById('bim-plantcad-export-smartplant')?.addEventListener('click', () => {
    const request = buildPlantCadExportRequest(currentProjectState(), {
      descriptor: { connectorType: 'smartplant' },
      bimObjectFamilies: getBimObjectFamilies(),
      productCatalog: getProductCatalogRows(),
    });
    downloadText('smartplant-bridge-sample-payload.json', JSON.stringify(request.connectorPackage, null, 2));
  });
  document.getElementById('bim-plantcad-export-html')?.addEventListener('click', () => {
    const pkg = currentPlantCadSyncReadiness();
    downloadText('plantcad-sync-readiness.html', `<!doctype html><html><body>${renderPlantCadSyncReadinessHTML(pkg)}</body></html>`, 'text/html');
  });
  document.getElementById('bim-plantcad-file')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const validation = validatePlantCadConnectorPayload(text);
    const preview = buildPlantCadRoundTripPreview({ payload: text, projectState: currentProjectState() });
    const pkg = currentPlantCadSyncReadiness(validation.package);
    renderPlantCadSyncReadiness(pkg);
    renderConnectorPreview(validation, preview);
    pendingConnectorPackage = validation.package;
    pendingConnectorPreview = preview;
    setStatus(`Previewed plant-CAD bridge package: ${preview.acceptedElements.length} accepted, ${preview.rejectedElements.length} rejected.`, validation.valid ? 'success' : 'warn');
  });
  document.getElementById('bim-plantcad-native-export-manifest')?.addEventListener('click', () => {
    const pkg = currentPlantCadNativeSync();
    downloadText('plantcad-native-source-manifest.json', JSON.stringify({
      version: pkg.version,
      nativeSyncCase: pkg.nativeSyncCase,
      sourceManifest: pkg.sourceManifest,
      commandRows: pkg.commandRows,
      exportMappingRows: pkg.exportMappingRows,
      validationRows: pkg.validationRows,
    }, null, 2));
  });
  document.getElementById('bim-plantcad-native-export-aveva')?.addEventListener('click', () => {
    const pkg = currentPlantCadNativeSync();
    const sample = pkg.samplePayloads.find(row => row.connectorType === 'aveva') || pkg.samplePayloads[0];
    downloadText('aveva-native-sync-sample-payload.json', JSON.stringify(sample, null, 2));
  });
  document.getElementById('bim-plantcad-native-export-smartplant')?.addEventListener('click', () => {
    const pkg = currentPlantCadNativeSync();
    const sample = pkg.samplePayloads.find(row => row.connectorType === 'smartplant') || pkg.samplePayloads[0];
    downloadText('smartplant-native-sync-sample-payload.json', JSON.stringify(sample, null, 2));
  });
  document.getElementById('bim-plantcad-native-export-template')?.addEventListener('click', () => {
    const pkg = currentPlantCadNativeSync();
    downloadText('plantcad-native-template-bundle.json', JSON.stringify({
      templateFiles: pkg.sourceManifest.templateFiles,
      commandRows: pkg.commandRows,
      assumptions: pkg.assumptions,
    }, null, 2));
  });
  document.getElementById('bim-plantcad-native-export-validation')?.addEventListener('click', () => {
    const pkg = currentPlantCadNativeSync();
    downloadText('plantcad-native-sync-bridge-validation.json', JSON.stringify({
      summary: pkg.summary,
      validationRows: pkg.validationRows,
      syncPreviewRows: pkg.syncPreviewRows,
      warningRows: pkg.warningRows,
    }, null, 2));
  });
  document.getElementById('bim-plantcad-native-export-html')?.addEventListener('click', () => {
    const pkg = currentPlantCadNativeSync();
    downloadText('plantcad-native-sync-readiness.html', `<!doctype html><html><body>${renderPlantCadNativeSyncHTML(pkg)}</body></html>`, 'text/html');
  });
  document.getElementById('bim-plantcad-native-file')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const validation = validatePlantCadConnectorPayload(text);
    const preview = buildPlantCadRoundTripPreview({ payload: text, projectState: currentProjectState() });
    const pkg = currentPlantCadNativeSync(validation.package);
    renderPlantCadNativeSync(pkg);
    renderConnectorPreview(validation, preview);
    pendingConnectorPackage = validation.package;
    pendingConnectorPreview = preview;
    setStatus(`Previewed functional plant-CAD add-in return package: ${preview.acceptedElements.length} accepted, ${preview.rejectedElements.length} rejected.`, validation.valid ? 'success' : 'warn');
  });
  document.getElementById('bim-object-library-export-json')?.addEventListener('click', () => {
    downloadText('bim-object-library-package.json', JSON.stringify(currentBimObjectLibrary(), null, 2));
  });
  document.getElementById('bim-object-library-export-html')?.addEventListener('click', () => {
    downloadText('bim-object-library-package.html', `<!doctype html><html><body>${renderBimObjectLibraryHTML(currentBimObjectLibrary())}</body></html>`, 'text/html');
  });
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
