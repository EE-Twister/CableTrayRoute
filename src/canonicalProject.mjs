import { PROJECT_SCHEMA_VERSION, upgradeProjectImport } from './projectSchema.js';
import {
  buildOneLineProjectView,
  hashProjectInputs,
  normalizeOneLineReferences,
  normalizeProjectEntities,
} from '../analysis/projectIntegration.mjs';
import {
  assessStudyResult,
  captureStudyRunContext,
  fingerprintStudyValue,
  getStudyDefinition,
  getStudyDependencies,
  normalizeStudySourceSnapshot,
} from '../analysis/studyLifecycle.mjs';

const SCENARIO_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
export function isCanonicalScenarioName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 64 && SCENARIO_NAME_PATTERN.test(name);
}

/** Match dataStore.getProjectInputSnapshot() for server-side study freshness checks. */
export function getCanonicalProjectInputFingerprint(project = {}) {
  const settings = project?.settings && typeof project.settings === 'object' ? project.settings : {};
  return hashProjectInputs({
    projectMeta: settings.projectMeta || {},
    designBasis: settings.designBasis ?? null,
    equipment: Array.isArray(project.equipment) ? project.equipment : [],
    loads: Array.isArray(project.loads) ? project.loads : [],
    cables: Array.isArray(project.cables) ? project.cables : [],
    trays: Array.isArray(project.trays) ? project.trays : [],
    conduits: Array.isArray(project.conduits) ? project.conduits : [],
    ductbanks: Array.isArray(project.ductbanks) ? project.ductbanks : [],
    panels: Array.isArray(project.panels) ? project.panels : [],
    oneLine: project.oneLine || { activeSheet: 0, sheets: [] },
  });
}

export function getCanonicalStudyProvenance(project = {}, studyKey) {
  const settings = project?.settings && typeof project.settings === 'object' ? project.settings : {};
  const provenance = settings.studyProvenance;
  return provenance && typeof provenance === 'object' ? provenance[studyKey] || null : null;
}

/**
 * Return a project identity suitable for lifecycle comparisons at the API
 * boundary.  The route name is the stable fallback when an exported project
 * predates projectMeta ids.
 */
export function getCanonicalStudyProjectIdentity(project = {}, fallbackName = '') {
  const settings = project?.settings && typeof project.settings === 'object' ? project.settings : {};
  const meta = settings.projectMeta && typeof settings.projectMeta === 'object'
    ? settings.projectMeta
    : {};
  return {
    // projectManager binds currentProjectId to the saved project name when a
    // projectMeta id is absent; the API route is that same identity source.
    projectId: fallbackName || meta.id || meta.projectId || null,
    projectName: meta.name || meta.projectName || fallbackName || null,
  };
}

function getCanonicalStudyResult(project = {}, studyKey) {
  const settings = project?.settings && typeof project.settings === 'object' ? project.settings : {};
  return settings.studyResults?.[studyKey]
    || project.studies?.[studyKey]
    || project.studyResults?.[studyKey]
    || null;
}

function getCanonicalStudySettings(project = {}, studyKey) {
  const settings = project?.settings && typeof project.settings === 'object' ? project.settings : {};
  const keys = getStudyDefinition(studyKey).settings || [];
  if (!keys.length) return undefined;
  return Object.fromEntries(keys.map(key => [key, settings[key] ?? null]));
}

function normalizeCanonicalOneLineEnvelope(value = {}) {
  const source = Array.isArray(value) ? { activeSheet: 0, sheets: value } : value;
  const sheets = Array.isArray(source?.sheets) ? source.sheets : [];
  return {
    activeSheet: Number.isInteger(source?.activeSheet) && source.activeSheet >= 0 ? source.activeSheet : 0,
    sheets: sheets.map(sheet => ({
      // Match dataStore.getOneLine(): diagram-only sheet ids are not part of
      // its normalized source projection, while these defaults are.
      name: sheet?.name,
      components: Array.isArray(sheet?.components) ? sheet.components : [],
      connections: Array.isArray(sheet?.connections) ? sheet.connections : [],
      layers: Array.isArray(sheet?.layers) ? sheet.layers : [],
      ...(sheet?.backgroundImage ? { backgroundImage: sheet.backgroundImage } : {}),
      ...(Array.isArray(sheet?.protectionZones) ? { protectionZones: sheet.protectionZones } : {}),
    })),
  };
}

/**
 * Build the same source projection captured by dataStore before a browser
 * solver starts. Entity ids, One-Line references, and projectEntity/circuit
 * views are normalized here so a server assessment hashes the same source
 * semantics as a browser run. Computed One-Line overlays are stripped later
 * by normalizeStudySourceSnapshot, shared with the lifecycle implementation.
 */
export function getCanonicalStudySourceSnapshot(project = {}, studyKey = 'loadFlow') {
  const entities = normalizeProjectEntities({
    equipment: Array.isArray(project.equipment) ? project.equipment : [],
    panels: Array.isArray(project.panels) ? project.panels : [],
    loads: Array.isArray(project.loads) ? project.loads : [],
    cables: Array.isArray(project.cables) ? project.cables : [],
  });
  const references = normalizeOneLineReferences(
    normalizeCanonicalOneLineEnvelope(project.oneLine || { activeSheet: 0, sheets: [] }),
    entities,
  );
  const oneLine = buildOneLineProjectView(references, entities);
  const settings = project?.settings && typeof project.settings === 'object' ? project.settings : {};
  return normalizeStudySourceSnapshot({
    projectMeta: settings.projectMeta || {},
    designBasis: settings.designBasis ?? null,
    equipment: entities.equipment,
    loads: entities.loads,
    cables: entities.cables,
    trays: Array.isArray(project.trays) ? project.trays : [],
    conduits: Array.isArray(project.conduits) ? project.conduits : [],
    ductbanks: Array.isArray(project.ductbanks) ? project.ductbanks : [],
    panels: entities.panels,
    oneLine,
    settings: getCanonicalStudySettings(project, studyKey),
    scenario: project.meta?.scenario || 'base',
  });
}

function getCanonicalDependencyProvenance(project, studyKey) {
  const provenance = getCanonicalStudyProvenance(project, studyKey);
  const settings = project?.settings && typeof project.settings === 'object' ? project.settings : {};
  const studies = settings.studyResults && typeof settings.studyResults === 'object'
    ? settings.studyResults
    : {};
  const allProvenance = settings.studyProvenance && typeof settings.studyProvenance === 'object'
    ? settings.studyProvenance
    : {};
  const dependencies = Array.isArray(provenance?.dependencies) ? provenance.dependencies : [];
  return Object.fromEntries(dependencies
    .filter(entry => entry?.studyKey)
    .map(entry => [entry.studyKey, {
      // Recompute against the canonical project's current saved payload. A
      // server assessment must detect a changed valid upstream result rather
      // than copying the dependent run's historical hashes.
      resultHash: Object.prototype.hasOwnProperty.call(studies, entry.studyKey)
        ? fingerprintStudyValue(studies[entry.studyKey])
        : null,
      provenanceHash: Object.prototype.hasOwnProperty.call(allProvenance, entry.studyKey)
        ? fingerprintStudyValue(allProvenance[entry.studyKey])
        : null,
    }]));
}

/**
 * Capture a pure current context for a canonical project and assess one saved
 * result. Missing or legacy provenance remains unknown; callers can then
 * fall back to direct project inputs instead of consuming an unqualified
 * cached study. No global browser dataStore state is consulted.
 */
export function assessCanonicalStudy(project = {}, studyKey = 'loadFlow', options = {}) {
  return assessCanonicalStudyInternal(project, studyKey, options, new Set());
}

function assessCanonicalStudyInternal(project = {}, studyKey = 'loadFlow', {
  projectName = '', projectIdentity,
} = {}, active = new Set()) {
  const provenance = getCanonicalStudyProvenance(project, studyKey);
  const result = getCanonicalStudyResult(project, studyKey);
  const identity = projectIdentity || getCanonicalStudyProjectIdentity(project, projectName);
  if (active.has(studyKey)) {
    return assessStudyResult(studyKey, result, provenance, null, {});
  }
  const nextActive = new Set(active);
  nextActive.add(studyKey);
  const currentContext = captureCanonicalStudyRunContext(project, studyKey, {
    projectName,
    projectIdentity: identity,
    inputs: provenance?.inputsSnapshot === undefined ? null : provenance.inputsSnapshot,
    options: provenance?.optionsSnapshot === undefined ? null : provenance.optionsSnapshot,
  });
  const dependencyAssessments = {};
  const dependencyKeys = Array.isArray(provenance?.dependencies)
    ? provenance.dependencies.map(entry => entry?.studyKey).filter(Boolean)
    : getStudyDependencies(studyKey);
  dependencyKeys.forEach(dependency => {
    dependencyAssessments[dependency] = assessCanonicalStudyInternal(project, dependency, {
      projectName,
      projectIdentity: identity,
    }, nextActive);
  });
  return assessStudyResult(studyKey, result, provenance, currentContext, dependencyAssessments);
}

/** Capture a canonical server context without consulting browser storage. */
export function captureCanonicalStudyRunContext(project = {}, studyKey = 'loadFlow', {
  projectName = '',
  projectIdentity,
  ...overrides
} = {}) {
  const identity = projectIdentity || getCanonicalStudyProjectIdentity(project, projectName);
  const definition = getStudyDefinition(studyKey);
  return captureStudyRunContext(studyKey, {
    projectSnapshot: getCanonicalStudySourceSnapshot(project, studyKey),
    projectIdentity: identity,
    scenario: project.meta?.scenario || 'base',
    inputs: overrides.inputs === undefined ? null : overrides.inputs,
    options: overrides.options === undefined ? null : overrides.options,
    settings: overrides.settings === undefined ? getCanonicalStudySettings(project, studyKey) : overrides.settings,
    dependencies: overrides.dependencies === undefined
      ? getCanonicalDependencyProvenance(project, studyKey)
      : overrides.dependencies,
    modelRevision: overrides.modelRevision === undefined ? definition.modelRevision : overrides.modelRevision,
    calculationRevision: overrides.calculationRevision === undefined
      ? definition.calculationRevision
      : overrides.calculationRevision,
    ...overrides,
  });
}

/** Normalize every supported project boundary into the interchange shape. */
export function normalizeCanonicalProject(input = {}, { scenario = 'base' } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Project must be an object.');
  const source = input;
  const allowedFields = new Set([
    'schemaVersion', 'meta', 'scenarioData', 'ductbanks', 'conduits', 'trays', 'raceways',
    'cables', 'cableSchedule', 'cableTypicals', 'panels', 'equipment', 'loads', 'loadList',
    'oneLine', 'oneLineData', 'oneLineDiagram', 'mccLineups', 'settings', 'studyResults'
  ]);
  const unknownField = Object.keys(source).find(key => !allowedFields.has(key) && !key.startsWith('__'));
  if (unknownField) throw new Error(`Project field ${unknownField} is not recognized.`);
  if (source.meta !== undefined && (!source.meta || typeof source.meta !== 'object' || Array.isArray(source.meta))) {
    throw new Error('Project meta must be an object.');
  }
  if (source.meta?.scenario !== undefined && !isCanonicalScenarioName(source.meta.scenario)) {
    throw new Error(`Invalid scenario name: ${source.meta.scenario}`);
  }
  if (source.meta?.scenarios !== undefined && (!Array.isArray(source.meta.scenarios)
    || source.meta.scenarios.some(name => !isCanonicalScenarioName(name)))) {
    throw new Error('Project meta.scenarios contains an invalid scenario name.');
  }
  if (source.schemaVersion !== undefined && (!Number.isInteger(source.schemaVersion) || source.schemaVersion > PROJECT_SCHEMA_VERSION)) {
    if (Number.isInteger(source.schemaVersion) && source.schemaVersion > PROJECT_SCHEMA_VERSION) {
      throw new Error(`Project schema version ${source.schemaVersion} is newer than the supported version ${PROJECT_SCHEMA_VERSION}.`);
    }
    throw new Error(`Project schema version ${source.schemaVersion} must be an integer.`);
  }
  const arrayFields = ['ductbanks', 'conduits', 'trays', 'cables', 'cableTypicals', 'panels', 'equipment', 'loads', 'mccLineups'];
  for (const field of arrayFields) {
    if (source[field] !== undefined && !Array.isArray(source[field])) throw new Error(`/${field} must be an array.`);
  }
  for (const field of ['cableSchedule', 'loadList']) {
    if (source[field] !== undefined && !Array.isArray(source[field])) throw new Error(`/${field} must be an array.`);
  }
  const raceways = Array.isArray(source.raceways)
    ? { trays: source.raceways }
    : source.raceways && typeof source.raceways === 'object' ? source.raceways : {};
  if (source.raceways !== undefined && (!source.raceways || typeof source.raceways !== 'object')) {
    throw new Error('Project raceways must be an object.');
  }
  for (const field of ['trays', 'conduits', 'ductbanks']) {
    if (raceways[field] !== undefined && !Array.isArray(raceways[field])) throw new Error(`Project raceways.${field} must be an array.`);
  }
  const oneLineRaw = source.oneLine ?? source.oneLineData ?? source.oneLineDiagram ?? [];
  if (oneLineRaw !== undefined && !Array.isArray(oneLineRaw)
    && (!oneLineRaw || typeof oneLineRaw !== 'object' || !Array.isArray(oneLineRaw.sheets))) {
    throw new Error('Project oneLine must be an array or sheet envelope.');
  }
  const oneLine = Array.isArray(oneLineRaw)
    ? { activeSheet: 0, sheets: oneLineRaw }
    : (oneLineRaw && Array.isArray(oneLineRaw.sheets) ? oneLineRaw : { activeSheet: 0, sheets: [] });
  if (source.settings !== undefined && (!source.settings || typeof source.settings !== 'object' || Array.isArray(source.settings))) {
    throw new Error('Project settings must be an object.');
  }
  const settings = source.settings && typeof source.settings === 'object' && !Array.isArray(source.settings)
    ? { ...source.settings } : {};
  if (source.studyResults && settings.studyResults === undefined) settings.studyResults = source.studyResults;
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    meta: { version: 1, scenario: source.meta?.scenario || scenario, scenarios: Array.isArray(source.meta?.scenarios) ? source.meta.scenarios : [scenario] },
    ductbanks: Array.isArray(source.ductbanks) ? source.ductbanks : Array.isArray(raceways.ductbanks) ? raceways.ductbanks : [],
    conduits: Array.isArray(source.conduits) ? source.conduits : Array.isArray(raceways.conduits) ? raceways.conduits : [],
    trays: Array.isArray(source.trays) ? source.trays : Array.isArray(raceways.trays) ? raceways.trays : [],
    cables: Array.isArray(source.cables) ? source.cables : Array.isArray(source.cableSchedule) ? source.cableSchedule : [],
    cableTypicals: Array.isArray(source.cableTypicals) ? source.cableTypicals : [],
    panels: Array.isArray(source.panels) ? source.panels : [],
    equipment: Array.isArray(source.equipment) ? source.equipment : [],
    loads: Array.isArray(source.loads) ? source.loads : Array.isArray(source.loadList) ? source.loadList : [],
    oneLine,
    mccLineups: Array.isArray(source.mccLineups) ? source.mccLineups : [],
    settings,
    ...(source.scenarioData && typeof source.scenarioData === 'object' ? { scenarioData: source.scenarioData } : {})
  };
}

export function validateAndNormalizeCanonicalProject(input, options = {}) {
  if (input?.scenarioData !== undefined && (!input.scenarioData || typeof input.scenarioData !== 'object' || Array.isArray(input.scenarioData))) {
    throw new Error('Project scenarioData must be an object keyed by scenario name.');
  }
  const normalizedScenarios = {};
  if (input?.scenarioData && typeof input.scenarioData === 'object') {
    for (const [name, scenario] of Object.entries(input.scenarioData)) {
      if (!isCanonicalScenarioName(name)) throw new Error(`Invalid scenario name: ${name}`);
      if (scenario?.scenarioData !== undefined) throw new Error(`Nested scenarioData is not supported: ${name}.`);
      normalizedScenarios[name] = validateAndNormalizeCanonicalProject(scenario, { scenario: name });
    }
  }
  const normalized = normalizeCanonicalProject(input, options);
  const result = upgradeProjectImport(normalized);
  if (Object.keys(normalizedScenarios).length) result.scenarioData = normalizedScenarios;
  return result;
}

export function previewCanonicalProject(input, options = {}) {
  try {
    const normalized = validateAndNormalizeCanonicalProject(input, options);
    const countScenario = value => ({
      cables: Array.isArray(value?.cables) ? value.cables.length : 0,
      equipment: Array.isArray(value?.equipment) ? value.equipment.length : 0,
      loads: Array.isArray(value?.loads) ? value.loads.length : 0,
      trays: Array.isArray(value?.trays) ? value.trays.length : 0,
      conduits: Array.isArray(value?.conduits) ? value.conduits.length : 0,
      oneLineSheets: Array.isArray(value?.oneLine) ? value.oneLine.length : Array.isArray(value?.oneLine?.sheets) ? value.oneLine.sheets.length : 0,
    });
    const activeScenario = normalized.meta.scenario || options.scenario || 'base';
    const scenarioCounts = {
      ...(normalized.scenarioData && typeof normalized.scenarioData === 'object'
        ? Object.fromEntries(Object.entries(normalized.scenarioData)
          .filter(([name]) => name !== activeScenario)
          .map(([name, value]) => [name, countScenario(value)]))
        : {}),
      [activeScenario]: countScenario(normalized),
    };
    const scenarioNames = new Set([
      ...(Array.isArray(normalized.meta.scenarios) ? normalized.meta.scenarios : []),
      ...Object.keys(scenarioCounts),
    ]);
    return { valid: true, project: normalized, errors: [], scenarioCounts, counts: {
      cables: normalized.cables.length, equipment: normalized.equipment.length,
      loads: normalized.loads.length, oneLineSheets: normalized.oneLine.sheets.length,
      scenarios: scenarioNames.size
    } };
  } catch (error) {
    return { valid: false, project: null, errors: error?.errors || [{ path: '/', message: error.message }] };
  }
}
