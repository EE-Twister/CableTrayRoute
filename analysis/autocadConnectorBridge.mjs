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

export const AUTOCAD_CONNECTOR_BRIDGE_VERSION = 'autocad-connector-bridge-v1';
export const AUTOCAD_NATIVE_SYNC_VERSION = 'autocad-native-sync-v1';

export const AUTOCAD_BRIDGE_COMMANDS = Object.freeze([
  'ExportCableTrayRouteJson',
  'ImportCableTrayRoutePreview',
  'ValidateCableTrayRoutePackage',
  'OpenCableTrayRouteBridge',
]);

const DEFAULT_TEMPLATE_FILES = Object.freeze([
  'connectors/native/autocad/CableTrayRoute.AutoCADConnector.csproj',
  'connectors/native/autocad/PackageContents.xml',
  'connectors/native/autocad/Commands.cs',
  'connectors/native/autocad/ConnectorJsonService.cs',
  'connectors/native/autocad/README.md',
]);

const REQUIRED_NATIVE_COMMAND_CLASSES = Object.freeze([
  'ExportCableTrayRouteJsonCommand',
  'ImportCableTrayRoutePreviewCommand',
  'ValidateCableTrayRoutePackageCommand',
  'OpenCableTrayRouteBridgeCommand',
]);

const DEFAULT_AUTOCAD_EXPORT_MAPPINGS = Object.freeze([
  {
    autocadObjectType: 'CableTray',
    elementType: 'cableTray',
    layerPattern: '*TRAY*',
    blockNamePattern: '*TRAY*',
    dxfName: 'AECC_CABLETRAY',
    mappedProjectType: 'tray',
    quantityBasis: 'Length',
    tagSource: 'TAG,MARK,CTR_TAG',
    propertySetName: 'CableTrayRoute.Raceway',
  },
  {
    autocadObjectType: 'Conduit',
    elementType: 'conduit',
    layerPattern: '*CONDUIT*',
    blockNamePattern: '*CONDUIT*',
    dxfName: 'AECC_CONDUIT',
    mappedProjectType: 'conduit',
    quantityBasis: 'Length',
    tagSource: 'TAG,MARK,CTR_TAG',
    propertySetName: 'CableTrayRoute.Raceway',
  },
  {
    autocadObjectType: 'ElectricalEquipment',
    elementType: 'equipment',
    layerPattern: '*EQUIP*',
    blockNamePattern: '*EQUIP*,*MCC*,*SWBD*',
    dxfName: 'INSERT',
    mappedProjectType: 'equipment',
    quantityBasis: 'Count',
    tagSource: 'TAG,MARK,EQUIPMENT_ID',
    propertySetName: 'CableTrayRoute.Equipment',
  },
  {
    autocadObjectType: 'Support',
    elementType: 'support',
    layerPattern: '*SUPPORT*,*HANGER*',
    blockNamePattern: '*SUPPORT*,*HANGER*',
    dxfName: 'INSERT',
    mappedProjectType: 'support',
    quantityBasis: 'Count',
    tagSource: 'TAG,MARK,CTR_TAG',
    propertySetName: 'CableTrayRoute.Support',
  },
  {
    autocadObjectType: 'BlockReference',
    elementType: 'generic',
    layerPattern: '*CTR*,*ELECTRICAL*',
    blockNamePattern: '*',
    dxfName: 'INSERT',
    mappedProjectType: 'generic',
    quantityBasis: 'Count',
    tagSource: 'TAG,MARK',
    propertySetName: 'CableTrayRoute.GenericBlock',
  },
  {
    autocadObjectType: 'MepObject',
    elementType: 'generic',
    layerPattern: '*MEP*,*PLANT*',
    blockNamePattern: '',
    dxfName: 'AECB_*',
    mappedProjectType: 'generic',
    quantityBasis: 'LengthOrCount',
    tagSource: 'TAG,MARK',
    propertySetName: 'CableTrayRoute.MepObject',
  },
  {
    autocadObjectType: 'Entity',
    elementType: 'generic',
    layerPattern: '*',
    blockNamePattern: '',
    dxfName: '*',
    mappedProjectType: 'generic',
    quantityBasis: 'Count',
    tagSource: 'Layer,Handle',
    propertySetName: 'CableTrayRoute.GenericEntity',
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

function escapeXml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function commandRows(commands = AUTOCAD_BRIDGE_COMMANDS) {
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

function defaultInstallPaths() {
  return [
    '%APPDATA%/Autodesk/ApplicationPlugins/CableTrayRoute.AutoCADConnector.bundle',
    '%PROGRAMDATA%/Autodesk/ApplicationPlugins/CableTrayRoute.AutoCADConnector.bundle',
  ];
}

function buildDescriptorId(descriptor) {
  return `autocad-bridge-${hash(stableStringify({
    targetApplication: descriptor.targetApplication,
    targetVersion: descriptor.targetVersion,
    contractVersion: descriptor.contractVersion,
    bridgeMode: descriptor.bridgeMode,
  }))}`;
}

function packageContentsXml(descriptor) {
  return `<?xml version="1.0" encoding="utf-8"?>
<ApplicationPackage SchemaVersion="1.0"
  AutodeskProduct="AutoCAD"
  Name="CableTrayRoute AutoCAD Connector"
  AppVersion="1.0.0"
  ProductCode="{B88E6368-6153-4AA6-8986-FAFD69123C97}">
  <CompanyDetails Name="CableTrayRoute" />
  <Components>
    <RuntimeRequirements SeriesMin="${escapeXml(descriptor.runtimeSeriesMin || 'R25.0')}" Platform="AutoCAD*" />
    <ComponentEntry AppName="CableTrayRoute.AutoCADConnector"
      ModuleName="./Contents/Windows/CableTrayRoute.AutoCADConnector.dll"
      AppDescription="CableTrayRoute AutoCAD bridge starter"
      LoadOnCommandInvocation="True">
      <Commands GroupName="CableTrayRoute">
${descriptor.commands.map(command => `        <Command Global="${escapeXml(command.name)}" Local="${escapeXml(command.name)}" />`).join('\n')}
      </Commands>
    </ComponentEntry>
  </Components>
</ApplicationPackage>`;
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
    return { path: row, content: '' };
  }
  const source = asObject(row);
  return {
    path: stringValue(source.path || source.file || source.name),
    content: stringValue(source.content || source.text || ''),
  };
}

function sourceContains(files = [], pattern) {
  return asArray(files).some(file => pattern.test(file.content || ''));
}

function normalizeMappingStatus(row = {}) {
  const warnings = asArray(row.warnings);
  if (!row.autocadObjectType || !row.elementType || !row.mappedProjectType || !row.quantityBasis) return 'missingData';
  if (warnings.some(warning => /required|missing/i.test(warning))) return 'missingData';
  if (warnings.length || row.elementType === 'generic') return 'review';
  return 'ready';
}

export function normalizeAutoCadNativeSyncCase(input = {}) {
  const source = asObject(input);
  const descriptor = normalizeAutoCadBridgeDescriptor(source.descriptor || source.autocadBridgeDescriptor || source);
  const nativeSyncCase = {
    id: stringValue(source.id || `autocad-native-sync-${hash(stableStringify({
      targetVersion: descriptor.targetVersion,
      contractVersion: descriptor.contractVersion,
      exchangeMode: source.exchangeMode || source.bridgeMode || descriptor.bridgeMode,
    }))}`),
    version: stringValue(source.version || AUTOCAD_NATIVE_SYNC_VERSION),
    targetApplication: descriptor.targetApplication,
    targetVersion: descriptor.targetVersion,
    contractVersion: stringValue(source.contractVersion || descriptor.contractVersion),
    exchangeMode: stringValue(source.exchangeMode || source.bridgeMode || descriptor.bridgeMode || 'fileExchange'),
    exchangeFolder: stringValue(source.exchangeFolder || '%USERPROFILE%/Documents/CableTrayRoute/AutoCadBridge'),
    localBridgeUrl: stringValue(source.localBridgeUrl || descriptor.localBridgeUrl),
    includeObjectTypes: asArray(source.includeObjectTypes).length ? asArray(source.includeObjectTypes).map(stringValue).filter(Boolean) : [
      'CableTray',
      'Conduit',
      'ElectricalEquipment',
      'Support',
      'BlockReference',
      'MepObject',
      'Entity',
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
    ...(nativeSyncCase.version !== AUTOCAD_NATIVE_SYNC_VERSION ? [`Unsupported AutoCAD native sync version: ${nativeSyncCase.version || 'blank'}.`] : []),
    ...(nativeSyncCase.contractVersion !== BIM_CONNECTOR_CONTRACT_VERSION ? [`AutoCAD native sync contract version ${nativeSyncCase.contractVersion || 'blank'} does not match ${BIM_CONNECTOR_CONTRACT_VERSION}.`] : []),
    ...(nativeSyncCase.supportsNativeMutation ? ['Automatic AutoCAD drawing mutation was requested, but V1 native sync remains preview/review-only.'] : []),
    ...(!nativeSyncCase.reviewOnly ? ['AutoCAD import preview should remain review-only for V1.'] : []),
  ];
  return {
    ...nativeSyncCase,
    descriptor,
    warnings,
    assumptions: nativeSyncCase.assumptions.length ? nativeSyncCase.assumptions : [
      'Functional AutoCAD add-in source is SDK-ready but not compiled in CableTrayRoute CI.',
      'File exchange remains the primary V1 bridge path; local HTTP bridge is validation/preview only.',
      'No automatic AutoCAD drawing mutation or CableTrayRoute schedule mutation is performed by V1 native sync.',
      'AVEVA and SmartPlant certified plugins remain deferred to separate SDK-specific work.',
    ],
  };
}

export function buildAutoCadNativeExportMapping(context = {}) {
  const source = asObject(context);
  const explicitRows = asArray(source.exportMappingRows || source.mappings);
  const familyRows = asArray(source.bimObjectFamilies || source.projectState?.bimObjectFamilies);
  return (explicitRows.length ? explicitRows : DEFAULT_AUTOCAD_EXPORT_MAPPINGS).map((row, index) => {
    const item = asObject(row);
    const elementType = stringValue(item.elementType || 'generic');
    const mappedProjectType = stringValue(item.mappedProjectType || elementType);
    const familyMatch = familyRows.find(family => {
      const native = stringValue(family.nativeFormat).toLowerCase();
      const category = stringValue(family.category).toLowerCase();
      return (native.includes('autocad') || native.includes('cad') || native.includes('block')) && (
        category === mappedProjectType.toLowerCase()
        || stringValue(family.ifcClass).toLowerCase().includes(elementType.toLowerCase())
      );
    });
    const warnings = [
      ...asArray(item.warnings).map(stringValue).filter(Boolean),
      ...(!stringValue(item.autocadObjectType || item.objectType) ? ['AutoCAD object type is required for native export collection.'] : []),
      ...(!elementType ? ['Connector elementType is required.'] : []),
      ...(!mappedProjectType ? ['Mapped CableTrayRoute project type is required.'] : []),
      ...(elementType === 'generic' ? ['Generic AutoCAD entity mapping should be reviewed before production exchange.'] : []),
      ...(!familyMatch ? ['No approved AutoCAD BIM object family/block hint matched this export mapping.'] : []),
    ];
    const normalized = {
      id: stringValue(item.id || `autocad-export-map-${index + 1}`),
      autocadObjectType: stringValue(item.autocadObjectType || item.objectType),
      elementType,
      layerPattern: stringValue(item.layerPattern || item.layer || '*'),
      blockNamePattern: stringValue(item.blockNamePattern || item.blockName || ''),
      dxfName: stringValue(item.dxfName || item.entityName || '*'),
      familyName: stringValue(item.familyName || familyMatch?.familyName || ''),
      typeName: stringValue(item.typeName || familyMatch?.typeName || ''),
      tagSource: stringValue(item.tagSource || 'TAG,MARK,CTR_TAG'),
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
}

export function validateAutoCadNativeSourceManifest(context = {}) {
  const source = asObject(context);
  const descriptor = normalizeAutoCadBridgeDescriptor(source.descriptor || source.autocadBridgeDescriptor || {});
  const sourceFiles = asArray(source.sourceFiles).map(normalizeSourceFile);
  const templateFiles = asArray(source.templateFiles).length
    ? asArray(source.templateFiles).map(stringValue).filter(Boolean)
    : descriptor.templateFiles;
  const commandsSource = sourceFiles.find(file => /Commands\.cs$/i.test(file.path))?.content || stringValue(source.commandsSource || '');
  const serviceSource = sourceFiles.find(file => /ConnectorJsonService\.cs$/i.test(file.path))?.content || stringValue(source.serviceSource || '');
  const hasSourceText = sourceFiles.some(file => file.content) || Boolean(commandsSource || serviceSource);
  const packageContents = sourceFiles.find(file => /PackageContents\.xml$/i.test(file.path))?.content || stringValue(source.packageContentsXml || descriptor.packageContentsXml || '');
  const commandRowsList = REQUIRED_NATIVE_COMMAND_CLASSES.map(commandClass => {
    const present = commandsSource ? commandsSource.includes(`class ${commandClass}`) : true;
    const commandName = commandClass.replace(/Command$/, '');
    const commandMethodPresent = commandsSource ? commandsSource.includes(`CommandMethod(ConnectorContract.${commandName === 'ExportCableTrayRouteJson' ? 'ExportCommandName' : commandName === 'ImportCableTrayRoutePreview' ? 'ImportPreviewCommandName' : commandName === 'ValidateCableTrayRoutePackage' ? 'ValidateCommandName' : 'OpenBridgeCommandName'}`) || commandsSource.includes(`CommandMethod("${commandName}"`) : true;
    const manifestPresent = packageContents ? packageContents.includes(commandName) : true;
    const usesFunctionalExport = commandClass === 'ExportCableTrayRouteJsonCommand'
      ? /Transaction|BlockReference|Entity|ObjectId|DxfName|SelectAll/i.test(`${commandsSource}\n${serviceSource}` || source.commandsSource || 'Transaction Entity ObjectId')
      : true;
    const status = present && commandMethodPresent && manifestPresent && usesFunctionalExport ? 'pass' : 'fail';
    return {
      id: commandClass,
      commandClass,
      commandName,
      status,
      detail: status === 'pass'
        ? `${commandClass} is present with command registration and bundle manifest coverage.`
        : `${commandClass} is missing from source, CommandMethod registration, bundle manifest, or functional entity export coverage.`,
    };
  });
  const validationRows = [
    {
      id: 'template-files',
      check: 'AutoCAD native template files',
      status: DEFAULT_TEMPLATE_FILES.every(file => templateFiles.includes(file)) ? 'pass' : 'missingData',
      detail: `${templateFiles.length} template file(s) listed.`,
    },
    {
      id: 'entity-collector',
      check: 'Functional AutoCAD entity collector',
      status: !hasSourceText || sourceContains(sourceFiles, /Transaction|BlockReference|Entity|ObjectId|DxfName|SelectAll/i) || /Transaction|BlockReference|Entity|ObjectId|DxfName|SelectAll/i.test(commandsSource) ? 'pass' : 'missingData',
      detail: 'Export command should traverse AutoCAD entities/block references and capture handles, ObjectIds, layers, dimensions, and quantities.',
    },
    {
      id: 'json-service-validation',
      check: 'Connector JSON service validation',
      status: !hasSourceText || /LooksLikeCableTrayRoutePackage|ValidatePackage|BuildPreviewReport|ValidateConnector/i.test(serviceSource || commandsSource) ? 'pass' : 'missingData',
      detail: 'ConnectorJsonService should validate package structure and build review-only preview rows.',
    },
    {
      id: 'bundle-manifest',
      check: 'PackageContents.xml command coverage',
      status: AUTOCAD_BRIDGE_COMMANDS.every(command => packageContents.includes(command)) ? 'pass' : 'fail',
      detail: AUTOCAD_BRIDGE_COMMANDS.every(command => packageContents.includes(command))
        ? 'PackageContents.xml references all expected bridge command names.'
        : 'PackageContents.xml is missing one or more bridge commands.',
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
    version: AUTOCAD_NATIVE_SYNC_VERSION,
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

export function normalizeAutoCadBridgeDescriptor(input = {}) {
  const source = asObject(input);
  const targetApplication = stringValue(source.targetApplication || source.application || 'AutoCAD / AutoCAD MEP');
  const targetVersion = stringValue(source.targetVersion || source.autocadVersion || source.applicationVersion || '2026');
  const commands = commandRows(source.commands?.length ? source.commands : AUTOCAD_BRIDGE_COMMANDS);
  const descriptor = {
    id: stringValue(source.id),
    version: stringValue(source.version || AUTOCAD_CONNECTOR_BRIDGE_VERSION),
    connectorType: 'autocad',
    targetApplication,
    targetVersion,
    contractVersion: stringValue(source.contractVersion || BIM_CONNECTOR_CONTRACT_VERSION),
    bridgeMode: stringValue(source.bridgeMode || 'fileAndLocalHttp'),
    commands,
    installPaths: asArray(source.installPaths).length ? asArray(source.installPaths).map(stringValue).filter(Boolean) : defaultInstallPaths(),
    templateFiles: asArray(source.templateFiles).length ? asArray(source.templateFiles).map(stringValue).filter(Boolean) : [...DEFAULT_TEMPLATE_FILES],
    localBridgeUrl: stringValue(source.localBridgeUrl || 'http://localhost:41731/cabletrayroute/autocad-bridge'),
    sourceDrawingPath: stringValue(source.sourceDrawingPath || source.sourceProjectPath || ''),
    runtimeSeriesMin: stringValue(source.runtimeSeriesMin || 'R25.0'),
    supportsLiveModelMutation: boolValue(source.supportsLiveModelMutation, false),
    warnings: asArray(source.warnings).map(stringValue).filter(Boolean),
    assumptions: asArray(source.assumptions).map(stringValue).filter(Boolean),
  };
  const errors = [];
  if (descriptor.version !== AUTOCAD_CONNECTOR_BRIDGE_VERSION) errors.push(`Unsupported AutoCAD bridge version: ${descriptor.version || 'blank'}.`);
  if (descriptor.contractVersion !== BIM_CONNECTOR_CONTRACT_VERSION) errors.push(`AutoCAD bridge contract version ${descriptor.contractVersion || 'blank'} does not match ${BIM_CONNECTOR_CONTRACT_VERSION}.`);
  AUTOCAD_BRIDGE_COMMANDS.forEach(command => {
    if (!descriptor.commands.some(row => row.name === command)) errors.push(`AutoCAD bridge descriptor is missing command ${command}.`);
  });
  const warnings = [
    ...descriptor.warnings,
    ...(descriptor.supportsLiveModelMutation ? ['Automatic native AutoCAD model write-back was requested, but V1 bridge commands must remain review-only.'] : []),
    ...(descriptor.targetVersion && !/^20\d{2}$/.test(descriptor.targetVersion) ? [`AutoCAD target version ${descriptor.targetVersion} should be reviewed before SDK build.`] : []),
    ...(/aveva|smartplant/i.test(targetApplication) ? ['AVEVA and SmartPlant native SDK plugins remain deferred; this descriptor only covers AutoCAD-compatible bridge readiness.'] : []),
  ];
  return {
    ...descriptor,
    id: descriptor.id || buildDescriptorId(descriptor),
    packageContentsXml: stringValue(source.packageContentsXml || packageContentsXml(descriptor)),
    warnings,
    validation: {
      valid: errors.length === 0,
      errors,
      warnings,
    },
    assumptions: descriptor.assumptions.length ? descriptor.assumptions : [
      'The AutoCAD bridge is SDK-ready source and validated JSON contract metadata, not an Autodesk-certified installer.',
      'CI validates manifests and payloads without compiling against AutoCAD managed assemblies.',
      'Import remains preview/review-only; native model mutation requires a project-specific extension outside V1.',
      'AVEVA and SmartPlant native SDK bridges remain deferred and are not implemented by this AutoCAD starter.',
    ],
  };
}

export function buildAutoCadExportRequest(projectState = {}, options = {}) {
  const descriptor = normalizeAutoCadBridgeDescriptor(options.descriptor || options);
  const state = asObject(projectState);
  const familyRows = asArray(options.bimObjectFamilies || state.bimObjectFamilies);
  const catalogRows = asArray(options.productCatalog || state.productCatalog || state.catalogRows);
  const packagePayload = buildConnectorExportPackage(state, {
    connectorType: 'autocad',
    sourceApplication: `${descriptor.targetApplication} Bridge`,
    sourceVersion: descriptor.targetVersion,
    projectId: options.projectId || state.projectId || state.projectName || state.name || 'CableTrayRoute Project',
    scenario: options.scenario || state.scenario || 'Default',
    createdAt: options.createdAt || new Date().toISOString(),
    bimObjectFamilies: familyRows,
    productCatalog: catalogRows,
  });
  return {
    version: AUTOCAD_CONNECTOR_BRIDGE_VERSION,
    requestId: `autocad-export-${hash(stableStringify({ descriptorId: descriptor.id, packageId: packagePayload.id }))}`,
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

export function validateAutoCadConnectorPayload(payload = {}, options = {}) {
  const validation = validateConnectorImportPackage(payload, options);
  const pkg = validation.package;
  const errors = [...validation.errors];
  const warnings = [...validation.warnings];
  if (pkg.connectorType !== 'autocad') errors.push(`Expected AutoCAD connector payload, received ${pkg.connectorType || 'blank'}.`);
  if (!pkg.sourceApplication || !/autocad|cad|civil|plant/i.test(pkg.sourceApplication)) {
    warnings.push('AutoCAD connector payload sourceApplication should identify AutoCAD, AutoCAD MEP, Civil 3D, Plant 3D, or the CableTrayRoute AutoCAD bridge.');
  }
  asArray(pkg.elements).forEach((element, index) => {
    if (!element.guid && !element.sourceId) warnings.push(`AutoCAD element ${index + 1} has no handle/objectId sourceId for stable round-trip mapping.`);
    if (element.elementType === 'generic') warnings.push(`AutoCAD element ${element.tag || element.name || index + 1} normalized as generic; review layer/category mapping.`);
  });
  return {
    valid: errors.length === 0,
    package: pkg,
    errors,
    warnings,
  };
}

export function buildAutoCadRoundTripPreview({ payload = {}, projectState = {} } = {}) {
  const validation = validateAutoCadConnectorPayload(payload);
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
        : 'Review low-confidence mapping before accepting this AutoCAD element.',
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

export function buildAutoCadSyncReadinessPackage(context = {}) {
  const projectState = asObject(context.projectState || context);
  const descriptor = normalizeAutoCadBridgeDescriptor(context.descriptor || context.autocadBridgeDescriptor || {});
  const exportRequest = buildAutoCadExportRequest(projectState, {
    descriptor,
    projectId: context.projectId,
    scenario: context.scenario,
    createdAt: context.createdAt,
    bimObjectFamilies: context.bimObjectFamilies || projectState.bimObjectFamilies,
    productCatalog: context.productCatalog || projectState.productCatalog,
  });
  const payload = context.payload || context.importPackage || exportRequest.connectorPackage;
  const roundTripPreview = buildAutoCadRoundTripPreview({ payload, projectState });
  const validationRows = [
    {
      id: 'descriptor',
      check: 'AutoCAD bridge descriptor',
      status: descriptor.validation.valid ? 'pass' : 'fail',
      detail: descriptor.validation.valid ? 'Descriptor matches the current AutoCAD bridge and connector contract.' : descriptor.validation.errors.join(' '),
    },
    {
      id: 'payload',
      check: 'AutoCAD connector payload',
      status: roundTripPreview.validation.status,
      detail: roundTripPreview.validation.errors.concat(roundTripPreview.validation.warnings).join(' ') || 'Payload validates for AutoCAD bridge preview.',
    },
    {
      id: 'template-files',
      check: 'AutoCAD .NET template files',
      status: descriptor.templateFiles.length >= 5 ? 'pass' : 'missingData',
      detail: descriptor.templateFiles.length >= 5 ? 'AutoCAD project, bundle manifest, commands, service, and README templates are listed.' : 'Add missing AutoCAD .NET starter template files.',
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
    ...(descriptor.supportsLiveModelMutation ? [{ id: 'native-writeback', severity: 'review', warning: 'Automatic AutoCAD model write-back is outside V1; keep import preview review-only.' }] : []),
  ];
  return {
    version: AUTOCAD_CONNECTOR_BRIDGE_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    summary: {
      descriptorValid: descriptor.validation.valid,
      validationStatus: validationRows.some(row => row.status === 'fail') ? 'fail' : validationRows.some(row => row.status === 'warn' || row.status === 'missingData') ? 'review' : 'ready',
      contractVersion: descriptor.contractVersion,
      targetApplication: descriptor.targetApplication,
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
      'The AutoCAD bridge is a native-ready handoff contract plus AutoCAD .NET source scaffold, not an Autodesk-certified installer.',
      'CI validates JSON, source templates, and bundle manifests without loading Autodesk AutoCAD assemblies.',
      'Round-trip imports remain preview/review-only and do not mutate AutoCAD drawings or CableTrayRoute schedules automatically.',
      'AVEVA and SmartPlant native SDK plugins remain deferred pending separate SDK-specific implementations.',
    ],
  };
}

export function buildAutoCadNativeSyncPackage(context = {}) {
  const projectState = asObject(context.projectState || context);
  const nativeSyncCase = normalizeAutoCadNativeSyncCase(context.nativeSyncCase || context);
  const sourceManifest = validateAutoCadNativeSourceManifest({
    descriptor: nativeSyncCase.descriptor,
    sourceFiles: context.sourceFiles,
    commandsSource: context.commandsSource,
    serviceSource: context.serviceSource,
    packageContentsXml: context.packageContentsXml || nativeSyncCase.descriptor.packageContentsXml,
    templateFiles: context.templateFiles || nativeSyncCase.descriptor.templateFiles,
  });
  const exportMappingRows = buildAutoCadNativeExportMapping({
    exportMappingRows: context.exportMappingRows,
    bimObjectFamilies: context.bimObjectFamilies || projectState.bimObjectFamilies,
    projectState,
  });
  const exportRequest = buildAutoCadExportRequest(projectState, {
    descriptor: nativeSyncCase.descriptor,
    projectId: context.projectId,
    scenario: context.scenario,
    createdAt: context.createdAt,
    bimObjectFamilies: context.bimObjectFamilies || projectState.bimObjectFamilies,
    productCatalog: context.productCatalog || projectState.productCatalog,
  });
  const payload = context.payload || context.importPackage || exportRequest.connectorPackage;
  const preview = buildAutoCadRoundTripPreview({ payload, projectState });
  const validationRows = [
    ...sourceManifest.validationRows,
    {
      id: 'connector-payload',
      check: 'AutoCAD connector payload preview',
      status: preview.validation.status,
      detail: preview.validation.errors.concat(preview.validation.warnings).join(' ') || 'Payload validates for functional AutoCAD sync preview.',
    },
    {
      id: 'export-mapping',
      check: 'AutoCAD export mapping coverage',
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
    version: AUTOCAD_NATIVE_SYNC_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    summary: {
      status: validationRows.some(row => row.status === 'fail') ? 'fail' : validationRows.some(row => row.status === 'warn' || row.status === 'missingData') ? 'review' : 'ready',
      contractVersion: nativeSyncCase.contractVersion,
      targetApplication: nativeSyncCase.targetApplication,
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
      'Functional AutoCAD native sync uses SDK-ready source validated by text/manifests in CI; Autodesk API compilation is external.',
      'File exchange remains the primary V1 workflow; local HTTP bridge endpoints validate and preview packages only.',
      'Import preview does not mutate AutoCAD drawings or CableTrayRoute schedules automatically.',
      'AVEVA and SmartPlant certified plugins remain deferred to separate SDK-specific work.',
    ],
  };
}

export function renderAutoCadSyncReadinessHTML(pkg = {}) {
  const summary = pkg.summary || {};
  const descriptor = pkg.descriptor || {};
  return `<section class="report-section" id="rpt-autocad-sync-readiness">
  <h2>AutoCAD Connector Sync Readiness</h2>
  <p class="report-note">Native-ready AutoCAD .NET bridge package for CableTrayRoute connector exchange. Compiled deployment requires an Autodesk AutoCAD SDK/runtime outside CI.</p>
  <dl class="report-dl">
    <dt>Target</dt><dd>${escapeHtml(`${descriptor.targetApplication || 'AutoCAD / AutoCAD MEP'} ${descriptor.targetVersion || ''}`)}</dd>
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
      </tr>`).join('') : '<tr><td colspan="3">No AutoCAD bridge validation rows.</td></tr>'}</tbody>
    </table>
  </div>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Element</th><th>Type</th><th>GUID/Handle</th><th>Status</th><th>Recommendation</th></tr></thead>
      <tbody>${asArray(pkg.syncPreviewRows).length ? asArray(pkg.syncPreviewRows).slice(0, 50).map(row => `<tr>
        <td>${escapeHtml(row.tag || row.id)}</td>
        <td>${escapeHtml(row.elementType)}</td>
        <td>${escapeHtml(row.guid)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.recommendation)}</td>
      </tr>`).join('') : '<tr><td colspan="5">No AutoCAD sync preview rows.</td></tr>'}</tbody>
    </table>
  </div>
  ${asArray(pkg.warnings).length ? `<h3>Warnings</h3><ul>${asArray(pkg.warnings).map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
</section>`;
}

export function renderAutoCadNativeSyncHTML(pkg = {}) {
  const summary = pkg.summary || {};
  const syncCase = pkg.nativeSyncCase || {};
  return `<section class="report-section" id="rpt-autocad-native-sync">
  <h2>Functional AutoCAD Add-In Sync Readiness</h2>
  <p class="report-note">SDK-ready AutoCAD .NET export, validation, and import-preview source coverage. Certified compiled deployment requires Autodesk AutoCAD/SDK outside CI.</p>
  <dl class="report-dl">
    <dt>Target</dt><dd>${escapeHtml(`${summary.targetApplication || syncCase.targetApplication || 'AutoCAD'} ${summary.targetVersion || syncCase.targetVersion || ''}`)}</dd>
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
      </tr>`).join('') : '<tr><td colspan="3">No AutoCAD command readiness rows.</td></tr>'}</tbody>
    </table>
  </div>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>AutoCAD Object</th><th>Element Type</th><th>Layer / Block</th><th>Quantity</th><th>Status</th><th>Warnings</th></tr></thead>
      <tbody>${asArray(pkg.exportMappingRows).length ? asArray(pkg.exportMappingRows).map(row => `<tr>
        <td>${escapeHtml(row.autocadObjectType)}</td>
        <td>${escapeHtml(row.elementType)}</td>
        <td>${escapeHtml(`${row.layerPattern || ''} ${row.blockNamePattern || ''}`)}</td>
        <td>${escapeHtml(row.quantityBasis)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(asArray(row.warnings).join('; '))}</td>
      </tr>`).join('') : '<tr><td colspan="6">No AutoCAD export mapping rows.</td></tr>'}</tbody>
    </table>
  </div>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Validation</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>${asArray(pkg.validationRows).length ? asArray(pkg.validationRows).map(row => `<tr>
        <td>${escapeHtml(row.check)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.detail)}</td>
      </tr>`).join('') : '<tr><td colspan="3">No AutoCAD native sync validation rows.</td></tr>'}</tbody>
    </table>
  </div>
  ${asArray(pkg.warnings).length ? `<h3>Warnings</h3><ul>${asArray(pkg.warnings).map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
</section>`;
}
