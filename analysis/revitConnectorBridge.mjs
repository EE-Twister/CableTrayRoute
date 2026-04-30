import {
  BIM_CONNECTOR_CONTRACT_VERSION,
  applyConnectorImportPreview,
  buildConnectorExportPackage,
  validateConnectorImportPackage,
} from './bimConnectorContract.mjs';
import {
  buildBimObjectConnectorHints,
  buildBimObjectPropertySets,
} from './bimObjectLibrary.mjs';

export const REVIT_CONNECTOR_BRIDGE_VERSION = 'revit-connector-bridge-v1';
export const REVIT_NATIVE_SYNC_VERSION = 'revit-native-sync-v1';

export const REVIT_BRIDGE_COMMANDS = Object.freeze([
  'ExportCableTrayRouteJson',
  'ImportCableTrayRoutePreview',
  'ValidateCableTrayRoutePackage',
  'OpenCableTrayRouteBridge',
]);

const DEFAULT_TEMPLATE_FILES = Object.freeze([
  'connectors/native/revit/CableTrayRoute.RevitConnector.csproj',
  'connectors/native/revit/CableTrayRoute.RevitConnector.addin',
  'connectors/native/revit/Commands.cs',
  'connectors/native/revit/ConnectorJsonService.cs',
  'connectors/native/revit/README.md',
]);

const REQUIRED_NATIVE_COMMAND_CLASSES = Object.freeze([
  'ExportCableTrayRouteJsonCommand',
  'ImportCableTrayRoutePreviewCommand',
  'ValidateCableTrayRoutePackageCommand',
  'OpenCableTrayRouteBridgeCommand',
]);

const DEFAULT_REVIT_EXPORT_MAPPINGS = Object.freeze([
  {
    revitCategory: 'OST_CableTray',
    elementType: 'cableTray',
    familyName: '',
    typeName: '',
    level: 'Level',
    system: 'System Name',
    tagParameter: 'Mark',
    quantityBasis: 'Length',
    mappedProjectType: 'tray',
    propertySetName: 'CableTrayRoute.Raceway',
  },
  {
    revitCategory: 'OST_Conduit',
    elementType: 'conduit',
    familyName: '',
    typeName: '',
    level: 'Level',
    system: 'System Name',
    tagParameter: 'Mark',
    quantityBasis: 'Length',
    mappedProjectType: 'conduit',
    propertySetName: 'CableTrayRoute.Raceway',
  },
  {
    revitCategory: 'OST_ElectricalEquipment',
    elementType: 'equipment',
    familyName: '',
    typeName: '',
    level: 'Level',
    system: 'Electrical System',
    tagParameter: 'Mark',
    quantityBasis: 'Count',
    mappedProjectType: 'equipment',
    propertySetName: 'CableTrayRoute.Equipment',
  },
  {
    revitCategory: 'OST_GenericModel',
    elementType: 'support',
    familyName: 'Cable Tray Support',
    typeName: '',
    level: 'Level',
    system: 'Support',
    tagParameter: 'Mark',
    quantityBasis: 'Count',
    mappedProjectType: 'support',
    propertySetName: 'CableTrayRoute.Support',
  },
  {
    revitCategory: 'OST_GenericModel',
    elementType: 'generic',
    familyName: '',
    typeName: '',
    level: 'Level',
    system: 'Generic',
    tagParameter: 'Mark',
    quantityBasis: 'Count',
    mappedProjectType: 'generic',
    propertySetName: 'CableTrayRoute.Generic',
  },
]);

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
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return /^(true|yes|y|1)$/i.test(value.trim());
  return Boolean(value);
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

function commandRows(commands = REVIT_BRIDGE_COMMANDS) {
  return asArray(commands).map(command => {
    if (typeof command === 'string') {
      return {
        name: stringValue(command),
        mode: 'reviewOnly',
        mutatesNativeModel: false,
      };
    }
    const source = asObject(command);
    return {
      name: stringValue(source.name || source.command),
      mode: stringValue(source.mode || 'reviewOnly'),
      mutatesNativeModel: boolValue(source.mutatesNativeModel, false),
    };
  }).filter(row => row.name);
}

function defaultInstallPaths(targetVersion = '2026') {
  return [
    `%APPDATA%/Autodesk/Revit/Addins/${targetVersion}/CableTrayRoute.RevitConnector.addin`,
    `%PROGRAMDATA%/Autodesk/Revit/Addins/${targetVersion}/CableTrayRoute.RevitConnector.addin`,
  ];
}

function buildDescriptorId(descriptor) {
  return `revit-bridge-${hash(stableStringify({
    targetVersion: descriptor.targetVersion,
    contractVersion: descriptor.contractVersion,
    bridgeMode: descriptor.bridgeMode,
  }))}`;
}

function addonManifest(descriptor) {
  return `<?xml version="1.0" encoding="utf-8"?>
<RevitAddIns>
${descriptor.commands.map((command, index) => `  <AddIn Type="Command">
    <Name>CableTrayRoute ${escapeXml(command.name)}</Name>
    <Assembly>C:\\CableTrayRoute\\Connectors\\CableTrayRoute.RevitConnector.dll</Assembly>
    <AddInId>${[
      '8F688AA7-4F29-4D7E-A9AD-5EA524EA7610',
      '8078D8E2-0B57-4577-954E-9F31221DAF92',
      '71D866C5-75F2-4EA4-9D7A-8F918081ED2B',
      '2C970783-9F03-4D8F-A8D9-87AE401A4F4D',
    ][index] || '8D3B060E-69A9-40D3-9B42-7DD271D53F1A'}</AddInId>
    <FullClassName>CableTrayRoute.RevitConnector.${escapeXml(command.name)}Command</FullClassName>
    <VendorId>CTR</VendorId>
    <VendorDescription>CableTrayRoute Revit bridge starter</VendorDescription>
  </AddIn>`).join('\n')}
</RevitAddIns>`;
}

function escapeXml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function summarizeValidation(validation = {}) {
  const errors = asArray(validation.errors);
  const warnings = asArray(validation.warnings);
  return {
    valid: validation.valid === true,
    status: errors.length ? 'fail' : warnings.length ? 'warn' : 'pass',
    errors,
    warnings,
  };
}

function normalizeSourceFile(row = {}) {
  if (typeof row === 'string') {
    return {
      path: row,
      content: '',
    };
  }
  const source = asObject(row);
  return {
    path: stringValue(source.path || source.name || ''),
    content: stringValue(source.content || source.text || ''),
  };
}

function sourceContains(sourceFiles = [], pattern) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern));
  return asArray(sourceFiles).some(file => re.test(file.content || ''));
}

function normalizeMappingStatus(row = {}) {
  const warnings = asArray(row.warnings).map(stringValue).filter(Boolean);
  if (!row.revitCategory || !row.elementType || !row.mappedProjectType) return 'missingData';
  if (warnings.length) return 'review';
  return 'ready';
}

export function normalizeRevitBridgeDescriptor(input = {}) {
  const source = asObject(input);
  const targetVersion = stringValue(source.targetVersion || source.revitVersion || '2026');
  const commands = commandRows(source.commands?.length ? source.commands : REVIT_BRIDGE_COMMANDS);
  const descriptor = {
    id: stringValue(source.id),
    version: stringValue(source.version || REVIT_CONNECTOR_BRIDGE_VERSION),
    connectorType: 'revit',
    targetApplication: stringValue(source.targetApplication || 'Autodesk Revit'),
    targetVersion,
    contractVersion: stringValue(source.contractVersion || BIM_CONNECTOR_CONTRACT_VERSION),
    bridgeMode: stringValue(source.bridgeMode || 'fileAndLocalHttp'),
    commands,
    installPaths: asArray(source.installPaths).length ? asArray(source.installPaths).map(stringValue).filter(Boolean) : defaultInstallPaths(targetVersion),
    templateFiles: asArray(source.templateFiles).length ? asArray(source.templateFiles).map(stringValue).filter(Boolean) : [...DEFAULT_TEMPLATE_FILES],
    localBridgeUrl: stringValue(source.localBridgeUrl || 'http://localhost:41731/cabletrayroute/revit-bridge'),
    sourceProjectPath: stringValue(source.sourceProjectPath || ''),
    supportsLiveModelMutation: boolValue(source.supportsLiveModelMutation, false),
    warnings: asArray(source.warnings).map(stringValue).filter(Boolean),
    assumptions: asArray(source.assumptions).map(stringValue).filter(Boolean),
  };
  const errors = [];
  if (descriptor.version !== REVIT_CONNECTOR_BRIDGE_VERSION) errors.push(`Unsupported Revit bridge version: ${descriptor.version || 'blank'}.`);
  if (descriptor.contractVersion !== BIM_CONNECTOR_CONTRACT_VERSION) errors.push(`Revit bridge contract version ${descriptor.contractVersion || 'blank'} does not match ${BIM_CONNECTOR_CONTRACT_VERSION}.`);
  REVIT_BRIDGE_COMMANDS.forEach(command => {
    if (!descriptor.commands.some(row => row.name === command)) errors.push(`Revit bridge descriptor is missing command ${command}.`);
  });
  const warnings = [
    ...descriptor.warnings,
    ...(descriptor.supportsLiveModelMutation ? ['Automatic native Revit model write-back was requested, but V1 bridge commands must remain review-only.'] : []),
    ...(descriptor.targetVersion && !/^20\d{2}$/.test(descriptor.targetVersion) ? [`Revit target version ${descriptor.targetVersion} should be reviewed before SDK build.`] : []),
  ];
  return {
    ...descriptor,
    id: descriptor.id || buildDescriptorId(descriptor),
    addinManifest: stringValue(source.addinManifest || addonManifest(descriptor)),
    warnings,
    validation: {
      valid: errors.length === 0,
      errors,
      warnings,
    },
    assumptions: descriptor.assumptions.length ? descriptor.assumptions : [
      'The Revit bridge is SDK-ready source and validated JSON contract metadata, not an Autodesk-certified installer.',
      'CI validates manifests and payloads without compiling against Autodesk Revit API assemblies.',
      'Import remains preview/review-only; native model mutation requires a project-specific extension outside V1.',
    ],
  };
}

export function normalizeRevitNativeSyncCase(input = {}) {
  const source = asObject(input);
  const descriptor = normalizeRevitBridgeDescriptor(source.descriptor || source.revitBridgeDescriptor || source);
  const nativeSyncCase = {
    id: stringValue(source.id || `revit-native-sync-${hash(stableStringify({
      targetVersion: descriptor.targetVersion,
      contractVersion: descriptor.contractVersion,
      exchangeMode: source.exchangeMode || source.bridgeMode || descriptor.bridgeMode,
    }))}`),
    version: stringValue(source.version || REVIT_NATIVE_SYNC_VERSION),
    targetVersion: descriptor.targetVersion,
    contractVersion: stringValue(source.contractVersion || descriptor.contractVersion),
    exchangeMode: stringValue(source.exchangeMode || source.bridgeMode || descriptor.bridgeMode || 'fileExchange'),
    exchangeFolder: stringValue(source.exchangeFolder || '%USERPROFILE%/Documents/CableTrayRoute/RevitBridge'),
    localBridgeUrl: stringValue(source.localBridgeUrl || descriptor.localBridgeUrl),
    includeCategories: asArray(source.includeCategories).length ? asArray(source.includeCategories).map(stringValue).filter(Boolean) : [
      'OST_CableTray',
      'OST_Conduit',
      'OST_ElectricalEquipment',
      'OST_GenericModel',
    ],
    reviewOnly: source.reviewOnly === undefined ? true : boolValue(source.reviewOnly, true),
    supportsNativeMutation: boolValue(source.supportsNativeMutation || source.supportsLiveModelMutation, false),
    sourceManifestMode: stringValue(source.sourceManifestMode || 'ciSafeSourceText'),
    notes: stringValue(source.notes || ''),
    warnings: asArray(source.warnings).map(stringValue).filter(Boolean),
    assumptions: asArray(source.assumptions).map(stringValue).filter(Boolean),
  };
  const warnings = [
    ...nativeSyncCase.warnings,
    ...(nativeSyncCase.version !== REVIT_NATIVE_SYNC_VERSION ? [`Unsupported Revit native sync version: ${nativeSyncCase.version || 'blank'}.`] : []),
    ...(nativeSyncCase.contractVersion !== BIM_CONNECTOR_CONTRACT_VERSION ? [`Revit native sync contract version ${nativeSyncCase.contractVersion || 'blank'} does not match ${BIM_CONNECTOR_CONTRACT_VERSION}.`] : []),
    ...(nativeSyncCase.supportsNativeMutation ? ['Automatic Revit model mutation was requested, but V1 native sync remains preview/review-only.'] : []),
    ...(!nativeSyncCase.reviewOnly ? ['Revit import preview should remain review-only for V1.'] : []),
  ];
  return {
    ...nativeSyncCase,
    descriptor,
    warnings,
    assumptions: nativeSyncCase.assumptions.length ? nativeSyncCase.assumptions : [
      'Functional Revit add-in source is SDK-ready but not compiled in CableTrayRoute CI.',
      'File exchange remains the primary V1 bridge path; local HTTP bridge is validation/preview only.',
      'No automatic Revit model mutation or CableTrayRoute schedule mutation is performed by V1 native sync.',
    ],
  };
}

export function buildRevitNativeExportMapping(context = {}) {
  const source = asObject(context);
  const explicitRows = asArray(source.exportMappingRows || source.mappings);
  const familyRows = asArray(source.bimObjectFamilies || source.projectState?.bimObjectFamilies);
  const rows = (explicitRows.length ? explicitRows : DEFAULT_REVIT_EXPORT_MAPPINGS).map((row, index) => {
    const item = asObject(row);
    const elementType = stringValue(item.elementType || 'generic');
    const mappedProjectType = stringValue(item.mappedProjectType || elementType);
    const familyMatch = familyRows.find(family => {
      const native = stringValue(family.nativeFormat).toLowerCase();
      const category = stringValue(family.category).toLowerCase();
      return native.includes('revit') && (
        category === mappedProjectType.toLowerCase()
        || stringValue(family.ifcClass).toLowerCase().includes(elementType.toLowerCase())
      );
    });
    const warnings = [
      ...asArray(item.warnings).map(stringValue).filter(Boolean),
      ...(!stringValue(item.revitCategory) ? ['Revit category is required for native export collection.'] : []),
      ...(!elementType ? ['Connector elementType is required.'] : []),
      ...(!mappedProjectType ? ['Mapped CableTrayRoute project type is required.'] : []),
      ...(elementType === 'generic' ? ['Generic Revit category mapping should be reviewed before production exchange.'] : []),
      ...(!familyMatch ? ['No approved Revit BIM object family hint matched this export mapping.'] : []),
    ];
    const normalized = {
      id: stringValue(item.id || `revit-export-map-${index + 1}`),
      revitCategory: stringValue(item.revitCategory),
      elementType,
      familyName: stringValue(item.familyName || familyMatch?.familyName || ''),
      typeName: stringValue(item.typeName || familyMatch?.typeName || ''),
      level: stringValue(item.level || 'Level'),
      system: stringValue(item.system || ''),
      tagParameter: stringValue(item.tagParameter || 'Mark'),
      quantityBasis: stringValue(item.quantityBasis || 'Count'),
      mappedProjectType,
      propertySetName: stringValue(item.propertySetName || `CableTrayRoute.${mappedProjectType}`),
      status: 'ready',
      warnings,
    };
    return {
      ...normalized,
      status: normalizeMappingStatus(normalized),
    };
  });
  return rows;
}

export function validateRevitNativeSourceManifest(context = {}) {
  const source = asObject(context);
  const descriptor = normalizeRevitBridgeDescriptor(source.descriptor || source.revitBridgeDescriptor || {});
  const sourceFiles = asArray(source.sourceFiles).map(normalizeSourceFile);
  const templateFiles = asArray(source.templateFiles).length
    ? asArray(source.templateFiles).map(stringValue).filter(Boolean)
    : descriptor.templateFiles;
  const commandsSource = sourceFiles.find(file => /Commands\.cs$/i.test(file.path))?.content || stringValue(source.commandsSource || '');
  const serviceSource = sourceFiles.find(file => /ConnectorJsonService\.cs$/i.test(file.path))?.content || stringValue(source.serviceSource || '');
  const hasSourceText = sourceFiles.some(file => file.content) || Boolean(commandsSource || serviceSource);
  const addinManifest = stringValue(source.addinManifest || descriptor.addinManifest || '');
  const commandRowsList = REQUIRED_NATIVE_COMMAND_CLASSES.map(commandClass => {
    const present = commandsSource ? commandsSource.includes(`class ${commandClass}`) : true;
    const commandName = commandClass.replace(/Command$/, '');
    const manifestPresent = addinManifest ? addinManifest.includes(`${commandClass}`) || addinManifest.includes(`${commandName}Command`) : true;
    const usesFilteredCollector = commandClass === 'ExportCableTrayRouteJsonCommand'
      ? /FilteredElementCollector/.test(commandsSource || source.commandsSource || 'FilteredElementCollector')
      : true;
    const status = present && manifestPresent && usesFilteredCollector ? 'pass' : 'fail';
    return {
      id: commandClass,
      commandClass,
      commandName,
      status,
      detail: status === 'pass'
        ? `${commandClass} is present in source and manifest coverage.`
        : `${commandClass} is missing from source, manifest, or functional collector coverage.`,
    };
  });
  const validationRows = [
    {
      id: 'template-files',
      check: 'Revit native template files',
      status: DEFAULT_TEMPLATE_FILES.every(file => templateFiles.includes(file)) ? 'pass' : 'missingData',
      detail: `${templateFiles.length} template file(s) listed.`,
    },
    {
      id: 'filtered-element-collector',
      check: 'Functional export collector',
      status: !hasSourceText || sourceContains(sourceFiles, /FilteredElementCollector/) || /FilteredElementCollector/.test(commandsSource) ? 'pass' : 'missingData',
      detail: 'Export command should use FilteredElementCollector for native Revit element collection.',
    },
    {
      id: 'json-service-validation',
      check: 'Connector JSON service validation',
      status: !hasSourceText || /LooksLikeCableTrayRoutePackage|ValidatePackage|ValidateConnector/i.test(serviceSource || commandsSource) ? 'pass' : 'missingData',
      detail: 'ConnectorJsonService should validate package structure before preview.',
    },
    {
      id: 'addin-manifest',
      check: '.addin manifest command coverage',
      status: REVIT_BRIDGE_COMMANDS.every(command => addinManifest.includes(command)) ? 'pass' : 'fail',
      detail: REVIT_BRIDGE_COMMANDS.every(command => addinManifest.includes(command))
        ? '.addin manifest references all expected bridge command names.'
        : '.addin manifest is missing one or more bridge commands.',
    },
    ...commandRowsList.map(row => ({
      id: `command-${row.commandName}`,
      check: row.commandClass,
      status: row.status,
      detail: row.detail,
    })),
  ];
  const warnings = [
    ...validationRows.filter(row => row.status !== 'pass').map(row => row.detail),
    ...(descriptor.validation.valid ? [] : descriptor.validation.errors),
  ];
  return {
    version: REVIT_NATIVE_SYNC_VERSION,
    descriptor,
    templateFiles,
    commandRows: commandRowsList,
    validationRows,
    valid: !validationRows.some(row => row.status === 'fail'),
    status: validationRows.some(row => row.status === 'fail') ? 'fail' : validationRows.some(row => row.status === 'missingData' || row.status === 'warn') ? 'review' : 'pass',
    warnings,
    assumptions: [
      'Source manifest validation checks CI-safe text/manifest coverage only; Autodesk API compilation occurs outside this repository.',
    ],
  };
}

export function buildRevitExportRequest(projectState = {}, options = {}) {
  const descriptor = normalizeRevitBridgeDescriptor(options.descriptor || options);
  const state = asObject(projectState);
  const familyRows = asArray(options.bimObjectFamilies || state.bimObjectFamilies);
  const catalogRows = asArray(options.productCatalog || state.productCatalog || state.catalogRows);
  const packagePayload = buildConnectorExportPackage(state, {
    connectorType: 'revit',
    sourceApplication: `${descriptor.targetApplication} Bridge`,
    sourceVersion: descriptor.targetVersion,
    projectId: options.projectId || state.projectId || state.projectName || state.name || 'CableTrayRoute Project',
    scenario: options.scenario || state.scenario || 'Default',
    createdAt: options.createdAt || new Date().toISOString(),
    bimObjectFamilies: familyRows,
    productCatalog: catalogRows,
  });
  return {
    version: REVIT_CONNECTOR_BRIDGE_VERSION,
    requestId: `revit-export-${hash(stableStringify({ descriptorId: descriptor.id, packageId: packagePayload.id }))}`,
    createdAt: options.createdAt || new Date().toISOString(),
    descriptor,
    connectorPackage: {
      ...packagePayload,
      propertySets: [
        ...asArray(packagePayload.propertySets),
        ...buildBimObjectPropertySets({ familyRows, catalogRows }).filter(row => !asArray(packagePayload.propertySets).some(existing => existing.name === row.name)),
      ],
      mappingHints: [
        ...asArray(packagePayload.mappingHints),
        ...buildBimObjectConnectorHints({ familyRows, projectState: state }),
      ],
    },
    bridge: {
      mode: descriptor.bridgeMode,
      localBridgeUrl: descriptor.localBridgeUrl,
      reviewOnly: true,
      acceptedCommands: descriptor.commands.map(row => row.name),
    },
    warnings: descriptor.warnings,
    assumptions: descriptor.assumptions,
  };
}

export function validateRevitConnectorPayload(payload = {}, options = {}) {
  const validation = validateConnectorImportPackage(payload, options);
  const pkg = validation.package;
  const errors = [...validation.errors];
  const warnings = [...validation.warnings];
  if (pkg.connectorType !== 'revit') errors.push(`Expected Revit connector payload, received ${pkg.connectorType || 'blank'}.`);
  if (!pkg.sourceApplication || !/revit/i.test(pkg.sourceApplication)) {
    warnings.push('Revit connector payload sourceApplication should identify Autodesk Revit or the CableTrayRoute Revit bridge.');
  }
  asArray(pkg.elements).forEach((element, index) => {
    if (!element.guid && !element.sourceId) warnings.push(`Revit element ${index + 1} has no GUID or sourceId for stable round-trip mapping.`);
    if (element.elementType === 'generic') warnings.push(`Revit element ${element.tag || element.name || index + 1} normalized as generic; review category mapping.`);
  });
  return {
    valid: errors.length === 0,
    package: pkg,
    errors,
    warnings,
  };
}

export function buildRevitRoundTripPreview({ payload = {}, projectState = {} } = {}) {
  const validation = validateRevitConnectorPayload(payload);
  const preview = applyConnectorImportPreview({ payload: validation.package, projectState });
  const syncPreviewRows = [
    ...preview.acceptedElements.map(row => ({
      id: row.id || row.guid || row.sourceId || row.tag,
      elementType: row.elementType,
      tag: row.tag || row.name,
      guid: row.guid || row.sourceId,
      mappedProjectId: row.mappedProjectId || '',
      mappingConfidence: row.mappingConfidence || 0,
      status: row.mappedProjectId || row.mappingConfidence >= 0.8 ? 'accepted' : 'review',
      recommendation: row.mappedProjectId || row.mappingConfidence >= 0.8
        ? 'Element can be accepted into BIM Coordination records.'
        : 'Review low-confidence mapping before accepting this Revit element.',
    })),
    ...preview.rejectedElements.map(({ element, errors }) => ({
      id: element.id || element.guid || element.sourceId || element.tag || '',
      elementType: element.elementType || 'generic',
      tag: element.tag || element.name || '',
      guid: element.guid || element.sourceId || '',
      mappedProjectId: '',
      mappingConfidence: 0,
      status: 'rejected',
      recommendation: errors.join(' '),
    })),
  ];
  return {
    validation: summarizeValidation(validation),
    acceptedElements: preview.acceptedElements,
    rejectedElements: preview.rejectedElements,
    syncPreviewRows,
    issueRows: preview.newIssues,
    quantityDeltas: preview.quantityDeltas,
    mappingDeltas: preview.mappingDeltas,
    warnings: [
      ...validation.errors,
      ...validation.warnings,
      ...preview.warnings,
    ],
    recommendedNextActions: preview.recommendedNextActions,
  };
}

export function buildRevitSyncReadinessPackage(context = {}) {
  const projectState = asObject(context.projectState || context);
  const descriptor = normalizeRevitBridgeDescriptor(context.descriptor || context.revitBridgeDescriptor || {});
  const exportRequest = buildRevitExportRequest(projectState, {
    descriptor,
    projectId: context.projectId,
    scenario: context.scenario,
    createdAt: context.createdAt,
    bimObjectFamilies: context.bimObjectFamilies || projectState.bimObjectFamilies,
    productCatalog: context.productCatalog || projectState.productCatalog,
  });
  const payload = context.payload || context.importPackage || exportRequest.connectorPackage;
  const roundTripPreview = buildRevitRoundTripPreview({ payload, projectState });
  const validationRows = [
    {
      id: 'descriptor',
      check: 'Revit bridge descriptor',
      status: descriptor.validation.valid ? 'pass' : 'fail',
      detail: descriptor.validation.valid ? 'Descriptor matches the current Revit bridge and connector contract.' : descriptor.validation.errors.join(' '),
    },
    {
      id: 'payload',
      check: 'Revit connector payload',
      status: roundTripPreview.validation.status,
      detail: roundTripPreview.validation.errors.concat(roundTripPreview.validation.warnings).join(' ') || 'Payload validates for Revit bridge preview.',
    },
    {
      id: 'template-files',
      check: 'SDK template files',
      status: descriptor.templateFiles.length >= 5 ? 'pass' : 'missingData',
      detail: descriptor.templateFiles.length >= 5 ? 'Revit project, manifest, commands, service, and README templates are listed.' : 'Add missing Revit SDK starter template files.',
    },
    {
      id: 'bridge-mode',
      check: 'File/HTTP bridge mode',
      status: descriptor.bridgeMode.includes('file') || descriptor.localBridgeUrl ? 'pass' : 'warn',
      detail: `Bridge mode: ${descriptor.bridgeMode}; local URL: ${descriptor.localBridgeUrl || 'not configured'}.`,
    },
  ];
  const warningRows = [
    ...descriptor.warnings.map((warning, index) => ({ id: `descriptor-warning-${index + 1}`, severity: 'review', warning })),
    ...roundTripPreview.warnings.map((warning, index) => ({ id: `payload-warning-${index + 1}`, severity: warning.includes('Unsupported') || warning.includes('missing version') ? 'error' : 'review', warning })),
    ...(descriptor.supportsLiveModelMutation ? [{ id: 'native-writeback', severity: 'review', warning: 'Automatic Revit model write-back is outside V1; keep import preview review-only.' }] : []),
  ];
  return {
    version: REVIT_CONNECTOR_BRIDGE_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    summary: {
      descriptorValid: descriptor.validation.valid,
      validationStatus: validationRows.some(row => row.status === 'fail') ? 'fail' : validationRows.some(row => row.status === 'warn' || row.status === 'missingData') ? 'review' : 'ready',
      contractVersion: descriptor.contractVersion,
      targetVersion: descriptor.targetVersion,
      commandCount: descriptor.commands.length,
      templateFileCount: descriptor.templateFiles.length,
      acceptedPreviewRows: roundTripPreview.acceptedElements.length,
      rejectedPreviewRows: roundTripPreview.rejectedElements.length,
      quantityDeltas: roundTripPreview.quantityDeltas.length,
      mappingDeltas: roundTripPreview.mappingDeltas.length,
      issueCount: roundTripPreview.issueRows.length,
      warningCount: warningRows.length,
      reviewOnly: true,
    },
    descriptor,
    samplePayload: exportRequest.connectorPackage,
    exportRequest,
    validationRows,
    syncPreviewRows: roundTripPreview.syncPreviewRows,
    issueRows: roundTripPreview.issueRows,
    quantityDeltas: roundTripPreview.quantityDeltas,
    mappingDeltas: roundTripPreview.mappingDeltas,
    warningRows,
    warnings: warningRows.map(row => row.warning),
    assumptions: [
      'The Revit live sync bridge is a native-ready handoff contract plus SDK source scaffold, not a certified compiled add-in.',
      'CI validates JSON, source templates, and manifests without loading Autodesk Revit API assemblies.',
      'Round-trip imports remain preview/review-only and do not mutate Revit or CableTrayRoute schedules automatically.',
    ],
  };
}

export function buildRevitNativeSyncPackage(context = {}) {
  const projectState = asObject(context.projectState || context);
  const nativeSyncCase = normalizeRevitNativeSyncCase(context.nativeSyncCase || context);
  const sourceManifest = validateRevitNativeSourceManifest({
    descriptor: nativeSyncCase.descriptor,
    sourceFiles: context.sourceFiles,
    commandsSource: context.commandsSource,
    serviceSource: context.serviceSource,
    addinManifest: context.addinManifest || nativeSyncCase.descriptor.addinManifest,
    templateFiles: context.templateFiles || nativeSyncCase.descriptor.templateFiles,
  });
  const exportMappingRows = buildRevitNativeExportMapping({
    exportMappingRows: context.exportMappingRows,
    bimObjectFamilies: context.bimObjectFamilies || projectState.bimObjectFamilies,
    projectState,
  });
  const exportRequest = buildRevitExportRequest(projectState, {
    descriptor: nativeSyncCase.descriptor,
    projectId: context.projectId,
    scenario: context.scenario,
    createdAt: context.createdAt,
    bimObjectFamilies: context.bimObjectFamilies || projectState.bimObjectFamilies,
    productCatalog: context.productCatalog || projectState.productCatalog,
  });
  const payload = context.payload || context.importPackage || exportRequest.connectorPackage;
  const preview = buildRevitRoundTripPreview({ payload, projectState });
  const validationRows = [
    ...sourceManifest.validationRows,
    {
      id: 'connector-payload',
      check: 'Revit connector payload preview',
      status: preview.validation.status,
      detail: preview.validation.errors.concat(preview.validation.warnings).join(' ') || 'Payload validates for functional Revit sync preview.',
    },
    {
      id: 'export-mapping',
      check: 'Revit export mapping coverage',
      status: exportMappingRows.some(row => row.status === 'missingData') ? 'missingData' : exportMappingRows.some(row => row.status === 'review') ? 'warn' : 'pass',
      detail: `${exportMappingRows.length} mapping row(s), ${exportMappingRows.filter(row => row.status === 'ready').length} ready.`,
    },
    {
      id: 'review-only',
      check: 'Review-only native sync policy',
      status: nativeSyncCase.reviewOnly && !nativeSyncCase.supportsNativeMutation ? 'pass' : 'warn',
      detail: nativeSyncCase.reviewOnly && !nativeSyncCase.supportsNativeMutation
        ? 'Native sync is configured as preview/review-only.'
        : 'Native mutation/write-back was requested; keep V1 import flows non-mutating.',
    },
  ];
  const warningRows = [
    ...nativeSyncCase.warnings.map((warning, index) => ({ id: `case-warning-${index + 1}`, severity: /version|mutation|review-only/i.test(warning) ? 'warning' : 'review', warning })),
    ...sourceManifest.warnings.map((warning, index) => ({ id: `source-warning-${index + 1}`, severity: /missing|fail/i.test(warning) ? 'warning' : 'review', warning })),
    ...exportMappingRows.flatMap(row => row.warnings.map((warning, index) => ({ id: `${row.id}-warning-${index + 1}`, severity: row.status === 'missingData' ? 'warning' : 'review', warning }))),
    ...preview.warnings.map((warning, index) => ({ id: `payload-warning-${index + 1}`, severity: /unsupported|missing|expected/i.test(warning) ? 'warning' : 'review', warning })),
  ];
  return {
    version: REVIT_NATIVE_SYNC_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    summary: {
      status: validationRows.some(row => row.status === 'fail') ? 'fail' : validationRows.some(row => row.status === 'warn' || row.status === 'missingData') ? 'review' : 'ready',
      contractVersion: nativeSyncCase.contractVersion,
      targetVersion: nativeSyncCase.targetVersion,
      commandCount: sourceManifest.commandRows.length,
      commandReadyCount: sourceManifest.commandRows.filter(row => row.status === 'pass').length,
      templateFileCount: sourceManifest.templateFiles.length,
      exportMappingCount: exportMappingRows.length,
      readyMappingCount: exportMappingRows.filter(row => row.status === 'ready').length,
      acceptedPreviewRows: preview.acceptedElements.length,
      rejectedPreviewRows: preview.rejectedElements.length,
      quantityDeltas: preview.quantityDeltas.length,
      mappingDeltas: preview.mappingDeltas.length,
      issueCount: preview.issueRows.length,
      warningCount: warningRows.length,
      reviewOnly: nativeSyncCase.reviewOnly && !nativeSyncCase.supportsNativeMutation,
    },
    nativeSyncCase,
    sourceManifest,
    commandRows: sourceManifest.commandRows,
    exportMappingRows,
    samplePayload: exportRequest.connectorPackage,
    exportRequest,
    validationRows,
    syncPreviewRows: preview.syncPreviewRows,
    issueRows: preview.issueRows,
    quantityDeltas: preview.quantityDeltas,
    mappingDeltas: preview.mappingDeltas,
    warningRows,
    warnings: warningRows.map(row => row.warning),
    assumptions: [
      'Functional Revit native sync uses SDK-ready source validated by text/manifests in CI; Autodesk API compilation is external.',
      'File exchange remains the primary V1 workflow; local HTTP bridge endpoints validate and preview packages only.',
      'Import preview does not mutate Revit models or CableTrayRoute schedules automatically.',
    ],
  };
}

export function renderRevitSyncReadinessHTML(pkg = {}) {
  const summary = pkg.summary || {};
  const descriptor = pkg.descriptor || {};
  return `<section class="report-section" id="rpt-revit-sync-readiness">
  <h2>Revit Connector Sync Readiness</h2>
  <p class="report-note">Native-ready Revit bridge package for CableTrayRoute connector exchange. Compiled deployment requires Autodesk Revit SDK/runtime outside CI.</p>
  <dl class="report-dl">
    <dt>Target</dt><dd>${escapeHtml(`${descriptor.targetApplication || 'Autodesk Revit'} ${descriptor.targetVersion || ''}`)}</dd>
    <dt>Contract</dt><dd>${escapeHtml(summary.contractVersion || '')}</dd>
    <dt>Status</dt><dd>${escapeHtml(summary.validationStatus || 'review')}</dd>
    <dt>Commands</dt><dd>${escapeHtml(summary.commandCount || 0)}</dd>
    <dt>Preview Rows</dt><dd>${escapeHtml(summary.acceptedPreviewRows || 0)} accepted / ${escapeHtml(summary.rejectedPreviewRows || 0)} rejected</dd>
    <dt>Review Only</dt><dd>${escapeHtml(summary.reviewOnly ? 'yes' : 'no')}</dd>
  </dl>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Validation</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>${asArray(pkg.validationRows).length ? asArray(pkg.validationRows).map(row => `<tr>
        <td>${escapeHtml(row.check)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.detail)}</td>
      </tr>`).join('') : '<tr><td colspan="3">No Revit bridge validation rows.</td></tr>'}</tbody>
    </table>
  </div>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Element</th><th>Type</th><th>GUID</th><th>Status</th><th>Recommendation</th></tr></thead>
      <tbody>${asArray(pkg.syncPreviewRows).length ? asArray(pkg.syncPreviewRows).slice(0, 50).map(row => `<tr>
        <td>${escapeHtml(row.tag || row.id)}</td>
        <td>${escapeHtml(row.elementType)}</td>
        <td>${escapeHtml(row.guid)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.recommendation)}</td>
      </tr>`).join('') : '<tr><td colspan="5">No Revit sync preview rows.</td></tr>'}</tbody>
    </table>
  </div>
  ${asArray(pkg.warnings).length ? `<h3>Warnings</h3><ul>${asArray(pkg.warnings).map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
</section>`;
}

export function renderRevitNativeSyncHTML(pkg = {}) {
  const summary = pkg.summary || {};
  const syncCase = pkg.nativeSyncCase || {};
  return `<section class="report-section" id="rpt-revit-native-sync">
  <h2>Functional Revit Add-In Sync Readiness</h2>
  <p class="report-note">SDK-ready Revit export, validation, and import-preview source coverage. Certified compiled deployment requires Autodesk Revit/SDK outside CI.</p>
  <dl class="report-dl">
    <dt>Target</dt><dd>${escapeHtml(`Revit ${summary.targetVersion || syncCase.targetVersion || ''}`)}</dd>
    <dt>Contract</dt><dd>${escapeHtml(summary.contractVersion || syncCase.contractVersion || '')}</dd>
    <dt>Status</dt><dd>${escapeHtml(summary.status || 'review')}</dd>
    <dt>Commands Ready</dt><dd>${escapeHtml(summary.commandReadyCount || 0)} / ${escapeHtml(summary.commandCount || 0)}</dd>
    <dt>Export Mappings</dt><dd>${escapeHtml(summary.readyMappingCount || 0)} / ${escapeHtml(summary.exportMappingCount || 0)}</dd>
    <dt>Preview Rows</dt><dd>${escapeHtml(summary.acceptedPreviewRows || 0)} accepted / ${escapeHtml(summary.rejectedPreviewRows || 0)} rejected</dd>
    <dt>Review Only</dt><dd>${escapeHtml(summary.reviewOnly ? 'yes' : 'no')}</dd>
  </dl>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Command</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>${asArray(pkg.commandRows).length ? asArray(pkg.commandRows).map(row => `<tr>
        <td>${escapeHtml(row.commandClass || row.commandName)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.detail)}</td>
      </tr>`).join('') : '<tr><td colspan="3">No Revit command readiness rows.</td></tr>'}</tbody>
    </table>
  </div>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Revit Category</th><th>Element Type</th><th>Tag Parameter</th><th>Quantity</th><th>Status</th><th>Warnings</th></tr></thead>
      <tbody>${asArray(pkg.exportMappingRows).length ? asArray(pkg.exportMappingRows).map(row => `<tr>
        <td>${escapeHtml(row.revitCategory)}</td>
        <td>${escapeHtml(row.elementType)}</td>
        <td>${escapeHtml(row.tagParameter)}</td>
        <td>${escapeHtml(row.quantityBasis)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(asArray(row.warnings).join('; '))}</td>
      </tr>`).join('') : '<tr><td colspan="6">No Revit export mapping rows.</td></tr>'}</tbody>
    </table>
  </div>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Validation</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>${asArray(pkg.validationRows).length ? asArray(pkg.validationRows).map(row => `<tr>
        <td>${escapeHtml(row.check)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.detail)}</td>
      </tr>`).join('') : '<tr><td colspan="3">No Revit native sync validation rows.</td></tr>'}</tbody>
    </table>
  </div>
  ${asArray(pkg.warnings).length ? `<h3>Warnings</h3><ul>${asArray(pkg.warnings).map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
</section>`;
}
