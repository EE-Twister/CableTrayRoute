/**
 * Centralized data store wrapper around localStorage with typed getters and setters
 * for core schedule data. Emits simple change events.
 */

// Removed Ajv dependency to avoid bundling issues in the browser.
// Implement a lightweight manual validator instead.

/**
 * @typedef {{[key:string]:any}} GenericRecord
 * @typedef {GenericRecord} Tray
 * @typedef {GenericRecord} Cable
 * @typedef {GenericRecord} Ductbank
 * @typedef {GenericRecord} Conduit
 */

// Revit parser is an ES module and exports the `parseRevit` helper
// directly. Import it with a named import so it works consistently in
// both the browser and Node test environments.
import { parseRevit } from './src/importers/revit.mjs';
import { startPerformanceMeasurement } from './src/performance/performanceMetrics.js';
import { COMPACT_SYNTHESIS_KEYS, isCompactSynthesisKey, isDeviceEvidenceEnvelope, packDeviceEvidence, unpackDeviceEvidence } from './utils/designSynthesisDeviceEvidenceCodec.mjs';
import { resolveActiveProjectName } from './src/projectContext.js';
import { isProjectSettingKey, sanitizeProjectSettings } from './src/projectSettingKeys.js';
import {
  createImportableProjectSnapshot,
  isVersionedProjectSnapshot,
  prepareProjectSnapshotForSave
} from './src/projectSnapshot.js';
import { buildOneLineProjectView, hashProjectInputs, normalizeOneLineReferences, normalizeProjectEntities } from './analysis/projectIntegration.mjs';
import { normalizeStudyResultsArcFlashUnits } from './analysis/arcFlashResultUnits.mjs';
import { normalizeCableOperatingVoltage } from './analysis/cableOperatingVoltage.mjs';
import { validateAndNormalizeCanonicalProject } from './src/canonicalProject.mjs';
import {
  getProjectEntityDeletionImpact as buildProjectEntityDeletionImpact,
  getProjectReferenceDiagnostics as buildProjectReferenceDiagnostics,
  propagateProjectEntityLifecycle
} from './analysis/projectEntityLifecycle.mjs';
import {
  PROJECT_SCHEMA_VERSION,
  formatProjectSchemaErrors,
  upgradeProjectImport
} from './src/projectSchema.js';
import {
  assessStudyResult,
  buildStudyProvenance,
  captureStudyRunContext as captureLifecycleRunContext,
  fingerprintStudyValue,
  getStudyDependencies,
  getStudyDefinition,
  normalizeStudySourceSnapshot,
  STUDY_LIFECYCLE_SCHEMA_VERSION
} from './analysis/studyLifecycle.mjs';
import {
  PROJECT_KEY,
  beginProjectMutationBatch,
  endProjectMutationBatch,
  getProjectSchemaLoadError,
  getProjectState,
  getScenarioListState,
  removeProjectKey,
  setProjectState,
  setScenarioListState,
  registerScenario,
  getCurrentScenarioNameState,
  setProjectKey,
  setCurrentScenarioNameState,
  isValidScenarioName,
  readScenarioValue,
  refreshScenarioCacheFromStorageEvent,
  writeScenarioValue,
  writeScenarioSessionValue,
  removeScenarioValue,
  listScenarioKeysState,
  cloneScenarioStorage,
  writeSavedProject,
  readSavedProject,
  listSavedProjects,
  readAppSetting,
  writeAppSetting,
  wasSavedProjectMigrated,
  clearConduitCache,
  captureProjectTransactionSnapshot,
  restoreProjectTransactionSnapshot,
  getProjectStorageDiagnostics,
  onProjectChange
} from './projectStorage.js';

registerScenario(getCurrentScenarioNameState());

export function listScenarios() {
  return [...getScenarioListState()];
}

export function getCurrentScenario() {
  return getCurrentScenarioNameState();
}

export function switchScenario(name) {
  if (!name) return;
  registerScenario(name);
  setCurrentScenarioNameState(name);
  projectInputFingerprintCache = null;
  emit('scenario', getCurrentScenarioNameState());
}

export function cloneScenario(newName, from = getCurrentScenarioNameState()) {
  if (!newName) return;
  cloneScenarioStorage(from, newName);
  oneLineProjectViewCache.delete(newName);
  registerScenario(newName);
}

export function compareStudies(a, b) {
  const first = read(KEYS.studies, {}, a);
  const second = read(KEYS.studies, {}, b);
  return { [a]: first, [b]: second };
}

/**
 * Read the core project state for a named scenario without changing the
 * active scenario. Scenario Comparison uses this read-only snapshot so every
 * compared domain comes from the same scenario revision.
 *
 * @param {string} scenarioName
 * @returns {Object}
 */
export function getScenarioSnapshot(scenarioName) {
  const scenario = scenarioName || getCurrentScenarioNameState();
  const snapshot = {
    scenario,
    equipment: read(KEYS.equipment, [], scenario),
    loads: read(KEYS.loads, [], scenario),
    panels: read(KEYS.panels, [], scenario),
    cables: read(KEYS.cables, [], scenario),
    trays: read(KEYS.trays, [], scenario),
    conduits: read(KEYS.conduits, [], scenario),
    ductbanks: read(KEYS.ductbanks, [], scenario),
    oneLine: read(KEYS.oneLine, { activeSheet: 0, sheets: [] }, scenario),
    studies: read(KEYS.studies, {}, scenario),
    studyProvenance: read(EXTRA_KEYS.studyProvenance, {}, scenario),
    studyApprovals: read(EXTRA_KEYS.studyApprovals, {}, scenario),
    designBasis: read(EXTRA_KEYS.designBasis, null, scenario),
  };
  const lifecycle = getScenarioStudyLifecycleContext(scenario, snapshot);
  return {
    ...snapshot,
    projectMeta: lifecycle.projectMeta,
    settings: lifecycle.settings,
    studyContext: lifecycle,
  };
}

function getScenarioStudyLifecycleContext(scenario, snapshot) {
  const projectMeta = read(EXTRA_KEYS.projectMeta, {}, scenario) || {};
  const studies = snapshot.studies && typeof snapshot.studies === 'object' ? snapshot.studies : {};
  const studyProvenance = snapshot.studyProvenance && typeof snapshot.studyProvenance === 'object'
    ? snapshot.studyProvenance : {};
  const settingKeys = new Set(['studySettings', 'tccSettings', 'trayHardwareCatalogCustomProducts']);
  Object.keys(studies).forEach(studyKey => getStudyDefinition(studyKey).settings.forEach(key => settingKeys.add(key)));
  Object.keys(studyProvenance).forEach(studyKey => getStudyDefinition(studyKey).settings.forEach(key => settingKeys.add(key)));
  const settings = Object.fromEntries([...settingKeys].sort().map(key => [key, read(key, null, scenario)]));
  const sourceSnapshot = normalizeStudySourceSnapshot({
    projectMeta,
    designBasis: snapshot.designBasis,
    equipment: snapshot.equipment,
    loads: snapshot.loads,
    cables: snapshot.cables,
    trays: snapshot.trays,
    conduits: snapshot.conduits,
    ductbanks: snapshot.ductbanks,
    panels: snapshot.panels,
    oneLine: snapshot.oneLine,
    settings,
    scenario,
  });
  const projectIdentity = {
    projectId: projectMeta.id || projectMeta.projectId || null,
    projectName: projectMeta.name || projectMeta.projectName || null,
  };
  const currentContexts = {};
  const assessments = {};
  const visiting = new Set();
  const dependencyAssessments = {};
  const dependencySnapshots = studyKey => {
    const savedDependencies = studyProvenance?.[studyKey]?.dependencies;
    const dependencyKeys = Array.isArray(savedDependencies)
      ? savedDependencies.map(entry => entry.studyKey).filter(Boolean)
      : getStudyDependencies(studyKey).filter(dependency => Object.prototype.hasOwnProperty.call(studies, dependency));
    return Object.fromEntries([...new Set(dependencyKeys)].map(dependency => [dependency, {
      resultHash: Object.prototype.hasOwnProperty.call(studies, dependency)
        ? fingerprintStudyValue(studies[dependency]) : null,
      provenanceHash: studyProvenance?.[dependency]
        ? fingerprintStudyValue(studyProvenance[dependency]) : null,
    }]));
  };
  const visit = studyKey => {
    if (assessments[studyKey] || visiting.has(studyKey)) return assessments[studyKey] || null;
    visiting.add(studyKey);
    getStudyDependencies(studyKey).forEach(dependency => {
      if (Object.prototype.hasOwnProperty.call(studies, dependency)
          || Object.prototype.hasOwnProperty.call(studyProvenance, dependency)) visit(dependency);
    });
    const saved = studyProvenance?.[studyKey] || {};
    const definition = getStudyDefinition(studyKey);
    const studySettings = definition.settings.length
      ? Object.fromEntries(definition.settings.map(key => [key, settings[key]])) : undefined;
    const context = captureLifecycleRunContext(studyKey, {
      inputs: saved.inputsSnapshot === undefined ? null : saved.inputsSnapshot,
      options: saved.optionsSnapshot === undefined ? null : saved.optionsSnapshot,
      settings: studySettings,
      projectSnapshot: { ...sourceSnapshot, settings: studySettings },
      dependencies: dependencySnapshots(studyKey),
      projectIdentity,
      scenario,
      modelRevision: definition.modelRevision,
      calculationRevision: definition.calculationRevision,
    });
    currentContexts[studyKey] = context;
    const assessment = assessStudyResult(
      studyKey,
      studies[studyKey],
      saved,
      context,
      dependencyAssessments,
    );
    assessments[studyKey] = assessment;
    dependencyAssessments[studyKey] = assessment;
    visiting.delete(studyKey);
    return assessment;
  };
  [...new Set([...Object.keys(studies), ...Object.keys(studyProvenance)])]
    .filter(studyKey => !studyKey.startsWith('_'))
    .sort()
    .forEach(visit);
  return {
    schemaVersion: STUDY_LIFECYCLE_SCHEMA_VERSION,
    scenario,
    projectMeta,
    projectIdentity,
    settings,
    sourceSnapshot,
    currentContexts,
    currentStudyContexts: currentContexts,
    assessments,
    precomputedAssessments: assessments,
  };
}

const KEYS = {
  // Preferred property names
  trays: 'traySchedule',
  cables: 'cableSchedule',
  cableTypicals: 'cableTypicals',
  ductbanks: 'ductbankSchedule',
  conduits: 'conduitSchedule',
  panels: 'panelSchedule',
  loads: 'loadList',
  equipment: 'equipment',
  oneLine: 'oneLineDiagram',
  studies: 'studyResults',
  // Legacy aliases for backward compatibility
  traySchedule: 'traySchedule',
  cableSchedule: 'cableSchedule',
  ductbankSchedule: 'ductbankSchedule',
  conduitSchedule: 'conduitSchedule',
  panelSchedule: 'panelSchedule',
  loadList: 'loadList',
  equipmentList: 'equipment',
  oneLineDiagram: 'oneLineDiagram'
};

const EXTRA_KEYS = {
  equipmentColumns: 'equipmentColumns',
  collapsedGroups: 'collapsedGroups',
  cableSchedulePreset: 'cableSchedulePreset',
  cableTemplates: 'cableTemplates',
  cableTagSettings: 'cableTagSettings',
  cableChangeLog: 'cableChangeLog',
  loadListViewPreset: 'loadListViewPreset',
  equipmentListViewPreset: 'equipmentListViewPreset',
  racewayScheduleViewPreset: 'racewayScheduleViewPreset',
  equipmentFilterPresets: 'equipmentFilterPresets',
  trayHardwareCatalogCustomProducts: 'trayHardwareCatalogCustomProducts',
  bimCoordinationSnapshot: 'bimCoordinationSnapshot',
  bimCoordinationIssues: 'bimCoordinationIssues',
  drcAcceptedFindings: 'drcAcceptedFindings',
  studyApprovals: 'studyApprovals',
  studyProvenance: 'studyProvenance',
  cathodicProtectionDraft: 'cathodicProtectionDraft',
  reportSnapshots: 'reportSnapshots',
  lifecyclePackages: 'lifecyclePackages',
  deliverableArtifacts: 'deliverableArtifacts',
  fieldExecutionRecords: 'fieldExecutionRecords',
  fieldObservations: 'fieldObservations',
  fieldObservationQueue: 'fieldObservationQueue',
  procurementRegister: 'procurementRegister',
  projectMeta: 'projectMeta',
  designBasis: 'designBasis',
  designGateApprovals: 'designGateApprovals',
  coachAuditTrail: 'coachAuditTrail',
  groundGridSoilMeasurements: 'groundGridSoilMeasurements',
  groundGridRiskPoints: 'groundGridRiskPoints',
  mccLineups: 'mccLineups',
  switchingProcedures: 'switchingProcedures',
};

const LEGACY_STUDIES_SETTING_KEY = 'studies';
const PROJECT_INPUT_KEYS = new Set([
  KEYS.equipment,
  KEYS.loads,
  KEYS.panels,
  KEYS.cables,
  KEYS.trays,
  KEYS.conduits,
  KEYS.ductbanks,
  KEYS.oneLine,
  EXTRA_KEYS.projectMeta,
  EXTRA_KEYS.designBasis,
]);
const NAMED_PROJECT_WRITE_KEYS = new Set([...PROJECT_INPUT_KEYS, KEYS.studies]);
const ONE_LINE_VIEW_INPUT_KEYS = new Set([
  KEYS.equipment,
  KEYS.loads,
  KEYS.panels,
  KEYS.cables,
  KEYS.oneLine,
]);
let projectInputFingerprintCache = null;
let projectInputFingerprintScenario = '';
const ONE_LINE_VIEW_CACHE_SYMBOL = Symbol.for('cabletrayroute.oneLineProjectViewCache');
const oneLineProjectViewCache = globalThis[ONE_LINE_VIEW_CACHE_SYMBOL] instanceof Map
  ? globalThis[ONE_LINE_VIEW_CACHE_SYMBOL]
  : new Map();
globalThis[ONE_LINE_VIEW_CACHE_SYMBOL] = oneLineProjectViewCache;

onProjectChange(() => {
  projectInputFingerprintCache = null;
  projectInputFingerprintScenario = '';
  oneLineProjectViewCache.clear();
});

export const STORAGE_KEYS = { ...KEYS, ...EXTRA_KEYS };

const listeners = {};
let deferredEvents = null;

function emit(event, detail) {
  if (deferredEvents) {
    deferredEvents.set(event, detail);
    return;
  }
  (listeners[event] || []).forEach(fn => {
    try { fn(detail); } catch (e) { console.error(e); }
  });
}

/**
 * Subscribe to change events.
 * @param {string} event
 * @param {(data:any)=>void} handler
 */
export function on(event, handler) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(handler);
}

/**
 * Remove an event listener.
 * @param {string} event
 * @param {(data:any)=>void} handler
 */
export function off(event, handler) {
  const arr = listeners[event];
  if (!arr) return;
  const idx = arr.indexOf(handler);
  if (idx >= 0) arr.splice(idx, 1);
}

// Propagate localStorage changes across browser tabs/windows. When one page
// updates a schedule (e.g. cables from the One-Line view), other open pages
// need to receive the same event so their UIs stay in sync. The `storage`
// event only fires in other tabs, so we translate the changed key back into
// our internal event name and emit it.
const crossWindowKeys = new Set([
  ...Object.values(KEYS),
  ...Object.values(EXTRA_KEYS),
  ...COMPACT_SYNTHESIS_KEYS
]);

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', e => {
    if (!e.key) return;
    const scenarioPrefix = `${getCurrentScenarioNameState()}:`;
    if (!e.key.startsWith(scenarioPrefix)) return;
    const key = e.key.slice(scenarioPrefix.length);
    if (!key || key.includes(':')) return;
    if (!crossWindowKeys.has(key)) return;
    try {
      const stored = e.newValue ? JSON.parse(e.newValue) : undefined;
      const val = isCompactSynthesisKey(key) ? unpackDeviceEvidence(stored) : stored;
      if (PROJECT_INPUT_KEYS.has(key)) projectInputFingerprintCache = null;
      if (ONE_LINE_VIEW_INPUT_KEYS.has(key)) oneLineProjectViewCache.delete(getCurrentScenarioNameState());
      // Refresh this bundle's cache before notification, regardless of the
      // registration order of the separate project-storage listener.
      if (isCompactSynthesisKey(key)) refreshScenarioCacheFromStorageEvent(key, e.newValue);
      emit(key, val);
    } catch (err) {
      console.warn('storage event: failed to parse value for key', e.key, err);
    }
  });
}

function read(key, fallback, scenario = getCurrentScenarioNameState()) {
  const stored = readScenarioValue(key, fallback, scenario);
  return isCompactSynthesisKey(key) ? unpackDeviceEvidence(stored) : stored;
}

export function hasNamedProjectContext() {
  if (typeof window === 'undefined') return true;
  if (!window.location?.href || /jsdom/i.test(window.navigator?.userAgent || '')) return true;
  const params = new URLSearchParams(window.location?.search || '');
  if (params.has('e2e')) return true;
  let storedProjectName = '';
  try {
    storedProjectName = getProjectState()?.name || '';
  } catch (e) {
    console.warn('Failed to read active project context', e);
  }
  const projectId = resolveActiveProjectName(window.currentProjectId, storedProjectName);
  if (projectId && window.currentProjectId !== projectId) {
    window.currentProjectId = projectId;
  }
  return Boolean(projectId);
}

function write(key, value, scenario = getCurrentScenarioNameState(), options = {}) {
  try {
    if (NAMED_PROJECT_WRITE_KEYS.has(key) && options.allowUnnamedProject !== true && !hasNamedProjectContext()) {
      if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('ctr:project-required', { detail: { key } }));
      }
      return false;
    }
    const visible = isCompactSynthesisKey(key) ? unpackDeviceEvidence(value) : value;
    if (isCompactSynthesisKey(key)) {
      const current = unpackDeviceEvidence(readScenarioValue(key, null, scenario));
      if (isDeviceEvidenceEnvelope(visible) || isDeviceEvidenceEnvelope(current)) {
        throw new Error('Device evidence is corrupted or uses an unsupported encoding; the stored data was preserved.');
      }
    }
    const stored = isCompactSynthesisKey(key) ? packDeviceEvidence(visible) : visible;
    const changed = writeScenarioValue(key, stored, scenario, options);
    if (!changed) return false;
    if (PROJECT_INPUT_KEYS.has(key)) projectInputFingerprintCache = null;
    if (ONE_LINE_VIEW_INPUT_KEYS.has(key)) oneLineProjectViewCache.delete(scenario);
    emit(key, visible);
    return true;
  } catch (e) {
    console.error('Failed to store', key, e);
    return false;
  }
}

function writeCanonicalCollection(collection, key, previousRecords, nextRecords, scenario, options = {}) {
  const lifecycle = propagateProjectEntityLifecycle({
    collection,
    previousRecords,
    nextRecords,
    loads: read(KEYS.loads, [], scenario),
    cables: read(KEYS.cables, [], scenario),
    oneLine: read(KEYS.oneLine, { activeSheet: 0, sheets: [] }, scenario)
  });
  const ownsEventBatch = !deferredEvents;
  if (ownsEventBatch) beginEventBatch();
  beginProjectMutationBatch();
  try {
    const changed = write(key, nextRecords, scenario, options);
    if (!changed) return false;
    if (key !== KEYS.loads && lifecycle.loads.changed) write(KEYS.loads, lifecycle.loads.value, scenario);
    if (key !== KEYS.cables && lifecycle.cables.changed) write(KEYS.cables, lifecycle.cables.value, scenario);
    if (lifecycle.oneLine.changed) {
      setOneLine(lifecycle.oneLine.value, scenario, { captureRevision: false });
    }
    return true;
  } finally {
    endProjectMutationBatch();
    if (ownsEventBatch) flushEventBatch();
  }
}

/**
 * @returns {Tray[]}
 */
export const getTrays = () => read(KEYS.trays, []);
/**
 * @param {Tray[]} trays
 */
export const setTrays = trays => write(KEYS.trays, trays);

/**
 * @returns {Cable[]}
 */
export const getCables = () => {
  const raw = read(KEYS.cables, []);
  const normalized = normalizeProjectEntities({
    equipment: getEquipment(),
    loads: getLoads(),
    cables: raw,
  }).cables;
  if (JSON.stringify(raw) !== JSON.stringify(normalized)) write(KEYS.cables, normalized);
  return normalized;
};
/**
 * @param {Cable[]} cables
 */
export const setCables = (cables, options = {}) => {
  const scenario = options.scenario || getCurrentScenarioNameState();
  const normalized = normalizeProjectEntities({
    equipment: getEquipment(),
    loads: getLoads(),
    cables,
  }).cables;
  return writeCanonicalCollection('cables', KEYS.cables, read(KEYS.cables, [], scenario), normalized, scenario, options);
};

/**
 * Read the cable schedule for a specific named scenario without switching the
 * active scenario.  Used by the scenario comparison UI.
 * @param {string} scenarioName
 * @returns {Cable[]}
 */
export const getCablesForScenario = scenarioName => read(KEYS.cables, [], scenarioName);

/**
 * Read the tray schedule for a specific named scenario without switching the
 * active scenario.  Used by the scenario comparison UI.
 * @param {string} scenarioName
 * @returns {Tray[]}
 */
export const getTraysForScenario = scenarioName => read(KEYS.trays, [], scenarioName);

export const getCableTypicals = () => read(KEYS.cableTypicals, []);
export const setCableTypicals = typicals => write(KEYS.cableTypicals, typicals);

export const getCableTemplates = () => read(EXTRA_KEYS.cableTemplates, []);
export const setCableTemplates = templates => write(EXTRA_KEYS.cableTemplates, templates);

export const getCableTagSettings = () => read(EXTRA_KEYS.cableTagSettings, {});
export const setCableTagSettings = settings => write(EXTRA_KEYS.cableTagSettings, settings);

export const getCableChangeLog = () => read(EXTRA_KEYS.cableChangeLog, []);
export const setCableChangeLog = entries => write(EXTRA_KEYS.cableChangeLog, entries);


export const getEquipmentFilterPresets = () => read(EXTRA_KEYS.equipmentFilterPresets, []);
export const setEquipmentFilterPresets = presets => write(EXTRA_KEYS.equipmentFilterPresets, presets);

export const getSwitchingProcedures = () => read(EXTRA_KEYS.switchingProcedures, []);
export const setSwitchingProcedures = procedures => write(EXTRA_KEYS.switchingProcedures, Array.isArray(procedures) ? procedures : []);

export const getTrayHardwareCatalogCustomProducts = () => read(EXTRA_KEYS.trayHardwareCatalogCustomProducts, []);
export const setTrayHardwareCatalogCustomProducts = products => write(EXTRA_KEYS.trayHardwareCatalogCustomProducts, products);

/**
 * DRC accepted findings — engineer "Accept Risk" annotations persisted per scenario.
 * Each entry: { key, ruleId, location, note, reviewedBy?, acceptedAt }
 * @returns {object[]}
 */
export const getDrcAcceptedFindings = () => read(EXTRA_KEYS.drcAcceptedFindings, []);
export const setDrcAcceptedFindings = list => write(EXTRA_KEYS.drcAcceptedFindings, list);

/**
 * Study-level engineer approval / PE stamp records.
 * Keyed by study name (e.g. 'arcFlash', 'loadFlow', 'shortCircuit').
 * Each entry: { status: 'pending'|'flagged', reviewedBy, approvedAt, note }
 * @returns {Object.<string, {status:string, reviewedBy:string, approvedAt:string, note:string}>}
 */
export const getStudyApprovals = () => read(EXTRA_KEYS.studyApprovals, {});

/**
 * Set or merge the approval record for a single study.
 * @param {string} studyKey
 * @param {{status?:string, reviewedBy?:string, approvedAt?:string, note?:string}} approval
 */
export const setStudyApproval = (studyKey, approval) => {
  const all = getStudyApprovals();
  const status = approval?.status === 'flagged' ? 'flagged' : 'pending';
  all[studyKey] = {
    ...all[studyKey],
    ...approval,
    status,
    reviewedBy: typeof approval?.reviewedBy === 'string' ? approval.reviewedBy : (all[studyKey]?.reviewedBy || ''),
    approvedAt: typeof approval?.approvedAt === 'string' ? approval.approvedAt : (all[studyKey]?.approvedAt || ''),
    note: typeof approval?.note === 'string' ? approval.note : (all[studyKey]?.note || ''),
  };
  write(EXTRA_KEYS.studyApprovals, all);
};

/**
 * Remove the approval record for a single study (resets to "no review").
 * @param {string} studyKey
 */
export const clearStudyApproval = studyKey => {
  const all = getStudyApprovals();
  delete all[studyKey];
  write(EXTRA_KEYS.studyApprovals, all);
};

// ---------------------------------------------------------------------------
// Report package snapshots
// ---------------------------------------------------------------------------

/** Return all saved report package snapshots keyed by snapshot id. */
export const getReportSnapshots = () => read(EXTRA_KEYS.reportSnapshots, {});

/**
 * Persist a report package snapshot.
 * @param {string} id - snapshot identifier (e.g. 'pkg-1234567890')
 * @param {object} pkg - serializable ReportPackage object
 */
export const setReportSnapshot = (id, pkg) => {
  const all = getReportSnapshots();
  all[id] = pkg;
  write(EXTRA_KEYS.reportSnapshots, all);
};

/**
 * Delete a saved report package snapshot.
 * @param {string} id
 */
export const deleteReportSnapshot = id => {
  const all = getReportSnapshots();
  delete all[id];
  write(EXTRA_KEYS.reportSnapshots, all);
};

// ---------------------------------------------------------------------------
// Lifecycle packages (Gap #71 — project model governance)
// ---------------------------------------------------------------------------

/** Return all saved lifecycle packages as an array, newest first. */
export const getLifecyclePackages = () => read(EXTRA_KEYS.lifecyclePackages, []);

/**
 * Append a lifecycle package to storage.
 * @param {object} pkg - serializable LifecyclePackage object
 */
export const addLifecyclePackage = pkg => {
  const list = getLifecyclePackages();
  list.unshift(pkg); // newest first
  write(EXTRA_KEYS.lifecyclePackages, list);
};

/**
 * Delete a lifecycle package by id.
 * @param {string} id
 */
export const deleteLifecyclePackage = id => {
  const list = getLifecyclePackages().filter(p => p.id !== id);
  write(EXTRA_KEYS.lifecyclePackages, list);
};

// Structured deliverable records connect page exports back to the project.
// Each artifact carries its own source fingerprint, revision, status, and
// included-section manifest so downstream packages can identify stale inputs.
export const getDeliverableArtifacts = () => read(EXTRA_KEYS.deliverableArtifacts, []);
export const setDeliverableArtifacts = artifacts => write(
  EXTRA_KEYS.deliverableArtifacts,
  Array.isArray(artifacts) ? artifacts : []
);
export const upsertDeliverableArtifact = artifact => {
  if (!artifact || typeof artifact !== 'object' || !artifact.id) return;
  const artifacts = getDeliverableArtifacts();
  const index = artifacts.findIndex(item => item?.id === artifact.id);
  if (index >= 0) artifacts[index] = artifact;
  else artifacts.unshift(artifact);
  setDeliverableArtifacts(artifacts);
};

// Field execution records are keyed by stable record type and source tag.
// The presentation can evolve independently from this shared project data.
export const getFieldExecutionRecords = () => read(EXTRA_KEYS.fieldExecutionRecords, []);
export const setFieldExecutionRecords = records => write(
  EXTRA_KEYS.fieldExecutionRecords,
  Array.isArray(records) ? records : []
);

// Offline-first field observations and their pending project-save queue.
// Attachments are metadata/data-URI records owned by the active project.
export const getFieldObservations = () => read(EXTRA_KEYS.fieldObservations, []);
export const setFieldObservations = observations => write(
  EXTRA_KEYS.fieldObservations,
  Array.isArray(observations) ? observations : []
);
export const getFieldObservationQueue = () => read(EXTRA_KEYS.fieldObservationQueue, []);
export const setFieldObservationQueue = queue => write(
  EXTRA_KEYS.fieldObservationQueue,
  Array.isArray(queue) ? queue : []
);

// Procurement schedule workflow state. The procurement page owns the record
// shape while storage keeps it scenario-aware and included in project exports.
export const getProcurementRegister = () => read(EXTRA_KEYS.procurementRegister, []);
export const setProcurementRegister = records => write(
  EXTRA_KEYS.procurementRegister,
  Array.isArray(records) ? records : []
);

// Canonical project identity and site context. Keep this separate from the
// display-only project name so every calculator and deliverable can bind to
// the same client, location, engineer, revision, and environmental values.
export const getProjectMeta = () => read(EXTRA_KEYS.projectMeta, {});
export const setProjectMeta = meta => write(
  EXTRA_KEYS.projectMeta,
  meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {}
);

// Project-level design basis wizard settings
export const getDesignBasis = () => read(EXTRA_KEYS.designBasis, null);
export const setDesignBasis = basis => write(EXTRA_KEYS.designBasis, basis);
export const getDesignGateApprovals = () => read(EXTRA_KEYS.designGateApprovals, {});
export const setDesignGateApprovals = approvals => write(EXTRA_KEYS.designGateApprovals, approvals && typeof approvals === 'object' && !Array.isArray(approvals) ? approvals : {});


// Design Coach audit trail (Gap #79 — cross-study design coach)
// ---------------------------------------------------------------------------

export const getCoachAuditTrail = () => read(EXTRA_KEYS.coachAuditTrail, []);
export const setCoachAuditTrail = list => write(EXTRA_KEYS.coachAuditTrail, list);

// Ground grid advanced study persistence (Gap #74)
export const getGroundGridSoilMeasurements = () => read(EXTRA_KEYS.groundGridSoilMeasurements, []);
export const setGroundGridSoilMeasurements = list => write(EXTRA_KEYS.groundGridSoilMeasurements, list);
export const getGroundGridRiskPoints = () => read(EXTRA_KEYS.groundGridRiskPoints, []);
export const setGroundGridRiskPoints = list => write(EXTRA_KEYS.groundGridRiskPoints, list);

// MCC lineup layout persistence
export const getMccLineups = () => read(EXTRA_KEYS.mccLineups, []);
export const setMccLineups = lineups => write(EXTRA_KEYS.mccLineups, Array.isArray(lineups) ? lineups : []);

/**
 * Append a cable record to the existing cable schedule.
 * @param {Cable} cable
 */
export const addCable = cable => {
  const list = getCables();
  list.push(cable);
  setCables(list);
};

/**
 * @returns {Ductbank[]}
 */
export const getDuctbanks = () => read(KEYS.ductbanks, []);
/**
 * @param {Ductbank[]} banks
 */
export const setDuctbanks = banks => write(KEYS.ductbanks, banks);

/**
 * @returns {Conduit[]}
 */
export const getConduits = () => read(KEYS.conduits, []);
/**
 * @param {Conduit[]} conduits
 */
export const setConduits = conduits => write(KEYS.conduits, conduits);

/**
 * Append a raceway record. If the object contains `tray_id` it is stored
 * with trays; otherwise it is assumed to be a conduit.
 * @param {Tray|Conduit} raceway
 */
export const addRaceway = raceway => {
  if (!raceway) return;
  if (raceway.tray_id) {
    const trays = getTrays();
    trays.push(raceway);
    setTrays(trays);
  } else {
    const conduits = getConduits();
    conduits.push(raceway);
    setConduits(conduits);
  }
};

/**
 * @returns {GenericRecord[]}
 */
export const getPanels = () => read(KEYS.panels, []);

/**
 * Read and normalize the four schedules consumed together by One-Line.
 * This avoids re-reading equipment and loads through dependent getters for
 * every render while preserving the individual getter APIs elsewhere.
 */
export function getOneLineScheduleCollections() {
  return normalizeOneLineScheduleCollections({
    equipment: read(KEYS.equipment, []),
    panels: read(KEYS.panels, []),
    loads: read(KEYS.loads, []),
    cables: read(KEYS.cables, []),
  });
}

/**
 * Pure counterpart of getOneLineScheduleCollections: normalizes raw schedule
 * arrays without touching storage, so callers holding a project snapshot
 * (e.g. the REST API) get exactly the records the browser studies see.
 * @param {{equipment?:GenericRecord[], panels?:GenericRecord[], loads?:GenericRecord[], cables?:GenericRecord[]}} raw
 * @returns {Map<string, GenericRecord[]>}
 */
export function normalizeOneLineScheduleCollections(raw = {}) {
  const list = value => (Array.isArray(value) ? value : []);
  const equipment = normalizeProjectEntities({
    equipment: list(raw.equipment).map(ensureEquipmentFields),
  }).equipment;
  const panels = normalizeProjectEntities({
    panels: list(raw.panels).map(ensurePanelFields),
  }).panels;
  const loads = normalizeProjectEntities({
    equipment,
    loads: list(raw.loads).map(ensureLoadFields),
  }).loads;
  const cables = normalizeProjectEntities({ equipment, loads, cables: list(raw.cables) }).cables;
  return new Map([
    ['equipment', equipment],
    ['panel', panels],
    ['load', loads],
    ['cable', cables],
  ]);
}

const DEFAULT_PANEL_CIRCUIT_COUNT = 42;
const MAX_PANEL_CIRCUITS = 512;

function normalizePanelCircuitCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_PANEL_CIRCUIT_COUNT;
  return Math.min(parsed, MAX_PANEL_CIRCUITS);
}
/**
 * @param {GenericRecord} panel
 */
function ensurePanelFields(panel) {
  const normalized = {
    id: '',
    description: '',
    ref: '',
    voltage: '',
    manufacturer: '',
    model: '',
    catalog_number: '',
    catalogNumber: '',
    approved_part: false,
    catalog_source: '',
    catalog_last_verified: '',
    datasheet_url: '',
    bim_ref: '',
    phases: '',
    notes: '',
    mainRating: '',
    circuitCount: DEFAULT_PANEL_CIRCUIT_COUNT,
    ...panel
  };
  normalized.circuitCount = normalizePanelCircuitCount(normalized.circuitCount);
  return normalized;
}
/**
 * @param {GenericRecord[]} panels
 */
export const setPanels = (panels, options = {}) => {
  const scenario = options.scenario || getCurrentScenarioNameState();
  const source = options.preserveShape ? panels : panels.map(ensurePanelFields);
  const normalized = normalizeProjectEntities({ panels: source }).panels;
  return writeCanonicalCollection('panels', KEYS.panels, read(KEYS.panels, [], scenario), normalized, scenario, options);
};

/**
 * @returns {GenericRecord[]}
 */
export const getEquipment = () => {
  const raw = read(KEYS.equipment, []);
  const withFields = raw.map(ensureEquipmentFields);
  const normalized = normalizeProjectEntities({ equipment: withFields }).equipment;
  if (JSON.stringify(raw) !== JSON.stringify(normalized)) write(KEYS.equipment, normalized);
  return normalized;
};
/**
 * @param {GenericRecord[]} equipment
 */
function ensureEquipmentFields(eq) {
  return {
    id: '',
    ref: '',
    tag: '',
    description: '',
    voltage: '',
    category: '',
    subCategory: '',
    arrangement: '',
    width: '',
    depth: '',
    height: '',
    baseElevation: '',
    lineup: '',
    x: '',
    y: '',
    z: '',
    manufacturer: '',
    model: '',
    cyberAssetClass: '',
    cyberCriticality: '',
    firmwareVersion: '',
    protocols: [],
    cyberZone: '',
    remoteAccess: {},
    passwordPolicy: false,
    patchCurrent: false,
    cipEvidence: '',
    phases: '',
    notes: '',
    ...eq
  };
}

export const setEquipment = (list, options = {}) => {
  const scenario = options.scenario || getCurrentScenarioNameState();
  const source = options.preserveShape ? list : list.map(ensureEquipmentFields);
  const normalized = normalizeProjectEntities({ equipment: source }).equipment;
  return writeCanonicalCollection('equipment', KEYS.equipment, read(KEYS.equipment, [], scenario), normalized, scenario, options);
};

export const addEquipment = item => {
  const list = getEquipment();
  list.push(ensureEquipmentFields(item));
  setEquipment(list);
};

export const updateEquipment = (index, item) => {
  const list = getEquipment();
  if (index >= 0 && index < list.length) {
    list[index] = ensureEquipmentFields({ ...list[index], ...item });
    setEquipment(list);
  }
};

export const removeEquipment = index => {
  const list = getEquipment();
  if (index >= 0 && index < list.length) {
    list.splice(index, 1);
    setEquipment(list);
  }
};

/**
 * @typedef {Object} OneLineComponent
 * @property {string} id Unique identifier
 * @property {string} type Component type (equipment, panel, load)
 * @property {number} x X coordinate
 * @property {number} y Y coordinate
 * @property {string} [label] Display label
 * @property {string} [ref] Linked schedule id
 * @property {{target:string, cable?:Cable}[]} [connections] Connections to other components with optional cable spec
 * @property {string} [layer] Named layer id this component belongs to (Gap #51)
 */

/**
 * @typedef {Object} OneLineLayer
 * @property {string} id Unique layer identifier
 * @property {string} name Display name
 * @property {boolean} visible Whether components on this layer are rendered
 * @property {boolean} locked Whether components on this layer are selectable/editable
 */

/**
 * @typedef {Object} OneLineSheet
 * @property {string} name
 * @property {OneLineComponent[]} components
 * @property {OneLineLayer[]} [layers] Named layers for this sheet (Gap #51)
 */

/**
 * Retrieve saved one-line sheets. Supports legacy single-sheet format.
 * @returns {OneLineSheet[]}
 */
export const getOneLine = (scenario = getCurrentScenarioNameState()) => {
  const cloneView = value => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  };
  if (oneLineProjectViewCache.has(scenario)) {
    return cloneView(oneLineProjectViewCache.get(scenario));
  }
  const view = buildOneLineView(
    read(KEYS.oneLine, {}, scenario),
    () => oneLineReferencesFromSchedules(getOneLineScheduleCollections())
  );
  oneLineProjectViewCache.set(scenario, cloneView(view));
  return view;
};

function oneLineReferencesFromSchedules(schedules) {
  return {
    equipment: schedules.get('equipment'),
    panels: schedules.get('panel'),
    loads: schedules.get('load'),
    cables: schedules.get('cable'),
  };
}

/**
 * Normalize stored one-line data (legacy component array or sheet object) and
 * join it to the project schedules. Pure: storage access is left to callers.
 * @param {any} data Raw stored one-line value.
 * @param {() => object} resolveReferences Lazily supplies normalized schedules.
 * @returns {{activeSheet:number, sheets:OneLineSheet[]}}
 */
function buildOneLineView(data, resolveReferences) {
  const normalizeActiveSheet = value => (Number.isInteger(value) && value >= 0 ? value : 0);
  if (Array.isArray(data)) {
    const references = resolveReferences();
    // legacy array of components
    const normalized = normalizeOneLineReferences(
      { activeSheet: 0, sheets: [{ name: 'Sheet 1', components: data, connections: [], layers: [] }] },
      references
    );
    return buildOneLineProjectView(normalized, references);
  }
  if (data && Array.isArray(data.sheets)) {
    const references = resolveReferences();
    const normalized = normalizeOneLineReferences({
      activeSheet: normalizeActiveSheet(data.activeSheet),
      sheets: data.sheets.map(s => ({
        name: s.name,
        components: Array.isArray(s.components) ? s.components : [],
        connections: Array.isArray(s.connections) ? s.connections : [],
        layers: Array.isArray(s.layers) ? s.layers : [],
        // Gap #52: preserve background image underlay per sheet
        ...(s.backgroundImage ? { backgroundImage: s.backgroundImage } : {}),
        // Gap #50: preserve protection zone definitions per sheet
        ...(Array.isArray(s.protectionZones) ? { protectionZones: s.protectionZones } : {})
      }))
    }, references);
    return buildOneLineProjectView(normalized, references);
  }
  return { activeSheet: 0, sheets: [] };
}

/**
 * Build request-scoped study inputs from a saved project snapshot (the shape
 * produced by exportProject) without reading or writing storage. Server-side
 * study endpoints use this so concurrent requests never share mutable state
 * and see the same normalized one-line, cable schedule, and TCC settings that
 * the browser studies use.
 * @param {object} project Saved project data.
 * @returns {{oneLine:{activeSheet:number, sheets:OneLineSheet[]}, cables:Cable[], tccSettings:object|null}}
 */
export function buildProjectAnalysisModel(project = {}) {
  const source = project && typeof project === 'object' ? project : {};
  const schedules = normalizeOneLineScheduleCollections({
    equipment: source.equipment,
    panels: source.panels,
    loads: source.loads,
    cables: Array.isArray(source.cables) ? source.cables : source.cableSchedule,
  });
  const oneLine = buildOneLineView(
    source.oneLine ?? source.oneLineData ?? {},
    () => oneLineReferencesFromSchedules(schedules)
  );
  const tccSettings = source.settings?.tccSettings ?? source.tccSettings ?? null;
  return { oneLine, cables: schedules.get('cable'), tccSettings };
}
/**
 * Persist one-line sheets
 * @param {OneLineSheet[]} sheets
 */
const REVISION_KEY = 'oneLineRevisions';
const MAX_REVISION_COUNT = 6;
const MAX_REVISION_BYTES = 512 * 1024;

function pruneRevisions(revisions) {
  if (!Array.isArray(revisions)) return [];
  if (revisions.length > MAX_REVISION_COUNT) {
    revisions.splice(0, revisions.length - MAX_REVISION_COUNT);
  }
  if (MAX_REVISION_BYTES > 0) {
    let serialized = JSON.stringify(revisions);
    if (serialized.length > MAX_REVISION_BYTES) {
      while (revisions.length > 1 && serialized.length > MAX_REVISION_BYTES) {
        revisions.shift();
        serialized = JSON.stringify(revisions);
      }
      if (serialized.length > MAX_REVISION_BYTES) {
        revisions.length = 0;
      }
    }
  }
  return revisions;
}

export const getRevisions = (scenario = getCurrentScenarioNameState()) => read(REVISION_KEY, [], scenario);

function addRevision(sheets, scenario = getCurrentScenarioNameState()) {
  const revs = getRevisions(scenario);
  revs.push({ time: Date.now(), sheets: JSON.parse(JSON.stringify(sheets)) });
  pruneRevisions(revs);
  write(REVISION_KEY, revs, scenario);
}

export const restoreRevision = (index, scenario = getCurrentScenarioNameState()) => {
  const revs = getRevisions(scenario);
  const rev = revs[index];
  if (rev) {
    write(KEYS.oneLine, { activeSheet: 0, sheets: rev.sheets }, scenario);
  }
  return rev ? rev.sheets : null;
};

export const setOneLine = (data, scenario = getCurrentScenarioNameState(), options = {}) => {
  const normalizeActiveSheet = value => (Number.isInteger(value) && value >= 0 ? value : 0);
  if (options.captureRevision !== false) {
    const prev = getOneLine(scenario);
    if (Array.isArray(prev.sheets) && prev.sheets.length) addRevision(prev.sheets, scenario);
  }
  const payload = {
    activeSheet: normalizeActiveSheet(data.activeSheet),
    sheets: Array.isArray(data.sheets) ? data.sheets.map(sheet => ({
      ...sheet,
      components: (Array.isArray(sheet.components) ? sheet.components : []).map(component => {
        const diagramComponent = { ...component };
        delete diagramComponent.projectEntity;
        return diagramComponent;
      }),
      connections: (Array.isArray(sheet.connections) ? sheet.connections : []).map(connection => {
        const diagramConnection = { ...connection };
        delete diagramConnection.projectCircuit;
        return diagramConnection;
      })
    })) : []
  };
  write(KEYS.oneLine, payload, scenario);
};

/**
 * Retrieve persisted study results.
 * @returns {Object}
 */
export const getStudies = () => read(KEYS.studies, {});

export function getStudyProjectIdentity() {
  const meta = getProjectMeta();
  return {
    projectId: globalThis.window?.currentProjectId || meta?.id || meta?.projectId || null,
    projectName: meta?.name || meta?.projectName || getProjectState()?.name || null,
  };
}

export function getStudyDependencySnapshots(studyKey, studies = getStudies(), provenance = getStudyProvenance(), dependencyKeys = null) {
  const keys = Array.isArray(dependencyKeys) ? dependencyKeys : getStudyDependencies(studyKey);
  return Object.fromEntries(keys
    .filter(dependency => Object.prototype.hasOwnProperty.call(studies || {}, dependency))
    .map(dependency => [dependency, {
    resultHash: Object.prototype.hasOwnProperty.call(studies || {}, dependency)
      ? fingerprintStudyValue(studies[dependency])
      : null,
    provenanceHash: provenance?.[dependency]
      ? fingerprintStudyValue(provenance[dependency])
      : null,
    }]));
}

function getStudySettingsSnapshot(studyKey) {
  const settings = getStudyDefinition(studyKey).settings || [];
  if (!settings.length) return undefined;
  return Object.fromEntries(settings.map(key => [key, read(key, null)]));
}

/** Canonical source projection used by lifecycle/report consumers. */
export const getStudySourceSnapshot = studyKey => ({
  ...getProjectInputSnapshot(),
  projectMeta: getProjectMeta(),
  settings: getStudySettingsSnapshot(studyKey),
  scenario: getCurrentScenario(),
});

/**
 * Capture the source context before an asynchronous solver starts. This
 * wrapper supplies the active scenario/project snapshot and dependency hashes;
 * callers can add solver inputs, options, assumptions, and units explicitly.
 */
export const captureStudyRunContext = (studyKey, options = {}) => {
  const projectSnapshot = options.projectSnapshot === undefined
    ? normalizeStudySourceSnapshot(getStudySourceSnapshot(studyKey))
    : options.projectSnapshot;
  const projectIdentity = options.projectIdentity || getStudyProjectIdentity();
  const dependencies = options.dependencies || getStudyDependencySnapshots(studyKey);
  const definition = getStudyDefinition(studyKey);
  const settings = options.settings === undefined ? getStudySettingsSnapshot(studyKey) : options.settings;
  return captureLifecycleRunContext(studyKey, {
    ...options,
    projectSnapshot,
    projectIdentity,
    dependencies,
    settings,
    scenario: options.scenario || getCurrentScenario(),
    modelRevision: options.modelRevision === undefined ? definition.modelRevision : options.modelRevision,
    calculationRevision: options.calculationRevision === undefined
      ? definition.calculationRevision
      : options.calculationRevision,
  });
};

/** Reject an asynchronous result when the source or run inputs changed while it was solving. */
export const assertStudyRunContextCurrent = (context, options = {}) => {
  if (!context?.studyKey) return context;
  const recordedDependencyKeys = Array.isArray(context.dependencies)
    ? context.dependencies.map(entry => entry?.studyKey).filter(Boolean)
    : Object.keys(context.dependencies || {});
  const dependencyOptions = options.dependencies === undefined
    ? { dependencies: getStudyDependencySnapshots(context.studyKey, getStudies(), getStudyProvenance(), recordedDependencyKeys) }
    : { dependencies: options.dependencies };
  const current = captureStudyRunContext(context.studyKey, {
    inputs: options.inputs === undefined ? context.inputsSnapshot : options.inputs,
    options: options.options === undefined ? context.optionsSnapshot : options.options,
    settings: options.settings,
    ...dependencyOptions,
  });
  const savedIdentity = context.projectIdentity || {};
  const currentIdentity = current.projectIdentity || {};
  if ((savedIdentity.projectId && savedIdentity.projectId !== currentIdentity.projectId)
      || (!savedIdentity.projectId && savedIdentity.projectName !== currentIdentity.projectName)) {
    throw new Error(`${context.studyKey} project changed while the study was running.`);
  }
  if (context.scenario && context.scenario !== current.scenario) {
    throw new Error(`${context.studyKey} scenario changed while the study was running.`);
  }
  const fingerprints = [
    ['projectSnapshotHash', 'project inputs'],
    ['inputFingerprint', 'manual inputs'],
    ['optionsFingerprint', 'study options'],
    ['manualInputFingerprint', 'manual inputs'],
    ['settingsFingerprint', 'study settings'],
    ['dependencyFingerprint', 'study dependencies'],
  ];
  for (const [field, label] of fingerprints) {
    if (context[field] && context[field] !== current[field]) {
      throw new Error(`${context.studyKey} ${label} changed while the study was running.`);
    }
  }
  return current;
};

function makeUnknownBulkRestoreProvenance(studyKey, previous = null) {
  // Preserve one bounded copy of the last run for report traceability. A
  // previous bulk restore already contains that copy; nesting it again on
  // every metadata edit would grow the sidecar without adding evidence.
  const sourceRun = previous?.previousRun && typeof previous.previousRun === 'object'
    ? previous.previousRun
    : previous;
  const previousRun = sourceRun && typeof sourceRun === 'object'
    ? JSON.parse(JSON.stringify(sourceRun))
    : null;
  if (previousRun && Object.prototype.hasOwnProperty.call(previousRun, 'previousRun')) {
    delete previousRun.previousRun;
  }
  return {
    ...(previousRun || {}),
    schemaVersion: STUDY_LIFECYCLE_SCHEMA_VERSION,
    studyKey,
    capturedAt: previous?.capturedAt || null,
    scenario: previous?.scenario || getCurrentScenario(),
    projectIdentity: previous?.projectIdentity || null,
    resultHash: null,
    projectSnapshotHash: null,
    inputFingerprint: null,
    optionsFingerprint: null,
    manualInputFingerprint: null,
    settingsFingerprint: null,
    dependencyFingerprint: null,
    dependencies: [],
    calculationRevision: null,
    modelRevision: null,
    previousRun,
    inputsSnapshot: previous?.inputsSnapshot || null,
    optionsSnapshot: previous?.optionsSnapshot || null,
    inputSourcesSnapshot: previous?.inputSourcesSnapshot || null,
    settingsSnapshot: previous?.settingsSnapshot || null,
    assumptions: previous?.assumptions === undefined ? [] : JSON.parse(JSON.stringify(previous.assumptions)),
    warnings: previous?.warnings === undefined ? [] : JSON.parse(JSON.stringify(previous.warnings)),
    limitations: previous?.limitations === undefined ? [] : JSON.parse(JSON.stringify(previous.limitations)),
    units: previous?.units && typeof previous.units === 'object' ? { ...previous.units } : {},
    validity: { state: 'unknown' },
    evaluation: { state: 'unknown' },
    freshness: 'unknown',
    reason: 'bulk_restore_without_run_context',
  };
}

function writeStudyState(results, provenance, scenario = getCurrentScenario()) {
  const changedResults = write(KEYS.studies, results, scenario);
  const changedProvenance = write(EXTRA_KEYS.studyProvenance, provenance, scenario);
  return changedResults || changedProvenance;
}

/**
 * Store study results.
 * @param {Object} results
 */
export const setStudies = (results, options = {}) => {
  const previous = getStudies();
  const next = results && typeof results === 'object' && !Array.isArray(results) ? results : {};
  const previousProvenance = getStudyProvenance();
  const importedProvenance = options.provenance && typeof options.provenance === 'object'
    ? options.provenance
    : null;
  const provenance = {};
  [...new Set([...Object.keys(previous || {}), ...Object.keys(next)])].forEach(studyKey => {
    if (!(studyKey in next) || studyKey.startsWith('_')) return;
    if (importedProvenance && importedProvenance[studyKey]) {
      provenance[studyKey] = importedProvenance[studyKey];
      return;
    }
    const unchanged = JSON.stringify(previous?.[studyKey]) === JSON.stringify(next[studyKey]);
    provenance[studyKey] = unchanged && previousProvenance?.[studyKey]
      ? previousProvenance[studyKey]
      : makeUnknownBulkRestoreProvenance(studyKey, previousProvenance?.[studyKey]);
  });
  const ownsEventBatch = !deferredEvents;
  if (ownsEventBatch) beginEventBatch();
  beginProjectMutationBatch();
  try {
    writeStudyState(next, provenance);
  } finally {
    endProjectMutationBatch();
    if (ownsEventBatch) flushEventBatch();
  }
};

export const getStudyProvenance = () => read(EXTRA_KEYS.studyProvenance, {});

/** Save a completed result and the exact pre-run context atomically. */
export const saveStudyResult = (studyKey, result, context) => {
  if (!context || context.studyKey !== studyKey) {
    throw new Error(`saveStudyResult(${studyKey}) requires a matching pre-run context.`);
  }
  const currentScenario = getCurrentScenario();
  if (context.scenario && context.scenario !== currentScenario) {
    throw new Error(`Study ${studyKey} completed in scenario ${context.scenario}, but ${currentScenario} is active.`);
  }
  const currentIdentity = getStudyProjectIdentity();
  if (context.projectIdentity?.projectId !== currentIdentity.projectId
      && (context.projectIdentity?.projectId || currentIdentity.projectId)) {
    throw new Error(`Study ${studyKey} completed for a different project.`);
  }
  if (!context.projectIdentity?.projectId && !currentIdentity.projectId
      && context.projectIdentity?.projectName !== currentIdentity.projectName) {
    throw new Error(`Study ${studyKey} completed for a different project.`);
  }
  const results = getStudies();
  const provenance = getStudyProvenance();
  const nextResults = { ...(results && !Array.isArray(results) ? results : {}), [studyKey]: result };
  const nextProvenance = {
    ...provenance,
    [studyKey]: buildStudyProvenance(studyKey, result, context),
  };
  const resultChanged = JSON.stringify(results) !== JSON.stringify(nextResults);
  const provenanceChanged = JSON.stringify(provenance) !== JSON.stringify(nextProvenance);
  if (typeof window !== 'undefined'
      && !getStudyProjectIdentity().projectId
      && !getStudyProjectIdentity().projectName
      && !getProjectState()?.name) {
    throw new Error(`Study ${studyKey} cannot be stored without an active named project.`);
  }
  const ownsEventBatch = !deferredEvents;
  if (ownsEventBatch) beginEventBatch();
  beginProjectMutationBatch();
  try {
    const resultWritten = write(KEYS.studies, nextResults);
    if (resultChanged && !resultWritten) throw new Error(`Study ${studyKey} result could not be stored.`);
    const provenanceWritten = write(EXTRA_KEYS.studyProvenance, nextProvenance);
    if (provenanceChanged && !provenanceWritten) {
      if (resultChanged) write(KEYS.studies, results);
      throw new Error(`Study ${studyKey} provenance could not be stored.`);
    }
  } finally {
    endProjectMutationBatch();
    if (ownsEventBatch) flushEventBatch();
  }
  return nextProvenance[studyKey];
};

function getCurrentAssessmentContext(studyKey, options = {}) {
  const saved = getStudyProvenance()?.[studyKey];
  const savedDependencyKeys = Array.isArray(saved?.dependencies)
    ? saved.dependencies.map(entry => entry?.studyKey).filter(Boolean)
    : null;
  const dependencies = options.dependencies === undefined
    ? getStudyDependencySnapshots(studyKey, getStudies(), getStudyProvenance(), savedDependencyKeys)
    : options.dependencies;
  return captureStudyRunContext(studyKey, {
    inputs: options.inputs === undefined ? saved?.inputsSnapshot : options.inputs,
    options: options.options === undefined ? saved?.optionsSnapshot : options.options,
    settings: options.settings === undefined ? getStudySettingsSnapshot(studyKey) : options.settings,
    projectSnapshot: options.projectSnapshot,
    dependencies,
    modelRevision: options.modelRevision,
    calculationRevision: options.calculationRevision,
  });
}

function buildStudyAssessment(studyKey, options, studies, provenance, active = new Set()) {
  if (active.has(studyKey)) {
    return assessStudyResult(studyKey, studies?.[studyKey], provenance?.[studyKey], null, {});
  }
  const nextActive = new Set(active);
  nextActive.add(studyKey);
  const currentContext = options.currentContext || getCurrentAssessmentContext(studyKey, options);
  const dependencies = {};
  const recordedDependencies = provenance?.[studyKey]?.dependencies;
  const dependencyKeys = Array.isArray(recordedDependencies)
    ? recordedDependencies.map(entry => entry?.studyKey).filter(Boolean)
    : getStudyDependencies(studyKey);
  dependencyKeys.forEach(dependency => {
    const dependencyOptions = { ...options };
    delete dependencyOptions.currentContext;
    delete dependencyOptions.inputs;
    delete dependencyOptions.options;
    delete dependencyOptions.settings;
    delete dependencyOptions.projectSnapshot;
    delete dependencyOptions.modelRevision;
    delete dependencyOptions.calculationRevision;
    dependencies[dependency] = buildStudyAssessment(dependency, dependencyOptions, studies, provenance, nextActive);
  });
  return assessStudyResult(studyKey, studies?.[studyKey], provenance?.[studyKey], currentContext, dependencies);
}

export const getStudyAssessment = (studyKey, options = {}) => {
  const studies = getStudies();
  const provenance = getStudyProvenance();
  return buildStudyAssessment(studyKey, options, studies, provenance);
};

export const getStudyAssessments = (options = {}) => {
  const studies = getStudies();
  return Object.keys(studies && !Array.isArray(studies) ? studies : {})
    .filter(studyKey => !studyKey.startsWith('_'))
    .reduce((result, studyKey) => {
      result[studyKey] = getStudyAssessment(studyKey, options);
      return result;
    }, {});
};

export const getEligibleStudies = (options = {}) => Object.values(getStudyAssessments(options))
  .filter(assessment => assessment.eligible)
  .reduce((result, assessment) => {
    result[assessment.studyKey] = assessment;
    return result;
  }, {});
export const getCathodicProtectionDraft = () => read(EXTRA_KEYS.cathodicProtectionDraft, null);
export const setCathodicProtectionDraft = draft => write(EXTRA_KEYS.cathodicProtectionDraft, draft);
export const getProjectInputSnapshot = () => ({
  projectMeta: getProjectMeta(),
  designBasis: getDesignBasis(),
  equipment: getEquipment(),
  loads: getLoads(),
  cables: getCables(),
  trays: getTrays(),
  conduits: getConduits(),
  ductbanks: getDuctbanks(),
  panels: getPanels(),
  oneLine: getOneLine(),
});
export const getProjectReferenceDiagnostics = () => buildProjectReferenceDiagnostics({
  equipment: getEquipment(),
  panels: getPanels(),
  loads: getLoads(),
  cables: getCables(),
  oneLine: getOneLine(),
});
export const getProjectEntityDeletionImpact = (collection, records = []) => buildProjectEntityDeletionImpact({
  collection,
  records,
  loads: getLoads(),
  cables: getCables(),
  oneLine: getOneLine(),
});
export const getProjectInputFingerprint = () => {
  const scenario = getCurrentScenarioNameState();
  if (projectInputFingerprintScenario !== scenario) {
    projectInputFingerprintCache = null;
    projectInputFingerprintScenario = scenario;
  }
  if (projectInputFingerprintCache === null) projectInputFingerprintCache = hashProjectInputs(getProjectInputSnapshot());
  return projectInputFingerprintCache;
};

/**
 * @returns {GenericRecord[]}
 */
export const getLoads = () => {
  const raw = read(KEYS.loads, []);
  const loads = normalizeProjectEntities({
    equipment: getEquipment(),
    loads: raw.map(ensureLoadFields),
  }).loads;
  if (JSON.stringify(raw) !== JSON.stringify(loads)) {
    write(KEYS.loads, loads);
  }
  return loads;
};
/**
 * @param {GenericRecord[]} loads
 */
function ensureLoadFields(load) {
  const l = { ...load };
  delete l.quantity;
  delete l.qty;
  delete l.count;
  if ('power' in l && !('kw' in l)) {
    l.kw = l.power;
    delete l.power;
  }
  const hasKw = typeof l.kw === 'string' ? l.kw.trim() !== '' : l.kw != null && l.kw !== '';
  if ('watts' in l && !hasKw) {
    const watts = Number.parseFloat(l.watts);
    if (!Number.isNaN(watts)) l.kw = watts / 1000;
  }
  return {
    id: '',
    ref: '',
    source: '',
    tag: '',
    description: '',
    voltage: '',
    loadType: '',
    mccUnitType: '',
    starterType: '',
    controlScheme: '',
    breakerTripA: '',
    breakerFrameA: '',
    duty: '',
    kw: '',
    hp: '',
    powerFactor: '',
    loadFactor: '',
    efficiency: '',
    demandFactor: '',
    phases: '',
    circuit: '',
    manufacturer: '',
    model: '',
    notes: '',
    ...l
  };
}

function isEmptyLoad(load) {
  const l = ensureLoadFields(load);
  return Object.values(l).every(v => v === '');
}

export const setLoads = (loads, options = {}) => {
  const scenario = options.scenario || getCurrentScenarioNameState();
  const source = options.preserveShape ? loads : (loads.length ? loads : [{}]).map(ensureLoadFields);
  const list = normalizeProjectEntities({
    equipment: getEquipment(),
    loads: source,
  }).loads;
  return writeCanonicalCollection('loads', KEYS.loads, read(KEYS.loads, [], scenario), list, scenario, options);
};

export const addLoad = load => {
  const loads = getLoads();
  const normalized = ensureLoadFields(load);
  if (loads.length === 1 && isEmptyLoad(loads[0]) && !isEmptyLoad(normalized)) {
    loads[0] = normalized;
  } else {
    loads.push(normalized);
  }
  setLoads(loads);
};

export const insertLoad = (index, load) => {
  const loads = getLoads();
  const normalized = ensureLoadFields(load);
  const idx = Math.max(0, Math.min(index, loads.length));
  loads.splice(idx, 0, normalized);
  setLoads(loads);
};

export const updateLoad = (index, load) => {
  const loads = getLoads();
  if (index >= 0 && index < loads.length) {
    loads[index] = ensureLoadFields({ ...loads[index], ...load });
    setLoads(loads);
  }
};

export const deleteLoad = index => {
  const loads = getLoads();
  if (index >= 0 && index < loads.length) {
    loads.splice(index, 1);
    setLoads(loads);
  }
};

// Backward compatibility
export const removeLoad = deleteLoad;

/**
 * Persist the canonical project entity collections as one undoable mutation.
 * Pages that edit a projection of shared project data (such as One-Line)
 * should use this instead of maintaining a page-local copy of the records.
 *
 * @param {{equipment?:GenericRecord[], panels?:GenericRecord[], loads?:GenericRecord[], cables?:GenericRecord[]}} collections
 */
export function setProjectEntityCollections(collections = {}) {
  beginEventBatch();
  beginProjectMutationBatch();
  try {
    if (Array.isArray(collections.equipment)) setEquipment(collections.equipment);
    if (Array.isArray(collections.panels)) setPanels(collections.panels);
    if (Array.isArray(collections.loads)) setLoads(collections.loads, { preserveShape: true });
    if (Array.isArray(collections.cables)) setCables(collections.cables);
  } finally {
    endProjectMutationBatch();
    flushEventBatch();
  }
}

// generic access for other values so pages never touch localStorage directly
export const getItem = (key, fallback = null, scenario) => read(key, fallback, scenario);
export const setItem = (key, value, scenario) => {
  if (key === KEYS.equipment && Array.isArray(value)) return setEquipment(value, { scenario, preserveShape: true });
  if (key === KEYS.panels && Array.isArray(value)) return setPanels(value, { scenario, preserveShape: true });
  if (key === KEYS.loads && Array.isArray(value)) return setLoads(value, { scenario, preserveShape: true });
  if (key === KEYS.cables && Array.isArray(value)) return setCables(value, { scenario, preserveShape: true });
  return write(key, value, scenario);
};
export const setSessionItem = (key, value, scenario = getCurrentScenarioNameState()) => {
  const visible = isCompactSynthesisKey(key) ? unpackDeviceEvidence(value) : value;
  if (isCompactSynthesisKey(key) && isDeviceEvidenceEnvelope(visible)) return false;
  const stored = isCompactSynthesisKey(key) ? packDeviceEvidence(visible) : visible;
  if (writeScenarioSessionValue(key, stored, scenario) === false && isCompactSynthesisKey(key)) return false;
  emit(key, visible);
};
export const removeItem = (key, scenario = getCurrentScenarioNameState(), options = {}) => {
  try {
    if (PROJECT_INPUT_KEYS.has(key)) projectInputFingerprintCache = null;
    removeScenarioValue(key, scenario, options);
    emit(key, null);
  } catch (e) {
    console.error('Failed to remove', key, e);
  }
};

export function migrateLegacyItem(legacyKey, targetKey, fallback = null) {
  const missing = Symbol('missing');
  const current = getItem(targetKey, missing);
  if (current !== missing && current !== null) return current;
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(legacyKey);
    if (raw === null || raw === undefined) return fallback;
    const value = JSON.parse(raw);
    setItem(targetKey, value);
    localStorage.removeItem(legacyKey);
    return value;
  } catch {
    return fallback;
  }
}


export const keys = (scenario = getCurrentScenarioNameState()) => {
  try {
    return listScenarioKeysState(scenario);
  } catch {
    return [];
  }
};

// The exact snapshot saveProject writes. Fingerprints of it decide whether the
// working copy still matches the project's last save (see getProjectSaveState).
function projectSaveSnapshot(scenario) {
  const exported = exportProject(scenario);
  // The versioned envelope already carries the active scenario at its top
  // level. Do not serialize that same scenario a second time in
  // scenarioData; large generated one-line/cable records otherwise consume
  // the browser's storage budget twice on every named-project save.
  if (exported.scenarioData && typeof exported.scenarioData === 'object') {
    delete exported.scenarioData[scenario];
    if (!Object.keys(exported.scenarioData).length) delete exported.scenarioData;
  }
  return prepareProjectSnapshotForSave(exported, {
    transientSettingKeys: [EXTRA_KEYS.fieldObservationQueue]
  });
}

// No ':' in the key, so it can never be listed as a scenario-scoped project setting.
const saveBaselineKey = (projectName, scenario) => `ctrProjectSaveBaseline|${scenario}|${projectName}`;

// Record what the working copy looked like right after it was saved to, or
// loaded from, the project's saved version. Comparing against the working
// copy (rather than the stored record) avoids false differences from shape
// normalization when a saved record is imported.
function recordProjectSaveBaseline(projectName, scenario) {
  if (!projectName) return;
  try {
    writeAppSetting(saveBaselineKey(projectName, scenario), hashProjectInputs(projectSaveSnapshot(scenario)));
  } catch (e) {
    console.warn('Failed to record project save baseline', e);
  }
}

/**
 * Whether the working copy matches the active project's last saved version.
 * Opening a project link or reloading a project page restores that saved
 * version, so "unsaved" changes are the ones those actions would discard.
 * @param {string} [projectId] Defaults to the active project.
 * @param {string} [scenario]
 * @returns {{state:'unnamed'|'saved'|'unsaved', projectName:string, hasSavedVersion:boolean}}
 */
export function getProjectSaveState(projectId, scenario = getCurrentScenarioNameState()) {
  let storedName = '';
  try {
    storedName = getProjectState()?.name || '';
  } catch {
    storedName = '';
  }
  const activeId = typeof window !== 'undefined' ? window.currentProjectId : '';
  const projectName = resolveActiveProjectName(projectId, activeId, storedName);
  if (!projectName) return { state: 'unnamed', projectName: '', hasSavedVersion: false };
  const hasSavedVersion = listSavedProjects().includes(projectName);
  let baseline = null;
  try {
    baseline = readAppSetting(saveBaselineKey(projectName, scenario));
  } catch {
    baseline = null;
  }
  const saved = hasSavedVersion && Boolean(baseline)
    && baseline === hashProjectInputs(projectSaveSnapshot(scenario));
  return { state: saved ? 'saved' : 'unsaved', projectName, hasSavedVersion };
}

export function saveProject(projectId, scenario = getCurrentScenarioNameState()) {
  if (!projectId) return false;
  try {
    const activeProjectName = resolveActiveProjectName(projectId);
    if (activeProjectName) {
      const state = getProjectState();
      if (state?.name !== activeProjectName) {
        setProjectState({ ...state, name: activeProjectName });
      }
      if (typeof window !== 'undefined') window.currentProjectId = activeProjectName;
    }
    const pendingFieldObservationQueue = getFieldObservationQueue();
    const payload = projectSaveSnapshot(scenario);
    writeSavedProject(projectId, payload, { replace: true });
    if (pendingFieldObservationQueue.length) setFieldObservationQueue([]);
    recordProjectSaveBaseline(activeProjectName || projectId, scenario);
    // Notify collaboration layer so remote clients receive the update
    if (typeof document !== 'undefined') {
      try {
        document.dispatchEvent(new CustomEvent('ctr:project-saved', { detail: payload }));
      } catch { /* non-critical */ }
    }
    return true;
  } catch (e) {
    console.error('Failed to save project', e);
    return false;
  }
}

export function loadProject(projectId, scenario = getCurrentScenarioNameState()) {
  if (!projectId) return false;
  try {
    const rawPayload = readSavedProject(projectId);
    if (!rawPayload) return false;
    const payload = rawPayload;
    const migrated = wasSavedProjectMigrated(projectId);
    if (isVersionedProjectSnapshot(payload)) {
      const snapshot = createImportableProjectSnapshot(payload);
      const imported = importProject(snapshot);
      if (!imported) return false;
      const activeProjectName = resolveActiveProjectName(projectId);
      if (activeProjectName) {
        const state = getProjectState();
        if (state?.name !== activeProjectName) {
          setProjectState({ ...state, name: activeProjectName });
        }
        if (typeof window !== 'undefined') window.currentProjectId = activeProjectName;
      }
      recordProjectSaveBaseline(activeProjectName || projectId, getCurrentScenarioNameState());
      return true;
    }
    const equipment = payload.equipment;
    const panels = payload.panels;
    const loads = payload.loads;
    const cables = payload.cables;
    const cableTypicals = payload.cableTypicals;
    const cableTemplates = payload.cableTemplates;
    const cableTagSettings = payload.cableTagSettings;
    const cableChangeLog = payload.cableChangeLog;
    const designBasis = payload.designBasis;
    const designGateApprovals = payload.designGateApprovals;
    const workflowArtifacts = payload.workflowArtifacts || {};
    const mccLineups = payload.mccLineups;
    const raceways = payload.raceways || {};
    const oneLine = payload.oneLine || {};
    beginEventBatch();
    beginProjectMutationBatch();
    try {
      if (Array.isArray(equipment)) setEquipment(equipment); else setEquipment([]);
      if (Array.isArray(panels)) setPanels(panels); else setPanels([]);
      if (Array.isArray(loads)) setLoads(loads, { preserveShape: true });
      if (Array.isArray(cables)) setCables(normalizeCableOperatingVoltage(cables)); else setCables([]);
      if (Array.isArray(cableTypicals)) setCableTypicals(cableTypicals); else setCableTypicals([]);
      if (Array.isArray(cableTemplates)) setCableTemplates(cableTemplates); else setCableTemplates([]);
      if (cableTagSettings && typeof cableTagSettings === 'object' && !Array.isArray(cableTagSettings)) setCableTagSettings(cableTagSettings); else setCableTagSettings({});
      if (Array.isArray(cableChangeLog)) setCableChangeLog(cableChangeLog); else setCableChangeLog([]);
      if (designBasis && typeof designBasis === 'object' && !Array.isArray(designBasis)) setDesignBasis(designBasis); else setDesignBasis(null);
      if (designGateApprovals && typeof designGateApprovals === 'object' && !Array.isArray(designGateApprovals)) setDesignGateApprovals(designGateApprovals); else setDesignGateApprovals({});
      setDeliverableArtifacts(workflowArtifacts.deliverableArtifacts);
      setFieldExecutionRecords(workflowArtifacts.fieldExecutionRecords);
      setFieldObservations(workflowArtifacts.fieldObservations);
      setFieldObservationQueue(workflowArtifacts.fieldObservationQueue);
      setProcurementRegister(workflowArtifacts.procurementRegister);
      if (workflowArtifacts.reportSnapshots && typeof workflowArtifacts.reportSnapshots === 'object') {
        write(EXTRA_KEYS.reportSnapshots, workflowArtifacts.reportSnapshots);
      }
      if (Array.isArray(workflowArtifacts.lifecyclePackages)) {
        write(EXTRA_KEYS.lifecyclePackages, workflowArtifacts.lifecyclePackages);
      }
      if (workflowArtifacts.pullPlanArtifact !== undefined) setItem('pullPlanArtifact', workflowArtifacts.pullPlanArtifact);
      if (workflowArtifacts.costEstimateArtifact !== undefined) setItem('costEstimateArtifact', workflowArtifacts.costEstimateArtifact);
      if (workflowArtifacts.latestRouteResults !== undefined) setItem('latestRouteResults', workflowArtifacts.latestRouteResults);
      setSwitchingProcedures(workflowArtifacts.switchingProcedures);
      if (Array.isArray(mccLineups)) setMccLineups(mccLineups); else setMccLineups([]);
      setTrays(Array.isArray(raceways.trays) ? raceways.trays : []);
      setConduits(Array.isArray(raceways.conduits) ? raceways.conduits : []);
      setDuctbanks(Array.isArray(raceways.ductbanks) ? raceways.ductbanks : []);
      if (Array.isArray(oneLine)) {
        setOneLine({ activeSheet: 0, sheets: oneLine }, scenario, { captureRevision: false });
      } else {
        setOneLine(oneLine || { activeSheet: 0, sheets: [] }, scenario, { captureRevision: false });
      }
      const activeProjectName = resolveActiveProjectName(projectId);
      if (activeProjectName) {
        const state = getProjectState();
        if (state?.name !== activeProjectName) {
          setProjectState({ ...state, name: activeProjectName });
        }
        if (typeof window !== 'undefined') window.currentProjectId = activeProjectName;
      }
    } finally {
      endProjectMutationBatch();
      flushEventBatch();
    }
    if (migrated) saveProject(projectId, scenario);
    recordProjectSaveBaseline(resolveActiveProjectName(projectId) || projectId, scenario);
    return !!rawPayload;
  } catch (e) {
    console.error('Failed to load project', e);
    return false;
  }
}

/**
 * Apply a remote project snapshot received from the collaboration server.
 *
 * Unlike saveProject() + loadProject(), this function applies data directly
 * to in-memory state and persists it WITHOUT dispatching 'ctr:project-saved'
 * (which would echo the patch back to the server and cause an infinite loop).
 *
 * After applying, it dispatches 'ctr:remote-applied' so page-level code can
 * refresh its rendered tables.
 *
 * @param {object} snapshot - Full project payload as sent by saveProject()
 * @param {string} [projectId] - Target project ID (defaults to window.currentProjectId)
 */
export function applyRemoteSnapshot(snapshot, projectId) {
  if (!snapshot || typeof snapshot !== 'object') return;
  if (snapshot.schemaVersion !== undefined && Array.isArray(snapshot.cables)
    && Array.isArray(snapshot.ductbanks) && Array.isArray(snapshot.conduits)) {
    if (!importProject(snapshot)) throw new Error(getLastProjectImportError() || 'Remote project snapshot is invalid.');
    const pid = projectId || (typeof window !== 'undefined' && window.currentProjectId) || null;
    if (pid) writeSavedProject(pid, snapshot);
    if (typeof document !== 'undefined') {
      try { document.dispatchEvent(new CustomEvent('ctr:remote-applied', { detail: { projectId: pid } })); } catch { /* non-critical */ }
    }
    return;
  }
  const transaction = captureProjectTransactionSnapshot();
  let batchStarted = false;
  try {
    // Collaboration payloads may still carry the legacy storage envelope
    // alongside the canonical project fields. Remove only those explicitly
    // supported envelope fields before strict canonical validation; arbitrary
    // unknown project fields must continue to fail closed.
    if (snapshot.settings !== undefined && (!snapshot.settings || typeof snapshot.settings !== 'object' || Array.isArray(snapshot.settings))) {
      throw new Error('Project settings must be an object.');
    }
    const canonicalInput = { ...snapshot, settings: { ...(snapshot.settings || {}) } };
    const legacySettings = ['cableTemplates', 'cableTagSettings', 'cableChangeLog', 'designBasis', 'designGateApprovals', 'workflowArtifacts'];
    for (const key of legacySettings) {
      if (canonicalInput[key] !== undefined && canonicalInput.settings[key] === undefined) {
        canonicalInput.settings[key] = canonicalInput[key];
      }
      delete canonicalInput[key];
    }
    // Flatten artifact keys into settings as well so a canonical save/reload
    // can restore scalar artifact entries through the normal importer.
    if (canonicalInput.settings.workflowArtifacts && typeof canonicalInput.settings.workflowArtifacts === 'object'
      && !Array.isArray(canonicalInput.settings.workflowArtifacts)) {
      for (const [key, value] of Object.entries(canonicalInput.settings.workflowArtifacts)) {
        if (canonicalInput.settings[key] === undefined) canonicalInput.settings[key] = value;
      }
    }
    const canonical = validateAndNormalizeCanonicalProject(canonicalInput, { scenario: getCurrentScenarioNameState() });
    const { settings = {} } = canonical;
    if (settings.cableTemplates !== undefined && !Array.isArray(settings.cableTemplates)) throw new Error('cableTemplates must be an array.');
    if (settings.cableTagSettings !== undefined && (!settings.cableTagSettings || typeof settings.cableTagSettings !== 'object' || Array.isArray(settings.cableTagSettings))) throw new Error('cableTagSettings must be an object.');
    if (settings.cableChangeLog !== undefined && !Array.isArray(settings.cableChangeLog)) throw new Error('cableChangeLog must be an array.');
    if (settings.designBasis !== undefined && (!settings.designBasis || typeof settings.designBasis !== 'object' || Array.isArray(settings.designBasis))) throw new Error('designBasis must be an object.');
    if (settings.designGateApprovals !== undefined && (!settings.designGateApprovals || typeof settings.designGateApprovals !== 'object' || Array.isArray(settings.designGateApprovals))) throw new Error('designGateApprovals must be an object.');
    if (settings.workflowArtifacts !== undefined && (!settings.workflowArtifacts || typeof settings.workflowArtifacts !== 'object' || Array.isArray(settings.workflowArtifacts))) throw new Error('workflowArtifacts must be an object.');
    if (!importProject(canonical)) throw new Error(getLastProjectImportError() || 'Remote project snapshot is invalid.');
    // Persist to storage so subsequent loadProject() calls see the updated data
    const pid = projectId || (typeof window !== 'undefined' && window.currentProjectId) || null;
    if (pid) writeSavedProject(pid, canonical);
    // Notify page-level code that remote data has been applied
    if (typeof document !== 'undefined') {
      try {
        document.dispatchEvent(new CustomEvent('ctr:remote-applied', { detail: { projectId: pid } }));
      } catch { /* non-critical */ }
    }
  } catch (e) {
    if (transaction) restoreProjectTransactionSnapshot(transaction);
    if (batchStarted) {
      endProjectMutationBatch();
      flushEventBatch();
    }
    console.warn('[collab] Failed to apply remote snapshot', e);
  }
}

/**
 * Export current project data.
 */
function exportScenarioProject(scenario = getCurrentScenarioNameState()) {
  const project = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    ductbanks: read(KEYS.ductbanks, [], scenario),
    conduits: read(KEYS.conduits, [], scenario),
    trays: read(KEYS.trays, [], scenario),
    cables: read(KEYS.cables, [], scenario),
    cableTypicals: read(KEYS.cableTypicals, [], scenario),
    panels: read(KEYS.panels, [], scenario),
    equipment: read(KEYS.equipment, [], scenario),
    loads: read(KEYS.loads, [], scenario),
    oneLine: read(KEYS.oneLine, { activeSheet: 0, sheets: [] }, scenario),
    mccLineups: read(EXTRA_KEYS.mccLineups, [], scenario),
    settings: {}
  };
  const reserved = new Set([...Object.values(KEYS), EXTRA_KEYS.mccLineups, REVISION_KEY, 'CTR_PROJECT_V1', LEGACY_STUDIES_SETTING_KEY]);
  for (const key of keys(scenario)) {
    if (!reserved.has(key) && isProjectSettingKey(key)) {
      project.settings[key] = read(key, null, scenario);
    }
  }
  const studyResults = read(KEYS.studies, {}, scenario);
  if (studyResults && typeof studyResults === 'object' && !Array.isArray(studyResults) && Object.keys(studyResults).length) {
    project.settings.studyResults = studyResults;
  }
  const meta = { version: 1, scenario, scenarios: listScenarios() };
  return { meta, ...project };
}

/** Export a complete, versioned project envelope including every scenario. */
export function exportProject(scenario = getCurrentScenarioNameState()) {
  const current = exportScenarioProject(scenario);
  const scenarioData = {};
  listScenarios().forEach(name => {
    scenarioData[name] = exportScenarioProject(name);
  });
  return { ...current, scenarioData };
}

function beginEventBatch() {
  if (!deferredEvents) deferredEvents = new Map();
}

function flushEventBatch() {
  const pending = deferredEvents;
  deferredEvents = null;
  pending?.forEach((detail, event) => emit(event, detail));
}

let lastProjectImportError = '';

export function getLastProjectImportError() {
  return lastProjectImportError;
}

/**
 * Import tray and conduit geometry from a CAD export file (Revit JSON or IFC).
 * Updates the current data store schedules.
 *
 * @param {File|string} file Input file or raw text
 * @returns {Promise<{trays:any[], conduits:any[]}>}
 */
export async function importFromCad(file) {
  let text;
  if (typeof file === 'string') {
    text = file;
  } else if (file && typeof file.text === 'function') {
    text = await file.text();
  } else {
    throw new Error('Unsupported CAD file');
  }

  const { trays = [], conduits = [] } = parseRevit(text);
  if (Array.isArray(trays) && trays.length) setTrays(trays);
  if (Array.isArray(conduits) && conduits.length) setConduits(conduits);
  return { trays, conduits };
}

/**
 * Export tray and conduit geometry to a CAD-friendly format. Currently
 * only JSON is supported. When executed in a browser environment the
 * file is automatically downloaded.
 *
 * @param {string} [fileType='json']
 * @returns {string} serialized content
 */
export function exportToCad(fileType = 'json') {
  const data = { trays: getTrays(), conduits: getConduits() };
  let mime = 'application/json';
  let ext = 'json';
  let content = JSON.stringify(data, null, 2);

  if (fileType === 'csv') {
    const trayHeader = 'id,start_x,start_y,start_z,end_x,end_y,end_z,width,height,material';
    const trayRows = data.trays.map(t => [
      t.id ?? t.tray_id,
      t.start_x,
      t.start_y,
      t.start_z,
      t.end_x,
      t.end_y,
      t.end_z,
      t.width ?? t.inside_width,
      t.height ?? t.tray_depth,
      t.material
    ].join(','));
    const conduitHeader = 'conduit_id,type,material,trade_size,start_x,start_y,start_z,end_x,end_y,end_z,capacity';
    const conduitRows = data.conduits.map(c => [c.conduit_id, c.type, c.material, c.trade_size, c.start_x, c.start_y, c.start_z, c.end_x, c.end_y, c.end_z, c.capacity].join(','));
    content = `# trays\n${[trayHeader, ...trayRows].join('\n')}\n# conduits\n${[conduitHeader, ...conduitRows].join('\n')}`;
    mime = 'text/csv';
    ext = 'csv';
  }

  if (typeof document !== 'undefined') {
    try {
      const blob = new Blob([content], { type: mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `raceways.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error('Failed to export CAD data', e);
    }
  }
  return content;
}

/**
 * Import project data with schema validation.
 * @param {any} obj
 * @returns {boolean} success
 */
export function importProject(obj) {
  const finishMeasurement = startPerformanceMeasurement('ctr.project-import', {
    schemaVersion: Number(obj?.schemaVersion) || null,
  });
  let upgraded;
  try {
    // Normalize legacy aliases and canonical documents once at the import
    // boundary. The adapter performs final strict schema validation after
    // aliases and storage-envelope metadata have been separated.
    upgraded = validateAndNormalizeCanonicalProject(obj);
    upgraded.settings = sanitizeProjectSettings(upgraded.settings);
  } catch (error) {
    if (Array.isArray(error?.errors)) {
      lastProjectImportError = `Project import is invalid: ${formatProjectSchemaErrors(error.errors)}`;
    } else {
      lastProjectImportError = error instanceof Error ? error.message : 'Project import is invalid.';
    }
    finishMeasurement({ success: false });
    return false;
  }
  const candidateScenarioData = upgraded.scenarioData && typeof upgraded.scenarioData === 'object'
    ? upgraded.scenarioData : null;
  if (candidateScenarioData) {
    try {
      for (const [scenarioName, scenarioSnapshot] of Object.entries(candidateScenarioData)) {
        if (!isValidScenarioName(scenarioName) || !scenarioSnapshot || typeof scenarioSnapshot !== 'object') {
          throw new Error(`Invalid scenario snapshot: ${scenarioName}`);
        }
        const nested = { ...scenarioSnapshot };
        if (nested.scenarioData !== undefined) throw new Error(`Nested scenarioData is not supported: ${scenarioName}`);
        validateAndNormalizeCanonicalProject(nested, { scenario: scenarioName });
      }
    } catch (error) {
      lastProjectImportError = error instanceof Error ? error.message : 'Invalid scenario snapshot.';
      finishMeasurement({ success: false });
      return false;
    }
  }

  const { meta } = upgraded;
  const scenarioData = candidateScenarioData;
  const data = { ...upgraded };
  delete data.meta;
  delete data.schemaVersion;
  delete data.scenarioData;
  // Named-project collections cannot be written without an active project,
  // so an import here would clear settings, write nothing, and still report
  // success. Fail visibly instead; callers establish the project first.
  if (!hasNamedProjectContext()) {
    lastProjectImportError = 'Open or create a project before importing project data.';
    finishMeasurement({ success: false, reason: 'no-project' });
    return false;
  }
  const transaction = captureProjectTransactionSnapshot();
  const importScenario = meta && isValidScenarioName(meta.scenario) ? meta.scenario : null;
  if (meta && Array.isArray(meta.scenarios)) {
    setScenarioListState(meta.scenarios);
  }
  lastProjectImportError = '';

  if (importScenario) {
    switchScenario(importScenario);
  }

  beginEventBatch();
  beginProjectMutationBatch();
  let mutationBatchStarted = true;
  let importSucceeded = true;
  try {
    setDuctbanks(data.ductbanks);
    setConduits(data.conduits);
    clearConduitCache();
    setTrays(data.trays);
    // Cables reach scenario storage through setCables, not migrateProject, so
    // imports fill a blank operating_voltage from the row's `voltage` here.
    setCables(normalizeCableOperatingVoltage(data.cables));
    setCableTypicals(Array.isArray(data.cableTypicals) ? data.cableTypicals : []);
    setPanels(Array.isArray(data.panels) ? data.panels : []);
    setEquipment(Array.isArray(data.equipment) ? data.equipment : []);
    setLoads(Array.isArray(data.loads) ? data.loads : [], { preserveShape: true });
    setMccLineups(Array.isArray(data.mccLineups) ? data.mccLineups : []);
    if (Array.isArray(data.oneLine)) {
      setOneLine({ activeSheet: 0, sheets: data.oneLine }, getCurrentScenarioNameState(), { captureRevision: false });
    } else if (data.oneLine && Array.isArray(data.oneLine.sheets)) {
      setOneLine({ activeSheet: data.oneLine.activeSheet || 0, sheets: data.oneLine.sheets }, getCurrentScenarioNameState(), { captureRevision: false });
    } else {
      setOneLine({ activeSheet: 0, sheets: [] }, getCurrentScenarioNameState(), { captureRevision: false });
    }
    const importedStudies = data.settings?.studyResults ?? data.settings?.[LEGACY_STUDIES_SETTING_KEY] ?? {};
    if (importedStudies && typeof importedStudies === 'object' && !Array.isArray(importedStudies)) {
      // Study results reach scenario storage through setStudies, not
      // migrateProject, so file, sample, saved-project, and server imports
      // convert legacy arc-flash boundary units here before they are stored.
      setStudies(normalizeStudyResultsArcFlashUnits(importedStudies));
    } else {
      setStudies({});
    }
    removeItem(LEGACY_STUDIES_SETTING_KEY);
    removeItem(REVISION_KEY);

    const reserved = new Set([...Object.values(KEYS), EXTRA_KEYS.mccLineups, REVISION_KEY, 'CTR_PROJECT_V1', LEGACY_STUDIES_SETTING_KEY]);
    for (const key of keys()) {
      if (!reserved.has(key) && !(data.settings && key in data.settings)) {
        if (isCompactSynthesisKey(key) && isDeviceEvidenceEnvelope(getItem(key, null))) {
          throw new Error('Unsupported or damaged device evidence cannot be removed by import; the project was restored.');
        }
        removeItem(key);
      }
    }
    if (data.settings) {
      for (const [k, v] of Object.entries(data.settings)) {
        if (!reserved.has(k)) {
          setItem(k, v);
          if (isCompactSynthesisKey(k)) {
            const expected = unpackDeviceEvidence(v);
            const actual = getItem(k, null);
            if (isDeviceEvidenceEnvelope(expected) || isDeviceEvidenceEnvelope(actual)
                || JSON.stringify(actual) !== JSON.stringify(expected)) {
              throw new Error('Device evidence could not be imported without loss; the project was restored.');
            }
          }
        }
      }
    }
    const persistentStorageExpected = typeof localStorage !== 'undefined';
    if (persistentStorageExpected && !getProjectStorageDiagnostics().persistentStorageAvailable) {
      throw new Error('Project import could not be durably saved because persistent storage is unavailable.');
    }
    // Capture the complete active projection before inactive scenario imports;
    // restoring this exact object avoids leaking inactive-only settings and
    // retains fields that are not part of the comparison helper.
    const activeProjectProjection = getProjectState();
    // Restore additional scenarios through the same validated transactional
    // importer. Each nested document is a single-scenario snapshot and cannot
    // recursively contain scenarioData.
    if (scenarioData) {
      const activeScenario = getCurrentScenarioNameState();
      for (const [name, scenarioSnapshot] of Object.entries(scenarioData)) {
        if (!isValidScenarioName(name) || name === activeScenario || !scenarioSnapshot) continue;
        const imported = importProject({ ...scenarioSnapshot, meta: { ...(scenarioSnapshot.meta || {}), scenario: name, scenarios: listScenarios() } });
        if (!imported) throw new Error(getLastProjectImportError() || `Could not restore scenario ${name}.`);
      }
      switchScenario(importScenario || activeScenario);
      setProjectState(activeProjectProjection, { captureUndo: false });
    }
  } catch (error) {
    restoreProjectTransactionSnapshot(transaction);
    lastProjectImportError = error instanceof Error ? error.message : 'Project import failed.';
    finishMeasurement({ success: false });
    return false;
  } finally {
    // Closing the batch performs the final durable PROJECT_KEY write. A quota
    // failure here must not escape as a successful import.
    if (mutationBatchStarted) {
      try {
        endProjectMutationBatch();
        if (typeof localStorage !== 'undefined' && !getProjectStorageDiagnostics().persistentStorageAvailable) {
          throw new Error('Project import could not be durably saved because persistent storage is unavailable.');
        }
        mutationBatchStarted = false;
      } catch (error) {
        importSucceeded = false;
        restoreProjectTransactionSnapshot(transaction);
        lastProjectImportError = error instanceof Error ? error.message : 'Project import could not be durably saved.';
        finishMeasurement({ success: false });
      }
    }
    try {
      flushEventBatch();
    } catch (error) {
      importSucceeded = false;
      restoreProjectTransactionSnapshot(transaction);
      lastProjectImportError = error instanceof Error ? error.message : 'Project import could not be completed.';
      finishMeasurement({ success: false });
    }
  }
  if (!importSucceeded) return false;
  if (getProjectSchemaLoadError()) {
    removeProjectKey(PROJECT_KEY);
    setProjectState(getProjectState());
  }
  finishMeasurement({
    success: true,
    cableCount: data.cables.length,
    trayCount: data.trays.length,
  });
  return true;
}

// expose on window for non-module scripts
if (typeof window !== 'undefined') {
  window.dataStore = {
    STORAGE_KEYS,
    getTrays,
    setTrays,
    getCables,
    setCables,
    getCableTypicals,
    setCableTypicals,
    getCableTemplates,
    setCableTemplates,
    getCableTagSettings,
    setCableTagSettings,
    getCableChangeLog,
    setCableChangeLog,
    addCable,
    getDuctbanks,
    setDuctbanks,
    getConduits,
    setConduits,
    addRaceway,
    getPanels,
    setPanels,
    getEquipment,
    setEquipment,
    addEquipment,
    updateEquipment,
    removeEquipment,
    getMccLineups,
    setMccLineups,
    getLoads,
    setLoads,
    addLoad,
    insertLoad,
    updateLoad,
    removeLoad,
    getOneLine,
    setOneLine,
    getRevisions,
    restoreRevision,
    getStudies,
    setStudies,
    getStudyProvenance,
    getStudySourceSnapshot,
    captureStudyRunContext,
    assertStudyRunContextCurrent,
    saveStudyResult,
    getStudyAssessment,
    getStudyAssessments,
    getEligibleStudies,
    getProjectInputFingerprint,
    getProjectEntityDeletionImpact,
    getProjectReferenceDiagnostics,
    getProjectMeta,
    setProjectMeta,
    getDesignBasis,
    setDesignBasis,
    getDesignGateApprovals,
    setDesignGateApprovals,
    getItem,
    setItem,
    removeItem,
    migrateLegacyItem,
    listScenarios,
    getCurrentScenario,
    switchScenario,
    cloneScenario,
    compareStudies,
    getScenarioSnapshot,
    on,
    off,
    keys,
    exportProject,
    importProject,
    getLastProjectImportError,
    saveProject,
    loadProject,
    applyRemoteSnapshot,
    importFromCad,
    exportToCad,
    getReportSnapshots,
    setReportSnapshot,
    deleteReportSnapshot,
    getDeliverableArtifacts,
    setDeliverableArtifacts,
    upsertDeliverableArtifact,
    getFieldExecutionRecords,
    setFieldExecutionRecords,
    getProcurementRegister,
    setProcurementRegister
  };
}
