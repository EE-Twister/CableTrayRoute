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

export const PLANT_CAD_CONNECTOR_BRIDGE_VERSION = 'plant-cad-connector-bridge-v1';
export const PLANT_CAD_NATIVE_SYNC_VERSION = 'plant-cad-native-sync-v1';

export const PLANT_CAD_BRIDGE_COMMANDS = Object.freeze([
  'ExportCableTrayRouteJson',
  'ImportCableTrayRoutePreview',
  'ValidateCableTrayRoutePackage',
  'OpenCableTrayRouteBridge',
]);

const PLANT_CONNECTOR_TYPES = Object.freeze(['aveva', 'smartplant']);

const DEFAULT_TEMPLATE_FILES = Object.freeze([
  'connectors/native/plantcad/README.md',
  'connectors/native/plantcad/aveva-export-preview.pml',
  'connectors/native/plantcad/aveva-native-commands.pml',
  'connectors/native/plantcad/smartplant-native-commands.md',
  'connectors/native/plantcad/plantcad-json-service-template.md',
  'connectors/native/plantcad/smartplant-bridge-notes.md',
  'connectors/native/plantcad/plantcad-mapping-notes.md',
]);

const DEFAULT_PLANTCAD_EXPORT_MAPPINGS = Object.freeze([
  { plantObjectType: 'CableTray', elementType: 'cableTray', nativeClasses: 'CABLETRAY, CTRAY, CableTrayRun', quantityBasis: 'Length', mappedProjectType: 'tray', propertySetName: 'CableTrayRoute.Raceway', tagSource: 'Name, Tag, DBREF, SP3D ObjectId' },
  { plantObjectType: 'Conduit', elementType: 'conduit', nativeClasses: 'CONDUIT, ConduitRun, ElectricalRaceway', quantityBasis: 'Length', mappedProjectType: 'conduit', propertySetName: 'CableTrayRoute.Raceway', tagSource: 'Name, Tag, DBREF, SP3D ObjectId' },
  { plantObjectType: 'Equipment', elementType: 'equipment', nativeClasses: 'EQUI, Equipment, ElectricalEquipment', quantityBasis: 'Count', mappedProjectType: 'equipment', propertySetName: 'CableTrayRoute.Equipment', tagSource: 'Name, Tag, EquipmentId' },
  { plantObjectType: 'Support', elementType: 'support', nativeClasses: 'SUPPORT, HANGER, StructureMember', quantityBasis: 'Count', mappedProjectType: 'support', propertySetName: 'CableTrayRoute.Support', tagSource: 'Name, Tag, SupportId' },
  { plantObjectType: 'Cable', elementType: 'cable', nativeClasses: 'CABLE, CableRun, Wire', quantityBasis: 'Length', mappedProjectType: 'cable', propertySetName: 'CableTrayRoute.Cable', tagSource: 'CableTag, Name, FromTo' },
  { plantObjectType: 'GenericPlantObject', elementType: 'generic', nativeClasses: 'GENERIC, PipeRackObject, Member, Volume', quantityBasis: 'Count', mappedProjectType: 'generic', propertySetName: 'CableTrayRoute.GenericPlantObject', tagSource: 'Name, DBREF, ObjectId' },
  { plantObjectType: 'IssueRecord', elementType: 'generic', nativeClasses: 'Issue, Clash, ReviewComment', quantityBasis: 'Issue', mappedProjectType: 'issue', propertySetName: 'CableTrayRoute.Issue', tagSource: 'IssueId, Title' },
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

function normalizeSourceFile(row = {}) {
  if (typeof row === 'string') return { path: row, content: '' };
  const source = asObject(row);
  return {
    path: stringValue(source.path || source.file || source.name),
    content: stringValue(source.content || source.text || ''),
  };
}

function sourceContains(files = [], pattern) {
  return asArray(files).some(file => pattern.test(file.content || ''));
}

function normalizePlantConnectorType(value = '') {
  const raw = stringValue(value || 'aveva').toLowerCase().replace(/[\s_-]+/g, '');
  if (['smartplant', 'sp3d', 'hexagonsmartplant', 'hexagonsmartplant3d', 'smartplant3d'].includes(raw)) return 'smartplant';
  return 'aveva';
}

function normalizeMappingStatus(row = {}) {
  const warnings = asArray(row.warnings);
  if (!row.plantObjectType || !row.elementType || !row.mappedProjectType || !row.quantityBasis) return 'missingData';
  if (warnings.some(warning => /required|missing/i.test(warning))) return 'missingData';
  if (warnings.length || row.elementType === 'generic') return 'review';
  return 'ready';
}

function defaultTargetApplication(connectorType) {
  return connectorType === 'smartplant' ? 'Hexagon SmartPlant 3D' : 'AVEVA E3D / PDMS';
}

function defaultTargetVersion(connectorType) {
  return connectorType === 'smartplant' ? 'SmartPlant 3D' : 'E3D 3.x / PDMS';
}

function defaultInstallPaths(connectorType) {
  return connectorType === 'smartplant'
    ? ['Project-selected SmartPlant 3D command/add-in deployment path']
    : ['Project-selected AVEVA E3D/PDMS macro or add-in deployment path'];
}

function commandRows(commands = PLANT_CAD_BRIDGE_COMMANDS) {
  return asArray(commands).map(command => {
    if (typeof command === 'string') {
      return { name: stringValue(command), mode: 'reviewOnly', mutatesNativeModel: false };
    }
    const source = asObject(command);
    return {
      name: stringValue(source.name || source.command),
      mode: stringValue(source.mode || 'reviewOnly'),
      mutatesNativeModel: boolValue(source.mutatesNativeModel, false),
    };
  }).filter(row => row.name);
}

function descriptorId(descriptor) {
  return `plantcad-${descriptor.connectorType}-${hash(stableStringify({
    targetApplication: descriptor.targetApplication,
    targetVersion: descriptor.targetVersion,
    contractVersion: descriptor.contractVersion,
    bridgeMode: descriptor.bridgeMode,
  }))}`;
}

function descriptorInputList(input = {}) {
  if (Array.isArray(input)) return input;
  const source = asObject(input);
  if (Array.isArray(source.descriptors)) return source.descriptors;
  if (Array.isArray(source.plantCadBridgeDescriptors)) return source.plantCadBridgeDescriptors;
  if (source.connectorType || source.type || source.targetApplication) return [source];
  return [{ connectorType: 'aveva' }, { connectorType: 'smartplant' }];
}

export function normalizePlantCadBridgeDescriptor(input = {}) {
  const source = asObject(input);
  const connectorType = normalizePlantConnectorType(source.connectorType || source.type);
  const commands = commandRows(source.commands?.length ? source.commands : PLANT_CAD_BRIDGE_COMMANDS);
  const descriptor = {
    id: stringValue(source.id),
    version: stringValue(source.version || PLANT_CAD_CONNECTOR_BRIDGE_VERSION),
    connectorType,
    targetApplication: stringValue(source.targetApplication || source.application || defaultTargetApplication(connectorType)),
    targetVersion: stringValue(source.targetVersion || source.applicationVersion || defaultTargetVersion(connectorType)),
    contractVersion: stringValue(source.contractVersion || BIM_CONNECTOR_CONTRACT_VERSION),
    bridgeMode: stringValue(source.bridgeMode || 'fileExchange'),
    commands,
    installPaths: asArray(source.installPaths).length ? asArray(source.installPaths).map(stringValue).filter(Boolean) : defaultInstallPaths(connectorType),
    templateFiles: asArray(source.templateFiles).length ? asArray(source.templateFiles).map(stringValue).filter(Boolean) : [...DEFAULT_TEMPLATE_FILES],
    sourceModelPath: stringValue(source.sourceModelPath || source.sourceProjectPath || ''),
    supportsLiveModelMutation: boolValue(source.supportsLiveModelMutation, false),
    warnings: asArray(source.warnings).map(stringValue).filter(Boolean),
    assumptions: asArray(source.assumptions).map(stringValue).filter(Boolean),
  };
  const errors = [];
  if (descriptor.version !== PLANT_CAD_CONNECTOR_BRIDGE_VERSION) errors.push(`Unsupported plant-CAD bridge version: ${descriptor.version || 'blank'}.`);
  if (!PLANT_CONNECTOR_TYPES.includes(descriptor.connectorType)) errors.push(`Unsupported plant-CAD connector type: ${descriptor.connectorType || 'blank'}.`);
  if (descriptor.contractVersion !== BIM_CONNECTOR_CONTRACT_VERSION) errors.push(`Plant-CAD bridge contract version ${descriptor.contractVersion || 'blank'} does not match ${BIM_CONNECTOR_CONTRACT_VERSION}.`);
  PLANT_CAD_BRIDGE_COMMANDS.forEach(command => {
    if (!descriptor.commands.some(row => row.name === command)) errors.push(`Plant-CAD bridge descriptor is missing command ${command}.`);
  });
  const warnings = [
    ...descriptor.warnings,
    ...(descriptor.supportsLiveModelMutation ? ['Automatic native plant-CAD model write-back was requested, but V1 bridge commands must remain review-only.'] : []),
    'Certified AVEVA and SmartPlant SDK plugins remain deferred; this package is a connector profile and payload handoff only.',
  ];
  return {
    ...descriptor,
    id: descriptor.id || descriptorId(descriptor),
    warnings,
    validation: {
      valid: errors.length === 0,
      errors,
      warnings,
    },
    assumptions: descriptor.assumptions.length ? descriptor.assumptions : [
      'The plant-CAD bridge is a connector profile, sample payload, and SDK handoff note, not a certified AVEVA or SmartPlant plugin.',
      'CI validates JSON contracts and template text without loading proprietary AVEVA or Hexagon SDK binaries.',
      'Import remains preview/review-only; native plant model mutation requires project-specific SDK implementation outside V1.',
    ],
  };
}

function buildOneExportRequest(projectState = {}, descriptor = {}, options = {}) {
  const row = normalizePlantCadBridgeDescriptor(descriptor);
  const state = asObject(projectState);
  const familyRows = asArray(options.bimObjectFamilies || state.bimObjectFamilies);
  const catalogRows = asArray(options.productCatalog || state.productCatalog || state.catalogRows);
  const packagePayload = buildConnectorExportPackage(state, {
    connectorType: row.connectorType,
    sourceApplication: `${row.targetApplication} Bridge`,
    sourceVersion: row.targetVersion,
    projectId: options.projectId || state.projectId || state.projectName || state.name || 'CableTrayRoute Project',
    scenario: options.scenario || state.scenario || 'Default',
    createdAt: options.createdAt || new Date().toISOString(),
    bimObjectFamilies: familyRows,
    productCatalog: catalogRows,
  });
  return {
    version: PLANT_CAD_CONNECTOR_BRIDGE_VERSION,
    requestId: `plantcad-export-${row.connectorType}-${hash(stableStringify({ descriptorId: row.id, packageId: packagePayload.id }))}`,
    createdAt: options.createdAt || new Date().toISOString(),
    descriptor: row,
    connectorPackage: {
      ...packagePayload,
      propertySets: [
        ...asArray(packagePayload.propertySets),
        ...buildBimObjectPropertySets({ familyRows, catalogRows }).filter(propertySet => !asArray(packagePayload.propertySets).some(existing => existing.name === propertySet.name)),
        { name: 'CableTrayRoute.PlantCad', properties: { connectorType: row.connectorType, bridgeMode: row.bridgeMode, reviewOnly: true } },
      ],
      mappingHints: [
        ...asArray(packagePayload.mappingHints),
        ...buildBimObjectConnectorHints({ familyRows, projectState: state }),
      ],
    },
    bridge: {
      mode: row.bridgeMode,
      reviewOnly: true,
      acceptedCommands: row.commands.map(command => command.name),
    },
    warnings: row.warnings,
    assumptions: row.assumptions,
  };
}

export function buildPlantCadExportRequest(projectState = {}, options = {}) {
  const descriptors = descriptorInputList(options.descriptors ? options : options.descriptor || options)
    .map(normalizePlantCadBridgeDescriptor);
  const requests = descriptors.map(descriptor => buildOneExportRequest(projectState, descriptor, options));
  return requests.length === 1 ? requests[0] : {
    version: PLANT_CAD_CONNECTOR_BRIDGE_VERSION,
    generatedAt: options.generatedAt || new Date().toISOString(),
    requests,
    connectorPackages: requests.map(row => row.connectorPackage),
    descriptors: requests.map(row => row.descriptor),
    warnings: requests.flatMap(row => row.warnings),
    assumptions: [
      'Plant-CAD export requests are review-only connector handoff records for AVEVA and SmartPlant SDK implementers.',
      'No native plant model mutation is performed by CableTrayRoute V1.',
    ],
  };
}

export function validatePlantCadConnectorPayload(payload = {}, options = {}) {
  const validation = validateConnectorImportPackage(payload, options);
  const pkg = validation.package;
  const errors = [...validation.errors];
  const warnings = [...validation.warnings];
  if (!PLANT_CONNECTOR_TYPES.includes(pkg.connectorType)) errors.push(`Expected AVEVA or SmartPlant connector payload, received ${pkg.connectorType || 'blank'}.`);
  if (!pkg.sourceApplication || !/aveva|e3d|pdms|smartplant|sp3d|hexagon/i.test(pkg.sourceApplication)) {
    warnings.push('Plant-CAD connector payload sourceApplication should identify AVEVA E3D/PDMS, Hexagon SmartPlant 3D, or the CableTrayRoute plant-CAD bridge.');
  }
  asArray(pkg.elements).forEach((element, index) => {
    if (!element.guid && !element.sourceId) warnings.push(`Plant-CAD element ${index + 1} has no GUID/sourceId for stable round-trip mapping.`);
    if (element.elementType === 'generic') warnings.push(`Plant-CAD element ${element.tag || element.name || index + 1} normalized as generic; review discipline/category mapping.`);
  });
  return {
    valid: errors.length === 0,
    package: pkg,
    errors,
    warnings,
  };
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

export function buildPlantCadRoundTripPreview({ payload = {}, projectState = {} } = {}) {
  const validation = validatePlantCadConnectorPayload(payload);
  const preview = applyConnectorImportPreview({ payload: validation.package, projectState });
  const syncPreviewRows = [
    ...preview.acceptedElements.map(row => ({
      id: row.id || row.guid || row.sourceId || row.tag,
      connectorType: validation.package.connectorType,
      elementType: row.elementType,
      tag: row.tag || row.name,
      guid: row.guid || row.sourceId,
      mappedProjectId: row.mappedProjectId || '',
      mappingConfidence: row.mappingConfidence || 0,
      status: row.mappedProjectId || row.mappingConfidence >= 0.8 ? 'accepted' : 'review',
      recommendation: row.mappedProjectId || row.mappingConfidence >= 0.8
        ? 'Element can be accepted into BIM Coordination records.'
        : 'Review low-confidence mapping before accepting this plant-CAD element.',
    })),
    ...preview.rejectedElements.map(({ element, errors }) => ({
      id: element.id || element.guid || element.sourceId || element.tag || '',
      connectorType: validation.package.connectorType,
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

export function normalizePlantCadNativeSyncCase(input = {}) {
  const source = asObject(input);
  const descriptors = descriptorInputList(source.descriptors || source.plantCadBridgeDescriptors || source.descriptor || {})
    .map(normalizePlantCadBridgeDescriptor);
  const nativeSyncCase = {
    id: stringValue(source.id || `plantcad-native-sync-${hash(stableStringify({
      connectorTypes: descriptors.map(row => row.connectorType),
      contractVersion: source.contractVersion || BIM_CONNECTOR_CONTRACT_VERSION,
      exchangeMode: source.exchangeMode || 'fileExchange',
    }))}`),
    version: stringValue(source.version || PLANT_CAD_NATIVE_SYNC_VERSION),
    connectorTypes: descriptors.map(row => row.connectorType),
    targetApplications: descriptors.map(row => row.targetApplication),
    contractVersion: stringValue(source.contractVersion || BIM_CONNECTOR_CONTRACT_VERSION),
    exchangeMode: stringValue(source.exchangeMode || 'fileExchange'),
    exchangeFolder: stringValue(source.exchangeFolder || '%PROJECT%/CableTrayRoute/PlantCadBridge'),
    sourceManifestMode: stringValue(source.sourceManifestMode || 'ciSafeTemplateText'),
    reviewOnly: source.reviewOnly === undefined ? true : boolValue(source.reviewOnly, true),
    supportsNativeMutation: boolValue(source.supportsNativeMutation || source.supportsLiveModelMutation, false),
    descriptors,
    notes: stringValue(source.notes || ''),
    warnings: asArray(source.warnings).map(stringValue).filter(Boolean),
    assumptions: asArray(source.assumptions).map(stringValue).filter(Boolean),
  };
  const warnings = [
    ...nativeSyncCase.warnings,
    ...(nativeSyncCase.version !== PLANT_CAD_NATIVE_SYNC_VERSION ? [`Unsupported plant-CAD native sync version: ${nativeSyncCase.version || 'blank'}.`] : []),
    ...(nativeSyncCase.contractVersion !== BIM_CONNECTOR_CONTRACT_VERSION ? [`Plant-CAD native sync contract version ${nativeSyncCase.contractVersion || 'blank'} does not match ${BIM_CONNECTOR_CONTRACT_VERSION}.`] : []),
    ...(nativeSyncCase.supportsNativeMutation ? ['Automatic AVEVA/SmartPlant model mutation was requested, but V1 native sync remains preview/review-only.'] : []),
    ...(!nativeSyncCase.reviewOnly ? ['Plant-CAD import preview should remain review-only for V1.'] : []),
  ];
  return {
    ...nativeSyncCase,
    warnings,
    assumptions: nativeSyncCase.assumptions.length ? nativeSyncCase.assumptions : [
      'Functional plant-CAD source/templates are SDK-ready handoff material and are not compiled in CableTrayRoute CI.',
      'File exchange remains the primary V1 bridge path; local HTTP endpoints validate and preview packages only.',
      'No automatic AVEVA, PDMS, SmartPlant, or CableTrayRoute schedule mutation is performed by V1 native sync.',
    ],
  };
}

export function buildPlantCadNativeExportMapping(context = {}) {
  const source = asObject(context);
  const explicitRows = asArray(source.exportMappingRows || source.mappings);
  const familyRows = asArray(source.bimObjectFamilies || source.projectState?.bimObjectFamilies);
  return (explicitRows.length ? explicitRows : DEFAULT_PLANTCAD_EXPORT_MAPPINGS).map((row, index) => {
    const item = asObject(row);
    const elementType = stringValue(item.elementType || 'generic');
    const mappedProjectType = stringValue(item.mappedProjectType || elementType);
    const familyMatch = familyRows.find(family => {
      const native = stringValue(family.nativeFormat).toLowerCase();
      const category = stringValue(family.category).toLowerCase();
      return (native.includes('ifc') || native.includes('plant') || native.includes('aveva') || native.includes('smartplant') || native.includes('sp3d'))
        && (category === mappedProjectType.toLowerCase() || stringValue(family.ifcClass).toLowerCase().includes(elementType.toLowerCase()));
    });
    const warnings = [
      ...asArray(item.warnings).map(stringValue).filter(Boolean),
      ...(!stringValue(item.plantObjectType || item.objectType) ? ['Plant object type is required for native export collection.'] : []),
      ...(!elementType ? ['Connector elementType is required.'] : []),
      ...(!mappedProjectType ? ['Mapped CableTrayRoute project type is required.'] : []),
      ...(elementType === 'generic' ? ['Generic plant object mapping should be reviewed before production exchange.'] : []),
      ...(!familyMatch ? ['No approved BIM object family/property-set hint matched this plant-CAD export mapping.'] : []),
    ];
    const normalized = {
      id: stringValue(item.id || `plantcad-export-map-${index + 1}`),
      plantObjectType: stringValue(item.plantObjectType || item.objectType),
      elementType,
      nativeClasses: stringValue(item.nativeClasses || item.classPattern || '*'),
      avevaSelector: stringValue(item.avevaSelector || item.pmlSelector || item.nativeClasses || ''),
      smartPlantSelector: stringValue(item.smartPlantSelector || item.sp3dSelector || item.nativeClasses || ''),
      familyName: stringValue(item.familyName || familyMatch?.familyName || ''),
      typeName: stringValue(item.typeName || familyMatch?.typeName || ''),
      tagSource: stringValue(item.tagSource || 'Name, Tag, DBREF, ObjectId'),
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

export function validatePlantCadNativeSourceManifest(context = {}) {
  const source = asObject(context);
  const nativeSyncCase = normalizePlantCadNativeSyncCase(source.nativeSyncCase || source);
  const sourceFiles = asArray(source.sourceFiles).map(normalizeSourceFile);
  const templateFiles = asArray(source.templateFiles).length
    ? asArray(source.templateFiles).map(stringValue).filter(Boolean)
    : [...DEFAULT_TEMPLATE_FILES];
  const joinedSource = [
    ...sourceFiles.map(file => file.content || ''),
    stringValue(source.avevaSource || ''),
    stringValue(source.smartPlantSource || ''),
    stringValue(source.serviceSource || ''),
  ].join('\n');
  const hasSourceText = sourceFiles.some(file => file.content) || Boolean(joinedSource.trim());
  const requiredTemplateFiles = [
    'connectors/native/plantcad/README.md',
    'connectors/native/plantcad/aveva-native-commands.pml',
    'connectors/native/plantcad/smartplant-native-commands.md',
    'connectors/native/plantcad/plantcad-json-service-template.md',
    'connectors/native/plantcad/plantcad-mapping-notes.md',
  ];
  const commandRows = nativeSyncCase.descriptors.flatMap(descriptor => PLANT_CAD_BRIDGE_COMMANDS.map(commandName => {
    const connectorType = descriptor.connectorType;
    const present = !hasSourceText || joinedSource.includes(commandName);
    const connectorPresent = !hasSourceText || new RegExp(connectorType === 'aveva' ? 'AVEVA|E3D|PDMS|DBREF|PML' : 'SmartPlant|SP3D|Hexagon|ObjectId', 'i').test(joinedSource);
    const functionalExport = commandName === 'ExportCableTrayRouteJson'
      ? (!hasSourceText || /DBREF|ObjectId|CableTray|Conduit|Equipment|Support|Cable|Collect|SELECT|query/i.test(joinedSource))
      : true;
    const status = present && connectorPresent && functionalExport ? 'pass' : 'fail';
    return {
      id: `${connectorType}-${commandName}`,
      connectorType,
      commandName,
      status,
      detail: status === 'pass'
        ? `${descriptor.targetApplication} template covers ${commandName}.`
        : `${descriptor.targetApplication} template is missing ${commandName}, connector-specific SDK notes, or functional export coverage.`,
    };
  }));
  const validationRows = [
    {
      id: 'template-files',
      check: 'Plant-CAD native template files',
      status: requiredTemplateFiles.every(file => templateFiles.includes(file)) ? 'pass' : 'missingData',
      detail: `${templateFiles.length} template file(s) listed.`,
    },
    {
      id: 'native-object-collector',
      check: 'Functional plant-CAD object collector',
      status: !hasSourceText || sourceContains(sourceFiles, /DBREF|ObjectId|CableTray|Conduit|Equipment|Support|Cable|Collect|SELECT|query/i) || /DBREF|ObjectId|CableTray|Conduit|Equipment|Support|Cable|Collect|SELECT|query/i.test(joinedSource) ? 'pass' : 'missingData',
      detail: 'Plant-CAD export templates should collect native IDs, tags, classes, dimensions, quantities, and property-set hints.',
    },
    {
      id: 'json-service-validation',
      check: 'Connector JSON validation/preview service',
      status: !hasSourceText || /ValidateCableTrayRoutePackage|ImportCableTrayRoutePreview|accepted|rejected|ValidateConnector|preview/i.test(joinedSource) ? 'pass' : 'missingData',
      detail: 'Plant-CAD templates should validate connector JSON and produce accepted/rejected preview rows without mutation.',
    },
    ...nativeSyncCase.descriptors.map(descriptor => ({
      id: `${descriptor.connectorType}-descriptor`,
      connectorType: descriptor.connectorType,
      check: `${descriptor.targetApplication} native descriptor`,
      status: descriptor.validation.valid ? 'pass' : 'fail',
      detail: descriptor.validation.valid ? 'Descriptor matches the current connector contract.' : descriptor.validation.errors.join(' '),
    })),
    ...commandRows.map(row => ({
      id: `command-${row.connectorType}-${row.commandName}`,
      connectorType: row.connectorType,
      check: `${row.connectorType} ${row.commandName}`,
      status: row.status,
      detail: row.detail,
    })),
  ];
  const warnings = [
    ...validationRows.filter(row => row.status !== 'pass').map(row => row.detail),
    ...nativeSyncCase.warnings,
  ];
  return {
    version: PLANT_CAD_NATIVE_SYNC_VERSION,
    nativeSyncCase,
    templateFiles,
    commandRows,
    validationRows,
    valid: !validationRows.some(row => row.status === 'fail'),
    status: validationRows.some(row => row.status === 'fail') ? 'fail' : validationRows.some(row => row.status === 'missingData' || row.status === 'warn') ? 'review' : 'pass',
    warnings,
    assumptions: [
      'Source manifest validation checks CI-safe template text only; AVEVA and Hexagon SDK compilation/execution occurs outside this repository.',
    ],
  };
}

export function buildPlantCadNativeSyncPackage(context = {}) {
  const projectState = asObject(context.projectState || context);
  const nativeSyncCase = normalizePlantCadNativeSyncCase(context.nativeSyncCase || context);
  const sourceManifest = validatePlantCadNativeSourceManifest({
    nativeSyncCase,
    sourceFiles: context.sourceFiles,
    templateFiles: context.templateFiles,
    avevaSource: context.avevaSource,
    smartPlantSource: context.smartPlantSource,
    serviceSource: context.serviceSource,
  });
  const exportMappingRows = buildPlantCadNativeExportMapping({
    exportMappingRows: context.exportMappingRows,
    bimObjectFamilies: context.bimObjectFamilies || projectState.bimObjectFamilies,
    projectState,
  });
  const exportRequests = nativeSyncCase.descriptors.map(descriptor => buildOneExportRequest(projectState, descriptor, {
    ...context,
    bimObjectFamilies: context.bimObjectFamilies || projectState.bimObjectFamilies,
    productCatalog: context.productCatalog || projectState.productCatalog,
  }));
  const samplePayloads = exportRequests.map(row => row.connectorPackage);
  const payloads = asArray(context.payloads || context.importPackages).length
    ? asArray(context.payloads || context.importPackages)
    : context.payload || context.importPackage
      ? [context.payload || context.importPackage]
      : samplePayloads;
  const previews = payloads.map(payload => buildPlantCadRoundTripPreview({ payload, projectState }));
  const validationRows = [
    ...sourceManifest.validationRows,
    ...previews.map((preview, index) => ({
      id: `connector-payload-${index + 1}`,
      connectorType: payloads[index]?.connectorType || preview.syncPreviewRows[0]?.connectorType || '',
      check: 'Plant-CAD connector payload preview',
      status: preview.validation.status,
      detail: preview.validation.errors.concat(preview.validation.warnings).join(' ') || 'Payload validates for functional plant-CAD sync preview.',
    })),
    {
      id: 'export-mapping',
      check: 'Plant-CAD export mapping coverage',
      status: exportMappingRows.some(row => row.status === 'missingData') ? 'missingData' : exportMappingRows.some(row => row.status === 'review') ? 'warn' : 'pass',
      detail: `${exportMappingRows.length} mapping row(s), ${exportMappingRows.filter(row => row.status === 'ready').length} ready.`,
    },
    {
      id: 'review-only',
      check: 'Review-only native sync policy',
      status: nativeSyncCase.reviewOnly && !nativeSyncCase.supportsNativeMutation ? 'pass' : 'warn',
      detail: nativeSyncCase.reviewOnly && !nativeSyncCase.supportsNativeMutation
        ? 'Native plant-CAD sync is configured as preview/review-only.'
        : 'Native mutation/write-back was requested; keep V1 import flows non-mutating.',
    },
  ];
  const warningRows = [
    ...nativeSyncCase.warnings.map((warning, index) => ({ id: `case-warning-${index + 1}`, severity: /version|mutation|review-only/i.test(warning) ? 'warning' : 'review', warning })),
    ...sourceManifest.warnings.map((warning, index) => ({ id: `source-warning-${index + 1}`, severity: /missing|fail/i.test(warning) ? 'warning' : 'review', warning })),
    ...exportMappingRows.flatMap(row => row.warnings.map((warning, index) => ({ id: `${row.id}-warning-${index + 1}`, severity: row.status === 'missingData' ? 'warning' : 'review', warning }))),
    ...previews.flatMap((preview, previewIndex) => preview.warnings.map((warning, index) => ({ id: `payload-${previewIndex + 1}-warning-${index + 1}`, severity: /unsupported|missing|expected/i.test(warning) ? 'warning' : 'review', warning }))),
  ];
  return {
    version: PLANT_CAD_NATIVE_SYNC_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    summary: {
      status: validationRows.some(row => row.status === 'fail') ? 'fail' : validationRows.some(row => row.status === 'warn' || row.status === 'missingData') ? 'review' : 'ready',
      contractVersion: nativeSyncCase.contractVersion,
      connectorTypes: nativeSyncCase.connectorTypes.join(', '),
      targetApplications: nativeSyncCase.targetApplications.join(', '),
      descriptorCount: nativeSyncCase.descriptors.length,
      commandCount: sourceManifest.commandRows.length,
      commandReadyCount: sourceManifest.commandRows.filter(row => row.status === 'pass').length,
      templateFileCount: sourceManifest.templateFiles.length,
      exportMappingCount: exportMappingRows.length,
      readyMappingCount: exportMappingRows.filter(row => row.status === 'ready').length,
      acceptedPreviewRows: previews.reduce((sum, preview) => sum + preview.acceptedElements.length, 0),
      rejectedPreviewRows: previews.reduce((sum, preview) => sum + preview.rejectedElements.length, 0),
      quantityDeltas: previews.reduce((sum, preview) => sum + preview.quantityDeltas.length, 0),
      mappingDeltas: previews.reduce((sum, preview) => sum + preview.mappingDeltas.length, 0),
      issueCount: previews.reduce((sum, preview) => sum + preview.issueRows.length, 0),
      warningCount: warningRows.length,
      reviewOnly: nativeSyncCase.reviewOnly && !nativeSyncCase.supportsNativeMutation,
    },
    nativeSyncCase,
    sourceManifest,
    commandRows: sourceManifest.commandRows,
    exportMappingRows,
    samplePayloads,
    exportRequests,
    validationRows,
    syncPreviewRows: previews.flatMap(preview => preview.syncPreviewRows),
    issueRows: previews.flatMap(preview => preview.issueRows),
    quantityDeltas: previews.flatMap(preview => preview.quantityDeltas),
    mappingDeltas: previews.flatMap(preview => preview.mappingDeltas),
    warningRows,
    warnings: warningRows.map(row => row.warning),
    assumptions: [
      'Functional plant-CAD native sync uses SDK-ready source/templates validated by text in CI; proprietary SDK compilation is external.',
      'File exchange remains the primary V1 workflow; local HTTP bridge endpoints validate and preview packages only.',
      'Import preview does not mutate AVEVA/PDMS/SmartPlant models or CableTrayRoute schedules automatically.',
    ],
  };
}

export function buildPlantCadSyncReadinessPackage(context = {}) {
  const projectState = asObject(context.projectState || context);
  const descriptors = descriptorInputList(context.descriptors || context.plantCadBridgeDescriptors || context.descriptor || {})
    .map(normalizePlantCadBridgeDescriptor);
  const exportRequests = descriptors.map(descriptor => buildOneExportRequest(projectState, descriptor, {
    ...context,
    bimObjectFamilies: context.bimObjectFamilies || projectState.bimObjectFamilies,
    productCatalog: context.productCatalog || projectState.productCatalog,
  }));
  const samplePayloads = exportRequests.map(row => row.connectorPackage);
  const payloads = asArray(context.payloads || context.importPackages).length
    ? asArray(context.payloads || context.importPackages)
    : context.payload || context.importPackage
      ? [context.payload || context.importPackage]
      : samplePayloads;
  const previews = payloads.map(payload => buildPlantCadRoundTripPreview({ payload, projectState }));
  const validationRows = [
    ...descriptors.map(descriptor => ({
      id: `${descriptor.connectorType}-descriptor`,
      connectorType: descriptor.connectorType,
      check: `${descriptor.targetApplication} bridge descriptor`,
      status: descriptor.validation.valid ? 'pass' : 'fail',
      detail: descriptor.validation.valid ? 'Descriptor matches the current plant-CAD bridge and connector contract.' : descriptor.validation.errors.join(' '),
    })),
    ...previews.map((preview, index) => ({
      id: `${preview.validation.valid ? 'payload' : 'payload-review'}-${index + 1}`,
      connectorType: payloads[index]?.connectorType || preview.syncPreviewRows[0]?.connectorType || '',
      check: 'Plant-CAD connector payload',
      status: preview.validation.status,
      detail: preview.validation.errors.concat(preview.validation.warnings).join(' ') || 'Payload validates for plant-CAD bridge preview.',
    })),
    ...descriptors.map(descriptor => ({
      id: `${descriptor.connectorType}-template-files`,
      connectorType: descriptor.connectorType,
      check: 'Plant-CAD template files',
      status: descriptor.templateFiles.length >= 4 ? 'pass' : 'missingData',
      detail: descriptor.templateFiles.length >= 4 ? 'Plant-CAD README, pseudo-command, and mapping templates are listed.' : 'Add missing plant-CAD starter template files.',
    })),
  ];
  const warningRows = [
    ...descriptors.flatMap(descriptor => descriptor.warnings.map((warning, index) => ({ id: `${descriptor.connectorType}-descriptor-warning-${index + 1}`, connectorType: descriptor.connectorType, severity: 'review', warning }))),
    ...previews.flatMap((preview, previewIndex) => preview.warnings.map((warning, index) => ({ id: `payload-${previewIndex + 1}-warning-${index + 1}`, connectorType: payloads[previewIndex]?.connectorType || '', severity: warning.includes('Unsupported') || warning.includes('missing version') ? 'error' : 'review', warning }))),
  ];
  return {
    version: PLANT_CAD_CONNECTOR_BRIDGE_VERSION,
    generatedAt: context.generatedAt || new Date().toISOString(),
    summary: {
      descriptorCount: descriptors.length,
      descriptorValidCount: descriptors.filter(row => row.validation.valid).length,
      validationStatus: validationRows.some(row => row.status === 'fail') ? 'fail' : validationRows.some(row => row.status === 'warn' || row.status === 'missingData') ? 'review' : 'ready',
      contractVersion: BIM_CONNECTOR_CONTRACT_VERSION,
      connectorTypes: descriptors.map(row => row.connectorType).join(', '),
      samplePayloadCount: samplePayloads.length,
      acceptedPreviewRows: previews.reduce((sum, preview) => sum + preview.acceptedElements.length, 0),
      rejectedPreviewRows: previews.reduce((sum, preview) => sum + preview.rejectedElements.length, 0),
      quantityDeltas: previews.reduce((sum, preview) => sum + preview.quantityDeltas.length, 0),
      mappingDeltas: previews.reduce((sum, preview) => sum + preview.mappingDeltas.length, 0),
      issueCount: previews.reduce((sum, preview) => sum + preview.issueRows.length, 0),
      warningCount: warningRows.length,
      reviewOnly: true,
    },
    descriptors,
    samplePayloads,
    exportRequests,
    validationRows,
    syncPreviewRows: previews.flatMap(preview => preview.syncPreviewRows),
    issueRows: previews.flatMap(preview => preview.issueRows),
    quantityDeltas: previews.flatMap(preview => preview.quantityDeltas),
    mappingDeltas: previews.flatMap(preview => preview.mappingDeltas),
    warningRows,
    warnings: warningRows.map(row => row.warning),
    assumptions: [
      'The plant-CAD bridge is a connector profile and SDK handoff package, not a certified AVEVA or SmartPlant plugin.',
      'CI validates JSON, source templates, and sample payloads without proprietary AVEVA or Hexagon SDK binaries.',
      'Round-trip imports remain preview/review-only and do not mutate plant models or CableTrayRoute schedules automatically.',
    ],
  };
}

export function renderPlantCadSyncReadinessHTML(pkg = {}) {
  const summary = pkg.summary || {};
  return `<section class="report-section" id="rpt-plantcad-sync-readiness">
  <h2>Plant CAD Connector Sync Readiness</h2>
  <p class="report-note">Native-ready AVEVA / SmartPlant connector profiles for CableTrayRoute exchange. Certified deployment requires proprietary plant SDK environments outside CI.</p>
  <dl class="report-dl">
    <dt>Connectors</dt><dd>${escapeHtml(summary.connectorTypes || '')}</dd>
    <dt>Contract</dt><dd>${escapeHtml(summary.contractVersion || '')}</dd>
    <dt>Status</dt><dd>${escapeHtml(summary.validationStatus || 'review')}</dd>
    <dt>Descriptors</dt><dd>${escapeHtml(summary.descriptorValidCount || 0)} / ${escapeHtml(summary.descriptorCount || 0)} valid</dd>
    <dt>Preview Rows</dt><dd>${escapeHtml(summary.acceptedPreviewRows || 0)} accepted / ${escapeHtml(summary.rejectedPreviewRows || 0)} rejected</dd>
    <dt>Review Only</dt><dd>${escapeHtml(summary.reviewOnly ? 'yes' : 'no')}</dd>
  </dl>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Connector</th><th>Target</th><th>Version</th><th>Templates</th><th>Warnings</th></tr></thead>
      <tbody>${asArray(pkg.descriptors).length ? asArray(pkg.descriptors).map(row => `<tr>
        <td>${escapeHtml(row.connectorType)}</td>
        <td>${escapeHtml(row.targetApplication)}</td>
        <td>${escapeHtml(row.targetVersion)}</td>
        <td>${escapeHtml(row.templateFiles.length)}</td>
        <td>${escapeHtml(row.warnings.join('; '))}</td>
      </tr>`).join('') : '<tr><td colspan="5">No plant-CAD descriptors.</td></tr>'}</tbody>
    </table>
  </div>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Validation</th><th>Connector</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>${asArray(pkg.validationRows).length ? asArray(pkg.validationRows).map(row => `<tr>
        <td>${escapeHtml(row.check)}</td>
        <td>${escapeHtml(row.connectorType)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.detail)}</td>
      </tr>`).join('') : '<tr><td colspan="4">No plant-CAD validation rows.</td></tr>'}</tbody>
    </table>
  </div>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Element</th><th>Connector</th><th>Type</th><th>GUID/Source</th><th>Status</th><th>Recommendation</th></tr></thead>
      <tbody>${asArray(pkg.syncPreviewRows).length ? asArray(pkg.syncPreviewRows).slice(0, 50).map(row => `<tr>
        <td>${escapeHtml(row.tag || row.id)}</td>
        <td>${escapeHtml(row.connectorType)}</td>
        <td>${escapeHtml(row.elementType)}</td>
        <td>${escapeHtml(row.guid)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.recommendation)}</td>
      </tr>`).join('') : '<tr><td colspan="6">No plant-CAD sync preview rows.</td></tr>'}</tbody>
    </table>
  </div>
  ${asArray(pkg.warnings).length ? `<h3>Warnings</h3><ul>${asArray(pkg.warnings).map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
</section>`;
}

export function renderPlantCadNativeSyncHTML(pkg = {}) {
  const summary = pkg.summary || {};
  return `<section class="report-section" id="rpt-plantcad-native-sync">
  <h2>Functional Plant CAD Add-In Sync Readiness</h2>
  <p class="report-note">SDK-ready AVEVA E3D/PDMS and Hexagon SmartPlant 3D export, validation, and import-preview handoff templates. Certified compiled deployment requires proprietary plant SDK environments outside CI.</p>
  <dl class="report-dl">
    <dt>Targets</dt><dd>${escapeHtml(summary.targetApplications || '')}</dd>
    <dt>Connectors</dt><dd>${escapeHtml(summary.connectorTypes || '')}</dd>
    <dt>Contract</dt><dd>${escapeHtml(summary.contractVersion || '')}</dd>
    <dt>Status</dt><dd>${escapeHtml(summary.status || 'review')}</dd>
    <dt>Commands Ready</dt><dd>${escapeHtml(summary.commandReadyCount || 0)} / ${escapeHtml(summary.commandCount || 0)}</dd>
    <dt>Export Mappings</dt><dd>${escapeHtml(summary.readyMappingCount || 0)} / ${escapeHtml(summary.exportMappingCount || 0)}</dd>
    <dt>Preview Rows</dt><dd>${escapeHtml(summary.acceptedPreviewRows || 0)} accepted / ${escapeHtml(summary.rejectedPreviewRows || 0)} rejected</dd>
    <dt>Review Only</dt><dd>${escapeHtml(summary.reviewOnly ? 'yes' : 'no')}</dd>
  </dl>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Connector</th><th>Command</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>${asArray(pkg.commandRows).length ? asArray(pkg.commandRows).map(row => `<tr>
        <td>${escapeHtml(row.connectorType)}</td>
        <td>${escapeHtml(row.commandName)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.detail)}</td>
      </tr>`).join('') : '<tr><td colspan="4">No plant-CAD command readiness rows.</td></tr>'}</tbody>
    </table>
  </div>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Plant Object</th><th>Element Type</th><th>Native Classes</th><th>Quantity</th><th>Status</th><th>Warnings</th></tr></thead>
      <tbody>${asArray(pkg.exportMappingRows).length ? asArray(pkg.exportMappingRows).map(row => `<tr>
        <td>${escapeHtml(row.plantObjectType)}</td>
        <td>${escapeHtml(row.elementType)}</td>
        <td>${escapeHtml(row.nativeClasses)}</td>
        <td>${escapeHtml(row.quantityBasis)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(asArray(row.warnings).join('; '))}</td>
      </tr>`).join('') : '<tr><td colspan="6">No plant-CAD export mapping rows.</td></tr>'}</tbody>
    </table>
  </div>
  <div class="report-scroll">
    <table class="report-table">
      <thead><tr><th>Validation</th><th>Connector</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>${asArray(pkg.validationRows).length ? asArray(pkg.validationRows).map(row => `<tr>
        <td>${escapeHtml(row.check)}</td>
        <td>${escapeHtml(row.connectorType || '')}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.detail)}</td>
      </tr>`).join('') : '<tr><td colspan="4">No plant-CAD native sync validation rows.</td></tr>'}</tbody>
    </table>
  </div>
  ${asArray(pkg.warnings).length ? `<h3>Warnings</h3><ul>${asArray(pkg.warnings).map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
</section>`;
}
