import {
  buildBimQuantityReconciliation,
  createBimIssue,
  mapBimElementsToProject,
  normalizeBimElement,
} from './bimRoundTrip.mjs';
import {
  buildBimObjectConnectorHints,
  buildBimObjectPropertySets,
} from './bimObjectLibrary.mjs';

export const BIM_CONNECTOR_CONTRACT_VERSION = 'bim-connector-contract-v1';

export const BIM_CONNECTOR_SUPPORTED_TYPES = ['revit', 'autocad', 'aveva', 'smartplant', 'generic'];

export const BIM_CONNECTOR_PACKAGE_SCHEMA = Object.freeze({
  version: BIM_CONNECTOR_CONTRACT_VERSION,
  requiredFields: [
    'version',
    'connectorType',
    'sourceApplication',
    'projectId',
    'scenario',
    'createdAt',
    'elements',
    'quantities',
    'issues',
    'propertySets',
    'mappingHints',
    'warnings',
    'assumptions',
  ],
  connectorTypes: BIM_CONNECTOR_SUPPORTED_TYPES,
  elementFields: [
    'id',
    'guid',
    'sourceId',
    'sourceFile',
    'elementType',
    'tag',
    'name',
    'level',
    'area',
    'system',
    'dimensions',
    'lengthFt',
    'quantity',
    'mappedProjectId',
  ],
  quantityFields: ['elementType', 'system', 'voltageClass', 'level', 'area', 'quantity', 'unit', 'sourceIds'],
  issueFields: ['id', 'title', 'description', 'status', 'priority', 'assignee', 'elementIds', 'comments'],
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringValue(value = '') {
  return String(value ?? '').trim();
}

function numberValue(value, fallback = null) {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value = '') {
  let result = 2166136261;
  const input = String(value);
  for (let index = 0; index < input.length; index += 1) {
    result ^= input.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
}

function slug(value = '') {
  return stringValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeConnectorType(value = '') {
  const raw = stringValue(value || 'generic').toLowerCase().replace(/[\s_-]+/g, '');
  if (['revit', 'rvt', 'autodeskrevit'].includes(raw)) return 'revit';
  if (['autocad', 'acad', 'cad', 'autocadmep', 'civil3d'].includes(raw)) return 'autocad';
  if (['aveva', 'e3d', 'pdms', 'avevae3d', 'avevapdms'].includes(raw)) return 'aveva';
  if (['smartplant', 'sp3d', 'hexagonsmartplant', 'hexagonsmartplant3d', 'smartplant3d'].includes(raw)) return 'smartplant';
  if (['generic', 'ifc', 'bim', 'connector', 'other'].includes(raw)) return 'generic';
  return stringValue(value || 'generic').toLowerCase();
}

function defaultApplication(type) {
  if (type === 'revit') return 'Autodesk Revit Connector';
  if (type === 'autocad') return 'AutoCAD Connector';
  if (type === 'aveva') return 'AVEVA E3D / PDMS Connector';
  if (type === 'smartplant') return 'Hexagon SmartPlant 3D Connector';
  return 'Generic BIM/CAD Connector';
}

function parsePayload(payload) {
  if (typeof payload !== 'string') return asObject(payload);
  try {
    return asObject(JSON.parse(payload));
  } catch {
    return {};
  }
}

function normalizeQuantityRow(row = {}) {
  const source = asObject(row);
  return {
    elementType: stringValue(source.elementType || source.type || 'generic'),
    system: stringValue(source.system || 'Unassigned'),
    voltageClass: stringValue(source.voltageClass || source.voltage || 'Unassigned'),
    level: stringValue(source.level || 'Unassigned'),
    area: stringValue(source.area || 'Unassigned'),
    quantity: numberValue(source.quantity ?? source.lengthFt ?? source.count, 0),
    unit: stringValue(source.unit || (source.lengthFt !== undefined ? 'ft' : 'ea')),
    sourceIds: asArray(source.sourceIds).map(stringValue).filter(Boolean),
  };
}

function constructionProperties(row = {}) {
  return [
    'supportFamily',
    'supportType',
    'supportSpacingFt',
    'accessoryKits',
    'dividerLane',
    'constructionPhase',
    'constructionStatus',
    'drawingRef',
    'detailRef',
    'labelId',
    'sectionRef',
    'installArea',
    'constructionNotes',
  ].reduce((props, key) => {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') props[key] = row[key];
    return props;
  }, {});
}

function projectElements(projectState = {}) {
  const state = asObject(projectState);
  return [
    ...asArray(state.trays).map(row => normalizeBimElement({
      ...row,
      elementType: 'cableTray',
      tag: row.tray_id || row.id || row.tag,
      sourceId: row.id || row.tray_id,
      mappedProjectId: row.id || row.tray_id,
      lengthFt: row.lengthFt ?? row.length_ft ?? row.length,
      sourceProperties: {
        ...asObject(row.sourceProperties),
        racewayConstruction: constructionProperties(row),
      },
    })),
    ...asArray(state.conduits).map(row => normalizeBimElement({
      ...row,
      elementType: 'conduit',
      tag: row.conduit_id || row.id || row.tag,
      sourceId: row.id || row.conduit_id,
      mappedProjectId: row.id || row.conduit_id,
      lengthFt: row.lengthFt ?? row.length_ft ?? row.length,
      sourceProperties: {
        ...asObject(row.sourceProperties),
        racewayConstruction: constructionProperties(row),
      },
    })),
    ...asArray(state.equipment).map(row => normalizeBimElement({
      ...row,
      elementType: 'equipment',
      tag: row.tag || row.id || row.equipment_id,
      sourceId: row.id || row.equipment_id || row.tag,
      mappedProjectId: row.id || row.equipment_id || row.tag,
      quantity: 1,
    })),
    ...asArray(state.cables).map(row => normalizeBimElement({
      ...row,
      elementType: 'cable',
      tag: row.tag || row.id || row.cable_id,
      sourceId: row.id || row.cable_id || row.tag,
      mappedProjectId: row.id || row.cable_id || row.tag,
      lengthFt: row.lengthFt ?? row.length_ft ?? row.length,
    })),
  ];
}

function buildMappingHints(elements = []) {
  return asArray(elements).map(row => ({
    elementId: row.id,
    guid: row.guid,
    sourceId: row.sourceId,
    tag: row.tag,
    elementType: row.elementType,
    projectType: row.elementType,
    mappedProjectId: row.mappedProjectId || row.sourceId || row.tag || '',
    confidence: row.mappedProjectId ? 1 : row.sourceId || row.tag ? 0.8 : 0.2,
  }));
}

function connectorId(pkg) {
  return `connector-${slug(pkg.connectorType)}-${hash(stableStringify({
    projectId: pkg.projectId,
    scenario: pkg.scenario,
    createdAt: pkg.createdAt,
    elements: asArray(pkg.elements).map(row => row.id || row.guid || row.sourceId || row.tag),
  }))}`;
}

export function normalizeConnectorManifest(payload = {}) {
  const source = parsePayload(payload);
  const connectorType = normalizeConnectorType(source.connectorType || source.type || source.connector);
  const createdAt = source.createdAt || source.generatedAt || new Date().toISOString();
  const elements = asArray(source.elements || source.bimElements || source.modelElements).map(normalizeBimElement);
  const issues = asArray(source.issues || source.bimIssues).map(issue => createBimIssue(issue));
  const quantities = asArray(source.quantities || source.quantityRows).map(normalizeQuantityRow);
  const warnings = asArray(source.warnings).map(stringValue).filter(Boolean);
  const pkg = {
    id: stringValue(source.id),
    version: stringValue(source.version || BIM_CONNECTOR_CONTRACT_VERSION),
    connectorType,
    sourceApplication: stringValue(source.sourceApplication || source.application || defaultApplication(connectorType)),
    sourceVersion: stringValue(source.sourceVersion || source.applicationVersion || ''),
    projectId: stringValue(source.projectId || source.projectName || 'CableTrayRoute Project'),
    scenario: stringValue(source.scenario || 'Default'),
    createdAt,
    elements,
    quantities,
    issues,
    propertySets: asArray(source.propertySets).map(asObject),
    mappingHints: asArray(source.mappingHints).map(asObject),
    warnings,
    assumptions: asArray(source.assumptions).map(stringValue).filter(Boolean),
  };
  return {
    ...pkg,
    id: pkg.id || connectorId(pkg),
    assumptions: pkg.assumptions.length ? pkg.assumptions : [
      'Connector package is a browser-local exchange contract for external desktop add-ins.',
      'Native Revit, AutoCAD, AVEVA, and SmartPlant plugins are not included in this V1 package.',
      'Connector imports are preview/review records and do not automatically mutate project schedules or BIM authoring models.',
    ],
  };
}

export function buildConnectorExportPackage(projectState = {}, options = {}) {
  const connectorType = normalizeConnectorType(options.connectorType || 'generic');
  const state = asObject(projectState);
  const bimObjectFamilies = asArray(options.bimObjectFamilies || state.bimObjectFamilies);
  const productCatalog = asArray(options.productCatalog || state.productCatalog || state.catalogRows);
  const elements = [
    ...projectElements(state),
    ...asArray(state.bimElements).map(normalizeBimElement),
  ];
  const issues = asArray(state.bimIssues).map(issue => createBimIssue(issue));
  const reconciliation = buildBimQuantityReconciliation({
    bimElements: asArray(state.bimElements),
    projectState: state,
    mappings: mapBimElementsToProject({
      bimElements: asArray(state.bimElements),
      cables: state.cables,
      trays: state.trays,
      conduits: state.conduits,
      equipment: state.equipment,
    }),
  });
  return normalizeConnectorManifest({
    version: BIM_CONNECTOR_CONTRACT_VERSION,
    connectorType,
    sourceApplication: options.sourceApplication || defaultApplication(connectorType),
    sourceVersion: options.sourceVersion || '',
    projectId: options.projectId || state.projectId || state.projectName || state.name || 'CableTrayRoute Project',
    scenario: options.scenario || state.scenario || 'Default',
    createdAt: options.createdAt || new Date().toISOString(),
    elements,
    quantities: asArray(reconciliation.rows).map(row => ({
      elementType: row.elementType,
      system: row.system,
      voltageClass: row.voltageClass,
      level: row.level,
      area: row.area,
      quantity: row.projectQuantity,
      unit: ['cableTray', 'conduit', 'cable'].includes(row.elementType) ? 'ft' : 'ea',
      sourceIds: row.projectSourceIds,
    })),
    issues,
    propertySets: [
      { name: 'CableTrayRoute.Project', properties: { projectId: options.projectId || state.projectName || state.name || '' } },
      { name: 'CableTrayRoute.Sync', properties: { connectorType, contractVersion: BIM_CONNECTOR_CONTRACT_VERSION } },
      { name: 'CableTrayRoute.RacewayConstruction', properties: { fields: ['supportFamily', 'supportType', 'supportSpacingFt', 'accessoryKits', 'dividerLane', 'constructionPhase', 'constructionStatus', 'drawingRef', 'detailRef', 'labelId', 'sectionRef', 'installArea', 'constructionNotes'] } },
      ...buildBimObjectPropertySets({ familyRows: bimObjectFamilies, catalogRows: productCatalog }),
    ],
    mappingHints: [
      ...buildMappingHints(elements),
      ...buildBimObjectConnectorHints({ familyRows: bimObjectFamilies, projectState: state }),
    ],
    warnings: [],
  });
}

export function validateConnectorImportPackage(payload = {}, options = {}) {
  const pkg = normalizeConnectorManifest(payload);
  const errors = [];
  const warnings = [...pkg.warnings];
  if (!payload || typeof payload !== 'object' && typeof payload !== 'string') errors.push('Connector import payload must be an object or JSON string.');
  const raw = parsePayload(payload);
  if (!raw.version) errors.push('Connector import package is missing version.');
  if (pkg.version !== BIM_CONNECTOR_CONTRACT_VERSION && options.allowFutureVersion !== true) {
    errors.push(`Unsupported connector contract version: ${pkg.version || 'blank'}.`);
  }
  if (!BIM_CONNECTOR_SUPPORTED_TYPES.includes(pkg.connectorType)) errors.push(`Unsupported connector type: ${pkg.connectorType || 'blank'}.`);
  const ids = new Set();
  pkg.elements.forEach((element, index) => {
    const key = element.id || element.guid || element.sourceId || element.tag;
    if (!key) errors.push(`Element ${index + 1} is missing id, GUID, source ID, or tag.`);
    if (key && ids.has(key)) errors.push(`Duplicate connector element identifier: ${key}.`);
    if (key) ids.add(key);
    if (!element.elementType) errors.push(`Element ${key || index + 1} is missing elementType.`);
    if (asArray(element.warnings).some(warning => warning.includes('no stable GUID'))) errors.push(`Element ${index + 1} is missing id, GUID, source ID, or tag.`);
    if (!element.tag && !element.name) warnings.push(`Element ${key || index + 1} has no tag or name for review.`);
  });
  return {
    valid: errors.length === 0,
    package: pkg,
    errors,
    warnings,
  };
}

function elementKey(row = {}) {
  return stringValue(row.guid || row.sourceId || row.id || row.tag || row.name).toLowerCase();
}

function diffElements(previous = [], next = []) {
  const prev = new Map(asArray(previous).map(row => [elementKey(row), row]).filter(([key]) => key));
  const curr = new Map(asArray(next).map(row => [elementKey(row), row]).filter(([key]) => key));
  const added = [];
  const removed = [];
  const changed = [];
  curr.forEach((row, key) => {
    if (!prev.has(key)) {
      added.push(row);
    } else if (stableStringify(prev.get(key)) !== stableStringify(row)) {
      changed.push({ previous: prev.get(key), next: row });
    }
  });
  prev.forEach((row, key) => {
    if (!curr.has(key)) removed.push(row);
  });
  return { added, removed, changed, addedCount: added.length, removedCount: removed.length, changedCount: changed.length };
}

export function applyConnectorImportPreview({ payload = {}, projectState = {} } = {}) {
  const validation = validateConnectorImportPackage(payload);
  const pkg = validation.package;
  const mappings = mapBimElementsToProject({
    bimElements: pkg.elements,
    cables: projectState.cables,
    trays: projectState.trays,
    conduits: projectState.conduits,
    equipment: projectState.equipment,
  });
  const mappedByElementId = new Map(mappings.map(row => [row.elementId, row]));
  const acceptedElements = [];
  const rejectedElements = [];
  pkg.elements.forEach(element => {
    const errors = [];
    if (!elementKey(element) || asArray(element.warnings).some(warning => warning.includes('no stable GUID'))) errors.push('Missing stable identifier.');
    if (!BIM_CONNECTOR_SUPPORTED_TYPES.includes(pkg.connectorType)) errors.push('Unsupported connector type.');
    if (errors.length) {
      rejectedElements.push({ element, errors });
    } else {
      acceptedElements.push({
        ...element,
        mappedProjectId: element.mappedProjectId || mappedByElementId.get(element.id)?.projectId || '',
        mappingConfidence: element.mappingConfidence || mappedByElementId.get(element.id)?.confidence || 0,
      });
    }
  });
  const quantityReconciliation = buildBimQuantityReconciliation({
    bimElements: acceptedElements,
    projectState,
    mappings,
  });
  const mappingDeltas = mappings.filter(row => row.status !== 'mapped' || row.confidence < 0.8);
  const quantityDeltas = asArray(quantityReconciliation.rows).filter(row => row.status !== 'matched');
  const warnings = [
    ...validation.warnings,
    ...validation.errors,
    ...quantityDeltas.slice(0, 10).map(row => `${row.elementType} ${row.system || 'Unassigned'} quantity delta ${row.delta}.`),
  ];
  return {
    acceptedElements,
    rejectedElements,
    newIssues: pkg.issues,
    quantityDeltas,
    mappingDeltas,
    warnings,
    recommendedNextActions: [
      ...(validation.valid ? [] : ['Resolve connector import validation errors before accepting the package.']),
      ...(mappingDeltas.length ? ['Review unmapped or low-confidence connector element mappings.'] : []),
      ...(quantityDeltas.length ? ['Review connector quantity deltas before updating schedules or BIM authoring models.'] : []),
      ...(pkg.issues.length ? ['Review imported connector issues in BIM Coordination.'] : []),
    ],
  };
}

export function buildConnectorRoundTripDiff({ previousPackage = null, importPackage = null, projectState = {} } = {}) {
  const previous = previousPackage ? normalizeConnectorManifest(previousPackage) : buildConnectorExportPackage(projectState, { connectorType: importPackage?.connectorType || 'generic' });
  const current = normalizeConnectorManifest(importPackage || {});
  const elementDiff = diffElements(previous.elements, current.elements);
  const preview = applyConnectorImportPreview({ payload: current, projectState });
  return {
    previousPackageId: previous.id || '',
    importPackageId: current.id || '',
    elements: elementDiff,
    quantityDeltas: preview.quantityDeltas,
    mappingDeltas: preview.mappingDeltas,
    issueDeltas: diffElements(previous.issues, current.issues),
    summary: {
      addedElements: elementDiff.addedCount,
      removedElements: elementDiff.removedCount,
      changedElements: elementDiff.changedCount,
      quantityDeltas: preview.quantityDeltas.length,
      mappingDeltas: preview.mappingDeltas.length,
      newIssues: preview.newIssues.length,
    },
  };
}

export function buildConnectorReadinessPackage(context = {}) {
  const packages = asArray(context.packages || context.connectorPackages).map(normalizeConnectorManifest)
    .sort((a, b) => stringValue(b.createdAt).localeCompare(stringValue(a.createdAt)));
  const activePackage = packages.find(pkg => pkg.id === context.activePackageId)
    || packages[0]
    || null;
  const validation = activePackage
    ? validateConnectorImportPackage(activePackage)
    : { valid: false, package: null, errors: ['No connector exchange package is active.'], warnings: [] };
  const roundTripDiff = activePackage
    ? buildConnectorRoundTripDiff({
      previousPackage: packages[1] || null,
      importPackage: activePackage,
      projectState: context.projectState || context,
    })
    : null;
  const staleCutoffDays = numberValue(context.staleCutoffDays, 30);
  const now = context.now ? new Date(context.now) : new Date();
  const staleCount = packages.filter(pkg => {
    const created = new Date(pkg.createdAt);
    return Number.isFinite(created.getTime()) && (now - created) / 86400000 > staleCutoffDays;
  }).length;
  const warnings = [
    ...validation.errors,
    ...validation.warnings,
    ...(staleCount ? [`${staleCount} connector exchange package(s) are older than ${staleCutoffDays} days.`] : []),
    ...(roundTripDiff?.summary?.quantityDeltas ? [`${roundTripDiff.summary.quantityDeltas} connector quantity delta(s) require review.`] : []),
    ...(roundTripDiff?.summary?.mappingDeltas ? [`${roundTripDiff.summary.mappingDeltas} connector mapping delta(s) require review.`] : []),
  ];
  return {
    version: BIM_CONNECTOR_CONTRACT_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    summary: {
      packageCount: packages.length,
      valid: validation.valid,
      activePackageId: activePackage?.id || '',
      activeConnectorType: activePackage?.connectorType || '',
      staleCount,
      elementCount: activePackage?.elements?.length || 0,
      issueCount: activePackage?.issues?.length || 0,
      quantityDeltas: roundTripDiff?.summary?.quantityDeltas || 0,
      mappingDeltas: roundTripDiff?.summary?.mappingDeltas || 0,
      invalidCount: validation.errors.length,
    },
    packages,
    activePackage,
    validation: {
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
    },
    roundTripDiff,
    warnings,
    assumptions: [
      'BIM/CAD connector readiness packages are local exchange records for external desktop add-ins.',
      'Native Revit, AutoCAD, AVEVA, and SmartPlant SDK plugins remain deferred.',
      'Connector import previews are review-only and do not automatically mutate CableTrayRoute schedules or BIM authoring models.',
    ],
  };
}

export function renderConnectorReadinessHTML(pkg = {}) {
  const summary = pkg.summary || {};
  const active = pkg.activePackage || {};
  const rows = asArray(pkg.packages);
  return `<section class="report-section" id="rpt-bim-connector-readiness">
  <h2>BIM/CAD Connector Readiness</h2>
  <p class="report-note">Native-ready BIM/CAD connector exchange contract for external desktop add-ins. This is not a native Revit or AutoCAD plugin.</p>
  <dl class="report-dl">
    <dt>Packages</dt><dd>${escapeHtml(summary.packageCount || 0)}</dd>
    <dt>Active Package</dt><dd>${escapeHtml(active.id || 'None')}</dd>
    <dt>Connector</dt><dd>${escapeHtml(active.connectorType || 'n/a')}</dd>
    <dt>Validation</dt><dd>${escapeHtml(summary.valid ? 'valid' : 'review')}</dd>
    <dt>Quantity Deltas</dt><dd>${escapeHtml(summary.quantityDeltas || 0)}</dd>
    <dt>Mapping Deltas</dt><dd>${escapeHtml(summary.mappingDeltas || 0)}</dd>
  </dl>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Connector</th><th>Application</th><th>Scenario</th><th>Created</th><th>Elements</th><th>Issues</th><th>Warnings</th></tr></thead>
      <tbody>${rows.length ? rows.map(row => `<tr>
        <td>${escapeHtml(row.connectorType)}</td>
        <td>${escapeHtml(row.sourceApplication)}</td>
        <td>${escapeHtml(row.scenario)}</td>
        <td>${escapeHtml(row.createdAt)}</td>
        <td>${escapeHtml(row.elements.length)}</td>
        <td>${escapeHtml(row.issues.length)}</td>
        <td>${escapeHtml(row.warnings.join('; '))}</td>
      </tr>`).join('') : '<tr><td colspan="7">No connector exchange packages captured.</td></tr>'}</tbody>
    </table>
  </div>
  ${asArray(pkg.warnings).length ? `<h3>Warnings</h3><ul>${asArray(pkg.warnings).map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
</section>`;
}
