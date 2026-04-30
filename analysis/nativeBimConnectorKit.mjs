import {
  BIM_CONNECTOR_CONTRACT_VERSION,
  BIM_CONNECTOR_SUPPORTED_TYPES,
  buildConnectorExportPackage,
  validateConnectorImportPackage,
} from './bimConnectorContract.mjs';

export const NATIVE_BIM_CONNECTOR_KIT_VERSION = 'native-bim-connector-kit-v1';

export const NATIVE_CONNECTOR_COMMANDS = Object.freeze([
  'ExportCableTrayRouteJson',
  'ImportCableTrayRoutePreview',
  'ValidateCableTrayRoutePackage',
]);

const TEMPLATE_ROOT = 'connectors/native';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringValue(value = '') {
  return String(value ?? '').trim();
}

function boolValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 'true' || value === 'yes' || value === 1 || value === '1';
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

function defaultTargetApplication(type) {
  if (type === 'revit') return 'Autodesk Revit';
  if (type === 'autocad') return 'AutoCAD / AutoCAD MEP';
  if (type === 'aveva') return 'AVEVA E3D / PDMS';
  if (type === 'smartplant') return 'Hexagon SmartPlant 3D';
  return 'Generic BIM/CAD Desktop Tool';
}

function defaultTargetVersion(type) {
  if (type === 'revit') return '2026';
  if (type === 'autocad') return '2026';
  if (type === 'aveva') return 'E3D 3.x / PDMS';
  if (type === 'smartplant') return 'SmartPlant 3D';
  return 'local';
}

function defaultInstallPaths(type) {
  if (type === 'revit') {
    return [
      '%APPDATA%/Autodesk/Revit/Addins/2026/CableTrayRoute.RevitConnector.addin',
      '%PROGRAMDATA%/Autodesk/Revit/Addins/2026/CableTrayRoute.RevitConnector.addin',
    ];
  }
  if (type === 'autocad') {
    return [
      '%APPDATA%/Autodesk/ApplicationPlugins/CableTrayRoute.AutoCADConnector.bundle',
      '%PROGRAMDATA%/Autodesk/ApplicationPlugins/CableTrayRoute.AutoCADConnector.bundle',
    ];
  }
  if (type === 'aveva') return ['Project-selected AVEVA E3D/PDMS macro or add-in deployment path'];
  if (type === 'smartplant') return ['Project-selected SmartPlant 3D command/add-in deployment path'];
  return ['User-selected connector install directory'];
}

function defaultTemplateFiles(type) {
  if (type === 'revit') {
    return [
      `${TEMPLATE_ROOT}/revit/CableTrayRoute.RevitConnector.csproj`,
      `${TEMPLATE_ROOT}/revit/CableTrayRoute.RevitConnector.addin`,
      `${TEMPLATE_ROOT}/revit/Commands.cs`,
      `${TEMPLATE_ROOT}/revit/README.md`,
    ];
  }
  if (type === 'autocad') {
    return [
      `${TEMPLATE_ROOT}/autocad/CableTrayRoute.AutoCADConnector.csproj`,
      `${TEMPLATE_ROOT}/autocad/PackageContents.xml`,
      `${TEMPLATE_ROOT}/autocad/Commands.cs`,
      `${TEMPLATE_ROOT}/autocad/ConnectorJsonService.cs`,
      `${TEMPLATE_ROOT}/autocad/README.md`,
    ];
  }
  if (type === 'aveva' || type === 'smartplant') {
    return [
      `${TEMPLATE_ROOT}/plantcad/README.md`,
      `${TEMPLATE_ROOT}/plantcad/aveva-export-preview.pml`,
      `${TEMPLATE_ROOT}/plantcad/smartplant-bridge-notes.md`,
      `${TEMPLATE_ROOT}/plantcad/plantcad-mapping-notes.md`,
    ];
  }
  return [
    `${TEMPLATE_ROOT}/README.md`,
    `${TEMPLATE_ROOT}/shared/connector-contract-notes.md`,
  ];
}

function commandRows(commands = NATIVE_CONNECTOR_COMMANDS) {
  return asArray(commands).map(command => {
    if (typeof command === 'string') {
      return {
        name: stringValue(command),
        mode: 'reviewOnly',
        mutatesNativeModel: false,
      };
    }
    const row = asObject(command);
    return {
      name: stringValue(row.name || row.command),
      mode: stringValue(row.mode || 'reviewOnly'),
      mutatesNativeModel: boolValue(row.mutatesNativeModel, false),
    };
  }).filter(row => row.name);
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

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeNativeConnectorDescriptor(input = {}) {
  const source = asObject(input);
  const connectorType = normalizeConnectorType(source.connectorType || source.type);
  const commands = commandRows(source.commands?.length ? source.commands : NATIVE_CONNECTOR_COMMANDS);
  const descriptor = {
    id: stringValue(source.id),
    version: stringValue(source.version || NATIVE_BIM_CONNECTOR_KIT_VERSION),
    connectorType,
    targetApplication: stringValue(source.targetApplication || source.application || defaultTargetApplication(connectorType)),
    targetVersion: stringValue(source.targetVersion || source.applicationVersion || defaultTargetVersion(connectorType)),
    contractVersion: stringValue(source.contractVersion || BIM_CONNECTOR_CONTRACT_VERSION),
    commands,
    installPaths: asArray(source.installPaths).length ? asArray(source.installPaths).map(stringValue).filter(Boolean) : defaultInstallPaths(connectorType),
    templateFiles: asArray(source.templateFiles).length ? asArray(source.templateFiles).map(stringValue).filter(Boolean) : defaultTemplateFiles(connectorType),
    nativeWriteBackSupported: boolValue(source.nativeWriteBackSupported, false),
    validationStatus: stringValue(source.validationStatus || 'review'),
    warnings: asArray(source.warnings).map(stringValue).filter(Boolean),
    assumptions: asArray(source.assumptions).map(stringValue).filter(Boolean),
  };
  const id = descriptor.id || `native-${connectorType}-${hash(stableStringify({
    targetApplication: descriptor.targetApplication,
    targetVersion: descriptor.targetVersion,
    contractVersion: descriptor.contractVersion,
  }))}`;
  const assumptions = descriptor.assumptions.length ? descriptor.assumptions : [
    'Native connector templates are SDK-ready source starters, not certified compiled plugins.',
    'Connector import commands preview CableTrayRoute packages before any native model updates are authored.',
    'Desktop SDKs and authoring applications are required outside CI to compile and certify add-ins.',
  ];
  const warnings = [
    ...descriptor.warnings,
    ...(descriptor.nativeWriteBackSupported ? ['Native write-back was requested, but V1 supports review-only import preview commands.'] : []),
  ];
  return {
    ...descriptor,
    id,
    assumptions,
    warnings,
  };
}

export function validateNativeConnectorDescriptor(descriptor = {}) {
  const row = normalizeNativeConnectorDescriptor(descriptor);
  const errors = [];
  const warnings = [...row.warnings];
  if (row.version !== NATIVE_BIM_CONNECTOR_KIT_VERSION) errors.push(`Unsupported native connector kit version: ${row.version || 'blank'}.`);
  if (!BIM_CONNECTOR_SUPPORTED_TYPES.includes(row.connectorType)) errors.push(`Unsupported native connector type: ${row.connectorType || 'blank'}.`);
  if (!row.targetApplication) errors.push('Native connector descriptor is missing targetApplication.');
  if (!row.targetVersion) errors.push('Native connector descriptor is missing targetVersion.');
  if (row.contractVersion !== BIM_CONNECTOR_CONTRACT_VERSION) errors.push(`Native connector contract version ${row.contractVersion || 'blank'} does not match ${BIM_CONNECTOR_CONTRACT_VERSION}.`);
  const commandNames = new Set(row.commands.map(command => command.name));
  NATIVE_CONNECTOR_COMMANDS.forEach(command => {
    if (!commandNames.has(command)) errors.push(`Native connector descriptor is missing command ${command}.`);
  });
  if (!row.installPaths.length) errors.push('Native connector descriptor must include at least one install path.');
  if (!row.templateFiles.length) errors.push('Native connector descriptor must include template files.');
  if (row.commands.some(command => command.mutatesNativeModel)) {
    warnings.push('One or more native commands are marked as model-mutating; V1 connector templates must remain review-only.');
  }
  return {
    valid: errors.length === 0,
    descriptor: row,
    errors,
    warnings,
  };
}

export function buildNativeConnectorManifest(descriptor = {}) {
  const validation = validateNativeConnectorDescriptor(descriptor);
  const row = validation.descriptor;
  return {
    id: row.id,
    version: row.version,
    connectorType: row.connectorType,
    targetApplication: row.targetApplication,
    targetVersion: row.targetVersion,
    contractVersion: row.contractVersion,
    commands: row.commands,
    installPaths: row.installPaths,
    templateFiles: row.templateFiles,
    validation: {
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
    },
    warnings: validation.warnings,
    assumptions: row.assumptions,
  };
}

function checklistRow({ id, descriptorId, connectorType, item, status, recommendation }) {
  return { id, descriptorId, connectorType, item, status, recommendation };
}

export function buildNativeConnectorInstallChecklist(context = {}) {
  const descriptors = asArray(context.descriptors).map(normalizeNativeConnectorDescriptor);
  const activeConnectorPackageId = stringValue(context.activeConnectorPackageId);
  const connectorPackages = asArray(context.connectorPackages || context.packages);
  const bimObjectFamilies = asArray(context.bimObjectFamilies || context.familyRows);
  const rows = [];
  descriptors.forEach(descriptor => {
    const validation = validateNativeConnectorDescriptor(descriptor);
    rows.push(checklistRow({
      id: `${descriptor.id}-descriptor`,
      descriptorId: descriptor.id,
      connectorType: descriptor.connectorType,
      item: 'Descriptor validates against the current connector contract.',
      status: validation.valid ? 'pass' : 'fail',
      recommendation: validation.valid ? 'Descriptor is ready for SDK handoff.' : validation.errors.join(' '),
    }));
    rows.push(checklistRow({
      id: `${descriptor.id}-templates`,
      descriptorId: descriptor.id,
      connectorType: descriptor.connectorType,
      item: 'SDK-ready template files are listed for the target application.',
      status: descriptor.templateFiles.length ? 'pass' : 'missingData',
      recommendation: descriptor.templateFiles.length ? 'Template file list is present.' : 'Add source templates before sharing the kit.',
    }));
    rows.push(checklistRow({
      id: `${descriptor.id}-install-paths`,
      descriptorId: descriptor.id,
      connectorType: descriptor.connectorType,
      item: 'Desktop add-in install path guidance is documented.',
      status: descriptor.installPaths.length ? 'pass' : 'missingData',
      recommendation: descriptor.installPaths.length ? 'Install path guidance is present.' : 'Document target add-in install paths.',
    }));
    rows.push(checklistRow({
      id: `${descriptor.id}-commands`,
      descriptorId: descriptor.id,
      connectorType: descriptor.connectorType,
      item: 'Review-only export, import-preview, and validate commands are exposed.',
      status: NATIVE_CONNECTOR_COMMANDS.every(command => descriptor.commands.some(row => row.name === command && !row.mutatesNativeModel)) ? 'pass' : 'warn',
      recommendation: 'Keep native commands review-only until a certified write-back workflow is implemented.',
    }));
  });
  rows.push(checklistRow({
    id: 'active-connector-package',
    descriptorId: activeConnectorPackageId,
    connectorType: 'exchange',
    item: 'An active BIM/CAD connector exchange package is available for round-trip testing.',
    status: activeConnectorPackageId || connectorPackages.length ? 'pass' : 'missingData',
    recommendation: activeConnectorPackageId || connectorPackages.length ? 'Connector exchange package is available.' : 'Export a Revit, AutoCAD, AVEVA, SmartPlant, or generic connector JSON package from BIM Coordination.',
  }));
  rows.push(checklistRow({
    id: 'bim-object-family-metadata',
    descriptorId: '',
    connectorType: 'library',
    item: 'BIM object family metadata is available for connector property-set and mapping-hint handoff.',
    status: bimObjectFamilies.length ? 'pass' : 'missingData',
    recommendation: bimObjectFamilies.length ? 'Family metadata is available for native connector handoff.' : 'Add BIM object family metadata or accept generic placeholder warnings before native add-in handoff.',
  }));
  return rows;
}

export function buildNativeConnectorSamplePayload(context = {}) {
  const descriptor = normalizeNativeConnectorDescriptor(context.descriptor || context);
  const projectState = asObject(context.projectState);
  return buildConnectorExportPackage(projectState, {
    connectorType: descriptor.connectorType,
    sourceApplication: `${descriptor.targetApplication} Native Starter Kit`,
    sourceVersion: descriptor.targetVersion,
    projectId: context.projectId || projectState.projectId || projectState.projectName || 'CableTrayRoute Project',
    scenario: context.scenario || projectState.scenario || 'Default',
    createdAt: context.createdAt || '2026-04-28T00:00:00.000Z',
    bimObjectFamilies: context.bimObjectFamilies || projectState.bimObjectFamilies,
    productCatalog: context.productCatalog || projectState.productCatalog,
  });
}

export function buildNativeConnectorKitPackage(context = {}) {
  const provided = asArray(context.descriptors || context.nativeConnectorDescriptors);
  const descriptors = (provided.length ? provided : [
    { connectorType: 'revit' },
    { connectorType: 'autocad' },
    { connectorType: 'aveva' },
    { connectorType: 'smartplant' },
    { connectorType: 'generic' },
  ]).map(normalizeNativeConnectorDescriptor);
  const descriptorValidations = descriptors.map(validateNativeConnectorDescriptor);
  const manifests = descriptors.map(buildNativeConnectorManifest);
  const projectState = asObject(context.projectState || context);
  const samplePayloads = descriptors.map(descriptor => buildNativeConnectorSamplePayload({
    descriptor,
    projectState,
    projectId: context.projectId,
    scenario: context.scenario,
    createdAt: context.createdAt,
  }));
  const payloadValidations = samplePayloads.map(payload => validateConnectorImportPackage(payload));
  const installChecklist = buildNativeConnectorInstallChecklist({
    descriptors,
    connectorPackages: context.connectorPackages || context.packages,
    activeConnectorPackageId: context.activeConnectorPackageId,
    bimObjectFamilies: context.bimObjectFamilies || projectState.bimObjectFamilies,
  });
  const warnings = [
    ...descriptorValidations.flatMap(validation => validation.errors),
    ...descriptorValidations.flatMap(validation => validation.warnings),
    ...payloadValidations.flatMap(validation => validation.errors),
    ...installChecklist.filter(row => row.status !== 'pass').map(row => `${row.connectorType}: ${row.item}`),
  ];
  const fail = installChecklist.filter(row => row.status === 'fail').length + descriptorValidations.filter(row => !row.valid).length;
  const missingData = installChecklist.filter(row => row.status === 'missingData').length;
  const warn = installChecklist.filter(row => row.status === 'warn').length + warnings.length;
  return {
    version: NATIVE_BIM_CONNECTOR_KIT_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    summary: {
      descriptorCount: descriptors.length,
      validDescriptorCount: descriptorValidations.filter(row => row.valid).length,
      samplePayloadCount: samplePayloads.length,
      checklistCount: installChecklist.length,
      missingChecklistItems: missingData,
      warningCount: warnings.length,
      fail,
      warn,
      missingData,
      contractVersion: BIM_CONNECTOR_CONTRACT_VERSION,
      nativeWriteBackSupported: false,
      status: fail > 0 ? 'action-required' : missingData > 0 || warn > 0 ? 'review' : 'ready',
    },
    descriptors,
    manifests,
    installChecklist,
    samplePayloads,
    warnings,
    assumptions: [
      'Native BIM/CAD connector starter kits provide SDK-ready source templates and exchange contracts only.',
      'CI does not compile Autodesk, AVEVA, Hexagon, or other proprietary SDK projects or certify add-ins.',
      'Imports remain preview/review records until a project-specific native write-back workflow is implemented.',
    ],
  };
}

export function renderNativeConnectorKitHTML(pkg = {}) {
  const summary = pkg.summary || {};
  return `<section class="report-section" id="rpt-native-bim-connector-kit">
  <h2>Native BIM/CAD Connector Starter Kit</h2>
  <p class="report-note">SDK-ready connector handoff for Revit, AutoCAD, AVEVA, SmartPlant, and generic desktop tools. Compiled/certified native add-ins require the target desktop SDK outside this browser-local workflow.</p>
  <dl class="report-dl">
    <dt>Descriptors</dt><dd>${escapeHtml(summary.descriptorCount || 0)}</dd>
    <dt>Valid Descriptors</dt><dd>${escapeHtml(summary.validDescriptorCount || 0)}</dd>
    <dt>Contract Version</dt><dd>${escapeHtml(summary.contractVersion || '')}</dd>
    <dt>Sample Payloads</dt><dd>${escapeHtml(summary.samplePayloadCount || 0)}</dd>
    <dt>Status</dt><dd>${escapeHtml(summary.status || 'review')}</dd>
  </dl>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Connector</th><th>Target</th><th>Version</th><th>Commands</th><th>Templates</th><th>Warnings</th></tr></thead>
      <tbody>${asArray(pkg.descriptors).length ? asArray(pkg.descriptors).map(row => `<tr>
        <td>${escapeHtml(row.connectorType)}</td>
        <td>${escapeHtml(row.targetApplication)}</td>
        <td>${escapeHtml(row.targetVersion)}</td>
        <td>${escapeHtml(row.commands.map(command => command.name).join(', '))}</td>
        <td>${escapeHtml(row.templateFiles.length)}</td>
        <td>${escapeHtml(row.warnings.join('; '))}</td>
      </tr>`).join('') : '<tr><td colspan="6">No native connector descriptors available.</td></tr>'}</tbody>
    </table>
  </div>
  <h3>Install Readiness</h3>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Connector</th><th>Item</th><th>Status</th><th>Recommendation</th></tr></thead>
      <tbody>${asArray(pkg.installChecklist).length ? asArray(pkg.installChecklist).map(row => `<tr>
        <td>${escapeHtml(row.connectorType)}</td>
        <td>${escapeHtml(row.item)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.recommendation)}</td>
      </tr>`).join('') : '<tr><td colspan="4">No install checklist rows.</td></tr>'}</tbody>
    </table>
  </div>
  ${asArray(pkg.warnings).length ? `<h3>Warnings</h3><ul>${asArray(pkg.warnings).map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
</section>`;
}
